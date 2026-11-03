# SchulBuddy – Deine Schule. Dein Plan. Dein Erfolg.

Progressive Web App für Schülerinnen und Schüler der Klassen 7–12: automatische Lernpläne für Klassenarbeiten,
Hausaufgaben mit Erinnerungen, Karteikarten (Leitner-System), Quiz, Ziele, Fortschritt, eine KI-Lernhilfe und
ein optionales Konto zum Synchronisieren zwischen Geräten.

Ziel-Adresse: **https://schoolbuddy.hamburgrissen.de** (Hosting: manitu)

## Funktionen

| Funktion | Umsetzung |
|---|---|
| Smart Study Planner | Prüfung mit Themen eintragen → Lerneinheiten, Wiederholungen mit Abstand und Generalprobe werden auf die Lerntage verteilt. Verpasste Einheiten rutschen automatisch nach. (`public/js/planner.js`) |
| AI Learning Assistant | Chat „Buddy“ – erklärt Schritt für Schritt, passend zur Klassenstufe |
| AI Quiz Generator | Multiple-Choice-Quiz zu Fach und Thema, mit Erklärungen; falsche Antworten → Karteikarten |
| AI Homework Scanner | Foto einer Aufgabe → Tipps (ohne Lösung) oder vollständiger Lösungsweg |
| Progress Tracker | Serie, Lernminuten (Diagramm), Prüfungsfortschritt, Wissenslücken, Noten |
| Smart Reminders | Benachrichtigungen (Android/Chrome, installierte App) und Kalender-Export (.ics) mit Alarmen |
| Digital Flashcards | Karteikasten mit 5 Fächern; KI erstellt Karten aus Lernzettel (Text oder Foto) |
| Goal Setting | Wochen-/Monatsziele (Minuten, Einheiten, Karten, Quizze oder eigenes Ziel) |
| Konto (optional) | Anmeldung über Microsoft, Google oder Apple; Lerndaten werden zwischen Geräten abgeglichen, mit Konfliktabfrage |
| Premium | Preisseite (2,99 €/Monat, 19,99 €/Jahr) – Bezahlung noch nicht aktiv |

Ohne Konto bleiben alle Lerndaten im Browser des Geräts. Sicherung/Wiederherstellung als JSON in den Einstellungen.

## Aufbau

```
public/                 ← wird auf den Webspace geladen (über den Build in dist/)
  index.html, manifest.webmanifest, sw.js, .htaccess, impressum.html, datenschutz.html
  assets/               CSS und Icons
  js/                   App (ES-Module, ohne Build-Schritt)
  api/ai.php            KI-Proxy (offizielles Anthropic-PHP-SDK)
  api/auth.php          Konto: Status, Login-Start, Abmelden, Konto löschen
  api/callback.php      Rückkehr vom Login (Redirect-URI für alle Anbieter)
  api/sync.php          Lerndaten abgleichen (mit Versionsnummer und Konflikterkennung)
  api/lib/              Datenbank, Sitzungen, OpenID Connect, Prompts, Tageslimit
  api/vendor/           PHP-Abhängigkeiten (composer install)
tests/                  Lernplan-Tests (Node) und API-Tests mit Test-Anmeldeanbieter (PHP)
tools/                  build.mjs, dev-server.mjs, make-icons.mjs
deploy/deploy.ps1       Hochladen per SFTP oder FTPS
```

## Lokal entwickeln und testen

```bash
node tools/dev-server.mjs
```

Startet die App auf http://localhost:5173 mit Testantworten statt echter KI (ohne PHP, ohne Konten).

```bash
npm test
```

Die API-Tests (Login über einen Test-Anmeldeanbieter, Synchronisierung, KI-Proxy gegen eine Test-Claude-API)
brauchen PHP 8.1+ mit curl, openssl, mbstring und pdo_sqlite:

```bash
./tests/php/run.ps1 -Php C:\pfad\zu\php.exe
```

## Veröffentlichen auf manitu

### 1. Subdomain einrichten (einmalig)

