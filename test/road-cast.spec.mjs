import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROAD_CAST,ROAD_CAST_LAMPS,ROAD_CAST_BILLS,ROAD_CAST_BOARD_COPY,ROAD_SERVICES,ROAD_STUDS,ROAD_CAB_CUP} from '../src/data/road-cast.js';
import {roadCastScene,roadCabCup} from '../src/game/source-drive/road-cast.js';
import {OPENING_ROAD,openingRoadAt,openingRoadSurfaceAt,openingWorldAt,openingDriveColliders,applyOpeningRoadScene} from '../src/game/source-drive/opening-road.js';
import {applyDriveTeaserScene} from '../src/game/source-drive/teaser-scene.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {createDrive,stepDrive} from '../src/game/source-drive/drive-state.js';
import {DRIVE_TIME_SKIPS} from '../src/game/source-drive/time-skips.js';

function glbMeshes(url){
  const data=readFileSync(new URL(url,import.meta.url)),length=data.readUInt32LE(12);
  return new Set(JSON.parse(data.subarray(20,20+length).toString()).meshes.map(mesh=>mesh.name));
}
const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const pack=glbMeshes('../public/assets/source-drive/road-cast/road-cast.glb');
const base=glbMeshes('../public/assets/conservatory-props.glb');
const drivePack=glbMeshes('../public/assets/source-drive/drive.glb');
function driveAt(d,lateral=-1.6){
  const a=openingWorldAt(d,lateral),s=createDrive();
  return Object.assign(s,{x:a.x,z:a.z,heading:a.heading,speed:12,roadHeight:a.y||0,paused:false});
}

test('every roadside mesh exists in the road pack or the base pack the drive already waits for',()=>{
  const wanted=new Set([...ROAD_CAST.map(row=>row.mesh),ROAD_STUDS.mesh,ROAD_CAB_CUP.mesh]);
  for(const mesh of wanted)assert.ok(pack.has(mesh)||base.has(mesh)||drivePack.has(mesh),`${mesh} has no pack`);
  for(const art of ROAD_CAST_BILLS)assert.ok(pack.has(`rc_bill_${art}`),`${art} was not built`);
  for(const row of ROAD_CAST.filter(row=>/bus|shelter/.test(row.id)))assert.ok(base.has(row.mesh),'the bus and its shelter are the real ones, not copies');
});

test('the cast stands beyond the rail, and only the stand can be touched, because only it has a way in',()=>{
  for(const row of ROAD_CAST){
    if(/^road-(stand|services)/.test(row.id))continue;
    const road=openingRoadAt(row.d),rail=road.leftWidth+1.4+.136;
    assert.ok(Math.abs(row.lateral)>rail+1,`${row.id} is ${row.lateral} against a rail at ${rail.toFixed(2)}`);
  }
  for(const d of [-548,-462,-348,-244]){
    const ids=openingDriveColliders(driveAt(d)).map(c=>String(c.id));
    assert.ok(!ids.some(id=>id.startsWith('road-')),'no road cast collider out here');
  }
  const here=openingDriveColliders(driveAt(-165)).map(c=>String(c.id));
  for(const id of ['road-stand-solid','road-stand-van-solid','road-stand-customer-solid'])assert.ok(here.includes(id),id);
});

test('the drive meets them in order, each one near a real bit of road, and they leave behind it',()=>{
  const seen=new Map();
  for(let d=OPENING_ROAD.spawn;d<OPENING_ROAD.join;d+=5)for(const prop of roadCastScene(d,openingWorldAt).props)if(!/stud/.test(prop.id)&&!seen.has(prop.id))seen.set(prop.id,d);
  for(const row of ROAD_CAST)assert.ok(seen.has(row.id),`${row.id} never shows on the drive`);
  const near=roadCastScene(-462,openingWorldAt).props.map(p=>p.id);
  assert.ok(near.includes('road-flatbed-sheet'));
  assert.ok(!roadCastScene(-100,openingWorldAt).props.some(p=>p.id==='road-flatbed-sheet'),'it is gone once it is well behind');
  for(const prop of roadCastScene(-462,openingWorldAt).props)assert.ok([prop.x,prop.y,prop.z,...prop.matrix].every(Number.isFinite),prop.id);
});

