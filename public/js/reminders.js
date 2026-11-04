// Erinnerungen: Benachrichtigungen über den Service Worker (Periodic Background Sync,
// vor allem Android/Chrome bei installierter App) und Kalender-Export als .ics.
import { addDays, todayISO } from './dates.js';
import { buildPlan } from './planner.js';
import { t, subjectName, examTypeName } from './i18n.js';

const DATA_CACHE = 'sb-data';
const REMINDER_URL = './__sb/reminders.json';
const SITE = 'schoolbuddy.hamburgrissen.de';

function examName(exam) {
  return `${subjectName(exam.subject)}: ${examTypeName(exam.type || 'Klassenarbeit')}${exam.title ? ` – ${exam.title}` : ''}`;
}

export function reminderItems(state, today = todayISO()) {
  const time = state.settings.reminderTime || '16:00';
  const items = [];
  const plan = buildPlan(state, today);
  for (let i = 0; i < 7; i++) {
    const d = addDays(today, i);
    const day = plan.days[d];
    if (!day?.sessions.length) continue;
    const subjects = [...new Set(day.sessions.map((s) => subjectName(state.exams.find((e) => e.id === s.examId)?.subject)))];
    const count = day.sessions.length === 1 ? t('1 Einheit') : t('{n} Einheiten', { n: day.sessions.length });
    items.push({
      id: `plan:${d}`,
      date: d,
      time,
      title: t('Zeit zum Lernen 📚'),
      body: t('{count} ({minutes} Min.): {subjects}', { count, minutes: day.used, subjects: subjects.join(', ') }),
    });
  }
  for (const e of state.exams) {
    if (e.date <= today) continue;
    items.push({
      id: `exam:${e.id}`,
      date: addDays(e.date, -1),
      time,
      title: t('Morgen: {exam}', { exam: examName(e) }),
      body: t('Mach die Generalprobe, pack deine Sachen und geh früh schlafen. Du schaffst das! 💪'),
    });
  }
  for (const h of state.homework) {
    if (h.done || h.due < today) continue;
    items.push({ id: `hw:${h.id}`, date: addDays(h.due, -1), time, title: t('Hausaufgabe bis morgen: {subject}', { subject: subjectName(h.subject) }), body: h.text });
  }
  return items.filter((item) => item.date >= today);
}

/** Legt die Erinnerungen für den Service Worker im Cache ab. */
export async function syncReminders(state) {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(DATA_CACHE);
    const body = JSON.stringify({ enabled: !!state.settings.reminders, items: reminderItems(state) });
    await cache.put(REMINDER_URL, new Response(body, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // Cache nicht verfügbar (z. B. privater Modus) – Erinnerungen bleiben dann aus.
  }
}

export function notificationsSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

/** Fragt die Erlaubnis an und registriert die Hintergrund-Prüfung, wo es geht. */
export async function enableNotifications() {
  if (!notificationsSupported()) return { permission: 'unsupported', background: false };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { permission, background: false };
  let background = false;
  try {
    const reg = await navigator.serviceWorker.ready;
    if ('periodicSync' in reg) {
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register('sb-reminders', { minInterval: 6 * 60 * 60 * 1000 });
        background = true;
      }
    }
  } catch {
    background = false;
  }
  return { permission, background };
}

export async function disableNotifications() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.periodicSync?.unregister('sb-reminders');
  } catch {
    // nichts zu tun
  }
}

export async function testNotification() {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('SchoolBuddy', {
    body: t('So sehen deine Erinnerungen aus. 👋'),
    icon: 'assets/icons/icon-192.png',
    tag: 'sb-test',
  });
}

// --- Kalender-Export (iCalendar) -----------------------------------------

const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (iso) => iso.replace(/-/g, '');

// Zeilen nach RFC 5545 auf 75 Byte falten.
function fold(line) {
  const enc = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > 74) {
      out += '\r\n ';
      bytes = 1;
    }
    out += ch;
    bytes += n;
  }
  return out;
}

/** Erinnerung zur gewählten Uhrzeit, relativ zum Tagesbeginn des Termins. */
function trigger(time, dayBefore) {
  const [h, m] = time.split(':').map(Number);
  const minutes = dayBefore ? 24 * 60 - (h * 60 + m) : h * 60 + m;
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${dayBefore ? '-' : ''}PT${hh}H${mm ? `${mm}M` : ''}`;
}

export function buildICS(state, { sessions = true } = {}) {
  const today = todayISO();
  const time = state.settings.reminderTime || '16:00';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SchoolBuddy//Lernplan//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:SchoolBuddy'];
  const event = (id, date, summary, description, alarm) => {
    lines.push('BEGIN:VEVENT', `UID:${id}@${SITE}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`, `SUMMARY:${icsText(summary)}`, 'TRANSP:TRANSPARENT');
    if (description) lines.push(`DESCRIPTION:${icsText(description)}`);
    if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, `TRIGGER:${alarm}`, 'END:VALARM');
    lines.push('END:VEVENT');
  };

  for (const e of state.exams.filter((x) => x.date >= today)) {
    const topics = (e.topics || []).map((topic) => `• ${topic.name}`).join('\n');
    event(`exam-${e.id}`, e.date, `📝 ${examName(e)}`, topics ? `${t('Themen:')}\n${topics}` : '', trigger(time, true));
  }
  for (const h of state.homework.filter((x) => !x.done && x.due >= today)) {
    event(`hw-${h.id}`, h.due, `✏️ ${subjectName(h.subject)}: ${h.text}`, '', trigger(time, true));
  }
  if (sessions) {
    const plan = buildPlan(state, today);
    for (const d of plan.order.slice(0, 21)) {
      const day = plan.days[d];
      if (!day.sessions.length) continue;
      const list = day.sessions.map((s) => {
        const exam = state.exams.find((e) => e.id === s.examId);
        return `• ${subjectName(exam?.subject)}: ${s.kind === 'final' ? t('Generalprobe') : s.topic} (${t('{n} Min.', { n: s.minutes })})`;
      });
      event(`plan-${d}`, d, `📚 ${t('Lernen ({n} Min.)', { n: day.used })}`,
        `${list.join('\n')}\n\n${t('Stand: {date}. Der aktuelle Plan steht in SchoolBuddy.', { date: today })}`, trigger(time, false));
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
