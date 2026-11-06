// THE DIAL. Every time skip on the cliff road (src/game/source-drive/time-skips.js)
// sounds like turning the cab radio through the band: detent clicks under the
// fingers, static sweeping as the needle crosses nothing, a heterodyne whistle
// sliding down, and one last click as it lands on a station. Procedural, so it
// is the same cut every time and costs nothing to load.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));

export const RADIO_DIAL_CUT=Object.freeze({
  clicks:Object.freeze([0,.06,.13,.21]),land:.8,
  static:Object.freeze({attack:.05,release:.92,level:.16,sweep:Object.freeze([[0,700],[.25,2600],[.5,1400],[.72,3200],[.9,1800]])}),
  whistle:Object.freeze({from:2400,to:600,seconds:.5,level:.022}),
});

function noiseBuffer(ctx,seconds){
  const buffer=ctx.createBuffer(1,Math.max(1,Math.floor(ctx.sampleRate*seconds)),ctx.sampleRate),data=buffer.getChannelData(0);let s=4417;
  for(let n=0;n<data.length;n++){s=(Math.imul(s,1664525)+1013904223)>>>0;data[n]=s/2147483648-1;}
  return buffer;
}
/** Schedule one dial turn at `context.currentTime`. Returns the nodes it made. */
export function playRadioDialCut({context,destination,seconds=.95,gain=1,reducedFlash=false}={}){
  if(!context||!destination)return null;
  const A=RADIO_DIAL_CUT,now=context.currentTime,nodes=[],own=node=>(nodes.push(node),node);
  const out=own(context.createGain());out.gain.value=clamp(gain,0,1.5);out.connect(destination);
  const noise=noiseBuffer(context,seconds+.2);
  // Detents: a tick of plastic, and the small thunk of the shaft.
  const click=(at,level=1)=>{
    const src=own(context.createBufferSource()),hp=own(context.createBiquadFilter()),g=own(context.createGain());
    src.buffer=noise;hp.type='highpass';hp.frequency.value=1800;g.gain.setValueAtTime(0,now+at);g.gain.linearRampToValueAtTime(.22*level,now+at+.002);g.gain.exponentialRampToValueAtTime(.0005,now+at+.02);
    src.connect(hp);hp.connect(g);g.connect(out);src.start(now+at,(at*7)%.1,.03);
    const thunk=own(context.createOscillator()),tg=own(context.createGain());thunk.frequency.value=140;tg.gain.setValueAtTime(0,now+at);tg.gain.linearRampToValueAtTime(.1*level,now+at+.003);tg.gain.exponentialRampToValueAtTime(.0005,now+at+.03);
    thunk.connect(tg);tg.connect(out);thunk.start(now+at);thunk.stop(now+at+.04);
  };
  for(const at of A.clicks)click(at*seconds/.95);
  click(A.land*seconds/.95,1.25);
  // The band between stations.
  const hiss=own(context.createBufferSource()),band=own(context.createBiquadFilter()),hg=own(context.createGain());
  hiss.buffer=noise;band.type='bandpass';band.Q.value=1.2;
  for(const [u,hz] of A.static.sweep)band.frequency.linearRampToValueAtTime(hz,now+u*seconds);
  const level=A.static.level*(reducedFlash?.7:1);
  hg.gain.setValueAtTime(0,now);hg.gain.linearRampToValueAtTime(level,now+A.static.attack*seconds);
  hg.gain.setValueAtTime(level,now+A.static.release*seconds*.85);hg.gain.linearRampToValueAtTime(0,now+A.static.release*seconds);
  hiss.connect(band);band.connect(hg);hg.connect(out);hiss.start(now);hiss.stop(now+seconds+.05);
  // A carrier crossed on the way: the whistle sliding down.
  const w=own(context.createOscillator()),wg=own(context.createGain());w.type='sine';
  w.frequency.setValueAtTime(A.whistle.from,now+.08*seconds);w.frequency.exponentialRampToValueAtTime(A.whistle.to,now+(.08+A.whistle.seconds)*seconds);
  wg.gain.setValueAtTime(0,now);wg.gain.linearRampToValueAtTime(A.whistle.level,now+.12*seconds);wg.gain.linearRampToValueAtTime(0,now+(.1+A.whistle.seconds)*seconds);
  w.connect(wg);wg.connect(out);w.start(now+.06*seconds);w.stop(now+(.12+A.whistle.seconds)*seconds);
  setTimeout(()=>{for(const node of nodes)try{node.disconnect();}catch{}},Math.ceil((seconds+.4)*1000));
  return nodes;
}
