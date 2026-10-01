// UI primitives: views, status lines, button states, bottom sheets, menu, toast.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => motionQuery.matches;

/** Wait — collapses to ~0 when the user prefers reduced motion, except for `min` (for readable holds). */
export const wait = (ms, { min = 0 } = {}) =>
  new Promise((r) => setTimeout(r, reducedMotion() ? Math.max(min, 0) : ms));

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const icon = (id, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

/* ------------------------------------------------------------------ */
/* Status line                                                         */
/* ------------------------------------------------------------------ */
/**
 * kind:  'busy' | 'ok' | 'warn' | 'idle'
 * glyph: 'hollow' | 'pulse' | 'dot' | 'check' | 'alert'
 */
export function setStatus(el, { kind = 'idle', glyph = 'dot', text = '', sub = '', srExtra = '' } = {}) {
  if (!text) { el.innerHTML = ''; el.className = el.className.replace(/\bstatus-\w+/g, '').trim(); return; }
  let g;
  if (glyph === 'check') g = icon('check', 'i glyph');
  else if (glyph === 'alert') g = icon('alert', 'i glyph');
  else g = `<span class="dot${glyph === 'hollow' || glyph === 'pulse' ? ' is-hollow' : ''}${glyph === 'pulse' ? ' is-pulsing' : ''}" aria-hidden="true"></span>`;

  el.className = el.className.replace(/\bstatus-\w+/g, '').trim();
  el.classList.add(`status-${kind}`);
  el.innerHTML =
    `${g}<span class="status-text">${esc(text)}</span>` +
    (sub ? `<span class="sub">· ${esc(sub)}</span>` : '') +
    (srExtra ? `<span class="sr-only">. ${esc(srExtra)}</span>` : '');

  el.classList.remove('is-changing');
  void el.offsetWidth; // restart the swap animation
  el.classList.add('is-changing');
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */
/**
 * icon: lucide id | 'spinner' | null ; state: 'busy' | 'done' | null
 */
export function setButton(btn, { label, icon: ic, state = null } = {}) {
  const labelEl = btn.querySelector('.btn-label');
  let iconEl = btn.querySelector('.btn-icon');

  if (ic !== undefined) {
    if (ic === null) {
      iconEl?.remove();
    } else {
      if (!iconEl) {
        iconEl = document.createElement('span');
        iconEl.className = 'btn-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        btn.insertBefore(iconEl, labelEl);
      }
      iconEl.innerHTML = ic === 'spinner' ? '<span class="btn-spinner"></span>' : icon(ic);
    }
  }
  if (label !== undefined && labelEl.textContent !== label) labelEl.textContent = label;

  btn.classList.toggle('is-busy', state === 'busy');
  btn.classList.toggle('is-done', state === 'done');
  if (state) btn.setAttribute('aria-busy', String(state === 'busy'));
  else btn.removeAttribute('aria-busy');

  btn.classList.remove('is-swapping');
  void btn.offsetWidth;
  btn.classList.add('is-swapping');
}

/** Visible press feedback for keyboard/programmatic activation (touch/mouse use :active). */
export function pressFeedback(el) {
  el.classList.add('is-pressed');
  setTimeout(() => el.classList.remove('is-pressed'), 130);
}

// iOS Safari only applies :active when a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */
export async function showView(app, views, name, { animate = true } = {}) {
  const next = views[name];
  const current = Object.values(views).find((v) => !v.hidden && v !== next);

  if (current && animate && !reducedMotion()) {
    current.classList.add('is-exiting');
    await wait(260);
    current.classList.remove('is-exiting');
  }
  if (current) current.hidden = true;

  next.hidden = false;
  app.dataset.view = name;

  if (animate) {
    next.classList.remove('is-entering');
    void next.offsetWidth;
    next.classList.add('is-entering');
    setTimeout(() => next.classList.remove('is-entering'), 950);
  }
}

export function flash(el, cls = 'is-refreshing', ms = 800) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */
let toastTimer;
export function toast(text, { warn = false, ms = 2200 } = {}) {
  const el = $('#toast');
  $('#toast-text').textContent = text;
  el.querySelector('use').setAttribute('href', warn ? '#i-alert' : '#i-check');
  el.classList.toggle('is-warn', warn);
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-shown'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('is-shown');
    setTimeout(() => { if (!el.classList.contains('is-shown')) el.hidden = true; }, 250);
  }, ms);
}

/* ------------------------------------------------------------------ */
/* Bottom sheets                                                       */
/* ------------------------------------------------------------------ */
const FOCUSABLE = 'button:not([disabled]):not([hidden]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

let active = null; // { sheet, onClose, returnFocus }

export const sheetIsOpen = (id) => active?.sheet.id === id;

