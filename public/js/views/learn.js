// Lernen: Karteikarten (Leitner) und Quiz (KI oder aus Karteikarten).
import { getState, update, uid, logActivity } from '../store.js';
import { todayISO } from '../dates.js';
import { html, icon, ring, toast, openModal, confirmDialog, subjectDot, resizeImage, bar } from '../ui.js';
import { tabs, pageHead, emptyState, sectionHead } from '../components.js';
import { subjectOptions } from '../forms.js';
import { dueCards, rateCard, MAX_BOX } from '../srs.js';
import { askAI, ensureConsent } from '../ai.js';
import { topicScores } from '../stats.js';
import { t, subjectName } from '../i18n.js';

const TABS = [
  { id: 'cards', label: t('Karteikarten'), href: '#/learn' },
  { id: 'quiz', label: t('Quiz'), href: '#/learn/quiz' },
];

let review = null; // laufende Wiederholung
let quiz = null; // laufendes Quiz

// Eigene Texte statt plural(): „Karte“ allein ist auch die Beschriftung eines Knopfes.
const cardCount = (n) => (n === 1 ? t('1 Karte') : t('{n} Karten', { n }));

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export default {
  render(root, ctx) {
    const [section, id] = ctx.params;
    if (section === 'deck') return renderDeck(root, ctx, id);
    if (section === 'review') return renderReview(root, ctx, id);
    if (section === 'quiz') return renderQuiz(root, ctx);
    return renderDecks(root, ctx);
  },
};

// --- Stapelübersicht -----------------------------------------------------

function renderDecks(root, ctx) {
  review = null;
  const s = getState();
  const today = todayISO();
  const due = s.decks.reduce((n, d) => n + dueCards(d, today).length, 0);
  root.innerHTML = String(html`
    ${pageHead(t('Lernen'))}${tabs(TABS, 'cards')}
    ${due ? html`<div class="card highlight row between">
      <div><strong>${t('{cards} fällig', { cards: cardCount(due) })}</strong><p class="small">${t('Wiederhole sie jetzt, dann bleibt alles im Kopf.')}</p></div>
      <a class="btn light" href="#/learn/review/all">${icon('play')} ${t('Los')}</a></div>` : ''}
    <div class="row wrap gap">
      <button type="button" class="btn primary" data-action="new-deck">${icon('plus')} ${t('Neuer Stapel')}</button>
      <button type="button" class="btn ghost" data-action="ai-cards">${icon('sparkles')} ${t('Aus Lernzettel erstellen')}</button>
    </div>
    ${s.decks.length
      ? html`<div class="stack-sm section">${s.decks.map((d) => deckRow(d, today))}</div>`
      : emptyState('cards', t('Noch keine Karteikarten'), t('Leg einen Stapel an oder lass die KI aus deinem Lernzettel Karteikarten erstellen. Wiederholt wird nach dem Karteikasten-Prinzip: Was du weißt, kommt seltener dran.'))}
  `);
  root.onclick = (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'new-deck') openDeckForm(null, (deck) => ctx.navigate(`learn/deck/${deck.id}`));
    if (a.dataset.action === 'ai-cards') openAiCards(null, (deck) => ctx.navigate(`learn/deck/${deck.id}`));
  };
}

function deckRow(d, today) {
  const due = dueCards(d, today).length;
  const counts = Array.from({ length: MAX_BOX }, (_, i) => d.cards.filter((c) => (c.box || 1) === i + 1).length);
  return html`<a class="deck" href="#/learn/deck/${d.id}">
    <span class="deck-main"><span class="deck-title">${subjectDot(d.subject)}${d.name}</span>
      <span class="muted small">${subjectName(d.subject)} · ${cardCount(d.cards.length)}${due ? ` · ${t('{n} fällig', { n: due })}` : ''}</span>
      ${d.cards.length ? html`<span class="boxes" aria-label="${t('Verteilung auf die Fächer 1 bis 5')}">${counts.map((n, i) => html`<span style="flex:${n || 0.001}" class="box-${i + 1}" title="${t('Fach {box}: {n}', { box: i + 1, n })}"></span>`)}</span>` : ''}
    </span>
    ${due ? html`<span class="badge accent">${due}</span>` : ''}${icon('right', 'chev')}
  </a>`;
}

