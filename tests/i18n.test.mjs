// Prüft die englische Übersetzung: Jeder deutsche Text, der im Code über t('…') oder
// plural(n, '…', '…') läuft, hat einen Eintrag in public/js/i18n/en.js, die Platzhalter
// stimmen überein, und es gibt keine verwaisten Einträge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import EN, { SUBJECTS_EN, EXAM_TYPES_EN } from '../public/js/i18n/en.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'public', 'js');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const files = walk(jsDir).filter((f) => !f.endsWith(join('i18n', 'en.js')));
const sources = files.map((f) => ({ file: relative(root, f).replace(/\\/g, '/'), src: readFileSync(f, 'utf8') }));

const unescape = (s) => s.replace(/\\(.)/g, (m, c) => (c === 'n' ? '\n' : c));
const STR = "'((?:[^'\\\\]|\\\\.)*)'";
const T_CALL = new RegExp(`\\bt\\(\\s*${STR}`, 'g');
const PLURAL_CALL = new RegExp(`\\bplural\\([^,()]+(?:\\([^()]*\\))?[^,()]*,\\s*${STR},\\s*${STR}\\)`, 'g');

const used = new Map();
for (const { file, src } of sources) {
  for (const m of src.matchAll(T_CALL)) used.set(unescape(m[1]), file);
  for (const m of src.matchAll(PLURAL_CALL)) {
    used.set(unescape(m[1]), file);
    used.set(unescape(m[2]), file);
  }
}

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('jeder Text im Code hat eine englische Übersetzung', () => {
  const missing = [...used].filter(([key]) => !(key in EN)).map(([key, file]) => `${file}: ${JSON.stringify(key)}`);
  assert.deepEqual(missing, []);
});

test('keine verwaisten Übersetzungen', () => {
  const orphans = Object.keys(EN).filter((key) => !used.has(key));
  assert.deepEqual(orphans, []);
});

test('Platzhalter stimmen überein', () => {
  const wrong = Object.entries(EN)
    .filter(([de, en]) => placeholders(de).join() !== placeholders(en).join())
    .map(([de]) => de);
  assert.deepEqual(wrong, []);
});

test('t() nur mit einfachen Anführungszeichen, damit diese Prüfung alle Texte findet', () => {
  const bad = sources.filter(({ src }) => /\bt\(\s*[`"]/.test(src)).map(({ file }) => file);
  assert.deepEqual(bad, []);
});

test('alle Fächer und Prüfungsarten sind übersetzt', () => {
  const store = readFileSync(join(jsDir, 'store.js'), 'utf8');
  const list = (name) => [...store.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(list('SUBJECTS').filter((s) => !SUBJECTS_EN[s]), []);
  assert.deepEqual(list('EXAM_TYPES').filter((s) => !EXAM_TYPES_EN[s]), []);
});
