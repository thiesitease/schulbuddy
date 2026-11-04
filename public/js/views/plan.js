// Planer: Lernplan, Prüfungen und Hausaufgaben.
import { getState } from '../store.js';
import { buildPlan, findTask } from '../planner.js';
import { todayISO, dayTitle, fmtDate, diffDays } from '../dates.js';
import { html, icon, toast, downloadFile, subjectColor } from '../ui.js';
import { sessionRow, examCard, homeworkRow, emptyState, tabs, pageHead, sectionHead } from '../components.js';
import { openExamForm, openHomeworkForm } from '../forms.js';
import { openFocus } from '../focus.js';
import { completeSession, uncompleteSession, toggleHomework, examLabel } from '../actions.js';
import { buildICS } from '../reminders.js';
import { warningText } from './today.js';
import { t } from '../i18n.js';

const TABS = [
  { id: 'plan', label: t('Lernplan'), href: '#/plan' },
  { id: 'exams', label: t('Prüfungen'), href: '#/plan/exams' },
  { id: 'homework', label: t('Hausaufgaben'), href: '#/plan/homework' },
];

export default {
  render(root, ctx) {
    const s = getState();
    const today = todayISO();
    const tab = ctx.params[0] || 'plan';
    const plan = buildPlan(s, today);
    const examsById = new Map(s.exams.map((e) => [e.id, e]));

    const addButton = tab === 'homework'
      ? html`<button type="button" class="btn primary sm" data-action="add-hw">${icon('plus')} ${t('Hausaufgabe')}</button>`
      : html`<button type="button" class="btn primary sm" data-action="add-exam">${icon('plus')} ${t('Prüfung')}</button>`;

    let body;
    if (tab === 'exams') body = examsTab(s, plan, today);
    else if (tab === 'homework') body = homeworkTab(s, today);
    else body = planTab(s, plan, today, examsById);

    root.innerHTML = String(html`${pageHead(t('Planer'), '', addButton)}${tabs(TABS, tab)}${body}`);

    root.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const { action, key, id } = a.dataset;
      if (action === 'add-exam') openExamForm(null, ctx.refresh);
      else if (action === 'edit-exam') openExamForm(examsById.get(id), ctx.refresh);
      else if (action === 'add-hw') openHomeworkForm(null, ctx.refresh);
      else if (action === 'edit-hw') openHomeworkForm(s.homework.find((h) => h.id === id), ctx.refresh);
      else if (action === 'toggle-hw') {
        if (toggleHomework(id)) toast(t('Hausaufgabe erledigt ✓'));
        ctx.refresh();
      } else if (action === 'toggle-session') {
        if (s.completed[key]) uncompleteSession(key);
        else {
          completeSession(findSession(plan, key) || findTask(s, key));
          toast(t('Erledigt ✓'), { action: t('Rückgängig'), onAction: () => { uncompleteSession(key); ctx.refresh(); } });
        }
        ctx.refresh();
      } else if (action === 'focus') {
        const task = findSession(plan, key);
        if (task) openFocus(task, examsById.get(task.examId), () => { toast(t('Einheit erledigt ✓')); ctx.refresh(); });
      } else if (action === 'export-ics') {
        downloadFile(`schoolbuddy-${today}.ics`, buildICS(s), 'text/calendar;charset=utf-8');
        toast(t('Kalenderdatei erstellt. Öffne sie, um die Termine zu übernehmen.'));
      }
    };
  },
};

function findSession(plan, key) {
  for (const d of plan.order) {
    const task = plan.days[d].sessions.find((x) => x.key === key);
    if (task) return task;
  }
  return null;
}