function openDeckForm(deck, onSaved) {
  const isNew = !deck;
  openModal({
    title: isNew ? t('Neuer Stapel') : t('Stapel bearbeiten'),
    body: html`<form class="stack">
      <label class="field"><span>${t('Name')}</span><input name="name" value="${deck?.name || ''}" required maxlength="60" placeholder="${t('z. B. Englisch Unit 3 Vokabeln')}" autofocus></label>
      <label class="field"><span>${t('Fach')}</span><select name="subject">${subjectOptions(deck?.subject || getState().profile.subjects[0])}</select></label>
      <div class="row end">
        ${isNew ? '' : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} ${t('Löschen')}</button>`}
        <button class="btn primary">${t('Speichern')}</button></div>
    </form>`,
    onMount(m, close) {
      const form = m.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const name = String(f.get('name')).trim();
        if (!name) return;
        const saved = update((s) => {
          if (isNew) {
            const d = { id: uid(), name, subject: String(f.get('subject')), cards: [], createdOn: todayISO() };
            s.decks.push(d);
            return d;
          }
          const d = s.decks.find((x) => x.id === deck.id);
          Object.assign(d, { name, subject: String(f.get('subject')) });
          return d;
        });
        close();
        onSaved?.(saved);
      });
      m.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog(t('Den Stapel „{name}“ mit {cards} löschen?', { name: deck.name, cards: cardCount(deck.cards.length) }))) {
          update((s) => { s.decks = s.decks.filter((x) => x.id !== deck.id); });
          toast(t('Stapel gelöscht'));
          location.hash = '#/learn';
        }
      });
    },
  });
}

// --- Stapel-Details -------------------------------------------------------

function renderDeck(root, ctx, id) {
  review = null;
  const s = getState();
  const deck = s.decks.find((d) => d.id === id);
  if (!deck) {
    root.innerHTML = String(emptyState('cards', t('Stapel nicht gefunden'), t('Vielleicht wurde er gelöscht.'), html`<a class="btn primary" href="#/learn">${t('Zur Übersicht')}</a>`));
    return;
  }
  const today = todayISO();
  const due = dueCards(deck, today).length;
  root.innerHTML = String(html`
    <a class="back" href="#/learn">${icon('left')} ${t('Alle Stapel')}</a>
    ${pageHead(deck.name, `${subjectName(deck.subject)} · ${cardCount(deck.cards.length)}`, html`<button type="button" class="icon-btn" data-action="edit-deck" aria-label="${t('Stapel bearbeiten')}">${icon('edit')}</button>`)}
    <div class="grid-2 section">
      <a class="btn primary ${deck.cards.length ? '' : 'disabled'}" href="#/learn/review/${deck.id}" ${deck.cards.length ? '' : html`aria-disabled="true" tabindex="-1"`}>${icon('play')} ${due ? t('{n} fällige lernen', { n: due }) : t('Üben')}</a>
      <button type="button" class="btn ghost" data-action="deck-quiz" ${deck.cards.length >= 4 ? '' : 'disabled'}>${icon('target')} ${t('Quiz')}</button>
    </div>
    <div class="row wrap gap">
      <button type="button" class="btn ghost sm" data-action="add-card">${icon('plus')} ${t('Karte')}</button>
      <button type="button" class="btn ghost sm" data-action="ai-cards">${icon('sparkles')} ${t('Aus Lernzettel')}</button>
    </div>
    ${deck.cards.length < 4 && deck.cards.length ? html`<p class="muted small">${t('Ab 4 Karten kannst du ein Quiz daraus machen.')}</p>` : ''}
    ${deck.cards.length
      ? html`<ul class="list section">${deck.cards.map((c) => html`<li class="card-row">
          <button type="button" class="card-row-main" data-action="edit-card" data-id="${c.id}">
            <span class="card-front">${c.front}</span><span class="card-back muted">${c.back}</span></button>
          <span class="box-badge box-${c.box || 1}" title="${t('Fach {box} von {max}', { box: c.box || 1, max: MAX_BOX })}">${c.box || 1}</span>
        </li>`)}</ul>`
      : emptyState('cards', t('Der Stapel ist leer'), t('Füge Karten hinzu: vorne die Frage oder der Begriff, hinten die Antwort.'))}
  `);
  root.onclick = (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    const { action } = a.dataset;
    if (action === 'edit-deck') openDeckForm(deck, ctx.refresh);
    if (action === 'add-card') openCardForm(deck, null, ctx.refresh);
    if (action === 'edit-card') openCardForm(deck, deck.cards.find((c) => c.id === a.dataset.id), ctx.refresh);
    if (action === 'ai-cards') openAiCards(deck, ctx.refresh);
    if (action === 'deck-quiz') {
      startDeckQuiz(deck);
      ctx.navigate('learn/quiz');
    }
  };
}

function openCardForm(deck, card, onSaved) {
  const isNew = !card;
  openModal({
    title: isNew ? t('Neue Karte') : t('Karte bearbeiten'),
    body: html`<form class="stack">
      <label class="field"><span>${t('Vorderseite (Frage oder Begriff)')}</span><textarea name="front" rows="2" required maxlength="300" autofocus>${card?.front || ''}</textarea></label>
      <label class="field"><span>${t('Rückseite (Antwort)')}</span><textarea name="back" rows="3" required maxlength="600">${card?.back || ''}</textarea></label>
      <div class="row end">
        ${isNew ? html`<label class="check-row small"><input type="checkbox" name="again" checked> <span>${t('Danach weitere Karte')}</span></label>` : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} ${t('Löschen')}</button>`}
        <button class="btn primary">${t('Speichern')}</button></div>
    </form>`,
    onMount(m, close) {
      const form = m.querySelector('form');
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const front = String(f.get('front')).trim();
        const back = String(f.get('back')).trim();
        if (!front || !back) return;
        update((s) => {
          const d = s.decks.find((x) => x.id === deck.id);
          if (isNew) d.cards.push({ id: uid(), front, back, box: 1, due: todayISO(), reviews: 0, lapses: 0 });
          else Object.assign(d.cards.find((c) => c.id === card.id), { front, back });
        });
        if (isNew && f.get('again')) {
          form.reset();
          form.querySelector('[name="again"]').checked = true;
          form.querySelector('[name="front"]').focus();
          toast(t('Karte gespeichert'));
          onSaved?.();
          return;
        }
        close();
        onSaved?.();
      });
      m.querySelector('[data-delete]')?.addEventListener('click', () => {
        update((s) => {
          const d = s.decks.find((x) => x.id === deck.id);
          d.cards = d.cards.filter((c) => c.id !== card.id);
        });
        close();
        toast(t('Karte gelöscht'));
        onSaved?.();
      });
    },
  });
}

