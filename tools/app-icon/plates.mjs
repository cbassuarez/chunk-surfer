// Plate study. Attaches to the approved renderer's own scene, camera and game
// acquisition at runtime; renderer.mjs and acquisition.mjs stay byte-identical
// so the shipped icon's provenance remains valid until an option is chosen.
// Every plate is real geometry inside the scene and passes through the same
// shader as the van. Nothing here composites a raster over a raster.
import * as THREE from 'three';

// Apple's macOS grid: a 1024 canvas with an 824 body. The continuous corner is
// approximated by a superellipse (n = 5), which is close at icon sizes.
export const ICON_BODY = Object.freeze({ canvas: 1024, body: 824, exponent: 5 });
const BODY = ICON_BODY.body / ICON_BODY.canvas;

export const PLATE_OPTIONS = Object.freeze({
  street: Object.freeze({
    label: 'A · Street tile',
    summary: 'The van parked on wet night asphalt that fills the macOS body. The road is the plate.',
    zoom: 1.25, mask: 'squircle', ground: { color: 0x2c3238, roughness: .7, metalness: 0 }, backdrop: null,
  }),
  sodium: Object.freeze({
    label: 'B · Sodium backdrop',
    summary: 'A flat amber streetlight wall behind the van. Ivory enamel against warm colour; shadow and puddles stay physical.',
    zoom: 1.25, mask: 'squircle', ground: null, backdrop: { top: 0xb8742c, bottom: 0x6b3a17 },
  }),
  puddle: Object.freeze({
    label: 'C · Puddle medallion',
    summary: 'No square plate. A round island of wet ground under the van; outside it stays transparent.',
    zoom: 1.3, mask: 'circle', ground: { color: 0x282e34, roughness: .6, metalness: 0 }, backdrop: null,
  }),
  refit: Object.freeze({
    label: 'D · Transparent, refit',
    summary: 'Today’s transparent van with the lost camera zoom restored and the van filling the canvas.',
    zoom: 1.35, mask: 'none', ground: null, backdrop: null,
  }),
});

// THE LIT M62. The van is stopped on the hard shoulder under a sodium column.
// Geometry in metres, van at the origin facing -Z, carriageway on the camera
// side (+X). Markings follow the Traffic Signs Manual ch. 5 motorway set:
// 200 mm continuous edge line (1012.1) with red studs, 150 mm lane line of
// 2 m marks and 7 m gaps (1005.1). Lamp colour is the game's own sodium
// (m62-scene.js: [1, .64, .3]).
export const M62_ROAD = Object.freeze({
  asphalt: 0x50504e, shoulder: 0x464644, paint: 0xf1ecda, verge: 0x3c4a30, sodium: [1, .64, .3],
  edgeLineX: 1.55, edgeLineM: .2, laneLineX: 5.2, laneLineM: .15, laneMarkM: 2, laneGapM: 7, lanePhaseZ: .6,
  shoulderLeftX: -1.75, studEveryM: 9,
  // The column stands in the central reserve, behind the camera's shoulder.
  lamp: Object.freeze({ x: 6.5, y: 10, z: 5.5, intensity: 5.5 }), night: Object.freeze({ hemisphere: .5, key: 0, rim: .55, fill: .25 }),
});
const m62 = (label, summary, extra) => Object.freeze({ label, summary, road: true, ground: null, backdrop: null, ...extra });
const FIT = 1.25, B = ICON_BODY.body / ICON_BODY.canvas;
export const M62_OPTIONS = Object.freeze({
  'm62-squircle': m62('Apple body · 824/1024 squircle', 'Road cut to the classic macOS body, drawn into the art.', { zoom: FIT, mask: 'squircle', body: B }),
  'm62-bleed': m62('Full-bleed square', 'The whole square is road. The system (macOS 26) or the store (Steam) does any masking.', { zoom: FIT / B, mask: 'none', body: 1 }),
  'm62-tile': m62('Soft square tile', 'A lightly rounded square that nearly fills the canvas.', { zoom: FIT / B * .92, mask: 'roundrect', body: .92, radius: .16 }),
  'm62-roundel': m62('Lamp-pool roundel', 'A round island of lit road, like the pool under one column.', { zoom: FIT / B * .82, mask: 'circle', body: .94 }),
  'm62-chunk': m62('Road chunk', 'A lifted slab of the carriageway with a cut face. Free silhouette, transparent around it.', { zoom: 1.12, mask: 'none', body: 1, slab: { x0: -1.75, x1: 2.3, z0: -3.0, z1: 3.1, depth: .55 }, shift: [.21, -.53] }),
});

