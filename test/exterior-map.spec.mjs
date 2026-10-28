import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as OBJ from '../src/game/objectives.js';
import {FACILITY_SPACE_IDS} from '../src/data/building-map.js';
import {EXTERIOR_MAP_SPACE_IDS} from '../src/data/exterior-map-ids.js';
import {EXTERIOR_MAP_SHELL} from '../src/data/generated/exterior-map-shell.js';
import {buildExteriorMapShell} from '../tools/chunk_surfer/build-exterior-map-shell.mjs';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {EXTERIOR_PUB,pubExteriorAt,pubExteriorLogicalAt} from '../src/data/exterior-pub.js';
import {SOUTH_ROW_SHOPS} from '../src/data/plaza-shopfronts.js';
import {captureExteriorMapSource,buildExteriorMapModel,usesExteriorMap,exteriorMapOccupancyFilter} from '../src/game/exterior-map-model.js';
import {findGridRoute} from '../src/game/map-routing.js';
import {buildMinimapCommands} from '../src/render/map-commands.js';
import {repairMapNav,selectedMapSpace} from '../src/game/map-navigation.js';
import {exteriorMapProjection} from '../src/render/exterior-map-view.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const projectLogical=p=>{const r=FP.toRuntimePoint(p),q=FP.logicalToPhysical(r.x,r.y);return{x:q.x,z:q.z,height:q.y,renderGroup:q.renderGroup};};
const canOccupy=s=>PROPS.propCanOccupy(s.logicalX,s.logicalY);
const physical=FP.physicalSpanData(),started=performance.now();
let broadphaseChecks=0;
const source=captureExteriorMapSource({physical,projectLogical,canOccupy:exteriorMapOccupancyFilter({props:PROPS.allProps(),colliders:PROPS.structuralColliders(),renderedInstances:PROPS.renderInstances({inscriptions:false}),canOccupy:s=>{broadphaseChecks++;return canOccupy(s);}})});
const captureMs=performance.now()-started;
const playerAt=space=>({x:space.position.x*2,y:space.position.y*2,height:space.height,areaLabel:'COURTYARD',heading:0});
const modelFor=(extra={})=>buildExteriorMapModel({source,player:playerAt(source.spaces[0]),job:{done:2,total:5,rooms:[]},navigation:{showRoute:true},...extra});

