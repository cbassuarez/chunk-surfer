import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{fileURLToPath,pathToFileURL}from'node:url';
const root=process.env.TOWNSCAPE_REPO||fileURLToPath(new URL('../',import.meta.url)),load=p=>import(pathToFileURL(path.join(root,p)).href);
const[FP,PROPS,{conservatory:C},{EXTERIOR_FRONTAGE_INSPECTABLES:INSPECTABLES,EXTERIOR_FRONTAGE_DRESSING:DRESSING},{CONSERVATORY_PROPS:AUTHORED},{districtLogicalAt,exteriorStreetAt},{BUILDING_WINDOWS},{EXTERIOR_STREET_FABRIC:FABRIC,exteriorStreetLampLights,exteriorStreetWallServiceInstances},{buildExteriorNeighbourhood}]=await Promise.all([
 load('src/world/floorplan.js'),load('src/game/props.js'),load('src/data/floorplan/conservatory.js'),load('src/data/exterior-frontages.js'),load('src/data/conservatory-props.js'),load('src/data/exterior-district.js'),load('src/data/building-windows.js'),load('src/data/exterior-street-fabric.js'),load('tools/chunk_surfer/exterior-neighborhood-geometry.mjs'),
]);
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});PROPS.propsInit(FP);
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const body=p=>{const a=FP.logicalToPhysical(p.x,p.y);return{x:(a.x+.5)*.5,z:(a.z+.5)*.5};};
const at=(x,z)=>{const q=FP.logicalAtPhysical(x*2,z*2,{group:'ground',floor:.12});assert.ok(q,`no physical cell at${x},${z}`);return{x:Math.floor(q.x),y:Math.floor(q.y)};};
function move(p,dx,dy){
 const step=FP.canStep(p.x,p.y,p.x+dx,p.y+dy,{keys:new Set()});assert.equal(step.ok,true,`${JSON.stringify(body(p))} step${dx},${dy}: ${step.why}`);
 const q=step.redirect||{x:p.x+dx,y:p.y+dy};assert.equal(PROPS.propCanOccupy(q.x,q.y,{from:p}),true,`actual body/facade collision rejected${JSON.stringify(body(q))}`);
 const a=body(p),b=body(q);near(Math.hypot(b.x-a.x,b.z-a.z),.5);return q;
}
function walk(p,dx,dy,count){for(let i=0;i<count;i++)p=move(p,dx,dy);return p;}
const rendered=PROPS.renderInstances({group:'ground',inscriptions:false}),rows=rendered.filter(p=>DRESSING.some(d=>d.id===p.id));

test('the public front retains the original building namespace and an explicit full-width directional seam',()=>{
 assert.equal(C.levels.some(l=>l.id==='ellery_public_footway_join'),false,'a one-metre join layer overlaps half a metre of the actual forecourt');
 const portal=FP.edgePortalState().find(p=>p.id==='north-footway-to-public-forecourt');assert.ok(portal,'the rendered pavement connection also needs a gameplay namespace edge');assert.equal(portal.lanes,48);assert.equal(portal.width,24);
 for(const pair of portal.pairs){const a=body(pair.from),b=body(pair.to);near(a.x,b.x);near(a.z,-.25);near(b.z,.25);near(FP.floorAt(pair.from.x,pair.from.y),.12);near(FP.floorAt(pair.to.x,pair.to.y),.12);}
 assert.equal(FP.physicalSpanData().overlaps.length,0,'the new forecourt must not create competing physical owners');
});

test('all48half-metre lanes admit real bodies from the footway and immediately return without connector bounce',()=>{
 for(let lane=0;lane<48;lane++){
  const x=74.25+lane*.5;let p=at(x,-.75);p=move(p,0,1);near(body(p).z,-.25);p=move(p,0,1);near(body(p).z,.25);p=move(p,0,1);near(body(p).z,.75);
  p=move(p,0,-1);near(body(p).z,.25);p=move(p,0,-1);near(body(p).z,-.25);p=move(p,0,-1);near(body(p).z,-.75);
 }
});

test('a continuous public approach reaches both sides, crosses laterally on the seam, and returns to the street',()=>{
 let p=at(79.25,-1.25);p=walk(p,0,1,5);near(body(p).z,1.25);p=walk(p,-1,0,9);near(body(p).x,74.75);p=walk(p,1,0,45);near(body(p).x,97.25);
 p=walk(p,0,-1,2);near(body(p).z,.25);p=walk(p,-1,0,44);near(body(p).x,75.25);p=move(p,0,1);near(body(p).z,.75);p=walk(p,0,-1,3);near(body(p).z,-.75);
});

