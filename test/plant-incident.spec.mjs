import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

import * as plant from '../src/game/plant-incident.js';

test('plant incident triggers once from a player spoil on take two or three only',()=>{
  assert.equal(plant.loadPlantIncident(null).phase,plant.PLANT_INCIDENT_PHASE.DORMANT,'old saves without plant state start dormant');
  plant.resetPlantIncident();
  assert.equal(plant.triggerPlantIncident({takeOrdinal:1,spoiled:true,playerGenerated:true}),false);
  assert.equal(plant.triggerPlantIncident({takeOrdinal:2,spoiled:true,playerGenerated:false}),false);
  assert.equal(plant.triggerPlantIncident({takeOrdinal:2,spoiled:true,playerGenerated:true}),true);
  assert.equal(plant.plantRecordingBlocked(),true);
  assert.equal(plant.triggerPlantIncident({takeOrdinal:3,spoiled:true,playerGenerated:true}),false);
  assert.equal(plant.plantIncidentState().triggerTakeOrdinal,2);
});

test('the baggable spanner bypasses hauling and can begin the physical isolation',()=>{
  plant.resetPlantIncident();plant.collectPlantSpanner();
  plant.triggerPlantIncident({takeOrdinal:3,spoiled:true,playerGenerated:true});
  assert.equal(plant.beginPlantIsolation(plant.PLANT_TOOL.SPANNER,100),true);
  assert.equal(plant.completePlantIsolation(),true);
  assert.equal(plant.plantIncidentState().phase,plant.PLANT_INCIDENT_PHASE.SEALED);
  assert.equal(plant.plantRecordingBlocked(),false);
});

test('the Stillson cannot enter the bag, scrapes every 1.5m, and preserves position',()=>{
  plant.resetPlantIncident();
  plant.triggerPlantIncident({takeOrdinal:2,spoiled:true,playerGenerated:true});
  assert.equal(plant.gripHeavyWrench({x:140,y:12}),true);
  assert.equal(plant.moveHeavyWrench({x:139,y:12},{distanceMetres:.5}).scrape,false);
  assert.equal(plant.moveHeavyWrench({x:138,y:12},{distanceMetres:1}).scrape,true);
  const saved=plant.savePlantIncident();
  plant.resetPlantIncident();plant.loadPlantIncident(saved);
  assert.equal(plant.heavyWrenchDragging(),true);
  assert.deepEqual(plant.plantIncidentState().heavyPosition,{x:138,y:12});
  assert.equal(plant.beginPlantIsolation(plant.PLANT_TOOL.STILLSON,500),true);
});

test('haul pose remains in the authored rear band and never jumps ahead',()=>{
  const trail=Array.from({length:31},(_,i)=>({x:i,y:0}));
  const pose=plant.haulHushPose({trail,player:{x:30,y:0},cellsPerMetre:2});
  assert.ok(pose.x<=14,'eight metres of trail remain behind the player');
  assert.ok(pose.distanceMetres>=8&&pose.distanceMetres<=14);
});

test('a saved pressure incident stays quiet until B3 counts and never blocks B3 or calibration',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const functions=['plantIncidentAvailable','plantIncidentActive','plantBlocksTake',
    'syncPlantIncidentProps','currentPlantPipeFrame','gripPlantHeavyWrench'];
  const source=functions.map(name=>{
    const start=main.indexOf(`function ${name}(`);
    const end=main.indexOf('\n}',start);
    assert.ok(start>=0&&end>start,name);
    return main.slice(start,end+2);
  }).join('\n');
  const takes=new Set(),ledgerRooms=[],props=new Map();
  let gripChoice=null,inB3=false;
  const save={run:{ledger:{takes:{rooms:ledgerRooms}}}};
  const context=createContext({
    PLANT:plant,REC:{hasTake:room=>takes.has(room)},getSave:()=>save,
    LEVEL_CHECK_ROOM:'loading_dock',storyMode:true,planName:'conservatory',
    usingPlan:()=>true,usingSpecialSpace:()=>false,inB3Space:()=>inB3,plantIsolationPresentation:null,
    FP:{isLoaded:()=>true,toRuntimePoint:point=>point,logicalToPhysical:()=>({x:33,z:37.5})},
    PROPS:{setLooseProp:(id,prop)=>props.set(id,prop),restoreAuthoredProp(){}},
    px:66,py:75,CELL:.5,plantPipeAt:()=>({audible:true,world:.6,monitor:.8,pan:0}),
    HEAVY_WRENCH_THOUGHT:{},think:(id,thought,{onChoice})=>{gripChoice=onChoice;},
    plantHaulRestoreTimer:0,plantHaulTrail:[],lastPlantDragVector:null,trail:[],clearTimeout,
    refreshWorldProps(){},savePlantIncident(){},
  });
  runInContext(source,context);
  plant.loadPlantIncident({phase:'hissing',triggerTakeOrdinal:2});
  try{
    assert.equal(context.plantBlocksTake('the_tub'),false);
    assert.equal(context.currentPlantPipeFrame().audible,false);
    context.syncPlantIncidentProps({refresh:false});
    assert.equal(props.get('plant-header-steam'),null);
    assert.equal(context.gripPlantHeavyWrench({rx:140,ry:12}),false);
    assert.equal(gripChoice,null);
    assert.equal(plant.plantIncidentState().phase,'hissing','deferral preserves the saved incident');

    takes.add('main_b3');
    assert.equal(context.plantBlocksTake('the_tub'),true);
    assert.equal(context.plantBlocksTake('main_b3'),false);
    assert.equal(context.plantBlocksTake('loading_dock'),false);
    assert.equal(context.currentPlantPipeFrame().audible,true);
    inB3=true;
    assert.equal(context.currentPlantPipeFrame().audible,false,'B3 stays clear during the incident');
    inB3=false;
    context.syncPlantIncidentProps({refresh:false});
    assert.equal(props.get('plant-header-steam').mesh,'plant_steam');
    assert.equal(context.gripPlantHeavyWrench({rx:140,ry:12}),true);
    gripChoice({wrenchChoice:'take'});
    assert.equal(plant.heavyWrenchDragging(),true);

    ledgerRooms.push('main_b3');
    takes.delete('main_b3');
    assert.equal(context.plantBlocksTake('the_tub'),true,'losing the cassette preserves the earned milestone');
    assert.equal(context.plantBlocksTake('main_b3'),false,'a replacement B3 recording stays available');

    plant.resetPlantIncident();
    gripChoice=null;
    assert.equal(context.gripPlantHeavyWrench({rx:140,ry:12}),false,'the wrench stays on the rack until needed');
    assert.equal(gripChoice,null);
  }finally{plant.resetPlantIncident();}
});