/** KI erstellt Karteikarten aus einem Lernzettel (Text oder Foto). */
function openAiCards(deck, onSaved) {
  let image = null;
  let suggestions = null;
  openModal({
    title: t('Karteikarten aus Lernzettel'),
    body: html`<div class="stack" data-step="input">
      <p class="muted small">${t('Füge deinen Lernzettel ein oder fotografiere ihn. Die KI macht daraus Karteikarten, die du vor dem Speichern prüfen kannst.')}</p>
      ${deck ? '' : html`<div class="grid-2">
        <label class="field"><span>${t('Fach')}</span><select name="subject">${subjectOptions(getState().profile.subjects[0])}</select></label>
        <label class="field"><span>${t('Name des Stapels')}</span><input name="deckName" maxlength="60" placeholder="${t('z. B. Bio: Zelle')}"></label></div>`}
      <label class="field"><span>${t('Text vom Lernzettel')}</span><textarea name="text" rows="6" maxlength="12000" placeholder="${t('Hier deinen Lernzettel einfügen …')}"></textarea></label>
      <div class="row wrap gap">
        <label class="btn ghost sm file-btn">${icon('camera')} ${t('Foto statt Text')}<input type="file" name="photo" accept="image/*" capture="environment" hidden></label>
        <span class="small muted" data-photo-name></span>
      </div>
      <img class="preview" alt="${t('Vorschau des Lernzettels')}" hidden>
      <label class="field"><span>${t('Wie viele Karten?')}</span><select name="count"><option>10</option><option selected>15</option><option>25</option></select></label>
      <p class="form-error" role="alert" hidden></p>
      <button type="button" class="btn primary block" data-generate>${icon('sparkles')} ${t('Karten erstellen')}</button>
    </div>`,
    onMount(m, close) {
      const err = m.querySelector('.form-error');
      const showError = (msg) => {
        err.textContent = msg;
        err.hidden = !msg;
      };
      m.querySelector('[name="photo"]').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          image = await resizeImage(file);
          const img = m.querySelector('.preview');
          img.src = image;
          img.hidden = false;
          m.querySelector('[data-photo-name]').textContent = t('Foto ausgewählt');
        } catch (ex) {
          showError(ex.message);
        }
      });
      m.querySelector('[data-generate]').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        const text = m.querySelector('[name="text"]').value.trim();
        if (!text && !image) return showError(t('Füge Text ein oder wähle ein Foto aus.'));
        showError('');
        if (!(await ensureConsent())) return;
        const subject = deck?.subject || m.querySelector('[name="subject"]').value;
        btn.disabled = true;
        btn.innerHTML = String(html`<span class="spinner"></span> ${t('Buddy erstellt Karten …')}`);
        try {
          const data = await askAI('cards', { subject, text, image, count: Number(m.querySelector('[name="count"]').value) });
          suggestions = data.cards;
          showSuggestions(m, suggestions, deck, subject, close, onSaved);
        } catch (ex) {
          showError(ex.message);
          btn.disabled = false;
          btn.innerHTML = String(html`${icon('sparkles')} ${t('Nochmal versuchen')}`);
        }
      });
    },
  });
}

