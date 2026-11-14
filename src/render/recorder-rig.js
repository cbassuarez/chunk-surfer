import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, HemisphereLight, DirectionalLight,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Raycaster,
  PointLight, Scene, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetUrl } from '../platform/paths.js';
import { CONTROL_LATCH_TRAVEL, sampleControl } from '../game/control-mechanics.js';
import { BRACKET_POSITION, BRACKET_PITCH } from './recorder-rig-motion.js';
import { recorderElbow } from './recorder-arm.js';
import { createBattleHandRig, loadRecordistHandTemplate } from './battle-hand-rig.js';
import { createRecordistHandMaterial, addRecordistForearm, shapeRecordistForearm } from './battle-hands.js';
import {
  poseRecorderBrace, poseRecorderIndex, recorderKeyMotion,
  RECORDER_KEY_X as CONTROL_X, RECORDER_KEY_Y as CONTROL_Y, RECORDER_KEY_Z as CONTROL_Z,
  RECORDER_KEY_FACE, RECORDER_KEY_TRAVEL,
} from './recorder-hand-motion.js';
import { createTransparentPixelMesh } from './pixel-mesh/transparent.js';
import { uiDraw, uiPhysicalSize, uiWithCanvas } from './ui.js';

const SCREEN = { width: .274, height: .274 * 405 / 736, front: .03034 };
const CONTROL_NAMES = ['rec', 'stop', 'takes'];
let rig = null, request = null, failed = false, lastPress = null;

function box(group, size, position, material) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}

function buildBracket(caseGroup, torch) {
  const steel = new MeshStandardMaterial({ color: '#78847a', metalness: .65, roughness: .48 });
  const rubber = new MeshStandardMaterial({ color: '#18251e', roughness: .95 });
  torch.position.set(...BRACKET_POSITION);
  torch.rotation.x = BRACKET_PITCH;
  caseGroup.add(torch);
  box(caseGroup, [.180, .008, .018], [0, .086, -.010], steel);
  box(caseGroup, [.026, .008, .120], [0, .090, -.052], steel);
  for (const x of [-.080, .080]) {
    box(caseGroup, [.026, .032, .004], [x, .065, -.025], steel);
    box(caseGroup, [.026, .005, .056], [x, .0815, 0], steel);
    box(caseGroup, [.026, .012, .004], [x, .072, .034], steel);
    box(caseGroup, [.024, .024, .0012], [x, .065, -.0224], rubber);
    box(caseGroup, [.024, .010, .0012], [x, .072, .0314], rubber);
    box(caseGroup, [.024, .003, .047], [x, .077, 0], rubber);
  }
  for (const y of [-.055, .045]) {
    const band = new Mesh(new TorusGeometry(.024, .0021, 8, 32), steel);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    torch.add(band);
    const axis = new Vector3(0, 1, 0).applyQuaternion(torch.quaternion);
    const down = new Vector3(0, -1, 0).addScaledVector(axis, axis.y).normalize();
    const end = band.position.clone().applyQuaternion(torch.quaternion).add(torch.position).addScaledVector(down, .0261);
    const start = new Vector3(0, .094, end.z);
    const strut = new Mesh(new CylinderGeometry(.008, .008, start.distanceTo(end), 10), steel);
    strut.position.copy(start).lerp(end, .5);
    strut.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), end.sub(start).normalize());
    caseGroup.add(strut);
  }
}

function makeTexture() {
  const canvas = document.createElement('canvas');
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  return { canvas, ctx: canvas.getContext('2d'), map };
}

