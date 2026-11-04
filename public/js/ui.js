// Kleine UI-Helfer: sicheres HTML, Icons, Modals, Toasts, Markdown.
import { t } from './i18n.js';

class Raw {
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

function fmt(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(fmt).join('');
  return esc(v);
}

/** Template-Tag: Werte werden escaped, außer sie sind selbst html`` oder raw(). */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => {
    out += fmt(v) + strings[i + 1];
  });
  return new Raw(out);
}

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  cards: '<rect x="7" y="3" width="14" height="14" rx="2.5"/><path d="M3.5 7.5v11A2.5 2.5 0 0 0 6 21h11"/>',
  sparkles: '<path d="M10 3.5l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9z"/><path d="M18 14l.9 2.1 2.1.9-2.1.9L18 20l-.9-2.1-2.1-.9 2.1-.9z"/>',
  chart: '<path d="M5 20v-6M12 20V5M19 20v-10"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  camera: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1-3.6 2-4.5.3 1.6 1 2.5 2 3 0-3 0-5.5 1-8.5z"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z"/><path d="M12 6.5v13"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16M20 20v-4h-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.5M4 12h.5M4 18h.5"/>',
  cloud: '<path d="M7 18.5h10.5a4.5 4.5 0 0 0 .6-8.96A6 6 0 0 0 6.4 10.1 4.2 4.2 0 0 0 7 18.5z"/>',
  shuffle: '<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.6 0 2.8-1.6 3.9-3.6M14.1 9.6C15.2 7.6 16.4 7 17 7h3M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5"/>',
};

export function icon(name, cls = '') {
  return raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`);
}

export const LOGO = raw(`<svg class="logo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0b2a5b"/><path d="M32 15 54 25 32 35 10 25z" fill="#fff"/><path d="M20 30.5v9c0 4 24 4 24 0v-9L32 36z" fill="#fff"/><path d="M52 26v11" stroke="#7fb0ff" stroke-width="2.6" stroke-linecap="round"/><circle cx="52" cy="40" r="3" fill="#7fb0ff"/></svg>`);

const SUBJECT_COLORS = {
  Mathe: '#2f6fed', Deutsch: '#d64545', Englisch: '#7c4dff', Französisch: '#c2185b', Spanisch: '#ef6c00',
  Latein: '#8d6e63', Biologie: '#2e9d57', Chemie: '#00897b', Physik: '#3949ab', Geschichte: '#a1662f',
  Erdkunde: '#558b2f', Politik: '#5e35b1', Wirtschaft: '#00838f', Informatik: '#0277bd', Religion: '#6d4c41',
  Ethik: '#6d4c41', Kunst: '#d81b60', Musik: '#8e24aa', Sport: '#f57c00',
};
const FALLBACK_COLORS = ['#2f6fed', '#2e9d57', '#d64545', '#7c4dff', '#ef6c00', '#00897b', '#c2185b', '#3949ab'];

export function subjectColor(subject = '') {
  if (SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
  let h = 0;
  for (const ch of subject) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_COLORS[h % FALLBACK_COLORS.length];
}

export const subjectDot = (subject) => html`<span class="dot" style="--c:${subjectColor(subject)}"></span>`;

/** Fortschrittsring als SVG. */
export function ring(pct, { size = 64, stroke = 7, label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return raw(`<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label || t('{n} Prozent', { n: Math.round(p) }))}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-track"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="ring-value"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`);
}

export const bar = (pct, cls = '') =>
  html`<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%"></span></div>`;

export function toast(message, { action, onAction, timeout = 3500 } = {}) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = String(html`<span>${message}</span>${action ? html`<button type="button">${action}</button>` : ''}`);
  const remove = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector('button')?.addEventListener('click', () => {
    onAction?.();
    remove();
  });
  root.append(el);
  if (timeout) setTimeout(remove, timeout);
  return remove;
}

