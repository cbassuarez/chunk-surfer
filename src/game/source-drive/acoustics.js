// Physical cabin sources on the game's existing AudioContext. This owner never
// changes the global listener, suspends the context or requests a microphone.
// Synthetic beds remain replaceable timing references until recorded masters
// are supplied; exact field capture belongs to source-drive-recording.js.
import { CutFoley } from './cut/foley.js';
import {RADIO_PHASES,programmeFrame,loadScratchVoices,renderScratchProgramme} from './radio-programmes.js';
import {driveLoadAt} from './deterioration.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, Number(v) || 0));

// Unoccupied cars call across the same physical cabin mix as rain and tyres.
// Source positions are already in cabin coordinates; looking away or turning
// the radio OFF does not rotate or silence a horn outside the van.
export function driveWreckHornFrame(state={},sources=[]){
 const time=Math.max(0,Number(state.programTime)||0);
 return sources.filter(source=>source.kind==='wreck-horn'&&source.position?.length===3&&source.position.every(Number.isFinite)).map(source=>{
  const seed=Number(source.seed)||0,range=Math.hypot(...source.position),period=11.7+(seed%5)*1.91,phase=((time+seed*2.713)%period+period)%period;
  const duration=source.overhead?3.6:1.25+(seed%3)*.61,attack=clamp(phase/.14),release=clamp((duration-phase)/.42),pulse=phase<duration?attack*release:0;
  const attenuation=1/(1+(range/13)**2),distanceLoad=clamp(source.load??1);
  return{id:source.id,range,pan:clamp(source.position[0]/Math.max(2,Math.hypot(source.position[0],source.position[2])),-.94,.94),
   frequency:275+(seed%4)*37+(source.overhead?-19:0),gain:.07*pulse*attenuation*distanceLoad,phase,pulse,position:source.position};
 }).sort((a,b)=>a.range-b.range).slice(0,3);
}

// A continuous material response to the same travelling load that deforms the
// water and anatomy. There is no oscillator/event clock here: programme time
// owns the shared input, while spatial water/body/remnant domains overlap.
export function driveExteriorAcousticFrame(state={},weatherFrame=null,evolution=state.evolution){
  const weather=evolution?.weather||{},load=evolution?.load,active=load?.schema===1;
  const rain=clamp(weatherFrame?.rain??weather.rain??.26),wet=clamp(weatherFrame?.roadWetness??.35);
  const wind=weather.wind||weatherFrame?.wind||[0,0],gust=clamp(weather.gust??weatherFrame?.gust??0),shelter=clamp(weather.shelter??weatherFrame?.shelter??0),speed=Math.abs(Number(state.speed)||0);
  const windSpeed=Math.hypot(Number(wind[0])||0,Number(wind[1])||0),air=clamp((windSpeed+speed*.7)/22);
  const enabled=state.cutEnabled!==false,water=active&&enabled?clamp(load.water):0,anatomy=active&&enabled?clamp(load.anatomy):0,aftermath=active&&enabled?clamp(load.aftermath):0;
  const pressure=active?clamp(load.value):0,inner=active?clamp(load.innerValue):0,release=active?clamp(load.release):0;
  const strain=active?clamp(Math.abs(Number(load.velocity)||0)*2.4+Math.abs(Number(load.innerVelocity)||0)*2.8):0;
  const unloading=active?clamp(Math.max(0,-(Number(load.velocity)||0))*2.7+release*.38):0;
  const presence=clamp(water*.78+anatomy*.92+aftermath*.34);
  return{active,rain,wetness:wet,windSpeed,gust,shelter,water,anatomy,aftermath,pressure,inner,release,strain,unloading,
    // The same rain darkens and acquires weight beneath the loaded structure;
    // it never vanishes merely because the next named route section begins.
    roofGain:rain*(.11+.045*gust)*(1-.82*shelter)*(1-.58*anatomy+.10*water*unloading),
    roofHz:2450-1450*anatomy+320*strain*anatomy,
    glassGain:rain*(.027+speed*.0018)*(1-.45*shelter)*(1-.23*anatomy),
    windGain:(.008+air*.09+gust*.025)*(1-.55*shelter)*(1-.48*anatomy+.10*water*release),
    windHz:(150+air*620+gust*180)*(1-.44*anatomy)+65*presence*pressure,
    // All four responses use the existing physical noise carrier and are
    // mixed before the cabin monitor/REC fork, never into the receiver.
    pressureGain:presence*(.009+.040*pressure+.012*inner),pressureHz:64+44*water-22*anatomy+18*(1-pressure),
    waterGain:water*(.012+.059*strain+.025*unloading)*(1-.48*anatomy),waterHz:820-490*pressure+150*strain,
    fibreGain:anatomy*(.008+.072*strain+.027*unloading)+aftermath*(.003+.022*strain),fibreHz:265+410*strain+115*inner,
    roofLoadGain:rain*anatomy*(.006+.052*unloading+.015*strain),roofLoadHz:480+170*strain-110*pressure,
    clock:'saved programme / shared spatial load',provenance:'synthetic physical material reference; final recorded foley and listening approval pending'};
}

