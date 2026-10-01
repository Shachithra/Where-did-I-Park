// WhereDidIPark? — app controller. Park. Save. Find.

import { loadSpot, saveSpot, clearSpot } from './storage.js';
import { locate, permissionState, onPermissionChange, ERROR_COPY } from './location.js';
import { createTimer, formatParts, spokenDuration } from './timer.js';
import { directionsUrl, formatCoords } from './maps.js';
import {
  $, $$, wait, reducedMotion, setStatus, setButton, pressFeedback, showView, flash, toast,
  openSheet, closeSheet, enableSheetDrag, createMenu,
} from './ui.js';

const LOW_ACCURACY_M = 50;

const COPY = {
  ...ERROR_COPY,
  storage: {
    eyebrow: 'Can’t store on this device',
    title: 'Your browser is blocking local storage, so the spot can’t be remembered.',
    help: 'Private or incognito windows often block storage. Open WhereDidIPark? in a normal window and try again.',
  },
};

/* ------------------------------------------------------------------ */
/* Elements & state                                                    */
/* ------------------------------------------------------------------ */
const el = {
  app: $('#app'),
  views: { empty: $('#view-empty'), saved: $('#view-saved') },

  // empty
  stage: $('#stage'),
  eyebrow: $('#empty-eyebrow'),
  eyebrowText: $('#empty-eyebrow-text'),
  title: $('#empty-title'),
  lede: $('#empty-lede'),
  help: $('#empty-help'),
  gpsStatus: $('#gps-status'),
  saveBtn: $('#save-btn'),

  // saved
  savedView: $('#view-saved'),
  bay: $('#bay'),
  bayText: $('#bay-text'),
  plate: $('#plate'),
  levelText: $('#level-text'),
  addDetails: $('#add-details'),
  locStatus: $('#loc-status'),
  timer: $('#timer'),
  sinceTime: $('#since-time'),
  sinceDay: $('#since-day'),
  noteBlock: $('#note-block'),
  noteText: $('#note-text'),
  coords: $('#coords'),
  accuracy: $('#accuracy'),
  goBtn: $('#go-btn'),
  goLabel: $('#go-label'),

  // sheets
  sheetDetails: $('#sheet-details'),
  detailsForm: $('#details-form'),
  detailsEyebrow: $('#details-eyebrow'),
  detailsTitle: $('#details-title'),
  detailsSub: $('#details-sub'),
  detailsSubmit: $('#details-submit'),
  detailsCancel: $('#details-cancel'),
  fLevel: $('#f-level'),
  fSpot: $('#f-spot'),
  fNote: $('#f-note'),
  noteCount: $('#note-count'),

  sheetUpdate: $('#sheet-update'),
  updateStatus: $('#update-status'),
  updateConfirm: $('#update-confirm'),

  sheetClear: $('#sheet-clear'),
  clearConfirm: $('#clear-confirm'),

  sheetAbout: $('#sheet-about'),
  installItem: $('.menu-item[data-action="install"]'),
};

const state = {
  spot: loadSpot(),
  busy: false,          // a GPS request is running
  updateToken: 0,       // invalidates an update if its sheet is dismissed mid-search
  installPrompt: null,
  statusResetTimer: null,
};

const timer = createTimer(renderTimer);

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */
function digits(str) {
  return [...str].map((d) => `<span class="d">${d}</span>`).join('');
}

let lastTimer = { h: '', m: '', s: '' };
function renderTimer(ms) {
  const p = formatParts(ms);
  for (const u of ['h', 'm', 's']) {
    if (p[u] !== lastTimer[u]) {
      el.timer.querySelector(`[data-u="${u}"]`).innerHTML = digits(p[u]);
    }
  }
  if (p.m !== lastTimer.m || p.h !== lastTimer.h) {
    el.timer.setAttribute('aria-label', `Parked for ${spokenDuration(ms)}`);
  }
  lastTimer = p;
}

function dayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function accuracyHtml(acc) {
  if (acc == null) return '—';
  const low = acc > LOW_ACCURACY_M;
  return `±${acc} m${low ? '<span class="warn">Low accuracy</span>' : ''}`;
}

