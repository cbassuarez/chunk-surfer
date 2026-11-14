// Run only while holding the explicitly coordinated GPU lease:
// CHAPEL_TOWER_GPU_LEASE=1 node tools/chunk_surfer/verify-chapel-tower-complete.mjs
// --describe writes the plan without opening a server or browser.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {startRouteFilm,stopRouteFilm} from './route-verification-film.mjs';

const out=path.resolve(process.env.ROUTE_VERIFY_OUT||'artifacts/route-completion-and-hush/routes');
const port=Number(process.env.ROUTE_VERIFY_PORT||5594),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const valleyMusicReview=process.env.ROUTE_VERIFY_VALLEY_MUSIC==='1';
const valleyConstructionReview=process.env.ROUTE_VERIFY_VALLEY_CONSTRUCTION==='1';
const valleySignsReview=process.env.ROUTE_VERIFY_VALLEY_SIGNS==='1';
const constructionPass=process.env.ROUTE_VERIFY_CONSTRUCTION_PASS||'candidate';
const routes=(process.env.ROUTE_VERIFY_ROUTES||(valleyMusicReview||valleyConstructionReview||valleySignsReview?'chapel':'chapel,tower')).split(',').filter(route=>['chapel','tower'].includes(route));
const completeEnding=process.env.ROUTE_VERIFY_CONTINUATION!=='0';
const plan={scope:completeEnding?'Selected branch-entry checkpoint through earned agreed-sacrifice or tower-won ending and postcredits. Source I, earlier job recordings and the Horizon choice are staged history, not a new-game playthrough.':'Complete branch-entry checkpoint to actual building arrival and the beginning of its onward path. Source I and the Horizon offer/choice are staged history, not an earned playthrough.',
 disclosures:[
  'Two isolated runs begin at the already-chosen branch-entry fixtures chapelOutskirtsPreset(0) and bellsPreset(0).',
  'Setup, field-ready equipment, four historical ordinary room takes and canonical first–fourth memory delivery history belong to the disclosed starting fixture. Those takes are generated review records, not earned recordings or source audio. Canonical fifth is never injected, cleared or started by a probe.',
  'After each fixture, all position changes use real keyboard input at ordinary game speed. No warp, direct step, field crossing, progress, return, review-time or recording probe is used.',
  'Read-only collision queries plan a knowledgeable route; renderer/scene-owned look setters guide gaze. This is guided automation, not player comprehension evidence.',
  'The actual title Continue action is used after one midbranch browser reload. The browser is isolated and no microphone is opened.',
  'No Enter is sent during a field, driving scene or return flashback. Enter is restricted to the real title/EULA, battle, dialogue, credits and report owners.',
  'Screenshots show the real final renderer/dither. They do not establish subjective quality, spatial comprehension, packaged-native behavior or target-hardware performance.',
 ],
 sequence:['branch fixture','stop, look back and retreat','ordinary branch travel','field landmark inspection and physical return','actual pause/reload/title Continue','optional home on chapel','optional coast walk on both branches','both marked returns on tower','opened final door preview','full physical crossing','canonical fifth at final commitment','uninterrupted reverse-sea film','actual building arrival','ordinary onward movement'],
 previewObligation:'Opening either final Source door should show its actual destination before crossing. A post-cross destination preview is recorded separately and cannot substitute for this obligation.',
 execution:'CHAPEL_TOWER_GPU_LEASE=1 node tools/chunk_surfer/verify-chapel-tower-complete.mjs',
 options:{ROUTE_VERIFY_ROUTES:'chapel,tower (or one branch)',ROUTE_VERIFY_PORT:5594,ROUTE_VERIFY_HOME:'0 omits the optional home; default includes it',ROUTE_VERIFY_COAST:'reuse uses explicitly cited earlier coast evidence instead of a new visit; default walks it',ROUTE_VERIFY_COAST_EVIDENCE:'required receipt path when coast=reuse',ROUTE_ACCEPT_EULA:'1 only with the existing user authorization; otherwise an agreement screen stops the run'},
};
if(valleyMusicReview){
 plan.scope='The childhood valley score from the developer-staged home entry to ordinary retreat through its doorway.';
 plan.sequence=['threshold phrase','advance to the first road','stand still through a loop','walk around the PostAuto shelter','turn in place','pause and resume','retreat to the previous phrase','leave through the same door'];
 plan.disclosures=[
  'The developer fixture supplies the prior history, home eligibility and initial crossing. After entry, all position changes use ordinary W input with guided gaze.',
  'Capture uses the real final-dither canvas and game post-master output. No microphone is opened.',
  'Transport and geometry telemetry are read-only. Guided browser evidence does not establish first-time player perception or packaged-native behavior.',
 ];
 plan.previewObligation='The real game output should retain the same source at the PostAuto shelter as the player walks around it.';
 plan.options.ROUTE_VERIFY_VALLEY_MUSIC='1 with ROUTE_VERIFY_ROUTES=chapel';
 if(process.env.ROUTE_VERIFY_VALLEY_MUSIC_UPPER==='1'){
  plan.scope='The childhood valley score from the developer-staged home entry to the mountain lookout, including the ordinary log split.';
  plan.sequence=['threshold Prélude','commons Allemande','Courante at the hay store and woodpile','split the log','Courante answer','La Montfermeil at the lookout'];
  plan.previewObligation='Hear the Courante answer from the same shelter after the existing physical activity.';
 }
}
if(valleyConstructionReview){
 plan.scope=`Tannenried store frontage, road and drainage ${constructionPass} review.`;
 plan.sequence=['staged home entrance','ordinary lane walk to the commons','store frontage','eaves oblique','pipe and road edge','solid side-wall contact','return to the approach'];
 plan.disclosures=[
  'The fixture stages the optional home entrance. All walking within Tannenried is performed with ordinary W input and guided gaze.',
  'Screens are from the final dither. Optional linear frames are diagnostic. Performance samples use an unrecorded, stationary game canvas.',
  'Each pass uses its own isolated browser profile. Camera positions are matched within walking tolerances. Weather and dither phases are live.',
 ];
 plan.previewObligation='Compare equivalent player-eye views and verify circulation and a solid wall at the store.';
 plan.options.ROUTE_VERIFY_VALLEY_CONSTRUCTION='1 with ROUTE_VERIFY_ROUTES=chapel';
 plan.options.ROUTE_VERIFY_CONSTRUCTION_PASS='baseline or candidate';
 plan.options.ROUTE_VERIFY_CONSTRUCTION_BASELINE='absolute baseline receipt path for matched position and performance comparison';
}
if(valleySignsReview){
 plan.scope='Tannenried public signs through the real final dither, with ordinary movement from the staged home entrance.';
 const reach=process.env.ROUTE_VERIFY_VALLEY_SIGNS_EXTENDED;
 plan.sequence=['staged home entrance','ordinary lane walk','PostAuto shelter and close reading',
  ...(reach==='0'?[]:['commons and bakery']),...(reach==='0'||reach==='near'?[]:['uphill signposts','ski workshop'])];
 plan.disclosures=[
  'The fixture stages the optional home entrance. All walking within Tannenried is performed with ordinary W input and guided gaze.',
  'The camera targets real signs in local metres. The captures support manual legibility review and report the actual position, distance and look angle.',
 ];
 plan.previewObligation='Reach and frame the actual signs through the final dither without opening the childhood house.';
 plan.options.ROUTE_VERIFY_VALLEY_SIGNS='1 with ROUTE_VERIFY_ROUTES=chapel';
 plan.options.ROUTE_VERIFY_VALLEY_SIGNS_EXTENDED='0 captures transit only; near includes the commons and bakery; default includes the upper fork and ski workshop';
}
await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'plan.json'),JSON.stringify(plan,null,2)+'\n');
if(process.argv.includes('--describe')){console.log(JSON.stringify(plan,null,2));process.exit(0);}
if(process.env.CHAPEL_TOWER_GPU_LEASE!=='1')throw Error('No coordinated GPU lease. Use --describe without a game launch, or set CHAPEL_TOWER_GPU_LEASE=1 after the owner releases it.');

