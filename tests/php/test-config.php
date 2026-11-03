<?php

// Konfiguration für die lokalen API-Tests (über SCHULBUDDY_CONFIG bzw. tests/php/router.php geladen).
// Alle drei Anbieter zeigen auf den Test-Anmeldeanbieter (tests/php/mock-idp.php).

$tmp = sys_get_temp_dir();
$appleKey = $tmp . '/sb-test-apple.p8';
if (!is_file($appleKey)) {
    $conf = getenv('OPENSSL_CONF') ?: dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf';
    $key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1', 'config' => $conf]);
    openssl_pkey_export($key, $pem, null, ['config' => $conf]);
    file_put_contents($appleKey, $pem);
}

$mock = static fn (string $issuer = 'https://mock-idp.test') => [
    'authorize' => 'http://127.0.0.1:8091/authorize',
    'token' => 'http://127.0.0.1:8091/token',
    'jwks' => 'http://127.0.0.1:8091/jwks',
    'issuer' => '#^' . preg_quote($issuer, '#') . '$#',
];

return [
    // Leer: Adresse aus der Anfrage, damit zwei „Geräte“ (127.0.0.1 und localhost) getestet werden können.
    'app_url' => '',
    'anthropic_api_key' => 'test-key',
    'base_url' => 'http://127.0.0.1:8092',
    'data_dir' => $tmp . '/sb-test-data',
    'salt' => 'test-salt',
    'limit_per_device' => 5,
    'auth' => [
        'microsoft' => ['client_id' => 'ms-client', 'client_secret' => 'test-secret', 'endpoints' => $mock()],
        'google' => ['client_id' => 'test-client', 'client_secret' => 'test-secret', 'endpoints' => $mock()],
        'apple' => ['client_id' => 'apple-client', 'team_id' => 'TEAM123456', 'key_id' => 'KEY1234567', 'private_key' => $appleKey, 'endpoints' => $mock()],
    ],
];
