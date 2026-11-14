// Passive Uncontained presentation. The combat owner supplies every clock,
// transition, tell and cover value; this module never advances simulation.
import SOURCE_ATLAS from '../../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { sourceStrataGeometry } from '../data/source-exposed-strata.js';
import { normalizePressurePresentation } from '../game/pressure-performance.js';
import { hushDensityFromCaptured, normalizeHushDensityPose } from '../game/hush-density-performance.js';
import { pressureInstances, pressureSurfaceInstances } from './pressure-volume.js';
import {installHushCosmosMaterial,HUSH_COSMOS} from './hush-cosmos.js';
import { assetUrl } from '../platform/paths.js';
import { characterMorphs, parseCharacterAsset, sampleCharacterFrame } from './character-asset.js';
import { createSourceDesktopDither } from './source-desktop-dither.js';
import { createHushStageBackplane } from './hush-stage-backplane.js';
import { ensureWorldLetteringFonts } from './world-lettering-fonts.js';
import { fitWorldLetteringLine } from './world-lettering-layout.js';
import { sourceDesktopFailureBeat, SOURCE_DESKTOP_BREACH_SECONDS } from '../game/source-desktop-state.js';

export const SOURCE_DESKTOP_PROTOCOL = 1;
export const SOURCE_DESKTOP_DISSOLVE_SECONDS = SOURCE_DESKTOP_BREACH_SECONDS;
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, finite(n, min)));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
const phases = new Set(['contained', 'sealed', 'dissolving', 'desktop', 'reforming', 'ended']);
const intents = new Set(['broadcast', 'conceal', 'overload', 'loop', 'silence']);

export const SOURCE_DESKTOP_PRESSURE_ASSET = 'assets/hush-density.glb';

