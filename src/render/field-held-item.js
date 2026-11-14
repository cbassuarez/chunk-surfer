// Ordinary carrying is another owner of the existing anatomical tool view.
// It owns no equipment, clock, input, asset copy or independent render loop.
import { BATTLE_GEAR, carryItemDefinition, parseRecordingCassetteId } from '../game/carry-items.js';
import { drawBattleHands3D, battleHandsDiagnostics } from './battle-hands.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const toolIds = new Set(Object.values(BATTLE_GEAR).map(item => item.toolId));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
let badgeModule = null, badgeRequest = null, badgeError = null;
const retainedRequests = new Map(), retainedErrors = new Map();

export function warmFieldHeldItem(id, { retry = false } = {}) {
  const definition = carryItemDefinition(id);
  const tool = definition?.heldModelId || id;
  if (tool !== 'badge') {
    if (toolIds.has(tool)) return Promise.resolve(true);
    if (!definition && !['ren-home-cassette', 'marble-eyes', 'b3-session-card', 'vale-guarantor-slip', 'music-box', 'recording-cassette', 'door-wedge'].includes(tool)) return Promise.resolve(false);
    if (retainedRequests.has(tool)) return retainedRequests.get(tool);
    if (retainedErrors.has(tool) && !retry) return Promise.resolve(false);
    const request = import('./battle-hand-tools.js').then(async module => {
      badgeModule = module;
      const ready = await module.warmRetainedHeldItem(tool);
      if (ready) retainedErrors.delete(tool); return ready;
    }).catch(error => { retainedErrors.set(tool, String(error?.message || error)); return false; })
      .finally(() => retainedRequests.delete(tool));
    retainedRequests.set(tool, request); return request;
  }
  if (badgeModule?.badgeHandToolReady()) return Promise.resolve(true);
  if (badgeRequest) return badgeRequest;
  if (badgeError && !retry) return Promise.resolve(false);
  badgeRequest = import('./battle-hand-tools.js').then(async module => {
    badgeModule = module;
    await module.warmBadgeHandTool(); badgeError = null; return true;
  }).catch(error => { badgeError = String(error?.message || error); return false; })
    .finally(() => { badgeRequest = null; });
  return badgeRequest;
}

export function fieldHeldItemLayout({ width = 0, height = 0, worldWidth = width, bottomInset = 0, pixelRatio = 1 } = {}) {
  const w = Math.max(0, finite(width)), h = Math.max(0, finite(height));
  if (!(w > 0 && h > 0)) return null;
  const ratio = clamp(finite(pixelRatio, 1), .375, 4);
  const available = clamp(finite(worldWidth, w), 1, w);
  const bottom = clamp(finite(bottomInset), 0, h * .3);
  const viewWidth = Math.min(available, Math.max(230 * ratio, Math.min(380 * ratio, available * .38)));
  const viewHeight = Math.min(h - bottom, Math.max(145 * ratio, Math.min(270 * ratio, h * .32)));
  // The physical sleeve must leave through the real screen edge. An inset
  // transparent target makes it end in mid-air even when its anatomy is sound.
  // HUD controls are painted afterward; the complete tool remains below the
  // navigator because this target occupies only the bottom32% of the view.
  return { x: Math.max(0, available - viewWidth), y: Math.max(0, h - bottom - viewHeight),
    width: viewWidth, height: viewHeight };
}

