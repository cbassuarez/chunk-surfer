import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {ACADEMIC_BOUNCER_ACTORS as GUARDS} from '../src/data/academic-bouncers.js';
import {ACADEMIC_SOCIETY_ACTORS} from '../src/data/academic-society.js';
import {ACADEMIC_FLOOR_POPULATION} from '../src/data/academic-floor-population.js';
import {PROP_BOUNDS} from '../src/data/generated/prop-geometry.js';
import {ACADEMIC_BOUNCER_ENTRANCE,academicBouncerAccessForMove,
  academicBouncerPhysicalFocus} from '../src/game/academic-bouncer-access.js';
import {createAcademicBouncers} from '../src/game/academic-bouncers.js';
import {academicBouncerInstances} from '../src/render/academic-bouncers.js';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';

FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,
  connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});
PROPS.propsInit(FP);
const project=(x,y)=>{const p=FP.logicalToPhysical(x*2,y*2);return{x:p.x*CELL,y:p.y,z:p.z*CELL};};
const worldGuards=GUARDS.map(g=>({...g,...project(g.x,g.y)}));
const gate=FP.edgePortalState().find(p=>p.id===ACADEMIC_BOUNCER_ENTRANCE.portalId);

test('the actual four-lane stair seam is held incoming until admission',()=>{
  assert.equal(gate.pairs.length,4);
  for(const pair of gate.pairs){
    assert.equal(pair.from.x,ACADEMIC_BOUNCER_ENTRANCE.stairX);
    const lane=ACADEMIC_BOUNCER_ENTRANCE.stairY.indexOf(pair.from.y);
    assert.ok(lane>=0);assert.equal(pair.to.x,ACADEMIC_BOUNCER_ENTRANCE.loggiaX);
    assert.equal(pair.to.y,ACADEMIC_BOUNCER_ENTRANCE.loggiaY[lane]);
    for(const lateral of [-1,0,1]){
      const move=FP.canStep(pair.from.x,pair.from.y,pair.from.x-1,pair.from.y+lateral);
      assert.equal(move.ok,true);assert.equal(move.edgePortal,gate.id);
      const held=academicBouncerAccessForMove({from:pair.from,move});
      assert.deepEqual(held,{allowed:false,entrance:'main-stair',direction:'in'});
      assert.equal(academicBouncerAccessForMove({admitted:true,from:pair.from,move}).allowed,true);
    }
  }
});

test('all four lanes permit exit, including diagonals and unadmitted saved bodies inside',()=>{
  for(const pair of gate.pairs)for(const lateral of [-1,0,1]){
    const move=FP.canStep(pair.to.x,pair.to.y,pair.to.x+1,pair.to.y+lateral);
    assert.equal(move.ok,true);assert.equal(move.edgePortal,gate.id);
    assert.deepEqual(academicBouncerAccessForMove({from:pair.to,move}),
      {allowed:true,entrance:'main-stair',direction:'out'});
  }
  const from={x:24,y:556},move=FP.canStep(24,556,23,556);
  assert.equal(move.ok,true);
  assert.deepEqual(academicBouncerAccessForMove({from,move}),{allowed:true,entrance:null,direction:null});
});

test('render-group changes on lower treads never become admission boundaries',()=>{
  const from={x:268,y:124},move=FP.canStep(268,124,268,123);
  assert.equal(move.ok,true);assert.equal(FP.logicalToPhysical(268,123).renderGroup,'academic');
  assert.ok(move.floor<6.1);
  assert.equal(academicBouncerAccessForMove({from,move}).allowed,true);
  assert.deepEqual(academicBouncerAccessForMove({}),{allowed:true,entrance:null,direction:null});
});

test('the compiled roof return is physically continuous and is not a second admission trap',()=>{
  const roof=FP.edgePortalState().find(p=>p.id==='academic-loggia-to-roof-service');
  assert.equal(roof.pairs.length,3);
  for(const pair of roof.pairs){
    const move=FP.canStep(pair.to.x,pair.to.y,pair.to.x,pair.to.y+1);
    assert.equal(move.ok,true);assert.equal(move.edgePortal,roof.id);
    assert.deepEqual(move.redirect,pair.from);
    assert.equal(academicBouncerAccessForMove({from:pair.to,move}).allowed,true);
    const a=FP.logicalToPhysical(pair.from.x,pair.from.y),b=FP.logicalToPhysical(pair.to.x,pair.to.y);
    assert.equal(a.y,10);assert.equal(b.y,10);
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)*CELL<=.501);
  }
  // The roof has no exterior ground entry: its declared external endpoint is
  // this academic aperture; Ren's ladder also returns to the academic floor.
  assert.ok(C.edgePortals.filter(p=>p.id.startsWith('academic-roof')).every(p=>p.id!=='academic-roof-to-ground'));
});

test('physical focus selects each visible guard across the otherwise distant logical islands',()=>{
  for(let index=0;index<GUARDS.length;index++){
    const guard=worldGuards[index],lane=gate.pairs[index*2],body=FP.logicalToPhysical(lane.from.x+1,lane.from.y);
    const listener={x:body.x*CELL,y:body.y,z:body.z*CELL};
    const yaw=Math.atan2(guard.x-listener.x,-(guard.z-listener.z));
    const picked=academicBouncerPhysicalFocus({listener,yaw,guards:worldGuards});
    assert.equal(picked.actorId,guard.id);assert.equal(picked.actor,guard);assert.equal(picked.near,true);
    assert.ok(picked.distance<=3.2);assert.ok(Math.abs(picked.aimAngle)<1e-6);
    assert.ok(Math.hypot(lane.from.x*.5-GUARDS[index].x,lane.from.y*.5-GUARDS[index].y)>200,
      'this is a genuine physical seam test rather than ordinary same-island picking');
  }
});

