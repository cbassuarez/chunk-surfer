import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {F,ZONE,ZONE_WORLD,MATERIAL,isOutdoorZone} from '../src/data/floorplan/legend.js';
import {computeNatatoriumBasinBounds} from '../src/game/natatorium-water.js';
import {createPresenceNavigation} from '../src/game/presence-navigation.js';
import {GLASS_COURT} from '../src/data/glass-court.js';
import {BUILDING_MAP} from '../src/data/building-map.js';
import {glassCourtMapPhysical} from '../src/game/glass-court-map.js';
import {captureFloorplanMapSource} from '../src/game/map-model.js';
import {findGridRoute} from '../src/game/map-routing.js';
import {glassCourtBody,glassCourtRoute} from './helpers/glass-court-route.mjs';

const ids=['pool-lobby','glasshouse-changing','changing-pool'];
const extraLevels=level=>['natatorium_glasshouse','natatorium_changing','baths-west-court-wall'].includes(level.id)
  ||['baths-outdoor-court-','ellery-greenhouse-throat-','glasshouse-changing-throat-','changing-pool-throat-'].some(prefix=>level.id.startsWith(prefix));
const compile=(levels=conservatory.levels,doors=conservatory.doors)=>{
  FP.compile(levels,{...conservatory,doors});PROPS.propsInit(FP);
};
const body=glassCourtBody;
const world=p=>{const q=FP.logicalToPhysical(p.x,p.y);return{x:(q.x+.5)*.5,z:(q.z+.5)*.5};};
const start=body(84.25,12.25),goal=body(94.25,34.25);
const route=(from,to,options)=>glassCourtRoute(FP,PROPS,from,to,options);
const getDoor=id=>FP.doorState().find(d=>d.id===id);
const openAll=()=>{for(const id of ids)FP.setDoorOpen(id,true);};

// Compare with the same current plan minus this bounded insertion. A later
// edit to a basin/stair/deck cannot be excused by updating a broad snapshot.
compile(conservatory.levels.filter(level=>!extraLevels(level)),conservatory.doors
  .filter(d=>!['glasshouse-changing','changing-pool','spine-west-court'].includes(d.id))
  .map(d=>d.id==='pool-lobby'?{...d,at:{x:84,y:27}}:d));
const protectedPool=[];
for(let y=66;y<102;y++)for(let x=140;x<194;x++){
  const cell=FP.cellAt(x,y),at=FP.logicalToPhysical(x,y);
  protectedPool.push({x,y,cell:cell?{...cell}:null,at:{...at}});
}
const originalBasin=computeNatatoriumBasinBounds(FP);
compile();

test('the insertion preserves the complete basin, access stair and occupied pool deck',()=>{
  assert.deepEqual(computeNatatoriumBasinBounds(FP),originalBasin);
  for(const p of protectedPool){assert.deepEqual(FP.cellAt(p.x,p.y),p.cell,`pool cell ${p.x},${p.y}`);assert.deepEqual(FP.logicalToPhysical(p.x,p.y),p.at);}
  assert.equal(FP.physicalSpanData().overlaps.length,0);
  for(let i=1;i<=5;i++){
    const block=PROPS.propById(`pool-start-${i}`);assert.ok(block);
    assert.equal(block.floor,0);assert.equal(block.y,32.4,'the authored starting block has not been relocated into the basin');
  }
});

test('the two new indoor zones cannot start a pool recording or pool dread',()=>{
  const source=fs.readFileSync('src/main.js','utf8');
  const mapping=source.match(/const ZONE_RECORDING_ROOM=(\{[\s\S]*?\});/)?.[1];assert.ok(mapping);
  const rooms=vm.runInNewContext(`(${mapping})`,{ZONE});
  for(const zone of[ZONE.glasshouse,ZONE.poolChanging]){
    assert.equal(isOutdoorZone(zone),false);assert.equal(ZONE_WORLD[zone],'main_b3');assert.equal(rooms[zone],undefined);
  }
  for(const[x,z,zone,material,ceil]of[[84.25,21.25,ZONE.glasshouse,MATERIAL.wetPaving,5.2],[84.25,30.25,ZONE.poolChanging,MATERIAL.wetTile,3.4]]){
    const p=body(x,z);assert.equal(FP.zoneAt(p.x,p.y),zone);assert.equal(FP.floorAt(p.x,p.y),0);
    assert.equal(FP.materialAt(p.x,p.y),material);assert.equal(FP.flagsAt(p.x,p.y)&F.SKY,0);
    assert.ok(Math.abs(FP.cellAt(p.x,p.y).ceil-ceil)<1e-5,'the separate rooms have their own real roof/ceiling envelopes');
  }
  assert.equal(rooms[FP.zoneAt(goal.x,goal.y)],'the_tub');
  assert.match(source,/function natatoriumDreadInput\(\)[\s\S]*?recordableRoomAt\(px,py\)!=='the_tub'/);
});