function renderSaved(spot, { changed = [] } = {}) {
  // Bay — the strongest element on the screen.
  const hasSpot = !!spot.spot;
  el.bay.classList.toggle('is-empty', !hasSpot);
  el.bay.classList.toggle('is-long', hasSpot && spot.spot.length > 4);
  el.bayText.textContent = hasSpot ? spot.spot : 'P';
  el.bay.querySelector('.sr-only').textContent = hasSpot ? 'Parking spot ' : 'Parking spot not added';
  if (!hasSpot) el.bayText.setAttribute('aria-hidden', 'true'); else el.bayText.removeAttribute('aria-hidden');

  el.plate.hidden = !spot.level;
  el.levelText.textContent = spot.level;
  el.addDetails.hidden = hasSpot || !!spot.level;

  // Time
  const t = new Date(spot.parkedAt);
  el.sinceTime.textContent = t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  el.sinceDay.textContent = dayLabel(spot.parkedAt);
  lastTimer = { h: '', m: '', s: '' };
  timer.start(spot.parkedAt);

  // Note
  el.noteBlock.hidden = !spot.note;
  el.noteText.textContent = spot.note;

  // Location facts
  const c = formatCoords(spot);
  el.coords.innerHTML = `${c.lat}<br>${c.lng}`;
  el.coords.setAttribute('aria-label', `Latitude ${c.lat}, longitude ${c.lng}`);
  el.accuracy.innerHTML = accuracyHtml(spot.accuracy);

  // Navigation
  el.goBtn.href = directionsUrl(spot);
  el.goBtn.setAttribute('aria-label', `Take me there — opens Google Maps walking directions${hasSpot ? ` to spot ${spot.spot}` : ''}`);

  // Highlight what just changed
  const map = { spot: el.bayText, level: el.levelText, note: el.noteText, location: el.coords, accuracy: el.accuracy };
  changed.forEach((k) => map[k] && flash(map[k], 'is-changed', 950));
}

function setSavedStatus(kind = 'saved', acc) {
  clearTimeout(state.statusResetTimer);
  if (kind === 'saved') {
    setStatus(el.locStatus, { kind: 'ok', glyph: 'dot', text: 'Location saved' });
  } else if (kind === 'updated') {
    setStatus(el.locStatus, { kind: 'ok', glyph: 'check', text: 'Location updated', sub: acc != null ? `±${acc} m` : '' });
    state.statusResetTimer = setTimeout(() => setSavedStatus('saved'), 4000);
  }
}

function resetEmptyView() {
  el.stage.dataset.gps = 'idle';
  el.eyebrow.hidden = true;
  el.title.classList.remove('is-error');
  el.title.textContent = 'Where’s your car?';
  el.lede.hidden = false;
  el.help.hidden = true;
  setStatus(el.gpsStatus, {});
  el.saveBtn.disabled = false;
  setButton(el.saveBtn, { label: 'Save parking spot', icon: 'pin', state: null });
}

function showError(type) {
  const copy = COPY[type] || COPY.unavailable;
  el.stage.dataset.gps = 'error';
  el.eyebrowText.textContent = copy.eyebrow;
  el.eyebrow.hidden = false;
  el.title.textContent = copy.title;
  el.title.classList.add('is-error');
  el.lede.hidden = true;
  el.help.textContent = copy.help;
  el.help.hidden = false;
  flash(el.eyebrow, 'is-shake', 300);
  setStatus(el.gpsStatus, { kind: 'idle', glyph: 'hollow', text: 'Not saved yet', srExtra: `${copy.eyebrow}. ${copy.title}` });
  setButton(el.saveBtn, { label: 'Try again', icon: 'locate', state: null });
}

/* ------------------------------------------------------------------ */
/* GPS search — shared by "save" and "update"                          */
/* ------------------------------------------------------------------ */
async function findLocation(statusEl) {
  const searching = () => setStatus(statusEl, { kind: 'busy', glyph: 'pulse', text: 'Searching for location' });

  const perm = await permissionState();
  let unsubscribe = () => {};
  if (perm === 'prompt') {
    setStatus(statusEl, { kind: 'busy', glyph: 'pulse', text: 'Waiting for permission', sub: 'Allow location' });
    unsubscribe = await onPermissionChange((s) => { if (s === 'granted') searching(); });
  } else {
    searching();
  }

  try {
    return await locate({
      onFix: (acc) => setStatus(statusEl, { kind: 'busy', glyph: 'pulse', text: 'Refining fix', sub: `±${acc} m` }),
    });
  } finally {
    unsubscribe();
  }
}