1. Im manitu-Kundenmenü die Subdomain `schoolbuddy.hamburgrissen.de` anlegen und auf ein eigenes Verzeichnis zeigen lassen.
2. SSL-Zertifikat (Let's Encrypt) für die Subdomain aktivieren – ohne HTTPS funktioniert keine PWA und kein Login.
3. PHP-Version für die Subdomain auf **8.1 oder neuer** stellen (Erweiterungen: curl, openssl, mbstring, pdo_sqlite bzw. pdo_mysql).

### 2. Server-Konfiguration anlegen (einmalig)

`public/api/config.sample.php` kopieren und ausfüllen – bei manitu als
**`/data-private/schoolbuddy-data/schulbuddy-config.php`** (außerhalb des Webverzeichnisses, nie per Browser
erreichbar) und `data_dir` auf denselben Ordner setzen. Ebenfalls gefunden wird `schulbuddy-config.php` eine Ebene
über dem Subdomain-Verzeichnis oder `public/api/config.php` (per `.htaccess` gesperrt, steht in `.gitignore`, wird
beim Deploy mit hochgeladen).

- **KI:** API-Schlüssel unter https://platform.claude.com anlegen und dort ein monatliches Ausgabenlimit setzen.
- **salt:** einen langen Zufallstext eintragen und **nie mehr ändern** – sonst findet niemand sein Konto wieder.
- **Datenbank:** leer lassen → SQLite-Datei im `data_dir` (ohne Angabe `api/data/`, keine Einrichtung nötig).
  Für MySQL bei manitu die Zugangsdaten unter `db` eintragen.

### 3. Anmeldung einrichten (optional, je Anbieter)

Für alle Anbieter gilt dieselbe Redirect-/Return-URL: **`https://schoolbuddy.hamburgrissen.de/api/callback.php`**.
Ein Anbieter erscheint in der App, sobald seine Daten in der Konfiguration stehen.

- **Microsoft** (kostenlos): portal.azure.com → Microsoft Entra ID → App-Registrierungen → Neue Registrierung.
  Kontotyp „Konten in einem beliebigen Organisationsverzeichnis und persönliche Microsoft-Konten“, Plattform „Web“
  mit der Redirect-URL. Unter „Zertifikate & Geheimnisse“ ein Client-Secret anlegen (läuft ab – rechtzeitig erneuern).
  `client_id` = Anwendungs-ID. Hinweis: Manche Schul-Organisationen erlauben Schülern keine Zustimmung zu fremden
  Apps; persönliche Microsoft-Konten funktionieren immer.
- **Google** (kostenlos): console.cloud.google.com → APIs & Dienste → OAuth-Zustimmungsbildschirm (Extern,
  App-Name, Support-E-Mail, autorisierte Domain `hamburgrissen.de`, nur Scope `openid`), dann Anmeldedaten →
  OAuth-Client-ID → Webanwendung mit der Redirect-URL.
- **Apple** (Apple Developer Program, 99 €/Jahr): Identifiers → App ID mit „Sign in with Apple“ → Services ID
  (= `client_id`) mit Domain `schoolbuddy.hamburgrissen.de` und der Return-URL → Keys → neuer Schlüssel mit
  „Sign in with Apple“ (.p8 herunterladen, Key ID notieren). Dazu die Team ID. In der Konfiguration bei
  `private_key` den Pfad zur .p8-Datei (außerhalb des Webverzeichnisses) oder ihren Inhalt eintragen.

### 4. PHP-Abhängigkeiten

`public/api/vendor/` ist bereits gebaut (Anthropic-SDK, Guzzle, php-jwt) und wird beim Deploy mit hochgeladen.
Nach Änderungen an `composer.json` neu bauen:

```bash
composer install --no-dev --working-dir=public/api
```

### 5. Hochladen

`deploy/deploy.config.sample.json` nach `deploy/deploy.config.json` kopieren und Server, Benutzer und
Zielverzeichnis aus dem manitu-Kundenmenü eintragen (`protocol`: `sftp` oder `ftps`). Dann:

```bash
./deploy/deploy.ps1
```

Das Skript baut `dist/` (neue Service-Worker-Version, damit installierte Apps das Update bekommen) und lädt alles hoch.
Bei späteren Updates ohne geänderte PHP-Abhängigkeiten: `./deploy/deploy.ps1 -SkipVendor`.

### 6. Prüfen

- https://schoolbuddy.hamburgrissen.de öffnen → Onboarding erscheint, App lässt sich installieren.
- `/api/ai.php?status=1` → `"enabled": true`; `/api/auth.php?action=status` → die eingerichteten Anbieter.
- `/api/config.php`, `/api/vendor/` und `/api/data/` → müssen **403** liefern.
- Einmal mit jedem eingerichteten Anbieter anmelden und auf einem zweiten Gerät prüfen, ob die Daten ankommen.

## Kosten und Limits

Standardmodell ist `claude-opus-5-5` mit geringer Denktiefe (`effort: low`, beim Foto-Scanner `medium`),
Tageslimits: 25 Anfragen pro Gerät, 150 pro IP (Schul-WLAN), 1.500 insgesamt – einstellbar in der Konfiguration.
Die Token-Summen des Tages stehen in `usage-JJJJ-MM-TT.json` im `data_dir`. Für deutlich geringere Kosten kann ein
günstigeres Modell gesetzt werden, z. B. `claude-haiku-5-5`.

## Vor dem Start erledigen

- Platzhalter in `impressum.html` und `datenschutz.html` ausfüllen (in [eckigen Klammern]) und die
  Datenschutzerklärung rechtlich prüfen lassen – die App richtet sich an Minderjährige.
- Auftragsverarbeitungsvertrag mit manitu abschließen (im Kundenmenü).
