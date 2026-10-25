import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('artifacts/battle-experience-study/live');await mkdir(output,{recursive:true});
const hook=String.raw`
if(import.meta.env.DEV&&params().has('battleStudy')){
 const {installBattleStudy}=await import('/tools/chunk_surfer/battle-study-live.mjs');
 const {battleHandsDiagnostics}=await import('/src/render/battle-hands.js');
 installBattleStudy({
  state:()=>({scene:scenes.top()?.id||null,battle:scenes.top()?.battleView?.()||null,
   rec:REC.saveRecState(),loadout:getSave().bagLoadout,build:combatBuild(),difficulty:currentDifficulty(),
   position:{x:px,y:py},source:chunkSurfRuntime?{phase:chunkSurfRuntime.state().phase,hush:chunkSurfRuntime.hushMode(),follow:chunkSurfRuntime.hushFollowFrame(),door:chunkSurfRuntime.edgeDoorFrame(),approach:chunkSurfRuntime.edgeDoorApproach()}:null,
   hands:battleHandsDiagnostics(),shader:window.__chunkSurferPixelMesh?.status?.(),paused,focused:document.hasFocus(),hidden:document.hidden}),
  audio:()=>({ctx:actx,output:outGain||master}),
  stage:async id=>{
   await godEnsureTestRun();while(buildingLoadPromise)await buildingLoadPromise;
   godReleaseViewForWarp();ensureCtx();__probe.tutSkip();
   if(id==='source-approach'){
    godEnterSourcePreset(CHUNK_SURF_GOD_PRESET.FINAL,{apertureComplete:true});
   }else{
    flagApply(['bag.taken','kit.taken','kit.fitted','combat.trained',...(id==='source'?['has.interface','has.fork']:[])]);
    saveCommit({bagLoadout:{schema:1,capacity:4,top:id==='source'?['light','recorder','interface','tuning-fork']:['light','recorder','radio']},flags:getSave().flags});
    const battle=id==='hall'?hallBattle(false,'recording-2'):sourceCombatBattle();
    openBattle(battle,{encounterId:id==='hall'?'recording-2':'source-final',
      onWin:()=>{},onLose:()=>{}});
   }
   resetMotionInput('battle-study-fixture',{stopRenderMove:true});
  }
 });
}`;
const server=await createServer({server:{host:'127.0.0.1',port:5361,strictPort:true,hmr:false,watch:null},
 optimizeDeps:{include:['three','three/addons/environments/RoomEnvironment.js','three/addons/geometries/RoundedBoxGeometry.js']},
 cacheDir:'node_modules/.vite-battle-study',plugins:[{name:'battle-experience-evidence',enforce:'pre',
 transform(code,id){if(id.split('?')[0]!==resolve('src/main.js'))return null;
  if(!code.includes('  installProbe();'))throw Error('Study hook location changed');
  return code.replace('  installProbe();','  installProbe();\n'+hook);},
 configureServer(vite){vite.middlewares.use('/__battle-study/',async(req,res)=>{
  const name=(req.url||'').split('?')[0].replace(/^\/+/, '');
  if(req.method!=='POST'||!/^battle-[a-z0-9-]+\.(json|png|webm)$/.test(name)){res.statusCode=400;res.end();return;}
  try{const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>96*1024*1024)throw Error('Capture too large');chunks.push(c);}
   await writeFile(resolve(output,name),Buffer.concat(chunks));res.end(JSON.stringify({name,bytes}));
  }catch(e){res.statusCode=500;res.end(String(e));}
 });}
 }]});await server.listen();console.log('Battle study: http://127.0.0.1:5361/?battleStudy=1&nomic=1&sam=0&nothink=1');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
