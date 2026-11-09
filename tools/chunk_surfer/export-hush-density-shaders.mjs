import{readFile,writeFile}from'node:fs/promises';import{createHash}from'node:crypto';import vm from'node:vm';import{shaderDeclaration}from'./export-pressure-review-shaders.mjs';
const s=await readFile('src/render/r3d.js','utf8'),bindings={};
for(const m of s.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/gm)){
 if(!m[1].includes('GLSL'))continue;const mod=await import(new URL(m[2],new URL('../../src/render/r3d.js',import.meta.url)));
 for(const name of m[1].split(',').map(x=>x.trim()))if(name in mod)bindings[name]=mod[name];
}
const ctx=vm.createContext(bindings);for(const n of['COMMON_GLSL','RAIN_GLSL','GRAIN_GLSL','POST_FRAG','SOURCE_VOID_PHYSICAL_FRAG'])vm.runInContext(shaderDeclaration(s,n),ctx);
const production=process.argv.includes('--production');
const sourceFiles=['src/render/props3d.js','src/render/pressure-volume.js','src/render/character-asset.js','src/render/pressure-composite.js','src/render/pixel-mesh/shader.js','src/game/pressure-performance.js','src/game/hush-density-performance.js','src/game/presence.js','src/game/pressure-gait.js','src/game/hush-audition.js'];
const sourceHashes=production?Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')]))):null;
await writeFile(`artifacts/${production?'hush-density-production':'hush-density-study'}/production-shaders.json`,JSON.stringify({...(production?{schema:1,sourceHashes}:{}),r3dSha256:createHash('sha256').update(s).digest('hex'),generatedAt:new Date().toISOString(),shaders:vm.runInContext('({post:POST_FRAG,sourceVoidPhysical:SOURCE_VOID_PHYSICAL_FRAG})',ctx)}));console.log('Current production shader expressions frozen without substitution.');
