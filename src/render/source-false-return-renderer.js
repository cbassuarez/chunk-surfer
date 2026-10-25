// Ellery's copied physical slice and authored furnishings, temporarily borrowed
// by Source. This owner never writes FP, walking look targets or a second GL
// context. Only the far side of a revealed doorway becomes empty Source.
import * as R3 from './r3d.js';
import * as P3 from './props3d.js';
import { CELL, EYE, F, ZONE, MATERIAL } from '../data/floorplan/legend.js';
import { doorAssembly, doorLeafLocalMatrix } from '../data/source-door-fields.js';
import { sourceFalseReturnDoorFraction } from '../game/source-false-return.js';
import { assetUrl } from '../platform/paths.js';

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, finite(n)));
const encodeHeight = h => Math.round(clamp((h + 8) / 32, 0, 1) * 255);
const decodeHeight = byte => byte / 255 * 32 - 8;
const copy = value => {
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)]));
  return value;
};
// This borrowed floorset can arrive with every switchable fitting still off.
// Its ordinary warm ambient and baked enclosure stay intact; expose that real
// light sufficiently for a false return to read as Ellery before it unravels.
export const SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE = 2.4;
const matrix = (x, y, z, yaw = 0) => { const c = Math.cos(yaw), s = Math.sin(yaw); return new Float32Array([c,0,s,0,0,1,0,0,-s,0,c,0,x,y,z,1]); };
const multiply = (a, b) => { const out = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c*4+r] += a[k*4+r] * b[c*4+k]; return out; };
const positionOf = instance => ({ x: finite(instance.matrix?.[12], instance.x), y: finite(instance.matrix?.[13], instance.y), z: finite(instance.matrix?.[14], instance.z) });
const sourceIds = (layout, state) => [...new Set((state?.opened || []).length >= 5 ? layout.doors.map(d => d.id) : state?.sourceDoors || [])].filter(id => layout.doors.some(d => d.id === id)).sort();
function normalOf(door) { const x = finite(door.normal?.x, -Math.sin(finite(door.yaw))), z = finite(door.normal?.z, Math.cos(finite(door.yaw))), length = Math.hypot(x, z) || 1; return { x: x / length, z: z / length }; }
function sourceFace(door, state) {
  const n = normalOf(door), signed = (finite(state.x, door.x) - door.x) * n.x + (finite(state.z, door.z) - door.z) * n.z;
  const remembered = state.doorSides?.[door.id];
  // Keep the saved incoming face at the actual plane, where rounding alone
  // cannot say which side the body occupied. Away from it the physical body
  // takes precedence over a stale remembered side from another approach.
  let side = Math.abs(signed) > .035 ? Math.sign(signed) : remembered === 1 || remembered === -1 ? remembered : signed ? Math.sign(signed) : -1;
  // Completion holds a short material/audio handoff at the crossed threshold.
  // Its receipt names the crossing, so retain the incoming face rather than
  // flashing ordinary Ellery ahead during that final held frame.
  if (state.status === 'completed' && state.exitReceipt?.doorId === door.id) side *= -1;
  const away = side > 0 ? -1 : 1;
  return { ...door, normal: { x: n.x * away, z: n.z * away }, approachSide: side };
}
function insideBounds(x, z, bounds) { return !bounds || x >= finite(bounds.minX, -Infinity) && x <= finite(bounds.maxX, Infinity) && z >= finite(bounds.minZ, -Infinity) && z <= finite(bounds.maxZ, Infinity); }
function inWedge(x, z, door, bounds) {
  const n = normalOf(door), dx = x - door.x, dz = z - door.z, depth = dx * n.x + dz * n.z, across = Math.abs(dx * n.z - dz * n.x);
  const limit = Math.max(4, finite(door.sourceDepth, 12)), width = Math.min(3.25, finite(door.halfWidth, finite(door.width, 1) / 2) + Math.max(0, depth) * .3);
  // The real sill remains under a body straddling the leaf. Source begins past
  // its physical throat; choosing a face never erases the standing cell.
  return depth > .35 && depth <= limit && across <= width && insideBounds(x, z, bounds);
}
function doorOnPlan(door, plan) {
  const n = normalOf(door);
  for (const depth of [0, .5, -.5, 1]) {
    const x = Math.floor((door.x + n.x * depth) / CELL) - finite(plan.originX), z = Math.floor((door.z + n.z * depth) / CELL) - finite(plan.originY);
    if (x < 0 || z < 0 || x >= plan.w || z >= plan.h) continue;
    const at = (z * plan.w + x) * 4;
    if (!(plan.rgba[at+2] & F.SOLID) && Math.abs(decodeHeight(plan.rgba[at]) + finite(plan.heightOffset) - finite(door.feet)) < .7) return true;
  }
  return false;
}

