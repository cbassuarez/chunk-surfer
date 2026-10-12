import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createPressurePerformance, normalizePressurePresentation } from '../src/game/pressure-performance.js';
import { freshPressureGait } from '../src/game/pressure-gait.js';

const sourceText=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function productionFunction(name){
  const start=sourceText.indexOf(`function ${name}(`);
  assert.ok(start>=0,`missing production function ${name}`);
  const end=sourceText.indexOf('\n}\n',start);
  return sourceText.slice(start,end+3);
}
function harness(){
  const context={
    pressurePerformance:createPressurePerformance(),normalizePressurePresentation,recordingPressureVisualOrigin:null,
    storyMode:true,source:false,special:false,paused:false,focused:true,hushRunActive:false,top:null,worldView:null,blocked:false,
    reduced:false,now:1000,sourceFloor:4.2,sourceMode:{meeting:false},bracket:null,dockLook:null,plantHaulSnapshot:null,
    presence:{active:true,x:4,y:6,velocityX:2,velocityY:0,behaviorMode:'chase',spawnedAt:100},
    practiceTenant:null,hush:{active:false,x:0,y:0,vx:0,vy:0},recordingFalseHush:null,hushFieldFrame:{},dockHauntingFrame:null,
    sourcePlayerShadowFrame:null,sourceRepriseShadowStage:null,RENDERER:'3d',syncCount:0,appliedOutskirts:null,
    CHAPEL_TOWER_PHASE:{TOWER_ACTIVE:'tower'},
  };
  Object.assign(context,{
    scenes:{worldView:()=>context.worldView,top:()=>context.top,blocksWorld:()=>context.blocked},
    document:{hidden:false,hasFocus:()=>context.focused},performance:{now:()=>context.now},
    usingSourceSpace:()=>context.source,usingSpecialSpace:()=>context.source||context.special,usingPlan:()=>true,
    hushActiveForPlayer:()=>context.presence.active,hushAbsenceLook:()=>({strength:.84,radiusM:5.8}),
    hushDreadAt:()=>.4,coverPeekAmount:()=>0,chapelTowerState:()=>({phase:'inactive'}),
    dockHauntingBodyLook:()=>context.dockLook,PRES:{presenceState:()=>context.presence},
    FP:{isLoaded:()=>true,worldAt:()=> 'recorded-room',logicalToPhysical:(x,y)=>({x:100-y,z:200+x,y:2,renderGroup:'floor'})},
    chunkSurfRuntime:{geometry:{floorAt:()=>context.sourceFloor},hushMode:()=>context.sourceMode,
      sourceBracketFrame:()=>context.bracket,applyOutskirtsCharacterFrame:frame=>{context.appliedOutskirts=frame;}},
    recordingHallucinationVisualFrame:()=>({alpha:1,scaleX:1,scaleY:1}),shakeMode:()=>context.reduced?'reduced':'full',
    PROPS:{setLooseProp:()=>{}},R3:{r3dSetProps:()=>{}},syncSourceRender:()=>{context.syncCount++;},
    sourceGeometry:()=>null,worldRenderInstances:()=>[],
  });
  vm.createContext(context);
  vm.runInContext(['pressurePresentationInputs','pressurePresentationSnapshot','pressureRenderFrame','sourceRepriseFrame','tickPressurePerformance','syncPlayerShadowFigure']
    .map(productionFunction).join('\n')+'\nglobalThis.api={pressurePresentationInputs,pressurePresentationSnapshot,pressureRenderFrame,sourceRepriseFrame,tickPressurePerformance,syncPlayerShadowFigure};',context);
  return context;
}

test('main resolves real Pressure in physical cells with transformed velocity and no camera-facing heading',()=>{
  const h=harness();h.api.tickPressurePerformance(.1);
  const first=h.api.pressurePresentationSnapshot().primary;
  assert.equal(first.performance.role,'live-pressure');
  assert.equal(first.x,94);assert.equal(first.y,204);assert.equal(first.floorH,2);
  assert.equal(first.heightM,2.18);
  assert.ok(Math.abs(Math.abs(first.performance.heading)-Math.PI)<1e-8,'logical velocity was not transformed into world heading');
  h.worldView={yaw:1.7,pitch:.6};h.api.tickPressurePerformance(.1);
  assert.equal(h.api.pressurePresentationSnapshot().primary.performance.heading,first.performance.heading,'observer yaw turned the actor');
});

