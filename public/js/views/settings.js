// Einstellungen: Profil, Lernzeiten, Erinnerungen, Darstellung, Daten.
import { getState, update, exportJSON, importJSON, resetAll, SUBJECTS } from '../store.js';
import { todayISO, WEEKDAYS_LONG } from '../dates.js';
import { html, icon, toast, confirmDialog, downloadFile, formatMinutes } from '../ui.js';
import { pageHead, providerButtons, providerLogo, PROVIDER_NAMES } from '../components.js';
import { enableNotifications, disableNotifications, notificationsSupported, testNotification, buildICS, syncReminders } from '../reminders.js';
import { aiStatus } from '../ai.js';
import { canInstall, promptInstall, isStandalone, isIOS } from '../pwa.js';
import { accountInfo, syncStatus, onAccountChange, login, logout, deleteAccount, pushNow } from '../account.js';
import { t, getLang, setLang, LANGS, locale, subjectName, privacyUrl } from '../i18n.js';

const MINUTE_OPTIONS = [0, 15, 20, 30, 40, 45, 60, 75, 90, 120];

function syncLabel() {
  const { state, dirty, at } = syncStatus();
  if (state === 'syncing') return t('Wird synchronisiert …');
  if (state === 'offline') return t('Offline – wird synchronisiert, sobald du wieder online bist.');
  if (state === 'error') return t('Synchronisierung hat nicht geklappt. SchoolBuddy versucht es erneut.');
  if (dirty) return t('Änderungen werden gleich gespeichert …');
  if (!at) return t('Noch nicht synchronisiert.');
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return t('Synchronisiert gerade eben.');
  if (minutes < 60) return t('Synchronisiert vor {n} Min.', { n: minutes });
  return t('Synchronisiert am {date}.', { date: new Date(at).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) });
}