test('actual dynamic frames align with the two real thin partition apertures',()=>{
  for(const[id,x,z,axis]of[['pool-lobby',84,15,'x'],['glasshouse-changing',84,27,'x'],['changing-pool',84,31,'x']]){
    const d=getDoor(id),p=FP.logicalToPhysical(d.cx,d.cy);
    assert.deepEqual([p.x*.5,p.y,p.z*.5],[x,0,z]);assert.equal(d.widthAxis,axis);
    assert.equal(d.aperture.width,2);assert.equal(d.aperture.height,3.4);assert.equal(d.leafCount,2);
    assert.deepEqual(d.activeLeaves,[0,1]);assert.equal(d.keyId,null);assert.equal(d.access,'both');
    assert.equal(d.cells.length,15,'detector centring never pretends to be the physical aperture');
    assert.ok(d.cells.every(p=>!FP.isSolid(p.x,p.y)&&Math.abs(FP.cellAt(p.x,p.y).ceil-3.4)<1e-5));
  }
  assert.deepEqual([getDoor('pool-lobby').cx,getDoor('pool-lobby').cy],[168,30],'the original identity now owns the actual Ellery-side threshold');
  assert.ok(conservatory.doors.find(d=>d.id==='pool-lobby').legacyIds.includes('169,55'),'the previous saved portal alias remains recognised');
  // Current packed shared frame/transom bounds fit a 120mm partition and the
  // 3.4m changing ceiling. This uses actual emitted accessors, not a nominal
  // mesh name whose geometry could have drifted.
  const bytes=fs.readFileSync('public/assets/conservatory-doors.glb'),j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  const bounds=name=>j.meshes.find(m=>m.name===name).primitives.map(p=>j.accessors[p.attributes.POSITION]);
  assert.ok(bounds('door_frame_pair').every(a=>a.min[2]<=-.06&&a.max[2]>=.06));
  assert.ok(Math.max(...bounds('door_head_transom').map(a=>a.max[1]))<3.4);
});

test('the actual paired-leaf motion clears the rehosted counter and opens into the agreed rooms',()=>{
  const source=fs.readFileSync('src/main.js','utf8');
  const extract=name=>{
    const start=source.indexOf(`function ${name}(`);assert.ok(start>=0);
    let at=source.indexOf('{',start),depth=1,end=at+1;
    for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}
    return source.slice(start,end);
  };
  const context=vm.createContext({CELL:.5});
  vm.runInContext(['doorTransform','doorMatMultiply','doorLeafMatrix'].map(extract).join('\n')+'\nthis.matrixFor=doorLeafMatrix;',context);
  const bytes=fs.readFileSync('public/assets/conservatory-doors.glb'),n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n)),bin=bytes.subarray(28+n);
  const vertices=j.meshes.find(m=>m.name==='door_leaf_pool_pair').primitives.flatMap(p=>{
    const a=j.accessors[p.attributes.POSITION],v=j.bufferViews[a.bufferView];assert.equal(a.componentType,5126);
    return Array.from({length:a.count},(_,i)=>[0,1,2].map(k=>bin.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||12)+k*4)));
  });
  const c=GLASS_COURT.counter,o=GLASS_COURT.origin;
  const counter={min:[o.x+c.x-c.width/2,0,o.z+c.z-c.depth/2],max:[o.x+c.x+c.width/2,c.height,o.z+c.z+c.depth/2]};
  for(const id of ids.slice(1))for(let leaf=0;leaf<2;leaf++)for(let step=0;step<=10;step++){
    const d=getDoor(id),m=context.matrixFor(d,FP.logicalToPhysical(d.cx,d.cy),leaf,step/10);
    const points=vertices.map(p=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]));
    const min=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max=[0,1,2].map(k=>Math.max(...points.map(p=>p[k])));
    assert.ok(min.some((v,k)=>v>=counter.max[k])||max.some((v,k)=>v<=counter.min[k]),`${id} leaf ${leaf} clears the physical counter at ${step*10}%`);
    if(step===10){
      const plane=id==='glasshouse-changing'?27:31;
      if(id==='glasshouse-changing')assert.ok(min[2]>plane-1.1&&max[2]<plane+.1,'the dry-out pair opens back into the greenhouse');
      else assert.ok(min[2]>plane-.1&&max[2]<plane+1.1,'the pool-in pair opens onto the cross-deck');
    }
  }
});

