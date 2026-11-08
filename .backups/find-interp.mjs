import { readFileSync } from 'node:fs';
const s = readFileSync('src/render/r3d.js', 'utf8');
const marks = [
  ['COMMON_START', s.indexOf('const COMMON_GLSL =')],
  ['VERT', s.indexOf('const VERT =', s.indexOf('const COMMON_GLSL =') + 20)],
  ['RAIN_START', s.indexOf('const RAIN_GLSL =')],
  ['MARCH', s.indexOf('const MARCH_FRAG =', s.indexOf('const RAIN_GLSL =') + 20)],
  ['VOID_START', s.indexOf('const SOURCE_VOID_PHYSICAL_FRAG =')],
  ['ACCESSOR', s.indexOf('export function r3dSourceVoidPhysicalShader')],
];
for (const [k, v] of marks) console.log(k, v);
console.log('DIPPED offsets:', [...s.matchAll(/DIPPED_BEAM_GLSL/g)].map(m => m.index).slice(0, 10).join(','));
const INTERP = /\$\{([A-Za-z_0-9]+)\}/g;
for (const [name, a, b] of [['COMMON', 14026, 14122], ['RAIN', 17409, 24211], ['VOID', 206737, 239540]]) console.log(name, [...s.slice(a, b).matchAll(INTERP)].map(m => m[1]).join(','));
