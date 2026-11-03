// Optionales Konto: Anmeldung über Microsoft, Google oder Apple und Abgleich der Lerndaten
// zwischen Geräten. Ohne Anmeldung bleibt alles wie gehabt nur auf dem Gerät.
import { getState, update, onChange, replaceState, resetAll } from './store.js';
import { html, openModal, confirmDialog, toast } from './ui.js';

const PUSH_DELAY = 1500;
const PULL_INTERVAL = 30_000;

let info = { available: false, providers: [], user: null };
let syncState = 'idle'; // idle | syncing | offline | error
let pushTimer = null;
let pushing = null;
let resolving = false;
let changeSeq = 0;
let lastPull = 0;
const listeners = new Set();

/** kind: 'info' (Anmeldung geändert), 'data' (Lerndaten ersetzt), 'sync' (Sync-Status) */
export function onAccountChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (kind) => listeners.forEach((fn) => fn(kind));

export const accountInfo = () => info;

export function syncStatus() {
  const sync = getState().meta.sync;
  return { state: syncState, dirty: !!sync?.dirty, at: sync?.at || 0 };
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout?.(20_000),
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // keine JSON-Antwort, z. B. lokaler Server ohne PHP
  }
  return { status: res.status, data };
}

function setState(next) {
  syncState = next;
  emit('sync');
}

const hasLocalData = (s) =>
  s.profile.onboarded &&
  (s.exams.length || s.homework.length || s.decks.length || s.goals.length || s.quizzes.length || Object.keys(s.completed).length);

/** Was synchronisiert wird: alles außer gerätebezogenen Angaben. */
function payload(s) {
  const data = structuredClone(s);
  for (const key of ['deviceId', 'installDismissed', 'sync', 'createdOn']) delete data.meta[key];
  delete data.settings.reminders;
  return data;
}

function setSync(values) {
  update((s) => {
    s.meta.sync = { ...(s.meta.sync || {}), ...values };
  }, { silent: true });
}

function applyRemote(rev, data) {
  const local = getState();
  replaceState({
    ...data,
    meta: {
      ...(data.meta || {}),
      deviceId: local.meta.deviceId,
      installDismissed: local.meta.installDismissed,
      createdOn: local.meta.createdOn,
      sync: { userId: info.user.id, rev, dirty: false, at: Date.now() },
    },
    settings: { ...(data.settings || {}), reminders: local.settings.reminders },
  });
  emit('data');
}

/** Fragt, welcher Stand gelten soll. Löst mit 'remote', 'local' oder null (abgebrochen) auf. */
function chooseVersion(title, text) {
  return new Promise((resolve) => {
    let choice = null;
    openModal({
      title,
      body: html`<div class="stack"><p>${text}</p>
        <button type="button" class="btn primary block" data-choice="remote">Stand aus dem Konto laden</button>
        <button type="button" class="btn ghost block" data-choice="local">Stand von diesem Gerät behalten</button>
        <p class="muted small">Der andere Stand wird dabei überschrieben.</p></div>`,
      onMount(m, close) {
        m.querySelectorAll('[data-choice]').forEach((b) =>
          b.addEventListener('click', () => {
            choice = b.dataset.choice;
            close();
          }),
        );
      },
      onClose: () => resolve(choice),
    });
  });
}

/** Holt den Stand vom Server und verknüpft dieses Gerät beim ersten Mal mit dem Konto. */
async function pull() {
  if (!info.user || !navigator.onLine) return;
  lastPull = Date.now();
  const { status, data } = await api('api/sync.php').catch(() => ({ status: 0, data: null }));
  if (status === 401) return lostSession();
  if (!data?.ok) return setState(navigator.onLine ? 'error' : 'offline');
  const s = getState();
  const sync = s.meta.sync || {};

  if (sync.userId !== info.user.id) {
    // Erstes Mal mit diesem Konto auf diesem Gerät.
    if (!data.data) {
      setSync({ userId: info.user.id, rev: 0, dirty: !!s.profile.onboarded });
      return pushNow();
    }
    if (!hasLocalData(s)) return applyRemote(data.rev, data.data);
    const choice = await chooseVersion('Welche Daten möchtest du nutzen?',
      'In deinem Konto sind schon Lerndaten gespeichert, und auf diesem Gerät auch.');
    if (choice === 'remote') return applyRemote(data.rev, data.data);
    if (choice === 'local') {
      setSync({ userId: info.user.id, rev: data.rev, dirty: true });
      return pushNow();
    }
    return;
  }

  if (data.rev > (sync.rev || 0)) {
    if (!sync.dirty) return applyRemote(data.rev, data.data);
    return resolveConflict(data.rev, data.data);
  }
  if (sync.dirty) await pushNow();
  else setState('idle');
}

