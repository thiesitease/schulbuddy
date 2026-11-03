<?php

declare(strict_types=1);

// Gemeinsame Helfer für alle API-Endpunkte (KI, Anmeldung, Synchronisierung).

ini_set('display_errors', '0');
date_default_timezone_set('Europe/Berlin');

/** @return array<string, mixed> */
function sb_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $api = dirname(__DIR__);
    $defaults = [
        'anthropic_api_key' => getenv('ANTHROPIC_API_KEY') ?: '',
        'model' => 'claude-opus-5-5',
        'effort' => ['chat' => 'low', 'quiz' => 'low', 'cards' => 'low', 'scan' => 'medium'],
        'max_tokens' => 16000,
        'fallbacks' => true,
        'limit_per_device' => 25,
        'limit_per_ip' => 150,
        'limit_global' => 1500,
        'allowed_origins' => [],
        'salt' => '',
        'data_dir' => $api . '/data',
        // Öffentliche Adresse der App, z. B. https://schoolbuddy.hamburgrissen.de (für Login-Weiterleitungen).
        'app_url' => '',
        // Leer = SQLite-Datei im data-Ordner. Für MySQL z. B. 'mysql:host=localhost;dbname=...;charset=utf8mb4'.
        'db' => ['dsn' => '', 'user' => '', 'password' => ''],
        'session_days' => 180,
        'auth' => [
            'microsoft' => ['client_id' => '', 'client_secret' => '', 'tenant' => 'common'],
            'google' => ['client_id' => '', 'client_secret' => ''],
            'apple' => ['client_id' => '', 'team_id' => '', 'key_id' => '', 'private_key' => ''],
        ],
        // Nur für lokale Tests: anderer Anthropic-Endpunkt.
        'base_url' => null,
    ];
    // Gesucht wird: Umgebungsvariable, dann außerhalb des Webverzeichnisses
    // (bei manitu: /home/sites/<site>/data-private[/schoolbuddy-data], …/web, …), zuletzt api/config.php.
    $files = [
        getenv('SCHULBUDDY_CONFIG') ?: '',
        dirname($api, 3) . '/data-private/schoolbuddy-data/schulbuddy-config.php',
        dirname($api, 3) . '/data-private/schulbuddy-config.php',
        dirname($api, 2) . '/schulbuddy-config.php',
        dirname($api, 3) . '/schulbuddy-config.php',
        $api . '/config.php',
    ];
    foreach ($files as $file) {
        if ($file !== '' && @is_file($file)) {
            $loaded = require $file;
            if (is_array($loaded)) {
                return $config = array_replace_recursive($defaults, $loaded);
            }
        }
    }
    return $config = $defaults;
}

function respond(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(int $status, string $message, array $extra = []): never
{
    respond($status, ['ok' => false, 'error' => $message] + $extra);
}

/** Kürzt UTF-8-sicher. */
function cut(string $text, int $max): string
{
    $text = trim($text);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $max, 'UTF-8');
    }
    return preg_match('/^.{0,' . $max . '}/us', $text, $m) ? $m[0] : '';
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

function own_origin(): string
{
    return (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
}

/** Basisadresse der App für Weiterleitungen (ohne Schrägstrich am Ende). */
function app_url(array $config): string
{
    return rtrim($config['app_url'] !== '' ? $config['app_url'] : own_origin(), '/');
}

/** Ändernde Anfragen nur aus der App selbst annehmen (Schutz vor CSRF). */
function require_same_origin(array $config): void
{
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    $allowed = array_merge([own_origin(), app_url($config)], (array) $config['allowed_origins']);
    if ($origin === '' || !in_array($origin, $allowed, true)) {
        fail(403, 'Diese Anfrage ist nicht erlaubt.');
    }
}

/** Datenordner anlegen und vor Zugriffen aus dem Web schützen. */
function data_dir(array $config): string
{
    $dir = $config['data_dir'];
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
        @file_put_contents($dir . '/.htaccess', "Require all denied\n");
        @file_put_contents($dir . '/index.html', '');
    }
    return $dir;
}

/** Dauerhaftes Geheimnis für Hashes: aus der Konfiguration oder einmalig erzeugt im data-Ordner. */
function sb_secret(array $config): string
{
    if ($config['salt'] !== '') {
        return $config['salt'];
    }
    $file = data_dir($config) . '/secret.key';
    $secret = @file_get_contents($file);
    if (!is_string($secret) || strlen(trim($secret)) < 32) {
        $secret = bin2hex(random_bytes(32));
        @file_put_contents($file, $secret, LOCK_EX);
    }
    return trim($secret);
}

/**
 * Liest den JSON-Body. Mit $assoc = false bleiben JSON-Objekte stdClass – nötig, wenn Daten
 * unverändert weitergegeben werden, weil PHP sonst aus {} ein [] macht.
 * @return array<string, mixed>|stdClass
 */
function read_json_body(int $maxBytes, bool $assoc = true): array|stdClass
{
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBytes) {
        fail(413, 'Die Anfrage ist zu groß.');
    }
    $data = json_decode((string) file_get_contents('php://input'), $assoc);
    if (!is_array($data) && !$data instanceof stdClass) {
        fail(400, 'Ungültige Anfrage.');
    }
    return $data;
}

function set_cookie(string $name, string $value, int $expires, string $path = '/api/'): void
{
    setcookie($name, $value, [
        'expires' => $expires,
        'path' => $path,
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
