// Smart Study Planner: erzeugt aus Prüfungsterminen einen Lernplan.
//
// Reine Funktionen ohne DOM, damit sie in Node getestet werden können.
// Der Plan wird nicht gespeichert, sondern bei jedem Aufruf aus den Prüfungen,
// den Lernzeiten und den erledigten Einheiten neu berechnet. Verpasste Einheiten
// rutschen dadurch automatisch auf die nächsten freien Tage.
//
// Pro Thema gibt es eine Lerneinheit und eine Wiederholung mit Abstand
// (Spaced Repetition), am letzten Lerntag vor der Prüfung eine Generalprobe.

import { addDays, diffDays, weekdayMon0 } from './dates.js';
import { t } from './i18n.js';

export const KIND_LABEL = { learn: t('Lernen'), review: t('Wiederholen'), final: t('Generalprobe') };

const DIFFICULTY_FACTOR = { 1: 0.8, 2: 1, 3: 1.4 };
// So viele Minuten darf ein Tag überzogen werden, bevor eine Einheit auf später rutscht.
export const SLACK = 10;
// Anteil der Lerntage, auf den der neue Stoff verteilt wird. Der Rest bleibt für Wiederholungen.
const LEARN_SHARE = 0.7;

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export function topicsFor(exam) {
  if (exam.topics?.length) return exam.topics;
  const n = { 1: 2, 2: 3, 3: 4 }[exam.difficulty] ?? 3;
  return Array.from({ length: n }, (_, i) => ({ id: `teil${i + 1}`, name: t('Stoff Teil {n}', { n: i + 1 }) }));
}

export function examTasks(exam, settings) {
  const base = settings.sessionMinutes || 25;
  const learn = round5(base * (DIFFICULTY_FACTOR[exam.difficulty] ?? 1));
  const review = round5(learn * 0.6);
  const tasks = [];
  for (const topic of topicsFor(exam)) {
    const learnKey = `${exam.id}:learn:${topic.id}`;
    tasks.push({ key: learnKey, examId: exam.id, kind: 'learn', topic: topic.name, minutes: learn });
    tasks.push({ key: `${exam.id}:review:${topic.id}`, examId: exam.id, kind: 'review', topic: topic.name, minutes: review, after: learnKey });
  }
  tasks.push({ key: `${exam.id}:final`, examId: exam.id, kind: 'final', topic: t('Alle Themen'), minutes: round5(Math.max(20, base)) });
  return tasks;
}

/** Sucht eine Einheit anhand ihres Schlüssels (z. B. für erledigte Einheiten). */
export function findTask(state, key) {
  const exam = state.exams.find((e) => key.startsWith(`${e.id}:`));
  if (!exam) return null;
  const task = examTasks(exam, state.settings).find((t) => t.key === key);
  return task ? { ...task, exam } : null;
}

/**
 * @returns {{
 *   today: string,
 *   order: string[],
 *   days: Record<string, {date: string, cap: number, used: number, overload: boolean, sessions: object[]}>,
 *   warnings: {type: 'noTime'|'tight'|'short', examId: string, date: string, dropped?: number}[],
 *   progress: Record<string, {done: number, total: number, minutesLeft: number, next: string|null}>
 * }}
 */
