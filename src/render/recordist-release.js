import { RECORDIST_RELEASE_RIG } from '../data/recordist-release-rig.js';
import { normalizeRecordistRelease, recordistReleaseView, RECORDIST_RELEASE_SECONDS } from '../game/recordist-release.js';

export const RECORDIST_RELEASE_ASSET = 'assets/alan-recordist.glb';
export const RECORDIST_RELEASE_MESH = 'recordist_release_alan';
export const RECORDIST_RELEASE_CLIPS = Object.freeze({
  bound: 6, interrupt: RECORDIST_RELEASE_SECONDS.interrupt, settling: RECORDIST_RELEASE_SECONDS.settling,
  slumped: 6, lift: RECORDIST_RELEASE_SECONDS.lift, carried: 6, resting: 6,
});
const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, n) => a.map(v => v * n);
const dot = (a, b) => a.reduce((n, v, i) => n + v * b[i], 0), length = a => Math.hypot(...a), unit = a => mul(a, 1 / (length(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0)), mix = (a, b, t) => add(a, mul(sub(b, a), t));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const qaxis = (a, t) => [...mul(unit(a), Math.sin(t / 2)), Math.cos(t / 2)];
const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - dot(a.slice(0, 3), b.slice(0, 3))];
const rotate = (p, q) => { const t = mul(cross(q.slice(0, 3), p), 2); return add(p, add(mul(t, q[3]), cross(q.slice(0, 3), t))); };
function between(a, b) {
  a = unit(a); b = unit(b); const d = dot(a, b);
  if (d < -.999999) return [...unit(cross(a, Math.abs(a[0]) < .8 ? [1, 0, 0] : [0, 1, 0])), 0];
  return unit([...cross(a, b), 1 + d]);
}
function qmix(a, b, t) { if (dot(a, b) < 0) b = mul(b, -1); return unit(mix(a, b, t)); }
const bones = new Map(RECORDIST_RELEASE_RIG.map(b => [b.name, b]));
function solveChain(start, target, a, b, pole) {
  const delta = sub(target, start), d = clamp(length(delta), Math.abs(a - b) + 1e-6, a + b - 1e-6), axis = unit(delta);
  const along = (a * a - b * b + d * d) / (2 * d), end = add(start, mul(axis, d));
  let radial = sub(pole, mul(axis, dot(pole, axis)));
  if (length(radial) < 1e-7) radial = cross(axis, Math.abs(axis[0]) < .8 ? [1, 0, 0] : [0, 1, 0]);
  return { middle: add(add(start, mul(axis, along)), mul(unit(radial), Math.sqrt(Math.max(0, a * a - along * along)))), end,
    error: length(sub(target, end)) };
}

// A kneeling human has support before the borrowed performance releases him.
// No body elongation, collapsing scales, pressure material or HUSH mesh enters
// this sampler. The only broken rhythm is in his small involuntary gestures.
function poseParameters(mode, time) {
  const seconds = RECORDIST_RELEASE_CLIPS[mode] || 6, p = clamp(time / seconds), breath = Math.sin(time * Math.PI / 3) * .002;
  const bound = { pelvis: [0, .425 + breath, .015], lean: .20, roll: .02, head: .20,
    wrists: { L: [-.16, .80, -.19], R: [.22, .89, -.21] }, leg: 'kneel' };
  const slump = { pelvis: [.045, .225 + breath, .12], lean: .86, roll: -.10, head: .32,
    wrists: { L: [-.02, .055, -.36], R: [.39, .065, -.29] }, leg: 'folded' };
  const carried = { pelvis: [0, .85 + breath, 0], lean: .12, roll: -1.43, head: .17,
    wrists: { L: [.35, .64, -.12], R: [.52, .66, .08] }, leg: 'carried' };
  const interpolate = (a, b, fraction) => ({ pelvis: mix(a.pelvis, b.pelvis, fraction),
    lean: a.lean + (b.lean - a.lean) * fraction, roll: a.roll + (b.roll - a.roll) * fraction,
    head: a.head + (b.head - a.head) * fraction,
    wrists: { L: mix(a.wrists.L, b.wrists.L, fraction), R: mix(a.wrists.R, b.wrists.R, fraction) },
    leg: b.leg, legBlend: fraction });
  if (mode === 'interrupt') {
    const wince = Math.sin(Math.PI * ease(p));
    return { ...bound, lean: bound.lean + .085 * wince, roll: bound.roll - .07 * wince, head: .20 + .10 * wince };
  }
  if (mode === 'settling') return interpolate(bound, slump, ease(p));
  if (mode === 'slumped') return slump;
  if (mode === 'lift') return interpolate(slump, carried, ease(p));
  if (mode === 'carried') return carried;
  if (mode === 'resting') return { pelvis: [0, .17 + breath, 0], lean: -Math.PI / 2, roll: .055, head: .08,
    wrists: { L: [-.23, .108, .39], R: [.24, .108, .35] }, leg: 'resting' };
  // A hand repeats part of a learned conducting phrase. Most of the interval
  // is held, with an unsynchronised swallow; it never becomes a dance loop.
  const twitch = Math.exp(-(((time % 3 - .23) / .10) ** 2)) - .42 * Math.exp(-(((time % 3 - .47) / .17) ** 2));
  bound.wrists.R[1] += .012 * twitch; bound.wrists.R[2] -= .008 * twitch;
  bound.head += .008 * Math.exp(-(((time % 6 - 2.1) / .25) ** 2));
  return bound;
}