/** Öffnet ein Bottom-Sheet. onMount(modalElement, close) bindet die Events. */
export function openModal({ title, body, onMount, onClose }) {
  const root = document.getElementById('modal-root');
  const previous = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = String(html`<div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h2>${title}</h2>
      <button type="button" class="icon-btn" data-close aria-label="${t('Schließen')}">${icon('x')}</button></div>
    <div class="modal-body">${body}</div></div>`);
  let closed = false;
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    wrap.classList.add('closing');
    setTimeout(() => wrap.remove(), 160);
    onClose?.();
    previous?.focus?.();
  }
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  root.append(wrap);
  const modal = wrap.querySelector('.modal');
  onMount?.(modal, close);
  (modal.querySelector('[autofocus]') || modal.querySelector('.modal-head button')).focus();
  return close;
}

export function confirmDialog(message, { confirmText = t('Löschen'), danger = true } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title: t('Sicher?'),
      body: html`<p>${message}</p><div class="row end">
        <button type="button" class="btn ghost" data-close>${t('Abbrechen')}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-ok>${confirmText}</button></div>`,
      onMount(m, close) {
        m.querySelector('[data-ok]').addEventListener('click', () => {
          answer = true;
          close();
        });
      },
      onClose: () => resolve(answer),
    });
  });
}

/** Sehr kleines, sicheres Markdown für KI-Antworten: Absätze, Listen, fett, kursiv, Code, Tabellen. */
export function md(src = '') {
  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  const lines = esc(src.replace(/\r/g, '')).split('\n');
  let out = '';
  let para = [];
  let list = null;
  let table = [];
  let code = null;
  const flushPara = () => {
    if (para.length) out += `<p>${para.map(inline).join('<br>')}</p>`;
    para = [];
  };
  const flushList = () => {
    if (list) out += `</${list}>`;
    list = null;
  };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((r) => !/^\|?\s*:?-{2,}/.test(r));
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
    out += '<div class="table-wrap"><table>';
    rows.forEach((r, i) => {
      const tag = i === 0 ? 'th' : 'td';
      out += `<tr>${cells(r).map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    });
    out += '</table></div>';
    table = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      if (code) {
        out += `<pre><code>${code.join('\n')}</code></pre>`;
        code = null;
      } else {
        flushAll();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)/);
    const ul = line.match(/^\s*[-*•]\s+(.*)/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (line.trim().startsWith('|')) {
      flushPara();
      flushList();
      table.push(line.trim());
    } else if (heading) {
      flushAll();
      out += `<h4>${inline(heading[1])}</h4>`;
    } else if (ul || ol) {
      flushPara();
      flushTable();
      const type = ul ? 'ul' : 'ol';
      if (list !== type) {
        flushList();
        out += type === 'ol' ? `<ol start="${ol[1]}">` : '<ul>';
        list = type;
      }
      out += `<li>${inline(ul ? ul[1] : ol[2])}</li>`;
    } else if (!line.trim()) {
      flushAll();
    } else if (/^-{3,}$/.test(line.trim())) {
      flushAll();
      out += '<hr>';
    } else {
      flushList();
      flushTable();
      para.push(line);
    }
  }
  if (code) out += `<pre><code>${code.join('\n')}</code></pre>`;
  flushAll();
  return raw(out);
}

export function downloadFile(filename, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Verkleinert ein Foto auf maximal maxSide Pixel und gibt eine JPEG-Data-URL zurück. */
export async function resizeImage(file, maxSide = 1568, quality = 0.85) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const source = bitmap || (await loadImage(file));
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  bitmap?.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => reject(new Error(t('Das Bild konnte nicht gelesen werden.')));
    img.src = URL.createObjectURL(file);
  });
}

/** „3 Karten“ bzw. „3 cards“: Einzahl und Mehrzahl werden auf Deutsch übergeben und übersetzt. */
export function plural(n, one, many) {
  return `${n} ${t(n === 1 ? one : many)}`;
}

export function formatMinutes(min) {
  if (min < 60) return t('{n} Min.', { n: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? t('{h} Std. {m} Min.', { h, m }) : t('{h} Std.', { h });
}