const report={startedAt:new Date().toISOString(),...plan,checks:[],routes:[],captures:[],inputs:[],errors:[],sources:{},unresolvedObligations:[]};
const files=['src/main.js','src/game/source-space-runtime.js','src/game/chunk-surf-state.js','src/game/chapel-tower-state.js','src/game/station-field-scene.js','src/data/station-field-visits.js','src/data/station-field-destinations.js','src/game/coastal-memory-scene.js','src/game/coastal-memory.js','src/game/source-return-flashback-scene.js','src/game/source-return-flashback.js','src/render/props3d.js','src/render/r3d.js','src/render/elsewhere-glsl.js','tools/chunk_surfer/verify-chapel-route-continuation.mjs','tools/chunk_surfer/verify-tower-route-continuation.mjs'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of files)report.sources[file]=sha(await fs.readFile(file));
if(process.env.ROUTE_VERIFY_HOME_GROUNDS==='1'||process.env.ROUTE_VERIFY_CHILDHOOD_VALLEY==='1'){
 files.push('src/data/childhood-grounds.js','src/data/realm-pockets.js','src/render/childhood-grounds-glsl.js',
   'src/render/realm-pocket-geometry.js','src/audio/elsewhere-beds.js','src/data/childhood-valley.js',
   'src/render/childhood-valley-sites.js','src/render/childhood-valley-mountains.js','tools/chunk_surfer/verify-childhood-valley.mjs',
   'src/data/childhood-valley-life.js','src/data/childhood-valley-trail.js','src/render/childhood-valley-forest.js',
   'src/render/childhood-valley-weather.js','src/render/pixel-mesh/shader.js','src/render/childhood-valley-activities.js',
   'src/game/childhood-valley-activities.js','src/game/childhood-valley-rest.js','src/game/save.js');
 for(const file of files)report.sources[file]=sha(await fs.readFile(file));
}
if(valleyMusicReview){
 const musicFiles=['src/game/childhood-valley-music-space.js','src/audio/childhood-valley-music.js',
  'src/audio/standing-tear-dsp.js','tools/chunk_surfer/verify-childhood-valley-music.mjs',
  ...((await fs.readdir('public/audio/childhood-valley')).sort().map(name=>`public/audio/childhood-valley/${name}`))];
 for(const file of musicFiles){files.push(file);report.sources[file]=sha(await fs.readFile(file));}
}
if(valleyConstructionReview){
 const constructionFiles=['src/data/childhood-valley.js','src/data/realm-pockets.js',
  'src/render/childhood-valley-sites.js','src/render/childhood-grounds-glsl.js',
  'src/render/childhood-valley-weather.js','src/render/pixel-mesh/shader.js',
  'tools/chunk_surfer/verify-childhood-valley-construction.mjs','tools/chunk_surfer/verify-chapel-tower-complete.mjs'];
 for(const file of ['src/data/childhood-valley-works.js','src/render/childhood-valley-construction.js']){
  if(await fs.access(file).then(()=>true,()=>false))constructionFiles.push(file);
 }
 for(const file of constructionFiles){files.push(file);report.sources[file]=sha(await fs.readFile(file));}
}
if(valleySignsReview){
 const signsFiles=['src/data/childhood-valley.js','src/data/childhood-valley-signs.js',
  'src/render/childhood-valley-sites.js','public/assets/childhood-valley/signs.png',
  'src/audio/childhood-valley-music.js','src/audio/childhood-valley-music-cues.js',
  'public/audio/childhood-valley/visee-tannenried-jovanic.mp3',
  'tools/chunk_surfer/build-childhood-valley-signs.mjs','tools/chunk_surfer/verify-childhood-valley-signs.mjs',
  'tools/chunk_surfer/verify-chapel-tower-complete.mjs'];
 if(await fs.access('src/render/childhood-valley-signs.js').then(()=>true,()=>false))signsFiles.push('src/render/childhood-valley-signs.js');
 for(const file of signsFiles){files.push(file);report.sources[file]=sha(await fs.readFile(file));}
}
for(const file of ['src/audio/bell-stem-manifest.js','src/render/pressure-volume.js','src/render/hush-cosmos.js','public/assets/hush-density.glb','public/assets/source-drive/coastal-memory/van-wreck.glb']){files.push(file);report.sources[file]=sha(await fs.readFile(file));}
let browser,server,page,profile,context,currentRoute=null,filmStarted=false;
function check(name,pass,detail=null,{fatal=true}={}){report.checks.push({route:currentRoute,name,pass:!!pass,detail});console.log(pass?'PASS':'FAIL',currentRoute||'',name);if(!pass&&fatal)throw Error(`${name}: ${JSON.stringify(detail)}`);return !!pass;}
async function snapshot(){return page.evaluate(()=>{
 const p=window.__probe,save=p.sixLoop?.save?.()||JSON.parse(localStorage.getItem('chunk-surfer:save:v4')||'{}');
 const top=window.__scenes?.top();
 return{scene:top?.id||null,worldPresentation:top?.worldPresentation||null,pos:p.pos(),where:p.whereAmI(),look:p.lookAngles?.(),
  source:p.chunkSurf(),doors:p.doorFieldDoors(),field:p.stationField(),realm:p.stationRealm(),coast:{...p.coastalMemory.state(),localPose:top?.id==='coastal-memory'?top.serialize?.().pose:null},
  returnFilm:p.sourceReturnFlashback.state(),canonical:p.sixLoop?.lastMinutes?.field?.view?.()||null,
  towerView:p.sourceDestinationView?.()||p.sourceTowerView?.(),chapelView:p.sourceDestinationView?.()||null,
  takes:p.rec().takes,flags:save.flags||{},station:save.chunkSurf?.station||null,chapelTower:p.chapelTower(),
  ending:save.endingCutscene||null,runStatus:save.run?.status||null,music:p.homeValleyMusic?.()||null};
});}
async function shot(name){
 const state=await snapshot(),file=path.join(out,`${currentRoute}-${name}.png`);
 await page.screenshot({path:file});
 const capture={route:currentRoute,name,file,state};
 if(process.env.ROUTE_VERIFY_VALLEY_PASSES==='1'&&(name.startsWith('valley-construction-')||[
  'valley-rear-commons','valley-mountain-fork','valley-mountain-timber-pocket','valley-mountain-alternate-descent',
 ].includes(name))){
  const data=await page.evaluate(async()=>{
   const renderer=await import('/src/render/r3d.js');
   return renderer.r3dCaptureStageCanvas('scene')?.toDataURL();
  });
  if(data){
   capture.linear=file.replace(/\.png$/,'-linear.png');
   await fs.writeFile(capture.linear,Buffer.from(data.split(',')[1],'base64'));
  }
 }
 report.captures.push(capture);return state;
}
async function samplePerformance(name,{minimumFps=30}={}){
 const sample=await page.evaluate(async()=>{const R=await import('/src/render/r3d.js'),before=R.r3dPixelMeshStatus(),start=performance.now();await new Promise(resolve=>setTimeout(resolve,3000));const end=performance.now(),after=R.r3dPixelMeshStatus();return{seconds:(end-start)/1000,presented:after.framesRendered-before.framesRendered,fps:(after.framesRendered-before.framesRendered)*1000/(end-start),display:after};});
 (report.performance||=[]).push({route:currentRoute,name,...sample});
 if(minimumFps!==null){
  const passed=check(name+': actual final dither presents at least '+minimumFps+' fps',sample.fps>=minimumFps,sample,{fatal:false});
  if(!passed)report.unresolvedObligations.push({route:currentRoute,name,measuredFps:sample.fps,minimumFps});
 }
 return sample;
}
async function press(key){const state=await snapshot();const enterOwner=['title','eula','finale','credits','postcredits','post-credits','return-summary','run-return','ending','ending-report','return-report','source-rest:childhood-valley'].includes(state.scene)||state.scene?.startsWith('battle:');if(key==='Enter'&&!enterOwner)throw Error('Enter forbidden for this owner; scene='+state.scene);report.inputs.push({route:currentRoute,key,kind:'press',scene:state.scene,at:Date.now()});await page.keyboard.press(key);await sleep(140);}
async function hold(key,ms){report.inputs.push({route:currentRoute,key,kind:'held',milliseconds:ms,at:Date.now()});await page.keyboard.down(key);try{await sleep(ms);}finally{await page.keyboard.up(key);}await sleep(65);}
async function waitFor(predicate,timeout=60000,label='condition'){const end=Date.now()+timeout;while(Date.now()<end){const state=await snapshot();if(predicate(state))return state;await sleep(150);}report.failureState=await snapshot();throw Error(`Timed out: ${label}; scene=${report.failureState.scene}, position=${JSON.stringify(report.failureState.pos)}`);}
async function lookWorld(yaw,pitch=0){await page.evaluate(({yaw,pitch})=>window.__probe.lookAtWorld(yaw,pitch),{yaw,pitch});}
async function lookLocal(yaw,pitch=0){await page.evaluate(({yaw,pitch})=>{const scene=window.__scenes.top();if(typeof scene?.setLook!=='function')throw Error('No scene-owned precise look');scene.setLook({yaw,pitch});},{yaw,pitch});}

