<?php

declare(strict_types=1);

/*
 * SchulBuddy – Lerndaten zwischen Geräten abgleichen (nur mit Konto).
 *
 * GET -> {rev, data, updatedAt}
 * PUT {baseRev, data} -> {rev}; 409 mit dem Stand vom Server, wenn ein anderes Gerät inzwischen gespeichert hat.
 */

use SchulBuddy\Db;
use SchulBuddy\Session;

require __DIR__ . '/lib/common.php';
require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Session.php';

const MAX_DATA_BYTES = 2_500_000;

$config = sb_config();
try {
    $db = Db::connect($config);
} catch (Throwable $e) {
    error_log('SchulBuddy: Datenbank nicht erreichbar – ' . $e->getMessage());
    fail(503, tr('Die Synchronisierung ist gerade nicht verfügbar.', 'Syncing is not available right now.'));
}
$user = Session::user($db);
if (!$user) {
    fail(401, tr('Bitte melde dich an.', 'Please sign in.'), ['auth' => false]);
}

/** Der Chatverlauf bleibt auf dem Gerät. Ältere App-Versionen schicken ihn noch mit. */
function without_chat(mixed $data): mixed
{
    if ($data instanceof stdClass) {
        unset($data->chat);
    }
    return $data;
}

/** @return array{rev: int, data: mixed, updatedAt: int}|null */
function current_data(PDO $db, string $userId): ?array
{
    $stmt = $db->prepare('SELECT rev, data, updated_at FROM sb_user_data WHERE user_id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    // Als Objekte dekodieren, damit {} nicht zu [] wird.
    return $row ? ['rev' => (int) $row['rev'], 'data' => without_chat(json_decode($row['data'])), 'updatedAt' => (int) $row['updated_at']] : null;
}

function conflict(PDO $db, string $userId): never
{
    $now = current_data($db, $userId) ?? ['rev' => 0, 'data' => null, 'updatedAt' => 0];
    fail(409, tr('Auf einem anderen Gerät wurde inzwischen gespeichert.', 'Another device has saved in the meantime.'), ['conflict' => true] + $now);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    respond(200, ['ok' => true] + (current_data($db, $user['id']) ?? ['rev' => 0, 'data' => null, 'updatedAt' => 0]));
}

if ($method !== 'PUT' && $method !== 'POST') {
    fail(405, tr('Methode nicht erlaubt.', 'Method not allowed.'));
}

require_same_origin($config);
$body = read_json_body(MAX_DATA_BYTES + 100_000, false);
$baseRev = (int) ($body->baseRev ?? -1);
$data = without_chat($body->data ?? null);
if (!$data instanceof stdClass || $baseRev < 0) {
    fail(400, tr('Ungültige Daten.', 'Invalid data.'));
}
$json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false || strlen($json) > MAX_DATA_BYTES) {
    fail(413, tr('Deine Daten sind zu groß für die Synchronisierung.', 'Your data is too large to sync.'));
}

$now = time();
if ($baseRev === 0) {
    try {
        $db->prepare('INSERT INTO sb_user_data (user_id, rev, data, updated_at) VALUES (?, 1, ?, ?)')->execute([$user['id'], $json, $now]);
    } catch (PDOException) {
        conflict($db, $user['id']);
    }
    respond(200, ['ok' => true, 'rev' => 1, 'updatedAt' => $now]);
}

$stmt = $db->prepare('UPDATE sb_user_data SET rev = rev + 1, data = ?, updated_at = ? WHERE user_id = ? AND rev = ?');
$stmt->execute([$json, $now, $user['id'], $baseRev]);
if ($stmt->rowCount() !== 1) {
    conflict($db, $user['id']);
}
respond(200, ['ok' => true, 'rev' => $baseRev + 1, 'updatedAt' => $now]);
