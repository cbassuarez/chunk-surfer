import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {SourceDriveAcoustics,driveExteriorAcousticFrame,driveLoadedFoleySources,driveExteriorPans} from '../src/game/source-drive/acoustics.js';
import {driveLoadAt} from '../src/game/source-drive/deterioration.js';
const state={programTime:13,furthest:960,z:-850,speed:0,engineLoad:0,throttle:0,gear:1,surface:'asphalt',longitudinalAcceleration:0,heaveVelocity:0,odometer:0,roadOffset:-1.35,radioOn:false,volume:.65,phase:3,station:'service',phaseStarted:0,cutEnabled:true,paused:false};
const weather={rain:.84,roadWetness:.68,wiperMoving:false,wiperAngles:[-.6,.6]};
const evolution=(time=13,distance=850,furthest=960)=>({currentDistance:distance,load:driveLoadAt({timeSec:time,furthest,distance}),weather:{rain:.84,wind:[4.2,-.35],gust:.7,shelter:0}});
const gains=['roofGain','glassGain','windGain','pressureGain','waterGain','fibreGain','roofLoadGain'];
function fakeContext(){
 let allocations=0;const nodes=[];
 const param=initial=>({value:initial,setTargetAtTime(v){this.value=v;},setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}});
 const node=()=>{allocations++;const n={connections:[],connect(to){this.connections.push(to);return to;},disconnect(){this.connections=[];},start(){},stop(){}};nodes.push(n);return n;};
 const context={currentTime:0,sampleRate:8000,state:'running',createGain(){return Object.assign(node(),{gain:param(1)});},createBiquadFilter(){return Object.assign(node(),{frequency:param(350),Q:param(.7)});},createStereoPanner(){return Object.assign(node(),{pan:param(0)});},createDelay(){return Object.assign(node(),{delayTime:param(0)});},createBufferSource(){return node();},createOscillator(){return Object.assign(node(),{frequency:param(440)});},createAnalyser(){return Object.assign(node(),{getFloatTimeDomainData(a){a.fill(0);}});},createBuffer(channels,length,sampleRate){const data=Array.from({length:channels},()=>new Float32Array(length));return{length,sampleRate,numberOfChannels:channels,duration:length/sampleRate,getChannelData:c=>data[c]};}};
 return{context,nodes,count:()=>allocations};
}