// These are material reactions to the cage's actual visible physiology, not a
// human breathing performance. Velocities are signed per simulation second;
// `drip` is the visible release pulse, never a counter or audio-owned event.
export function drivePhysiologyFoleyHints(physiology){
  if(!physiology||typeof physiology!=='object')return null;
  const respiration=clamp(physiology.respiration),wince=clamp(physiology.wince),secretion=clamp(physiology.secretion),drip=clamp(physiology.drip);
  const inhale=clamp(Math.max(0,Number(physiology.inhaleVelocity)||0)*1.8),exhale=clamp(Math.max(0,-(Number(physiology.inhaleVelocity)||0))*1.8);
  const contraction=clamp(Math.max(0,Number(physiology.winceVelocity)||0)*.65),rebound=clamp(Math.max(0,-(Number(physiology.winceVelocity)||0))*.75);
  return{respiration,wince,secretion,drip,inhale,exhale,contraction,rebound,
    // Wetness alone is silent. Adhesion needs moving tissue or a released
    // visible drop; release briefly excites the same fixed cavity/skin source.
    adhesiveDrag:clamp(.32*inhale+.40*contraction+secretion*(.23*inhale+.35*contraction+.26*drip)),
    settling:clamp(.23*exhale+.34*rebound+secretion*.56*drip),
    cavityPressure:clamp(.22*respiration+.20*wince)};
}

export function driveLoadedFoleySources(state,sources=[],evolution=state.evolution){
  if(evolution?.load?.schema!==1)return sources;
  return sources.map(source=>{
    const distance=Number.isFinite(source.motion?.distance)?source.motion.distance:Number.isFinite(source.distance)?source.distance:Number(evolution.currentDistance)||-state.z;
    const load=source.motion?.load?.schema===1?source.motion.load:driveLoadAt({timeSec:state.programTime,furthest:state.furthest||0,distance});
    const response=driveExteriorAcousticFrame(state,null,{load}),kind=source.motion?.kind||source.kind||'anatomy',water=kind==='water';
    const presence=state.cutEnabled===false?0:clamp(water?load.water:load.anatomy+.26*load.water+.32*load.aftermath);
    const foley={adhesiveDrag:presence*(water?.14:.9)*response.strain,
      settling:presence*(water?.48:1)*response.unloading,
      cavityPressure:presence*response.pressure,
      harmonicCoupling:presence*(water?.035:.07)*response.pressure*(1-.75*response.strain)};
    const physiology=source.motion?.physiology||source.physiology||null,hints=water?null:drivePhysiologyFoleyHints(physiology);
    if(hints){
      foley.adhesiveDrag=presence*clamp(.9*response.strain+hints.adhesiveDrag);
      foley.settling=presence*clamp(response.unloading+hints.settling);
      foley.cavityPressure=presence*clamp(response.pressure+hints.cavityPressure);
    }
    return{...source,motion:{...source.motion,kind,load,physiology,physiologyFoley:hints,foley}};
  });
}

export function driveExteriorPans(sources=[]){
  const nearest=kind=>{let best=null,range=Infinity;for(const source of sources){if((source.motion?.kind||source.kind)!==kind||!Array.isArray(source.position)||source.position.length!==3||source.position.some(n=>!Number.isFinite(n)))continue;const distance=Math.hypot(...source.position);if(distance<range){range=distance;best=source.position;}}return best;};
  const pan=(position,fallback)=>position?clamp(position[0]/Math.max(3,Math.hypot(position[0],position[2])),-.92,.92):fallback;
  const waterPan=pan(nearest('water'),-.68),fibrePan=pan(nearest('anatomy'),0);
  return{waterPan,fibrePan,pressurePan:waterPan*.55+fibrePan*.45};
}

