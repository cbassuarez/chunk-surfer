import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceRestScores} from '../src/audio/source-rest-scores.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {SOURCE_REST_SEATS} from '../src/game/source-rest-seat.js';
import {sourceRestCouperinAffliction} from '../src/game/source-rest-couperin-affliction.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';

const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function between(a,b){const start=main.indexOf(a);assert.ok(start>=0,a);const end=main.indexOf(b,start);assert.ok(end>start,b);return main.slice(start,end);}
function owner(){let active=false,starts=0,finishes=0;return {start(){active=true;starts++;},stop(){active=false;},update(){},dispose(){},setAfflictionActive(value){assert.equal(value,false);},finishAfterCycle(){finishes++;},snapshot:()=>({active,playing:active,starts,finishes})};}
const call=(source,environment)=>Function(...Object.keys(environment),'return ('+source+');')(...Object.values(environment));

test('production phase synchronization starts the selected performance once and retires it on an unsupported route',()=>{
  const bach=owner(),couperin=owner(),restMusic=createSourceRestScores({createBach:()=>bach,createCouperin:()=>couperin});
  let view={phase:'catch',ready:true};const scene={view:()=>view};
  const source=between('  const syncSourceRestPerformance=()=>{','  scene.update=dt=>');
  const sync=Function('scene','restMusic',source+'return syncSourceRestPerformance;')(scene,restMusic);
  sync();sync();assert.equal(bach.snapshot().starts,0);assert.equal(couperin.snapshot().starts,1);
  view={phase:'wrong-return',ready:true};sync();sync();assert.equal(couperin.snapshot().active,false);assert.equal(bach.snapshot().starts,1);
  view={phase:'ellery',ready:true};sync();assert.equal(bach.snapshot().active,false);restMusic.dispose();
});

test('the actual preparation-to-listening callback updates III mix and weather without replacing the audio owner',()=>{
  const seat=SOURCE_REST_SEATS[1],bach=owner(),couperin=owner(),restMusic=createSourceRestScores({createBach:()=>bach,createCouperin:()=>couperin});
  restMusic.selectPhase('catch');restMusic.start();const weather=[],breath=[];
  const scene={view:()=>({...seat,x:seat.x,z:seat.z}),sourceRest:{view:()=>({affliction:{facultyLoss:.63}})}};
  let source=between('onRestProgress:(progress,active,weatherCue,phase)=>{','\n    onChange:').replace(/,\s*$/,'');
  source=source.slice('onRestProgress:'.length,-1); // closing conversationOptions object
  const update=call(source,{scene,restMusic,entry:{checkpoint:{phase:'catch'}},paused:false,document:{hidden:false},gameplayInputLifecycleActive:()=>true,
    restBreath:{update:value=>breath.push(value)},restWeather:{update:value=>weather.push(value)},SOURCE_REST_SEATS,renderer:{diagnostics:()=>null}});
  update(.56,true,{rain:.2},'catch');update(.56,true,{rain:.2});
  assert.equal(restMusic.snapshot().phase,'catch');assert.equal(restMusic.snapshot().faculty,.63);assert.equal(restMusic.snapshot().restActive,true);
  assert.equal(couperin.snapshot().starts,1);assert.equal(weather.at(-1).active,true);assert.equal(breath.at(-1).audible,true);
  update(0,false,null);assert.equal(restMusic.snapshot().restActive,false);assert.equal(couperin.snapshot().starts,1);restMusic.dispose();
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
