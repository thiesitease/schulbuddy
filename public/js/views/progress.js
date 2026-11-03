// Fortschritt: Statistik, Prüfungsfortschritt, Wissenslücken und Ziele.
import { getState, update, uid } from '../store.js';
import { buildPlan } from '../planner.js';
import { todayISO, addDays, weekdayMon0, WEEKDAYS, fmtDate } from '../dates.js';
import { html, raw, icon, bar, subjectDot, openModal, toast, formatMinutes, plural, confirmDialog } from '../ui.js';
import { pageHead, sectionHead, emptyState } from '../components.js';
import { examLabel } from '../actions.js';
import { streak, sumRange, periodRange, goalProgress, goalLabel, GOAL_TYPES, topicScores, knowledgeGaps, minutesBySubject } from '../stats.js';

const SUGGESTED_GOALS = [
  { type: 'minutes', period: 'week', target: 150 },
  { type: 'sessions', period: 'week', target: 5 },
  { type: 'cards', period: 'week', target: 100 },
  { type: 'quizzes', period: 'month', target: 8 },
];

export default {
  render(root, ctx) {
    const s = getState();
    const today = todayISO();
    const plan = buildPlan(s, today);
    const [weekFrom, weekTo] = periodRange('week', today);
    const week = (field) => sumRange(s.activity, weekFrom, weekTo, field);
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => ({ d, minutes: s.activity[d]?.minutes || 0 }));
    const upcoming = s.exams.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date));
    const graded = s.exams.filter((e) => e.date <= today && e.grade).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    const bySubject = Object.entries(minutesBySubject(s)).sort((a, b) => b[1] - a[1]);
    const maxSubject = Math.max(1, ...bySubject.map(([, m]) => m));
    const subjectScores = scoresBySubject(s.quizzes);
    const gaps = knowledgeGaps(s);
    const streakDays = streak(s.activity, today);

    root.innerHTML = String(html`
      ${pageHead('Fortschritt')}
      <div class="tiles">
        <div class="tile"><span class="tile-icon flame">${icon('flame')}</span><strong>${streakDays}</strong><span>${streakDays === 1 ? 'Tag' : 'Tage'} in Folge</span></div>
        <div class="tile"><span class="tile-icon">${icon('clock')}</span><strong>${formatMinutes(week('minutes'))}</strong><span>diese Woche</span></div>
        <div class="tile"><span class="tile-icon">${icon('check')}</span><strong>${week('sessions')}</strong><span>Einheiten diese Woche</span></div>
        <div class="tile"><span class="tile-icon">${icon('cards')}</span><strong>${week('cards')}</strong><span>Karten diese Woche</span></div>
      </div>

      <section class="card section">
        <h2 class="chart-title">Lernminuten der letzten 14 Tage</h2>
        ${minutesChart(days, today)}
      </section>

      <section class="section">
        ${sectionHead('Ziele', html`<button type="button" class="link" data-action="add-goal">${icon('plus')} Ziel</button>`)}
        ${s.goals.length
          ? html`<div class="stack-sm">${s.goals.map((g) => goalRow(g, goalProgress(g, s, today)))}</div>`
          : html`<div class="card soft stack-sm"><p class="small">Ziele motivieren. Wähle einen Vorschlag oder setz dir ein eigenes Ziel:</p>
              <div class="chips">${SUGGESTED_GOALS.map((g, i) => html`<button type="button" class="chip" data-action="suggest-goal" data-i="${i}">${icon('target')} ${goalLabel(g)}</button>`)}</div></div>`}
      </section>

      <section class="section">
        ${sectionHead('Prüfungsvorbereitung')}
        ${upcoming.length
          ? html`<div class="card stack-sm">${upcoming.map((e) => {
              const p = plan.progress[e.id];
              const pct = p?.total ? (p.done / p.total) * 100 : 0;
              return html`<div class="meter"><div class="row between"><span>${subjectDot(e.subject)}${examLabel(e)}</span><span class="muted small">${fmtDate(e.date)}</span></div>
                ${bar(pct, pct >= 100 ? 'success' : '')}
                <span class="muted small">${p ? `${p.done} von ${p.total} Einheiten · noch ${formatMinutes(p.minutesLeft)}` : ''}</span></div>`;
            })}</div>`
          : html`<p class="muted card soft">Keine anstehenden Prüfungen. <a href="#/plan/exams">Prüfung eintragen</a></p>`}
      </section>

      <section class="section">
        ${sectionHead('Wissenslücken')}
        ${gaps.topics.length || gaps.cards.length
          ? html`<ul class="list">
              ${gaps.topics.slice(0, 6).map((t) => {
                // Quiz aus einem Karteikarten-Stapel: dort üben, sonst ein KI-Quiz zum Thema.
                const deck = s.decks.find((d) => d.name === t.topic && d.subject === t.subject);
                const href = deck ? `#/learn/review/${deck.id}` : `#/learn/quiz?subject=${encodeURIComponent(t.subject)}&topic=${encodeURIComponent(t.topic)}`;
                return html`<li class="gap-row">${icon('alert', 'warn-icon')}
                  <span class="grow"><strong>${t.topic}</strong><span class="muted small"> · ${t.subject} · ${t.pct} % richtig</span></span>
                  <a class="btn ghost sm" href="${href}">Üben</a></li>`;
              })}
              ${gaps.cards.map((x) => html`<li class="gap-row">${icon('cards', 'warn-icon')}
                <span class="grow"><strong>${x.deck.name}</strong><span class="muted small"> · ${plural(x.hard.length, 'Karte', 'Karten')} oft vergessen</span></span>
                <a class="btn ghost sm" href="#/learn/review/${x.deck.id}">Wiederholen</a></li>`)}
            </ul>`
          : html`<p class="muted card soft">${s.quizzes.length ? 'Keine Lücken gefunden – weiter so! 🎯' : 'Mach ein paar Quizze, dann zeigt SchoolBuddy dir hier, welche Themen du noch üben solltest.'}</p>`}
      </section>

      ${bySubject.length || subjectScores.length ? html`<section class="section">
        ${sectionHead('Fächer')}
        <div class="card stack-sm">
          ${bySubject.map(([subject, minutes]) => html`<div class="meter"><div class="row between"><span>${subjectDot(subject)}${subject}</span><span class="small">${formatMinutes(minutes)}</span></div>${bar((minutes / maxSubject) * 100)}</div>`)}
          ${subjectScores.length ? html`<h3 class="small muted">Quiz-Durchschnitt</h3>${subjectScores.map((x) => html`<div class="row between small"><span>${subjectDot(x.subject)}${x.subject}</span><span>${x.pct} % · ${plural(x.count, 'Quiz', 'Quizze')}</span></div>`)}` : ''}
        </div>
      </section>` : ''}

      ${graded.length ? html`<section class="section">${sectionHead('Deine Noten')}
        <ul class="list">${graded.map((e) => html`<li class="result-row">${subjectDot(e.subject)}<span class="grow">${examLabel(e)}<span class="muted small"> · ${fmtDate(e.date)}</span></span><span class="badge">${e.grade}</span></li>`)}</ul></section>` : ''}
    `);

    bindChart(root);

    root.onclick = async (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const goal = s.goals.find((g) => g.id === a.dataset.id);
      if (a.dataset.action === 'add-goal') openGoalForm(null, ctx.refresh);
      if (a.dataset.action === 'edit-goal') openGoalForm(goal, ctx.refresh);
      if (a.dataset.action === 'suggest-goal') {
        update((st) => { st.goals.push({ id: uid(), createdOn: today, ...SUGGESTED_GOALS[Number(a.dataset.i)] }); });
        toast('Ziel gesetzt 🎯');
        ctx.refresh();
      }
      if (a.dataset.action === 'check-goal') {
        const [from] = periodRange(goal.period, today);
        update((st) => {
          const g = st.goals.find((x) => x.id === goal.id);
          const checked = new Set(g.checked || []);
          if (checked.has(from)) checked.delete(from);
          else checked.add(from);
          g.checked = [...checked];
        });
        ctx.refresh();
      }
    };
  },
};