function showSuggestions(m, cards, deck, subject, close, onSaved) {
  const deckName = deck ? '' : m.querySelector('[name="deckName"]').value.trim();
  const body = m.querySelector('.modal-body');
  body.innerHTML = String(html`<div class="stack">
    <p><strong>${t('{cards} erstellt.', { cards: cardCount(cards.length) })}</strong> ${t('Entferne die Haken bei Karten, die du nicht brauchst.')}</p>
    <ul class="list suggestions">${cards.map((c, i) => html`<li><label class="check-row"><input type="checkbox" checked data-i="${i}">
      <span><strong>${c.front}</strong><br><span class="muted">${c.back}</span></span></label></li>`)}</ul>
    <button type="button" class="btn primary block" data-save>${t('Ausgewählte speichern')}</button>
  </div>`);
  body.querySelector('[data-save]').addEventListener('click', () => {
    const chosen = [...body.querySelectorAll('input[data-i]:checked')].map((x) => cards[Number(x.dataset.i)]);
    if (!chosen.length) return close();
    const saved = update((s) => {
      let d = deck && s.decks.find((x) => x.id === deck.id);
      if (!d) {
        d = { id: uid(), name: deckName || t('{subject} – Karteikarten', { subject: subjectName(subject) }), subject, cards: [], createdOn: todayISO() };
        s.decks.push(d);
      }
      for (const c of chosen) d.cards.push({ id: uid(), front: c.front, back: c.back, box: 1, due: todayISO(), reviews: 0, lapses: 0 });
      return d;
    });
    close();
    toast(`${t('{cards} gespeichert', { cards: cardCount(chosen.length) })} ✨`);
    onSaved?.(saved);
  });
}

// --- Wiederholen ---------------------------------------------------------

function startReview(id) {
  const s = getState();
  const today = todayISO();
  const decks = id === 'all' ? s.decks : s.decks.filter((d) => d.id === id);
  let items = decks.flatMap((d) => dueCards(d, today).map((c) => ({ deckId: d.id, cardId: c.id })));
  const practice = !items.length;
  if (practice) items = decks.flatMap((d) => d.cards.map((c) => ({ deckId: d.id, cardId: c.id })));
  review = { id, queue: shuffle(items).slice(0, 50), index: 0, flipped: false, known: 0, again: 0, wrong: new Set(), practice };
}

