<?php

declare(strict_types=1);

/*
 * SchulBuddy – Rückkehr vom Login bei Microsoft, Google oder Apple.
 * Diese Adresse (https://…/api/callback.php) wird bei allen drei Anbietern als Redirect-URI eingetragen.
 */

use SchulBuddy\Db;
use SchulBuddy\LoginError;
use SchulBuddy\Oidc;
use SchulBuddy\Session;

require __DIR__ . '/lib/common.php';
require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Session.php';
require __DIR__ . '/lib/Oidc.php';
require __DIR__ . '/vendor/autoload.php';

$config = sb_config();

function back_to_app(array $config, string $result): never
{
    header('Cache-Control: no-store');
    header('Location: ' . app_url($config) . '/#/settings?login=' . rawurlencode($result), true, 302);
    exit;
}

try {
    $db = Db::connect($config);
    [$provider, $subject] = (new Oidc($config, $db))->finish($_GET);

    $hash = hash_hmac('sha256', $provider . ':' . $subject, sb_secret($config));
    $stmt = $db->prepare('SELECT id FROM sb_users WHERE subject_hash = ?');
    $stmt->execute([$hash]);
    $userId = $stmt->fetchColumn();
    if ($userId) {
        $db->prepare('UPDATE sb_users SET last_login_at = ? WHERE id = ?')->execute([time(), $userId]);
    } else {
        $userId = Db::uuid();
        $db->prepare('INSERT INTO sb_users (id, provider, subject_hash, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)')
            ->execute([$userId, $provider, $hash, time(), time()]);
    }
    Session::start($db, (string) $userId, (int) $config['session_days']);
    back_to_app($config, 'ok');
} catch (LoginError $e) {
    error_log('SchulBuddy: Login fehlgeschlagen – ' . $e->getMessage());
    back_to_app($config, $e->reason);
} catch (Throwable $e) {
    error_log('SchulBuddy: Login-Fehler – ' . $e::class . ': ' . $e->getMessage());
    back_to_app($config, 'fehler');
}
