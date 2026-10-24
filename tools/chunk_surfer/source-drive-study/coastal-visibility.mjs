// Browser-side explicit readback only. No renderer, material, exposure, scene
// object, or projection is replaced. Keep this closure-free for page.evaluate.
export async function captureCoastalVisibility({ mesh, positions }) {
  const R = await import('/src/render/r3d.js'), P = await import('/src/render/props3d.js');
  const C = await import('/src/render/coastal-memory-renderer.js');
  const state = __probe.coastalMemory.state(), camera = R.r3dViewCamera(), frame = C.coastalMemoryRenderFrame(state);
  const prop = frame.scene.props.find(p => p.mesh === mesh); if (!prop) throw Error('Target prop not submitted: ' + mesh);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const multiply = (a, b) => { const out = Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return out; };
  const point = (p, m) => [0, 1, 2].map(i => m[i] * p[0] + m[i + 4] * p[1] + m[i + 8] * p[2] + m[i + 12]);
  const catalog = P.installAuthoredPropMeshes((gl, pack) => { const m = pack.catalog.get(mesh); if (!m) throw Error('Target mesh absent: ' + mesh); return { nodeMatrix: Array.from(m.nodeMatrix || identity), bounds: m.extras?.bounds }; });
  const model = multiply(prop.matrix, catalog.nodeMatrix), projected = [];
  for (let i = 0; i < positions.length; i += 3) { const p = point(positions.slice(i, i + 3), model); projected.push(R.r3dProjectWorld({ x: p[0], y: p[1], z: p[2] })); }
  const props = R.r3dCaptureStageCanvas('props'); if (!props) throw Error('Actual P3 stage unavailable.');
  let scene, exact = null, intercepted = 0;
  P.installAuthoredPropMeshes(gl => {
    const native = gl.readPixels;
    try {
      gl.readPixels = function (...args) {
        const result = native.apply(this, args);
        if (args[5] === gl.FLOAT && args[6] instanceof Float32Array) { exact = new Float32Array(args[6]); intercepted++; }
        return result;
      };
      scene = R.r3dCaptureStageCanvas('scene');
    } finally { gl.readPixels = native; }
    return true;
  });
  const vfd = R.r3dCaptureStageCanvas('vfd');
  if (!scene || !vfd || !exact || intercepted !== 1 || exact.length !== scene.width * scene.height * 4) throw Error('One exact FLOAT scene readback required.');
  if ([scene, vfd].some(c => c.width !== props.width || c.height !== props.height)) throw Error('Stage target dimensions differ.');
  const width = scene.width, height = scene.height;
  const box = { minX: Math.min(...projected.map(p => p.x)) * width, maxX: Math.max(...projected.map(p => p.x)) * width,
    minY: Math.min(...projected.map(p => p.y)) * height, maxY: Math.max(...projected.map(p => p.y)) * height };
  const region = { x: Math.max(0, Math.floor(box.minX) - 8), y: Math.max(0, Math.floor(box.minY) - 8),
    right: Math.min(width, Math.ceil(box.maxX) + 8), bottom: Math.min(height, Math.ceil(box.maxY) + 8) };
  region.width = region.right - region.x; region.height = region.bottom - region.y;
  if (region.width < 1 || region.height < 1 || region.width * region.height > 100000) throw Error('Target readback crop exceeds the bounded diagnostic.');
  const p3 = props.getContext('2d').getImageData(0, 0, width, height).data, ink = vfd.getContext('2d').getImageData(0, 0, width, height).data, values = [];
  for (let y = region.y; y < region.bottom; y++) for (let x = region.x; x < region.right; x++) {
    const i = (y * width + x) * 4, j = ((height - 1 - y) * width + x) * 4;
    values.push(p3[i] / 255, p3[i + 1] / 255, p3[i + 2] / 255, exact[j], exact[j + 1], exact[j + 2], exact[j + 3], ink[i] / 255, ink[i + 1] / 255, ink[i + 2] / 255);
  }
  const stages = [props, scene, vfd].map((canvas, i) => {
    const crop = document.createElement('canvas'); crop.width = region.width; crop.height = region.height;
    crop.getContext('2d').drawImage(canvas, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height);
    return { name: ['props-linear-byte', 'scene-post-water-linear', 'vfd-final'][i], dataUrl: canvas.toDataURL('image/png'), cropDataUrl: crop.toDataURL('image/png') };
  });
  return { mesh, state, camera, model, propId: prop.id, catalog, width, height, projectedBox: box, region, values, stages,
    channels: ['p3R', 'p3G', 'p3B', 'sceneR', 'sceneG', 'sceneB', 'sceneAlpha', 'vfdR', 'vfdG', 'vfdB'],
    targets: { near: P.propTargets().near, far: P.propTargets().far }, lighting: R.r3dLightingDebug(), pack: P.propPackStats(),
    pixelMesh: window.__chunkSurferPixelMesh?.status?.(), exactFloatReadbacks: intercepted, glError: P.installAuthoredPropMeshes(gl => gl.getError()),
    qualification: 'The scene FLOAT readPixels call was copied synchronously and restored in finally. Scene RGB is post-water/coast-camera linear acquisition; alpha retains actual opaque P3 view depth. P3 byte RGB is linear. PNGs clamp floats for display; values retain exact numeric FLOAT samples.' };
}

