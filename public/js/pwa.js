// Service Worker, Updates und Installations-Hinweis.
import { toast } from './ui.js';
import { t } from './i18n.js';

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const canInstall = () => !!deferredPrompt;

export function onInstallChange(fn) {
  listeners.add(fn);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome === 'accepted';
}

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
    toast(t('SchoolBuddy ist jetzt installiert 🎉'));
  });

  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      let offered = false;
      // Beim Tippen die gerade wartende Version ansprechen: Bei mehreren Updates hintereinander
      // ist eine früher gemerkte Version womöglich schon überholt.
      const offerUpdate = () => {
        if (offered) return;
        offered = true;
        toast(t('Eine neue Version von SchoolBuddy ist da.'), {
          action: t('Aktualisieren'),
          timeout: 0,
          onAction: () => (reg.waiting ? reg.waiting.postMessage('skipWaiting') : location.reload()),
        });
      };
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate();
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (err) {
      console.warn('SchoolBuddy: Service Worker nicht registriert', err);
    }
  });
}
