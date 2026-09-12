// Scene-local physical inspection, deliberately separate from ASCII portraits.
// The scene may request fitting; ownership and persistence remain with its caller.
import { uiDraw, uiCellMetrics, uiSize, uiScrim, uiFill, uiStrokeRect, uiText, uiWrap, uiWithClip } from '../render/ui.js';
import { assetUrl } from '../platform/paths.js';
import { vanKitModel } from '../data/van-kit-models.js';
import { applyWitnessModelAppearance } from '../render/witness-model.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number(value) || 0));
const hit = (rect, event) => rect && event.cellX >= rect.x && event.cellY >= rect.y && event.cellX <= rect.x + rect.w && event.cellY <= rect.y + rect.h;

export function witnessInspectionLayout(cols, rows, canFit = false) {
  const w = Math.max(12, cols - 4), h = Math.max(12, rows - 4), rect = { x: 2, y: 2, w, h };
  const wide = w >= 78, footerY = rect.y + h - 3;
  const portrait = { x: rect.x + 1, y: rect.y + 3, w: wide ? Math.floor(w * .7) - 2 : w - 2,
    h: Math.max(3, h - (wide ? 7 : 8.8)) };
  const detail = wide ? { x: portrait.x + portrait.w + 2, y: portrait.y, w: w - portrait.w - 5, h: portrait.h }
    : { x: portrait.x, y: portrait.y + portrait.h + .3, w: portrait.w, h: 2.1 };
  const actions = [{ id: 'close', label: 'BACK', key: 'ESC' }, { id: 'reset', label: 'RESET', key: 'R' },
    { id: 'turn', label: 'TURN OVER', key: 'T' }, { id: 'model', label: 'PLATE/RIG', key: 'V' },
    { id: 'test', label: 'TEST KEYS', key: 'K' }, ...(canFit ? [{ id: 'fit', label: 'FIT PLATE', key: 'ENTER' }] : [])];
  const gap = .7, actionW = (w - 2 - (actions.length - 1) * gap) / actions.length;
  const short = { close: 'BACK', reset: 'RESET', turn: 'TURN', model: 'MODEL', test: 'TEST', fit: 'FIT' };
  const buttons = actions.map((action, index) => ({ ...action, label: actionW < 11 ? short[action.id] : action.label,
    x: rect.x + 1 + index * (actionW + gap), y: footerY, w: actionW, h: 2 }));
  return { rect, portrait, detail, buttons, wide };
}

