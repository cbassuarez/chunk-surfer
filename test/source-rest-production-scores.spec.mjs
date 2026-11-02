import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceRestScores} from '../src/audio/source-rest-scores.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestCouperinAffliction} from '../src/game/source-rest-couperin-affliction.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {createSourceRestRecorderWindow} from '../src/platform/source-rest-recorder-window.js';
import {windowChoreographyPolicy} from '../src/platform/window-choreography.js';
import {createSourceRestWeatherScore} from '../src/game/source-rest-weather-score.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const choreography=readFileSync(new URL('../src/platform/window-choreography.js',import.meta.url),'utf8');
function between(a,b){const start=main.indexOf(a);assert.ok(start>=0,a);const end=main.indexOf(b,start);assert.ok(end>start,b);return main.slice(start,end);}
function owner(){let active=false,playing=false,starts=0,finishes=0;const ducks=[],updates=[];
  return {ducks,updates,start(){active=true;playing=true;starts++;},stop(){active=false;playing=false;},
    update(value){playing=active&&!value.paused;updates.push(value);},dispose(){},
    setProgrammeDuck:(value,options)=>ducks.push({value,...options}),setAfflictionActive(value){assert.equal(value,false);},
    finishAfterCycle(){finishes++;},snapshot:()=>({active,playing,starts,finishes,currentTime:420,duration:843.157})};}
const call=(source,environment)=>Function(...Object.keys(environment),'return ('+source+');')(...Object.values(environment));

function recorderNativeGate({enabled=true,introduced=true,fullscreen=true}={}){
  const extract=(start,end)=>{const a=choreography.indexOf(start),b=choreography.indexOf(end,a);assert.ok(a>=0&&b>a,start);return choreography.slice(a,b);};
  const calls=[];let acknowledge=null,held=false,signal=null;
  const runtimeApi={invoke:async(command,payload)=>{
    calls.push({command,payload});if(command==='chunk_window_metrics')return{native_fullscreen:fullscreen};
    assert.equal(command,'chunk_window_choreography_begin');return true;
  }};
  // Execute the production gate, measured-fullscreen probe and transaction
  // methods unchanged. Only native IPC and the visible consent scene are
  // doubles; this is lifecycle/ownership evidence, not native observation.
  const environment={nativeDesired:()=>enabled,compositionContext:()=>({introduced}),sourceDesktop:null,
    loadApi:async()=>runtimeApi,getDisplayMode:()=> 'windowed',stableId:value=>value,tokenFactory:()=> 'rest-native-gate',
    safe:async operation=>{try{return await operation();}catch(_){return null;}},
    windowChoreographyPolicy,onState:()=>{},logWarn:async()=>{},
    releaseFullscreen:(transition,options)=>{
      held=true;signal=options.signal;
      return new Promise(resolve=>{
        acknowledge=async()=>{const result=await transition();held=false;resolve(result);};
        signal.addEventListener('abort',()=>{held=false;resolve(false);},{once:true});
      });
    },
  };
  const director=Function(...Object.keys(environment),
    'let epoch=0,transaction=null,transactionOpening=null;'+
    extract('  async function measuredFullscreen(','  async function performPlan(')+
    extract('  async function requestSourceRestRecorder(','  async function endStudy(')+
    'return {request:requestSourceRestRecorder,invalidate(){epoch++;transactionOpening?.controller.abort();}};')(...Object.values(environment));
  return{...director,calls,isHeld:()=>held,signal:()=>signal,acknowledge:()=>acknowledge()};
}

test('the Source recorder waits for measured-fullscreen consent and a fresh unheld frame before its first visible publication',async()=>{
  const gate=recorderNativeGate(),calls=[],errors=[],frame={phase:'catch',mode:'seated',seatId:'source-iii',
    machine:{trace:true,face:{counter:'00:00'}},presentation:{stage:0,progress:0,suppressPeripheral:false,empty:false}};
  const presenter=createSourceRestRecorderWindow({getFrame:()=>frame,getHeld:gate.isHeld,getEnabled:()=>true,isNative:()=>true,
    requestNativePresentation:gate.request,onError:error=>errors.push(error),drawContainedFallback:()=>calls.push('fallback'),
    createNativeSurface:async()=>{calls.push('create');return{
      publish:async envelope=>{assert.equal(envelope.held,false);calls.push('publish');return true;},
      show:async()=>calls.push('show'),hide:async()=>calls.push('hide'),close:async()=>calls.push('close'),
    };},
  });
  const opening=presenter.toggle();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(gate.isHeld(),true);assert.deepEqual(gate.calls.map(value=>value.command),['chunk_window_metrics']);
  assert.deepEqual(calls,[],'the consent notice precedes both native creation and publication');
  await presenter.update();await gate.acknowledge();await opening;
  assert.equal(presenter.state().mode,'native');assert.equal(presenter.state().visible,false);
  assert.deepEqual(calls,['create'],'the stale held sample cannot send a blank first envelope or trigger fallback');
  assert.equal(gate.calls[1].payload.request.sceneId,'source:continuation');assert.equal(gate.calls[1].payload.request.restoreGameMode,true);
  await presenter.update();assert.deepEqual(calls,['create','publish','show']);assert.equal(presenter.state().visible,true);assert.deepEqual(errors,[]);
  await presenter.dispose();
});

