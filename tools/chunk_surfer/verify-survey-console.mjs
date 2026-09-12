// Production Bag + physical conservatory compiler, disposable state adapter.
// No illustrative map fixture, image-generated controls, or user save writes.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
const base=process.env.CHUNK_SURFER_URL||'http://127.0.0.1:5296';
const out='artifacts/survey-console';await mkdir(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal']});
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack||e.message));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const shot=async name=>{await pause(180);await page.screenshot({path:`${out}/${name}.png`});};
const nav=()=>page.evaluate(()=>window.__survey.scene.debugState().mapNav);
async function screenPoint(point){return page.evaluate(point=>{
 const ui=window.__survey.ui,s=ui.uiSize(),r=document.getElementById('survey').getBoundingClientRect();
 return{x:r.left+point.x/s.cols*r.width,y:r.top+point.y/s.rows*r.height};
},point);}
async function click(id){
 const p=await page.evaluate(async id=>{
  const {scene}=window.__survey;scene.render();const hit=scene.debugState().hitRegions.find(h=>h.id===id);
  if(!hit)throw new Error(`Missing hit ${id}`);
  const ui=await import('/src/render/ui.js'),s=ui.uiSize(),r=document.getElementById('survey').getBoundingClientRect();
  return{x:r.left+(hit.x+hit.w/2)/s.cols*r.width,y:r.top+(hit.y+hit.h/2)/s.rows*r.height};
},id);await page.mouse.click(p.x,p.y);await pause(100);
}
async function polygonClick(spaceId=null){
 const selected=await page.evaluate(async wanted=>{
  window.__survey.scene.render();
  const d=window.__survey.scene.debugState(),{pointInMapPolygon}=await import('/src/game/map-axonometric.js');
  const hits=d.mapPresentation.hits.filter(hit=>hit.kind==='map-space'&&hit.polygons?.length&&(!wanted||hit.payload.spaceId===wanted));
  for(const hit of hits)for(const polygon of hit.polygons){
   const point={x:polygon.reduce((sum,p)=>sum+p.x,0)/polygon.length,y:polygon.reduce((sum,p)=>sum+p.y,0)/polygon.length};
   if(point.x<hit.x||point.x>=hit.x+hit.w||point.y<hit.y||point.y>=hit.y+hit.h||!pointInMapPolygon(point,polygon))continue;
   return{id:hit.payload.spaceId,point,polygon};
  }throw Error(`No visible canonical polygon for ${wanted||'this floor'}`);
 },spaceId);
 const p=await screenPoint(selected.point);await page.mouse.click(p.x,p.y);await pause(100);
 assert.equal(await page.evaluate(()=>window.__survey.scene.debugState().mapSelected?.id),selected.id);
 return selected;
}
async function focusControl(id){
 const path=await page.evaluate(async id=>{
  const d=window.__survey.scene.debugState(),{moveMapConsoleFocus}=await import('/src/game/map-navigation.js');
  const controls=d.mapPresentation.hits.filter(h=>h.kind==='map-control'),m=window.__survey.ui.uiCellMetrics();
  const paths=new Map([[d.mapNav.focusedControlId,[]]]),queue=[...paths.keys()];
  const dirs=[['ArrowUp',{x:0,y:-1}],['ArrowDown',{x:0,y:1}],['ArrowLeft',{x:-1,y:0}],['ArrowRight',{x:1,y:0}]];
  while(queue.length){const current=queue.shift();if(current===id)return paths.get(current);
   for(const[key,vector]of dirs){const next=moveMapConsoleFocus(current,vector,controls,{cellAspect:m.cellW/m.cellH});
    if(!paths.has(next)){paths.set(next,[...paths.get(current),key]);queue.push(next);}
   }
  }throw Error(`Console control is not keyboard reachable: ${id}`);
 },id);
 for(const key of path)await page.keyboard.press(key);
 assert.equal((await nav()).focusedControlId,id);
}
async function footerProof(){
 const footer=await page.evaluate(async()=>{
  const s=window.__survey,d=s.scene.debugState(),{mapActionRail}=await import('/src/game/map-actions.js');
  const width=s.lastRender.layout.actionRail.w,offline=!!d.model.mapUnavailableReason;
  const actions=mapActionRail(d.mapSelected,{floorCount:d.model.map?.floors?.length||1,width,consoleFocused:!!d.mapNav.focusedControlId,offline});
  return{width,actions,offline,focused:!!d.mapNav.focusedControlId,text:actions.map(([key,label])=>`[${key}] ${label}`).join('   ')};
 });
 if(!footer.offline){assert.ok(footer.actions.some(([key])=>key==='F6'));assert.ok(footer.actions.some(([key])=>key==='ENTER'));}
 if(!footer.focused)assert.ok(footer.actions.some(([,label])=>label==='CLOSE'));
 assert.ok(footer.text.length<=footer.width,`essential footer fits (${footer.text.length}/${footer.width}): ${footer.text}`);
 return footer;
}
try{
 await page.setViewport({width:1600,height:1050,deviceScaleFactor:1});
 await page.goto(`${base}/src/game/bag.js`);
 await page.setContent('<link rel="stylesheet" href="/styles.css"><style>html,body{margin:0;background:#08100c}#survey{position:relative;width:100vw;height:100vh}</style><div id="survey"></div>');
 await page.evaluate(async()=>{
  const ui=await import('/src/render/ui.js'),scenes=await import('/src/game/scenes.js');
  const {conservatory}=await import('/src/data/floorplan/conservatory.js'),FP=await import('/src/world/floorplan.js');
  const {BUILDING_MAP}=await import('/src/data/building-map.js');
  const {captureFloorplanMapSource,buildMapModel}=await import('/src/game/map-model.js');
  const {ROOM_CELLS,TARGETS}=await import('/src/data/conservatory-script.js');
  const {makeBagScene}=await import('/src/game/bag.js');
  FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],edgePortals:conservatory.edgePortals||[]});
  const project=p=>{const r=FP.toRuntimePoint(p),q=FP.logicalToPhysical(r.x,r.y);return{x:q.x,z:q.z,height:q.y,renderGroup:q.renderGroup};};
  const labels=['STUDIO B3','THE NATATORIUM','THE CONCERT HALL','THE PRACTICE WING','THE CHAPEL'];
  const source=captureFloorplanMapSource({definition:BUILDING_MAP,physical:FP.physicalSpanData(),stairPortals:FP.floorplan().stairPortals,stairRuns:FP.floorplan().stairRuns,projectLogical:project,labelForRoom:id=>labels[TARGETS.indexOf(id)]||id});
  const job={done:0,total:5,rooms:TARGETS.map((roomId,i)=>({roomId,label:labels[i],recorded:false,notes:i===0?[{id:'work-order',title:'WORK ORDER',pages:['Five room tones.']}]:[]}))};
  const p=project(ROOM_CELLS.main_b3),state={target:null,offlineReason:'',policy:{id:'directional',showMapTopology:true,showRoute:false,showRouteStatus:false},calls:0};
  const build=()=>buildMapModel({source,job,player:{x:p.x,y:p.z,height:p.height,renderGroup:p.renderGroup,roomId:'main_b3',heading:0},playerWaypoint:state.target,navigation:state.policy});
  let model=build(),lastRender=null;
  const scene=makeBagScene({getEquipment:()=>state.offlineReason?['light']:['map','light','recorder + headphones'],getJob:()=>job,getMap:()=>state.offlineReason?null:model,
    getMapUnavailableReason:()=>state.offlineReason,debug:value=>{lastRender=value;},
    focus:{sectionId:'map',roomId:'main_b3'},memory:null,
    setMapTarget:s=>{state.calls++;state.target={spaceId:s.id,roomId:s.roomId,label:s.label,floorId:s.floorId,position:s.position,height:s.height};model=build();return true;},
    clearMapTarget:()=>{state.target=null;model=build();return true;}});
  ui.uiInit(document.getElementById('survey'));await document.fonts.load('600 14px "Hardware Sans"');scenes.push(scene);
  window.__survey={scene,source,state,ui,scenes,get lastRender(){return lastRender;},setPolicy:policy=>{state.policy=policy;model=build();scene.refresh();},
    setOffline:reason=>{state.offlineReason=reason;scene.refresh();}};
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','wheel'])window.addEventListener(type,e=>scenes.pointer({type,pointerId:e.pointerId,button:e.button,...ui.uiPointFromClient(e.clientX,e.clientY),deltaY:e.deltaY,originalEvent:e,preventDefault:()=>e.preventDefault()}),{passive:false});
  window.addEventListener('keydown',e=>{e.preventDefault();scenes.key(e);});window.addEventListener('keyup',e=>scenes.keyup(e));
  let prev=performance.now();function frame(now){scenes.update(Math.min(.1,(now-prev)/1000));prev=now;ui.uiClear();scenes.render();requestAnimationFrame(frame);}requestAnimationFrame(frame);
 });
 await pause(500);await shot('stack-wide');
 const stats=await page.evaluate(()=>window.__survey.source.architecture.stats);assert.ok(stats.spans>50000);
 const warmDrawTiming=await page.evaluate(()=>{
  const {ui,scene}=window.__survey,samples=[];
  for(let i=0;i<12;i++){
   const start=performance.now();ui.uiClear();scene.render();samples.push(performance.now()-start);
  }
  const sorted=[...samples].sort((a,b)=>a-b);
  return{viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},sampleCount:samples.length,
   medianMs:(sorted[5]+sorted[6])/2,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],samplesMs:samples,
   scope:'12 sequential warm uiClear() + scene.render() calls. JavaScript draw-call timing, not GPU completion, actual frame rate, or native game performance.'};
 });
 assert.equal(warmDrawTiming.sampleCount,12);assert.deepEqual(warmDrawTiming.viewport,{width:1600,height:1050,dpr:1});
 const interactions={polygon:await polygonClick('space:main_b3')};
 assert.equal(await page.evaluate(()=>window.__survey.state.calls),0,'room polygon press only selects');
 await page.keyboard.press('PageDown');interactions.otherFloorPolygon=await polygonClick();
 assert.equal(await page.evaluate(()=>window.__survey.state.calls),0);
 await page.keyboard.press('c');assert.equal((await nav()).floorId,'b1');
 await page.keyboard.press('F6');assert.ok((await nav()).focusedControlId);
 await focusControl('bag:map:rotate-right');await shot('console-focus');interactions.consoleFooter=await footerProof();
 const oldRotation=(await nav()).rotation;await page.keyboard.press('Enter');assert.equal((await nav()).rotation,(oldRotation+1)%4);
 await page.keyboard.press('Escape');assert.equal((await nav()).focusedControlId,null);
 assert.equal(await page.evaluate(()=>window.__survey.scenes.top()?.id),'bag','Escape leaves console focus, not the Bag');
 await click('bag:map:reset-view');
 const background=await page.evaluate(async()=>{
  const d=window.__survey.scene.debugState(),v=d.mapPresentation.layout.mapViewport,{pointInMapPolygon}=await import('/src/game/map-axonometric.js');
  for(let y=v.y+.15;y<v.y+v.h;y+=.8)for(let x=v.x+.15;x<v.x+v.w;x+=1){
   const p={x,y},occupied=d.mapPresentation.hits.some(h=>h.kind==='map-space'&&x>=h.x&&x<h.x+h.w&&y>=h.y&&y<h.y+h.h&&(!h.polygons||h.polygons.some(poly=>pointInMapPolygon(p,poly))));
   if(!occupied)return p;
  }throw Error('No empty map background for pan');
 });
 const bg=await screenPoint(background),beforeZoom=await nav();await page.mouse.move(bg.x,bg.y);await page.mouse.wheel({deltaY:-180});await pause(160);
 const afterZoom=await nav();assert.ok(afterZoom.zoom>beforeZoom.zoom);interactions.wheel={before:beforeZoom.zoom,after:afterZoom.zoom};
 await page.mouse.down();await page.mouse.move(bg.x+55,bg.y+28,{steps:6});await page.mouse.up();await pause(100);
 const afterPan=await nav();assert.ok(afterPan.panX!==afterZoom.panX||afterPan.panY!==afterZoom.panY);interactions.pan={x:afterPan.panX,y:afterPan.panY};
 assert.equal(await page.evaluate(()=>window.__survey.scene.debugState().mapDrag),null);await shot('panned-zoomed');
 await click('bag:map:reset-view');
 await click('bag:map:set-target');assert.equal(await page.evaluate(()=>window.__survey.state.target?.roomId),'main_b3');
 await click('bag:map:set-target');assert.equal(await page.evaluate(()=>window.__survey.state.target?.roomId),'main_b3');
 await click('bag:map:view-floor');await shot('basement-floor');
 await click('bag:map:rotate-right');await shot('basement-rotated');
 await click('bag:map:clear-target');assert.equal(await page.evaluate(()=>window.__survey.state.target),null);
 for(const floor of ['g','u1','academic','tower']){await click(`bag:floor:${floor}`);await shot(`floor-${floor}`);assert.equal(await page.evaluate(()=>window.__survey.scene.debugState().mapNav.floorId),floor);}
 await click('bag:floor:b1');await click('bag:map:view-stack');
 await page.keyboard.press('PageDown');assert.equal(await page.evaluate(()=>window.__survey.scene.debugState().mapNav.floorId),'g');
 await page.keyboard.press('c');assert.equal(await page.evaluate(()=>window.__survey.scene.debugState().mapNav.floorId),'b1');
 const layouts=[];
 for(const [name,width,height,scale,dpr]of [['desktop',1280,800,1,1],['compact',960,600,1,1],['large-text',960,600,1.5,2]]){
  await page.setViewport({width,height,deviceScaleFactor:dpr});await page.evaluate(scale=>window.__survey.ui.uiSetScale(scale),scale);await pause(300);await shot(name);
  const measured=await page.evaluate(name=>{const d=window.__survey.scene.debugState();return{name,viewport:d.viewport,hits:d.hitRegions.filter(h=>h.kind==='map-control').map(({id,x,y,w,h})=>({id,x,y,w,h}))};},name);
  measured.footer=await footerProof();layouts.push(measured);
  if(name==='large-text'){
   await click('bag:map:view-floor');await shot('large-text-floor');assert.equal((await nav()).viewMode,'floor');
   await page.keyboard.press('F6');await focusControl('bag:map:zoom-in');await shot('large-text-console-focus');
   measured.consoleFooter=await footerProof();await page.keyboard.press('F6');
  }
 }
 await page.setViewport({width:1280,height:800,deviceScaleFactor:1});await page.evaluate(()=>{window.__survey.ui.uiSetScale(1);window.__survey.setPolicy({id:'minimal',showMapTopology:false,showExactPlayer:false,showRoute:false,showRouteStatus:false,showCrossFloorConnector:false,showRoom:false});});await shot('restricted');
 const restricted=await page.evaluate(()=>{const d=window.__survey.scene.debugState();return{policy:d.model.map.policy,roomHits:d.mapPresentation.hits.filter(h=>h.kind==='map-space').map(h=>({id:h.id,hasPolygons:!!h.polygons}))};});
 assert.equal(restricted.policy.showMapTopology,false);assert.equal(restricted.policy.showExactPlayer,false);
 assert.ok(restricted.roomHits.every(hit=>!hit.hasPolygons),'restricted mode exposes anchors, not room-area geometry');
 await page.evaluate(()=>window.__survey.setOffline('THE SURVEY INDICATOR IS NOT IN THE CASE. RETURN TO THE VAN TO COLLECT IT.'));await shot('offline');
 const offline=await page.evaluate(()=>{const d=window.__survey.scene.debugState();return{reason:d.model.mapUnavailableReason,hits:d.hitRegions.filter(h=>h.kind.startsWith('map-')),calls:window.__survey.state.calls};});
 assert.match(offline.reason,/NOT IN THE CASE/);assert.deepEqual(offline.hits,[]);
 await page.keyboard.press('F6');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__survey.state.calls),offline.calls);
 offline.footer=await footerProof();
 assert.deepEqual(errors,[]);
 const report={stats,warmDrawTiming,layouts,interactions,restricted,offline,pageErrors:errors,scope:'Production Bag and compiled conservatory with disposable state adapter. Real browser pointer, wheel and keyboard events; not a live save or native-gamepad acceptance.'};
 await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}catch(e){await shot('failure');console.error(e.stack);process.exitCode=1;}finally{await browser.close();}
