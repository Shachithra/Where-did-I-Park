// Geolocation — gets the best fix it can within a short window.
//
// GPS often reports a rough fix first and tightens over a few seconds, so we
// watch briefly and keep the most accurate reading instead of trusting the first one.

const GOOD_ENOUGH_M = 20;      // stop early once we're this accurate
const REFINE_WINDOW_MS = 6000; // after first fix, keep improving for up to this long
const HARD_TIMEOUT_MS = 20000; // give up if no fix at all

export class LocationError extends Error {
  constructor(type, message) {
    super(message || type);
    this.type = type; // 'unsupported' | 'insecure' | 'denied' | 'unavailable' | 'timeout'
  }
}

export function isSupported() {
  return 'geolocation' in navigator;
}

/** 'granted' | 'denied' | 'prompt' | 'unknown' */
export async function permissionState() {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const s = await navigator.permissions.query({ name: 'geolocation' });
    return s.state;
  } catch {
    return 'unknown';
  }
}

/** Calls cb(state) when the user answers the browser's permission prompt. Returns an unsubscribe fn. */
export async function onPermissionChange(cb) {
  try {
    if (!navigator.permissions?.query) return () => {};
    const s = await navigator.permissions.query({ name: 'geolocation' });
    const handler = () => cb(s.state);
    s.addEventListener('change', handler);
    return () => s.removeEventListener('change', handler);
  } catch {
    return () => {};
  }
}

/**
 * Resolve with { latitude, longitude, accuracy }.
 * onFix(accuracy) is called for every reading so the UI can show "±42 m" while refining.
 */
export function locate({ onFix } = {}) {
  return new Promise((resolve, reject) => {
    if (!isSupported()) return reject(new LocationError('unsupported'));
    if (window.isSecureContext === false) return reject(new LocationError('insecure'));

    let best = null;
    let watchId = null;
    let refineTimer = null;
    let settled = false;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(refineTimer);
      clearTimeout(hardTimer);
      fn(value);
    };

    const toResult = (pos) => ({
      latitude: +pos.coords.latitude.toFixed(7),
      longitude: +pos.coords.longitude.toFixed(7),
      accuracy: Math.round(pos.coords.accuracy),
    });

    const hardTimer = setTimeout(() => {
      if (best) finish(resolve, best);
      else finish(reject, new LocationError('timeout'));
    }, HARD_TIMEOUT_MS);

    const onSuccess = (pos) => {
      const r = toResult(pos);
      if (!best || r.accuracy <= best.accuracy) best = r;
      onFix?.(best.accuracy);
      if (best.accuracy <= GOOD_ENOUGH_M) return finish(resolve, best);
      if (!refineTimer) refineTimer = setTimeout(() => finish(resolve, best), REFINE_WINDOW_MS);
    };

    const onError = (err) => {
      if (best) return finish(resolve, best); // we already have something usable
      const type = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
      finish(reject, new LocationError(type, err.message));
    };

    try {
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: HARD_TIMEOUT_MS,
      });
    } catch (e) {
      finish(reject, new LocationError('unavailable', e?.message));
    }
  });
}

/** Human copy for each failure type. */
export const ERROR_COPY = {
  denied: {
    eyebrow: 'Location access blocked',
    title: 'WhereDidIPark needs your location to remember where your vehicle is.',
    help: 'Allow location for this site in your browser’s settings (tap the icon beside the address bar), then try again.',
  },
  unavailable: {
    eyebrow: 'Location unavailable',
    title: 'Couldn’t get a GPS fix right now.',
    help: 'Check that location services are on for your device. Underground? Step closer to an exit or open area and try again.',
  },
  timeout: {
    eyebrow: 'Location timed out',
    title: 'Finding your position took too long.',
    help: 'GPS is weak here. Move toward an open area or a window and try again.',
  },
  unsupported: {
    eyebrow: 'Location not supported',
    title: 'This browser can’t share your location.',
    help: 'Open WhereDidIPark? in an up-to-date browser such as Chrome, Safari or Firefox.',
  },
  insecure: {
    eyebrow: 'Secure connection needed',
    title: 'Location only works over HTTPS.',
    help: 'Open this app from its https:// address (or localhost while developing).',
  },
};
