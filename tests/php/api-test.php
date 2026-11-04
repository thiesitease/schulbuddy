<?php

declare(strict_types=1);

// End-to-End-Test für Anmeldung, Synchronisierung und KI-Proxy gegen lokale Test-Server.
// Start über tests/php/run.ps1 (startet App, Test-Anmeldeanbieter und Test-Claude-API).

use GuzzleHttp\Client;
use GuzzleHttp\Cookie\CookieJar;

require __DIR__ . '/../../public/api/vendor/autoload.php';

const APP = 'http://127.0.0.1:8090';
const ORIGIN = ['Origin' => APP];

$idpDir = sys_get_temp_dir() . '/sb-mock-idp';
$failures = 0;
$checks = 0;

function check(bool $ok, string $label, mixed $detail = null): void
{
    global $failures, $checks;
    $checks++;
    if (!$ok) {
        $failures++;
    }
    echo ($ok ? '  ✔ ' : '  ✖ ') . $label . ($ok || $detail === null ? '' : ' → ' . json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)) . "\n";
}

function client(CookieJar $jar): Client
{
    return new Client(['base_uri' => APP, 'cookies' => $jar, 'http_errors' => false, 'allow_redirects' => false, 'timeout' => 30]);
}

function body($response): array
{
    return json_decode((string) $response->getBody(), true) ?? [];
}

/** Rückkehr vom Test-Anbieter: Weiterleitung per GET oder, wie bei Apple, ein POST-Formular. */
function return_from_idp(Client $http, $idp)
{
    $html = (string) $idp->getBody();
    if ($idp->getStatusCode() === 200 && preg_match('/<form method="post" action="([^"]+)">/', $html, $form)) {
        preg_match_all('/<input type="hidden" name="([^"]+)" value="([^"]*)">/', $html, $inputs, PREG_SET_ORDER);
        $fields = [];
        foreach ($inputs as [, $name, $value]) {
            $fields[$name] = html_entity_decode($value, ENT_QUOTES);
        }
        return $http->post(html_entity_decode($form[1], ENT_QUOTES), ['form_params' => $fields]);
    }
    return $http->get($idp->getHeaderLine('Location'));
}

/** Kompletter Login über den Test-Anbieter; liefert das Ergebnis aus der Rückleitung zur App. */
function login(Client $http, CookieJar $jar, string $provider = 'google'): string
{
    global $lastReturn;
    $start = $http->get('/api/auth.php?action=login&provider=' . $provider);
    $idpUrl = $start->getHeaderLine('Location');
    $idp = (new Client(['http_errors' => false, 'allow_redirects' => false]))->get($idpUrl);
    $lastReturn = return_from_idp($http, $idp)->getHeaderLine('Location');
    preg_match('/login=([a-z]+)/', $lastReturn, $m);
    return $m[1] ?? 'keine-weiterleitung';
}

$lastReturn = '';
@unlink("{$idpDir}/next-sub.txt");
@unlink("{$idpDir}/next-error.txt");
@unlink("{$idpDir}/next-noname.txt");

echo "Anmeldung\n";
$jar = new CookieJar();
$http = client($jar);
$status = body($http->get('/api/auth.php?action=status'));
check(array_column($status['providers'] ?? [], 'id') === ['microsoft', 'google', 'apple'] && $status['user'] === null, 'Status: Microsoft, Google und Apple verfügbar, nicht angemeldet', $status);

$start = $http->get('/api/auth.php?action=login&provider=google');
$location = $start->getHeaderLine('Location');
parse_str((string) parse_url($location, PHP_URL_QUERY), $params);
check($start->getStatusCode() === 302 && str_starts_with($location, 'http://127.0.0.1:8091/authorize'), 'Login leitet zum Anbieter weiter', $location);
check(($params['redirect_uri'] ?? '') === APP . '/api/callback.php', 'Redirect-URI ist /api/callback.php', $params['redirect_uri'] ?? null);
check(($params['code_challenge_method'] ?? '') === 'S256' && strlen($params['nonce'] ?? '') === 32, 'PKCE und Nonce werden gesendet');
check(($params['scope'] ?? '') === 'openid profile', 'Scopes „openid profile“ (Kennung und Name, keine E-Mail)', $params['scope'] ?? null);

