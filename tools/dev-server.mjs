// Lokaler Entwicklungsserver: liefert public/ aus und beantwortet api/ai.php mit Testdaten,
// damit sich die KI-Oberfläche ohne PHP und ohne API-Schlüssel ausprobieren lässt.
// Aufruf: node tools/dev-server.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.argv[2]) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const MOCK = {
  chat: () => ({ text: '**Testantwort vom Entwicklungsserver**\n\nDer Satz des Pythagoras gilt in rechtwinkligen Dreiecken:\n\n- a² + b² = c²\n- c ist die Hypotenuse, also die längste Seite\n\n1. Quadriere beide Katheten\n2. Addiere sie\n3. Zieh die Wurzel: c = √(a² + b²)\n\n| a | b | c |\n|---|---|---|\n| 3 | 4 | 5 |\n\nWillst du eine Übungsaufgabe probieren?' }),
  quiz: (body) => ({
    questions: [
      { question: `Testfrage 1 zu „${body.topic}“: Was ist 3² + 4²?`, options: ['7', '25', '12', '49'], correct: 1, explanation: '9 + 16 = 25.' },
      { question: 'Testfrage 2: Welche Seite ist die Hypotenuse?', options: ['Die kürzeste', 'Die längste', 'Jede Kathete', 'Keine'], correct: 1, explanation: 'Die Hypotenuse liegt gegenüber dem rechten Winkel und ist die längste Seite.' },
      { question: 'Testfrage 3: √49 = ?', options: ['6', '7', '8', '9'], correct: 1, explanation: '7 · 7 = 49.' },
    ],
  }),
  cards: () => ({ cards: [
    { front: 'Was ist eine Zelle?', back: 'Die kleinste lebende Einheit aller Lebewesen.' },
    { front: 'Zellkern', back: 'Enthält die Erbinformation (DNA) und steuert die Zelle.' },
    { front: 'Mitochondrien', back: 'Die „Kraftwerke“ der Zelle: Sie gewinnen Energie.' },
  ] }),
  scan: (body) => ({ text: `**Testantwort (${body.mode === 'explain' ? 'Lösungsweg' : 'Tipps'})**\n\n1. **Was ist gefragt?** Die Länge der Hypotenuse.\n2. **Was muss ich wissen?** a² + b² = c²\n3. **Tipps:** Setze die Werte ein und rechne Schritt für Schritt.` }),
};

let used = 0;

async function handleApi(req, res) {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET') return send(200, { ok: true, enabled: true, limit: 25, remaining: 25 - used });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  const mock = MOCK[body.task];
  if (!mock) return send(400, { ok: false, error: 'Ungültige Anfrage.' });
  await new Promise((r) => setTimeout(r, 600));
  used++;
  send(200, { ok: true, ...mock(body), remaining: 25 - used });
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/ai.php') return handleApi(req, res);
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (!path || path.endsWith('/') || path.endsWith('\\')) path = join(path, 'index.html');
  const file = join(root, path);
  if (!file.startsWith(root) || path.startsWith('api')) {
    res.writeHead(404).end();
    return;
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('not a file');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('Nicht gefunden');
  }
}).listen(port, '127.0.0.1', () => console.log(`SchulBuddy-Entwicklungsserver: http://localhost:${port} (KI = Testdaten)`));