function planTab(s, plan, today, examsById) {
  const upcoming = s.exams.filter((e) => e.date >= today);
  if (!upcoming.length) {
    return emptyState('calendar', t('Dein Lernplan ist noch leer'),
      t('Trag eine Klassenarbeit mit ihren Themen ein. SchoolBuddy erstellt daraus automatisch einen Plan mit Lernen, Wiederholen und Generalprobe.'),
      html`<button type="button" class="btn primary" data-action="add-exam">${icon('plus')} ${t('Erste Prüfung eintragen')}</button>`);
  }
  const examDays = new Map();
  for (const e of upcoming) examDays.set(e.date, [...(examDays.get(e.date) || []), e]);
  const doneToday = Object.entries(s.completed).filter(([, c]) => c.on === today).map(([key]) => findTask(s, key)).filter(Boolean);
  const dates = [...new Set([
    ...(doneToday.length ? [today] : []),
    ...plan.order.filter((d) => plan.days[d].sessions.length),
    ...examDays.keys(),
  ])].sort().slice(0, 40);

  return html`
    <p class="muted small info-line">${icon('refresh')} ${t('Dein Plan passt sich automatisch an. Was du verpasst, wird neu verteilt.')}</p>
    ${plan.warnings.map((w) => html`<a class="banner warn" href="#/settings">${icon('alert')}<span>${warningText(w, examsById.get(w.examId))}</span></a>`)}
    <div class="timeline">${dates.map((d) => {
      const day = plan.days[d];
      const isToday = d === today;
      const done = isToday ? doneToday : [];
      // Bei „Heute“ und „Morgen“ zusätzlich das Datum zeigen.
      const near = diffDays(today, d) >= 0 && diffDays(today, d) <= 1;
      return html`<section class="day ${isToday ? 'is-today' : ''}">
        <header class="day-head"><h3>${dayTitle(d, today)}${near ? html` <span class="muted">${fmtDate(d)}</span>` : ''}</h3>
          ${day?.sessions.length || done.length ? html`<span class="badge ${day?.overload ? 'warn' : ''}">${t('{n} Min.', { n: (day?.used || 0) + done.reduce((n, x) => n + x.minutes, 0) })}${day?.overload ? ` · ${t('sehr voll')}` : ''}</span>` : ''}</header>
        ${(examDays.get(d) || []).map((e) => html`<button type="button" class="exam-marker" data-action="edit-exam" data-id="${e.id}" style="--c:${subjectColor(e.subject)}">${icon('trophy')} ${examLabel(e)}${e.title ? ` – ${e.title}` : ''}</button>`)}
        ${day?.sessions.length || done.length ? html`<ul class="list">${done.map((x) => sessionRow(x, x.exam, today, { done: true }))}${(day?.sessions || []).map((x) => sessionRow(x, examsById.get(x.examId), today))}</ul>` : ''}
      </section>`;
    })}</div>
    <div class="card soft row between wrap">
      <span class="small">${icon('bell')} ${t('Termine in deinen Handy-Kalender übernehmen – mit Erinnerung.')}</span>
      <button type="button" class="btn ghost sm" data-action="export-ics">${icon('download')} ${t('Kalender-Export')}</button>
    </div>`;
}

function examsTab(s, plan, today) {
  const upcoming = s.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = s.exams.filter((e) => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
  return html`
    ${upcoming.length
      ? html`<div class="stack-sm">${upcoming.map((e) => examCard(e, plan.progress[e.id], today))}</div>`
      : emptyState('trophy', t('Keine anstehenden Prüfungen'), t('Sobald du eine Klassenarbeit oder einen Test einträgst, erscheint er hier mit Countdown und Fortschritt.'),
          html`<button type="button" class="btn primary" data-action="add-exam">${icon('plus')} ${t('Prüfung eintragen')}</button>`)}
    ${past.length ? html`<section class="section">${sectionHead(t('Vergangene Prüfungen'))}
      <p class="muted small">${t('Tippe eine Prüfung an, um deine Note einzutragen.')}</p>
      <div class="stack-sm">${past.slice(0, 20).map((e) => examCard(e, null, today))}</div></section>` : ''}
    <div class="card soft row between wrap">
      <span class="small">${icon('bell')} ${t('Alle Prüfungen in den Kalender übernehmen.')}</span>
      <button type="button" class="btn ghost sm" data-action="export-ics">${icon('download')} ${t('Kalender-Export')}</button>
    </div>`;
}

function homeworkTab(s, today) {
  const open = s.homework.filter((h) => !h.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = s.homework.filter((h) => h.done).sort((a, b) => (b.doneOn || '').localeCompare(a.doneOn || '')).slice(0, 15);
  return html`
    ${open.length
      ? html`<ul class="list">${open.map((h) => homeworkRow(h, today))}</ul>`
      : emptyState('pencil', t('Keine offenen Hausaufgaben'), t('Trag Hausaufgaben mit Fälligkeitsdatum ein. SchoolBuddy erinnert dich am Vortag.'),
          html`<button type="button" class="btn primary" data-action="add-hw">${icon('plus')} ${t('Hausaufgabe eintragen')}</button>`)}
    ${done.length ? html`<section class="section">${sectionHead(t('Erledigt'))}<ul class="list">${done.map((h) => homeworkRow(h, today))}</ul></section>` : ''}`;
}
