<?php

// SchulBuddy – Server-Konfiguration
//
// Kopiere diese Datei als „schulbuddy-config.php“ außerhalb des Webverzeichnisses (empfohlen, dann ist sie
// nie per Browser erreichbar) – bei manitu nach /data-private/schoolbuddy-data/, sonst in das Verzeichnis
// über dem Webverzeichnis – oder als „config.php“ in diesen Ordner.
// Leere Werte = Funktion aus. Details zum Einrichten stehen in der README.

return [
    // Öffentliche Adresse der App (ohne / am Ende). Daraus wird die Login-Rückkehradresse
    // https://schoolbuddy.hamburgrissen.de/api/callback.php gebildet.
    'app_url' => 'https://schoolbuddy.hamburgrissen.de',

    // --- KI (Anthropic) -------------------------------------------------------
    // Schlüssel unter https://platform.claude.com (Settings → API Keys); dort ein Ausgabenlimit setzen.
    'anthropic_api_key' => '',
    'model' => 'claude-opus-5-5',
    'effort' => ['chat' => 'low', 'quiz' => 'low', 'cards' => 'low', 'scan' => 'medium'],
    // Höchstbetrag für die KI pro Kalenderwoche (Montag bis Sonntag). Anthropic rechnet in US-Dollar ab;
    // Kurs und Umsatzsteuer sind vorsichtig angesetzt (1 $ = 1 €, 19 %), 7 € entsprechen also 5,88 $.
    // Ist das Budget aufgebraucht, macht Buddy bis Montag Pause. Die Preise pro Modell stehen in
    // api/lib/common.php ('prices') und lassen sich hier überschreiben, falls Anthropic sie ändert.
    'ai_budget' => ['eur_per_week' => 7.0, 'eur_per_usd' => 1.0, 'vat' => 0.19],
    // KI-Anfragen pro Tag: je Gerät, je IP-Adresse (Schul-WLAN!) und insgesamt.
    'limit_per_device' => 25,
    'limit_per_ip' => 150,
    'limit_global' => 1500,

    // Zufälliger Text für Hashes (Konten, Tageslimits). Einmal festlegen und NIE mehr ändern,
    // sonst findet niemand sein Konto wieder. Leer = wird automatisch als secret.key im data_dir erzeugt.
    'salt' => '',

    // Ordner für Datenbank, Tageszähler und secret.key – am besten außerhalb des Webverzeichnisses.
    // Ohne Angabe: api/data (per .htaccess gesperrt).
    // 'data_dir' => '/home/sites/SITE-ID/data-private/schoolbuddy-data',

    // --- Konten ---------------------------------------------------------------
    // Leer = SQLite-Datei im data_dir (keine Einrichtung nötig). Für MySQL bei manitu z. B.:
    // 'db' => ['dsn' => 'mysql:host=localhost;dbname=DBNAME;charset=utf8mb4', 'user' => 'DBUSER', 'password' => 'DBPASS'],
    'db' => ['dsn' => '', 'user' => '', 'password' => ''],
    'session_days' => 180,

    // Anmeldung: Ein Anbieter erscheint in der App, sobald seine Daten eingetragen sind.
    'auth' => [
        // Microsoft Entra (portal.azure.com → App-Registrierungen), Kontotyp „alle Organisationen und persönliche Konten“.
        'microsoft' => ['client_id' => '', 'client_secret' => '', 'tenant' => 'common'],
        // Google Cloud Console → APIs & Dienste → Anmeldedaten → OAuth-Client-ID (Webanwendung).
        'google' => ['client_id' => '', 'client_secret' => ''],
        // Apple Developer (kostenpflichtig) → Services ID, Team ID, Key ID und Inhalt oder Pfad der .p8-Datei.
        'apple' => ['client_id' => '', 'team_id' => '', 'key_id' => '', 'private_key' => ''],
    ],

    // Weitere erlaubte Herkünfte, falls die App unter mehreren Adressen läuft.
    'allowed_origins' => [],
];