export function recordistReleaseActorPose(mode = 'bound', time = 0) {
  if (!Object.hasOwn(RECORDIST_RELEASE_CLIPS, mode)) throw new Error('Unknown recordist release pose.');
  const parameters = poseParameters(mode, Math.max(0, Number(time) || 0)), pelvis = bones.get('pelvis').head;
  const bodyQ = qm(qaxis([0, 0, 1], parameters.roll), qaxis([1, 0, 0], -parameters.lean));
  const transforms = new Map(), contacts = [];
  const put = (name, head, rotation) => transforms.set(name, { translation: head, rotation });
  const body = p => add(parameters.pelvis, rotate(sub(p, pelvis), bodyQ));
  const transformed = (p, parent) => {
    const original = bones.get(parent), pose = transforms.get(parent);
    return add(pose.translation, rotate(sub(p, original.head), pose.rotation));
  };
  for (const name of ['pelvis', 'spine_lower', 'spine_mid', 'spine_upper', 'chest', 'neck', 'clavicle_L', 'clavicle_R'])
    put(name, body(bones.get(name).head), bodyQ);
  put('head', transformed(bones.get('head').head, 'neck'), qm(bodyQ, qaxis([1, 0, 0], -parameters.head)));
  put('jaw', transformed(bones.get('jaw').head, 'head'), transforms.get('head').rotation);
  for (const [side, sign] of [['L', -1], ['R', 1]]) {
    const thigh = bones.get(`thigh_${side}`), shin = bones.get(`shin_${side}`), foot = bones.get(`foot_${side}`), toe = bones.get(`toe_${side}`);
    const hip = body(thigh.head), upper = length(sub(thigh.tail, thigh.head)), lower = length(sub(shin.tail, shin.head));
    const kneelAnkle = [sign * .16, .122, .215];
    const foldedAnkle = [sign * .19 + .03, .122, .20], carriedAnkle = [-.47, .24, sign * .11], restingAnkle = [sign * .18, .083, -.83];
    let target = kneelAnkle, pole = [sign * .03, -.2, -1];
    if (mode === 'settling') {
      const fraction = ease(time / RECORDIST_RELEASE_CLIPS.settling);
      target = mix(kneelAnkle, foldedAnkle, fraction); pole = mix(pole, [sign * .08, -.2, -1], fraction);
    } else if (mode === 'slumped') { target = foldedAnkle; pole = [sign * .08, -.2, -1]; }
    else if (mode === 'lift') {
      const fraction = ease(time / RECORDIST_RELEASE_CLIPS.lift);
      target = mix(foldedAnkle, carriedAnkle, fraction);
      // The foot rolls off its support before it turns sideways into the
      // carry. A linear ankle path otherwise sweeps the real toes through the
      // floor even though the ankle itself stays above it.
      target[1] += Math.sin(fraction * Math.PI) * .065;
      pole = mix([sign * .08, -.2, -1], [-1, -.4, sign * .1], fraction);
    }
    else if (mode === 'carried') { target = carriedAnkle; pole = [-1, -.4, sign * .1]; }
    else if (mode === 'resting') { target = restingAnkle; pole = [sign * .1, .4, -.2]; }
    const leg = solveChain(hip, target, upper, lower, pole);
    put(thigh.name, hip, between(sub(thigh.tail, thigh.head), sub(leg.middle, hip)));
    put(shin.name, leg.middle, between(sub(shin.tail, shin.head), sub(leg.end, leg.middle)));
    const footDirection = mode === 'resting' ? [0, -.04, -.14] : mode === 'carried' ? [-.06, -.08, -.10]
      : mode === 'lift' ? mix([0, -.055, .132], [-.06, -.08, -.10], ease(time / RECORDIST_RELEASE_CLIPS.lift)) : [0, -.055, .132];
    const footQ = between(sub(foot.tail, foot.head), footDirection);
    put(foot.name, leg.end, footQ); put(toe.name, transformed(toe.head, foot.name), footQ);
    contacts.push({ kind: 'leg', side, hip, knee: leg.middle, ankle: leg.end, target, error: leg.error,
      upperLength: length(sub(leg.middle, hip)), lowerLength: length(sub(leg.end, leg.middle)) });
    const arm = bones.get(`upperarm_${side}`), fore = bones.get(`forearm_${side}`), hand = bones.get(`hand_${side}`);
    const shoulder = body(arm.head), intendedWrist = parameters.wrists[side], armLength = length(sub(arm.tail, arm.head)), foreLength = length(sub(fore.tail, fore.head));
    // These hands are unsupported, so their resting targets yield to the real
    // arm envelope during the lift rather than stretching an anatomical limb.
    const reach = sub(intendedWrist, shoulder), maximumReach = armLength + foreLength - .012;
    const wrist = length(reach) > maximumReach ? add(shoulder, mul(unit(reach), maximumReach)) : intendedWrist;
    const solve = solveChain(shoulder, wrist, armLength, foreLength,
      mode === 'resting' ? [sign * .5, .16, .2] : [sign * .5, -.6, .2]);
    put(arm.name, shoulder, between(sub(arm.tail, arm.head), sub(solve.middle, shoulder)));
    put(fore.name, solve.middle, between(sub(fore.tail, fore.head), sub(solve.end, solve.middle)));
    const hanging = [sign * .08, -.7, -.5], supported = [sign * .25, .04, -1];
    const handAxis = mode === 'slumped' ? supported : mode === 'settling' ? mix(hanging, supported, ease(time / RECORDIST_RELEASE_CLIPS.settling))
      : mode === 'lift' ? mix(supported, hanging, ease(time / RECORDIST_RELEASE_CLIPS.lift)) : mode === 'resting' ? [sign * .1, .04, 1] : hanging;
    const fingerAxis = sub(bones.get(`middle_tip_${side}`).tail, hand.head);
    const handQ = between(fingerAxis, handAxis); put(hand.name, solve.end, handQ);
    contacts.push({ kind: 'arm', side, shoulder, elbow: solve.middle, wrist: solve.end, target: wrist, intendedTarget: intendedWrist, error: solve.error,
      upperLength: length(sub(solve.middle, shoulder)), lowerLength: length(sub(solve.end, solve.middle)) });
  }
  for (const bone of RECORDIST_RELEASE_RIG) {
    if (transforms.has(bone.name)) continue;
    const parent = transforms.get(bone.parent) || transforms.get('head');
    const head = transformed(bone.head, transforms.has(bone.parent) ? bone.parent : 'head');
    const side = bone.name.endsWith('_L') ? 'L' : 'R', hand = bones.get(`hand_${side}`);
    const normal = unit(cross(sub(bones.get(`middle_${side}`).head, hand.head), sub(bones.get(`little_${side}`).head, bones.get(`index_${side}`).head)));
    const supported = mode === 'slumped' || mode === 'resting' ? 1 : mode === 'settling' ? ease(time / RECORDIST_RELEASE_CLIPS.settling)
      : mode === 'lift' ? 1 - ease(time / RECORDIST_RELEASE_CLIPS.lift) : 0;
    const curl = (bone.name.startsWith('thumb') ? .04 : bone.name.includes('_mid_') ? .15 : .08) * (1 - supported * .88);
    const local = qaxis(normal, curl * (side === 'L' ? 1 : -1));
    put(bone.name, head, qm(parent.rotation, local));
  }
  return { mode, time, joints: Object.fromEntries(transforms), contacts, parameters };
}

