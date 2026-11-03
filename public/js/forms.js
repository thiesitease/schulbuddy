// Formulare für Prüfungen und Hausaufgaben (als Bottom-Sheet).
import { getState, update, uid, SUBJECTS, EXAM_TYPES } from './store.js';
import { html, icon, openModal, toast, confirmDialog } from './ui.js';
import { todayISO, addDays, isValidISO } from './dates.js';
import { deleteExam, deleteHomework } from './actions.js';

export function subjectOptions(selected) {
  const mine = getState().profile.subjects;
  const others = SUBJECTS.filter((s) => !mine.includes(s));
  const extra = selected && !mine.includes(selected) && !SUBJECTS.includes(selected) ? [selected] : [];
  const opt = (s) => html`<option value="${s}" ${s === selected ? 'selected' : ''}>${s}</option>`;
  return html`<optgroup label="Deine Fächer">${[...mine, ...extra].map(opt)}</optgroup>
    ${others.length ? html`<optgroup label="Weitere Fächer">${others.map(opt)}</optgroup>` : ''}`;
}

const difficultyField = (value) => html`<fieldset class="field">
  <legend>Wie schwer ist der Stoff für dich?</legend>
  <div class="choice">${[[1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer']].map(
    ([v, label]) => html`<label><input type="radio" name="difficulty" value="${v}" ${Number(value) === v ? 'checked' : ''}><span>${label}</span></label>`,
  )}</div></fieldset>`;

/** Neue oder bestehende Prüfung bearbeiten. */
export function openExamForm(exam, onSaved, preset = {}) {
  const today = todayISO();
  const isNew = !exam;
  const e = exam || { subject: preset.subject || getState().profile.subjects[0] || 'Mathe', type: 'Klassenarbeit', date: addDays(today, 7), difficulty: 2, topics: [] };
  const past = !isNew && e.date < today;
  openModal({
    title: isNew ? 'Neue Prüfung' : 'Prüfung bearbeiten',
    body: html`<form class="stack" data-form="exam" novalidate>
      <div class="grid-2">
        <label class="field"><span>Fach</span><select name="subject">${subjectOptions(e.subject)}</select></label>
        <label class="field"><span>Art</span><select name="type">${EXAM_TYPES.map((t) => html`<option ${t === e.type ? 'selected' : ''}>${t}</option>`)}</select></label>
      </div>
      <label class="field"><span>Datum</span><input type="date" name="date" value="${e.date}" required></label>
      <label class="field"><span>Titel <em>(optional)</em></span><input name="title" value="${e.title || ''}" placeholder="z. B. Bruchrechnung" maxlength="80"></label>
      <label class="field"><span>Themen – eins pro Zeile</span>
        <textarea name="topics" rows="5" placeholder="z. B.\nBrüche kürzen und erweitern\nBrüche addieren\nTextaufgaben">${(e.topics || []).map((t) => t.name).join('\n')}</textarea>
        <small class="muted">SchulBuddy plant für jedes Thema eine Lern- und eine Wiederholungseinheit.</small></label>
      ${difficultyField(e.difficulty)}
      ${past ? html`<label class="field"><span>Note <em>(optional)</em></span><input name="grade" value="${e.grade || ''}" maxlength="6" placeholder="z. B. 2+"></label>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <div class="row end">
        ${isNew ? '' : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} Löschen</button>`}
        <button class="btn primary">${isNew ? 'Lernplan erstellen' : 'Speichern'}</button>
      </div>
    </form>`,
    onMount(m, close) {
      const form = m.querySelector('form');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(form);
        const date = String(f.get('date'));
        const error = form.querySelector('.form-error');
        if (!isValidISO(date)) {
          error.textContent = 'Bitte gib ein gültiges Datum ein.';
          error.hidden = false;
          return;
        }
        if (isNew && date <= today) {
          error.textContent = 'Das Datum muss in der Zukunft liegen, damit SchulBuddy einen Plan erstellen kann.';
          error.hidden = false;
          return;
        }
        const names = [...new Set(String(f.get('topics')).split('\n').map((t) => t.trim()).filter(Boolean))].slice(0, 20);
        const oldTopics = e.topics || [];
        const topics = names.map((name) => oldTopics.find((t) => t.name === name) || { id: uid().slice(0, 8), name });
        const data = {
          subject: String(f.get('subject')),
          type: String(f.get('type')),
          date,
          title: String(f.get('title')).trim(),
          topics,
          difficulty: Number(f.get('difficulty')) || 2,
        };
        if (f.has('grade')) data.grade = String(f.get('grade')).trim();
        update((s) => {
          if (isNew) s.exams.push({ id: uid(), createdOn: today, ...data });
          else Object.assign(s.exams.find((x) => x.id === e.id), data);
        });
        close();
        toast(isNew ? 'Lernplan erstellt ✨' : 'Gespeichert');
        onSaved?.();
      });
      m.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog('Diese Prüfung und ihren Lernplan löschen?')) {
          deleteExam(e.id);
          toast('Prüfung gelöscht');
          onSaved?.();
        }
      });
    },
  });
}

export function openHomeworkForm(hw, onSaved) {
  const today = todayISO();
  const isNew = !hw;
  const h = hw || { subject: getState().profile.subjects[0] || 'Mathe', text: '', due: addDays(today, 1) };
  openModal({
    title: isNew ? 'Neue Hausaufgabe' : 'Hausaufgabe bearbeiten',
    body: html`<form class="stack" novalidate>
      <label class="field"><span>Was ist zu tun?</span><input name="text" value="${h.text}" required maxlength="160" placeholder="z. B. Buch S. 42, Nr. 3–5" autofocus></label>
      <div class="grid-2">
        <label class="field"><span>Fach</span><select name="subject">${subjectOptions(h.subject)}</select></label>
        <label class="field"><span>Fällig am</span><input type="date" name="due" value="${h.due}" required></label>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <div class="row end">
        ${isNew ? '' : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} Löschen</button>`}
        <button class="btn primary">Speichern</button>
      </div>
    </form>`,
    onMount(m, close) {
      const form = m.querySelector('form');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const f = new FormData(form);
        const text = String(f.get('text')).trim();
        const due = String(f.get('due'));
        const error = form.querySelector('.form-error');
        if (!text || !isValidISO(due)) {
          error.textContent = text ? 'Bitte gib ein gültiges Datum ein.' : 'Bitte beschreib kurz die Aufgabe.';
          error.hidden = false;
          return;
        }
        const data = { text, subject: String(f.get('subject')), due };
        update((s) => {
          if (isNew) s.homework.push({ id: uid(), done: false, createdOn: today, ...data });
          else Object.assign(s.homework.find((x) => x.id === h.id), data);
        });
        close();
        toast('Gespeichert');
        onSaved?.();
      });
      m.querySelector('[data-delete]')?.addEventListener('click', () => {
        deleteHomework(h.id);
        close();
        toast('Hausaufgabe gelöscht');
        onSaved?.();
      });
    },
  });
}
