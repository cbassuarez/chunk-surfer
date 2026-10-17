// Passive Uncontained presentation. The combat owner supplies every clock,
// transition, tell and cover value; this module never advances simulation.
import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { sourceStrataGeometry } from '../data/source-exposed-strata.js';
import { normalizePressurePresentation } from '../game/pressure-performance.js';
import { pressureInstances } from './pressure-volume.js';
import { assetUrl } from '../platform/paths.js';
import { createSourceDesktopDither } from './source-desktop-dither.js';
import { ensureWorldLetteringFonts } from './world-lettering-fonts.js';
import { fitWorldLetteringLine } from './world-lettering-layout.js';

export const SOURCE_DESKTOP_PROTOCOL = 1;
export const SOURCE_DESKTOP_DISSOLVE_SECONDS = 2.4;
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, finite(n, min)));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const phases = new Set(['contained', 'sealed', 'dissolving', 'desktop', 'reforming', 'ended']);
const intents = new Set(['broadcast', 'conceal', 'overload', 'loop', 'silence']);

export function sourceDesktopGlyphLines(limit = 48) {
  return Object.values(SOURCE_ATLAS.sectors || {}).flatMap(s => s.sourceLines || [])
    .map(line => String(line.text || '')).filter(line => line.trim().length > 12).slice(0, limit);
}

export function paintSourceDesktopGlyphCanvas(ctx, { width = 1024, height = 512, lines = sourceDesktopGlyphLines() } = {}) {
  ctx.fillStyle = '#25312c'; ctx.fillRect(0, 0, width, height);
  if (!lines.length) return [];
  const rows = 26, margin = 8, pitch = (height - margin * 2) / rows, report = [];
  for (let row = 0; row < rows; row++) {
    const x = margin + row % 3 * 9;
    const layout = fitWorldLetteringLine(ctx, lines[row % lines.length], {
      width: width - margin - x, height: pitch - 2, maxFont: 13, role: 'mono',
    });
    if (!layout.fits) throw new Error(`Source desktop ink cannot fit row ${row}`);
    ctx.fillStyle = row % 5 === 0 ? '#73816f' : '#9ca992';
    ctx.fillText(layout.text, x + layout.left, margin + row * pitch + layout.ascent);
    report.push({ text: layout.text, x, top: margin + row * pitch, pitch, ...layout });
  }
  return report;
}

export function normalizeSourceDesktopSnapshot(input = {}, previous = null) {
  const token = String(input.token || previous?.token || '').slice(0, 200);
  const phase = phases.has(input.phase) ? input.phase : input.breached ? 'desktop' : 'contained';
  // A paused owner cannot accidentally keep a clip or a transition travelling.
  // Ending still clears the surface while a paused native window is closing.
  if (input.paused && phase !== 'ended' && previous?.active && previous.token === token) return { ...previous, paused: true };
  const cover = input.cover || {};
  const capacity = Math.floor(clamp(cover.capacity ?? 3, 0, 3));
  return {
    version: 1, token, revision: Math.max(0, Math.floor(finite(input.revision))),
    // Mechanics' active means "breached"; contained presentation begins sooner.
    active: phase !== 'ended' && (phase === 'contained' || phase === 'sealed' || input.active !== false), mode: input.mode === 'native' ? 'native' : 'fallback',
    phase, transition: clamp(input.transition),
    clock: Math.max(0, finite(input.clock), previous?.token === token ? previous.clock : 0),
    movementIndex: Math.floor(clamp(input.movementIndex, 0, 2)), tier: Math.floor(clamp(input.tier, 0, 3)),
    composureRatio: clamp(input.composureRatio ?? 1), coherenceRatio: clamp(input.coherenceRatio ?? 1),
    cover: { capacity, count: Math.floor(clamp(cover.count, 0, capacity)),
      guard: clamp(cover.guard, 0, 20), exposed: !!cover.exposed },
    intent: { kind: intents.has(input.intent?.kind) ? input.intent.kind : 'broadcast', progress: clamp(input.intent?.progress) },
    reaction: { phase: String(input.reaction?.phase || ''), progress: clamp(input.reaction?.progress),
      tier: String(input.reaction?.tier || ''), armed: !!input.reaction?.armed },
    toolId: String(input.toolId || ''), actionId: String(input.actionId || ''),
    pressurePresentation: normalizePressurePresentation(input.pressurePresentation),
    desktop: input.desktop || null, camera: input.camera || null,
    reducedMotion: !!input.reducedMotion, reduceFlash: !!input.reduceFlash, paused: !!input.paused,
  };
}

