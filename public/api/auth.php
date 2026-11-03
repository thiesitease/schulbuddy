<?php

declare(strict_types=1);

/*
 * SchulBuddy – Konto
 *
 * GET  auth.php?action=status               -> verfügbare Anbieter und angemeldetes Konto
 * GET  auth.php?action=login&provider=...   -> Weiterleitung zu Microsoft, Google oder Apple
 * POST auth.php?action=logout               -> abmelden
 * POST auth.php?action=delete               -> Konto mit allen gespeicherten Daten löschen
 */

use SchulBuddy\Db;
use SchulBuddy\Oidc;
use SchulBuddy\Session;

require __DIR__ . '/lib/common.php';
require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Session.php';
require __DIR__ . '/lib/Oidc.php';

$config = sb_config();
$action = (string) ($_GET['action'] ?? 'status');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$vendor = __DIR__ . '/vendor/autoload.php';
$ready = is_file($vendor);
if ($ready) {
    require $vendor;
}

try {
    $db = Db::connect($config);
} catch (Throwable $e) {
    error_log('SchulBuddy: Datenbank nicht erreichbar – ' . $e->getMessage());
    if ($action === 'status') {
        respond(200, ['ok' => true, 'providers' => [], 'user' => null]);
    }
    fail(503, tr('Die Anmeldung ist gerade nicht verfügbar.', 'Signing in is not available right now.'));
}
Db::cleanup($db);
$oidc = new Oidc($config, $db);

if ($action === 'status' && $method === 'GET') {
    $user = Session::user($db);
    respond(200, [
        'ok' => true,
        'providers' => $ready ? $oidc->enabled() : [],
        'user' => $user ? ['id' => $user['id'], 'provider' => $user['provider'], 'since' => (int) $user['created_at']] : null,
    ]);
}

if ($action === 'login' && $method === 'GET') {
    $provider = (string) ($_GET['provider'] ?? '');
    header('Cache-Control: no-store');
    if (!$ready || !$oidc->isEnabled($provider)) {
        header('Location: ' . app_url($config) . '/#/settings?login=deaktiviert', true, 302);
        exit;
    }
    header('Location: ' . $oidc->authorizeUrl($provider), true, 302);
    exit;
}

if ($action === 'logout' && $method === 'POST') {
    require_same_origin($config);
    Session::end($db);
    respond(200, ['ok' => true]);
}

if ($action === 'delete' && $method === 'POST') {
    require_same_origin($config);
    $user = Session::user($db);
    if (!$user) {
        fail(401, tr('Bitte melde dich zuerst an.', 'Please sign in first.'));
    }
    $db->beginTransaction();
    foreach (['sb_user_data', 'sb_sessions'] as $table) {
        $db->prepare("DELETE FROM {$table} WHERE user_id = ?")->execute([$user['id']]);
    }
    $db->prepare('DELETE FROM sb_users WHERE id = ?')->execute([$user['id']]);
    $db->commit();
    Session::end($db);
    respond(200, ['ok' => true]);
}

fail(400, tr('Unbekannte Aktion.', 'Unknown action.'));
