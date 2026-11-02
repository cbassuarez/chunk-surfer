import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory as C,MAIN_STAIR_LAYOUT} from '../src/data/floorplan/conservatory.js';
import {F} from '../src/data/floorplan/legend.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,
  connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
PROPS.propsInit(FP);
const plan=FP.floorplan(),near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
function column(slice,x,y){const physical=FP.logicalToPhysical(x,y),index=(Math.floor(physical.z)-slice.originY)*slice.w+Math.floor(physical.x)-slice.originX;
  return{floor:slice.floor[index],ceil:slice.ceil[index],solid:slice.solid[index],flags:slice.flags[index]};}

test('ground and basement approaches see the complete real west flight and both exit aprons',()=>{
  // The lower strip genuinely has a yard above it. This is not an empty-cell
  // fixture: the production compiler must choose between real stacked spaces.
  const stacked=plan.physical.cells.get('94,46');
  assert(stacked.some(s=>s.owner==='loading_bay_yard'&&s.floor===0));
  assert(stacked.some(s=>s.owner==='main-basement-stair'&&s.floor===-4));
  for(const observer of[{x:122,y:46},{x:119,y:46},{x:106,y:46},{x:94,y:46},{x:88,y:46}]){
    const slice=FP.physicalRenderPlanFor(observer.x,observer.y);
    for(let y=44;y<=49;y++)for(let x=88;x<=122;x++){
      const cell=FP.cellAt(x,y);assert(cell);
      const drawn=column(slice,x,y);assert.equal(drawn.solid,0,`closed visible threshold (${x},${y}) from ${JSON.stringify(observer)}`);
      near(drawn.floor,cell.floor);assert(drawn.ceil-drawn.floor>=1.8);
    }
  }
});

test('the same stacked columns still show the actual yard to an outdoor observer',()=>{
  const outside={x:194,y:446},at=FP.logicalToPhysical(outside.x,outside.y);
  assert.equal(at.owner,'loading_bay_yard');
  const outsideFirst=FP.physicalRenderPlanFor(outside.x,outside.y),before=column(outsideFirst,outside.x,outside.y);
  near(before.floor,0);assert(before.flags&F.SKY);
  const inside=FP.physicalRenderPlanFor(119,46);near(column(inside,94,46).floor,-4);
  const outsideAgain=FP.physicalRenderPlanFor(outside.x,outside.y);assert.equal(outsideAgain,outsideFirst);
  near(column(outsideAgain,outside.x,outside.y).floor,0);
});

test('all existing principal stair thresholds admit their actual prop-clear lanes in both directions',()=>{
  const ids=new Set(['ground-spine-to-stair-hall','ground-hall-to-lower-flight','lower-half-flight-seam',
    'lower-flight-to-upper-floor-landing','upper-floor-landing-to-hall','upper-floor-landing-to-academic-flight',
    'upper-landing-to-practice','upper-half-flight-seam','academic-flight-to-floor-landing','academic-floor-landing-to-loggia']);
  const portals=FP.edgePortalState().filter(p=>ids.has(p.id));assert.equal(portals.length,ids.size);
  for(const portal of portals)for(const pair of portal.pairs)for(const [from,to,exit]of[
    [pair.from,pair.to,portal.from.exit],[pair.to,pair.from,portal.to.exit]]){
    const accepted=FP.canStep(from.x,from.y,from.x+exit.x,from.y+exit.y);
    assert(accepted.ok,`${portal.id}: ${accepted.why}`);assert.equal(accepted.edgePortal,portal.id);
    assert.deepEqual(accepted.redirect,to);assert(PROPS.propCanOccupy(to.x,to.y,{from}),`${portal.id}: hidden prop barrier`);
  }
});

function route(start,goal){
  const lower=FP.floorAt(start.x,start.y)<0||FP.floorAt(goal.x,goal.y)<0,
    inRoute=p=>{const at=FP.logicalToPhysical(p.x,p.y),x=at.x*.5,z=at.z*.5;
      return lower?x>=43&&x<=62&&z>=21&&z<=26:x>=53&&x<=71&&z>=24&&z<=44;},
    key=p=>p.x+','+p.y,queue=[start],previous=new Map([[key(start),null]]),byKey=new Map([[key(start),start]]);
  for(let n=0;n<queue.length;n++){
    const p=queue[n];if(key(p)===key(goal)){const out=[];for(let k=key(p);k;k=previous.get(k))out.push(byKey.get(k));return out.reverse();}
    for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const move=FP.canStep(p.x,p.y,p.x+dx,p.y+dy);if(!move.ok)continue;
      const next=move.redirect||{x:p.x+dx,y:p.y+dy},k=key(next);if(previous.has(k)||!inRoute(next)||!PROPS.propCanOccupy(next.x,next.y,{from:p}))continue;
      previous.set(k,key(p));byKey.set(k,next);queue.push(next);
    }
  }
  return null;
}
test('actual floorplan plus placed-prop movement completes the lower and full spiral routes and returns',()=>{
  const ground=FP.toRuntimePoint(MAIN_STAIR_LAYOUT.groundHall),top=FP.toRuntimePoint(MAIN_STAIR_LAYOUT.academicLanding);
  for(const [from,to]of[[{x:88,y:46},{x:122,y:46}],[{x:122,y:46},{x:88,y:46}],[ground,top],[top,ground]]){
    const path=route(from,to);assert(path&&path.length>20,`no real movement route ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    for(let n=1;n<path.length;n++){
      const a=path[n-1],b=path[n];assert(PROPS.propCanOccupy(b.x,b.y,{from:a}));
      assert(Math.abs(FP.floorAt(a.x,a.y)-FP.floorAt(b.x,b.y))<=.45001);
    }
  }
});

test('nearby masonry and open-well collision still reject movement; the render fix creates no no-clip route',()=>{
  let walls=0,voids=0;
  for(const [x0,x1,y0,y1]of[[86,124,42,52],[266,314,96,158]])for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    if(!FP.cellAt(x,y)||FP.isCollisionOnly(x,y))continue;
    for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const tx=x+dx,ty=y+dy,solid=FP.isSolid(tx,ty),voidCell=FP.isCollisionOnly(tx,ty);
      if(!solid&&!voidCell)continue;
      // An explicit seam is a different physical doorway, not entry into the
      // solid logical cell next to this island.
      const move=FP.canStep(x,y,tx,ty);if(move.redirect)continue;
      assert.equal(move.ok,false,`body crossed ${solid?'masonry':'well'} (${x},${y})->(${tx},${ty})`);
      if(solid)walls++;else voids++;
    }
  }
  assert(walls>100&&voids>10);
});
