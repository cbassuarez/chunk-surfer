import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestHarpsichordBoardGeometry,sourceRestHarpsichordBoardLocalToWorld as world,
  sourceRestHarpsichordBoardWorldToLocal as local,SOURCE_REST_HARPSICHORD_BOARD_FRAME as frame,
  SOURCE_REST_HARPSICHORD_BOARD_OUTLINE as outline,sourceRestHarpsichordBoardSupports} from '../src/render/source-rest-harpsichord-board.js';
import {SOURCE_CONTINUATION,continuationSurfaceContains,continuationSectorSteps,continuationSupportAt,continuationSurfaces} from '../src/data/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';

const seat=SOURCE_REST_SEATS.find(item=>item.phase==='catch'),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const signedArea=points=>points.reduce((n,a,k)=>{const b=points[(k+1)%points.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2;
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
function inside(point,polygon,tolerance=1e-7){
  const sign=Math.sign(signedArea(polygon));return polygon.every((a,k)=>sign*cross(a,polygon[(k+1)%polygon.length],point)>=-tolerance);
}
function actualCells(surface){
  if(surface.kind==='rect')return[[[surface.minX,surface.minZ],[surface.maxX,surface.minZ],[surface.maxX,surface.maxZ],[surface.minX,surface.maxZ]]];
  const steps=continuationSectorSteps(surface),delta=(surface.endAngle-surface.startAngle)/steps,
    point=(r,a)=>[surface.center.x+r*Math.cos(a),surface.center.z+r*Math.sin(a)];
  return Array.from({length:steps},(_,k)=>{const a=surface.startAngle+k*delta,b=a+delta;
    return[point(surface.innerRadius,a),point(surface.outerRadius,a),point(surface.outerRadius,b),point(surface.innerRadius,b)];});
}
const vertices=g=>Array.from({length:g.p.length/3},(_,k)=>({x:g.p[k*3],y:g.p[k*3+1],z:g.p[k*3+2]}));
const triangle=(g,k,points)=>g.i.slice(k*3,k*3+3).map(index=>points[index]);

test('board uses the actual native radial right/up/back frame, independent of the seated viewing yaw',()=>{
  near(frame.yaw,Math.atan2(SOURCE_CONTINUATION.catch.center.x-seat.x,seat.z-SOURCE_CONTINUATION.catch.center.z));near(frame.origin.y,seat.feet);
  assert.equal(frame.origin.x,seat.x);assert.equal(frame.origin.z,seat.z);
  assert.equal(frame.level,seat.level,'the veneer follows the actual earned support, never a default top shelf');
  const radius=Math.hypot(seat.x-SOURCE_CONTINUATION.catch.center.x,seat.z-SOURCE_CONTINUATION.catch.center.z),forward=world({z:-radius});near(forward.x,SOURCE_CONTINUATION.catch.center.x);near(forward.z,SOURCE_CONTINUATION.catch.center.z);
  for(const p of[{x:0,y:0,z:0},{x:2.7,y:.02,z:-6.2},{x:-2.8,y:.006,z:1.35}]){
    const q=local(world(p));for(const key of['x','y','z'])near(q[key],p[key]);
  }
  const origin=world(),right=world({x:1}),back=world({z:1});
  near(right.x-origin.x,frame.right[0]);near(right.z-origin.z,frame.right[2]);
  near(back.x-origin.x,frame.back[0]);near(back.z-origin.z,frame.back[2]);
});

test('one bounded, thin decorative wood model has finite nondegenerate geometry and no physical-floor authority',()=>{
  const g=sourceRestHarpsichordBoardGeometry(),points=vertices(g);
  assert.ok(g.i.length/3>0&&g.i.length/3<3000);assert.equal(g.material,'piano-wood');
  assert.equal(g.cosmeticOnly,true);assert.equal(g.structural,false);assert.equal(g.walkable,false);
  assert.equal(g.collision,undefined);assert.equal(g.surface,undefined);assert.match(g.rosette,/no false opening/);
  assert.ok(g.p.every(Number.isFinite));assert.ok(g.i.every(index=>Number.isInteger(index)&&index>=0&&index<points.length));
  assert.deepEqual([...new Set(points.map(p=>p.y))].sort((a,b)=>a-b),[.006,.02]);
  for(const p of points){assert.ok(inside([p.x,p.z],outline));assert.ok(p.x>=-2.800001&&p.x<=3.000001&&p.z>=-7.400001&&p.z<=1.350001);}
  for(let k=0;k<g.i.length/3;k++){
    const[a,b,c]=triangle(g,k,points),ab=[b.x-a.x,b.y-a.y,b.z-a.z],ac=[c.x-a.x,c.y-a.y,c.z-a.z],
      normal=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    assert.ok(Math.hypot(...normal)>1e-10,`triangle ${k} has area`);
  }
});

test('every complete triangle lies within a single actual convex support cell at the existing original height',()=>{
  const g=sourceRestHarpsichordBoardGeometry(),points=vertices(g),supports=new Map(sourceRestHarpsichordBoardSupports().map(s=>[s.id,s]));
  let tested=0;
  for(const section of g.sections){
    const support=supports.get(section.supportId),cells=actualCells(support);
    assert.equal(support.y,seat.feet);assert.equal(support.phase,'catch');assert.equal(support.level,seat.level);
    for(let k=section.firstTriangle;k<section.firstTriangle+section.triangleCount;k++){
      const vertices=triangle(g,k,points).map(world),projection=vertices.map(p=>[p.x,p.z]);
      // Convexity proves the whole triangle, including the nearest point to
      // the missing inner crescent, stays on ONE physical support cell.
      assert.ok(cells.some(cell=>projection.every(p=>inside(p,cell))),`triangle ${k} cannot chord across an unsupported annulus`);
      for(const weights of[[1/3,1/3,1/3],[.02,.49,.49],[.49,.02,.49],[.49,.49,.02]]){
        const x=vertices.reduce((n,p,j)=>n+p.x*weights[j],0),z=vertices.reduce((n,p,j)=>n+p.z*weights[j],0);
        assert.ok(continuationSurfaceContains(support,x,z));
        const physical=continuationSupportAt(x,z,{phase:'catch',chartId:seat.chartId,level:seat.level,feet:seat.feet});
        assert.ok(physical);near(physical.y,seat.feet);
      }
      tested++;
    }
  }
  assert.equal(tested,g.i.length/3);assert.ok(g.supportIds.includes(`catch-${seat.level}-return-pad`));
  assert.ok(g.supportIds.every(id=>id.startsWith(`catch-${seat.level}-`)));
});

test('unsupported near corner and inner-radius tip are visibly cut away instead of becoming a false extension',()=>{
  const g=sourceRestHarpsichordBoardGeometry();
  const probes=outline.flatMap((a,k)=>{const b=outline[(k+1)%outline.length];return Array.from({length:10},(_,j)=>a.map((v,n)=>v+(b[n]-v)*j/9));}),
    unsupported=probes.filter(point=>{const p=world({x:point[0],z:point[1]});return!continuationSupportAt(p.x,p.z,{phase:'catch',chartId:seat.chartId,level:seat.level,feet:seat.feet});});
  assert.ok(unsupported.length>0,'the current footprint reaches real unsupported space');
  for(const point of unsupported){
    assert.ok(inside(point,outline),'the ideal instrument silhouette would reach this point');
    const p=world({x:point[0],z:point[1]});
    assert.equal(continuationSupportAt(p.x,p.z,{phase:'catch',chartId:seat.chartId,level:seat.level,feet:seat.feet}),null);
    assert.ok(g.sections.every(section=>!inside(point,section.polygon)),'the wooden veneer stops short of unsupported space');
  }
  assert.ok(g.sections.some(section=>inside([0,0],section.polygon)),'the real supported listening pocket receives wood');
});

test('building the overlay is repeatable and leaves every existing floor and support query unchanged',()=>{
  const before=JSON.stringify(continuationSurfaces()),a=sourceRestHarpsichordBoardGeometry(),b=sourceRestHarpsichordBoardGeometry();
  assert.deepEqual(a,b);assert.equal(JSON.stringify(continuationSurfaces()),before);
  a.p[0]=999;a.sections[0].polygon[0][0]=999;
  assert.deepEqual(sourceRestHarpsichordBoardGeometry(),b,'a consumer cannot damage a later geometry build');
});