function renderReview(root, ctx, id) {
  if (!review || review.id !== id) startReview(id);
  const s = getState();
  const back = id === 'all' ? '#/learn' : `#/learn/deck/${id}`;
  const item = review.queue[review.index];

  if (!review.queue.length) {
    root.innerHTML = String(html`<a class="back" href="${back}">${icon('left')} ${t('Zurück')}</a>
      ${emptyState('cards', t('Keine Karten zum Wiederholen'), t('Lege zuerst Karteikarten an.'))}`);
    review = null;
    return;
  }
  if (!item) {
    const total = review.known + review.again;
    root.innerHTML = String(html`<div class="result">
      ${ring(100, { size: 110, stroke: 10 })}
      <h1>${t('Geschafft! 🎉')}</h1>
      <p>${total === 1
        ? t('1 Antwort: {known} gewusst, {again}× nochmal.', { known: review.known, again: review.again })
        : t('{n} Antworten: {known} gewusst, {again}× nochmal.', { n: total, known: review.known, again: review.again })}</p>
      <p class="muted">${t('Karten, die du wusstest, kommen erst in ein paar Tagen wieder dran.')}</p>
      <a class="btn primary" href="${back}">${t('Fertig')}</a></div>`);
    review = null;
    return;
  }

  const deck = s.decks.find((d) => d.id === item.deckId);
  const card = deck?.cards.find((c) => c.id === item.cardId);
  if (!card) {
    review.index++;
    return renderReview(root, ctx, id);
  }
  root.innerHTML = String(html`
    <div class="row between"><a class="back" href="${back}">${icon('x')} ${t('Beenden')}</a>
      <span class="muted small">${review.index + 1} / ${review.queue.length}${review.practice ? ` · ${t('Übungsrunde')}` : ''}</span></div>
    ${bar((review.index / review.queue.length) * 100)}
    <button type="button" class="flashcard ${review.flipped ? 'flipped' : ''}" data-action="flip" aria-live="polite">
      <span class="face front" ${review.flipped ? html`aria-hidden="true"` : ''}><small>${subjectDot(deck.subject)}${deck.name}</small><span class="face-text">${card.front}</span><small class="muted">${t('Tippen zum Umdrehen')}</small></span>
      <span class="face back" ${review.flipped ? '' : html`aria-hidden="true"`}><small>${t('Antwort')}</small><span class="face-text">${card.back}</span></span>
    </button>
    ${review.flipped
      ? html`<div class="grid-2 rate">
          <button type="button" class="btn danger lg" data-action="again">${icon('refresh')} ${t('Nochmal')}</button>
          <button type="button" class="btn success lg" data-action="knew">${icon('check')} ${t('Gewusst')}</button></div>`
      : html`<button type="button" class="btn primary block lg" data-action="flip">${t('Antwort zeigen')}</button>`}
    <p class="muted small center">${t('Fach {box} von {max}. Tastatur: Leertaste dreht um, 1 = nochmal, 2 = gewusst.', { box: card.box || 1, max: MAX_BOX })}</p>
  `);

  const rate = (knew) => {
    update((st) => {
      const c = st.decks.find((d) => d.id === item.deckId)?.cards.find((x) => x.id === item.cardId);
      if (c) rateCard(c, knew, todayISO(), review.wrong.has(item.cardId));
      logActivity(st, 'cards', 1);
    });
    if (knew) review.known++;
    else {
      review.again++;
      review.wrong.add(item.cardId);
      review.queue.push(item);
    }
    review.index++;
    review.flipped = false;
    renderReview(root, ctx, id);
  };
  root.onclick = (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'flip') {
      review.flipped = !review.flipped;
      renderReview(root, ctx, id);
    }
    if (a.dataset.action === 'knew') rate(true);
    if (a.dataset.action === 'again') rate(false);
  };
  root.onkeydown = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === ' ' && !review.flipped) {
      e.preventDefault();
      review.flipped = true;
      renderReview(root, ctx, id);
    } else if (review.flipped && e.key === '1') rate(false);
    else if (review.flipped && e.key === '2') rate(true);
  };
  root.querySelector('.flashcard').focus({ preventScroll: true });
}

