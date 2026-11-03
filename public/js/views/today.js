// Startseite: was heute ansteht.
import { getState, update } from '../store.js';
import { buildPlan, findTask } from '../planner.js';
import { todayISO, fmtDate, addDays, dayTitle } from '../dates.js';
import { html, icon, ring, toast, formatMinutes, plural, bar } from '../ui.js';
import { sessionRow, examCard, homeworkRow, sectionHead, emptyState } from '../components.js';
import { openExamForm, openHomeworkForm } from '../forms.js';
import { openFocus } from '../focus.js';
import { completeSession, uncompleteSession, toggleHomework, examLabel } from '../actions.js';
import { dueCount } from '../srs.js';
import { streak, goalProgress, goalLabel } from '../stats.js';
import { canInstall, isIOS, isStandalone, promptInstall } from '../pwa.js';

function greeting(name) {
  const h = new Date().getHours();
  const hello = h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend';
  return name ? `${hello}, ${name}!` : `${hello}!`;
}

export function warningText(w, exam) {
  const label = `„${examLabel(exam)}“`;
  if (w.type === 'noTime') {
    return `Vor ${label} hast du keine Lernzeit eingeplant. SchoolBuddy hat ${dayTitle(w.date, todayISO())} trotzdem Einheiten vorgemerkt.`;
  }
  if (w.type === 'short') {
    return `Für ${label} reicht deine Lernzeit nicht für alle Wiederholungen (${w.dropped} ${w.dropped === 1 ? 'fehlt' : 'fehlen'}). Tippe hier, um mehr Lernzeit einzuplanen.`;
  }
  return `Für ${label} wird es knapp: ${dayTitle(w.date, todayISO())} ist sehr voll. Plane mehr Lernzeit ein oder fang früher an.`;
}

