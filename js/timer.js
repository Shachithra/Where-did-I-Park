// Live "parked for" timer. One tick per second, aligned to the wall clock,
// and resynced when the tab becomes visible again (mobile browsers throttle timers).

const pad = (n) => String(n).padStart(2, '0');

export function splitDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

export function formatParts(ms) {
  const { h, m, s } = splitDuration(ms);
  return { h: pad(h), m: pad(m), s: pad(s) };
}

/** "1 hour 42 minutes" — for screen readers */
export function spokenDuration(ms) {
  const { h, m } = splitDuration(ms);
  const parts = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function createTimer(onTick) {
  let startedAt = null;
  let timeoutId = null;

  const tick = () => {
    if (startedAt === null) return;
    onTick(Date.now() - startedAt);
    // schedule for the next whole second so digits change in step with the clock
    const delay = 1000 - ((Date.now() - startedAt) % 1000) + 5;
    timeoutId = setTimeout(tick, delay);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible' && startedAt !== null) {
      clearTimeout(timeoutId);
      tick();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    start(from) {
      clearTimeout(timeoutId);
      startedAt = from;
      tick();
    },
    stop() {
      clearTimeout(timeoutId);
      startedAt = null;
    },
  };
}