// --- Quiz ----------------------------------------------------------------

function startDeckQuiz(deck) {
  const cards = shuffle(deck.cards).slice(0, 10);
  const questions = cards.map((c) => {
    const wrong = shuffle(deck.cards.filter((x) => x.id !== c.id && x.back !== c.back).map((x) => x.back));
    const options = shuffle([c.back, ...[...new Set(wrong)].slice(0, 3)]);
    return { question: c.front, options, correct: options.indexOf(c.back), explanation: '' };
  });
  quiz = { phase: 'run', source: 'deck', subject: deck.subject, topic: deck.name, questions, index: 0, answers: [] };
}

function renderQuiz(root, ctx) {
  const topic = ctx.query.get('topic');
  if (topic && quiz?.phase !== 'loading') {
    // Vorbelegung aus „Wissenslücken“, danach den Link bereinigen.
    quiz = { phase: 'setup', source: 'ai', subject: ctx.query.get('subject') || undefined, topic };
    history.replaceState(null, '', '#/learn/quiz');
  }
  if (quiz?.phase === 'run') return renderQuestion(root, ctx);
  if (quiz?.phase === 'result') return renderResult(root, ctx);
  renderQuizSetup(root, ctx);
}

function renderQuizSetup(root, ctx) {
  const s = getState();
  const today = todayISO();
  const subject = quiz?.subject || s.profile.subjects[0] || 'Mathe';
  const examTopics = s.exams
    .filter((e) => e.date >= today)
    .flatMap((e) => (e.topics || []).map((x) => ({ subject: e.subject, topic: x.name })));
  const weak = topicScores(s.quizzes).filter((x) => x.pct < 70).slice(0, 4);
  const suggestions = [...examTopics, ...weak.map((w) => ({ subject: w.subject, topic: w.topic }))]
    .filter((x, i, arr) => arr.findIndex((y) => y.subject === x.subject && y.topic === x.topic) === i)
    .slice(0, 8);
  const decks = s.decks.filter((d) => d.cards.length >= 4);
  const recent = [...s.quizzes].reverse().slice(0, 5);
  const levels = [['leicht', t('Leicht')], ['mittel', t('Mittel')], ['schwer', t('Schwer')]];

  root.innerHTML = String(html`
    ${pageHead(t('Lernen'))}${tabs(TABS, 'quiz')}
    <form class="card stack" data-form="quiz">
      <h2>${icon('sparkles')} ${t('KI-Quiz erstellen')}</h2>
      <div class="grid-2">
        <label class="field"><span>${t('Fach')}</span><select name="subject">${subjectOptions(subject)}</select></label>
        <label class="field"><span>${t('Wie viele Fragen?')}</span><select name="count"><option>5</option><option selected>10</option><option>15</option></select></label>
      </div>
      <label class="field"><span>${t('Thema')}</span><input name="topic" required maxlength="120" value="${quiz?.topic && quiz.source === 'ai' ? quiz.topic : ''}" placeholder="${t('z. B. Satz des Pythagoras')}"></label>
      ${suggestions.length ? html`<div class="chips small">${suggestions.map((x) => html`<button type="button" class="chip" data-action="topic" data-subject="${x.subject}" data-topic="${x.topic}">${subjectDot(x.subject)}${x.topic}</button>`)}</div>` : ''}
      <fieldset class="field"><legend>${t('Schwierigkeit')}</legend><div class="choice">
        ${levels.map(([v, l]) => html`<label><input type="radio" name="difficulty" value="${v}" ${v === (quiz?.difficulty || 'mittel') ? 'checked' : ''}><span>${l}</span></label>`)}
      </div></fieldset>
      ${quiz?.error ? html`<p class="form-error" role="alert">${quiz.error}</p>` : ''}
      <button class="btn primary block" ${quiz?.phase === 'loading' ? 'disabled' : ''}>${quiz?.phase === 'loading' ? html`<span class="spinner"></span> ${t('Buddy denkt sich Fragen aus …')}` : html`${icon('sparkles')} ${t('Quiz starten')}`}</button>
    </form>
    ${decks.length ? html`<section class="section">${sectionHead(t('Quiz aus deinen Karteikarten'))}
      <div class="chips">${decks.map((d) => html`<button type="button" class="chip" data-action="deck-quiz" data-id="${d.id}">${subjectDot(d.subject)}${d.name}</button>`)}</div></section>` : ''}
    ${recent.length ? html`<section class="section">${sectionHead(t('Letzte Ergebnisse'), html`<a class="link" href="#/progress">${t('Fortschritt')}</a>`)}
      <ul class="list">${recent.map((q) => html`<li class="result-row">${subjectDot(q.subject)}<span class="grow">${q.topic}<span class="muted small"> · ${subjectName(q.subject)}</span></span>
        <span class="badge ${q.score / q.total >= 0.7 ? 'success' : 'warn'}">${q.score}/${q.total}</span></li>`)}</ul></section>` : ''}
  `);

  root.onclick = (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'topic') {
      root.querySelector('[name="topic"]').value = a.dataset.topic;
      const sel = root.querySelector('[name="subject"]');
      if ([...sel.options].some((o) => o.value === a.dataset.subject)) sel.value = a.dataset.subject;
    }
    if (a.dataset.action === 'deck-quiz') {
      startDeckQuiz(getState().decks.find((d) => d.id === a.dataset.id));
      ctx.refresh();
    }
  };
  root.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const params = {
      subject: String(f.get('subject')),
      topic: String(f.get('topic')).trim(),
      difficulty: String(f.get('difficulty')),
      count: Number(f.get('count')),
    };
    if (!params.topic) return;
    if (!(await ensureConsent())) return;
    quiz = { phase: 'loading', source: 'ai', ...params };
    ctx.refresh();
    try {
      const data = await askAI('quiz', params);
      quiz = { ...quiz, phase: 'run', questions: data.questions, index: 0, answers: [] };
    } catch (ex) {
      quiz = { ...quiz, phase: 'setup', error: ex.message };
    }
    if (location.hash.startsWith('#/learn/quiz')) ctx.refresh();
  };
}