export function openSheet(sheet, { onClose, initialFocus } = {}) {
  if (active) closeSheet({ silent: true, immediate: true });

  const scrim = $('#scrim');
  const app = $('#app');
  active = { sheet, onClose, returnFocus: document.activeElement };

  scrim.hidden = false;
  sheet.hidden = false;
  sheet.classList.remove('is-closing');
  sheet.style.transform = '';
  app.inert = true;
  document.body.classList.add('sheet-open');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrim.classList.add('is-open');
      sheet.classList.add('is-open');
    });
  });

  const target = initialFocus ? $(initialFocus, sheet) : sheet.querySelector(FOCUSABLE);
  // Focus after the sheet starts moving so mobile keyboards don't fight the animation.
  setTimeout(() => target?.focus({ preventScroll: true }), reducedMotion() ? 0 : 120);
}

/**
 * silent: don't call onClose. reason is passed to onClose ('dismiss' | 'done').
 */
export function closeSheet({ silent = false, immediate = false, reason = 'dismiss' } = {}) {
  if (!active) return Promise.resolve();
  const { sheet, onClose, returnFocus } = active;
  active = null;

  const scrim = $('#scrim');
  sheet.classList.remove('is-open');
  sheet.classList.add('is-closing');
  sheet.style.transform = '';
  scrim.classList.remove('is-open');
  $('#app').inert = false;
  document.body.classList.remove('sheet-open');

  const ms = immediate || reducedMotion() ? 0 : 260;
  return new Promise((resolve) => {
    setTimeout(() => {
      sheet.hidden = true;
      sheet.classList.remove('is-closing');
      if (!active) scrim.hidden = true;
      if (returnFocus && document.contains(returnFocus) && !returnFocus.closest('[hidden]')) {
        returnFocus.focus({ preventScroll: true });
      }
      if (!silent) onClose?.(reason);
      resolve();
    }, ms);
  });
}

// Scrim tap / Escape / [data-close] dismiss the active sheet.
document.addEventListener('click', (e) => {
  if (!active) return;
  if (e.target.id === 'scrim' || e.target.closest('[data-close]')) closeSheet();
});

document.addEventListener('keydown', (e) => {
  if (!active) return;
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
  if (e.key === 'Tab') {
    const items = $$(FOCUSABLE, active.sheet).filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// Drag the grab handle down to dismiss.
export function enableSheetDrag(sheet) {
  const grab = sheet.querySelector('.sheet-grab');
  let startY = 0, dy = 0, startT = 0, dragging = false;

  grab.addEventListener('pointerdown', (e) => {
    if (!sheet.classList.contains('is-open')) return;
    dragging = true; startY = e.clientY; dy = 0; startT = performance.now();
    grab.setPointerCapture(e.pointerId);
    sheet.classList.add('is-dragging');
  });
  grab.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dy = Math.max(0, e.clientY - startY);
    const resisted = dy < 0 ? 0 : dy;
    sheet.style.transform = `translate(-50%, ${resisted}px)`;
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('is-dragging');
    const velocity = dy / Math.max(1, performance.now() - startT);
    if (dy > 90 || velocity > 0.6) closeSheet();
    else sheet.style.transform = '';
  };
  grab.addEventListener('pointerup', end);
  grab.addEventListener('pointercancel', end);
}

// Keep sheets above the on-screen keyboard (iOS doesn't resize the layout viewport).
if (window.visualViewport) {
  const vv = window.visualViewport;
  const sync = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${kb > 80 ? kb : 0}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
}

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */
export function createMenu(btn, pop, onAction) {
  const items = () => $$('.menu-item', pop).filter((i) => !i.hidden);
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';

  const open = () => {
    pop.hidden = false;
    pop.classList.remove('is-closing');
    pop.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-label', 'Close menu');
    items()[0]?.focus();
  };
  const close = ({ focusButton = true } = {}) => {
    if (!isOpen()) return;
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', 'Open menu');
    pop.classList.remove('is-open');
    pop.classList.add('is-closing');
    setTimeout(() => { if (!isOpen()) { pop.hidden = true; pop.classList.remove('is-closing'); } }, reducedMotion() ? 0 : 140);
    if (focusButton) btn.focus();
  };

  btn.addEventListener('click', () => (isOpen() ? close() : open()));
  document.addEventListener('click', (e) => {
    if (isOpen() && !pop.contains(e.target) && !btn.contains(e.target)) close({ focusButton: false });
  });
  pop.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') close({ focusButton: false });
  });
  pop.addEventListener('click', (e) => {
    const item = e.target.closest('.menu-item');
    if (!item) return;
    close({ focusButton: false });
    onAction(item.dataset.action);
  });

  return { close, isOpen };
}
