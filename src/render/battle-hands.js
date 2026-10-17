import { assetUrl } from '../platform/paths.js';
import { battleHandFraming, battleHandPerformance, battleHandReach } from './battle-hand-performance.js';

// One small transparent view-model render target. The battle scene owns its
// clock and Canvas composition; this module has no independent animation loop.
let current = null, pending = null, unavailable = null;
let generation = 0;
let latestDiagnostics = { ready: false, error: null };
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
let displaySource = null;

// The main scene supplies its live look without coupling this reusable
// view-model to the world renderer or its gameplay state.
export function setBattleHandsDisplaySource(source) {
  displaySource = typeof source === 'function' ? source : null;
}

export function battleHandsDiagnostics() {
  return structuredClone(latestDiagnostics);
}

const skinNoise = `
float handHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float handNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(handHash(i),handHash(i+vec3(1,0,0)),f.x),mix(handHash(i+vec3(0,1,0)),handHash(i+vec3(1,1,0)),f.x),f.y),
mix(mix(handHash(i+vec3(0,0,1)),handHash(i+vec3(1,0,1)),f.x),mix(handHash(i+vec3(0,1,1)),handHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float handJointMark(vec3 p,vec2 joint,float radius){
float across=1.-smoothstep(radius*.55,radius,abs(p.x-joint.x));
float fold=1.-smoothstep(.00024,.00068+fwidth(p.y),abs(p.y-joint.y));return across*fold;}`;

function makeSkin(THREE, { anatomy = true, uniforms = { handInjury: { value: 0 }, handWet: { value: 0 } } } = {}) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#b99180', roughness: .66, metalness: 0,
    specularIntensity: .38, clearcoat: .025, clearcoatRoughness: .48,
    sheen: .08, sheenColor: '#d4a997', side: THREE.FrontSide,
  });
  material.userData.handUniforms = uniforms;
  material.customProgramCacheKey = () => `exposed-recordist-skin-v2-${anatomy}`;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 handRest;varying vec3 handRestNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nhandRest=position;handRestNormal=normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 handRest;varying vec3 handRestNormal;uniform float handInjury;uniform float handWet;\n' + skinNoise)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float handMottle=handNoise(handRest*135.);
        float handFine=handNoise(handRest*1800.);
        float handVein=pow(1.-abs(sin(handRest.y*92.+sin(handRest.z*77.)*1.4)),26.);
        float handAbrasion=smoothstep(.73,.87,handNoise(handRest*300.));
        vec3 handPalm=vec3(handRest.z-.009157,.055775-handRest.y,handRest.x-.039126);
        float handPalmar=smoothstep(.2,.7,handRestNormal.x);
        float handPalmMask=handPalmar*(1.-smoothstep(.077,.091,handPalm.y))*smoothstep(.014,.026,handPalm.y);
        float handHeart=1.-smoothstep(.00022,.00075,abs(handPalm.y-(.070+.16*handPalm.x+handPalm.x*handPalm.x*.3)));
        float handHead=1.-smoothstep(.00020,.00065,abs(handPalm.y-(.050-.28*handPalm.x+handPalm.x*handPalm.x*2.)));
        float handLife=(1.-smoothstep(.00020,.00070,abs(handPalm.x-(-.024+2.8*pow(handPalm.y-.047,2.)))))*(1.-smoothstep(.067,.076,handPalm.y));
        float handFingerFold=max(max(handJointMark(handPalm,vec2(-.02202,.13376),.010),handJointMark(handPalm,vec2(-.02069,.15792),.009)),
          max(handJointMark(handPalm,vec2(.00264,.13812),.011),handJointMark(handPalm,vec2(.00568,.16536),.009)));
        handFingerFold=max(handFingerFold,max(max(handJointMark(handPalm,vec2(.02676,.12632),.010),handJointMark(handPalm,vec2(.03319,.15189),.008)),
          max(handJointMark(handPalm,vec2(.04236,.10741),.008),handJointMark(handPalm,vec2(.04895,.12641),.007))));
        float handCrease=(max(handLife,max(handHeart,handHead))*handPalmMask+handFingerFold*.60)*${anatomy ? '1.' : '0.'};
        handVein*= (1.-handPalmar)*(1.-smoothstep(.090,.13,handPalm.y));
        diffuseColor.rgb*=mix(vec3(.84,.79,.76),vec3(1.04,1.015,.99),handMottle);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.22,.18,.15),handVein*.025);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.31,.075,.052),handAbrasion*handInjury*.34);
        diffuseColor.rgb*=mix(vec3(1.),vec3(1.035,.94,.90),(smoothstep(.095,.17,handPalm.y)*.28+handFingerFold*.14)*${anatomy ? '1.' : '0.'});
        diffuseColor.rgb*=1.-handWet*.055;
        diffuseColor.rgb*=1.-handCrease*.12;
        float handHeight=(handFine-.5)*.000035-handCrease*.00014;
      `)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+handMottle*.08-handWet*.24,.34,.82);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 handDx=dFdx(vViewPosition),handDy=dFdy(vViewPosition);
        vec3 handR1=cross(handDy,normal),handR2=cross(normal,handDx);
        float handDet=dot(handDx,handR1);
        normal=normalize(abs(handDet)*normal-sign(handDet)*(dFdx(handHeight)*handR1+dFdy(handHeight)*handR2)*.30);
      `);
  };
  return material;
}