export function sourceDesktopRenderFrame(input = {}, previous = null) {
  const state = normalizeSourceDesktopSnapshot(input, previous);
  const openness = state.phase === 'desktop' ? 1 : state.phase === 'dissolving' ? smooth(state.transition)
    : state.phase === 'reforming' ? 1 - smooth(state.transition) : 0;
  const kind = state.intent.kind, p = state.intent.progress;
  const cue = kind === 'loop' ? 'double' : kind === 'overload' ? 'lean-in' : kind === 'conceal' ? 'turn' : kind === 'silence' ? 'dim' : 'lean';
  const captured = state.pressurePresentation?.primary;
  const actor = captured ? { ...captured, x: 0, y: 0, floorH: 0, heightM: 2.18, mode: 'live', strength: .96,
    performance: { ...captured.performance, role: 'source-front', heading: Math.PI, gait: null,
      manifestation: 1, cue: { name: cue, elapsed: .35 + p * 1.3 }, reducedMotion: state.reducedMotion } }
    : { id: 'source-desktop-pressure', x: 0, y: 0, floorH: 0, heightM: 2.18, widthM: .68, strength: .96,
      performance: { role: 'source-front', heading: Math.PI, clip: 'pressure_hold', time: 0, seed: 4417,
        manifestation: 1, motion: 'idle', cue: { name: cue, elapsed: .35 + p * 1.3 }, reducedMotion: state.reducedMotion } };
  // The clip is authored, sampled at the owner's time. No Date/RAF time enters.
  const clip = state.reducedMotion ? 'pressure_hold' : kind === 'overload' ? 'pressure_load'
    : kind === 'loop' ? 'pressure_pivot' : kind === 'silence' ? 'pressure_arrest' : 'pressure_listen';
  const clipTime = state.reducedMotion ? 0 : kind === 'overload' ? p * .5
    : kind === 'loop' ? p * .72 : kind === 'silence' ? p : state.clock % 4.8;
  actor.performance.clip = clip; actor.performance.time = clipTime;
  const instances = pressureInstances(actor, null, { reducedMotion: state.reducedMotion, reduceFlash: state.reduceFlash });
  const body = instances[0], echo = instances[1] || null;
  return { state, openness, body, echo, clip, clipTime,
    guardVisible: state.cover.count > 0 && /^(hold|spanner-guard)$/.test(state.actionId),
    rakeVisible: state.cover.exposed || state.actionId === 'expose',
    shellRetention: 1 - openness * .82,
    bodyOpacity: kind === 'conceal' ? .68 : kind === 'silence' ? .48 : .98,
  };
}

export function sourceDesktopLayout(width, height, desktop = null) {
  const w = Math.max(1, finite(width, 1280)), h = Math.max(1, finite(height, 800));
  const commandTop = clamp(finite(desktop?.command?.y, h), 1, h);
  const stageHeight = Math.max(1, Math.min(h * .82, commandTop - Math.min(h * .03, commandTop * .05)));
  return { width: w, height: h, stageHeight, commandTop,
    // The fixed 2.18m body occupies the same projected space throughout a tier.
    body: { x: w * .5, top: stageHeight * .189, bottom: stageHeight * .814 },
    dpr: clamp(desktop?.scale || globalThis.devicePixelRatio || 1, 1, 2) };
}

export function createSourceDesktopEnvelopeGate() {
  let token = '', revision = -1;
  const retired = new Set();
  return {
    accept(value) {
      if (!value || typeof value.token !== 'string' || !value.token || value.token.length > 200 ||
        !Number.isInteger(value.revision) || value.revision < 0 || !value.snapshot || typeof value.snapshot !== 'object') return null;
      if (retired.has(value.token)) return null;
      if (token !== value.token) { if (token) retired.add(token); token = value.token; revision = -1; }
      if (value.revision <= revision) return null;
      revision = value.revision;
      return { ...value.snapshot, token, revision };
    },
    debug: () => ({ token, revision, retired: retired.size }),
  };
}

