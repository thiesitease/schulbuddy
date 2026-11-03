<?php

declare(strict_types=1);

namespace SchulBuddy;

/**
 * Zählt KI-Anfragen pro Tag in einer JSON-Datei (pro Gerät, pro IP und insgesamt).
 * Gespeichert werden nur gehashte Kennungen; Dateien älter als zwei Tage werden gelöscht.
 */
final class RateLimiter
{
    public function __construct(private string $dir)
    {
    }

    /**
     * @param array<string, int> $limits Schlüssel => Tageslimit
     * @return string|null Schlüssel, dessen Limit erreicht ist
     */
    public function exceeded(array $limits): ?string
    {
        $data = $this->read();
        foreach ($limits as $key => $limit) {
            if (($data[$key] ?? 0) >= $limit) {
                return $key;
            }
        }
        return null;
    }

    public function used(string $key): int
    {
        return (int) ($this->read()[$key] ?? 0);
    }

    /** @param array<string, int> $amounts Schlüssel => Zuwachs */
    public function add(array $amounts): void
    {
        $this->ensureDir();
        $fp = @fopen($this->file(), 'c+');
        if ($fp === false) {
            return;
        }
        try {
            flock($fp, LOCK_EX);
            $data = json_decode((string) stream_get_contents($fp), true);
            $data = is_array($data) ? $data : [];
            foreach ($amounts as $key => $n) {
                $data[$key] = (int) ($data[$key] ?? 0) + $n;
            }
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, (string) json_encode($data));
            fflush($fp);
            flock($fp, LOCK_UN);
        } finally {
            fclose($fp);
        }
        if (random_int(1, 50) === 1) {
            $this->cleanup();
        }
    }

    /** @return array<string, int> */
    private function read(): array
    {
        $file = $this->file();
        if (!is_file($file)) {
            return [];
        }
        $fp = @fopen($file, 'r');
        if ($fp === false) {
            return [];
        }
        try {
            flock($fp, LOCK_SH);
            $data = json_decode((string) stream_get_contents($fp), true);
            flock($fp, LOCK_UN);
        } finally {
            fclose($fp);
        }
        return is_array($data) ? $data : [];
    }

    private function file(): string
    {
        return $this->dir . '/usage-' . date('Y-m-d') . '.json';
    }

    private function ensureDir(): void
    {
        if (is_dir($this->dir)) {
            return;
        }
        @mkdir($this->dir, 0750, true);
        @file_put_contents($this->dir . '/.htaccess', "Require all denied\n");
        @file_put_contents($this->dir . '/index.html', '');
    }

    private function cleanup(): void
    {
        $keep = [date('Y-m-d'), date('Y-m-d', strtotime('-1 day'))];
        foreach (glob($this->dir . '/usage-*.json') ?: [] as $file) {
            if (!in_array(substr(basename($file), 6, 10), $keep, true)) {
                @unlink($file);
            }
        }
    }
}
