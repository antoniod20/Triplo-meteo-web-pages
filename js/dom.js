// Piccoli aiuti per costruire la pagina e gestire finestre e bottom sheet.

export const $ = id => document.getElementById(id);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Icona Material dallo sprite in index.html
export function svgIcon(id, size) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  if (size) {
    svg.style.width = `${size}px`;
    svg.style.height = `${size}px`;
  }
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}

// --- FINESTRE MODALI ---

let lastFocused = null;

export function isOpen(modal) {
  return modal.style.display === 'flex';
}

export function openModal(modal) {
  lastFocused = document.activeElement;
  modal.style.display = 'flex';
  const first = modal.querySelector('button, input, select, a[href]');
  if (first) first.focus();
}

export function closeModal(modal) {
  if (!isOpen(modal)) return;
  modal.style.display = 'none';
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

// Chiude toccando lo sfondo scuro intorno alla finestra
export function closeOnBackdrop(modal) {
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal);
  });
}

// --- BOTTOM SHEET: TRASCINA IN BASSO PER CHIUDERE (solo mobile) ---
// Si chiude trascinando dalla maniglia o dall'intestazione, oppure da qualsiasi punto
// quando il contenuto è già scorso fino in cima.
export function setupSheetDrag(overlay) {
  const sheet = overlay.querySelector('.sheet');
  if (!sheet) return;
  let startX = 0, startY = 0, startTime = 0, dy = 0;
  let tracking = false, decided = false, dragging = false, fromHandle = false;

  const reset = () => {
    sheet.style.transition = '';
    sheet.style.transform = '';
    overlay.style.backgroundColor = '';
  };

  sheet.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || !matchMedia('(max-width: 768px)').matches) return;
    if (e.target.closest('.suggestions, .agent-days, .view-toggle, input, select, table')) return;
    tracking = true;
    decided = false;
    dragging = false;
    dy = 0;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startTime = Date.now();
    fromHandle = Boolean(e.target.closest('.sheet-handle, .dialog-header'));
  }, { passive: true });

  sheet.addEventListener('touchmove', e => {
    if (!tracking) return;
    const x = e.touches[0].clientX - startX;
    const y = e.touches[0].clientY - startY;

    if (!decided) {
      if (Math.hypot(x, y) < 8) return;
      decided = true;
      // Solo verso il basso, in verticale, e senza rubare lo scorrimento del contenuto
      dragging = y > 0 && Math.abs(y) > Math.abs(x) * 1.2 && (fromHandle || sheet.scrollTop <= 0);
      if (!dragging) { tracking = false; return; }
    }

    e.preventDefault();
    dy = Math.max(0, y);
    sheet.style.transition = 'none';
    sheet.style.transform = `translateY(${dy}px)`;
    const fade = Math.max(0, 1 - dy / sheet.offsetHeight);
    overlay.style.backgroundColor = `rgba(0, 0, 0, ${(0.32 * fade).toFixed(3)})`;
  }, { passive: false });

  const end = () => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;

    const velocity = dy / Math.max(1, Date.now() - startTime); // px/ms
    const shouldClose = dy > sheet.offsetHeight * 0.25 || (dy > 40 && velocity > 0.5);

    sheet.style.transition = 'transform 0.2s cubic-bezier(0.3, 0, 0.8, 0.15)';
    if (shouldClose) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => { closeModal(overlay); reset(); }, 200);
    } else {
      sheet.style.transform = '';
      overlay.style.backgroundColor = '';
      setTimeout(reset, 200);
    }
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}