// A fresh typed-array view for each truth state. The ordinary first four rooms
// remain byte-identical. Wedges are aperture-local, never a global Source wash.
export function sourceFalseReturnPlan(layout, state = {}) {
  const original = layout?.plan;
  if (!original || !Number.isInteger(original.w) || !Number.isInteger(original.h) || original.w < 1 || original.h < 1 || original.rgba?.length !== original.w * original.h * 4)
    throw Error('The false return needs Ellery\'s physical render plan.');
  const plan = { ...original, rgba: new Uint8Array(original.rgba), material: original.material ? new Uint8Array(original.material) : new Uint8Array(original.w * original.h).fill(MATERIAL.practiceFoam),
    ambient: original.ambient ? new Uint8Array(original.ambient) : new Uint8Array(original.w * original.h).fill(64) };
  const mask = new Uint8Array(plan.w * plan.h), ids = sourceIds(layout, state), doors = layout.doors.filter(d => ids.includes(d.id) && doorOnPlan(d, original)).map(d => sourceFace(d, state));
  let changed = 0;
  for (const door of doors) {
    const n = normalOf(door), depth = Math.max(4, finite(door.sourceDepth, 12)), farX = door.x + n.x * depth, farZ = door.z + n.z * depth;
    const minX = Math.max(0, Math.floor((Math.min(door.x, farX) - 3.5) / CELL - finite(plan.originX))), maxX = Math.min(plan.w - 1, Math.ceil((Math.max(door.x, farX) + 3.5) / CELL - finite(plan.originX)));
    const minZ = Math.max(0, Math.floor((Math.min(door.z, farZ) - 3.5) / CELL - finite(plan.originY))), maxZ = Math.min(plan.h - 1, Math.ceil((Math.max(door.z, farZ) + 3.5) / CELL - finite(plan.originY)));
    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
      const worldX = (x + finite(plan.originX) + .5) * CELL, worldZ = (z + finite(plan.originY) + .5) * CELL;
      if (!inWedge(worldX, worldZ, door, layout.bounds)) continue;
      const at = z * plan.w + x;
      // A slice may retain a stair or a second floor beside this room. A Source
      // aperture cannot raise/erase that other floor simply because X/Z overlap.
      const oldFlags = original.rgba[at*4+2], oldFloor = decodeHeight(original.rgba[at*4]) + finite(plan.heightOffset);
      const outsideBelow = (oldFlags & F.SKY) && oldFloor <= finite(door.feet) + .7;
      if (!(oldFlags & F.SOLID) && !outsideBelow && Math.abs(oldFloor - finite(door.feet)) > .7) continue;
      if (!mask[at]) changed++;
      mask[at] = 1; plan.rgba.set([encodeHeight(finite(door.feet) - finite(plan.heightOffset)), encodeHeight(24 - finite(plan.heightOffset)), F.SKY, ZONE.sourceSpace], at * 4);
      plan.material[at] = MATERIAL.sourceField; plan.ambient[at] = 1;
    }
  }
  return { plan, mask, sourceDoors: ids, changed, wedges: doors.map(d => ({ id: d.id, x: d.x, z: d.z, normal: normalOf(d), approachSide: d.approachSide, depth: Math.max(4, finite(d.sourceDepth, 12)) })) };
}
function hiddenBySource(instance, layout, view) {
  const p = positionOf(instance);
  return view.wedges.some(wedge => { const door = layout.doors.find(d => d.id === wedge.id); return inWedge(p.x, p.z, { ...door, normal: wedge.normal }, layout.bounds); });
}
function drawDoor(door, state) {
  const kit = doorAssembly(door.archetype, { hinge: door.hinge, activeLeaves: door.activeLeaves });
  const assembly = { ...kit, ...door, leafMesh: door.mesh || kit.leafMesh, activeLeaves: door.activeLeaves || kit.activeLeaves };
  const base = matrix(finite(door.x), finite(door.feet), finite(door.z), finite(door.yaw));
  const at = (suffix, mesh, m) => ({ id: `source-false-return-${door.id}-${suffix}`, mesh, doorId: door.id, matrix: m, x: m[12], y: m[13], z: m[14], zone: finite(door.zone, ZONE.practice), structural: true });
  const rows = [at('frame', door.frameMesh || kit.frameMesh, base)];
  const head = door.headMesh || kit.headMesh; if (head) rows.push(at('head', head, base));
  const fraction = clamp(sourceFalseReturnDoorFraction(state, door.id), 0, 1);
  for (let leaf = 0; leaf < assembly.leafCount; leaf++) {
    const local = doorLeafLocalMatrix(assembly, leaf, fraction);
    // The normal building's inward swing is the inverse of the free-standing
    // Source field hinge. Keep the exact assembly and invert only its sine.
    if (String(door.swing).includes('in')) { local[2] *= -1; local[8] *= -1; }
    rows.push({ ...at(`leaf-${leaf}`, assembly.leafMesh, multiply(base, local)), openFraction: assembly.activeLeaves.includes(leaf) ? fraction : 0, leafIndex: leaf });
  }
  return rows;
}
export function sourceFalseReturnRenderFrame(layout, state, { planView = sourceFalseReturnPlan(layout, state) } = {}) {
  const hiddenProps = [], props = [];
  for (const p of layout.props || []) { if (hiddenBySource(p, layout, planView)) hiddenProps.push(p.id); else props.push(p); }
  for (const door of layout.doors) props.push(...drawDoor(door, state));
  const lights = (layout.lights || []).filter(p => !hiddenBySource(p, layout, planView)).sort((a,b) => Math.hypot(a.x-state.x,a.z-state.z) - Math.hypot(b.x-state.x,b.z-state.z));
  const eye = [finite(state.x, layout.spawn?.x), finite(state.feet, layout.spawn?.feet) + EYE, finite(state.z, layout.spawn?.z)];
  return { props, lights, hiddenProps, sourceDoors: [...planView.sourceDoors], changedCells: planView.changed, authoredCamera: { eye, yaw: finite(state.yaw), pitch: clamp(state.pitch, -Math.PI / 2, Math.PI / 2) },
    plan: planView.plan, counts: { props: props.length, lights: lights.length, doors: layout.doors.length, hiddenProps: hiddenProps.length } };
}

