import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMapAxonometricProjection,mapQuarterRotation,pointInMapPolygon,mapArchitecturalHeight,mapPolygonBounds} from '../src/game/map-axonometric.js';
import {uiCellMetrics,uiCurrentScale,uiSetScale} from '../src/render/ui.js';
import {headingVector} from '../src/game/map-projection.js';
import {drawElectronicText,measureElectronicText} from '../src/render/electronic-text.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const rectangle=(x,y,w,h,height=0)=>({x,y,w,h,height});
function fixture(){
 const level=(id,floorId,height,surfaces)=>({id,floorId,height,bounds:{minX:0,minY:0,maxX:20,maxY:12},surfaces,boundaries:[{x0:0,y0:0,x1:20,y1:0,height,wallHeight:3},{x0:20,y0:0,x1:20,y1:12,height,wallHeight:3}]});
 return{version:1,units:{horizontalMetresPerUnit:.5,verticalMetresPerUnit:1},bounds:{minX:0,minY:0,maxX:20,maxY:12},floors:[{id:'g',order:0},{id:'u1',order:1},{id:'tower',order:2}],levels:[
  level('ground','g',0,[{...rectangle(0,0,8,8),mapSpaceId:'space:room-a'},{...rectangle(8,0,12,4),mapSpaceId:'space:room-b'}]),
  level('upper','u1',5,[rectangle(0,0,20,12,5)]),
  level('tower-landing','tower',12,[rectangle(14,0,6,6,12)]),
  level('tower-bell','tower',19,[rectangle(14,0,6,6,19)]),
 ],stairs:[{fromHeight:0,toHeight:5,fromFloorId:'g',toFloorId:'u1',width:2,points:[{x:2,y:2,height:0},{x:2,y:5,height:2.5},{x:2,y:8,height:5}]}]};
}
const viewport={x:4,y:5,w:100,h:32};
test('quarter turns preserve orthographic geometry and inverse returns the canonical plane at every scale/pan',()=>{
 const architecture=fixture(),before=JSON.stringify(architecture);
 for(const rotation of[-1,0,1,2,3,4,7])for(const zoom of[.5,1,2])for(const cellAspect of[.5,.66]){
  const p=createMapAxonometricProjection({architecture,viewport,nav:{floorId:'u1',rotation,zoom,panX:3,panY:-2},cellAspect});
  const point={x:13,y:7,height:5,floorId:'u1'},screen=p.point(point),back=p.inverse(screen,point);near(back.x,point.x);near(back.y,point.y);
  assert.equal(p.rotation,mapQuarterRotation(rotation));assert.ok(Number.isFinite(p.scale)&&p.scale>0);
 }
 assert.equal(JSON.stringify(architecture),before,'view changes do not modify geometry or height');
});
test('floor separation is presentation-only and all floors keep a shared horizontal origin and true relative tower heights',()=>{
 const architecture=fixture(),stack=createMapAxonometricProjection({architecture,viewport,nav:{floorId:'tower',viewMode:'stack',separation:11}});
 const a=stack.point({x:17,y:3,height:12,floorId:'tower'}),b=stack.point({x:17,y:3,height:19,floorId:'tower'});near(a.x,b.x);near(a.y-b.y,7*stack.scale*stack.cellAspect);
 const g=stack.point({x:17,y:3,height:0,floorId:'g'}),u=stack.point({x:17,y:3,height:5,floorId:'u1'});near(g.x,u.x);near(g.y-u.y,16*stack.scale*stack.cellAspect);
 const floor=createMapAxonometricProjection({architecture,viewport,nav:{floorId:'tower',viewMode:'floor'}});assert.deepEqual(floor.visibleFloorIds,['tower']);assert.equal(floor.separation,0);assert.equal(floor.levels.length,2);
});
test('fit stays inside viewport and does not normalize or relocate each floor independently',()=>{
 for(const rotation of[0,1,2,3]){
  const p=createMapAxonometricProjection({architecture:fixture(),viewport,nav:{floorId:'g',rotation}});
  for(const level of p.levels)for(const [x,y]of[[0,0],[20,0],[20,12],[0,12]]){
   const point=p.point({x,y,height:level.height,floorId:level.floorId});assert.ok(point.x>=viewport.x&&point.x<=viewport.x+viewport.w);assert.ok(point.y>=viewport.y&&point.y<=viewport.y+viewport.h);
  }
 }
});
test('issued undiscovered floors stay visible while hidden floors never return through a fallback',()=>{
 const architecture=fixture(),p=createMapAxonometricProjection({architecture,viewport,floors:architecture.floors.map(f=>({...f,visibility:'discovered',discovered:false}))});
 assert.deepEqual(p.visibleFloorIds,['g','u1','tower']);assert.equal(p.levels.length,4);
 const hidden=createMapAxonometricProjection({architecture,viewport,floors:architecture.floors.map(f=>({...f,hidden:true}))});
 assert.deepEqual(hidden.visibleFloorIds,[]);assert.equal(hidden.levels.length,0);
});
test('polygon hit excludes a diamond bounding-box corner and architectural heights prefer actual observations',()=>{
 const polygon=[{x:0,y:2},{x:4,y:0},{x:8,y:2},{x:4,y:4}];assert.equal(pointInMapPolygon({x:.1,y:.1},polygon),false);assert.equal(pointInMapPolygon({x:4,y:2},polygon),true);assert.equal(pointInMapPolygon({x:0,y:2},polygon),true);
 const architecture=fixture();assert.equal(mapArchitecturalHeight(architecture,{floorId:'tower',position:{x:16,y:3},height:19}),19);assert.equal(mapArchitecturalHeight(architecture,{floorId:'u1',position:{x:4,y:3}}),5);
 architecture.levels.push({...architecture.levels[0],height:4,surfaces:[rectangle(30,30,5,5)]});
 assert.equal(mapArchitecturalHeight(architecture,{floorId:'g',position:{x:32,y:32}}),4,'absent ownership IDs do not match one another instead of the occupied surface');
});

