// One scene-local renderer for the entire shelf. The objects are independent
// GLBs, not portraits or painted placeholders. No animation loop is installed:
// the owning scene supplies time and releases every GPU resource on exit.
import { uiDraw, uiCellMetrics } from './ui.js';
import { assetUrl } from '../platform/paths.js';
import { vanKitModel } from '../data/van-kit-models.js';
import { itemPortrait } from '../data/item-portraits.js';
import { drawRecorderReadoutCanvas } from './recorder-instrument.js';
import { applyWitnessModelAppearance } from './witness-model.js';
import { workbenchCatalog, workbenchFocusKey, workbenchTargetMetadata, WORKBENCH_TRAYS } from '../data/workbench-catalog.js';
import { FLASHLIGHT_HOUSING_COLORS } from '../game/field-kit.js';

export function vanWorkbenchModelIds(kit = {}) {
  return { case: 'field-case', headphones: `headphones-${kit.headphones || 'reference'}`,
    microphone: `microphone-${kit.microphone || 'reference'}`, amp: `amp-${kit.recorder || 'reference'}`,
    recorder: kit.cosmetics?.faceplate==='witness'?'field-recorder-witness':'field-recorder',
    flashlight: `flashlight-${kit.flashlight || 'reference'}`, map: 'map', radio: 'radio', light: 'light' };
}
export function vanWorkbenchSelectedObject(group) {
  return ['faceplate', 'buttons', 'vfd'].includes(group) ? 'recorder' : group === 'recorder' ? 'amp' : group === 'flashlightHousing' ? 'flashlight' : group;
}
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
// The authored field-recorder plane retains Three's top=v1 UV convention.
export const VAN_RECORDER_CANVAS_FLIP_Y = true;
export function clipStageTarget(rect, viewport) {
  const x = clamp(rect.x, viewport.x, viewport.x + viewport.w), y = clamp(rect.y, viewport.y, viewport.y + viewport.h);
  return { x, y, w: Math.max(0, Math.min(rect.x + rect.w, viewport.x + viewport.w) - x),
    h: Math.max(0, Math.min(rect.y + rect.h, viewport.y + viewport.h) - y) };
}

