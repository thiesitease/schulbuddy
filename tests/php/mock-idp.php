<?php

declare(strict_types=1);

// Test-Anmeldeanbieter (OpenID Connect) für lokale Tests: php -S 127.0.0.1:8091 tests/php/mock-idp.php
// Stellt RS256-signierte ID-Tokens aus und prüft PKCE und Client-Secret wie ein echter Anbieter.

use Firebase\JWT\JWT;

require __DIR__ . '/../../public/api/vendor/autoload.php';

$dir = sys_get_temp_dir() . '/sb-mock-idp';
@mkdir($dir);
$keyFile = "{$dir}/key.pem";
if (!is_file($keyFile)) {
    $conf = getenv('OPENSSL_CONF') ?: dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf';
    $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA, 'config' => $conf]);
    openssl_pkey_export($key, $pem, null, ['config' => $conf]);
    file_put_contents($keyFile, $pem);
}
$pem = (string) file_get_contents($keyFile);
$details = openssl_pkey_get_details(openssl_pkey_get_private($pem));
$b64u = static fn (string $s): string => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

function json_out(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    exit;
}

if ($path === '/authorize') {
    $redirect = (string) $_GET['redirect_uri'];
    if (is_file("{$dir}/next-error.txt")) {
        unlink("{$dir}/next-error.txt");
        header('Location: ' . $redirect . '?' . http_build_query(['error' => 'access_denied', 'state' => $_GET['state']]));
        exit;
    }
    $code = bin2hex(random_bytes(8));
    $scope = (string) ($_GET['scope'] ?? '');
    file_put_contents("{$dir}/code-{$code}.json", json_encode([
        'nonce' => $_GET['nonce'] ?? '',
        'client_id' => $_GET['client_id'],
        'challenge' => $_GET['code_challenge'] ?? '',
        'redirect' => $redirect,
        'scope' => $scope,
    ]));
    if (($_GET['response_mode'] ?? '') === 'form_post') {
        // Wie Apple: Rückkehr als POST-Formular, der Name steckt im JSON-Feld „user“ statt im ID-Token.
        $fields = ['code' => $code, 'state' => (string) $_GET['state']];
        if (in_array('name', explode(' ', $scope), true)) {
            $fields['user'] = json_encode(['name' => ['firstName' => 'Ida', 'lastName' => 'Muster']]);
        }
        header('Content-Type: text/html; charset=utf-8');
        echo '<form method="post" action="' . htmlspecialchars($redirect) . '">';
        foreach ($fields as $name => $value) {
            echo '<input type="hidden" name="' . $name . '" value="' . htmlspecialchars($value) . '">';
        }
        echo '</form><script>document.forms[0].submit()</script>';
        exit;
    }
    header('Location: ' . $redirect . '?' . http_build_query(['code' => $code, 'state' => $_GET['state']]));
    exit;
}

if ($path === '/token') {
    $code = preg_replace('/[^a-f0-9]/', '', (string) ($_POST['code'] ?? ''));
    $file = "{$dir}/code-{$code}.json";
    if ($code === '' || !is_file($file)) {
        json_out(400, ['error' => 'invalid_grant']);
    }
    $tx = json_decode((string) file_get_contents($file), true);
    unlink($file);
    $verifier = (string) ($_POST['code_verifier'] ?? '');
    if ($tx['challenge'] !== '' && $tx['challenge'] !== $b64u(hash('sha256', $verifier, true))) {
        json_out(400, ['error' => 'invalid_grant', 'error_description' => 'PKCE']);
    }
    $secret = (string) ($_POST['client_secret'] ?? '');
    if ($tx['client_id'] === 'apple-client') {
        // Apple: Client-Secret ist ein ES256-JWT mit Team-ID, Key-ID und Services-ID.
        [$head, $claims] = array_map(static fn ($p) => json_decode(base64_decode(strtr($p, '-_', '+/')), true), array_slice(explode('.', $secret), 0, 2)) + [null, null];
        $validSecret = ($head['alg'] ?? '') === 'ES256' && ($head['kid'] ?? '') === 'KEY1234567'
            && ($claims['iss'] ?? '') === 'TEAM123456' && ($claims['sub'] ?? '') === 'apple-client' && ($claims['aud'] ?? '') === 'https://appleid.apple.com';
    } else {
        $validSecret = $secret === 'test-secret';
    }
    if (!$validSecret || ($_POST['redirect_uri'] ?? '') !== $tx['redirect']) {
        json_out(401, ['error' => 'invalid_client']);
    }
    $sub = is_file("{$dir}/next-sub.txt") ? trim((string) file_get_contents("{$dir}/next-sub.txt")) : 'user-123';
    // Mit Scope „profile“: Google liefert given_name, Microsoft ohne optionalen Claim nur den Anzeigenamen.
    $names = [];
    if (in_array('profile', explode(' ', (string) ($tx['scope'] ?? '')), true) && !is_file("{$dir}/next-noname.txt")) {
        $names = $tx['client_id'] === 'ms-client'
            ? ['name' => 'Becker, Mats', 'preferred_username' => 'mats.becker@schule.example']
            : ['name' => 'Paula Beispiel', 'given_name' => 'Paula', 'family_name' => 'Beispiel'];
    }
    @unlink("{$dir}/next-noname.txt");
    $now = time();
    $idToken = JWT::encode([
        'iss' => 'https://mock-idp.test',
        'aud' => $tx['client_id'],
        'sub' => $sub,
        'nonce' => $tx['nonce'],
        'iat' => $now,
        'exp' => $now + 600,
    ] + $names, $pem, 'RS256', 'test-key-1');
    json_out(200, ['access_token' => 'unused', 'token_type' => 'Bearer', 'expires_in' => 600, 'id_token' => $idToken]);
}

if ($path === '/jwks') {
    json_out(200, ['keys' => [[
        'kty' => 'RSA', 'kid' => 'test-key-1', 'use' => 'sig', 'alg' => 'RS256',
        'n' => $b64u($details['rsa']['n']), 'e' => $b64u($details['rsa']['e']),
    ]]]);
}

json_out(404, ['error' => 'not_found']);
