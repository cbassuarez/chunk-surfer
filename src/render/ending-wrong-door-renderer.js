import { ZONE } from '../data/floorplan/legend.js';
import { ENDING_WRONG_DOOR_OMEN, endingWrongDoorOmenFrame } from '../data/ending-wrong-door-omen.js';
import { SOURCE_DEMOLITION_GEOMETRY as GEOMETRY } from '../data/generated/source-demolition-geometry.js';
import { SOURCE_DEMOLITION_MOTION as MOTION } from '../data/generated/source-demolition-motion.js';
import { sourceDemolitionInstances } from './source-demolition.js';
import { createSourceEarthfallRenderer, sourceEarthfallRenderFrame, SOURCE_EARTHFALL_RENDER_BUDGET } from './source-earthfall-renderer.js';
import * as P3 from './props3d.js';

const clamp = n => Math.max(0, Math.min(1, Number(n) || 0));
const hash = (i, s = 0) => { let h = Math.imul(i + 31, 0x45d9f3b) ^ Math.imul(s + 71, 0x27d4eb2d); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const transform = (m, p) => [0, 1, 2].map(r => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const boxMatrix = ({ min, max }) => new Float32Array([
  max[0] - min[0], 0, 0, 0, 0, max[1] - min[1], 0, 0,
  0, 0, max[2] - min[2], 0, (min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2, 1,
]);

export const ENDING_WRONG_DOOR_RENDER_BUDGET = Object.freeze({
  ...SOURCE_EARTHFALL_RENDER_BUDGET, presences: 96, voidCells: 4, additionalMeshes: 0, additionalLights: 0, additionalShadowMaps: 0,
});

function finiteVoid(bounds) {
  if (!bounds) return [];
  const cells = [], midX = (bounds.min[0] + bounds.max[0]) / 2, midZ = (bounds.min[2] + bounds.max[2]) / 2;
  for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
    const cell = { min: [x ? midX : bounds.min[0], bounds.min[1], z ? midZ : bounds.min[2]],
      max: [x ? bounds.max[0] : midX, bounds.max[1], z ? bounds.max[2] : midZ] };
    const matrix = boxMatrix(cell);
    cells.push({ id: `ending-wrong-door:finite-nothingness-${x}-${z}`, mesh: GEOMETRY.darkMesh, matrix,
      x: matrix[12], y: matrix[13], z: matrix[14], cullRadius: Math.sqrt(3) / 2,
      zone: ZONE.sourceSpace, structural: false, noShadow: true, noReflection: true,
      apparitionVariant: 13, sourceStructure: 'ending-wrong-door-void', endingOmenRole: 'nothingness' });
  }
  // Four adjoining interiors bound the longest ray by190m, within the shared
  //240m projection even from an outer corner. One full-shaft cube can exceed
  // that plane; the same black material on shared faces prevents that hole.
  return cells;
}

function releasedTraces(base, omen, presentation) {
  if (!omen.released) return [];
  const facade = base.props.find(p => p.earthfallRole === 'ellery');
  if (!facade?.matrix) return [];
  // Source I's renderer expects its own quarter-turned facade. Re-express the
  // actual descending Ellery apertures in that frame, preserving the original
  // source function's torso offset. No guessed holes or camera-facing sprites.
  const emitters = GEOMETRY.emitters.map(emitter => {
    const c = emitter.center, point = transform(facade.matrix, [c[0] - .2, c[1] - .9, c[2]]);
    return { ...emitter, center: [.2 - point[2], point[1] + .9, point[0]], endingWorldOrigin: point };
  });
  const frame = { visible: true, anchored: true, released: false, committed: true,
    elapsed: omen.elapsed, blackness: 0, consumption: omen.progress,
    origin: { x: 0, y: 0, z: 0 }, roadOrigin: { x: 0, z: 8 } };
  const source = sourceDemolitionInstances(frame, {
    geometry: { ...GEOMETRY, parts: [], emitters }, motion: MOTION,
    reducedMotion: !!presentation.reducedMotion || !!presentation.reduceMotion || presentation.shakeMode === 'off',
    reducedDread: !!presentation.reducedDread, effectsMode: presentation.effectsMode || 'full',
  }).filter(p => p.sourceStructure === 'source-demolition-spirit');
  return source.map(instance => {
    const index = Number(instance.id.match(/spirit-(\d+)$/)?.[1]) || 0;
    const curtain = instance.sourceDemolitionRole === 'curtain';
    const duration = curtain ? .58 + hash(index, 21) * .17 : 1.05 + hash(index, 21) * .55;
    let travel = clamp((omen.elapsed - instance.sourceDemolitionBirth) / duration);
    if (presentation.reducedMotion || presentation.reduceMotion || presentation.shakeMode === 'off') travel = travel > .55 ? 1 : 0;
    const matrix = new Float32Array(instance.matrix);
    // The original shore's target floor is zero. Raise only the travelled
    // portion to the shaft's fixed, gravity-derived plane. A trace still
    // leaves its true opening before crossing the occupied descent volume.
    matrix[13] += omen.flowHeight * travel;
    const emitter = emitters.find(e => e.id === instance.sourceDemolitionEmitter);
    return { ...instance, id: instance.id.replace('source-demolition:', 'ending-wrong-door:'), matrix,
      x: matrix[12], y: matrix[13], z: matrix[14], sourceStructure: 'ending-wrong-door-spirit',
      endingOmenRole: curtain ? 'curtain' : 'stream', endingEmitterOrigin: emitter?.endingWorldOrigin };
  });
}

export function endingWrongDoorRenderFrame(state, presentation = {}, suppliedBase = null) {
  const base = suppliedBase || sourceEarthfallRenderFrame(state, presentation);
  const omen = endingWrongDoorOmenFrame(base.source, presentation);
  const traces = releasedTraces(base, omen, presentation);
  // Replace the second omen's sparse residues with the first omen's released
  // traces. Architecture, slab motion, camera and physical support stay exact.
  const physical = base.props.filter(p => p.earthfallRole !== 'residue');
  const voidInstances = finiteVoid(omen.bounds);
  // Opaque world occupancy hides scenery only from inside its finite limits.
  // This is the first omen's geometric rule, not a framebuffer/DOM fade. The
  // simulation keeps the full floor and body and yields the view on landing.
  const props = omen.occupied ? voidInstances : [...physical, ...traces, ...voidInstances];
  return { ...base, props, lights: omen.occupied ? [] : base.lights,
    counts: { ...base.counts, props: props.length, presences: omen.occupied ? 0 : traces.length },
    endingOmen: { ...omen, traceCount: traces.length, visibleTraceCount: omen.occupied ? 0 : traces.length,
      inheritedSequence: ENDING_WRONG_DOOR_OMEN.sequenceId, budgets: ENDING_WRONG_DOOR_RENDER_BUDGET } };
}

export function createEndingWrongDoorRenderer(options = {}) {
  const upstream = options.transformFrame, props = options.props || P3;
  let last = null;
  const hasVoid = () => (props.propMeshCatalog?.() || []).includes(GEOMETRY.darkMesh);
  const owner = createSourceEarthfallRenderer({ ...options,
    transformFrame(state, presentation, base) {
      const frame = endingWrongDoorRenderFrame(state, presentation, base);
      last = typeof upstream === 'function' ? upstream(state, presentation, frame) : frame;
      return last;
    },
  });
  return { ...owner,
    async initialize() {
      if (await owner.initialize() === false) return false;
      // The existing demolition pack already contains this finite volume. A
      // missing mesh is a failed dependency, never a silently skipped blackout.
      if (!hasVoid()) { owner.dispose(); throw Error('The wrong door is missing its finite Source nothingness mesh.'); }
      return true;
    },
    ready: () => owner.ready() && hasVoid(),
    render(state, presentation) { if (!hasVoid()) return false; return owner.render(state, presentation); },
    diagnostics: () => ({ ...owner.diagnostics(), endingOmen: last?.endingOmen || null }),
  };
}
