<?php

declare(strict_types=1);

/*
 * SchulBuddy KI-Proxy
 *
 * GET  api/ai.php?status=1  -> ist die KI verfügbar, wie viele Anfragen sind heute noch frei?
 * POST api/ai.php           -> {"task": "chat"|"quiz"|"cards"|"scan", "deviceId": "...", ...}
 *
 * Der Anthropic-API-Schlüssel steht nur in der Konfiguration auf dem Server (siehe config.sample.php).
 * Anfragen und Fotos werden nicht gespeichert, nur gehashte Zähler für das Tageslimit.
 * Die Sprache der Antworten und Meldungen kommt aus dem Header X-SchulBuddy-Lang (siehe app_lang()).
 * Die Kosten sind pro Woche gedeckelt ('ai_budget', siehe lib/Budget.php).
 */

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\APITimeoutException;
use Anthropic\Core\Exceptions\AuthenticationException;
use Anthropic\Core\Exceptions\BadRequestException;
use Anthropic\Core\Exceptions\PermissionDeniedException;
use Anthropic\Core\Exceptions\RateLimitException;
use Anthropic\RequestOptions;
use SchulBuddy\Budget;
use SchulBuddy\Pricing;
use SchulBuddy\Prompts;
use SchulBuddy\RateLimiter;

require __DIR__ . '/lib/common.php';
require __DIR__ . '/lib/Budget.php';
require __DIR__ . '/lib/Pricing.php';
require __DIR__ . '/lib/Prompts.php';
require __DIR__ . '/lib/RateLimiter.php';

@set_time_limit(180);

$config = sb_config();
$autoload = __DIR__ . '/vendor/autoload.php';
$sdkReady = is_file($autoload);
$enabled = $sdkReady && $config['anthropic_api_key'] !== '';
$lang = app_lang();

$salt = sb_secret($config);
$hashId = static fn (string $value): string => substr(hash_hmac('sha256', $value, $salt), 0, 20);
$limiter = new RateLimiter(data_dir($config));
$pricing = new Pricing((array) $config['prices']);
$budget = Budget::fromConfig($config, data_dir($config));
$model = (string) $config['model'];
$maxTokens = (int) $config['max_tokens'];
// Server-seitiger Fallback, falls ein Sicherheitsfilter eine harmlose Anfrage ablehnt.
$fallbacks = $config['fallbacks'] && preg_match('/^claude-(opus-5|sonnet-5-5|fable)/', $model) === 1;
$pausedMessage = tr('Buddy macht diese Woche Pause: Das KI-Budget ist aufgebraucht. Ab Montag geht es weiter.',
    'Buddy is taking a break this week: the AI budget has been used up. It will be back on Monday.');