$idp = (new Client(['http_errors' => false, 'allow_redirects' => false]))->get($location);
$callbackUrl = $idp->getHeaderLine('Location');
// Fremder Browser ohne Bindungs-Cookie darf den Login nicht abschließen.
$foreign = client(new CookieJar())->get($callbackUrl);
check(str_contains($foreign->getHeaderLine('Location'), 'login=ungueltig'), 'Rückkehr ohne Bindungs-Cookie wird abgelehnt', $foreign->getHeaderLine('Location'));
check(login($http, $jar) === 'ok', 'Kompletter Login klappt');
check(str_ends_with($lastReturn, '/#/settings?login=ok&vorname=Paula'), 'Google: Vorname „Paula“ geht nur im #-Teil an die App', $lastReturn);
file_put_contents("{$idpDir}/next-noname.txt", '1');
check(login($http, $jar) === 'ok' && !str_contains($lastReturn, 'vorname='), 'Ohne Namen vom Anbieter kein Vorname in der Rückleitung', $lastReturn);
$status = body($http->get('/api/auth.php?action=status'));
check(($status['user']['provider'] ?? '') === 'google', 'Status zeigt angemeldetes Google-Konto', $status);
$userId = $status['user']['id'] ?? '';
check(login($http, $jar) === 'ok' && body($http->get('/api/auth.php?action=status'))['user']['id'] === $userId, 'Erneuter Login führt zum selben Konto');

$replay = $http->get($callbackUrl);
check(str_contains($replay->getHeaderLine('Location'), 'login='), 'Wiederverwendeter Rückkehr-Link wird nicht akzeptiert', $replay->getHeaderLine('Location'));
check(!str_contains($replay->getHeaderLine('Location'), 'login=ok'), 'Wiederverwendeter Rückkehr-Link führt nicht zum Login');

file_put_contents("{$idpDir}/next-error.txt", '1');
check(login($http, new CookieJar()) === 'abgebrochen', 'Abgebrochener Login wird erkannt');

foreach (['microsoft', 'apple'] as $provider) {
    $jarP = new CookieJar();
    $httpP = client($jarP);
    $start = $httpP->get('/api/auth.php?action=login&provider=' . $provider);
    parse_str((string) parse_url($start->getHeaderLine('Location'), PHP_URL_QUERY), $p);
    if ($provider === 'apple') {
        check(($p['scope'] ?? '') === 'name' && ($p['response_mode'] ?? '') === 'form_post' && !isset($p['code_challenge']),
            'Apple: Scope „name“, Rückkehr per POST (form_post), ohne PKCE', $p);
        // Ein fremder Browser ohne Bindungs-Cookie darf auch Apples POST-Rückkehr nicht abschließen.
        $idp = (new Client(['http_errors' => false, 'allow_redirects' => false]))->get($start->getHeaderLine('Location'));
        $foreignPost = return_from_idp(client(new CookieJar()), $idp)->getHeaderLine('Location');
        check(str_contains($foreignPost, 'login=ungueltig'), 'Apple: POST-Rückkehr ohne Bindungs-Cookie wird abgelehnt', $foreignPost);
    }
    check(login($httpP, $jarP, $provider) === 'ok', "Login über {$provider} klappt" . ($provider === 'apple' ? ' (signiertes ES256-Client-Secret)' : ''));
    $expected = $provider === 'apple' ? 'Ida' : 'Mats';
    check(str_ends_with($lastReturn, "&vorname={$expected}"), $provider === 'apple'
        ? 'Apple: Vorname aus dem Formularfeld „user“ übernommen'
        : 'Microsoft: Vorname aus dem Anzeigenamen „Becker, Mats“', $lastReturn);
    $st = body($httpP->get('/api/auth.php?action=status'));
    check(($st['user']['provider'] ?? '') === $provider && $st['user']['id'] !== $userId, "{$provider}-Konto ist ein eigenes Konto", $st);
}
check(client(new CookieJar())->get('/api/auth.php?action=login&provider=facebook')->getHeaderLine('Location') === APP . '/#/settings?login=deaktiviert', 'Unbekannter Anbieter wird abgewiesen');
$dbFiles = glob(sys_get_temp_dir() . '/sb-test-data/schulbuddy.sqlite*') ?: [];
$dbBytes = implode('', array_map(static fn (string $f): string => (string) file_get_contents($f), $dbFiles));
check($dbBytes !== '' && !preg_match('/Paula|Beispiel|Mats|Becker|Ida|Muster/', $dbBytes), 'Namen vom Anbieter landen nicht in der Datenbank', array_map('basename', $dbFiles));

