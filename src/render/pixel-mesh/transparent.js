// Transparent performers enter the same acquisition shader as the
// world. Coverage is transported separately from the encoded acquisition depth.
import { PIXEL_MESH_FRAG } from './shader.js';
import { getLookProfile } from '../look-profiles.js';
import { screenUniforms } from './screens.js';
import { assetUrl as defaultAssetUrl } from '../../platform/paths.js';

const VERTEX = `precision highp float;
in vec3 position;
void main(){gl_Position=vec4(position,1.0);}`;

export function createTransparentPixelMesh(THREE, renderer, {
  assetUrl = defaultAssetUrl, profile: defaultProfile = 'hush', pressureFinish = false,
} = {}) {
  const resolveProfile = value => typeof value === 'object' && value?.vfd && value?.recording
    ? value : getLookProfile(value);
  let profile = resolveProfile(defaultProfile), vfd = profile.vfd, recording = profile.recording;
  let screenId = vfd.screen, screen = screenUniforms(screenId);
  let disposed = false, renderCount = 0, bufferWidth = 0, bufferHeight = 0;
  let sourceWidth = 0, sourceHeight = 0, noiseReady = false, sourceUnitScale = 1;
  const positive = (value, fallback = 1) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  blank.needsUpdate = true;
  const pendingNoise = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  pendingNoise.needsUpdate = true;
  let noise = pendingNoise;
  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: true, stencilBuffer: false, samples: 4,
  });
  sceneTarget.texture.name = 'transparent-linear-coverage';
  sceneTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  const acquisitionTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false,
  });
  acquisitionTarget.texture.name = 'transparent-acquisition-depth';
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const postCamera = new THREE.Camera(), postScene = new THREE.Scene();
  const uniforms = Object.fromEntries([
    ['uSrc', acquisitionTarget.texture], ['uDepth', acquisitionTarget.texture], ['uPrev', blank],
    ['uMarks', blank], ['uNoise', pendingNoise], ['uNoiseSize', new THREE.Vector2(64, 64)],
    ['uBlackPoint', vfd.blackPoint], ['uWhitePoint', vfd.whitePoint], ['uToneGamma', vfd.toneGamma],
    ['uGrade', new THREE.Vector4(0, 1, 1, 0)], ['uGradePlate', new THREE.Vector2(0, 1)],
    ['uLineAmount', vfd.lineAmount], ['uToneAmount', vfd.toneAmount],
    ['uMarkDensityGain', 1], ['uMarkGrainGain', 1], ['uRes', new THREE.Vector2()],
    ['uCam', new THREE.Vector3()], ['uYaw', 0], ['uPitch', 0], ['uCellMeters', 1],
    ['uTime', 0], ['uDt', 1 / 60], ['uCellPx', vfd.cellPx],
    ['uBaseRetention', vfd.baseRetention], ['uPaletteAmount', vfd.paletteAmount],
    ['uPaletteChroma', vfd.paletteChroma], ['uShadowLift', vfd.shadowLift], ['uAgitation', 0],
    ['uSignalAmount', vfd.signalGain], ['uEdgeGain', vfd.edgeGain], ['uCoverage', vfd.coverage],
    ['uGlowAmount', vfd.glow], ['uPersistenceMs', 16], ['uAperture', vfd.aperture], ['uAmberAmount', vfd.amber],
    ['uAudio', 0], ['uFear', 0], ['uReduceFlash', 0], ['uReduceMotion', 0],
    ['uRecordingCaptureMix', recording.captureMix], ['uRecordingExposure', 1], ['uRecordingSensitivity', 1],
    ['uRecordingPatternScale', recording.patternScale], ['uRecordingBlackFloor', recording.blackFloor],
    ['uRecordingDensityGamma', recording.densityGamma], ['uRecordingThresholdNoise', recording.thresholdNoise],
    ['uRecordingIrregularity', recording.thresholdIrregularity], ['uRecordingTemporalHz', recording.temporalHz],
    ['uRecordingTemporalSmear', recording.temporalSmear], ['uRecordingScenePinning', recording.scenePinning],
    ['uRecordingFearGain', recording.fearGain], ['uRecordingAudioGain', recording.audioGain],
    ['uDebugSource', 0], ['uForceSignal', 0], ['uMovement', 0], ['uHushBodyPost', new THREE.Vector4()],
    ['uScreenKind', screen.kind], ['uScreenPeriodPx', screen.periodPx], ['uScreenAngles', new THREE.Vector3(...screen.angles)],
    ['uScreenBands', new THREE.Vector2(...screen.bands)], ['uScreenSharpness', screen.sharpness],
    ['uScreenGrainFollow', screen.grainFollow], ['uScreenJitter', screen.jitter],
    ['uSourceCoverage', sceneTarget.texture], ['uSourceProjectionInverse', new THREE.Matrix4()],
    ['uSourceCameraWorld', new THREE.Matrix4()], ['uSourceViewport', new THREE.Vector4()],
    ['uSourceScreenOffset', new THREE.Vector2()],
    ['uSourcePressureFinish', pressureFinish ? 1 : 0],
  ].map(([name, value]) => [name, { value }]));
  const ditherMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERTEX,
    fragmentShader: PIXEL_MESH_FRAG.replace(/^#version 300 es\s*/, ''),
    defines: { SOURCE_DESKTOP_TRANSPARENT: 1 }, uniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
  // A render target receives linear light without Three's display conversion.
  // Unpremultiply its coverage, then apply the same ACES/exposure/sRGB mapping
  // the original directly rendered canvas used, exactly once before recording.
  const acquisitionUniforms = {
    source: { value: sceneTarget.texture }, depth: { value: sceneTarget.depthTexture },
    resolution: { value: new THREE.Vector2() },
    projectionInverse: { value: new THREE.Matrix4() },
    toneMappingExposure: { value: renderer.toneMappingExposure },
  };
  const acquisitionMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERTEX,
    fragmentShader: `precision highp float;
      uniform sampler2D source,depth;
      uniform vec2 resolution;
      uniform mat4 projectionInverse;
      out vec4 result;
      ${THREE.ShaderChunk.tonemapping_pars_fragment}
      ${THREE.ShaderChunk.colorspace_pars_fragment}
      void main(){
        vec2 uv=gl_FragCoord.xy/resolution;
        vec4 raw=texture(source,uv);
        if(raw.a<=0.0){result=vec4(0.0);return;}
        vec3 linear=raw.rgb/max(raw.a,1e-6);
        vec3 display=sRGBTransferOETF(vec4(ACESFilmicToneMapping(linear),1.0)).rgb;
        // Perspective depth is hyperbolic. Reconstruct with the real camera
        // projection so a close human face cannot acquire far-plane marks.
        // The same equation also preserves orthographic hand/desktop depth.
        vec4 view=projectionInverse*vec4(uv*2.0-1.0,texture(depth,uv).r*2.0-1.0,1.0);
        float viewDepth=max(0.0,-view.z/view.w);
        result=vec4(display,1.0/(1.0+.14*viewDepth));
      }`, uniforms: acquisitionUniforms,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
  const quad = new THREE.Mesh(geometry, acquisitionMaterial); quad.frustumCulled = false; postScene.add(quad);
  const savedViewport = new THREE.Vector4(), savedClear = new THREE.Color();
  const sourceUnitMatrix = new THREE.Matrix4();
  const ready = new THREE.TextureLoader().loadAsync(String(assetUrl('assets/blue-noise-64.png'))).then(texture => {
    if (disposed) { texture.dispose(); return false; }
    texture.colorSpace = THREE.NoColorSpace; texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.generateMipmaps = false;
    noise = texture; uniforms.uNoise.value = texture; noiseReady = true; return true;
  });

  // The expensive lit geometry may be capped; acquisition and screening stay
  // at output resolution so presentation never stretches or blurs the marks.
  function resize(width, height, dpr = 1, sceneScale = 1) {
    const w = Math.max(1, Math.floor(width * positive(dpr))), h = Math.max(1, Math.floor(height * positive(dpr)));
    const scale = Math.min(1, positive(sceneScale));
    const sw = Math.max(1, Math.round(w * scale)), sh = Math.max(1, Math.round(h * scale));
    if (sw !== sourceWidth || sh !== sourceHeight) {
      sourceWidth = sw; sourceHeight = sh; sceneTarget.setSize(sw, sh);
    }
    if (w === bufferWidth && h === bufferHeight) return;
    bufferWidth = w; bufferHeight = h;
    acquisitionTarget.setSize(w, h);
    uniforms.uRes.value.set(w, h); acquisitionUniforms.resolution.value.set(w, h);
  }

  function setLook(nextProfile, nextScreen, cellSize, cellScale, screenScale) {
    profile = resolveProfile(nextProfile); vfd = profile.vfd; recording = profile.recording;
    screenId = nextScreen ?? vfd.screen; screen = screenUniforms(screenId);
    for (const key of ['blackPoint', 'whitePoint', 'toneGamma', 'lineAmount', 'toneAmount',
      'baseRetention', 'paletteAmount', 'paletteChroma', 'shadowLift', 'edgeGain', 'coverage', 'aperture']) {
      uniforms['u' + key[0].toUpperCase() + key.slice(1)].value = vfd[key];
    }
    uniforms.uSignalAmount.value = vfd.signalGain;
    uniforms.uGlowAmount.value = vfd.glow;
    uniforms.uAmberAmount.value = vfd.amber;
    for (const [uniform, field] of Object.entries({ CaptureMix: 'captureMix', PatternScale: 'patternScale',
      BlackFloor: 'blackFloor', DensityGamma: 'densityGamma', ThresholdNoise: 'thresholdNoise',
      Irregularity: 'thresholdIrregularity', TemporalHz: 'temporalHz', TemporalSmear: 'temporalSmear',
      ScenePinning: 'scenePinning', FearGain: 'fearGain', AudioGain: 'audioGain' })) {
      uniforms['uRecording' + uniform].value = recording[field];
    }
    uniforms.uCellPx.value = (cellSize === 'auto' ? vfd.cellPx : Math.max(2, Math.min(24, positive(cellSize, vfd.cellPx)))) * cellScale;
    uniforms.uScreenKind.value = screen.kind;
    uniforms.uScreenPeriodPx.value = screen.periodPx * screenScale;
    uniforms.uScreenAngles.value.set(...screen.angles);
    uniforms.uScreenBands.value.set(...screen.bands);
    uniforms.uScreenSharpness.value = screen.sharpness;
    uniforms.uScreenGrainFollow.value = screen.grainFollow;
    uniforms.uScreenJitter.value = screen.jitter;
  }

  return {
    ready, resize,
    // cellScale converts logical cells to output pixels. screenScale converts
    // the world's internal-pixel hatch period to output pixels. They differ
    // when the world uses a reduced render scale or the canvas is already sized
    // in physical pixels. screenOffset is the stage's bottom-left plate origin.
    render(scene, camera, {
      width, height, dpr = 1, stageHeight = height, snapshot = {}, sceneScale = 1,
      profile: nextProfile = defaultProfile, screen: nextScreen, cellSize = 'auto',
      cellScale = dpr, screenScale = dpr,
      screenOffset = [0, 0], worldUnitScale = 1,
    }) {
      if (disposed) return false;
      dpr = positive(dpr);
      resize(width, height, dpr, sceneScale);
      setLook(nextProfile, nextScreen, cellSize, positive(cellScale), positive(screenScale));
      uniforms.uSourceScreenOffset.value.set(Number(screenOffset[0]) || 0, Number(screenOffset[1]) || 0);
      const stagePixels = Math.max(1, Math.min(bufferHeight, Math.round(stageHeight * dpr)));
      const stageBottom = bufferHeight - stagePixels;
      camera.updateMatrixWorld(true);
      // Geometry and picking may use enlarged layout units. Acquisition depth
      // and world-pinned marks still use metres: scale camera-space points,
      // then translate by the camera's physical position without scaling its
      // orientation a second time. The actual source camera remains untouched.
      const metresPerUnit = sourceUnitScale = positive(worldUnitScale);
      uniforms.uSourceProjectionInverse.value.copy(camera.projectionMatrixInverse);
      uniforms.uSourceCameraWorld.value.copy(camera.matrixWorld);
      if (metresPerUnit !== 1) {
        sourceUnitMatrix.makeScale(metresPerUnit, metresPerUnit, metresPerUnit);
        uniforms.uSourceProjectionInverse.value.premultiply(sourceUnitMatrix);
        for (const index of [12, 13, 14]) uniforms.uSourceCameraWorld.value.elements[index] *= metresPerUnit;
      }
      uniforms.uSourceViewport.value.set(0, stageBottom, bufferWidth, stagePixels);
      uniforms.uTime.value = Math.max(0, Number(snapshot.clock) || 0);
      uniforms.uReduceMotion.value = snapshot.reducedMotion ? 1 : 0;
      uniforms.uReduceFlash.value = snapshot.reduceFlash ? 1 : 0;
      uniforms.uAudio.value = Math.max(0, Math.min(1, Number(snapshot.audio) || 0));
      uniforms.uFear.value = Math.max(0, Math.min(1, Number(snapshot.fear) || 0));
      acquisitionUniforms.projectionInverse.value.copy(uniforms.uSourceProjectionInverse.value);
      acquisitionUniforms.toneMappingExposure.value = renderer.toneMappingExposure;
      const targetBefore = renderer.getRenderTarget(), autoClearBefore = renderer.autoClear;
      const scissorBefore = renderer.getScissorTest(), clearAlphaBefore = renderer.getClearAlpha();
      renderer.getViewport(savedViewport); renderer.getClearColor(savedClear);
      try {
        renderer.autoClear = false; renderer.setScissorTest(false); renderer.setClearColor(0x000000, 0);
        const sourceStagePixels = Math.max(1, Math.round(stagePixels * sourceHeight / bufferHeight));
        sceneTarget.viewport.set(0, sourceHeight - sourceStagePixels, sourceWidth, sourceStagePixels);
        renderer.setRenderTarget(sceneTarget); renderer.clear(true, true, true);
        renderer.render(scene, camera);
        acquisitionTarget.viewport.set(0, 0, bufferWidth, bufferHeight);
        renderer.setRenderTarget(acquisitionTarget); renderer.clear(true, false, false);
        quad.material = acquisitionMaterial; renderer.render(postScene, postCamera);
        renderer.setRenderTarget(null); renderer.setViewport(0, 0, width, height); renderer.clear(true, true, true);
        quad.material = ditherMaterial; renderer.render(postScene, postCamera);
        renderCount++; return true;
      } finally {
        renderer.setRenderTarget(targetBefore); renderer.setViewport(savedViewport);
        renderer.setClearColor(savedClear, clearAlphaBefore); renderer.setScissorTest(scissorBefore);
        renderer.autoClear = autoClearBefore;
      }
    },
    debug: () => ({ shader: 'pixel-mesh', profile: profile.id, screen: screenId,
      renderCount, noiseReady, depthReconstruction: 'inverse-projection', coveragePreserved: true,
      temporalMemory: false, worldUnitScale: sourceUnitScale, width: bufferWidth, height: bufferHeight,
      sourceWidth, sourceHeight, cellPx: uniforms.uCellPx.value, screenPeriodPx: uniforms.uScreenPeriodPx.value, disposed }),
    dispose() {
      if (disposed) return; disposed = true;
      sceneTarget.dispose(); acquisitionTarget.dispose(); sceneTarget.depthTexture?.dispose();
      acquisitionMaterial.dispose(); ditherMaterial.dispose(); geometry.dispose();
      blank.dispose(); pendingNoise.dispose(); if (noise !== pendingNoise) noise.dispose(); postScene.clear();
    },
  };
}
