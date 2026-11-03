// Baut dist/ für die Veröffentlichung: kopiert public/ und setzt im Service Worker
// eine neue Version und die vollständige Offline-Liste. Aufruf: npm run build
import { readdirSync, statSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public');
const dist = join(root, 'dist');

// Laufzeitdaten des Servers nie hochladen.
const EXCLUDE = [/^api\/data\//];

function walk(dir, base = '') {
  return readdirSync(dir).flatMap((name) => {
    const rel = base ? `${base}/${name}` : name;
    return statSync(join(dir, name)).isDirectory() ? walk(join(dir, name), rel) : [rel];
  });
}

const files = walk(src).filter((f) => !EXCLUDE.some((re) => re.test(f)));
rmSync(dist, { recursive: true, force: true });
for (const f of files) {
  mkdirSync(dirname(join(dist, f)), { recursive: true });
  copyFileSync(join(src, f), join(dist, f));
}

// Alles außer Server-Dateien wird offline vorgehalten.
const shell = files
  .filter((f) => !f.startsWith('api/') && !f.split('/').some((p) => p.startsWith('.')) && f !== 'sw.js')
  .sort();
const hash = createHash('sha256');
for (const f of shell) hash.update(f).update(readFileSync(join(src, f)));
const version = `sb-${hash.digest('hex').slice(0, 10)}`;

const swSource = readFileSync(join(src, 'sw.js'), 'utf8');
const sw = swSource
  .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
  .replace(/\/\/ <shell>[\s\S]*?\/\/ <\/shell>/, `// <shell>\nconst SHELL = ${JSON.stringify(['./', ...shell], null, 2)};\n// </shell>`);
writeFileSync(join(dist, 'sw.js'), sw);

// Hinweis, falls die Liste in public/sw.js (für die lokale Entwicklung) veraltet ist.
const devList = [...swSource.matchAll(/^\s+'([^']+)',?$/gm)].map((m) => m[1]).filter((f) => f !== './');
const missing = shell.filter((f) => !devList.includes(f));
const stale = devList.filter((f) => !shell.includes(f));
if (missing.length || stale.length) {
  console.warn('Hinweis: SHELL in public/sw.js weicht ab.', { fehlt: missing, veraltet: stale });
}

console.log(`dist/ erstellt: ${files.length} Dateien, Service-Worker-Version ${version}`);
if (!existsSync(join(src, 'api', 'vendor', 'autoload.php'))) {
  console.warn('⚠ public/api/vendor fehlt – die KI-Funktionen laufen erst nach „composer install“ (siehe README).');
}
if (!existsSync(join(src, 'api', 'config.php'))) {
  console.log('ℹ Keine public/api/config.php – die Konfiguration muss auf dem Server liegen (siehe README).');
}
