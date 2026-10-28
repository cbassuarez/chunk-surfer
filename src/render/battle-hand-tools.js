// Physical field tools for the exposed recordist. Units are metres; +Z is the
// face toward the player. The hand solver owns the hand and the caller moves
// tool + contact targets together. This module never advances a game clock.
import * as THREE from 'three';
import { TUNING_FORK_ENGRAVING } from '../data/tuning-fork-discovery.js';
import { BOX_CRADLE } from './battle-hand-box-grips.js';
import { FRONT_CONTROL, CONTROL_APPROACH_ANGLES, CONTROL_CONTACT_POSES } from './battle-hand-controls.js';
import { HANDLE_GRIPS, TORCH_SWITCH } from './battle-hand-grips.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { normalizeFieldKit, FLASHLIGHT_HOUSING_COLORS } from '../game/field-kit.js';
import { drawInstrumentPlate, drawInstrumentWell, drawInstrumentGlass } from './instrument-material.js';
import { drawRecorderReadoutCanvas, recorderDisplayPalette } from './recorder-instrument.js';
import { drawWitnessChassis } from './witness-material.js';
import { ensureWorldLetteringFonts, worldLetteringFontsStatus } from './world-lettering-fonts.js';
import { fitWorldLetteringLine } from './world-lettering-layout.js';
import { createThreePhysicalPrint } from './three-physical-print.js';
import {FIELD_WRAPPED_PRINT,facetedWrappedPrintGeometry,torchGripRingYs} from './wrapped-tool-print.js';