// Read-only navigation against the actual geometry, including its closed doors.
// Nothing here calls a movement or scene state mutator.
async function planWalk(target,{building=false}={}){
 return page.evaluate(async({target,building})=>{
  const probe=window.__probe,start=probe.pos(),unit=1;
  const source=probe.chunkSurf(),origin=source?.landscapeOrigin||{x:0,y:0};let bellShapes=[];
  if(!building&&source?.phase==='bells'){
   const {SOURCE_BELL_PASSAGE}=await import('/src/data/source-level.js'),{sourceBellContactShape}=await import('/src/game/source-bell-field.js');
   bellShapes=SOURCE_BELL_PASSAGE.map(entry=>sourceBellContactShape(entry)).filter(Boolean);
  }
  const bellClear=p=>bellShapes.every(shape=>Math.hypot((p.x-origin.x-shape.x)/(shape.rx+.8),(p.y-origin.y-shape.y)/(shape.ry+.8))>1);
  const goal={x:Math.round(target.x-start.x),y:Math.round(target.y-start.y)};
  const key=(x,y)=>`${x},${y}`,toWorld=node=>({x:start.x+node.x*unit,y:start.y+node.y*unit});
  // The host forbids corner-cutting diagonals. A cardinal path has exactly
  // the same per-step clearance authority as ordinary W at these bearings.
  const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  for(const margin of[20,80]){
   const open=[{x:0,y:0,g:0,f:Math.hypot(goal.x,goal.y)}],best=new Map([[key(0,0),0]]),parent=new Map();let count=0,found=null;
   while(open.length&&count++<60000){
    let pick=0;for(let i=1;i<open.length;i++)if(open[i].f<open[pick].f)pick=i;
    const current=open.splice(pick,1)[0],at=toWorld(current);
    if(Math.hypot(at.x-target.x,at.y-target.y)<.8){found=current;break;}
    for(const[dx,dy]of dirs){const x=current.x+dx,y=current.y+dy;
     if(x<Math.min(0,goal.x)-margin||x>Math.max(0,goal.x)+margin||y<Math.min(0,goal.y)-margin||y>Math.max(0,goal.y)+margin)continue;
     const next={x:start.x+x,y:start.y+y},result=probe.canStep(at.x,at.y,next.x,next.y);if(!result?.ok||!bellClear(next))continue;
     const id=key(x,y),g=current.g+Math.hypot(dx,dy);if(g>=(best.get(id)??Infinity))continue;
     best.set(id,g);parent.set(id,current);open.push({x,y,g,f:g+Math.hypot(goal.x-x,goal.y-y)});
    }
   }
   if(found){const path=[];for(let node=found;node;node=parent.get(key(node.x,node.y)))path.push(toWorld(node));return{path:path.reverse(),expanded:count,margin,building};}
  }
  return{path:null,target,start,building};
 },{target,building});
}
async function aimAt(target,{building=false}={}){
 return page.evaluate(async({target,building})=>{
  const p=window.__probe.pos();let dx=target.x-p.x,dz=target.y-p.y;
  if(building){const FP=await import('/src/world/floorplan.js'),a=FP.logicalToPhysical(p.x,p.y),b=FP.logicalToPhysical(target.x,target.y);dx=b.x-a.x;dz=b.z-a.z;}
  const yaw=Math.atan2(dx,-dz);window.__probe.lookAtWorld(yaw,0);return{yaw,distance:Math.hypot(target.x-p.x,target.y-p.y)};
 },{target,building});
}
async function walkTo(target,{radius=1.15,building=false,allowExit=false,maxSeconds=240}={}){
 const begun=Date.now();let path=null,last=null,stuck=0,total=0;
 while(Date.now()-begun<maxSeconds*1000){
  const state=await snapshot();if(allowExit&&(!state.where.source||state.scene==='memory-field'||state.scene==='memory-threshold'||state.scene==='source-return-flashback'))return state;
  if(state.scene)throw Error(`Unexpected owner during ordinary walk: ${state.scene}`);
  if(Math.hypot(target.x-state.pos.x,target.y-state.pos.y)<=radius)return state;
  if(!path?.length){const planned=await planWalk(target,{building});check('actual collision supplies a traversable route',!!planned.path,{target,expanded:planned.expanded,margin:planned.margin});path=planned.path;}
  // Ordinary fixed steps can pass more than one fine planning vertex. Consume
  // the nearest reached waypoint, rather than steering back to a stale one.
  let nearest=0,bestDistance=Infinity;
  for(let i=0;i<Math.min(path.length,24);i++){const distance=Math.hypot(path[i].x-state.pos.x,path[i].y-state.pos.y);if(distance<bestDistance){nearest=i;bestDistance=distance;}}
  if(nearest>0&&bestDistance<2.2)path.splice(0,nearest);
  while(path.length&&Math.hypot(path[0].x-state.pos.x,path[0].y-state.pos.y)<.85)path.shift();
  const next=path[0]||target;
  const direction=await aimAt(next,{building});
  report.inputs.push({route:currentRoute,key:'w',kind:'held-until-one-ordinary-step',at:Date.now()});
  const stepStarted=Date.now();await page.keyboard.down('w');
  try{const until=Date.now()+1000;while(Date.now()<until){await sleep(25);const p=await page.evaluate(()=>window.__probe.pos());if(Math.hypot(p.x-state.pos.x,p.y-state.pos.y)>.1)break;}}
  finally{await page.keyboard.up('w');}
  // New keydowns can otherwise spend a fresh immediate grid step faster than
  // held walking. Keep the guide at or below the ordinary2.6m/s baseline.
  await sleep(Math.max(35,200-(Date.now()-stepStarted)));
  const now=await snapshot(),distance=Math.hypot(now.pos.x-state.pos.x,now.pos.y-state.pos.y)*.5;total+=distance;
  if(distance<.015){stuck++;path=null;}else stuck=0;
  if(stuck===3){const before=await page.evaluate(()=>window.__chunkSurferMotion?.status?.());await page.bringToFront();await page.mouse.click(640,140);await sleep(180);(report.focusRecoveries||=[]).push({route:currentRoute,at:Date.now(),position:now.pos,before,method:'Actual foreground/canvas click, no input-state or movement mutation'});}
  if(stuck>7){report.navigationFailure=await page.evaluate(({target,next})=>{const p=window.__probe,pos=p.pos(),d=p.stepDelta(),motion=window.__chunkSurferMotion?.status?.();return{target,next,pos,look:p.lookAngles(),stepDelta:d,planned:p.canStep(pos.x,pos.y,next.x,next.y),actualStep:p.canStep(pos.x,pos.y,pos.x+d[0],pos.y+d[1]),cell:p.cell(pos.x,pos.y),crossing:p.sourceCrossing(),source:p.chunkSurf(),motion};},{target,next});throw Error('Ordinary input blocked; diagnostic='+JSON.stringify({target,next,at:now.pos,stepDelta:report.navigationFailure.stepDelta,planned:report.navigationFailure.planned,actual:report.navigationFailure.actualStep,motion:report.navigationFailure.motion}));}
  if(!last||Date.now()-last.at>5000){const record={at:Date.now(),position:now.pos,source:now.where.source,scene:now.scene,distanceMetres:total,target};report.routes.at(-1)?.trail.push(record);last=record;console.log('WALK',currentRoute,JSON.stringify(record));await fs.writeFile(out+'/progress.json',JSON.stringify(record));}
 }
 throw Error('Ordinary walking timeout: '+JSON.stringify(target));
}
const doorSide=(door,cells)=>({x:(door.threshold[0].x+door.threshold[1].x)/2+door.normal[0]*cells,y:(door.threshold[0].y+door.threshold[1].y)/2+door.normal[2]*cells});
async function openPhysicalDoor(door){
 await walkTo(doorSide(door,2.6),{radius:.85});await lookWorld(Math.atan2(-door.normal[0],door.normal[2]),0);
 // Final route leaves are authored already open once eligible. Do not send
 // stray E presses to unrelated props merely because route.opened is false.
 if(door.route){const state=await snapshot(),found=state.doors.find(d=>d.id===door.id);check('final route leaves are eligible and already open',door.route==='chapel'||found?.unlocked,{route:door.route,openedProperty:found?.opened,note:'Route leaves use fraction1 when eligible; their opened property is intentionally false.'});return state;}
 for(let n=0;n<8;n++){const found=(await snapshot()).doors.find(d=>d.id===door.id);if(found?.opened||found?.route==='chapel')break;await press('e');await sleep(170);}
 const state=await snapshot(),found=state.doors.find(d=>d.id===door.id);
 if(!door.route)check('actual E opens the selected doorway',!!found?.opened,{door:door.id,found});
 return state;
}
async function enterPhysicalDoor(door){
 const ready=s=>s.field.view?.ready||s.realm.frame||s.coast.ready||s.scene==='source-return-flashback'||s.scene==='memory-field'||s.scene==='memory-threshold';
 await openPhysicalDoor(door);
 // Focus may have moved during door-open presentation. Reacquire the same
 // real canvas focus used for walking, then continue the ordinary crossing.
 await page.bringToFront();
 await page.mouse.click(640,140);
 const centre=doorSide(door,0);
 for(let n=0;n<4;n++){
  const state=await snapshot();
  if(ready(state)||state.scene)break;
  await aimAt(centre);
  await hold('w',650);
 }
 return waitFor(ready,25000,'physical doorway owner');
}
async function localWalk(kind,target,radius=.7){
 let stuck=0;
 for(let i=0;i<250;i++){
  const state=await snapshot(),body=kind==='field'?state.field.view?.state:state.coast.localPose||state.coast.saved?.pose;
  if(kind==='coast'&&!state.coast.active)return state;
  if(!body)throw Error('Local movement lost owner: '+kind);
  const dx=target.x-body.x,dz=target.z-body.z,distance=Math.hypot(dx,dz);if(distance<=radius)return body;
  await lookLocal(Math.atan2(dx,-dz),0);await hold('w',Math.min(380,Math.max(70,(distance-radius)/(kind==='field'?2.4:2.6)*1000)));
  const after=await snapshot(),p=kind==='field'?after.field.view?.state:after.coast.localPose||after.coast.saved?.pose;
  if(kind==='coast'&&!after.coast.active)return after;
  if(!p)return after;if(Math.hypot(p.x-body.x,p.z-body.z)<.01)stuck++;else stuck=0;
  if(stuck>9)throw Error('Local walking blocked: '+JSON.stringify({kind,target,body}));
 }
 throw Error('Local movement timeout');
}
async function fieldReturn(door){
 await enterPhysicalDoor(door);let state=await snapshot();check('physical crossing opens actual field owner',state.scene==='station-field'&&state.field.session.fieldId===door.fieldId);
 await samplePerformance('familiar-field');
 const before=state.takes,landmark=state.field.session.visit.landmark;
 await localWalk('field',landmark,1.35);state=await snapshot();const p=state.field.view.state;
 await lookLocal(Math.atan2(landmark.x-p.x,-(landmark.z-p.z)),Math.atan2(landmark.height-1.62,Math.hypot(landmark.x-p.x,landmark.z-p.z)));
 await press('e');check('real aimed E records the local landmark witness',(await snapshot()).field.view?.witness?.inspected);
 await shot(`field-${door.fieldId}-witness`);await localWalk('field',{x:0,z:2.5},.25);await lookLocal(Math.PI,0);await hold('w',700);
 state=await waitFor(s=>!s.field.session,15000,'covered physical field return');
 check('actual return earns meaningful durable progress',state.station?.fieldReturns?.fieldIds?.includes(door.fieldId),state.station?.fieldReturns);
 check('field occurrence leaves recordings unchanged',JSON.stringify(state.takes)===JSON.stringify(before));
 check('local return never consumes canonical fifth',!state.flags['memory.field.fifth']);
}
async function coastReturn(){
 if(process.env.ROUTE_VERIFY_COAST==='reuse'){
  const file=process.env.ROUTE_VERIFY_COAST_EVIDENCE;if(!file)throw Error('Coast reuse needs an exact earlier receipt path');
  const bytes=await fs.readFile(file);report.routes.at(-1).coastEvidence={reused:true,file,sha256:sha(bytes),note:'Earlier separately staged coastal evidence; not earned in this continuous route.'};return;
 }
 const door=(await snapshot()).doors.find(d=>d.personal&&!d.erased);check('optional coastal invitation exists',!!door);
 await enterPhysicalDoor(door);let state=await waitFor(s=>s.scene==='coastal-memory'&&s.coast.ready,90000,'actual coastal renderer');
 check('ordinary crossing presents the actual coastal scene',state.coast.active&&state.coast.saved?.active);await shot('coast-arrival');
 const takes=state.takes;
 for(const[x,z]of[[6,-26],[6.4,-20.5],[6,-15],[5.2,-9.5],[4.6,-6.3],[5.4,-4],[5.9,0],[6.2,4.5],[6.3,7.2]]){
  if(!(await snapshot()).coast.active)break;await localWalk('coast',{x,z},.3);
 }
 state=await waitFor(s=>!s.coast.active,20000,'physical shingle departure');
 check('coastal departure returns to the borrowed branch once',state.where.source&&state.coast.saved.completed);
 check('unrecorded coast leaves previous recordings unchanged',JSON.stringify(state.takes)===JSON.stringify(takes));
}
async function homeReturn(){
 const door=(await snapshot()).doors.find(d=>d.destination?.kind==='home');check('one meaningful return opens optional chapel home',door?.home);
 await enterPhysicalDoor(door);let state=await snapshot();check('home uses its actual outside-window realm',state.realm.frame?.home?.eligible);
 const frame=state.realm.frame,entryYaw=Math.atan2(state.source?.station?.crossing?.forward?.[0]||-door.normal[0],-(state.source?.station?.crossing?.forward?.[1]||-door.normal[2]));
 await lookWorld(entryYaw,0);await hold('w',1000);const stopped=await snapshot();await sleep(350);const still=await snapshot();
 check('stopping home approach preserves position',Math.hypot(still.realm.frame.pose.x-stopped.realm.frame.pose.x,still.realm.frame.pose.z-stopped.realm.frame.pose.z)<.04);
 for(let n=0;n<130;n++){
  state=await snapshot();if(state.realm.frame?.atWindow)break;
  check('home retains its physical owner',!!state.realm.frame);
  const p=state.realm.frame.pose,t=state.realm.frame.window,dy=Math.atan2(t.x-p.x,t.z-p.z);
  await lookWorld(entryYaw+dy,0);await hold('w',Math.min(400,Math.max(100,(Math.hypot(t.x-p.x,t.z-p.z)-2.6)/2.6*1000)));
 }
 state=await snapshot();check('ordinary walking reaches the closed bedroom window',state.realm.frame?.atWindow);await shot('home-closed-window');
 await lookWorld(entryYaw+Math.PI,0);await hold('w',550);await waitFor(s=>!s.realm.frame,15000,'deliberate home departure');
}
async function walkHome(target,entryYaw,radius=.68){
 let stuck=0;
 for(let i=0;i<175;i++){
  const pose=(await snapshot()).realm.frame?.pose;
  if(!pose)throw Error('Walk lost the childhood grounds');
  const dx=target.x-pose.x,dz=target.z-pose.z,dist=Math.hypot(dx,dz);
  if(dist<=radius)return pose;
  await lookWorld(entryYaw+Math.atan2(dx,dz),-.03);
  await hold('w',Math.min(440,Math.max(75,(dist-radius)/2.6*1000)));
  const next=(await snapshot()).realm.frame?.pose;
  if(!next)throw Error('Walk left the childhood grounds before reaching '+JSON.stringify(target));
  stuck=Math.hypot(next.x-pose.x,next.z-pose.z)<.015?stuck+1:0;
  if(stuck>8)throw Error('Grounds walk blocked: '+JSON.stringify({pose,target}));
 }
 throw Error('Grounds walk timed out: '+JSON.stringify(target));
}
async function reviewHomeGrounds(){
 const door=(await snapshot()).doors.find(d=>d.destination?.kind==='home');
 check('the field return opens the real optional home doorway',door?.home);
 await enterPhysicalDoor(door);
 const entryYaw=Math.atan2(-door.normal[0],door.normal[2]);
 const walk=(x,z,radius)=>walkHome({x,z},entryYaw,radius);
 const photo=async(name,yaw=0,pitch=0)=>{await lookWorld(entryYaw+yaw,pitch);await sleep(280);return shot(name);};
 await walk(0,3);
 await photo('ground-entry');
 await samplePerformance('home-open-lane');
 await walk(0,19.3);await photo('ground-road-and-lee',.26,-.12);
 await walk(5.05,20.2);await walk(5.05,32.9);await walk(5.05,40.2);
 let state=await photo('ground-lower-lee');
 check('ordinary detour reaches lower physical ground',state.realm.frame.pose.floorY<-.55&&!state.realm.frame.atWindow,state.realm.frame.pose);
 await samplePerformance('home-sheltered-lee');
 await photo('ground-drainage-outlet',Math.atan2(2.10,2.45),-.35);
 state=await photo('ground-lee-return-bearing');
 const before=state.realm.frame.pose;
 await reloadContinue();
 state=await snapshot();
 const after=state.realm.frame?.pose;
 check('real Continue restores lee floor, position and gaze',after&&Math.hypot(after.x-before.x,after.z-before.z)<.06
   &&Math.abs(after.floorY-before.floorY)<.03&&Math.abs(after.yaw-before.yaw)<.12,{before,after});
 await walk(5.05,49.9);await walk(0,53.1);await photo('ground-rejoined-property');
 await walk(0,57);await photo('ground-approach-z57');
 await walk(0,64);await photo('ground-look-back',Math.PI);
 await walk(6.43,64);await walk(6.86,73.1);
 state=await photo('ground-lower-door',Math.atan2(-1.46,.35),-.51);
 check('normal movement reaches the lower house face without recognizing the window',
   state.realm.frame.pose.floorY<-.80&&!state.realm.frame.homeState?.recognized,state.realm.frame.pose);
 await walk(6.55,65.1);await walk(0,64);await walk(0,66.0);
 await photo('ground-house-emerges');
 const window=(await snapshot()).realm.frame.window;
 await walk(window.x,68.7);
 state=await photo('ground-closed-window');
 check('closed bedroom recognizes without early jumper delivery',state.realm.frame.atWindow
   &&state.flags['station.home.restored']&&!state.flags['station.jumper'],state.realm.frame.homeState);
 await samplePerformance('home-bedroom-window');
 await photo('ground-stationary-look-back',Math.PI);
 check('looking back alone keeps the visit active',!!(await snapshot()).realm.frame?.homeState?.recognized);
 await hold('w',550);
 state=await snapshot();
 check('walking away from the bedroom keeps the valley open',state.realm.frame?.stage==='inside'&&!state.flags['station.jumper']);
 await page.keyboard.press('e');
 state=await waitFor(s=>!s.realm.frame&&s.flags['station.jumper'],18000,'deliberate quick departure delivers the jumper');
 check('departure preserves borrowed Source route and grants existing jumper',state.where.source&&state.flags['station.home.seen']);
}
async function reloadContinue(){
 await sleep(1200);for(let i=0;i<4;i++){if((await snapshot()).scene==='pause')break;await press('Escape');await sleep(250);}await waitFor(s=>s.scene==='pause',5000,'actual pause menu');const before=await snapshot();
 await page.reload({waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>window.__probe?.testRun,{timeout:120000});
 await page.waitForFunction(()=>window.__scenes.top()?.id==='title',{timeout:120000});await press('Enter');
 const after=await waitFor(s=>s.where.source&&!s.scene,120000,'real title Continue restores branch');
 check('save/reload preserves branch body and durable field returns',Math.hypot(after.pos.x-before.pos.x,after.pos.y-before.pos.y)<.6&&JSON.stringify(after.station?.fieldReturns)===JSON.stringify(before.station?.fieldReturns),{before:before.pos,after:after.pos,earned:after.station?.fieldReturns});
 check('reload preserves recording inventory',JSON.stringify(after.takes)===JSON.stringify(before.takes));
}
async function finalDoorAndArrival(route){
 const door=(await snapshot()).doors.find(d=>d.route===route);check('real branch destination door exists',!!door);
 await openPhysicalDoor(door);await sleep(700);const before=await shot('final-door-open-before-crossing');
 const preview=before.towerView;
 check(`${route}: actual destination is drawn through the correct Source door before crossing`,preview?.captured&&preview?.submitted&&preview.drawn>0&&preview.capture?.key===door.id,{door:door.id,preview});
 await samplePerformance('opened-destination-door');
 check('canonical fifth remains owed until physical final commitment',!before.flags['memory.field.fifth']);
 const film=await startRouteFilm(page);filmStarted=true;console.log('FILM',currentRoute,JSON.stringify(film));
 await lookWorld(Math.atan2(-door.normal[0],door.normal[2]),0);await hold('w',1150);
 let state=await waitFor(s=>s.scene==='memory-threshold'||s.scene==='memory-field'||s.returnFilm||!s.where.source,20000,'full Source doorway crossing');
 const saw=await waitFor(s=>s.canonical?.visit==='fifth'||s.canonical?.state?.visit==='fifth'||s.scene==='source-return-flashback',20000,'canonical fifth owner');
 check('final door launches canonical fifth through its normal wrapper',saw.scene==='memory-field'&&(saw.canonical?.visit==='fifth'||saw.canonical?.state?.visit==='fifth'),{scene:saw.scene,canonical:saw.canonical,flag:saw.flags['memory.field.fifth']});
 await shot('canonical-fifth-after-final-crossing');
 state=await waitFor(s=>s.scene==='source-return-flashback',115000,'canonical fifth releases into real return film');
 check('actual destination preview after crossing remains separate from pre-cross portal',state.worldPresentation==='visible'&&state.returnFilm?.preview<3,state.returnFilm);
 await shot('post-cross-destination-preview');
 const phases=new Set(),deadline=Date.now()+115000;let movingWithoutEnter=false;
 while(Date.now()<deadline){
  state=await snapshot();if(state.scene!=='source-return-flashback')break;
  const phase=state.returnFilm?.frame?.phase,time=state.returnFilm?.checkpoint?.elapsed||0,phaseStart={seabed:0,'reverse-bluffs':8,hydroplane:23,'forward-bluffs':29,'camera-release':44,'source-black':51}[phase];if(state.returnFilm?.ready&&state.returnFilm.presented&&phase&&!phases.has(phase)&&time>=(phaseStart??0)+1.5){phases.add(phase);await shot('return-'+phase);}
  if(!movingWithoutEnter&&state.returnFilm?.ready&&state.returnFilm.checkpoint.elapsed>1){movingWithoutEnter=true;check('return film advances without an Enter-to-start action',true,{elapsed:state.returnFilm.checkpoint.elapsed});}
  await sleep(500);
 }
 state=await snapshot();check('uninterrupted film restores actual building and releases its owner',!state.where.source&&state.scene!=='source-return-flashback'&&!state.returnFilm,{where:state.where,scene:state.scene});
 const expected=before.towerView.destinationDoor?.arrival;
 check('actual arrival retains the previewed physical doorway across the canonical field',expected&&Math.hypot(state.pos.x-expected.x,state.pos.y-expected.y)<.01,{expected,actual:state.pos});
 check('reverse-sea film presents all authored phases',['seabed','reverse-bluffs','hydroplane','forward-bluffs','camera-release','source-black'].every(phase=>phases.has(phase)),[...phases]);
 check('return film began and advanced without Enter',movingWithoutEnter);
 await shot('actual-building-arrival');
 (report.films||=[]).push({route:currentRoute,...await stopRouteFilm(page,path.join(out,currentRoute+'-final-door-to-arrival.webm'))});filmStarted=false;
 await samplePerformance('actual-building-arrival');
 // An ordinary onward passage, without staging a new floor or encounter. The
 // exact terminal cell is chosen from reachable current building construction.
 const start=state.pos,candidates=[[0,-8],[8,0],[0,8],[-8,0],[4,-4],[-4,-4]];let end=null;
 for(const[dx,dy]of candidates){const target={x:start.x+dx,y:start.y+dy},planned=await planWalk(target,{building:true});if(planned.path){end=target;break;}}
 check('arrival has a real onward route in its actual construction',!!end);
 await walkTo(end,{building:true,radius:1.1,maxSeconds:45});state=await snapshot();
 check('ordinary control continues along the building route',Math.hypot(state.pos.x-start.x,state.pos.y-start.y)*.5>=2.5,{start,end:state.pos});
 await shot('onward-building-path');return state;
}
async function boot(){
 await page.goto(`http://127.0.0.1:${port}/?nodisplaynotice=1&skipwarn=1&nomic=1&sam=0&nothink=1`,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>window.__probe?.testRun,{timeout:180000});
 for(let i=0;i<240;i++){
  const id=await page.evaluate(()=>window.__scenes.top()?.id);if(id==='title')return;
  if(id==='eula'){if(process.env.ROUTE_ACCEPT_EULA!=='1')throw Error('EULA displayed; run needs the already-authorized ROUTE_ACCEPT_EULA=1, not an automatic agreement.');await page.keyboard.press('Enter');}
  await sleep(400);
 }
 throw Error('Frontend did not reach title');
}
async function walkValley(door=null,{stagedCrossing=false}={}){
  door??=(await snapshot()).doors.find(d=>d.destination?.kind==='home');
  check('the optional home doorway is eligible',door?.home);
  if(stagedCrossing){
   await page.evaluate(id=>window.__probe.crossFieldDoor(id),door.id);
   await waitFor(state=>state.realm.frame?.home?.eligible,20000,'the real occupied home renderer');
  }else await enterPhysicalDoor(door);
  const entryYaw=Math.atan2(-door.normal[0],door.normal[2]);
  if(valleySignsReview){
   const {reviewValleySigns}=await import('./verify-childhood-valley-signs.mjs');
   await reviewValleySigns({check,shot,sleep,lookWorld,snapshot,waitFor,walkHome,report,entryYaw});
   return;
  }
  if(valleyConstructionReview){
   const {reviewValleyConstruction}=await import('./verify-childhood-valley-construction.mjs');
   const baselinePath=process.env.ROUTE_VERIFY_CONSTRUCTION_BASELINE;
   const baseline=baselinePath?JSON.parse(await fs.readFile(baselinePath,'utf8')):null;
   await reviewValleyConstruction({page,check,shot,hold,sleep,lookWorld,snapshot,waitFor,walkHome,report,entryYaw,
    samplePerformance,constructionPass,baseline,baselinePath});
   return;
  }
  if(valleyMusicReview){
   const {reviewValleyMusic}=await import('./verify-childhood-valley-music.mjs');
   const film=await startRouteFilm(page);filmStarted=true;
   check('the actual game output is attached to the review film',film.audioTracks===1,film);
   await reviewValleyMusic({check,shot,hold,press,sleep,lookWorld,snapshot,waitFor,walkHome,report,entryYaw});
   (report.films||=[]).push({route:currentRoute,...await stopRouteFilm(page,path.join(out,'valley-music-walk.webm'))});
   filmStarted=false;
   return;
  }
  const {reviewChildhoodValley,reviewValleyActivities}=await import('./verify-childhood-valley.mjs');
  const run=process.env.ROUTE_VERIFY_VALLEY_ACTIVITIES==='1'?reviewValleyActivities:reviewChildhoodValley;
  await run({check,shot,hold,press,sleep,lookWorld,snapshot,waitFor,walkHome,reloadContinue,report,entryYaw,samplePerformance,page});
}
async function runRoute(route){
 currentRoute=route;const run={route,fixture:route==='tower'?'bellsPreset(0)':'chapelOutskirtsPreset(0)',history:'Horizon choice and Source I staged; all following travel earned by actual key input',trail:[]};report.routes.push(run);
 await page.evaluate(async route=>{
  await window.__probe.testRun();window.__probe.tutSkip();window.__probe.setFlags(['setup.levels','combat.trained','setup.waypoint','kit.fitted','title.shown','prologueDone','opening.driveTeaser.consumed','memory.field.first','memory.field.second','memory.field.third','memory.field.fourth']);
  const {SETUP_HANDOFF}=await import('/src/game/setup-handoff.js');window.__probe.setFlags([SETUP_HANDOFF.closed,SETUP_HANDOFF.arrived,SETUP_HANDOFF.skillsDone,SETUP_HANDOFF.skillsClosed]);
  window.__probe.godRow('field-ready');
  window.__probe.setTakes(['main_b3','the_tub','amplifications','soundnoisemusic'],true);
 },route);
 // Historical C-17 ownership is supplied before travel; remove the review
 // master key through its actual menu owner rather than bypassing doors later.
 await page.evaluate(()=>window.__probe.godMenu('inventory'));
 for(const[id,key,wanted]of[['chapel-key','chapel',true],['master-key','master',false]]){
  const has=await page.evaluate(key=>window.__probe.keys().includes(key),key);
  if(has===wanted)continue;
  for(let i=0;i<100;i++){if(await page.evaluate(id=>window.__scenes.top()?.view?.().row===id,id))break;await press('ArrowDown');}
  check('historical inventory owner selects '+id,await page.evaluate(id=>window.__scenes.top()?.view?.().row===id,id));await press('Space');
  check('historical inventory owns '+key+' = '+wanted,await page.evaluate(({key,wanted})=>window.__probe.keys().includes(key)===wanted,{key,wanted}));
 }
 await press('Escape');
 if(route==='tower'&&process.env.ROUTE_VERIFY_TOWER_STAGED_BELFRY==='1'){
  report.scope='Isolated tower continuation starting at the game’s developer belfry checkpoint. Subsequent travel, combat and extraction use ordinary controls.';
  run.fixture='cathedralPreset(entry)';
  run.history='Source route and arrival are supplied by this checkpoint. Separate earned approach receipt retained.';
  check('actual belfry diagnostic checkpoint loads',await page.evaluate(()=>window.__probe.cathedralPreset('entry')));
  const module=await import('./verify-tower-route-continuation.mjs');
  run.selectedEnding=await module.runTowerContinuation({page,check,shot,hold,press,waitFor,walkTo,snapshot,sleep,report});
  run.completed=true;
  return;
 }
 await page.evaluate(async route=>{window.__probe.sourceChapelReady();if(route==='tower')await window.__probe.bellsPreset(0);else await window.__probe.chapelOutskirtsPreset(0);window.__probe.hush();},route);await sleep(900);
 let state=await snapshot();run.start=state;check('fixture starts at the selected branch entry',state.source.phase===(route==='tower'?'bells':'chapel-outskirts'));
 check('fixture does not inject canonical fifth or earned local return',!state.flags['memory.field.fifth']&&!state.station?.fieldReturns?.fieldIds?.length);
 if(route==='chapel'&&(valleyMusicReview||valleyConstructionReview||valleySignsReview||(process.env.ROUTE_VERIFY_CHILDHOOD_VALLEY==='1'&&process.env.ROUTE_VERIFY_VALLEY_CHECKPOINT==='1'))){
  const activities=process.env.ROUTE_VERIFY_VALLEY_ACTIVITIES==='1';
  if(!valleyMusicReview&&!valleyConstructionReview&&!valleySignsReview)report.scope=activities
   ? 'Developer-staged entry to the childhood valley. A live random draw, all three local activities, title Continue and the selected fatal ending use the actual game. Guided gaze and ordinary controls are used. The closing drive is skipped with its normal hold input once presented.'
   : 'Actual exterior valley walking and retreat. Developer fixture supplies eligibility and entry through the optional door; local movement and retreat use ordinary input.';
  await page.evaluate(()=>window.__probe.stationErrand(['burning','flood','inverted','two-moons','glass-storm']));
  const door=(await snapshot()).doors.find(d=>d.destination?.kind==='home');
  check('the fixture has a real home doorway',!!door);
  await page.evaluate(p=>window.__probe.sourceWarp(p.x,p.y),doorSide(door,2.6));
  await walkValley(door,{stagedCrossing:true});run.completed=true;return;
 }
 if(process.env.ROUTE_NAV_DIAG==='visits'){
  report.scope='Developer-staged optional-visit navigation diagnosis, not an earned route or acceptance run';run.fixture+=' + legacy home eligibility and home approach staging';
  await page.evaluate(()=>window.__probe.stationErrand(['burning','flood','inverted','two-moons','glass-storm']));
  const home=(await snapshot()).doors.find(d=>d.destination?.kind==='home');const front=doorSide(home,2.6);await page.evaluate(p=>window.__probe.sourceWarp(p.x,p.y),front);await homeReturn();await coastReturn();
  const final=(await snapshot()).doors.find(d=>d.route===route);await walkTo(doorSide(final,2.6),{radius:.85});run.completed=true;return;
 }
 if(process.env.ROUTE_NAV_DIAG==='1'){
  report.scope='Explicitly developer-staged navigation diagnosis, not an earned route or acceptance run';run.fixture+=' + exact failed body pose';
  await page.evaluate(()=>window.__probe.sourceWarp(-2.6528232620653434,-3942.6801411611013));await sleep(300);
  for(const[yaw,name]of[[0,'north'],[Math.PI/2,'east'],[Math.PI,'south'],[-Math.PI/2,'west']]){
   await page.evaluate(()=>window.__probe.sourceWarp(-2.6528232620653434,-3942.6801411611013));await lookWorld(yaw,0);await page.keyboard.down('w');await sleep(300);
   const diagnostic=await page.evaluate(()=>{const p=window.__probe,pos=p.pos(),d=p.stepDelta();return{pos,delta:d,look:p.lookAngles(),motion:window.__chunkSurferMotion?.status?.(),legal:p.canStep(pos.x,pos.y,pos.x+d[0],pos.y+d[1]),crossing:p.sourceCrossing()};});await page.keyboard.up('w');(run.directionDiagnostics||=[]).push({name,...diagnostic});console.log('DIAG',name,JSON.stringify(diagnostic));
  }
  run.completed=true;return;
 }
 const takes=state.takes,origin=state.pos;await lookWorld(0,0);await hold('w',1700);const forward=await snapshot();await sleep(400);const still=await snapshot();
 check('ordinary stop preserves branch position',Math.hypot(still.pos.x-forward.pos.x,still.pos.y-forward.pos.y)<.05);
 await lookWorld(Math.PI,0);await shot('look-back');await hold('w',650);const back=await snapshot();
 check('look back and ordinary retreat move toward the entry',Math.hypot(back.pos.x-origin.x,back.pos.y-origin.y)<Math.hypot(forward.pos.x-origin.x,forward.pos.y-origin.y));await lookWorld(0,0);
 const connection=route==='tower'?'field-return-a':null;
 const first=state.doors.find(d=>!d.shut&&!d.erased&&(connection?d.connectionId===connection:d.fieldId==='first'));
 await fieldReturn(first);await reloadContinue();
 if(route==='chapel'&&process.env.ROUTE_VERIFY_CHILDHOOD_VALLEY==='1'){
  report.scope='Actual home-world exploration and retreat without visiting the pane. Previous history is a staged chapel branch, followed by an ordinary prerequisite field return.';
  await walkValley();run.completed=true;return;
 }
 if(route==='chapel'&&process.env.ROUTE_VERIFY_HOME_GROUNDS==='1'){
  report.scope='Childhood grounds from one real field return through physical home entry, detour, Continue, lower facade, window and jumper return. Earlier history uses the chapel branch fixture.';
  await reviewHomeGrounds();run.completed=true;return;
 }
 if(route==='chapel'&&process.env.ROUTE_VERIFY_HOME!=='0')await homeReturn();
 if(route==='tower'){
  check('one return cannot release both bolts',!(await snapshot()).doors.find(d=>d.route==='tower').unlocked);
  await fieldReturn((await snapshot()).doors.find(d=>d.connectionId==='field-return-b'));
  check('both meaningful physical returns release the tower',(await snapshot()).doors.find(d=>d.route==='tower').unlocked);
 }
 await coastReturn();const end=await finalDoorAndArrival(route);run.end=end;
 check('complete branch and return preserve previous recordings',JSON.stringify(end.takes)===JSON.stringify(takes));run.branchCompleted=true;
 if(completeEnding){const module=await import(route==='chapel'?'./verify-chapel-route-continuation.mjs':'./verify-tower-route-continuation.mjs');const context={page,check,shot,hold,press,waitFor,walkTo,snapshot,sleep,report};run.selectedEnding=await (route==='chapel'?module.runChapelContinuation(context):module.runTowerContinuation(context));}
 run.completed=true;
}

try{
 server=await createServer({cacheDir:path.join(out,'vite-cache'),optimizeDeps:{noDiscovery:true,include:['three','@tauri-apps/api/core','three/addons/environments/RoomEnvironment.js','three/addons/geometries/RoundedBoxGeometry.js','three/addons/utils/BufferGeometryUtils.js']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null}});await server.listen();
 profile=await fs.mkdtemp(path.join(os.tmpdir(),'chapel-tower-complete-'));
 browser=await puppeteer.launch({executablePath:process.env.ROUTE_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:false,pipe:true,userDataDir:profile,protocolTimeout:45000,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1280,840']});
 for(const route of routes){
  try{
  // Each branch receives genuinely separate local storage. Starting the tower
  // must not inherit the chapel run's delivered canonical fifth or rewards.
  context=await browser.createBrowserContext();page=await context.newPage();await page.setViewport({width:1280,height:800,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true}));
  page.on('pageerror',error=>report.errors.push(String(error.stack||error)));page.on('console',message=>{if(/LOOP FAULT|ERROR: 0:|source portal preview unavailable/.test(message.text()))report.errors.push(message.text());});
  await boot();report.gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas.r3d').getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight]};});
  await runRoute(route);
  }catch(error){
   (report.routeFailures||=[]).push({route,error:String(error.stack||error)});
   if(page)await page.screenshot({path:path.join(out,`${route}-failure.png`)}).catch(()=>{});
   if(filmStarted&&page){try{(report.films||=[]).push({route,partial:true,...await stopRouteFilm(page,path.join(out,`${route}-incomplete-film.webm`))});}catch{}filmStarted=false;}
   console.error(route,error.message);
  }finally{
   await context?.close().catch(()=>{});context=null;page=null;
  }
 }
 check('no JavaScript or shader loop faults',report.errors.length===0,report.errors);
 for(const file of files)check('source remained frozen: '+file,sha(await fs.readFile(file))===report.sources[file]);
 report.completed=report.routes.length===routes.length&&report.routes.every(route=>route.completed)&&!report.unresolvedObligations.length;
 if(!report.completed)process.exitCode=1;
}catch(error){report.failure=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,`${currentRoute||'boot'}-failure.png`)}).catch(()=>{});console.error(report.failure);}
finally{
 if(filmStarted&&page){try{(report.films||=[]).push({route:currentRoute,partial:true,...await stopRouteFilm(page,path.join(out,currentRoute+'-incomplete-film.webm'))});}catch(error){report.filmFailure=String(error);}filmStarted=false;}
 await browser?.close().catch(()=>{});await server?.close();if(profile)await fs.rm(profile,{recursive:true,force:true});
 report.finishedAt=new Date().toISOString();await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({completed:report.completed,checks:report.checks.length,errors:report.errors,unresolved:report.unresolvedObligations,failure:report.failure}));
}
