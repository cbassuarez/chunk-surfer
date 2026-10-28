// Read the actual installed skins. A placement/culling test cannot show that a
// 64m scenery row has become a wall across the telephone street.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseGlb} from '../tools/chunk_surfer/rebuild-tree-crowns.mjs';
import {extractExteriorCollision} from '../tools/chunk_surfer/build-exterior-collision.mjs';
import {SOURCE_OUTSKIRTS_TOWN as T,SOURCE_OUTSKIRTS_CONTEXT_EXCLUSIONS as EXCLUDED,
  outskirtsTownSet,outskirtsTownPlacement} from '../src/data/source-outskirts-town.js';
import {OUTSKIRT_APRON,OUTSKIRT_STRETCH_START,OUTSKIRT_STRETCH_METRES,outskirtsPassLayout} from '../src/data/source-outskirts-arrival.js';
import {outskirtsCollisionBoxes,OUTSKIRTS_BODY_RADIUS as RADIUS} from '../src/game/outskirts-geometry.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';

const source=outskirtsTownSet();
const architecture=p=>/^(?:district_|yard_.*_range|opening_street_(?:frontage|service_history)|exterior_stationers_room|exterior_garden_hardscape|ellery_west_roofline)/.test(p.mesh);
const previous=[...source,...EXCLUDED.map(id=>({...outskirtsTownPlacement(id),canonicalId:id,context:true,collision:'none'}))];
const names=new Set(previous.filter(architecture).map(p=>p.mesh)),geometry=new Map();
for(const url of T.packs){
  const pack=parseGlb(fs.readFileSync(new URL('../public'+url,import.meta.url)));
  const selected=pack.json.meshes.map(m=>m.name).filter(name=>names.has(name));
  for(const[name,shape]of Object.entries(extractExteriorCollision(pack,selected)))geometry.set(name,shape);
}
const placed=(p,x,z,offset=0)=>{
  x*=(p.scaleX??1)*(p.scale??1);z*=(p.scaleZ??1)*(p.scale??1);
  return{x:p.across+x*Math.cos(p.yaw)+z*Math.sin(p.yaw),z:p.along+offset+x*Math.sin(p.yaw)-z*Math.cos(p.yaw)};
};
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
const pointDistance=(p,a,b)=>{
  const dx=b.x-a.x,dz=b.z-a.z,n=dx*dx+dz*dz,t=n?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/n)):0;
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
};
const intersects=(a,b,c,d)=>{
  if(cross(a,b,c)*cross(a,b,d)>1e-9||cross(c,d,a)*cross(c,d,b)>1e-9)return false;
  return Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x))<=Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))+1e-9
    &&Math.max(Math.min(a.z,b.z),Math.min(c.z,d.z))<=Math.min(Math.max(a.z,b.z),Math.max(c.z,d.z))+1e-9;
};
const segmentDistance=(a,b,c,d)=>intersects(a,b,c,d)?0:Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
function heightClip(vertices,bound,above){
  const out=[];
  for(let i=0;i<vertices.length;i++){
    const a=vertices[i],b=vertices[(i+1)%vertices.length],inside=p=>above?p.y>=bound:p.y<=bound,ia=inside(a),ib=inside(b);
    if(ia)out.push(a);
    if(ia!==ib){const t=(bound-a.y)/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*t,y:bound,z:a.z+(b.z-a.z)*t});}
  }
  return out;
}
function bodySegments(p,offset){
  const data=geometry.get(p.mesh);if(!data)return[];
  const sy=(p.scaleY??1)*(p.scale??1),lo=(.45-p.y)/sy,hi=(1.7-p.y)/sy;
  const segments=data.walls.filter(w=>w[5]>lo&&w[4]<hi).map(w=>[placed(p,w[0],w[1],offset),placed(p,w[2],w[3],offset)]);
  for(const triangle of data.triangles){
    let vertices=[0,3,6].map(i=>({x:triangle[i],y:triangle[i+1],z:triangle[i+2]}));
    vertices=heightClip(heightClip(vertices,lo,true),hi,false);if(vertices.length<2)continue;
    let pair=null,length=0;
    for(const a of vertices)for(const b of vertices){const n=Math.hypot(a.x-b.x,a.z-b.z);if(n>length){length=n;pair=[a,b];}}
    if(pair)segments.push(pair.map(q=>placed(p,q.x,q.z,offset)));
  }
  return segments;
}
const inside=(p,points)=>{
  let positive=false,negative=false;
  for(let i=0;i<points.length;i++){const value=cross(points[i],points[(i+1)%points.length],p);positive||=value>1e-8;negative||=value< -1e-8;}
  return !(positive&&negative);
};
function scene(context,firstPass,count=4){
  const start=firstPass?OUTSKIRT_STRETCH_START+firstPass*OUTSKIRT_STRETCH_METRES:0;
  const end=OUTSKIRT_STRETCH_START+(firstPass+count)*OUTSKIRT_STRETCH_METRES;
  const shapes=[],buckets=new Map(),bucket=4;
  const add=(id,points,filled=false)=>{
    const minX=Math.min(...points.map(p=>p.x))-RADIUS,maxX=Math.max(...points.map(p=>p.x))+RADIUS;
    const minZ=Math.min(...points.map(p=>p.z))-RADIUS,maxZ=Math.max(...points.map(p=>p.z))+RADIUS;
    if(maxX< -11||minX>11||maxZ<start||minZ>end)return;
    const shape={id,points,filled};shapes.push(shape);
    for(let x=Math.floor(minX/bucket);x<=Math.floor(maxX/bucket);x++)for(let z=Math.floor(minZ/bucket);z<=Math.floor(maxZ/bucket);z++){
      const key=`${x},${z}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(shape);
    }
  };
  for(let group=0;group<=Math.ceil(end/T.contextPeriodMetres)+1;group++)for(const p of context){
    if(p.initialOnly&&group!==0)continue;
    const offset=OUTSKIRT_STRETCH_START+group*T.contextPeriodMetres;
    if(architecture(p))for(const segment of bodySegments(p,offset))add(p.canonicalId,segment);
    for(const box of outskirtsCollisionBoxes(p,PROP_BOUNDS[p.mesh])){
      const points=[[box.minX,box.minZ],[box.maxX,box.minZ],[box.maxX,box.maxZ],[box.minX,box.maxZ]].map(([x,z])=>placed(p,x,z,offset));
      add(p.canonicalId,points,true);
    }
  }
  const ordinary=[...(firstPass===0?OUTSKIRT_APRON:[]),...Array.from({length:count},(_,i)=>outskirtsPassLayout(firstPass+i).map(p=>({...p,along:p.along+OUTSKIRT_STRETCH_START+(firstPass+i)*OUTSKIRT_STRETCH_METRES}))).flat()];
  for(const p of ordinary)for(const box of outskirtsCollisionBoxes(p,PROP_BOUNDS[p.mesh])){
    const points=[[box.minX,box.minZ],[box.maxX,box.minZ],[box.maxX,box.maxZ],[box.minX,box.maxZ]].map(([x,z])=>placed(p,x,z));
    add(p.id,points,true);
  }
  const blocks=(a,b=a)=>{
    const seen=new Set();
    for(let x=Math.floor((Math.min(a.x,b.x)-RADIUS)/bucket);x<=Math.floor((Math.max(a.x,b.x)+RADIUS)/bucket);x++)for(let z=Math.floor((Math.min(a.z,b.z)-RADIUS)/bucket);z<=Math.floor((Math.max(a.z,b.z)+RADIUS)/bucket);z++)for(const shape of buckets.get(`${x},${z}`)||[]){
      if(seen.has(shape))continue;seen.add(shape);
      if(shape.filled&&(inside(a,shape.points)||inside(b,shape.points)))return shape.id;
      const count=shape.points.length===2?1:shape.points.length;
      for(let i=0;i<count;i++)if(segmentDistance(a,b,shape.points[i],shape.points[(i+1)%shape.points.length])<=RADIUS+1e-8)return shape.id;
    }
    return null;
  };
  return{start,end,blocks,shapes};
}
function route(layout){
  const grid=.25,nx=89,nz=Math.floor((layout.end-layout.start)/grid)+1,at=(i,j)=>({x:-11+i*grid,z:layout.start+j*grid});
  const first=44,queue=[[first,0]],seen=new Set([first]),parents=new Map();
  assert.equal(layout.blocks(at(first,0)),null,'the real road approach starts clear');
  let found;
  for(let q=0;q<queue.length;q++){
    const[i,j]=queue[q],key=j*nx+i;if(j===nz-1){found=key;break;}
    for(const[di,dj]of[[0,1],[1,0],[-1,0],[0,-1]]){
      const ni=i+di,nj=j+dj,k=nj*nx+ni;if(ni<0||ni>=nx||nj<0||nj>=nz||seen.has(k))continue;
      if(layout.blocks(at(i,j),at(ni,nj)))continue;
      seen.add(k);parents.set(k,key);queue.push([ni,nj]);
    }
  }
  if(found==null)return null;
  const path=[];for(let key=found;key!==undefined;key=parents.get(key))path.push(at(key%nx,Math.floor(key/nx)));
  return path.reverse();
}

test('the two removed backdrop skins actually seal the normal telephone road in the installed pack',()=>{
  assert.deepEqual(EXCLUDED,['district-west-row-a','district-east-row-a']);
  assert.ok(EXCLUDED.every(id=>!source.some(p=>p.canonicalId===id)));
  const before=scene(previous,0);
  assert.equal(before.blocks({x:0,z:29.5}),'district-east-row-a');
  assert.equal(before.blocks({x:0,z:55.5}),'district-west-row-a');
  assert.equal(route(before),null,'old road falsely promises a forward route through a real solid frontage');
});

test('the current road has a continuous swept-body route through actual context and its learned objects',()=>{
  for(const firstPass of[0,4]){
    const current=scene(source,firstPass),path=route(current);
    assert.ok(path,`passes${firstPass}..${firstPass+3}: context still forces clipping or leaves a dead end`);
    assert.ok(path.length>400,'a real ordinary road traverse, not a discontinuous shortcut');
    for(let i=1;i<path.length;i++)assert.equal(current.blocks(path[i-1],path[i]),null);
  }
  for(const id of['district-south-row-a','district-north-row-a','district-west-court-walls','yard-former-stables','opening-street-frontage'])
    assert.ok(source.some(p=>p.canonicalId===id),`${id}: remembered parallel streets and landmarks remain`);
});
