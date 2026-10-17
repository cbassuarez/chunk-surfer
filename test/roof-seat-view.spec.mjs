import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import { createPointerModeController } from '../src/input/pointer-mode.js';
import { InputManager } from '../src/input/input-manager.js';
import { ACADEMIC_ROOF_SEAT_LOOK, academicRoofYawDelta } from '../src/data/academic-roof.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('function sitAtAcademicRoofGlass(id){');
const end=source.indexOf('function leaveYardLookBench(){',start);
assert.ok(start>=0&&end>start);

test('east default looks across supported glass instead of the zinc strip',()=>{
  // Actual runtime-centred eye and glass plane, in authored metres. This
  // catches the original east-facing ray even if its camera labels change.
  const look=ACADEMIC_ROOF_SEAT_LOOK['roof-sit-east'];
  const distance=.94/-Math.tan(look.pitch);
  const hit={x:88.25+Math.sin(look.yaw)*distance,z:16.25-Math.cos(look.yaw)*distance};
  assert.ok(hit.x>79.7&&hit.x<88.3&&hit.z>8.7&&hit.z<20.3,
    `east centre ray must hit the shader's clear glass, received ${JSON.stringify(hit)}`);
  assert.deepEqual(ACADEMIC_ROOF_SEAT_LOOK['roof-sit-west'],{yaw:0,pitch:-.08});
});

test('sitting takes the short turn even across the yaw wrap',()=>{
  assert.ok(Math.abs(academicRoofYawDelta(Math.PI*2-.01,0)-.01)<1e-10);
  assert.ok(Math.abs(academicRoofYawDelta(.01,Math.PI*2))<.011);
  for(const from of[-6.27,-3,-.1,0,3,6.27])for(const {yaw}of Object.values(ACADEMIC_ROOF_SEAT_LOOK)){
    const delta=academicRoofYawDelta(from,yaw);
    assert.ok(Math.abs(delta)<=Math.PI);
    assert.ok(Math.abs(Math.sin(from+delta-yaw))<1e-10);
  }
});

test('roof seat retains captured look through lowering, free look and rising',()=>{
  scenes.clear();
  const input=new InputManager();
  const target={};
  let exits=0;
  const doc={pointerLockElement:target,visibilityState:'visible',hasFocus:()=>true,
    body:{classList:{toggle(){}}},exitPointerLock(){exits++;this.pointerLockElement=null;}};
  const pointer=createPointerModeController({documentRef:doc,getTargetElement:()=>target,input,
    getState:()=>({renderer:'3d',storyMode:true,inRogue:true,paused:false,
      blocksLook:scenes.blocksInput()&&!scenes.allowsLook()})});
  pointer.sync('playing');
  const unsubscribe=scenes.subscribe(()=>pointer.sync('scene-change'));
  const angles={yaw:Math.PI*2-.01,pitch:-.02};
  const saved=[];
  const context={scenes,ACADEMIC_ROOF_SEAT_LOOK,academicRoofYawDelta,
    academicRoofSitScene:null,px:400,py:578,trail:[],renderMove:null,motionRig:null,
    PROPS:{propById:id=>({id,rx:id==='roof-sit-east'?410:400,ry:id==='roof-sit-east'?568:574}),propCanOccupy:()=>true},
    FP:{logicalToPhysical:()=>({renderGroup:'academicRoof'}),isSolid:()=>false,floorAt:()=>17},
    R3:{r3dLookAngles:()=>({...angles}),r3dSetLookAngles:look=>Object.assign(angles,look)},
    resetMotionInput(){input.reset();},flagTest:()=>false,flagApply(){},getSave:()=>({flags:{}}),
    saveCommit:value=>saved.push(value)};
  try{
    const sit=vm.runInNewContext(source.slice(start,end)+'\nsitAtAcademicRoofGlass',context);
    assert.equal(sit('roof-sit-west'),true);
    assert.equal(scenes.blocksInput(),true,'sitting holds locomotion');
    assert.equal(pointer.isTrueLocked(),true,'scene push must not release look during lowering');
    assert.equal(scenes.tracksMotion(),false);
    scenes.update(.425);
    assert.ok(Math.abs(scenes.worldView().yaw-(Math.PI*2-.005))<1e-10,
      'halfway lowering must not make an almost complete revolution');
    scenes.update(.426);
    assert.equal(scenes.top().view().phase,'seated');
    assert.equal(pointer.handleMouseMove({movementX:12,movementY:-3}),true);
    assert.equal(input.pointerDx,12,'first seated mouse move reaches ordinary look without another click');
    assert.equal(scenes.worldView().yaw,undefined,'settled seat releases the authored camera');
    angles.yaw=1.2;angles.pitch=-.6;
    scenes.key({key:'e',preventDefault(){}});
    const standing=scenes.worldView();
    assert.equal(standing.yaw,undefined,'rising keeps ordinary free look');
    assert.equal(standing.pitch,undefined);
    assert.equal(scenes.tracksMotion(),true,'a movement press during rising is retained for the world');
    angles.yaw=1.5;angles.pitch=-.4;
    scenes.update(.35);
    assert.equal(scenes.worldView().yaw,undefined,'height change must not rewind to the entry bearing');
    assert.equal(scenes.worldView().pitch,undefined);
    scenes.update(.351);
    assert.equal(scenes.depth(),0);
    assert.equal(context.px,400);assert.equal(context.py,578,'standing returns to the safe approach cell');
    assert.equal(angles.yaw,1.5);assert.equal(angles.pitch,-.4,'finishing the rise must not undo mouse look');
    assert.equal(exits,0,'the complete sitting interaction keeps one pointer lease');
    assert.ok(saved.length>=2);
    assert.equal(sit('roof-sit-east'),true);
    scenes.update(.851);
    const centreDistance=.94/-Math.tan(angles.pitch);
    const centreX=88.25+Math.sin(angles.yaw)*centreDistance;
    const centreZ=16.25-Math.cos(angles.yaw)*centreDistance;
    assert.ok(centreX>79.7&&centreX<88.3&&centreZ>8.7&&centreZ<20.3,
      'the production east seat must actually use its clear-glass camera contract');
    scenes.push({id:'pause',blocksInput:true});
    assert.equal(exits,1,'an overlay still revokes capture normally');
    assert.equal(pointer.isTrueLocked(),false);
  }finally{unsubscribe();scenes.clear();}
});
