// Erster Start: Name, Klasse, Fächer und Lernzeit.
import { getState, update, SUBJECTS } from '../store.js';
import { html, LOGO, icon, toast } from '../ui.js';
import { WEEKDAYS } from '../dates.js';
import { providerButtons, PROVIDER_NAMES } from '../components.js';
import { accountInfo, login, logout } from '../account.js';

const PRESETS = {
  wenig: { label: 'Locker', text: 'ca. 20 Min. am Tag', minutes: [20, 20, 20, 20, 20, 0, 20] },
  normal: { label: 'Normal', text: 'ca. 40 Min. am Tag', minutes: [40, 40, 40, 40, 30, 0, 30] },
  viel: { label: 'Ehrgeizig', text: 'ca. 60 Min. am Tag', minutes: [60, 60, 60, 60, 45, 30, 45] },
};

let step = 0;
let draft = null;

export default {
  render(root, ctx) {
    const s = getState();
    draft ||= {
      name: s.profile.name,
      grade: s.profile.grade,
      subjects: [...s.profile.subjects],
      preset: 'normal',
      weekend: true,
    };
    const steps = [welcome, profile, subjects, studyTime];
    root.innerHTML = String(html`<div class="onboarding">
      ${step > 0 ? html`<div class="dots" aria-label="Schritt ${step} von 3">${[1, 2, 3].map((i) => html`<span class="${i <= step ? 'on' : ''}"></span>`)}</div>` : ''}
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
      if (a.dataset.action === 'login') login(a.dataset.provider);
      if (a.dataset.action === 'logout') {
        logout().then((done) => {
          if (!done) return;
          draft = null;
          toast('Abgemeldet.');
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

function welcome() {
  const signedIn = !!accountInfo().user;
  return html`<div class="welcome">
    ${LOGO}
    <h1>SchoolBuddy</h1>
    <p class="slogan">Deine Schule. Dein Plan. Dein Erfolg.</p>
    <ul class="feature-list">
      <li>${icon('calendar')} Automatische Lernpläne für deine Klassenarbeiten</li>
      <li>${icon('cards')} Karteikarten und Quiz zum Üben</li>
      <li>${icon('sparkles')} KI-Lernhilfe, die dir Dinge Schritt für Schritt erklärt</li>
      <li>${icon('chart')} Fortschritt und Ziele im Blick</li>
    </ul>
    ${loginBox()}
    <button type="button" class="btn primary block lg" data-action="next">Los geht's</button>
    ${signedIn ? '' : html`<p class="muted small">Ohne Konto bleiben deine Daten nur auf diesem Gerät.</p>`}
  </div>`;
}

function loginBox() {
  const { user, providers } = accountInfo();
  if (user) {
    return html`<div class="login-box">
      <p class="small"><strong>Angemeldet mit ${PROVIDER_NAMES[user.provider] || user.provider}.</strong> In deinem Konto sind noch keine Daten.
        Richte SchoolBuddy jetzt ein, danach wird alles automatisch gespeichert.</p>
      <button type="button" class="btn ghost sm" data-action="logout">Abmelden</button>
    </div>`;
  }
  if (!providers.length) return '';
  return html`<div class="login-box">
    <p class="small">Melde dich an, um deine Lerndaten auf all deinen Geräten zu nutzen. Hast du schon ein Konto, kommen deine Daten so auf dieses Gerät.</p>
    ${providerButtons(providers)}
  </div>`;
}

function profile() {
  return html`<form class="stack">
    <h2>Wer bist du?</h2>
    <label class="field"><span>Dein Vorname <em>(optional)</em></span>
      <input name="name" value="${draft.name}" autocomplete="given-name" maxlength="30" placeholder="z. B. Lena"></label>
    <label class="field"><span>Deine Klasse</span>
      <select name="grade">${[5, 6, 7, 8, 9, 10, 11, 12, 13].map((g) => html`<option value="${g}" ${g === draft.grade ? 'selected' : ''}>Klasse ${g}</option>`)}</select></label>
    <div class="row between">
      <button type="button" class="btn ghost" data-action="back">Zurück</button>
      <button class="btn primary">Weiter</button>
    </div>
  </form>`;
}

function subjects() {
  return html`<div class="stack">
    <h2>Welche Fächer hast du?</h2>
    <p class="muted">Tippe alle an, die du lernen möchtest. Du kannst das später ändern.</p>
    <div class="chips">${SUBJECTS.map((name) => html`<button type="button" class="chip ${draft.subjects.includes(name) ? 'on' : ''}" data-action="subject" data-name="${name}" aria-pressed="${String(draft.subjects.includes(name))}">${name}</button>`)}</div>
    <div class="row between">
      <button type="button" class="btn ghost" data-action="back">Zurück</button>
      <button type="button" class="btn primary" data-action="next" ${draft.subjects.length ? '' : 'disabled'}>Weiter</button>
    </div>
  </div>`;
}

function studyTime() {
  return html`<div class="stack">
    <h2>Wie viel Zeit hast du zum Lernen?</h2>
    <p class="muted">Danach richtet sich dein Lernplan. Einzelne Tage stellst du später in den Einstellungen ein.</p>
    <div class="preset-list">${Object.entries(PRESETS).map(([id, p]) => html`<button type="button" class="preset ${draft.preset === id ? 'on' : ''}" data-action="preset" data-preset="${id}">
      <strong>${p.label}</strong><span>${p.text}</span>
      <span class="preset-days">${p.minutes.map((m, i) => html`<span title="${WEEKDAYS[i]}: ${m} Min.">${WEEKDAYS[i]}</span>`)}</span></button>`)}</div>
    <label class="check-row"><input type="checkbox" name="weekend" ${draft.weekend ? 'checked' : ''}> <span>Auch am Wochenende lernen</span></label>
    <div class="row between">
      <button type="button" class="btn ghost" data-action="back">Zurück</button>
      <button type="button" class="btn primary" data-action="finish">Fertig</button>
    </div>
  </div>`;
}
