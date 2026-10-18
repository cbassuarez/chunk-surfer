// A complete physical interior in the normal prop pass. It shares depth,
// flashlight shadows, material lighting and the final acquisition/dither pass
// with the native foyer furniture and the residents, rather than a screen layer.
import { sourceReceptionGeometry } from '../data/source-last-reception.js';
import { dividePieceBounds } from './source-divide-meshes.js';
import { sourcePrintMaps, sourcePrintUV, SOURCE_PRINT_SURFACE } from './physical-source-print.js';
import { PROP_INSTANCE_FLOATS, PROP_INSTANCE_BINDINGS } from './prop-instance-layout.js';

export function receptionMeshName(id) { return `source-reception-${id}`; }

function materialTexture(gl, material) {
  if(material==='source')return sourcePrintMaps(gl,'reception').texture;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const c = canvas.getContext('2d');
  c.fillStyle = material === 'source' ? '#d7decf' : material === 'wood' ? '#b2a18c' : '#c7c9bd';
  c.fillRect(0, 0, 512, 512);
  if (material === 'wood') {
    for (let plank = 0; plank < 8; plank++) {
      c.fillStyle = plank % 3 === 0 ? '#958672' : '#b6a58f'; c.fillRect(plank * 64, 0, 62, 512);
      c.strokeStyle = '#756d5e'; c.lineWidth = 1; c.strokeRect(plank * 64, 0, 64, 512);
      c.beginPath(); c.moveTo(plank * 64, (plank % 3) * 152 + 32); c.lineTo(plank * 64 + 64, (plank % 3) * 152 + 32); c.stroke();
      for (let grain = 0; grain < 7; grain++) {
        c.strokeStyle = grain % 2 ? '#b5a48d' : '#a2927d'; c.beginPath();
        for (let y = 0; y <= 512; y += 16) {
          const x = plank * 64 + 5 + grain * 8 + Math.sin(y * .04 + grain + plank) * 1.8;
          if (!y) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke();
      }
    }
  } else {
    // Deterministic brushed plaster mottling stays subordinate to geometry.
    for (let i = 0; i < 520; i++) {
      const x = (i * 113) % 512, y = (i * 239) % 512;
      c.fillStyle = i % 3 ? '#c2c6b9' : '#b8bfaf'; c.globalAlpha = .15;
      c.fillRect(x, y, 3 + i % 7, 1 + i % 4);
    }
    c.globalAlpha = 1;
  }
  const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return texture;
}

export function installReceptionMeshes(gl, pack) {
  if (!gl || !pack?.catalog) return [];
  const geometry = sourceReceptionGeometry(), names = geometry.map(piece => receptionMeshName(piece.id));
  if (names.every(name => pack.catalog.has(name))) return names;
  const sourceMaps=sourcePrintMaps(gl,'reception'),textures = new Map();
  const textureFor = material => {
    const key = material === 'source' ? 'source' : material === 'wood' ? 'wood' : 'plaster';
    if (!textures.has(key)) textures.set(key, materialTexture(gl, key));
    return textures.get(key);
  };
  const identity = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  for (const piece of geometry) {
    const name = receptionMeshName(piece.id); if (pack.catalog.has(name)) continue;
    const bounds = dividePieceBounds(piece), positions = [], normals = [], uvs = [];
    for (let index = 0; index < piece.i.length; index += 3) {
      const points = piece.i.slice(index, index + 3).map(i => piece.p.slice(i * 3, i * 3 + 3));
      const a = points[1].map((v, k) => v - points[0][k]), b = points[2].map((v, k) => v - points[0][k]);
      const normal = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const length = Math.hypot(...normal) || 1; for (let k = 0; k < 3; k++) normal[k] /= length;
      const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
      const uvSize = piece.material === 'source' ? 2.8 : piece.material === 'wood' ? 3.2 : 2;
      for (const point of points) {
        positions.push(...point.map((v, k) => v - bounds.center[k])); normals.push(...normal);
        uvs.push(...(piece.material==='source'?sourcePrintUV(point,normal,uvSize):[(axis === 0 ? point[2] : point[0]) / uvSize, (axis === 1 ? point[2] : point[1]) / uvSize]));
      }
    }
    const vao = gl.createVertexArray(), instanceBuffer = gl.createBuffer(); gl.bindVertexArray(vao);
    const bind = (location, data, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    };
    bind(0, positions, 3); bind(1, normals, 3); bind(2, uvs, 2);
    const indices = Uint32Array.from({ length: positions.length / 3 }, (_, i) => i);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer); const stride = PROP_INSTANCE_FLOATS * 4;
    for (let column = 0; column < 4; column++) {
      const location = 3 + column; gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 4, gl.FLOAT, false, stride, column * 16);
      gl.vertexAttribDivisor(location, 1);
    }
    for (const [location, size, offset] of PROP_INSTANCE_BINDINGS) {
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.disableVertexAttribArray(8); gl.vertexAttrib1f(8, 0);
    pack.catalog.set(name, { name, nodeMatrix: identity, instanceBuffer, extras: { sourceReception: true },
      primitives: [{ vao, count: indices.length, indexType: gl.UNSIGNED_INT, base: [...piece.color, 1], emissive: [0,0,0],
        texture: textureFor(piece.material),normalTexture:piece.material==='source'?sourceMaps.normalTexture:null,ormTexture:piece.material==='source'?sourceMaps.ormTexture:null,letteringFinish:piece.material==='source'?sourceMaps.letteringFinish:null,materialFactors:piece.material==='source'?'gltf':undefined,metallic:piece.material==='source'?1:piece.material === 'metal' ? .45 : 0,roughness:piece.material==='source'?1:.92,
        aoStrength: 0, portrait: false, alphaCut: 0, materialName: `reception ${piece.material}`, materialRole: 'source-reception',printedSurface:piece.material==='source'?SOURCE_PRINT_SURFACE:null }] });
  }
  gl.bindVertexArray(null); return names;
}
