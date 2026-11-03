<?php

declare(strict_types=1);

namespace SchulBuddy;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use GuzzleHttp\Client as HttpClient;
use PDO;
use RuntimeException;
use stdClass;
use Throwable;

/** Fehler beim Login; $reason wird als Kurzcode an die App weitergegeben. */
final class LoginError extends RuntimeException
{
    public function __construct(public readonly string $reason, string $detail = '')
    {
        parent::__construct($detail !== '' ? $detail : $reason);
    }
}

/**
 * Anmeldung über Microsoft, Google und Apple (OpenID Connect, Authorization Code Flow).
 * Gespeichert wird nur eine gehashte Kennung des Kontos beim Anbieter. Den Vornamen gibt finish()
 * nur zurück, damit die App ihn vorschlagen kann – auf dem Server bleibt er nicht, eine E-Mail fragen wir nicht ab.
 */
final class Oidc
{
    private const PROVIDERS = [
        'microsoft' => [
            'label' => 'Microsoft',
            'authorize' => 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
            'token' => 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
            'jwks' => 'https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys',
            'issuer' => '#^https://login\.microsoftonline\.com/[0-9a-f-]{36}/v2\.0$#',
            'scope' => 'openid profile',
            'pkce' => true,
        ],
        'google' => [
            'label' => 'Google',
            'authorize' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token' => 'https://oauth2.googleapis.com/token',
            'jwks' => 'https://www.googleapis.com/oauth2/v3/certs',
            'issuer' => '#^(https://)?accounts\.google\.com$#',
            'scope' => 'openid profile',
            'pkce' => true,
        ],
        // Mit Scope verlangt Apple die Rückkehr per POST (form_post) und schickt den Namen nur bei der ersten Anmeldung mit.
        'apple' => [
            'label' => 'Apple',
            'authorize' => 'https://appleid.apple.com/auth/authorize',
            'token' => 'https://appleid.apple.com/auth/token',
            'jwks' => 'https://appleid.apple.com/auth/keys',
            'issuer' => '#^https://appleid\.apple\.com$#',
            'scope' => 'name',
            'pkce' => false,
        ],
    ];

    private const BINDING_COOKIE = 'sb_oauth';
    private const MAX_AGE = 900;

    public function __construct(private array $config, private PDO $db)
    {
    }

    /** @return list<array{id: string, label: string}> */
    public function enabled(): array
    {
        $out = [];
        foreach (self::PROVIDERS as $id => $provider) {
            $c = $this->config['auth'][$id] ?? [];
            $ready = ($c['client_id'] ?? '') !== '' && ($id === 'apple'
                ? ($c['team_id'] ?? '') !== '' && ($c['key_id'] ?? '') !== '' && ($c['private_key'] ?? '') !== ''
                : ($c['client_secret'] ?? '') !== '');
            if ($ready) {
                $out[] = ['id' => $id, 'label' => $provider['label']];
            }
        }
        return $out;
    }

    public function isEnabled(string $provider): bool
    {
        return in_array($provider, array_column($this->enabled(), 'id'), true);
    }

    public function redirectUri(): string
    {
        return app_url($this->config) . '/api/callback.php';
    }

