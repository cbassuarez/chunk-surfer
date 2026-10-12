import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOURCE_EXPOSED_STRATA as S, sourceStrataGeometry, sourceStrataSolids,
  sourceStrataCollisionAt as collision, sourceStrataEntryAt as entered,
  sourceStrataBounds, sourceStrataRaycast as ray, sourceStrataNorthClearAt,
} from '../src/data/source-exposed-strata.js';

const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);
const inside=(polygon,x,z)=>{
  const signs=polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0]);}).filter(v=>Math.abs(v)>1e-7);
  return signs.every(v=>v>=0)||signs.every(v=>v<=0);
};

test('finite geological bank leaves the lift and receiving ledge outside its authoring',()=>{
  assert.equal(S.bank.maxX-S.bank.minX,84);
  assert.equal(S.bank.frontZ-S.bank.backZ,16);
  assert.equal(S.bank.floor,4.2);
  assert.equal(S.bank.underside,3.55);
  assert.equal(Math.max(...sourceStrataSolids().map(s=>s.top)),S.bank.top);
  assert.deepEqual(S.opening.slice(0,2),[[6,-390],[14,-390]]);
  assert.deepEqual(S.opening.slice(2),[[22,-396],[2,-396]]);
  for(const piece of sourceStrataGeometry()) {
    assert.ok(piece.maxZ<=-390,`${piece.id} extends into the receiving ledge`);
    assert.ok(piece.minX>=-42&&piece.maxX<=42,`${piece.id} extends beyond the bank`);
    if(piece.kind!=='underbelly')assert.ok(piece.minZ>=-398.4-1e-8,`${piece.id} obstructs the Source forecourt`);
  }
  for(const x of [0,4,8,13])assert.equal(collision(x,-388),null,'receiving ledge remains clear');
});

