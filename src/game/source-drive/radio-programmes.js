// Three real, seekable editorial scratch programmes. All clocks are the saved
// simulation programme time: tuning/OFF never parks a station or queues a line.
// No voice synthesis API runs in the browser. The small local stock-voice WAVs
// are temporary anonymous radio roles, not Sarah/Lyle or final performances.
export const RADIO_CYCLE_SECONDS=72;
export const RADIO_SAMPLE_RATE=16000;
export const RADIO_PHASES=Object.freeze(['ordinary','discrepancy','recognition','contradiction','arrival']);
export const RADIO_STATIONS=Object.freeze({service:{label:'Local service',preset:1},company:{label:'Late company',preset:2},music:{label:'Arts programme',preset:3}});
export const RADIO_SCRATCH_MANIFEST='/assets/source-drive/radio/scratch-manifest.json';
// Optional production delivery. The game remains playable with editorial
// scratch when this file is absent; a template is not a finished performance.
export const RADIO_FINAL_MANIFEST='/assets/source-drive/radio/programmes.json';
export const RADIO_FINAL_CACHE_BYTES=64*1024*1024;
export const RADIO_FINAL_MASTER_BYTES=32*1024*1024;
export const RADIO_PROGRAMME_NAMES=Object.freeze(Object.keys(RADIO_STATIONS).flatMap(station=>RADIO_PHASES.map(phase=>`${station}-${phase}`)));

export function validateProgrammeCues(cues,duration=RADIO_CYCLE_SECONDS,{requireSignalRole=false}={}){
 if(cues==null)return[];
 if(!Array.isArray(cues))throw Error('Programme cues must be an array.');
 const ids=new Set();let previousEnd=0;
 return cues.map(cue=>{
  const start=cue?.start,end=cue?.end??(start+cue?.durationSeconds);
  if(typeof cue?.id!=='string'||!cue.id.trim()||ids.has(cue.id))throw Error('Programme cue IDs must be nonempty and unique.');
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration||start<previousEnd)throw Error(`Invalid or overlapping programme cue: ${cue.id}`);
  if(typeof cue.speaker!=='string'||!cue.speaker.trim()||typeof cue.text!=='string'||!cue.text.trim())throw Error(`Programme cue needs its actual speaker label and transcript: ${cue.id}`);
  if((requireSignalRole||cue.signalRole!=null)&&!['human','unattributed'].includes(cue.signalRole))throw Error(`Invalid programme signal ownership: ${cue.id}`);
  ids.add(cue.id);previousEnd=end;
  return Object.freeze({id:cue.id,start,end,speaker:cue.speaker,text:cue.text,...(cue.signalRole?{signalRole:cue.signalRole}:{})});
 });
}

