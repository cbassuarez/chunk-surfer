import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import vm from'node:vm';import{shaderDeclaration}from'./export-pressure-review-shaders.mjs';
const s=await readFile('src/render/r3d.js','utf8'),bindings={};
for(const m of s.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm)){
 if(!m[1].includes('GLSL'))continue;const mod=await import(new URL(m[2],new URL('../../src/render/r3d.js',import.meta.url)));
 for(const name of m[1].split(',').map(x=>x.trim()))if(name in mod)bindings[name]=mod[name];
}
const ctx=vm.createContext(bindings);for(const n of['COMMON_GLSL','RAIN_GLSL','GRAIN_GLSL','POST_FRAG','SOURCE_VOID_PHYSICAL_FRAG'])vm.runInContext(shaderDeclaration(s,n),ctx);
await writeFile('artifacts/hush-motion-study/production-shaders.json',JSON.stringify({r3dSha256:createHash('sha256').update(s).digest('hex'),generatedAt:new Date().toISOString(),shaders:vm.runInContext('({post:POST_FRAG,sourceVoidPhysical:SOURCE_VOID_PHYSICAL_FRAG})',ctx)}));console.log('Current production shader expressions frozen without substitution.');
