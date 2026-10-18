import test from 'node:test';
import assert from 'node:assert/strict';
import {addBourgeoisPubFrontage,buildForegroundShelters,EXTERIOR_FRONTAGE_CONTRACT as contract,
} from '../tools/chunk_surfer/exterior-frontage-geometry.mjs';

function recorder(materials=[]){
  const shapes=[],meshes=[];
  const api={materials,mesh(name){const m={name};meshes.push(m);return m;},
    addBox(owner,...args){shapes.push({owner:owner.name,kind:'box',args});},
    addBeam(owner,...args){shapes.push({owner:owner.name,kind:'beam',args});},
    addCylinder(owner,...args){shapes.push({owner:owner.name,kind:'cylinder',args});},
    addQuad(owner,...args){shapes.push({owner:owner.name,kind:'quad',args});},
  };
  return{api,shapes,meshes};
}
function pointsOf(shape){
  const{kind,args}=shape;
  if(kind==='quad')return args.slice(0,4);
  if(kind==='box'){
    const[c,s]=args,out=[];
    for(const x of[-1,1])for(const y of[-1,1])for(const z of[-1,1])out.push([c[0]+x*s[0]/2,c[1]+y*s[1]/2,c[2]+z*s[2]/2]);
    return out;
  }
  if(kind==='beam'){
    const[a,b,w]=args,out=[];
    for(const p of[a,b])for(const x of[-w/Math.SQRT2,w/Math.SQRT2])
      for(const y of[-w/Math.SQRT2,w/Math.SQRT2])for(const z of[-w/Math.SQRT2,w/Math.SQRT2])out.push([p[0]+x,p[1]+y,p[2]+z]);
    return out;
  }
  const[c,r,h,,sides]=args,out=[];
  for(let i=0;i<sides;i++)for(const y of[-h/2,h/2])out.push([c[0]+Math.cos(i/sides*Math.PI*2)*r,c[1]+y,c[2]+Math.sin(i/sides*Math.PI*2)*r]);
  return out;
}
const boxContains=(shape,p)=>shape.kind==='box'&&p.every((n,i)=>Math.abs(n-shape.args[0][i])<=shape.args[1][i]/2+1e-8);
const upper=(r,suffix)=>r.parts.filter(p=>p.id.startsWith('pub-upper-')&&p.id.endsWith(suffix));
function pubs(){
  const out=recorder(),m=out.api.mesh('district_civic_frontage');
  const reports=[],deedShapes=[];
  for(const z of[-28,-20]){const start=out.shapes.length;reports.push(addBourgeoisPubFrontage(out.api,m,{z,h:12.8,unitW:8,depth:5.4}));deedShapes.push(out.shapes.slice(start));}
  return{...out,reports,deedShapes};
}

test('complete pub deeds keep their original parcels, sign-carrier datums and bounded roof envelope',()=>{
  const out=pubs();
  for(const[index,report]of out.reports.entries()){
    const z=[-28,-20][index],sign=report.parts.find(p=>p.id==='pub-existing-sign-carrier');
    assert.deepEqual(sign.center,[.26,3.65,z]);
    assert.deepEqual(sign.size,[.09,.46,6.9]);
    for(const shape of out.deedShapes[index])for(const[x,y,zz]of pointsOf(shape)){
      assert.ok(Number.isFinite(x+y+zz));
      assert.ok(x>=contract.pub.minimumFaceX&&x<=contract.pub.maximumFaceX,`bounded complete shell x=${x}`);
      assert.ok(y>=0&&y<=16.4,`existing pitched-roof/chimney envelope y=${y}`);
      assert.ok(zz>=z-4.20&&zz<=z+4.20,'original parcel plus at most 200mm sill/coping projection');
    }
    assert.equal(report.fullBuilding,true);
    assert.ok(report.triangles<=contract.maximumPubTriangles);
    assert.ok(report.parts.some(p=>p.id==='pub-real-rear-wall'));
    assert.ok(report.parts.some(p=>p.id==='pub-ground-ceiling'));
    assert.equal(report.parts.filter(p=>p.id.startsWith('pub-solid-roof-gable-')).length,2);
    for(const roof of report.parts.filter(p=>p.id.endsWith('slate-pitch'))){
      const[a,b,c]=roof.points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      assert.ok(u[2]*v[0]-u[0]*v[2]>0,'slate roof normal faces up');
    }
    for(const gable of report.parts.filter(p=>p.id.startsWith('pub-solid-roof-gable-'))){
      const[a,b,c]=gable.points,u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
      const sign=gable.id.endsWith('--1')?-1:1;
      assert.ok((u[0]*v[1]-u[1]*v[0])*sign>0,'gable normals face the outside of the actual roof');
    }
    for(const part of report.parts.filter(p=>['pub-ground-large-cornice','pub-ground-cornice-shadow'].includes(p.id)))
      assert.ok(part.center[1]+part.size[1]/2<4.17,'ground-floor entablature does not occlude the first upper sash');
    assert.equal(report.signFaces.length,1);
    assert.ok(report.signFaces[0].copy.length>4,'fascia has an authored physical lettering job');
  }
  assert.equal(out.reports[1].newMaterials,0,'joined deeds reuse the exact ordinary palette');
});

