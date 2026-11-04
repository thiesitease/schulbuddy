// Auswertungen für Fortschritt, Ziele und Wissenslücken. Reine Funktionen.
import { addDays, startOfWeek, startOfMonth, endOfMonth } from './dates.js';
import { findTask } from './planner.js';
import { t } from './i18n.js';

export const GOAL_TYPES = {
  minutes: { label: t('Lernminuten'), unit: t('Min.') },
  sessions: { label: t('Lerneinheiten'), unit: t('Einheiten') },
  cards: { label: t('Karteikarten wiederholen'), unit: t('Karten') },
  quizzes: { label: t('Quizze machen'), unit: t('Quizze') },
  custom: { label: t('Eigenes Ziel'), unit: '' },
};

export const goalLabel = (g) =>
  g.type === 'custom' ? g.label : `${g.target} ${GOAL_TYPES[g.type].unit} ${g.period === 'month' ? t('im Monat') : t('pro Woche')}`;

const isActive = (a) => !!a && (a.minutes > 0 || a.sessions > 0 || a.cards > 0 || a.quizzes > 0);

/** Tage in Folge mit Lernaktivität. Heute zählt mit, darf aber noch fehlen. */
export function streak(activity, today) {
  let d = isActive(activity[today]) ? today : addDays(today, -1);
  let n = 0;
  while (isActive(activity[d])) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function sumRange(activity, from, to, field) {
  let sum = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) sum += activity[d]?.[field] || 0;
  return sum;
}

export function periodRange(period, today) {
  if (period === 'month') return [startOfMonth(today), endOfMonth(today)];
  const from = startOfWeek(today);
  return [from, addDays(from, 6)];
}

export function goalProgress(goal, state, today) {
  const [from, to] = periodRange(goal.period, today);
  if (goal.type === 'custom') {
    const done = (goal.checked || []).includes(from);
    return { value: done ? 1 : 0, target: 1, pct: done ? 100 : 0, done, from, to };
  }
  const value = sumRange(state.activity, from, to, goal.type);
  const target = Math.max(1, goal.target || 1);
  return { value, target, pct: Math.min(100, Math.round((value / target) * 100)), done: value >= target, from, to };
}

/** Quiz-Ergebnisse je Fach und Thema; schwache Themen zuerst. */
export function topicScores(quizzes) {
  const map = new Map();
  for (const q of quizzes) {
    const key = `${q.subject}\u0000${q.topic}`;
    const e = map.get(key) || { subject: q.subject, topic: q.topic, right: 0, total: 0, count: 0, last: q.date };
    e.right += q.score;
    e.total += q.total;
    e.count++;
    if (q.date > e.last) e.last = q.date;
    map.set(key, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, pct: e.total ? Math.round((e.right / e.total) * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct);
}

/** Wissenslücken: Quiz-Themen unter 70 % und Karteikarten, die oft vergessen wurden. */
export function knowledgeGaps(state) {
  const topics = topicScores(state.quizzes).filter((t) => t.pct < 70);
  const cards = state.decks
    .map((d) => ({ deck: d, hard: d.cards.filter((c) => (c.lapses || 0) >= 2 && c.box <= 2) }))
    .filter((x) => x.hard.length);
  return { topics, cards };
}

/** Gelernte Minuten je Fach aus den erledigten Lerneinheiten. */
export function minutesBySubject(state) {
  const out = {};
  for (const [key, c] of Object.entries(state.completed)) {
    // Ohne Prüfung (gelöscht) unter einem festen Schlüssel sammeln; die Anzeige übersetzt ihn.
    const subject = findTask(state, key)?.exam.subject || 'Sonstiges';
    out[subject] = (out[subject] || 0) + (c.minutes || 0);
  }
  return out;
}
