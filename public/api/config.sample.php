<?php

// SchulBuddy – Server-Konfiguration
//
// Kopiere diese Datei als „schulbuddy-config.php“ in das Verzeichnis ÜBER dem Webverzeichnis
// (empfohlen, dann ist sie nie per Browser erreichbar) oder als „config.php“ in diesen Ordner.
// Leere Werte = Funktion aus. Details zum Einrichten stehen in der README.

return [
    // Öffentliche Adresse der App (ohne / am Ende). Daraus wird die Login-Rückkehradresse
    // https://schoolbuddy.thiesreinhold.de/api/callback.php gebildet.
    'app_url' => 'https://schoolbuddy.thiesreinhold.de',

    // --- KI (Anthropic) -------------------------------------------------------
    // Schlüssel unter https://platform.claude.com (Settings → API Keys); dort ein Ausgabenlimit setzen.
    'anthropic_api_key' => '',
    'model' => 'claude-opus-5-5',
    'effort' => ['chat' => 'low', 'quiz' => 'low', 'cards' => 'low', 'scan' => 'medium'],
    // KI-Anfragen pro Tag: je Gerät, je IP-Adresse (Schul-WLAN!) und insgesamt.
    'limit_per_device' => 25,
    'limit_per_ip' => 150,
    'limit_global' => 1500,

    // Zufälliger Text für Hashes (Konten, Tageslimits). Einmal festlegen und NIE mehr ändern,
    // sonst findet niemand sein Konto wieder. Leer = wird automatisch in api/data/secret.key erzeugt.
    'salt' => '',

    // --- Konten ---------------------------------------------------------------
    // Leer = SQLite-Datei in api/data (keine Einrichtung nötig). Für MySQL bei manitu z. B.:
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
