import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as PROPS from '../src/game/props.js';
import {WORLD_INSCRIPTIONS} from '../src/data/world-inscriptions.js';
import {PUB_PHYSICAL_COLLIDERS} from '../src/data/exterior-pub.js';
import {wallContactAt} from '../src/world/wall-contact.js';
import {institutionPoster} from '../src/data/institution-posters.js';
import {BUILDING_WINDOWS} from '../src/data/building-windows.js';
import {applyInstitutionPosters,INSTITUTION_POSTER_SITES,
  INSTITUTION_POSTER_HOST_CORRECTIONS,INSTITUTION_POSTER_CAPTURE_POINTS} from '../src/data/institution-poster-sites.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);
const normal=yaw=>[-Math.sin(yaw),0,Math.cos(yaw)];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const close=(a,b,why)=>assert.ok(Math.abs(a-b)<1e-6,`${why}: ${a} != ${b}`);
const packedBytes=fs.readFileSync('public/assets/conservatory-props.glb');
const jsonLength=packedBytes.readUInt32LE(12),packed=JSON.parse(packedBytes.subarray(20,20+jsonLength));
const packedBin=packedBytes.subarray(28+jsonLength);
const attribute=index=>{
  const a=packed.accessors[index],v=packed.bufferViews[a.bufferView],n={SCALAR:1,VEC3:3}[a.type];
  const bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],stride=v.byteStride||n*bytes;
  const at=(v.byteOffset||0)+(a.byteOffset||0),read=a.componentType===5126?'readFloatLE':a.componentType===5125?'readUInt32LE':a.componentType===5123?'readUInt16LE':'readUInt8';
  return Array.from({length:a.count*n},(_,i)=>packedBin[read](at+Math.floor(i/n)*stride+i%n*bytes));
};
const transform=(host,point)=>{
  const scale=host.scale||1,c=Math.cos(host.yaw||0),s=Math.sin(host.yaw||0);
  const x=point[0]*scale*(host.scaleX??1),y=point[1]*scale*(host.scaleY??1),z=point[2]*scale*(host.scaleZ??1);
  return [host.x+c*x-s*z,(host.y||0)+y,host.z+s*x+c*z];
};
const meshTriangles=host=>{
  const mesh=packed.meshes.find(m=>m.name===host.mesh);assert.ok(mesh,`${host.mesh} exists in the actual generated pack`);
  return mesh.primitives.flatMap(primitive=>{
    const p=attribute(primitive.attributes.POSITION),ix=primitive.indices==null?Array.from({length:p.length/3},(_,i)=>i):attribute(primitive.indices),out=[];
    for(let i=0;i<ix.length;i+=3)out.push({points:ix.slice(i,i+3).map(j=>transform(host,p.slice(j*3,j*3+3))),material:packed.materials[primitive.material]?.name||''});
    return out;
  });
};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const segmentHits=(from,to,triangle)=>{
  const [a,b,c]=triangle.points,d=sub(to,from),e1=sub(b,a),e2=sub(c,a),p=cross(d,e2),det=dot(e1,p);
  if(Math.abs(det)<1e-10)return false;
  const inv=1/det,t=sub(from,a),u=dot(t,p)*inv;if(u<0||u>1)return false;
  const q=cross(t,e1),v=dot(d,q)*inv;if(v<0||u+v>1)return false;
  const distance=dot(e2,q)*inv;return distance>1e-5&&distance<1-1e-5;
};
const blockedSamples=(instance,design,eye,triangles)=>{
  const art=institutionPoster(design),width=art.widthM*instance.scale,height=art.heightM*instance.scale;
  let blocked=0;
  for(let row=0;row<5;row++)for(let column=0;column<11;column++){
    const x=(column/10-.5)*width*.9,y=(row/4-.5)*height*.9;
    const target=[instance.x+Math.cos(instance.yaw)*x,instance.y+y,instance.z+Math.sin(instance.yaw)*x];
    if(triangles.some(triangle=>segmentHits(eye,target,triangle)))blocked++;
  }
  return blocked;
};