test('main carries the ordinary arrested gait through the physical map once, including planted turn anchors',()=>{
  const h=harness();
  h.presence.gait={...freshPressureGait({seed:7}),phase:'advance',heading:0,startHeading:0,targetHeading:Math.PI/2,
    stepStartX:4,stepStartY:6,travelMetres:.14,progress:1/3};
  h.api.tickPressurePerformance(.1);
  const actor=h.api.pressurePresentationSnapshot().primary, gait=actor.performance.gait;
  assert.equal(actor.performance.clip,'pressure_advance');assert.equal(actor.performance.loop,false);
  assert.ok(Math.abs(actor.performance.time-.24)<1e-8);
  assert.ok(Math.abs(gait.heading-Math.PI/2)<1e-8);assert.ok(Math.abs(Math.abs(gait.targetHeading)-Math.PI)<1e-8);
  assert.equal(gait.stepStartX,94);assert.equal(gait.stepStartY,204);
  h.presence.gait.stepStartX=999;h.worldView={yaw:-1};
  assert.equal(actor.performance.gait.stepStartX,94,'live caller rewrote the captured support anchor');
  h.source=true;h.api.tickPressurePerformance(.1);
  assert.equal(h.api.pressurePresentationSnapshot().primary.performance.gait,undefined,'Source borrowed hunter scheduling');
});

test('main freezes pause, visibility, focus and ordinary modal holds, while authored plant presentation continues',()=>{
  const h=harness();h.api.tickPressurePerformance(.1);
  const before=h.pressurePerformance.snapshot();
  for(const hold of ['paused','hidden','unfocused','modal']){
    h.paused=hold==='paused';h.document.hidden=hold==='hidden';h.focused=hold!=='unfocused';h.blocked=hold==='modal';
    h.presence.x++;h.api.tickPressurePerformance(.25);
    assert.deepEqual(h.pressurePerformance.snapshot(),before,`${hold} advanced or changed Pressure`);
  }
  h.paused=false;h.document.hidden=false;h.focused=true;h.blocked=true;h.top={id:'plant-header-isolation'};
  h.worldView={plantRear:{x:7,y:8,yaw:.62,rung:3}};h.api.tickPressurePerformance(.1);
  const plant=h.pressurePerformance.snapshot();
  assert.equal(plant.secondary.performance.role,'plant-hallucination');
  assert.ok(Math.abs(plant.secondary.performance.heading-.62)<1e-8);
  assert.equal(plant.secondary.performance.clip,'pressure_hold');
  assert.ok(plant.clock>before.clock);
});

test('Source rear, forward bracket and court trace retain separate authored bearings and presentation roles',()=>{
  const h=harness();h.source=true;h.presence.velocityX=0;
  h.bracket={front:{visible:true,x:6,y:-40,strength:.8}};h.api.tickPressurePerformance(.1);
  const bracket=h.pressurePerformance.snapshot();
  assert.equal(bracket.primary.performance.role,'source-rear');assert.equal(bracket.primary.performance.heading,0);
  assert.equal(bracket.secondary.performance.role,'source-front');assert.equal(bracket.secondary.performance.heading,Math.PI);
  assert.equal(bracket.primary.floorH,4.2);assert.equal(bracket.primary.heightM,2.18);
  h.sourceMode={meeting:true};h.bracket=null;h.api.tickPressurePerformance(.1);
  const court=h.pressurePerformance.snapshot().primary;
  assert.equal(court.performance.role,'court-trace');assert.equal(court.performance.heading,Math.PI);assert.equal(court.heightM,1.83);
});

