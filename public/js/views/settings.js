// Einstellungen: Profil, Lernzeiten, Erinnerungen, Darstellung, Daten.
import { getState, update, exportJSON, importJSON, resetAll, SUBJECTS } from '../store.js';
import { todayISO, WEEKDAYS_LONG } from '../dates.js';
import { html, icon, toast, confirmDialog, downloadFile, formatMinutes } from '../ui.js';
import { pageHead, providerButtons, providerLogo, PROVIDER_NAMES } from '../components.js';
import { enableNotifications, disableNotifications, notificationsSupported, testNotification, buildICS, syncReminders } from '../reminders.js';
import { aiStatus } from '../ai.js';
import { canInstall, promptInstall, isStandalone, isIOS } from '../pwa.js';
import { accountInfo, syncStatus, onAccountChange, login, logout, deleteAccount, pushNow } from '../account.js';

const MINUTE_OPTIONS = [0, 15, 20, 30, 40, 45, 60, 75, 90, 120];

function syncLabel() {
  const { state, dirty, at } = syncStatus();
  if (state === 'syncing') return 'Wird synchronisiert …';
  if (state === 'offline') return 'Offline – wird synchronisiert, sobald du wieder online bist.';
  if (state === 'error') return 'Synchronisierung hat nicht geklappt. SchoolBuddy versucht es erneut.';
  if (dirty) return 'Änderungen werden gleich gespeichert …';
  if (!at) return 'Noch nicht synchronisiert.';
  const minutes = Math.round((Date.now() - at) / 60000);
  return `Synchronisiert ${minutes < 1 ? 'gerade eben' : minutes < 60 ? `vor ${minutes} Min.` : `am ${new Date(at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}`}.`;
}

function accountCard() {
  const info = accountInfo();
  if (info.user) {
    return html`<section class="card stack" aria-labelledby="set-account">
      <h2 id="set-account">${icon('cloud')} Konto</h2>
      <div class="row">${providerLogo(info.user.provider)}
        <span class="grow"><strong>Angemeldet mit ${PROVIDER_NAMES[info.user.provider] || info.user.provider}</strong><br>
          <span class="muted small" data-sync-status>${syncLabel()}</span></span></div>
      <p class="muted small">Deine Lerndaten werden automatisch zwischen deinen Geräten abgeglichen.</p>
      <div class="row wrap gap">
        <button type="button" class="btn ghost sm" data-action="sync-now">${icon('refresh')} Jetzt synchronisieren</button>
        <button type="button" class="btn ghost sm" data-action="logout">Abmelden</button>
        <button type="button" class="btn ghost sm danger-text" data-action="delete-account">${icon('trash')} Konto löschen</button>
      </div>
    </section>`;
  }
  if (!info.providers.length) return '';
  return html`<section class="card stack" aria-labelledby="set-account">
    <h2 id="set-account">${icon('cloud')} Konto <span class="badge">optional</span></h2>
    <p class="small">Melde dich an, um deine Lerndaten auf Handy, Tablet und Computer zu nutzen. Ohne Konto bleibt alles nur auf diesem Gerät.</p>
    ${providerButtons(info.providers)}
    <p class="muted small">SchoolBuddy übernimmt dabei nur deinen Vornamen als Vorschlag für dein Profil und speichert ihn nicht auf dem Server. Deine E-Mail-Adresse fragen wir nicht ab. <a href="datenschutz.html">Mehr dazu</a></p>
  </section>`;
}

export default {
  render(root, ctx) {
    const s = getState();
    const p = s.profile;
    const st = s.settings;
    const weekTotal = st.minutesByWeekday.reduce((a, b) => a + b, 0);
    const allSubjects = [...SUBJECTS, ...p.subjects.filter((x) => !SUBJECTS.includes(x))];
    const permission = notificationsSupported() ? Notification.permission : 'unsupported';
    // Mit Konto kämen gelöschte Daten beim nächsten Abgleich zurück, daher dort kein „Alles löschen“.
    const signedIn = !!accountInfo().user;

    root.innerHTML = String(html`
      ${pageHead('Einstellungen')}

      ${accountCard()}

      <section class="card stack" aria-labelledby="set-profile">
        <h2 id="set-profile">${icon('home')} Profil</h2>
        <div class="grid-2">
          <label class="field"><span>Vorname</span><input name="name" value="${p.name}" maxlength="30" autocomplete="given-name"></label>
          <label class="field"><span>Klasse</span><select name="grade">${[5, 6, 7, 8, 9, 10, 11, 12, 13].map((g) => html`<option value="${g}" ${g === p.grade ? 'selected' : ''}>Klasse ${g}</option>`)}</select></label>
        </div>
        <div class="field"><span>Deine Fächer</span>
          <div class="chips">${allSubjects.map((x) => html`<button type="button" class="chip ${p.subjects.includes(x) ? 'on' : ''}" data-action="subject" data-name="${x}" aria-pressed="${String(p.subjects.includes(x))}">${x}</button>`)}</div>
          <form class="row gap" data-form="custom-subject"><input name="custom" maxlength="30" placeholder="Anderes Fach hinzufügen" aria-label="Anderes Fach"><button class="btn ghost sm">${icon('plus')} Hinzufügen</button></form>
        </div>
      </section>

      <section class="card stack" aria-labelledby="set-time" id="lernzeiten">
        <h2 id="set-time">${icon('clock')} Lernzeiten</h2>
        <p class="muted small">So viel Zeit plant SchoolBuddy pro Tag für dich ein. Zusammen: ${formatMinutes(weekTotal)} pro Woche.</p>
        <div class="weekdays">${WEEKDAYS_LONG.map((d, i) => html`<label class="field inline"><span>${d}</span>
          <select name="day-${i}">${MINUTE_OPTIONS.map((m) => html`<option value="${m}" ${m === st.minutesByWeekday[i] ? 'selected' : ''}>${m ? `${m} Min.` : 'frei'}</option>`)}</select></label>`)}</div>
        <label class="field"><span>Länge einer Lerneinheit</span><select name="sessionMinutes">${[15, 20, 25, 30, 45].map((m) => html`<option value="${m}" ${m === st.sessionMinutes ? 'selected' : ''}>${m} Minuten</option>`)}</select>
          <small class="muted">Schwere Themen bekommen automatisch etwas mehr Zeit.</small></label>
      </section>

      <section class="card stack" aria-labelledby="set-reminders">
        <h2 id="set-reminders">${icon('bell')} Erinnerungen</h2>
        ${permission === 'unsupported'
          ? html`<p class="muted small">Dein Browser unterstützt keine Benachrichtigungen. Nutze den Kalender-Export.</p>`
          : html`<label class="switch-row"><span><strong>Benachrichtigungen</strong><small class="muted">An Lerneinheiten, Prüfungen und Hausaufgaben am Vortag</small></span>
              <input type="checkbox" role="switch" name="reminders" ${st.reminders && permission === 'granted' ? 'checked' : ''}></label>
            ${permission === 'denied' ? html`<p class="form-error">Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.</p>` : ''}
            <p class="muted small">${isIOS() && !isStandalone() ? 'Auf dem iPhone funktionieren Benachrichtigungen nur, wenn SchoolBuddy auf dem Home-Bildschirm installiert ist.' : 'Hintergrund-Erinnerungen klappen am besten mit installierter App unter Android. Das Gerät entscheidet, wann geprüft wird.'}</p>
            ${st.reminders && permission === 'granted' ? html`<button type="button" class="btn ghost sm" data-action="test-notification">Test-Benachrichtigung</button>` : ''}`}
        <label class="field inline"><span>Uhrzeit für Erinnerungen</span><input type="time" name="reminderTime" value="${st.reminderTime}"></label>
        <div class="row between wrap gap"><span class="small">Am zuverlässigsten: Termine in den Handy-Kalender übernehmen.</span>
          <button type="button" class="btn ghost sm" data-action="ics">${icon('download')} Kalender-Export</button></div>
      </section>

      <section class="card stack" aria-labelledby="set-look">
        <h2 id="set-look">${icon('sliders')} Darstellung</h2>
        <fieldset class="field"><legend>Farbschema</legend><div class="choice">
          ${[['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => html`<label><input type="radio" name="theme" value="${v}" ${st.theme === v ? 'checked' : ''}><span>${l}</span></label>`)}
        </div></fieldset>
        ${canInstall() ? html`<button type="button" class="btn ghost" data-action="install">${icon('download')} SchoolBuddy installieren</button>` : ''}
      </section>

      <section class="card stack" aria-labelledby="set-ai">
        <h2 id="set-ai">${icon('sparkles')} KI-Funktionen</h2>
        <p class="small" data-ai-info>Status wird geprüft …</p>
        ${s.meta.aiConsent ? html`<button type="button" class="btn ghost sm" data-action="revoke-ai">Einwilligung zurücknehmen</button>` : ''}
      </section>

      <section class="card stack" aria-labelledby="set-data">
        <h2 id="set-data">${icon('download')} Deine Daten</h2>
        <p class="muted small">${signedIn
          ? 'Deine Daten liegen auf diesem Gerät und in deinem Konto. Abmelden entfernt sie von diesem Gerät, „Konto löschen“ auch vom Server.'
          : 'Alles bleibt auf diesem Gerät. Sichere deine Daten regelmäßig, z. B. bevor du das Handy wechselst.'}</p>
        <div class="row wrap gap">
          <button type="button" class="btn ghost sm" data-action="export">${icon('download')} Sichern</button>
          <label class="btn ghost sm file-btn">${icon('upload')} Wiederherstellen<input type="file" accept="application/json,.json" data-import hidden></label>
          ${signedIn ? '' : html`<button type="button" class="btn ghost sm danger-text" data-action="reset">${icon('trash')} Alles löschen</button>`}
        </div>
      </section>

      <p class="legal muted small">SchoolBuddy 1.0 · Deine Schule. Dein Plan. Dein Erfolg.</p>
    `);

    aiStatus(true).then((status) => {
      const el = root.querySelector('[data-ai-info]');
      if (!el) return;
      el.textContent = status.available
        ? `Buddy ist bereit.${typeof status.remaining === 'number' ? ` Heute noch ${status.remaining} von ${status.limit} Anfragen frei.` : ''}`
        : 'Buddy ist gerade nicht erreichbar. Planer, Karteikarten und Ziele funktionieren trotzdem.';
    });

    const saved = () => toast('Gespeichert', { timeout: 1500 });

    root.onchange = async (e) => {
      const t = e.target;
      if (t.matches('[data-import]')) {
        const file = t.files[0];
        if (!file) return;
        const target = accountInfo().user ? 'auf diesem Gerät und in deinem Konto' : 'auf diesem Gerät';
        if (!(await confirmDialog(`Die aktuellen Daten ${target} werden durch die Sicherung ersetzt.`, { confirmText: 'Wiederherstellen', danger: false }))) return;
        try {
          importJSON(await file.text());
          toast('Sicherung wiederhergestellt ✓');
          ctx.refresh();
        } catch (ex) {
          toast(ex.message || 'Die Datei konnte nicht gelesen werden.');
        }
        return;
      }
      if (t.name === 'grade') update((x) => { x.profile.grade = Number(t.value); });
      else if (t.name === 'sessionMinutes') update((x) => { x.settings.sessionMinutes = Number(t.value); });
      else if (t.name?.startsWith('day-')) {
        update((x) => { x.settings.minutesByWeekday[Number(t.name.slice(4))] = Number(t.value); });
        ctx.refresh();
      } else if (t.name === 'reminderTime') update((x) => { x.settings.reminderTime = t.value || '16:00'; });
      else if (t.name === 'theme') {
        update((x) => { x.settings.theme = t.value; });
        ctx.refresh();
      } else if (t.name === 'reminders') {
        if (t.checked) {
          const result = await enableNotifications();
          update((x) => { x.settings.reminders = result.permission === 'granted'; });
          if (result.permission !== 'granted') toast('Ohne Erlaubnis kann SchoolBuddy keine Benachrichtigungen senden.');
          else toast(result.background ? 'Erinnerungen sind an 🔔' : 'Erinnerungen sind an. Hintergrund-Prüfung wird von diesem Gerät nicht unterstützt – nutze zusätzlich den Kalender-Export.', { timeout: 6000 });
        } else {
          await disableNotifications();
          update((x) => { x.settings.reminders = false; });
        }
        syncReminders(getState());
        ctx.refresh();
        return;
      } else return;
      syncReminders(getState());
      saved();
    };
    root.oninput = (e) => {
      if (e.target.name === 'name') update((x) => { x.profile.name = e.target.value.trim(); });
    };
    root.onsubmit = (e) => {
      e.preventDefault();
      const input = e.target.querySelector('[name="custom"]');
      const name = input?.value.trim();
      if (!name) return;
      update((x) => { if (!x.profile.subjects.includes(name)) x.profile.subjects.push(name); });
      ctx.refresh();
    };
    root.onclick = async (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const { action } = a.dataset;
      if (action === 'login') login(a.dataset.provider);
      else if (action === 'sync-now') {
        await pushNow();
        ctx.refresh();
      } else if (action === 'logout') {
        if (await logout()) {
          toast('Abgemeldet. Deine Daten sind sicher in deinem Konto.');
          location.hash = '#/today';
        }
      } else if (action === 'delete-account') {
        if (await confirmDialog('Dein Konto und alle darin gespeicherten Lerndaten werden endgültig gelöscht. Die Daten auf diesem Gerät bleiben erhalten.', { confirmText: 'Konto löschen' })) {
          try {
            await deleteAccount();
            toast('Konto gelöscht.');
          } catch (ex) {
            toast(ex.message);
          }
          ctx.refresh();
        }
      } else if (action === 'subject') {
        const name = a.dataset.name;
        const current = getState().profile.subjects;
        if (current.includes(name) && current.length === 1) return toast('Mindestens ein Fach brauchst du.');
        update((x) => { x.profile.subjects = current.includes(name) ? current.filter((y) => y !== name) : [...current, name]; });
        ctx.refresh();
      } else if (action === 'test-notification') testNotification().catch(() => toast('Test fehlgeschlagen.'));
      else if (action === 'ics') downloadFile(`schoolbuddy-${todayISO()}.ics`, buildICS(getState()), 'text/calendar;charset=utf-8');
      else if (action === 'install') {
        await promptInstall();
        ctx.refresh();
      } else if (action === 'revoke-ai') {
        update((x) => { x.meta.aiConsent = false; });
        toast('Einwilligung zurückgenommen. Vor der nächsten KI-Nutzung fragen wir erneut.');
        ctx.refresh();
      } else if (action === 'export') {
        downloadFile(`schoolbuddy-sicherung-${todayISO()}.json`, exportJSON());
        toast('Sicherung heruntergeladen ✓');
      } else if (action === 'reset') {
        if (await confirmDialog('Wirklich alle Prüfungen, Karteikarten, Ziele und Einstellungen auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.', { confirmText: 'Alles löschen' })) {
          resetAll();
          location.hash = '#/today';
          ctx.refresh();
        }
      }
    };

    // Sync-Status live aktualisieren, ohne die Seite neu aufzubauen.
    return onAccountChange((kind) => {
      const el = root.querySelector('[data-sync-status]');
      if (kind === 'sync' && el) el.textContent = syncLabel();
    });
  },
};
