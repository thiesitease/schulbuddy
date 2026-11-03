// Erster Start: Name, Klasse, Fächer und Lernzeit.
import { getState, update, SUBJECTS } from '../store.js';
import { html, LOGO, icon, toast } from '../ui.js';
import { WEEKDAYS } from '../dates.js';
import { providerButtons, PROVIDER_NAMES } from '../components.js';
import { accountInfo, login, logout, providerName } from '../account.js';
import { t, getLang, setLang, LANGS, subjectName } from '../i18n.js';

const PRESETS = {
  wenig: { label: t('Locker'), text: t('ca. {n} Min. am Tag', { n: 20 }), minutes: [20, 20, 20, 20, 20, 0, 20] },
  normal: { label: t('Normal'), text: t('ca. {n} Min. am Tag', { n: 40 }), minutes: [40, 40, 40, 40, 30, 0, 30] },
  viel: { label: t('Ehrgeizig'), text: t('ca. {n} Min. am Tag', { n: 60 }), minutes: [60, 60, 60, 60, 45, 30, 45] },
};

let step = 0;
let draft = null;

export default {
  render(root, ctx) {
    const s = getState();
    draft ||= {
      name: s.profile.name || providerName(),
      grade: s.profile.grade,
      subjects: [...s.profile.subjects],
      preset: 'normal',
      weekend: true,
    };
    const steps = [welcome, profile, subjects, studyTime];
    root.innerHTML = String(html`<div class="onboarding">
      ${step > 0 ? html`<div class="dots" aria-label="${t('Schritt {n} von 3', { n: step })}">${[1, 2, 3].map((i) => html`<span class="${i <= step ? 'on' : ''}"></span>`)}</div>` : ''}
      ${steps[step]()}
    </div>`);

    const go = (n) => {
      step = n;
      this.render(root, ctx);
      root.querySelector('input, button')?.focus();
    };

    root.onclick = (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      if (a.dataset.action === 'lang') setLang(a.dataset.lang);
      if (a.dataset.action === 'login') login(a.dataset.provider);
      if (a.dataset.action === 'logout') {
        logout().then((done) => {
          if (!done) return;
          draft = null;
          toast(t('Abgemeldet.'));
        });
      }
      if (a.dataset.action === 'next') go(step + 1);
      if (a.dataset.action === 'back') go(step - 1);
      if (a.dataset.action === 'subject') {
        const name = a.dataset.name;
        draft.subjects = draft.subjects.includes(name) ? draft.subjects.filter((x) => x !== name) : [...draft.subjects, name];
        a.classList.toggle('on');
        a.setAttribute('aria-pressed', draft.subjects.includes(name));
        root.querySelector('[data-action="next"]').disabled = !draft.subjects.length;
      }
      if (a.dataset.action === 'preset') {
        draft.preset = a.dataset.preset;
        root.querySelectorAll('[data-action="preset"]').forEach((b) => b.classList.toggle('on', b === a));
      }
      if (a.dataset.action === 'finish') {
        const minutes = [...PRESETS[draft.preset].minutes];
        if (!draft.weekend) {
          minutes[5] = 0;
          minutes[6] = 0;
        }
        update((st) => {
          st.profile = { ...st.profile, name: draft.name.trim(), grade: draft.grade, subjects: draft.subjects, onboarded: true };
          st.settings.minutesByWeekday = minutes;
        });
        navigator.storage?.persist?.().catch(() => {});
        step = 0;
        draft = null;
        location.hash = '#/today';
        ctx.refresh();
      }
    };
    root.oninput = (e) => {
      if (e.target.name === 'name') draft.name = e.target.value;
    };
    root.onchange = (e) => {
      if (e.target.name === 'grade') draft.grade = Number(e.target.value);
      if (e.target.name === 'weekend') draft.weekend = e.target.checked;
    };
    root.onsubmit = (e) => {
      e.preventDefault();
      go(step + 1);
    };
  },
};

/** Sprachwahl gleich auf dem ersten Bildschirm, in beiden Sprachen beschriftet. */
function languageSwitch() {
  return html`<div class="lang-switch" role="group" aria-label="Sprache · Language">${Object.entries(LANGS).map(([id, label]) => html`<button type="button"
    class="chip ${getLang() === id ? 'on' : ''}" data-action="lang" data-lang="${id}" lang="${id}" aria-pressed="${String(getLang() === id)}">${label}</button>`)}</div>`;
}