test('main applies recorded Pressure before rendering and never synthesizes a live body for old or cleared tapes',()=>{
  const h=harness();h.api.tickPressurePerformance(.1);
  const live=h.pressurePerformance.snapshot(),recorded=structuredClone(live);
  recorded.clock=18;recorded.primary.id='recorded';recorded.primary.x=400;recorded.primary.performance.time=8;
  h.hushRunActive=true;h.source=true;
  h.api.syncPlayerShadowFigure({spaceId:'source-space',x:1,y:2,pressurePresentation:recorded,outskirtsCharacters:{version:1}});
  assert.equal(h.syncCount,1);assert.equal(h.appliedOutskirts.version,1);
  for(let i=0;i<10;i++)h.api.tickPressurePerformance(.25);
  assert.deepEqual(h.pressurePerformance.snapshot(),recorded,'read-only replay followed live Presence or observer time');
  h.api.syncPlayerShadowFigure({spaceId:'source-space',x:1,y:2});
  h.api.tickPressurePerformance(.25);assert.equal(h.api.pressurePresentationSnapshot(),null,'old tape used a live actor fallback');
  h.api.syncPlayerShadowFigure(null);h.hushRunActive=false;
  assert.deepEqual(h.pressurePerformance.snapshot(),live,'returning from a borrowed room retained the recorded actor/clock');
  h.top={id:'source-reprise:review'};h.api.tickPressurePerformance(.25);
  assert.deepEqual(h.pressurePerformance.snapshot(),live,'Source reprise advanced the live clock');
});

test('tenant, plant and recording visual roles remain presentation-only, and capture reads the immutable snapshot',()=>{
  const h=harness();h.presence.active=false;h.practiceTenant={x:1,y:2,roomId:'practice'};
  h.api.tickPressurePerformance(.1);assert.equal(h.pressurePerformance.snapshot().primary.performance.role,'tenant');
  h.practiceTenant=null;h.recordingFalseHush={eventId:'false:7',x:7,y:9,startedAtMs:1000,expiresAtMs:5000,
    stageYaw:.3,strength:.9,radiusM:5.2,heightM:2.1,widthM:.7};h.api.tickPressurePerformance(.1);
  assert.equal(h.pressurePerformance.snapshot().secondary.performance.role,'recording-hallucination');
  assert.equal(h.presence.active,false);
  const capture=productionFunction('tickCausalCapture');
  assert.match(capture,/pressurePresentation:pressurePresentationSnapshot\(\)/);
  const loop=sourceText.slice(sourceText.indexOf('function loop(){'),sourceText.indexOf('let hushRunActive='));
  assert.ok(loop.indexOf('tickPressurePerformance(dt)')<loop.indexOf('tickCausalCapture(dt)'),'capture precedes presentation simulation');
  const render=productionFunction('render3d');
  assert.match(render,/const pressureFrame=pressureRenderFrame\(worldView\)/);
  assert.match(render,/hushBodyAllowed:pressureFrame\.allowed&&hushBodySpaceAllowed/);
  assert.doesNotMatch(render,/pressurePerformance\.(tick|cue|applyFrame)\(/,'rendering mutates the performance');
});

test('Source reprise preserves physical actor coordinates and permits only recorded Pressure through actor suppression',()=>{
  const h=harness();h.api.tickPressurePerformance(.1);
  const live=h.pressurePerformance.snapshot();
  h.worldView={suppressActors:true,sensoryProfile:'source-reprise'};h.top={id:'source-reprise:call-site'};
  assert.equal(h.api.pressureRenderFrame(h.worldView).primary,null,'suppressed reprise exposed live Pressure');
  const recorded=structuredClone(live);recorded.clock=14;recorded.primary.x=94;recorded.primary.y=204;
  recorded.primary.performance.time=1.7;
  const mapped=h.api.sourceRepriseFrame({x:4,y:6,yaw:.3,pressurePresentation:recorded},{roomId:'room'});
  assert.equal(mapped.x,4);assert.equal(mapped.y,6);assert.equal(mapped.floorH,2);
  assert.equal(mapped.pressurePresentation.primary.x,94,'physical actor was transformed twice');
  assert.equal(mapped.pressurePresentation.primary.y,204);
  recorded.primary.x=-999;
  assert.equal(mapped.pressurePresentation.primary.x,94,'recompiled frame shares a mutable recording');
  h.api.syncPlayerShadowFigure(mapped);
  const rendered=h.api.pressureRenderFrame(h.worldView);
  assert.equal(rendered.allowed,true);assert.equal(rendered.primary.x,94);assert.equal(rendered.primary.performance.time,1.7);
  h.top={id:'ordinary-modal'};
  assert.equal(h.api.pressureRenderFrame(h.worldView).primary,null,'recorded permission leaked to another modal');
  h.top={id:'source-reprise:call-site'};h.api.syncPlayerShadowFigure({...mapped,pressurePresentation:null});
  assert.equal(h.api.pressureRenderFrame(h.worldView).primary,null,'old reprise synthesized a live actor');
});