$deviceHeader = (string) ($_SERVER['HTTP_X_SCHULBUDDY_DEVICE'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $remaining = null;
    if (preg_match('/^[A-Za-z0-9-]{8,64}$/', $deviceHeader)) {
        $remaining = max(0, (int) $config['limit_per_device'] - $limiter->used('d:' . $hashId($deviceHeader)));
    }
    $paused = $enabled && $budget->exhausted($pricing->worstCase($model, Pricing::MIN_INPUT_TOKENS, $maxTokens, $fallbacks));
    respond(200, ['ok' => true, 'enabled' => $enabled, 'paused' => $paused, 'limit' => (int) $config['limit_per_device'], 'remaining' => $remaining]);
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    fail(405, tr('Methode nicht erlaubt.', 'Method not allowed.'));
}

// Nur Anfragen aus der App selbst annehmen.
require_same_origin($config);

if (!$enabled) {
    fail(503, $sdkReady
        ? tr('Die KI ist auf dem Server noch nicht eingerichtet (API-Schlüssel fehlt).', 'The AI has not been set up on the server yet (API key missing).')
        : tr('Die KI ist auf dem Server noch nicht installiert (vendor fehlt).', 'The AI has not been installed on the server yet (vendor missing).'));
}

$input = read_json_body(8_000_000);

$task = (string) ($input['task'] ?? '');
$deviceId = (string) ($input['deviceId'] ?? '');
if (!in_array($task, ['chat', 'quiz', 'cards', 'scan'], true) || !preg_match('/^[A-Za-z0-9-]{8,64}$/', $deviceId)) {
    fail(400, tr('Ungültige Anfrage.', 'Invalid request.'));
}
$grade = max(5, min(13, (int) ($input['grade'] ?? 8)));

$deviceKey = 'd:' . $hashId($deviceId);
$ipKey = 'i:' . $hashId((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
$limits = [$deviceKey => (int) $config['limit_per_device'], $ipKey => (int) $config['limit_per_ip'], 'all' => (int) $config['limit_global']];
$hit = $limiter->exceeded($limits);
if ($hit !== null) {
    fail(429, $hit === $deviceKey
        ? tr('Du hast dein KI-Tageslimit erreicht. Morgen geht es weiter. 🙂', 'You have reached your daily AI limit. You can continue tomorrow. 🙂')
        : tr('Buddy ist heute schon sehr gefragt. Bitte versuch es morgen wieder.', 'Buddy is in high demand today. Please try again tomorrow.'));
}

/** @return array{0: string, 1: string}|null Medientyp und Base64-Daten */
function parseImage(mixed $value): ?array
{
    if (!is_string($value) || $value === '') {
        return null;
    }
    $parts = explode(',', $value, 2);
    if (count($parts) !== 2 || !preg_match('#^data:(image/(?:jpeg|png|webp|gif));base64$#', $parts[0], $m)) {
        fail(400, tr('Das Bildformat wird nicht unterstützt.', 'This image format is not supported.'));
    }
    $binary = base64_decode($parts[1], true);
    if ($binary === false || strlen($binary) < 100) {
        fail(400, tr('Das Bild konnte nicht gelesen werden.', 'The image could not be read.'));
    }
    if (strlen($binary) > 4_500_000) {
        fail(413, tr('Das Foto ist zu groß.', 'The photo is too large.'));
    }
    return [$m[1], $parts[1]];
}

$subject = cut((string) ($input['subject'] ?? ''), 40);
$outputConfig = ['effort' => (string) ($config['effort'][$task] ?? 'low')];

switch ($task) {
    case 'chat':
        $messages = [];
        foreach (array_slice(is_array($input['messages'] ?? null) ? $input['messages'] : [], -12) as $m) {
            if (!is_array($m)) {
                continue;
            }
            $role = ($m['role'] ?? '') === 'assistant' ? 'assistant' : 'user';
            $text = cut((string) ($m['text'] ?? ''), 4000);
            if ($text === '') {
                continue;
            }
            $last = count($messages) - 1;
            if ($last >= 0 && $messages[$last]['role'] === $role) {
                $messages[$last]['content'] .= "\n\n" . $text;
            } else {
                $messages[] = ['role' => $role, 'content' => $text];
            }
        }
        while ($messages && $messages[0]['role'] !== 'user') {
            array_shift($messages);
        }
        if (!$messages || $messages[count($messages) - 1]['role'] !== 'user') {
            fail(400, tr('Bitte stell eine Frage.', 'Please ask a question.'));
        }
        break;

    case 'quiz':
        $topic = cut((string) ($input['topic'] ?? ''), 120);
        if ($topic === '' || $subject === '') {
            fail(400, tr('Bitte gib Fach und Thema an.', 'Please enter a subject and a topic.'));
        }
        $difficulty = in_array($input['difficulty'] ?? '', ['leicht', 'mittel', 'schwer'], true) ? $input['difficulty'] : 'mittel';
        $count = max(3, min(15, (int) ($input['count'] ?? 10)));
        $messages = [['role' => 'user', 'content' => Prompts::quiz($subject, $topic, $difficulty, $count, $grade, $lang)]];
        $outputConfig['format'] = ['type' => 'json_schema', 'schema' => Prompts::quizSchema()];
        break;

    case 'cards':
        $image = parseImage($input['image'] ?? null);
        $text = cut((string) ($input['text'] ?? ''), 12000);
        if ($image === null && $text === '') {
            fail(400, tr('Füge Text ein oder wähle ein Foto aus.', 'Paste some text or choose a photo.'));
        }
        $count = max(3, min(30, (int) ($input['count'] ?? 15)));
        $prompt = Prompts::cards($subject !== '' ? $subject : tr('unbekannt', 'unknown'), $count, $grade, $image !== null, $lang);
        $content = [];
        if ($image !== null) {
            $content[] = ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $image[0], 'data' => $image[1]]];
        }
        $content[] = ['type' => 'text', 'text' => $prompt . ($text !== '' ? "\n\n<lernzettel>\n{$text}\n</lernzettel>" : '')];
        $messages = [['role' => 'user', 'content' => $content]];
        $outputConfig['format'] = ['type' => 'json_schema', 'schema' => Prompts::cardsSchema()];
        break;

    case 'scan':
        $image = parseImage($input['image'] ?? null);
        if ($image === null) {
            fail(400, tr('Bitte wähle ein Foto der Aufgabe aus.', 'Please choose a photo of the task.'));
        }
        $mode = ($input['mode'] ?? '') === 'explain' ? 'explain' : 'hint';
        $question = cut((string) ($input['question'] ?? ''), 500);
        $messages = [['role' => 'user', 'content' => [
            ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $image[0], 'data' => $image[1]]],
            ['type' => 'text', 'text' => Prompts::scan($mode, $subject, $question, $lang)],
        ]]];
        break;
}

