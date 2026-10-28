import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {hallReactionStudyTransform} from '../../artifacts/apparition-battle-study/turns/reaction-transform.mjs';
const output=resolve('artifacts/apparition-battle-study/captures');
const studyRevision=Date.now();
await mkdir(output,{recursive:true});
const server=await createServer({cacheDir:'node_modules/.vite-apparition-battle-study',optimizeDeps:{include:['three','three/addons/environments/RoomEnvironment.js','three/addons/geometries/RoundedBoxGeometry.js','three/addons/loaders/GLTFLoader.js']},server:{host:'127.0.0.1',port:5365,strictPort:true,hmr:false,watch:null},plugins:[{
 name:'apparition-battle-study-only',enforce:'pre',
 transformIndexHtml:html=>html.replace('src/main.js?v=',`src/main.js?apparitionStudyRevision=${studyRevision}&v=`),
 transform(code,id){
  const file=id.split('?')[0];
  if(file===resolve('src/main.js')){
   const marker='  installProbe();';if(!code.includes(marker))throw Error('World study hook drift');
   return code.replace(marker,marker+`\nif(import.meta.env.DEV&&params().has('apparitionWorldStudy')){const {installApparitionWorldStudy}=await import('/tools/chunk_surfer/apparition-world-study.mjs');installApparitionWorldStudy({probe:()=>__probe,audio:()=>({ctx:actx,output:outGain||master}),scene:()=>scenes.top()?.id||'game',prepare:async()=>{await godEnsureTestRun();while(buildingLoadPromise)await buildingLoadPromise;godReleaseViewForWarp();ensureCtx();__probe.tutSkip();}});}`);
  }
  if(file===resolve('src/game/combat-state.js'))return hallReactionStudyTransform(code)
   .replace('parried: false, parryTier: null, parryRestored: 0,',"...(window.__apparitionStudy?.reactionFix ? {parried:false,parryTier:null,parryRestored:0} : {}),")
   .replace('state.last.hallEnemyReaction = {',"if(window.__apparitionStudy?.reactionFix)state.last.hallEnemyReaction = {")
   .replace('const hallProvisional = !!state.apparitions',"const hallProvisional = !!window.__apparitionStudy?.reactionFix && !!state.apparitions");
  if(file===resolve('src/render/pixel-mesh/transparent.js')){
   // The world prop clause writes acquisition-ready colour. The PBR source
   // needs ACES/sRGB; applying that conversion to the clause again makes its
   // dark mass a white mannequin. This study-only boundary leaves final
   // quantisation and all normal PBR performers unchanged.
   return code.replace('toneMappingExposure: { value: renderer.toneMappingExposure },','toneMappingExposure: { value: renderer.toneMappingExposure },\n    sourceDisplayEncoded:{value:0},')
    .replace('uniform sampler2D source,depth;','uniform sampler2D source,depth;\n      uniform float sourceDisplayEncoded;')
    .replace('vec3 display=sRGBTransferOETF(vec4(ACESFilmicToneMapping(linear),1.0)).rgb;','vec3 display=sourceDisplayEncoded>.5?linear:sRGBTransferOETF(vec4(ACESFilmicToneMapping(linear),1.0)).rgb;')
    .replace('screenOffset = [0, 0], worldUnitScale = 1,','screenOffset = [0, 0], worldUnitScale = 1, sourceDisplayEncoded = false,')
    .replace('if (disposed) return false;\n      dpr = positive(dpr);','if (disposed) return false;\n      acquisitionUniforms.sourceDisplayEncoded.value=sourceDisplayEncoded?1:0;\n      dpr = positive(dpr);');
  }
  if(file===resolve('src/game/combat.js')){
   const markers=['drawHallApparitions(apparitions, {','drawSignalBeing(battle.combat.id, {'];
   for(const marker of markers)if(!code.includes(marker))throw Error('Study hook drift: '+marker);
   return `import {drawStudyHall,drawStudySolo} from '/artifacts/apparition-battle-study/study-adapter.mjs';\n`+code
    .replace('drawHallApparitions(apparitions, {','drawStudyHall(apparitions, {')
    .replace('drawSignalBeing(battle.combat.id, {','drawStudySolo(battle.combat.id, {');
  }
  if(file===resolve('src/render/encounter-view.js'))return `import {drawStudySolo} from '/artifacts/apparition-battle-study/study-adapter.mjs';\n`+code
   .replace('else drawSignalBeing(battle.combat?.id||battle.id,','else drawStudySolo(battle.combat?.id||battle.id,')
   .replace('{...box,now:0,snr:', '{...box,title:true,now:0,snr:');
  return null;
 },
 configureServer(vite){vite.middlewares.use('/__apparition-study/',async(req,res)=>{
  const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
  if(req.method!=='POST'||!/^app-[a-z0-9-]+\.(json|webm|png)$/.test(name)){res.statusCode=400;res.end();return;}
  try{let bytes=0;const chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>96*1024*1024)throw Error('Capture too large');chunks.push(chunk);}await writeFile(resolve(output,name),Buffer.concat(chunks));res.end(JSON.stringify({name,bytes}));}
  catch(error){res.statusCode=500;res.end(String(error));}
 });}
}]});
await server.listen();console.log('Apparition study: http://127.0.0.1:5365/artifacts/apparition-battle-study/play.html');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
