// Recorder/HUSH contract without WebGL or audio: stalled time is exact,
// movement is allowed, and resuming is gated by the original recorder mark.
import * as REC from '../../../public/labs/chunk-surfer/src/game/recordist.js';
import { atRecorder } from '../../../public/labs/chunk-surfer/src/game/props.js';

let pass=true;
const ck=(name,ok,detail='')=>{console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);if(!ok)pass=false;};

REC.startListening();REC.startRecording();REC.tickRecording(7.25);
const heldAt=REC.recState().takeElapsed,origin={x:100,y:80};
REC.stallTake();
ck('HUSH enters the existing stalled take state',REC.isStalled());
ck('stalled time remains exact',REC.tickRecording(30)==='stalled'&&REC.recState().takeElapsed===heldAt,`${heldAt}s`);
REC.emitStepNoise(100,80);
ck('stalled movement does not spoil',!REC.recState().spoiled);
ck('resume is rejected away from the recorder mark',!atRecorder(origin,106,80));
ck('resume is accepted at the recorder mark',atRecorder(origin,101,81));
REC.resumeTake();REC.tickRecording(.75);
ck('resume continues from the held timestamp',REC.recState().takeElapsed===heldAt+.75,`${REC.recState().takeElapsed}s`);
REC.emitStepNoise(101,81);
ck('normal movement spoils again after resuming',REC.recState().spoiled);

if(!pass){console.error('\n❌ HUSH FAILURES');process.exit(1);}
console.log('\n✅ HUSH PASSED');
