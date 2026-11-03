// Datums-Helfer. Alle Tage werden als lokale ISO-Strings 'YYYY-MM-DD' gespeichert,
// damit Vergleiche per String funktionieren und keine Zeitzonen-Fehler entstehen.
import { t, getLang, locale } from './i18n.js';

const EN = getLang() === 'en';
export const WEEKDAYS = EN ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const WEEKDAYS_LONG = EN
  ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  : ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

export const pad = (n) => String(n).padStart(2, '0');

export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Anzahl Tage von a nach b (b - a). */
export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Wochentag mit Montag = 0 … Sonntag = 6. */
export function weekdayMon0(s) {
  return (parseISO(s).getDay() + 6) % 7;
}

export function startOfWeek(s) {
  return addDays(s, -weekdayMon0(s));
}

export function startOfMonth(s) {
  return `${s.slice(0, 8)}01`;
}

export function endOfMonth(s) {
  const d = parseISO(startOfMonth(s));
  d.setMonth(d.getMonth() + 1, 0);
  return toISO(d);
}

export function isValidISO(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(parseISO(s)) === s;
}

const fmtShort = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
const fmtLong = new Intl.DateTimeFormat(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDay = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'numeric' });

export function fmtDate(s, style = 'short') {
  const d = parseISO(s);
  if (style === 'long') return fmtLong.format(d);
  if (style === 'day') return fmtDay.format(d);
  return fmtShort.format(d);
}

/** „heute“, „morgen“, „in 5 Tagen“, „vor 2 Tagen“ … */
export function relDay(s, today) {
  const n = diffDays(today, s);
  if (n === 0) return t('heute');
  if (n === 1) return t('morgen');
  if (n === 2) return t('übermorgen');
  if (n === -1) return t('gestern');
  if (n > 0) return t('in {n} Tagen', { n });
  return t('vor {n} Tagen', { n: -n });
}

/** Tageskopf für Listen: „Heute“, „Morgen“ oder „Mi, 5. Nov.“ */
export function dayTitle(s, today) {
  const n = diffDays(today, s);
  if (n === 0) return t('Heute');
  if (n === 1) return t('Morgen');
  return fmtDate(s);
}