function scoresBySubject(quizzes) {
  const map = new Map();
  for (const t of topicScores(quizzes)) {
    const e = map.get(t.subject) || { subject: t.subject, right: 0, total: 0, count: 0 };
    e.right += t.right;
    e.total += t.total;
    e.count += t.count;
    map.set(t.subject, e);
  }
  return [...map.values()].map((e) => ({ ...e, pct: Math.round((e.right / e.total) * 100) })).sort((a, b) => b.pct - a.pct);
}

function goalRow(g, p) {
  const period = g.period === 'month' ? 'diesen Monat' : 'diese Woche';
  if (g.type === 'custom') {
    return html`<div class="card goal">
      <button type="button" class="check ${p.done ? 'on' : ''}" data-action="check-goal" data-id="${g.id}" aria-pressed="${String(p.done)}" aria-label="Ziel ${p.done ? 'nicht ' : ''}erreicht: ${g.label}">${icon('check')}</button>
      <span class="grow"><strong>${g.label}</strong><span class="muted small">${period}</span></span>
      <button type="button" class="icon-btn soft" data-action="edit-goal" data-id="${g.id}" aria-label="Ziel bearbeiten">${icon('edit')}</button></div>`;
  }
  return html`<div class="card goal">
    <span class="goal-icon ${p.done ? 'done' : ''}">${p.done ? icon('trophy') : icon('target')}</span>
    <span class="grow"><strong>${goalLabel(g)}</strong>
      ${bar(p.pct, p.done ? 'success' : '')}
      <span class="muted small">${p.value} von ${p.target} ${GOAL_TYPES[g.type].unit} ${period}${p.done ? ' · erreicht 🎉' : ''}</span></span>
    <button type="button" class="icon-btn soft" data-action="edit-goal" data-id="${g.id}" aria-label="Ziel bearbeiten">${icon('edit')}</button></div>`;
}

