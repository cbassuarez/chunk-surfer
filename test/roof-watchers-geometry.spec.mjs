import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOF_WATCHERS} from '../src/data/roof-watchers.js';
import {buildRoofGrotesques,ROOF_GROTESQUES,ROOF_FOLIATE_HEAD} from '../tools/chunk_surfer/roof-grotesques.mjs';
import {buildRoofWatchersGeometry} from '../tools/chunk_surfer/roof-watchers-geometry.mjs';
import {buildRoofPalatialStonework} from '../tools/chunk_surfer/roof-palatial-stonework.mjs';

const record=(materials=[{name:'stone'}])=>{
  const meshes=new Map(),api={materials,carvedStone:0,
    mesh(name){const m={name,shapes:[]};meshes.set(name,m);return m;}};
  for(const kind of['Box','Beam','Ellipsoid','Cylinder','Quad'])
    api[`add${kind}`]=(m,...args)=>m.shapes.push({kind,args});
  return{api,meshes};
};
const rotate=(point,at,yaw=at.restYaw)=>{
  const c=Math.cos(yaw),s=Math.sin(yaw),p=at.localPivot;
  return[p[0]+point[0]*c-point[2]*s,p[1]+point[1],p[2]+point[0]*s+point[2]*c];
};
const neutralShape=(shape,at)=>{
  const a=shape.args.map(v=>Array.isArray(v)?[...v]:v),yaw=at.restYaw;
  if(shape.kind==='Quad')for(let i=0;i<4;i++)a[i]=rotate(a[i],at);
  else if(shape.kind==='Beam'){a[0]=rotate(a[0],at);a[1]=rotate(a[1],at);}
  else{
    a[0]=rotate(a[0],at);
    if(shape.kind==='Box')a[3]=(a[3]||0)+yaw;
    else if(shape.kind==='Ellipsoid'&&Math.abs(Math.sin(yaw))>.5)a[1]=[a[1][2],a[1][1],a[1][0]];
  }
  return{kind:shape.kind,args:a};
};
const key=shape=>JSON.stringify(shape,(_k,v)=>typeof v==='number'?Math.round(v*1e11)/1e11:v);
const staticBuild=record(),staticMesh=staticBuild.api.mesh('static');
buildRoofGrotesques({...staticBuild.api,m:staticMesh});
const split=record(),body=split.api.mesh('fixed');
buildRoofGrotesques({...split.api,m:body,splitWatchers:true});
buildRoofWatchersGeometry(split.api);

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l);};
const points=({kind,args:a})=>{
  if(kind==='Quad')return a.slice(0,4);
  if(kind==='Beam'){
    const u=unit(a[1].map((v,i)=>v-a[0][i])),s=unit(cross(u,Math.abs(u[1])<.9?[0,1,0]:[1,0,0])),t=cross(s,u),out=[];
    for(const p of[a[0],a[1]])for(const ds of[-1,1])for(const dt of[-1,1])
      out.push(p.map((v,i)=>v+s[i]*ds*a[2]/2+t[i]*dt*a[2]/2));
    return out;
  }
  const out=[];
  if(kind==='Ellipsoid'){
    for(let iy=0;iy<=a[3];iy++)for(let ix=0;ix<=a[4];ix++){
      const phi=-Math.PI/2+iy/a[3]*Math.PI,theta=ix/a[4]*Math.PI*2;
      out.push([a[0][0]+Math.cos(phi)*Math.cos(theta)*a[1][0],a[0][1]+Math.sin(phi)*a[1][1],
        a[0][2]+Math.cos(phi)*Math.sin(theta)*a[1][2]]);
    }
  }else if(kind==='Box'){
    const yaw=a[3]||0,c=Math.cos(yaw),s=Math.sin(yaw);
    for(const x of[-a[1][0]/2,a[1][0]/2])for(const y of[-a[1][1]/2,a[1][1]/2])for(const z of[-a[1][2]/2,a[1][2]/2])
      out.push([a[0][0]+x*c-z*s,a[0][1]+y,a[0][2]+x*s+z*c]);
  }else throw new Error(`Unexpected moving primitive ${kind}`);
  return out;
};
const bounds=pts=>({lo:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),hi:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i])))});
const overlaps=(a,b)=>[0,1,2].every(i=>a.lo[i]<b.hi[i]-1e-7&&a.hi[i]>b.lo[i]+1e-7);

test('the three pivot meshes reproduce every existing rest carving and add only fixed joint covers',()=>{
  assert.equal(body.extras.roofWatchers,1);
  assert.equal(staticMesh.extras?.roofWatchers,undefined,'old complete packs do not opt into dynamic heads');
  const assembled=[...body.shapes];
  for(const watcher of ROOF_WATCHERS){
    assert.ok(Object.isFrozen(watcher)&&Object.isFrozen(watcher.localPivot));
    const mesh=split.meshes.get(watcher.mesh);assert.ok(mesh&&mesh.shapes.length>5);
    assembled.push(...mesh.shapes.map(s=>neutralShape(s,watcher)));
  }
  const counts=new Map();for(const s of assembled)counts.set(key(s),(counts.get(key(s))||0)+1);
  for(const s of staticMesh.shapes){
    const k=key(s);assert.ok(counts.get(k)>0,`rest geometry retained: ${k}`);counts.set(k,counts.get(k)-1);
  }
  assert.equal([...counts.values()].reduce((a,b)=>a+b,0),3,'only the hound collar, owl collar and foliate boss are new');
  assert.equal(split.api.materials.length,2,'static bodies and separate heads share their original stone and recess materials');
});

