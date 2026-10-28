import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory,CONSERVATORY_LANDINGS,CONSERVATORY_FLIGHTS} from '../src/data/floorplan/conservatory.js';
import {FACILITY_SPACES} from '../src/data/building-map.js';
import {LANDING_FITTINGS,CORRIDOR_LETTERING_FACES} from '../src/data/corridor-lettering.js';
import {corridorDressing} from '../src/world/corridor-dressing.js';
import {corridorInscriptionsForHosts} from '../src/data/world-inscriptions.js';
import {STAIR_LANDING_SIGN_SITES,STAIR_LANDING_WAITING_SITES} from '../src/data/stair-landing-dressing.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {readFileSync} from 'node:fs';
import * as A from '../tools/chunk_surfer/main-stair-audit.mjs';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
const placed=PROPS.propsInit(FP),hosts=PROPS.renderInstances({inscriptions:false});
const actualHosts=new Map(hosts.map(host=>[host.id,host]));
const generated=corridorDressing(FP,{doors:FP.doorState(),landings:CONSERVATORY_LANDINGS,flights:CONSERVATORY_FLIGHTS});
const expectedHosts=generated.filter(host=>host.mesh==='door_stencil'||Object.keys(LANDING_FITTINGS).some(key=>'landing-'+key.split('/')[1]===host.id));
const inscriptions=corridorInscriptionsForHosts(hosts),rendered=PROPS.renderInstances();
assert.equal(new Set(inscriptions.map(record=>record.id)).size,inscriptions.length);
assert.deepEqual(new Set(inscriptions.map(record=>record.hostId)),new Set(expectedHosts.map(host=>host.id)),
  'Only existing generated room plates and the four authored landing fittings receive copy');
assert.equal(inscriptions.filter(record=>record.provenance.kind==='landing').length,4);
assert.deepEqual(corridorInscriptionsForHosts([]),[]);
assert.deepEqual(corridorInscriptionsForHosts([{id:'plate-never-named',mesh:'door_stencil'}]),[]);
assert.deepEqual(corridorInscriptionsForHosts([{id:'plate-practice-west-1',mesh:'replacement-host'}]),[]);
for(const record of inscriptions){
  const host=actualHosts.get(record.hostId),placement=placed.find(p=>p.id===record.hostId);
  assert.ok(host&&placement,record.id+' requires a real surviving host');
  assert.equal(record.hostMesh,host.mesh);assert.equal(placement.frontAxis,'-z');
  assert.deepEqual(record.readerRight,[-1,0,0]);assert.deepEqual(record.up,[0,1,0]);
  assert.ok(Math.abs(Math.sin(host.yaw)-placement.wallContact.nx)<1e-9&&
    Math.abs(-Math.cos(host.yaw)-placement.wallContact.ny)<1e-9,record.id+' manufactured face points into the corridor');
  assert.equal(record.lines.join('').replace(/\s/g,''),record.copy.replace(/\s/g,''),'Line fitting must preserve all copy');
  const attached=rendered.filter(p=>p.letteringId===record.id);assert.equal(attached.length,1);
  for(const key of ['x','y','z','yaw','scale','zone','structural'])assert.equal(attached[0][key],host[key],record.id+' changed host '+key);
  if(record.provenance.kind==='corridor-door'){
    const space=FACILITY_SPACES.find(space=>space.doorIds?.includes(record.provenance.doorId));
    assert.equal(record.copy,space.label,'Door aliases must retain the first recorded owner');
    assert.equal(record.provenance.spaceId,space.id);
    assert.ok(record.widthM<=.46&&record.heightM<=.32&&record.center[2]<-.0175,
      'Room copy stays seated on the existing small plate front');
  }else{
    const specification=Object.entries(LANDING_FITTINGS).find(([key])=>'landing-'+key.split('/')[1]===host.id)[1];
    const site=Object.values(STAIR_LANDING_SIGN_SITES).find(site=>site.id===host.id);
    assert.equal(record.copy,specification.label);assert.equal(placement.elevation,1.6);
    assert.equal(placement.wallContact.physical,true,'the storey wall belongs to the physical render slice');
    assert.deepEqual({nx:placement.wallContact.nx,ny:placement.wallContact.ny},{nx:site.normal.x,ny:site.normal.z});
    assert.ok(CORRIDOR_LETTERING_FACES.landing.panelSize[0]<=2.4,'Centered panel must fit between the original lamps');
    assert.equal(record.center[0],0,'Landing name belongs between the lamps, not below the right lamp');
  }
}
// This alias is deliberately not one of the placed plates. The pure label
// resolver still has to obey the same first-owner rule when passed such a host.
assert.equal(corridorInscriptionsForHosts([{id:'plate-b1-lift-hatch',mesh:'door_stencil'}])[0].copy,'STUDIO B1');
assert.equal(corridorInscriptionsForHosts([{id:'plate-practice-east-4',mesh:'door_stencil'}])[0].copy,'PRACTICE ROOM 8');
const hidden=hosts.filter(host=>!host.id.startsWith('plate-')&&!host.id.startsWith('landing-'));
assert.equal(PROPS.attachInscriptions(hidden).filter(p=>p.letteringId&&inscriptions.some(i=>i.id===p.letteringId)).length,0,
  'Hidden or other-floor hosts cannot leave corridor lettering floating behind');