echo "Synchronisierung\n";
$sync = body($http->get('/api/sync.php'));
check(($sync['rev'] ?? -1) === 0 && $sync['data'] === null, 'Neues Konto hat noch keine Daten', $sync);
$put = $http->put('/api/sync.php', ['headers' => ORIGIN, 'json' => ['baseRev' => 0, 'data' => ['exams' => [['id' => 'e1']], 'profile' => ['name' => 'Lena']]]]);
check($put->getStatusCode() === 200 && body($put)['rev'] === 1, 'Erste Speicherung → Version 1', body($put));
$conflict = $http->put('/api/sync.php', ['headers' => ORIGIN, 'json' => ['baseRev' => 0, 'data' => ['exams' => []]]]);
check($conflict->getStatusCode() === 409 && body($conflict)['rev'] === 1 && body($conflict)['data']['profile']['name'] === 'Lena', 'Veralteter Stand → Konflikt mit Serverdaten', body($conflict));
$put2 = $http->put('/api/sync.php', ['headers' => ORIGIN, 'json' => ['baseRev' => 1, 'data' => ['exams' => [], 'profile' => ['name' => 'Lena M.']]]]);
check(body($put2)['rev'] === 2, 'Aktueller Stand → Version 2', body($put2));
$rawPut = $http->put('/api/sync.php', ['headers' => ORIGIN + ['Content-Type' => 'application/json'], 'body' => '{"baseRev":2,"data":{"completed":{},"activity":{},"exams":[]}}']);
$rawGet = (string) $http->get('/api/sync.php')->getBody();
check(body($rawPut)['rev'] === 3 && str_contains($rawGet, '"completed":{}') && str_contains($rawGet, '"exams":[]'), 'Leere Objekte bleiben Objekte ({} wird nicht zu [])', $rawGet);
$noOrigin = $http->put('/api/sync.php', ['json' => ['baseRev' => 3, 'data' => ['x' => 1]]]);
check($noOrigin->getStatusCode() === 403, 'Speichern ohne Origin wird abgelehnt (CSRF-Schutz)');
$bad = $http->put('/api/sync.php', ['headers' => ORIGIN, 'json' => ['baseRev' => 3, 'data' => [1, 2, 3]]]);
check($bad->getStatusCode() === 400, 'Ungültige Daten werden abgelehnt');
// Ältere App-Versionen schicken den Chatverlauf noch mit; er darf nicht auf dem Server landen.
$chatPut = $http->put('/api/sync.php', ['headers' => ORIGIN, 'json' => ['baseRev' => 3, 'data' => ['exams' => [], 'chat' => [['role' => 'user', 'text' => 'Geheime Chatfrage']]]]]);
$chatGet = body($http->get('/api/sync.php'));
$dbBytes = implode('', array_map(static fn (string $f): string => (string) file_get_contents($f), glob(sys_get_temp_dir() . '/sb-test-data/schulbuddy.sqlite*') ?: []));
check(body($chatPut)['rev'] === 4 && is_array($chatGet['data'] ?? null) && !array_key_exists('chat', $chatGet['data']) && !str_contains($dbBytes, 'Geheime Chatfrage'),
    'Chatverlauf wird nicht im Konto gespeichert', $chatGet);