test('loaded physical partitions make all three doors dominate every ordinary pool entry and return',()=>{
  PROPS.setColliderGroupEnabled('glass-court',true);openAll();
  const path=route(start,goal);assert.ok(path,'ordinary half-metre collision movement reaches the east pool deck');
  let walker={...start};
  for(const next of path.slice(1)){
    assert.ok(Math.max(Math.abs(next.x-walker.x),Math.abs(next.y-walker.y))===1,'each input moves only one ordinary cell');
    const step=FP.canStep(walker.x,walker.y,next.x,next.y,{keys:new Set()});
    assert.equal(step.ok,true);assert.equal(step.redirect,undefined);
    assert.ok(PROPS.propCanOccupy(next.x,next.y,{from:walker}),`real keyboard route at ${JSON.stringify(world(next))}`);
    walker=next;
  }
  assert.deepEqual(walker,goal,'the actual walked path reaches the retained east deck');
  const visited=path.map(p=>FP.doorAt(p.x,p.y)?.id).filter((id,i,a)=>id&&id!==a[i-1]);
  assert.deepEqual(visited,ids,'the shortest legal path crosses D0, planted corridor, D1, changing, D2');
  for(const id of ids){assert.equal(route(start,goal,{cut:id}),null,`${id} has no open-edge bypass`);}
  assert.ok(route(goal,start),'the same unlocked doors provide ordinary evacuation to the atrium');
  const states=path.map(p=>FP.zoneAt(p.x,p.y));
  assert.ok(states.indexOf(ZONE.glasshouse)>0);assert.ok(states.indexOf(ZONE.poolChanging)>states.indexOf(ZONE.glasshouse));
  assert.ok(states.indexOf(ZONE.natatorium)>states.indexOf(ZONE.poolChanging));
  const nav=createPresenceNavigation({isSolid:FP.isSolid,canStep:FP.canStep,canOccupy:PROPS.propCanOccupy,
    connectorDestination:FP.connectorDestination,planSize:FP.planSize,keys:new Set()});
  const pursuit=nav.findPath(start,goal);assert.ok(pursuit);
  for(const id of ids)assert.ok(pursuit.some(p=>FP.doorAt(p.x,p.y)?.id===id),`ordinary HUSH must also cross ${id}`);
});

test('the shortened changing buffer leaves a continuous supported cross-deck before every retained starting block',()=>{
  PROPS.setColliderGroupEnabled('glass-court',true);openAll();
  assert.equal(GLASS_COURT.origin.z+GLASS_COURT.changing.z1,31);
  assert.equal(GLASS_COURT.changing.z1-GLASS_COURT.changing.z0,4);
  let previous=null;
  for(let x=76.25;x<=94.25;x+=.5){
    const p=body(x,31.75);assert.equal(FP.floorAt(p.x,p.y),0);assert.equal(FP.isSolid(p.x,p.y),false);
    assert.equal(PROPS.propCanOccupy(p.x,p.y,previous?{from:previous}:{}),true,`cross-deck body clearance at${x},31.75`);
    if(previous)assert.equal(FP.canStep(previous.x,previous.y,p.x,p.y,{keys:new Set()}).ok,true);
    previous=p;
  }
  const c=GLASS_COURT.counter,room=GLASS_COURT.changing;
  assert.ok(c.z-(c.depth+.08)/2>room.z0+room.wallThickness/2);
  assert.ok(c.z+(c.depth+.08)/2<room.z1-room.wallThickness/2,'the complete original counter/worktop fits between both end walls');
});

