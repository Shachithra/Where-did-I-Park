// Local persistence — one record, one key. Nothing leaves the device.

export const STORAGE_KEY = 'whereDidIPark.parkingSpot';

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function isValid(r) {
  return r && typeof r === 'object'
    && Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 90
    && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180
    && Number.isFinite(r.parkedAt);
}

function normalise(r) {
  return {
    latitude: r.latitude,
    longitude: r.longitude,
    accuracy: Number.isFinite(r.accuracy) ? Math.round(r.accuracy) : null,
    level: clean(r.level, 6).toUpperCase(),
    spot: clean(r.spot, 8).toUpperCase(),
    note: clean(r.note, 80),
    parkedAt: r.parkedAt,
  };
}

export function loadSpot() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return isValid(data) ? normalise(data) : null;
  } catch {
    return null;
  }
}

/** Returns the saved record, or throws if storage is unavailable (private mode / quota). */
export function saveSpot(record) {
  const data = normalise(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  return data;
}

export function clearSpot() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to clear */ }
}
