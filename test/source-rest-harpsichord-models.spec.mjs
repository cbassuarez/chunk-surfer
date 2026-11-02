import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_REST_HARPSICHORD,SOURCE_REST_HARPSICHORD_PARTS,sourceRestHarpsichordGeometryLibrary,sourceRestHarpsichordSeatGeometry} from '../src/render/source-rest-harpsichord-models.js';
import {sourceRestHarpsichordBoardWorldToLocal,sourceRestHarpsichordBoardLocalToWorld,sourceRestHarpsichordBoardGeometry} from '../src/render/source-rest-harpsichord-board.js';
import {SOURCE_CONTINUATION,CONTINUATION_CATCH_STAGES,continuationRadialPoint,continuationSupportAt} from '../src/data/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const models=sourceRestHarpsichordGeometryLibrary(),values=Object.values(models),close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const triangles=model=>Array.from({length:model.i.length/3},(_,k)=>model.i.slice(k*3,k*3+3).map(i=>model.p.slice(i*3,i*3+3)));
// Exact separating-axis triangle/box check, rather than a mesh-wide bounds
// test that would mistake the open, raised lid for a solid blocking box.
function hitsBox(tri,min,max){
  const centre=min.map((v,k)=>(v+max[k])/2),half=min.map((v,k)=>(max[k]-v)/2),p=tri.map(v=>v.map((n,k)=>n-centre[k])),
    edges=p.map((v,k)=>p[(k+1)%3].map((n,j)=>n-v[j])),unit=[[1,0,0],[0,1,0],[0,0,1]],axes=[...unit,cross(edges[0],edges[1]),...edges.flatMap(e=>unit.map(a=>cross(e,a)))];
  for(const a of axes){if(dot(a,a)<1e-18)continue;const projection=p.map(v=>dot(v,a)),r=half.reduce((sum,v,k)=>sum+v*Math.abs(a[k]),0);
    if(Math.min(...projection)>=r-1e-8||Math.max(...projection)<=-r+1e-8)return false;
  }return true;
}
const allTriangles=Object.entries(models).flatMap(([name,m])=>triangles(m).map(p=>({name,p})));
function assertClear(local,radius,height,label){
  const min=[local.x-radius,local.y+.0601,local.z-radius],max=[local.x+radius,local.y+height,local.z+radius];
  for(const row of allTriangles)assert.equal(hitsBox(row.p,min,max),false,`${label}: ${row.name} obstructs ${local.x.toFixed(3)},${local.z.toFixed(3)}`);
}
function samplePath(points,step=.15){
  const out=[];for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k],n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/step));
    for(let j=0;j<=n;j++){const t=j/n;out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
  }return out;
}