$system = Prompts::system($grade, $lang);

// Wochenbudget: vorab reservieren, was die Anfrage höchstens kosten kann.
$worstCase = $pricing->worstCase($model, Pricing::estimateInputTokens($system, $messages, $outputConfig), $maxTokens, $fallbacks);
$reservation = $budget->reserve($worstCase);
if ($reservation === null) {
    fail(503, $pausedMessage, ['paused' => true]);
}

require $autoload;

$params = [
    'model' => $model,
    'maxTokens' => $maxTokens,
    'system' => [['type' => 'text', 'text' => $system]],
    'messages' => $messages,
    'outputConfig' => $outputConfig,
];
if ($fallbacks) {
    $params['betas'] = ['server-side-fallback-2026-07-01'];
    $params['fallbacks'] = 'default';
}

try {
    // Keine automatischen Wiederholungen: Ein abgebrochener Versuch könnte schon berechnet sein,
    // und das Budget soll nur zählen, was wirklich gelaufen ist.
    $client = new Client(
        apiKey: (string) $config['anthropic_api_key'],
        baseUrl: $config['base_url'] ?: null,
        requestOptions: RequestOptions::with(timeout: 110, maxRetries: 0),
    );
    // Beta-Schnittstelle, weil nur sie usage.iterations liefert: die Abrechnung je Versuch bei Fallbacks.
    $message = $client->beta->messages->create(...$params);
} catch (AuthenticationException | PermissionDeniedException $e) {
    $budget->release($reservation);
    error_log('SchulBuddy: API-Schlüssel ungültig – ' . $e->getMessage());
    fail(503, tr('Die KI ist auf dem Server nicht richtig eingerichtet.', 'The AI is not set up correctly on the server.'));
} catch (RateLimitException $e) {
    $budget->release($reservation);
    fail(503, tr('Buddy hat gerade sehr viel zu tun. Versuch es in einer Minute noch einmal.', 'Buddy is very busy right now. Please try again in a minute.'));
} catch (BadRequestException $e) {
    $budget->release($reservation);
    error_log('SchulBuddy: Anfrage abgelehnt – ' . $e->getMessage());
    fail(400, tr('Die Anfrage konnte nicht verarbeitet werden. Versuch es mit einem anderen Foto oder Text.', 'The request could not be processed. Try a different photo or text.'));
} catch (APITimeoutException | APIConnectionException $e) {
    // Die Anfrage könnte trotzdem gelaufen sein: vorsichtshalber den ungünstigsten Fall verbuchen.
    $budget->settle($reservation, $worstCase);
    fail(504, tr('Keine Verbindung zur KI. Versuch es gleich noch einmal.', 'No connection to the AI. Please try again in a moment.'));
} catch (APIStatusException $e) {
    $budget->release($reservation);
    error_log('SchulBuddy: API-Fehler – ' . $e->getMessage());
    fail(502, tr('Die KI ist gerade nicht erreichbar. Versuch es später noch einmal.', 'The AI is not available right now. Please try again later.'));
} catch (Throwable $e) {
    $budget->settle($reservation, $worstCase);
    error_log('SchulBuddy: ' . $e::class . ' – ' . $e->getMessage());
    fail(500, tr('Da ist etwas schiefgelaufen. Versuch es später noch einmal.', 'Something went wrong. Please try again later.'));
}