test('studs run down the crown at one spacing, through the join, and stop short of the cliff',()=>{
  const d=-40,props=roadCastScene(d,openingWorldAt).props.filter(p=>p.mesh===ROAD_STUDS.mesh);
  assert.ok(props.length>=10);
  for(const prop of props){
    const index=Number(prop.id.split('-').pop()),at=ROAD_STUDS.from+index*ROAD_STUDS.every,road=openingWorldAt(at);
    assert.ok(Math.hypot(prop.x-32-road.x,prop.z-32-road.z)<1e-6,'on the same centreline as the tyres');
  }
  assert.ok(ROAD_STUDS.to<297,'the broken edge at d297 keeps its own business');
  const far=roadCastScene(300,openingWorldAt).props.filter(p=>p.mesh===ROAD_STUDS.mesh);
  for(const prop of far)assert.ok(ROAD_STUDS.from+Number(prop.id.split('-').pop())*ROAD_STUDS.every<=ROAD_STUDS.to);
});

test('the lamps leave the drive enough of the renderer\'s twelve',()=>{
  for(let d=OPENING_ROAD.start;d<300;d+=4){
    const lamps=roadCastScene(d,openingWorldAt).lamps;
    assert.ok(lamps.length<=2,`${lamps.length} practicals at ${d}`);
  }
  for(const lamp of ROAD_CAST_LAMPS)assert.ok(lamp.radius<=(lamp.id==='road-stand-window'?16:9),'a practical lights its owner, not the road');
  const scene=applyOpeningRoadScene(makeDriveScene(driveAt(-348),metrics,{weather:null}),driveAt(-348));
  assert.ok(scene.lamps.length<=12,`${scene.lamps.length} lights at the bus`);
  assert.ok(scene.lamps.some(l=>l.id==='road-bus-saloon'));
});

test('the boards say what the guard will say, in his own words, and the miles run out too fast',()=>{
  const said=readFileSync(new URL('../content/narrative/conservatory.cold_open_dialogue.story.json',import.meta.url),'utf8').toLowerCase();
  const line=id=>ROAD_CAST_BOARD_COPY.boards.find(row=>row.id===id).lines.join(' ').toLowerCase();
  assert.ok(said.includes(line('coffee')),'there\'s coffee if you want it');
  assert.ok(said.includes(line('hot')),'it\'s not good but it\'s hot');
  assert.ok(said.includes('a long night you have ahead'),line('night'));
  assert.ok(said.includes('you look like you need it'),line('need'));
  const foot=ROAD_CAST_BOARD_COPY.boards.map(row=>row.foot||'');
  assert.deepEqual(['3 MILES','2 MILES','1 MILE','HALF A MILE'].map(m=>foot.findIndex(f=>f.includes(m))),[0,1,2,3],'in that order');
  const boards=ROAD_CAST.filter(row=>/^road-board-[a-z]+$/.test(row.id)).map(row=>row.d),span=Math.max(...boards)-Math.min(...boards);
  assert.ok(span<500,`three miles of signs in ${span} m of road`);
  for(const row of ROAD_CAST_BOARD_COPY.boards)assert.ok(pack.has(`rc_board_${row.id}`),`${row.id} was not painted`);
  for(const row of ROAD_CAST_BOARD_COPY.lit)assert.ok(pack.has(`rc_letters_${row.id}`),`${row.id} was not cut`);
  const all=JSON.stringify(ROAD_CAST_BOARD_COPY).toLowerCase();
  assert.doesNotMatch(all,/\b(dead|dying|died|crash|ellery|hush|surfer|alan|sarah|lyle)\b/,'an advert is an advert');
});