/* ------------------------------------------------------------------ */
/* Flow: save a new parking spot                                       */
/* ------------------------------------------------------------------ */
async function saveFlow() {
  if (state.busy) return;
  state.busy = true;
  pressFeedback(el.saveBtn);

  // reset any previous error copy, keep the quiet screen
  el.eyebrow.hidden = true;
  el.help.hidden = true;
  el.lede.hidden = false;
  el.title.classList.remove('is-error');
  el.title.textContent = 'Where’s your car?';

  el.saveBtn.setAttribute('aria-disabled', 'true');
  setButton(el.saveBtn, { label: 'Locating…', icon: 'spinner', state: 'busy' });
  el.stage.dataset.gps = 'seeking';

  let pos;
  try {
    pos = await findLocation(el.gpsStatus);
  } catch (err) {
    state.busy = false;
    el.saveBtn.removeAttribute('aria-disabled');
    showError(err.type);
    return;
  }

  // Locked: rings contract into a solid marker
  el.stage.dataset.gps = 'locked';
  setStatus(el.gpsStatus, { kind: 'busy', glyph: 'dot', text: 'Location locked', sub: `±${pos.accuracy} m` });
  await wait(520, { min: 350 });

  try {
    state.spot = saveSpot({ ...pos, level: '', spot: '', note: '', parkedAt: Date.now() });
  } catch {
    state.busy = false;
    el.saveBtn.removeAttribute('aria-disabled');
    showError('storage');
    return;
  }

  // Saved: marker becomes a tick
  el.stage.dataset.gps = 'saved';
  setStatus(el.gpsStatus, { kind: 'ok', glyph: 'check', text: 'Location saved', sub: `±${pos.accuracy} m` });
  setButton(el.saveBtn, { label: 'Saved', icon: 'check', state: 'done' });
  await wait(700, { min: 500 });

  state.busy = false;
  el.saveBtn.removeAttribute('aria-disabled');
  openDetails('new');
}

/* ------------------------------------------------------------------ */
/* Details sheet (new + edit)                                          */
/* ------------------------------------------------------------------ */
let detailsMode = 'new';

function openDetails(mode) {
  detailsMode = mode;
  const s = state.spot || {};
  const isNew = mode === 'new';

  el.detailsEyebrow.hidden = !isNew;
  el.detailsTitle.textContent = isNew ? 'Add parking details' : 'Edit parking details';
  el.detailsSub.textContent = isNew
    ? 'All optional. Anything that helps you find it again.'
    : 'Level, spot and note. Your saved location doesn’t change.';
  el.detailsCancel.textContent = isNew ? 'Skip for now' : 'Cancel';
  setButton(el.detailsSubmit, { label: isNew ? 'Done' : 'Save changes', icon: null, state: null });
  el.detailsSubmit.disabled = false;

  el.fLevel.value = s.level || '';
  el.fSpot.value = s.spot || '';
  el.fNote.value = s.note || '';
  updateNoteCount();

  openSheet(el.sheetDetails, {
    initialFocus: isNew ? '#f-level' : '#f-spot',
    onClose: () => { if (detailsMode === 'new') goToSaved(); },
  });
}

function updateNoteCount() {
  el.noteCount.textContent = `${el.fNote.value.length} / 80`;
}

