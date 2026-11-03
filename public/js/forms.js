// Formulare für Prüfungen und Hausaufgaben (als Bottom-Sheet).
import { getState, update, uid, SUBJECTS, EXAM_TYPES } from './store.js';
import { html, icon, openModal, toast, confirmDialog } from './ui.js';
import { todayISO, addDays, isValidISO } from './dates.js';
import { deleteExam, deleteHomework } from './actions.js';
import { t, subjectName, examTypeName } from './i18n.js';

/** Auswahlliste der Fächer. Der Wert bleibt der gespeicherte (deutsche) Name. */
export function subjectOptions(selected) {
  const mine = getState().profile.subjects;
  const others = SUBJECTS.filter((s) => !mine.includes(s));
  const extra = selected && !mine.includes(selected) && !SUBJECTS.includes(selected) ? [selected] : [];
  const opt = (s) => html`<option value="${s}" ${s === selected ? 'selected' : ''}>${subjectName(s)}</option>`;
  return html`<optgroup label="${t('Deine Fächer')}">${[...mine, ...extra].map(opt)}</optgroup>
    ${others.length ? html`<optgroup label="${t('Weitere Fächer')}">${others.map(opt)}</optgroup>` : ''}`;
}

const difficultyField = (value) => html`<fieldset class="field">
  <legend>${t('Wie schwer ist der Stoff für dich?')}</legend>
  <div class="choice">${[[1, t('Leicht')], [2, t('Mittel')], [3, t('Schwer')]].map(
    ([v, label]) => html`<label><input type="radio" name="difficulty" value="${v}" ${Number(value) === v ? 'checked' : ''}><span>${label}</span></label>`,
  )}</div></fieldset>`;

/** Neue oder bestehende Prüfung bearbeiten. */
export function openExamForm(exam, onSaved, preset = {}) {
  const today = todayISO();
  const isNew = !exam;
  const e = exam || { subject: preset.subject || getState().profile.subjects[0] || 'Mathe', type: 'Klassenarbeit', date: addDays(today, 7), difficulty: 2, topics: [] };
  const past = !isNew && e.date < today;
  openModal({
    title: isNew ? t('Neue Prüfung') : t('Prüfung bearbeiten'),
    body: html`<form class="stack" data-form="exam" novalidate>
      <div class="grid-2">
        <label class="field"><span>${t('Fach')}</span><select name="subject">${subjectOptions(e.subject)}</select></label>
        <label class="field"><span>${t('Art')}</span><select name="type">${EXAM_TYPES.map((type) => html`<option value="${type}" ${type === e.type ? 'selected' : ''}>${examTypeName(type)}</option>`)}</select></label>
      </div>
      <label class="field"><span>${t('Datum')}</span><input type="date" name="date" value="${e.date}" required></label>
      <label class="field"><span>${t('Titel')} <em>${t('(optional)')}</em></span><input name="title" value="${e.title || ''}" placeholder="${t('z. B. Bruchrechnung')}" maxlength="80"></label>
      <label class="field"><span>${t('Themen – eins pro Zeile')}</span>
        <textarea name="topics" rows="5" placeholder="${t('z. B.\nBrüche kürzen und erweitern\nBrüche addieren\nTextaufgaben')}">${(e.topics || []).map((topic) => topic.name).join('\n')}</textarea>
        <small class="muted">${t('SchoolBuddy plant für jedes Thema eine Lern- und eine Wiederholungseinheit.')}</small></label>
      ${difficultyField(e.difficulty)}
      ${past ? html`<label class="field"><span>${t('Note')} <em>${t('(optional)')}</em></span><input name="grade" value="${e.grade || ''}" maxlength="6" placeholder="${t('z. B. 2+')}"></label>` : ''}
      <p class="form-error" role="alert" hidden></p>
      <div class="row end">
        ${isNew ? '' : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} ${t('Löschen')}</button>`}
        <button class="btn primary">${isNew ? t('Lernplan erstellen') : t('Speichern')}</button>
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
          error.textContent = t('Bitte gib ein gültiges Datum ein.');
          error.hidden = false;
          return;
        }
        if (isNew && date <= today) {
          error.textContent = t('Das Datum muss in der Zukunft liegen, damit SchoolBuddy einen Plan erstellen kann.');
          error.hidden = false;
          return;
        }
        const names = [...new Set(String(f.get('topics')).split('\n').map((x) => x.trim()).filter(Boolean))].slice(0, 20);
        const oldTopics = e.topics || [];
        const topics = names.map((name) => oldTopics.find((topic) => topic.name === name) || { id: uid().slice(0, 8), name });
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
        toast(isNew ? t('Lernplan erstellt ✨') : t('Gespeichert'));
        onSaved?.();
      });
      m.querySelector('[data-delete]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog(t('Diese Prüfung und ihren Lernplan löschen?'))) {
          deleteExam(e.id);
          toast(t('Prüfung gelöscht'));
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
    title: isNew ? t('Neue Hausaufgabe') : t('Hausaufgabe bearbeiten'),
    body: html`<form class="stack" novalidate>
      <label class="field"><span>${t('Was ist zu tun?')}</span><input name="text" value="${h.text}" required maxlength="160" placeholder="${t('z. B. Buch S. 42, Nr. 3–5')}" autofocus></label>
      <div class="grid-2">
        <label class="field"><span>${t('Fach')}</span><select name="subject">${subjectOptions(h.subject)}</select></label>
        <label class="field"><span>${t('Fällig am')}</span><input type="date" name="due" value="${h.due}" required></label>
      </div>
      <p class="form-error" role="alert" hidden></p>
      <div class="row end">
        ${isNew ? '' : html`<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')} ${t('Löschen')}</button>`}
        <button class="btn primary">${t('Speichern')}</button>
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
          error.textContent = text ? t('Bitte gib ein gültiges Datum ein.') : t('Bitte beschreib kurz die Aufgabe.');
          error.hidden = false;
          return;
        }
        const data = { text, subject: String(f.get('subject')), due };
        update((s) => {
          if (isNew) s.homework.push({ id: uid(), done: false, createdOn: today, ...data });
          else Object.assign(s.homework.find((x) => x.id === h.id), data);
        });
        close();
        toast(t('Gespeichert'));
        onSaved?.();
      });
      m.querySelector('[data-delete]')?.addEventListener('click', () => {
        deleteHomework(h.id);
        close();
        toast(t('Hausaufgabe gelöscht'));
        onSaved?.();
      });
    },
  });
}
