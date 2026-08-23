export const OPENING_BED_BPM = 120;
export const OPENING_BED_BEATS_PER_BAR = 4;
export const OPENING_BED_BEAT_SECONDS = 60 / OPENING_BED_BPM;
export const OPENING_BED_BAR_SECONDS = OPENING_BED_BEAT_SECONDS * OPENING_BED_BEATS_PER_BAR;
export const OPENING_BED_LOOP_SECONDS = OPENING_BED_BAR_SECONDS * 8;
export const OPENING_BED_MIN_TRANSITION_LEAD = 0.12;

export function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

export function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function nextOpeningBedDownbeatAt(
  now,
  downbeatAt,
  {
    barSeconds = OPENING_BED_BAR_SECONDS,
    minLead = OPENING_BED_MIN_TRANSITION_LEAD,
  } = {},
) {
  const t = Number(now);
  const origin = Number(downbeatAt);
  const bar = Number(barSeconds);
  const lead = Number(minLead);

  if (!Number.isFinite(t) || !Number.isFinite(origin) || !Number.isFinite(bar) || bar <= 0) {
    return Number.isFinite(t) ? t : 0;
  }

  const safeNow = t + Math.max(0, Number.isFinite(lead) ? lead : 0);
  if (safeNow <= origin) return origin;

  const bars = Math.ceil((safeNow - origin) / bar);
  return origin + bars * bar;
}

export function openingBedProximityForDistance(distance) {
  const d = Math.max(0, Number.isFinite(Number(distance)) ? Number(distance) : 0);
  const filter = smoothstep(24, 10, d);
  const near = smoothstep(8, 2.2, d);

  return {
    filter,
    near,
    gain: lerp(1.0, 0.16, near),
    hpHz: lerp(45, 820, filter),
    lpHz: lerp(16000, 1850, filter),
    q: lerp(0.55, 1.15, filter),
  };
}
