import test from 'node:test';
import assert from 'node:assert/strict';
import * as PROPS from '../src/game/props.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {leavesPropOverlap} from '../src/world/prop-body-contact.js';

// Isolate one mutable prop far from the production structural colliders while
// using the real body, rotation and overlap-recovery path. The oracle retains
// the original narrow rectangle calculation without the broad-phase shortcut.
const fp={isSolid:()=>false,floorAt:()=>0,zoneAt:()=>ZONE.street,
  logicalToPhysical:(x,y)=>({x,z:y,y:0,renderGroup:'ground'}),arcYawOffset:()=>0};
const mx=x=>(x+.5)*CELL;
function originalPoint(x,z,p,pad){
  const dx=x-p.x,dz=z-p.y,c=Math.cos(-(p.yaw||0)),s=Math.sin(-(p.yaw||0));
  return Math.abs(dx*c-dz*s)<=(p.w*(p.scale||1))/2+pad
    &&Math.abs(dx*s+dz*c)<=(p.d*(p.scale||1))/2+pad;
}
function expected(p,to,from){
  const dest={x:mx(to.x),z:mx(to.y)};
  if(from){
    const origin={x:mx(from.x),z:mx(from.y)};
    if(originalPoint(origin.x,origin.z,p,.20))return leavesPropOverlap(origin,dest,p,.20);
  }
  return !originalPoint(dest.x,dest.z,p,.20);
}

test('conservative rejection matches original rotated collision, including mutable props and overlap recovery',()=>{
  PROPS.propsInit(fp,[{id:'collision-oracle',mesh:'test-unmapped',x:10000,y:10000,w:1,d:1,blocks:true}]);
  const p=PROPS.propById('collision-oracle');
  let seed=0x15391;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const logical=m=>m/CELL-.5;
  for(let i=0;i<2500;i++){
    // Include degenerate sizes and direct mutations as well as large rotated
    // objects and points at both short and long range.
    p.w=i%17===0?0:random()*16;p.d=i%23===0?0:random()*14;
    p.scale=i%29===0?0:.1+random()*3;p.yaw=(random()-.5)*20;
    p.x=10000+(random()-.5)*4;p.y=10000+(random()-.5)*4;
    const span=i%3===0?25:5;
    const to={x:logical(p.x+(random()-.5)*span),y:logical(p.y+(random()-.5)*span)};
    const from=i%2?{x:to.x+(random()-.5)*4,y:to.y+(random()-.5)*4}:null;
    assert.equal(PROPS.propCanOccupy(to.x,to.y,{from}),expected(p,to,from),`sample ${i}`);
  }
});
