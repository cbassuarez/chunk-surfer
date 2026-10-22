// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// Provisional physical reference for The Cut. This is deliberately nonverbal:
// filtered adhesive drag, a heavy settling sound and sparse cavity resonance.
// User-recorded wet fibre / stone / loaded steel stems should replace these
// synthetic sources before performance approval. Feed the shared cabin bus so
// the monitored signal and REC retain exactly the same exterior events.
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function cutFoleyFrame({motion = {}, position = [4, 1, -8], engineHz = 28, enabled = true} = {}) {
  if (!Array.isArray(position) || position.length !== 3 || position.some(v => !Number.isFinite(v))) throw Error('Cut foley requires a finite cabin-reference source position.');
  const f = motion.foley || {}, distance = Math.hypot(...position), gate = enabled ? 1 - clamp((distance - 32) / 24) : 0;
  return {position: [...position], enabled: !!enabled, distance,
    dragGain: gate * .042 * clamp(f.adhesiveDrag || 0),
    settlingGain: gate * .018 * clamp(f.settling || 0),
    pressureGain: gate * .009 * clamp(f.cavityPressure || 0),
    harmonicGain: gate * .024 * clamp(f.harmonicCoupling || 0),
    harmonicHz: clamp(Number(engineHz) * 2 || 56, 35, 110),
    dragHz: 280 + 340 * clamp(f.adhesiveDrag || 0),
    provenance: 'synthetic physical reference; finished recorded foley pending'};
}

export class CutFoley {
 constructor({ctx,cabin,noise}={}) {
  if (!ctx?.createGain || !cabin) throw Error('Cut foley requires an initialized AudioContext and the cabin recording/monitor bus.');
  this.ctx=ctx;this.cabin=cabin;this.closed=false;this.last={provenance:'synthetic physical reference; finished recorded foley pending',sources:[],paused:true};
  if(!noise){noise=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const data=noise.getChannelData(0);let seed=198683;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*.45;}}
  this.voices=Array.from({length:3},()=>this.createVoice(noise));
 }
 createVoice(noise) {
  const c = this.ctx, nodes = [], sources = [];
  const track = node => { nodes.push(node); return node; };
  // Cabin-relative stereo and measured distance avoid moving the shared listener.
  const panner = track(c.createStereoPanner());
  panner.connect(this.cabin);
  const source = track(c.createBufferSource());source.buffer = noise;source.loop = true;sources.push(source);
  const dragFilter = track(c.createBiquadFilter());dragFilter.type = 'bandpass';dragFilter.frequency.value = 360;dragFilter.Q.value = .63;
  const drag = track(c.createGain());drag.gain.value = 0;source.connect(dragFilter);dragFilter.connect(drag);drag.connect(panner);
  const settlingFilter = track(c.createBiquadFilter());settlingFilter.type = 'lowpass';settlingFilter.frequency.value = 105;settlingFilter.Q.value = .6;
  const settling = track(c.createGain());settling.gain.value = 0;source.connect(settlingFilter);settlingFilter.connect(settling);settling.connect(panner);
  const pressureFilter = track(c.createBiquadFilter());pressureFilter.type = 'bandpass';pressureFilter.frequency.value = 63;pressureFilter.Q.value = 1.4;
  const pressure = track(c.createGain());pressure.gain.value = 0;source.connect(pressureFilter);pressureFilter.connect(pressure);pressure.connect(panner);
  const resonator = track(c.createOscillator());resonator.type = 'sine';resonator.frequency.value = 56;sources.push(resonator);
  const harmonic = track(c.createGain());harmonic.gain.value = 0;resonator.connect(harmonic);harmonic.connect(panner);
  source.start();resonator.start();return{id:null,nodes,sources,panner,drag,settling,pressure,harmonic,dragFilter,resonator};
 }
 sync({sources=[],timeSec=0,engineHz=28,paused=false,enabled=true}={}){
  if(this.closed)return this.diagnostics();
  if(!Number.isFinite(timeSec)||timeSec<0||!Array.isArray(sources)||sources.length>3)throw Error('Cut foley requires simulation time and at most three nearby physical sources.');
  if(paused){this.last={...this.last,paused:true};return this.diagnostics();}
  const ids=sources.map(source=>source.id);if(ids.some(id=>id==null)||new Set(ids).size!==ids.length)throw Error('Cut foley source IDs must be stable and unique.');
  const frames=sources.map(source=>({id:source.id,...cutFoleyFrame({...source,engineHz,enabled})})),present=new Set(ids),c=this.ctx;
  // Stable physical IDs retain a voice; no AudioNode is created during sync.
  for(const voice of this.voices)if(!present.has(voice.id))voice.id=null;
  const target=(param,value,seconds=.16)=>param.setTargetAtTime(value,c.currentTime,seconds);
  for(const f of frames){const voice=this.voices.find(v=>v.id===f.id)||this.voices.find(v=>v.id==null);voice.id=f.id;
   const attenuation=f.distance<=3?1:3/(3+1.15*(f.distance-3));
   target(voice.panner.pan,Math.max(-.95,Math.min(.95,f.position[0]/Math.max(2,Math.hypot(f.position[0],f.position[2])))),.08);
   target(voice.drag.gain,f.dragGain*attenuation);target(voice.settling.gain,f.settlingGain*attenuation,.12);target(voice.pressure.gain,f.pressureGain*attenuation,.3);target(voice.harmonic.gain,f.harmonicGain*attenuation,.4);target(voice.dragFilter.frequency,f.dragHz,.12);target(voice.resonator.frequency,f.harmonicHz,.6);
  }
  for(const voice of this.voices)if(voice.id==null)for(const node of[voice.drag,voice.settling,voice.pressure,voice.harmonic])target(node.gain,0);
  this.last={provenance:'synthetic physical reference; finished recorded foley pending',paused:false,enabled:!!enabled,timeSec,sources:frames,allocatedVoices:3};return this.diagnostics();
 }
 diagnostics(){return structuredClone(this.last);}
 dispose(){if(this.closed)return;this.closed=true;for(const voice of this.voices){for(const source of voice.sources)try{source.stop();}catch{}for(const node of voice.nodes)node.disconnect();}}
}
