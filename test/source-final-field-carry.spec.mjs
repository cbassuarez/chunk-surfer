import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=main.indexOf('// THE LAST DOOR. Source holds the night clock'),end=main.indexOf('// Only the authored third visit',start);
assert.ok(start>=0&&end>start,'the actual final-door wrapper block remains discoverable');
const wrappers=main.slice(start,end),copy=value=>value==null?value:JSON.parse(JSON.stringify(value));
function harness({owes=true,fieldAccepted=true,carry={yaw:.71,pitch:-.24},throwReal=false}={}){
 const calls=[],requests=[],flags={},env={sourceDoorCarry:carry,memoryFieldScene:null,storyMode:owes,lastMinutes:{tickAt:0},
  CHAPEL_TOWER_PHASE:{TRANSITION_READY:'transition-ready'},chapelTowerState:()=>({phase:'transition-ready'}),sixLoopActive:()=>false,memoryFieldFlag:id=>`memory.field.${id}`,flagTest:key=>!!flags[key],
  beginMemoryField:(id,options)=>{requests.push({id,options});if(fieldAccepted){flags[`memory.field.${id}`]=true;env.memoryFieldScene={id};}return fieldAccepted;},
 };
 for(const route of['chapel','tower'])env[route==='chapel'?'beginChapelFromHorizon':'beginSourceTowerTransition']=(...args)=>{
  calls.push({route,carry:copy(env.sourceDoorCarry),reference:env.sourceDoorCarry,args});if(throwReal)throw Error('destination failed');return `${route}:started`;
 };
 vm.createContext(env);vm.runInContext(wrappers,env);
 const invoke=(route,...args)=>env[route==='chapel'?'beginChapelFromHorizon':'beginSourceTowerTransition'](...args);
 const complete=async()=>{assert.equal(requests.length,1);env.memoryFieldScene=null;return Promise.resolve().then(()=>requests[0].options.onDone());};
 return{env,flags,calls,requests,invoke,complete};
}

for(const route of['chapel','tower'])test(`${route}: delayed canonical fifth preserves the exact crossing yaw/pitch after the transient owner clears it`,async()=>{
 const original={yaw:.71,pitch:-.24},h=harness({carry:original}),argument={door:'actual-branch-threshold'};
 assert.equal(h.invoke(route,argument,23),true);assert.equal(h.requests[0].id,'fifth');assert.equal(h.calls.length,0,'the destination cannot commit before the actual field completion');
 // Model tickSourceDoorArrival's finally, followed by unrelated later work.
 h.env.sourceDoorCarry=null;original.yaw=-2.3;original.pitch=.9;
 await h.complete();assert.equal(h.calls.length,1);assert.equal(h.calls[0].route,route);assert.deepEqual(h.calls[0].carry,{yaw:.71,pitch:-.24});assert.notEqual(h.calls[0].reference,original,'the crossing pose is a captured value, not a shared mutable reference');
 assert.equal(h.calls[0].args[0],argument);assert.equal(h.calls[0].args[1],23);assert.equal(h.env.sourceDoorCarry,null,'the completed handoff must not leave the old crossing carry globally installed');
});

for(const route of['chapel','tower'])test(`${route}: final-field callback restores an unrelated current carry even when the real destination throws`,async()=>{
 const crossing={yaw:1.2,pitch:-.18},h=harness({carry:crossing,throwReal:true});assert.equal(h.invoke(route),true);
 const unrelated={yaw:-.8,pitch:.31};h.env.sourceDoorCarry=unrelated;
 await assert.rejects(h.complete(),/destination failed/);assert.deepEqual(h.calls[0].carry,crossing,'the thrown destination still receives this crossing, not the later one');assert.equal(h.env.sourceDoorCarry,unrelated,'finally restores the callback-time owner by identity');
});

for(const route of['chapel','tower'])test(`${route}: already-delivered or ineligible final fields retain ordinary immediate transition semantics`,()=>{
 for(const owes of[true,false]){
  const carry={yaw:-.4,pitch:.16},h=harness({owes,carry});if(owes)h.flags['memory.field.fifth']=true;
  assert.equal(h.invoke(route,'live'),`${route}:started`);assert.equal(h.requests.length,0);assert.equal(h.calls.length,1);assert.equal(h.calls[0].reference,carry);assert.equal(h.env.sourceDoorCarry,carry);
 }
});

for(const route of['chapel','tower'])test(`${route}: refused field preparation falls through once, and an already-owned field cannot start another destination`,()=>{
 const carry={yaw:2.5,pitch:.08},h=harness({fieldAccepted:false,carry});assert.equal(h.invoke(route,'fallback'),`${route}:started`);assert.equal(h.requests.length,1);assert.equal(h.calls.length,1);assert.equal(h.calls[0].reference,carry);
 const active=harness({carry});active.env.memoryFieldScene={id:'another-canonical-visit'};assert.equal(active.invoke(route),true);assert.equal(active.requests.length,0);assert.equal(active.calls.length,0);assert.equal(active.env.sourceDoorCarry,carry);
});

test('a genuinely absent original crossing carry cannot borrow an unrelated pose during its delayed completion',async()=>{
 const h=harness({carry:null});h.invoke('chapel');const later={yaw:2.3,pitch:.41};h.env.sourceDoorCarry=later;await h.complete();assert.equal(h.calls[0].carry,null);assert.equal(h.env.sourceDoorCarry,later);
});