test('outside context is a district, while roof/interior/Source retain their own plans',()=>{
  for(const zone of [ZONE.dock,ZONE.street,ZONE.civicCourt,ZONE.serviceYard,ZONE.pub,ZONE.stationers])assert.equal(usesExteriorMap({zone,height:.12}),true);
  for(const zone of [ZONE.sourceSpace,ZONE.academic,ZONE.academicRoof,ZONE.church,ZONE.getIn,ZONE.foyer])assert.equal(usesExteriorMap({zone,height:0}),false);
  assert.equal(usesExteriorMap({zone:ZONE.dock,height:10}),false);
  const model=modelFor();assert.equal(model.context,'exterior');assert.deepEqual(model.floors.map(f=>f.id),['district']);assert.equal(model.spaces.some(s=>s.objective),false);
});
test('the broadphase preserves the full authoritative collision capture',()=>{
  const exact=captureExteriorMapSource({physical,projectLogical,canOccupy});
  assert.deepEqual(source.floors[0].open,exact.floors[0].open);
  assert.deepEqual(source.floors[0].visibilityOpen,exact.floors[0].visibilityOpen);
  assert.ok(broadphaseChecks<source.floors[0].visibilityOpen.size*.5,'empty ground avoids most full prop/facade collision calls');
});
test('street, pub, bay and van targets are standing points in the actual compiled clear ground',()=>{
  const floor=source.floors[0],van=source.spaces.find(s=>s.id==='outside:van');
  for(const space of source.spaces){assert.ok(floor.open.has(`${Math.floor(space.position.x)},${Math.floor(space.position.y)}`),space.id);
    assert.ok(findGridRoute(floor,van.position,space.position),`actual route ${space.id}`);}
  assert.ok(floor.bounds.minX<-14&&floor.bounds.maxX>142,'entire walked ring, not the indoor room crop');
});
test('Lyric shell and entrance follow the relocated canonical pub, including stable logical save coordinates',()=>{
  const doorway=pubExteriorAt(EXTERIOR_PUB.doors[0].id),target=source.spaces.find(s=>s.id==='outside:lyric'),shape=source.district.footprints.find(s=>s.id==='lyric');
  assert.deepEqual(target.position,{x:doorway.x,y:doorway.z});assert.deepEqual(target.logical,pubExteriorLogicalAt(EXTERIOR_PUB.doors[0].id));
  assert.equal(shape.points[0].x,EXTERIOR_PUB.bounds.x0);assert.equal(shape.points[2].y,EXTERIOR_PUB.bounds.z1);
  assert.ok(target.position.y<EXTERIOR_PUB.frontWorldZ,'marker is on the outside apron, not in furniture');
});
test('Bindery and Lyric have named, truthful street-map and minimap addresses',()=>{
  const bindery=source.spaces.find(s=>s.id==='outside:bindery'),lyric=source.spaces.find(s=>s.id==='outside:lyric');
  assert.ok(bindery);assert.equal(bindery.shortLabel,'BINDERY');assert.equal(lyric.shortLabel,'THE LYRIC');
  const deed=SOUTH_ROW_SHOPS.find(shop=>shop.useId==='bindery');
  const footprint=source.district.footprints.find(shape=>shape.id===`${deed.rowId}:${deed.deed}`);
  assert.equal(footprint.label,'THE BINDERY');
  assert.ok(bindery.position.x>Math.min(...footprint.points.map(p=>p.x))&&bindery.position.x<Math.max(...footprint.points.map(p=>p.x)));
  assert.ok(bindery.position.y<Math.min(...footprint.points.map(p=>p.y)),'the mark is on public pavement, outside the closed shop');
  assert.equal(bindery.access,'shopfront');assert.equal(bindery.doorIds,undefined,'a map mark must not invent an enterable door');
  assert.ok(source.floors[0].open.has(`${Math.floor(bindery.position.x)},${Math.floor(bindery.position.y)}`));
  for(const place of[bindery,lyric]){
    const commands=buildMinimapCommands({model:modelFor({player:playerAt(place)}),viewport:{x:1,y:1,w:22,h:10},aspect:.5});
    assert.ok(commands.some(c=>c.kind==='district-landmark'&&c.id===place.id&&c.label===place.shortLabel&&c.showLabel));
    OBJ.setPlayerWaypoint({spaceId:place.id,floorId:'district',label:place.label,position:place.position});
    const saved=structuredClone(OBJ.saveObjState());OBJ.clearWaypoint();OBJ.loadObjState(saved,{validTargets:[],validSpaces:FACILITY_SPACE_IDS});
    assert.equal(OBJ.playerWaypoint()?.spaceId,place.id);OBJ.clearWaypoint();
  }
});
test('the Lyric owns its two south-row deeds once, while court mouths remain openings',()=>{
  const shapes=source.district.footprints;
  assert.equal(shapes.filter(f=>f.id==='lyric').length,1);
  assert.ok(!shapes.some(f=>f.id==='district-south-row-a:0'));assert.ok(!shapes.some(f=>f.id==='district-south-row-a:1'));
  assert.ok(shapes.some(f=>f.id==='district-south-row-a:2'),'the next ordinary shop deed remains mapped');
  assert.ok(!shapes.some(f=>f.id==='district-north-row-b:4'));
  assert.ok(shapes.some(f=>f.role==='church'));assert.ok(shapes.some(f=>f.role==='outbuilding'));
});
test('Ellery massing comes from the actual rendered exterior shell, with no interior-plan islands or room label leak',()=>{
  assert.ok(source.district.institutionEdges.length>20);
  const masses=source.district.footprints.filter(f=>f.role==='institution');assert.ok(masses.length>10);
  for(const shape of masses)for(const p of shape.points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.equal(source.spaces.some(s=>/STUDIO B3|SOURCE|RINGING ROOM|BELL CHAMBER/.test(s.label)),false);
  assert.equal(source.district.footprints.some(f=>f.id==='ellery'),false);
  const regenerated=buildExteriorMapShell({write:false});assert.deepEqual(regenerated,EXTERIOR_MAP_SHELL,'selected actual exterior mesh fingerprint and projected cells must stay fresh');
  const covers=(x,y)=>masses.some(f=>x>=f.points[0].x&&x<f.points[2].x&&y>=f.points[0].y&&y<f.points[2].y);
  assert.ok(covers(72,63),'rendered1888schoolpavilion is an exterior mass even without an indoor ground room');
  assert.ok(covers(84,23),'rendered1967academicblock is retained');
  assert.ok(covers(105,75),'rendered1908chapel envelope is retained');
  const first=[...physical.cells].find(([,spans])=>spans.some(s=>s.zone===ZONE.street));
  const noIndoorPlan=captureExteriorMapSource({physical:{cells:new Map([first])},projectLogical});
  assert.deepEqual(noIndoorPlan.district.footprints.filter(f=>f.role==='institution'),masses,'interior room availability cannot change the exterior shell');
});
test('church rooms merge into one legible cruciform outer silhouette without internal room-edge ink',()=>{
  const cells=new Set();for(const f of source.district.footprints.filter(f=>f.role==='church'))for(let x=f.points[0].x;x<f.points[2].x;x++)for(let y=f.points[0].y;y<f.points[2].y;y++)cells.add(`${x},${y}`);
  const churchEdges=source.district.institutionEdges.filter(edge=>edge.every(p=>p.x>=9&&p.x<=24&&p.y>=56&&p.y<=85));assert.ok(churchEdges.length>50);
  for(const[a,b]of churchEdges){
    const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
    const sides=a.x===b.x?[cells.has(`${Math.floor(x-.1)},${Math.floor(y)}`),cells.has(`${Math.floor(x+.1)},${Math.floor(y)}`)]:[cells.has(`${Math.floor(x)},${Math.floor(y-.1)}`),cells.has(`${Math.floor(x)},${Math.floor(y+.1)}`)];
    assert.notEqual(sides[0],sides[1],'only church outside/inside boundary is inked');
  }
});
test('known street targets persist independently of story guidance and resolve to the canonical relocated point',()=>{
  const pub=source.spaces.find(s=>s.id==='outside:lyric'),saved={spaceId:pub.id,floorId:'g',position:{x:-6,y:107},label:pub.label};
  const model=modelFor({playerWaypoint:saved,activeWaypoint:{id:'story:bay',floorId:'g',position:{x:56,y:10},label:'GO TO ELLERY'}});
  assert.equal(model.waypoint.spaceId,pub.id);assert.equal(model.playerWaypoint.floorId,'district');assert.deepEqual(model.playerWaypoint.position,pub.position);
  assert.ok(model.route.points.length>1);assert.ok(model.route.points.every(p=>Number.isFinite(p.height)));
});
test('a canonical street mark survives the actual objective save/load whitelist',()=>{
  assert.deepEqual(source.spaces.map(s=>s.id),EXTERIOR_MAP_SPACE_IDS);
  const pub=source.spaces.find(s=>s.id==='outside:lyric');
  OBJ.setPlayerWaypoint({spaceId:pub.id,floorId:'district',label:pub.label,position:pub.position,x:70,y:889});
  const saved=structuredClone(OBJ.saveObjState());OBJ.clearWaypoint();
  OBJ.loadObjState(saved,{validTargets:[],validSpaces:FACILITY_SPACE_IDS});
  assert.equal(OBJ.playerWaypoint()?.spaceId,pub.id);assert.deepEqual(OBJ.playerWaypoint()?.position,pub.position);
  OBJ.clearWaypoint();
});
test('an indoor take points to the actual loading entrance, never through the street facade',()=>{
  const model=modelFor({activeWaypoint:{id:'story:room',label:'RECORD STUDIO B3',floorId:'b1',position:{x:80,y:20},height:-4}});
  assert.deepEqual(model.waypoint.position,source.spaces.find(s=>s.id==='outside:loading-bay').position);
  assert.match(model.waypoint.label,/RECORD STUDIO B3.*VIA LOADING BAY/);assert.equal(model.waypoint.floorId,'district');
  const basementUnderYard=modelFor({activeWaypoint:{id:'story:b3',label:'B3',floorId:'b1',position:source.spaces[0].position,height:-4}});
  assert.deepEqual(basementUnderYard.waypoint.position,source.spaces.find(s=>s.id==='outside:loading-bay').position,'a basement below open yard is reached through the entrance, not the same XY');
});
test('existing outside map navigation repairs an interior floor selection and retains accessible landmark selection',()=>{
  const model=modelFor(),nav=repairMapNav({floorId:'u1',selectedByFloor:{u1:'space:practice-1'}},model);
  assert.equal(nav.floorId,'district');assert.ok(selectedMapSpace(nav,model));
  const pub=source.spaces.find(s=>s.id==='outside:lyric');const marked=repairMapNav({...nav,selectedByFloor:{district:pub.id}},model);assert.equal(selectedMapSpace(marked,model).id,pub.id);
  assert.match(model.spaces.find(s=>s.id==='outside:st-brendan').label,/EXIT ONLY/);
});
test('heading-up minimap carries genuine building masses, boundaries and available landmarks',()=>{
  const pub=source.spaces.find(s=>s.id==='outside:lyric'),model=modelFor({player:playerAt(pub)}),commands=buildMinimapCommands({model,viewport:{x:1,y:1,w:22,h:10},aspect:.5});
  assert.ok(commands.some(c=>c.kind==='district-footprint'&&c.id==='lyric'));
  assert.ok(commands.some(c=>c.kind==='district-landmark'&&c.id===pub.id));
  const bayModel=modelFor({player:playerAt(source.spaces.find(s=>s.id==='outside:loading-bay'))});
  assert.ok(buildMinimapCommands({model:bayModel,viewport:{x:1,y:1,w:22,h:10},aspect:.5}).some(c=>c.kind==='district-boundary'));
});
test('restricted and compass modes cannot accidentally reveal new street geometry or names',()=>{
  for(const navigation of [{showMapTopology:false},{minimapMode:'compass'}]){
    const commands=buildMinimapCommands({model:modelFor({navigation}),viewport:{x:0,y:0,w:22,h:10}});
    assert.equal(commands.some(c=>c.kind.startsWith('district-')),false);
  }
  const commands=buildMinimapCommands({model:modelFor({navigation:{showRoom:false}}),viewport:{x:0,y:0,w:22,h:10}});
  assert.ok(commands.filter(c=>c.kind==='district-landmark').every(c=>!c.showLabel));
});
test('street projection rotates and zooms in the same pixel frame as canonical landmark hits',()=>{
  const viewport={x:2,y:3,w:65,h:20},bounds=source.floors[0].bounds;
  for(let rotation=0;rotation<4;rotation++){
    const p=exteriorMapProjection({bounds,viewport,aspect:.5,nav:{rotation}}),a=p.point({x:40,y:50}),b=p.point({x:50,y:50});
    assert.ok(Math.abs(Math.hypot(b.x-a.x,(b.y-a.y)/.5)-p.scale*10)<1e-6);
  }
});

test('district renderer and root-facing dispatcher are context-specific and do not import hidden actor state',()=>{
  const view=readFileSync(new URL('../src/render/map-view.js',import.meta.url),'utf8'),outside=readFileSync(new URL('../src/render/exterior-map-view.js',import.meta.url),'utf8');
  assert.match(view,/model\.context==='exterior'\s*\?drawExteriorMap/);assert.match(view,/STREET SURVEY/);
  assert.equal(/presence\.js|searchMode|attackCooldown|chosenPath/.test(outside),false);
});
test('the actual district canvas supplies clipped, canonical landmark hits and keeps topology restrictions',()=>{
  const calls=[],state={globalAlpha:1,shadowBlur:7},stack=[];
  const methods={save(){stack.push({...state});},restore(){for(const k of Object.keys(state))delete state[k];Object.assign(state,stack.pop());}};
  const ctx=new Proxy(state,{get(t,k){if(k in methods)return methods[k];if(k in t)return t[k];return(...args)=>calls.push({kind:k,args,color:t.fillStyle||t.strokeStyle});},set(t,k,v){t[k]=v;return true;}});
  const bindings={uiDraw:fn=>fn({ctx,cellW:8,cellH:16,dpr:1}),uiCellMetrics:()=>({cellW:8,cellH:16}),
    drawElectronicText:(_ctx,value,x,y)=>calls.push({kind:'text',value,x,y}),measureElectronicText:(value,{fontSize})=>String(value).length*fontSize*.6,
    selectedMapSpace,mapQuarterRotation:value=>((value%4)+4)%4};
  let text=readFileSync(new URL('../src/render/exterior-map-view.js',import.meta.url),'utf8');const names=[];
  text=text.replace(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];\s*/g,(_,list)=>{names.push(...list.split(',').map(n=>n.trim()));return'';}).replace(/export function /g,'function ');
  const draw=new Function(...names,`${text};return drawExteriorMap`)(...names.map(n=>bindings[n]));
  const model=modelFor(),nav={floorId:'district',rotation:1,selectedByFloor:{district:'outside:lyric'}},viewport={x:2,y:3,w:65,h:20};
  const output=draw({model,nav,viewport});assert.equal(output.hits.length,source.spaces.length);
  for(const hit of output.hits){assert.deepEqual(hit.point,output.projectedPoints[hit.payload.spaceId]);assert.ok(hit.x>=viewport.x&&hit.x+hit.w<=viewport.x+viewport.w);}
  assert.ok(calls.some(c=>c.kind==='text'&&c.value==='ELLERY'));
  assert.ok(calls.some(c=>c.kind==='clip'));assert.equal(stack.length,0);assert.deepEqual(state,{globalAlpha:1,shadowBlur:7});
  calls.length=0;draw({model:{...model,policy:{...model.policy,showMapTopology:false}},nav,viewport});assert.equal(calls.some(c=>c.kind==='text'&&c.value==='ELLERY'),false);
  assert.deepEqual(draw({model:{...model,policy:{showMap:false}},nav,viewport}).hits,[]);
});
console.log(`exterior map: ${source.floors[0].open.size} clear metre cells; ${source.district.footprints.length} footprint runs/deeds; ${source.district.institutionEdges.length} real edges; capture ${captureMs.toFixed(1)}ms`);
