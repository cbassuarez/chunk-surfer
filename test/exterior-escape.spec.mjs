import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {leavesPropOverlap,slideBlockedPropStep} from '../src/world/prop-body-contact.js';
import {EXTERIOR_PUB,pubExteriorLogicalAt} from '../src/data/exterior-pub.js';
import {courtyardWalk} from './helpers/exterior-pub-route.mjs';

FP.compile(conservatory.levels,conservatory);PROPS.propsInit(FP);
PROPS.setColliderGroupEnabled('opening-street',true);
PROPS.setColliderGroupEnabled('street-pilot',true);
const box={x:0,y:0,w:1,d:5,yaw:0};
const canStep=(ax,ay,bx,by)=>FP.canStep(ax,ay,bx,by,{keys:new Set()});
const canOccupy=(x,y,options)=>PROPS.propCanOccupy(x,y,options);

test('a restored overlap walks monotonically out of its nearest face, never inward or through a thin fence',()=>{
  assert.equal(leavesPropOverlap({x:.2,z:0},{x:.4,z:.1},box,0),true);
  assert.equal(leavesPropOverlap({x:.2,z:0},{x:.1,z:.1},box,0),false);
  assert.equal(leavesPropOverlap({x:.2,z:0},{x:-.4,z:0},box,0),false);
  assert.equal(leavesPropOverlap({x:.2,z:0},{x:.2,z:.5},box,0),false,'lateral motion inside stock is not an escape');
  assert.equal(leavesPropOverlap({x:.04,z:0},{x:-.46,z:0},{...box,w:.1},0),false,'clear opposite endpoint cannot tunnel through a 100mm panel');
  assert.equal(leavesPropOverlap({x:.04,z:0},{x:.54,z:0},{...box,w:.1},0),true);
  assert.equal(leavesPropOverlap({x:.5,z:0},{x:1,z:0},box,0),true,'an exact stale boundary can leave normally');
  assert.equal(leavesPropOverlap({x:.51,z:0},{x:1,z:0},box,0),false,'new entries cannot use overlap recovery');
});

test('overlap recovery preserves the normal half-metre stride and actual rotated stock',()=>{
  assert.equal(leavesPropOverlap({x:.2,z:0},{x:2,z:0},box,0),false,'no automatic displacement or long jump');
  assert.equal(leavesPropOverlap({x:.2,z:0},{x:.7,z:.5},box,0),true,'ordinary diagonal stride is bounded');
  assert.equal(leavesPropOverlap({x:10,z:20.2},{x:10,z:20.7},{...box,x:10,y:20,yaw:Math.PI/2},0),true);
  assert.equal(leavesPropOverlap({x:10,z:20.2},{x:10,z:19.7},{...box,x:10,y:20,yaw:Math.PI/2},0),false);
});

test('the real van can be left gradually from a restored overlap without making a new entry legal',()=>{
  let p={x:132,y:416};
  assert.equal(PROPS.propCanOccupy(p.x,p.y),false,'body is inside the current van envelope');
  for(let i=0;i<3;i++){
    const q={x:p.x,y:p.y+1};
    assert.ok(canStep(p.x,p.y,q.x,q.y).ok);
    if(i===0)assert.equal(PROPS.propCanOccupy(q.x,q.y),false,'the old endpoint-only check would reject this still-overlapping exit step');
    assert.equal(PROPS.propCanOccupy(q.x,q.y,{from:p}),true,'each real .5m outward step can complete');
    p=q;
  }
  assert.equal(PROPS.propCanOccupy(p.x,p.y),true,'the final position is genuinely clear');
  assert.equal(PROPS.propCanOccupy(p.x,p.y-1,{from:p}),false,'the same material still blocks a new entry');
  assert.equal(PROPS.propCanOccupy(132,415,{from:{x:132,y:416}}),false,'cannot cross the van centre to escape its other side');
  assert.equal(PROPS.propCanOccupy(132,424,{from:{x:132,y:416}}),false,'cannot teleport to a distant clear destination');
});

test('indoor furniture keeps its existing collision behavior',()=>{
  const p=PROPS.propById('foyer-pew-1'),from={x:p.rx-.5,y:p.ry-.5},to={x:from.x,y:from.y+.5};
  assert.equal(leavesPropOverlap({x:p.x,z:p.y},{x:p.x,z:p.y+.25},p),true,'the geometric escape would otherwise qualify');
  assert.equal(PROPS.propCanOccupy(to.x,to.y,{from}),false,'the outdoor recovery rule never changes the foyer');
});