test('fifteen publicity designs are fitted without replacing literal records or portraits',()=>{
  assert.equal(INSTITUTION_POSTER_SITES.length,15);
  assert.equal(new Set(INSTITUTION_POSTER_SITES.map(s=>s.design)).size,15);
  const original=PROPS.renderInstances({group:'ground',inscriptions:true});
  const before=structuredClone(original),after=applyInstitutionPosters(original,{group:'ground'});
  assert.deepEqual(original,before,'render decoration must not mutate authored props or collision');
  assert.deepEqual(applyInstitutionPosters(after,{group:'ground'}),after,
    'a refresh of an already decorated host list must not duplicate paper or holders');
  const existingIds=new Set(before.map(p=>p.id));
  assert.deepEqual(new Set(after.filter(p=>existingIds.has(p.id)).map(p=>p.id)),existingIds);
  for(const id of ['foyer-portrait-titian','foyer-portrait-greco','atrium-public-directory','foh-price-list','box-office-ledger']){
    assert.deepEqual(after.find(p=>p.id===id),before.find(p=>p.id===id),`${id} stays intact`);
  }
  const literateHosts=new Set(WORLD_INSCRIPTIONS.map(i=>i.hostId));
  assert.ok(INSTITUTION_POSTER_SITES.filter(s=>s.hostId).every(s=>!literateHosts.has(s.hostId)),
    'programme artwork must never obscure a retained clue, directory or record');
  assert.deepEqual(Object.keys(INSTITUTION_POSTER_HOST_CORRECTIONS).sort(),
    ['hall-entrance-program-north','hall-entrance-program-south']);
});

test('retained holders contain the complete print and face the ordinary public approach',()=>{
  const after=applyInstitutionPosters(PROPS.renderInstances({group:'ground',inscriptions:false}),{group:'ground'});
  for(const site of INSTITUTION_POSTER_SITES.filter(s=>s.hostId)){
    const p=after.find(p=>p.id===`institution-poster:${site.id}`),art=institutionPoster(site.design);
    assert.ok(p,`${site.id} is actually attached to its live host`);
    const width=art.widthM*p.scale,height=art.heightM*p.scale;
    const host=after.find(p=>p.id===site.hostId),hostScale=host.scale||1;
    assert.ok(width<site.aperture.widthM*hostScale&&height<site.aperture.heightM*hostScale,`${site.id} stays inside all four scaled rails`);
    const toEye=site.observer.position.map((v,i)=>v-[p.x,p.y,p.z][i]);
    assert.ok(dot(normal(p.yaw),toEye)>1.0,`${site.id} front winding faces its public observer`);
    if(site.id==='hall-season')close(host.x+.030*hostScale,97,'north case backing meets the actual east wall');
    if(site.id==='hall-winter')close(host.z+.030*hostScale,27,'south case backing meets the actual south wall');
  }
});