async function resolveConflict(rev, data) {
  // Solange die Frage offen ist, nicht weiter speichern (sonst käme sie mehrfach).
  if (resolving) return;
  resolving = true;
  let choice;
  try {
    choice = await chooseVersion('Änderungen auf zwei Geräten',
      'Auf einem anderen Gerät wurde inzwischen etwas geändert, während du hier auch etwas geändert hast.');
  } finally {
    resolving = false;
  }
  if (choice === 'remote') applyRemote(rev, data);
  else if (choice === 'local') {
    setSync({ rev, dirty: true });
    await pushNow();
  }
}

function lostSession() {
  info = { ...info, user: null };
  setState('idle');
  emit('info');
  toast('Deine Anmeldung ist abgelaufen. Melde dich in den Einstellungen erneut an.', { timeout: 6000 });
}

function schedulePush(delay = PUSH_DELAY) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow().catch(() => setState('error')), delay);
}

/** Speichert Änderungen im Konto. */
export async function pushNow() {
  if (pushing) await pushing;
  if (resolving) return;
  const s = getState();
  const sync = s.meta.sync;
  if (!info.user || !sync?.dirty || sync.userId !== info.user.id) return;
  if (!navigator.onLine) return setState('offline');
  const seq = changeSeq;
  setState('syncing');
  pushing = (async () => {
    const { status, data } = await api('api/sync.php', {
      method: 'PUT',
      body: JSON.stringify({ baseRev: sync.rev || 0, data: payload(s) }),
    }).catch(() => ({ status: 0, data: null }));
    if (status === 200 && data?.ok) {
      const more = changeSeq !== seq;
      setSync({ rev: data.rev, at: Date.now(), dirty: more });
      if (more) schedulePush();
      setState('idle');
    } else if (status === 409 && data?.conflict) {
      setState('idle');
      return data;
    } else if (status === 401) {
      lostSession();
    } else {
      setState(navigator.onLine ? 'error' : 'offline');
    }
    return null;
  })();
  let conflict = null;
  try {
    conflict = await pushing;
  } finally {
    pushing = null;
  }
  // Erst nach dem Speichervorgang fragen, sonst würde ein erneutes Speichern auf sich selbst warten.
  if (conflict) await resolveConflict(conflict.rev, conflict.data);
}

export async function initAccount() {
  try {
    const { data } = await api('api/auth.php?action=status');
    info = { available: !!data?.ok, providers: data?.providers || [], user: data?.user || null };
  } catch {
    info = { available: false, providers: [], user: null };
  }
  emit('info');
  if (info.user) await pull();
}

export function login(provider) {
  location.href = `api/auth.php?action=login&provider=${encodeURIComponent(provider)}`;
}

/** Abmelden: Änderungen noch hochladen, dann Daten von diesem Gerät entfernen (sie bleiben im Konto). */
export async function logout() {
  await pushNow();
  const message = getState().meta.sync?.dirty
    ? 'Einige Änderungen sind noch nicht im Konto gespeichert und gehen beim Abmelden verloren. Trotzdem abmelden?'
    : 'Deine Daten bleiben in deinem Konto und werden von diesem Gerät entfernt.';
  if (!(await confirmDialog(message, { confirmText: 'Abmelden' }))) return false;
  await api('api/auth.php?action=logout', { method: 'POST' }).catch(() => null);
  info = { ...info, user: null };
  resetAll();
  emit('info');
  emit('data');
  return true;
}

/** Konto löschen: alles auf dem Server wird entfernt, die Daten auf diesem Gerät bleiben. */
export async function deleteAccount() {
  const { data } = await api('api/auth.php?action=delete', { method: 'POST' });
  if (!data?.ok) throw new Error(data?.error || 'Das Konto konnte nicht gelöscht werden.');
  info = { ...info, user: null };
  update((s) => {
    s.meta.sync = null;
  }, { silent: true });
  emit('info');
}

onChange(() => {
  changeSeq++;
  // Auch vor dem Laden des Kontostatus (App-Start, offline) als ungespeichert merken;
  // pull() lädt die Änderung hoch, sobald die Anmeldung bestätigt ist.
  const sync = getState().meta.sync;
  if (!sync?.userId) return;
  if (!sync.dirty) setSync({ dirty: true });
  if (info.user?.id === sync.userId) schedulePush();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && info.user && Date.now() - lastPull > PULL_INTERVAL) pull();
});
window.addEventListener('online', () => {
  if (info.user) pull();
});