test('twenty coherent resident-ready batches have finite, closed, nondegenerate geometry and a bounded budget',()=>{
  assert.equal(SOURCE_REST_HARPSICHORD_PARTS.length,20);assert.equal(values.length,20);
  assert.equal(new Set(SOURCE_REST_HARPSICHORD_PARTS.map(p=>p.id)).size,20);
  let total=0;
  for(const part of SOURCE_REST_HARPSICHORD_PARTS){
    const m=models[part.mesh];assert.ok(m);assert.ok(m.p.length>0&&m.i.length>0);assert.equal(m.p.length%3,0);assert.equal(m.i.length%3,0);
    assert.ok(m.p.every(Number.isFinite));assert.ok(m.i.every(i=>Number.isInteger(i)&&i>=0&&i<m.p.length/3));
    assert.deepEqual(m.localOrigin,[0,0,0]);assert.equal(m.casePart,part.casePart);assert.equal(m.reactive,part.reactive);
    assert.ok(['wood','piano-wood','dark-metal','worn-metal','linen','case-lining'].includes(m.material));assert.equal(m.emissive,undefined);
    const edges=new Map();let volume=0;
    for(let k=0;k<m.i.length;k+=3){const ids=m.i.slice(k,k+3),[a,b,c]=ids.map(i=>m.p.slice(i*3,i*3+3)),ab=b.map((v,j)=>v-a[j]),ac=c.map((v,j)=>v-a[j]);
      assert.ok(Math.hypot(...cross(ab,ac))>1e-10,`${part.id} has a degenerate triangle`);volume+=dot(a,cross(b,c))/6;
      for(let j=0;j<3;j++){const key=[ids[j],ids[(j+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok(volume>0,`${part.id} winding is reversed`);assert.ok([...edges.values()].every(n=>n===2),`${part.id} has an unclosed boundary`);
    assert.equal(m.triangles,m.i.length/3);total+=m.triangles;
  }
  assert.ok(total<=SOURCE_REST_HARPSICHORD.triangleBudget);assert.equal(total,14024);
  assert.ok(Object.isFrozen(models));assert.ok(Object.isFrozen(SOURCE_REST_HARPSICHORD_PARTS));
});

test('case anatomy has a straight spine, asymmetrical bent side, narrow tail and a real open broken side',()=>{
  const c=models['rest-harpsichord-case'],o=SOURCE_REST_HARPSICHORD.outline;
  assert.ok(c.bounds.max[0]-c.bounds.min[0]>5.8);assert.ok(c.bounds.max[2]-c.bounds.min[2]>8.8);
  assert.equal(o[0][0],o[1][0]);assert.ok(o[2][0]<o[4][0]&&o[4][0]<o[6][0]);
  const cut=SOURCE_REST_HARPSICHORD.sideBreak;assert.equal(cut.thresholdTop,.055);
  for(const name of['case','lining','beading']){
    const m=models['rest-harpsichord-'+name];
    for(const tri of triangles(m))if(tri.every(p=>p[0]>.1&&p[2]>cut.minZ+.1&&p[2]<cut.maxZ-.1))
      assert.ok(tri.every(p=>p[1]<=.06)||tri.every(p=>p[1]>=1.95),`${name} blocks the human-height authored side opening`);
  }
  assert.equal(SOURCE_REST_HARPSICHORD.supportFloor,false);
});

test('both complete string choirs expose three note registers and survive dither as real ribbons above the listener',()=>{
  const groups=SOURCE_REST_HARPSICHORD_PARTS.filter(p=>p.casePart==='strings');assert.equal(groups.length,6);
  for(const choir of['acoustic','electronic']){
    const parts=groups.filter(p=>p.reactive===choir+'-strings'),strings=parts.flatMap(p=>models[p.mesh].strings);
    assert.deepEqual(parts.map(p=>p.register),['low','mid','high']);assert.equal(strings.length,61);
    assert.deepEqual(strings.map(p=>p.midi),Array.from({length:61},(_,k)=>36+k));
    assert.ok(strings.every(p=>p.width>=.012&&p.end[2]<p.start[2]));
    assert.ok(strings[0].start[2]-strings[0].end[2]>strings.at(-1).start[2]-strings.at(-1).end[2]);
    for(const p of parts){const m=models[p.mesh];assert.ok(m.bounds.min[1]>=2.025);assert.ok(m.bounds.max[1]<=18.1);assert.ok(m.bounds.max[2]<-.35);
      assert.equal(m.architecturalStrings.length,m.strings.length);assert.ok(m.courseWidthMinimum>=.022);
      assert.ok(m.architecturalStrings.filter(course=>course.principal).every(course=>course.width>=.15));}
  }
  assert.notDeepEqual(models['rest-harpsichord-strings-acoustic-mid'].p,models['rest-harpsichord-strings-electronic-mid'].p);
});

test('monumental pitch courses are rooted in actual stage supports and rise across the three-storey void without more draw batches',()=>{
  const groups=SOURCE_REST_HARPSICHORD_PARTS.filter(p=>p.casePart==='strings'),courses=groups.flatMap(part=>models[part.mesh].architecturalStrings);
  assert.equal(courses.length,122);assert.deepEqual(new Set(courses.map(course=>course.support.level)),new Set([0,1,2]));
  assert.equal(courses.filter(course=>course.principal).length,30);
  assert.ok(courses.some(course=>course.end[1]>18));assert.ok(courses.some(course=>Math.hypot(...course.end.map((value,k)=>value-course.start[k]))>25));
  for(const course of courses){
    const foot=sourceRestHarpsichordBoardLocalToWorld({x:course.foot[0],y:course.foot[1],z:course.foot[2]}),support=course.support;
    close(foot.x,support.x);close(foot.y,support.y);close(foot.z,support.z);
    for(const dx of[-support.halfFootprint,support.halfFootprint])for(const dz of[-support.halfFootprint,support.halfFootprint]){
      const actual=continuationSupportAt(foot.x+dx,foot.z+dz,{phase:'catch',chartId:0,feet:foot.y},{minY:foot.y-.001,maxY:foot.y+.001});
      assert.ok(actual,`missing physical bearing for MIDI${course.midi} on ${support.id}`);close(actual.y,foot.y);
    }
  }
});

test('two genuine manuals have continuous naturals and the two/three accidental rhythm in every octave',()=>{
  const natural=models['rest-harpsichord-naturals'].keys,black=models['rest-harpsichord-accidentals'].keys;
  for(const manual of[0,1]){
    const n=natural.filter(k=>k.manual===manual),b=black.filter(k=>k.manual===manual);
    assert.equal(n.length,36);assert.equal(b.length,25);
    for(let octave=0;octave<5;octave++)assert.deepEqual(b.filter(k=>Math.floor(k.afterNatural/7)===octave).map(k=>k.afterNatural%7),[0,1,3,4,5]);
    assert.ok(n.every(k=>k.x0<k.x1&&k.z0<k.z1));
    assert.ok(b.every(k=>k.y0>=n[0].y1&&k.z1<n[0].z1));
  }
  assert.ok(natural.filter(k=>k.manual===1).every(k=>k.y0>natural[0].y1));
  assert.ok(models['rest-harpsichord-accidentals'].bounds.max[1]<1.3,'keys must be visible below the real Return head');
});

test('three raised wooden lid members share one real spine hinge and leave the right-hand sky open',()=>{
  const parts=SOURCE_REST_HARPSICHORD_PARTS.filter(p=>p.casePart==='lid');assert.equal(parts.length,3);
  for(const p of parts){const m=models[p.mesh];assert.equal(p.wear,true);assert.equal(p.assembly,'spine-hinged-lid');
    assert.equal(p.pivot[0],-2.8);assert.equal(p.pivot[1],1.68);assert.equal(m.openAngle,SOURCE_REST_HARPSICHORD.lidAngle);
    assert.ok(m.bounds.max[0]<0);assert.ok(m.bounds.max[1]>3.5);
  }
  const [rear,middle,tail]=parts.map(p=>models[p.mesh]);close(rear.bounds.min[2],middle.bounds.max[2]);close(middle.bounds.min[2],tail.bounds.max[2]);
  assert.equal(models['rest-harpsichord-lid-prop'].attachedTo,'spine-hinged-lid');
  assert.equal(models['rest-harpsichord-rose'].opening,false,'the applied rose cannot promise a hole through real support');
});

test('the seated eye, hands and one-metre rear route have literal triangle clearance',()=>{
  const r=SOURCE_REST_HARPSICHORD.route;
  for(const row of allTriangles){
    assert.equal(hitsBox(row.p,[r.minX,.0601,r.minZ],[r.maxX,r.headClearance,r.maxZ]),false,`${row.name} obstructs the rear route`);
    assert.equal(hitsBox(row.p,[-.10,.94,-.10],[.10,1.14,.10]),false,`${row.name} clips the eye`);
    assert.equal(hitsBox(row.p,[-.40,.45,-.80],[.40,.90,.10]),false,`${row.name} clips the actual near hands`);
  }
});

test('the actual existing entry and return walk never pass through case, lining, keys or beading',()=>{
  const path=[{x:-152.4,z:-92},{x:-159.1,z:-92},continuationRadialPoint(12.3,0)];
  for(let a=0;a<.92;a+=.02)path.push(continuationRadialPoint(12.3,a));
  path.push(continuationRadialPoint(12.3,.92));
  for(const r of[13.02,13.35,14.25,15.15])path.push(continuationRadialPoint(r,.92));
  for(const p of samplePath(path,.20))assertClear(sourceRestHarpsichordBoardWorldToLocal({...p,y:SOURCE_CONTINUATION.catch.top}),SOURCE_CONTINUATION.bodyRadius,SOURCE_CONTINUATION.bodyHeight,'actual upper entry');
  const seat=SOURCE_REST_SEATS[1],stage=CONTINUATION_CATCH_STAGES[seat.level],angle=Math.atan2(seat.z-SOURCE_CONTINUATION.catch.center.z,seat.x-SOURCE_CONTINUATION.catch.center.x),earned=[];
  for(let a=angle-.22;a<=angle+.001;a+=.02)earned.push(continuationRadialPoint(stage.outerRadius-.45,a));
  for(const radius of[stage.outerRadius-.45,11.52,11.85,13.65])earned.push(continuationRadialPoint(radius,angle));
  for(const p of samplePath(earned,.20))assertClear(sourceRestHarpsichordBoardWorldToLocal({...p,y:seat.feet}),SOURCE_CONTINUATION.bodyRadius,SOURCE_CONTINUATION.bodyHeight,'earned refuge approach');
});

test('the real counterweight path and full .72m envelope clear the authored broken side',()=>{
  const path=[SOURCE_CONTINUATION.catch.hoist.start,{x:-164.1968848553,z:-83.9656117819},{x:-165.7296396159,z:-85.5437951819},{x:-164,z:-92},{x:-165.54,z:-92}];
  for(const p of samplePath(path,.20))assertClear(sourceRestHarpsichordBoardWorldToLocal({...p,y:SOURCE_CONTINUATION.catch.top}),SOURCE_CONTINUATION.catch.counterweightRadius,1.451,'actual counterweight');
});

test('the purpose-built case settle keeps all four actual seat contacts, clear eyes and a shared bounded geometry budget',()=>{
  const settle=sourceRestHarpsichordSeatGeometry(),pad=settle.upholstery;
  assert.equal(settle.forward,'+X');assert.equal(settle.retainedScaleZ,.55);assert.equal(settle.seatHeight,.6075);
  assert.equal(settle.material,'wood');assert.equal(pad.material,'linen');assert.equal(pad.seatHeight,.6075);
  assert.ok(settle.bounds.min[0]>=-.36&&settle.bounds.max[0]<=.36);
  assert.ok(settle.bounds.min[2]*.55>=-.89&&settle.bounds.max[2]*.55<=.89);
  assert.ok(settle.diagnostics.instrumentAndSeatTriangles<=16000);
  assert.ok(settle.diagnostics.instrumentAndSeatTriangles+sourceRestHarpsichordBoardGeometry().i.length/3<=16000,
    'the clipped soundboard veneer also fits the unchanged whole-instrument triangle budget');
  const surface=(x,z)=>{
    let top=-Infinity;
    for(const tri of triangles(pad)){
      const[a,b,c]=tri,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(den)<1e-10)continue;
      const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,
        v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den,w=1-u-v;
      if(u>=-1e-8&&v>=-1e-8&&w>=-1e-8)top=Math.max(top,u*a[1]+v*b[1]+w*c[1]);
    }
    return top;
  };
  for(const f of[-.08,.08])for(const r of[-.14,.14])close(surface(f,r/.55),.6075);
  for(const model of[settle,pad]){
    assert.ok(model.p.every(Number.isFinite));assert.ok(model.i.every(index=>index>=0&&index<model.p.length/3));
    for(const tri of triangles(model))assert.equal(hitsBox(tri,[.08,1.23,-.10],[.28,1.33,.10]),false,'no back/arm/pad intersects the actual initial eye');
  }
});
