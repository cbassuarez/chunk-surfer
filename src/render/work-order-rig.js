import * as THREE from 'three';
import { paperImageState, preloadPaperDocument } from '../game/paper-assets.js';
import { createBattleHandRig, loadRecordistHandTemplate } from './battle-hand-rig.js';
import { addRecordistForearm, shapeRecordistForearm } from './battle-hands.js';
import { recorderElbow } from './recorder-arm.js';

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MESH_COLS = 32;
const MESH_ROWS = 46;
const PEN_RADIUS = .0032;
const TIP_TO_GRIP = .051;
const UP = new THREE.Vector3(0, 1, 0);
const PAPER_NORMAL = new THREE.Vector3(0, 0, 1);
const INJURED_SKIN = new THREE.Color('#806057');
const PEN_AXIS = new THREE.Vector3(.324, -.734, -.597).normalize();
const PEN_GRIP = new THREE.Vector3(.0118, .10715, .074);
const PEN_TIP = PEN_GRIP.clone().addScaledVector(PEN_AXIS, -TIP_TO_GRIP);
const PAPER_PINCH_X = 4;
const clamp01 = value => Math.max(0, Math.min(1, value));
const eased = value => { const t = clamp01(value); return t * t * (3 - 2 * t); };

// The three palmar contacts were fitted against the recordist's rig and a
// 6.4 mm barrel in hand-local metres. A fixed grip lets the whole biro follow
// the nib trajectory. Its shaft can no longer slide between the fingers.
const WRITING_POSE = {
  index: [.792, .669, .203], middle: [.865, .449, .150],
  ring: [.70, .83, .45], pinky: [.80, .97, .53],
  spread: { index: -.27, middle: .214, ring: .045, pinky: .095 },
  thumb: { opposition: 1.106, abduction: .417, mcp: .199, ip: .064 },
};
const HOLDING_POSE = {
  index: [.779, 1.090, .381], middle: [.62, 1.10, .42], ring: [.67, 1.15, .50], pinky: [.75, 1.16, .51],
  spread: { index: -.22 },
  thumb: { opposition: .730, abduction: .365, mcp: .523, ip: .100 },
};
// The palm faces the sheet throughout the gesture. The shaft lies between
// the thumb and index and runs back into their web, toward the wrist.
const BARREL_DIRECTION = new THREE.Vector3(.635, -.67, .385).normalize();
const WRITING_ROTATION = new THREE.Quaternion().setFromAxisAngle(BARREL_DIRECTION, 2.80)
  .multiply(new THREE.Quaternion().setFromUnitVectors(PEN_AXIS, BARREL_DIRECTION));
const HOLDING_ROTATION = new THREE.Quaternion().setFromEuler(new THREE.Euler(-2.308, 1.629, 1.818));

export function workOrderWritingRotation(nibX) {
  const turn = THREE.MathUtils.clamp((nibX - 88) * .0012, -.10, .10);
  return new THREE.Quaternion().setFromAxisAngle(PAPER_NORMAL, turn).multiply(WRITING_ROTATION);
}

let rig = null;
let pending = null;
let unavailable = false;
let latest = null;

function addBiro(hand) {
  const biro = new THREE.Group();
  biro.position.copy(PEN_TIP);
  biro.quaternion.setFromUnitVectors(UP, PEN_AXIS);
  hand.root.add(biro);
  const body = new THREE.MeshStandardMaterial({ color: '#253035', roughness: .50, metalness: .08 });
  const tip = new THREE.MeshStandardMaterial({ color: '#a6a39a', roughness: .42, metalness: .38 });
  function cylinder(top, bottom, length, y, material) {
    const part = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, length, 16), material);
    part.position.y = y;
    biro.add(part);
  }
  cylinder(.0028, .00027, .012, .006, tip);
  cylinder(PEN_RADIUS, .0028, .013, .0185, body);
  cylinder(.00304, PEN_RADIUS, .108, .079, body);
  cylinder(.00311, .00304, .010, .138, tip);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(.001, .025, .0018), tip);
  clip.position.set(.0037, .127, 0);
  biro.add(clip);
}

