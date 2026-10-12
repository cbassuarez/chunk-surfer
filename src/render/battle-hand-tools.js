// Physical field tools for the exposed recordist. Units are metres; +Z is the
// face toward the player. The hand solver owns the hand and the caller moves
// tool + contact targets together. This module never advances a game clock.
import * as THREE from 'three';
import { BOX_CRADLE, FRONT_CONTROL } from './battle-hand-box-grips.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { normalizeFieldKit, FLASHLIGHT_HOUSING_COLORS } from '../game/field-kit.js';
import { drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass } from './instrument-material.js';
import { drawRecorderReadoutCanvas, recorderDisplayPalette } from './recorder-instrument.js';
import { drawWitnessChassis } from './witness-material.js';

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, finite(n, lo)));
const target = (position, normal = [0, 0, 1]) => ({ position, normal });
const COLORS = Object.freeze({ steel: '#92988e', edge: '#c5c8bb', rubber: '#242a25', dark: '#171e1a', brass: '#9e8653' });
const BUTTONS = Object.freeze({ classic: ['#bc6b57', '#bcbda9', '#c9a151'], signal: ['#bc6b57', '#729aa9', '#d0bc64'], 'sea-glass': ['#d09179', '#a7bda0', '#bcbda9'] });
const FACE = Object.freeze({ aluminum: '#b0b3a5', black: '#232c27', olive: '#5e6645', witness: '#454b36' });
const CONTROL_WRIST_OFFSET = new THREE.Vector3(...FRONT_CONTROL.offset);
const CONTROL_WRIST_QUATERNION = new THREE.Quaternion(...FRONT_CONTROL.quaternion);
const CONTROL_POSE = FRONT_CONTROL.pose;

function calibrateControls(controls) {
  for (const control of Object.values(controls)) {
    if (control.hand === 'right') continue;
    const normal = new THREE.Vector3(...control.normal).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    // Rotate the wrist around a fixed pad contact, preserving its facing.
    // Each box control leaves clearance from the supporting hand.
    if (control.approachAngle) orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(normal, control.approachAngle));
    const offset = CONTROL_WRIST_OFFSET.clone().applyQuaternion(orientation);
    control.hand = 'left'; control.digit = 'index';
    control.wrist = { position: offset.add(new THREE.Vector3(...control.position)).toArray(), quaternion: orientation.multiply(CONTROL_WRIST_QUATERNION).toArray() };
    control.pose = CONTROL_POSE;
  }
}