function openGoalForm(goal, onSaved) {
  const isNew = !goal;
  const g = goal || { type: 'minutes', period: 'week', target: 150, label: '' };
  openModal({
    title: isNew ? 'Neues Ziel' : 'Ziel bearbeiten',
    body: html`<form class="stack">
      <label class="field"><span>Was möchtest du erreichen?</span><select name="type">${Object.entries(GOAL_TYPES).map(([id, t]) => html`<option value="${id}" ${id === g.type ? 'selected' : ''}>${t.label}</option>`)}</select></label>
      <div class="grid-2">
        <label class="field" data-target><span>Wie viel?</span><input type="number" name="target" min="1" max="10000" value="${g.target || 1}" inputmode="numeric"></label>
        <label class="field"><span>Zeitraum</span><select name="period"><option value="week" ${g.period === 'week' ? 'selected' : ''}>pro Woche</option><option value="month" ${g.period === 'month' ? 'selected' : ''}>pro Monat</option></select></label>
      </div>
      <label class="field" data-label><span>Dein Ziel</span><input name="label" maxlength="80" value="${g.label || ''}" placeholder="z. B. Englisch-Vokabeln Unit 4 können"></label>
      <div class="row end">
        ${isNew ? '' : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} Löschen</button>`}
        <button class="btn primary">Speichern</button></div>
    </form>`,
    onMount(m, close) {
      const form = m.querySelector('form');
      const sync = () => {
        const custom = form.type.value === 'custom';
        m.querySelector('[data-target]').hidden = custom;
        m.querySelector('[data-label]').hidden = !custom;
      };
      form.type.addEventListener('change', sync);
      sync();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const type = form.type.value;
        const data = { type, period: form.period.value, target: Math.max(1, Number(form.target.value) || 1), label: form.label.value.trim() };
        if (type === 'custom' && !data.label) {
          form.label.focus();
          return;
        }
        update((s) => {
          if (isNew) s.goals.push({ id: uid(), createdOn: todayISO(), ...data });
          else Object.assign(s.goals.find((x) => x.id === g.id), data);
        });
        close();
        toast('Ziel gespeichert 🎯');
        onSaved?.();
      });
      m.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog('Dieses Ziel löschen?')) {
          update((s) => { s.goals = s.goals.filter((x) => x.id !== g.id); });
          onSaved?.();
        }
      });
    },
  });
}

// --- Balkendiagramm: Lernminuten pro Tag -----------------------------------

const W = 340;
const H = 150;
const PAD = { left: 30, right: 4, top: 18, bottom: 22 };

function minutesChart(days, today) {
  const max = Math.max(...days.map((x) => x.minutes));
  const top = Math.max(30, Math.ceil(max / 15) * 15);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / days.length;
  const barW = Math.max(4, band - 6);
  const base = PAD.top + plotH;
  const y = (v) => base - (v / top) * plotH;
  const maxIndex = max ? days.findIndex((x) => x.minutes === max) : -1;

  let marks = '';
  days.forEach((x, i) => {
    const bx = PAD.left + i * band + (band - barW) / 2;
    if (x.minutes > 0) {
      const h = base - y(x.minutes);
      const r = Math.min(4, h, barW / 2);
      const t = base - h;
      marks += `<path class="chart-bar" d="M${bx},${base}V${t + r}Q${bx},${t} ${bx + r},${t}H${bx + barW - r}Q${bx + barW},${t} ${bx + barW},${t + r}V${base}Z"/>`;
    }
    if (i === maxIndex) marks += `<text class="chart-value" x="${bx + barW / 2}" y="${y(x.minutes) - 5}" text-anchor="middle">${x.minutes}</text>`;
    const label = WEEKDAYS[weekdayMon0(x.d)];
    marks += `<text class="chart-x ${x.d === today ? 'is-today' : ''}" x="${bx + barW / 2}" y="${H - 6}" text-anchor="middle">${label}</text>`;
    const tip = `${x.d === today ? 'Heute' : fmtDate(x.d)}: ${x.minutes} Min.`;
    marks += `<rect class="chart-hit" x="${PAD.left + i * band}" y="${PAD.top}" width="${band}" height="${plotH + 4}" tabindex="0" role="img" aria-label="${tip}" data-tip="${tip}" data-x="${((PAD.left + (i + 0.5) * band) / W) * 100}"/>`;
  });

  const grid = [top, top / 2]
    .map((v) => `<line class="chart-grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${y(v)}" y2="${y(v)}"/><text class="chart-y" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`)
    .join('');

  return html`<div class="chart">
    <svg viewBox="0 0 ${W} ${H}" class="chart-svg" aria-hidden="false" role="group" aria-label="Balkendiagramm der Lernminuten pro Tag">
      ${raw(grid)}<line class="chart-axis" x1="${PAD.left}" x2="${W - PAD.right}" y1="${base}" y2="${base}"/>${raw(marks)}
    </svg>
    <div class="chart-tip" role="status" hidden></div>
    <table class="sr-only"><caption>Lernminuten der letzten 14 Tage</caption>
      <tr><th scope="col">Tag</th><th scope="col">Minuten</th></tr>
      ${days.map((x) => html`<tr><td>${fmtDate(x.d)}</td><td>${x.minutes}</td></tr>`)}</table>
    <p class="muted small">Minuten aus erledigten Lerneinheiten. ${max ? '' : 'Noch keine Daten – erledige deine erste Einheit!'}</p>
  </div>`;
}

function bindChart(root) {
  const chart = root.querySelector('.chart');
  if (!chart) return;
  const tip = chart.querySelector('.chart-tip');
  const show = (el) => {
    tip.textContent = el.dataset.tip;
    tip.style.left = `${el.dataset.x}%`;
    tip.hidden = false;
    chart.querySelectorAll('.chart-hit.active').forEach((x) => x.classList.remove('active'));
    el.classList.add('active');
  };
  const hide = () => {
    tip.hidden = true;
    chart.querySelectorAll('.chart-hit.active').forEach((x) => x.classList.remove('active'));
  };
  chart.querySelectorAll('.chart-hit').forEach((el) => {
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('click', () => show(el));
    el.addEventListener('blur', hide);
  });
  chart.querySelector('svg').addEventListener('pointerleave', hide);
}