test('nearby company does not grab focus behind the camera, through another floor or outside local reach',()=>{
  const guard=worldGuards[0],listener={x:guard.x+1.5,y:10,z:guard.z};
  assert.equal(academicBouncerPhysicalFocus({listener,yaw:Math.PI/2,guards:worldGuards}).actor,null);
  assert.equal(academicBouncerPhysicalFocus({listener,yaw:Math.PI/2,guards:worldGuards}).near,true);
  assert.equal(academicBouncerPhysicalFocus({listener:{...listener,y:7.4},yaw:-Math.PI/2,guards:worldGuards}).near,false);
  assert.equal(academicBouncerPhysicalFocus({listener:{...listener,y:17},yaw:-Math.PI/2,guards:worldGuards}).near,false);
  assert.equal(academicBouncerPhysicalFocus({listener:{...listener,x:listener.x+8},yaw:-Math.PI/2,guards:worldGuards}).near,false);
  assert.equal(academicBouncerPhysicalFocus({listener,yaw:-Math.PI/2,guards:worldGuards.map(a=>({...a,visible:false}))}).near,false);
  assert.equal(academicBouncerPhysicalFocus({listener,guards:worldGuards}).actor,null);
  assert.equal(academicBouncerPhysicalFocus({listener:null,yaw:0,guards:worldGuards}).near,false);
});

function skinPoints(asset,entry,instance){
  const pose=sampleCharacterPose(asset,entry,{joints:instance.character.joints}),m=instance.matrix,points=[];
  for(const primitive of entry.primitives)for(let index=0;index<primitive.vertexCount;index++){
    const local=[0,0,0];
    for(let slot=0;slot<4;slot++){
      const weight=primitive.weights[index*4+slot],at=primitive.joints[index*4+slot]*16;
      for(let axis=0;axis<3;axis++)local[axis]+=weight*(pose.bones[at+axis]*primitive.positions[index*3]
        +pose.bones[at+axis+4]*primitive.positions[index*3+1]+pose.bones[at+axis+8]*primitive.positions[index*3+2]+pose.bones[at+axis+12]);
    }
    points.push([0,1,2].map(axis=>m[axis]*local[0]+m[axis+4]*local[1]+m[axis+8]*local[2]+m[axis+12]));
  }
  return points;
}
function inFurniture(point,o,b){
  const dx=point[0]-o.x,dz=point[2]-o.z,c=Math.cos(o.yaw||0),s=Math.sin(o.yaw||0),scale=o.scale||1;
  const local=[(c*dx+s*dz)/scale,(point[1]-o.y)/scale,(-s*dx+c*dz)/scale];
  return local.every((v,i)=>v>b.min[i]+.005&&v<b.max[i]-.005);
}
function admit(controller){
  controller.learnFromProp('practice-desk-stack-1');controller.beginAttempt();
  while(controller.view().attempt?.currentLine)controller.finishLine();
  assert.equal(controller.interject('guests').accepted,true);
  while(controller.view().attempt?.currentLine)controller.finishLine();
  assert.equal(controller.acknowledge(),true);
}

test('actual guard clothes and moving feet clear the stair exclusion, furniture and each other while stepping aside',()=>{
  const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url));
  const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const entries=new Map(asset.entries.map(entry=>[entry.name,entry]));
  const furniture=PROPS.renderInstances({group:'academic',inscriptions:false}).filter(o=>
    ['chair','piano_bench','upright_piano','grand_piano','school_desk','academic_filing_bank',
      'amenity_staff_counter','amenity_staff_coat_lockers','academic_planter'].includes(o.mesh)&&o.y>=9.8&&o.y<12);
  const controller=createAcademicBouncers();admit(controller);
  const frames=[GUARDS.map(actor=>({...actor,stance:'guard',visible:true}))];
  for(let sample=0;sample<=46;sample++){
    frames.push(controller.actorFrame());controller.tick(.1);
  }
  const problems=[];
  for(const [sample,actors]of frames.entries()){
    const bodies=academicBouncerInstances(actors,{project,zone:ZONE.academic}),bounds=[];
    for(const body of bodies){
      const actor=actors.find(a=>a.id===body.academicBouncerActor),points=skinPoints(asset,entries.get(body.mesh),body);
      const box={id:actor.id,min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
      for(const point of points){
        for(let axis=0;axis<3;axis++){box.min[axis]=Math.min(box.min[axis],point[axis]);box.max[axis]=Math.max(box.max[axis],point[axis]);}
        const x=(point[0]-50)*2,y=(point[2]+240)*2;
        if(FP.isSolid(x,y)||FP.isCollisionOnly(x,y))problems.push({sample,id:actor.id,kind:'wall/stair exclusion',point});
        for(const object of furniture)if(inFurniture(point,object,PROP_BOUNDS[object.mesh]))problems.push({sample,id:actor.id,kind:'furniture',object:object.id});
      }
      bounds.push(box);
      for(const resident of [...ACADEMIC_SOCIETY_ACTORS,...ACADEMIC_FLOOR_POPULATION])assert.ok(Math.hypot(actor.x-resident.x,actor.y-resident.y)>1.1,
        `${actor.id} crowds existing ${resident.id}`);
    }
    assert.equal(bodies.length,2);
    const[a,b]=bounds;
    assert.ok([0,2].some(axis=>a.max[axis]<b.min[axis]||b.max[axis]<a.min[axis]),'the two simultaneous conservative garment boxes overlap at sample '+sample);
    if(problems.length)break;
  }
  assert.deepEqual(problems.slice(0,5),[]);
  assert.ok(FP.doorState().filter(d=>d.id.startsWith('academic-')&&d.keyId).every(d=>!d.open));
});
