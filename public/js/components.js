// Wiederverwendbare Bausteine für die Ansichten.
import { html, raw, icon, subjectDot, subjectColor, bar } from './ui.js';
import { KIND_LABEL } from './planner.js';
import { relDay, fmtDate, diffDays } from './dates.js';
import { examLabel } from './actions.js';
import { t, subjectName } from './i18n.js';

export function sessionTitle(session) {
  return session.kind === 'final' ? t('Generalprobe: alle Themen') : `${KIND_LABEL[session.kind]}: ${session.topic}`;
}

export function sessionRow(session, exam, today, { done = false } = {}) {
  const title = sessionTitle(session);
  return html`<li class="session ${done ? 'is-done' : ''}">
    <button type="button" class="check" data-action="toggle-session" data-key="${session.key}"
      aria-pressed="${String(done)}" aria-label="${done ? t('Wieder offen') : t('Erledigt')}: ${title}">${icon('check')}</button>
    <button type="button" class="session-main" ${done ? '' : html`data-action="focus" data-key="${session.key}"`}>
      <span class="session-title">${title}</span>
      <span class="session-meta">${subjectDot(exam.subject)}${examLabel(exam)} ${relDay(exam.date, today)} · ${t('{n} Min.', { n: session.minutes })}</span>
    </button>
    ${done ? '' : html`<button type="button" class="icon-btn soft" data-action="focus" data-key="${session.key}" aria-label="${t('Fokus-Timer für {title} starten', { title })}">${icon('play')}</button>`}
  </li>`;
}

export function examCard(exam, progress, today) {
  const days = diffDays(today, exam.date);
  const count = days === 0 ? t('Heute') : days === 1 ? t('Morgen') : days < 0 ? fmtDate(exam.date, 'day') : String(days);
  const pct = progress?.total ? (progress.done / progress.total) * 100 : 0;
  return html`<button type="button" class="exam-card" data-action="edit-exam" data-id="${exam.id}" style="--c:${subjectColor(exam.subject)}">
    <span class="exam-count ${days > 1 ? '' : 'small'}"><strong>${count}</strong>${days > 1 ? html`<small>${t('Tage')}</small>` : ''}</span>
    <span class="exam-info">
      <span class="exam-title">${examLabel(exam)}</span>
      <span class="exam-sub">${exam.title ? `${exam.title} · ` : ''}${fmtDate(exam.date, 'long')}</span>
      ${progress ? html`${bar(pct)}<span class="exam-progress">${t('{done} von {total} Einheiten erledigt', { done: progress.done, total: progress.total })}</span>` : ''}
      ${days < 0 && exam.grade ? html`<span class="exam-progress">${t('Note: {grade}', { grade: exam.grade })}</span>` : ''}
    </span>
    ${icon('right', 'chev')}
  </button>`;
}

export function homeworkRow(h, today) {
  const overdue = !h.done && h.due < today;
  const due = t('fällig {when}', { when: relDay(h.due, today) });
  return html`<li class="hw ${h.done ? 'is-done' : ''}">
    <button type="button" class="check" data-action="toggle-hw" data-id="${h.id}" aria-pressed="${String(!!h.done)}"
      aria-label="${h.done ? t('Wieder offen') : t('Erledigt')}: ${h.text}">${icon('check')}</button>
    <button type="button" class="hw-main" data-action="edit-hw" data-id="${h.id}">
      <span class="hw-text">${h.text}</span>
      <span class="hw-meta ${overdue ? 'is-overdue' : ''}">${subjectDot(h.subject)}${subjectName(h.subject)} · ${overdue ? t('überfällig, {due}', { due }) : due}</span>
    </button>
  </li>`;
}

export const emptyState = (iconName, title, text, action = '') =>
  html`<div class="empty">${icon(iconName)}<h3>${title}</h3><p>${text}</p>${action}</div>`;

export const sectionHead = (title, action = '') =>
  html`<div class="section-head"><h2>${title}</h2>${action}</div>`;

/** Segment-Umschalter, der per Link navigiert. */
export function tabs(items, active) {
  return html`<nav class="segmented" aria-label="${t('Bereiche')}">${items.map(
    (t) => html`<a href="${t.href}" class="${t.id === active ? 'active' : ''}" ${t.id === active ? html`aria-current="page"` : ''}>${t.label}</a>`,
  )}</nav>`;
}

const PROVIDER_LOGOS = {
  microsoft: '<svg viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>',
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
};

export const PROVIDER_NAMES = { microsoft: 'Microsoft', google: 'Google', apple: 'Apple' };

export const providerLogo = (id) => raw(`<span class="provider-logo">${PROVIDER_LOGOS[id] || ''}</span>`);

/** Anmelde-Buttons für die eingerichteten Anbieter. */
export const providerButtons = (providers) =>
  html`<div class="providers">${providers.map(
    (p) => html`<button type="button" class="provider-btn ${p.id}" data-action="login" data-provider="${p.id}">${providerLogo(p.id)}<span>${t('Mit {provider} anmelden', { provider: p.label })}</span></button>`,
  )}</div>`;

export const pageHead = (title, subtitle = '', action = '') =>
  html`<header class="page-head"><div><h1>${title}</h1>${subtitle ? html`<p class="muted">${subtitle}</p>` : ''}</div>${action}</header>`;