test('shared hulls are finite closed outward-wound triangles with real material thickness',()=>{
  const geometry=sourceStrataGeometry(),solids=sourceStrataSolids();
  assert.equal(geometry.length,solids.length);
  assert.equal(new Set(geometry.map(p=>p.id)).size,geometry.length);
  assert.ok(new Set(solids.filter(s=>s.kind==='course').map(s=>s.top-s.bottom)).size>=7,'courses must have visibly unequal thickness');
  for(const piece of geometry) {
    assert.ok(Array.isArray(piece.p)&&Array.isArray(piece.i));
    assert.ok(piece.p.every(Number.isFinite));
    assert.ok(piece.minY<piece.maxY);
    assert.ok(piece.grain>0);
    assert.equal(piece.p.length%3,0);assert.equal(piece.i.length%3,0);
    const edges=new Map();let up=0,down=0;
    for(let n=0;n<piece.i.length;n+=3) {
      const ids=piece.i.slice(n,n+3);
      assert.ok(ids.every(id=>Number.isInteger(id)&&id>=0&&id<piece.p.length/3));
      const [a,b,c]=ids.map(id=>piece.p.slice(id*3,id*3+3));
      const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      assert.ok(Math.hypot(...normal)>1e-7,`degenerate ${piece.id}`);
      if(normal[1]>1e-7){up++;assert.ok(a[1]===piece.maxY&&b[1]===piece.maxY&&c[1]===piece.maxY,`inverted bottom ${piece.id}`);}
      if(normal[1]<-1e-7){down++;assert.ok(a[1]===piece.minY&&b[1]===piece.minY&&c[1]===piece.minY,`inverted top ${piece.id}`);}
      for(let edge=0;edge<3;edge++){const key=[ids[edge],ids[(edge+1)%3]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.ok(up&&down,`missing cap ${piece.id}`);
    assert.ok([...edges.values()].every(n=>n===2),`open hull ${piece.id}`);
  }
});

test('upper courses and broken crowns have physical bearing on a lower solid',()=>{
  const solids=sourceStrataSolids();
  for(const s of solids.filter(s=>s.kind!=='underbelly')) {
    const below=solids.filter(b=>Math.abs(b.top-s.bottom)<1e-7);
    assert.ok(below.length,`unsupported height ${s.id}`);
    // Sample vertices and the actual perimeter between them: a bounding box
    // overlap alone would accept floating tips and broken unsupported crowns.
    for(let n=0;n<s.polygon.length;n++) {
      const a=s.polygon[n],b=s.polygon[(n+1)%s.polygon.length];
      for(let k=0;k<=5;k++) {
        const t=k/5,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
        assert.ok(below.some(p=>inside(p.polygon,x,z)),`unsupported ${s.id} at ${x},${z}`);
      }
    }
  }
});

test('the real capsule follows the one broad open-sky turn in both directions',()=>{
  const routes=[S.entryWalk,[...S.entryWalk].reverse()];
  for(const route of routes)for(let n=1;n<route.length;n++) {
    const a=route[n-1],b=route[n],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.07);
    for(let step=0;step<=steps;step++) {
      const t=step/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
      assert.equal(collision(x,z,{feet:4.2,height:1.8,radius:.22}),null,`${a.id} → ${b.id} at ${x},${z}`);
      assert.equal(ray([x,6,z],[0,1,0]),null,`ceiling above authored route at ${x},${z}`);
    }
  }
  // Once through, the forecourt permits lateral exploration across the bank.
  for(const z of [-399,-402,-405])for(let x=-41;x<=41;x+=2)assert.equal(collision(x,z),null,`${x},${z}`);
});

test('the tongue conceals the arrival view then releases the field without a ceiling',()=>{
  const hit=ray([10,5.85,-389],[0,0,-1]);
  assert.equal(hit?.id,'strata-cut-tongue-0');
  assert.ok(hit.distance>=3&&hit.distance<4.5);
  assert.equal(ray([10,5.85,-392],[0,1,0]),null);
  assert.equal(ray([4,5.85,-396],[0,0,-1]),null);
  assert.equal(entered(10,-392),false,'mouth is still inside the veil');
  assert.equal(S.releaseZ,-390);assert.equal(S.entry.releaseZ,-390);
  for(const [x,z] of [[7,-390.3],[8,-391],[9,-392.2]]) {
    assert.equal(collision(x,z),null,'free-walk mouth view has body clearance');
    assert.equal(ray([x,5.85,z],[0,0,-1]),null,'free-walk mouth view physically sees Source');
    assert.equal(entered(x,z),true,`actual open view must release at ${x},${z}`);
  }
  assert.equal(entered(15,-394.6),false,'a point in the physical tongue cannot release Source');
  assert.equal(entered(4,-394.6),true,'the free leftward path releases without a tiny x quota');
  for(const x of [4,10,18,20])assert.equal(entered(x,-396),true,`wide release at x${x}`);
  let firstClear=null,firstEntry=null;
  for(let n=0;n<=600;n++) {
    const t=n/600,x=10-6*t,z=-392-4*t;
    const physicallyClear=ray([x,5.85,z],[0,0,-1])===null;
    assert.equal(sourceStrataNorthClearAt(x,z),physicallyClear,`analytic sightline at ${x},${z}`);
    if(physicallyClear&&firstClear===null)firstClear=Math.hypot(x-10,z+392);
    if(entered(x,z)&&firstEntry===null)firstEntry=Math.hypot(x-10,z+392);
  }
  assert.ok(firstClear!==null&&firstEntry!==null);
  assert.ok(Math.abs(firstClear-firstEntry)<.22,'physical field view and phase release align within one capsule step');
});

test('cut faces collide only over their true footprint and finite body height',()=>{
  assert.equal(collision(4,-391)?.kind,'course','front west cut is tangible');
  assert.equal(collision(1.9,-396)?.kind,'course','west cleft edge is tangible');
  assert.equal(collision(22.1,-396)?.kind,'course','east cleft edge is tangible');
  assert.equal(collision(10,-393.5)?.kind,'tongue');
  assert.equal(collision(0,-398,{feet:0}),null,'finite bank does not extend down into nothingness');
  assert.equal(collision(0,-398,{feet:2})?.kind,'underbelly');
  assert.equal(collision(-26,-391.5,{feet:19}),null,'bank does not collide above its finite crown');
  // A corner cut has an AABB but no material. Exact convex-hull collision must
  // leave it empty, including a small physical body radius.
  const crown=sourceStrataSolids().find(s=>s.id==='strata-west-crown');
  assert.equal(collision(crown.minX+.01,crown.maxZ-.01,{feet:17,radius:.01}),null);
  const under=ray([0,0,-398],[0,1,0]);assert.equal(under?.id,'strata-underbelly');near(under.point[1],3.55,'finite underside');
  assert.equal(ray([-45,8,-395],[1,0,0])?.kind,'course');
  assert.equal(ray([45,8,-395],[-1,0,0])?.kind,'course');
});

test('runtime cell translation preserves every authored triangle and release boundary',()=>{
  const local=sourceStrataGeometry(),frame=sourceStrataBounds({x:120,y:-80});
  assert.deepEqual(frame.originMetres,{x:60,z:-40});
  assert.equal(frame.bank.frontZ,-430);assert.equal(frame.entry.turnZ,-436);
  assert.deepEqual(frame.opening[0],[66,-430]);
  assert.equal(frame.pieces,sourceStrataGeometry({x:60,z:-40}),'cached geometry remains shared');
  assert.equal(sourceStrataGeometry(),local,'default geometry remains cached');
  for(let n=0;n<local.length;n++) {
    const a=local[n],b=frame.pieces[n];assert.equal(a.id,b.id);assert.deepEqual(a.i,b.i);
    for(let v=0;v<a.p.length;v+=3){near(b.p[v],a.p[v]+60,'translated x');near(b.p[v+1],a.p[v+1],'unchanged height');near(b.p[v+2],a.p[v+2]-40,'translated z');}
  }
});