test('the public door stays closure-locked and W3 and D0 keep their established apertures',()=>{
 const front=FP.doorState().find(p=>p.id==='front-main');assert.ok(front);assert.equal(front.keyId,'closure-order');assert.equal(front.open,false);assert.equal(front.legacyId,'158,7');
 let p=at(79.25,2.25);p=move(p,0,1);const refusal=FP.canStep(p.x,p.y,p.x,p.y+1,{keys:new Set(['master'])});assert.equal(refusal.ok,false);assert.equal(refusal.why,'locked');assert.equal(refusal.keyId,'closure-order');
 const w=BUILDING_WINDOWS.find(w=>w.id==='W3-foyer-north');assert.deepEqual(w.physical,{axis:'z',plane:3,from:84,to:88,depth:1,x0:84,x1:88,z0:3,z1:4});near(w.sill,1.05);near(w.head,3.45);
 const d0=FP.doorState().find(p=>p.id==='pool-lobby');assert.ok(d0);assert.equal(d0.legacyId,'168,55');assert.equal(d0.keyId,null);assert.equal(d0.archetype,'pool-glazed-pair');assert.equal(d0.leafCount,2);assert.deepEqual(d0.aperture,{width:2,height:3.4});
});

test('every reachable trade target survives production propsInit, describes its actual display and never renders a proxy',()=>{
 const legal=INSPECTABLES.filter(e=>exteriorStreetAt(e.physical.x+e.mountNormal.nx*.80,e.physical.y+e.mountNormal.ny*.80));
 const authored=AUTHORED.filter(p=>p.interactionProxy);assert.equal(authored.length,legal.length);assert.ok(legal.length>=35&&legal.length<INSPECTABLES.length,'scenery beyond the walkable ring must not promise an interaction');
 for(const e of legal){const p=PROPS.propById(e.id);assert.ok(p,`${e.id} is silently dropped as a solid-cell placement`);assert.equal(p.blocks,false);assert.equal(p.label,e.label);assert.equal(p.inspect.first,e.text);assert.ok(p.inspect.first.includes(e.trade));assert.equal(rendered.some(r=>r.id===e.id),false);}
 const ids=new Set(legal.map(e=>e.id));assert.equal(rendered.some(r=>ids.has(r.id)),false);
 for(const d of FP.doorState()){
  const q=FP.logicalToPhysical(d.cx,d.cy);for(const e of legal){const p=PROPS.propById(e.id),a=FP.logicalToPhysical(p.rx,p.ry);assert.ok(Math.hypot((a.x-q.x)*.5,(a.z-q.z)*.5)>2.6,`${e.id} overlaps the normal door interaction reach of${d.id}`);}
 }
});

test('allfour staticstreet meshes render at their baked physicalorigin and services follow the actual workshop poses',()=>{
 for(const mesh of FABRIC.meshNames.filter(m=>m!=='exterior_street_wall_services')){const instance=rendered.find(p=>p.mesh===mesh);assert.ok(instance,`${mesh} never survived production propsInit`);near(instance.x,64);near(instance.y,0);near(instance.z,46);}
 const expected=exteriorStreetWallServiceInstances(rows),actual=rendered.filter(p=>p.mesh==='exterior_street_wall_services');assert.equal(actual.length,expected.length);assert.ok(actual.length===3);
 for(const e of expected){const a=actual.find(p=>p.id===e.id);assert.ok(a);for(const k of['x','y','z','yaw'])near(a[k],e[k]);}
});

