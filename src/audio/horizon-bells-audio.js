// THE TOWER ROAD'S BELLS, heard. The sampled ring the belfry uses
// (assets/audio/bell-tower: BigSoundBank CC0, one hand and one back stroke per
// bell), struck where the bell actually is: panned by its bearing from where he
// is looking and dulled and quietened by how far off it is in the curved space.
// A big bell is the same casting much lower; a miniature, much higher.
import {normalizeBellStemManifest,chooseBellStem} from './bell-stem-manifest.js';
import {BELL_TOWER_STEM_MANIFEST_URL} from './bell-stem-assets.js';
import {HORIZON_BELL_SIZES} from '../data/horizon-tower-bells.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
// How a bell `distance` metres off, at `bearing` radians from straight ahead
// (positive to his right), is heard. Never silent: the space carries it.
export function horizonBellVoicing({distance=0,bearing=0,size='regular'}={}){
  const S=HORIZON_BELL_SIZES[size]||HORIZON_BELL_SIZES.regular,d=Math.max(0,Number(distance)||0);
  const near=1/(1+(d/9)**1.2);
  return{gain:clamp(S.gain*(.12+.88*near),0,2),pan:clamp(Math.sin(Number(bearing)||0)*.9,-.9,.9),
    lowpass:1400+12000*near,rate:S.rate};
}
export function createHorizonBellsAudio({context,destination,fetcher=globalThis.fetch,manifestUrl=BELL_TOWER_STEM_MANIFEST_URL}={}){
  let manifest=null,loading=null,disposed=false;const buffers=new Map(),voices=new Set();
  const base=String(manifestUrl).replace(/[^/]*$/,'');
  function load(){
    if(loading)return loading;
    loading=(async()=>{
      const response=await fetcher(String(manifestUrl));if(!response?.ok)throw Error('The bell manifest is unavailable.');
      manifest=normalizeBellStemManifest(await response.json());
      await Promise.all(manifest.entries.map(async entry=>{
        const res=await fetcher(base+entry.url);if(!res?.ok)return;
        const bytes=await res.arrayBuffer();if(disposed||!context)return;
        buffers.set(entry.url,await context.decodeAudioData(bytes));
      }));
      return!disposed;
    })().catch(error=>{console.warn('[horizon-bells]',error);loading=null;return false;});
    return loading;
  }
  // One strike: which bell of the ring, which stroke, when, and how it is heard.
  function strike({ring,stroke='hand',delay=0,voicing}){
    if(disposed||!context||!manifest)return false;
    const entry=chooseBellStem(manifest,{bell:ring,stroke,rowIndex:0,place:0}),buffer=entry&&buffers.get(entry.url);
    if(!buffer)return false;
    const at=context.currentTime+Math.max(0,delay),source=context.createBufferSource(),tone=context.createBiquadFilter(),pan=context.createStereoPanner?.(),level=context.createGain();
    source.buffer=buffer;source.playbackRate.value=voicing.rate;
    tone.type='lowpass';tone.frequency.value=voicing.lowpass;
    level.gain.value=voicing.gain*10**((entry.gainDb||0)/20)*4;
    source.connect(tone);
    if(pan){pan.pan.value=voicing.pan;tone.connect(pan);pan.connect(level);}else tone.connect(level);
    level.connect(destination);
    source.start(at,(entry.contactOffsetSamples||0)/(buffer.sampleRate||48000));
    voices.add(source);source.onended=()=>{voices.delete(source);try{level.disconnect();}catch{}};
    return true;
  }
  // A bell's two strokes, as the scene scheduled them.
  function ring({ring:bell,strikes=[],voicing}){
    let played=0;for(const s of strikes)if(strike({ring:bell,stroke:s.stroke,delay:s.at,voicing}))played++;
    return played;
  }
  function stop(){for(const source of voices)try{source.stop();}catch{}voices.clear();}
  function dispose(){disposed=true;stop();}
  return{load,ring,strike,stop,dispose,ready:()=>!!manifest&&buffers.size>0,diagnostics:()=>({loaded:buffers.size,voices:voices.size})};
}