function rendererHarness({dpr=1}={}){
 const commands=[],stack=[],state={globalAlpha:.7,shadowBlur:8};
 const methods={save(){stack.push({...state});},restore(){for(const k of Object.keys(state))delete state[k];Object.assign(state,stack.pop());},measureText:t=>({width:String(t).length*6})};
 const ctx=new Proxy(state,{get(t,k){if(k in methods)return methods[k];if(k in t)return t[k];return(...args)=>commands.push({kind:k,args,state:{...state}});},set(t,k,v){t[k]=v;return true;}});
 const bindings={uiDraw:fn=>fn({ctx,dpr,...uiCellMetrics()}),uiCellMetrics,createMapAxonometricProjection,mapArchitecturalHeight,mapPolygonBounds,headingVector,measureElectronicText,
  drawElectronicText:(ctx,value,x,y,options)=>{commands.push({kind:'electronicText',args:[String(value).toUpperCase(),x,y],options:{...options},state:{...state}});return drawElectronicText(ctx,value,x,y,options);}};
 let source=readFileSync(new URL('../src/render/map-architecture-view.js',import.meta.url),'utf8');const names=[];
 source=source.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];\s*/g,(_,list)=>{names.push(...list.split(',').map(n=>n.trim()));return'';}).replace(/export function /g,'function ');
 const draw=new Function(...names,`${source};return drawArchitecturalMap`)(...names.map(name=>bindings[name]));
 return{draw,commands,state,stack};
}
function model(){return{architecture:fixture(),floors:fixture().floors,policy:{showMap:true,showMapTopology:true,showRoom:true},spaces:[
 {id:'space:room-a',floorId:'g',position:{x:4,y:4},height:0,label:'ROOM A',selectable:true},
 {id:'space:room-b',floorId:'g',position:{x:13,y:2},height:0,label:'ROOM B',selectable:true},
 ],player:{resolved:true,floorId:'g',position:{x:4,y:4},height:0,heading:0},contacts:[]};}
