import { continuationVoidDomain, continuationVoidDomainForChart } from '../data/source-continuation-void.js';
import { SOURCE_CONTINUATION as C } from '../data/source-continuation.js';

const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const integer = v => Math.max(-1000000, Math.min(1000000, Math.trunc(finite(v))));
const point = p => ({ x: finite(p?.x), z: finite(p?.z), feet: finite(p?.feet),
  chartId: Math.max(0, integer(p?.chartId)), level: Math.max(0, integer(p?.level)), phase: 'wrong-return' });
const translationMatrix = ([x,y,z]) => [1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];

export function normalizeContinuationVoidLoop(value) {
  const domain = value?.version === 1 ? continuationVoidDomain(value) : null;
  return domain ? { version: 1, domainId: domain.id, wrapCount: Math.max(0, integer(value.wrapCount)) } : null;
}

export function captureContinuationVoidLoop(value) {
  if (value?.phase === 'catch') return null;
  const domain = continuationVoidDomain(value);
  return domain ? { version: 1, domainId: domain.id, wrapCount: 0 } : null;
}

export function continuationVoidLoopForFall(fall, { chartId = fall?.chartId ?? 0 } = {}) {
  if (Object.hasOwn(fall || {}, 'voidLoop')) return normalizeContinuationVoidLoop(fall.voidLoop);
  if (fall?.fromPhase !== 'wrong-return') return null;
  const owned = captureContinuationVoidLoop({ chartId, feet: fall.lastSupport?.feet ?? fall.feet, phase: 'wrong-return' });
  if (owned) return owned;
  // An older airborne portal save can still name its old-chart lastSupport.
  // Each outward chart has exactly one declared plane; no nearest-floor rule.
  const domain = continuationVoidDomainForChart(chartId);
  return domain ? { version: 1, domainId: domain.id, wrapCount: 0 } : null;
}

export function normalizeContinuationSpaceWrap(value) {
  const domain = continuationVoidDomain(value?.domainId);
  if (!domain || !value?.before || !value?.after) return null;
  const tileX = integer(value.tileX), tileZ = integer(value.tileZ);
  const translation = [tileX ? -tileX * domain.periodX : 0, domain.translationY, tileZ ? -tileZ * domain.periodZ : 0];
  return { version: 1, domainId: domain.id, tileX, tileZ, serial: Math.max(0, integer(value.serial)),
    translation, matrix: translationMatrix(translation),
    before: point(value.before), after: point(value.after) };
}

// A deck's lower address lattice is glued to its upper receiving cell by
// integer translations. This is the whole crossing rule: no target, collision
// search, checkpoint, grace, change of force, or velocity/orientation reset.
export function wrapContinuationVoid(fall) {
  const state = normalizeContinuationVoidLoop(fall?.voidLoop), domain = continuationVoidDomain(state);
  if (!domain || fall.feet + C.bodyHeight / 2 >= domain.exitY || fall.vy >= 0 || (fall.chartId ?? domain.chartId) !== domain.chartId) return null;
  const tileX = Math.floor((fall.x - domain.minX) / domain.periodX);
  const tileZ = Math.floor((fall.z - domain.minZ) / domain.periodZ);
  const translation = [tileX ? -tileX * domain.periodX : 0, domain.translationY, tileZ ? -tileZ * domain.periodZ : 0];
  const before = point({ ...fall, chartId: domain.chartId });
  fall.x += translation[0]; fall.feet += translation[1]; fall.z += translation[2];
  fall.voidLoop = { ...state, wrapCount: state.wrapCount + 1 };
  return normalizeContinuationSpaceWrap({ domainId: domain.id, tileX, tileZ, translation,
    serial: fall.voidLoop.wrapCount, before, after: point({ ...fall, chartId: domain.chartId }) });
}

// Body and eye are distinct points in the glued space. For the brief interval
// when the body has crossed but its eye has not, use the preceding complete
// coordinate image. Do not smooth or rotate a real spatial identification.
export function continuationVoidCameraEye(state, rawEye) {
  const receipt = normalizeContinuationSpaceWrap(state?.lastSpaceWrap);
  const loop = normalizeContinuationVoidLoop(state?.fall?.voidLoop);
  const domain = continuationVoidDomain(loop);
  if (!receipt || !domain || receipt.domainId !== domain.id || receipt.serial !== loop.wrapCount
    || rawEye[1] < domain.entryY) return [...rawEye];
  return rawEye.map((v, k) => v - receipt.translation[k]);
}
