<?php

declare(strict_types=1);

namespace SchulBuddy;

use PDO;

/**
 * Datenbank für Konten, Sitzungen und synchronisierte Lerndaten.
 * Standard ist eine SQLite-Datei im geschützten data-Ordner; MySQL geht über 'db' => ['dsn' => ...].
 */
final class Db
{
    public static function connect(array $config): PDO
    {
        $dsn = (string) $config['db']['dsn'];
        if ($dsn === '') {
            $dsn = 'sqlite:' . data_dir($config) . '/schulbuddy.sqlite';
        }
        $pdo = new PDO($dsn, $config['db']['user'] ?: null, $config['db']['password'] ?: null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
            $pdo->exec('PRAGMA busy_timeout = 5000');
        }
        self::migrate($pdo);
        return $pdo;
    }

    private static function migrate(PDO $pdo): void
    {
        $mysql = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $text = $mysql ? 'MEDIUMTEXT' : 'TEXT';
        $suffix = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
        $tables = [
            "sb_users (
                id VARCHAR(36) PRIMARY KEY,
                provider VARCHAR(20) NOT NULL,
                subject_hash VARCHAR(64) NOT NULL UNIQUE,
                created_at BIGINT NOT NULL,
                last_login_at BIGINT NOT NULL
            )",
            "sb_sessions (
                token_hash VARCHAR(64) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                created_at BIGINT NOT NULL,
                expires_at BIGINT NOT NULL
            )",
            "sb_user_data (
                user_id VARCHAR(36) PRIMARY KEY,
                rev BIGINT NOT NULL,
                data {$text} NOT NULL,
                updated_at BIGINT NOT NULL
            )",
            "sb_oauth (
                state VARCHAR(64) PRIMARY KEY,
                provider VARCHAR(20) NOT NULL,
                nonce VARCHAR(64) NOT NULL,
                verifier VARCHAR(128) NOT NULL,
                binding_hash VARCHAR(64) NOT NULL,
                created_at BIGINT NOT NULL
            )",
        ];
        foreach ($tables as $table) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS {$table}{$suffix}");
        }
    }

    /** Abgelaufene Sitzungen und Login-Vorgänge gelegentlich entfernen. */
    public static function cleanup(PDO $pdo): void
    {
        if (random_int(1, 50) !== 1) {
            return;
        }
        $now = time();
        $pdo->prepare('DELETE FROM sb_sessions WHERE expires_at < ?')->execute([$now]);
        $pdo->prepare('DELETE FROM sb_oauth WHERE created_at < ?')->execute([$now - 900]);
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
