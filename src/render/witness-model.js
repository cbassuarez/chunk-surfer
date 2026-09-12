// Physical WITNESS presentation. Geometry and transmission belong to the GLB;
// only player-selected pigments, earned service stamps and the real idle VFD
// substrate are supplied here. The owner retains its original asset resources.
import { drawRecorderReadoutCanvas } from './recorder-instrument.js';
import { ENDING_IDS } from '../progression/schema.js';

const BUTTON_COLORS = Object.freeze({
  classic: ['#bc6b57', '#bcbda9', '#c9a151'],
  signal: ['#bc6b57', '#729aa9', '#d0bc64'],
  'sea-glass': ['#d09179', '#a7bda0', '#bcbda9'],
});
const controls = ['rec', 'stop', 'takes'];
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
// GLTFLoader sanitizes colons out of node names for animation bindings.
const named = (node, name) => node.name === name || node.name === name.replaceAll(':', '');

export function applyWitnessModelAppearance(THREE, root, options = {}) {
  let cosmetics = { ...options.cosmetics }, endingIds = [...(options.endingIds || [])], disposed = false, displayKey = '';
  const edits = [], materials = new Map(), textures = new Set(), visibility = [], movements = [];
  const cloneMaterial = original => {
    if (!materials.has(original)) materials.set(original, original.clone());
    return materials.get(original);
  };
  let substrate = null;
  root.traverse(node => {
    if (named(node, 'recorder-display-substrate')) substrate = node;
    if (ENDING_IDS.some(id => named(node, `witness-ending:${id}`)) || named(node, 'recorder-idle-electrodes')) visibility.push([node, node.visible]);
    if (!node.isMesh) return;
    const originals = Array.isArray(node.material) ? node.material : [node.material];
    if (node === substrate || originals.some(material => controls.some(id => material.name === `recorder-button-${id}`))) {
      edits.push([node, node.material]);
      const mapped = originals.map(cloneMaterial);
      node.material = Array.isArray(node.material) ? mapped : mapped[0];
    }
  });
  for (const id of controls) {
    let actuator = null, stem = null;
    root.traverse(node => {
      if (named(node, `transport-${id.toUpperCase()}-actuator`)) actuator = node;
      if (named(node, `witness-stem:${id}`)) stem = node;
    });
    if (actuator) movements.push({ id, node: actuator, z: actuator.position.z });
    else root.traverse(node => {
      if ([`transport-${id.toUpperCase()}-cap`, `transport-${id.toUpperCase()}-lamp`].some(name => named(node, name))) {
        movements.push({ id, node, z: node.position.z });
      }
    });
    if (stem) movements.push({ id, node: stem, z: stem.position.z });
  }
  function makeTexture() {
    const draw = (ctx, width, height) => drawRecorderReadoutCanvas(ctx, {
      width, height, phosphor: cosmetics.vfd || 'faithful', counter: '00:00',
      mode: 'monitor', meter: { db: -96 }, progress: 0,
    });
    if (options.textureFactory) return options.textureFactory(1332, 478, draw);
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 1332; canvas.height = 478;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    draw(ctx, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
  }
  function update(next = {}) {
    if (disposed) return false;
    if (next.cosmetics) cosmetics = { ...cosmetics, ...next.cosmetics };
    if (next.endingIds) endingIds = [...next.endingIds];
    const colors = BUTTON_COLORS[cosmetics.buttons] || BUTTON_COLORS.classic;
    for (const material of materials.values()) {
      const index = controls.findIndex(id => material.name === `recorder-button-${id}`);
      if (index >= 0) material.color.set(colors[index]);
    }
    const earned = new Set(endingIds.filter(id => ENDING_IDS.includes(id)));
    for (const [node] of visibility) {
      const id = ENDING_IDS.find(value => named(node, `witness-ending:${value}`));
      if (id) node.visible = earned.has(id);
    }
    const key = cosmetics.vfd || 'faithful';
    if (substrate && key !== displayKey) {
      const map = makeTexture();
      if (map) {
        for (const texture of textures) texture.dispose(); textures.clear(); textures.add(map);
        // The authored PlaneGeometry retains top=v1 UVs, unlike exported image
        // textures. The dark substrate is opaque even behind a clear shell.
        map.flipY = true; map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true;
        const material = substrate.material;
        material.color.set('#ffffff'); material.map = map;
        material.emissive?.set('#ffffff'); material.emissiveMap = map; material.emissiveIntensity = .5;
        material.transparent = false; material.opacity = 1; material.depthWrite = true; material.needsUpdate = true;
        displayKey = key;
        for (const [node] of visibility) if (named(node, 'recorder-idle-electrodes')) node.visible = false;
      }
    }
    return true;
  }
  function updateControls(pressed = {}) {
    if (disposed) return;
    for (const entry of movements) entry.node.position.z = entry.z - .012 * clamp(pressed[entry.id]);
  }
  update();
  return {
    update, updateControls,
    dispose() {
      if (disposed) return; disposed = true;
      for (const [node, original] of edits) node.material = original;
      for (const [node, original] of visibility) node.visible = original;
      for (const entry of movements) entry.node.position.z = entry.z;
      for (const texture of textures) texture.dispose();
      for (const material of materials.values()) material.dispose();
      textures.clear(); materials.clear();
    },
  };
}
