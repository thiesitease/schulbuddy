// Buddy: KI-Lernassistent (Chat) und Hausaufgaben-Scanner.
import { getState, update } from '../store.js';
import { html, icon, md, toast, confirmDialog, resizeImage, plural, LOGO } from '../ui.js';
import { tabs, pageHead } from '../components.js';
import { subjectOptions } from '../forms.js';
import { askAI, aiStatus, ensureConsent } from '../ai.js';
import { t, subjectName } from '../i18n.js';

const TABS = [
  { id: 'chat', label: t('Fragen'), href: '#/buddy' },
  { id: 'scan', label: t('Aufgabe scannen'), href: '#/buddy/scan' },
];

const EXAMPLES = [
  t('Erklär mir den Satz des Pythagoras mit einem Beispiel.'),
  t('Wann benutze ich im Englischen das Present Perfect?'),
  t('Was ist Photosynthese? Kurz und einfach, bitte.'),
  t('Wie gliedere ich eine Erörterung?'),
  t('Stell mir 3 Übungsaufgaben zu linearen Funktionen.'),
];

const MAX_STORED = 40;
const CONTEXT_MESSAGES = 12;

let pending = false;
let chatError = '';
let scan = { image: null, result: '', loading: false, error: '', mode: 'hint', subject: '', question: '' };

export default {
  render(root, ctx) {
    const tab = ctx.params[0] === 'scan' ? 'scan' : 'chat';
    if (tab === 'scan') renderScan(root, ctx);
    else renderChat(root, ctx);
    showStatus(root);
  },
};

async function showStatus(root) {
  const status = await aiStatus();
  const el = root.querySelector('[data-ai-status]');
  if (!el) return;
  if (!status.available) {
    el.hidden = false;
    el.innerHTML = String(html`${icon('info')}<span>${status.offline
      ? t('Du bist offline. Buddy braucht eine Internetverbindung.')
      : t('Buddy ist gerade nicht erreichbar. Alle anderen Funktionen gehen trotzdem.')}</span>`);
  } else if (typeof status.remaining === 'number' && status.remaining <= 5) {
    el.hidden = false;
    el.innerHTML = String(html`${icon('info')}<span>${t('Heute noch {requests} frei.', { requests: plural(status.remaining, 'KI-Anfrage', 'KI-Anfragen') })}</span>`);
  }
}

// --- Chat ----------------------------------------------------------------

function bubble(m) {
  return m.role === 'user'
    ? html`<div class="msg user"><div class="bubble">${m.text}</div></div>`
    : html`<div class="msg bot"><span class="avatar">${LOGO}</span><div class="bubble md">${md(m.text)}</div></div>`;
}

function renderChat(root, ctx) {
  const s = getState();
  const messages = s.chat;
  // Unbeantwortete Frage (z. B. nach Verbindungsabbruch): erneut senden anbieten.
  if (!pending && !chatError && messages.at(-1)?.role === 'user') chatError = t('Auf deine letzte Frage kam keine Antwort an.');
  root.innerHTML = String(html`
    ${pageHead('Buddy', t('Dein KI-Lernassistent'), messages.length ? html`<button type="button" class="btn ghost sm" data-action="clear">${icon('refresh')} ${t('Neuer Chat')}</button>` : '')}
    ${tabs(TABS, 'chat')}
    <div class="banner info" data-ai-status hidden></div>
    <div class="chat" aria-live="polite">
      ${messages.length ? '' : html`<div class="msg bot"><span class="avatar">${LOGO}</span><div class="bubble">
        ${t('Hi{name}! Ich bin Buddy. Frag mich alles zu deinen Schulfächern. Ich erkläre dir Schritt für Schritt, statt dir nur Lösungen zu verraten. 😊', { name: s.profile.name ? ` ${s.profile.name}` : '' })}</div></div>
        <div class="chips examples">${EXAMPLES.map((text) => html`<button type="button" class="chip" data-action="example">${text}</button>`)}</div>`}
      ${messages.map(bubble)}
      ${pending ? html`<div class="msg bot"><span class="avatar">${LOGO}</span><div class="bubble typing" aria-label="${t('Buddy schreibt')}"><span></span><span></span><span></span></div></div>` : ''}
      ${chatError ? html`<div class="banner error">${icon('alert')}<span>${chatError}</span><button type="button" class="link" data-action="retry">${t('Nochmal senden')}</button></div>` : ''}
    </div>
    <form class="composer" data-form="chat">
      <textarea name="text" rows="1" maxlength="4000" placeholder="${t('Stell Buddy eine Frage …')}" aria-label="${t('Deine Frage')}" ${pending ? 'disabled' : ''}></textarea>
      <button class="icon-btn send" aria-label="${t('Senden')}" ${pending ? 'disabled' : ''}>${icon('send')}</button>
    </form>
  `);
  const input = root.querySelector('textarea');
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
      e.preventDefault();
      root.querySelector('form').requestSubmit();
    }
  });
  root.querySelector('.chat').lastElementChild?.scrollIntoView({ block: 'end' });
  if (!pending) input.focus({ preventScroll: true });

  const send = async (text) => {
    if (!text || pending) return;
    if (!(await ensureConsent())) return;
    chatError = '';
    update((st) => {
      st.chat.push({ role: 'user', text, at: Date.now() });
      if (st.chat.length > MAX_STORED) st.chat.splice(0, st.chat.length - MAX_STORED);
    });
    await ask(ctx);
  };

  root.onsubmit = (e) => {
    e.preventDefault();
    send(input.value.trim());
  };
  root.onclick = async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'example') send(a.textContent.trim());
    if (a.dataset.action === 'retry') {
      chatError = '';
      await ask(ctx);
    }
    if (a.dataset.action === 'clear' && (await confirmDialog(t('Den bisherigen Chat löschen?'), { confirmText: t('Neuer Chat') }))) {
      update((st) => { st.chat = []; });
      chatError = '';
      ctx.refresh();
    }
  };
}