// Ältere Versionen hatten den Chat mit ins Konto gespeichert. Die Datenbank entfernt ihn einmalig.
$dbFile = sys_get_temp_dir() . '/sb-test-data/schulbuddy.sqlite';
$pdo = new PDO('sqlite:' . $dbFile);
$row = $pdo->query('SELECT user_id, data FROM sb_user_data LIMIT 1')->fetch(PDO::FETCH_ASSOC);
$old = json_decode($row['data']);
$old->chat = [['role' => 'user', 'text' => 'Alte Chatfrage']];
$pdo->prepare('UPDATE sb_user_data SET data = ? WHERE user_id = ?')->execute([json_encode($old), $row['user_id']]);
$pdo->exec("DELETE FROM sb_meta WHERE name = 'data_version'");
$pdo = null;
$http->get('/api/auth.php?action=status');
$pdo = new PDO('sqlite:' . $dbFile);
$left = (int) $pdo->query("SELECT COUNT(*) FROM sb_user_data WHERE data LIKE '%Alte Chatfrage%'")->fetchColumn();
$rev = (int) $pdo->query('SELECT rev FROM sb_user_data WHERE user_id = ' . $pdo->quote($row['user_id']))->fetchColumn();
$pdo = null;
$dbBytes = implode('', array_map(static fn (string $f): string => (string) file_get_contents($f), glob($dbFile . '*') ?: []));
check($left === 0 && $rev === 4 && !str_contains($dbBytes, 'Alte Chatfrage'), 'Alte Chat-Kopien im Konto werden einmalig entfernt, auch aus der Datei', [$left, $rev]);
$anon = client(new CookieJar())->get('/api/sync.php');
check($anon->getStatusCode() === 401, 'Ohne Anmeldung keine Daten');

echo "Zweites Konto\n";
file_put_contents("{$idpDir}/next-sub.txt", 'user-456');
$jar2 = new CookieJar();
$http2 = client($jar2);
check(login($http2, $jar2) === 'ok', 'Login mit anderem Konto');
$other = body($http2->get('/api/sync.php'));
check($other['rev'] === 0, 'Anderes Konto sieht die Daten des ersten nicht', $other);
$delete = $http2->post('/api/auth.php?action=delete', ['headers' => ORIGIN]);
check(body($delete)['ok'] ?? false, 'Konto löschen');
check(body($http2->get('/api/auth.php?action=status'))['user'] === null, 'Nach dem Löschen abgemeldet');
@unlink("{$idpDir}/next-sub.txt");

echo "Abmelden\n";
$logout = $http->post('/api/auth.php?action=logout', ['headers' => ORIGIN]);
check(body($logout)['ok'] ?? false, 'Abmelden');
check($http->get('/api/sync.php')->getStatusCode() === 401, 'Nach dem Abmelden kein Zugriff mehr');
check(login($http, $jar) === 'ok' && body($http->get('/api/sync.php'))['rev'] === 4, 'Neu anmelden → Daten sind wieder da');

echo "KI-Proxy\n";
$last = static fn () => json_decode((string) file_get_contents(sys_get_temp_dir() . '/sb-mock-anthropic-last.json'), true);
$device = 'test-device-' . bin2hex(random_bytes(4));
$aiStatus = body($http->get('/api/ai.php?status=1', ['headers' => ['X-SchulBuddy-Device' => $device]]));
check(($aiStatus['enabled'] ?? false) === true && $aiStatus['remaining'] === 5, 'KI-Status: bereit, 5 Anfragen frei', $aiStatus);

$chat = $http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'chat', 'deviceId' => $device, 'grade' => 9, 'messages' => [
    ['role' => 'assistant', 'text' => 'Hallo!'], ['role' => 'user', 'text' => 'Was ist ein Bruch?'], ['role' => 'user', 'text' => 'Kurz bitte.'],
]]]);
$sent = $last()['body'];
check(body($chat)['ok'] && str_contains(body($chat)['text'], 'Testantwort'), 'Chat-Antwort kommt an', body($chat));
check($sent['model'] === 'claude-opus-5-5' && $sent['max_tokens'] === 16000, 'Modell und max_tokens im Request', [$sent['model'] ?? null, $sent['max_tokens'] ?? null]);
check(count($sent['messages']) === 1 && $sent['messages'][0]['role'] === 'user' && str_contains($sent['messages'][0]['content'], 'Kurz bitte'), 'Verlauf beginnt mit user, gleiche Rollen zusammengefasst', $sent['messages']);
check(($sent['output_config']['effort'] ?? '') === 'low' && str_contains($sent['system'][0]['text'] ?? '', 'Klasse 9'), 'effort und System-Prompt mit Klassenstufe', [$sent['output_config'] ?? null]);
check(($sent['fallbacks'] ?? '') === 'default' && str_contains($last()['headers']['anthropic-beta'] ?? '', 'server-side-fallback-2026-07-01'), 'Fallback-Option und Beta-Header gesetzt', [$sent['fallbacks'] ?? null, $last()['headers']['anthropic-beta'] ?? null]);
check(!isset($sent['temperature']) && !isset($sent['thinking']), 'Keine veralteten Parameter (temperature, thinking)');