function mountRig(asset, template) {
  const { scene: model } = asset;
  const caseGroup = new Group(), scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, .02, 2);
  const renderer = new WebGLRenderer({ alpha: true, premultipliedAlpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMappingExposure = .45;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const hemisphere = new HemisphereLight('#c7d2c6', '#3a3326', .9);
  const key = new DirectionalLight('#eee8d8', 1.6);
  key.position.set(.45, .70, .35);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -.38, right: .38, top: .38, bottom: -.38, near: .15, far: 2 });
  key.shadow.normalBias = .0007;
  key.shadow.bias = -.00012;
  const rim = new DirectionalLight('#cdc4a6', .52);
  rim.position.set(-.45, .24, -.54);
  scene.add(caseGroup, hemisphere, key, rim);
  const body = model.getObjectByName('recorder');
  const torch = model.getObjectByName('torch');
  caseGroup.add(body);
  body.traverse(part => {
    if (part.isMesh) part.castShadow = part.receiveShadow = true;
  });
  buildBracket(caseGroup, torch);
  const lens = torch.getObjectByName('flashlight-lens');
  lens.material.transparent = true;
  lens.material.opacity = .45;
  lens.material.depthWrite = false;
  lens.material.emissive.set('#e4d8b4');
  const face = makeTexture();
  const faceMesh = new Mesh(new PlaneGeometry(SCREEN.width, SCREEN.height), new MeshBasicMaterial({ map: face.map, color: 0xffffff, toneMapped: false, transparent: true, alphaTest: .015 }));
  faceMesh.position.z = SCREEN.front;
  caseGroup.add(faceMesh);
  const displaySpill = new PointLight('#9bc5a3', .025, .42);
  displaySpill.position.set(0, .012, .092);
  caseGroup.add(displaySpill);
  // The approved face art supplies the legends and indicator lamps. Each key
  // gets its own surface, so its ink and the pad travel with the physical cap.
  const caps = CONTROL_X.map(x => {
    const texture = makeTexture();
    const root = new Group();
    root.position.set(x, CONTROL_Y, CONTROL_Z);
    box(root, [.032, .017, .003], [0, 0, 0], new MeshStandardMaterial({ color: '#373e37', roughness: .6 }));
    const art = new Mesh(new PlaneGeometry(.032, .017), new MeshBasicMaterial({ map: texture.map, toneMapped: false, transparent: true, alphaTest: .015 }));
    art.position.z = RECORDER_KEY_FACE;
    root.add(art);
    caseGroup.add(root);
    return { ...texture, root, art };
  });
  const skin = createRecordistHandMaterial(THREE);
  const armSkin = createRecordistHandMaterial(THREE, { anatomy: false, uniforms: skin.userData.handUniforms });
  const left = createBattleHandRig(template, { side: 'left', material: skin });
  const right = createBattleHandRig(template, { side: 'right', material: skin });
  const armL = addRecordistForearm(THREE, left, armSkin);
  const armR = addRecordistForearm(THREE, right, armSkin);
  scene.add(left.root, right.root);
  const dither = createTransparentPixelMesh(THREE, renderer, { assetUrl, profile: 'explore' });
  return { renderer, dither, scene, camera, caseGroup, left, right, armL, armR, skin, torch, lens, key, face, faceMesh, caps,
    fingerX: CONTROL_X[0], approach: 0, time: null, hit: null };
}

export function warmRecorderRig() {
  if (rig || request || failed || typeof document === 'undefined') return request;
  request = Promise.all([
    new GLTFLoader().loadAsync(assetUrl('assets/field-recorder-rig.glb')),
    loadRecordistHandTemplate(),
  ]).then(async ([asset, template]) => {
    const instance = mountRig(asset, template);
    try { await instance.dither.ready; }
    catch (error) {
      instance.dither.dispose();
      instance.left.dispose();
      instance.right.dispose();
      instance.scene.traverse(part => {
        if (!part.isMesh || part.isSkinnedMesh) return;
        part.geometry.dispose();
        for (const material of [part.material].flat()) material.dispose();
      });
      instance.skin.dispose();
      instance.face.map.dispose();
      instance.caps.forEach(cap => cap.map.dispose());
      instance.renderer.dispose();
      throw error;
    }
    rig = instance;
  }).catch(error => {
    failed = true;
    console.warn('Field recorder model unavailable:', error);
  }).finally(() => { request = null; });
  return request;
}

