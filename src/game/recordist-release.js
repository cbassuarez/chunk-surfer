// A physical release is earned here, separately from choosing its ending text.
// The host owns input, actual tools, range/facing, saves, audio and the carry.
// This module never sets flags, commits an ending or manufactures ownership.
export const RECORDIST_RELEASE_VERSION = 1;
export const RECORDIST_RELEASE_SECONDS = Object.freeze({ address: 2.4, interrupt: 1.5, settling: 2.2, lift: 2.8 });
export const RECORDIST_RELEASE_STAGES = Object.freeze(['address', 'interrupt', 'settling', 'lift', 'carried']);
const number = (v, fallback = 0) => typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const clamp = (v, low, high) => Math.max(low, Math.min(high, number(v, low)));
const angle = v => Math.atan2(Math.sin(number(v)), Math.cos(number(v)));
const anchor = value => value && ['x', 'y', 'z'].every(k => Number.isFinite(value[k]))
  ? { x: value.x, y: value.y, z: value.z, yaw: angle(value.yaw) } : null;
const owner = id => typeof id === 'string' && id.length > 0 && id.length <= 128 ? id : null;
const phaseFor = proof => !proof.addressed ? 'address' : !proof.interrupted ? 'interrupt'
  : !proof.released ? 'settling' : !proof.lifted ? 'lift' : 'carried';

export function normalizeRecordistRelease(value, { runId = null } = {}) {
  if (!value || typeof value !== 'object' || value.version !== RECORDIST_RELEASE_VERSION) return null;
  const savedRun = owner(value.runId), origin = anchor(value.origin);
  if (!savedRun || !origin || runId !== null && savedRun !== runId) return null;
  // Later facts cannot bypass an unfinished earlier physical operation.
  const proof = { addressed: value.proof?.addressed === true,
    interrupted: value.proof?.addressed === true && value.proof?.interrupted === true,
    released: value.proof?.addressed === true && value.proof?.interrupted === true && value.proof?.released === true,
    lifted: value.proof?.addressed === true && value.proof?.interrupted === true && value.proof?.released === true && value.proof?.lifted === true };
  const stage = phaseFor(proof), unchangedStage = stage === value.stage;
  return { version: RECORDIST_RELEASE_VERSION, runId: savedRun, origin, stage, proof,
    holdSeconds: unchangedStage ? clamp(value.holdSeconds, 0, RECORDIST_RELEASE_SECONDS[stage] || 0) : 0,
    phaseSeconds: unchangedStage ? Math.max(0, number(value.phaseSeconds)) : 0,
    timeSeconds: Math.max(0, number(value.timeSeconds)),
    requiresRelease: value.requiresRelease !== false,
  };
}

export function beginRecordistRelease({ runId, origin } = {}) {
  if (!owner(runId) || !anchor(origin)) throw new Error('Recordist release requires its real run and physical floor anchor.');
  return normalizeRecordistRelease({ version: RECORDIST_RELEASE_VERSION, runId, origin,
    stage: 'address', proof: {}, holdSeconds: 0, phaseSeconds: 0, timeSeconds: 0,
    // The key which chose the route cannot also operate the rig.
    requiresRelease: true }, { runId });
}

