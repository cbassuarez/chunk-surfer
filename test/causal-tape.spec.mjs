import assert from 'node:assert/strict';
import {
  CAUSAL_TOPOLOGY_HASH,
  CAUSAL_SPINE_IDS,
  causalContentHash,
  packShadowFrames,
  sealCausalTape,
  shadowFrameAt,
  tapeQualifies,
  unpackShadowFrames,
  validateCausalTape,
} from '../src/causal/tape.js';

const frames=[];
for(let t=0;t<=10*60*1000;t+=500)frames.push({t,x:t<1000?t/500:2,y:3,floorH:-4,yaw:.25,pitch:0,roomId:'main_b3',renderGroup:'basement'});
const packed=packShadowFrames(frames);
assert.equal(packed.length,21,'ten idle minutes remain segmented without a duration cap');
assert.deepEqual(unpackShadowFrames(packed),frames.map((frame)=>({...frame,spaceId:'conservatory',perceived:false})), 'codec round-trips every normalized frame');
assert.ok(JSON.stringify(packed).length<JSON.stringify(frames).length*.55,'stationary delta packing is materially smaller');

const resolved={cueId:'violin.mischief.04',pitch:.9375,gainScale:.0613,pan:-.72,position:{x:8.25,y:19.5}};
const tape=sealCausalTape({
  topologyHash:CAUSAL_TOPOLOGY_HASH,runId:'run_a',returnSummaryId:'return:run_a',endingId:'sacrifice',durationMs:10000,
  qualification:{injuries:1,difficulty:'contract',completedAt:44},
  shadowFrames:[{t:0,x:0,y:0,yaw:0,pitch:0,roomId:'main_b3',renderGroup:'basement'},{t:10000,x:10,y:0,yaw:1,pitch:.2,roomId:'main_b3',renderGroup:'basement'}],
  events:[
    {id:'later-order',at:2000,order:2,type:'cue',actor:'hush',payload:resolved},
    {id:'first-order',at:2000,order:1,type:'door',actor:'building',payload:{state:'open'}},
  ],
  anchors:[
    {id:'a',at:2000,order:0,verb:'taunt',locus:{x:1,y:2},payload:resolved},
    ...CAUSAL_SPINE_IDS.map((id,index)=>({id,at:3000+index*100,order:index+1,verb:id.endsWith('contact')?'contact':'haunt',required:true,locus:{x:index,y:index,spaceId:id==='spine:source-threshold'?'source-space':'conservatory'}})),
  ],
});
assert.equal(tape.events[0].id,'first-order','equal timestamps preserve canonical presentation order');
assert.deepEqual(tape.anchors[0].payload,resolved,'resolved presentation values are stored exactly');
assert.equal(validateCausalTape(tape).ok,true);
assert.equal(shadowFrameAt(tape,5000).x,5);
assert.equal(tapeQualifies(0),true);
assert.equal(tapeQualifies(1),true);
assert.equal(tapeQualifies(2),false);

const wrongTopology={...tape,topologyHash:'other'};
wrongTopology.contentHash=causalContentHash(wrongTopology);
assert.equal(validateCausalTape(wrongTopology).reason,'TOPOLOGY_INCOMPATIBLE');
assert.equal(validateCausalTape({...tape,contentHash:'bad'}).reason,'CHECKSUM_FAILURE');

console.log('causal tape contracts passed');