function welcome() {
  const signedIn = !!accountInfo().user;
  return html`<div class="welcome">
    ${languageSwitch()}
    ${LOGO}
    <h1>SchoolBuddy</h1>
    <p class="slogan">${t('Deine Schule. Dein Plan. Dein Erfolg.')}</p>
    <ul class="feature-list">
      <li>${icon('calendar')} ${t('Automatische Lernpläne für deine Klassenarbeiten')}</li>
      <li>${icon('cards')} ${t('Karteikarten und Quiz zum Üben')}</li>
      <li>${icon('sparkles')} ${t('KI-Lernhilfe, die dir Dinge Schritt für Schritt erklärt')}</li>
      <li>${icon('chart')} ${t('Fortschritt und Ziele im Blick')}</li>
    </ul>
    ${loginBox()}
    <button type="button" class="btn primary block lg" data-action="next">${t('Los geht’s')}</button>
    ${signedIn ? '' : html`<p class="muted small">${t('Ohne Konto bleiben deine Daten nur auf diesem Gerät.')}</p>`}
  </div>`;
}

function loginBox() {
  const { user, providers } = accountInfo();
  if (user) {
    const name = providerName();
    const provider = PROVIDER_NAMES[user.provider] || user.provider;
    return html`<div class="login-box">
      <p class="small"><strong>${name ? `${t('Hallo {name}!', { name })} ` : ''}${t('Angemeldet mit {provider}.', { provider })}</strong>
        ${t('In deinem Konto sind noch keine Daten. Richte SchoolBuddy jetzt ein, danach wird alles automatisch gespeichert.')}</p>
      <button type="button" class="btn ghost sm" data-action="logout">${t('Abmelden')}</button>
    </div>`;
  }
  if (!providers.length) return '';
  return html`<div class="login-box">
    <p class="small">${t('Melde dich an, um deine Lerndaten auf all deinen Geräten zu nutzen. Hast du schon ein Konto, kommen deine Daten so auf dieses Gerät.')}</p>
    ${providerButtons(providers)}
  </div>`;
}

function profile() {
  return html`<form class="stack">
    <h2>${t('Wer bist du?')}</h2>
    <label class="field"><span>${t('Dein Vorname')} <em>${t('(optional)')}</em></span>
      <input name="name" value="${draft.name}" autocomplete="given-name" maxlength="30" placeholder="${t('z. B. Lena')}"></label>
    <label class="field"><span>${t('Deine Klasse')}</span>
      <select name="grade">${[5, 6, 7, 8, 9, 10, 11, 12, 13].map((g) => html`<option value="${g}" ${g === draft.grade ? 'selected' : ''}>${t('Klasse {n}', { n: g })}</option>`)}</select></label>
    <div class="row between">
      <button type="button" class="btn ghost" data-action="back">${t('Zurück')}</button>
      <button class="btn primary">${t('Weiter')}</button>
    </div>
  </form>`;
}

function subjects() {
  return html`<div class="stack">
    <h2>${t('Welche Fächer hast du?')}</h2>
    <p class="muted">${t('Tippe alle an, die du lernen möchtest. Du kannst das später ändern.')}</p>
    <div class="chips">${SUBJECTS.map((name) => html`<button type="button" class="chip ${draft.subjects.includes(name) ? 'on' : ''}" data-action="subject" data-name="${name}" aria-pressed="${String(draft.subjects.includes(name))}">${subjectName(name)}</button>`)}</div>
    <div class="row between">
      <button type="button" class="btn ghost" data-action="back">${t('Zurück')}</button>
      <button type="button" class="btn primary" data-action="next" ${draft.subjects.length ? '' : 'disabled'}>${t('Weiter')}</button>
    </div>
  </div>`;
}

function studyTime() {
  return html`<div class="stack">
    <h2>${t('Wie viel Zeit hast du zum Lernen?')}</h2>
    <p class="muted">${t('Danach richtet sich dein Lernplan. Einzelne Tage stellst du später in den Einstellungen ein.')}</p>
    <div class="preset-list">${Object.entries(PRESETS).map(([id, p]) => html`<button type="button" class="preset ${draft.preset === id ? 'on' : ''}" data-action="preset" data-preset="${id}">
      <strong>${p.label}</strong><span>${p.text}</span>
      <span class="preset-days">${p.minutes.map((m, i) => html`<span title="${WEEKDAYS[i]}: ${t('{n} Min.', { n: m })}">${WEEKDAYS[i]}</span>`)}</span></button>`)}</div>
    <label class="check-row"><input type="checkbox" name="weekend" ${draft.weekend ? 'checked' : ''}> <span>${t('Auch am Wochenende lernen')}</span></label>
    <div class="row between">
      <button type="button" class="btn ghost" data-action="back">${t('Zurück')}</button>
      <button type="button" class="btn primary" data-action="finish">${t('Fertig')}</button>
    </div>
  </div>`;
}