export function classifyCoastalVisibility(capture, mesh) {
  const m = capture.model, triangles = [], world = p => [0, 1, 2].map(i => m[i] * p[0] + m[i + 4] * p[1] + m[i + 8] * p[2] + m[i + 12]);
  for (const primitive of mesh.primitives) for (let i = 0; i < primitive.indices.length; i += 3) {
    const [a, b, c] = primitive.indices.slice(i, i + 3).map(j => world(primitive.positions.slice(j * 3, j * 3 + 3)));
    triangles.push([...a, ...b.map((v, k) => v - a[k]), ...c.map((v, k) => v - a[k])]);
  }
  const eye = [capture.camera.eye.x, capture.camera.eye.y, capture.camera.eye.z], yaw = capture.camera.yaw, pitch = capture.camera.pitch;
  const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)], r = [Math.cos(yaw), 0, Math.sin(yaw)], u = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)];
  const aspect = capture.width / capture.height, counts = { roiPixels: capture.region.width * capture.region.height, targetPixels: 0, depthConsistent: 0, foregroundOccluded: 0, missingOrBehind: 0 }, samples = [];
  function nearest(d) {
    let hit = Infinity;
    for (const t of triangles) {
      const hx = d[1] * t[8] - d[2] * t[7], hy = d[2] * t[6] - d[0] * t[8], hz = d[0] * t[7] - d[1] * t[6], det = t[3] * hx + t[4] * hy + t[5] * hz;
      if (Math.abs(det) < 1e-10) continue;
      const qx = eye[0] - t[0], qy = eye[1] - t[1], qz = eye[2] - t[2], a = (qx * hx + qy * hy + qz * hz) / det;
      if (a < 0 || a > 1) continue;
      const sx = qy * t[5] - qz * t[4], sy = qz * t[3] - qx * t[5], sz = qx * t[4] - qy * t[3], b = (d[0] * sx + d[1] * sy + d[2] * sz) / det;
      if (b < 0 || a + b > 1) continue;
      const distance = (t[6] * sx + t[7] * sy + t[8] * sz) / det;
      if (distance > 0 && distance < hit) hit = distance;
    }
    return hit;
  }
  const luma = (v, i) => v[i] * .2126 + v[i + 1] * .7152 + v[i + 2] * .0722;
  for (let y = capture.region.y, n = 0; y < capture.region.bottom; y++) for (let x = capture.region.x; x < capture.region.right; x++, n++) {
    const px = ((x + .5) / capture.width * 2 - 1) * aspect * .95, py = (1 - (y + .5) / capture.height * 2) * .95;
    const d = f.map((v, i) => v + r[i] * px + u[i] * py), length = Math.hypot(...d); for (let k = 0; k < 3; k++) d[k] /= length;
    const hit = nearest(d); if (!Number.isFinite(hit)) continue;
    counts.targetPixels++;
    const view = hit * d.reduce((v, a, i) => v + a * f[i], 0), index = n * 10, alpha = capture.values[index + 6], actual = alpha > 0 ? (1 / alpha - 1) / .14 : Infinity;
    const tolerance = Math.max(.12, view * .0035), category = actual < view - tolerance ? 'foregroundOccluded' : actual > view + tolerance ? 'missingOrBehind' : 'depthConsistent'; counts[category]++;
    samples.push({ x, y, expectedViewMetres: view, actualViewMetres: actual, deltaMetres: actual - view, toleranceMetres: tolerance, category,
      p3Luma: luma(capture.values, index), postWaterLuma: luma(capture.values, index + 3), finalLuma: luma(capture.values, index + 7) });
  }
  const stats = rows => {
    const channels = {};
    for (const key of ['p3Luma', 'postWaterLuma', 'finalLuma', 'deltaMetres']) {
      const values = rows.map(p => p[key]).filter(Number.isFinite).sort((a, b) => a - b);
      channels[key] = values.length ? { mean: values.reduce((a, b) => a + b, 0) / values.length, min: values[0], max: values.at(-1), median: values[Math.floor(values.length / 2)] } : null;
    }
    return { pixels: rows.length, ...channels, finalLitFraction: rows.length ? rows.filter(p => p.finalLuma > .1).length / rows.length : null };
  };
  return { counts, allTarget: stats(samples), depthConsistentTarget: stats(samples.filter(p => p.category === 'depthConsistent')), samples,
    qualification: 'CPU exact frozen-GLB triangle coverage at actual framebuffer pixel centres, compared with actual scene-alpha opaque depth. Tolerance accommodates stored-depth precision; this establishes likely coverage, not material identity, transparency or human recognition.' };
}
