// Sprache der App: Deutsch oder Englisch. Die deutschen Texte stehen direkt im Code und sind
// zugleich die Schlüssel für die englischen Übersetzungen in i18n/en.js. Die Wahl gilt pro Gerät.
// Beim Umschalten lädt die App neu, damit alle Texte in der neuen Sprache entstehen.
import EN, { SUBJECTS_EN, EXAM_TYPES_EN } from './i18n/en.js';

const KEY = 'schulbuddy-lang';
export const LANGS = { de: 'Deutsch', en: 'English' };

function detect() {
  if (typeof document === 'undefined') return 'de'; // Node-Tests
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in LANGS) return saved;
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus)
  }
  const preferred = String(navigator.languages?.[0] || navigator.language || 'de').toLowerCase();
  return preferred.startsWith('de') ? 'de' : 'en';
}

const lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;

/** Gebietsschema für Datums- und Zahlenformate. */
export const locale = () => (lang === 'en' ? 'en-GB' : 'de-DE');

export function setLang(next) {
  if (!(next in LANGS) || next === lang) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return;
  }
  location.reload();
}

/** Übersetzt einen deutschen Text. Platzhalter wie {n} werden durch vars.n ersetzt. */
export function t(text, vars) {
  const out = lang === 'en' ? (EN[text] ?? text) : text;
  return vars ? out.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : out;
}

/** Anzeigename eines Fachs. Gespeichert bleibt der deutsche Name, eigene Fächer bleiben, wie sie sind. */
export const subjectName = (subject) => (lang === 'en' && SUBJECTS_EN[subject]) || subject;

export const examTypeName = (type) => (lang === 'en' && EXAM_TYPES_EN[type]) || type;

export const privacyUrl = () => (lang === 'en' ? 'privacy.html' : 'datenschutz.html');
export const imprintUrl = () => (lang === 'en' ? 'legal-notice.html' : 'impressum.html');