// Present only on the transient opening controller. Ordinary driving has no
// underwater bus, cue clock, radio failure or mechanical cinematic override.
export function driveOpeningAcousticFrame(state){
 const opening=state?.openingCinematic;if(opening?.schema!==1)return null;
 const a=opening.audio||{},submerged=clamp(a.submerged),timeSec=Math.max(0,Number(opening.timeSec)||0);
 return{timeSec,phase:opening.phase,submerged,enginePower:clamp(a.enginePower??1),radioPower:clamp(a.radioPower??1),waterImpact:clamp(a.waterImpact),bodyGrind:clamp(a.bodyGrind),metalStrain:clamp(a.metalStrain),windOpen:clamp(a.windOpen),roadContact:['free-drive','sound-lead','departure'].includes(opening.phase)?1:0,filterHz:18000*(1-submerged)+430*submerged,cues:Array.isArray(opening.cues)?opening.cues:[]};
}

export class SourceDriveAcoustics {
  constructor({ context, destination, gain = .5, fetcher = globalThis.fetch } = {}) {
    if (!context?.createGain || !destination) throw Error('The drive requires the host AudioContext and output bus.');
    this.context = context;
    this.destination = destination;
    this.outputGain = gain;
    this.fetcher = fetcher;
    this.nodes = [];
    this.continuous = [];
    this.transients = new Set();
    this.programmes = new Map();
    this.programmeOptions = new Map();
    this.scratchKeys = new Set();
    this.voices = new Map();
    this.assetErrors = [];
    this.programmeTails = new Set();
    this.programme = null;
    this.programmeKey = '';
    this.events = [];
    this.paused = true;
    this.closed = false;
  }