function matrix(origin, extraYaw = 0) {
  const a = (origin.yaw || 0) + extraYaw, c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, origin.x, origin.y, origin.z, 1];
}
function actor(mode, time, origin, id = 'released-recordist-alan') {
  return { id, mesh: RECORDIST_RELEASE_MESH, matrix: matrix(origin),
    character: { clip: `alan_${mode}`, time: Math.max(0, time), loop: ['bound', 'slumped', 'carried', 'resting'].includes(mode) },
    // Normal production depth, lighting, shadow and dither. No pressure ghost
    // pass, always-on emission, billboard or independent composition surface.
    solid: false, figure: true };
}

export function recordistReleaseProps(value, { carryPose = null, includeTools = false, player = null } = {}) {
  const state = normalizeRecordistRelease(value); if (!state) return [];
  const view = recordistReleaseView(state), mode = state.stage === 'address' ? 'bound' : state.stage === 'interrupt' ? 'interrupt'
    : state.stage === 'settling' ? 'settling' : state.stage === 'lift' ? state.holdSeconds > 0 ? 'lift' : 'slumped' : 'carried';
  const time = mode === 'bound' || mode === 'slumped' || mode === 'carried' ? state.timeSeconds
    : mode === 'settling' ? state.phaseSeconds : state.holdSeconds;
  let origin = state.origin;
  if (carryPose && ['lift', 'carried'].includes(mode)) {
    const fraction = mode === 'carried' ? 1 : ease(state.holdSeconds / RECORDIST_RELEASE_SECONDS.lift);
    origin = { x: origin.x + (carryPose.x - origin.x) * fraction, y: origin.y + (carryPose.y - origin.y) * fraction,
      z: origin.z + (carryPose.z - origin.z) * fraction,
      yaw: origin.yaw + Math.atan2(Math.sin(carryPose.yaw - origin.yaw), Math.cos(carryPose.yaw - origin.yaw)) * fraction };
  }
  const props = [actor(mode, time, origin)];
  const pose = recordistReleaseActorPose(mode, time);
  const hands = mix(pose.joints.hand_L.translation, pose.joints.hand_R.translation, .5);
  const seatedLocal = [hands[0], Math.max(.135, hands[1] + .035), hands[2] - .02];
  const c = Math.cos(origin.yaw), s = Math.sin(origin.yaw);
  const seated = { x: origin.x + seatedLocal[0] * c + seatedLocal[2] * s,
    y: origin.y + seatedLocal[1], z: origin.z - seatedLocal[0] * s + seatedLocal[2] * c, yaw: origin.yaw + Math.PI };
  if (state.proof.addressed && !state.proof.lifted) props.push({
    id: 'recordist-release-seated-rig', mesh: 'recordist_release_rig_seated', matrix: matrix(seated), character: {}, solid: false,
  });
  if (includeTools && player?.eye?.length === 3 && state.holdSeconds > 0 && ['address', 'interrupt'].includes(state.stage)) {
    const yaw = Number(player.yaw) || 0, c = Math.cos(yaw), s = Math.sin(yaw), progress = view.progress;
    const tool = state.stage === 'address' ? 'rig' : 'fork';
    const side = tool === 'rig' ? .02 : .12, forward = .43 + Math.sin(progress * Math.PI) * .025;
    const held = { x: player.eye[0] + s * forward + c * side,
      y: player.eye[1] - .35 + (tool === 'fork' ? .05 : 0),
      z: player.eye[2] - c * forward + s * side, yaw: yaw + (tool === 'rig' ? -.12 : .06) };
    const approach = ease(progress / .42), touch = tool === 'rig' ? seated
      : { x: seated.x + Math.cos(seated.yaw) * .12, y: seated.y - .08, z: seated.z - Math.sin(seated.yaw) * .12 };
    // These are the actual aimed-at hands, not a view-space pantomime. The
    // host checks reach/facing before time advances; the instrument and its
    // retained anatomical grip move together into that physical operation.
    const shoulder = add(player.eye, [0, -.35, 0]);
    const desired = [touch.x, touch.y, touch.z], delta = sub(desired, shoulder), reach = length(delta);
    const endpoint = reach > 1.05 ? add(shoulder, mul(delta, 1.05 / reach)) : desired;
    const at = { x: held.x + (endpoint[0] - held.x) * approach,
      y: held.y + (endpoint[1] - held.y) * approach,
      z: held.z + (endpoint[2] - held.z) * approach, yaw: held.yaw };
    props.push({ id: `recordist-release-${tool}-in-hand`, mesh: `recordist_release_${tool}_hand`, matrix: matrix(at), character: {}, solid: false });
  }
  return props;
}

export function recordistReleaseCarriedProps({ origin, time = 0 } = {}) {
  return origin && ['x', 'y', 'z', 'yaw'].every(k => Number.isFinite(origin[k])) ? [actor('carried', time, origin)] : [];
}
export function recordistReleaseRestingProps({ origin, time = 0 } = {}) {
  return origin && ['x', 'y', 'z', 'yaw'].every(k => Number.isFinite(origin[k])) ? [actor('resting', time, origin, 'returned-recordist-alan')] : [];
}