test('every loose paper is supported by the compiled wall or the existing physical pub wall',()=>{
  const plan={size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,
    materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
  for(const site of INSTITUTION_POSTER_SITES.filter(s=>s.support)){
    const [x,y]=site.support.logicalAnchor,rx=Math.round(x*2),ry=Math.round(y*2);
    if(site.support.windowId){
      const window=BUILDING_WINDOWS.find(w=>w.id===site.support.windowId);
      const windowHost=PROPS.renderInstances({group:'ground',inscriptions:false}).find(p=>p.id===`building-window-unit-${window.id}`);
      const glass=meshTriangles(windowHost).filter(t=>t.material==='window clear pane edge').flatMap(t=>t.points.map(p=>p[2]));
      close((Math.min(...glass)+Math.max(...glass))/2,site.support.plane,'paper is supported by the actual inset glazing, not empty reveal air');
      const art=institutionPoster(site.design),height=art.heightM*site.widthM/art.widthM;
      assert.ok(site.position[1]-height/2>window.sill+.07&&site.position[1]+height/2<(window.sill+window.head)/2-.05,
        'the complete paper lies within the lower pane, clear of meeting rails');
    }else if(site.id==='lyric-afterwards'){
      const wall=PUB_PHYSICAL_COLLIDERS.find(c=>c.id==='pub-west-side');
      assert.ok(wall,'the pub has an authoritative physical side wall');
      close(wall.x-wall.width/2,site.support.plane,'paper follows the actual outer masonry face');
      assert.ok(site.position[2]>wall.z-wall.depth/2&&site.position[2]<wall.z+wall.depth/2);
    }else{
      assert.equal(FP.isSolid(rx,ry),false,`${site.id} anchor is not embedded`);
      const n=site.support.normal;
      const contact=wallContactAt(plan,rx+.5,ry+.5,{prefer:{nx:n[0],ny:n[2]}});
      assert.ok(contact,`${site.id} has an actual room-facing wall`);
      const at=FP.logicalToPhysical(rx,ry);
      const physicalPlane=site.support.axis==='x'?
        contact.planeX/2+(at.x-rx)/2:contact.planeY/2+(at.z-ry)/2;
      close(physicalPlane,site.support.plane,`${site.id} physical/logical wall agreement`);
    }
    const axis=site.support.axis==='x'?0:2;
    const gap=(site.position[axis]-site.support.plane)*site.support.normal[axis];
    close(gap,site.kind==='new-case'?.002:.006,`${site.id} mounted clearance`);
    assert.ok(dot(normal(site.yaw),site.support.normal)>.99999,`${site.id} paper faces out from its wall`);
  }
});

test('actual packed honours boards, reading-list frame and portal returns reject the former mounts and clear the final prints',()=>{
  const groundHosts=PROPS.renderInstances({group:'ground',inscriptions:false});
  const academicHosts=PROPS.renderInstances({group:'academic',inscriptions:false});
  const honour=meshTriangles(groundHosts.find(p=>p.id==='atrium-public-fittings'));
  const portal=meshTriangles(groundHosts.find(p=>p.id==='hall-entrance-portal'));
  const readingHost=academicHosts.find(p=>p.id==='corridor-fixture-academic-y21-516');
  const reading=meshTriangles(readingHost);
  const final=[...applyInstitutionPosters(groundHosts,{group:'ground'}),...applyInstitutionPosters(academicHosts,{group:'academic'})];
  const old=[
    {id:'atrium-student-notice',design:'students',x:96.994,y:1.66,z:14.2,yaw:Math.PI/2,scale:.5,eye:[94.9,1.62,14.2],triangles:honour},
    {id:'hall-prepared-piano-case',design:'prepared',x:96.9789090909,y:1.78,z:20.2,yaw:Math.PI/2,scale:.420/.594,eye:[94.5,1.62,20.2],triangles:honour},
    {id:'academic-composers',design:'new_works',x:60.994,y:11.75,z:18,yaw:Math.PI/2,scale:.420/.594,eye:[58.7,11.62,18],triangles:reading},
    {id:'hall-season',design:'season',x:96.9238,y:1.67,z:23.2,yaw:Math.PI/2,scale:1,eye:[94.4,1.62,23.2],triangles:[...portal,...honour]},
    {id:'hall-winter',design:'winter_programme',x:96.9238,y:1.67,z:26.3,yaw:Math.PI/2,scale:1,eye:[94.4,1.62,26.3],triangles:[...portal,...honour]},
  ];
  for(const failure of old){
    assert.ok(blockedSamples(failure,failure.design,failure.eye,failure.triangles)>0,
      `${failure.id}: packed geometry reproduces the actual former obstruction`);
    const site=INSTITUTION_POSTER_SITES.find(s=>s.id===failure.id),print=final.find(p=>p.id===`institution-poster:${site.id}`);
    assert.equal(blockedSamples(print,site.design,site.observer.position,failure.triangles),0,
      `${site.id}: all 55 printed-area sightlines clear the actual former occluders`);
  }
  assert.deepEqual(PROPS.propById(readingHost.id).inspect,{
    first:'A reading list for the vocal studies course, photocopied until the lower third went to grey.',
    again:'Someone has written a title in the margin that is not on the list.',
  },'new publicity leaves the retained reading-list record and its inspection untouched');
});

test('the visible north programme case retains a reachable inspection in the actual look cone',()=>{
  const site=INSTITUTION_POSTER_SITES.find(s=>s.id==='hall-season'),[x,eye,z]=site.observer.position;
  const at={x:x/.5-.5,y:z/.5-.5};
  assert.equal(FP.isSolid(Math.floor(at.x),Math.floor(at.y)),false,'the final public viewing position is walkable');
  const picked=PROPS.pickProp(at.x,at.y,1,2,{yaw:site.observer.yaw,pitch:site.observer.pitch,eyeHeight:eye});
  assert.equal(picked?.id,'hall-entrance-program-north','looking directly at the corrected case picks its original programme inspection');
  const host=PROPS.propById(picked.id),print=applyInstitutionPosters(PROPS.renderInstances({group:'ground',inscriptions:false}),{group:'ground'})
    .find(p=>p.id==='institution-poster:hall-season');
  assert.ok(Math.hypot(host.interactionX-print.x,host.interactionY-print.z)<.75,'inspection target remains beside the actual printed case');
  assert.equal(PROPS.propById('hall-entrance-program-south').interactive,false,'the moved south holder has no orphan interaction target');
});

test('review eyes have actual walkable body support and the student notice clears the real fountain body',()=>{
  for(const shot of INSTITUTION_POSTER_CAPTURE_POINTS){
    const [x,eye,z]=shot.position;
    const point=FP.logicalAtPhysical(x/.5-.5,z/.5-.5,{group:shot.group,floor:eye-1.62});
    assert.ok(point,`${shot.id} has a logical owner for its physical floor`);
    assert.equal(FP.isSolid(point.x,point.y),false,`${shot.id} observer is outside masonry`);
    assert.equal(PROPS.propCanOccupy(point.x,point.y),true,`${shot.id} observer capsule clears real blocking props and structural colliders`);
  }
  const site=INSTITUTION_POSTER_SITES.find(s=>s.id==='atrium-student-notice'),art=institutionPoster(site.design);
  const fountain=PROPS.structuralColliders().find(c=>c.id==='amenity-drinking-fountain-body');
  assert.ok(fountain,'the existing fountain retains its authoritative physical collider');
  assert.ok(site.position[1]-art.heightM*site.widthM/art.widthM/2>fountain.maxElevation+.15,
    'the complete sheet stays above the fountain with visible fixing clearance');
  const [x,,z]=site.observer.position;
  assert.ok(x<fountain.x-fountain.width/2-.25&&Math.abs(z-fountain.y)<1e-6,
    'the eye/body approach is centred on the bay and clears the fountain by more than a capsule radius');
});

test('upper posters and outside publicity retain their separate physical floors and render groups',()=>{
  const upper=applyInstitutionPosters([],{group:'upper'});
  assert.deepEqual(upper.map(p=>p.posterSiteId).sort(),['chapel-recital','practice-chamber']);
  assert.ok(upper.every(p=>p.y>6&&p.y<7&&p.blocks===false&&p.interactive===false));
  const academic=applyInstitutionPosters([],{group:'academic'});
  assert.deepEqual(academic.map(p=>p.posterSiteId),['academic-composers']);
  assert.ok(academic.every(p=>p.y>11&&p.y<12));
  const basement=applyInstitutionPosters([],{group:'basement'});
  assert.equal(basement.length,4,'one case and three prints make a single recording-room cluster');
  assert.ok(basement.every(p=>p.y>-3&&p.y<-2));
  const ground=applyInstitutionPosters([],{group:'ground'});
  assert.equal(ground.length,8,'outside and prepared-piano cases have separate paper, with four ground papers');
  assert.equal(INSTITUTION_POSTER_CAPTURE_POINTS.length,15);
  assert.ok(INSTITUTION_POSTER_CAPTURE_POINTS.every(p=>p.position.every(Number.isFinite)&&Number.isFinite(p.yaw)));
});

test('scaled cases retain their actual aperture and the recording cluster leaves its doorway clear',()=>{
  for(const site of INSTITUTION_POSTER_SITES.filter(s=>s.kind==='new-case')){
    const art=institutionPoster(site.design),height=art.heightM*site.widthM/art.widthM;
    assert.ok(site.widthM<site.aperture.widthM&&height<site.aperture.heightM,`${site.id} print fits its scaled case`);
    const instances=applyInstitutionPosters([],{group:site.groups[0]}),carrier=instances.find(p=>p.id===`institution-poster:${site.id}:case`);
    close(carrier.scale,site.caseScale||1,`${site.id} frame scale`);
  }
  const cluster=INSTITUTION_POSTER_SITES.filter(s=>s.id.startsWith('b3-')).sort((a,b)=>a.position[0]-b.position[0]);
  assert.equal(cluster.length,3);
  let previousEdge=16;
  for(const site of cluster){
    const width=site.kind==='new-case'?.69*site.caseScale:site.widthM;
    const left=site.position[0]-width/2,right=site.position[0]+width/2;
    assert.ok(left>previousEdge+.15,`${site.id} has a clear fixing gap and stays east of the studio doorway`);
    assert.ok(right<23,'the cluster stops before the equipment rack');previousEdge=right;
  }
});
