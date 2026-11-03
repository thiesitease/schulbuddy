// Erzeugt die App-Icons (SVG + PNG) aus einer Vorlage.
// PNGs werden per Headless-Chrome/Edge gerendert: node tools/make-icons.mjs
import { writeFileSync, mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'assets', 'icons');
mkdirSync(out, { recursive: true });

// Doktorhut auf Dunkelblau. scale/shift setzen den Inhalt in die sichere Zone.
function iconSVG({ rounded = true, scale = 1 } = {}) {
  const content = `<g transform="translate(32 32) scale(${scale}) translate(-32.5 -29)">
      <path d="M32 15 54 25 32 35 10 25z" fill="#fff"/>
      <path d="M20 30.5v9c0 4 24 4 24 0v-9L32 36z" fill="#fff"/>
      <path d="M52 26v11" stroke="#7fb0ff" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="52" cy="40" r="3" fill="#7fb0ff"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2a5b"/><stop offset="1" stop-color="#163d7a"/></linearGradient></defs>
  <rect width="64" height="64" rx="${rounded ? 14 : 0}" fill="url(#g)"/>
  ${content}
</svg>
`;
}

writeFileSync(join(out, 'favicon.svg'), iconSVG({ rounded: true, scale: 1 }));

const targets = [
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 },
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.86 },
];

const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const browser = browsers.find((p) => existsSync(p));
if (!browser) {
  console.error('Kein Chrome/Edge gefunden – nur favicon.svg wurde erzeugt.');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'sb-icons-'));
try {
  for (const t of targets) {
    const page = join(tmp, `${t.file}.html`);
    writeFileSync(page, `<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block;width:${t.size}px;height:${t.size}px}</style></head><body>${iconSVG(t)}</body></html>`);
    execFileSync(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--default-background-color=00000000',
      `--window-size=${t.size},${t.size}`,
      `--user-data-dir=${join(tmp, 'profile')}`,
      `--screenshot=${join(out, t.file)}`,
      pathToFileURL(page).href,
    ], { stdio: 'ignore' });
    console.log(`✓ ${t.file} (${t.size}×${t.size})`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