const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, finite(n, lo)));
const target = (position, normal = [0, 0, 1]) => ({ position, normal });
const COLORS = Object.freeze({ steel: '#92988e', edge: '#c5c8bb', rubber: '#242a25', dark: '#171e1a', brass: '#9e8653' });
const BUTTONS = Object.freeze({ classic: ['#bc6b57', '#bcbda9', '#c9a151'], signal: ['#bc6b57', '#729aa9', '#d0bc64'], 'sea-glass': ['#d09179', '#a7bda0', '#bcbda9'] });
const FACE = Object.freeze({ aluminum: '#b0b3a5', black: '#232c27', olive: '#5e6645', witness: '#454b36' });
const lettering = new WeakMap();
export const warmBattleHandToolLettering = options => ensureWorldLetteringFonts(options);
function pinnedBake(group, draw) {
  const state = lettering.get(group);
  const paint = () => { if (!state.disposed) { draw(); state.bakes++; } };
  if (worldLetteringFontsStatus().ready) { paint(); return; }
  // Direct model-review callers also use the synchronous builder. Leave its
  // label blank until the exact face loads, then invalidate that same texture.
  // A system-font first bake must never become a permanently cached label.
  state.jobs.push(ensureWorldLetteringFonts().then(paint).catch(error => { state.error = String(error?.message || error); }));
}
function calibrateControls(controls, id) {
  for (const [key, control] of Object.entries(controls)) {
    if (control.hand === 'right') continue;
    const normal = new THREE.Vector3(...control.normal).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    // Rotate the wrist around a fixed pad contact, preserving its facing.
    // Each box control leaves clearance from the supporting hand.
    const angle = CONTROL_APPROACH_ANGLES[id]?.[key] ?? control.approachAngle ?? 0;
    if (angle) orientation.premultiply(new THREE.Quaternion().setFromAxisAngle(normal, angle));
    const bake = CONTROL_CONTACT_POSES[id]?.[key] || FRONT_CONTROL;
    const offset = new THREE.Vector3(...bake.offset).applyQuaternion(orientation);
    control.hand = 'left'; control.digit = 'index';
    control.wrist = { position: offset.add(new THREE.Vector3(...control.position)).toArray(), quaternion: orientation.multiply(new THREE.Quaternion(...bake.quaternion)).toArray() };
    control.pose = bake.pose;
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
function label(group, value, width, height, position, { color = '#d2d4bd', background = null, size = 32,profile='painted-metal',wrappedSurface=null } = {}) {
  const source = canvas(512, Math.max(48, Math.round(512 * height / width)));
  if (!source) return null;
  const mask=canvas(source.width,source.height),ctx=source.getContext('2d'),m=mask.getContext('2d');
  const print=createThreePhysicalPrint(THREE,{width:source.width,height:source.height,widthM:width,heightM:height,
    profile,seed:`field-tool:${value}`,opaque:!!background});
  pinnedBake(group, () => {
    ctx.clearRect(0, 0, source.width, source.height);m.clearRect(0,0,source.width,source.height);
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, source.width, source.height); }
    ctx.fillStyle = color;
    const ink = fitWorldLetteringLine(ctx, value, { width: source.width - 12, height: source.height - 8, maxFont: size, role: 'sans' });
    if (!ink.fits) throw new Error(`Physical tool label does not fit: ${value}`);
    const x=(source.width-ink.width)/2+ink.left,y=(source.height-ink.ascent-ink.descent)/2+ink.ascent;
    ctx.fillText(ink.text,x,y);m.font=ink.font;m.fontKerning=ctx.fontKerning;m.textAlign=ctx.textAlign;m.textBaseline=ctx.textBaseline;
    m.fillStyle='#fff';m.fillText(ink.text,x,y);print.update(source,mask);
  });
  let geometry,placement=position,contact=null;
  if(wrappedSurface){
    const data=facetedWrappedPrintGeometry({centerY:position[1],widthM:width,heightM:height,surface:wrappedSurface});geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));geometry.setIndex(data.indices);geometry.computeBoundingSphere();placement=[0,0,0];contact=data.contact;
  }else geometry=new THREE.PlaneGeometry(width,height);
  const mesh=add(group,geometry,print.material,placement,null,`physical tool legend: ${value}`);
  if(contact)mesh.userData.physicalLabelContact=contact;
  // The carrier already casts the silhouette; an applied micron paint layer
  // receives that lighting without casting a second text-shaped shadow.
  mesh.castShadow=false;return mesh;
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
function handleGrip(id) {
  return structuredClone(HANDLE_GRIPS[id]);
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
    const ctx = faceCanvas.getContext('2d');
    pinnedBake(group, () => {
      ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height); ctx.save(); ctx.scale(2, 2);
      if (cosmetics.faceplate === 'witness') drawWitnessChassis(ctx, { w: 736, h: 405, buttonSlots: designSlots, keys: [], endings: cosmetics.witnessEndings || [], phosphor: colors.label, illumination: 0 });
      else drawInstrumentPlate(ctx, { x: 12, y: 15, w: 712, h: 370, seed: 'approved-recorder', finish: cosmetics.faceplate, screwRadius: 7, screwInset: 13, fasteners: false });
      drawInstrumentWell(ctx, { x: 35, y: 76, w: 666, h: 239 });
      if (cosmetics.faceplate !== 'witness') {
        const dark = cosmetics.faceplate !== 'aluminum'; ctx.fillStyle = dark ? '#d7d9bd' : '#333830';
        const ink = (copy, x, y, width, size, align = 'left') => {
          const line = fitWorldLetteringLine(ctx, copy, { width, height: size * 1.3, maxFont: size, role: 'sans' });
          if (!line.fits) throw new Error(`Physical recorder label does not fit: ${copy}`);
          const start = align === 'right' ? x - line.width : align === 'center' ? x - line.width / 2 : x;
          ctx.fillText(line.text, start + line.left, y);
        };
        ink('AUDIOCORP', 35, 48, 180, 14);
        ink('DA–1000', 368, 48, 180, 11, 'center');
        ink('FIELD RECORDER', 700, 48, 180, 11, 'right');
        ink('RECORD / MONITOR', 35, 350, 300, 10);
      }
      ctx.restore();
      // The map exists by the time a deferred font load resolves.
      const map = group.getObjectByName('approved DA-1000 face')?.material?.map;
      if (map) map.needsUpdate = true;
    });
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
  return { bounds: { width: w, height: h, depth: d }, contacts: { right: recorderCradle([.06, 0, 0]) }, controls,
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
  const printFit=FIELD_WRAPPED_PRINT.torch,surface=printFit.surface;
  const shell = physical(FLASHLIGHT_HOUSING_COLORS[cosmetics.flashlightHousing], .5, .24);
  const rubber = physical(COLORS.rubber, .8), steel = physical(COLORS.steel, .3, .8);
  cylinder(group,surface.radiusBottomM,surface.heightM,shell,[0,surface.centerY,0],null,surface.radiusTopM,'torch handle');
  cylinder(group, .035, .052, shell, [0, .088, 0], null, .041);
  cylinder(group, .041, .006, steel, [0, .117, 0]);
  cylinder(group, .036, .004, physical('#151f1a', .11, .5), [0, .121, 0]);
  cylinder(group, .028, .002, new THREE.MeshStandardMaterial({ color: '#b9c8ba', roughness: .12, metalness: .65, emissive: '#bddac0', emissiveIntensity: 0 }), [0, .123, 0], null, .028, 'torch lens');
  for(const y of torchGripRingYs())torus(group,.0233,.0008,rubber,[0,y,0],[Math.PI/2,0,0]);
  const switchNormal = TORCH_SWITCH.normal;
  const switchPosition = TORCH_SWITCH.position;
  const switchNormalLength = Math.hypot(...switchNormal);
  const switchAxis = switchNormal.map(value => value / switchNormalLength);
  const capRest = switchPosition.map((value, i) => value - switchAxis[i] * .00175);
  const cap = box(group, [.009, .016, .0035], rubber, capRest, .003, 'torch switch');
  cap.rotation.y = Math.atan2(switchNormal[0], switchNormal[2]);
  cylinder(group, .0236, .007, steel, [0, -.097, 0]);
  label(group,'FIELD TORCH',printFit.widthM,printFit.heightM,[0,printFit.centerY,0],{wrappedSurface:surface});
  const lens = group.getObjectByName('torch lens');
  const controls = { trigger: { ...target([...switchPosition], [...switchNormal]), hand: 'right', digit: 'thumb', pressedPosition: [...TORCH_SWITCH.pressedPosition], pressedPose: structuredClone(TORCH_SWITCH.pressedPose) } };
  return { bounds: { width: .084, height: .228, depth: .084 }, contacts: { right: handleGrip('torch') }, controls,
    update(frame) {
      const lit = frame.action === 'expose' || frame.action === 'whiteout';
      const p = clamp(frame.progress), playerAction = lit && frame.active !== false && frame.side !== 'enemy';
      const pressure = frame.controlPressure != null && Number.isFinite(Number(frame.controlPressure))
        ? clamp(frame.controlPressure) : frame.impactFired !== false && p >= .28 && p < .72 ? 1 : 0;
      lens.material.emissiveIntensity = playerAction && frame.impactFired === true ? .08 + (frame.action === 'whiteout' ? 1.25 : .38) * Math.sin(Math.PI * p) : 0;
      const travel = playerAction ? .0012 * pressure : 0;
      cap.position.x = capRest[0] - switchAxis[0] * travel; cap.position.z = capRest[2] - switchAxis[2] * travel;
      controls.trigger.position[0] = switchPosition[0] - switchNormal[0] * travel; controls.trigger.position[2] = switchPosition[2] - switchNormal[2] * travel;
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
  label(group, TUNING_FORK_ENGRAVING, .024, .009, [0, -.043, .0096], { color: '#242c25', size: 72,profile:'satin-metal' });
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
  const printFit=FIELD_WRAPPED_PRINT.coffee,surface=printFit.surface;
  const paper = physical('#c5b791', .94), rim = physical('#d9d1b3', .8), dark = physical('#443525', .45);
  cylinder(group,surface.radiusBottomM,surface.heightM,paper,[0,surface.centerY,0],null,surface.radiusTopM,'coffee cup');
  cylinder(group, .0375, .006, dark, [0, .054, 0]);
  torus(group, .038, .0022, rim, [0, .055, 0], [Math.PI / 2, 0, 0]);
  cylinder(group, .036, .002, physical('#291d12', .22), [0, .0545, 0]);
  for (let i = 0; i < 4; i++) torus(group, .0317 + i * .001, .0005, dark, [0, -.015 + i * .009, 0], [Math.PI / 2, 0, 0]);
  label(group,'NIGHT SHIFT',printFit.widthM,printFit.heightM,[0,printFit.centerY,0],{color:'#5b4931',size:54,profile:'paper',wrappedSurface:surface});
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
  label(group, 'VAN / 10″', .016, .036, [0, -.042, .0081], { color: '#e1e0c8', size: 65,profile:'satin-metal' });
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
  const letters = { disposed: false, bakes: 0, jobs: [], error: '' }; lettering.set(group, letters);
  const builders = { recorder, torch, fork, radio, rig, coffee, spanner };
  const detail = builders[id]?.(group, appearance) || { bounds: { width: 0, height: 0, depth: 0 }, contacts: { right: null }, controls: {}, update() {} };
  calibrateControls(detail.controls, id);
  // A second alias prevents old callers confusing the little finger with a
  // sixth digit; both names refer to the exact same supported pad target.
  if (detail.contacts.right?.pinky) detail.contacts.right.little = detail.contacts.right.pinky;
  // The renderer borrows this group as the hand's rigid parent. Capture only
  // our resources before external hands, sleeves or other children attach.
  const resources = ownedResources(group);
  let disposed = false;
  return { id, group, contacts: detail.contacts, controls: detail.controls, bounds: detail.bounds,
    letteringReady: Promise.all(letters.jobs).then(() => ({ ready: !letters.disposed && !letters.error, bakes: letters.bakes, error: letters.error })),
    letteringStatus: () => ({ ready: !letters.disposed && !letters.error && (!letters.jobs.length || worldLetteringFontsStatus().ready), bakes: letters.bakes, error: letters.error }),
    update(actionOrFrame = {}, progress = 0, extras = {}) {
      if (disposed) return;
      const frame = typeof actionOrFrame === 'string' ? { ...extras, action: actionOrFrame, progress } : actionOrFrame || {};
      detail.update({ ...frame, progress: clamp(frame.progress ?? frame.resolveProgress) });
      calibrateControls(detail.controls, id);
    },
    dispose() {
      if (disposed) return; disposed = true; letters.disposed = true;
      for (const item of resources.geometries) item.dispose();
      for (const item of resources.maps) item.dispose();
      for (const item of resources.materials) item.dispose();
      resources.geometries.clear(); resources.maps.clear(); resources.materials.clear();
      group.clear(); group.removeFromParent();
    },
  };
}