function paintFace(r, view, layout, paint, cellW, cellH, dpr) {
  const unitX = cellW * dpr, unitY = cellH * dpr;
  const { rect } = view;
  const width = Math.ceil(rect.w * unitX), height = Math.ceil(rect.h * unitY);
  const { canvas, ctx, map } = r.face;
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  try {
    ctx.translate(-rect.x * unitX, -rect.y * unitY);
    uiWithCanvas(ctx, paint);
  } finally { ctx.restore(); }
  for (const [i, cap] of r.caps.entries()) {
    const slot = layout.buttonSlots[i];
    const x = (slot.x - rect.x) * unitX, y = (slot.y - rect.y) * unitY;
    const w = slot.w * unitX, h = slot.h * unitY;
    if (!(w > 0 && h > 0)) continue;
    const tw = Math.ceil(w), th = Math.ceil(h);
    if (cap.canvas.width !== tw || cap.canvas.height !== th) { cap.canvas.width = tw; cap.canvas.height = th; }
    cap.ctx.clearRect(0, 0, tw, th);
    cap.ctx.drawImage(canvas, x, y, w, h, 0, 0, tw, th);
    cap.map.needsUpdate = true;
    // The printed cap positions on the authored face are replaced by the
    // three actual cap meshes. Keep the surrounding bezel opaque.
    ctx.drawImage(canvas, Math.max(0, Math.floor(x - 4)), y, 1, h, x - 1, y - 1, w + 2, h + 2);
  }
  map.needsUpdate = true;
}

export function noteRecorderRigPress(controlId) {
  const index = CONTROL_NAMES.indexOf(controlId.split(':').at(-1));
  if (index < 0) return;
  lastPress?.cancel?.();
  lastPress = { index, controlId, time: performance.now(), from: rig?.fingerX ?? CONTROL_X[index],
    initialApproach: rig?.approach ?? 0, releasedAt: null };
}

export function cancelRecorderRigPress() {
  lastPress?.cancel?.();
  lastPress = null;
}

// STOP can replace the recorder with a confirmation or a sheet. Present
// one frame of physical contact before letting that transition cover it.
export function afterRecorderStopPress(action) {
  const press = lastPress;
  if (!rig?.hit || press?.index !== 1 || rig.renderer.getContext().isContextLost()) return action();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(fallback);
    action();
  };
  const fallback = setTimeout(finish, 280);
  press.onContact = () => requestAnimationFrame(finish);
  press.cancel = () => { done = true; clearTimeout(fallback); };
}

function poseForearm(hand, arm, side) {
  const { position, quaternion } = hand.root;
  const { elbow } = recorderElbow(side, position, quaternion);
  const local = position.clone().sub(elbow).normalize().applyQuaternion(quaternion.clone().invert());
  arm.root.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), local);
  shapeRecordistForearm(THREE, arm);
}

function poseHands(r, view, frame) {
  const now = performance.now();
  const keys = view.buttons?.keys ?? [];
  const latch = keys.map(key => key.latched ? CONTROL_LATCH_TRAVEL : 0);
  const dt = r.time == null ? 1 : Math.max(0, Math.min(.1, (now - r.time) / 1000));
  r.time = now;
  const visible = frame.owner !== 'carry';
  const preferred = keys.findIndex(key => key.selected);
  let index = preferred >= 0 ? preferred : view.recording ? 1 : 0;
  let approach = 0, pressure = 0;
  const press = lastPress;
  if (visible && press) {
    const elapsed = now - press.time;
    const key = keys[press.index];
    const control = sampleControl(press.controlId, { enabled: key?.enabled !== false, latched: key?.latched, now });
    const minDuration = press.initialApproach > 0 && Math.abs(press.from - CONTROL_X[press.index]) > .001 ? 220 : 176;
    if (elapsed >= minDuration && control.travel <= .88 && press.releasedAt == null) press.releasedAt = now;
    const releaseAge = press.releasedAt == null ? 0 : now - press.releasedAt;
    if (releaseAge < 120) {
      index = press.index;
      const motion = recorderKeyMotion(elapsed, { ...press, to: CONTROL_X[index], releaseAge,
        reducedMotion: frame.reducedMotion });
      r.fingerX = motion.x;
      approach = motion.approach;
      pressure = motion.pressure;
    } else lastPress = null;
  } else if (press) lastPress = null;
  if (!lastPress) r.fingerX += (CONTROL_X[index] - r.fingerX) * (frame.reducedMotion ? 1 : 1 - Math.exp(-dt * 29));
  r.approach = approach;
  r.stopContact = index === 1 && approach >= .999 && pressure >= .99;
  r.caps.forEach((cap, i) => {
    cap.root.position.z = CONTROL_Z - RECORDER_KEY_TRAVEL * Math.max(i === index ? pressure : 0, latch[i] || 0);
  });
  r.caseGroup.updateMatrixWorld(true);
  r.skin.userData.handUniforms.handInjury.value = Math.max(0, Math.min(1, (frame.injury || 0) / 3));
  poseRecorderBrace(r.left, r.caseGroup);
  poseForearm(r.left, r.armL, -1);
  r.right.root.visible = visible;
  if (visible) {
    poseRecorderIndex(r.right, r.caseGroup, { x: r.fingerX, approach, travel: Math.max(pressure, latch[index] || 0) });
    poseForearm(r.right, r.armR, 1);
  }
}