async function ask(ctx) {
  pending = true;
  ctx.refresh();
  try {
    const history = getState().chat.slice(-CONTEXT_MESSAGES).map((m) => ({ role: m.role, text: m.text }));
    const data = await askAI('chat', { messages: history });
    update((st) => {
      st.chat.push({ role: 'assistant', text: data.text, at: Date.now() });
    });
  } catch (ex) {
    chatError = ex.message;
  }
  pending = false;
  if (location.hash === '#/buddy' || location.hash === '#/buddy/' || location.hash === '') ctx.refresh();
  else if (!chatError) toast(t('Buddy hat geantwortet 💬'), { action: t('Ansehen'), onAction: () => { location.hash = '#/buddy'; } });
}

// --- Hausaufgaben-Scanner -------------------------------------------------

function renderScan(root, ctx) {
  root.innerHTML = String(html`
    ${pageHead('Buddy', t('Hausaufgaben-Scanner'))}
    ${tabs(TABS, 'scan')}
    <div class="banner info" data-ai-status hidden></div>
    <div class="card stack">
      <p>${t('Fotografiere eine Aufgabe aus deinem Buch oder Arbeitsblatt. Buddy erklärt dir, wie du sie löst.')}</p>
      <label class="dropzone ${scan.image ? 'has-image' : ''}">
        ${scan.image ? html`<img src="${scan.image}" alt="${t('Foto deiner Aufgabe')}">` : html`${icon('camera')}<strong>${t('Foto aufnehmen oder auswählen')}</strong><span class="muted small">${t('Am besten gerade von oben und gut beleuchtet')}</span>`}
        <input type="file" accept="image/*" capture="environment" data-photo hidden>
      </label>
      ${scan.image ? html`<button type="button" class="link" data-action="remove-photo">${icon('trash')} ${t('Anderes Foto wählen')}</button>` : ''}
      <div class="grid-2">
        <label class="field"><span>${t('Fach')}</span><select name="subject"><option value="">${t('Erkennt Buddy selbst')}</option>${subjectOptions(scan.subject)}</select></label>
        <fieldset class="field"><legend>${t('Was brauchst du?')}</legend><div class="choice">
          <label><input type="radio" name="mode" value="hint" ${scan.mode === 'hint' ? 'checked' : ''}><span>${t('Tipps')}</span></label>
          <label><input type="radio" name="mode" value="explain" ${scan.mode === 'explain' ? 'checked' : ''}><span>${t('Lösungsweg')}</span></label>
        </div></fieldset>
      </div>
      <label class="field"><span>${t('Was verstehst du nicht?')} <em>${t('(optional)')}</em></span>
        <input name="question" maxlength="500" value="${scan.question}" placeholder="${t('z. B. Nr. 4b, ich weiß nicht, wie ich anfangen soll')}"></label>
      ${scan.error ? html`<p class="form-error" role="alert">${scan.error}</p>` : ''}
      <button type="button" class="btn primary block" data-action="analyze" ${scan.image && !scan.loading ? '' : 'disabled'}>
        ${scan.loading ? html`<span class="spinner"></span> ${t('Buddy schaut sich die Aufgabe an …')}` : html`${icon('sparkles')} ${t('Erklären lassen')}`}</button>
      <p class="muted small">${t('Tipp: Mit „Tipps“ kommst du selbst auf die Lösung – so lernst du am meisten.')}</p>
    </div>
    ${scan.result ? html`<section class="card md section result-card">${md(scan.result)}
      <div class="row wrap gap"><button type="button" class="btn ghost sm" data-action="to-chat">${icon('sparkles')} ${t('Im Chat weiterfragen')}</button></div></section>` : ''}
  `);

  const remember = () => {
    scan.subject = root.querySelector('[name="subject"]').value;
    scan.mode = root.querySelector('[name="mode"]:checked')?.value || 'hint';
    scan.question = root.querySelector('[name="question"]').value;
  };
  root.onchange = async (e) => {
    if (e.target.matches('[data-photo]')) {
      const file = e.target.files[0];
      if (!file) return;
      remember();
      try {
        scan.image = await resizeImage(file);
        scan.result = '';
        scan.error = '';
      } catch (ex) {
        scan.error = ex.message;
      }
      ctx.refresh();
    } else remember();
  };
  root.onclick = async (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'remove-photo') {
      remember();
      scan.image = null;
      scan.result = '';
      ctx.refresh();
    }
    if (a.dataset.action === 'analyze') {
      remember();
      if (!(await ensureConsent())) return;
      scan.loading = true;
      scan.error = '';
      ctx.refresh();
      try {
        const data = await askAI('scan', { image: scan.image, subject: scan.subject, mode: scan.mode, question: scan.question });
        scan.result = data.text;
      } catch (ex) {
        scan.error = ex.message;
      }
      scan.loading = false;
      if (location.hash.startsWith('#/buddy/scan')) ctx.refresh();
    }
    if (a.dataset.action === 'to-chat') {
      update((st) => {
        const photo = scan.subject ? t('[Foto einer Aufgabe in {subject}]', { subject: subjectName(scan.subject) }) : t('[Foto einer Aufgabe]');
        const question = scan.question ? ` ${t('Meine Frage: {question}', { question: scan.question })}` : '';
        st.chat.push({ role: 'user', text: `${photo}${question}`, at: Date.now() });
        st.chat.push({ role: 'assistant', text: scan.result, at: Date.now() });
        if (st.chat.length > MAX_STORED) st.chat.splice(0, st.chat.length - MAX_STORED);
      });
      ctx.navigate('buddy');
    }
  };
}
