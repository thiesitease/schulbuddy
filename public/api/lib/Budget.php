<?php

declare(strict_types=1);

namespace SchulBuddy;

/**
 * Wochenbudget der KI: Höchstbetrag pro Kalenderwoche (Montag bis Sonntag, deutsche Zeit).
 *
 * Vor jeder Anfrage wird reserviert, was sie im ungünstigsten Fall kosten kann, danach wird die
 * Reservierung durch die tatsächlichen Kosten ersetzt. So bleibt die Summe auch bei gleichzeitigen
 * Anfragen unter dem Limit. Die Datei ai-budget-<Jahr>-W<Woche>.json im data-Ordner enthält nur
 * Beträge in US-Dollar, keine Kennungen von Personen oder Geräten.
 */
final class Budget
{
    private const KEEP_WEEKS = 12;

    public function __construct(private string $dir, private float $limitUsd)
    {
    }

    /** @param array<string, mixed> $config */
    public static function fromConfig(array $config, string $dir): self
    {
        $budget = (array) $config['ai_budget'];
        // Anthropic rechnet in US-Dollar ab. Kurs und Umsatzsteuer sind vorsichtig angesetzt.
        $eurPerUsd = max(0.01, (float) $budget['eur_per_usd']) * (1 + max(0.0, (float) $budget['vat']));
        return new self($dir, max(0.0, (float) $budget['eur_per_week']) / $eurPerUsd);
    }

    public function limitUsd(): float
    {
        return $this->limitUsd;
    }

    /** Reserviert $usd für eine Anfrage. Liefert die Reservierung oder null, wenn das Budget nicht reicht. */
    public function reserve(float $usd): ?string
    {
        $week = self::week();
        $id = bin2hex(random_bytes(6));
        $ok = $this->update($week, function (array &$data) use ($id, $usd): bool {
            if (self::committed($data) + $usd > $this->limitUsd) {
                $data['paused_since'] ??= date(DATE_ATOM);
                return false;
            }
            $data['reserved'][$id] = round($usd, 6);
            return true;
        });
        return $ok ? "{$week}/{$id}" : null;
    }

    /** Ersetzt die Reservierung durch die tatsächlichen Kosten. */
    public function settle(string $reservation, float $usd): void
    {
        [$week, $id] = explode('/', $reservation, 2);
        $this->update($week, function (array &$data) use ($id, $usd): bool {
            unset($data['reserved'][$id]);
            $data['spent_usd'] = round($data['spent_usd'] + $usd, 6);
            $data['requests']++;
            return true;
        });
    }

    /** Gibt die Reservierung frei, wenn die API die Anfrage nicht verarbeitet hat (dann kostet sie nichts). */
    public function release(string $reservation): void
    {
        [$week, $id] = explode('/', $reservation, 2);
        $this->update($week, function (array &$data) use ($id): bool {
            unset($data['reserved'][$id]);
            return true;
        });
    }

    /** Reicht das Budget dieser Woche nicht mehr für eine Anfrage, die bis zu $usd kosten kann? */
    public function exhausted(float $usd): bool
    {
        $file = $this->file(self::week());
        $data = self::normalize(is_file($file) ? json_decode((string) @file_get_contents($file), true) : null, self::week());
        return self::committed($data) + $usd > $this->limitUsd;
    }

    private static function week(): string
    {
        return date('o-\WW');
    }

    private static function committed(array $data): float
    {
        return $data['spent_usd'] + array_sum($data['reserved']);
    }

    /** @param callable(array<string, mixed>&): bool $change */
    private function update(string $week, callable $change): bool
    {
        if (!is_dir($this->dir)) {
            @mkdir($this->dir, 0750, true);
        }
        $file = $this->file($week);
        $isNew = !is_file($file);
        $fp = @fopen($file, 'c+');
        if ($fp === false) {
            // Ohne Zähler keine KI: lieber ablehnen als unkontrolliert Kosten erzeugen.
            error_log('SchulBuddy: KI-Budget-Datei nicht beschreibbar – ' . $file);
            return false;
        }
        try {
            flock($fp, LOCK_EX);
            $data = self::normalize(json_decode((string) stream_get_contents($fp), true), $week);
            $result = $change($data);
            $data['limit_usd'] = round($this->limitUsd, 6);
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, (string) json_encode($data, JSON_PRETTY_PRINT));
            fflush($fp);
            flock($fp, LOCK_UN);
        } finally {
            fclose($fp);
        }
        if ($isNew) {
            $this->cleanup();
        }
        return $result;
    }

    /** @return array{week: string, limit_usd: float, spent_usd: float, requests: int, reserved: array<string, float>, paused_since: ?string} */
    private static function normalize(mixed $data, string $week): array
    {
        $data = is_array($data) ? $data : [];
        return [
            'week' => $week,
            'limit_usd' => (float) ($data['limit_usd'] ?? 0),
            'spent_usd' => (float) ($data['spent_usd'] ?? 0),
            'requests' => (int) ($data['requests'] ?? 0),
            'reserved' => array_map('floatval', is_array($data['reserved'] ?? null) ? $data['reserved'] : []),
            'paused_since' => isset($data['paused_since']) ? (string) $data['paused_since'] : null,
        ];
    }

    private function file(string $week): string
    {
        return "{$this->dir}/ai-budget-{$week}.json";
    }

    /** Nur die letzten Wochen aufheben. */
    private function cleanup(): void
    {
        $files = glob("{$this->dir}/ai-budget-*.json") ?: [];
        sort($files);
        foreach (array_slice($files, 0, max(0, count($files) - self::KEEP_WEEKS)) as $old) {
            @unlink($old);
        }
    }
}
