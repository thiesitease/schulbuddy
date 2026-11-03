// Premium: Preismodell (Bezahlung folgt in einer späteren Version).
import { html, icon } from '../ui.js';
import { pageHead } from '../components.js';

const FREE = ['Automatischer Lernplan für alle Prüfungen', 'Hausaufgaben und Erinnerungen', 'Karteikarten ohne Limit', 'Fortschritt und Ziele', 'KI-Buddy mit Tageslimit'];
const PREMIUM = ['Deutlich mehr KI-Anfragen pro Tag', 'Unbegrenzt Quizze und Karteikarten per KI', 'Hausaufgaben-Scanner ohne Limit', 'Lernpakete für Klassenarbeiten', 'Synchronisation zwischen Geräten (geplant)'];

export default {
  render(root) {
    root.innerHTML = String(html`
      <a class="back" href="#/settings">${icon('left')} Einstellungen</a>
      ${pageHead('SchoolBuddy Premium', 'Mehr KI, mehr Quizze, mehr Erfolg.')}
      <div class="plans">
        <article class="plan">
          <h2>Kostenlos</h2>
          <p class="price"><strong>0 €</strong></p>
          <ul class="checklist">${FREE.map((f) => html`<li>${f}</li>`)}</ul>
          <span class="badge">Dein aktueller Plan</span>
        </article>
        <article class="plan featured">
          <span class="ribbon">Beliebt</span>
          <h2>${icon('crown')} Premium</h2>
          <p class="price"><strong>2,99 €</strong> / Monat</p>
          <p class="price-alt">oder <strong>19,99 €</strong> im Jahr – du sparst 44 %</p>
          <ul class="checklist">${PREMIUM.map((f) => html`<li>${f}</li>`)}</ul>
          <button type="button" class="btn light block" disabled>Bald verfügbar</button>
        </article>
      </div>
      <div class="card soft stack-sm">
        <h3>${icon('book')} Lernpakete</h3>
        <p class="small">Fertige Quizze und Karteikarten für typische Klassenarbeiten, z. B. „Mathe Klasse 8: Lineare Funktionen“ oder „Englisch: Irregular Verbs“. Einzeln kaufbar, sobald Premium startet.</p>
      </div>
      <p class="muted small">SchoolBuddy befindet sich in der Testphase. Premium und Lernpakete sind noch nicht buchbar. Du bekommst keine Kosten, ohne vorher ausdrücklich zuzustimmen.</p>
    `);
  },
};