test('either separation pair opens repeatedly from either side without an interlock or new key',()=>{
  FP.resetDoors();
  for(const[id,approaches]of[['glasshouse-changing',[[168,50,[0,1]],[168,58,[0,-1]]]],['changing-pool',[[166,58,[0,1]],[166,64,[0,-1]]]]]){
    for(const[x,y,facing]of approaches){
      FP.setDoorOpen(id,false);const first=FP.interactDoor(x,y,facing,new Set());
      assert.equal(first.id,id);assert.equal(first.opened,true);
      const repeat=FP.interactDoor(x,y,facing,new Set());assert.equal(repeat.id,id);assert.equal(repeat.opening,true);
      FP.tickDoors(3,{playerX:x,playerY:y,onlyIds:[id]});assert.equal(getDoor(id).state,'open');
    }
  }
  FP.setDoorOpen('glasshouse-changing',false);FP.setDoorOpen('changing-pool',false);
  assert.equal(FP.interactDoor(166,58,[0,1],new Set()).opened,true,'pool pair is usable while the greenhouse pair is shut');
  FP.tickDoors(3,{playerX:166,playerY:58,onlyIds:['changing-pool']});
  const saved=FP.saveDoorState();compile();FP.loadDoorState(saved);
  assert.equal(getDoor('changing-pool').state,'open');assert.equal(getDoor('glasshouse-changing').state,'closed');
  assert.equal(FP.interactDoor(168,58,[0,-1],new Set()).opened,true,'reload retains an ordinary return handle');
});

test('unavailable optional glazing retains the existing playable pool route',()=>{
  PROPS.setColliderGroupEnabled('glass-court',false);FP.resetDoors();openAll();
  assert.ok(route(start,goal),'an unloaded supplemental pack cannot strand the recordist');
  assert.ok(route(goal,start));
  PROPS.setColliderGroupEnabled('glass-court',true);
});

test('the issued map routes through both vestibule doors and exposes the same physical separation',()=>{
  const original=FP.physicalSpanData(),colliders=PROPS.structuralColliders();
  assert.equal(glassCourtMapPhysical(original,{active:false,colliders}),original,'fallback retains the original capture');
  const filtered=glassCourtMapPhysical(original,{active:true,colliders});
  assert.notEqual(filtered,original);assert.notEqual(filtered.cells,original.cells);
  for(const x of[164,165])for(const z of[40,41]){
    assert.ok(original.cells.get(`${x},${z}`)?.some(s=>s.renderGroup==='ground'&&s.floor===0));
    assert.ok(!filtered.cells.get(`${x},${z}`)?.some(s=>s.renderGroup==='ground'&&s.floor===0),
      'one blocked half-cell conservatively closes the full one-metre map bucket');
  }
  const source=captureFloorplanMapSource({definition:BUILDING_MAP,physical:filtered,
    projectLogical:p=>{const r=FP.toRuntimePoint(p),q=FP.logicalToPhysical(r.x,r.y);return{x:q.x,z:q.z,height:q.y,renderGroup:q.renderGroup};}});
  const floor=source.floors.find(f=>f.id==='g');
  const path=findGridRoute(floor,{x:84,y:12},{x:94,y:34});assert.ok(path,'guidance reaches the retained east pool deck');
  const passes=(x,y)=>path.some((p,i)=>{const q=path[i+1];return q&&x>=Math.min(p.x,q.x)&&x<=Math.max(p.x,q.x)&&y>=Math.min(p.y,q.y)&&y<=Math.max(p.y,q.y)&&(p.x===q.x||p.y===q.y);});
  for(const z of[15,27,31])assert.equal(passes(84,z),true,`map guidance physically crosses the longitudinal doorway at84,${z}`);
  assert.ok(findGridRoute(floor,{x:94,y:34},{x:84,y:12}),'the map also retains the return');
  const boundaries=source.architecture.levels.filter(l=>l.floorId==='g'&&l.height===0).flatMap(l=>l.boundaries);
  assert.equal(floor.open.has('82,20'),false);assert.equal(floor.open.has('83,20'),true);
  assert.ok(boundaries.some(b=>b.kind==='wall'&&b.x0===83&&b.x1===83&&b.y0<=20&&b.y1>=21),
    'the conservative one-metre map retains the occupied bed and separate longitudinal walking lane');
  assert.deepEqual(source.spaces.filter(s=>['space:glasshouse','space:pool-changing'].includes(s.id)).map(s=>[s.label,s.position]),
    [['GLASSHOUSE',{x:84,y:21}],['CHANGING ROOM',{x:84,y:30}]]);
});

