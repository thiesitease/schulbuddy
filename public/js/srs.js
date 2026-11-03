// Karteikasten nach dem Leitner-System: 5 Fächer, jedes Fach wird seltener wiederholt.
import { addDays } from './dates.js';

export const MAX_BOX = 5;
// Tage bis zur nächsten Wiederholung, Index = Fach.
export const BOX_DAYS = [0, 1, 2, 4, 8, 16];

export function isDue(card, today) {
  return (card.due || today) <= today;
}

export function dueCards(deck, today) {
  return deck.cards.filter((c) => isDue(c, today));
}

export function dueCount(decks, today) {
  return decks.reduce((sum, d) => sum + dueCards(d, today).length, 0);
}

/**
 * Bewertet eine Karte. Gewusst: ein Fach weiter. Nicht gewusst: zurück in Fach 1.
 * relearn = die Karte wurde in dieser Runde schon falsch beantwortet; dann bleibt sie in Fach 1.
 */
export function rateCard(card, knew, today, relearn = false) {
  card.reviews = (card.reviews || 0) + 1;
  card.last = today;
  if (!knew) {
    card.box = 1;
    card.lapses = (card.lapses || 0) + 1;
    card.due = today;
  } else if (relearn) {
    card.box = 1;
    card.due = addDays(today, BOX_DAYS[1]);
  } else {
    card.box = Math.min(MAX_BOX, (card.box || 1) + 1);
    card.due = addDays(today, BOX_DAYS[card.box]);
  }
  return card;
}
