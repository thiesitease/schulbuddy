<?php

declare(strict_types=1);

// Test-Version der Claude Messages API: php -S 127.0.0.1:8092 tests/php/mock-anthropic.php
// Speichert die letzte Anfrage (Body und Header), damit der Test das Format prüfen kann.

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path !== '/v1/messages' || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(404);
    exit;
}

$raw = (string) file_get_contents('php://input');
$headers = [];
foreach ($_SERVER as $k => $v) {
    if (str_starts_with($k, 'HTTP_')) {
        $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = $v;
    }
}
file_put_contents(sys_get_temp_dir() . '/sb-mock-anthropic-last.json', json_encode(['headers' => $headers, 'body' => json_decode($raw, true)]));

header('Content-Type: application/json');
// SDK 1.x sendet den Schlüssel als Bearer-Token, ältere Clients als x-api-key.
if (($headers['authorization'] ?? '') !== 'Bearer test-key' && ($headers['x-api-key'] ?? '') !== 'test-key') {
    http_response_code(401);
    echo json_encode(['type' => 'error', 'error' => ['type' => 'authentication_error', 'message' => 'invalid x-api-key']]);
    exit;
}

$req = json_decode($raw, true);
$schema = $req['output_config']['format']['schema']['properties'] ?? [];
if (isset($schema['questions'])) {
    $text = json_encode(['questions' => [
        ['question' => 'Was ist 3² + 4²?', 'options' => ['7', '25', '12', '49'], 'correct' => 1, 'explanation' => '9 + 16 = 25.'],
        ['question' => 'Kaputte Frage', 'options' => ['nur eine'], 'correct' => 0, 'explanation' => ''],
    ]]);
} elseif (isset($schema['cards'])) {
    $text = json_encode(['cards' => [['front' => 'Zellkern', 'back' => 'Enthält die DNA.'], ['front' => '', 'back' => 'leer']]]);
} else {
    $text = "**Testantwort**\n\nDas ist eine Erklärung.";
}

echo json_encode([
    'id' => 'msg_test',
    'type' => 'message',
    'role' => 'assistant',
    'model' => $req['model'] ?? 'claude-opus-5-5',
    'content' => [['type' => 'text', 'text' => $text]],
    'stop_reason' => 'end_turn',
    'stop_sequence' => null,
    'usage' => ['input_tokens' => 120, 'output_tokens' => 80],
]);