// Auch abgelehnte oder unbrauchbare Antworten kosten etwas: sofort abrechnen.
$budget->settle($reservation, $pricing->cost($message, $model) ?? $worstCase);

$stopReason = $message->stopReason instanceof BackedEnum ? $message->stopReason->value : (string) $message->stopReason;
if ($stopReason === 'refusal') {
    fail(422, tr('Dabei kann Buddy leider nicht helfen. Formuliere deine Frage anders oder frag deine Lehrkraft.', 'Sorry, Buddy can’t help with that. Try rephrasing your question or ask your teacher.'));
}

$text = '';
foreach ($message->content as $block) {
    $type = $block->type instanceof BackedEnum ? $block->type->value : $block->type;
    if ($type === 'text') {
        $text .= $block->text;
    }
}

$limiter->add([
    $deviceKey => 1,
    $ipKey => 1,
    'all' => 1,
    'tokens_in' => (int) ($message->usage->inputTokens ?? 0),
    'tokens_out' => (int) ($message->usage->outputTokens ?? 0),
]);
$remaining = max(0, (int) $config['limit_per_device'] - $limiter->used($deviceKey));

if ($task === 'chat' || $task === 'scan') {
    if (trim($text) === '') {
        fail(502, tr('Buddy hat keine Antwort geliefert. Versuch es noch einmal.', 'Buddy did not give an answer. Please try again.'));
    }
    respond(200, ['ok' => true, 'text' => $text, 'remaining' => $remaining]);
}

if ($stopReason === 'max_tokens') {
    fail(502, tr('Die Antwort war zu lang. Versuch es mit weniger Fragen oder Karten.', 'The answer was too long. Try fewer questions or cards.'));
}
$data = json_decode($text, true);
if (!is_array($data)) {
    fail(502, tr('Die Antwort der KI war unvollständig. Versuch es noch einmal.', 'The AI’s answer was incomplete. Please try again.'));
}

if ($task === 'quiz') {
    $questions = [];
    foreach ($data['questions'] ?? [] as $q) {
        $answers = array_values(array_filter(array_map('strval', (array) ($q['options'] ?? [])), static fn ($o) => trim($o) !== ''));
        $correct = (int) ($q['correct'] ?? -1);
        if (trim((string) ($q['question'] ?? '')) === '' || count($answers) < 2 || count($answers) > 6 || $correct < 0 || $correct >= count($answers)) {
            continue;
        }
        $questions[] = ['question' => (string) $q['question'], 'options' => $answers, 'correct' => $correct, 'explanation' => (string) ($q['explanation'] ?? '')];
    }
    if (!$questions) {
        fail(502, tr('Zu diesem Thema konnte Buddy kein Quiz erstellen. Versuch ein anderes Thema.', 'Buddy could not create a quiz on this topic. Try a different topic.'));
    }
    respond(200, ['ok' => true, 'questions' => $questions, 'remaining' => $remaining]);
}

$cards = [];
foreach ($data['cards'] ?? [] as $c) {
    $front = cut((string) ($c['front'] ?? ''), 300);
    $back = cut((string) ($c['back'] ?? ''), 600);
    if ($front !== '' && $back !== '') {
        $cards[] = ['front' => $front, 'back' => $back];
    }
}
if (!$cards) {
    fail(422, tr('Auf dem Lernzettel hat Buddy keinen Lernstoff gefunden. Versuch es mit einem deutlicheren Foto oder mehr Text.', 'Buddy could not find any study material in your notes. Try a clearer photo or more text.'));
}
respond(200, ['ok' => true, 'cards' => $cards, 'remaining' => $remaining]);