export function fieldHeldItemFrame(frame = {}, { width = 0, height = 0, mode = 'field' } = {}) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return null;
  const id = typeof frame.id === 'string' ? frame.id : null;
  const definition = id ? carryItemDefinition(id) : null;
  const registered = definition?.heldModelId || null;
  if (id && !registered) return null;
  const tool = registered || (typeof frame.toolId === 'string' && toolIds.has(frame.toolId) ? frame.toolId : null);
  if (!tool || (registered && frame.toolId && frame.toolId !== registered)) return null;
  const cassetteNumber = parseRecordingCassetteId(id);
  if (cassetteNumber != null && Number.isSafeInteger(frame.recording?.cassetteNumber) && frame.recording.cassetteNumber !== cassetteNumber) return null;
  // The inventory owner must positively attest both availability and display
  // ownership. A saved slot alone is not evidence that an object is carried.
  if (frame.active !== true || frame.present !== true || frame.deployed === true || frame.missing === true) return null;
  const w = Math.max(1, finite(width, 1)), h = Math.max(1, finite(height, 1));
  const inspection = mode === 'inspection';
  const inventory = mode === 'inventory' || inspection;
  // Include the recorder's real strain-relieved lead, not only its chassis.
  // Narrow apertures pull the camera back uniformly; digits never shrink.
  const extent = Math.max(inventory ? .58 : .48, .40 * h / w);
  const injury = typeof frame.injury === 'string' ? frame.injury
    : ['steady', 'hurt', 'wounded', 'critical'][clamp(Math.floor(finite(frame.injuries)), 0, 3)];
  const fieldLight = inventory ? null : frame.fieldLight || {
    torchPower: frame.lightOn === true ? 1 : 0, ambientIntensity: .027,
  };
  return {
    tool, itemId: id, fieldCarry: true,
    recording: cassetteNumber != null ? { ...(frame.recording || {}), cassetteNumber, takeOrdinal: cassetteNumber } : frame.recording,
    inspectionView: inspection ? { yaw: finite(frame.inspectionView?.yaw), pitch: clamp(finite(frame.inspectionView?.pitch), -1.15, 1.15) } : null,
    fieldFraming: { extent, halfWidth: extent * w / h / 2, scale: extent / h,
      // The radio's canonical antenna extends 139 mm above the case. Move
      // its complete supported assembly down instead of clipping the aerial.
      tool: [0, (inventory ? .065 : .015) - (tool === 'radio' ? .04 : 0), 0],
      leftWrist: [0, -extent, 0] },
    // Carrying never invents a strike, pressed control, damage or operation.
    actionActor: null, move: null, rawProgress: 0,
    now: inspection ? 0 : finite(frame.now), reducedMotion: inspection || frame.reducedMotion === true,
    reduceFlash: frame.reduceFlash === true, injury,
    fieldLight,
    lightOn: fieldLight ? finite(fieldLight.torchPower) > .001 : frame.lightOn === true,
    wet: clamp(finite(frame.wet), 0, 1),
    cosmetics: frame.fieldKit || frame.cosmetics || {},
    readout: frame.readout, radioCarrier: frame.radioCarrier || 'off',
    radioDead: frame.radioDead === true, channel: frame.channel,
  };
}

export function createFieldHeldItemPresenter({
  draw = drawBattleHands3D,
  prepare = warmFieldHeldItem,
  badgeReady = () => badgeModule?.badgeHandToolReady() === true,
  retainedReady = id => badgeModule?.retainedHeldItemReady(id) === true,
  diagnostics = battleHandsDiagnostics,
} = {}) {
  let last = { rendered: false, reason: 'inactive' };
  return {
    draw({ ctx, x = 0, y = 0, width = 0, height = 0, pixelRatio = 1, mode = 'field', display, frame = {} } = {}) {
      const pose = fieldHeldItemFrame(frame, { width, height, mode });
      if (!pose || !ctx || !(width > 0 && height > 0)) {
        last = { rendered: false, reason: 'inactive' }; return false;
      }
      if (pose.tool === 'badge' && !badgeReady()) {
        void prepare('badge');
        last = { rendered: false, reason: badgeError ? 'asset-unavailable' : 'asset-loading', tool: pose.tool, error: badgeError };
        return false;
      }
      if (!toolIds.has(pose.tool) && !retainedReady(pose.tool)) {
        void prepare(frame.id || pose.tool);
        const error = retainedErrors.get(pose.tool) || null;
        last = { rendered: false, reason: error ? 'asset-unavailable' : 'asset-loading', tool: pose.tool, error };
        return false;
      }
      const rendered = draw({ ctx, x, y, width, height, pixelRatio, display, ...pose });
      last = { rendered: !!rendered, reason: rendered ? 'held' : 'renderer-loading', tool: pose.tool,
        mode, rect: { x, y, width, height }, framing: pose.fieldFraming, renderer: diagnostics() };
      return !!rendered;
    },
    diagnostics: () => structuredClone(last),
  };
}

const shared = createFieldHeldItemPresenter();
export const drawFieldHeldItem = options => shared.draw(options);
export const fieldHeldItemDiagnostics = () => shared.diagnostics();