export function buildPlan(state, today) {
  const { exams = [], settings, completed = {} } = state;
  const capOf = (d) => Math.max(0, Number(settings.minutesByWeekday?.[weekdayMon0(d)]) || 0);
  const doneTodayMinutes = Object.values(completed)
    .reduce((sum, c) => sum + (c.on === today ? c.minutes || 0 : 0), 0);

  const upcoming = exams
    .filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdOn || '').localeCompare(b.createdOn || ''));
  const plan = { today, order: [], days: {}, warnings: [], progress: {} };
  if (!upcoming.length) return plan;

  const lastDay = addDays(upcoming[upcoming.length - 1].date, -1);
  for (let d = today; d <= lastDay; d = addDays(d, 1)) {
    const cap = d === today ? Math.max(0, capOf(d) - doneTodayMinutes) : capOf(d);
    plan.days[d] = { date: d, cap, used: 0, overload: false, sessions: [] };
    plan.order.push(d);
  }

  // Lerntag jeder Lerneinheit: erledigt (aus dem Verlauf) oder neu eingeplant.
  const learnDay = {};
  for (const [key, c] of Object.entries(completed)) learnDay[key] = c.on;

  const infos = upcoming.map((exam) => {
    // Die Zeitachse beginnt beim Anlegen der Prüfung. So bleibt die Verteilung stabil,
    // auch wenn der Plan jeden Tag neu berechnet wird.
    const start = exam.createdOn && exam.createdOn < today ? exam.createdOn : today;
    const timeline = [];
    for (let d = start; d < exam.date; d = addDays(d, 1)) if (capOf(d) > 0) timeline.push(d);
    let study = timeline.filter((d) => d >= today);
    const noTime = study.length === 0;
    if (noTime) study = [addDays(exam.date, -1)];
    const learnWindow = timeline.length >= 3 ? Math.ceil(timeline.length * LEARN_SHARE) : timeline.length;
    const tasks = examTasks(exam, settings);
    const open = tasks.filter((t) => !completed[t.key]).map((t) => ({ ...t }));
    return {
      exam,
      tasks,
      timeline,
      study,
      studySet: new Set(study),
      lastStudy: study[study.length - 1],
      learnEnd: timeline[learnWindow - 1] ?? '',
      gap: timeline.length >= 7 ? 2 : 1,
      noTime,
      totalLearns: tasks.filter((t) => t.kind === 'learn').length,
      learned: tasks.filter((t) => t.kind === 'learn' && completed[t.key]).length,
      learns: open.filter((t) => t.kind === 'learn'),
      reviews: open.filter((t) => t.kind === 'review'),
      final: open.find((t) => t.kind === 'final') ?? null,
    };
  });

  for (const d of plan.order) {
    const day = plan.days[d];
    const active = infos.filter((x) => x.studySet.has(d));
    if (!active.length) continue;
    const fits = (minutes) => day.used + minutes <= day.cap + SLACK;
    const add = (task) => {
      task.date = d;
      day.sessions.push(task);
      day.used += task.minutes;
      if (task.kind === 'learn') learnDay[task.key] = d;
    };

    // 1. Generalprobe am letzten Lerntag vor der Prüfung, auch wenn der Tag voll ist.
    for (const x of active) if (x.final && !x.final.date && x.lastStudy === d) add(x.final);

    // 2. Neuer Stoff, gleichmäßig über das Lernfenster verteilt. Die nächste Prüfung zuerst.
    for (const x of active) {
      const rest = x.learns.filter((t) => !t.date);
      if (!rest.length) continue;
      const isLast = x.lastStudy === d;
      const daysLeft = (until) => x.study.filter((s) => s >= d && s <= until).length;
      let quota;
      if (isLast) {
        quota = rest.length;
      } else if (d <= x.learnEnd) {
        const index = x.timeline.indexOf(d);
        const windowSize = x.timeline.indexOf(x.learnEnd) + 1;
        const target = Math.ceil((x.totalLearns * (index + 1)) / windowSize);
        quota = Math.min(target - x.learned, Math.ceil(rest.length / daysLeft(x.learnEnd)));
      } else {
        quota = Math.ceil(rest.length / daysLeft(x.lastStudy));
      }
      for (const t of rest) {
        if (quota <= 0) break;
        if (!isLast && !fits(t.minutes)) break;
        add(t);
        x.learned++;
        quota--;
      }
    }

    // 3. Wiederholungen mit Abstand zum Lerntag, solange Zeit ist.
    const due = active
      .flatMap((x) => x.reviews.filter((r) => !r.date && learnDay[r.after] && diffDays(learnDay[r.after], d) >= x.gap))
      .sort((a, b) => learnDay[a.after].localeCompare(learnDay[b.after]));
    for (const r of due) if (fits(r.minutes)) add(r);

    day.overload = day.used > day.cap + SLACK;
  }

  for (const x of infos) {
    const scheduled = [...x.learns, ...x.reviews, x.final].filter((t) => t?.date);
    const done = x.tasks.filter((t) => completed[t.key]).length;
    plan.progress[x.exam.id] = {
      done,
      total: done + scheduled.length,
      minutesLeft: scheduled.reduce((sum, t) => sum + t.minutes, 0),
      next: scheduled.map((t) => t.date).sort()[0] ?? null,
    };
    const dropped = x.reviews.filter((r) => !r.date).length;
    if (x.noTime) {
      plan.warnings.push({ type: 'noTime', examId: x.exam.id, date: x.lastStudy });
    } else if (plan.days[x.lastStudy]?.overload && x.learns.some((t) => t.date === x.lastStudy)) {
      plan.warnings.push({ type: 'tight', examId: x.exam.id, date: x.lastStudy });
    } else if (dropped && x.study.length >= 3) {
      // Die Lernzeit reicht nicht für alle Wiederholungen.
      plan.warnings.push({ type: 'short', examId: x.exam.id, date: x.lastStudy, dropped });
    }
  }
  return plan;
}
