// Premium: Preismodell. Bis die Bezahlung kommt, ist die Seite nirgends verlinkt.
import { html, icon } from '../ui.js';
import { pageHead } from '../components.js';
import { t } from '../i18n.js';

const FREE = [t('Automatischer Lernplan für alle Prüfungen'), t('Hausaufgaben und Erinnerungen'), t('Karteikarten ohne Limit'), t('Fortschritt und Ziele'), t('KI-Buddy mit Tageslimit'), t('Abgleich zwischen deinen Geräten (mit Konto)')];
const PREMIUM = [t('Deutlich mehr KI-Anfragen pro Tag'), t('Unbegrenzt Quizze und Karteikarten per KI'), t('Hausaufgaben-Scanner ohne Limit'), t('Lernpakete für Klassenarbeiten')];

export default {
  render(root) {
    root.innerHTML = String(html`
      <a class="back" href="#/settings">${icon('left')} ${t('Einstellungen')}</a>
      ${pageHead('SchoolBuddy Premium', t('Mehr KI, mehr Quizze, mehr Erfolg.'))}
      <div class="plans">
        <article class="plan">
          <h2>${t('Kostenlos')}</h2>
          <p class="price"><strong>${t('0 €')}</strong></p>
          <ul class="checklist">${FREE.map((f) => html`<li>${f}</li>`)}</ul>
          <span class="badge">${t('Dein aktueller Plan')}</span>
        </article>
        <article class="plan featured">
          <h2>${icon('crown')} Premium</h2>
          <p class="price"><strong>${t('2,99 €')}</strong> ${t('/ Monat')}</p>
          <p class="price-alt">${t('oder')} <strong>${t('19,99 €')}</strong> ${t('im Jahr – du sparst 44 %')}</p>
          <ul class="checklist">${PREMIUM.map((f) => html`<li>${f}</li>`)}</ul>
          <button type="button" class="btn light block" disabled>${t('Bald verfügbar')}</button>
        </article>
      </div>
      <div class="card soft stack-sm">
        <h3>${icon('book')} ${t('Lernpakete')}</h3>
        <p class="small">${t('Fertige Quizze und Karteikarten für typische Klassenarbeiten, z. B. „Mathe Klasse 8: Lineare Funktionen“ oder „Englisch: Irregular Verbs“. Einzeln kaufbar, sobald Premium startet.')}</p>
      </div>
      <p class="muted small">${t('SchoolBuddy befindet sich in der Testphase. Premium und Lernpakete sind noch nicht buchbar. Du bekommst keine Kosten, ohne vorher ausdrücklich zuzustimmen.')}</p>
    `);
  },
};