test('rendered rooms use canonical surface polygons and expose the exact same projected points for keyboard navigation',()=>{
 const h=rendererHarness(),m=model(),before=JSON.stringify(m),nav={floorId:'g',rotation:1,viewMode:'floor',selectedByFloor:{g:'space:room-a'}};
 const result=h.draw({model:m,nav,viewport});assert.equal(result.hits.length,2);
 const hit=result.hits.find(h=>h.payload.spaceId==='space:room-a');assert.equal(hit.id,'bag:space:space:room-a');assert.equal(hit.polygons.length,1);
 assert.ok(pointInMapPolygon(result.projectedPoints['space:room-a'],hit.polygons[0]));
 assert.equal(JSON.stringify(m),before);assert.equal(h.stack.length,0);assert.deepEqual(h.state,{globalAlpha:.7,shadowBlur:8});
 assert.ok(h.commands.filter(c=>c.kind==='stroke'||c.kind==='fill').every(c=>c.state.shadowBlur===0),'CAD geometry has no blanket phosphor bloom');
});
test('topology restrictions remove walls and area hits; hidden adversary telemetry never produces a body marker',()=>{
 const h=rendererHarness(),m=model();m.policy.showMapTopology=false;m.policy.showExactPlayer=false;m.hush={active:true,sensed:true,visible:false,floorId:'g',position:{x:10,y:3}};
 m.contacts=[{state:'locked',observation:{floorId:'g',position:{x:10,y:3},observedAt:0}}];
 const result=h.draw({model:m,nav:{floorId:'g'},viewport});assert.ok(result.hits.every(hit=>!hit.polygons));
 assert.equal(h.commands.filter(c=>c.kind==='stroke'&&c.state.strokeStyle==='#a0b497').length,2,'two issued diamond room markers');
 assert.equal(h.commands.filter(c=>c.kind==='arc').length,0,'no player or unseen HUSH body marker');
 assert.ok(!h.commands.some(c=>c.state.strokeStyle==='#cbd2b6'),'no architectural wall caps under restricted topology');
});
test('legacy and restricted models fit their authorized anchors without inventing surfaces',()=>{
 for(const floorBounds of[false,true]){
  const h=rendererHarness(),m=model();m.architecture=null;m.floors=[{id:'g',...(floorBounds?{bounds:{minX:80,minY:40,maxX:110,maxY:70}}:{})}];
  m.spaces=m.spaces.map((s,i)=>({...s,position:{x:90+i*10,y:50+i*10},height:4.5}));m.player={...m.player,position:{x:95,y:55},height:4.5};
  const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});
  assert.equal(result.hits.length,2);assert.ok(result.hits.every(h=>!h.polygons));assert.equal(result.geometryAvailable,false);
  for(const p of Object.values(result.projectedPoints))assert.ok(p.x>=viewport.x&&p.x<=viewport.x+viewport.w&&p.y>=viewport.y&&p.y<=viewport.y+viewport.h);
  assert.ok(result.projection.levels.every(level=>level.surfaces.length===0));
 }
});
test('north-facing player points along the projected north reference at every quarter turn',()=>{
 for(const rotation of[0,1,2,3]){
  const h=rendererHarness(),m=model(),result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor',rotation},viewport});
  const fill=h.commands.findIndex(c=>c.kind==='fill'&&c.state.fillStyle==='#c7eccb');assert.ok(fill>0);
  const commands=h.commands.slice(0,fill),start=commands.findLastIndex(c=>c.kind==='beginPath'),tip=commands.slice(start).find(c=>c.kind==='moveTo');
  const p=result.projection.point({...m.player.position,height:0,floorId:'g'}),metrics=uiCellMetrics(),v=result.projection.vector({x:0,y:-1});
  const dx=tip.args[0]-p.x*metrics.cellW,dy=tip.args[1]-p.y*metrics.cellH;
  assert.ok(dx*v.x*metrics.cellW+dy*v.y*metrics.cellH>0);near(dx*v.y*metrics.cellH-dy*v.x*metrics.cellW,0);
 }
});
test('stack annotates each floor once while floor mode may retain clear actual elevations',()=>{
 const h=rendererHarness(),m=model();h.draw({model:m,nav:{floorId:'tower',viewMode:'stack'},viewport});
 const labels=h.commands.filter(c=>c.kind==='electronicText').map(c=>c.args[0]);
 assert.equal(labels.filter(s=>s==='TOWER').length,1);assert.ok(!labels.some(s=>/^TOWER \d/.test(s)));
 assert.equal(labels.filter(s=>s==='G').length,1);assert.equal(labels.filter(s=>s==='U1').length,1);
 assert.ok(h.commands.filter(c=>c.kind==='electronicText').every(c=>c.options.fontSize>=11&&c.options.mode==='lcd'));
});
test('issued unknown anchors remain anonymous and non-interactive',()=>{
 const h=rendererHarness(),m=model();m.spaces.push({id:'unknown',label:'SECRET ROOM NAME',position:{x:17,y:9},height:0,floorId:'g',unknown:true,selectable:false});
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});
 assert.ok(!result.hits.some(h=>h.payload.spaceId==='unknown'));assert.equal(result.projectedPoints.unknown,undefined);
 assert.ok(h.commands.some(c=>c.kind==='electronicText'&&c.args[0]==='???'));assert.ok(!h.commands.some(c=>c.kind==='electronicText'&&String(c.args[0]).includes('SECRET')));
});
test('showMap false supplies no rendered facts or interactive hits, and missing architecture never invents a floorplan',()=>{
 const h=rendererHarness(),m=model();m.policy.showMap=false;
 const hidden=h.draw({model:m,nav:{floorId:'g'},viewport});assert.equal(hidden.hits.length,0);assert.equal(h.commands.length,0);
 m.policy.showMap=true;m.architecture=null;const empty=h.draw({model:m,nav:{floorId:'g'},viewport});assert.equal(empty.geometryAvailable,false);assert.ok(h.commands.some(c=>c.kind==='electronicText'&&c.args[0]==='ARCHITECTURE UNAVAILABLE'));
});
test('a story prop target has its own authoritative diamond and true elevation in stack view',()=>{
 const h=rendererHarness(),m=model();m.waypoint={id:'story:bell',kind:'prop',label:'BELL CONTACT',floorId:'tower',height:19,position:{x:17,y:3}};
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'stack'},viewport});
 const expected=result.projection.point({...m.waypoint.position,height:19,floorId:'tower'});near(result.waypoint.rawPoint.x,expected.x);near(result.waypoint.rawPoint.y,expected.y);
 assert.equal(h.commands.filter(c=>c.kind==='fill'&&c.state.fillStyle==='#dfbd73').length,1);
 assert.ok(h.commands.some(c=>c.kind==='electronicText'&&c.args[0].includes('BELL CONTACT')));
 assert.ok(!result.hits.some(hit=>hit.payload.spaceId==='story:bell'),'story markers do not become invented selectable rooms');
 const floor=rendererHarness(),floorResult=floor.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});
 assert.equal(floorResult.waypoint,undefined,'another floor is never projected onto this floor plane');
});
test('matching room targets deduplicate while different story positions sharing a room remain distinct',()=>{
 for(const kind of['room','space']){
  const h=rendererHarness(),m=model();m.spaces[0].roomId='a';m.spaces[0].waypoint=true;
  m.waypoint={kind,roomId:'a',spaceId:kind==='space'?'space:room-a':null,label:'ROOM A',floorId:'g',height:0,position:{...m.spaces[0].position}};
  const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});
  assert.equal(result.waypoint.spaceId,'space:room-a');assert.equal(h.commands.filter(c=>c.kind==='fill'&&c.state.fillStyle==='#dfbd73').length,1);
 }
 const h=rendererHarness(),m=model();m.spaces[0].roomId='a';m.waypoint={kind:'position',roomId:'a',label:'RETURN',corrupted:true,floorId:'g',height:0,position:{x:17,y:8}};
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});assert.equal(result.waypoint.spaceId,null);
 const expected=result.projection.point({...m.waypoint.position,height:0,floorId:'g'});near(result.waypoint.point.x,expected.x);near(result.waypoint.point.y,expected.y);
});
test('restricted anchor-only target fit honors showWaypoint and never fabricates topology',()=>{
 const h=rendererHarness(),m=model();m.architecture=null;m.floors=[{id:'g'}];m.policy.showMapTopology=false;
 m.waypoint={kind:'door',label:'SERVICE DOOR',floorId:'g',height:4.8,position:{x:180,y:85}};
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});
 assert.equal(result.geometryAvailable,false);assert.equal(result.waypoint.offPage,false);assert.equal(result.projection.levels.length,0);
 m.policy.showWaypoint=false;const hidden=rendererHarness(),without=hidden.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});
 assert.equal(without.waypoint,undefined);assert.ok(!hidden.commands.some(c=>c.kind==='electronicText'&&c.args[0].includes('SERVICE DOOR')));
 assert.ok(!hidden.commands.some(c=>c.kind==='fill'&&c.state.fillStyle==='#dfbd73'));
});
test('off-plan player and target cues never pretend their clamped point is the exact position',()=>{
 const h=rendererHarness(),m=model();m.player.position={x:2000,y:1000};m.waypoint={kind:'prop',label:'VAN',floorId:'g',height:0,position:{x:1900,y:1000}};
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});assert.equal(result.player.offPage,true);assert.equal(result.waypoint.offPage,true);
 assert.ok(h.commands.some(c=>c.kind==='electronicText'&&c.args[0]==='YOU · OFF PLAN'));
 assert.ok(h.commands.some(c=>c.kind==='electronicText'&&c.args[0].startsWith('OFF VIEW · ')));
 assert.ok(!h.commands.some(c=>c.kind==='fill'&&c.state.fillStyle==='#c7eccb'),'edge bearing is not a normal filled player triangle');
 const hidden=rendererHarness();m.policy.showExactPlayer=false;
 assert.equal(hidden.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport}).player,undefined);
 assert.ok(!hidden.commands.some(c=>c.kind==='electronicText'&&c.args[0].includes('YOU')));
});
test('full guidance never projects a heightless 2D route onto a fabricated player plane',()=>{
 const h=rendererHarness(),m=model();m.policy.showRoute=true;m.route={status:'ok',points:[{x:2,y:2},{x:5,y:2},{x:5,y:5}]};
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});assert.equal(result.routeElevationResolved,false);
 assert.ok(!h.commands.some(c=>c.kind==='stroke'&&c.state.strokeStyle==='#afcda1'));
});
test('route ink uses only adjacent explicit-height endpoints, preserving exact heights',()=>{
 const h=rendererHarness(),m=model();m.policy.showRoute=true;
 m.route={status:'ok',points:[{x:2,y:2,height:0},{x:5,y:2,height:3},{x:5,y:5},{x:8,y:5,height:5}]};
 const result=h.draw({model:m,nav:{floorId:'g',viewMode:'floor'},viewport});assert.equal(result.routeElevationResolved,false);
 const strokes=h.commands.map((c,i)=>({c,i})).filter(({c})=>c.kind==='stroke'&&c.state.strokeStyle==='#afcda1');assert.equal(strokes.length,1);
 const before=h.commands.slice(0,strokes[0].i),start=before.findLastIndex(c=>c.kind==='beginPath'),path=before.slice(start).filter(c=>c.kind==='moveTo'||c.kind==='lineTo'),metrics=uiCellMetrics();
 for(let i=0;i<2;i++){const expected=result.projection.point({...m.route.points[i],floorId:'g'});near(path[i].args[0],expected.x*metrics.cellW);near(path[i].args[1],expected.y*metrics.cellH);}
 m.route.points=m.route.points.slice(0,2);assert.equal(rendererHarness().draw({model:m,nav:{floorId:'g'},viewport}).routeElevationResolved,true);
 m.route.points[1].height=null;assert.equal(rendererHarness().draw({model:m,nav:{floorId:'g'},viewport}).routeElevationResolved,false);
});
test('every map readout label uses sharp electronic glyphs and matching fixed-ROM metrics',()=>{
 const h=rendererHarness(),m=model();m.waypoint={kind:'prop',label:'THE LONG SERVICE CONTACT LABEL',floorId:'g',height:0,position:{x:18,y:10}};
 h.draw({model:m,nav:{floorId:'g',viewMode:'floor',selectedByFloor:{g:'space:room-a'}},viewport});
 const labels=h.commands.filter(c=>c.kind==='electronicText');assert.ok(labels.length>=6);
 assert.ok(labels.every(c=>c.options.mode==='lcd'&&c.options.baseline==='middle'));
 assert.ok(!h.commands.some(c=>c.kind==='fillText'||c.kind==='strokeText'||c.kind==='measureText'),'no native-font path is used under the survey glass');
 assert.ok(h.commands.some(c=>c.kind==='fillRect'),'the real LCD renderer emits physical matrix pixels');
 const metrics=uiCellMetrics();for(const label of labels){
  const width=measureElectronicText(label.args[0],{fontSize:label.options.fontSize});
  const left=label.args[1]-(label.options.align==='center'?width/2:label.options.align==='right'?width:0);
  assert.ok(left>=viewport.x*metrics.cellW-.001,`${label.args[0]} starts within its aperture`);
  assert.ok(left+width<=(viewport.x+viewport.w)*metrics.cellW+.001,`${label.args[0]} ends within its aperture`);
 }
 const source=readFileSync(new URL('../src/render/map-architecture-view.js',import.meta.url),'utf8');
 assert.ok(!/\bfillText\b|\bstrokeText\b|\bmeasureText\b|Hardware Sans/.test(source),'native type cannot return through a different label helper');
});
test('LCD collision measurements remain in device-pixel agreement at high DPI, rotation and large UI scale',()=>{
 const previous=uiCurrentScale();try{
  for(const scale of[1,1.5])for(const dpr of[1,2])for(const rotation of[0,1,2,3]){
   uiSetScale(scale);const h=rendererHarness({dpr}),m=model(),v={x:3,y:4,w:45,h:17};
   m.waypoint={kind:'prop',label:'THE LONG SERVICE CONTACT LABEL',floorId:'g',height:0,position:{x:18,y:10}};
   h.draw({model:m,nav:{floorId:'g',viewMode:'floor',rotation,selectedByFloor:{g:'space:room-a'}},viewport:v});
   const metrics=uiCellMetrics();for(const label of h.commands.filter(c=>c.kind==='electronicText')){
    const width=measureElectronicText(label.args[0],{fontSize:label.options.fontSize});
    const left=label.args[1]-(label.options.align==='center'?width/2:label.options.align==='right'?width:0);
    assert.ok(left>=v.x*metrics.cellW*dpr-.001,`${label.args[0]} left at ${scale}/${dpr}/${rotation}`);
    assert.ok(left+width<=(v.x+v.w)*metrics.cellW*dpr+.001,`${label.args[0]} right at ${scale}/${dpr}/${rotation}`);
   }
   assert.ok(!h.commands.some(c=>c.kind==='fillText'||c.kind==='strokeText'));
  }
 }finally{uiSetScale(previous);}
});