export function validateProgrammeManifest(manifest){
 if(manifest?.schema!==1||manifest.cycleSeconds!==RADIO_CYCLE_SECONDS||!Array.isArray(manifest.programmes)||manifest.programmes.length!==RADIO_PROGRAMME_NAMES.length)throw Error('Programme manifest requires schema 1 and all fifteen 72-second station/phase masters.');
 const names=new Set();
 const programmes=manifest.programmes.map(row=>{
  if(!RADIO_PROGRAMME_NAMES.includes(row?.name)||names.has(row.name))throw Error('Invalid or duplicate drive programme identity.');
  if(typeof row.url!=='string'||!row.url.startsWith('/')||row.url.startsWith('//')||!row.url.trim())throw Error(`Programme URL must be a local asset: ${row.name}`);
  if(row.loop!==true||row.temporary!==false||!Array.isArray(row.cues))throw Error(`Final programme requires loop:true, temporary:false and explicit cues: ${row.name}`);
  names.add(row.name);
  return Object.freeze({name:row.name,url:row.url,loop:true,temporary:false,cues:Object.freeze(validateProgrammeCues(row.cues,RADIO_CYCLE_SECONDS,{requireSignalRole:true}))});
 });
 return Object.freeze({schema:1,cycleSeconds:RADIO_CYCLE_SECONDS,programmes:Object.freeze(programmes)});
}
const rows=[
 ['service-water','SERVICE',4.576553,'A little surface water on the unlit section. Allow a few more minutes.'],
 ['service-bridge','SERVICE',3.351701,'The access road is open. Take care on the bridge.'],
 ['service-change','SERVICE',1.917596,'No further change at the moment.'],
 ['service-open','SERVICE',2.039728,'The access road remains open.'],
 ['service-end','SERVICE',1.772381,'That is the end of the bulletin.'],
 ['company-host','HOST',3.728617,'Still on the road? All right. Keep us on quietly.'],
 ['company-caller','CALLER',2.351474,'I was only going to listen for a bit.'],
 ['company-time','HOST',2.867438,'You can take your time. We are still here.'],
 ['music-link','MUSIC',2.38127,'We have time for the beginning once more.'],
];
export const RADIO_SCRATCH_CLIPS=Object.freeze(Object.fromEntries(rows.map(([id,speaker,durationSeconds,text])=>[id,Object.freeze({id,speaker,durationSeconds,text,url:`/assets/source-drive/radio/${id}.wav`,temporary:true})])));
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));
const smooth=v=>{const t=clamp(v);return t*t*(3-2*t);};
const mod=(v,n)=>(v%n+n)%n;
export function programmeCues(station,phase=0){
 const cell=(id,start)=>({...RADIO_SCRATCH_CLIPS[id],start,end:start+RADIO_SCRATCH_CLIPS[id].durationSeconds});
 if(station==='service')return(phase<2?[["service-water",1.4],["service-bridge",15],["service-change",34],["service-open",53],["service-end",65]]:[["service-open",1.4],["service-change",15],["service-open",34],["service-change",53],["service-end",65]]).map(([id,t])=>cell(id,t));
 if(station==='company')return[["company-host",2.5],["company-caller",15.2],["company-time",34.8],[phase>=3?'company-caller':'company-host',55.5]].map(([id,t])=>cell(id,t));
 if(station==='music')return[cell('music-link',1.8)];
 return[];
}
export function programmeFrame(state={},evolution=state.evolution,{speechReady=true,phase:phaseOverride,cues,temporary=true}={}){
 const station=RADIO_STATIONS[state.station]?state.station:'service',phase=Math.floor(clamp(phaseOverride??state.phase,0,4));
 const clockSeconds=Math.max(0,Number(state.programTime)||0),cycleSeconds=mod(clockSeconds,RADIO_CYCLE_SECONDS);
 const reveal=Number.isFinite(evolution?.reveal)?clamp(evolution.reveal):smooth(((state.furthest||0)-580)/320);
 const roadDistance=Number.isFinite(state.z)?-state.z:Number(state.furthest)||0;
 // Aerial reception is a position-dependent impairment. Its sparse loss is
 // mild before the excavation, and does not turn OFF into another station.
 const aerial=.5+.5*Math.sin(roadDistance*.023+Math.sin(roadDistance*.007)*1.6);
 const whiteout=clamp(evolution?.weather?.whiteout??0),quality=clamp(.985-reveal*(.12+.15*aerial)-whiteout*.12,.42,1);
 const lossPhase=mod(clockSeconds+({service:0,company:7.4,music:12.1}[station]),23.7);
 const dropout=phase>=2?smooth((lossPhase-19.5)/.28)*(1-smooth((lossPhase-20.2)/.7))*(.42+.13*Math.min(2,phase-2)):0;
 const audible=state.radioOn!==false&&!state.paused&&clamp(state.volume??.65)>.005&&(1-dropout)*quality>.12;
 const cue=(cues??programmeCues(station,phase)).find(c=>cycleSeconds>=c.start&&cycleSeconds<c.end)||null;
 return{station,label:RADIO_STATIONS[station].label,phase,clockSeconds,cycleSeconds,cycleIndex:Math.floor(clockSeconds/RADIO_CYCLE_SECONDS),audible,
  cue,caption:audible&&speechReady&&cue?{speaker:cue.speaker,text:cue.text,cueId:cue.id,temporary,...(cue.signalRole?{signalRole:cue.signalRole}:{})}:null,
  signal:{quality,dropout,bandwidthHz:Math.max(1350,4600-reveal*2100-phase*130-whiteout*850)},
  provenance:temporary?'Temporary local stock-system speech and original synthesized programme beds; finished user performances remain absent.':'Supplied programme master through the physical receiver; cue captions from its replacement manifest.'};
}

export async function loadScratchVoices(context,{fetcher=globalThis.fetch,clipIds=null}={}){
 const voices=new Map(),errors=[];
 if(typeof fetcher!=='function')return{voices,errors:['Programme assets could not be requested.']};
 const selected=clipIds==null?null:new Set(clipIds);
 await Promise.all(Object.values(RADIO_SCRATCH_CLIPS).filter(clip=>!selected||selected.has(clip.id)).map(async clip=>{try{const response=await fetcher(clip.url);if(!response?.ok)throw Error(`HTTP ${response?.status??'missing'}`);const buffer=await context.decodeAudioData(await response.arrayBuffer());voices.set(clip.id,buffer);}catch(error){errors.push(`${clip.id}: ${error.message||error}`);}}));
 return{voices,errors};
}

