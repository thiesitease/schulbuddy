// Startseite: was heute ansteht.
import { getState, update } from '../store.js';
import { buildPlan, findTask } from '../planner.js';
import { todayISO, fmtDate, addDays, dayTitle, diffDays } from '../dates.js';
import { html, icon, ring, toast, formatMinutes, plural, bar } from '../ui.js';
import { sessionRow, examCard, homeworkRow, sectionHead, emptyState } from '../components.js';
import { openExamForm, openHomeworkForm } from '../forms.js';
import { openFocus } from '../focus.js';
import { completeSession, uncompleteSession, toggleHomework, examLabel } from '../actions.js';
import { dueCount } from '../srs.js';
import { streak, goalProgress, goalLabel } from '../stats.js';
import { canInstall, isIOS, isStandalone, promptInstall } from '../pwa.js';
import { t } from '../i18n.js';

function greeting(name) {
  const h = new Date().getHours();
  const hello = h < 11 ? t('Guten Morgen') : h < 18 ? t('Hallo') : t('Guten Abend');
  return name ? `${hello}, ${name}!` : `${hello}!`;
}

/** „heute“, „morgen“ oder „am Mi., 5. Nov.“ – für die Mitte eines Satzes. */
function dayPhrase(date, today) {
  const n = diffDays(today, date);
  if (n === 0) return t('heute');
  if (n === 1) return t('morgen');
  return t('am {date}', { date: fmtDate(date) });
}