export function createSourceFalseReturnRenderer({ layout, renderer = R3, props = P3, onRelease = () => {}, resolveAsset = assetUrl,
  getTorch = () => ({ on: true, look: { power: 1 } }) } = {}) {
  if ((!layout?.plan && typeof layout?.planFor !== 'function') || !Array.isArray(layout.doors) || !layout.doors.length) throw Error('The false return needs the actual Ellery floor set.');
  const local = copy(layout), required = new Set((local.props || []).map(p => p.mesh).filter(Boolean));
  for (const d of local.doors) for (const p of drawDoor(d, { elapsed: 0, doorOpen: {}, doorMotion: {} })) required.add(p.mesh);
  let initialized = false, released = false, acquired = false, loading = null, error = null, last = null, planView = null, planKey = null, viewLayout = local, torchFrame = null, lightingFrame = null;
  const resident = () => { const catalog = new Set(props.propMeshCatalog?.() || []); return [...required].every(m => catalog.has(m)); };
  function clearShared() {
    renderer.r3dSetHorizon?.(null); renderer.r3dSetSourceShore?.(null); renderer.r3dSetSourceEmergency?.(0); renderer.r3dSetSourceWhiteout?.(0); renderer.r3dSetSourceFault?.(0);
    renderer.r3dSetSourcePortals?.([]); renderer.r3dSetSourceOpenings?.([]); renderer.r3dSetSourceTowerView?.(null); renderer.r3dSetSourceDoorLights?.([]); renderer.r3dSetSourceCrossing?.(null); renderer.r3dSetSourceReflection?.(null);
    renderer.r3dSetLocalLights?.([]); renderer.r3dSetEmergencyShadows?.([]); renderer.r3dSetSourceTextInstances?.([]); renderer.r3dSetIndoorRain?.(0); renderer.r3dSetDynamicProps?.([]); renderer.r3dSetProps?.([]); props.setPressureInstances?.([]);
  }
  function setLighting(context) {
    lightingFrame = copy(context || { ambientColor: [.66,.51,.35], ambientIntensity: .027, whitePointScale: 1 });
    lightingFrame.captureExposure = Math.max(SOURCE_FALSE_RETURN_CAPTURE_EXPOSURE, finite(lightingFrame.captureExposure, 1));
    renderer.r3dSetLightingContext?.(lightingFrame);
  }
  function setPlan(state) {
    const provided = local.planFor?.(state) || {}, source = provided.plan || local.plan;
    if (!source) throw Error('Ellery\'s current floor slice has not resolved.');
    const next = { ...local, ...provided, plan: source }, observer = provided.observer || {};
    const ids = sourceIds(next, state), faces = next.doors.filter(d => ids.includes(d.id) && doorOnPlan(d, source)).map(d => { const facing = sourceFace(d, state); return `${d.id}:${facing.approachSide}`; });
    const key = [provided.key || source.key || 'fixed', source.w, source.h, source.originX, source.originY, source.heightOffset,
      observer.renderGroup || observer.group || '', observer.spaceId || '', observer.layer || '',
      ...ids, ...faces].join('|');
    if (planView && key === planKey) {
      // The physical slice can stay resident while the normal light resolver
      // selects nearer fittings as the body moves through a large room.
      viewLayout.lights = copy(next.lights || []);
      viewLayout.lightingContext = copy(next.lightingContext);
      setLighting(viewLayout.lightingContext);
      return;
    }
    viewLayout = { ...next, props: copy(next.props || []), doors: copy(next.doors || local.doors), lights: copy(next.lights || []), lightingContext: copy(next.lightingContext) };
    planView = sourceFalseReturnPlan(viewLayout, state); planKey = key;
    const p = planView.plan; renderer.r3dSetPlan(p.rgba, p.w, p.h, p.material, { ambient: p.ambient, originX: p.originX, originY: p.originY, heightOffset: p.heightOffset });
    setLighting(viewLayout.lightingContext);
  }
  function initialize() {
    if (loading) return loading;
    loading = (async () => {
      if (released) return false;
      if (await renderer.r3dBasePropsReady?.() === false) throw Error('Ellery\'s original prop catalog has not resolved.');
      if (released) return false;
      const doors = [...required].filter(mesh => /^door_/.test(mesh)), catalog = new Set(props.propMeshCatalog?.() || []);
      if (doors.some(mesh => !catalog.has(mesh))) await props.addPropPack(resolveAsset('assets/conservatory-doors.glb'));
      if (released) return false;
      // A copied stair can arrive before the host's optional wall-skin chain.
      if (required.has('main_stair_wall_treatment') && !new Set(props.propMeshCatalog?.() || []).has('main_stair_wall_treatment')) {
        try { await props.addPropPack(resolveAsset('assets/conservatory-stair-walls.glb')); }
        catch { required.delete('main_stair_wall_treatment'); }
      }
      if (released) return false;
      const ready = new Set(props.propMeshCatalog?.() || []), missing = [...required].filter(mesh => !ready.has(mesh));
      if (missing.length) throw Error('False return original meshes missing: ' + missing.slice(0, 12).join(', '));
      clearShared(); acquired = true; setPlan({ ...local.spawn, sourceDoors: [], opened: [] });
      renderer.r3dSetSourceScene?.({ key: 'source:false-return-ellery', corpus: [], staticInstances: [], dynamicInstances: [], look: { roomMemoryActive: false, blueprint: false, chroma: 1, paper: 0, sunrise: 0 }, weather: { rain: 0, clouds: 0, moon: 0 } });
      renderer.r3dSetLookProfile?.('explore', { transitionMs: 0 });
      renderer.r3dSnapCameraOnNextFrame?.(); renderer.r3dResetVfdMemory?.(); initialized = true; return true;
    })().catch(reason => { error = String(reason?.message || reason); throw reason; }); return loading;
  }
  function render(state) {
    if (!initialized || released) return false;
    if (error) throw Error(error);
    if (!resident()) throw Error('Ellery\'s original mesh catalog was replaced while its false return owned the view.');
    setPlan(state); last = sourceFalseReturnRenderFrame(viewLayout, state, { planView });
    const heldTorch = getTorch?.(); torchFrame = { on: !!heldTorch?.on, look: copy(heldTorch?.look || {}) };
    renderer.r3dSetProps(last.props); renderer.r3dSetDynamicProps?.([]); renderer.r3dSetLocalLights(last.lights);
    return renderer.r3dFrame({ px: last.authoredCamera.eye[0] / CELL - .5, py: last.authoredCamera.eye[2] / CELL - .5, floorH: last.authoredCamera.eye[1] - EYE, authoredCamera: last.authoredCamera,
      tileW: last.plan.w, tileH: last.plan.h, plan: true, worldCount: 0, worldTints: Array.from({length:5},()=>[1,1,1]), chunks: [], key: null, door: null, hush: null, audio: 0,
      light: torchFrame.on ? 1 : 0, torchLook: torchFrame.look, water: {active:false}, sensoryProfile: 'story', textSpace: false, sourceVoidPhysical: false }) !== false;
  }
  function dispose() { if (released) return false; released = true; initialized = false; if (acquired) clearShared(); onRelease(); return true; }
  return { initialize, render, ready: () => initialized && !released && !error && resident(), clear: () => renderer.r3dClearScreen?.(), dispose,
    diagnostics: () => ({ ready: initialized && !released && !error && resident(), released, acquired, error, meshCount: required.size,
      frame: last ? { camera: copy(last.authoredCamera), torch: copy(torchFrame), lighting: copy(lightingFrame), sourceDoors: [...last.sourceDoors], changedCells: last.changedCells, hiddenProps: [...last.hiddenProps], counts: {...last.counts} } : null }) };
}
