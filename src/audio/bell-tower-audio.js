import { ELLERY_BELLS } from '../data/bell-tower.js';
import { BELL_TOWER_STEM_MANIFEST_URL } from './bell-stem-assets.js';
import { loadBellStemBank, loadBellStemBankFromUrl } from './bell-stem-manifest.js';

const clamp01=(value)=>Math.max(0,Math.min(1,Number(value)||0));
const dbToGain=(db)=>10**((Number(db)||0)/20);
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

export const BELL_ACOUSTIC_PROFILES=Object.freeze({
  bell_chamber:Object.freeze({early:.42,late:.48,structure:.40,decay:4.8,damping:8200,delays:[.019,.037,.061]}),
  ringing_room:Object.freeze({early:.34,late:.38,structure:.52,decay:3.6,damping:6800,delays:[.023,.049,.073]}),
  masonry:Object.freeze({early:.22,late:.52,structure:.44,decay:5.8,damping:2400,delays:[.041,.087,.131]}),
  nave:Object.freeze({early:.30,late:.64,structure:.28,decay:7.2,damping:5200,delays:[.047,.103,.173]}),
  source_residue:Object.freeze({early:.08,late:.70,structure:.12,decay:8.4,damping:1250,delays:[.071,.149,.229]}),
  exterior:Object.freeze({early:.06,late:.10,structure:.08,decay:1.4,damping:10500,delays:[.029,.083,.157]}),
});

function hashStrike(record={}){
  let value=((Number(record.bell)||0)*73856093)^((Number(record.rowIndex)||0)*19349663)^((Number(record.place)||0)*83492791)^(record.stroke==='hand'?0x51f15e:0x91e10d);
  value^=value>>>13;value=Math.imul(value,1274126177);return(value^value>>>16)>>>0;
}

function noiseBuffer(ctx,seconds,seed,decay=1.8){
  const length=Math.max(64,Math.floor(ctx.sampleRate*seconds)),buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
  let state=(seed||1)>>>0;
  for(let index=0;index<length;index++){
    state=(Math.imul(state,1664525)+1013904223)>>>0;
    data[index]=((state/0xffffffff)*2-1)*Math.pow(1-index/length,decay);
  }
  return buffer;
}

function impulseBuffer(ctx,profileName){
  const profile=BELL_ACOUSTIC_PROFILES[profileName]||BELL_ACOUSTIC_PROFILES.ringing_room;
  const buffer=noiseBuffer(ctx,profile.decay,hashStrike({bell:profileName.length,rowIndex:profile.decay*10}),2.25);
  const data=buffer.getChannelData(0),sampleRate=ctx.sampleRate;
  for(const delay of profile.delays){
    const at=Math.floor(delay*sampleRate);if(at<data.length)data[at]=Math.max(-1,Math.min(1,data[at]+.72/(1+delay*8)));
  }
  return buffer;
}

function unavailableAudio(){
  return{start(){},strike(){},setShutters(){},setWorldMix(){},setAcousticProfile(){},setCodaProgress(){},setPerformanceIntensity(){},resetPerformance(){},releaseShutters(){},stand(){},cut(){},destroy(){},loadStems:async()=>null,maskingDb:()=>0,snapshot:()=>({audioMode:'unavailable',stemStatus:'unavailable',scheduledStrikes:0,lastStrike:null,audible:false})};
}