test('pub doors and glazing are real apertures into a furnished shell, with deep upper reveals',()=>{
  const out=pubs();
  for(const[index,report]of out.reports.entries()){
    const z=[-28,-20][index],shapes=out.deedShapes[index];
    assert.equal(report.staticDoorLeaves,0,'ordinary saved-state doors are the only door leaves');
    assert.equal(report.parts.some(p=>p.id.includes('closed-door-leaf')),false);
    assert.equal(report.parts.filter(p=>/^pub-ground-window-\d-glass$/.test(p.id)).length,0,'no opaque luminous plane hides the room');
    for(const aperture of report.groundApertures){
      const y=aperture.kind==='entry'?1.62:2.20;
      assert.equal(shapes.some(shape=>boxContains(shape,[-.23,y,aperture.z])),false,`${aperture.kind} clears the actual front wall`);
    }
    for(const window of contract.pub.groundWindows){
      assert.ok(report.parts.some(p=>p.id.includes('ground-window')&&p.id.endsWith('-sill')&&Math.abs(p.center[2]-(z+window.z))<1e-8));
    }
    const backs=report.parts.filter(p=>p.id.startsWith('pub-upper-')&&p.id.endsWith('-deep-recess-back'));
    assert.equal(backs.length,6);
    assert.equal(backs.filter(p=>p.material==='warm').length,1);
    for(const back of backs){
      const frame=report.parts.find(p=>p.id===back.id.replace('-deep-recess-back','-sash'));
      assert.ok(frame.center[0]-back.center[0]>.6,'upper sash has actual shadow/reveal depth');
    }
    assert.ok(report.parts.some(p=>p.id.startsWith('pub-lantern-lamp-')));
  }
  assert.ok(out.reports[0].parts.some(p=>p.id==='pub-hanging-lyre-sign'));
});

test('arrival shelter retains its original structural boxes and timetable carrier exactly',()=>{
  const out=recorder(),reports=buildForegroundShelters(out.api),arrival=reports[0];
  const part=id=>arrival.parts.find(p=>p.id===id);
  assert.equal(arrival.owner,'city_bus_shelter');
  assert.deepEqual(part('shelter-base').center,[0,.07,0]);
  assert.deepEqual(part('shelter-base').size,[2.60,.14,4.60]);
  assert.deepEqual(part('shelter-canopy').center,[0,2.56,0]);
  assert.deepEqual(part('shelter-canopy').size,[2.90,.14,5.00]);
  assert.deepEqual(part('shelter-original-tube').size,[2.40,.10,4.20]);
  const posts=arrival.parts.filter(p=>p.id.startsWith('shelter-original-post-'));
  assert.deepEqual(posts.map(p=>p.center),[[-1.20,1.24,-2.20],[-1.20,1.24,2.20],[1.20,1.24,-2.20],[1.20,1.24,2.20]]);
  assert.ok(posts.every(p=>JSON.stringify(p.size)===JSON.stringify([.12,2.48,.12])));
  assert.deepEqual(part('shelter-existing-timetable-carrier').center,[1.28,1.45,-1.20]);
  assert.deepEqual(part('shelter-existing-timetable-carrier').size,[.10,1.30,1.10]);
});

test('both shelter screens contain actual eye-level voids, and compact front has no posts or timetable',()=>{
  const out=recorder(),reports=buildForegroundShelters(out.api);
  for(const[compact,report]of reports.entries()){
    const C=compact?contract.compactShelter:contract.arrivalShelter;
    const shapes=out.shapes.filter(s=>s.owner===report.owner),rear=compact?-.61:-1.22;
    for(const shape of shapes)for(const[x,y,z]of pointsOf(shape)){
      assert.ok(Math.abs(x)<=C.width/2+1e-8);
      assert.ok(Math.abs(z)<=C.length/2+1e-8);
      assert.ok(y>=0&&y<=C.height+1e-8);
    }
    for(const y of[.85,1.25,1.70])for(const z of[-1.45,-.8,.8,1.45])
      assert.equal(shapes.some(s=>boxContains(s,[rear,y,z])),false,'rear sightlines are true gaps through opaque geometry');
    for(const y of[.85,1.25,1.70])for(const x of(compact?[-.35,0,.35]:[-.8,0,.8]))
      assert.equal(shapes.some(s=>boxContains(s,[x,y,2.24])),false,'end panels keep eye-level view through the shelter');
    assert.equal(report.parts.some(p=>p.kind==='box'&&p.size[1]>.10&&p.size[2]>.4&&p.center[1]>.7&&p.center[1]<1.85&&!p.id.includes('timetable')),false,'no tall solid panel returns');
    assert.equal(report.parts.filter(p=>p.id.includes('safety-band')).length,6);
    assert.ok(report.triangles<=contract.maximumShelterTriangles);
    if(compact){
      assert.ok(report.parts.filter(p=>p.id.includes('post')).every(p=>p.center[0]===-.61));
      const timetable=report.parts.find(p=>p.id==='shelter-compact-timetable-case');
      assert.ok(timetable.center[0]+timetable.size[0]/2<0,'compact timetable stays behind the seated eye and front opening');
      assert.equal(timetable.center[2],-1.9);
      assert.equal(report.parts.some(p=>p.id==='shelter-existing-timetable-carrier'),false);
    }
  }
});

test('repeated builds reuse materials and deterministic geometry without introducing transparent materials',()=>{
  const first=pubs(),second=pubs();
  assert.deepEqual(second.shapes,first.shapes);
  assert.deepEqual(second.reports,first.reports);
  assert.deepEqual(second.api.materials,first.api.materials);
  const before=first.api.materials.length,shelters=buildForegroundShelters(first.api);
  assert.equal(first.api.materials.length,before);
  assert.ok(shelters.every(r=>r.newMaterials===0));
  assert.ok(first.api.materials.every(m=>m.alphaMode!=='BLEND'&&!m.pbrMetallicRoughness.baseColorTexture));
  assert.ok(first.api.materials.every(m=>!m.extras),'no new renderer categories or lettering owners');
});
