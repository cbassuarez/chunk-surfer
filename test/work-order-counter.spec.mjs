import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {WORK_ORDER_ACCEPTED_FLAG,workOrderAccepted} from '../src/game/work-order-state.js';
import {nightClockReadout} from '../src/game/night-clock.js';
import {navigatorTelemetryState} from '../src/render/navigator-telemetry.js';
import {sampleNavigatorLcdMotion} from '../src/render/navigator-lcd-motion.js';
import {EVENT_TYPES} from '../src/progression/events.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const fn=name=>{const a=main.indexOf(`function ${name}(`),b=main.indexOf('\n}',a);assert.ok(a>=0&&b>a);return main.slice(a,b+2);};
function telemetry(flags,takes=[]){
 const a=main.indexOf('telemetry:{takesEnabled:')+'telemetry:'.length;assert.ok(a>10);
 let depth=0,b=a;for(;b<main.length;b++){if(main[b]==='{')depth++;else if(main[b]==='}'&&--depth===0){b++;break;}}
 assert.equal(depth,0,'the complete actual telemetry object is extracted independently of its caller closing brace');
 return vm.runInNewContext(`(${main.slice(a,b)})`,{workOrderAccepted,nightClockReadout,getSave:()=>({flags}),save:{flags},rec:{takes,injuries:0},paused:false,
  monitorDisplaySnapshot:()=>({db:-96,segments:0}),performance:{now:()=>1000},dockCommandUntil:0});
}
test('the actual navigator submission hides takes before signing even with a packed case, plan or previewed work order',()=>{
 for(const flags of [{},{'bag.taken':true,'map.taken':true},{'radio.work-order-read':true},{'cold.exit.prepared':true}]){
  assert.equal(workOrderAccepted(flags),false);const raw=telemetry(flags,['main_b3']),state=navigatorTelemetryState(raw);
  assert.equal(raw.takesEnabled,false);assert.equal(state.takes,0);assert.equal(state.total,0);assert.deepEqual(state.slots,[]);
  assert.equal(state.monitor.available,true,'the real monitor remains available before the assignment');
 }
 assert.equal(navigatorTelemetryState(telemetry({[WORK_ORDER_ACCEPTED_FLAG]:true})).total,5);
 assert.equal(workOrderAccepted({prologueDone:true}),true,'legacy signed handover survives reload');
});
test('the production signature line durably accepts the job before the existing physical key handover',()=>{
 const save={flags:{}},writes=[],progress=[];
 const h={WORK_ORDER_ACCEPTED_FLAG,getSave:()=>save,flagTest:k=>save.flags[k]===true,
  flagSet:k=>{save.flags[k]=true;},saveCommit:p=>writes.push(JSON.parse(JSON.stringify(p))),
  noteExteriorConversation:()=>{},setBoothPresentationPose:()=>{},boothPoseForLine:()=> 'idle',
  flagApply:keys=>keys.forEach(k=>{save.flags[k]=true;}),syncPrologueKeyring:()=>{},STORY:{stopOpeningSceneBed:()=>{}},
  EVENT_TYPES,emitProgress:(type,payload,source)=>progress.push({type,payload,source})};
 vm.createContext(h);vm.runInContext(fn('guardConversationLine'),h);
 h.line={sourceId:'threshold.line.2'};vm.runInContext('guardConversationLine(line)',h);assert.equal(workOrderAccepted(save.flags),false);
 h.line={sourceId:'threshold.line.3'};vm.runInContext('guardConversationLine(line)',h);assert.equal(workOrderAccepted(save.flags),true);assert.equal(writes.length,1);
 vm.runInContext('guardConversationLine(line)',h);assert.equal(writes.length,1,'duplicate line callback is idempotent');
 assert.equal(progress.length,1);assert.equal(progress[0].type,EVENT_TYPES.WORK_ORDER_ACCEPTED);
 assert.equal(workOrderAccepted(JSON.parse(JSON.stringify(writes[0].flags))),true);
});
test('unaccepted task digits and slots cannot retain an earned-take flash when their bank goes dark',()=>{
 const state=navigatorTelemetryState({takesVisible:false,takes:4,total:5,monitor:{db:-96,segments:0}});
 let motion=sampleNavigatorLcdMotion(null,navigatorTelemetryState({takes:2}),{nowMs:0});
 motion=sampleNavigatorLcdMotion(motion,navigatorTelemetryState({takes:3}),{nowMs:16});assert.equal(motion.takeResponse,1);
 motion=sampleNavigatorLcdMotion(motion,state,{nowMs:32});assert.equal(motion.takeResponse,0);assert.equal(motion.changedSlot,-1);
 const accepted=navigatorTelemetryState({takesVisible:true,takes:0});motion=sampleNavigatorLcdMotion(motion,accepted,{nowMs:48});
 assert.equal(motion.takeResponse,0,'accepting a task is not earning a take');
});