async function submitDetails(e) {
  e.preventDefault();
  if (!state.spot || el.detailsSubmit.disabled) return;
  pressFeedback(el.detailsSubmit);

  const before = state.spot;
  const next = {
    ...before,
    level: el.fLevel.value.trim().toUpperCase(),
    spot: el.fSpot.value.trim().toUpperCase(),
    note: el.fNote.value.trim(),
  };

  el.detailsSubmit.disabled = true;
  setButton(el.detailsSubmit, { label: 'Saving…', icon: 'spinner', state: 'busy' });
  await wait(320, { min: 150 });

  try {
    state.spot = saveSpot(next);
  } catch {
    el.detailsSubmit.disabled = false;
    setButton(el.detailsSubmit, { label: detailsMode === 'new' ? 'Done' : 'Save changes', icon: null, state: null });
    toast('Couldn’t save — storage blocked', { warn: true });
    return;
  }

  const isNew = detailsMode === 'new';
  setButton(el.detailsSubmit, { label: isNew ? 'Saved' : 'Updated', icon: 'check', state: 'done' });
  await wait(460, { min: 400 });

  detailsMode = 'closing';
  await closeSheet({ silent: true, reason: 'done' });

  if (isNew) {
    goToSaved();
  } else {
    const changed = ['spot', 'level', 'note'].filter((k) => before[k] !== state.spot[k]);
    renderSaved(state.spot, { changed });
    flash(el.savedView, 'is-refreshing', 800);
  }
}

async function goToSaved() {
  detailsMode = 'closing';
  renderSaved(state.spot);
  setSavedStatus('saved');
  await showView(el.app, el.views, 'saved');
  resetEmptyView();
  $('#saved-title').focus?.();
}

/* ------------------------------------------------------------------ */
/* Flow: update location                                               */
/* ------------------------------------------------------------------ */
function openUpdate() {
  setStatus(el.updateStatus, {});
  el.updateConfirm.disabled = false;
  el.updateConfirm.removeAttribute('aria-disabled');
  setButton(el.updateConfirm, { label: 'Use current location', icon: 'locate', state: null });
  openSheet(el.sheetUpdate, {
    initialFocus: '#update-confirm',
    onClose: () => { state.updateToken++; state.busy = false; },
  });
}

async function runUpdate() {
  if (state.busy) return;
  state.busy = true;
  const token = ++state.updateToken;
  pressFeedback(el.updateConfirm);

  el.updateConfirm.setAttribute('aria-disabled', 'true');
  setButton(el.updateConfirm, { label: 'Locating…', icon: 'spinner', state: 'busy' });

  let pos;
  try {
    pos = await findLocation(el.updateStatus);
  } catch (err) {
    if (token !== state.updateToken) return;
    state.busy = false;
    const copy = COPY[err.type] || COPY.unavailable;
    setStatus(el.updateStatus, { kind: 'warn', glyph: 'alert', text: copy.eyebrow, sub: 'Saved spot kept', srExtra: copy.help });
    el.updateConfirm.removeAttribute('aria-disabled');
    setButton(el.updateConfirm, { label: 'Try again', icon: 'locate', state: null });
    return;
  }
  if (token !== state.updateToken) return; // sheet was dismissed

  setStatus(el.updateStatus, { kind: 'busy', glyph: 'dot', text: 'Location locked', sub: `±${pos.accuracy} m` });
  await wait(420, { min: 300 });

  const before = state.spot;
  try {
    state.spot = saveSpot({ ...before, ...pos, parkedAt: Date.now() });
  } catch {
    state.busy = false;
    setStatus(el.updateStatus, { kind: 'warn', glyph: 'alert', text: 'Storage blocked', sub: 'Saved spot kept' });
    el.updateConfirm.removeAttribute('aria-disabled');
    setButton(el.updateConfirm, { label: 'Try again', icon: 'locate', state: null });
    return;
  }

  setStatus(el.updateStatus, { kind: 'ok', glyph: 'check', text: 'Location updated', sub: `±${pos.accuracy} m` });
  setButton(el.updateConfirm, { label: 'Updated', icon: 'check', state: 'done' });
  await wait(600, { min: 450 });

  state.busy = false;
  await closeSheet({ silent: true, reason: 'done' });
  renderSaved(state.spot, { changed: ['location', 'accuracy'] });
  setSavedStatus('updated', pos.accuracy);
}

/* ------------------------------------------------------------------ */
/* Flow: clear parking                                                 */
/* ------------------------------------------------------------------ */
function openClear() {
  el.clearConfirm.disabled = false;
  setButton(el.clearConfirm, { label: 'Remove parking', icon: 'trash', state: null });
  openSheet(el.sheetClear, { initialFocus: '[data-close]' });
}