export function createVanWorkbenchStage() {
  let THREE, renderer, camera, scene, loader, disposed = false, initializing = null, lastRender = -Infinity;
  let viewport = null, frameKey = '', dirty = true, suspended = false, error = '', renderCount = 0;
  let shelfFrame = null, detailFrame = null, detailKey = '', detailScene = null, detailCamera = null;
  let currentIds = {}, currentSelected = '', appearance = '', shiftKey = '', paper = null, liveState = {}, catalogue = [];
  let caseOpen = null, flashlightAppearance = '';
  const assets = new Map(), pending = new Map(), failed = new Set(), placed = new Map(), projected = new Map();
  const ownedGeometries = new Set(), ownedMaterials = new Set(), ownedTextures = new Set();
  const ownedTargets = new Set();
  const witnessAppearances = new Map();
  const halos = new Map();
  const vec = () => new THREE.Vector3();
  function own(root) {
    root.traverse(node => {
      if (!node.isMesh) return;
      ownedGeometries.add(node.geometry); node.castShadow = true; node.receiveShadow = true;
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        ownedMaterials.add(mat);
        for (const value of Object.values(mat)) if (value?.isTexture) ownedTextures.add(value);
      }
    }); return root;
  }
  const mat = options => { const value = new THREE.MeshStandardMaterial(options); ownedMaterials.add(value); return value; };
  function mesh(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    ownedGeometries.add(geometry); const value = new THREE.Mesh(geometry, material);
    value.position.set(...position); value.rotation.set(...rotation); value.receiveShadow = true;
    scene.add(value); return value;
  }
  function texture(width, height, draw) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const value = new THREE.CanvasTexture(canvas); value.colorSpace = THREE.SRGBColorSpace;
    value.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy()); ownedTextures.add(value); return value;
  }
  function setupShelf() {
    const wood = texture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#514438'; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 450; i++) {
        ctx.strokeStyle = `rgba(${i % 3 ? '12,9,5' : '172,146,103'},${.015 + (i * 37 % 14) / 200})`;
        ctx.lineWidth = .3 + (i % 5) * .18; ctx.beginPath();
        ctx.moveTo(0, i * 13.81 % h); ctx.bezierCurveTo(w * .3, i * 13.81 % h + 3, w * .7, i * 13.81 % h - 2, w, i * 13.81 % h + 1); ctx.stroke();
      }
    }); wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2, 2);
    mesh(new THREE.BoxGeometry(18, .26, 12), mat({ map: wood, roughness: .91 }), [0, -.24, 0]);
    const rubber = mat({ color: '#192423', roughness: .98 });
    mesh(new THREE.BoxGeometry(7.0, .065, 6.4), rubber, [0, -.075, -.5]);
    // Shelf lip and the open van wall catch the practical light behind the case.
    const paint = mat({ color: '#414a43', metalness: .35, roughness: .72 });
    mesh(new THREE.BoxGeometry(18, .38, .12), paint, [0, -.15, 5.8]);
    mesh(new THREE.BoxGeometry(18, 1.25, .22), paint, [0, .35, -5.8]);
    for (const x of [-8, -4, 4, 8]) mesh(new THREE.BoxGeometry(.09, 1.1, .08), paint, [x, .35, -5.64]);
    const trayMaterial = mat({ color: '#293431', roughness: .95 });
    for (const tray of WORKBENCH_TRAYS) {
      mesh(new THREE.BoxGeometry(tray.w, .05, tray.d), trayMaterial, [tray.x, -.028, tray.z]);
      for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(.035, .05, tray.d), paint, [tray.x + side * tray.w / 2, .007, tray.z]);
      const name = texture(512, 64, ctx => {
        ctx.fillStyle = '#d2c4a0'; ctx.fillRect(0, 0, 512, 64); ctx.fillStyle = '#27352c';
        ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.fillText(tray.label, 256, 44, 476);
      });
      mesh(new THREE.PlaneGeometry(tray.w - .12, .24), mat({ map: name, roughness: .86 }), [tray.x, .018, tray.z + tray.d / 2 - .17], [-Math.PI / 2, 0, 0]);
    }
    // The form remains a physical paper surface, not a glowing readout.
    paper = mesh(new THREE.BoxGeometry(1.65, .025, 1.75), mat({ color: '#c9bea3', roughness: .98 }), [-4.05, .02, 4.4], [0, -.08, 0]);
    const clip = mesh(new THREE.BoxGeometry(.64, .06, .16), mat({ color: '#7b8078', metalness: .9, roughness: .28 }), [-4.11, .082, 3.61], [0, -.08, 0]);
    clip.castShadow = true;
  }
  async function init() {
    if (initializing || disposed || typeof document === 'undefined') return initializing;
    initializing = (async () => {
      THREE = await import('three'); const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(1.5, globalThis.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#111b1b');
      const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
      const environment = pmrem.fromScene(room, .07); scene.environment = environment.texture; scene.environmentIntensity = .95;
      ownedTargets.add(environment); room.dispose(); pmrem.dispose();
      camera = new THREE.OrthographicCamera(-9.4, 9.4, 6.5, -6.5, .1, 70);
      camera.position.set(.1, 21, 15.2); camera.lookAt(0, .2, 0);
      const ambient = new THREE.HemisphereLight('#b6ccd6', '#332c22', .72); scene.add(ambient);
      const key = new THREE.DirectionalLight('#ffdfb0', 2.6); key.position.set(-3, 7, 4); key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -7; key.shadow.camera.right = 7;
      key.shadow.camera.left = -10; key.shadow.camera.right = 10;
      key.shadow.camera.top = 10; key.shadow.camera.bottom = -10; key.shadow.normalBias = .018; key.shadow.bias = -.0003; key.shadow.radius = 3.5;
      scene.add(key);
      const rim = new THREE.DirectionalLight('#8bc0dc', 1.5); rim.position.set(4, 4, -5); scene.add(rim);
      const fill = new THREE.DirectionalLight('#f4d4a5', .5); fill.position.set(0, 1, 6); scene.add(fill);
      loader = new GLTFLoader(); setupShelf(); dirty = true;
      shelfFrame = document.createElement('canvas'); detailFrame = document.createElement('canvas');
      detailScene = new THREE.Scene(); detailScene.background = new THREE.Color('#333e37'); detailScene.environment = scene.environment;
      detailScene.environmentIntensity = .95;
      detailScene.add(new THREE.HemisphereLight('#d4e6ec', '#41372b', .8));
      const detailKeyLight = new THREE.DirectionalLight('#ffe5bc', 2.6); detailKeyLight.position.set(-3, 4, 5); detailScene.add(detailKeyLight);
      const detailRim = new THREE.DirectionalLight('#a2d1ee', 1.5); detailRim.position.set(3, 3, -3); detailScene.add(detailRim);
      detailCamera = new THREE.PerspectiveCamera(32, 1, .1, 40); detailCamera.position.set(2.2, 1.2, 4.5); detailCamera.lookAt(0, 0, 0);
    })().catch(reason => { error = `3D shelf unavailable: ${reason.message || reason}`; });
    return initializing;
  }
  function request(id) {
    if (!loader || pending.has(id) || failed.has(id) || assets.has(id) || disposed) return;
    const spec = vanKitModel(id) || itemPortrait(id);
    if (!spec) { failed.add(id); error = `Unknown physical equipment: ${id}`; return; }
    const task = loader.loadAsync(assetUrl(spec.model)).then(gltf => {
      if (disposed) {
        const geometries = new Set(), materials = new Set(), textures = new Set();
        gltf.scene.traverse(node => { if (!node.isMesh) return; geometries.add(node.geometry);
          for (const material of [node.material].flat()) { materials.add(material);
            for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); } });
        geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose()); return;
      }
      const root = own(gltf.scene);
      assets.set(id, root); dirty = true;
    }).catch(reason => { if (!disposed) { failed.add(id); error = `Unable to load ${id}: ${reason.message || reason}`; } }).finally(() => pending.delete(id));
    pending.set(id, task);
  }
  function resetToBench(item) {
    const { object, model, group } = item;
    group.position.set(...object.position); group.rotation.set(0, object.key === 'map' ? -.16 : 0, 0);
    model.position.set(0, 0, 0); model.rotation.set(object.key === 'case' ? 0 : -Math.PI / 2, 0, 0); model.scale.setScalar(1);
    group.updateMatrixWorld(true);
    // Measure in the item's frame, independent of where its old packing bay was.
    const box = localBounds(model, group), extent = box.getSize(vec());
    const factor = object.width / (object.key === 'case' ? extent.x : Math.max(extent.x, extent.z));
    const center = box.getCenter(vec()); model.scale.setScalar(factor);
    model.position.set(-center.x * factor, -box.min.y * factor, -center.z * factor);
    item.base = [...object.position]; item.docked = false; item.bay = null; item.lift = 0;
    dirty = true;
  }
  function localBounds(model, group) {
    group.updateMatrixWorld(true); const inverse = group.matrixWorld.clone().invert(), box = new THREE.Box3();
    model.traverse(node => { if (!node.isMesh) return;
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      box.union(node.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld)));
    }); return box;
  }
  function install(object) {
    const slot = object.key, id = object.modelId;
    if (placed.get(slot)?.id === id || !assets.has(id)) return;
    const previous = placed.get(slot); if (previous) scene.remove(previous.group);
    // Every alternative has one real scene object. The cache is bounded by the
    // catalogue, and picking never mutates an inspector's shared asset.
    const model = assets.get(id), group = new THREE.Group(); group.add(model);
    scene.add(group);
    const item = { id, group, model, object, base: [...object.position], lift: 0, docked: false, destination: null };
    placed.set(slot, item); resetToBench(item);
    if (slot === 'case') updateCase(liveState, true);
  }
  function updateCase(state, force = false) {
    const item = placed.get('case'); if (!item) return;
    const open = !!state.bagTaken; if (!force && open === caseOpen) return;
    caseOpen = open;
    item.model.traverse(node => {
      if (node.name === 'open-lid-hinge') node.rotation.x = open ? node.userData.openAngle ?? -.31 : node.userData.closedAngle ?? Math.PI / 2;
      if (node.name.includes('lid-retaining-strap')) node.visible = open;
    });
    item.group.updateMatrixWorld(true); dirty = true; detailKey = '';
  }
  function findBay(fieldCase, name) {
    let found = fieldCase.model.getObjectByName(`packing-bay:${name}`);
    if (!found) fieldCase.model.traverse(node => { if ((node.name.includes('packing-bay') || node.name.includes('foam-cut-edge')) && node.name.endsWith(name)) found = node; });
    return found;
  }
  function dockEquipment(state) {
    const fieldCase = placed.get('case'); if (!fieldCase) return;
    fieldCase.group.updateMatrixWorld(true);
    for (const [slot, item] of placed) {
      const destination = item.object.destination;
      if (destination === item.destination) continue;
      item.destination = destination;
      // A fitted plate is now the device's surface, never a second loose plate.
      item.group.visible = destination !== 'device';
      resetToBench(item);
      if (destination !== 'case' || !state.bagTaken) continue;
      const bay = item.object.bay, socket = findBay(fieldCase, bay);
      if (!socket) continue;
      // Both floor foam and lid cradles expose an XY seat with +Z facing out.
      // Use its authored transform; the case, not hard-coded shelf coordinates,
      // owns where each fitted device belongs.
      const worldScale = socket.getWorldScale(vec());
      if (socket.geometry && !socket.geometry.boundingBox) socket.geometry.computeBoundingBox();
      const baySize = socket.geometry?.boundingBox?.getSize(vec());
      const maxX = (socket.userData.maxWidth || baySize?.x || .5) * worldScale.x * .87;
      const maxY = (socket.userData.maxHeight || baySize?.y || .5) * worldScale.y * .87;
      item.model.position.set(0, 0, 0); item.model.scale.setScalar(1);
      item.model.rotation.set(0, 0, slot === 'spanner' ? Math.PI / 2 + .48 : bay === 'microphone' ? Math.PI / 2 : 0);
      const local = localBounds(item.model, item.group), size = local.getSize(vec());
      const scale = Math.min(maxX / size.x, maxY / size.y);
      const centerLocal = local.getCenter(vec()); item.model.scale.setScalar(scale);
      item.model.position.set(-centerLocal.x * scale, -centerLocal.y * scale, -local.min.z * scale + .018);
      const center = socket.getWorldPosition(vec());
      item.base = [center.x, center.y, center.z]; item.group.position.set(...item.base);
      item.group.quaternion.copy(socket.getWorldQuaternion(new THREE.Quaternion()));
      // The legacy floor's cut-edge extrusion faces inward. Its visible seat is
      // the reverse face; lid anchors already explicitly face the equipment.
      if (!socket.name.includes('packing-bay')) item.group.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI));
      item.docked = true; item.bay = bay; dirty = true;
    }
  }
  function updatePaper(state) {
    const key = `${state.difficultyLabel}|${state.difficultyConfirmed}`;
    if (!paper || key === shiftKey) return; shiftKey = key;
    const old = paper.material.map;
    const map = texture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#d6ccb3'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#756f5b'; ctx.lineWidth = 2; ctx.strokeRect(26, 28, w - 52, h - 56);
      ctx.fillStyle = '#29362f'; ctx.font = 'bold 31px Arial'; ctx.fillText('AUDIOCORP', 48, 91);
      ctx.font = '23px Arial'; ctx.fillText('NIGHT SHIFT ORDER', 48, 136);
      ctx.fillRect(48, 159, 410, 2); ctx.font = 'bold 38px Arial';
      const label = state.difficultyConfirmed ? state.difficultyLabel : 'CHOOSE SHIFT';
      ctx.fillText(label || 'CONTRACT', 48, 247, 410);
      ctx.font = '20px Arial'; ctx.fillText('FIELD OPERATOR / 01', 48, 316);
      ctx.fillText(state.difficultyConfirmed ? 'SIGNED · REVISE IF NEEDED' : 'SIGN BEFORE DEPARTURE', 48, 405, 410);
      ctx.strokeStyle = '#6e7866'; ctx.beginPath(); ctx.moveTo(48, 376); ctx.lineTo(454, 376); ctx.stroke();
    });
    paper.material.map = map; paper.material.needsUpdate = true;
    if (old) { old.dispose(); ownedTextures.delete(old); } dirty = true;
  }
  function updateHalos(state, now) {
    const candidates = catalogue.filter(object => object.glow && placed.has(object.key)).map(object => {
      const box = new THREE.Box3().setFromObject(placed.get(object.key).group), center = box.getCenter(vec()), extent = box.getSize(vec());
      return { key: object.key, position: [center.x, .024, center.z], w: (extent.x + .38) / .85, d: (extent.z + .38) / .85 };
    });
    if (!state.difficultyConfirmed) candidates.push({ key: 'difficulty', position: [-4.05, 0, 4.4], w: 2.4, d: 2.6 });
    const active = new Set(candidates.map(item => item.key));
    for (const [key, halo] of halos) if (!active.has(key) && halo.visible) { halo.visible = false; dirty = true; }
    for (const item of candidates) {
      let halo = halos.get(item.key);
      if (!halo) {
        const glow = texture(256, 256, (ctx, w, h) => {
          // A soft edge pool on the bench, deliberately not a powered indicator.
          ctx.clearRect(0, 0, w, h); ctx.shadowColor = '#98efd5'; ctx.shadowBlur = 24;
          ctx.strokeStyle = '#bcffe3'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.roundRect(18, 18, w - 36, h - 36, 20); ctx.stroke();
        });
        const material = new THREE.MeshBasicMaterial({ map: glow, color: '#adffe1', transparent: true, opacity: .8,
          depthWrite: false, blending: THREE.AdditiveBlending }); ownedMaterials.add(material);
        halo = mesh(new THREE.PlaneGeometry(item.w, item.d), material, [item.position[0], .024, item.position[2]], [-Math.PI / 2, 0, 0]);
        halo.renderOrder = 1; halos.set(item.key, halo);
      }
      if (!halo.visible) { halo.visible = true; dirty = true; }
      const opacity = state.reduceMotion ? .88 : .76 + Math.sin(now * 2.1) * .11;
      if (Math.abs(halo.material.opacity - opacity) > .012) { halo.material.opacity = opacity; dirty = true; }
    }
  }
  function project(group, rect, inset = 0) {
    const box = new THREE.Box3().setFromObject(group), points = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      points.push({ x: rect.x + (point.x + 1) * rect.w / 2, y: rect.y + (1 - point.y) * rect.h / 2 });
    }
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    return clipStageTarget({ x: x + inset, y: y + inset, w: Math.max(...points.map(p => p.x)) - x - inset * 2,
      h: Math.max(...points.map(p => p.y)) - y - inset * 2 }, rect);
  }
  function setCosmetics(value,endingIds=[]) {
    const record = placed.get('recorder'),key=`${record?.id}:${JSON.stringify(value)}:${endingIds.join(',')}`;
    if (!record || appearance === key) return;
    appearance = key;
    if(record.id==='field-recorder-witness'){
      let adapter=witnessAppearances.get(record.model);
      if(!adapter){adapter=applyWitnessModelAppearance(THREE,record.model,{cosmetics:value,endingIds});witnessAppearances.set(record.model,adapter);}
      else adapter.update({cosmetics:value,endingIds});
      dirty=true;return;
    }
    const plastics = { classic: ['#bc6b57', '#bcbda9', '#c9a151'], signal: ['#bc6b57', '#729aa9', '#d0bc64'], 'sea-glass': ['#d09179', '#a7bda0', '#bcbda9'] };
    const buttons = plastics[value.buttons] || plastics.classic;
    let displayReady = false;
    record.model.traverse(node => { if (!node.isMesh) return;
      for (const material of [node.material].flat()) {
        material.userData.vanBaseColor ||= material.color.getHex();
        material.color.setHex(material.userData.vanBaseColor);
        if (material.name === 'recorder-faceplate') material.color.set(value.faceplate === 'olive' ? '#61694b' : value.faceplate === 'black' ? '#242b2d' : '#bfc2b5');
        if (material.name === 'recorder-ink') material.color.set(value.faceplate === 'aluminum' ? '#28312b' : '#d7d9bd');
        const index = ['recorder-button-rec', 'recorder-button-stop', 'recorder-button-takes'].indexOf(material.name);
        if (index >= 0) material.color.set(buttons[index]);
      }
      if (node.name === 'recorder-display-substrate') {
        const old = node.material.map;
        const map = texture(1332, 478, (ctx, width, height) => drawRecorderReadoutCanvas(ctx,
          { width, height, phosphor: value.vfd || 'faithful', counter: '00:00', mode: 'monitor', meter: { db: -96 }, progress: 0 }));
        // This authored plane preserves Three's top vertex v=1 (the builder
        // does not perform a glTF UV conversion). Canvas top must map to v=1.
        map.flipY = VAN_RECORDER_CANVAS_FLIP_Y; node.material.color.set('#ffffff'); node.material.map = map;
        node.material.emissive.set('#ffffff'); node.material.emissiveMap = map; node.material.emissiveIntensity = .5;
        node.material.needsUpdate = true; displayReady = true;
        if (old) { old.dispose(); ownedTextures.delete(old); }
      }
    });
    if (displayReady) record.model.traverse(node => { if (node.name === 'recorder-idle-electrodes') node.visible = false; });
    dirty = true;
  }
  function setFlashlightCosmetics(value) {
    const key = `${value.flashlightHousing}:${[...placed].filter(([,item])=>item.object.group === 'flashlight').length}`;
    if (key === flashlightAppearance) return; flashlightAppearance = key;
    const color = FLASHLIGHT_HOUSING_COLORS[value.flashlightHousing] || FLASHLIGHT_HOUSING_COLORS.graphite;
    for (const item of placed.values()) if (item.object.group === 'flashlight') item.model.traverse(node => {
      if (!node.isMesh) return; for (const material of [node.material].flat()) {
        if (material.name === 'flashlight-housing') material.color.set(color);
      }
    }); dirty = true;
  }
  function frame(rect, state, selected, now) {
    if (!renderer || disposed || suspended) return;
    const metrics = uiCellMetrics(), w = Math.max(1, Math.round(rect.w * metrics.cellW)), h = Math.max(1, Math.round(rect.h * metrics.cellH));
    const key = `${w}:${h}`;
    if (key !== frameKey) {
      frameKey = key; renderer.setSize(w, h, false); const aspect = w / h;
      // Orthographic framing keeps tray scale honest and retains the complete
      // authored bench at every aspect, including the compact fallback window.
      const halfH = Math.max(6.0, 8.7 / aspect), halfW = halfH * aspect;
      camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
      camera.updateProjectionMatrix(); dirty = true;
    }
    viewport = rect; liveState = state; catalogue = workbenchCatalog(state);
    currentIds = Object.fromEntries(catalogue.map(object => [object.key, object.modelId])); currentSelected = selected;
    for(const[slot,item]of placed){if(!currentIds[slot]){scene.remove(item.group);placed.delete(slot);projected.delete(slot);dirty=true;}}
    for (const object of catalogue) { request(object.modelId); install(object); const item = placed.get(object.key); if (item) item.object = object; }
    updateCase(state); dockEquipment(state);
    updatePaper(state); updateHalos(state, now);
    setCosmetics(state.fieldKit?.cosmetics || {},state.witness?.endingIds||[]); setFlashlightCosmetics(state.fieldKit?.cosmetics || {});
    let moving = false;
    for (const [slot, item] of placed) {
      const target = slot === selected && slot !== 'case' && item.group.visible ? .18 : 0;
      const next = state.reduceMotion ? target : item.lift + (target - item.lift) * .22;
      if (Math.abs(next - item.lift) > .0008) { item.lift = next; dirty = true; moving = true; }
      else item.lift = target;
      item.group.position.y = item.base[1] + item.lift;
    }
    if (dirty && (!moving || now - lastRender >= 1 / 30)) {
      renderer.setSize(w, h, false);
      renderer.render(scene, camera); lastRender = now; renderCount++; dirty = moving;
      shelfFrame.width = renderer.domElement.width; shelfFrame.height = renderer.domElement.height;
      shelfFrame.getContext('2d').drawImage(renderer.domElement, 0, 0);
      projected.clear(); for (const [slot, item] of placed) if (item.group.visible) projected.set(slot,
        { ...project(item.group, rect), ...workbenchTargetMetadata(item.object) });
      if (paper) projected.set('difficulty', { ...project(paper, rect), kind: 'difficulty', label: 'SHIFT ORDER' });
    }
    uiDraw(({ ctx, dpr, cellW, cellH }) => {
      ctx.save(); ctx.beginPath(); ctx.rect(rect.x * cellW * dpr, rect.y * cellH * dpr, rect.w * cellW * dpr, rect.h * cellH * dpr); ctx.clip();
      if (shelfFrame.width > 0) ctx.drawImage(shelfFrame, rect.x * cellW * dpr, rect.y * cellH * dpr, rect.w * cellW * dpr, rect.h * cellH * dpr); ctx.restore();
    });
  }
  function detail(rect, slot) {
    if (!placed.has(slot)) slot = workbenchFocusKey(slot, liveState);
    const item = placed.get(slot); if (!item || !renderer || !detailScene || disposed || suspended) return;
    const metrics = uiCellMetrics(), w = Math.max(1, Math.round(rect.w * metrics.cellW)), h = Math.max(1, Math.round(rect.h * metrics.cellH));
    const key = `${item.id}:${appearance}:${w}:${h}`;
    if (key !== detailKey) {
      detailKey = key; const old = detailScene.getObjectByName('selected-component'); if (old) detailScene.remove(old);
      const object = item.model.clone(true); object.name = 'selected-component'; object.position.set(0, 0, 0); object.scale.setScalar(1); object.rotation.set(0, 0, 0);
      object.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(object), size = box.getSize(vec()), center = box.getCenter(vec());
      const scale = 2.1 / Math.max(size.x, size.y, size.z); object.scale.setScalar(scale); object.position.copy(center.multiplyScalar(-scale));
      detailScene.add(object); detailCamera.aspect = w / h; detailCamera.updateProjectionMatrix();
      renderer.setSize(w, h, false); renderer.render(detailScene, detailCamera); renderCount++;
      detailFrame.width = renderer.domElement.width; detailFrame.height = renderer.domElement.height;
      detailFrame.getContext('2d').drawImage(renderer.domElement, 0, 0);
    }
    uiDraw(({ ctx, dpr, cellW, cellH }) => { if (detailFrame.width > 0) ctx.drawImage(detailFrame,
      rect.x * cellW * dpr, rect.y * cellH * dpr, rect.w * cellW * dpr, rect.h * cellH * dpr); });
  }
  return {
    draw(rect, { state = {}, selected = 'headphones', selectedGroup = null, focusId = '', witnessFocused=false, now = 0 } = {}) {
      init();
      const picked = focusId.startsWith('van:object:') ? focusId.slice('van:object:'.length) : null;
      const focused = witnessFocused ? 'witness' : picked || (selectedGroup ? workbenchFocusKey(selectedGroup, state) :
        selected === 'recorder' ? 'recorder' : workbenchFocusKey(selected, state));
      frame(rect, state, focused, now);
    },
    drawDetail(rect, slot) { detail(rect, slot); },
    targets() { return Object.fromEntries([...projected].map(([id, rect]) => [id, { ...rect }])); },
    snapshot() {
      const recorder = placed.get('recorder'), materials = {}; let readoutTexture = false;
      recorder?.model.traverse(node => { if (node.isMesh) for (const material of [node.material].flat()) {
        if (node.name === 'recorder-display-substrate') readoutTexture = !!material.map;
        if (material.name.startsWith('recorder-')) materials[material.name] = { color: `#${material.color.getHexString()}`, textured: !!material.map }; } });
      return { ready: !!renderer && catalogue.length >= 20 && Object.values(currentIds).every(id => assets.has(id)),
      models: Object.fromEntries([...placed].map(([slot, value]) => [slot, value.id])), loading: [...pending.keys()], failed: [...failed], error,
      docked: Object.fromEntries([...placed].filter(([, value]) => value.docked).map(([slot, value]) => [slot, value.bay])),
      materials, readoutTexture, caseOpen, glowing: [...halos].filter(([,value])=>value.visible).map(([key])=>key),
      destinations: Object.fromEntries([...placed].map(([slot, value]) => [slot, value.destination])),
      detailModel: detailKey.split(':')[0] || null, lifts: Object.fromEntries([...placed].map(([slot, value]) => [slot, value.lift])),
      rendererCount: renderer ? 1 : 0, renderCount, suspended, disposed, selected: currentSelected, targets: this.targets() }; },
    suspend() { suspended = true; }, resume() { suspended = false; dirty = true; },
    dispose() {
      if (disposed) return; disposed = true; suspended = true;
      for(const adapter of witnessAppearances.values())adapter.dispose();witnessAppearances.clear();
      for (const geometry of ownedGeometries) geometry.dispose();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of ownedTextures) texture.dispose();
      for (const target of ownedTargets) target.dispose();
      ownedGeometries.clear(); ownedMaterials.clear(); ownedTextures.clear();
      ownedTargets.clear();
      assets.clear(); placed.clear(); projected.clear(); halos.clear(); scene?.clear();
      detailScene?.clear(); shelfFrame = null; detailFrame = null; detailScene = null;
      renderer?.dispose(); renderer?.forceContextLoss(); renderer = null; scene = null;
    },
  };
}