export function createWitnessInspectionRenderer({ cosmetics = {}, endingIds = [], initialMode = 'recorder' } = {}) {
  let THREE, renderer, scene, camera, loader, environment, disposed = false, lost = false, error = '', renderCount = 0;
  let mode = initialMode === 'plate' ? 'plate' : 'recorder', yaw = -.19, pitch = .12, dirty = true, sizeKey = '', testTime = 0;
  const assets = new Map(), appearance = new Map(), resources = { geometries: new Set(), materials: new Set(), textures: new Set() };
  function retain(root) {
    root.traverse(node => { if (!node.isMesh) return;
      resources.geometries.add(node.geometry);
      for (const material of [node.material].flat()) {
        resources.materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.textures.add(value);
      }
    });
  }
  function disposeRoot(root) {
    const geometries = new Set(), materials = new Set(), textures = new Set();
    root.traverse(node => { if (!node.isMesh) return; geometries.add(node.geometry);
      for (const material of [node.material].flat()) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); } });
    for (const resource of [...textures, ...materials, ...geometries]) resource.dispose();
  }
  const ready = (async () => {
    if (typeof document === 'undefined') { error = '3D VIEW UNAVAILABLE'; return; }
    try {
      THREE = await import('three');
      const [{ GLTFLoader }, { RoomEnvironment }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'), import('three/addons/environments/RoomEnvironment.js'),
      ]);
      if (disposed) return;
      renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.addEventListener('webglcontextlost', () => { lost = true; error = '3D VIEW INTERRUPTED'; });
      renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1));
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .94;
      scene = new THREE.Scene(); scene.background = new THREE.Color('#27332d');
      const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
      environment = pmrem.fromScene(room, .05); scene.environment = environment.texture; scene.environmentIntensity = .72;
      room.dispose(); pmrem.dispose();
      scene.add(new THREE.HemisphereLight('#d9e4db', '#2a221b', .55));
      const key = new THREE.DirectionalLight('#ffe9c9', 1.6); key.position.set(-3, 4, 6); scene.add(key);
      const edge = new THREE.DirectionalLight('#b6dbe6', 1.4); edge.position.set(4, 2, -3); scene.add(edge);
      camera = new THREE.PerspectiveCamera(31, 1, .05, 40);
      loader = new GLTFLoader();
      await Promise.all([['recorder', 'field-recorder-witness'], ['plate', 'witness-faceplate']].map(async ([id, modelId]) => {
        try {
          const gltf = await loader.loadAsync(assetUrl(vanKitModel(modelId).model));
          if (disposed) { disposeRoot(gltf.scene); return; }
          const model = gltf.scene; retain(model);
          const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
          model.position.sub(center);
          const pivot = new THREE.Group(); pivot.add(model); scene.add(pivot); assets.set(id, pivot);
          appearance.set(id, applyWitnessModelAppearance(THREE, model, { cosmetics, endingIds })); dirty = true;
        } catch { if (!disposed) error = 'MODEL COULD NOT BE LOADED'; }
      }));
    } catch { if (!disposed) error = '3D VIEW UNAVAILABLE'; }
  })();
  function orbit(dx, dy) { yaw += Number(dx) || 0; pitch = clamp(pitch + (Number(dy) || 0), -1.2, 1.2); dirty = true; }
  function reset() { yaw = -.19; pitch = .12; dirty = true; }
  return {
    ready, orbit, reset,
    turnOver() { yaw += Math.PI; dirty = true; },
    toggleModel() { mode = mode === 'recorder' ? 'plate' : 'recorder'; dirty = true; },
    testKeys() { if (mode === 'recorder') { testTime = .7; dirty = true; } },
    update(dt) {
      if (testTime > 0) {
        testTime = Math.max(0, testTime - clamp(dt, 0, .1));
        const travel = Math.min(1, testTime / .10, (.7 - testTime) / .08);
        appearance.get('recorder')?.updateControls({ rec: travel, stop: travel, takes: travel }); dirty = true;
      }
    },
    view: () => ({ mode, yaw, pitch, ready: assets.has(mode) && !disposed && !lost, failed: !!error || lost,
      error, disposed, contexts: renderer && !disposed ? 1 : 0, renderCount, testing: testTime > 0 }),
    draw(rect) {
      if (disposed || !renderer || lost || !assets.has(mode)) return;
      const metrics = uiCellMetrics(), width = Math.max(1, Math.round(rect.w * metrics.cellW)), height = Math.max(1, Math.round(rect.h * metrics.cellH));
      const key = `${width}:${height}`;
      if (key !== sizeKey) { sizeKey = key; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true; }
      if (dirty) {
        for (const [id, pivot] of assets) { pivot.visible = id === mode; pivot.rotation.set(pitch, yaw, 0); }
        // Fit the actual rotated physical bounds. A sphere wasted most of the
        // short/large-text aperture and made the collectible too small to see.
        const bounds = new THREE.Box3().setFromObject(assets.get(mode)), extent = bounds.getSize(new THREE.Vector3());
        const tangent = Math.tan(camera.fov * Math.PI / 360);
        const distance = Math.max(extent.y / (2 * tangent), extent.x / (2 * tangent * camera.aspect)) * 1.16 + extent.z / 2;
        camera.position.set(0, 0, distance); camera.lookAt(0, 0, 0);
        renderer.render(scene, camera); dirty = false; renderCount++;
      }
      uiDraw(({ ctx, dpr, cellW, cellH }) => {
        ctx.save(); ctx.beginPath(); ctx.rect(rect.x * cellW * dpr, rect.y * cellH * dpr, rect.w * cellW * dpr, rect.h * cellH * dpr); ctx.clip();
        ctx.drawImage(renderer.domElement, rect.x * cellW * dpr, rect.y * cellH * dpr, rect.w * cellW * dpr, rect.h * cellH * dpr); ctx.restore();
      });
    },
    dispose() {
      if (disposed) return; disposed = true;
      for (const value of appearance.values()) value.dispose(); appearance.clear();
      for (const resource of [...resources.textures, ...resources.materials, ...resources.geometries]) resource.dispose();
      environment?.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
      assets.clear();
    },
  };
}