  async initialize() {
    if (this.initializing) return this.initializing;
    if (this.cabin || this.closed) return this;
    const c = this.context;
    const node = n => { this.nodes.push(n); return n; };
    const gain = value => { const n = node(c.createGain()); n.gain.value = value; return n; };
    const filter = (type, hz, q = .7) => { const n = node(c.createBiquadFilter()); n.type = type; n.frequency.value = hz; n.Q.value = q; return n; };
    this.cabin = gain(0);
    this.output = gain(this.outputGain);
    this.cabin.connect(this.output); this.output.connect(this.destination);
    this.radio = gain(.65);
    this.radioHighpass = filter('highpass', 175);
    const radioFilter = this.radioFilter = filter('lowpass', 4600), speaker = node(c.createStereoPanner());
    speaker.pan.value = -.36;
    this.radio.connect(this.radioHighpass); this.radioHighpass.connect(radioFilter); radioFilter.connect(speaker); speaker.connect(this.cabin);
    this.programmeGain = gain(1);this.programmeGain.connect(this.radio);
    this.echo = node(c.createDelay(.5));this.echo.delayTime.value=.127;
    this.echoGain = gain(0);this.echoFeedback=gain(.18);
    this.programmeGain.connect(this.echo);this.echo.connect(this.echoGain);this.echoGain.connect(this.radio);
    this.echo.connect(this.echoFeedback);this.echoFeedback.connect(this.echo);
    this.fingerprint = gain(0); this.fingerprint.connect(this.radio);
    this.noise = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    let seed = 11983;
    const samples = this.noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; samples[i] = (seed / 4294967296 * 2 - 1) * .35; }
    const loop = () => { const n = node(c.createBufferSource()); n.buffer = this.noise; n.loop = true; this.continuous.push(n); return n; };
    const road = loop(); this.roadFilter = filter('lowpass', 650); this.roadGain = gain(0);
    road.connect(this.roadFilter); this.roadFilter.connect(this.roadGain); this.roadGain.connect(this.cabin);
    this.engineFilter = filter('lowpass', 180); this.engineGain = gain(.018);
    this.engineFilter.connect(this.engineGain); this.engineGain.connect(this.cabin);
    this.engine = node(c.createOscillator()); this.engine.type = 'triangle'; this.engine.frequency.value = 28;
    this.engine.connect(this.engineFilter); this.continuous.push(this.engine);
    this.harmonic = node(c.createOscillator()); this.harmonic.type = 'sawtooth'; this.harmonic.frequency.value = 56;
    const harmonicGain = gain(.14); this.harmonic.connect(harmonicGain); harmonicGain.connect(this.engineFilter); this.continuous.push(this.harmonic);
    const carrier = loop(); this.carrierFilter = filter('bandpass', 2600, 1.1); this.carrierGain = gain(.004);
    carrier.connect(this.carrierFilter); this.carrierFilter.connect(this.carrierGain); this.carrierGain.connect(this.radio);
    const weatherLoop=(type,hz,pan)=>{const source=loop(),f=filter(type,hz),g=gain(0),p=node(c.createStereoPanner());p.pan.value=pan;source.connect(f);f.connect(g);g.connect(p);p.connect(this.cabin);return{source,filter:f,gain:g,panner:p};};
    this.roofRain=weatherLoop('bandpass',2450,.08);
    this.glassRain=weatherLoop('highpass',4200,-.15);
    this.wind=weatherLoop('lowpass',360,-.22);
    this.wiper=weatherLoop('bandpass',1050,-.16);
    // One exterior changes its acoustic material while retaining the same
    // pressure front and carrier. The flank follows its physical cabin-space source; roof strain stays up
    // in the cabin mix. No new node or random event is allocated during sync.
    this.loadedPressure=weatherLoop('bandpass',82,-.45);this.loadedPressure.filter.Q.value=1.15;
    this.loadedWater=weatherLoop('bandpass',650,-.68);this.loadedWater.filter.Q.value=.66;
    this.loadedFibre=weatherLoop('bandpass',440,-.28);this.loadedFibre.filter.Q.value=.83;
    this.loadedRoof=weatherLoop('bandpass',480,.06);this.loadedRoof.filter.Q.value=1.35;
    this.wreckHorns=Array.from({length:3},()=>{const low=node(c.createOscillator()),high=node(c.createOscillator()),f=filter('lowpass',1350,1.1),g=gain(0),p=node(c.createStereoPanner());low.type='sawtooth';high.type='triangle';low.frequency.value=300;high.frequency.value=375;const mix=gain(.37);low.connect(mix);high.connect(mix);mix.connect(f);f.connect(g);g.connect(p);p.connect(this.cabin);this.continuous.push(low,high);return{low,high,filter:f,gain:g,panner:p};});
    this.analyser = node(c.createAnalyser()); this.analyser.fftSize = 256;
    this.cabin.connect(this.analyser); this.samples = new Float32Array(256);
    this.foley = new CutFoley({ ctx: c, cabin: this.cabin, noise: this.noise });
    for (const n of this.continuous) n.start();
    this.initializing=(async()=>{
      const loaded=await loadScratchVoices(c,{fetcher:this.fetcher});
      if(this.closed)return this;
      this.voices=loaded.voices;this.assetErrors=loaded.errors;
      for(const station of ['service','company','music'])this.getProgramme(`${station}-ordinary`);
      return this;
    })();
    return this.initializing;
  }

  getProgramme(name) {
    if(this.programmes.has(name))return this.programmes.get(name);
    const [station,phase]=name.split('-'),index=RADIO_PHASES.indexOf(phase);
    const buffer=renderScratchProgramme(this.context,station,index,this.voices);
    this.programmes.set(name,buffer);this.scratchKeys.add(name);
    this.programmeOptions.set(name,{loop:true,temporary:true});
    // Four mono16k/72s buffers =18.432MB maximum. Current source retains its
    // buffer until stopped, but an unselected old station never grows a bank.
    for(const key of this.scratchKeys){if(this.scratchKeys.size<=4)break;if(key===name||key===this.programmeName)continue;this.scratchKeys.delete(key);this.programmes.delete(key);this.programmeOptions.delete(key);}
    return buffer;
  }

  loadProgramme(name, buffer, {loop=true,temporary=false,cues=null}={}) {
    if (!/^(service|company|music)-(ordinary|discrepancy|recognition|contradiction|arrival)$/.test(name) || !Number.isFinite(buffer?.duration)) throw Error('Invalid drive programme identity or decoded buffer.');
    this.programmes.set(name, buffer);
    this.programmeOptions.set(name,{loop:!!loop,temporary:!!temporary,cues});
    if(!temporary)this.scratchKeys.delete(name);
    this.stopProgramme();
  }

  async loadManifest(manifest,{fetcher=this.fetcher}={}) {
    if(!Array.isArray(manifest?.programmes))throw Error('Invalid programme replacement manifest.');
    for(const row of manifest.programmes){const response=await fetcher(row.url);if(!response?.ok)throw Error(`Programme master unavailable: ${row.name}`);const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(this.closed)return false;this.loadProgramme(row.name,buffer,row);}
    return true;
  }

  stopProgramme() {
    const n = this.programme; this.programme = null; this.programmeKey = '';
    if (n) { try { n.stop(); } catch {} n.disconnect(); }
    for(const tail of this.programmeTails){try{tail.stop();}catch{}tail.disconnect();}this.programmeTails.clear();
  }

  setPaused(paused) {
    this.paused = !!paused;
    if (!this.cabin) return;
    this.cabin.gain.cancelScheduledValues(this.context.currentTime);
    this.cabin.gain.setValueAtTime(paused ? 0 : 1, this.context.currentTime);
    if (paused) {
      this.stopProgramme();
      this.lastWiper=null;
      for (const n of this.transients) { try { n.stop(); } catch {} }
    }
  }

  openingReadiness(state){
    const frame=programmeFrame({...state,paused:false}),name=`${frame.station}-${RADIO_PHASES[frame.phase]}`,options=this.programmeOptions.get(name);
    if(this.context.state!=='running')return{ready:false,reason:'Audio is held. Press Enter to resume the journey.'};
    if(!this.cabin||!this.programmes.has(name))return{ready:false,reason:'The radio programme could not be prepared.'};
    if(options?.temporary&&frame.cue&&!this.voices.has(frame.cue.id))return{ready:false,reason:'The opening radio recording could not be loaded.'};
    return{ready:true,station:frame.station,cue:frame.cue?.id||null,programmeSecond:state.programTime};
  }

  primeMovingOpening(state){
    // This receiver was already tuned before the remembered picture began.
    // Ordinary user tuning and saved-session resumes keep their own behavior.
    this.activeStation=state.station;this.activePhase=programmeFrame(state).phase;this.tuneUntil=state.programTime;
  }

  async retryMovingOpening(state){
    const frame=programmeFrame({...state,paused:false}),name=`${frame.station}-${RADIO_PHASES[frame.phase]}`;
    if(this.programmeOptions.get(name)?.temporary&&frame.cue&&!this.voices.has(frame.cue.id)){
      const id=frame.cue.id,loaded=await loadScratchVoices(this.context,{fetcher:this.fetcher,clipIds:[id]});
      if(this.closed)return{ready:false,reason:'The journey has closed.'};
      for(const[key,voice]of loaded.voices)this.voices.set(key,voice);
      this.assetErrors=[...this.assetErrors.filter(error=>!error.startsWith(id+':')),...loaded.errors];
      // Cached scratch PCM contains the earlier silence. Only replace this
      // station's temporary buffers; supplied masters and other stations stay.
      for(const key of [...this.scratchKeys])if(key.startsWith(frame.station+'-')){this.scratchKeys.delete(key);this.programmes.delete(key);this.programmeOptions.delete(key);}
      this.getProgramme(name);
    }
    return this.openingReadiness(state);
  }

  sync(state, cutSources = [], weatherFrame = null, evolution = state.evolution, predicamentSources = []) {
    if (this.closed || !this.cabin || this.paused || state.paused) return;
    const c = this.context, now = c.currentTime;
    const target = (param, value, seconds = .08) => param.setTargetAtTime(value, now, seconds);
    const opening=driveOpeningAcousticFrame(state);if(opening)this.ensureOpeningBus();
    const speed = Math.abs(state.speed), load = clamp(state.engineLoad), throttle = clamp(state.throttle);
    const rpm = clamp(850 + speed * (state.gear < 0 ? 185 : 105) + load * 450 + (speed < .5 ? throttle * 250 : 0), 650, 4800);
    const rough = state.surface === 'verge' ? 1 : state.surface === 'shoulder' ? .55 : 0;
    const motion = clamp(speed / 16), body = clamp(Math.abs(state.longitudinalAcceleration) / 5 + Math.abs(state.heaveVelocity) * .8);
    this.engineHz = rpm / 30;
    target(this.engine.frequency, this.engineHz, .065); target(this.harmonic.frequency, this.engineHz * 2, .065);
    target(this.engineFilter.frequency, 130 + load * 290 + throttle * 70, .1);
    target(this.engineGain.gain, (.016 + load * .031 + motion * .006 + body * .003)*(opening?.enginePower??1));
    const grain = 1 + .035 * Math.sin(state.odometer * 19.7) + .025 * Math.sin(state.odometer * 43.1);
    const wetRoad=clamp(weatherFrame?.roadWetness??.35);
    target(this.roadGain.gain, (.14 + rough * .085 + wetRoad*.035 + clamp((Math.abs(state.roadOffset) - 2.4)) * .014) * motion * (grain + body * .06)*(opening?.roadContact??1));
    target(this.roadFilter.frequency, 430 + speed * 25 + rough * 850+wetRoad*speed*12, .1);
    if (this.lastGear != null && this.lastGear !== state.gear) this.click('gear-engagement', .32);
    this.lastGear = state.gear;
    target(this.radio.gain, state.radioOn ? clamp(state.volume??.65)*(opening?.radioPower??1) : 0, .012);
    this.fingerprint.gain.setValueAtTime(state.station === 'service' ? 1 : 0, now);
    const wanted=programmeFrame(state,evolution);
    // Same-position phase edits happen only between both versions' utterances.
    // Tuning to another station seeks directly to its current clock position.
    if(this.activeStation!==state.station){this.activePhase=wanted.phase;this.tuneUntil=state.programTime+.16;this.activeStation=state.station;}
    if(this.activePhase==null)this.activePhase=wanted.phase;
    if(this.activePhase!==wanted.phase&&!wanted.cue&&!programmeFrame(state,evolution,{phase:this.activePhase}).cue)this.activePhase=wanted.phase;
    const radioFrame=this.currentProgrammeFrame=programmeFrame(state,evolution,{phase:this.activePhase});
    if(radioFrame.cue&&!this.voices.has(radioFrame.cue.id))radioFrame.caption=null;
    const {quality,dropout,bandwidthHz}=radioFrame.signal;
    target(this.radioFilter.frequency,bandwidthHz,.22);
    target(this.programmeGain.gain,quality*(1-dropout)*(state.programTime<(this.tuneUntil||0)?.12:1),.025);
    target(this.echoGain.gain,this.activePhase>=2?.035+(this.activePhase-2)*.035:0,.7);
    target(this.carrierGain.gain, .003+(1-quality)*.045+dropout*.026+(state.programTime<(this.tuneUntil||0)?.045:0), .045);
    target(this.carrierFilter.frequency, state.station === 'company' ? 1200 : 2800);
    const name = `${state.station}-${RADIO_PHASES[this.activePhase]}`, buffer = this.getProgramme(name),options=this.programmeOptions.get(name);
    if(!options.temporary){
      const position=options.loop?state.programTime%buffer.duration:state.programTime;
      const cue=options.cues?.find(cue=>position>=cue.start&&position<(cue.end??cue.start+cue.durationSeconds))||null;
      Object.assign(radioFrame,{cycleSeconds:position,cue,caption:radioFrame.audible&&cue?{speaker:cue.speaker||radioFrame.label,text:cue.text,cueId:cue.id||name,temporary:false}:null,provenance:'Supplied programme master through the physical receiver; cue captions from its replacement manifest.'});
    }
    const key = `${name}:${state.radioOn}`;
    const drift=this.programme?Math.abs((state.programTime-this.programmeClock)-(now-this.programmeAudioTime)):0;
    if (key !== this.programmeKey||drift>.12) {
      this.stopProgramme(); this.programmeKey = key;
      this.programmeName=name;
      const offset = options.loop?state.programTime%buffer.duration:state.programTime;
      if (buffer && state.radioOn && offset < buffer.duration) {
        const n = c.createBufferSource(); n.buffer = buffer;n.loop=options.loop; n.connect(this.programmeGain);
        this.programmeClock=state.programTime;this.programmeAudioTime=now;
        this.programme = n; n.start(0, offset);
        n.onended = () => { n.disconnect(); if (this.programme === n) this.programme = null; };
      }
    }
    this.syncWeather(state,weatherFrame,evolution,target);
    this.hornFrame=driveWreckHornFrame(state,predicamentSources);
    for(let i=0;i<this.wreckHorns.length;i++){const voice=this.wreckHorns[i],h=this.hornFrame[i];target(voice.gain.gain,h?.gain||0,.045);if(h){target(voice.low.frequency,h.frequency,.15);target(voice.high.frequency,h.frequency*1.247,.15);target(voice.panner.pan,h.pan,.11);}}
    const loadedSources=this.loadedSources=driveLoadedFoleySources(state,cutSources,evolution);
    const pans=this.exteriorPans=driveExteriorPans(loadedSources);
    target(this.loadedWater.panner.pan,pans.waterPan,.11);target(this.loadedFibre.panner.pan,pans.fibrePan,.11);target(this.loadedPressure.panner.pan,pans.pressurePan,.14);
    this.foley.sync({ sources: loadedSources, timeSec: state.programTime, engineHz: this.engineHz, enabled: state.cutEnabled !== false });
    if(opening)this.syncOpening(opening,target);
  }

  ensureOpeningBus(){
    if(this.openingFilter)return;
    const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=18000;filter.Q.value=.55;this.nodes.push(filter);
    this.cabin.disconnect(this.output);this.cabin.disconnect(this.analyser);
    this.cabin.connect(filter);filter.connect(this.output);filter.connect(this.analyser);this.openingFilter=filter;
  }

  recordingBus(){return this.openingFilter||this.cabin;}

  syncOpening(frame,target){
    target(this.openingFilter.frequency,frame.filterHz,.12);
    const dry=1-frame.submerged,weather=this.exteriorFrame;
    target(this.roofRain.gain.gain,weather.roofGain*dry,.08);target(this.glassRain.gain.gain,weather.glassGain*dry,.08);
    target(this.wind.gain.gain,(weather.windGain+frame.windOpen*.045)*dry,.09);
    target(this.loadedWater.gain.gain,.065*frame.submerged+.12*frame.waterImpact,.055);target(this.loadedWater.filter.frequency,520,.12);
    target(this.loadedPressure.gain.gain,.024*frame.submerged,.12);
    target(this.loadedFibre.gain.gain,.027*frame.bodyGrind+.012*frame.metalStrain,.06);target(this.loadedFibre.filter.frequency,330+frame.metalStrain*470,.08);
    target(this.loadedRoof.gain.gain,.058*frame.bodyGrind+.022*frame.metalStrain,.06);target(this.loadedRoof.filter.frequency,180+frame.metalStrain*330,.08);
    for(let i=0;i<this.wreckHorns.length;i++)target(this.wreckHorns[i].gain.gain,(this.hornFrame[i]?.gain||0)*(1-.94*frame.submerged),.07);
    if(frame.radioPower<.02&&this.currentProgrammeFrame)Object.assign(this.currentProgrammeFrame,{audible:false,caption:null});
    const previous=this.openingFrame?.timeSec;this.openingCueLog=this.openingCueLog||[];
    if(previous!=null&&frame.timeSec>=previous)for(const cue of frame.cues){if(cue.time>previous&&cue.time<=frame.timeSec){this.openingCueLog.push({id:cue.id,at:frame.timeSec,scheduled:cue.time,late:frame.timeSec-cue.time});if(cue.id==='sea-impact'&&frame.timeSec-cue.time<.5)this.transient({kind:'opening-water-impact',strength:1});}}
    this.openingFrame=frame;
  }

  syncWeather(state,weatherFrame,evolution,target){
    const response=this.exteriorFrame=driveExteriorAcousticFrame(state,weatherFrame,evolution),{rain,wetness:wet,windSpeed,gust,shelter}=response;
    target(this.roofRain.gain.gain,response.roofGain,.12);target(this.roofRain.filter.frequency,response.roofHz,.15);
    target(this.glassRain.gain.gain,response.glassGain,.15);
    target(this.wind.gain.gain,response.windGain,.14);target(this.wind.filter.frequency,response.windHz,.18);
    for(const [node,gain,hz]of[[this.loadedPressure,response.pressureGain,response.pressureHz],[this.loadedWater,response.waterGain,response.waterHz],[this.loadedFibre,response.fibreGain,response.fibreHz],[this.loadedRoof,response.roofLoadGain,response.roofLoadHz]]){target(node.gain.gain,gain,.075);target(node.filter.frequency,hz,.11);}
    // Rubber drag follows actual rendered blade travel; each direction change
    // contributes one quiet linkage contact. Reload/pause only primes history.
    const angle=weatherFrame?.wiperAngles?.[0],moving=!!weatherFrame?.wiperMoving;
    let velocity=0,direction=0;const previous=this.lastWiper,dt=previous?state.programTime-previous.time:0;
    if(moving&&Number.isFinite(angle)&&dt>0&&dt<.26){velocity=Math.abs(angle-previous.angle)/dt;direction=Math.sign(angle-previous.angle);if(previous.direction&&direction&&direction!==previous.direction)this.transient({kind:'wiper-return',strength:.14});}
    const snow=clamp(weatherFrame?.snow??evolution?.weather?.snow??0);
    target(this.wiper.gain.gain,moving?clamp(velocity/2.5)*(.009+(1-wet)*.016+snow*.018):0,.035);
    if(Number.isFinite(angle))this.lastWiper={time:state.programTime,angle,direction:direction||previous?.direction||0};
    this.weatherState={rain,snow,fog:weatherFrame?.fog||0,whiteout:weatherFrame?.whiteout||0,wetness:wet,windSpeed,gust,shelter,wiperMoving:moving,wiperVelocity:velocity};
  }

  transient({ radio = false, strength = 1, kind = 'joint' } = {}) {
    if (!this.cabin || this.paused || this.closed) return;
    const c = this.context, t = c.currentTime, source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain();
    source.buffer = this.noise;
    const waterImpact=kind==='opening-water-impact';
    filter.type = kind === 'joint'||waterImpact ? 'lowpass' : 'bandpass';
    filter.frequency.value = waterImpact?170:kind === 'gear-engagement' ? 180 : kind==='wiper-return'?720:kind === 'joint' ? (radio ? 780 : 980) : 1500;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime((waterImpact?1.15:kind === 'joint' ? .8 : .12) * clamp(strength, 0, 1.5), t + .004);
    gain.gain.exponentialRampToValueAtTime(.0001, t + (waterImpact?.65:kind === 'joint' ? .11 : .045));
    source.connect(filter); filter.connect(gain); gain.connect(radio ? this.fingerprint : this.cabin);
    this.transients.add(source); source.start(t, 0, waterImpact?.72:kind === 'joint' ? .15 : .06);
    source.onended = () => { this.transients.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  joint(options) { this.transient({ ...options, kind: 'joint' }); }
  click(kind = 'tuning-control', strength = .75) { this.transient({ kind, strength }); }
  programmeFrame(){if(!this.currentProgrammeFrame)return null;return this.paused?{...this.currentProgrammeFrame,audible:false,caption:null}:this.currentProgrammeFrame;}
  level() { if (!this.analyser) return 0; this.analyser.getFloatTimeDomainData(this.samples); return Math.sqrt(this.samples.reduce((n, v) => n + v * v, 0) / this.samples.length); }
  diagnostics() { return { ready: !!this.cabin, paused: this.paused, level: this.level(), opening:this.openingFrame?{...this.openingFrame,cues:this.openingCueLog,filterHz:this.openingFilter?.frequency.value}:null,engine:{hz:this.engineHz||0,gain:this.engineGain?.gain.value||0,filterHz:this.engineFilter?.frequency.value||0}, loadedProgrammes: [...this.programmes.keys()],programmeCacheBytes:[...this.programmes.values()].reduce((n,b)=>n+b.length*b.numberOfChannels*4,0),scratchCacheLimitBytes:18432000,temporaryVoiceClips:this.voices.size,assetErrors:[...this.assetErrors],finishedProgrammeMastersPresent:[...this.programmes.keys()].some(k=>!this.scratchKeys.has(k)),finishedVoiceTakesPresent:[...this.programmeOptions.values()].some(o=>!o.temporary&&o.cues?.some(c=>c.speaker)),programme:this.programmeFrame(),weather:this.weatherState||null,wreckHorns:this.hornFrame||[],exterior:this.exteriorFrame?{...this.exteriorFrame,pans:this.exteriorPans||null}:null,physicalSources:(this.loadedSources||[]).map(source=>({id:source.id,position:source.position,kind:source.motion?.kind||source.kind||'anatomy',distance:source.motion?.distance,load:source.motion?.load||null,physiology:source.motion?.physiology||null,physiologyFoley:source.motion?.physiologyFoley||null})),foley: this.foley?.diagnostics(), provenance: 'Temporary local stock-system anonymous programme speech; original synthesized station beds and cabin/weather/foley references. Finished user takes only when explicitly loaded.' }; }
  dispose() {
    if (this.closed) return;
    this.setPaused(true); this.closed = true; this.foley?.dispose();
    for (const n of this.continuous) { try { n.stop(); } catch {} }
    for (const n of this.nodes) n.disconnect();
    this.nodes = []; this.continuous = []; this.programmes.clear();
  }
}