// Geometry is the actual closed Source courses, rescaled as finite survivors.
export const SOURCE_DESKTOP_PLATES = Object.freeze([
  { id: 'strata-west-course-0', position: [-2.0, .12, -.3], size: [2.3, .32, 1.2] },
  { id: 'strata-west-course-2', position: [-2.4, .72, -.7], size: [1.8, .42, .8] },
  { id: 'strata-west-cleft-crest', position: [-2.5, 1.38, -1.0], size: [1.6, .8, .7] },
  { id: 'strata-east-course-0', position: [2.05, .13, -.2], size: [2.4, .35, 1.2] },
  { id: 'strata-east-course-3', position: [2.5, .8, -.8], size: [1.8, .52, .8] },
  { id: 'strata-east-cleft-chip', position: [2.7, 1.55, -1.2], size: [1.5, .55, .7] },
]);

export function createSourceDesktopView({ canvas = null, container = null, assetBase = null, onError = null } = {}) {
  const target = canvas || globalThis.document?.createElement('canvas');
  if (!target) throw new Error('Source desktop view requires a canvas');
  if (!canvas && container) container.append(target);
  Object.assign(target.style, { pointerEvents:'none', display:'block', width:'100%', height:'100%' });
  target.setAttribute('aria-hidden', 'true');
  let THREE, renderer, dither, scene, camera, bodyRoot, echoRoot, mixer, echoMixer, clips, action, selectedClip = '', disposed = false;
  let snapshot = null, frame = null, error = null, renderCount = 0, resourceReady = false;
  let width = 1280, height = 800, dpr = 1, rendererSized = false;
  const owned = new Set(), textures = new Set(), shell = [], covers = [], bones = [], materials = [], echoBones = [], echoMaterials = [];
  const modelIds = [], animationClips = [], shaderUniforms = [], modelGroups = [];
  let guardPlate, rake, ambient, bodyMeshCount = 0;
  const path = p => assetBase ? new URL(p, assetBase).href : assetUrl(p);
  const own = value => { owned.add(value); return value; };
  const contextLost = event => {
    event.preventDefault();
    if (disposed) return;
    resourceReady = false; error = 'Source desktop WebGL context lost';
    onError?.(new Error(error));
  };
  target.addEventListener('webglcontextlost', contextLost);

  function collect(root) {
    root.traverse(node => {
      if (node.geometry) own(node.geometry);
      for (const material of [node.material].flat().filter(Boolean)) {
        own(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    return root;
  }
  function glyphTexture() {
    const bitmap = document.createElement('canvas'); bitmap.width = 1024; bitmap.height = 512;
    paintSourceDesktopGlyphCanvas(bitmap.getContext('2d'));
    const texture = new THREE.CanvasTexture(bitmap); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2.4, .8); textures.add(texture); return texture;
  }
  function plateMaterial(glyphs, color, layer) {
    const mat = own(new THREE.MeshStandardMaterial({ color, map: glyphs, roughness: .9, metalness: .04, transparent: true, side: THREE.DoubleSide }));
    const uniforms = { openness: { value: 0 }, layer: { value: layer }, rake: { value: 0 } };
    shaderUniforms.push(uniforms);
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, { sourceOpen: uniforms.openness, sourceLayer: uniforms.layer, sourceRake: uniforms.rake });
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 sourceWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nsourceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 sourceWorld; uniform float sourceOpen,sourceLayer,sourceRake;')
        .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          float cells=fract(sin(dot(floor(sourceWorld.xz*24.0)+floor(sourceWorld.y*18.0),vec2(12.9898,78.233)))*43758.5453);
          if(cells < sourceOpen*sourceLayer*.82) discard;
          diffuseColor.rgb+=vec3(.28,.33,.22)*sourceRake*(1.0-smoothstep(.025,.065,abs(sourceWorld.y+.16*sourceWorld.x-.85)));`);
    };
    mat.customProgramCacheKey = () => 'source-desktop-course-v1';
    return mat;
  }
  function pieceMesh(piece, spec, material) {
    const indexed = own(new THREE.BufferGeometry()); indexed.setAttribute('position', new THREE.Float32BufferAttribute(piece.p, 3));
    indexed.setIndex(piece.i);
    indexed.translate(-(piece.minX + piece.maxX) / 2, -piece.minY, -(piece.minZ + piece.maxZ) / 2);
    indexed.scale(spec.size[0] / (piece.maxX - piece.minX), spec.size[1] / (piece.maxY - piece.minY), spec.size[2] / (piece.maxZ - piece.minZ));
    const geo = own(indexed.toNonIndexed()); geo.computeVertexNormals();
    const uv = [], position = geo.getAttribute('position'), normal = geo.getAttribute('normal');
    for (let n = 0; n < position.count; n++) {
      const x = position.getX(n), y = position.getY(n), z = position.getZ(n);
      // Each closed geological face acquires source text in its own plane.
      const horizontal = Math.abs(normal.getY(n)) > .65;
      const eastWest = Math.abs(normal.getX(n)) > Math.abs(normal.getZ(n));
      uv.push(horizontal ? x * .55 : eastWest ? z * .55 : x * .55, horizontal ? z * .55 : y * .8);
    }
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...spec.position); mesh.name = spec.id; mesh.castShadow = mesh.receiveShadow = true;
    if (spec.id.startsWith('strata-')) mesh.rotation.y = spec.position[0] < 0 ? .18 : -.21;
    scene.add(mesh); return mesh;
  }
  function sampleRig(root, animationMixer, cache, pose, clipTime) {
    // AnimationMixer skips unchanged bindings. Restore the last authored sample,
    // rather than bind pose, before adding restrained cue offsets each render.
    for (const { bone, position, quaternion, scale } of cache) { bone.position.copy(position); bone.quaternion.copy(quaternion); bone.scale.copy(scale); }
    animationMixer.setTime(clipTime);
    for (const { bone, position, quaternion, scale } of cache) {
      position.copy(bone.position); quaternion.copy(bone.quaternion); scale.copy(bone.scale);
      const joint = pose.joints?.[bone.name];
      if (joint?.rotation) bone.quaternion.multiply(new THREE.Quaternion(...joint.rotation));
    }
    root.traverse(node => {
      if (!node.isMesh) return;
      for (const [name, value] of Object.entries(pose.morphs || {})) {
        const index = node.morphTargetDictionary?.[name]; if (index !== undefined) node.morphTargetInfluences[index] = value;
      }
    });
    root.updateMatrixWorld(true);
  }
  function render() {
    if (!resourceReady || disposed || !snapshot) return false;
    frame = sourceDesktopRenderFrame(snapshot); snapshot = frame.state;
    const layout = sourceDesktopLayout(width, height, snapshot.desktop);
    camera.left = -1.75 * width / layout.stageHeight; camera.right = -camera.left;
    camera.updateProjectionMatrix();
    scene.visible = snapshot.active;
    const pose = frame.body?.character;
    bodyRoot.visible = snapshot.active && !!pose;
    if (pose) {
      if (selectedClip !== frame.clip) {
        mixer.stopAllAction(); action = mixer.clipAction(clips.get(frame.clip) || clips.get('pressure_hold'));
        action.reset().play();
        echoMixer.stopAllAction(); echoMixer.clipAction(clips.get(frame.clip) || clips.get('pressure_hold')).reset().play();
        selectedClip = frame.clip;
      }
      bodyRoot.rotation.y = Math.PI + (snapshot.reducedMotion ? 0 : snapshot.intent.kind === 'loop' ? (snapshot.intent.progress - .5) * .14 : 0);
      sampleRig(bodyRoot, mixer, bones, pose, frame.clipTime);
      echoRoot.visible = snapshot.active && !!frame.echo;
      if (frame.echo) {
        echoRoot.rotation.y = bodyRoot.rotation.y;
        echoRoot.position.set(frame.echo.x - frame.body.x, 0, frame.echo.z - frame.body.z);
        sampleRig(echoRoot, echoMixer, echoBones, frame.echo.character, Math.max(0, frame.clipTime - (snapshot.reducedMotion ? 0 : .18)));
      }
    }
    for (const mat of materials) mat.opacity = frame.bodyOpacity;
    for (const mat of echoMaterials) mat.opacity = .27;
    for (const uniforms of shaderUniforms) { uniforms.openness.value = frame.openness; uniforms.rake.value = frame.rakeVisible ? 1 : 0; }
    shell.forEach((mesh, index) => {
      mesh.material.opacity = frame.shellRetention * .94;
      const side = index < 3 ? -1 : 1;
      mesh.position.x = SOURCE_DESKTOP_PLATES[index].position[0] + (snapshot.reducedMotion ? 0 : side * frame.openness * (.22 + snapshot.tier * .08));
    });
    covers.forEach((mesh, index) => { mesh.visible = index < snapshot.cover.count; mesh.material.opacity = .94; });
    guardPlate.visible = frame.guardVisible; rake.visible = frame.rakeVisible;
    modelGroups.forEach((root, index) => { root.visible = snapshot.active; root.rotation.z = (index ? -.10 : .07) * frame.openness; });
    ambient.intensity = snapshot.intent.kind === 'conceal' ? .68 : 1.1;
    renderer.info.reset();
    dither.render(scene,camera,{width,height,dpr,stageHeight:layout.stageHeight,snapshot}); renderCount++;
    return true;
  }
  const ready = (async () => {
    await ensureWorldLetteringFonts({ assetUrl: path });
    THREE = await import('three');
    const [{ GLTFLoader }, { clone: cloneRig }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/utils/SkeletonUtils.js')]);
    if (disposed) return false;
    renderer = new THREE.WebGLRenderer({ canvas: target, alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.8;
    renderer.info.autoReset = false;
    dither = createSourceDesktopDither(THREE,renderer,{assetUrl:path});
    scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-3, 3, 1.75, -1.75, .05, 40);
    camera.position.set(0, 2.35, 7); camera.lookAt(0, 1.1, 0);
    ambient = new THREE.HemisphereLight('#afc4b2', '#19221e', 1.1); scene.add(ambient);
    const key = new THREE.DirectionalLight('#c7d4be', 12); key.position.set(-3, 4, 4); scene.add(key);
    const rim = new THREE.DirectionalLight('#a8bdc7', 7); rim.position.set(3, 3, -3); scene.add(rim);
    const glyphs = glyphTexture(), pieces = new Map(sourceStrataGeometry().map(piece => [piece.id, piece]));
    for (const [index, spec] of SOURCE_DESKTOP_PLATES.entries()) {
      shell.push(pieceMesh(pieces.get(spec.id), spec, plateMaterial(glyphs, '#7b8877', .4 + index * .10)));
    }
    const base = pieceMesh(pieces.get('strata-west-course-0'), { id: 'source-desktop-footing', position: [0, -.12, 0], size: [2.2, .12, 1.15] }, plateMaterial(glyphs, '#697565', .15));
    base.receiveShadow = true;
    for (let index = 0; index < 3; index++) covers.push(pieceMesh(pieces.get('strata-east-course-0'), {
      id: `source-desktop-cover-${index}`, position: [(index - 1) * 1.15, .05 + index % 2 * .16, 1.0], size: [.85, .30, .32],
    }, plateMaterial(glyphs, '#89907b', 0)));
    guardPlate = pieceMesh(pieces.get('strata-east-course-3'), { id: 'source-desktop-hold-plate', position: [-.70, .46, 1.15], size: [.8, .65, .16] }, plateMaterial(glyphs, '#a1a58a', 0));
    rake = new THREE.SpotLight('#e1dcba', 4.0, 8, .09, .85, 1.4); rake.position.set(-2.8, .65, 3);
    rake.target.position.set(.25, 1.0, 0); scene.add(rake, rake.target);
    const loader = new GLTFLoader();
    const [character, propPack] = await Promise.all([loader.loadAsync(path('assets/pressure-character.glb')), loader.loadAsync(path('assets/conservatory-props.glb')),dither.ready]);
    collect(character.scene); collect(propPack.scene);
    if (disposed) { for (const value of owned) value.dispose?.(); for (const texture of textures) texture.dispose(); return false; }
    bodyRoot = character.scene; bodyRoot.name = 'source-desktop-borrowed-body'; scene.add(bodyRoot);
    mixer = new THREE.AnimationMixer(bodyRoot); clips = new Map(character.animations.map(clip => [clip.name, clip]));
    animationClips.push(...clips.keys());
    bodyRoot.traverse(node => {
      if (node.isBone) bones.push({ bone: node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
      if (node.isSkinnedMesh) { bodyMeshCount++; node.frustumCulled = false; }
      if (node.isMesh) for (const mat of [node.material].flat()) {
        mat.transparent = true; mat.opacity = .98; mat.roughness = Math.max(.65, mat.roughness); mat.metalness = Math.min(.12, mat.metalness);
        materials.push(mat);
      }
    });
    echoRoot = cloneRig(bodyRoot); echoRoot.name = 'source-desktop-loop-overprint'; echoRoot.visible = false; scene.add(echoRoot);
    echoMixer = new THREE.AnimationMixer(echoRoot);
    echoRoot.traverse(node => {
      if (node.isBone) echoBones.push({bone:node,position:node.position.clone(),quaternion:node.quaternion.clone(),scale:node.scale.clone()});
      if (node.isMesh) {
        const cloned=[node.material].flat().map(mat=>{const copy=own(mat.clone());copy.depthWrite=false;echoMaterials.push(copy);return copy;});
        node.material=Array.isArray(node.material)?cloned:cloned[0];
      }
    });
    for (const spec of [
      { id: 'upright_piano', x: -2.05, z: -.8, scale: .65, yaw: Math.PI + .25 },
      { id: 'open_instrument_case', x: 1.65, z: .25, scale: 1.45, yaw: Math.PI - .2 },
    ]) {
      const found = propPack.scene.getObjectByName(spec.id);
      if (!found) throw new Error(`Source architecture asset missing: ${spec.id}`);
      const root = found.clone(true); root.position.set(spec.x, .08, spec.z); root.scale.setScalar(spec.scale); root.rotation.y = spec.yaw;
      scene.add(root); modelGroups.push(root); modelIds.push(spec.id);
    }
    if (!bodyMeshCount || !clips.has('pressure_load') || !clips.has('pressure_listen')) throw new Error('Pressure rig or authored performance is unavailable');
    resourceReady = true; resize(width, height, dpr); render(); return true;
  })().catch(reason => { error = String(reason?.message || reason); onError?.(reason); throw reason; });

  function resize(w = target.clientWidth || 1280, h = target.clientHeight || 800, scale = globalThis.devicePixelRatio || 1) {
    const nextWidth=Math.max(1, finite(w, 1280)),nextHeight=Math.max(1, finite(h, 800)),nextDpr=clamp(scale, 1, 2);
    const changed=nextWidth!==width || nextHeight!==height || nextDpr!==dpr || !rendererSized;
    width=nextWidth; height=nextHeight; dpr=nextDpr;
    if (renderer && !disposed && changed) { renderer.setPixelRatio(dpr); renderer.setSize(width, height, false); rendererSized=true; render(); }
  }
  return {
    canvas: target, ready,
    update(value) { if (disposed) return false; snapshot = normalizeSourceDesktopSnapshot(value, snapshot); return render(); },
    resize,
    debug: () => ({ ready: resourceReady, disposed, error, renderCount, width, height, dpr,
      dither:dither?.debug(),
      skinnedMeshes: bodyMeshCount, bones: bones.length, animationClips, modelIds,
      plates: SOURCE_DESKTOP_PLATES.map(piece => piece.id), glyphLines: sourceDesktopGlyphLines().length,
      frame: frame && { openness: frame.openness, clip: frame.clip, clipTime: frame.clipTime, guardVisible: frame.guardVisible,
        rakeVisible: frame.rakeVisible, state: frame.state },
      gpu: renderer && { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } }),
    dispose() {
      if (disposed) return; disposed = true; mixer?.stopAllAction(); echoMixer?.stopAllAction();
      resourceReady = false; target.removeEventListener('webglcontextlost', contextLost);
      if (bodyRoot) mixer?.uncacheRoot(bodyRoot); if (echoRoot) echoMixer?.uncacheRoot(echoRoot);
      for (const value of owned) value.dispose?.(); for (const texture of textures) texture.dispose();
      dither?.dispose();
      renderer?.renderLists.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); scene?.clear();
      if (!canvas) target.remove();
    },
  };
}