export async function loadSourceDesktopPressureAsset(loader, url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Density rig unavailable (${response.status})`);
  const bytes = await response.arrayBuffer();
  const asset = parseCharacterAsset(bytes);
  return { asset, character: await loader.parseAsync(bytes, '') };
}

// Compatibility target metadata for both performers. The stellar material
// samples world direction; neither this size nor a cropped viewport pins it.
export function setSourceDesktopHushViewport(materials, width, height, dpr = 1) {
  const scale = clamp(dpr, 1, 2);
  const w = Math.max(1, Math.floor(Math.max(1, finite(width, 1)) * scale));
  const h = Math.max(1, Math.floor(Math.max(1, finite(height, 1)) * scale));
  for (const material of materials) {
    const value = material?.userData?.hushCosmos?.viewport?.value;
    if (!value) continue;
    if (typeof value.set === 'function') value.set(w, h);
    else { value.x = w; value.y = h; }
  }
  return [w, h];
}

// The battle owner supplies this clock and intent. The captured density is an
// entry reference, not a live world actor: fighting never advances its gait or
// teaches it a new sound. Pause/focus remains owned by the existing session.
export function sourceDesktopDensityPerformance(state, capturedPerformance = {}) {
  const entry = hushDensityFromCaptured(capturedPerformance);
  const kind = state.intent.kind, progress = state.intent.progress;
  const reduced = state.reducedMotion;
  const compression = kind === 'overload' ? .36 + smooth(progress) * .58
    : kind === 'silence' ? .84 : kind === 'loop' ? .63 : kind === 'conceal' ? .46 : .34;
  return normalizeHushDensityPose({ ...entry,
    // The stage root is stationary. Its authored response can load or listen,
    // but a battle clock cannot spend walking distance under planted feet.
    phase: entry.phase, rate: 0, traction: 0, drive: 0, clearanceTurn: 0, doorDrop: 0, doorX: 0, doorZ: 0, doorEngaged: false,
    // The framed stage borrows the posture, not world-space footfall anchors
    // or a prior high-speed release from its now absent navigation root.
    feet: null, release: 0, pivot: false, pivotStart: null, pivotProgress: 0, settlingFeet: false, unsupported: false,
    compression, retained: Math.max(entry.retained, kind === 'silence' ? .84 : .32),
    attention: reduced ? 0 : kind === 'loop' ? (progress - .5) * .68 : entry.attention * .5,
    event: reduced || kind === 'silence' ? 'still' : kind === 'overload' ? 'load' : 'notice',
    eventTime: reduced ? 0 : progress * 4.8,
    listening: !reduced && !['overload', 'silence'].includes(kind), blocked: false,
    residualDragMps: 0,
  });
}

// Use the world renderer's actual pose, including post-clip support solves.
// Convert model-space joint matrices to local matrices; Three adds its own
// presentation transform once via the scene root and skinned-mesh binding.
export function createSourceDesktopPressureSampler(THREE, root, asset) {
  const joints = [], morphMeshes = [];
  const named = new Map(asset.nodes.map((node, index) => [node.name, index]));
  const entries = new Map(asset.entries.map(entry => [entry.name, entry]));
  root.traverse(node => {
    if (node.isBone) {
      const index = named.get(node.name);
      if (index === undefined) throw new Error(`Desktop pressure joint unavailable: ${node.name}`);
      joints.push({ node, index, parent: asset.nodes[index].parent });
    }
    if (node.isSkinnedMesh && node.morphTargetInfluences) {
      const entry = entries.get(node.name);
      if (entry?.morphCount) morphMeshes.push({ node, entry });
    }
  });
  const localMatrix = new THREE.Matrix4(), parentInverse = new THREE.Matrix4();
  function sample(descriptor = {}) {
    const { world, local } = sampleCharacterFrame(asset, descriptor);
    for (const { node, index, parent } of joints) {
      localMatrix.fromArray(world[index]);
      if (parent >= 0) localMatrix.premultiply(parentInverse.fromArray(world[parent]).invert());
      localMatrix.decompose(node.position, node.quaternion, node.scale);
    }
    for (const { node, entry } of morphMeshes) {
      const weights = characterMorphs(entry, local, descriptor);
      for (let i = 0; i < entry.morphCount; i++) node.morphTargetInfluences[i] = weights[i];
    }
    root.updateMatrixWorld(true);
    return descriptor;
  }
  return { sample, dispose() { joints.length = 0; morphMeshes.length = 0; },
    debug: () => ({ clips: [...asset.clips.keys()], joints: joints.length }) };
}

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
    breach: input.breach && phase === 'dissolving' ? { elapsed: clamp(input.breach.elapsed, 0, SOURCE_DESKTOP_DISSOLVE_SECONDS) } : null,
  };
}

export function sourceDesktopRenderFrame(input = {}, previous = null) {
  const state = normalizeSourceDesktopSnapshot(input, previous);
  const failure = state.breach ? sourceDesktopFailureBeat(state.breach.elapsed) : null;
  const openness = state.phase === 'desktop' ? 1 : state.phase === 'dissolving' ? smooth(failure ? failure.peel : state.transition)
    : state.phase === 'reforming' ? 1 - smooth(state.transition) : 0;
  const kind = state.intent.kind, p = state.intent.progress;
  const cue = kind === 'loop' ? 'double' : kind === 'overload' ? 'lean-in' : kind === 'conceal' ? 'turn' : kind === 'silence' ? 'dim' : 'lean';
  const captured = state.pressurePresentation?.primary;
  const actor = captured ? { ...captured, x: 0, y: 0, floorH: 0, heightM: 2.18, clearanceM: null, mode: 'live', strength: .96,
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
  actor.performance.density = sourceDesktopDensityPerformance(state, captured?.performance || actor.performance);
  // This encounter performs HUSH's density. A captured offered-hand human
  // trace remains at its Source encounter, rather than becoming a battle echo.
  actor.referenceTrace = false;
  const instances = pressureInstances(actor, null, { reducedMotion: state.reducedMotion, reduceFlash: state.reduceFlash });
  const body = instances[0], echo = instances[1] || null;
  const surface = pressureSurfaceInstances(body ? [body] : [])[0] || null;
  const echoSurface = pressureSurfaceInstances(echo ? [echo] : [])[0] || null;
  return { state, openness, body, echo, surface, echoSurface, clip: body?.character.clip || clip,
    clipTime: body?.character.time ?? clipTime, failure,
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

// The apparent device failure belongs to the passive stage, above the command
// island. It cannot obscure, focus or consume any live combat control.
export function sourceDesktopDiagnosticLayout(width, height, desktop = null) {
  const stage = sourceDesktopLayout(width, height, desktop);
  const padding = clamp(stage.width * .05, 12, 64);
  return { x: 0, y: 0, width: stage.width, height: stage.stageHeight, padding,
    titleSize: clamp(stage.stageHeight * .105, 17, 48),
    textSize: clamp(stage.stageHeight * .041, 10, 18) };
}

export function paintSourceDesktopDiagnostic(ctx, bounds, { opacity = 1 } = {}) {
  if (!ctx || !bounds || !(opacity > 0)) return false;
  const { width, height, padding: pad, titleSize, textSize } = bounds;
  ctx.save();ctx.globalAlpha = opacity;ctx.beginPath();ctx.rect(0, 0, width, height);ctx.clip();
  ctx.fillStyle = '#073463';ctx.fillRect(0, 0, width, height);ctx.fillStyle = '#e6ece1';
  ctx.textBaseline = 'top';ctx.font = `${Math.max(9, textSize * .7)}px "World Lettering Mono", monospace`;
  ctx.fillText('SOURCE / OUTPUT FAILURE', pad, pad, Math.max(1, width - pad * 2));
  const top = pad + Math.min(44, height * .17);
  ctx.font = `${titleSize}px "World Lettering Sans", sans-serif`;
  ctx.fillText('The output is still occupied.', pad, top, Math.max(1, width - pad * 2));
  ctx.font = `${textSize}px "World Lettering Mono", monospace`;
  ctx.fillText('RETURN_PATH_NOT_RELEASED', pad, top + titleSize * 1.7, Math.max(1, width - pad * 2));
  if (height > 220) {
    ctx.fillStyle = '#b2c5cd';
    ctx.fillText('The signal has retained its owner.', pad, top + titleSize * 1.7 + textSize * 2, Math.max(1, width - pad * 2));
    ctx.fillText('SOURCE: THE RECORDIST   /   INPUT: RETAINED', pad, height - pad - textSize, Math.max(1, width - pad * 2));
  }
  ctx.restore();return true;
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

// Production density uses an opaque absence and its fitted physical return.
// Both enter the existing transparent acquisition/dither together. The retained
// human-reference compatibility path below still supports its finite hulls;
// those are never generated for the density asset.
export function finishSourceDesktopPressure(THREE, root, { own = value => value } = {}) {
  const meshes = [], cores = [], glows = [], returns = [], volumes = [];
  root.traverse(node => { if (node.isMesh) meshes.push(node); });
  if (meshes.some(mesh => mesh.name === 'hush_density_core')) {
    for (const mesh of meshes) {
      mesh.frustumCulled = false;
      if (mesh.name === 'hush_density_core') {
        const material = own(installHushCosmosMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff,
          side: THREE.DoubleSide, depthTest: true, depthWrite: true, fog: false, toneMapped: false })));
        mesh.material = material; cores.push(material);
      } else if (mesh.name === 'hush_density_return') {
        // This is the real, fitted surface supplied by the same production
        // asset as the world pass, not an expanded screen-space white outline.
        returns.push(mesh);
      } else if (mesh.name === 'hush_density_volume') {
        mesh.visible = false; volumes.push(mesh);
      }
    }
    return { cores, glows, returns, volumes };
  }
  const bands = [[.012, .72], [.027, .33], [.050, .18], [.082, .10], [.120, .052], [.170, .025]];
  for (const mesh of meshes) {
    const core = own(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true,
      opacity: 1, side: THREE.DoubleSide, depthTest: true, depthWrite: true, fog: false, toneMapped: false }));
    // Concave expanded hulls can otherwise cross in front of ribs and collar.
    // Queue the alpha-one core after their radiance so the complete projected
    // surface seals black; real foreground scenery still wins the depth test.
    core.forceSinglePass = true;
    mesh.material = core; mesh.renderOrder = 2; mesh.frustumCulled = false; cores.push(core);
    for (const [radius, opacity] of bands) {
      const material = own(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide,
        transparent: true, opacity, depthTest: true, depthWrite: false, fog: false, toneMapped: false }));
      material.onBeforeCompile = shader => {
        shader.uniforms.sourcePressureRadius = { value: radius };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float sourcePressureRadius;')
          .replace('#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )', '#if 1')
          .replace('#include <project_vertex>', 'transformed += normalize(objectNormal) * sourcePressureRadius;\n#include <project_vertex>');
      };
      material.customProgramCacheKey = () => 'source-desktop-white-pressure-hull-v1';
      const shell = mesh.clone(false);
      shell.name = `${mesh.name}:white-radiance:${radius}`;
      shell.material = material; shell.renderOrder = 1; shell.frustumCulled = false;
      // Sharing the live skeleton and influence array prevents a second pose,
      // independent animation clock or stale glow when a cue deforms the body.
      if (mesh.morphTargetInfluences) shell.morphTargetInfluences = mesh.morphTargetInfluences;
      mesh.parent.add(shell);
      glows.push({ material, opacity, radius });
    }
  }
  return { cores, glows, returns, volumes };
}

export function createSourceDesktopView({ canvas = null, container = null, assetBase = null, onError = null } = {}) {
  const target = canvas || globalThis.document?.createElement('canvas');
  if (!target) throw new Error('Source desktop view requires a canvas');
  if (!canvas && container) container.append(target);
  Object.assign(target.style, { pointerEvents:'none', display:'block', width:'100%', height:'100%' });
  target.setAttribute('aria-hidden', 'true');
  const diagnostic = target.ownerDocument?.createElement('canvas') || null;
  if (diagnostic) {
    diagnostic.setAttribute('aria-hidden', 'true');
    diagnostic.dataset.sourceDesktopDiagnostic = 'held';
    Object.assign(diagnostic.style, { position:'absolute',left:'0',top:'0',width:'100%',height:'100%',pointerEvents:'none',display:'none' });
    target.parentNode?.insertBefore(diagnostic, target.nextSibling);
  }
  let THREE, renderer, dither, scene, camera, bodyRoot, echoRoot, bodySampler, echoSampler, disposed = false;
  let snapshot = null, frame = null, error = null, renderCount = 0, resourceReady = false;
  let width = 1280, height = 800, dpr = 1, rendererSized = false;
  const owned = new Set(), textures = new Set(), shell = [], covers = [], materials = [], echoMaterials = [];
  const modelIds = [], animationClips = [], shaderUniforms = [], modelGroups = [], bodyGlows = [], echoGlows = [];
  let bodySurfaces = [], echoSurfaces = [], bodyVolumes = [], echoVolumes = [];
  let guardPlate, rake, ambient, bodyMeshCount = 0;
  const path = p => assetBase ? new URL(p, assetBase).href : assetUrl(p);
  const own = value => { owned.add(value); return value; };
  const contextLost = event => {
    event.preventDefault();
    if (disposed) return;
    resourceReady = false; error = 'Source desktop WebGL context lost';
    if (diagnostic) diagnostic.style.display = 'none';
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
  function render() {
    if (!resourceReady || disposed || !snapshot) return false;
    frame = sourceDesktopRenderFrame(snapshot); snapshot = frame.state;
    const layout = sourceDesktopLayout(width, height, snapshot.desktop);
    camera.left = -1.75 * width / layout.stageHeight; camera.right = -camera.left;
    camera.updateProjectionMatrix();
    scene.visible = snapshot.active;
    const pose = frame.body?.character;
    bodyRoot.visible = snapshot.active && !!pose;
    echoRoot.visible = snapshot.active && !!frame.echo;
    if (pose) {
      // World headings use the opposite sign to Three's Y rotation.
      bodyRoot.rotation.y = -frame.body.yaw;
      bodyRoot.scale.set(frame.body.scale * (frame.body.scaleX ?? 1),
        frame.body.scale * (frame.body.scaleY ?? 1), frame.body.scale * (frame.body.scaleZ ?? 1));
      bodySampler.sample(pose);
      for (const mesh of bodySurfaces) mesh.visible = !!frame.surface;
      for (const mesh of bodyVolumes) mesh.visible = frame.body.mesh === 'hush_density_volume';
      if (frame.echo) {
        echoRoot.rotation.y = -frame.echo.yaw;
        echoRoot.scale.set(frame.echo.scale * (frame.echo.scaleX ?? 1),
          frame.echo.scale * (frame.echo.scaleY ?? 1), frame.echo.scale * (frame.echo.scaleZ ?? 1));
        echoRoot.position.set(frame.echo.x - frame.body.x, frame.echo.y - frame.body.y, frame.echo.z - frame.body.z);
        echoSampler.sample(frame.echo.character);
        for (const mesh of echoSurfaces) mesh.visible = !!frame.echoSurface;
        for (const mesh of echoVolumes) mesh.visible = frame.echo.mesh === 'hush_density_volume';
      }
    }
    // Intent changes the radiance, never washes the black body into grey.
    for (const { material, opacity } of bodyGlows) material.opacity = opacity * frame.bodyOpacity;
    for (const { material, opacity } of echoGlows) material.opacity = opacity * .27;
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
    setSourceDesktopHushViewport([...materials, ...echoMaterials], width, height, dpr);
    renderer.info.reset();
    dither.render(scene,camera,{width,height,dpr,stageHeight:layout.stageHeight,snapshot}); renderCount++;
    if (diagnostic) {
      const w=Math.round(width*dpr),h=Math.round(height*dpr);
      if(diagnostic.width!==w)diagnostic.width=w;if(diagnostic.height!==h)diagnostic.height=h;
      const context=diagnostic.getContext('2d');
      if(context){
        context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);
        const visible=snapshot.active&&(frame.failure?.diagnostic||0)>0;
        diagnostic.style.display=visible?'block':'none';
        diagnostic.dataset.sourceDesktopDiagnostic=frame.failure?.stage||'exposed';
        if(visible)paintSourceDesktopDiagnostic(context,sourceDesktopDiagnosticLayout(width,height,snapshot.desktop),{opacity:frame.failure.diagnostic});
      }
    }
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
    const backplane = createHushStageBackplane(THREE, .70);
    backplane.position.z = -1.2;
    own(backplane.geometry); own(backplane.material);
    scene.add(backplane);
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
    const [{ asset, character }, propPack] = await Promise.all([
      loadSourceDesktopPressureAsset(loader, path(SOURCE_DESKTOP_PRESSURE_ASSET)),
      loader.loadAsync(path('assets/conservatory-props.glb')), dither.ready,
    ]);
    collect(character.scene); collect(propPack.scene);
    if (disposed) { for (const value of owned) value.dispose?.(); for (const texture of textures) texture.dispose(); return false; }
    bodyRoot = character.scene; bodyRoot.name = 'source-desktop-density'; scene.add(bodyRoot);
    animationClips.push(...character.animations.map(clip => clip.name));
    bodyRoot.traverse(node => {
      if (node.isSkinnedMesh) { bodyMeshCount++; node.frustumCulled = false; }
    });
    echoRoot = cloneRig(bodyRoot); echoRoot.name = 'source-desktop-loop-overprint'; echoRoot.visible = false; scene.add(echoRoot);
    bodySampler = createSourceDesktopPressureSampler(THREE, bodyRoot, asset);
    echoSampler = createSourceDesktopPressureSampler(THREE, echoRoot, asset);
    const bodyFinish = finishSourceDesktopPressure(THREE, bodyRoot, { own });
    const echoFinish = finishSourceDesktopPressure(THREE, echoRoot, { own });
    materials.push(...bodyFinish.cores); bodyGlows.push(...bodyFinish.glows);
    echoMaterials.push(...echoFinish.cores); echoGlows.push(...echoFinish.glows);
    bodySurfaces = bodyFinish.returns; echoSurfaces = echoFinish.returns;
    bodyVolumes = bodyFinish.volumes; echoVolumes = echoFinish.volumes;
    for (const spec of [
      { id: 'upright_piano', x: -2.05, z: -.8, scale: .65, yaw: Math.PI + .25 },
      { id: 'open_instrument_case', x: 1.65, z: .25, scale: 1.45, yaw: Math.PI - .2 },
    ]) {
      const found = propPack.scene.getObjectByName(spec.id);
      if (!found) throw new Error(`Source architecture asset missing: ${spec.id}`);
      const root = found.clone(true); root.position.set(spec.x, .08, spec.z); root.scale.setScalar(spec.scale); root.rotation.y = spec.yaw;
      scene.add(root); modelGroups.push(root); modelIds.push(spec.id);
    }
    if (!bodyMeshCount || !['posture_root','pelvis','chest','head','thigh_L','thigh_R','foot_L','foot_R'].every(name=>bodyRoot.getObjectByName(name)) ||
      !['pressure_approach', 'density_listen', 'density_idle'].every(name => animationClips.includes(name))) {
      throw new Error('Density rig or authored performance is unavailable');
    }
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
      pressureAsset: SOURCE_DESKTOP_PRESSURE_ASSET,
      skinnedMeshes: bodyMeshCount, bones: bodySampler?.debug().joints || 0, animationClips, modelIds,
      pressureFinish: { core: 'world-fixed-black-stellar-field', cosmicRevision:HUSH_COSMOS.revision, surface: 'physical-skinned-return', glow: 'diagnostic-volume-only',
        surfaceMeshes: bodySurfaces.length,
        coreMaterials: materials.length + echoMaterials.length, glowBands: bodyGlows.length,
        maxGlowRadiusM: Math.max(0, ...bodyGlows.map(band => band.radius)) },
      plates: SOURCE_DESKTOP_PLATES.map(piece => piece.id), glyphLines: sourceDesktopGlyphLines().length,
      frame: frame && { openness: frame.openness, clip: frame.clip, clipTime: frame.clipTime, failure:frame.failure, guardVisible: frame.guardVisible,
        rakeVisible: frame.rakeVisible, state: frame.state },
      gpu: renderer && { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures } }),
    dispose() {
      if (disposed) return; disposed = true;
      diagnostic?.remove();
      resourceReady = false; target.removeEventListener('webglcontextlost', contextLost);
      bodySampler?.dispose(); echoSampler?.dispose();
      for (const value of owned) value.dispose?.(); for (const texture of textures) texture.dispose();
      dither?.dispose();
      renderer?.renderLists.dispose(); renderer?.dispose(); renderer?.forceContextLoss(); scene?.clear();
      if (!canvas) target.remove();
    },
  };
}
