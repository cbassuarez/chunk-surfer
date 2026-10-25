const finite=(value,fallback)=>Number.isFinite(value)?value:fallback;

// Redux's Bits/Rate distinction: https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/#redux
// This is a local linear quantiser and steady downsampling clock, not a claim
// of bit-exact reproduction of Ableton's proprietary device.
/** Signed PCM amplitude quantisation. Sample holding is a separate operation;
 * a low sample rate alone is never reported as bitcrushing. */
export function quantizeStandingTearPCM(input,{bitDepth=10,effectiveSampleRate=28000,sampleRate=48000}={}){
  if(!(input instanceof Float32Array))throw new TypeError('Standing Tear PCM must be a Float32Array.');
  if(!Number.isInteger(bitDepth)||bitDepth<8||bitDepth>12)throw new RangeError('Standing Tear bit depth must be an integer from 8 to 12.');
  if(!Number.isFinite(sampleRate)||sampleRate<=0)throw new RangeError('Standing Tear PCM needs its actual sample rate.');
  if(!Number.isFinite(effectiveSampleRate)||effectiveSampleRate<20000||effectiveSampleRate>36000)throw new RangeError('Standing Tear sample holding must stay between 20 and 36 kHz.');
  const rate=Math.min(sampleRate,effectiveSampleRate),ratio=rate/sampleRate,negative=2**(bitDepth-1),positive=negative-1;
  const samples=new Float32Array(input.length),levels=new Set();
  let phase=1,held=0,updates=0,invalidSamples=0,clippedSamples=0,inputPeak=0,outputPeak=0;
  for(let index=0;index<input.length;index++){
    const original=input[index];
    if(!Number.isFinite(original))invalidSamples++;
    else{inputPeak=Math.max(inputPeak,Math.abs(original));if(Math.abs(original)>1)clippedSamples++;}
    if(phase>=1){
      phase-=Math.floor(phase);
      const value=Math.max(-1,Math.min(1,finite(original,0))),scale=value<0?negative:positive;
      const code=Math.round(value*scale);
      held=code===0?0:code/scale;levels.add(code);updates++;
    }
    samples[index]=held;outputPeak=Math.max(outputPeak,Math.abs(held));phase+=ratio;
  }
  return{samples,diagnostics:{kind:'signed-pcm-amplitude-quantisation',bitDepth,possibleAmplitudeLevels:2**bitDepth,
    quantizerShape:'linear',dcShift:0,downsampleJitter:0,
    observedAmplitudeLevels:levels.size,negativeStep:1/negative,positiveStep:1/positive,
    requestedEffectiveSampleRate:effectiveSampleRate,effectiveSampleRate:rate,sampleRate,
    sampleHold:rate<sampleRate,sampleUpdates:updates,inputSamples:input.length,invalidSamples,clippedSamples,inputPeak,outputPeak}};
}

/** The actual buffer used by playback contains quantised samples. Encoding a
 * compressed audio file at a lower bitrate is deliberately not involved. */
export function createStandingTearProcessedBuffer(context,input,profile={}){
  if(!context?.createBuffer||!input?.getChannelData)throw new TypeError('Standing Tear processing needs an AudioBuffer and audio context.');
  const output=context.createBuffer(input.numberOfChannels,input.length,input.sampleRate),channels=[];
  for(let channel=0;channel<input.numberOfChannels;channel++){
    const result=quantizeStandingTearPCM(input.getChannelData(channel),{...profile,sampleRate:input.sampleRate});
    output.getChannelData(channel).set(result.samples);channels.push(result.diagnostics);
  }
  return{buffer:output,diagnostics:{...channels[0],channels:input.numberOfChannels,durationSeconds:input.length/input.sampleRate,
    channelDiagnostics:channels,processedBeforeSpatialisation:true}};
}

/** Deterministic, decorrelated stereo reflections. Each channel has unit
 * energy; the owner controls the wet level and disables convolver auto gain. */
export function createStandingTearImpulse(context,{decaySeconds=6.8,sampleRate=context?.sampleRate||48000,seed=0x73555246}={}){
  if(!context?.createBuffer||!Number.isFinite(sampleRate)||sampleRate<=0)throw new TypeError('Standing Tear reverb needs an audio context.');
  if(!Number.isFinite(decaySeconds)||decaySeconds<1||decaySeconds>12)throw new RangeError('Standing Tear reverb decay must be between 1 and 12 seconds.');
  const length=Math.ceil(sampleRate*decaySeconds),buffer=context.createBuffer(2,length,sampleRate),preDelay=.072;
  const reflections=[[.113,.62],[.197,-.47],[.337,.40],[.557,-.32],[.907,.24],[1.417,-.17]];
  for(let channel=0;channel<2;channel++){
    const values=buffer.getChannelData(channel);let state=(seed^(channel?0x6ac690c5:0x17ae239b))>>>0,colour=0;
    for(let index=Math.ceil(preDelay*sampleRate);index<length;index++){
      state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;
      colour+=(state/0xffffffff*2-1-colour)*.22;
      const time=index/sampleRate,attack=Math.min(1,(time-preDelay)/.12);
      values[index]=colour*attack*Math.exp(-6.90775527898*time/decaySeconds);
    }
    for(const [seconds,level]of reflections){
      const index=Math.round((seconds+(channel?.019:0))*sampleRate);
      if(index<length)values[index]+=level*Math.sqrt(sampleRate*.025);
    }
    const energy=Math.sqrt(values.reduce((sum,value)=>sum+value*value,0))||1;
    for(let index=0;index<length;index++)values[index]/=energy;
  }
  return buffer;
}
