// Freeze the exact production expressions without importing unrelated world
// modules. No shader text is rewritten, substituted or approximated here.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PRESSURE_IDENTITY_GLSL,PRESSURE_INK_GLSL} from '../../src/render/pressure-composite.js';
import {UNRAVELLING_GLSL} from '../../src/render/source-unravelling-shader.js';
import {PRINTED_SURFACE_GLSL} from '../../src/render/printed-surface.js';
import {GLASS_COURT_RAIN_GLSL} from '../../src/render/glass-court-weather.js';
import {OUTSKIRTS_BUS_RAIN_GLSL} from '../../src/render/outskirts-bus-weather.js';
import {RAIN_FIELD_GLSL} from '../../src/render/rain-field.js';
import {COASTAL_MEMORY_WATER_GLSL} from '../../src/render/coastal-memory-water.js';
import {DIPPED_BEAM_GLSL} from '../../src/render/dipped-beam.js';
import {DRIVE_MEMORY_BREAK_GLSL} from '../../src/render/radio-dial-static.js';
import {MISSING_MAN_MATERIAL_GLSL} from '../../src/render/missing-man-material.js';

const root=new URL('../../',import.meta.url);
const sha256=value=>createHash('sha256').update(value).digest('hex');
export function shaderDeclaration(source,name){
  const marker=`const ${name} = `,start=source.indexOf(marker);
  if(start<0)throw new Error(`Production declaration missing: ${name}`);
  const line=source.slice(start).split('\n',1)[0];
  if(/^[A-Z_][A-Z0-9_]*(?:\s*\+\s*[A-Z_][A-Z0-9_]*)*;\s*$/.test(line.slice(marker.length)))return line;
  // Each authored shader template ends at its final template's backtick +
  // semicolon; intermediate concatenated templates deliberately lack it.
  const end=source.indexOf('`;',start);
  if(end<0)throw new Error(`Production declaration unfinished: ${name}`);
  return source.slice(start,end+2);
}
export function productionShaderBundle(source){
  const context=vm.createContext({
    PRESSURE_IDENTITY_GLSL,PRESSURE_INK_GLSL,PRINTED_SURFACE_GLSL,
    GLASS_COURT_RAIN_GLSL,OUTSKIRTS_BUS_RAIN_GLSL,RAIN_FIELD_GLSL,
    UNRAVELLING_GLSL,COASTAL_MEMORY_WATER_GLSL,DIPPED_BEAM_GLSL,
    DRIVE_MEMORY_BREAK_GLSL,MISSING_MAN_MATERIAL_GLSL,
  });
  for(const name of['COMMON_GLSL','RAIN_GLSL','GRAIN_GLSL','POST_FRAG','SOURCE_VOID_PHYSICAL_FRAG'])
    vm.runInContext(shaderDeclaration(source,name),context,{timeout:1000});
  const shaders=vm.runInContext('({post:POST_FRAG,sourceVoidPhysical:SOURCE_VOID_PHYSICAL_FRAG})',context,{timeout:1000});
  if(Object.values(shaders).some(value=>typeof value!=='string'||!value.startsWith('#version 300 es')))
    throw new Error('Production shader expression did not yield GLSL 300');
  return{schema:1,r3dSha256:sha256(source),dependencies:{pressureIdentitySha256:sha256(PRESSURE_IDENTITY_GLSL),unravellingSha256:sha256(UNRAVELLING_GLSL),rainFieldSha256:sha256(RAIN_FIELD_GLSL)},shaders:{post:shaders.post,sourceVoidPhysical:shaders.sourceVoidPhysical}};
}
export async function exportPressureReviewShaders(){
  const source=await readFile(new URL('src/render/r3d.js',root),'utf8'),bundle=productionShaderBundle(source);
  const output=new URL('artifacts/pressure-character/production-shaders.json',root);
  await mkdir(new URL('./',output),{recursive:true});await writeFile(output,JSON.stringify(bundle,null,2)+'\n');
  return{path:fileURLToPath(output),r3dSha256:bundle.r3dSha256,bytes:Buffer.byteLength(JSON.stringify(bundle))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await exportPressureReviewShaders())+'\n');