$quiz = body($http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'quiz', 'deviceId' => $device, 'subject' => 'Mathe', 'topic' => 'Pythagoras', 'difficulty' => 'mittel', 'count' => 5]]));
$sent = $last()['body'];
check(($quiz['ok'] ?? false) && count($quiz['questions']) === 1 && $quiz['questions'][0]['correct'] === 1, 'Quiz: gültige Fragen übernommen, kaputte verworfen', $quiz);
check(($sent['output_config']['format']['type'] ?? '') === 'json_schema' && isset($sent['output_config']['format']['schema']['properties']['questions']), 'Quiz nutzt Structured Outputs (json_schema)', $sent['output_config'] ?? null);

$png = 'data:image/png;base64,' . base64_encode(str_repeat("\x89PNG\r\n\x1a\n", 20));
$cards = body($http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'cards', 'deviceId' => $device, 'subject' => 'Biologie', 'text' => 'Zelle', 'image' => $png, 'count' => 10]]));
$sent = $last()['body'];
$image = $sent['messages'][0]['content'][0] ?? [];
check(($cards['ok'] ?? false) && count($cards['cards']) === 1, 'Karteikarten: leere Karte verworfen', $cards);
check(($image['type'] ?? '') === 'image' && ($image['source']['media_type'] ?? '') === 'image/png' && ($image['source']['type'] ?? '') === 'base64', 'Bild wird als base64-Bildblock mit media_type gesendet', $image['source'] ?? $image);

$scan = body($http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'scan', 'deviceId' => $device, 'image' => $png, 'mode' => 'explain']]));
check(($scan['ok'] ?? false) && ($scan['remaining'] ?? -1) === 1, 'Scanner antwortet, Restkontingent zählt mit', $scan);
check(($last()['body']['output_config']['effort'] ?? '') === 'medium', 'Scanner nutzt effort „medium“');

$http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'chat', 'deviceId' => $device, 'messages' => [['role' => 'user', 'text' => 'Hi']]]]);
$limited = $http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'chat', 'deviceId' => $device, 'messages' => [['role' => 'user', 'text' => 'Hi']]]]);
check($limited->getStatusCode() === 429, 'Tageslimit pro Gerät greift', body($limited));
$foreignAi = $http->post('/api/ai.php', ['headers' => ['Origin' => 'https://evil.example'], 'json' => ['task' => 'chat', 'deviceId' => $device, 'messages' => [['role' => 'user', 'text' => 'Hi']]]]);
check($foreignAi->getStatusCode() === 403, 'KI-Anfragen von fremden Seiten werden abgelehnt');

echo "Englisch\n";
$enDevice = 'test-device-' . bin2hex(random_bytes(4));
$en = ORIGIN + ['X-SchulBuddy-Lang' => 'en'];
$enChat = body($http->post('/api/ai.php', ['headers' => $en, 'json' => ['task' => 'chat', 'deviceId' => $enDevice, 'grade' => 7, 'messages' => [['role' => 'user', 'text' => 'What is a fraction?']]]]));
check(($enChat['ok'] ?? false) && str_contains($last()['body']['system'][0]['text'] ?? '', 'Answer in English'), 'System-Prompt auf Englisch', $last()['body']['system'][0]['text'] ?? null);
$http->post('/api/ai.php', ['headers' => $en, 'json' => ['task' => 'quiz', 'deviceId' => $enDevice, 'subject' => 'Maths', 'topic' => 'Fractions', 'difficulty' => 'schwer', 'count' => 5]]);
check(str_contains((string) ($last()['body']['messages'][0]['content'] ?? ''), 'Difficulty: hard'), 'Quiz-Prompt auf Englisch', $last()['body']['messages'][0]['content'] ?? null);
$enError = body($http->post('/api/ai.php', ['headers' => $en, 'json' => ['task' => 'chat', 'deviceId' => $enDevice, 'messages' => []]]));
check(($enError['error'] ?? '') === 'Please ask a question.', 'Fehlermeldungen auf Englisch', $enError);
$deError = body($http->post('/api/ai.php', ['headers' => ORIGIN, 'json' => ['task' => 'chat', 'deviceId' => $enDevice, 'messages' => []]]));
check(($deError['error'] ?? '') === 'Bitte stell eine Frage.', 'Ohne Sprach-Header bleibt es Deutsch', $deError);