test('cancelling the Source owner during native consent aborts a late transaction and never creates a recorder window',async()=>{
  const gate=recorderNativeGate(),calls=[],frame={phase:'wrong-return',mode:'seated',seatId:'source-ii',
    machine:{trace:true,face:{}},presentation:{stage:0,progress:0,suppressPeripheral:false,empty:false}};
  const presenter=createSourceRestRecorderWindow({getFrame:()=>frame,getHeld:gate.isHeld,getEnabled:()=>true,isNative:()=>true,
    requestNativePresentation:gate.request,createNativeSurface:async()=>{calls.push('create');throw new Error('must not create');},
    drawContainedFallback:()=>calls.push('fallback')});
  const opening=presenter.toggle();await new Promise(resolve=>setImmediate(resolve));
  await presenter.close('source-exit');gate.invalidate();await opening;
  assert.equal(gate.signal().aborted,true);await gate.acknowledge();
  assert.equal(presenter.state().requested,false);assert.deepEqual(calls,[]);
  assert.deepEqual(gate.calls.map(value=>value.command),['chunk_window_metrics']);
});

test('the Source recorder native gate cannot bypass disabled effects, an unintroduced desktop or a stale player request',async()=>{
  for(const policy of[{enabled:false},{introduced:false},{}]){
    const gate=recorderNativeGate(policy),isCurrent=()=>Object.keys(policy).length>0;
    assert.equal(await gate.request({isCurrent}),false);assert.deepEqual(gate.calls,[]);
  }
});

test('production phase synchronization starts the selected performance once and retires it on an unsupported route',()=>{
  const bach=owner(),couperin=owner(),restMusic=createSourceRestScores({createBach:()=>bach,createCouperin:()=>couperin});
  let view={phase:'catch',ready:true};const scene={view:()=>view};
  let resets=0;
  const source=between('  const syncSourceRestPerformance=()=>{','  scene.update=dt=>');
  const sync=Function('scene','restMusic','sourceRestEndingMusic','endingStaticMix',source+'return syncSourceRestPerformance;')
    (scene,restMusic,null,{reset:()=>resets++});
  sync();sync();assert.equal(bach.snapshot().starts,0);assert.equal(couperin.snapshot().starts,1);
  view={phase:'wrong-return',ready:true};sync();sync();assert.equal(couperin.snapshot().active,false);assert.equal(bach.snapshot().starts,1);
  view={phase:'ellery',ready:true};sync();assert.equal(bach.snapshot().active,false);
  assert.equal(resets,2,'each real programme change retires the prior terminal static, never a repeated tick');restMusic.dispose();
});

test('the actual preparation-to-listening callback updates III mix and weather without replacing the audio owner',()=>{
  const seat=SOURCE_REST_SEATS[1],bach=owner(),couperin=owner(),restMusic=createSourceRestScores({createBach:()=>bach,createCouperin:()=>couperin});
  restMusic.selectPhase('catch');restMusic.start();const weather=[],breath=[];
  const scene={view:()=>({...seat,x:seat.x,z:seat.z}),sourceRest:{view:()=>({affliction:{facultyLoss:.63}})}};
  let decisionHeld=false,focused=true;
  let source=between('onRestProgress:(progress,active,weatherCue,phase)=>{','\n    onChange:').replace(/,\s*$/,'');
  source=source.slice('onRestProgress:'.length,-1); // closing conversationOptions object
  const update=call(source,{scene,restMusic,entry:{checkpoint:{phase:'catch'}},paused:false,document:{hidden:false},
    scenes:{top:()=>({view:()=>({restDecisionHeld:decisionHeld})})},gameplayInputLifecycleActive:()=>focused,
    restBreath:{update:value=>breath.push(value)},restWeather:{update:value=>weather.push(value)},SOURCE_REST_SEATS,renderer:{diagnostics:()=>null}});
  update(.56,true,{rain:.2,musicDuck:{gain:.4,attackSeconds:.08,recoverySeconds:2.8}},'catch');decisionHeld=true;update(.56,true,{rain:.2,musicDuck:{gain:.4}});
  assert.equal(restMusic.snapshot().phase,'catch');assert.equal(restMusic.snapshot().faculty,.63);assert.equal(restMusic.snapshot().restActive,true);
  assert.equal(restMusic.snapshot().decisionHeld,true);assert.deepEqual(couperin.ducks.at(-1),{value:.4,seconds:.08});
  assert.equal(couperin.snapshot().starts,1);assert.equal(weather.at(-1).active,true);assert.equal(breath.at(-1).audible,true);
  focused=false;update(.57,true,{rain:.3,musicDuck:{gain:.7}});assert.equal(weather.at(-1).active,false);assert.equal(weather.at(-1).hold,true);
  assert.equal(breath.at(-1).audible,false);assert.equal(couperin.snapshot().starts,1);
  focused=true;decisionHeld=false;update(0,false,null);assert.equal(restMusic.snapshot().restActive,false);assert.equal(restMusic.snapshot().decisionHeld,false);
  assert.deepEqual(couperin.ducks.at(-1),{value:1,seconds:2.8});assert.equal(couperin.snapshot().starts,1);restMusic.dispose();
});