async function runClear() {
  pressFeedback(el.clearConfirm);
  el.clearConfirm.disabled = true;
  setButton(el.clearConfirm, { label: 'Removing…', icon: 'spinner', state: 'busy' });
  await wait(260, { min: 120 });

  clearSpot();
  state.spot = null;
  await closeSheet({ silent: true, reason: 'done' });

  timer.stop();
  resetEmptyView();
  await showView(el.app, el.views, 'empty');
  toast('Parking spot removed');
  el.saveBtn.focus({ preventScroll: true });
}

/* ------------------------------------------------------------------ */
/* Flow: Take me there                                                 */
/* ------------------------------------------------------------------ */
let goResetTimer;
function onGo() {
  // Let the link open Maps natively (keeps the user gesture); just show feedback.
  el.goBtn.classList.add('is-opening');
  el.goLabel.textContent = 'Opening maps';
  flash(el.goBtn, 'is-swapping', 250);
  clearTimeout(goResetTimer);
  goResetTimer = setTimeout(() => {
    el.goBtn.classList.remove('is-opening');
    el.goLabel.textContent = 'Take me there';
  }, 2600);
}

/* ------------------------------------------------------------------ */
/* Actions & wiring                                                    */
/* ------------------------------------------------------------------ */
function handleAction(action) {
  switch (action) {
    case 'edit': if (state.spot) openDetails('edit'); break;
    case 'update': if (state.spot) openUpdate(); break;
    case 'clear': if (state.spot) openClear(); break;
    case 'about': openSheet(el.sheetAbout); break;
    case 'install': promptInstall(); break;
  }
}

function syncMenu() {
  const saved = !!state.spot;
  $$('.menu-item[data-when="saved"]').forEach((i) => { i.hidden = !saved; });
  el.installItem.hidden = !state.installPrompt;
}

async function promptInstall() {
  const p = state.installPrompt;
  if (!p) return;
  p.prompt();
  const { outcome } = await p.userChoice;
  state.installPrompt = null;
  syncMenu();
  if (outcome === 'accepted') toast('Installing Parked');
}

function wire() {
  el.saveBtn.addEventListener('click', saveFlow);
  el.detailsForm.addEventListener('submit', submitDetails);
  el.detailsCancel.addEventListener('click', () => closeSheet());
  el.fNote.addEventListener('input', updateNoteCount);
  // Enter on level/spot moves to the next field instead of submitting
  [el.fLevel, el.fSpot].forEach((input, i, arr) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); (arr[i + 1] || el.fNote).focus(); }
    });
  });
  // Keep the focused field visible above the keyboard
  el.sheetDetails.addEventListener('focusin', (e) => {
    if (e.target.matches('input')) setTimeout(() => e.target.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }), 300);
  });

  el.updateConfirm.addEventListener('click', runUpdate);
  el.clearConfirm.addEventListener('click', runClear);
  el.goBtn.addEventListener('click', onGo);

  el.savedView.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (b) handleAction(b.dataset.action);
  });

  const menu = createMenu($('#menu-btn'), $('#menu'), handleAction);
  $('#menu-btn').addEventListener('click', syncMenu, { capture: true });

  [el.sheetDetails, el.sheetUpdate, el.sheetClear, el.sheetAbout].forEach(enableSheetDrag);

  // Another tab changed the saved spot
  window.addEventListener('storage', (e) => {
    if (e.key !== 'whereDidIPark.parkingSpot') return;
    state.spot = loadSpot();
    menu.close({ focusButton: false });
    if (state.spot) { renderSaved(state.spot); setSavedStatus('saved'); showView(el.app, el.views, 'saved'); }
    else { timer.stop(); resetEmptyView(); showView(el.app, el.views, 'empty'); }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.installPrompt = e;
    syncMenu();
  });
  window.addEventListener('appinstalled', () => { state.installPrompt = null; syncMenu(); });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
function boot() {
  wire();
  syncMenu();

  if (state.spot) {
    renderSaved(state.spot);
    setSavedStatus('saved');
    showView(el.app, el.views, 'saved', { animate: false });
  } else {
    resetEmptyView();
    showView(el.app, el.views, 'empty', { animate: false });
  }

  // A. App entrance: header → content → primary action
  el.app.classList.add('is-entering');
  setTimeout(() => el.app.classList.remove('is-entering'), 1000);

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is a bonus */ });
    });
  }
}

boot();