function canvas(width, height) {
  const result = typeof document !== 'undefined' ? document.createElement('canvas')
    : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : null;
  if (!result) return null;
  result.width = width; result.height = height;
  return result.getContext('2d') ? result : null;
}
function texture(source) {
  if (!source) return null;
  const map = new THREE.CanvasTexture(source);
  map.colorSpace = THREE.SRGBColorSpace;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 4;
  return map;
}
function physical(color, roughness = .42, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
function ownedResources(group) {
  const geometries = new Set(), materials = new Set(), maps = new Set();
  group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) maps.add(value);
    }
  });
  return { geometries, materials, maps };
}
function add(group, geometry, material, position = [0, 0, 0], rotation = null, name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.fromArray(position);
  if (rotation) mesh.rotation.fromArray(rotation);
  mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
  group.add(mesh); return mesh;
}
function box(group, size, material, position = [0, 0, 0], radius = .002, name = '') {
  return add(group, new RoundedBoxGeometry(...size, 3, Math.min(radius, ...size.map(v => v / 2))), material, position, null, name);
}
function cylinder(group, radius, length, material, position = [0, 0, 0], rotation = null, radiusTop = radius, name = '') {
  return add(group, new THREE.CylinderGeometry(radiusTop, radius, length, 32, 1), material, position, rotation, name);
}
function torus(group, radius, thickness, material, position, rotation = [0, 0, 0]) {
  return add(group, new THREE.TorusGeometry(radius, thickness, 8, 40), material, position, rotation);
}
function cable(group, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return add(group, new THREE.TubeGeometry(curve, 36, radius, 8, false), material);
}
function label(group, value, width, height, position, { color = '#d2d4bd', background = null, size = 32 } = {}) {
  const source = canvas(512, Math.max(48, Math.round(512 * height / width)));
  if (!source) return null;
  const ctx = source.getContext('2d');
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, source.width, source.height); }
  ctx.fillStyle = color; ctx.font = `500 ${size}px Arial,Helvetica,sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(value, source.width / 2, source.height / 2, source.width - 12);
  return add(group, new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture(source), transparent: true, depthWrite: false, toneMapped: false }), position);
}
function screw(group, x, y, z, material, radius = .0023) {
  cylinder(group, radius, .0018, material, [x, y, z], [Math.PI / 2, 0, 0]);
  box(group, [radius * 1.4, .00045, .0005], physical('#242a23', .65), [x, y, z + .001], .0001);
}
function recorderCradle(offset = [0, 0, 0]) {
  const contacts = structuredClone(BOX_CRADLE);
  for (const name of ['wrist', 'index', 'middle', 'ring', 'pinky']) {
    contacts[name].position = contacts[name].position.map((v, i) => v + offset[i]);
  }
  return contacts;
}
// Collision-calibrated against every skinned finger vertex, not only the pads.
const HANDLE_GRIPS = {
  torch: {
    wrist: {"position":[0.04,-0.025,-0.075],"quaternion":[-0.5,0.5,0.5,-0.5]},
    index: target([-0.01548656,0,0.02211711], [-0.57357644,0,0.81915204]),
    middle: target([-0.02211711,-0.025,0.01548656], [-0.81915204,0,0.57357644]),
    ring: target([-0.00698811,-0.052,0.02608], [-0.25881905,0,0.96592583]),
    pinky: target([0.01225593,-0.073,0.02628293], [0.42261826,0,0.90630779]),
    thumb: target([0.02338269,0.01,0.0135], [0.8660254,0,0.5]),
    pose: {"spread":{"index":0.25041104,"middle":0.04780773,"ring":0.02462821,"pinky":0.25803963},"index":[1.12392358,0.74994482,0.63721394],"middle":[1.168287,1.01750919,0.35612822],"ring":[0.75314876,1.18306903,0.47831342],"pinky":[0.56799044,0.87605286,0.3066185],"thumb":{"opposition":0.93406644,"abduction":0.56096332,"mcp":0.82951069,"ip":0}},
  },
  fork: {
    wrist: {"position":[0.025,-0.059,-0.085],"quaternion":[-0.5,0.5,0.5,-0.5]},
    index: target([-0.01062518,-0.034,0.00284701], [-0.96592583,0,0.25881905]),
    middle: target([-0.01448889,-0.059,0.00388229], [-0.96592583,0,0.25881905]),
    ring: target([-0.00860365,-0.086,0.01228728], [-0.57357644,0,0.81915204]),
    pinky: target([0.00113302,-0.107,0.01295053], [0.08715574,0,0.9961947]),
    thumb: target([0.01125833,-0.024,0.0065], [0.8660254,0,0.5]),
    pose: {"spread":{"index":-0.17595379,"middle":0.23799309,"ring":-0.24859774,"pinky":0.1919203},"index":[1.03348226,1.62253506,0.72597148],"middle":[1.03347311,1.7476168,0.66248478],"ring":[0.59307913,1.63535048,0.66629337],"pinky":[0.50741253,1.05089131,0.47950613],"thumb":{"opposition":0.90837784,"abduction":0.51766169,"mcp":0.77335954,"ip":0.01293983}},
  },
  coffee: {
    wrist: {"position":[0.045,-0.018,-0.09],"quaternion":[-0.5,0.5,0.5,-0.5]},
    index: target([0.00331924,0.007,0.03793908], [0.08715574,0,0.9961947]),
    middle: target([-0.0098051,-0.018,0.03659313], [-0.25881905,0,0.96592583]),
    ring: target([0.00309473,-0.045,0.03537288], [0.08715574,0,0.9961947]),
    pinky: target([0.022387,-0.066,0.022387], [0.70710678,0,0.70710678]),
    thumb: target([0.04034166,0.017,0.00711332], [0.98480775,0,0.17364818]),
    pose: {"spread":{"index":0.05878894,"middle":0.11197479,"ring":0.16035024,"pinky":0.22523928},"index":[0.51654943,0.90764565,0.38297916],"middle":[0.63918035,0.92291895,0.32302163],"ring":[0.45992836,0.93771971,0.3282019],"pinky":[0.43436849,0.65583795,0.32965929],"thumb":{"opposition":0.85858897,"abduction":0.33594844,"mcp":0.72760069,"ip":0}},
  },
  spanner: {
    wrist: {"position":[0.03,-0.059,-0.085],"quaternion":[-0.5,0.5,0.5,-0.5]},
    index: target([-0.01393185,-0.034,0.00373303], [-1,0,0]),
    middle: target([-0.0158637,-0.059,0.00425067], [-1,0,0]),
    ring: target([-0.0134838,-0.086,0.00944146], [0,0,1]),
    pinky: target([0.00533356,-0.107,0.01143785], [0,0,1]),
    thumb: target([0.01558846,-0.024,0.009], [0,0,1]),
    pose: {"spread":{"index":-0.15401854,"middle":0.1903629,"ring":-0.27,"pinky":0.194871},"index":[1.08379042,1.2888432,0.74283879],"middle":[1.03765979,1.56174449,0.54661057],"ring":[0.77830388,1.36245687,0.52117155],"pinky":[0.53174835,1.08663579,0.42044012],"thumb":{"opposition":0.89461205,"abduction":0.63385774,"mcp":0.57614912,"ip":0.12908305}},
  },
};
function handleGrip(id) {
  // A modest wrist deviation brings the forearm down into the player's body;
  // its neutral rig axis would point straight into the camera's depth axis.
  return { ...structuredClone(HANDLE_GRIPS[id]), forearmRotation: [0, 0, .6] };
}

function recorder(group, cosmetics) {
  const w = .274, h = w * 405 / 736, d = .044, u = w / 736;
  const steel = physical(COLORS.edge, .34, .72), enamel = physical('#323a32', .62, .28);
  box(group, [w, h, d], enamel, [0, 0, 0], .0055, 'DA-1000 chassis');
  box(group, [w - .002, h - .002, .0028], steel, [0, 0, d / 2], .003, 'faceplate rolled edge');
  // The native material functions are the approved instrument renderer. They
  // paint a dedicated texture without changing the global UI canvas or kit.
  const faceCanvas = canvas(1472, 810);
  const designSlots = [0, 1, 2].map(i => ({ x: 415 + i * 99, y: 334, w: 89, h: 33 }));
  const explicitView = { finish: cosmetics.faceplate, buttonSet: cosmetics.buttons, phosphor: cosmetics.vfd };
  const colors = recorderDisplayPalette(explicitView);
  if (faceCanvas) {
    const ctx = faceCanvas.getContext('2d'); ctx.scale(2, 2);
    if (cosmetics.faceplate === 'witness') drawWitnessChassis(ctx, { w: 736, h: 405, buttonSlots: designSlots, keys: [], endings: cosmetics.witnessEndings || [], phosphor: colors.label, illumination: 0 });
    else drawInstrumentPlate(ctx, { x: 12, y: 15, w: 712, h: 370, seed: 'approved-recorder', finish: cosmetics.faceplate, screwRadius: 7, screwInset: 13, fasteners: false });
    drawInstrumentWell(ctx, { x: 35, y: 76, w: 666, h: 239 });
    if (cosmetics.faceplate !== 'witness') {
      const dark = cosmetics.faceplate !== 'aluminum'; ctx.fillStyle = dark ? '#d7d9bd' : '#333830';
      ctx.textBaseline = 'alphabetic'; ctx.font = '14px Arial,Helvetica,sans-serif'; ctx.textAlign = 'left'; ctx.fillText('AUDIOCORP', 35, 48);
      ctx.font = '11px Arial,Helvetica,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DA–1000', 368, 48);
      ctx.textAlign = 'right'; ctx.fillText('FIELD RECORDER', 700, 48);
      ctx.font = '10px Arial,Helvetica,sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('RECORD / MONITOR', 35, 350); ctx.fillText('VACUUM FLUORESCENT', 35, 366);
    }
  }
  const faceMaterial = new THREE.MeshStandardMaterial({ color: faceCanvas ? '#ffffff' : FACE[cosmetics.faceplate], map: texture(faceCanvas), roughness: .4, metalness: .34, transparent: true });
  add(group, new THREE.PlaneGeometry(w, h), faceMaterial, [0, 0, .0238], null, 'approved DA-1000 face');
  for (const x of [-w / 2 + .0094, w / 2 - .0094]) for (const y of [-h / 2 + .0104, h / 2 - .0104]) screw(group, x, y, .025, steel);
  const readoutCanvas = canvas(666, 239), readoutMap = texture(readoutCanvas);
  const readout = add(group, new THREE.PlaneGeometry(666 * u, 239 * u), new THREE.MeshBasicMaterial({ color: readoutMap ? '#ffffff' : '#07120d', map: readoutMap, toneMapped: false }), [0, h / 2 - 195.5 * u, .0244], null, 'live recorder electrodes');
  const glassCanvas = canvas(1332, 478);
  if (glassCanvas) drawInstrumentGlass(glassCanvas.getContext('2d'), { x: 0, y: 0, w: 1332, h: 478, dpr: 2, reflection: .38, depth: .8, reducedMotion: true });
  add(group, new THREE.PlaneGeometry(666 * u, 239 * u), new THREE.MeshBasicMaterial({ map: texture(glassCanvas), color: '#ffffff', transparent: true, opacity: .42, depthWrite: false, toneMapped: false }), [0, readout.position.y, .0250], null, 'under-glass recorder reflection');
  const caps = [], controls = {};
  for (const [i, id] of ['rec', 'stop', 'takes'].entries()) {
    const slot = designSlots[i], x = (slot.x + slot.w / 2 - 368) * u, y = (202.5 - slot.y - slot.h / 2) * u;
    box(group, [91 * u, 35 * u, .002], physical('#242d26', .52), [x, y, .0244], .0012);
    const cap = box(group, [83 * u, 27 * u, .0038], physical(BUTTONS[cosmetics.buttons][i], .36), [x, y, .027], .0013, `${id} keycap`);
    const legend = label(group, id.toUpperCase(), 63 * u, 17 * u, [x, y, .02905], { color: '#293025', size: 52 });
    const lamp = add(group, new THREE.SphereGeometry(2.5 * u, 12, 8), new THREE.MeshStandardMaterial({ color: '#4a3422', roughness: .25, emissive: '#c47a2f', emissiveIntensity: 0 }), [x + 32.5 * u, y, .0291], null, `${id} pilot lamp`);
    lamp.scale.z = .32;
    caps.push({ id, cap, legend, lamp, z: cap.position.z, legendZ: legend?.position.z });
    controls[id] = target([x, y, .0293]);
  }
  // Side sockets and a physical strain-relieved monitoring lead establish depth.
  cylinder(group, .0046, .0035, steel, [-w / 2 - .0008, .034, 0], [0, 0, Math.PI / 2]);
  cylinder(group, .0032, .012, physical(COLORS.rubber, .6), [-w / 2 - .007, .034, 0], [0, 0, Math.PI / 2]);
  cable(group, [[-w / 2 - .013, .034, 0], [-.18, .024, -.010], [-.18, -.08, -.018], [-.125, -.12, -.012]], .00145, physical('#1c231e', .75));
  for (let i = 0; i < 13; i++) box(group, [.016, .0011, .001], physical('#141c16', .8), [-.075 + i * .012, -.025, -.0224], .0002);
  let previousReading = '';
  // Leave the right half of the front keys free for the operating left index.
  // This offset also clears both posed hand surfaces throughout key travel.
  return { bounds: { width: w, height: h, depth: d }, contacts: { right: recorderCradle() }, controls,
    update(frame) {
      const view = { ...(frame.readout || {}), ...explicitView };
      const signature = JSON.stringify(view);
      if (readoutCanvas && signature !== previousReading) {
        drawRecorderReadoutCanvas(readoutCanvas.getContext('2d'), view);
        readoutMap.needsUpdate = true; previousReading = signature;
      }
      const action = frame.action || '', active = frame.active !== false && frame.side !== 'enemy' && frame.progress > 0 && frame.progress < 1;
      const selected = action === 'monitor' || action === 'master-take' ? 0 : action === 'playback' ? 2 : -1;
      const contact = frame.impactFired !== false && frame.progress >= .28;
      const pressure = frame.controlPressure != null && Number.isFinite(Number(frame.controlPressure))
        ? clamp(frame.controlPressure) : contact ? Math.sin(Math.PI * clamp((frame.progress - .28) / .36)) : 0;
      const press = active ? pressure * .0015 : 0;
      caps.forEach(({ id, cap, legend, lamp, z, legendZ }, i) => {
        const travel = i === selected ? Math.max(0, press) : 0;
        cap.position.z = z - travel; if (legend) legend.position.z = legendZ - travel;
        lamp.position.z = .0291 - travel;
        controls[id].position[2] = .0293 - travel;
        const lit = i === 0 ? !!view.recording : i === 2 ? !!view.playing : false;
        lamp.material.color.set(lit ? '#c58b44' : '#4a3422');
        lamp.material.emissiveIntensity = lit ? .6 : 0;
      });
    },
  };
}

function torch(group, cosmetics) {
  const shell = physical(FLASHLIGHT_HOUSING_COLORS[cosmetics.flashlightHousing], .5, .24);
  const rubber = physical(COLORS.rubber, .8), steel = physical(COLORS.steel, .3, .8);
  cylinder(group, .023, .158, shell, [0, -.015, 0], null, .023, 'torch handle');
  cylinder(group, .035, .052, shell, [0, .088, 0], null, .041);
  cylinder(group, .041, .006, steel, [0, .117, 0]);
  cylinder(group, .036, .004, physical('#151f1a', .11, .5), [0, .121, 0]);
  cylinder(group, .028, .002, new THREE.MeshStandardMaterial({ color: '#b9c8ba', roughness: .12, metalness: .65, emissive: '#bddac0', emissiveIntensity: 0 }), [0, .123, 0], null, .028, 'torch lens');
  for (let y = -.078; y < .040; y += .008) torus(group, .0233, .0008, rubber, [0, y, 0], [Math.PI / 2, 0, 0]);
  const switchNormal = [Math.sqrt(3) / 2, 0, .5];
  const cap = box(group, [.012, .024, .0035], rubber, [switchNormal[0] * .0245, .010, switchNormal[2] * .0245], .003, 'torch switch');
  cap.rotation.y = Math.PI / 3;
  cylinder(group, .0236, .007, steel, [0, -.097, 0]);
  label(group, 'FIELD TORCH', .032, .007, [0, -.062, .024]);
  const lens = group.getObjectByName('torch lens');
  const controls = { trigger: { ...target([switchNormal[0] * .027, .010, switchNormal[2] * .027], switchNormal), hand: 'right', digit: 'thumb' } };
  controls.trigger.pressedPosition = [switchNormal[0] * .0258, .010, switchNormal[2] * .0258];
  controls.trigger.pressedPose = { thumb: { opposition: .9416246785, abduction: .5900631989, mcp: .8236408307, ip: 0 } };
  return { bounds: { width: .084, height: .228, depth: .084 }, contacts: { right: handleGrip('torch') }, controls,
    update(frame) {
      const lit = frame.action === 'expose' || frame.action === 'whiteout';
      const p = clamp(frame.progress), playerAction = lit && frame.active !== false && frame.side !== 'enemy';
      const pressure = frame.controlPressure != null && Number.isFinite(Number(frame.controlPressure))
        ? clamp(frame.controlPressure) : frame.impactFired !== false && p >= .28 && p < .72 ? 1 : 0;
      lens.material.emissiveIntensity = playerAction && frame.impactFired === true ? .08 + (frame.action === 'whiteout' ? 1.25 : .38) * Math.sin(Math.PI * p) : 0;
      const travel = playerAction ? .0012 * pressure : 0;
      cap.position.x = switchNormal[0] * (.0245 - travel); cap.position.z = switchNormal[2] * (.0245 - travel);
      controls.trigger.position[0] = switchNormal[0] * (.027 - travel); controls.trigger.position[2] = switchNormal[2] * (.027 - travel);
    },
  };
}

function fork(group) {
  const steel = physical('#bfc5bb', .25, .88), satin = physical('#777f74', .4, .8);
  cylinder(group, .009, .105, satin, [0, -.062, 0], null, .009, 'fork stem');
  cylinder(group, .0125, .009, steel, [0, -.117, 0], null, .0125, 'fork foot');
  const shoulders = new THREE.Shape(); shoulders.moveTo(-.031, -.012); shoulders.lineTo(-.031, .017);
  shoulders.quadraticCurveTo(-.023, -.007, 0, -.009); shoulders.quadraticCurveTo(.023, -.007, .031, .017);
  shoulders.lineTo(.031, -.012); shoulders.quadraticCurveTo(.027, -.037, 0, -.039); shoulders.quadraticCurveTo(-.027, -.037, -.031, -.012);
  add(group, new THREE.ExtrudeGeometry(shoulders, { depth: .012, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .002, bevelThickness: .002 }), steel, [0, .018, -.006]);
  const prongs = [-1, 1].map(side => box(group, [.012, .127, .016], steel, [side * .031, .087, 0], .004, 'fork prong'));
  label(group, 'A 440', .024, .009, [0, -.043, .0096], { color: '#242c25', size: 72 });
  return { bounds: { width: .078, height: .273, depth: .020 }, contacts: { right: handleGrip('fork') }, controls: { strike: target([-.037, .113, 0], [-1, 0, 0]) },
    update(frame) {
      // Ring only after the authored strike. No vibration in selection/idle.
      const p = clamp(frame.progress), active = frame.action === 'tune' && frame.active !== false && p > .28 && p < .96 && !frame.reducedMotion;
      const oscillation = active ? Math.sin((p - .28) * 260) * Math.exp(-(p - .28) * 5) * .00065 : 0;
      prongs[0].position.x = -.031 - oscillation; prongs[1].position.x = .031 + oscillation;
    },
  };
}

function radio(group) {
  const w = .102, h = .150, d = .040, body = physical('#414a39', .62, .18), steel = physical(COLORS.steel, .32, .75), dark = physical('#17211a', .74);
  box(group, [w, h, d], body, [0, 0, 0], .008, 'portable short-wave radio');
  box(group, [w - .008, h - .011, .003], dark, [0, 0, .020], .004);
  cylinder(group, .0041, .114, steel, [-.032, .126, -.009]);
  cylinder(group, .005, .010, dark, [-.032, .073, -.009]);
  for (let i = 0; i < 13; i++) box(group, [.072, .00145, .001], physical('#77816d', .7), [0, .045 - i * .004, .022], .0004);
  box(group, [.076, .017, .002], physical('#101b14', .22), [0, -.035, .022], .0015);
  label(group, 'FM  88  96  104  MHz', .071, .009, [0, -.035, .0232], { size: 37, color: '#bdc89f' });
  const knob = cylinder(group, .008, .009, steel, [.032, -.058, .026], [Math.PI / 2, 0, 0]);
  knob.name = 'radio tuning dial';
  const tick = box(group, [.001, .005, .0005], dark, [.032, -.0555, .031], .0001);
  box(group, [.0018, .033, .023], physical('#111b14', .72), [-.0515, .030, .004], .0008, 'radio PTT recess');
  const transmitCap = box(group, [.0038, .028, .018], physical('#252f23', .82), [-.053, .030, .004], .0018, 'radio PTT keycap');
  label(group, 'FIELD RADIO', .052, .007, [-.008, -.058, .0231]);
  for (const x of [-.039, .039]) for (const y of [-.063, .063]) screw(group, x, y, .023, steel, .0014);
  const controls = { tune: { ...target([.032, -.058, .032]), approachAngle: .4 }, transmit: { ...target([-.0552, .030, .004], [-1, 0, 0]), approachAngle: -.45 } };
  const grip = recorderCradle([-.03, .0004, 0]);
  return { bounds: { width: w, height: .260, depth: .047 }, contacts: { right: grip }, controls,
    update(frame) {
      const active = frame.active !== false && frame.side !== 'enemy';
      const pressure = frame.controlPressure != null && Number.isFinite(Number(frame.controlPressure))
        ? clamp(frame.controlPressure) : Math.sin(Math.PI * clamp(frame.progress));
      const angle = active && (frame.action === 'tune' || frame.action === 'channel') ? -.3 * pressure : 0;
      knob.rotation.y = angle;
      tick.position.set(.032 + Math.sin(angle) * .0025, -.058 + Math.cos(angle) * .0025, .031);
      const travel = active && frame.action === 'radio-decoy' ? .0014 * pressure : 0;
      transmitCap.position.x = -.053 + travel;
      controls.transmit.position[0] = -.0552 + travel;
    },
  };
}

function rig(group) {
  const w = .174, h = .103, d = .040, steel = physical('#878d7b', .4, .62), enamel = physical('#3e4733', .65, .22), black = physical('#1d261d', .72);
  box(group, [w, h, d], enamel, [0, 0, 0], .006, 'bent interface chassis');
  box(group, [w - .006, h - .006, .003], steel, [0, 0, .021], .002);
  box(group, [.064, .029, .002], physical('#15241a', .22), [-.041, .018, .023], .0015);
  label(group, 'INVERT / RETURN', .062, .008, [-.041, .018, .0242], { color: '#a6b88b', size: 42 });
  const knobs = [];
  for (const [i, x] of [-.060, -.020, .022, .061].entries()) {
    const knob = cylinder(group, .0072, .009, black, [x, -.023, .027], [Math.PI / 2, 0, 0]);
    const tick = box(group, [.0008, .005, .0005], physical('#d0cfae', .6), [x, -.021, .032], .0001);
    knobs.push({ knob, tick, x });
    if (i < 3) label(group, ['IN', 'PHASE', 'RETURN'][i], .028, .005, [x, -.040, .0232], { color: '#303a2d', size: 50 });
  }
  for (const x of [.030, .058]) {
    torus(group, .0043, .001, black, [x, .025, .024]);
    cylinder(group, .0024, .009, steel, [x, .025, .029], [Math.PI / 2, 0, 0]);
  }
  cable(group, [[.030, .025, .034], [.010, .062, .045], [.070, .066, .042], [.058, .025, .034]], .0018, physical('#7d5941', .62));
  cable(group, [[-.087, -.025, 0], [-.112, -.040, .008], [-.107, -.104, .012], [-.064, -.110, .005]], .0015, black);
  for (const x of [-.076, .076]) for (const y of [-.039, .039]) screw(group, x, y, .024, steel, .0016);
  const controls = { tune: { ...target([-.020, -.023, .032]), approachAngle: -.65 }, invert: { ...target([.022, -.023, .032]), approachAngle: -.8 } };
  return { bounds: { width: w, height: .120, depth: .070 }, contacts: { right: recorderCradle([0, .0239, 0]) }, controls,
    update(frame) {
      const active = frame.active !== false && frame.side !== 'enemy' && (frame.action === 'invert' || frame.action === 'runaway-feedback');
      const amount = active ? frame.controlPressure != null && Number.isFinite(Number(frame.controlPressure))
        ? clamp(frame.controlPressure) : Math.sin(Math.PI * clamp(frame.progress)) : 0;
      knobs[2].knob.rotation.y = amount * .55;
      knobs[2].tick.position.x = knobs[2].x + Math.sin(amount * .55) * .0025;
      knobs[2].tick.position.y = -.023 + Math.cos(amount * .55) * .0025;
    },
  };
}

function coffee(group) {
  const paper = physical('#c5b791', .94), rim = physical('#d9d1b3', .8), dark = physical('#443525', .45);
  cylinder(group, .027, .125, paper, [0, -.011, 0], null, .038, 'coffee cup');
  cylinder(group, .0375, .006, dark, [0, .054, 0]);
  torus(group, .038, .0022, rim, [0, .055, 0], [Math.PI / 2, 0, 0]);
  cylinder(group, .036, .002, physical('#291d12', .22), [0, .0545, 0]);
  for (let i = 0; i < 4; i++) torus(group, .0317 + i * .001, .0005, dark, [0, -.015 + i * .009, 0], [Math.PI / 2, 0, 0]);
  label(group, 'NIGHT SHIFT', .043, .013, [0, .014, .036], { color: '#5b4931', size: 54 });
  return { bounds: { width: .081, height: .133, depth: .081 }, contacts: { right: handleGrip('coffee') }, controls: { drink: target([0, .057, .035], [0, 1, 0]) }, update() {} };
}

function spanner(group) {
  const steel = physical('#9ca391', .32, .87), dark = physical('#515c4c', .46, .72);
  box(group, [.024, .198, .012], steel, [0, -.043, 0], .006, 'adjustable spanner shank');
  box(group, [.012, .112, .0015], dark, [0, -.060, .0068], .004);
  const jaw = new THREE.Shape();
  jaw.moveTo(-.025, .036); jaw.lineTo(-.041, .070); jaw.lineTo(-.041, .111); jaw.lineTo(-.024, .113);
  jaw.lineTo(-.024, .082); jaw.lineTo(.010, .082); jaw.lineTo(.010, .114); jaw.lineTo(.026, .112);
  jaw.lineTo(.030, .059); jaw.lineTo(.016, .036); jaw.closePath();
  add(group, new THREE.ExtrudeGeometry(jaw, { depth: .013, bevelEnabled: true, bevelSize: .002, bevelThickness: .002, bevelSegments: 3, steps: 1 }), steel, [0, .020, -.0065], null, 'open adjustable jaw');
  cylinder(group, .008, .031, dark, [-.004, .077, .010], [0, 0, Math.PI / 2]);
  for (let x = -.018; x <= .010; x += .004) torus(group, .008, .00065, steel, [x, .077, .010], [0, Math.PI / 2, 0]);
  torus(group, .0048, .0022, dark, [0, -.132, .007]);
  label(group, 'VAN / 10″', .016, .036, [0, -.042, .0081], { color: '#e1e0c8', size: 65 });
  return { bounds: { width: .078, height: .279, depth: .029 }, contacts: { right: handleGrip('spanner') }, controls: {}, update() {} };
}

/**
 * Return a physical tool and immutable object-space contact locations. Contact
 * normals point out from the supported surface. The right wrist is a preferred
 * pose, not a second animated root. `update` takes game state, never invents it.
 */
export function buildBattleHandTool(tool = 'self', cosmetics = {}) {
  const id = typeof tool === 'string' ? tool : tool?.id || 'self';
  const appearance = { ...normalizeFieldKit({ cosmetics: cosmetics.cosmetics || cosmetics }).cosmetics, witnessEndings: cosmetics.witnessEndings || [] };
  const group = new THREE.Group(); group.name = `battle tool: ${id}`;
  const builders = { recorder, torch, fork, radio, rig, coffee, spanner };
  const detail = builders[id]?.(group, appearance) || { bounds: { width: 0, height: 0, depth: 0 }, contacts: { right: null }, controls: {}, update() {} };
  calibrateControls(detail.controls);
  // A second alias prevents old callers confusing the little finger with a
  // sixth digit; both names refer to the exact same supported pad target.
  if (detail.contacts.right?.pinky) detail.contacts.right.little = detail.contacts.right.pinky;
  // The renderer borrows this group as the hand's rigid parent. Capture only
  // our resources before external hands, sleeves or other children attach.
  const resources = ownedResources(group);
  let disposed = false;
  return { id, group, contacts: detail.contacts, controls: detail.controls, bounds: detail.bounds,
    update(actionOrFrame = {}, progress = 0, extras = {}) {
      if (disposed) return;
      const frame = typeof actionOrFrame === 'string' ? { ...extras, action: actionOrFrame, progress } : actionOrFrame || {};
      detail.update({ ...frame, progress: clamp(frame.progress ?? frame.resolveProgress) });
      calibrateControls(detail.controls);
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const item of resources.geometries) item.dispose();
      for (const item of resources.maps) item.dispose();
      for (const item of resources.materials) item.dispose();
      resources.geometries.clear(); resources.maps.clear(); resources.materials.clear();
      group.clear(); group.removeFromParent();
    },
  };
}