export function recordistReleaseView(value) {
  const state = normalizeRecordistRelease(value);
  if (!state) return { active: false, stage: null, carryReady: false };
  const requirements = {
    address: { tool: 'rig', label: 'SEAT THE RIG AGAINST THE RETURN', caption: 'His hands are still keeping somebody else’s time.', point: [0, .86, -.18] },
    interrupt: { tool: 'fork', label: 'BREAK THE BORROWED PHRASE', caption: 'The rig has found the line. The fork can stop it.', point: [0, .84, -.18] },
    settling: { tool: null, label: '', caption: 'The next breath belongs to him.', point: [.20, .54, -.18] },
    lift: { tool: null, label: 'GET UNDER HIS WEIGHT', caption: 'He cannot stand. Put an arm under his shoulders.', point: [.25, .40, -.12] },
    carried: { tool: null, label: '', caption: '', point: [0, .8, 0] },
  };
  const row = requirements[state.stage], duration = RECORDIST_RELEASE_SECONDS[state.stage] || 0;
  const c = Math.cos(state.origin.yaw), s = Math.sin(state.origin.yaw), [x, y, z] = row.point;
  return { active: state.stage !== 'carried', stage: state.stage, tool: row.tool, actionLabel: row.label,
    caption: row.caption, held: state.holdSeconds > 0,
    progress: duration ? Math.min(1, (state.stage === 'settling' ? state.phaseSeconds : state.holdSeconds) / duration) : 1,
    requiresRelease: state.requiresRelease, carryReady: state.stage === 'carried' && state.proof.lifted,
    target: { x: state.origin.x + x * c + z * s, y: state.origin.y + y, z: state.origin.z - x * s + z * c },
    origin: { ...state.origin },
  };
}

export function advanceRecordistRelease(value, {
  dt = 0, interactHeld = false, inRange = false, facing = false,
  hasRig = false, hasFork = false, paused = false, focused = true, hidden = false, blocked = false,
} = {}) {
  const state = normalizeRecordistRelease(value);
  if (!state) return { state: null, changed: false, cues: [], carryReady: false };
  const before = JSON.stringify(state), cues = [], priorStage = state.stage;
  if (state.stage === 'carried') return { state, changed: false, cues, carryReady: false };
  const suspended = paused || focused === false || hidden || blocked;
  if (suspended) {
    state.holdSeconds = 0; state.requiresRelease = true;
  } else {
    // A long frame, background tab or reopened application cannot finish an
    // unseen hold. The host's ordinary simulation clock remains authoritative.
    const seconds = clamp(dt, 0, .1);
    state.timeSeconds += seconds;
    if (state.stage === 'settling') {
      state.phaseSeconds = Math.min(RECORDIST_RELEASE_SECONDS.settling, state.phaseSeconds + seconds);
      if (state.phaseSeconds + 1e-7 >= RECORDIST_RELEASE_SECONDS.settling) {
        state.proof.released = true; state.stage = 'lift'; state.phaseSeconds = 0;
        state.holdSeconds = 0; state.requiresRelease = true;
        cues.push({ id: 'body-released', kind: 'breath' });
      }
    } else {
      state.phaseSeconds += seconds;
      if (!interactHeld) { state.holdSeconds = 0; state.requiresRelease = false; }
      const owned = state.stage === 'address' ? hasRig === true : state.stage === 'interrupt' ? hasFork === true : true;
      const permitted = interactHeld === true && !state.requiresRelease && inRange === true && facing === true && owned;
      if (!permitted) state.holdSeconds = 0;
      else {
        state.holdSeconds = Math.min(RECORDIST_RELEASE_SECONDS[state.stage], state.holdSeconds + seconds);
        if (state.holdSeconds + 1e-7 >= RECORDIST_RELEASE_SECONDS[state.stage]) {
          if (state.stage === 'address') {
            state.proof.addressed = true; state.stage = 'interrupt'; cues.push({ id: 'rig-seated', kind: 'mechanism' });
          } else if (state.stage === 'interrupt') {
            state.proof.interrupted = true; state.stage = 'settling'; cues.push({ id: 'fork-struck', kind: 'fork' });
          } else {
            state.proof.lifted = true; state.stage = 'carried'; cues.push({ id: 'carry-ready', kind: 'effort' });
          }
          state.holdSeconds = 0; state.phaseSeconds = 0; state.requiresRelease = true;
        }
      }
    }
  }
  return { state, changed: JSON.stringify(state) !== before, cues,
    carryReady: priorStage !== 'carried' && state.stage === 'carried' && state.proof.lifted };
}