function measureBiroGrip(hand) {
  return Object.fromEntries(['thumb', 'index', 'middle'].map(finger => {
    const { position, normal } = hand.getPad(finger, 'local');
    const offset = position.sub(PEN_GRIP);
    const along = offset.dot(PEN_AXIS);
    const radial = offset.addScaledVector(PEN_AXIS, -along);
    const errorMm = Math.abs(radial.length() - PEN_RADIUS) * 1000;
    return [finger, { errorMm, normalDot: -normal.dot(radial.normalize()), fromTipMm: (along + TIP_TO_GRIP) * 1000 }];
  }));
}

function closeSkinMaterial() {
  const material = new THREE.MeshPhysicalMaterial({ color: '#a0887a', roughness: .72, specularIntensity: .28 });
  // Preserve continuous shading at this distance. Tiny, balanced exposure
  // dots in the hand pass sit below the paper type and the world's crosshatch.
  material.customProgramCacheKey = () => 'work-order-close-skin-stipple';
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
      vec2 point = floor(gl_FragCoord.xy);
      float tone = dot(gl_FragColor.rgb, vec3(.2126, .7152, .0722));
      float jitter = fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
      float stipple = step(jitter, tone) - tone;
      gl_FragColor.rgb = clamp(gl_FragColor.rgb + stipple * .013, 0.0, 1.0);
      #include <dithering_fragment>
    `);
  };
  return material;
}

function mount(template, art) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setClearColor(0, 0);
  renderer.toneMappingExposure = .86;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const stage = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(43, 16 / 9, .025, 2);
  const key = new THREE.DirectionalLight('#f3e8d9', 1.72);
  key.position.set(-.56, .55, .37);
  const fill = new THREE.DirectionalLight('#cad3d6', .42);
  fill.position.set(.43, -.22, .50);
  stage.add(new THREE.HemisphereLight('#e6e5e3', '#777a7c', 1.05), key, fill);

  const raster = document.createElement('canvas');
  raster.width = 1280;
  raster.height = Math.round(raster.width * PAGE_HEIGHT / PAGE_WIDTH);
  const rasterContext = raster.getContext('2d');
  const paperMap = new THREE.CanvasTexture(raster);
  paperMap.colorSpace = THREE.SRGBColorSpace;
  paperMap.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const page = new THREE.Group();
  const mesh = new THREE.PlaneGeometry(PAGE_WIDTH / 1000, PAGE_HEIGHT / 1000, MESH_COLS, MESH_ROWS);
  const front = new THREE.Mesh(mesh, new THREE.MeshStandardMaterial({ map: paperMap, roughness: .88 }));
  const back = new THREE.Mesh(mesh, new THREE.MeshStandardMaterial({ color: '#beb9a6', roughness: .91, side: THREE.BackSide }));
  page.add(front, back);
  stage.add(page);

  // This insert uses continuous skin shading under the fine screen. At
  // this scale the battle normal detail was doubled by contour acquisition.
  const skin = closeSkinMaterial();
  const nailMaterial = new THREE.MeshStandardMaterial({ color: '#a38d83', roughness: .66 });
  const writer = createBattleHandRig(template, { side: 'right', material: skin, nailMaterial });
  const holder = createBattleHandRig(template, { side: 'left', material: skin, nailMaterial });
  for (const nail of [...writer.nails, ...holder.nails]) {
    nail.scale.multiplyScalar(.86);
    nail.position.y -= .00035;
  }
  writer.setFingerPose(WRITING_POSE);
  holder.setFingerPose(HOLDING_POSE);
  const closeCuffs = { wristExposure: .020, cuffOverlap: .023 };
  const armRight = addRecordistForearm(THREE, writer, skin, closeCuffs);
  const armLeft = addRecordistForearm(THREE, holder, skin, closeCuffs);
  addBiro(writer);
  stage.add(writer.root, holder.root);
  return { renderer, stage, camera, raster, rasterContext, paperMap, art, page, mesh, front, back, skin, nailMaterial,
    writer, holder, armRight, armLeft, lastInkImage: null, lastInkVersion: null, lastReduced: null,
    holderPad: holder.getPad('thumb', 'local').position, grip: measureBiroGrip(writer) };
}

export function warmWorkOrderRig() {
  if (rig || pending || unavailable || typeof document === 'undefined') return pending;
  pending = Promise.all([loadRecordistHandTemplate(), preloadPaperDocument('work-order')]).then(([template]) => {
    const art = paperImageState('work-order', 0).image;
    if (!art) throw new Error('Work Order print unavailable');
    const instance = mount(template, art);
    try {
      instance.renderer.compile(instance.stage, instance.camera);
      instance.renderer.setSize(160, 120, false);
      instance.renderer.render(instance.stage, instance.camera);
      rig = instance;
    } catch (error) {
      instance.writer.dispose();
      instance.holder.dispose();
      instance.paperMap.dispose();
      instance.skin.dispose();
      instance.nailMaterial.dispose();
      instance.renderer.dispose();
      throw error;
    }
  }).catch(error => {
    unavailable = true;
    console.warn('Work Order hands unavailable:', error);
  }).finally(() => { pending = null; });
  return pending;
}

function paintPaper(r, ink, reducedMotion, pinchY) {
  const { raster, rasterContext: ctx, art } = r;
  const image = ink?.image || null;
  const version = ink?.version ?? null;
  if (r.lastInkImage === image && r.lastInkVersion === version && r.lastReduced === reducedMotion && r.lastPinchY === pinchY) return;
  ctx.drawImage(art, 0, 0, raster.width, raster.height);
  if (image) ctx.drawImage(image, 0, 0, raster.width, raster.height);
  if (!reducedMotion) {
    ctx.save();
    ctx.scale(raster.width / PAGE_WIDTH, raster.height / PAGE_HEIGHT);
    ctx.translate(PAPER_PINCH_X + 2, pinchY);
    ctx.scale(1.30, .65);
    const shadow = ctx.createRadialGradient(0, 0, .3, 0, 0, 7);
    shadow.addColorStop(0, 'rgba(34,28,17,.34)');
    shadow.addColorStop(1, 'rgba(34,28,17,0)');
    ctx.fillStyle = shadow;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.restore();
  }
  r.paperMap.needsUpdate = true;
  r.lastInkImage = image;
  r.lastInkVersion = version;
  r.lastReduced = reducedMotion;
  r.lastPinchY = pinchY;
}

function bendPaper(r, flex, nib, pressure) {
  const { mesh } = r;
  const { position, uv } = mesh.attributes;
  const touchU = nib ? nib.x / PAGE_WIDTH : 0;
  const touchV = nib ? nib.y / PAGE_HEIGHT : 0;
  for (let index = 0; index < position.count; index++) {
    const u = uv.getX(index);
    const v = 1 - uv.getY(index);
    const freeEdge = Math.pow(Math.abs(u - .26), 1.65) * (.35 + .65 * v);
    const push = pressure * Math.exp(-((u - touchU) ** 2 * 340 + (v - touchV) ** 2 * 540));
    position.setZ(index, .003 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) + freeEdge * flex - .0009 * push);
  }
  position.needsUpdate = true;
  mesh.computeVertexNormals();
}

// Evaluate the same rendered triangle under the nib. Page bend and pressure
// never let the contact drift away from the UV carrying the fresh ink.
function pagePoint(r, x, y, above = 0) {
  const u = clamp01(x / PAGE_WIDTH) * MESH_COLS;
  const v = clamp01(y / PAGE_HEIGHT) * MESH_ROWS;
  const col = Math.min(MESH_COLS - 1, Math.floor(u));
  const row = Math.min(MESH_ROWS - 1, Math.floor(v));
  const dx = u - col;
  const dy = v - row;
  const rowLength = MESH_COLS + 1;
  const pos = r.mesh.attributes.position;
  const a = row * rowLength + col;
  const b = a + rowLength;
  const c = b + 1;
  const d = a + 1;
  const z = dx + dy <= 1 ? (1 - dx - dy) * pos.getZ(a) + dy * pos.getZ(b) + dx * pos.getZ(d)
    : (dx + dy - 1) * pos.getZ(c) + (1 - dx) * pos.getZ(b) + (1 - dy) * pos.getZ(d);
  return new THREE.Vector3((x - PAGE_WIDTH / 2) / 1000, (PAGE_HEIGHT / 2 - y) / 1000, z + above);
}

function poseForearm(hand, arm, side) {
  const { position, quaternion } = hand.root;
  const { elbow } = recorderElbow(side, position, quaternion);
  const local = position.clone().sub(elbow).normalize().applyQuaternion(quaternion.clone().invert());
  arm.root.quaternion.setFromUnitVectors(UP, local);
  shapeRecordistForearm(THREE, arm);
  return UP.angleTo(local);
}

export function workOrderFraming(aspect, focusY = 110) {
  const lowerRow = clamp01((focusY - 110) / 102);
  return { rowX: .4675, rowY: .635 + .125 * lowerRow,
    pageShare: aspect < 1.55 ? .47 : .385,
    pitch: -.46 - .12 * lowerRow, yaw: -.16, roll: -.065 };
}

function posePaper(r, frame, aspect, pinchY) {
  const lift = eased(frame.lift ?? 1);
  const lower = eased(frame.lower ?? 0);
  const settled = clamp01(frame.settled ?? 1);
  const pressure = !frame.reducedMotion && frame.nib && frame.nib.height <= .001 ? 1 : 0;
  const paperSpring = lift === 1 && !lower && !frame.reducedMotion ? -.013 * Math.sin(settled * Math.PI) : 0;
  const flex = .009 + (1 - lift) * .033 + lower * .038 + paperSpring;
  bendPaper(r, flex, frame.nib, pressure);
  const halfFov = Math.tan(THREE.MathUtils.degToRad(43 / 2));
  const focusY = frame.focus?.y ?? 110;
  const { rowX, rowY, pageShare, pitch, yaw, roll } = workOrderFraming(aspect, focusY);
  const distance = (PAGE_WIDTH / 1000) / (2 * halfFov * aspect * pageShare);
  const depth = Math.max(.36, Math.min(.74, distance));
  const halfHeight = halfFov * depth;
  // Keep the active line low. Later lines have more paper above them, so
  // their framing gives back a little more of the room's central sightline.
  const stableRow = pagePoint(r, PAGE_WIDTH / 2, focusY);
  r.page.rotation.set(pitch - (1 - lift) * .31 - lower * .34, yaw - (1 - lift) * .19, roll - (1 - lift) * .22 - lower * .15);
  stableRow.applyQuaternion(r.page.quaternion);
  r.page.position.set((rowX * 2 - 1) * halfHeight * aspect - stableRow.x - (.023 * (1 - lift) + lower * .014),
    (1 - rowY * 2) * halfHeight - stableRow.y - (.85 * depth + .02) * (1 - lift + lower),
    -depth - stableRow.z + .029 * (1 - lift) + .008 * lower);
  r.page.updateMatrixWorld(true);
  r.holder.root.visible = !frame.reducedMotion;
  r.writer.root.visible = !frame.reducedMotion && !!frame.nib;
  if (r.holder.root.visible) {
    const thumb = r.page.localToWorld(pagePoint(r, PAPER_PINCH_X, pinchY, .0008));
    r.holder.root.quaternion.copy(r.page.quaternion).multiply(HOLDING_ROTATION);
    r.holder.root.position.copy(thumb).sub(r.holderPad.clone().applyQuaternion(r.holder.root.quaternion));
    r.leftWristAngle = poseForearm(r.holder, r.armLeft, -1);
  }
  if (r.writer.root.visible) {
    const { x, y, height = 0 } = frame.nib;
    // The unsupported fingers relax as the pen lifts. The three barrel
    // contacts keep their pose, and the elbow follows the larger stroke.
    const release = Math.round(clamp01(height / 21) * 8) / 8;
    if (release !== r.lastRelease) {
      r.writer.setFingerPose({ ring: [.70 - .13 * release, .83 - .17 * release, .45 - .08 * release],
        pinky: [.80 - .19 * release, .97 - .21 * release, .53 - .11 * release] });
      r.lastRelease = release;
    }
    const nib = r.page.localToWorld(pagePoint(r, x, y, height / 1000));
    r.writer.root.quaternion.copy(r.page.quaternion).multiply(workOrderWritingRotation(x));
    r.writer.root.position.copy(nib).sub(PEN_TIP.clone().applyQuaternion(r.writer.root.quaternion));
    r.rightWristAngle = poseForearm(r.writer, r.armRight, 1);
    r.writer.root.updateMatrixWorld(true);
    r.nibErrorMm = r.writer.root.localToWorld(PEN_TIP.clone()).distanceTo(nib) * 1000;
    r.palmToPaper = -PAPER_NORMAL.clone().applyQuaternion(r.writer.root.quaternion)
      .dot(PAPER_NORMAL.clone().applyQuaternion(r.page.quaternion));
  }
}

export function drawWorkOrderRig({ ctx }, frame) {
  void warmWorkOrderRig();
  const r = rig;
  if (!r || r.renderer.getContext().isContextLost()) return false;
  const { width: canvasW, height: canvasH } = ctx.canvas;
  if (!(canvasW > 0 && canvasH > 0)) return false;
  // Both forearms can enter from the edge of the camera.
  const renderScale = Math.min(1, 1920 / canvasW, 1040 / canvasH);
  const width = Math.round(canvasW * renderScale);
  const height = Math.round(canvasH * renderScale);
  if (r.renderer.domElement.width !== width || r.renderer.domElement.height !== height) {
    r.renderer.setSize(width, height, false);
    r.camera.aspect = width / height;
    r.camera.updateProjectionMatrix();
  }
  const reducedMotion = !!frame.reducedMotion;
  const pinchY = THREE.MathUtils.clamp((frame.focus?.y ?? 110) + 16, 123, 187);
  paintPaper(r, frame.ink, reducedMotion, pinchY);
  posePaper(r, frame, width / height, pinchY);
  const injury = clamp01((frame.injury || 0) / 3);
  r.skin.color.set('#a0887a').lerp(INJURED_SKIN, injury * .27);

  // The sheet, fingertips and biro share one depth-tested projection. There
  // is no world-screen tone remap over the skin or across the printed type.
  r.renderer.render(r.stage, r.camera);
  ctx.drawImage(r.renderer.domElement, 0, 0, canvasW, canvasH);
  const writer = r.writer.root.visible;
  latest = { width, height, reducedMotion, hands: r.holder.root.visible, writer, grip: r.grip,
    gripErrorMm: Object.fromEntries(Object.entries(r.grip).map(([finger, contact]) => [finger, contact.errorMm])),
    leftWristAngle: r.holder.root.visible ? r.leftWristAngle : null,
    rightWristAngle: writer ? r.rightWristAngle : null,
    nibErrorMm: writer ? r.nibErrorMm : null, palmToPaper: writer ? r.palmToPaper : null };
  return true;
}

export function workOrderRigDiagnostics() {
  return { ready: !!rig, pending: !!pending, unavailable, ...latest };
}