test('the road really widens: slip lane, forecourt, slip lane, on the left only',()=>{
  assert.equal(openingRoadAt(-241).leftWidth,3.25);
  assert.equal(openingRoadAt(-95).leftWidth,3.25);
  assert.equal(openingRoadAt(-165).leftWidth,16.25);
  for(let d=-260;d<-90;d+=2)assert.equal(openingRoadAt(d).rightWidth,3.25,'the far side of the road does not move');
  let last=3.25;for(let d=-240;d<=-196;d+=2){const w=openingRoadAt(d).leftWidth;assert.ok(w>=last-1e-9&&w-last<1.5,`no step at ${d}`);last=w;}
  const on=openingWorldAt(-165,-9);assert.equal(openingRoadSurfaceAt(on.x,on.z).kind,'asphalt','the tyres are on tarmac out there');
  const off=openingWorldAt(-165,9);assert.equal(openingRoadSurfaceAt(off.x,off.z).kind,'verge','and on grass the same distance the other way');
});

test('the rail goes round the outside of the pull-in with no gap you could leave by',()=>{
  const rails=new Map();
  for(let d=-262;d<-80;d+=3)for(const c of openingDriveColliders(driveAt(d)))if(String(c.id).startsWith('opening-road-edge--1-'))rails.set(c.id,c);
  const row=[...rails.values()].sort((a,b)=>b.z-a.z);
  assert.ok(row.length>50);
  const ends=c=>{const a=c.yaw,dx=-Math.sin(a)*c.halfZ,dz=Math.cos(a)*c.halfZ;return[[c.x-dx,c.z-dz],[c.x+dx,c.z+dz]];};
  for(let i=1;i<row.length;i++){
    const gap=Math.min(...ends(row[i-1]).flatMap(p=>ends(row[i]).map(q=>Math.hypot(p[0]-q[0],p[1]-q[1]))));
    assert.ok(gap<.7,`${gap.toFixed(2)} m gap at ${row[i].id}`);
  }
});

test('you can pull in, stop on the forecourt, and rejoin the road',()=>{
  const seat=openingWorldAt(-262,-1.6),s=createDrive();
  Object.assign(s,{x:seat.x,z:seat.z,heading:seat.heading,speed:9,throttle:.4,roadHeight:0,paused:false});
  const sample=()=>openingRoadSurfaceAt(s.x,s.z);
  const steer=(target,want)=>{const r=sample(),aim=r.heading+Math.max(-.55,Math.min(.55,(target-r.offset)*.14));return{...want,left:s.heading>aim+.01,right:s.heading<aim-.01};};
  let t=0,stopped=null;
  const run=(until,input,limit=90)=>{for(let end=t+limit;t<end&&!until();t+=1/120){stepDrive(s,1/120,input(),openingDriveColliders(s),{roadSampler:openingRoadSurfaceAt});}assert.ok(until(),`stuck at d ${sample().distance.toFixed(1)}, lateral ${sample().offset.toFixed(1)}, ${s.speed.toFixed(1)} m/s`);};
  run(()=>sample().distance>-200,()=>steer(-1.6,{forward:s.speed<9}));
  run(()=>sample().distance>-178&&sample().offset<-7.5,()=>steer(-9,{forward:s.speed<7}));
  run(()=>Math.abs(s.speed)<.1,()=>steer(-9,{brake:true}));
  stopped={d:sample().distance,lateral:sample().offset,kind:sample().kind};
  assert.equal(stopped.kind,'asphalt','stopped on the forecourt, not the verge');
  assert.ok(stopped.lateral<-6,`clear of the carriageway: ${stopped.lateral.toFixed(1)}`);
  run(()=>sample().distance>-120,()=>steer(-5,{forward:s.speed<7}));
  run(()=>sample().distance>-92,()=>steer(-1.6,{forward:s.speed<8}));
  assert.ok(Math.abs(sample().offset)<3.25,`back in lane: ${sample().offset.toFixed(1)}`);
});

test('a dial cut sets him down on the way to the stand, so nobody misses it',()=>{
  const stretch=DRIVE_TIME_SKIPS.stretches.find(row=>row.id==='stalled');
  assert.ok(stretch.start.d<ROAD_CAST.find(row=>row.id==='road-stand-building').d-30,'it starts with the stand ahead of him');
  assert.ok(stretch.start.d>ROAD_SERVICES.from&&stretch.start.d<ROAD_SERVICES.fullFrom,'and with the slip lane open beside him');
});