function renderQuestion(root, ctx) {
  const q = quiz.questions[quiz.index];
  const answer = quiz.answers[quiz.index];
  const answered = answer !== undefined;
  root.innerHTML = String(html`
    <div class="row between"><button type="button" class="back" data-action="quit">${icon('x')} ${t('Beenden')}</button>
      <span class="muted small">${t('Frage {n} von {total}', { n: quiz.index + 1, total: quiz.questions.length })}</span></div>
    ${bar((quiz.index / quiz.questions.length) * 100)}
    <p class="muted small">${subjectDot(quiz.subject)}${subjectName(quiz.subject)} · ${quiz.topic}</p>
    <h2 class="question">${q.question}</h2>
    <div class="options">${q.options.map((o, i) => {
      let cls = '';
      if (answered && i === q.correct) cls = 'correct';
      else if (answered && i === answer) cls = 'wrong';
      return html`<button type="button" class="option ${cls}" data-action="answer" data-i="${i}" ${answered ? 'disabled' : ''}>
        <span class="option-letter">${'ABCD'[i]}</span><span>${o}</span></button>`;
    })}</div>
    ${answered ? html`<div class="feedback ${answer === q.correct ? 'good' : 'bad'}" role="status">
        <strong>${answer === q.correct ? t('Richtig! 🎉') : t('Leider falsch.')}</strong>
        ${q.explanation ? html`<p>${q.explanation}</p>` : answer === q.correct ? '' : html`<p>${t('Richtig ist: {answer}', { answer: q.options[q.correct] })}</p>`}</div>
      <button type="button" class="btn primary block lg" data-action="next">${quiz.index + 1 < quiz.questions.length ? t('Weiter') : t('Ergebnis ansehen')}</button>` : ''}
  `);
  root.onclick = async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'answer' && !answered) {
      quiz.answers[quiz.index] = Number(a.dataset.i);
      renderQuestion(root, ctx);
      root.querySelector('[data-action="next"]')?.focus();
    }
    if (a.dataset.action === 'next') {
      quiz.index++;
      if (quiz.index >= quiz.questions.length) finishQuiz();
      ctx.refresh();
    }
    if (a.dataset.action === 'quit' && (await confirmDialog(t('Quiz abbrechen? Dein Ergebnis wird nicht gespeichert.'), { confirmText: t('Quiz beenden') }))) {
      quiz = { phase: 'setup', subject: quiz.subject, topic: quiz.topic, difficulty: quiz.difficulty, source: quiz.source };
      ctx.refresh();
    }
  };
}

