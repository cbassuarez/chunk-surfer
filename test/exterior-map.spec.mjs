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
import {EXTERIOR_PUB,pubPhysicalExteriorAt,pubPhysicalAt,pubExteriorLogicalAt} from '../src/data/exterior-pub.js';
import {SOUTH_ROW_SHOPS} from '../src/data/plaza-shopfronts.js';
import {exteriorMapFootprints,exteriorMapTargets,exteriorInstitutionCells} from '../src/data/exterior-map.js';
import {GLASS_COURT} from '../src/data/glass-court.js';
import {captureExteriorMapSource,buildExteriorMapModel,usesExteriorMap,exteriorMapOccupancyFilter} from '../src/game/exterior-map-model.js';
import {findGridRoute} from '../src/game/map-routing.js';
import {buildMinimapCommands} from '../src/render/map-commands.js';
import {repairMapNav,selectedMapSpace} from '../src/game/map-navigation.js';
import {exteriorMapProjection} from '../src/render/exterior-map-view.js';
FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const projectLogical=p=>{const r=FP.toRuntimePoint(p),q=FP.logicalToPhysical(r.x,r.y);return{x:q.x,z:q.z,height:q.y,renderGroup:q.renderGroup};};
const canOccupy=s=>PROPS.propCanOccupy(s.logicalX,s.logicalY);
const physical=FP.physicalSpanData(),renderedInstances=PROPS.renderInstances({inscriptions:false}),started=performance.now();
let broadphaseChecks=0;
const source=captureExteriorMapSource({physical,projectLogical,renderedInstances,canOccupy:exteriorMapOccupancyFilter({props:PROPS.allProps(),colliders:PROPS.structuralColliders(),renderedInstances,canOccupy:s=>{broadphaseChecks++;return canOccupy(s);}})});
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
  const exact=captureExteriorMapSource({physical,projectLogical,renderedInstances,canOccupy});
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
  const doorway=pubPhysicalExteriorAt(EXTERIOR_PUB.doors[0].id),target=source.spaces.find(s=>s.id==='outside:lyric'),shape=source.district.footprints.find(s=>s.id==='lyric');
  assert.deepEqual(target.position,{x:doorway.x,y:doorway.z});assert.deepEqual(target.logical,pubExteriorLogicalAt(EXTERIOR_PUB.doors[0].id));
  const corners=[pubPhysicalAt({x:EXTERIOR_PUB.building.bounds.x0,z:EXTERIOR_PUB.building.bounds.z0}),pubPhysicalAt({x:EXTERIOR_PUB.building.bounds.x1,z:EXTERIOR_PUB.building.bounds.z1})];assert.equal(Math.min(...shape.points.map(p=>p.x)),Math.min(...corners.map(p=>p.x)));assert.equal(Math.max(...shape.points.map(p=>p.y)),Math.max(...corners.map(p=>p.z)));
  assert.ok(target.position.x<pubPhysicalAt({x:EXTERIOR_PUB.doors[0].x,z:EXTERIOR_PUB.frontWorldZ}).x,'marker is on the outside apron, not in furniture');
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
test('the Lyric occupies its existing yard building once, while south-row shops and court mouths remain truthful',()=>{
  const shapes=source.district.footprints;
  assert.equal(shapes.filter(f=>f.id==='lyric').length,1);
  assert.equal(shapes.find(f=>f.id==='lyric').sourcePropId,EXTERIOR_PUB.building.id);
  assert.ok(!shapes.some(f=>f.id===EXTERIOR_PUB.building.id),'one silhouette, not two overlapping building stamps');
  assert.ok(shapes.some(f=>f.id==='district-south-row-a:0'));assert.ok(shapes.some(f=>f.id==='district-south-row-a:1'));
  assert.ok(shapes.some(f=>f.id==='district-south-row-a:2'),'the next ordinary shop deed remains mapped');
  assert.ok(!shapes.some(f=>f.id==='district-north-row-b:4'));
  assert.ok(shapes.some(f=>f.role==='church'));assert.ok(shapes.some(f=>f.role==='outbuilding'));
});
test('outdoor masses and shop markers use the actual rendered metre frame, including rotated and scaled rows',()=>{
  const rowId=SOUTH_ROW_SHOPS.find(shop=>shop.useId==='bindery').rowId;
  const original=renderedInstances.find(p=>p.id===rowId),moved={...original,x:original.x+17,z:original.z-9};
  const before=exteriorMapFootprints({renderedInstances}),after=exteriorMapFootprints({renderedInstances:renderedInstances.map(p=>p.id===rowId?moved:p)});
  const id=before.find(s=>s.id.startsWith(rowId+':')).id;
  const a=before.find(s=>s.id===id),b=after.find(s=>s.id===id);
  for(let i=0;i<a.points.length;i++){assert.ok(Math.abs(b.points[i].x-a.points[i].x-17)<1e-7);assert.ok(Math.abs(b.points[i].y-a.points[i].y+9)<1e-7);}
  const markerA=exteriorMapTargets({renderedInstances}).find(s=>s.id==='outside:bindery');
  const markerB=exteriorMapTargets({renderedInstances:renderedInstances.map(p=>p.id===rowId?moved:p)}).find(s=>s.id==='outside:bindery');
  assert.ok(Math.abs(markerB.physical.x-markerA.physical.x-17)<1e-7);assert.ok(Math.abs(markerB.physical.y-markerA.physical.y+9)<1e-7);
  const turned={...original,yaw:original.yaw+Math.PI/2,scaleX:2,scaleZ:.5};
  const turnedShape=exteriorMapFootprints({renderedInstances:renderedInstances.map(p=>p.id===rowId?turned:p)}).find(s=>s.id===id);
  const length=(p,q)=>Math.hypot(q.x-p.x,q.y-p.y);
  assert.ok(Math.abs(length(turnedShape.points[0],turnedShape.points[1])-length(a.points[0],a.points[1])*2)<1e-7);
  assert.ok(Math.abs(length(turnedShape.points[1],turnedShape.points[2])-4)<1e-7,'an eight-metre deed follows the actual half-depth scale');
  const hero=renderedInstances.find(p=>p.id===EXTERIOR_MAP_SHELL.propId);
  const cells=exteriorInstitutionCells({renderedInstances});
  const shifted=exteriorInstitutionCells({renderedInstances:[{...hero,x:hero.x+11,z:hero.z-7}]});
  assert.deepEqual(shifted,new Set([...cells].map(k=>{const[x,y]=k.split(',').map(Number);return`${x+11},${y-7}`;})));
});
test('the two accessible baths courts stay open on the survey around one narrow greenhouse link',()=>{
  const floor=source.floors[0],van=source.spaces.find(s=>s.id==='outside:van');
  const masses=source.district.footprints.filter(shape=>shape.role==='institution');
  const covers=(shape,p)=>p.x>=Math.min(...shape.points.map(q=>q.x))&&p.x<Math.max(...shape.points.map(q=>q.x))
    &&p.y>=Math.min(...shape.points.map(q=>q.y))&&p.y<Math.max(...shape.points.map(q=>q.y));
  for(const court of GLASS_COURT.outdoorCourts){
    const point={x:(court.x0+court.x1)/2,y:(court.z0+court.z1)/2};
    assert.ok(floor.open.has(`${Math.floor(point.x)},${Math.floor(point.y)}`),`${court.id} court is actual clear ground`);
    assert.ok(!masses.some(shape=>covers(shape,point)),`${court.id} court is not painted over by the retired atrium roof`);
    // The external survey omits the enclosed route from the van through
    // Ellery. Each court must retain its own real entrance-side circulation;
    // an outdoor line across the omitted interior would promise a false route.
    const entrance=court.id==='west'?{x:76,y:23.5}:{x:93,y:23.5};
    assert.ok(findGridRoute(floor,entrance,point),`${court.id} court connects to its actual court-side approach`);
  }
  const links=source.district.footprints.filter(shape=>shape.id==='baths-greenhouse-link');
  assert.equal(links.length,1);
  assert.deepEqual(links[0].points,[{x:GLASS_COURT.bounds.x0,y:GLASS_COURT.bounds.z0},{x:GLASS_COURT.bounds.x1,y:GLASS_COURT.bounds.z0},
    {x:GLASS_COURT.bounds.x1,y:GLASS_COURT.bounds.z1},{x:GLASS_COURT.bounds.x0,y:GLASS_COURT.bounds.z1}]);
});
test('Ellery massing comes from the actual rendered exterior shell, with no interior-plan islands or room label leak',()=>{
  assert.ok(source.district.institutionEdges.length>20);
  const masses=source.district.footprints.filter(f=>f.role==='institution');assert.ok(masses.length>10);
  for(const shape of masses)for(const p of shape.points)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  assert.equal(source.spaces.some(s=>/STUDIO B3|SOURCE|RINGING ROOM|BELL CHAMBER/.test(s.label)),false);
  assert.equal(source.district.footprints.some(f=>f.id==='ellery'),false);
  const regenerated=buildExteriorMapShell({write:false});assert.deepEqual(regenerated,EXTERIOR_MAP_SHELL,'selected actual exterior mesh fingerprint and projected cells must stay fresh');
  assert.equal(regenerated.asset,'public/assets/ellery-public-front.glb','the final runtime mesh replacement owns the street silhouette');
  const covers=(x,y)=>masses.some(f=>x>=f.points[0].x&&x<f.points[2].x&&y>=f.points[0].y&&y<f.points[2].y);
  assert.ok(covers(72,63),'rendered1888schoolpavilion is an exterior mass even without an indoor ground room');
  assert.equal(covers(84,23),false,'the former centre of the academic block is now an actual open sky court');
  assert.ok(covers(75,23),'the retained west wing still has its actual roofed mass');
  assert.ok(covers(105,75),'rendered1908chapel envelope is retained');
  const first=[...physical.cells].find(([,spans])=>spans.some(s=>s.zone===ZONE.street));
  const noIndoorPlan=captureExteriorMapSource({physical:{cells:new Map([first])},projectLogical});
  assert.deepEqual(noIndoorPlan.district.footprints.filter(f=>f.role==='institution'),masses,'interior room availability cannot change the exterior shell');
});
test('each terrace row stamps its deeds once and is inked as one mass, not a box per deed',()=>{
  const deeds=source.district.footprints.filter(f=>/^district-.*-row-.*:\d$/.test(f.id));
  assert.equal(deeds.some(f=>/-trade/.test(f.id)),false,'trade layers and shop inspectables share the row prefix but are not rows');
  assert.ok(deeds.length<=10*8,`${deeds.length} deeds from ten rows`);
  const key=p=>`${Math.round(p.x*1000)/1000+0},${Math.round(p.y*1000)/1000+0}`,edges=new Set(source.district.massEdges.map(e=>e.map(key).sort().join('|')));
  const north=[0,1].map(d=>deeds.find(f=>f.id===`district-north-row-a:${d}`));
  const shared=north[0].points.map((a,i)=>[a,north[0].points[(i+1)%4]]).find(([a,b])=>north[1].points.some(p=>key(p)===key(a))&&north[1].points.some(p=>key(p)===key(b)));
  assert.ok(shared,'neighbouring deeds share a party wall');
  assert.equal(edges.has(shared.map(key).sort().join('|')),false,'the party wall between two deeds is not inked');
  assert.ok(source.district.massEdges.length<deeds.length*4);
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
test('heading-up minimap carries the authored building masses, boundaries and available landmarks',()=>{
  const pub=source.spaces.find(s=>s.id==='outside:lyric'),model=modelFor({player:playerAt(pub)}),commands=buildMinimapCommands({model,viewport:{x:1,y:1,w:22,h:10},aspect:.5});
  assert.ok(commands.some(c=>c.kind==='plan-shape'&&c.role==='pub'),'the Lyric is drawn from the authored plan');
  assert.equal(commands.some(c=>c.kind==='local-topology'||c.kind==='district-footprint'),false,'no sampled cells or deed boxes outdoors');
  assert.ok(commands.some(c=>c.kind==='district-landmark'&&c.id===pub.id));
  const bayModel=modelFor({player:playerAt(source.spaces.find(s=>s.id==='outside:loading-bay'))});
  assert.ok(buildMinimapCommands({model:bayModel,viewport:{x:1,y:1,w:22,h:10},aspect:.5}).some(c=>c.kind==='plan-edge'&&c.role==='institution'));
});
test('restricted and compass modes cannot accidentally reveal new street geometry or names',()=>{
  for(const navigation of [{showMapTopology:false},{minimapMode:'compass'}]){
    const commands=buildMinimapCommands({model:modelFor({navigation}),viewport:{x:0,y:0,w:22,h:10}});
    assert.equal(commands.some(c=>c.kind.startsWith('district-')||c.kind.startsWith('plan-')),false);
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
test('the authored plan keeps the park fountain where its water actually is',async()=>{
  const [{EXTERIOR_MAP_PLAN},{EXTERIOR_FOREGROUND},{computeWaterBodies}]=await Promise.all([
    import('../src/data/exterior-map-plan.js'),import('../src/data/exterior-foreground.js'),import('../src/game/water-bodies.js')]);
  const kerb=EXTERIOR_MAP_PLAN.ground.find(g=>g.id==='yard-park-fountain'),water=EXTERIOR_MAP_PLAN.ground.find(g=>g.id==='yard-park-fountain-water');
  assert.ok(kerb&&water,'the fountain is drawn on the survey');
  const centre=points=>points.reduce((c,p)=>({x:c.x+p.x/points.length,y:c.y+p.y/points.length}),{x:0,y:0});
  const f=EXTERIOR_FOREGROUND.garden.fountain;
  for(const shape of[kerb,water]){const c=centre(shape.points);assert.ok(Math.hypot(c.x-f.x,c.y-f.z)<1e-9);}
  assert.ok(EXTERIOR_MAP_PLAN.ground.indexOf(water)>EXTERIOR_MAP_PLAN.ground.findIndex(g=>g.id==='yard-park'),'drawn over the lawn');
  const body=computeWaterBodies(FP).find(b=>b.id==='park-fountain');assert.ok(body,'the basin still has water in the compiled plan');
  const mid=FP.logicalToPhysical((body.bounds.minX+body.bounds.maxX)/2,(body.bounds.minY+body.bounds.maxY)/2);
  assert.ok(Math.hypot((mid.x+.5)*.5-f.x,(mid.z+.5)*.5-f.z)<.6,'the drawn basin and the real water share a centre');
});
console.log(`exterior map: ${source.floors[0].open.size} clear metre cells; ${source.district.footprints.length} footprint runs/deeds; ${source.district.institutionEdges.length} real edges; capture ${captureMs.toFixed(1)}ms`);
