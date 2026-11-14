import { assetUrl } from '../platform/paths.js';
import { uiDraw } from './ui.js';
import { createHushStageBackplane } from './hush-stage-backplane.js';
import { createSourceDesktopDither } from './source-desktop-dither.js';
import {
  createSourceDesktopPressureSampler, finishSourceDesktopPressure, loadSourceDesktopPressureAsset,
  setSourceDesktopHushViewport, sourceDesktopRenderFrame, SOURCE_DESKTOP_PRESSURE_ASSET,
} from './source-desktop-view.js';
import { drawHushBattleFallback } from './hush-battle-fallback.js';
import { hushBattleBodyCamera, HUSH_BATTLE_VIEW_RISE, HUSH_BATTLE_VIEW_DISTANCE } from './hush-battle-camera.js';

const fieldCages = Object.freeze({
  natatorium: 'natatorium', practice: 'practice', 'practice-room-hush': 'practice', hall: 'hall',
});
const combatId = battle => battle?.combat?.id || battle?.id || '';

export function fieldSignalCage(battle) {
  const art = battle?.art || battle?.combat?.art;
  const artId = typeof art === 'string' ? art : art?.id;
  if (artId === 'guard' || artId === 'surfer') return null;
  return Object.hasOwn(fieldCages, combatId(battle)) ? fieldCages[combatId(battle)] : null;
}

export function usesHushBattleBody(battle) {
  const id = combatId(battle);
  return id === 'source-final' || (!!fieldSignalCage(battle) && id !== 'hall');
}

function collectAssets(root) {
  const resources = new Set();
  root.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    if (node.skeleton) resources.add(node.skeleton);
    for (const material of [node.material].flat().filter(Boolean)) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  return resources;
}

function createHushBattleBodyView(canvas) {
  let renderer, dither, scene, camera, sampler, model, finish, resources;
  let disposed = false, lost = false, drawKey = '', renderCount = 0;
  const onContextLost = event => { event.preventDefault(); lost = true; };
  canvas.addEventListener('webglcontextlost', onContextLost);
  const ready = (async () => {
    const [THREE, { GLTFLoader }] = await Promise.all([import('three'), import('three/addons/loaders/GLTFLoader.js')]);
    if (disposed) return false;
    const { character, asset } = await loadSourceDesktopPressureAsset(new GLTFLoader(), assetUrl(SOURCE_DESKTOP_PRESSURE_ASSET));
    model = character.scene;
    resources = collectAssets(model);
    if (disposed) { for (const resource of resources) resource.dispose?.(); return false; }
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: true,
      preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.8;
    renderer.info.autoReset = false;
    dither = createSourceDesktopDither(THREE, renderer);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .05, 40);
    scene.add(model, new THREE.HemisphereLight('#afc4b2', '#19221e', 1.1));
    const backplane = createHushStageBackplane(THREE);
    resources.add(backplane.geometry);
    resources.add(backplane.material);
    scene.add(backplane);
    const key = new THREE.DirectionalLight('#c7d4be', 12); key.position.set(-3, 4, 4); scene.add(key);
    const rim = new THREE.DirectionalLight('#a8bdc7', 7); rim.position.set(3, 3, -3); scene.add(rim);
    sampler = createSourceDesktopPressureSampler(THREE, model, asset);
    finish = finishSourceDesktopPressure(THREE, model, { own: value => { resources.add(value); return value; } });
    return !!await dither.ready && !disposed && !lost;
  })();

  function draw(width, height, frame, close, pixelRatio, screenOffset) {
    if (!dither || !finish || disposed || lost) return false;
    const key = [width, height, close, pixelRatio, ...screenOffset, frame.clock, frame.intent.kind,
      frame.intent.progress, frame.reducedMotion, frame.reduceFlash].join(':');
    if (key === drawKey) return true;
    const { body, surface, state } = sourceDesktopRenderFrame(frame);
    if (!body || !finish.cores.length) return false;
    if (canvas.width !== width || canvas.height !== height) renderer.setSize(width, height, false);
    const view = hushBattleBodyCamera(width, height, close);
    camera.left = -view.halfWidth; camera.right = view.halfWidth;
    camera.top = view.span / 2; camera.bottom = -camera.top;
    camera.position.set(0, view.centre + HUSH_BATTLE_VIEW_RISE, HUSH_BATTLE_VIEW_DISTANCE);
    camera.lookAt(0, view.centre, 0);
    camera.updateProjectionMatrix();
    model.rotation.y = -body.yaw;
    model.scale.set(body.scale * (body.scaleX ?? 1), body.scale * (body.scaleY ?? 1), body.scale * (body.scaleZ ?? 1));
    sampler.sample(body.character);
    for (const mesh of finish.returns) mesh.visible = !!surface;
    for (const mesh of finish.volumes) mesh.visible = false;
    setSourceDesktopHushViewport(finish.cores, width, height);
    renderer.info.reset();
    if (!dither.render(scene, camera, { width, height, dpr: 1, snapshot: state,
      sceneScale: Math.min(1, 960 / width, 540 / height),
      cellScale: pixelRatio, screenScale: pixelRatio, screenOffset })) return false;
    drawKey = key;
    renderCount++;
    return true;
  }

  return { ready, draw,
    debug: () => ({ renderCount, lost, dither: dither?.debug(), rig: sampler?.debug() }),
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', onContextLost);
      sampler?.dispose();
      dither?.dispose();
      for (const resource of resources || []) resource.dispose?.();
      scene?.clear();
      renderer?.dispose();
      renderer?.forceContextLoss();
    },
  };
}

