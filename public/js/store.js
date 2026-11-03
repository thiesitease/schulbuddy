// Alle Daten bleiben auf dem Gerät (localStorage). Es gibt kein Konto und keinen Server-Speicher.
import { todayISO } from './dates.js';

const KEY = 'schulbuddy';
const VERSION = 1;

export const SUBJECTS = [
  'Mathe', 'Deutsch', 'Englisch', 'Französisch', 'Spanisch', 'Latein', 'Biologie', 'Chemie', 'Physik',
  'Geschichte', 'Erdkunde', 'Politik', 'Wirtschaft', 'Informatik', 'Religion', 'Ethik', 'Kunst', 'Musik', 'Sport',
];

export const EXAM_TYPES = ['Klassenarbeit', 'Test', 'Klausur', 'Vokabeltest', 'Referat', 'Mündliche Prüfung'];

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function defaults() {
  return {
    version: VERSION,
    profile: { name: '', grade: 8, subjects: ['Mathe', 'Deutsch', 'Englisch'], onboarded: false },
    settings: {
      // Lernminuten pro Wochentag, Montag zuerst.
      minutesByWeekday: [40, 40, 40, 40, 30, 0, 30],
      sessionMinutes: 25,
      reminders: false,
      reminderTime: '16:00',
      theme: 'auto',
    },
    exams: [],
    homework: [],
    // Erledigte Lerneinheiten: Schlüssel aus dem Planer -> { on: Datum, minutes }
    completed: {},
    decks: [],
    quizzes: [],
    goals: [],
    // Aktivität pro Tag: { minutes, sessions, cards, quizzes }
    activity: {},
    chat: [],
    meta: { deviceId: uid(), createdOn: todayISO(), aiConsent: false },
  };
}

function migrate(data) {
  const base = defaults();
  if (!data || typeof data !== 'object') return base;
  // Nachschlage-Tabellen müssen Objekte sein (ältere Server-Stände lieferten [] statt {}).
  for (const key of ['completed', 'activity']) {
    if (!data[key] || typeof data[key] !== 'object' || Array.isArray(data[key])) data[key] = Object.assign({}, data[key]);
  }
  return {
    ...base,
    ...data,
    version: VERSION,
    profile: { ...base.profile, ...data.profile },
    settings: { ...base.settings, ...data.settings },
    meta: { ...base.meta, ...data.meta },
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('SchoolBuddy: Daten konnten nicht geladen werden', err);
  }
  return defaults();
}

let state = load();
const errorListeners = new Set();
const changeListeners = new Set();

export const getState = () => state;

export function onSaveError(fn) {
  errorListeners.add(fn);
}

/** Wird nach jeder Änderung durch die App aufgerufen (z. B. für die Synchronisierung). */
export function onChange(fn) {
  changeListeners.add(fn);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    errorListeners.forEach((fn) => fn(err));
  }
}

/** Ändert den Zustand und speichert ihn sofort. silent: keine Änderungsmeldung (für Verwaltungsdaten). */
export function update(fn, { silent = false } = {}) {
  const result = fn(state);
  save();
  if (!silent) changeListeners.forEach((l) => l());
  return result;
}

/** Ersetzt den kompletten Zustand, z. B. durch den Stand aus dem Konto. */
export function replaceState(next) {
  state = migrate(next);
  save();
}

export function logActivity(s, field, amount, date = todayISO()) {
  const day = (s.activity[date] ||= { minutes: 0, sessions: 0, cards: 0, quizzes: 0 });
  day[field] = Math.max(0, (day[field] || 0) + amount);
}

export function exportJSON() {
  return JSON.stringify({ app: 'SchoolBuddy', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !['SchoolBuddy', 'SchulBuddy'].includes(data.app) || !Array.isArray(data.exams)) {
    throw new Error('Das ist keine SchoolBuddy-Sicherung.');
  }
  delete data.app;
  delete data.exportedAt;
  // Gerätebezogenes behalten: Kennung für das KI-Limit und die Konto-Verknüpfung.
  data.meta = { ...data.meta, deviceId: state.meta.deviceId, sync: state.meta.sync };
  state = migrate(data);
  save();
  changeListeners.forEach((l) => l());
}

export function resetAll() {
  state = defaults();
  save();
}