export function warningText(w, exam) {
  const label = t('„{exam}“', { exam: examLabel(exam) });
  const day = dayTitle(w.date, todayISO());
  if (w.type === 'noTime') {
    return t('Vor {exam} hast du keine Lernzeit eingeplant. SchoolBuddy hat {day} trotzdem Einheiten vorgemerkt.', { exam: label, day: dayPhrase(w.date, todayISO()) });
  }
  if (w.type === 'short') {
    return w.dropped === 1
      ? t('Für {exam} reicht deine Lernzeit nicht für alle Wiederholungen (1 fehlt). Tippe hier, um mehr Lernzeit einzuplanen.', { exam: label })
      : t('Für {exam} reicht deine Lernzeit nicht für alle Wiederholungen ({n} fehlen). Tippe hier, um mehr Lernzeit einzuplanen.', { exam: label, n: w.dropped });
  }
  return t('Für {exam} wird es knapp: {day} ist sehr voll. Plane mehr Lernzeit ein oder fang früher an.', { exam: label, day });
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
    const plannedMinutes = doneMinutes + open.reduce((sum, x) => sum + x.minutes, 0);
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
    if (open.length) {
      const minutes = formatMinutes(open.reduce((n, x) => n + x.minutes, 0));
      status = open.length === 1
        ? t('Heute steht 1 Lerneinheit an ({minutes}).', { minutes })
        : t('Heute stehen {n} Lerneinheiten an ({minutes}).', { n: open.length, minutes });
    } else if (done.length) status = t('Stark! Für heute hast du alles geschafft. 🎉');
    else if (upcoming.length) status = t('Heute ist lernfrei. Genieß den Tag!');
    else status = t('Trag deine nächste Prüfung ein, dann plant SchoolBuddy für dich.');

    root.innerHTML = String(html`
      <section class="hero">
        <div class="hero-text">
          <p class="hero-date">${fmtDate(today, 'long')}</p>
          <h1>${greeting(s.profile.name)}</h1>
          <p>${status}</p>
          ${days ? html`<span class="streak">${icon('flame')} ${plural(days, 'Tag in Folge', 'Tage in Folge')}</span>` : ''}
        </div>
        ${plannedMinutes ? html`<div class="hero-ring">${ring(pct, { size: 88, stroke: 8, label: t('{done} von {planned} Minuten', { done: doneMinutes, planned: plannedMinutes }) })}
          <span class="ring-label"><strong>${doneMinutes}</strong>/${plannedMinutes}<small>${t('Min.')}</small></span></div>` : ''}
      </section>

      ${examsToday.map((e) => html`<div class="banner success">${icon('trophy')}<span>${t('Heute:')} <strong>${examLabel(e)}</strong>. ${t('Viel Erfolg, du hast dich vorbereitet! 🍀')}</span></div>`)}
      ${plan.warnings.map((w) => html`<a class="banner warn" href="#/settings">${icon('alert')}<span>${warningText(w, examsById.get(w.examId))}</span></a>`)}

      ${showInstall ? html`<div class="card install">
        <div>${icon('download')}</div>
        <div class="grow"><strong>${t('SchoolBuddy als App installieren')}</strong>
          <p class="muted small">${canInstall() ? t('Startet wie eine App und funktioniert auch offline.') : t('Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“.')}</p></div>
        <div class="col">${canInstall() ? html`<button type="button" class="btn primary sm" data-action="install">${t('Installieren')}</button>` : ''}
          <button type="button" class="btn ghost sm" data-action="dismiss-install">${t('Später')}</button></div>
      </div>` : ''}

      <section class="section">
        ${sectionHead(t('Heute lernen'), upcoming.length ? html`<a class="link" href="#/plan">${t('Ganzer Plan')}</a>` : '')}
        ${open.length || done.length
          ? html`<ul class="list">${done.map((d) => sessionRow(d.task, d.task.exam, today, { done: true }))}${open.map((x) => sessionRow(x, examsById.get(x.examId), today))}</ul>`
          : upcoming.length
            ? html`<p class="muted card soft">${t('Heute ist nichts geplant.')}${nextDay ? ` ${t('Nächste Einheit: {day}.', { day: dayTitle(nextDay, today) })}` : ''}${cardsDue ? ` ${t('Wie wär’s mit ein paar Karteikarten?')}` : ''}</p>`
            : emptyState('calendar', t('Noch keine Prüfung eingetragen'), t('Trag deine nächste Klassenarbeit ein. SchoolBuddy verteilt den Stoff automatisch auf die Tage davor.'),
                html`<button type="button" class="btn primary" data-action="add-exam">${icon('plus')} ${t('Prüfung eintragen')}</button>`)}
      </section>

      ${cardsDue ? html`<a class="card action-card" href="#/learn/review/all">
        <span class="action-icon">${icon('cards')}</span>
        <span class="grow"><strong>${plural(cardsDue, 'Karteikarte wartet auf dich', 'Karteikarten warten auf dich')}</strong><span class="muted small">${t('Ein paar Minuten Wiederholung wirken Wunder.')}</span></span>
        ${icon('right', 'chev')}</a>` : ''}

      ${upcoming.length ? html`<section class="section">
        ${sectionHead(t('Nächste Prüfungen'), html`<a class="link" href="#/plan/exams">${t('Alle')}</a>`)}
        <div class="stack-sm">${upcoming.slice(0, 3).map((e) => examCard(e, plan.progress[e.id], today))}</div>
      </section>` : ''}

      <section class="section">
        ${sectionHead(t('Hausaufgaben'), html`<button type="button" class="link" data-action="add-hw">${icon('plus')} ${t('Neu')}</button>`)}
        ${homework.length
          ? html`<ul class="list">${homework.map((h) => homeworkRow(h, today))}</ul>`
          : html`<p class="muted card soft">${t('Nichts fällig in den nächsten zwei Tagen. 👌')}</p>`}
      </section>

      ${goals.length ? html`<section class="section">
        ${sectionHead(t('Deine Ziele'), html`<a class="link" href="#/progress">${t('Alle')}</a>`)}
        <div class="card stack-sm">${goals.map(({ g, p }) => html`<div class="goal-mini">
          <span>${p.done ? '✅ ' : ''}${goalLabel(g)}</span><span class="muted small">${g.type === 'custom' ? (p.done ? t('erledigt') : t('offen')) : `${p.value}/${p.target}`}</span>
          ${bar(p.pct, p.done ? 'success' : '')}</div>`)}</div>
      </section>` : ''}

      <section class="section">
        ${sectionHead(t('Schnellzugriff'))}
        <div class="quick">
          <button type="button" data-action="add-exam">${icon('calendar')}<span>${t('Prüfung')}</span></button>
          <button type="button" data-action="add-hw">${icon('pencil')}<span>${t('Hausaufgabe')}</span></button>
          <a href="#/buddy">${icon('sparkles')}<span>${t('Buddy fragen')}</span></a>
          <a href="#/buddy/scan">${icon('camera')}<span>${t('Aufgabe scannen')}</span></a>
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
          const task = open.find((x) => x.key === key) || findTask(s, key);
          completeSession(task);
          const left = open.filter((x) => x.key !== key).length;
          toast(left ? t('Erledigt ✓') : t('Alles geschafft für heute! 🎉'), { action: t('Rückgängig'), onAction: () => { uncompleteSession(key); ctx.refresh(); } });
        }
        ctx.refresh();
      } else if (action === 'focus') {
        const task = open.find((x) => x.key === key);
        if (task) openFocus(task, examsById.get(task.examId), () => { toast(t('Einheit erledigt ✓')); ctx.refresh(); });
      } else if (action === 'add-exam') openExamForm(null, ctx.refresh);
      else if (action === 'edit-exam') openExamForm(examsById.get(id), ctx.refresh);
      else if (action === 'add-hw') openHomeworkForm(null, ctx.refresh);
      else if (action === 'edit-hw') openHomeworkForm(s.homework.find((h) => h.id === id), ctx.refresh);
      else if (action === 'toggle-hw') {
        if (toggleHomework(id)) toast(t('Hausaufgabe erledigt ✓'));
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
