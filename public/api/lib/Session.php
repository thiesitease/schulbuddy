<?php

declare(strict_types=1);

namespace SchulBuddy;

use PDO;

/**
 * Anmeldesitzungen per Cookie. Im Cookie steht ein Zufallswert, in der Datenbank nur dessen Hash.
 */
final class Session
{
    public const COOKIE = 'sb_session';

    /** @return array{id: string, provider: string, created_at: int}|null */
    public static function user(PDO $db): ?array
    {
        $token = (string) ($_COOKIE[self::COOKIE] ?? '');
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $stmt = $db->prepare(
            'SELECT u.id, u.provider, u.created_at FROM sb_sessions s JOIN sb_users u ON u.id = s.user_id
             WHERE s.token_hash = ? AND s.expires_at > ?'
        );
        $stmt->execute([hash('sha256', $token), time()]);
        $user = $stmt->fetch();
        return $user ?: null;
    }

    public static function start(PDO $db, string $userId, int $days): void
    {
        $token = bin2hex(random_bytes(32));
        $expires = time() + $days * 86400;
        $db->prepare('INSERT INTO sb_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
            ->execute([hash('sha256', $token), $userId, time(), $expires]);
        set_cookie(self::COOKIE, $token, $expires);
    }

    public static function end(PDO $db): void
    {
        $token = (string) ($_COOKIE[self::COOKIE] ?? '');
        if ($token !== '') {
            $db->prepare('DELETE FROM sb_sessions WHERE token_hash = ?')->execute([hash('sha256', $token)]);
        }
        set_cookie(self::COOKIE, '', time() - 3600);
    }
}