test('actual funeral envelopes reach the production music callback as bounded gains, never an object-induced mute',()=>{
  const score=createSourceRestWeatherScore(),seat=SOURCE_REST_SEATS[1],ducks=[];
  let source=between('onRestProgress:(progress,active,weatherCue,phase)=>{','\n    onChange:').replace(/,\s*$/,'');
  source=source.slice('onRestProgress:'.length,-1);
  const update=call(source,{scene:{view:()=>seat,sourceRest:{view:()=>({})}},entry:{checkpoint:{phase:'catch'}},paused:false,
    document:{hidden:false},scenes:{top:()=>({view:()=>({})})},gameplayInputLifecycleActive:()=>true,
    renderer:{diagnostics:()=>null},restBreath:{update(){}},restWeather:{update(){}},SOURCE_REST_SEATS,
    restMusic:{selectPhase:()=>false,setRestProgress(){},setProgrammeDuck:(gain,options)=>ducks.push({gain,...options}),snapshot:()=>({playing:true})}});
  const cue=(time,audioTime)=>score.update({phase:'catch',active:false,funeralActive:true,musicTime:time,audibleSeconds:time,audioTime});
  update(.1,true,cue(0,0),'catch');assert.equal(ducks.at(-1).gain,1,'no strike keeps the full performance audible');
  cue(14.1,1);update(.1,true,cue(14.2,1.1),'catch');
  assert.ok(ducks.at(-1).gain>.7&&ducks.at(-1).gain<.72);assert.equal(ducks.at(-1).seconds,.08);
  update(.1,true,cue(14.3,4),'catch');assert.equal(ducks.at(-1).gain,1);assert.equal(ducks.at(-1).seconds,2.8);
  assert.ok(ducks.every(duck=>typeof duck.gain==='number'&&duck.gain>0));
});

test('committed III uses the same no-error-stinger score and completes its current cycle',()=>{
  const bach=owner(),couperin=owner(),restMusic=createSourceRestScores({createBach:()=>bach,createCouperin:()=>couperin});
  const source=between('    onChange:rest=>{','\n    onError:error=>{').trim().replace(/^onChange:/,'').replace(/,\s*$/,'');
  const scene={},receipts=[];
  const change=call(source,{restMusic,scene,persistNightRestLock:(...args)=>receipts.push(args)});change({phase:'catch',mode:'committed'});
  assert.equal(receipts[0][0],scene);assert.equal(receipts[0][1].phase,'catch');
  assert.equal(bach.snapshot().starts,0);assert.equal(couperin.snapshot().starts,1);assert.equal(couperin.snapshot().finishes,1);restMusic.dispose();
});

test('III production scenery retains real supports, builds its own shelter and makes the return spatially impossible',()=>{
  const seat=SOURCE_REST_SEATS[1],state={...freshSourceContinuation({runId:'production-iii'}),...seat.approach,status:'active',phase:seat.phase,
    chartId:seat.chartId,feet:seat.feet,level:seat.level,yaw:seat.view.yaw,pitch:seat.view.pitch,fall:null,recovery:null,reveal:null};
  const at=progress=>sourceContinuationRenderFrame({...state,sourceRestView:{seatId:seat.id,mode:'seated',progress:1,look:seat.view,degradation:progress,
    musicTime:progress*843.157125,affliction:{...sourceRestCouperinAffliction({active:true,progress,currentTime:progress*843.157125,playedSeconds:progress*843.157125}),embodied:true,bodyProgress:1,canLeave:false}}});
  const first=at(.3),late=at(.8);
  assert.ok(first.props.filter(p=>p.restPlace&&p.region==='catch').length>=22);
  assert.equal(first.props.some(p=>p.id.includes('rest-settle-cloth')),false);
  assert.equal(first.props.some(p=>p.id.includes('rest-canopy-shade')),false);
  assert.ok(first.lights.filter(p=>p.restPlace).every(p=>p.region==='catch'));
  assert.equal(first.restReturn.active,true);assert.equal(first.restReturn.seatId,seat.id);
  assert.deepEqual(first.geometry.surfaces,late.geometry.surfaces);
  assert.ok(late.props.some(p=>p.region==='catch'&&p.restDrift>0));
  assert.ok(first.counts.props<1900&&late.counts.props<1900);
});