test('the real fence retains its side while a stale body backs out',()=>{
  // The arrival court replaced the former fence. Exercise its actual south
  // run's west face, rather than an empty cell at the retired fence location.
  assert.equal(PROPS.propCanOccupy(154,428),false);
  assert.equal(PROPS.propCanOccupy(155,428,{from:{x:154,y:428}}),false,'opposite-side crossing remains blocked');
  assert.equal(PROPS.propCanOccupy(153,428,{from:{x:154,y:428}}),true,'outward ordinary step clears the same face');
  assert.equal(PROPS.propCanOccupy(154,428,{from:{x:153,y:428}}),false,'a clear body cannot enter the fence');
});

test('a real van corner offers a checked shoulder slide instead of swallowing diagonal input',()=>{
  const from={x:124,y:412};
  assert.equal(PROPS.propCanOccupy(125,413,{from}),false,'original diagonal meets the real van');
  const slide=slideBlockedPropStep({from,dx:1,dy:1,canStep,canOccupy});
  assert.deepEqual([slide?.dx,slide?.dy],[1,0]);
  assert.ok(slide.move.ok);
  assert.equal(PROPS.propCanOccupy(125,412,{from}),true,'slide ends in a genuine clear cell');
  assert.equal(slideBlockedPropStep({from:{x:132,y:416},dx:1,dy:-1,canStep,canOccupy}),null,'blocked inward halves do not invent a route through the body');
});

test('contact sliding checks both collision owners and preserves a real cardinal redirect',()=>{
  const from={x:3,y:4},seen=[];
  const slide=slideBlockedPropStep({from,dx:1,dy:1,
    canStep:(ax,ay,bx,by)=>by===ay?{ok:false}:{ok:true,redirect:{x:80,y:90},edgePortal:'real-seam'},
    canOccupy:(x,y,options)=>{seen.push([x,y,options.from]);return true;}});
  assert.deepEqual(slide,{dx:0,dy:1,move:{ok:true,redirect:{x:80,y:90},edgePortal:'real-seam'}});
  assert.deepEqual(seen,[[80,90,from]]);
  assert.equal(slideBlockedPropStep({from,dx:1,dy:1,canStep:()=>({ok:true}),canOccupy:()=>false}),null);
  assert.equal(slideBlockedPropStep({from,dx:1,dy:0,canStep:()=>({ok:true}),canOccupy:()=>true}),null);
});

test('ordinary loaded-pack routes connect the van, vigil, park, both dock stairs and pub doorstep in both directions',()=>{
  const start=[conservatory.spawn.x*2,conservatory.spawn.y*2];
  const targets=[
    ['van rear',[123,416]],['lodge window',[152,428]],['park north spine',[120,448]],
    ['vigil forecourt',[154,500]],['north dock stair',[197,410]],['goods dock stair',[197,420]],
    ['pub',Object.values(pubExteriorLogicalAt(EXTERIOR_PUB.doors[0].id)).map(v=>Math.floor(v*2))],
  ];
  for(const[label,target] of targets){
    const route=courtyardWalk(FP,PROPS,start,target);
    assert.ok(route,`${label} can be reached through current source surfaces`);
    const back=courtyardWalk(FP,PROPS,target,start);
    assert.ok(back,`${label} has an ordinary route back to arrival`);
  }
});

test('both dock flights cross their real seams and return through the same lane',()=>{
  for(const y of [410,420]){
    let p={x:197,y};const walked=[p];
    for(let i=0;i<3;i++){
      const step=canStep(p.x,p.y,p.x+1,p.y);assert.ok(step.ok);
      const q=step.redirect||{x:p.x+1,y:p.y};
      assert.equal(PROPS.propCanOccupy(q.x,q.y,{from:p}),true);
      walked.push(q);p=q;
    }
    assert.ok(walked.at(-1).y<50,'actually crossed from the yard component onto the raised apron');
    for(let i=walked.length-1;i>0;i--){
      const a=walked[i],b=walked[i-1],step=canStep(a.x,a.y,a.x-1,a.y);
      assert.ok(step.ok);assert.deepEqual(step.redirect||{x:a.x-1,y:a.y},b);
      assert.equal(PROPS.propCanOccupy(b.x,b.y,{from:a}),true);
    }
  }
});
