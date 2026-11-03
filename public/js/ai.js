// Client für den KI-Proxy (api/ai.php). Der API-Schlüssel liegt nur auf dem Server.
import { getState, update } from './store.js';
import { html, openModal } from './ui.js';

const ENDPOINT = 'api/ai.php';

export class AIError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

let statusCache = null;

/** Fragt ab, ob der Server KI-Anfragen annimmt und wie viele heute noch frei sind. */
export async function aiStatus(force = false) {
  if (statusCache && !force) return statusCache;
  try {
    const s = getState();
    const res = await fetch(`${ENDPOINT}?status=1`, {
      headers: { Accept: 'application/json', 'X-SchulBuddy-Device': s.meta.deviceId },
      cache: 'no-store',
    });
    const data = await res.json();
    statusCache = { available: !!(data.ok && data.enabled), ...data };
  } catch {
    statusCache = { available: false, offline: !navigator.onLine };
  }
  return statusCache;
}

export async function askAI(task, payload) {
  if (!navigator.onLine) throw new AIError('Du bist offline. Die KI-Funktionen brauchen Internet.');
  const s = getState();
  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ task, deviceId: s.meta.deviceId, grade: s.profile.grade, ...payload }),
    });
  } catch {
    throw new AIError('Keine Verbindung zum SchoolBuddy-Server. Versuch es gleich noch einmal.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Antwort ist kein JSON, z. B. weil PHP nicht läuft.
  }
  if (!res.ok || !data?.ok) {
    throw new AIError(data?.error || 'Die KI ist gerade nicht erreichbar.', res.status);
  }
  if (typeof data.remaining === 'number') statusCache = { ...(statusCache || {}), remaining: data.remaining };
  return data;
}

/** Zeigt einmalig die Hinweise zur KI-Nutzung. Löst mit true auf, wenn zugestimmt wurde. */
export function ensureConsent() {
  if (getState().meta.aiConsent) return Promise.resolve(true);
  return new Promise((resolve) => {
    let ok = false;
    openModal({
      title: 'Bevor du die KI nutzt',
      body: html`<div class="stack">
        <ul class="checklist">
          <li>Deine Frage oder dein Foto wird zur Beantwortung an unseren KI-Anbieter <strong>Anthropic</strong> übertragen. Auf dem SchoolBuddy-Server speichern wir sie nicht. Der Chatverlauf bleibt nur auf deinem Gerät, auch mit Konto.</li>
          <li>Schreib keine persönlichen Daten wie Namen, Adressen oder Telefonnummern in deine Fragen und fotografiere keine Gesichter.</li>
          <li>Die KI kann sich irren. Prüf wichtige Ergebnisse nach und frag im Zweifel deine Lehrkraft.</li>
          <li>Bist du jünger als 16, frag bitte vorher deine Eltern.</li>
        </ul>
        <label class="check-row"><input type="checkbox" data-agree> <span>Ich habe die Hinweise gelesen und bin einverstanden. Unter 16: Meine Eltern sind auch einverstanden.</span></label>
        <p class="muted small">Mehr dazu in der <a href="datenschutz.html" target="_blank" rel="noopener">Datenschutzerklärung</a>.</p>
        <button type="button" class="btn primary block" data-ok disabled>Los geht's</button>
      </div>`,
      onMount(m, close) {
        const box = m.querySelector('[data-agree]');
        const btn = m.querySelector('[data-ok]');
        box.addEventListener('change', () => {
          btn.disabled = !box.checked;
        });
        btn.addEventListener('click', () => {
          ok = true;
          update((s) => {
            s.meta.aiConsent = true;
          });
          close();
        });
      },
      onClose: () => resolve(ok),
    });
  });
}