function addForearm(THREE, rig, material) {
  const root = new THREE.Group(); root.name = 'forearm from wrist'; rig.root.add(root);
  const skin = new THREE.Mesh(new THREE.CylinderGeometry(.0225, .028, .135, 32, 10, true), material);
  const armRings = [];
  const armPositions = skin.geometry.attributes.position;
  for (let i = 0; i < armPositions.count; i++) {
    armRings.push({ t: (.0675 - armPositions.getY(i)) / .135,
      angle: Math.atan2(armPositions.getX(i), armPositions.getZ(i)) });
  }
  root.add(skin);
  const cloth = new THREE.MeshStandardMaterial({ color: '#333b34', roughness: .97, metalness: 0 });
  cloth.customProgramCacheKey = () => 'recordist-cotton-weave-v1';
  cloth.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 clothRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nclothRest=position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 clothRest;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cottonWeave=sin(clothRest.y*3600.)*sin(atan(clothRest.z,clothRest.x)*96.);
        diffuseColor.rgb*=.95+.05*cottonWeave;
      `).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+cottonWeave*.025,.88,1.);');
  };
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.028, .031, .042, 32, 4), cloth);
  cuff.position.set(0, -.150, -.001); cuff.scale.z = .83; root.add(cuff);
  for (let i = 0; i < 5; i++) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(.028, .00055, 4, 32), cloth);
    seam.rotation.x = Math.PI / 2; seam.position.y = -.132 - i * .006;
    seam.scale.y = .83; root.add(seam);
  }
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.030, .053, .45, 40, 8), cloth);
  sleeve.position.set(0, -.396, -.001); sleeve.scale.z = .83; root.add(sleeve);
  root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return { cloth, root, skin, armRings, side: rig.root.name.includes('-left-') ? -1 : 1 };
}

function shapeForearm(THREE, arm) {
  // Preserve the wrist's tangent before joining the sleeve's direction. A
  // straight cylinder turned at the wrist exposes its cap through the hand.
  if (arm.lastShape && Math.abs(arm.lastShape.dot(arm.root.quaternion)) > .99999999) return;
  arm.lastShape = arm.root.quaternion.clone();
  const inverse = arm.root.quaternion.clone().invert();
  const a = new THREE.Vector3(-arm.side * .0011275, .008, .0011345).applyQuaternion(inverse);
  const b = new THREE.Vector3(-arm.side * .0011275, -.027, .0011345).applyQuaternion(inverse);
  const c = new THREE.Vector3(-arm.side * .0011275, -.060, .0011345).applyQuaternion(inverse);
  const curve = new THREE.CubicBezierCurve3(b, c,
    new THREE.Vector3(0, -.090, -.001), new THREE.Vector3(0, -.1325, -.001));
  const position = arm.skin.geometry.attributes.position;
  const firstTangent = new THREE.Vector3(0, -1, 0).applyQuaternion(inverse);
  const firstSide = new THREE.Vector3(1, 0, 0).applyQuaternion(inverse);
  for (let i = 0; i < arm.armRings.length; i++) {
    const { t, angle } = arm.armRings[i];
    const centre = t < .25 ? a.clone().lerp(b, t * 4) : curve.getPoint((t - .25) / .75);
    const tangent = t < .25 ? firstTangent : curve.getTangent((t - .25) / .75).normalize();
    const side = firstSide.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(firstTangent, tangent));
    const depth = new THREE.Vector3().crossVectors(tangent, side).normalize();
    // Bury the first ring inside the scanned wrist. Starting at its exact
    // silhouette exposes a hard cuff-like seam when a defensive arm rises.
    const radius = t < .25 ? .0248 + .0034 * t * 4 : .0282 - .0002 * (t - .25) / .75;
    const depthRadius = t < .25 ? .0168 + .0034 * t * 4 : .0202 + (.028 * .82 - .0202) * (t - .25) / .75;
    centre.addScaledVector(side, Math.sin(angle) * radius)
      .addScaledVector(depth, Math.cos(angle) * depthRadius);
    position.setXYZ(i, centre.x, centre.y, centre.z);
  }
  position.needsUpdate = true;
  arm.skin.geometry.computeVertexNormals();
  arm.skin.geometry.computeBoundingSphere();
}

export function warmBattleHands() {
  if (current || pending || unavailable || typeof document === 'undefined') return pending;
  const version = generation;
  pending = (async () => {
    const [THREE, rigs, tools, { RoomEnvironment }, { createTransparentPixelMesh }] = await Promise.all([
      import('three'), import('./battle-hand-rig.js'), import('./battle-hand-tools.js'),
      import('three/addons/environments/RoomEnvironment.js'),
      import('./pixel-mesh/transparent.js'),
    ]);
    await tools.warmBattleHandToolLettering({ assetUrl });
    const template = await rigs.loadBattleHandTemplate(assetUrl('assets/battle-hands/right.glb'));
    if (version !== generation) return null;
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true,
      preserveDrawingBuffer: true, powerPreference: 'low-power', premultipliedAlpha: true });
    renderer.setClearColor(0x000000, 0); renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Expose for the recording curve, whose middle tones carry the anatomy.
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .24;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    // Broad room reflections give skin, worn steel and glass the same light
    // source. The environment is baked once, rather than sampled every frame.
    const makeEnvironment = () => {
      const room = new RoomEnvironment(), generator = new THREE.PMREMGenerator(renderer);
      try { return generator.fromScene(room, .04); }
      finally { room.dispose(); generator.dispose(); }
    };
    const environment = makeEnvironment();
    scene.environment = environment.texture; scene.environmentIntensity = .16;
    const camera = new THREE.OrthographicCamera(-.5, .5, .17, -.17, .01, 5);
    camera.position.set(0, 0, 1.8); camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight('#d5ddcf', '#2c2220', .32));
    const key = new THREE.DirectionalLight('#fff0dc', 2.7); key.position.set(-.45, .8, 1); scene.add(key);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -.8, right: .8, top: .5, bottom: -.5, near: .1, far: 3 });
    key.shadow.bias = -.00012; key.shadow.normalBias = .00045; key.shadow.radius = 2;
    const rim = new THREE.DirectionalLight('#a7c6cd', .85); rim.position.set(.4, .4, -.6); scene.add(rim);
    const fill = new THREE.DirectionalLight('#c2d3bd', .15); fill.position.set(.4, .1, .8); scene.add(fill);
    const skin = makeSkin(THREE);
    const left = rigs.createBattleHandRig(template, { side: 'left', material: skin });
    const right = rigs.createBattleHandRig(template, { side: 'right', material: skin });
    scene.add(left.root, right.root);
    const armSkin = makeSkin(THREE, { anatomy: false, uniforms: skin.userData.handUniforms });
    const leftArm = addForearm(THREE, left, armSkin), rightArm = addForearm(THREE, right, armSkin);
    const cloth = [leftArm.cloth, rightArm.cloth];
    const dither = createTransparentPixelMesh(THREE, renderer, { assetUrl, profile: 'battle' });
    const instance = { THREE, renderer, canvas, scene, camera, skin, left, right, tools,
      leftArm, rightArm, cloth, environment, dither, toolCache: new Map(), held: null, cosmetics: '', contextLost: false };
    // Do not expose an undithered loading frame while the acquisition mask is
    // still decoding. The existing embodied fallback remains available.
    try { await dither.ready; }
    catch (error) { releaseHandResources(instance); throw error; }
    if (version !== generation) {
      releaseHandResources(instance);
      return null;
    }
    current = instance;
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); instance.contextLost = true;
      if (current === instance) latestDiagnostics = { ready: false, error: 'Battle hand GPU context lost' };
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (current !== instance) return;
      instance.environment.dispose(); instance.environment = makeEnvironment();
      scene.environment = instance.environment.texture; instance.contextLost = false;
    });
    latestDiagnostics = { ready: true, error: null };
    return current;
  })().catch(error => {
    if (version !== generation) return;
    unavailable = String(error?.message || error);
    latestDiagnostics = { ready: false, error: unavailable };
    console.warn('Battle hands unavailable:', unavailable);
  }).finally(() => { if (version === generation) pending = null; });
  return pending;
}

function targetWorld(THREE, group, contact) {
  const position = contact.position?.isVector3 ? contact.position.clone() : new THREE.Vector3(...contact.position);
  const normal = contact.normal?.isVector3 ? contact.normal.clone() : new THREE.Vector3(...(contact.normal || [0, 0, 1]));
  return { ...contact, position: group.localToWorld(position), normal: normal.transformDirection(group.matrixWorld) };
}

const digits = ['index', 'middle', 'ring', 'pinky', 'thumb'];
function blendPose(a, b, amount) {
  const mix = (x, y) => (x || 0) + ((y || 0) - (x || 0)) * amount;
  return {
    ...Object.fromEntries(digits.filter(name => name !== 'thumb').map(name => [name,
      (a[name] || [0, 0, 0]).map((v, i) => mix(v, b[name]?.[i]))])),
    thumb: Object.fromEntries(['opposition', 'abduction', 'mcp', 'ip'].map(key => [key, mix(a.thumb?.[key], b.thumb?.[key])])),
    spread: Object.fromEntries(digits.filter(name => name !== 'thumb').map(name => [name, mix(a.spread?.[name], b.spread?.[name])])),
  };
}

function applyTool(s, id, cosmetics) {
  const key = JSON.stringify(cosmetics || {});
  if (key !== s.cosmetics) {
    s.right.root.removeFromParent(); s.scene.add(s.right.root);
    for (const tool of s.toolCache.values()) { tool.group.removeFromParent(); tool.dispose?.(); }
    s.toolCache.clear(); s.held = null; s.cosmetics = key;
  }
  let tool = s.toolCache.get(id);
  if (!tool) {
    tool = s.tools.buildBattleHandTool(id, cosmetics || {});
    s.toolCache.set(id, tool); s.scene.add(tool.group);
  }
  for (const other of s.toolCache.values()) other.group.visible = other === tool;
  if (s.held !== tool) {
    s.right.root.removeFromParent(); tool.group.add(s.right.root);
    const grip = tool.contacts?.right;
    if (grip) {
      s.right.setRootPose(grip.wrist);
      s.rightArm.root.rotation.set(...(grip.forearmRotation || [0, 0, 0]));
      s.right.setFingerPose(grip.pose || { index: [.7, .9, .55], middle: [.8, 1, .6], ring: [.85, 1.05, .65],
        pinky: [.9, 1.1, .7], thumb: { opposition: .6, abduction: .25, mcp: .35, ip: .3 } });
      tool.group.updateMatrixWorld(true);
      const contacts = Object.fromEntries(Object.entries(grip).filter(([name, target]) => digits.includes(name) && target)
        .map(([name, target]) => [name, targetWorld(s.THREE, tool.group, target)]));
      // The bake is checked against every skinned vertex. A fresh IK solution
      // can reach the same pad by bending a knuckle through the housing.
      if (grip.pose) s.right.measureGrip(contacts);
      else s.right.solveGrip(contacts, { space: 'world', iterations: 60, normalWeight: .001 });
    } else {
      s.rightArm.root.rotation.set(0, 0, 0);
      s.right.setRootPose({ position: [.015, -.12, .025], rotation: [-.18, -.24, .13] });
      s.right.setFingerPose({ index: [.18, .16, .1], middle: [.21, .19, .12], ring: [.25, .23, .15],
        pinky: [.30, .26, .18], spread: { index: 0, middle: 0, ring: 0, pinky: 0 },
        thumb: { opposition: .25, abduction: .18, mcp: .18, ip: .12 } });
    }
    tool.rightPose = s.right.getPose();
    tool.controlPoses = new Map();
    s.held = tool;
  }
  return tool;
}

function paint(s, { width, height, left, right, display, screenOffset, pixelRatio, ...frame }) {
  const { THREE } = s;
  const framing = battleHandFraming({ width, height, left, right });
  const performance = battleHandPerformance(frame);
  const tool = applyTool(s, frame.tool || 'self', frame.cosmetics);
  s.camera.left = -framing.halfWidth; s.camera.right = framing.halfWidth;
  s.camera.top = framing.extent / 2; s.camera.bottom = -framing.extent / 2; s.camera.updateProjectionMatrix();
  const toolPosition = framing.tool.map((v, i) => v + performance.toolOffset[i]);
  tool.group.position.set(...toolPosition);
  tool.group.rotation.set(-.045 + performance.operation * .025 + performance.toolRotation[0],
    -.08 + performance.toolRotation[1], -.025 + performance.toolRotation[2]);
  const restingToolRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-.045, -.08, -.025));
  if (performance.handling === 'strike') {
    tool.group.rotation.z += (performance.prepare * .32 - performance.operation * .95) * performance.travel;
    tool.group.rotation.x -= performance.operation * .32 * performance.travel;
    tool.group.position.x -= performance.operation * .055 * performance.travel;
    tool.group.position.z -= performance.operation * .065 * performance.travel;
  } else if (performance.handling === 'drink') {
    tool.group.position.y += performance.operation * .055 * performance.travel;
    tool.group.position.z += performance.operation * .06 * performance.travel;
    tool.group.rotation.x += performance.operation * .42 * performance.travel;
  }
  if (tool.contacts?.right) {
    const wrist = s.right.root.quaternion;
    const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(tool.contacts.right.forearmRotation || [0, 0, 0])));
    // The hand can tilt an item without swinging the entire sleeve toward the
    // camera. Keep that wrist flexion bounded; larger strikes carry the arm.
    const compensation = wrist.clone().invert()
      .multiply(tool.group.quaternion.clone().invert()).multiply(restingToolRotation)
      .multiply(wrist);
    const angle = compensation.angleTo(new THREE.Quaternion());
    if (angle > .45) compensation.identity().slerp(wrist.clone().invert()
      .multiply(tool.group.quaternion.clone().invert()).multiply(restingToolRotation).multiply(wrist), .45 / angle);
    s.rightArm.root.quaternion.copy(compensation).multiply(base);
  }
  tool.update?.({ ...frame, action: frame.move, progress: performance.rawProgress,
    controlPressure: performance.operation, active: frame.actionActor === 'player',
    now: frame.now ?? frame.time, readout: frame.readout });
  const leftPosition = framing.leftWrist.map((v, i) => v + performance.leftOffset[i]);
  const leftRotation = [...performance.leftRotation];
  s.leftArm.root.quaternion.identity();
  s.left.setRootPose({ position: leftPosition, rotation: leftRotation });
  s.left.setFingerPose({ ...performance.leftFingers, thumb: performance.thumb,
    spread: performance.spread });
  if (!tool.contacts?.right) {
    s.right.setRootPose({
      position: [.015 + performance.flinch * .01,
        -.12 + performance.leftOffset[1], .025 + performance.leftOffset[2]],
      rotation: [leftRotation[0], -leftRotation[1], -leftRotation[2]],
    });
    s.right.setFingerPose({ ...performance.leftFingers, thumb: performance.thumb, spread: performance.spread });
  }
  const control = tool.controls?.[performance.control] || tool.controls?.rec || tool.controls?.trigger || tool.controls?.tune;
  let controlDiagnostic = null;
  if (control?.hand === 'right' && tool.contacts?.right) {
    tool.group.updateMatrixWorld(true);
    const digit = control.digit || 'thumb';
    let cached = control.pressedPose ? { pose: { ...tool.rightPose, ...control.pressedPose } } : tool.controlPoses.get(control);
    if (!cached) {
      s.right.setFingerPose(tool.rightPose);
      s.right.solveGrip({ [digit]: targetWorld(THREE, tool.group, control) }, { space: 'world', iterations: 60, normalWeight: .001 });
      cached = { pose: s.right.getPose(), diagnostics: s.right.getContactDiagnostics() };
      tool.controlPoses.set(control, cached);
    }
    s.right.setFingerPose(blendPose(tool.rightPose, cached.pose, performance.operation));
    if (performance.operation > .001) controlDiagnostic = s.right.measureGrip({ [digit]: targetWorld(THREE, tool.group, control) });
  } else if (control && performance.operation > .001 && !['strike', 'drink', 'breathe', 'voice'].includes(performance.handling)) {
    tool.group.updateMatrixWorld(true);
    const target = targetWorld(THREE, tool.group, control);
    // Approach comes from below the instrument. A distinct wrist pose turns
    // the palm toward the faceplate so the finger pad, not the nail, presses it.
    const wrist = control.wrist || { position: [control.position[0] + .0192081204, control.position[1] - .1651841897, control.position[2] - .0117778801], quaternion: [-4.3e-19, .9999616055, -.0070302226, -.0052310036] };
    const wristPosition = tool.group.localToWorld(new THREE.Vector3(...wrist.position));
    const localQ = wrist.quaternion ? new THREE.Quaternion(...wrist.quaternion)
      : new THREE.Quaternion().setFromEuler(new THREE.Euler(...wrist.rotation));
    const to = tool.group.getWorldQuaternion(new THREE.Quaternion()).multiply(localQ);
    const initialPose = s.left.getPose();
    let cached = tool.controlPoses.get(control);
    if (!cached) {
      s.left.setRootPose({ position: wristPosition.toArray(), quaternion: to });
      s.left.setFingerPose(control.pose || { index: [-.10, .02, .01], middle: [.85, 1.25, .75], ring: [.9, 1.3, .8],
        pinky: [.95, 1.35, .85], spread: { index: 0, middle: 0, ring: .02, pinky: .04 },
        thumb: { opposition: .6, abduction: .15, mcp: .5, ip: .3 } });
      if (control.pose) s.left.measureGrip({ index: target });
      else s.left.solveGrip({ index: target }, { space: 'world', iterations: 60, normalWeight: .001 });
      cached = { pose: s.left.getPose(), diagnostics: s.left.getContactDiagnostics() };
      tool.controlPoses.set(control, cached);
    }
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...leftRotation)).slerp(to, performance.operation);
    const position = new THREE.Vector3(...leftPosition).lerp(wristPosition, performance.operation);
    // Reach around the gripping hand on the camera side, tucking the spare
    // digits before the index enters the controls. Endpoints stay planted.
    const reach = battleHandReach(performance.operation);
    position.z += reach.cameraArc;
    s.left.setRootPose({ position: position.toArray(), quaternion: rotation });
    s.left.setFingerPose(blendPose(initialPose, cached.pose, reach.closure));
    if (performance.operation > .99) controlDiagnostic = s.left.measureGrip({ index: target });
  }
  s.skin.userData.handUniforms.handInjury.value = performance.injury / 3;
  s.skin.userData.handUniforms.handWet.value = clamp(frame.wet);
  for (const cloth of s.cloth) cloth.color.set(frame.wet > .3 ? '#252e29' : '#333b34');
  shapeForearm(THREE, s.leftArm); shapeForearm(THREE, s.rightArm);
  s.scene.updateMatrixWorld(true);
  const displaySettings = display?.settings || {};
  s.dither.render(s.scene, s.camera, {
    width, height, dpr: 1,
    sceneScale: Math.min(1, 1280 / width, 640 / height),
    profile: display?.profile || 'battle', screen: display?.screen,
    cellSize: displaySettings.cellSize || 'auto',
    cellScale: pixelRatio,
    screenScale: display?.screenScale ?? pixelRatio,
    screenOffset,
    snapshot: { clock: frame.now ?? frame.time,
      reducedMotion: frame.reducedMotion || displaySettings.reduceMotion,
      reduceFlash: frame.reduceFlash || displaySettings.reduceFlash },
  });
  const grip = tool.contacts?.right;
  const contacts = Object.fromEntries(Object.entries(grip || {}).filter(([name, target]) => digits.includes(name) && target
    && !(control?.hand === 'right' && name === (control.digit || 'thumb') && performance.operation > .001))
    .map(([name, target]) => [name, targetWorld(THREE, tool.group, target)]));
  latestDiagnostics = { ready: true, error: null, tool: frame.tool || 'self', move: frame.move || null,
    rawProgress: performance.rawProgress, injury: frame.injury, reducedMotion: !!frame.reducedMotion,
    viewport: { width, height }, display: s.dither.debug(),
    grip: s.right.measureGrip(contacts), control: controlDiagnostic };
}

/** Returns false while loading or if this device cannot create the view-model
 * context. Caller retains its existing defensive fallback in that case. */
export function drawBattleHands3D({ ctx, x = 0, y = 0, width, height, pixelRatio = 1, display, ...frame } = {}) {
  if (!ctx || !(width > 0) || !(height > 0)) return false;
  warmBattleHands();
  if (!current || unavailable || current.contextLost || current.renderer.getContext().isContextLost()) return false;
  const s = current;
  // Keep acquisition at the destination's physical resolution. Only the PBR
  // source is capped; resampling screened marks would create grey fringes.
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  if (s.canvas.width !== w || s.canvas.height !== h) s.renderer.setSize(w, h, false);
  try { paint(s, { width: w, height: h, ...frame, pixelRatio,
    display: display || displaySource?.(),
    screenOffset: [Math.round(x), Math.round((ctx.canvas?.height || height) - y - height)],
  }); }
  catch (error) {
    unavailable = String(error?.message || error);
    latestDiagnostics = { ready: false, error: unavailable };
    console.warn('Battle hands unavailable:', unavailable);
    return false;
  }
  ctx.save();
  try { ctx.imageSmoothingEnabled = false; ctx.drawImage(s.canvas, Math.round(x), Math.round(y), w, h); }
  finally { ctx.restore(); }
  return true;
}

export function disposeBattleHands() {
  generation++; pending = null; unavailable = null;
  if (!current) return;
  const s = current; current = null;
  releaseHandResources(s);
  latestDiagnostics = { ready: false, error: null };
}

function releaseHandResources(s) {
  s.right.root.removeFromParent(); s.scene.add(s.right.root);
  for (const tool of s.toolCache.values()) tool.dispose?.();
  const geometries = new Set(), materials = new Set();
  s.scene.traverse(object => {
    object.shadow?.dispose?.();
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat()) if (material) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
  s.left.dispose(); s.right.dispose();
  s.environment.dispose();
  s.dither.dispose();
  s.renderer.dispose();
}