test('actual lamp socket geometry and row transforms agree with runtime light candidates',()=>{
 const reports=buildExteriorNeighbourhood({materials:[],mesh:name=>({name}),addBox(){},addQuad(){},addBeam(){},addCylinder(){}});
 const lightCandidates=exteriorStreetLampLights({rows,origin:{x:64,z:46},maxDistance:1000,maxLights:100});
 for(const row of rows){const kind=row.mesh==='district_terrace_frontage_stationer'?'district_terrace_frontage':row.mesh,report=reports.find(r=>r.mesh===kind);if(!report)continue;
  const lamps=report.parts.filter(p=>p.id.startsWith('street-lamp-head-'));assert.equal(lamps.length,4);
  for(const lamp of lamps){const[x,y,z]=lamp.center,c=Math.cos(row.yaw),s=Math.sin(row.yaw),world={x:row.x+c*x-s*z,y:row.y+y,z:row.z+s*x+c*z};const actual=lightCandidates.find(l=>l.id===`${row.id}:road-supply-lamp:${z}`);assert.ok(actual);for(const k of['x','y','z'])near(actual[k],world[k]);}
 }
 const main=fs.readFileSync(path.join(root,'src/main.js'),'utf8');assert.match(main,/r3dStreetFabricReady\?\.\(\)===true/,'new lamp pools need their real loaded geometry');assert.match(main,/selectExteriorTownLights\(/,'outdoor source categories must share one admission budget');
});


const[{ELLERY_PUBLIC_FRONT:PUBLIC,ELLERY_PUBLIC_FRONT_PROPS:PUBLIC_PROPS,ELLERY_PUBLIC_FRONT_LIGHTS:ENTRANCE_LIGHTS},
 {elleryPublicFrontGeometry},{shouldHideCrossEnvelopeProp,isBuildingWindowInterior},{ZONE},{selectExteriorTownLights}]=await Promise.all([
 load('src/data/ellery-public-front.js'),load('tools/chunk_surfer/ellery-public-front-geometry.mjs'),load('src/game/prop-visibility.js'),
 load('src/data/floorplan/legend.js'),load('src/render/exterior-town-lighting.js')]);

test('actual public-front, forecourt and D0 fanlight survive production placement at the exact geometry anchors',()=>{
 const models=elleryPublicFrontGeometry();
 for(const authored of PUBLIC_PROPS){
  const p=PROPS.propById(authored.id),drawn=rendered.find(p=>p.id===authored.id),model=models.find(m=>m.name===authored.mesh);
  assert.ok(p,authored.id+' was silently dropped by a solid logical host');assert.ok(drawn,authored.id+' was absent from production drawing');assert.ok(model);
  assert.equal(drawn.mesh,authored.mesh);near(drawn.x,model.anchor.x);near(drawn.y,0);near(drawn.z,model.anchor.z);near(drawn.yaw,0);
  assert.equal(p.blocks,false);assert.equal(p.interactive,false);assert.equal(PROPS.renderInstances({group:'upper',inscriptions:false}).some(q=>q.id===p.id),false);
 }
 const hero=rendered.filter(p=>p.mesh===PUBLIC.hero.mesh);assert.equal(hero.length,1,'the repair overrides one existing hero rather than doubling the facade');
 near(hero[0].x,PUBLIC.hero.anchor.x);near(hero[0].z,PUBLIC.hero.anchor.z);
 const w3=BUILDING_WINDOWS.find(w=>w.id==='W3-foyer-north');
 for(const id of['ellery-actual-public-front','ellery-public-forecourt'])for(const observerZone of[ZONE.street,ZONE.civicCourt]){
  assert.equal(shouldHideCrossEnvelopeProp(rendered.find(p=>p.id===id),{observerZone,exteriorWindow:w3}),false,id+' must survive the actual outdoor envelope filter');
 }
 assert.equal(isBuildingWindowInterior(rendered.find(p=>p.id==='ellery-baths-high-fanlight'),w3),true,'the real D0 header is admitted through W3');
 const loader=fs.readFileSync(path.join(root,'src/render/r3d.js'),'utf8');
 assert.match(loader,/addPropPack\(assetUrl\(ELLERY_PUBLIC_FRONT_PACK\)\)/,'production drawing must load the dedicated repair pack');
});

test('public entrance light positions follow the actual final facade and share its twelve-source street budget',()=>{
 const model=elleryPublicFrontGeometry().find(m=>m.name===PUBLIC.facade.mesh),pose=rendered.find(p=>p.mesh===PUBLIC.facade.mesh);
 for(const light of ENTRANCE_LIGHTS){
  const fixture=model.parts.find(p=>p.id==='public-lamp-diffuser-'+light.x);assert.ok(fixture);
  const local=fixture.center.map((v,k)=>v-([model.anchor.x,0,model.anchor.z][k])),world=[pose.x+local[0],pose.y+local[1],pose.z+local[2]];
  near(light.x,world[0]);near(light.y,world[1]);near(light.z,world[2]-.026);
  assert.ok(light.intensity>0&&light.intensity<1&&light.radius<=5,'the fixtures add bounded local pools, not an ambient multiplier');
 }
 const origin={x:79.25,z:1.25},road=exteriorStreetLampLights({rows,origin,maxDistance:1000,maxLights:100});
 const ordinary=Array.from({length:8},(_,i)=>({id:'far-ordinary-'+i,x:200+i,y:3,z:200}));
 const traffic=[{id:'far-traffic',x:201,y:1,z:201}];
 const selected=selectExteriorTownLights({ordinary,traffic,entrance:ENTRANCE_LIGHTS,road,origin,maxLights:12});
 assert.equal(selected.length,12);assert.equal(new Set(selected.map(p=>p.id)).size,12);
 for(const light of ENTRANCE_LIGHTS)assert.ok(selected.includes(light),'the closest actual entrance fixture must beat distant unrelated room lights');
 assert.ok(selected.some(light=>road.includes(light)),'the real row fixtures must not be starved by previously filled category lists');
});
