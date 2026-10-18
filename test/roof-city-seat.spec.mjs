import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as scenes from '../src/game/scenes.js';
import {makeRoofCitySeatScene,ROOF_CITY_SEAT_ACTION} from '../src/game/roof-city-seat.js';
import {createPointerModeController} from '../src/input/pointer-mode.js';
import {InputManager} from '../src/input/input-manager.js';

test('city seat settles without a full revolution, yields free look, and returns the eye to its safe body',()=>{
  scenes.clear();
  const input=new InputManager(),target={};let unlocks=0,seated=0,exited=0;
  const doc={pointerLockElement:target,visibilityState:'visible',hasFocus:()=>true,
    body:{classList:{toggle(){}}},exitPointerLock(){unlocks++;this.pointerLockElement=null;}};
  const pointer=createPointerModeController({documentRef:doc,getTargetElement:()=>target,input,
    getState:()=>({renderer:'3d',storyMode:true,inRogue:true,paused:false,
      blocksLook:scenes.blocksInput()&&!scenes.allowsLook()})});
  const unsubscribe=scenes.subscribe(()=>pointer.sync('scene-change'));
  const origin={x:420,y:586},seat={x:424,y:586};
  const scene=makeRoofCitySeatScene({origin,seat,look:{yaw:2*Math.PI-.1,pitch:0},
    floor:17,yaw:.1,pitch:-.21,eyeDrop:.46,
    onEnter(){input.reset();},onSeated(){seated++;},onExit(){exited++;},
    onFinish(){scenes.remove(scene);}});
  try{
    scenes.push(scene);
    assert.equal(pointer.isTrueLocked(),true);
    scenes.update(.7);
    const mid=scenes.worldView();
    assert.equal(mid.x,422,'the camera glides through fractional runtime cells');
    assert.ok(mid.yaw>2*Math.PI-.1&&mid.yaw<2*Math.PI+.1,'short turn across yaw wrap');
    assert.equal(scenes.tracksMotion(),false);
    scenes.update(.701);
    assert.equal(seated,1);assert.equal(scene.view().phase,'seated');
    assert.deepEqual({...scenes.worldView()},{x:424,y:586,floorH:16.54,yaw:undefined,pitch:undefined,suppressActors:false});
    assert.equal(pointer.handleMouseMove({movementX:12,movementY:-3}),true);
    assert.equal(input.pointerDx,12,'head control keeps its original pointer lease');
    scenes.update(6);
    assert.equal(scene.view().showStandHint,false,'the held vista has no persistent caption');
    scenes.key({key:'e',preventDefault(){}});
    assert.equal(scenes.tracksMotion(),true,'stand preserves queued movement for the world');
    assert.equal(scenes.worldView().yaw,undefined,'standing never rewinds the live head bearing');
    scenes.update(ROOF_CITY_SEAT_ACTION.standSeconds*.5);
    assert.equal(scenes.worldView().x,422);
    scenes.update(ROOF_CITY_SEAT_ACTION.standSeconds*.5+.001);
    assert.equal(scenes.depth(),0);assert.equal(exited,1);assert.equal(unlocks,0);
    assert.deepEqual(origin,{x:420,y:586},'the saved body was never moved onto the bench');
  }finally{unsubscribe();scenes.clear();}
});

test('a pause holds the cinematic clock and cancel releases a borrowed city eye',()=>{
  scenes.clear();let exited=0;
  const scene=makeRoofCitySeatScene({origin:{x:1,y:1},seat:{x:3,y:1},
    look:{yaw:0,pitch:0},floor:17,yaw:1,pitch:-.21,eyeDrop:.46,onExit(){exited++;}});
  try{
    scenes.push(scene);scenes.update(.4);
    scenes.push({id:'pause',blocksInput:true});scenes.update(90);
    assert.equal(scene.view().elapsed,.4);
    scenes.clear();assert.equal(exited,1);
    assert.equal(scenes.worldView(),null);
  }finally{scenes.clear();}
});

test('production wiring keeps body/save on the approach and passes the live city-seat scene to the vigil',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf('function sitAtRoofCitySeat(){');
  const end=source.indexOf('function sitAtAcademicRoofGlass(id){',start);
  assert.ok(start>=0&&end>start);
  scenes.clear();const saves=[],flags=[];
  const context={scenes,makeRoofCitySeatScene,roofCitySeatScene:null,px:420,py:586,trail:[],renderMove:null,motionRig:null,
    ACADEMIC_ROOF:{renderGroup:'academicRoof'},ROOF_CITY_SEAT:{id:'roof-city-seat',yaw:Math.PI/2,pitch:-.21,eyeDrop:.46},
    PROPS:{propById:()=>({rx:424,ry:586}),propCanOccupy:()=>true},
    FP:{logicalToPhysical:()=>({renderGroup:'academicRoof'}),isSolid:()=>false,floorAt:()=>17},
    R3:{r3dLookAngles:()=>({yaw:0,pitch:0}),r3dSetLookAngles(){}},
    resetMotionInput(){},flagApply:value=>flags.push(value),getSave:()=>({flags:{}}),saveCommit:value=>saves.push(value)};
  try{
    const sit=vm.runInNewContext(source.slice(start,end)+'\nsitAtRoofCitySeat',context);
    assert.equal(sit(),true);scenes.update(1.401);
    assert.equal(context.px,420);assert.equal(context.py,586);
    assert.deepEqual({x:saves[0].px,y:saves[0].py},{x:420,y:586});
    assert.ok(flags[0].includes('roof.city.sat'));
    scenes.key({key:'e'});scenes.update(.901);
    assert.equal(context.roofCitySeatScene,null);
  }finally{scenes.clear();}
});

test('an exposed roof hold has fresh air while the plant still contaminates enclosed rooms',()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=source.indexOf('function hypoxiaSourceHere(){'),end=source.indexOf('function tickHypoxia(dt){',start);
  assert.ok(start>=0&&end>start);
  let zone=5,physical={spaceId:'academic_roof',renderGroup:'academicRoof',y:17};
  const context={usingPlan:()=>true,usingSpecialSpace:()=>false,px:420,py:580,
    PLANT:{plantIncidentState:()=>({phase:'venting'}),PLANT_INCIDENT_PHASE:{DORMANT:'dormant',SEALED:'sealed'}},
    ZONE:{street:1,dock:2,civicCourt:3,serviceYard:4,academicRoof:5},ACADEMIC_ROOF:{renderGroup:'academicRoof'},
    FP:{zoneAt:()=>zone,logicalToPhysical:()=>physical}};
  const sourceHere=vm.runInNewContext(source.slice(start,end)+'\nhypoxiaSourceHere',context);
  assert.equal(sourceHere(),0,'the outdoor city hold cannot accumulate indoor CO2');
  zone=6;physical={spaceId:'academic',renderGroup:'academic',y:10};
  assert.equal(sourceHere(),.35,'ordinary indoor exposure is unchanged');
  physical={spaceId:'basement',renderGroup:'basement',y:-3};assert.equal(sourceHere(),.75);
  physical={spaceId:'plant',renderGroup:'plant',y:-3};assert.equal(sourceHere(),1);
});
