import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ROAD_CAST,ROAD_CAST_LAMPS,ROAD_CAST_BILLS,ROAD_CAST_BOARD_COPY,ROAD_STUDS,ROAD_CAB_CUP} from '../src/data/road-cast.js';
import {roadCastScene,roadCabCup} from '../src/game/source-drive/road-cast.js';
import {OPENING_ROAD,openingRoadAt,openingWorldAt,openingDriveColliders,applyOpeningRoadScene} from '../src/game/source-drive/opening-road.js';
import {applyDriveTeaserScene} from '../src/game/source-drive/teaser-scene.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';

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

test('nothing on the road can be hit: the cast stands beyond the rail and adds no collider',()=>{
  for(const row of ROAD_CAST){
    const road=openingRoadAt(row.d),rail=road.leftWidth+1.4+.136;
    assert.ok(Math.abs(row.lateral)>rail+1,`${row.id} is ${row.lateral} against a rail at ${rail.toFixed(2)}`);
  }
  for(const d of [-548,-462,-348,-244]){
    const ids=openingDriveColliders(driveAt(d)).map(c=>String(c.id));
    assert.ok(!ids.some(id=>id.startsWith('road-')),'no road cast collider');
  }
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
  for(const lamp of ROAD_CAST_LAMPS)assert.ok(lamp.radius<=9,'a practical lights its owner, not the road');
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

test('the kiosk is the real gate lodge with the real man in it, and you can\'t pull in',()=>{
  const lodge=ROAD_CAST.filter(row=>row.id.startsWith('road-kiosk-')).map(row=>row.mesh);
  for(const mesh of ['yard_booth','yard_booth_interior','yard_booth_practicals','yard_booth_glazing','yard_booth_guard_idle'])assert.ok(lodge.includes(mesh),mesh);
  for(const mesh of ['yard_booth','yard_booth_guard_idle','player_shadow_figure','district_litter_bin'])assert.ok(base.has(mesh),`${mesh} is not the building's own`);
  const{colliders}=applyOpeningRoadScene(makeDriveScene(driveAt(-165),metrics,{weather:null}),driveAt(-165));
  const rails=colliders.filter(c=>String(c.id).startsWith('opening-road-edge--1')).map(c=>c.z).sort((a,b)=>a-b);
  assert.ok(rails.length>10,'the rail runs on past it');
  for(let i=1;i<rails.length;i++)assert.ok(rails[i]-rails[i-1]<4,'no gap in the rail: PULL IN HERE, and there is nowhere to');
});

test('the parked van stays parked when yours goes over',()=>{
  const s=driveAt(-160),scene=applyOpeningRoadScene(makeDriveScene(s,metrics,{weather:null}),s);
  const parked=scene.props.find(p=>p.id==='road-kiosk-van');assert.equal(parked.mesh,'drive_vehicle_body');
  const moved=Array.from(scene.body);moved[13]-=6;
  const falling=applyDriveTeaserScene(scene,{vehicleMatrix:moved,breakEdge:false,look:{yaw:0,pitch:0}});
  assert.equal(falling.props.find(p=>p.id==='road-kiosk-van').y,parked.y);
  assert.ok(!falling.teaser.attachedIds.includes('road-kiosk-van'));
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
