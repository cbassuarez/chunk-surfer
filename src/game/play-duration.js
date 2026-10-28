// Real time spent in the presented run. The fictional night clock remains
// playSeconds: captures can add minutes to that clock without adding play time.
export const freshPlayDuration = () => ({ schema: 1, seconds: 0, priorUnmeasured: false });

export function normalizePlayDuration(value) {
  if (value?.schema !== 1 || typeof value.seconds !== 'number' || !Number.isFinite(value.seconds) || value.seconds < 0)
    return { schema: 1, seconds: 0, priorUnmeasured: true };
  return { schema: 1, seconds: Math.min(Number.MAX_SAFE_INTEGER, value.seconds), priorUnmeasured: value.priorUnmeasured !== false };
}

export function formatPlayDuration(seconds = 0) {
  const t = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export function playDurationReadout(save) {
  const record = normalizePlayDuration(save?.playDuration);
  return { label: 'CURRENT RUN PLAY TIME', value: formatPlayDuration(record.seconds),
    qualifier: record.priorUnmeasured ? 'SINCE UPDATE' : '', record };
}

export function playDurationLine(save, width = 80) {
  const { label, value, qualifier } = playDurationReadout(save);
  const prefix = label.length + 2 + value.length <= width ? label : 'PLAY TIME';
  const full = `${prefix}  ${value}${qualifier ? ' · SINCE UPDATE' : ''}`;
  if (qualifier && full.length > width) return `${width >= 21 ? 'SINCE UPDATE' : 'UPDATE'} ${value}`;
  return full;
}

export function createPlayDurationClock() {
  let identity = null, previousMs = null, wasActive = false;
  const suspend = () => { previousMs = null; wasActive = false; };
  return {
    suspend,
    reset() { identity = null; suspend(); },
    update({ runId, record, nowMs, active = false } = {}) {
      const next = normalizePlayDuration(record);
      const id = typeof runId === 'string' && runId ? runId : null;
      if (!id || !Number.isFinite(nowMs)) { identity = id; suspend(); return { record: next, addedSeconds: 0 }; }
      const sameRun = id === identity, forward = previousMs != null && nowMs >= previousMs;
      const addedSeconds = sameRun && forward && wasActive && active ? (nowMs - previousMs) / 1000 : 0;
      identity = id; previousMs = nowMs; wasActive = !!active;
      return { record: { ...next, seconds: Math.min(Number.MAX_SAFE_INTEGER, next.seconds + addedSeconds) }, addedSeconds };
    },
  };
}
