// Fokus-Timer für eine Lerneinheit.
import { html, icon, openModal } from './ui.js';
import { sessionTitle } from './components.js';
import { completeSession } from './actions.js';

const TIPS = [
  'Handy auf lautlos und außer Reichweite legen.',
  'Erklär dir den Stoff laut, als würdest du ihn jemandem beibringen.',
  'Schreib am Ende drei Dinge auf, die du dir merken willst.',
  'Nach der Einheit: 5 Minuten Pause, etwas trinken, bewegen.',
  'Nutze Karteikarten für Begriffe, die du dir merken musst.',
];

const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export function openFocus(task, exam, onDone) {
  const total = task.minutes * 60;
  let remaining = total;
  let endsAt = null;
  let timer = null;
  let wakeLock = null;

  const lockScreen = async () => {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      wakeLock = null;
    }
  };

  openModal({
    title: 'Fokus-Zeit',
    body: html`<div class="focus">
      <p class="focus-task">${sessionTitle(task)}</p>
      <p class="muted">${exam.subject} · ${task.minutes} Minuten</p>
      <div class="focus-time" role="timer" aria-live="off">${mmss(total)}</div>
      <div class="bar focus-bar"><span style="width:0%"></span></div>
      <div class="row center">
        <button type="button" class="btn primary" data-toggle>${icon('play')} Start</button>
        <button type="button" class="btn ghost" data-done>${icon('check')} Fertig</button>
      </div>
      <p class="tip">${icon('bulb')} ${TIPS[Math.floor(Math.random() * TIPS.length)]}</p>
    </div>`,
    onMount(m, close) {
      const timeEl = m.querySelector('.focus-time');
      const barEl = m.querySelector('.focus-bar span');
      const toggle = m.querySelector('[data-toggle]');
      const paint = () => {
        timeEl.textContent = mmss(remaining);
        barEl.style.width = `${((total - remaining) / total) * 100}%`;
      };
      const tick = () => {
        remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
        paint();
        if (remaining === 0) {
          stop();
          navigator.vibrate?.([200, 100, 200]);
          toggle.hidden = true;
          m.querySelector('.focus-task').textContent = 'Geschafft! 🎉 Markiere die Einheit als erledigt.';
        }
      };
      const stop = () => {
        clearInterval(timer);
        timer = null;
        wakeLock?.release?.();
        wakeLock = null;
        toggle.innerHTML = String(html`${icon('play')} Weiter`);
      };
      toggle.addEventListener('click', () => {
        if (timer) {
          stop();
          return;
        }
        endsAt = Date.now() + remaining * 1000;
        timer = setInterval(tick, 1000);
        lockScreen();
        toggle.innerHTML = String(html`${icon('pause')} Pause`);
      });
      m.querySelector('[data-done]').addEventListener('click', () => {
        completeSession(task);
        close();
        onDone?.();
      });
    },
    onClose() {
      clearInterval(timer);
      wakeLock?.release?.();
    },
  });
}