export default {
  render(root, ctx) {
    const s = getState();
    const today = todayISO();
    const plan = buildPlan(s, today);
    const examsById = new Map(s.exams.map((e) => [e.id, e]));
    const open = plan.days[today]?.sessions || [];
    const done = Object.entries(s.completed)
      .filter(([, c]) => c.on === today)
      .map(([key, c]) => ({ task: findTask(s, key), minutes: c.minutes }))
      .filter((x) => x.task);
    const doneMinutes = Object.values(s.completed).reduce((sum, c) => sum + (c.on === today ? c.minutes : 0), 0);
    const plannedMinutes = doneMinutes + open.reduce((sum, t) => sum + t.minutes, 0);
    const pct = plannedMinutes ? (doneMinutes / plannedMinutes) * 100 : 0;
    const examsToday = s.exams.filter((e) => e.date === today);
    const upcoming = s.exams.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date));
    const homework = s.homework
      .filter((h) => !h.done && h.due <= addDays(today, 2))
      .sort((a, b) => a.due.localeCompare(b.due));
    const nextDay = plan.order.find((d) => d > today && plan.days[d].sessions.length);
    const cardsDue = dueCount(s.decks, today);
    const days = streak(s.activity, today);
    const goals = s.goals.slice(0, 3).map((g) => ({ g, p: goalProgress(g, s, today) }));
    const showInstall = !isStandalone() && !s.meta.installDismissed && (canInstall() || isIOS());

    let status;
    if (open.length) status = `Heute ${open.length === 1 ? 'steht' : 'stehen'} ${plural(open.length, 'Lerneinheit', 'Lerneinheiten')} an (${formatMinutes(open.reduce((n, t) => n + t.minutes, 0))}).`;
    else if (done.length) status = 'Stark! Für heute hast du alles geschafft. 🎉';
    else if (upcoming.length) status = 'Heute ist lernfrei. Genieß den Tag!';
    else status = 'Trag deine nächste Prüfung ein, dann plant SchoolBuddy für dich.';

    root.innerHTML = String(html`
      <section class="hero">
        <div class="hero-text">
          <p class="hero-date">${fmtDate(today, 'long')}</p>
          <h1>${greeting(s.profile.name)}</h1>
          <p>${status}</p>
          ${days ? html`<span class="streak">${icon('flame')} ${plural(days, 'Tag', 'Tage')} in Folge</span>` : ''}
        </div>
        ${plannedMinutes ? html`<div class="hero-ring">${ring(pct, { size: 88, stroke: 8, label: `${doneMinutes} von ${plannedMinutes} Minuten` })}
          <span class="ring-label"><strong>${doneMinutes}</strong>/${plannedMinutes}<small>Min.</small></span></div>` : ''}
      </section>

      ${examsToday.map((e) => html`<div class="banner success">${icon('trophy')}<span>Heute: <strong>${examLabel(e)}</strong>. Viel Erfolg, du hast dich vorbereitet! 🍀</span></div>`)}
      ${plan.warnings.map((w) => html`<a class="banner warn" href="#/settings">${icon('alert')}<span>${warningText(w, examsById.get(w.examId))}</span></a>`)}

      ${showInstall ? html`<div class="card install">
        <div>${icon('download')}</div>
        <div class="grow"><strong>SchoolBuddy als App installieren</strong>
          <p class="muted small">${canInstall() ? 'Startet wie eine App und funktioniert auch offline.' : 'Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“.'}</p></div>
        <div class="col">${canInstall() ? html`<button type="button" class="btn primary sm" data-action="install">Installieren</button>` : ''}
          <button type="button" class="btn ghost sm" data-action="dismiss-install">Später</button></div>
      </div>` : ''}

      <section class="section">
        ${sectionHead('Heute lernen', upcoming.length ? html`<a class="link" href="#/plan">Ganzer Plan</a>` : '')}
        ${open.length || done.length
          ? html`<ul class="list">${done.map((d) => sessionRow(d.task, d.task.exam, today, { done: true }))}${open.map((t) => sessionRow(t, examsById.get(t.examId), today))}</ul>`
          : upcoming.length
            ? html`<p class="muted card soft">Heute ist nichts geplant.${nextDay ? ` Nächste Einheit: ${dayTitle(nextDay, today)}.` : ''}${cardsDue ? ' Wie wär’s mit ein paar Karteikarten?' : ''}</p>`
            : emptyState('calendar', 'Noch keine Prüfung eingetragen', 'Trag deine nächste Klassenarbeit ein. SchoolBuddy verteilt den Stoff automatisch auf die Tage davor.',
                html`<button type="button" class="btn primary" data-action="add-exam">${icon('plus')} Prüfung eintragen</button>`)}
      </section>

      ${cardsDue ? html`<a class="card action-card" href="#/learn/review/all">
        <span class="action-icon">${icon('cards')}</span>
        <span class="grow"><strong>${plural(cardsDue, 'Karteikarte wartet', 'Karteikarten warten')} auf dich</strong><span class="muted small">Ein paar Minuten Wiederholung wirken Wunder.</span></span>
        ${icon('right', 'chev')}</a>` : ''}

      ${upcoming.length ? html`<section class="section">
        ${sectionHead('Nächste Prüfungen', html`<a class="link" href="#/plan/exams">Alle</a>`)}
        <div class="stack-sm">${upcoming.slice(0, 3).map((e) => examCard(e, plan.progress[e.id], today))}</div>
      </section>` : ''}

      <section class="section">
        ${sectionHead('Hausaufgaben', html`<button type="button" class="link" data-action="add-hw">${icon('plus')} Neu</button>`)}
        ${homework.length
          ? html`<ul class="list">${homework.map((h) => homeworkRow(h, today))}</ul>`
          : html`<p class="muted card soft">Nichts fällig in den nächsten zwei Tagen. 👌</p>`}
      </section>

      ${goals.length ? html`<section class="section">
        ${sectionHead('Deine Ziele', html`<a class="link" href="#/progress">Alle</a>`)}
        <div class="card stack-sm">${goals.map(({ g, p }) => html`<div class="goal-mini">
          <span>${p.done ? '✅ ' : ''}${goalLabel(g)}</span><span class="muted small">${g.type === 'custom' ? (p.done ? 'erledigt' : 'offen') : `${p.value}/${p.target}`}</span>
          ${bar(p.pct, p.done ? 'success' : '')}</div>`)}</div>
      </section>` : ''}

      <section class="section">
        ${sectionHead('Schnellzugriff')}
        <div class="quick">
          <button type="button" data-action="add-exam">${icon('calendar')}<span>Prüfung</span></button>
          <button type="button" data-action="add-hw">${icon('pencil')}<span>Hausaufgabe</span></button>
          <a href="#/buddy">${icon('sparkles')}<span>Buddy fragen</span></a>
          <a href="#/buddy/scan">${icon('camera')}<span>Aufgabe scannen</span></a>
        </div>
      </section>
    `);

    root.onclick = async (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const { action, key, id } = a.dataset;
      if (action === 'toggle-session') {
        if (s.completed[key]) {
          uncompleteSession(key);
        } else {
          const task = open.find((t) => t.key === key) || findTask(s, key);
          completeSession(task);
          const left = open.filter((t) => t.key !== key).length;
          toast(left ? 'Erledigt ✓' : 'Alles geschafft für heute! 🎉', { action: 'Rückgängig', onAction: () => { uncompleteSession(key); ctx.refresh(); } });
        }
        ctx.refresh();
      } else if (action === 'focus') {
        const task = open.find((t) => t.key === key);
        if (task) openFocus(task, examsById.get(task.examId), () => { toast('Einheit erledigt ✓'); ctx.refresh(); });
      } else if (action === 'add-exam') openExamForm(null, ctx.refresh);
      else if (action === 'edit-exam') openExamForm(examsById.get(id), ctx.refresh);
      else if (action === 'add-hw') openHomeworkForm(null, ctx.refresh);
      else if (action === 'edit-hw') openHomeworkForm(s.homework.find((h) => h.id === id), ctx.refresh);
      else if (action === 'toggle-hw') {
        if (toggleHomework(id)) toast('Hausaufgabe erledigt ✓');
        ctx.refresh();
      } else if (action === 'install') {
        await promptInstall();
        ctx.refresh();
      } else if (action === 'dismiss-install') {
        update((st) => { st.meta.installDismissed = true; });
        ctx.refresh();
      }
    };
  },
};