    /** Startet den Login und liefert die Adresse, zu der weitergeleitet wird. */
    public function authorizeUrl(string $provider): string
    {
        $state = bin2hex(random_bytes(24));
        $nonce = bin2hex(random_bytes(16));
        $verifier = self::base64url(random_bytes(48));
        // Bindet den Vorgang an diesen Browser (Schutz gegen untergeschobene Logins).
        $binding = bin2hex(random_bytes(24));
        $this->db->prepare('INSERT INTO sb_oauth (state, provider, nonce, verifier, binding_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$state, $provider, $nonce, $verifier, hash('sha256', $binding), time()]);
        // Apples Rückkehr ist ein POST von appleid.apple.com – ein Lax-Cookie würde dabei nicht mitgeschickt.
        set_cookie(self::BINDING_COOKIE, $binding, time() + self::MAX_AGE, sameSite: $provider === 'apple' ? 'None' : 'Lax');

        $params = [
            'client_id' => $this->clientId($provider),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'state' => $state,
            'nonce' => $nonce,
        ];
        if (self::PROVIDERS[$provider]['scope'] !== '') {
            $params['scope'] = self::PROVIDERS[$provider]['scope'];
        }
        if (self::PROVIDERS[$provider]['pkce']) {
            $params['code_challenge'] = self::base64url(hash('sha256', $verifier, true));
            $params['code_challenge_method'] = 'S256';
        }
        if ($provider === 'apple') {
            $params['response_mode'] = 'form_post';
        } else {
            $params['prompt'] = 'select_account';
        }
        return $this->endpoint($provider, 'authorize') . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Prüft die Rückkehr vom Anbieter, tauscht den Code gegen ein ID-Token und prüft dieses.
     * @param array<string, mixed> $query GET-Parameter, bei Apple die POST-Felder
     * @return array{0: string, 1: string, 2: string} Anbieter, eindeutige Konto-Kennung und Vorname (oder '')
     */
    public function finish(array $query): array
    {
        $state = (string) ($query['state'] ?? '');
        $binding = (string) ($_COOKIE[self::BINDING_COOKIE] ?? '');
        set_cookie(self::BINDING_COOKIE, '', time() - 3600);
        if (!preg_match('/^[a-f0-9]{48}$/', $state)) {
            throw new LoginError('ungueltig', 'state fehlt');
        }
        $stmt = $this->db->prepare('SELECT provider, nonce, verifier, binding_hash, created_at FROM sb_oauth WHERE state = ?');
        $stmt->execute([$state]);
        $tx = $stmt->fetch();
        $this->db->prepare('DELETE FROM sb_oauth WHERE state = ?')->execute([$state]);
        if (!$tx || (int) $tx['created_at'] < time() - self::MAX_AGE) {
            throw new LoginError('abgelaufen', 'Login-Vorgang unbekannt oder abgelaufen');
        }
        if ($binding === '' || !hash_equals($tx['binding_hash'], hash('sha256', $binding))) {
            throw new LoginError('ungueltig', 'Browser-Bindung passt nicht');
        }
        if (isset($query['error'])) {
            $cancelled = in_array($query['error'], ['access_denied', 'user_cancelled_authorize', 'consent_required'], true);
            throw new LoginError($cancelled ? 'abgebrochen' : 'fehler', 'Anbieter meldet: ' . (string) $query['error']);
        }
        $code = (string) ($query['code'] ?? '');
        if ($code === '') {
            throw new LoginError('fehler', 'code fehlt');
        }

        $provider = (string) $tx['provider'];
        $form = [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $this->redirectUri(),
            'client_id' => $this->clientId($provider),
            'client_secret' => $provider === 'apple' ? $this->appleClientSecret() : (string) $this->config['auth'][$provider]['client_secret'],
        ];
        if (self::PROVIDERS[$provider]['pkce']) {
            $form['code_verifier'] = $tx['verifier'];
        }
        $response = $this->http()->post($this->endpoint($provider, 'token'), [
            'form_params' => $form,
            'headers' => ['Accept' => 'application/json'],
            'http_errors' => false,
        ]);
        $body = json_decode((string) $response->getBody(), true);
        if ($response->getStatusCode() !== 200 || !is_string($body['id_token'] ?? null)) {
            throw new LoginError('fehler', 'Token-Abruf: HTTP ' . $response->getStatusCode() . ' ' . substr((string) $response->getBody(), 0, 300));
        }

        $claims = $this->verify($provider, $body['id_token'], (string) $tx['nonce']);
        // Microsoft: Kennung pro Organisation (tid) eindeutig machen.
        $subject = $provider === 'microsoft' ? ($claims->tid ?? '') . ':' . $claims->sub : (string) $claims->sub;
        return [$provider, $subject, self::givenName($provider, $claims, $query)];
    }

    /** Nur der Vorname; Nachname, Profilbild und Anmeldename im ID-Token werden nicht verwendet. */
    private static function givenName(string $provider, stdClass $claims, array $query): string
    {
        if ($provider === 'apple') {
            // Apple schickt den Namen nicht im ID-Token, sondern als JSON-Feld „user“ – und nur beim ersten Mal.
            $user = json_decode((string) ($query['user'] ?? ''), true);
            $name = is_array($user['name'] ?? null) ? (string) ($user['name']['firstName'] ?? '') : '';
        } elseif (is_string($claims->given_name ?? null) && trim($claims->given_name) !== '') {
            $name = $claims->given_name;
        } else {
            // Microsoft liefert ohne optionalen Claim nur den Anzeigenamen: „Max Muster“ oder „Muster, Max“.
            $full = is_string($claims->name ?? null) ? $claims->name : '';
            $name = str_contains($full, ',') ? explode(',', $full, 2)[1] : $full;
            $name = (string) strtok(trim($name), ' ');
        }
        return cut((string) preg_replace('/\p{C}+/u', '', $name), 30);
    }

    private function verify(string $provider, string $idToken, string $nonce): stdClass
    {
        JWT::$leeway = 120;
        try {
            $claims = JWT::decode($idToken, $this->keys($provider, false));
        } catch (Throwable) {
            // Schlüssel könnten gewechselt haben: einmal frisch laden.
            try {
                $claims = JWT::decode($idToken, $this->keys($provider, true));
            } catch (Throwable $e) {
                throw new LoginError('fehler', 'ID-Token ungültig: ' . $e->getMessage());
            }
        }
        $issuer = $this->config['auth'][$provider]['endpoints']['issuer'] ?? self::PROVIDERS[$provider]['issuer'];
        $aud = $claims->aud ?? null;
        $clientId = $this->clientId($provider);
        $checks = [
            'iss' => preg_match($issuer, (string) ($claims->iss ?? '')) === 1,
            'aud' => $aud === $clientId || (is_array($aud) && in_array($clientId, $aud, true)),
            'nonce' => hash_equals($nonce, (string) ($claims->nonce ?? '')),
            'sub' => is_string($claims->sub ?? null) && $claims->sub !== '',
        ];
        foreach ($checks as $name => $ok) {
            if (!$ok) {
                throw new LoginError('fehler', "ID-Token: {$name} passt nicht");
            }
        }
        return $claims;
    }

    /** Öffentliche Schlüssel des Anbieters, 12 Stunden zwischengespeichert. */
    private function keys(string $provider, bool $refresh): array
    {
        $file = data_dir($this->config) . "/jwks-{$provider}.json";
        $raw = !$refresh && is_file($file) && filemtime($file) > time() - 43200 ? (string) file_get_contents($file) : '';
        if ($raw === '') {
            $response = $this->http()->get($this->endpoint($provider, 'jwks'), ['http_errors' => false]);
            if ($response->getStatusCode() !== 200) {
                throw new LoginError('fehler', 'Schlüssel nicht abrufbar');
            }
            $raw = (string) $response->getBody();
            @file_put_contents($file, $raw, LOCK_EX);
        }
        $jwks = json_decode($raw, true);
        if (!is_array($jwks) || !isset($jwks['keys'])) {
            throw new LoginError('fehler', 'Schlüsselsatz unlesbar');
        }
        return JWK::parseKeySet($jwks, 'RS256');
    }

    /** Apple verlangt als Client-Secret ein kurzlebiges, mit dem .p8-Schlüssel signiertes JWT. */
    private function appleClientSecret(): string
    {
        $c = $this->config['auth']['apple'];
        $key = (string) $c['private_key'];
        if (!str_contains($key, 'PRIVATE KEY')) {
            $key = (string) @file_get_contents($key);
        }
        $now = time();
        return JWT::encode([
            'iss' => $c['team_id'],
            'iat' => $now,
            'exp' => $now + 300,
            'aud' => 'https://appleid.apple.com',
            'sub' => $c['client_id'],
        ], $key, 'ES256', $c['key_id']);
    }

    private function clientId(string $provider): string
    {
        return (string) $this->config['auth'][$provider]['client_id'];
    }

    private function endpoint(string $provider, string $name): string
    {
        // Für lokale Tests lassen sich die Adressen in der Konfiguration ersetzen.
        $override = $this->config['auth'][$provider]['endpoints'][$name] ?? '';
        if (is_string($override) && $override !== '') {
            return $override;
        }
        $tenant = (string) ($this->config['auth']['microsoft']['tenant'] ?? 'common');
        return str_replace('{tenant}', rawurlencode($tenant !== '' ? $tenant : 'common'), self::PROVIDERS[$provider][$name]);
    }

    private function http(): HttpClient
    {
        return new HttpClient(['timeout' => 15, 'connect_timeout' => 5]);
    }

    private static function base64url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
