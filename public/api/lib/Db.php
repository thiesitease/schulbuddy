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
            // Gelöschte Daten überschreiben statt nur als frei markieren (Konto löschen, Chat entfernen).
            $pdo->exec('PRAGMA secure_delete = ON');
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
        $pdo->exec("CREATE TABLE IF NOT EXISTS sb_meta (name VARCHAR(40) PRIMARY KEY, value VARCHAR(255) NOT NULL){$suffix}");
        $version = (int) $pdo->query("SELECT value FROM sb_meta WHERE name = 'data_version'")->fetchColumn();
        if ($version < 1) {
            self::removeChats($pdo);
            $pdo->exec("REPLACE INTO sb_meta (name, value) VALUES ('data_version', '1')");
            if (!$mysql) {
                // Alte Inhalte auch aus freien Seiten der Datei entfernen.
                try {
                    $pdo->exec('VACUUM');
                } catch (\PDOException) {
                    // Datenbank gerade belegt: kein Problem, secure_delete greift ab jetzt trotzdem.
                }
            }
        }
    }

    /** Der Chatverlauf bleibt auf dem Gerät; ältere App-Versionen hatten ihn mit ins Konto gespeichert. */
    private static function removeChats(PDO $pdo): void
    {
        $rows = $pdo->query("SELECT user_id, data FROM sb_user_data WHERE data LIKE '%\"chat\"%'")->fetchAll();
        // Nur ändern, wenn inzwischen niemand anderes gespeichert hat. Die Version bleibt gleich.
        $update = $pdo->prepare('UPDATE sb_user_data SET data = ? WHERE user_id = ? AND data = ?');
        foreach ($rows as $row) {
            $data = json_decode($row['data']);
            if (!$data instanceof \stdClass || !property_exists($data, 'chat')) {
                continue;
            }
            unset($data->chat);
            $update->execute([json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $row['user_id'], $row['data']]);
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
