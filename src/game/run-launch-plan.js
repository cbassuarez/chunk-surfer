import { makeRunId } from '../progression/schema.js';

const finite = (value, fallback = 0) => (
  Number.isFinite(Number(value)) ? Number(value) : fallback
);

export function nightSeedForRun(runOrdinal = 0) {
  let h = (Math.floor(finite(runOrdinal, 0)) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function savedRunAffinity(save = {}) {
  const run = save?.run;
  if (!run?.id || run.status !== 'active') return null;

  const view = save?.view;
  const ordinaryArea = String(save?.area || 'conservatory') === 'conservatory';
  const exact = ordinaryArea
    && Number.isFinite(Number(view?.yaw))
    && Number.isFinite(Number(view?.pitch));

  return Object.freeze({
    kind: 'saved-run',
    runId: String(run.id),
    checkpointRevision: Math.max(0, Math.floor(finite(save.checkpointRevision, 0))),
    cameraRevision: Math.max(0, Math.floor(finite(save.cameraRevision, 0))),
    exact,
  });
}

export function makeResumeLaunchPlan(save = {}, meta = {}) {
  const affinity = savedRunAffinity(save);
  if (!affinity) return null;

  const runOrdinal = Math.max(1, Math.floor(finite(meta?.runs, 1)));
  return Object.freeze({
    kind: 'resume',
    runId: affinity.runId,
    runOrdinal,
    nightSeed: nightSeedForRun(runOrdinal),
    area: String(save.area || 'conservatory'),
    position: Object.freeze({
      x: finite(save.px),
      y: finite(save.py),
    }),
    view: Object.freeze({
      yaw: Number.isFinite(Number(save?.view?.yaw)) ? Number(save.view.yaw) : null,
      pitch: Number.isFinite(Number(save?.view?.pitch)) ? Number(save.view.pitch) : 0,
    }),
    affinity,
    exact: affinity.exact,
  });
}

export function makeProspectiveRunPlan({
  meta = {},
  save = {},
  position = null,
  view: suppliedView = null,
  now = Date.now(),
  random = Math.random,
} = {}) {
  const startedAt = Math.floor(finite(now, Date.now()));
  const runOrdinal = Math.max(1, Math.floor(finite(meta?.runs, 0)) + 1);
  const runId = makeRunId(startedAt, random);
  const sourceView = suppliedView || save?.view;
  const view = Number.isFinite(Number(sourceView?.yaw))
    ? { yaw: Number(sourceView.yaw), pitch: finite(sourceView.pitch, 0) }
    : { yaw: null, pitch: 0 };
  const sourcePosition = position || { x: save?.px, y: save?.py };

  return Object.freeze({
    kind: 'new',
    runId,
    startedAt,
    runOrdinal,
    nightSeed: nightSeedForRun(runOrdinal),
    initialArea: 'prologue',
    initialPosition: Object.freeze({
      x: finite(sourcePosition?.x),
      y: finite(sourcePosition?.y),
    }),
    initialView: Object.freeze(view),
    affinity: Object.freeze({ kind: 'new-run', runId, exact: true }),
    exact: true,
  });
}

export function destinationAffinityForContinue(plan) {
  return plan?.kind === 'resume' ? plan.affinity : null;
}

export function destinationAffinityForNew(plan) {
  return plan?.kind === 'new' ? plan.affinity : null;
}

export function affinityMatches(a, b) {
  if (!a?.exact || !b?.exact || a.kind !== b.kind) return false;
  if (a.kind === 'new-run') return a.runId === b.runId;
  if (a.kind === 'saved-run') {
    return a.runId === b.runId
      && a.checkpointRevision === b.checkpointRevision
      && a.cameraRevision === b.cameraRevision;
  }
  return false;
}

export function handoffFor({ backdrop, destination } = {}) {
  return affinityMatches(backdrop, destination) ? 'lift' : 'iris';
}