// The known logical landing edges are not masonry. Sample the complete face
// on both sides of its physical plane, at its actual display height.
function occupied(slice,x,y,z){
  const ix=Math.floor(x/.5)-slice.originX,iz=Math.floor(z/.5)-slice.originY;
  if(ix<0||iz<0||ix>=slice.w||iz>=slice.h)return true;
  const i=iz*slice.w+ix;
  return !!(slice.drawnFlags[i]&A.F.SOLID)||y<slice.drawnFloor[i]-.001||y>slice.drawnCeil[i]+.001;
}
const faces=[];
for(const s of Object.values(STAIR_LANDING_SIGN_SITES)){
  const placement=placed.find(p=>p.id===s.id),host=actualHosts.get(s.id),bounds=PROP_BOUNDS[host.mesh];
  assert.ok(Math.abs(host.x-s.physical.x-s.normal.x*bounds.max[2])<1e-8);
  assert.ok(Math.abs(host.z-s.physical.z-s.normal.z*bounds.max[2])<1e-8);
  const anchor=FP.logicalToPhysical(placement.interactionX/.5,placement.interactionY/.5);
  assert.ok(Math.abs(anchor.x*.5-host.x)<1e-8&&Math.abs(anchor.z*.5-host.z)<1e-8,
    'the pick point follows the rendered fitting within its own logical floor');
  for(const distance of [1.5,2]){
    const px=(placement.interactionX+s.normal.x*distance)/.5-.5;
    const py=(placement.interactionY+s.normal.z*distance)/.5-.5;
    assert.equal(FP.isSolid(px,py),false,'the sign is tested from occupied landing floor');
    assert.ok(Math.abs(FP.floorAt(px,py)-s.floor)<1e-5);
    assert.equal(PROPS.propCanOccupy(px,py),true,'the reader can stand in front of the sign');
    assert.equal(PROPS.pickProp(px,py,0,3.2,{yaw:Math.atan2(-s.normal.x,s.normal.z),pitch:0})?.id,s.id,
      'the actual reticle picker selects the sign at its new wall position');
  }
  faces.push({id:s.id,x:s.physical.x,z:s.physical.z,floor:s.floor,normal:s.normal,
    width:3.18,bottom:s.floor+1.3,top:s.floor+1.99,placement});
  for(const group of s.renderGroups){
    const copies=PROPS.renderInstances({group}).filter(p=>p.id===host.id||p.letteringHostId===host.id);
    assert.equal(copies.length,2,'host and existing ink stay together across the open well');
    assert.equal(copies[0].yaw,copies[1].yaw);assert.equal(copies[0].x,copies[1].x);assert.equal(copies[0].z,copies[1].z);
  }
}
const sofaBounds=JSON.parse(readFileSync(new URL('../public/assets/conservatory-acquisitions.stats.json',import.meta.url))).meshes.sofa_01.bounds;
const portraitAtlas=JSON.parse(readFileSync(new URL('../public/assets/portraits/portraits.json',import.meta.url)));
for(const s of STAIR_LANDING_WAITING_SITES){
  const sofa=actualHosts.get(`stair-waiting-${s.id}-sofa`),portrait=actualHosts.get(`stair-waiting-${s.id}-portrait`);
  assert.ok(sofa&&portrait,'all five actual waiting aprons receive the existing pair');
  assert.ok(Math.abs(sofa.x-s.physical.x)<1e-8&&Math.abs(sofa.z-s.physical.z)<1e-8);
  assert.ok(Math.abs(sofa.y-A.drawnHeight(s.floor))<1e-8,'feet meet the rendered floor, including its height quantization');
  assert.ok(portraitAtlas.works.find(work=>work.slot===s.portrait.index&&work.isPublicDomain));
  assert.equal(portrait.portraitIndex,s.portrait.index);
  assert.ok(Math.abs(-Math.sin(portrait.yaw)-s.portrait.normal.x)<1e-8&&Math.abs(Math.cos(portrait.yaw)-s.portrait.normal.z)<1e-8);
  const frame=PROP_BOUNDS.portrait_frame,back=-frame.min[2]*portrait.scale;
  assert.ok(Math.abs(portrait.x-s.portrait.physical.x-s.portrait.normal.x*back)<1e-8);
  assert.ok(Math.abs(portrait.z-s.portrait.physical.z-s.portrait.normal.z*back)<1e-8);
  assert.ok(portrait.y>=s.floor+1.2-1e-8&&portrait.y+frame.max[1]*portrait.scale<=s.floor+2.1);
  faces.push({id:portrait.id,...s.portrait.physical,floor:s.floor,normal:s.portrait.normal,
    width:(frame.max[0]-frame.min[0])*portrait.scale,bottom:portrait.y,top:portrait.y+frame.max[1]*portrait.scale,
    placement:placed.find(p=>p.id===portrait.id)});
  for(let iz=0;iz<=8;iz++)for(let ix=0;ix<=16;ix++){
    const x=sofa.x+sofaBounds.min[0]+(sofaBounds.max[0]-sofaBounds.min[0])*ix/16;
    const z=sofa.z+sofaBounds.min[2]+(sofaBounds.max[2]-sofaBounds.min[2])*iz/8;
    const list=FP.physicalSpanData().cells.get(`${Math.floor(x/.5)},${Math.floor(z/.5)}`)||[];
    assert.ok(list.some(span=>Math.abs(span.floor-s.floor)<1e-5&&span.logicalX>=0&&!FP.isSolid(span.logicalX,span.logicalY)),
      `${s.id} has real flat floor support under its whole sofa at ${x},${z}`);
    assert.equal(A.insideStairwell(x,z),false,'no sofa corner occupies the analytic stair/open well');
  }
  const r=s.clearRoute;assert.ok(Math.min(r.x1-r.x0,r.z1-r.z0)>=1.5);
  for(let z=r.z0;z<r.z1-.001;z+=.25)for(let x=r.x0;x<r.x1-.001;x+=.25){
    const logical=FP.logicalAtPhysical(x/.5,z/.5,{group:s.renderGroups.includes('basement')&&s.floor<0?'basement':s.floor===10?'academic':s.floor>0?'upper':'ground',floor:s.floor});
    assert.ok(logical&&logical.logicalX>=0&&!FP.isSolid(logical.x,logical.y),`${s.id} route has a real occupied-floor projection`);
    assert.equal(PROPS.propCanOccupy(logical.x-.5,logical.y-.5),true,`${s.id} retains its continuous clear route at ${x},${z}`);
  }
}
for(const face of faces){
  const slice=A.observerSlice(face.placement.rx,face.placement.ry);
  for(let u=0;u<=12;u++)for(let v=0;v<=6;v++){
    const x=face.x+face.width*(u/12-.5),y=face.bottom+(face.top-face.bottom)*v/6;
    assert.equal(occupied(slice,x-face.normal.x*.02,y,face.z-face.normal.z*.02),true,face.id+' full physical backing');
    assert.equal(occupied(slice,x+face.normal.x*.02,y,face.z+face.normal.z*.02),false,face.id+' entire face is exposed to its occupied storey');
  }
}
console.log(JSON.stringify({kind:'corridor-lettering',surfaces:inscriptions.length,ids:inscriptions.map(record=>record.id),
  exactFirstOwnerCopy:true,negativeZFront:true,hostTransformPreserved:true,ghostLabels:false}));
