// Punto di ingresso: avvia impostazioni e agente, gestisce Esc e il service worker.

import { $, isOpen, closeModal, setupSheetDrag } from './dom.js';
import { initSettings, isFullView, toggleFullView } from './settings.js';
import { initAgent } from './agent.js';

initSettings();
initAgent();
['modal', 'agentModal'].forEach(id => setupSheetDrag($(id)));

// Esc chiude la finestra aperta, oppure esce dalla vista completa
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = ['agentModal', 'providersModal', 'modal'].map($).find(isOpen);
  if (open) closeModal(open);
  else if (isFullView()) toggleFullView();
});

// --- PWA / OFFLINE ---
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => { });
  });
}