export function makeWitnessInspectionScene({ cosmetics = {}, endingIds = [], owned = false, count = endingIds.length,
  required = 2, onFit = null, onClose = null, initialMode = 'recorder', fitUnavailableReason = '' } = {}) {
  const inspection = createWitnessInspectionRenderer({ cosmetics, endingIds, initialMode });
  const canFit = owned === true && typeof onFit === 'function';
  const fittingNotice = owned && !canFit ? String(fitUnavailableReason || '') : '';
  let layout = null, closed = false, drag = null, focused = 'close';
  function close() { if (closed) return; closed = true; inspection.dispose(); onClose?.(); }
  function activate(id) {
    if (closed) return;
    if (id === 'close') close();
    else if (id === 'reset') inspection.reset();
    else if (id === 'turn') inspection.turnOver();
    else if (id === 'model') inspection.toggleModel();
    else if (id === 'test') inspection.testKeys();
    // Fit runs while the parent workbench is still frozen. Resuming that scene
    // invalidates its callback lease, so the caller must see this first.
    else if (id === 'fit' && canFit) { if (onFit() !== false) close(); }
  }
  const scene = {
    id: 'witness-inspection', blocksInput: true, blocksWorld: true, freezesBelow: true, allowsLook: false, handlesEscape: true, suppressesHud: true,
    ready: inspection.ready,
    view: () => ({ ...inspection.view(), owned, canFit, count, required, fittingNotice, layout, focused, closed }),
    update(dt) { if (!closed) inspection.update(dt); },
    key(event) {
      if (closed) return true;
      const key = String(event.key || '').toLowerCase(), action = event.controllerAction;
      const direction = { arrowleft: [-.12, 0], arrowright: [.12, 0], arrowup: [0, -.10], arrowdown: [0, .10],
        move_left: [-.12, 0], move_right: [.12, 0], move_up: [0, -.10], move_down: [0, .10] }[action || key];
      // A held confirm may open this scene underneath the same hardware key.
      // Only deliberate fresh presses can fit, close or switch the preview.
      if (event.repeat && !direction) return true;
      if (['escape', 'b'].includes(key) || ['back', 'bag'].includes(action)) activate('close');
      else if (key === 'r') activate('reset');
      else if (key === 't') activate('turn');
      else if (key === 'v') activate('model');
      else if (key === 'k') activate('test');
      else if (key === 'tab' || ['tabPrev', 'tabNext'].includes(action)) {
        const buttons = layout?.buttons || witnessInspectionLayout(100, 40, canFit).buttons;
        const index = buttons.findIndex(button => button.id === focused), direction = event.shiftKey || action === 'tabPrev' ? -1 : 1;
        focused = buttons[(index + direction + buttons.length) % buttons.length].id;
      } else if (action === 'confirm' || key === ' ') activate(focused);
      else if (key === 'enter') activate(canFit ? 'fit' : focused);
      else if (direction) inspection.orbit(...direction);
      return true;
    },
    pointer(event) {
      if (closed) return true;
      if (['pointercancel', 'lostpointercapture'].includes(event.type)) { drag = null; return true; }
      if (event.type === 'pointerdown' && (event.originalEvent?.button ?? event.button ?? 0) === 0) {
        const button = layout?.buttons.find(rect => hit(rect, event));
        if (button) { focused = button.id; activate(button.id); }
        else if (hit(layout?.portrait, event)) drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      } else if (drag && drag.id === event.pointerId) {
        if (event.type === 'pointermove') { inspection.orbit((event.clientX - drag.x) * .009, (event.clientY - drag.y) * .009); drag = { ...drag, x: event.clientX, y: event.clientY }; }
        if (event.type === 'pointerup') drag = null;
      }
      return true;
    },
    render() {
      if (closed) return;
      const { cols, rows } = uiSize(); layout = witnessInspectionLayout(cols, rows, canFit);
      const { rect, portrait, detail, buttons, wide } = layout, state = inspection.view();
      uiScrim(.95); uiFill(rect.x, rect.y, rect.w, rect.h, '#111e19'); uiStrokeRect(rect.x, rect.y, rect.w, rect.h, '#829787', .7, 1);
      uiText(rect.x + 1, rect.y + .7, 'AUDIOCORP / WITNESS EDITION', 'ui-amber', 1);
      uiFill(portrait.x, portrait.y, portrait.w, portrait.h, '#27332d'); inspection.draw(portrait);
      if (!state.ready) {
        uiWithClip(portrait, () => {
          uiText(portrait.x + 1, portrait.y + 2, state.error || 'OPENING PHYSICAL MODEL...', 'ui-primary', .95);
          if (state.failed) uiText(portrait.x + 1, portrait.y + 4, canFit ? 'BACK AND FIT REMAIN AVAILABLE.' : 'BACK REMAINS AVAILABLE.', 'ui-primary', .9);
        });
      }
      uiWithClip(detail, () => {
        const lines = wide ? [state.mode === 'plate' ? 'SERVICE FACEPLATE' : 'FACTORY SERVICE INSTRUMENT',
          owned ? 'PERMANENT COSMETIC / OWNED' : `${count} / ${required} DISTINCT ENDINGS`,
          ...(fittingNotice ? [fittingNotice] : []),
          state.mode === 'plate' ? 'Champagne-clear polymer. Separate replacement plate in its protective sleeve.'
            : 'Clear polymer, copper traces, visible harnesses and mechanical switches. A dark, separate VFD module.',
          `${count} RETURN SERVICE ${count === 1 ? 'MARK' : 'MARKS'}.`,
          'Your button colors and phosphor stay unchanged. No equipment effects.',
          ...(fittingNotice ? [] : [canFit ? 'Fit this plate at the van.' : owned ? 'Fitting is available at the van.' : 'Reach two different endings to fit this plate.'])]
          : [state.mode === 'plate' ? 'SERVICE FACEPLATE / PROTECTIVE SLEEVE' : 'PHYSICAL RECORDER / IDLE DISPLAY',
            fittingNotice || (owned ? `${count} SERVICE MARKS / COSMETIC ONLY${canFit ? ' / READY TO FIT' : ''}` : `${count} / ${required} DISTINCT ENDINGS / PREVIEW ONLY`)];
        let y = detail.y;
        for (const [index, text] of lines.entries()) {
          for (const line of uiWrap(text, detail.w)) { if (y + 1 <= detail.y + detail.h) uiText(detail.x, y++, line, index === 0 ? 'ui-amber' : 'ui-primary', index < 2 ? 1 : .95); }
          y += wide ? .5 : 0;
        }
      });
      uiText(portrait.x + .6, portrait.y + portrait.h - 1.3,
        state.testing ? 'MECHANISM TEST / NOT RECORDING' : portrait.w > 68 ? 'DRAG / ARROWS: ROTATE  /  TAB: CONTROLS' : 'DRAG / ARROWS: ROTATE', 'ui-primary', .85);
      for (const button of buttons) {
        const selected = focused === button.id;
        uiFill(button.x, button.y, button.w, button.h, selected ? '#304538' : '#1c2b23');
        uiStrokeRect(button.x, button.y, button.w, button.h, selected ? '#c4d0b8' : '#657a69', .6, 1);
        uiWithClip(button, () => {
          uiText(button.x + .55, button.y + .25, button.label, button.id === 'fit' ? 'ui-amber' : 'ui-primary', .85);
          uiText(button.x + .55, button.y + 1.12, button.key, 'ui-primary', .8);
        });
      }
    },
    exit() { closed = true; drag = null; inspection.dispose(); },
  };
  return scene;
}
