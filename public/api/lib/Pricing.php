<?php

declare(strict_types=1);

namespace SchulBuddy;

/**
 * Kosten der KI-Anfragen in US-Dollar, mit den Preisen aus der Konfiguration ('prices', pro Million Token).
 *
 * Mit Server-Fallback kann eine Anfrage auf einem zweiten Modell weiterlaufen. Dann ist usage.iterations
 * die Abrechnungsgrundlage: Jeder Versuch kostet den Preis des Modells, das ihn ausgeführt hat.
 */
final class Pricing
{
    /** Eingabe einer kleinen Anfrage, um vorab zu prüfen, ob das Budget überhaupt noch reicht. */
    public const MIN_INPUT_TOKENS = 3000;

    /** @param array<string, array<string, float|int>> $prices Modell (oder '*' für unbekannte) => Preise */
    public function __construct(private array $prices)
    {
    }

    /** @return array{input: float, output: float, cache_write: float, cache_read: float} */
    public function of(string $model): array
    {
        $price = $this->prices[$model] ?? $this->prices['*'] ?? null;
        return $price !== null ? self::normalize($price) : $this->highest();
    }

    /** Höchster Preis je Posten über alle Modelle – für den ungünstigsten Fall. */
    public function highest(): array
    {
        $max = ['input' => 0.0, 'output' => 0.0, 'cache_write' => 0.0, 'cache_read' => 0.0];
        foreach ($this->prices as $price) {
            foreach (self::normalize($price) as $key => $value) {
                $max[$key] = max($max[$key], $value);
            }
        }
        return $max;
    }

    /**
     * Was eine Anfrage höchstens kosten kann: Das Modell schöpft max_tokens aus. Mit Fallback kann es
     * mittendrin ablehnen (bis dahin berechnet), und ein Fallback-Modell rechnet noch einmal alles ab.
     */
    public function worstCase(string $model, int $inputTokens, int $maxTokens, bool $fallbacks): float
    {
        $usd = self::price($this->of($model), $inputTokens, $maxTokens);
        if ($fallbacks) {
            $usd += self::price($this->highest(), $inputTokens, $maxTokens);
        }
        return $usd;
    }

    /** Tatsächliche Kosten einer Antwort (Anthropic\Beta\Messages\BetaMessage); null ohne Angaben zur Nutzung. */
    public function cost(object $message, string $requestedModel): ?float
    {
        $usage = $message->usage ?? null;
        if (!is_object($usage)) {
            return null;
        }
        $iterations = $usage->iterations ?? null;
        if (!is_array($iterations) || !$iterations) {
            return $this->usageCost($usage, (string) ($message->model ?? $requestedModel));
        }
        $usd = 0.0;
        foreach ($iterations as $iteration) {
            $usd += $this->usageCost($iteration, (string) ($iteration->model ?? $message->model ?? $requestedModel));
        }
        return $usd;
    }

    /**
     * Großzügig geschätzte Eingabe-Token vor der Anfrage: 2 Byte pro Token (deutscher Text braucht
     * eher 3–4), 5000 Token pro Foto und etwas für Formatierung.
     *
     * @param list<array<string, mixed>> $messages
     * @param array<string, mixed> $outputConfig
     */
    public static function estimateInputTokens(string $system, array $messages, array $outputConfig): int
    {
        $bytes = strlen($system) + strlen((string) json_encode($outputConfig['format'] ?? []));
        $images = 0;
        foreach ($messages as $message) {
            $content = $message['content'] ?? '';
            if (is_string($content)) {
                $bytes += strlen($content);
                continue;
            }
            foreach ((array) $content as $block) {
                if (($block['type'] ?? '') === 'image') {
                    $images++;
                } else {
                    $bytes += strlen((string) ($block['text'] ?? ''));
                }
            }
        }
        return (int) ceil($bytes / 2) + $images * 5000 + 1000;
    }

    private function usageCost(object $usage, string $model): float
    {
        $price = $this->of($model);
        return (($usage->inputTokens ?? 0) * $price['input']
            + ($usage->outputTokens ?? 0) * $price['output']
            + ($usage->cacheCreationInputTokens ?? 0) * $price['cache_write']
            + ($usage->cacheReadInputTokens ?? 0) * $price['cache_read']) / 1_000_000;
    }

    /** @param array{input: float, output: float, cache_write: float, cache_read: float} $price */
    private static function price(array $price, int $inputTokens, int $outputTokens): float
    {
        return ($inputTokens * $price['input'] + $outputTokens * $price['output']) / 1_000_000;
    }

    /** @param array<string, float|int> $price */
    private static function normalize(array $price): array
    {
        return [
            'input' => (float) ($price['input'] ?? 0),
            'output' => (float) ($price['output'] ?? 0),
            'cache_write' => (float) ($price['cache_write'] ?? 0),
            'cache_read' => (float) ($price['cache_read'] ?? 0),
        ];
    }
}
