import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceContinuationScene} from '../src/game/source-continuation-scene.js';
import {freshSourceContinuation} from '../src/game/source-continuation.js';
import {installSourceRest} from '../src/game/source-rest-runtime.js';

const renderer=()=>({initialize:async()=>true,ready:()=>true,render:()=>true,dispose:()=>{}});
test('live pose and safety reads do not serialize the saved encounter or expose its histories',async()=>{
 const scene=createSourceContinuationScene({checkpoint:freshSourceContinuation(),renderer:renderer()});
 await scene.initialize();const saved=scene.serialize(),stringify=JSON.stringify;let serializations=0;
 JSON.stringify=(...args)=>{serializations++;return stringify(...args);};
 let status;
 try{for(let i=0;i<100;i++)status=scene.statusView();}finally{JSON.stringify=stringify;}
 assert.equal(serializations,0,'status checks cannot copy the full pursuit trail');
 for(const key of ['x','z','feet','yaw','pitch','phase','chartId','level','status','elapsed','grace'])assert.equal(status[key],saved[key]);
 for(const key of ['fall','recovery','reveal','cameraTransit','bodyTransit'])assert.equal(status[key],!!saved[key]);
 assert.equal(status.ready,true);assert.equal(Object.hasOwn(status,'hush'),false);
 assert.equal(scene.performanceWorldActive,true,'the borrowed playable world can use Auto quality');
 status.x=999;assert.equal(scene.serialize().x,saved.x,'the status object cannot mutate the body');
 const first=scene.view();first.hush.trail.push({x:999,z:999});
 assert.equal(scene.view().hush.trail.some(p=>p.x===999),false,'full review/save snapshots remain defensive');
 scene.pause();assert.equal(scene.statusView().paused,true);assert.equal(scene.performanceWorldActive,false);
 scene.resume();assert.equal(scene.statusView().paused,false);assert.equal(scene.performanceWorldActive,true);
 scene.exit();assert.equal(scene.statusView().closed,true);assert.equal(scene.performanceWorldActive,false);
});

test('ordinary rest systems use the live projection while preserving immediate focus and safety',async()=>{
 const r=renderer(),scene=createSourceContinuationScene({checkpoint:freshSourceContinuation(),renderer:r});
 await scene.initialize();let fullReads=0;const view=scene.view;scene.view=()=>{fullReads++;return view();};
 const rest=installSourceRest(scene,r,{conversationOptions:{getMusicState:()=>({})},paintPrompt:()=>{}});
 for(let i=0;i<5;i++){scene.update(.016);rest.focus();}
 assert.equal(fullReads,0,'weather and focus checks do not duplicate save snapshots');
 assert.equal(rest.focus(),null,'no rest interaction is invented away from the protected seat');
 rest.dispose();scene.exit();
});
