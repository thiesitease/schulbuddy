// Einstieg: App-Rahmen, Router und Start.
import { getState, onSaveError } from './store.js';
import { html, icon, LOGO, toast } from './ui.js';
import { syncReminders } from './reminders.js';
import { initPWA, onInstallChange } from './pwa.js';
import { initAccount, onAccountChange, rememberProviderName } from './account.js';
import onboarding from './views/onboarding.js';
import today from './views/today.js';
import plan from './views/plan.js';
import learn from './views/learn.js';
import buddy from './views/buddy.js';
import progress from './views/progress.js';
import settings from './views/settings.js';
import premium from './views/premium.js';

const ROUTES = { today, plan, learn, buddy, progress, settings, premium };
const TABS = [
  { id: 'today', label: 'Heute', icon: 'home' },
  { id: 'plan', label: 'Planer', icon: 'calendar' },
  { id: 'learn', label: 'Lernen', icon: 'cards' },
  { id: 'buddy', label: 'Buddy', icon: 'sparkles' },
  { id: 'progress', label: 'Fortschritt', icon: 'chart' },
];

const app = document.getElementById('app');
app.innerHTML = String(html`
  <header class="topbar">
    <a class="brand" href="#/today" aria-label="SchoolBuddy – zur Startseite">${LOGO}<span>SchoolBuddy</span></a>
    <span class="offline-pill" hidden>${icon('info')} Offline</span>
    <nav class="topbar-actions" aria-label="Weitere">
      <a class="icon-btn" href="#/premium" aria-label="Premium">${icon('crown')}</a>
      <a class="icon-btn" href="#/settings" aria-label="Einstellungen">${icon('sliders')}</a>
    </nav>
  </header>
  <main id="view" class="view" tabindex="-1"></main>
  <footer class="app-footer">
    <p>© 2026 Julius Reinhold, Hamburg</p>
    <p><a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a></p>
  </footer>
  <nav class="tabbar" aria-label="Hauptnavigation">
    ${TABS.map((t) => html`<a href="#/${t.id}" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></a>`)}
  </nav>
`);

const view = document.getElementById('view');
let cleanup = null;
let lastRoute = '';

function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'today', params: parts.slice(1), query: new URLSearchParams(query) };
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

let syncTimer = null;
function scheduleReminderSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncReminders(getState()), 800);
}

export function render() {
  const s = getState();
  applyTheme(s.settings.theme);
  const route = parseHash();
  const onboarded = s.profile.onboarded;
  app.classList.toggle('is-onboarding', !onboarded);
  const v = onboarded ? ROUTES[route.name] || today : onboarding;

  const routeKey = `${route.name}/${route.params.join('/')}`;
  const changed = routeKey !== lastRoute;
  lastRoute = routeKey;

  for (const a of app.querySelectorAll('[data-tab]')) {
    const active = a.dataset.tab === route.name || (a.dataset.tab === 'today' && !ROUTES[route.name]);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  cleanup?.();
  view.onclick = view.onsubmit = view.onchange = view.oninput = view.onkeydown = null;
  const ctx = { ...route, refresh: render, navigate: (path) => { location.hash = `#/${path}`; } };
  try {
    cleanup = v.render(view, ctx) || null;
  } catch (err) {
    console.error(err);
    view.innerHTML = String(html`<div class="empty">${icon('alert')}<h3>Da ist etwas schiefgelaufen</h3>
      <p>Lade die Seite neu. Deine Daten sind sicher auf deinem Gerät gespeichert.</p>
      <a class="btn primary" href="./">Neu laden</a></div>`);
  }
  if (changed) {
    window.scrollTo(0, 0);
    view.focus({ preventScroll: true });
  }
  scheduleReminderSync();
}

window.addEventListener('hashchange', render);
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
function updateOnline() {
  app.querySelector('.offline-pill').hidden = navigator.onLine;
}

onSaveError(() => toast('Speichern fehlgeschlagen. Ist der Gerätespeicher voll?', { timeout: 6000 }));
onInstallChange(() => {
  if (['today', 'settings'].includes(parseHash().name)) render();
});

// Neuer Tag, während die App offen ist: Plan neu berechnen.
let renderedDay = new Date().toDateString();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && new Date().toDateString() !== renderedDay) {
    renderedDay = new Date().toDateString();
    render();
  }
});

// Rückkehr vom Login (…/#/settings?login=ok oder ein Fehlercode).
const LOGIN_MESSAGES = {
  ok: 'Angemeldet ✓ Deine Daten werden jetzt synchronisiert.',
  abgebrochen: 'Anmeldung abgebrochen.',
  abgelaufen: 'Die Anmeldung hat zu lange gedauert. Versuch es noch einmal.',
  ungueltig: 'Die Anmeldung konnte nicht bestätigt werden. Versuch es noch einmal.',
  deaktiviert: 'Diese Anmeldung ist gerade nicht verfügbar.',
  fehler: 'Die Anmeldung hat nicht geklappt. Versuch es später noch einmal.',
};
const loginQuery = parseHash().query;
const loginResult = loginQuery.get('login');
if (loginResult) {
  // Den Vornamen vom Anbieter nur im Speicher behalten und sofort aus der Adresse entfernen.
  rememberProviderName(loginQuery.get('vorname'));
  history.replaceState(null, '', '#/settings');
}

onAccountChange((kind) => {
  if (kind === 'info' || kind === 'data') render();
});

initPWA();
updateOnline();
if (loginResult === 'ok') {
  // Erst den Stand aus dem Konto holen, damit nicht kurz das Onboarding aufblitzt.
  view.innerHTML = String(html`<div class="splash">${LOGO}<p>Anmeldung wird abgeschlossen …</p></div>`);
  await initAccount();
  render();
} else {
  render();
  initAccount();
}
if (loginResult) toast(LOGIN_MESSAGES[loginResult] || LOGIN_MESSAGES.fehler, { timeout: 5000 });