// Capture the approved renderer's scene and camera as it constructs them.
const capture = { scene: null, camera: null };
const add = THREE.Scene.prototype.add;
THREE.Scene.prototype.add = function (...objects) {
  if (!capture.scene) capture.scene = this;
  return add.apply(this, objects);
};
const lookAt = THREE.OrthographicCamera.prototype.lookAt;
THREE.OrthographicCamera.prototype.lookAt = function (...args) {
  if (!capture.camera) capture.camera = this;
  return lookAt.apply(this, args);
};

// One clip mask for every material in the scene, in final output pixels.
const maskUniforms = { uIconSize: { value: 1024 }, uIconMask: { value: 0 }, uIconBody: { value: BODY }, uIconRadius: { value: .2 } };
const MASK_GLSL = `
uniform float uIconSize;uniform float uIconMask;uniform float uIconBody;uniform float uIconRadius;
void iconBodyMask(){
  if(uIconMask<.5)return;
  vec2 p=abs(gl_FragCoord.xy/uIconSize*2.-1.)/uIconBody;
  if(uIconMask>2.5){vec2 q=p-(1.-uIconRadius);if(length(max(q,0.))+min(max(q.x,q.y),0.)>uIconRadius)discard;return;}
  float d=uIconMask<1.5?pow(p.x,${ICON_BODY.exponent}.)+pow(p.y,${ICON_BODY.exponent}.):dot(p,p);
  if(d>1.)discard;
}
`;
const masked = new WeakSet();
function maskMaterial(material) {
  if (!material || masked.has(material)) return;
  masked.add(material);
  const previous = material.onBeforeCompile, previousKey = material.customProgramCacheKey?.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, maskUniforms);
    shader.fragmentShader = MASK_GLSL + shader.fragmentShader.replace(/void main\(\)\s*\{/, 'void main(){\n iconBodyMask();');
  };
  material.customProgramCacheKey = () => `${previousKey ? previousKey() : ''}|icon-body-mask-v2`;
  material.needsUpdate = true;
}

function superellipse(radius, n, segments = 256) {
  const shape = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const a = i / segments * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const x = Math.sign(c) * Math.abs(c) ** (2 / n) * radius, y = Math.sign(s) * Math.abs(s) ** (2 / n) * radius;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  return new THREE.ShapeGeometry(shape, 1);
}