export function drawRecorderRig(view, layout, paint) {
  const frame = view.rig;
  if (!frame?.pose || !layout) return false;
  void warmRecorderRig();
  const r = rig;
  if (!r || r.renderer.getContext().isContextLost()) return false;
  let rendered = false;
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const { width, height } = ctx.canvas;
    if (!(width > 0 && height > 0)) return;
    if (r.renderer.domElement.width !== width || r.renderer.domElement.height !== height) {
      r.renderer.setSize(width, height, false);
    }
    r.camera.aspect = width / height;
    r.camera.fov = Math.atan(frame.tanHalfFov || .95) * 360 / Math.PI;
    r.camera.updateProjectionMatrix();
    r.caseGroup.position.set(...frame.pose.position);
    r.caseGroup.rotation.set(...frame.pose.rotation);
    r.torch.visible = frame.torchAttached;
    r.lens.material.emissiveIntensity = Math.max(0, frame.torchPower || 0) * .55;
    r.key.intensity = .60 + Math.max(0, frame.ambient || 0) * 3;
    paintFace(r, view, layout, paint, cellW, cellH, dpr);
    poseHands(r, view, frame);
    const display = frame.display;
    const look = display?.profile;
    // Small legends and VFD dots need some tonal detail after screening.
    const profile = look && { ...look, recording: { ...look.recording, captureMix: look.recording.captureMix * .72 } };
    if (!r.dither.render(r.scene, r.camera, {
      width, height,
      sceneScale: Math.min(1, 1440 / width, 900 / height),
      profile,
      screen: display?.screen,
      cellSize: display?.settings?.cellSize,
      cellScale: dpr,
      screenScale: display?.screenScale ?? dpr,
      snapshot: { clock: performance.now() / 1000,
        reducedMotion: frame.reducedMotion || display?.settings?.reduceMotion,
        reduceFlash: display?.settings?.reduceFlash },
    })) return;
    ctx.drawImage(r.renderer.domElement, 0, 0);
    if (frame.owner !== 'carry' && frame.interactive !== false) {
      // Pointer events use the whole overlay. The faceplate can reserve
      // layout columns for the navigator, but the camera still fills it.
      const { cols, rows } = uiPhysicalSize();
      r.hit = { rect: { ...view.rect }, slots: layout.buttonSlots, cols, rows, owner: frame.owner };
    }
    if (r.stopContact && lastPress?.onContact) {
      const { onContact } = lastPress;
      lastPress.onContact = null;
      onContact();
    }
    rendered = true;
  });
  return rendered;
}

// Convert projected pointer positions back to the instrument's existing cell
// layout. Transport, take rows and guide choices keep their normal handlers.
export function recorderRigPointer(event, owner) {
  const r = rig, hit = r?.hit;
  if (!hit || hit.owner !== owner || !Number.isFinite(event.cellX) || !Number.isFinite(event.cellY)) return event;
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(event.cellX / hit.cols * 2 - 1, 1 - event.cellY / hit.rows * 2), r.camera);
  const cap = ray.intersectObjects(r.caps.map(entry => entry.art), false)[0];
  if (cap) {
    const slot = hit.slots[r.caps.findIndex(entry => entry.art === cap.object)];
    return { ...event, cellX: slot.x + slot.w / 2, cellY: slot.y + slot.h / 2 };
  }
  const face = ray.intersectObject(r.faceMesh, false)[0];
  if (!face) return { ...event, cellX: -1, cellY: -1 };
  const cellX = hit.rect.x + face.uv.x * hit.rect.w;
  const cellY = hit.rect.y + (1 - face.uv.y) * hit.rect.h;
  if (hit.slots.some(slot => cellX >= slot.x && cellX < slot.x + slot.w && cellY >= slot.y && cellY < slot.y + slot.h)) {
    return { ...event, cellX: -1, cellY: -1 };
  }
  return { ...event, cellX, cellY };
}

export function clearRecorderRigPointer() {
  if (rig) rig.hit = null;
}