// Licensed tonal stems remain untouched and pitch-stable. Everything which
// makes repeated changes feel physical—rope, frame, air, early reflections and
// structural pressure—is a deterministic procedural layer around that bank.
export function createBellTowerAudio({
  context,
  destination=null,
  origin={x:0,z:0},
  stemManifest=null,
  stemManifestUrl=BELL_TOWER_STEM_MANIFEST_URL,
  fetchImpl=globalThis.fetch,
}={}){
  const ctx=context;if(!ctx)return unavailableAudio();
  const output=destination||ctx.destination;
  const tonalMaster=ctx.createGain(),internal=ctx.createGain(),exterior=ctx.createGain(),mechanism=ctx.createGain(),structureInput=ctx.createGain();
  const directFilter=ctx.createBiquadFilter(),directGain=ctx.createGain(),earlyGain=ctx.createGain(),lateFilter=ctx.createBiquadFilter(),structureFilter=ctx.createBiquadFilter(),structureGain=ctx.createGain();
  const spatial=ctx.createGain(),pan=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;
  const limiter=typeof ctx.createDynamicsCompressor==='function'?ctx.createDynamicsCompressor():null;
  tonalMaster.gain.value=.72;internal.gain.value=1;exterior.gain.value=0;mechanism.gain.value=.62;structureInput.gain.value=1;
  directFilter.type='lowpass';directFilter.frequency.value=12000;directFilter.Q.value=.35;directGain.gain.value=1;
  lateFilter.type='lowpass';lateFilter.frequency.value=6800;lateFilter.Q.value=.32;
  structureFilter.type='lowpass';structureFilter.frequency.value=180;structureFilter.Q.value=.62;structureGain.gain.value=.08;earlyGain.gain.value=.2;

  internal.connect(tonalMaster);exterior.connect(tonalMaster);mechanism.connect(tonalMaster);mechanism.connect(structureInput);
  tonalMaster.connect(directFilter);directFilter.connect(directGain);directGain.connect(spatial);
  structureInput.connect(structureFilter);structureFilter.connect(structureGain);structureGain.connect(spatial);

  const earlyDelays=[];
  if(typeof ctx.createDelay==='function'){
    for(const seconds of BELL_ACOUSTIC_PROFILES.ringing_room.delays){
      const delay=ctx.createDelay(.4),gain=ctx.createGain();delay.delayTime.value=seconds;gain.gain.value=.11;
      tonalMaster.connect(delay);delay.connect(gain);gain.connect(earlyGain);earlyDelays.push({delay,gain});
    }
  }else tonalMaster.connect(earlyGain);
  earlyGain.connect(spatial);

  const reverbs=[];
  if(typeof ctx.createConvolver==='function'){
    for(let index=0;index<2;index++){
      const convolver=ctx.createConvolver(),gain=ctx.createGain();convolver.buffer=impulseBuffer(ctx,'ringing_room');gain.gain.value=index===0 ? .38 : 0;
      lateFilter.connect(convolver);convolver.connect(gain);gain.connect(spatial);reverbs.push({convolver,gain});
    }
    tonalMaster.connect(lateFilter);
  }else{tonalMaster.connect(lateFilter);lateFilter.connect(spatial);}

  if(pan){spatial.connect(pan);if(limiter){pan.connect(limiter);limiter.connect(output);}else pan.connect(output);}
  else if(limiter){spatial.connect(limiter);limiter.connect(output);}else spatial.connect(output);
  if(limiter){
    limiter.threshold.value=-5;limiter.knee.value=3;limiter.ratio.value=12;limiter.attack.value=.003;limiter.release.value=.28;
  }

  const active=new Set();let masking=0,shutters=0,worldGain=1,worldTransmission=.08,worldLowpassHz=12000,worldPanValue=0,codaProgress=0;
  let profileName='ringing_room',activeReverb=0,performanceIntensity=0,scheduledStrikes=0,lastStrike=null;
  let stemSource=stemManifest||stemManifestUrl,stemBank=null,stemStatus=stemSource?'loading':'absent',stemError=null,stemPromise=null,loadingSource=null;

  function loadStems(nextSource=stemSource){
    if(!nextSource){stemStatus='absent';stemBank=null;stemSource=null;return Promise.resolve(null);}
    if(stemPromise&&nextSource===loadingSource)return stemPromise;
    stemSource=nextSource;loadingSource=nextSource;stemStatus='loading';stemError=null;
    const loader=typeof nextSource==='string'?loadBellStemBankFromUrl(ctx,nextSource,{fetchImpl}):loadBellStemBank(ctx,nextSource,{fetchImpl});
    stemPromise=loader.then((bank)=>{stemBank=bank;stemStatus='ready';return bank;}).catch((error)=>{
      stemBank=null;stemStatus='error';stemError=String(error?.message||error);console.warn('bell stems unavailable; using synthesis fallback',error);return null;
    });return stemPromise;
  }
  if(stemSource)void loadStems(stemSource);

  function track(node){active.add(node);node.onended=()=>active.delete(node);return node;}
  function oscillator(freq,when,gain,duration,detune=0,target=internal){
    const osc=track(ctx.createOscillator()),amp=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(freq,when);osc.detune.value=detune;
    amp.gain.setValueAtTime(.0001,when);amp.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),when+.012);amp.gain.exponentialRampToValueAtTime(.0001,when+duration);
    osc.connect(amp);amp.connect(target);osc.start(when);osc.stop(when+duration+.05);
  }
  function filteredNoise({when,seconds,seed,frequency,Q=.7,gain=.02,type='bandpass',target=mechanism}){
    when=Math.max(ctx.currentTime,when);const source=track(ctx.createBufferSource()),filter=ctx.createBiquadFilter(),amp=ctx.createGain();
    source.buffer=noiseBuffer(ctx,seconds,seed,1.5);filter.type=type;filter.frequency.value=frequency;filter.Q.value=Q;amp.gain.value=gain;
    source.connect(filter);filter.connect(amp);amp.connect(target);source.start(when);return source;
  }
  function proceduralMechanism(record,when,bell){
    const seed=hashStrike(record),weight=(.014+(Number(record.bell)||1)*.0014)*(1+performanceIntensity*.18);
    filteredNoise({when:when-.042,seconds:.12,seed:seed^0x81a4,frequency:2300+(seed%1100),Q:.44,gain:weight*.52,type:'highpass'});
    filteredNoise({when:when-.025,seconds:.22,seed,frequency:520+(seed%520),Q:.8,gain:weight});
    filteredNoise({when:when+.018,seconds:.34,seed:seed^0x51ef,frequency:170+(seed%120),Q:1.1,gain:weight*.72,target:structureInput});
    if(Number(record.bell)===8){
      const base=Number(bell?.frequency)||233.08;oscillator(base/4,when+.008,.048,.62,0,structureInput);
    }
  }
  function stemVoice(entry,bell,targetContact){
    const source=track(ctx.createBufferSource()),gain=ctx.createGain();source.buffer=entry.buffer;gain.gain.value=dbToGain(entry.gainDb);
    const bellPan=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;
    if(bellPan){bellPan.pan.value=Math.max(-.9,Math.min(.9,((bell?.pivot?.x??origin.x)-origin.x)/5));source.connect(gain);gain.connect(bellPan);bellPan.connect(internal);bellPan.connect(exterior);}
    else{source.connect(gain);gain.connect(internal);gain.connect(exterior);}
    const contactOffset=entry.contactOffsetSamples/48000,intendedStart=targetContact-contactOffset,actualStart=Math.max(ctx.currentTime,intendedStart),bufferOffset=Math.max(0,actualStart-intendedStart);
    if(bufferOffset>=entry.buffer.duration){active.delete(source);return;}source.start(actualStart,bufferOffset);
  }
  function strike(record,bell=ELLERY_BELLS[record.bell-1],{delaySec=0}={}){
    const when=ctx.currentTime+Math.max(0,Number(delaySec)||0),stem=stemBank?.pick?.(record);proceduralMechanism(record,when,bell);
    if(stem)stemVoice(stem,bell,when);
    else{
      const base=Number(bell?.frequency)||116.54,weight=1-(record.bell-1)*.045,partials=[[1,.18,8.2],[2.01,.055,5.4],[2.41,.038,4.1],[3,.025,3.2],[4.17,.015,2.5]];
      for(const[ratio,gain,duration]of partials)oscillator(base*ratio,when,gain*weight,duration,record.stroke==='hand'?-2:2,internal);
      oscillator(base,when+.018,.065*weight*shutters,9.5,0,exterior);
    }
    scheduledStrikes+=1;lastStrike={bell:Number(record.bell)||0,stroke:record.stroke||null,rowIndex:Number(record.rowIndex)||0,place:Number(record.place)||0,when};
    masking=Math.min(24,masking+2.8);
  }

  function profile(){return BELL_ACOUSTIC_PROFILES[profileName]||BELL_ACOUSTIC_PROFILES.ringing_room;}
  function rampParam(param,value,seconds=.15){
    const t=ctx.currentTime;param.cancelScheduledValues?.(t);param.setValueAtTime?.(finite(param.value,value),t);param.linearRampToValueAtTime?.(value,t+Math.max(.02,seconds));if(!param.linearRampToValueAtTime)param.value=value;
  }
  function applyWorldMix(seconds=.15){
    const p=profile(),direct=worldGain*(1-codaProgress*.86),early=worldGain*p.early*(1+performanceIntensity*.12)*(1-codaProgress*.9),late=worldTransmission*p.late*(1+performanceIntensity*.10)*(1-codaProgress*.72),structure=worldTransmission*p.structure*(1+performanceIntensity*.55)*(1-codaProgress);
    rampParam(directGain.gain,direct,seconds);rampParam(earlyGain.gain,early,seconds);rampParam(structureGain.gain,structure,seconds);rampParam(directFilter.frequency,worldLowpassHz,seconds);rampParam(lateFilter.frequency,Math.min(worldLowpassHz,p.damping),seconds);
    if(reverbs.length)reverbs.forEach((entry,index)=>rampParam(entry.gain.gain,index===activeReverb?late:0,seconds));
    if(pan)rampParam(pan.pan,worldPanValue,seconds);
  }
  function setWorldMix(frame={},ramp=.15){
    worldGain=clamp01(frame.gain??worldGain);worldTransmission=clamp01(frame.transmission??worldTransmission);worldLowpassHz=Math.max(320,Math.min(16000,Number(frame.lowpassHz)||worldLowpassHz));worldPanValue=Math.max(-1,Math.min(1,Number(frame.pan)||0));
    if(frame.profile)setAcousticProfile(frame.profile,ramp);else applyWorldMix(ramp);
  }
  function setAcousticProfile(name,ramp=.35){
    const next=BELL_ACOUSTIC_PROFILES[name]?name:'ringing_room';if(next===profileName){applyWorldMix(ramp);return profileName;}
    profileName=next;
    if(reverbs.length){const inactive=activeReverb?0:1;reverbs[inactive].convolver.buffer=impulseBuffer(ctx,next);activeReverb=inactive;}
    const p=profile();for(let index=0;index<earlyDelays.length;index++)rampParam(earlyDelays[index].delay.delayTime,p.delays[index]||p.delays.at(-1),ramp);
    applyWorldMix(ramp);return profileName;
  }
  function setShutters(value){shutters=clamp01(value);const t=ctx.currentTime;internal.gain.setTargetAtTime(1-shutters*.34,t,.12);exterior.gain.setTargetAtTime(shutters*.9,t,.12);}
  function setCodaProgress(value){codaProgress=clamp01(value);applyWorldMix(.12);}
  function setPerformanceIntensity(value){const next=clamp01(value);if(Math.abs(next-performanceIntensity)<.0001)return performanceIntensity;performanceIntensity=next;applyWorldMix(.18);return performanceIntensity;}
  function cut(){
    const t=ctx.currentTime;tonalMaster.gain.cancelScheduledValues?.(t);tonalMaster.gain.setTargetAtTime(.0001,t,.006);
    for(const node of active){try{node.stop(t+.012);}catch(_){/* already ended */}}active.clear();masking=0;
  }
  function start(){
    const t=ctx.currentTime;tonalMaster.gain.cancelScheduledValues?.(t);tonalMaster.gain.setValueAtTime(Math.max(.0001,tonalMaster.gain.value),t);tonalMaster.gain.linearRampToValueAtTime(.72,t+.08);codaProgress=0;setShutters(0);applyWorldMix(.08);masking=0;
  }
  function resetPerformance(){
    cut();
    // Source wash and standing bells are allowed to take this shared physical
    // bus to true silence. A player taking the tenor is a new foreground
    // performance: restore an audible ringing-room path immediately instead
    // of waiting for a later spatial tick to undo a zero-gain handoff.
    worldGain=1;worldTransmission=.38;worldLowpassHz=12000;worldPanValue=0;
    performanceIntensity=0;codaProgress=0;
    scheduledStrikes=0;lastStrike=null;
    start();setAcousticProfile('ringing_room',.04);
  }
  function stand(){masking=0;codaProgress=1;worldGain=0;worldTransmission=0;applyWorldMix(.8);}
  function destroy(){
    cut();for(const node of[internal,exterior,mechanism,structureInput,tonalMaster,directFilter,directGain,earlyGain,lateFilter,structureFilter,structureGain,spatial,pan,limiter,...earlyDelays.flatMap((entry)=>[entry.delay,entry.gain]),...reverbs.flatMap((entry)=>[entry.convolver,entry.gain])]){try{node?.disconnect?.();}catch(_){/* best effort */}}
  }
  return{
    start,strike,loadStems,setShutters,setWorldMix,setAcousticProfile,setCodaProgress,setPerformanceIntensity,resetPerformance,
    releaseShutters:()=>setShutters(.02),stand,cut,destroy,
    maskingDb:()=>{masking*=.985;return masking;},
    snapshot:()=>({activeVoices:active.size,shutters,worldGain,worldTransmission,worldLowpassHz,worldPan:worldPanValue,maskingDb:masking,origin,stemStatus,stemCount:stemBank?.size||0,stemError,audioMode:stemBank?'stems':'synthesis',profile:profileName,codaProgress,performanceIntensity,limiter:!!limiter,scheduledStrikes,lastStrike,audible:worldGain>.001||worldTransmission>.001,acousticLayers:['direct','early','late','mechanism','structure']}),
  };
}