echo "KI-Budget\n";
date_default_timezone_set('Europe/Berlin');
$budgetFile = sys_get_temp_dir() . '/sb-test-data/ai-budget-' . date('o-\WW') . '.json';
$ledger = static fn (): array => json_decode((string) @file_get_contents($budgetFile), true) ?? [];
$budgetDevice = 'test-device-' . bin2hex(random_bytes(4));
$ask = static fn (string $text, array $headers = []) => $http->post('/api/ai.php', ['headers' => ORIGIN + $headers,
    'json' => ['task' => 'chat', 'deviceId' => $budgetDevice, 'messages' => [['role' => 'user', 'text' => $text]]]]);
$spent = static fn (): float => (float) ($ledger()['spent_usd'] ?? 0);

$before = $spent();
$normal = body($ask('Was ist ein Bruch?'));
$after = $ledger();
check(($normal['ok'] ?? false) && abs($after['spent_usd'] - $before - 0.00208) < 1e-9 && $after['reserved'] === [],
    'Kosten nach Preis verbucht (120 + 80 Token Opus 5.5 = 0,00208 $), Reservierung aufgelöst', [$after['spent_usd'] - $before, $after['reserved']]);
check(abs($after['limit_usd'] - 7 / 1.19) < 1e-6, 'Limit: 7 € bei 1 $ = 1 € und 19 % USt = 5,88 $', $after['limit_usd']);

$before = $spent();
$fallback = body($ask('FALLBACK-TEST'));
check(($fallback['ok'] ?? false) && abs($spent() - $before - 0.0259) < 1e-9, 'Fallback: jeder Versuch zum Preis seines Modells (Opus 5.5 lehnt ab, Opus 5 antwortet)', $spent() - $before);

$before = $spent();
$apiError = $ask('ERROR-TEST');
check($apiError->getStatusCode() === 502 && $spent() === $before && $ledger()['reserved'] === [], 'API-Fehler: nichts berechnet, Reservierung freigegeben', body($apiError));

// Fast alles verbraucht: Der ungünstigste Fall einer Anfrage passt nicht mehr hinein.
$state = $ledger();
$state['spent_usd'] = $state['limit_usd'] - 0.5;
file_put_contents($budgetFile, json_encode($state));
$paused = $ask('Noch eine Frage');
check($paused->getStatusCode() === 503 && (body($paused)['paused'] ?? false) === true && str_contains(body($paused)['error'] ?? '', 'KI-Budget'),
    'Budget aufgebraucht: Anfrage wird abgelehnt, bevor sie Kosten erzeugt', body($paused));
check((body($http->get('/api/ai.php?status=1'))['paused'] ?? false) === true, 'Status meldet die Pause an die App');
check(str_contains(body($ask('One more question', ['X-SchulBuddy-Lang' => 'en']))['error'] ?? '', 'AI budget'), 'Pause-Hinweis auch auf Englisch');
check($spent() === $state['spent_usd'] && $ledger()['reserved'] === [], 'Abgelehnte Anfragen kosten nichts');
unlink($budgetFile);
check((body($http->get('/api/ai.php?status=1'))['paused'] ?? true) === false, 'Neue Woche (leerer Zähler): Buddy ist wieder da');

echo "\n{$checks} Prüfungen, " . ($failures ? "{$failures} fehlgeschlagen" : 'alle bestanden') . "\n";
exit($failures ? 1 : 0);
