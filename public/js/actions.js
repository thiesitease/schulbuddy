// Aktionen, die von mehreren Ansichten genutzt werden.
import { update, logActivity } from './store.js';
import { todayISO } from './dates.js';

export const examLabel = (exam) => `${exam.subject} · ${exam.type || 'Klassenarbeit'}`;

export function completeSession(task) {
  update((s) => {
    if (s.completed[task.key]) return;
    s.completed[task.key] = { on: todayISO(), minutes: task.minutes };
    logActivity(s, 'minutes', task.minutes);
    logActivity(s, 'sessions', 1);
  });
}

export function uncompleteSession(key) {
  update((s) => {
    const c = s.completed[key];
    if (!c) return;
    delete s.completed[key];
    logActivity(s, 'minutes', -(c.minutes || 0), c.on);
    logActivity(s, 'sessions', -1, c.on);
  });
}

export function toggleHomework(id) {
  return update((s) => {
    const h = s.homework.find((x) => x.id === id);
    if (!h) return false;
    h.done = !h.done;
    h.doneOn = h.done ? todayISO() : null;
    return h.done;
  });
}

export function deleteExam(id) {
  // Erledigte Einheiten bleiben für die Statistik erhalten.
  update((s) => {
    s.exams = s.exams.filter((e) => e.id !== id);
  });
}

export function deleteHomework(id) {
  update((s) => {
    s.homework = s.homework.filter((h) => h.id !== id);
  });
}