test('weather, water and anatomy are a continuous response to the same saved spatial load',()=>{
 for(const time of [0,4,13,18,40,61,79]){let previous=null;for(let distance=250;distance<=1250;distance+=.01){const frame=driveExteriorAcousticFrame(state,weather,evolution(time,distance,1250));for(const key of gains){assert(Number.isFinite(frame[key])&&frame[key]>=0&&frame[key]<.25,key);if(previous)assert(Math.abs(frame[key]-previous[key])<.001,key+' 1cm spatial step');}previous=frame;}}
 const e=evolution(13,850),a=driveExteriorAcousticFrame(state,weather,e),b=driveExteriorAcousticFrame({...state,phase:0,programTime:90000},weather,e);assert.deepEqual(a,b,'no hidden phase or independent audio clock');
 assert.deepEqual(a,driveExteriorAcousticFrame(JSON.parse(JSON.stringify(state)),structuredClone(weather),JSON.parse(JSON.stringify(e))));
});
test('one travelling load aligns water and tissue with the same retarded-time effort',()=>{
 const a=driveLoadAt({timeSec:13,furthest:960,distance:700}),b=driveLoadAt({timeSec:13+(850-700)*.055,furthest:960,distance:850});
 for(const key of ['value','velocity','release','innerValue','innerVelocity'])assert(Math.abs(a[key]-b[key])<1e-9,key);
 const frames=Array.from({length:976},(_,i)=>driveExteriorAcousticFrame(state,weather,evolution(i*.125,850)));assert(new Set(frames.map(f=>f.pressureGain.toFixed(4))).size>2);assert(frames.some(f=>f.strain>.2));assert(frames.some(f=>f.unloading>.2));
});
test('physical water/anatomy voices preserve position and consume their supplied shared load',()=>{
 const local=driveLoadAt({timeSec:7.7,furthest:960,distance:850}),sources=[{id:'ocean',position:[-28,4,-18],motion:{kind:'water',distance:760,load:local}},{id:'rib',position:[5,3,-6],motion:{kind:'anatomy',distance:800,load:local}}];
 const mapped=driveLoadedFoleySources(state,sources,evolution());for(let i=0;i<sources.length;i++){assert.equal(mapped[i].id,sources[i].id);assert.equal(mapped[i].position,sources[i].position);assert.equal(mapped[i].motion.load,local);assert.deepEqual(sources[i].motion.foley,undefined);}
 assert(mapped[0].motion.foley.adhesiveDrag<mapped[1].motion.foley.adhesiveDrag,'water never borrows the anatomy’s fibre drag');
 const legacy={id:'old-wall',position:[5,1,-3],motion:{distance:828,foley:{adhesiveDrag:1}}};const out=driveLoadedFoleySources(state,[legacy],evolution())[0];assert.deepEqual(out.motion.load,driveLoadAt({timeSec:13,furthest:960,distance:828}));
 assert.equal(driveLoadedFoleySources(state,sources,{}),sources,'old captures without a new descriptor retain their existing source contract');
});
test('ordinary weather remains physical and disabling Cut suppresses only its material branches',()=>{
 const ordinary=driveExteriorAcousticFrame(state,weather,{});assert(ordinary.roofGain>0&&ordinary.windGain>0);for(const k of ['pressureGain','waterGain','fibreGain','roofLoadGain'])assert.equal(ordinary[k],0);
 const muted=driveExteriorAcousticFrame({...state,cutEnabled:false},weather,evolution());for(const k of ['pressureGain','waterGain','fibreGain','roofLoadGain'])assert.equal(muted[k],0);assert(muted.roofGain>0);
 const source={id:'rib',position:[3,1,-4],motion:{kind:'anatomy',distance:850,load:evolution().load}};assert(Object.values(driveLoadedFoleySources({...state,cutEnabled:false},[source],evolution())[0].motion.foley).every(v=>v===0));
});
test('the persistent acoustic graph keeps physical evolution outside OFF and freezes on pause without allocating per-frame nodes',async()=>{
 const f=fakeContext(),destination=f.context.createGain(),a=await new SourceDriveAcoustics({context:f.context,destination,fetcher:async()=>({ok:false,status:404})}).initialize();a.setPaused(false);
 const source=t=>({id:'rib-850',position:[4,2,-5],motion:{kind:'anatomy',distance:850,load:evolution(t).load}});
 a.sync(state,[source(13)],weather,evolution());const allocated=f.count();
 for(let i=1;i<600;i++){const t=13+i/60;f.context.currentTime=i/60;a.sync({...state,programTime:t},[source(t)],weather,evolution(t));}
 assert.equal(f.count(),allocated,'physical loads create no transient source/timer per frame');assert.equal(a.radio.gain.value,0);assert(a.loadedPressure.gain.gain.value>0);assert(a.roofRain.gain.gain.value>0);
 for(const branch of [a.loadedPressure,a.loadedWater,a.loadedFibre,a.loadedRoof]){assert(branch.panner.connections.includes(a.cabin));assert(!branch.panner.connections.includes(a.radio));}
 const before=structuredClone(a.exteriorFrame),captured=a.foley.diagnostics();a.setPaused(true);a.sync({...state,programTime:300},[],weather,evolution(300));assert.deepEqual(a.exteriorFrame,before);assert.deepEqual(a.foley.diagnostics(),captured);assert.equal(f.context.state,'running');assert.equal(a.cabin.gain.value,0);
 a.setPaused(false);a.sync({...state,programTime:13},[source(13)],weather,evolution());assert.deepEqual(a.exteriorFrame,driveExteriorAcousticFrame(state,weather,evolution()));a.dispose();
});
test('production and study continuous acoustic paths are byte-identical',async()=>{assert.equal(await readFile('src/game/source-drive/acoustics.js','utf8'),await readFile('artifacts/source-drive-study/acoustics.js','utf8'));});

test('the broad exterior follows real source positions when the van turns rather than staying glued to screen-left',()=>{
 const water={id:'wave',position:[-24,5,-9],motion:{kind:'water'}},body={id:'rib',position:[5,3,-4],motion:{kind:'anatomy'}};const forward=driveExteriorPans([water,body]),turned=driveExteriorPans([{...water,position:water.position.map((v,i)=>i===1?v:-v)},{...body,position:body.position.map((v,i)=>i===1?v:-v)}]);assert(forward.waterPan<0&&turned.waterPan>0);assert(forward.fibrePan>0&&turned.fibrePan<0);assert(Math.abs(forward.pressurePan+turned.pressurePan)<1e-12);
});