function accountCard() {
  const info = accountInfo();
  if (info.user) {
    return html`<section class="card stack" aria-labelledby="set-account">
      <h2 id="set-account">${icon('cloud')} ${t('Konto')}</h2>
      <div class="row">${providerLogo(info.user.provider)}
        <span class="grow"><strong>${t('Angemeldet mit {provider}', { provider: PROVIDER_NAMES[info.user.provider] || info.user.provider })}</strong><br>
          <span class="muted small" data-sync-status>${syncLabel()}</span></span></div>
      <p class="muted small">${t('Deine Lerndaten werden automatisch zwischen deinen Geräten abgeglichen.')}</p>
      <div class="row wrap gap">
        <button type="button" class="btn ghost sm" data-action="sync-now">${icon('refresh')} ${t('Jetzt synchronisieren')}</button>
        <button type="button" class="btn ghost sm" data-action="logout">${t('Abmelden')}</button>
        <button type="button" class="btn ghost sm danger-text" data-action="delete-account">${icon('trash')} ${t('Konto löschen')}</button>
      </div>
    </section>`;
  }
  if (!info.providers.length) return '';
  return html`<section class="card stack" aria-labelledby="set-account">
    <h2 id="set-account">${icon('cloud')} ${t('Konto')} <span class="badge">${t('optional')}</span></h2>
    <p class="small">${t('Melde dich an, um deine Lerndaten auf Handy, Tablet und Computer zu nutzen. Ohne Konto bleibt alles nur auf diesem Gerät.')}</p>
    ${providerButtons(info.providers)}
    <p class="muted small">${t('SchoolBuddy übernimmt dabei nur deinen Vornamen als Vorschlag für dein Profil und speichert ihn nicht auf dem Server. Deine E-Mail-Adresse fragen wir nicht ab.')} <a href="${privacyUrl()}">${t('Mehr dazu')}</a></p>
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
    const themes = [['auto', t('Automatisch')], ['light', t('Hell')], ['dark', t('Dunkel')]];

    root.innerHTML = String(html`
      ${pageHead(t('Einstellungen'))}

      ${accountCard()}

      <section class="card stack" aria-labelledby="set-profile">
        <h2 id="set-profile">${icon('home')} ${t('Profil')}</h2>
        <div class="grid-2">
          <label class="field"><span>${t('Vorname')}</span><input name="name" value="${p.name}" maxlength="30" autocomplete="given-name"></label>
          <label class="field"><span>${t('Klasse')}</span><select name="grade">${[5, 6, 7, 8, 9, 10, 11, 12, 13].map((g) => html`<option value="${g}" ${g === p.grade ? 'selected' : ''}>${t('Klasse {n}', { n: g })}</option>`)}</select></label>
        </div>
        <div class="field"><span>${t('Deine Fächer')}</span>
          <div class="chips">${allSubjects.map((x) => html`<button type="button" class="chip ${p.subjects.includes(x) ? 'on' : ''}" data-action="subject" data-name="${x}" aria-pressed="${String(p.subjects.includes(x))}">${subjectName(x)}</button>`)}</div>
          <form class="row gap" data-form="custom-subject"><input name="custom" maxlength="30" placeholder="${t('Anderes Fach hinzufügen')}" aria-label="${t('Anderes Fach')}"><button class="btn ghost sm">${icon('plus')} ${t('Hinzufügen')}</button></form>
        </div>
      </section>

      <section class="card stack" aria-labelledby="set-time" id="lernzeiten">
        <h2 id="set-time">${icon('clock')} ${t('Lernzeiten')}</h2>
        <p class="muted small">${t('So viel Zeit plant SchoolBuddy pro Tag für dich ein. Zusammen: {total} pro Woche.', { total: formatMinutes(weekTotal) })}</p>
        <div class="weekdays">${WEEKDAYS_LONG.map((d, i) => html`<label class="field inline"><span>${d}</span>
          <select name="day-${i}">${MINUTE_OPTIONS.map((m) => html`<option value="${m}" ${m === st.minutesByWeekday[i] ? 'selected' : ''}>${m ? t('{n} Min.', { n: m }) : t('frei')}</option>`)}</select></label>`)}</div>
        <label class="field"><span>${t('Länge einer Lerneinheit')}</span><select name="sessionMinutes">${[15, 20, 25, 30, 45].map((m) => html`<option value="${m}" ${m === st.sessionMinutes ? 'selected' : ''}>${t('{n} Minuten', { n: m })}</option>`)}</select>
          <small class="muted">${t('Schwere Themen bekommen automatisch etwas mehr Zeit.')}</small></label>
      </section>

      <section class="card stack" aria-labelledby="set-reminders">
        <h2 id="set-reminders">${icon('bell')} ${t('Erinnerungen')}</h2>
        ${permission === 'unsupported'
          ? html`<p class="muted small">${t('Dein Browser unterstützt keine Benachrichtigungen. Nutze den Kalender-Export.')}</p>`
          : html`<label class="switch-row"><span><strong>${t('Benachrichtigungen')}</strong><small class="muted">${t('An Lerneinheiten, Prüfungen und Hausaufgaben am Vortag')}</small></span>
              <input type="checkbox" role="switch" name="reminders" ${st.reminders && permission === 'granted' ? 'checked' : ''}></label>
            ${permission === 'denied' ? html`<p class="form-error">${t('Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Website-Einstellungen.')}</p>` : ''}
            <p class="muted small">${isIOS() && !isStandalone() ? t('Auf dem iPhone funktionieren Benachrichtigungen nur, wenn SchoolBuddy auf dem Home-Bildschirm installiert ist.') : t('Hintergrund-Erinnerungen klappen am besten mit installierter App unter Android. Das Gerät entscheidet, wann geprüft wird.')}</p>
            ${st.reminders && permission === 'granted' ? html`<button type="button" class="btn ghost sm" data-action="test-notification">${t('Test-Benachrichtigung')}</button>` : ''}`}
        <label class="field inline"><span>${t('Uhrzeit für Erinnerungen')}</span><input type="time" name="reminderTime" value="${st.reminderTime}"></label>
        <div class="row between wrap gap"><span class="small">${t('Am zuverlässigsten: Termine in den Handy-Kalender übernehmen.')}</span>
          <button type="button" class="btn ghost sm" data-action="ics">${icon('download')} ${t('Kalender-Export')}</button></div>
      </section>

      <section class="card stack" aria-labelledby="set-look">
        <h2 id="set-look">${icon('sliders')} ${t('Darstellung')}</h2>
        <fieldset class="field"><legend>${getLang() === 'en' ? 'Language · Sprache' : 'Sprache · Language'}</legend><div class="choice">
          ${Object.entries(LANGS).map(([v, l]) => html`<label><input type="radio" name="lang" value="${v}" ${getLang() === v ? 'checked' : ''}><span lang="${v}">${l}</span></label>`)}
        </div></fieldset>
        <fieldset class="field"><legend>${t('Farbschema')}</legend><div class="choice">
          ${themes.map(([v, l]) => html`<label><input type="radio" name="theme" value="${v}" ${st.theme === v ? 'checked' : ''}><span>${l}</span></label>`)}
        </div></fieldset>
        ${canInstall() ? html`<button type="button" class="btn ghost" data-action="install">${icon('download')} ${t('SchoolBuddy installieren')}</button>` : ''}
      </section>

      <section class="card stack" aria-labelledby="set-ai">
        <h2 id="set-ai">${icon('sparkles')} ${t('KI-Funktionen')}</h2>
        <p class="small" data-ai-info>${t('Status wird geprüft …')}</p>
        ${s.meta.aiConsent ? html`<button type="button" class="btn ghost sm" data-action="revoke-ai">${t('Einwilligung zurücknehmen')}</button>` : ''}
      </section>

      <section class="card stack" aria-labelledby="set-data">
        <h2 id="set-data">${icon('download')} ${t('Deine Daten')}</h2>
        <p class="muted small">${signedIn
          ? t('Deine Daten liegen auf diesem Gerät und in deinem Konto. Abmelden entfernt sie von diesem Gerät, „Konto löschen“ auch vom Server.')
          : t('Alles bleibt auf diesem Gerät. Sichere deine Daten regelmäßig, z. B. bevor du das Handy wechselst.')}</p>
        <div class="row wrap gap">
          <button type="button" class="btn ghost sm" data-action="export">${icon('download')} ${t('Sichern')}</button>
          <label class="btn ghost sm file-btn">${icon('upload')} ${t('Wiederherstellen')}<input type="file" accept="application/json,.json" data-import hidden></label>
          ${signedIn ? '' : html`<button type="button" class="btn ghost sm danger-text" data-action="reset">${icon('trash')} ${t('Alles löschen')}</button>`}
        </div>
      </section>

      <p class="legal muted small">SchoolBuddy 1.0 · ${t('Deine Schule. Dein Plan. Dein Erfolg.')}</p>
    `);

    aiStatus(true).then((status) => {
      const el = root.querySelector('[data-ai-info]');
      if (!el) return;
      if (status.available) {
        el.textContent = `${t('Buddy ist bereit.')}${typeof status.remaining === 'number' ? ` ${t('Heute noch {remaining} von {limit} Anfragen frei.', { remaining: status.remaining, limit: status.limit })}` : ''}`;
      } else if (status.paused) {
        el.textContent = t('Buddy macht diese Woche Pause: Das KI-Budget ist aufgebraucht. Ab Montag geht es weiter.');
      } else {
        el.textContent = t('Buddy ist gerade nicht erreichbar. Planer, Karteikarten und Ziele funktionieren trotzdem.');
      }
    });

    const saved = () => toast(t('Gespeichert'), { timeout: 1500 });

    root.onchange = async (e) => {
      const el = e.target;
      if (el.matches('[data-import]')) {
        const file = el.files[0];
        if (!file) return;
        const message = accountInfo().user
          ? t('Die aktuellen Daten auf diesem Gerät und in deinem Konto werden durch die Sicherung ersetzt.')
          : t('Die aktuellen Daten auf diesem Gerät werden durch die Sicherung ersetzt.');
        if (!(await confirmDialog(message, { confirmText: t('Wiederherstellen'), danger: false }))) return;
        try {
          importJSON(await file.text());
          toast(t('Sicherung wiederhergestellt ✓'));
          ctx.refresh();
        } catch (ex) {
          toast(ex.message || t('Die Datei konnte nicht gelesen werden.'));
        }
        return;
      }
      if (el.name === 'lang') {
        setLang(el.value);
        return;
      }
      if (el.name === 'grade') update((x) => { x.profile.grade = Number(el.value); });
      else if (el.name === 'sessionMinutes') update((x) => { x.settings.sessionMinutes = Number(el.value); });
      else if (el.name?.startsWith('day-')) {
        update((x) => { x.settings.minutesByWeekday[Number(el.name.slice(4))] = Number(el.value); });
        ctx.refresh();
      } else if (el.name === 'reminderTime') update((x) => { x.settings.reminderTime = el.value || '16:00'; });
      else if (el.name === 'theme') {
        update((x) => { x.settings.theme = el.value; });
        ctx.refresh();
      } else if (el.name === 'reminders') {
        if (el.checked) {
          const result = await enableNotifications();
          update((x) => { x.settings.reminders = result.permission === 'granted'; });
          if (result.permission !== 'granted') toast(t('Ohne Erlaubnis kann SchoolBuddy keine Benachrichtigungen senden.'));
          else toast(result.background ? t('Erinnerungen sind an 🔔') : t('Erinnerungen sind an. Hintergrund-Prüfung wird von diesem Gerät nicht unterstützt – nutze zusätzlich den Kalender-Export.'), { timeout: 6000 });
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
          toast(t('Abgemeldet. Deine Daten sind sicher in deinem Konto.'));
          location.hash = '#/today';
        }
      } else if (action === 'delete-account') {
        if (await confirmDialog(t('Dein Konto und alle darin gespeicherten Lerndaten werden endgültig gelöscht. Die Daten auf diesem Gerät bleiben erhalten.'), { confirmText: t('Konto löschen') })) {
          try {
            await deleteAccount();
            toast(t('Konto gelöscht.'));
          } catch (ex) {
            toast(ex.message);
          }
          ctx.refresh();
        }
      } else if (action === 'subject') {
        const name = a.dataset.name;
        const current = getState().profile.subjects;
        if (current.includes(name) && current.length === 1) return toast(t('Mindestens ein Fach brauchst du.'));
        update((x) => { x.profile.subjects = current.includes(name) ? current.filter((y) => y !== name) : [...current, name]; });
        ctx.refresh();
      } else if (action === 'test-notification') testNotification().catch(() => toast(t('Test fehlgeschlagen.')));
      else if (action === 'ics') downloadFile(`schoolbuddy-${todayISO()}.ics`, buildICS(getState()), 'text/calendar;charset=utf-8');
      else if (action === 'install') {
        await promptInstall();
        ctx.refresh();
      } else if (action === 'revoke-ai') {
        update((x) => { x.meta.aiConsent = false; });
        toast(t('Einwilligung zurückgenommen. Vor der nächsten KI-Nutzung fragen wir erneut.'));
        ctx.refresh();
      } else if (action === 'export') {
        downloadFile(`schoolbuddy-sicherung-${todayISO()}.json`, exportJSON());
        toast(t('Sicherung heruntergeladen ✓'));
      } else if (action === 'reset') {
        if (await confirmDialog(t('Wirklich alle Prüfungen, Karteikarten, Ziele und Einstellungen auf diesem Gerät löschen? Das lässt sich nicht rückgängig machen.'), { confirmText: t('Alles löschen') })) {
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
