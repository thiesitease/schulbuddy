import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, examTasks, SLACK } from '../public/js/planner.js';
import { addDays, weekdayMon0 } from '../public/js/dates.js';

// 2026-11-02 ist ein Montag.
const MONDAY = '2026-11-02';

const settings = (overrides = {}) => ({
  sessionMinutes: 25,
  minutesByWeekday: [45, 45, 45, 45, 45, 45, 45],
  ...overrides,
});

const exam = (id, date, topics, extra = {}) => ({
  id,
  subject: 'Mathe',
  title: 'Klassenarbeit',
  date,
  difficulty: 2,
  createdOn: MONDAY,
  topics: topics.map((name, i) => ({ id: `t${i}`, name })),
  ...extra,
});

const allSessions = (plan) => plan.order.flatMap((d) => plan.days[d].sessions);

test('ohne Prüfungen gibt es keinen Plan', () => {
  const plan = buildPlan({ exams: [], settings: settings(), completed: {} }, MONDAY);
  assert.equal(plan.order.length, 0);
  assert.deepEqual(plan.warnings, []);
});

test('verteilt Themen, Wiederholungen und Generalprobe vor die Prüfung', () => {
  const e = exam('e1', addDays(MONDAY, 10), ['Brüche', 'Prozente', 'Dreisatz']);
  const plan = buildPlan({ exams: [e], settings: settings(), completed: {} }, MONDAY);
  const sessions = allSessions(plan);

  assert.equal(sessions.length, examTasks(e, settings()).length, 'alle Einheiten eingeplant');
  assert.ok(sessions.every((s) => s.date >= MONDAY && s.date < e.date), 'nur vor der Prüfung');

  const learnDays = sessions.filter((s) => s.kind === 'learn').map((s) => s.date);
  assert.equal(new Set(learnDays).size, 3, 'jedes Thema an einem eigenen Tag');

  for (const review of sessions.filter((s) => s.kind === 'review')) {
    const learn = sessions.find((s) => s.key === review.after);
    assert.ok(review.date > learn.date, 'Wiederholung nach dem Lernen');
  }

  const final = sessions.find((s) => s.kind === 'final');
  assert.equal(final.date, addDays(e.date, -1), 'Generalprobe am Tag vor der Prüfung');

  for (const d of plan.order) {
    assert.ok(plan.days[d].used <= plan.days[d].cap + SLACK, `Tag ${d} nicht überladen`);
  }
  assert.deepEqual(plan.warnings, []);
  assert.deepEqual(plan.progress.e1, { done: 0, total: 7, minutesLeft: 3 * 25 + 3 * 15 + 25, next: MONDAY });
});

test('freie Wochentage bleiben frei', () => {
  const s = settings({ minutesByWeekday: [45, 45, 45, 45, 45, 0, 0] });
  const e = exam('e1', addDays(MONDAY, 14), ['A', 'B', 'C', 'D']);
  const plan = buildPlan({ exams: [e], settings: s, completed: {} }, MONDAY);
  for (const session of allSessions(plan)) {
    assert.ok(weekdayMon0(session.date) < 5, `${session.date} ist kein Wochenende`);
  }
});

test('Prüfung morgen ohne Lernzeit: alles auf heute und eine Warnung', () => {
  const s = settings({ minutesByWeekday: [0, 0, 0, 0, 0, 0, 0] });
  const e = exam('e1', addDays(MONDAY, 1), ['A', 'B'], { createdOn: MONDAY });
  const plan = buildPlan({ exams: [e], settings: s, completed: {} }, MONDAY);
  const today = plan.days[MONDAY].sessions.map((x) => x.kind).sort();
  assert.deepEqual(today, ['final', 'learn', 'learn']);
  assert.deepEqual(plan.warnings.map((w) => w.type), ['noTime']);
});

test('eine erledigte Einheit zieht keine neue Einheit auf heute', () => {
  const e = exam('e1', addDays(MONDAY, 10), ['A', 'B', 'C']);
  const state = { exams: [e], settings: settings(), completed: {} };
  const before = buildPlan(state, MONDAY).days[MONDAY].sessions;
  assert.equal(before.length, 1);

  state.completed[before[0].key] = { on: MONDAY, minutes: before[0].minutes };
  const after = buildPlan(state, MONDAY).days[MONDAY].sessions;
  assert.equal(after.length, 0);
});

test('der Plan bleibt von Tag zu Tag stabil, wenn alles erledigt wird', () => {
  const e = exam('e1', addDays(MONDAY, 12), ['A', 'B', 'C', 'D', 'E']);
  const state = { exams: [e], settings: settings(), completed: {} };
  const original = buildPlan(state, MONDAY);

  for (let i = 0; i < 12; i++) {
    const day = addDays(MONDAY, i);
    const plan = buildPlan(state, day);
    const keys = plan.days[day].sessions.map((s) => s.key).sort();
    const expected = original.days[day].sessions.map((s) => s.key).sort();
    assert.deepEqual(keys, expected, `Tag ${i} wie ursprünglich geplant`);
    for (const s of plan.days[day].sessions) state.completed[s.key] = { on: day, minutes: s.minutes };
  }
  assert.equal(Object.keys(state.completed).length, examTasks(e, state.settings).length);
});

test('verpasste Einheiten werden neu eingeplant', () => {
  const e = exam('e1', addDays(MONDAY, 10), ['A', 'B', 'C']);
  const state = { exams: [e], settings: settings(), completed: {} };
  const missed = buildPlan(state, MONDAY).days[MONDAY].sessions[0];
  const nextDay = buildPlan(state, addDays(MONDAY, 1)).days[addDays(MONDAY, 1)].sessions;
  assert.ok(nextDay.some((s) => s.key === missed.key));
});

test('die nähere Prüfung hat Vorrang, die Kapazität wird eingehalten', () => {
  const s = settings({ minutesByWeekday: [30, 30, 30, 30, 30, 30, 30] });
  const near = exam('near', addDays(MONDAY, 4), ['A', 'B', 'C']);
  const far = exam('far', addDays(MONDAY, 12), ['X', 'Y', 'Z']);
  const plan = buildPlan({ exams: [far, near], settings: s, completed: {} }, MONDAY);

  assert.equal(plan.days[MONDAY].sessions[0].examId, 'near');
  const nearSessions = allSessions(plan).filter((x) => x.examId === 'near');
  assert.ok(nearSessions.every((x) => x.date < near.date));
  assert.equal(nearSessions.filter((x) => x.kind === 'learn').length, 3);
  assert.equal(nearSessions.filter((x) => x.kind === 'final').length, 1);
});

test('zu wenig Lernzeit für alle Wiederholungen ergibt einen Hinweis', () => {
  const s = settings({ minutesByWeekday: [35, 35, 35, 35, 35, 0, 0] });
  const e = exam('e1', addDays(MONDAY, 7), ['A', 'B', 'C', 'D'], { difficulty: 3 });
  const plan = buildPlan({ exams: [e], settings: s, completed: {} }, MONDAY);
  const warning = plan.warnings.find((w) => w.type === 'short');
  assert.ok(warning, 'Hinweis vorhanden');
  assert.equal(warning.dropped, examTasks(e, s).length - plan.progress.e1.total);
});

test('vergangene Prüfungen werden nicht geplant', () => {
  const e = exam('old', addDays(MONDAY, -3), ['A']);
  const plan = buildPlan({ exams: [e], settings: settings(), completed: {} }, MONDAY);
  assert.equal(plan.order.length, 0);
});