function finishQuiz() {
  const score = quiz.questions.filter((q, i) => quiz.answers[i] === q.correct).length;
  quiz.phase = 'result';
  quiz.score = score;
  update((s) => {
    s.quizzes.push({ id: uid(), date: todayISO(), subject: quiz.subject, topic: quiz.topic, score, total: quiz.questions.length, source: quiz.source });
    if (s.quizzes.length > 300) s.quizzes.splice(0, s.quizzes.length - 300);
    logActivity(s, 'quizzes', 1);
  });
}

function renderResult(root, ctx) {
  const total = quiz.questions.length;
  const pct = Math.round((quiz.score / total) * 100);
  const wrong = quiz.questions.map((q, i) => ({ q, a: quiz.answers[i] })).filter((x) => x.a !== x.q.correct);
  const message = pct === 100 ? t('Perfekt! Alles richtig! 🏆') : pct >= 80 ? t('Super gemacht! 💪') : pct >= 50 ? t('Gut, da geht noch was! 📈') : t('Dranbleiben – Übung macht den Meister! 🌱');
  root.innerHTML = String(html`
    <div class="result">
      <div class="ring-wrap">${ring(pct, { size: 120, stroke: 11, label: t('{n} Prozent richtig', { n: pct }) })}<span class="ring-label big"><strong>${quiz.score}/${total}</strong></span></div>
      <h1>${message}</h1>
      <p class="muted">${subjectName(quiz.subject)} · ${quiz.topic}</p>
    </div>
    ${wrong.length ? html`<section class="section">${sectionHead(t('Das solltest du wiederholen'))}
      <ul class="list">${wrong.map(({ q, a }) => html`<li class="review-item"><strong>${q.question}</strong>
        <span class="small">${t('Deine Antwort:')} <span class="danger-text">${q.options[a]}</span></span>
        <span class="small">${t('Richtig:')} <span class="success-text">${q.options[q.correct]}</span></span>
        ${q.explanation ? html`<span class="small muted">${q.explanation}</span>` : ''}</li>`)}</ul>
      ${quiz.source === 'ai' ? html`<button type="button" class="btn ghost block" data-action="to-cards">${icon('cards')} ${t('Als Karteikarten speichern')}</button>` : ''}
    </section>` : ''}
    <div class="grid-2 section">
      <button type="button" class="btn ghost" data-action="again">${icon('refresh')} ${t('Nochmal')}</button>
      <button type="button" class="btn primary" data-action="new">${t('Neues Quiz')}</button>
    </div>
  `);
  root.onclick = (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'again') {
      quiz = { ...quiz, phase: 'run', index: 0, answers: [], questions: shuffle(quiz.questions) };
      ctx.refresh();
    }
    if (a.dataset.action === 'new') {
      quiz = { phase: 'setup', subject: quiz.subject, difficulty: quiz.difficulty, source: 'ai' };
      ctx.refresh();
    }
    if (a.dataset.action === 'to-cards') {
      const deck = update((s) => {
        const name = `${subjectName(quiz.subject)}: ${quiz.topic}`.slice(0, 60);
        let d = s.decks.find((x) => x.name === name);
        if (!d) {
          d = { id: uid(), name, subject: quiz.subject, cards: [], createdOn: todayISO() };
          s.decks.push(d);
        }
        for (const { q } of wrong) {
          d.cards.push({ id: uid(), front: q.question, back: q.options[q.correct] + (q.explanation ? `\n\n${q.explanation}` : ''), box: 1, due: todayISO(), reviews: 0, lapses: 0 });
        }
        return d;
      });
      toast(t('{cards} im Stapel „{deck}“ gespeichert', { cards: cardCount(wrong.length), deck: deck.name }));
      a.disabled = true;
    }
  };
}