test('the stand is its own building, with the guard behind the counter and a way round it',()=>{
  const row=id=>ROAD_CAST.find(r=>r.id===id);
  assert.equal(row('road-stand-building').mesh,'rc_stand');
  assert.ok(!ROAD_CAST.some(r=>/^yard_booth(?:_interior|_glazing|_practicals)?$/.test(r.mesh)),'no part of the gate lodge is out here');
  assert.equal(row('road-stand-man').mesh,'yard_booth_guard_idle');
  for(const mesh of ['yard_booth_guard_idle','vigil_figure_flask_a','district_litter_bin'])assert.ok(base.has(mesh),`${mesh} is not the building's own`);
  const road=openingRoadAt(row('road-stand-building').d);
  assert.ok(Math.abs(row('road-stand-building').lateral)<road.leftWidth,'it stands on the forecourt, inside the rail');
  assert.ok(road.leftWidth-3.25>10,'with room to pull a van in front of it');
});

test('the parked van stays parked when yours goes over',()=>{
  const s=driveAt(-160),scene=applyOpeningRoadScene(makeDriveScene(s,metrics,{weather:null}),s);
  const parked=scene.props.find(p=>p.id==='road-stand-van');assert.equal(parked.mesh,'drive_vehicle_body');
  const moved=Array.from(scene.body);moved[13]-=6;
  const falling=applyDriveTeaserScene(scene,{vehicleMatrix:moved,breakEdge:false,look:{yaw:0,pitch:0}});
  assert.equal(falling.props.find(p=>p.id==='road-stand-van').y,parked.y);
  assert.ok(!falling.teaser.attachedIds.includes('road-stand-van'));
  assert.equal(scene.props.findIndex(p=>p.mesh==='drive_vehicle_body')<scene.props.indexOf(parked),true,'your own van comes first, so anything that looks for the van finds yours');
});

test('the crash and the closing drive get it all from the same road',()=>{
  const s=driveAt(-462),scene=applyOpeningRoadScene(makeDriveScene(s,metrics,{weather:null}),s);
  assert.ok(scene.props.some(p=>p.id==='road-flatbed-sheet'));
  assert.ok(scene.props.some(p=>p.id==='road-cab-cup'));
  const moved=Array.from(scene.body);moved[13]-=6;moved[12]+=3;
  const falling=applyDriveTeaserScene(scene,{vehicleMatrix:moved,breakEdge:false,look:{yaw:0,pitch:0}}),cup=falling.props.find(p=>p.id==='road-cab-cup'),sheet=falling.props.find(p=>p.id==='road-flatbed-sheet');
  const before=scene.props.find(p=>p.id==='road-cab-cup');
  assert.ok(Math.abs(cup.matrix[13]-(before.matrix[13]-6))<1e-6,'the cup falls with the van');
  assert.ok(Math.abs(sheet.y-scene.props.find(p=>p.id==='road-flatbed-sheet').y)<1e-9,'the flatbed stays on the road');
  assert.ok(falling.teaser.attachedIds.includes('road-cab-cup'));
});

test('the cup sits on the fascia, in the frame the cab uses, and nothing names it',()=>{
  assert.equal(roadCabCup({}),null);
  const scene={body:[1,0,0,0,0,1,0,0,0,0,1,0,5,6,7,1],cabPoint:p=>[p[0]+5,p[1]+6,p[2]+7]},cup=roadCabCup(scene);
  assert.deepEqual(cup.matrix.slice(0,12),scene.body.slice(0,12));
  assert.deepEqual([cup.x,cup.y,cup.z],[ROAD_CAB_CUP.at[0]+5,ROAD_CAB_CUP.at[1]+6,ROAD_CAB_CUP.at[2]+7]);
  const source=readFileSync(new URL('../src/data/road-cast.js',import.meta.url),'utf8');
  assert.ok(!/label|prompt|caption|title:/i.test(source),'no row carries words a player could read: it just goes by');
});
