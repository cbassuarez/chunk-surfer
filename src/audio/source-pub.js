// The unbuilt Lyric has air through its joints and contacts whose replies come
// from much farther down. This bus belongs only to the optional Source scene.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,Number(x)||0));
export function createSourcePubAudio({getAudio=()=>null}={}){
  let ctx=null,destination=null,buffer=null,bed=null,lastKey=null,lastFall=false,lastItem=false,active=false,clock=0,nextContact=7,serial=0;
  const voices=new Set();
  function release(v){if(!v||v.dead)return;v.dead=true;try{v.source.onended=null;v.source.stop();}catch{}
    for(const node of v.nodes)try{node.disconnect();}catch{}voices.delete(v);}
  function clear(){for(const v of [...voices])release(v);bed=null;active=false;}
  function silence(){clear();lastKey=null;lastFall=false;lastItem=false;clock=0;nextContact=7;}
  function audio(){const a=getAudio();if(!a?.ctx||!a.destination||a.ctx.state!=='running'){clear();return false;}
    if(ctx!==a.ctx||destination!==a.destination){clear();ctx=a.ctx;destination=a.destination;buffer=null;lastKey=null;}
    return true;}
  function noise(){if(buffer)return buffer;const rate=ctx.sampleRate||48000,n=Math.floor(rate*2.17);buffer=ctx.createBuffer(1,n,rate);
    const data=buffer.getChannelData(0);let seed=0x1a88d311,low=0;
    for(let i=0;i<n;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;low+=.15*(seed/2147483648-1-low);data[i]=low;}
    return buffer;}
  function voice({frequency=400,q=.5,gain=.03,pan=0,duration=null,delay=0,tone=null}={}){
    if(voices.size>=16)return null;
    const source=tone===null?ctx.createBufferSource():ctx.createOscillator(),filter=ctx.createBiquadFilter(),amp=ctx.createGain(),panner=ctx.createStereoPanner?.();
    const v={source,nodes:[source,filter,amp,...(panner?[panner]:[])],dead:false,amp};voices.add(v);
    if(tone===null){source.buffer=noise();source.loop=duration===null;}else{source.type='sine';source.frequency.value=tone;}
    filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=q;
    source.connect(filter).connect(amp);if(panner){panner.pan.value=pan;amp.connect(panner).connect(destination);}else amp.connect(destination);
    const now=ctx.currentTime,at=now+delay;amp.gain.setValueAtTime(duration===null?gain:0,now);
    if(duration!==null){amp.gain.setValueAtTime(0,at);amp.gain.linearRampToValueAtTime(gain,at+.012);amp.gain.exponentialRampToValueAtTime(.00001,at+duration);}
    source.onended=()=>release(v);source.start(at);if(duration!==null)source.stop(at+duration+.02);return v;
  }
  function contact(stage,fall=false){
    const side=(++serial%2?-.72:.65),delay=.75+stage*.32;
    // The first contact is close. Its subdued reply comes back from below,
    // through timber; no long convolution history survives pause or return.
    voice({frequency:fall?110:1450,q:fall?.5:3,gain:fall?.11:.032,pan:side,duration:fall?1.1:.20});
    voice({frequency:fall?75:340,q:.75,gain:fall?.07:.024,pan:-side*.7,duration:1.6+stage*.25,delay,tone:fall?64:null});
  }
  return{
    update({dt=0,state=null,paused=false,busy=false}={}){
      if(paused||!state||state.ready===false||state.status!=='active'||!audio()){silence();return this.snapshot();}
      active=true;const stage=clamp(state.stage,0,5),key=`${stage}:${state.task}`,priming=lastKey===null;
      if(!bed)bed=voice({frequency:255-stage*19,q:.32,gain:.026+stage*.003,pan:-.2});
      if(bed)bed.amp.gain.setTargetAtTime((busy?.45:1)*(.026+stage*.003),ctx.currentTime,.2);
      if(lastKey!==null&&key!==lastKey)contact(stage);lastKey=key;
      const falling=!!state.fall;if(falling&&!lastFall&&!priming)contact(stage,true);lastFall=falling;
      const item=!!state.itemFall;if(item&&!lastItem&&!priming)contact(stage,state.itemFall.kind==='barrel');lastItem=item;
      clock+=clamp(dt,0,.25);if(clock>=nextContact){if(!busy)contact(stage);nextContact=clock+11+(serial%4)*3;}
      return this.snapshot();
    },
    pause:silence,stop:silence,
    snapshot:()=>({active,voices:voices.size,bed:!!bed,contacts:serial,queued:0,kind:'source-pub',procedural:true}),
  };
}