export async function attachPlateStudy() {
  await import('./renderer.mjs');
  const study = window.__vanIconStudy;
  if (!study?.ready || !capture.scene || !capture.camera) throw Error('The approved renderer did not expose its scene and camera.');
  const { scene, camera } = capture;
  const approvedZoom = camera.zoom, approvedProjection = camera.projectionMatrix.clone();
  scene.traverse(object => {
    for (const material of [object.material].flat()) maskMaterial(material);
  });
  // The shadow receiver marks the measured ground height.
  let groundY = 0;
  scene.traverse(object => { if (object.material?.isShadowMaterial) groundY = object.position.y; });
  const added = new THREE.Group(); added.name = 'icon plate study'; scene.add(added);
  if (!camera.parent) scene.add(camera);
  const backdropHolder = new THREE.Group(); camera.add(backdropHolder);
  let current = null;
  // The approved daylight rig, remembered so the night road can dim and restore it.
  const rig = { hemisphere: null, directional: [], shadowReceiver: null };
  scene.traverse(object => {
    if (object.isHemisphereLight) rig.hemisphere = object;
    if (object.isDirectionalLight && object.intensity > 0) rig.directional.push(object);
    if (object.material?.isShadowMaterial) rig.shadowReceiver = object;
  });
  const dayLevels = { hemisphere: rig.hemisphere.intensity, directional: rig.directional.map(light => light.intensity), castShadow: rig.directional.map(light => light.castShadow) };
  const baseProjection = { left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom };

  function buildRoad(option) {
    const R = M62_ROAD, y = groundY - .012, slab = option.slab;
    const span = slab ? { x0: slab.x0, x1: slab.x1, z0: slab.z0, z1: slab.z1 } : { x0: -40, x1: 40, z0: -60, z1: 60 };
    const flat = (x0, x1, z0, z1, lift, material) => {
      x0 = Math.max(x0, span.x0); x1 = Math.min(x1, span.x1); z0 = Math.max(z0, span.z0); z1 = Math.min(z1, span.z1);
      if (x1 <= x0 || z1 <= z0) return;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material);
      mesh.rotation.x = -Math.PI / 2; mesh.position.set((x0 + x1) / 2, y + lift, (z0 + z1) / 2); mesh.receiveShadow = true; added.add(mesh);
    };
    const standard = (name, color, roughness, extra = {}) => { const material = new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, ...extra }); maskMaterial(material); return material; };
    const asphalt = standard('m62 running lane asphalt', R.asphalt, .62), shoulder = standard('m62 hard shoulder asphalt', R.shoulder, .7),
      paint = standard('m62 thermoplastic line', R.paint, .5), verge = standard('m62 verge', R.verge, .95),
      stud = standard('m62 red stud', 0xc02a1c, .35, { emissive: 0xc02a1c, emissiveIntensity: .5 });
    flat(R.edgeLineX, 100, -100, 100, 0, asphalt);
    flat(R.shoulderLeftX, R.edgeLineX, -100, 100, 0, shoulder);
    flat(-100, R.shoulderLeftX, -100, 100, 0, verge);
    flat(R.edgeLineX - R.edgeLineM / 2, R.edgeLineX + R.edgeLineM / 2, -100, 100, .004, paint);
    const period = R.laneMarkM + R.laneGapM;
    for (let z = R.lanePhaseZ - period * 8; z < 70; z += period) flat(R.laneLineX - R.laneLineM / 2, R.laneLineX + R.laneLineM / 2, z, z + R.laneMarkM, .004, paint);
    for (let z = -R.studEveryM * 6 + 1.2; z < 60; z += R.studEveryM) flat(R.edgeLineX + .16, R.edgeLineX + .26, z, z + .1, .006, stud);
    if (slab) {
      // The cut faces: surfacing over a darker base, as a core would show it.
      const w = slab.x1 - slab.x0, l = slab.z1 - slab.z0;
      const face = (width, depth, top, material, px, pz, ry) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material); mesh.position.set(px, y - top - depth / 2, pz); mesh.rotation.y = ry; added.add(mesh); };
      const course = standard('m62 chunk surface course', 0x1d1e21, .8), base = standard('m62 chunk sub-base', 0x8a7a62, .95);
      for (const [width, px, pz, ry] of [[w, (slab.x0 + slab.x1) / 2, slab.z1, 0], [l, slab.x1, (slab.z0 + slab.z1) / 2, Math.PI / 2]]) {
        face(width, slab.depth * .34, 0, course, px, pz, ry); face(width, slab.depth * .66, slab.depth * .34, base, px, pz, ry);
      }
    }
    const [r, g, b] = R.sodium, lamp = new THREE.SpotLight(new THREE.Color(r, g, b), R.lamp.intensity, 0, .95, .9, 0);
    lamp.name = 'm62 sodium column'; lamp.position.set(R.lamp.x, R.lamp.y, R.lamp.z); lamp.target.position.set(-.3, 0, -.6);
    lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048); lamp.shadow.bias = -.0002; lamp.shadow.normalBias = .03; lamp.shadow.camera.near = 2; lamp.shadow.camera.far = 30;
    added.add(lamp, lamp.target);
  }

  function select(name) {
    const option = PLATE_OPTIONS[name] || M62_OPTIONS[name];
    if (!option) throw Error(`Unknown plate option ${name}`);
    for (const group of [added, backdropHolder]) for (const child of [...group.children]) {
      group.remove(child); child.geometry?.dispose(); child.material?.dispose();
    }
    // Lands the zoom that line 98 of renderer.mjs intended, then the option's fit.
    const [sx, sy] = option.shift || [0, 0];
    Object.assign(camera, { left: baseProjection.left + sx, right: baseProjection.right + sx, top: baseProjection.top + sy, bottom: baseProjection.bottom + sy });
    camera.zoom = option.zoom; camera.updateProjectionMatrix();
    maskUniforms.uIconMask.value = { squircle: 1, circle: 2, roundrect: 3 }[option.mask] || 0;
    maskUniforms.uIconBody.value = option.body ?? BODY; maskUniforms.uIconRadius.value = option.radius ?? .2;
    const night = option.road ? M62_ROAD.night : null;
    rig.hemisphere.intensity = night ? night.hemisphere : dayLevels.hemisphere;
    rig.directional.forEach((light, i) => {
      light.intensity = night ? [night.key, night.rim, night.fill][i] ?? 0 : dayLevels.directional[i];
      light.castShadow = night ? false : dayLevels.castShadow[i];
    });
    if (rig.shadowReceiver) rig.shadowReceiver.visible = !option.road;
    if (option.road) buildRoad(option);
    if (option.ground) {
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({
        name: 'icon plate wet asphalt', ...option.ground }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = groundY - .012; ground.receiveShadow = true;
      maskMaterial(ground.material); added.add(ground);
    }
    if (option.backdrop) {
      // Camera-facing, behind everything, sized to the view and cut to the body.
      const half = (camera.right - camera.left) / 2 / camera.zoom;
      const geometry = superellipse(half * BODY, ICON_BODY.exponent);
      const colors = [], top = new THREE.Color(option.backdrop.top), bottom = new THREE.Color(option.backdrop.bottom);
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const c = bottom.clone().lerp(top, (position.getY(i) / half + 1) / 2); colors.push(c.r, c.g, c.b);
      }
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const plate = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ name: 'icon plate sodium backdrop', vertexColors: true, depthWrite: false }));
      plate.position.z = -(camera.far - 1); plate.renderOrder = -1; maskMaterial(plate.material); backdropHolder.add(plate);
    }
    current = name;
    return option;
  }

  // The mask is in output pixels, so it follows whatever target the scene is drawn
  // into. This also covers callers that use the approved renderer's own entry points.
  const size = new THREE.Vector2();
  scene.onBeforeRender = (renderer, _scene, _camera, target) => {
    maskUniforms.uIconSize.value = target ? target.width : renderer.getDrawingBufferSize(size).x;
  };
  const renderAt = study.renderAt;
  const sized = (time, options = {}) => { maskUniforms.uIconSize.value = options.size || 1024; return renderAt(time, options); };
  window.__vanPlateStudy = {
    ready: true, options: { ...PLATE_OPTIONS, ...M62_OPTIONS }, body: ICON_BODY, select, current: () => current,
    approved: { zoomField: approvedZoom, projectionScale: approvedProjection.elements[0] * (camera.right - camera.left) / 2 },
    frame(time, size) { sized(time, { size }); return study.canvas.toDataURL('image/png'); },
    acquisition: study.acquisition, launch: study.launch,
  };
  return window.__vanPlateStudy;
}