// Bounded deterministic sample rendering, cached by the acoustic owner. It
// consumes no timers or audio nodes and never substitutes for field evidence.
export function renderScratchProgramme(context,station,phase=0,voices=new Map()){
 if(!RADIO_STATIONS[station]||!RADIO_PHASES[phase])throw Error('Unknown radio programme.');
 const rate=RADIO_SAMPLE_RATE,buffer=context.createBuffer(1,RADIO_CYCLE_SECONDS*rate,rate),out=buffer.getChannelData(0),tau=Math.PI*2;
 const note=(start,duration,hz,level,{soft=false,detune=0}={})=>{
  const begin=Math.max(0,Math.floor(start*rate)),end=Math.min(out.length,Math.ceil((start+duration)*rate));
  for(let i=begin;i<end;i++){const t=i/rate-start,attack=1-Math.exp(-t*(soft?36:220)),decay=Math.exp(-t*(soft?1.5:3.3)),release=smooth((duration-t)/.12),p=tau*hz*t;
   out[i]+=level*attack*decay*release*(Math.sin(p+detune*t)+.27*Math.sin(p*2.003)+.10*Math.sin(p*3.997));}
 };
 if(station==='service'){
  for(const start of [0,24,48]){note(start,.22,440,.095);note(start+.28,.28,660,.08);}
  // A restrained service interval signal and a quiet teleprinter texture.
  for(let start=8;start<72;start+=8){note(start,.08,880,.012);note(start+.16,.08,660,.01);}
 }else if(station==='company'){
  for(let bar=0;bar<18;bar++){const root=[110,130.8128,146.8324,130.8128][Math.floor(bar/2)%4],t=bar*4;
   note(t,2.1,root,.021,{soft:true});note(t+.37,1.8,root*1.5,.013,{soft:true});note(t+1.8,1.1,root*2.5,.012,{soft:true});
   note(t+2.9,.08,190,.011);}
 }else{
  // Original eight-bar piano thought: the gap before the falling answer is
  // its recognizable hesitation. Later versions keep trying the same answer.
  const melody=[[0,293.665,1.1],[1.1,349.228,.9],[2.1,440,.9],[3.15,391.995,1.2],[5.2,329.628,.8],[6.25,349.228,.8],[7.3,329.628,1.1],[8.65,293.665,2.2]];
  for(let bar=0;bar<4;bar++){const base=7+bar*16;
   for(let k=0;k<melody.length;k++){const [t,hz,duration]=melody[k],repeat=phase>=2&&bar>=2&&k>=5;
    note(base+t,duration+(repeat?.8:0),repeat?melody[5][1]:hz,.065,{soft:true,detune:phase>=3?(k%2?.7:-.5):0});
    if(repeat&&phase>=3)note(base+t+.46,.72,hz*.5,.033,{soft:true});}
   note(base,5.8,146.8324,.026,{soft:true});}
 }
 for(const cue of programmeCues(station,phase)){
  const voice=voices.get(cue.id);if(!voice)continue;const data=voice.getChannelData(0),ratio=voice.sampleRate/rate;
  let peak=.001;for(let j=0;j<data.length;j++)peak=Math.max(peak,Math.abs(data[j]));const level=.24/peak;
  const start=Math.floor(cue.start*rate),length=Math.min(out.length-start,Math.floor(data.length/ratio));
  for(let j=0;j<length;j++){const p=j*ratio,k=Math.floor(p),f=p-k;out[start+j]+=((data[k]||0)*(1-f)+(data[k+1]||0)*f)*level;}
  // A clearly separate, nonverbal end-of-line magnetic drag: the words above
  // remain intact and caption timing never claims a private character voice.
  if(phase>=2){const tail=Math.max(0,data.length-Math.floor(.13*voice.sampleRate)),begin=start+length+Math.floor(.22*rate);
   for(let j=0;j<rate*.6&&begin+j<out.length;j++){const p=tail+(j*ratio)%Math.max(1,data.length-tail);out[begin+j]+=(data[Math.floor(p)]||0)*level*.22*(1-j/(rate*.6));}}
 }
 // Very quiet stationary receiver/programme hiss is distinct from aerial
 // static; every sample is stable across an independent reload or tune.
 let seed=({service:419,company:787,music:1297}[station])+phase*331;
 for(let i=0;i<out.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;out[i]=clamp(out[i]+(seed/4294967296*2-1)*.0018,-.8,.8);}
 return buffer;
}
