import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {DISTRICT_BOUNDS,DISTRICT_STREETS,DISTRICT_COURTS,buildExteriorDistrictRows,exteriorRainMaterialMixAt} from '../src/data/exterior-district.js';
import {GLASS_COURT as C,GLASS_COURT_PROPS,GLASS_COURT_COLLIDERS,GLASS_COURT_PHYSICAL_COLLIDERS,GLASS_COURT_LIGHTS,glassCourtLogicalAt} from '../src/data/glass-court.js';
import {CONSERVATORY_LIGHTS,resolveLocalLights} from '../src/data/conservatory-lights.js';
import {COVER,resolveCover} from '../src/game/cover.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {ZONE} from '../src/data/floorplan/legend.js';
import {BUILDING_AMENITY_PROPS,POOL_WASH_PARTITIONS} from '../src/data/building-amenities.js';
import {buildBuildingAmenities} from '../tools/chunk_surfer/building-amenities-geometry.mjs';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
const point=(x,z)=>({x:(x-.25)*2,y:(z-.25)*2});
const clear=(x,z)=>{const p=point(x,z);return !FP.isSolid(p.x,p.y)&&PROPS.propCanOccupy(p.x,p.y);};
const coverPlan={size:FP.planSize,isSolid:(x,y)=>FP.isSolid(x,y)||PROPS.tallBlockingPropAt(x,y,COVER.MIN_HEIGHT_M),
  floorAt:FP.floorAt,zoneAt:FP.zoneAt,materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
const coverAt=(x,z)=>{const p=point(x,z);return resolveCover(coverPlan,p.x+.5,p.y+.5);};

test('optional indoor pack starts without invisible new stock or partitions',()=>{
  const ids=new Set(GLASS_COURT_PROPS.map(p=>p.id));
  assert.equal(PROPS.renderInstances({inscriptions:false}).some(p=>ids.has(p.id)),false,
    'an old or incomplete pack cannot render stale court meshes at the indoor origin');
  assert.equal(clear(76.25,28.75),true,'base pool remains playable while the optional pack is absent');
  assert.equal(PROPS.tallBlockingPropAt(...Object.values(point(76.25,28.75))),false);
  assert.equal(coverAt(76.25,29.35),null);
  assert.equal(clear(90.75,32.25),true,'missing glass does not leave its physical wall behind');
  PROPS.setColliderGroupEnabled('glass-court',true);
  assert.equal(clear(76.25,28.75),false);
  assert.equal(clear(90.75,32.25),false);
});

test('the street profile, rain mix and original bin/bollard placements are restored',()=>{
  const rows=buildExteriorDistrictRows(),routes=[...DISTRICT_STREETS,...DISTRICT_COURTS];
  const inside=(v,a,b)=>v>=a&&v<=b;
  const oldGlyph=(r,x,z)=>{const edge=r.axis==='horizontal'?Math.min(z-r.y0,r.y1-z):Math.min(x-r.x0,r.x1-x);return edge<=1?'p':edge===2||edge===3?'s':'e';};
  for(let z=DISTRICT_BOUNDS.y0;z<=DISTRICT_BOUNDS.y1;z++)for(let x=DISTRICT_BOUNDS.x0;x<=DISTRICT_BOUNDS.x1;x++){
    const glyphs=routes.filter(r=>inside(x,r.x0,r.x1)&&inside(z,r.y0,r.y1)).map(r=>oldGlyph(r,x,z));
    const expected=glyphs.includes('e')?'e':glyphs.includes('s')?'s':glyphs.length?'p':' ';
    assert.equal(rows[z-DISTRICT_BOUNDS.y0][x-DISTRICT_BOUNDS.x0]||' ',expected);
  }
  assert.deepEqual(exteriorRainMaterialMixAt(155,16),{slate:.20,glass:.28,foliage:.10,steel:.58});
  const rendered=PROPS.renderInstances({inscriptions:false});
  for(const[id,x,z,yaw]of[['district-east-workshop-bins',159,14,-Math.PI/2],['district-east-court-bollards',144,16,Math.PI/2]]){
    const p=rendered.find(p=>p.id===id);assert.deepEqual([p.x,p.z,p.yaw],[x,z,yaw]);
  }
});

test('real partition pieces retain both door apertures and at least 2.5m physical walking space',()=>{
  assert.deepEqual(C.origin,{x:71,z:28});assert.equal(C.floor,0);
  assert.deepEqual(glassCourtLogicalAt(94,30),{x:94,y:30});
  assert.ok(C.clearFaces.z1-C.clearFaces.z0>=C.minimumLaneWidth);
  assert.deepEqual(C.bodyLane,{z0:1.35,z1:3.60});
  const bodies=GLASS_COURT_COLLIDERS;
  assert.ok(bodies.every(c=>c.colliderGroup==='glass-court'));
  for(const c of GLASS_COURT_PHYSICAL_COLLIDERS){
    const body=bodies.find(b=>b.id===`glass-court:${c.id}`);
    assert.equal(body.width,c.width+.4);assert.equal(body.depth,c.depth+.4);
    assert.equal(body.bodyMargin,.2);assert.ok(Math.abs(body.maxElevation-body.minElevation-c.height)<1e-9);
    assert.ok(c.depth<=1.1||c.width<=.12||c.role==='rehosted attendant counter','no room-sized collision box');
  }
  for(const z of[29.35,29.75,30.25,30.5,31.25,31.60])for(let x=74.25;x<=90.75;x+=.5)
    assert.equal(clear(x,z),true,`actual padded player can walk at ${x},${z}`);
  const a=point(90.75,31.75),b=point(90.75,32.25);
  assert.equal(FP.canStep(a.x,a.y,b.x,b.y,{keys:new Set()}).ok,true,'transparent partition has no opaque grid wall behind it');
  assert.equal(PROPS.propCanOccupy(b.x,b.y,{from:a}),false,'the actual thin glass still stops the body');
});

test('all six meshes share the indoor drawn-floor datum and starting blocks remain supported beyond the partition',()=>{
  const hosts=PROPS.renderInstances({inscriptions:false});
  assert.equal(GLASS_COURT_PROPS.length,6);
  for(const p of GLASS_COURT_PROPS){
    const h=hosts.find(h=>h.id===p.id);assert.ok(h);
    assert.deepEqual([h.x,h.z],[71,28]);assert.ok(Math.abs(h.y-FP.decodeH(FP.encodeH(0)))<1e-10);
    assert.equal(p.blocks,false);
  }
  for(let i=1;i<=5;i++){
    const h=hosts.find(h=>h.id===`pool-start-${i}`),bounds=PROP_BOUNDS.pool_start_block;
    assert.ok(h);const z0=h.z-bounds.max[2],z1=h.z-bounds.min[2];
    assert.ok(z0>32.06&&z1<33,'complete starting block remains between separator and basin');
    for(const x of[h.x+bounds.min[0],h.x+bounds.max[0]])for(const z of[z0,z1]){
      const p=point(x,z);assert.equal(FP.isSolid(p.x,p.y),false);assert.ok(Math.abs(FP.floorAt(p.x,p.y))<1e-8);
    }
  }
});

test('solid planting supplies cover and an overlapping old save walks outward without granting new entry',()=>{
  assert.ok(coverAt(76.25,29.35),'the solid trough, not leaves alone, supplies ordinary cover');
  assert.equal(coverAt(88.25,31.60),null,'clear glass stops bodies without supplying opaque concealment');
  let restored=point(76.25,28.75);assert.equal(PROPS.propCanOccupy(restored.x,restored.y),false);
  for(const z of[29.25,29.75]){
    const to=point(76.25,z);assert.equal(PROPS.propCanOccupy(to.x,to.y,{from:restored}),true);restored=to;
  }
  const outside=point(76.25,29.75),inside=point(76.25,29.25);
  assert.equal(PROPS.propCanOccupy(inside.x,inside.y,{from:outside}),false);
});

test('rules and first aid keep their IDs and content on the actual changing north wall',()=>{
  const hosts=PROPS.renderInstances({inscriptions:false});
  for(const[id,x,text]of[['pool-entry-rules',95,'Municipal baths rules'],['pool-entry-first-aid',93,'A green first-aid cabinet']]){
    const p=PROPS.propById(id),h=hosts.find(h=>h.id===id),bounds=PROP_BOUNDS[p.mesh];
    assert.ok(p.inspect.first.startsWith(text));assert.deepEqual(p.inspectAt,{x,y:29.6});
    assert.equal(p.wallContact.physical,true);assert.equal(p.wallContact.planeZ,28);
    const frontSign=p.frontAxis==='-z'?-1:1,back=frontSign<0?bounds.max[2]:bounds.min[2];
    assert.ok(Math.abs(h.z+Math.cos(h.yaw)*back*h.scale-28)<1e-8,'back plane is flush to real mesh wall');
    assert.ok(Math.abs(frontSign*Math.cos(h.yaw)-1)<1e-8);
    const body=point(x+.25,30.25),yaw=Math.atan2(p.interactionX-(body.x+.5)*.5,-(p.interactionY-(body.y+.5)*.5));
    assert.equal(PROPS.pickProp(body.x,body.y,0,3.2,{yaw,pitch:0})?.id,id,'existing inspection is reachable from changing floor');
  }
});

test('fluorescents and ventilation-room lights use indoor zones and pack readiness',()=>{
  assert.equal(GLASS_COURT_LIGHTS.length,9);
  for(const a of GLASS_COURT_LIGHTS){
    const light=CONSERVATORY_LIGHTS.find(l=>l.id===a.id);assert.ok(light);
    assert.deepEqual([light.x,light.y,light.z],[a.x,a.y,a.z]);assert.equal(light.powerMode,'always');
    assert.ok([ZONE.glasshouse,ZONE.poolChanging].includes(a.zone));
  }
  const options={origin:{x:85,z:30,y:C.drawnFloor+1.62},slots:64};
  assert.equal(resolveLocalLights({group:'ground',zone:ZONE.glasshouse},options).some(l=>l.id.startsWith('glass-court-')),false);
  const gh=resolveLocalLights({group:'ground',zone:ZONE.glasshouse},{...options,glassCourtReady:true});
  const changing=resolveLocalLights({group:'ground',zone:ZONE.poolChanging},{...options,glassCourtReady:true});
  assert.equal(gh.filter(l=>l.id.startsWith('glass-court-')).length,7);
  assert.equal(changing.filter(l=>l.id.startsWith('glass-court-')).length,2);
});

test('relocated pool washing fixtures attach to their real screen faces and leave the pool approach clear',()=>{
  const hosts=PROPS.renderInstances({inscriptions:false});
  const screen=hosts.find(p=>p.id==='amenity-pool-wash-screens');assert.ok(screen);
  const wash=BUILDING_AMENITY_PROPS.filter(p=>p.id.startsWith('amenity-pool-'));
  assert.equal(wash.length,8,'the existing wash assembly retains every component');
  const backZ=(id)=>{
    const h=hosts.find(p=>p.id===id),b=PROP_BOUNDS[h.mesh];
    return h.z+Math.cos(h.yaw)*b.min[2]*h.scale;
  };
  for(const id of['amenity-pool-washbasin','amenity-pool-mirror-soap','amenity-pool-hooks'])
    assert.ok(Math.abs(backZ(id)-37.93)<.001,`${id} backs onto the existing north screen face`);
  assert.ok(Math.abs(backZ('amenity-pool-shower-1')-38.07)<.001);
  assert.ok(Math.abs(backZ('amenity-pool-shower-2')-39.43)<.001);
  for(const p of wash){assert.ok(p.y>36&&p.y<40,'no wash fixture remains in the greenhouse');}
  for(let z=34.25;z<=42.25;z+=.5)assert.equal(clear(76.25,z),true,'east of the washing bay remains an ordinary deck route');
  // Exercise the real builder. Its wall inputs are world addresses and must
  // be made local against the moved host, rather than applying its move twice.
  const boxes=[];buildBuildingAmenities({mesh:name=>name,materials:[],MAT:{},
    addBox:(mesh,at,size)=>{if(mesh==='amenity_pool_wash_screens')boxes.push({at,size});},
    addBeam(){},addEllipsoid(){},addCylinder(){},addQuad(){}});
  for(const p of POOL_WASH_PARTITIONS){
    assert.ok(boxes.some(b=>Math.abs(b.at[0]+screen.x-p.x)<1e-8&&Math.abs(b.at[2]+screen.z-p.y)<1e-8
      &&b.size[1]===p.height),'the actual emitted screen matches its physical collider');
  }
});

test('fixed greenhouse glazing permits sight but blocks inspecting a pool fixture through it',()=>{
  FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
  const pick=(y,facing,yaw)=>PROPS.pickProp(168,y,facing,2,{yaw,pitch:-.04});
  PROPS.setColliderGroupEnabled('glass-court',false);
  assert.equal(pick(62,2,Math.PI)?.id,'pool-start-3','the original open approach remains the fallback');
  PROPS.setColliderGroupEnabled('glass-court',true);
  assert.equal(pick(62,2,Math.PI),null,'the real thin partition stops a reaching hand');
  assert.equal(pick(66,0,0)?.id,'pool-start-3','the same fixture remains inspectable on the actual pool deck');
});
