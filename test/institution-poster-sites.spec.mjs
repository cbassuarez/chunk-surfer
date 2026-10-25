import assert from 'node:assert/strict';
import test from 'node:test';
import * as FP from '../src/world/floorplan.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as PROPS from '../src/game/props.js';
import {WORLD_INSCRIPTIONS} from '../src/data/world-inscriptions.js';
import {PUB_PHYSICAL_COLLIDERS} from '../src/data/exterior-pub.js';
import {wallContactAt} from '../src/world/wall-contact.js';
import {institutionPoster} from '../src/data/institution-posters.js';
import {applyInstitutionPosters,INSTITUTION_POSTER_SITES,
  INSTITUTION_POSTER_HOST_CORRECTIONS,INSTITUTION_POSTER_CAPTURE_POINTS} from '../src/data/institution-poster-sites.js';

FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors||[],
  edgePortals:conservatory.edgePortals||[],doors:conservatory.doors||[]});
PROPS.propsInit(FP);
const normal=yaw=>[-Math.sin(yaw),0,Math.cos(yaw)];
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const close=(a,b,why)=>assert.ok(Math.abs(a-b)<1e-6,`${why}: ${a} != ${b}`);

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
    assert.ok(width<site.aperture.widthM&&height<site.aperture.heightM,`${site.id} stays inside all four rails`);
    const toEye=site.observer.position.map((v,i)=>v-[p.x,p.y,p.z][i]);
    assert.ok(dot(normal(p.yaw),toEye)>1.5,`${site.id} front winding faces its public observer`);
    if(site.id.startsWith('hall-')){
      close(p.x,96.9238,'hall paper sits out from wall');
      const host=after.find(p=>p.id===site.hostId);
      close(host.x+.030,97,'case backing meets the actual wall');
    }
  }
});

test('every loose paper is supported by the compiled wall or the existing physical pub wall',()=>{
  const plan={size:FP.planSize,isSolid:FP.isSolid,floorAt:FP.floorAt,zoneAt:FP.zoneAt,
    materialAt:FP.materialAt,doorAt:FP.doorAt,logicalToPhysical:FP.logicalToPhysical};
  for(const site of INSTITUTION_POSTER_SITES.filter(s=>s.support)){
    const [x,y]=site.support.logicalAnchor,rx=Math.round(x*2),ry=Math.round(y*2);
    if(site.id==='lyric-afterwards'){
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
