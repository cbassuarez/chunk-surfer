import { ELLERY_BELLS } from '../data/bell-tower.js';
import { BELL_TOWER_STEM_MANIFEST_URL } from './bell-stem-assets.js';
import { loadBellStemBank, loadBellStemBankFromUrl } from './bell-stem-manifest.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const dbToGain = (db) => 10 ** ((Number(db) || 0) / 20);

// Procedural synthesis remains the release-safe fallback until a licensed stem
// manifest is supplied. The owner-provided long recording stays dev-only.
export function createBellTowerAudio({
  context,
  destination = null,
  origin = { x: 0, z: 0 },
  devBedUrl = import.meta.env?.DEV ? '/__dev/change-ringing-peal.wav' : null,
  stemManifest = null,
  stemManifestUrl = BELL_TOWER_STEM_MANIFEST_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const ctx = context;
  if (!ctx) return { start() {}, strike() {}, setShutters() {}, releaseShutters() {}, stand() {}, cut() {}, destroy() {}, loadStems: async () => null, maskingDb: () => 0, snapshot: () => ({ audioMode: 'unavailable', stemStatus: 'unavailable' }) };
  const master = ctx.createGain(), internal = ctx.createGain(), exterior = ctx.createGain(), bedInternal=ctx.createGain(),bedExterior=ctx.createGain();
  master.gain.value = .72; internal.gain.value = 1; exterior.gain.value = 0;
  internal.connect(master); exterior.connect(master);bedInternal.gain.value=.42;bedExterior.gain.value=0;bedInternal.connect(master);bedExterior.connect(master);master.connect(destination || ctx.destination);
  let active = new Set(), masking = 0, shutters = 0;
  let bed=null,bedSource=null;
  let stemSource=stemManifest||stemManifestUrl;
  let stemBank=null,stemStatus=stemSource?'loading':'absent',stemError=null,stemPromise=null,loadingSource=null;
  if(devBedUrl&&typeof Audio!=='undefined'){
    bed=new Audio(devBedUrl);bed.preload='metadata';bed.loop=true;bed.crossOrigin='anonymous';
    try{bedSource=ctx.createMediaElementSource(bed);bedSource.connect(bedInternal);bedSource.connect(bedExterior);}catch{bed=null;bedSource=null;}
  }

  function loadStems(nextSource=stemSource) {
    if(!nextSource){stemStatus='absent';stemBank=null;stemSource=null;return Promise.resolve(null);}
    if(stemPromise&&nextSource===loadingSource)return stemPromise;
    stemSource=nextSource;loadingSource=nextSource;stemStatus='loading';stemError=null;
    const loader=typeof nextSource==='string'
      ? loadBellStemBankFromUrl(ctx,nextSource,{fetchImpl})
      : loadBellStemBank(ctx,nextSource,{fetchImpl});
    stemPromise=loader.then((bank)=>{
      stemBank=bank;stemStatus='ready';if(bed)bed.pause();return bank;
    }).catch((error)=>{
      stemBank=null;stemStatus='error';stemError=String(error?.message||error);console.warn('bell stems unavailable; using synthesis fallback',error);return null;
    });
    return stemPromise;
  }
  if(stemSource)void loadStems(stemSource);

  function oscillator(freq, when, gain, duration, detune = 0, output = internal) {
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(freq, when); osc.detune.value = detune;
    amp.gain.setValueAtTime(0.0001, when); amp.gain.exponentialRampToValueAtTime(Math.max(.0002, gain), when + .012); amp.gain.exponentialRampToValueAtTime(.0001, when + duration);
    osc.connect(amp); amp.connect(output); osc.start(when); osc.stop(when + duration + .05); active.add(osc); osc.onended = () => active.delete(osc);
  }
  function mechanical(when, amount = .03) {
    when=Math.max(ctx.currentTime,when);
    const length = Math.max(64, Math.floor(ctx.sampleRate * .18)), buffer = ctx.createBuffer(1, length, ctx.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1) * (1 - i / length);
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain(); source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = 820; filter.Q.value = .7; gain.gain.value = amount; source.connect(filter); filter.connect(gain); gain.connect(internal); source.start(when); active.add(source); source.onended = () => active.delete(source);
  }
  function stemVoice(entry,bell,targetContact){
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=entry.buffer;gain.gain.value=dbToGain(entry.gainDb);
    const pan=typeof ctx.createStereoPanner==='function'?ctx.createStereoPanner():null;
    if(pan){pan.pan.value=Math.max(-.9,Math.min(.9,((bell?.pivot?.x??origin.x)-origin.x)/5));source.connect(gain);gain.connect(pan);pan.connect(internal);pan.connect(exterior);}
    else{source.connect(gain);gain.connect(internal);gain.connect(exterior);}
    const contactOffset=entry.contactOffsetSamples/48000;
    const intendedStart=targetContact-contactOffset;
    const actualStart=Math.max(ctx.currentTime,intendedStart);
    const bufferOffset=Math.max(0,actualStart-intendedStart);
    if(bufferOffset>=entry.buffer.duration)return;
    source.start(actualStart,bufferOffset);
    active.add(source);source.onended=()=>active.delete(source);
  }
  function strike(record, bell = ELLERY_BELLS[record.bell - 1], {delaySec=0}={}) {
    const when = ctx.currentTime + Math.max(0,Number(delaySec)||0), stem=stemBank?.pick?.(record);
    if(stem){stemVoice(stem,bell,when);mechanical(when-.025,.018+record.bell*.0015);masking=Math.min(24,masking+2.8);return;}
    if(bed){masking=Math.min(24,masking+2.8);return;}
    const base = Number(bell?.frequency) || 116.54, weight = 1 - (record.bell - 1) * .045;
    const partials = [[1, .18, 8.2], [2.01, .055, 5.4], [2.41, .038, 4.1], [3.00, .025, 3.2], [4.17, .015, 2.5]];
    for (const [ratio, gain, duration] of partials) oscillator(base * ratio, when, gain * weight, duration, record.stroke === 'hand' ? -2 : 2, internal);
    oscillator(base, when + .018, .065 * weight * shutters, 9.5, 0, exterior);
    mechanical(when - .025, .018 + record.bell * .0015); masking = Math.min(24, masking + 2.8);
  }
  function setShutters(value) { shutters = clamp01(value); const t = ctx.currentTime; internal.gain.setTargetAtTime(1 - shutters * .34, t, .12); exterior.gain.setTargetAtTime(shutters * .9, t, .12);bedInternal.gain.setTargetAtTime(.42*(1-shutters*.45),t,.12);bedExterior.gain.setTargetAtTime(.38*shutters,t,.12); }
  function cut() { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(.0001, t, .006);if(bed)bed.pause(); for (const node of active) { try { node.stop(t + .012); } catch {} } active.clear(); masking = 0; }
  function start({offsetMs=0}={}) { const t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(Math.max(.0001, master.gain.value), t); master.gain.linearRampToValueAtTime(.72, t + .08); setShutters(0); masking = 0;if(bed&&!stemBank){try{const seek=()=>{if(Number.isFinite(bed.duration)&&bed.duration>0)bed.currentTime=(Math.max(0,Number(offsetMs)||0)/1000)%bed.duration;};seek();if(!Number.isFinite(bed.duration))bed.addEventListener('loadedmetadata',seek,{once:true});void bed.play().catch(()=>{});}catch{}} }
  return {
    start, strike, loadStems, setShutters, releaseShutters: () => setShutters(.02), stand: () => { masking = 0; }, cut,
    maskingDb: () => { masking *= .985; return masking; },
    destroy() { cut(); try { bedSource?.disconnect();internal.disconnect(); exterior.disconnect();bedInternal.disconnect();bedExterior.disconnect();master.disconnect(); } catch {} },
    snapshot: () => ({ activeVoices: active.size, shutters, maskingDb: masking, origin,devBed:!!bed,devBedUrl,stemStatus,stemCount:stemBank?.size||0,stemError,audioMode:stemBank?'stems':bed?'dev-bed':'synthesis' }),
  };
}