// This view has no director, command input, clock or save authority. The same
// instance crosses the splash/preparation boundary and is retired once Source's
// existing desktop presenter owns the stage.
export function createHushBattleBody(battle, {
  document = globalThis.document, createView = createHushBattleBodyView,
  host = document?.getElementById?.('wrap'),
} = {}) {
  if (!usesHushBattleBody(battle)) return null;
  let canvas, view, warming, ready = false, released = false, disposed = false;
  let error = null, fallbackFrames = 0;

  function mark(state) {
    if (!host?.dataset) return;
    if (state) host.dataset.hushBattleBodyState = state;
    else delete host.dataset.hushBattleBodyState;
  }

  function release() {
    if (released) return;
    released = true;
    ready = false;
    view?.dispose();
    view = null;
    canvas = null;
  }

  function warm() {
    if (!document || released || warming) return warming;
    warming = Promise.resolve().then(() => {
      if (released) return false;
      canvas = document.createElement('canvas');
      view = createView(canvas);
      return view.ready;
    }).then(loaded => (ready = !released && loaded === true)).catch(reason => {
      error = String(reason?.message || reason);
      release();
      return false;
    });
    return warming;
  }

  function paint(ctx, box, { clock = 0, reducedMotion = false, reduceFlash = false,
    intentKind = null, resolveProgress = 0, close = false, clip = null, pixelRatio = 1 } = {}) {
    if (disposed || !(box.w > 0) || !(box.h > 0)) return false;
    warm();
    const x = Math.round(box.x), y = Math.round(box.y);
    const width = Math.max(1, Math.round(box.w)), height = Math.max(1, Math.round(box.h));
    const frame = { phase: 'contained', clock: reducedMotion ? 0 : Math.floor(clock * 24) / 24,
      intent: { kind: intentKind, progress: Math.floor(resolveProgress * 24) / 24 }, reducedMotion, reduceFlash };
    const screenOffset = [x, Math.round((ctx.canvas?.height || height) - y - height)];
    ctx.save();
    try {
      if (clip) { ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
      if (ready) {
        try {
          if (view.draw(width, height, frame, close, pixelRatio, screenOffset)) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(canvas, x, y, width, height);
            mark('ready');
            return true;
          }
          error = 'HUSH battle view unavailable';
        } catch (reason) { error = String(reason?.message || reason); }
        release();
      }
      fallbackFrames++;
      drawHushBattleFallback(ctx, { x, y, width, height, view: hushBattleBodyCamera(width, height, close) });
      mark('fallback');
      return false;
    } finally { ctx.restore(); }
  }

  function draw(box, { clip = null, ...frame } = {}) {
    uiDraw(({ ctx, dpr, cellW, cellH }) => {
      const pixels = rect => ({ x: rect.x * cellW * dpr, y: rect.y * cellH * dpr,
        w: rect.w * cellW * dpr, h: rect.h * cellH * dpr });
      paint(ctx, pixels(box), { ...frame, clip: clip && pixels(clip), pixelRatio: dpr });
    });
  }

  return { warm, draw, paint, release,
    desktop() { release(); mark('desktop'); },
    debug: () => ({ ready, released, error, fallbackFrames, renderer: view?.debug() || null }),
    dispose() { disposed = true; release(); mark(null); },
  };
}
