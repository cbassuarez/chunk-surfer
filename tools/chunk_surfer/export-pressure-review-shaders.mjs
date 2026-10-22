// Freeze the exact production expressions without importing unrelated world
// modules. No shader text is rewritten, substituted or approximated here.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {PRESSURE_IDENTITY_GLSL,PRESSURE_INK_GLSL} from '../../src/render/pressure-composite.js';
import {UNRAVELLING_GLSL} from '../../src/render/horizon3d.js';
import {PRINTED_SURFACE_GLSL} from '../../src/render/printed-surface.js';

const root=new URL('../../',import.meta.url);
const sha256=value=>createHash('sha256').update(value).digest('hex');
export function shaderDeclaration(source,name){
  const marker=`const ${name} = `,start=source.indexOf(marker);
  if(start<0)throw new Error(`Production declaration missing: ${name}`);
  // Each authored shader expression ends at its final template's backtick +
  // semicolon; intermediate concatenated templates deliberately lack it.
  const end=source.indexOf('`;',start);
  if(end<0)throw new Error(`Production declaration unfinished: ${name}`);
  return source.slice(start,end+2);
}
export function productionShaderBundle(source){
  const context=vm.createContext({PRESSURE_IDENTITY_GLSL,PRESSURE_INK_GLSL,PRINTED_SURFACE_GLSL,HZ:Object.freeze({UNRAVELLING_GLSL})});
  for(const name of['COMMON_GLSL','RAIN_GLSL','GRAIN_GLSL','POST_FRAG','SOURCE_VOID_PHYSICAL_FRAG'])
    vm.runInContext(shaderDeclaration(source,name),context,{timeout:1000});
  const shaders=vm.runInContext('({post:POST_FRAG,sourceVoidPhysical:SOURCE_VOID_PHYSICAL_FRAG})',context,{timeout:1000});
  if(Object.values(shaders).some(value=>typeof value!=='string'||!value.startsWith('#version 300 es')))
    throw new Error('Production shader expression did not yield GLSL 300');
  return{schema:1,r3dSha256:sha256(source),dependencies:{pressureIdentitySha256:sha256(PRESSURE_IDENTITY_GLSL),unravellingSha256:sha256(UNRAVELLING_GLSL)},shaders:{post:shaders.post,sourceVoidPhysical:shaders.sourceVoidPhysical}};
}
export async function exportPressureReviewShaders(){
  const source=await readFile(new URL('src/render/r3d.js',root),'utf8'),bundle=productionShaderBundle(source);
  const output=new URL('artifacts/pressure-character/production-shaders.json',root);
  await mkdir(new URL('./',output),{recursive:true});await writeFile(output,JSON.stringify(bundle,null,2)+'\n');
  return{path:fileURLToPath(output),r3dSha256:bundle.r3dSha256,bytes:Buffer.byteLength(JSON.stringify(bundle))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  process.stdout.write(JSON.stringify(await exportPressureReviewShaders())+'\n');