test('lion and rook remain byte-for-byte static while watcher anchors follow actual original carvings',()=>{
  for(const flag of[false,true]){
    const r=record(),m=r.api.mesh('unselected');
    buildRoofGrotesques({...r.api,m,placements:ROOF_GROTESQUES.filter(p=>p.kind==='lion'||p.kind==='rook'),foliateHead:null,splitWatchers:flag});
    if(!flag)staticBuild.unselected=m.shapes;else assert.deepEqual(m.shapes,staticBuild.unselected);
  }
  for(const w of ROOF_WATCHERS){
    if(w.kind==='foliate')assert.deepEqual(w.localPivot,[ROOF_FOLIATE_HEAD.x,ROOF_FOLIATE_HEAD.y,ROOF_FOLIATE_HEAD.z]);
    else{
      const original=ROOF_GROTESQUES.find(p=>p.kind===w.kind),anatomical=w.kind==='hound'?[0,.72,.12]:[0,.73,.025];
      const actual=rotate(anatomical,{restYaw:original.yaw,localPivot:[original.x,original.base,original.z]});
      actual.forEach((v,i)=>assert.ok(Math.abs(v-w.localPivot[i])<1e-12));
      assert.equal(w.restYaw,original.yaw);
    }
  }
});

test('actual moving vertices at both limits retain footprint, overhead clearance, faces and the new cornice notch',()=>{
  const palatial=record(),m=palatial.api.mesh('new stone');
  buildRoofPalatialStonework({...palatial.api,m});
  const stoneBounds=palatial.meshes.get('new stone').shapes.map(s=>{
    if(s.kind==='Cylinder')throw Error('unexpected cylinder');return bounds(points(s));
  });
  for(const w of ROOF_WATCHERS)for(const delta of[-w.maxYaw,0,w.maxYaw]){
    const mesh=split.meshes.get(w.mesh),world=mesh.shapes.flatMap(s=>points(s).map(p=>rotate(p,w,w.restYaw+delta))),b=bounds(world);
    assert.ok(b.lo[0]>=-12.04&&b.hi[0]<=12.04&&b.lo[2]>=-13.54&&b.hi[2]<=13.54);
    assert.ok(b.lo[1]>2.75&&b.hi[1]<7,'rotation cannot introduce a walking obstacle or ceiling crossing');
    assert.ok(stoneBounds.every(s=>!overlaps(b,s)),'new cornices and capitals leave the complete swivel envelope clear');
    if(w.kind==='foliate'){
      const eyes=mesh.shapes.filter(s=>s.kind==='Box'&&s.args[2]===1);
      assert.equal(eyes.length,3);
      for(const shape of eyes){
        const face=bounds(points(shape).map(p=>rotate(p,w,w.restYaw+delta)));
        assert.ok(face.lo[0]>-11.035,'eyes and mouth remain in front of the fixed stone boss, not just the old keystone');
      }
    }
  }
});

test('fixed collars enclose a shared solid point of each rotating carving at every allowed yaw',()=>{
  for(const w of ROOF_WATCHERS){
    const mesh=split.meshes.get(w.mesh),head=mesh.shapes.find(s=>s.kind==='Ellipsoid');
    const localPoint=w.kind==='hound'?[0,.04,0]:w.kind==='owl'?[0,-.04,0]:[0,0,0];
    const ell=head.args;
    assert.ok(localPoint.reduce((sum,v,i)=>sum+((v-ell[0][i])/ell[1][i])**2,0)<1,
      'joint witness lies inside the moving stone, not its empty bounding box');
    for(const delta of[-w.maxYaw,0,w.maxYaw]){
      const world=rotate(localPoint,w,w.restYaw+delta);
      const fixed=body.shapes.find(s=>{
        if(w.kind==='hound')return s.kind==='Cylinder'&&Math.abs(s.args[0][0]-w.localPivot[0])<1e-10&&Math.abs(s.args[0][2]-w.localPivot[2])<1e-10;
        return s.kind==='Ellipsoid'&&Math.abs(s.args[0][0]-(w.kind==='foliate'?-11.135:11.475))<1e-10&&
          Math.abs(s.args[0][2]-w.localPivot[2])<1e-10&&s.args[1][1]<.29;
      });
      assert.ok(fixed,'fixed joint-cover geometry exists');
      if(fixed.kind==='Cylinder'){
        assert.ok(Math.hypot(world[0]-fixed.args[0][0],world[2]-fixed.args[0][2])<fixed.args[1]);
        assert.ok(Math.abs(world[1]-fixed.args[0][1])<fixed.args[2]/2);
      }else assert.ok(world.reduce((sum,v,i)=>sum+((v-fixed.args[0][i])/fixed.args[1][i])**2,0)<1,
        'fixed and moving stone overlap through the whole turn without levitation');
    }
  }
});