test('the actual map caller invalidates its capture when the supplemental partitions become ready or unavailable',()=>{
  const source=fs.readFileSync('src/main.js','utf8');
  const named=name=>{
    const start=source.indexOf(`function ${name}(`),params=source.indexOf('){',start);
    let depth=1,end=params+2;
    // Both production functions have ordinary block bodies. Skip strings and
    // comments so unrelated top-level initializers never enter this harness.
    for(let quote=null,line=false,block=false;depth&&end<source.length;end++){
      const c=source[end],n=source[end+1],previous=source[end-1];
      if(line){if(c==='\n')line=false;continue;}
      if(block){if(c==='*'&&n==='/'){block=false;end++;}continue;}
      if(quote){if(c===quote&&previous!=='\\')quote=null;continue;}
      if(c==='/'&&n==='/'){line=true;end++;continue;}
      if(c==='/'&&n==='*'){block=true;end++;continue;}
      if(c==='\''||c==='"'||c==='`'){quote=c;continue;}
      if(c==='{')depth++;else if(c==='}')depth--;
    }
    return source.slice(start,end);
  };
  const stop=Object.freeze({phase:'after-greenhouse-sync'}),pushes=[];
  let ready=false;
  const context=vm.createContext({FP,PROPS,BUILDING_MAP,glassCourtMapPhysical,captureFloorplanMapSource,
    usingSpecialSpace:()=>false,usingSourceSpace:()=>false,usingStairAnomaly:()=>false,usingPlan:()=>true,
    studentStrikePresentationFrame:()=>null,openingCinematicFrame:()=>null,shouldStageOpeningCinematic:()=>false,openingPresentationView:()=>null,
    exteriorInfrastructureAvailable:false,streetCrowdSubmitted:[],brendanPresenceSubmitted:[],
    streetPilotTime:()=>null,planName:'conservatory',facilityMapSource:null,glassCourtRenderReady:false,
    px:start.x,py:start.y,RENDERER:'3d',performance:{now:()=>0},
    mapProjectLogical:p=>{const r=FP.toRuntimePoint(p),q=FP.logicalToPhysical(r.x,r.y);return{x:q.x,z:q.z,height:q.y,renderGroup:q.renderGroup};},
    roomLabel:id=>id,console,R3:{r3dGlassCourtReady:()=>ready,r3dSetProps:p=>pushes.push(p)},
    worldRenderInstances:()=>PROPS.renderInstances({inscriptions:false}),pubHospitalityReady:()=>{throw stop;}});
  vm.runInContext(named('currentFacilityMapSource')+'\n'+named('syncDoorDynamicProps'),context);
  const first=vm.runInContext('currentFacilityMapSource()',context);
  assert.equal(vm.runInContext('currentFacilityMapSource()',context),first,'ordinary frames reuse the capture');
  for(const next of[true,false]){
    ready=next;
    assert.throws(()=>vm.runInContext('syncDoorDynamicProps()',context),e=>e===stop);
    assert.equal(context.facilityMapSource,null,'the real caller clears the previous readiness capture');
    const current=vm.runInContext('currentFacilityMapSource()',context);
    assert.notEqual(current,first);
    assert.equal(current.floors.find(f=>f.id==='g').open.has('82,20'),!next,
      'the resulting runtime map reflects the same loaded thin wall');
  }
  assert.equal(pushes.length,2,'each readiness change also resubmits static geometry');
  PROPS.setColliderGroupEnabled('glass-court',true);
});
