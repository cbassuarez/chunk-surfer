// An optical visit behind the soundproof glass. This is never a Presence actor:
// no hearing, pressure, target, capture, or Contact is created by these frames.
const clamp=n=>Math.max(0,Math.min(1,n));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
export function b3SpeakerFilmFrame(seconds=0,{reducedMotion=false}={}){
  const t=Math.max(0,Number(seconds)||0),wide=t>=2.5;
  const u=reducedMotion?.5:smooth(wide?(t-2.5)/10:t/2.5);
  const eye=wide?[mix(19.25,19.7,u),-2.36,mix(14.1,14.7,u)]:[19.22,-2.36,mix(9.6,9.35,u)];
  const target=wide?[15.8,-2.6,17.8]:[16,-2.65,7.1];
  const dx=target[0]-eye[0],dy=target[1]-eye[1],dz=target[2]-eye[2];
  const z=t<6.5?mix(20.5,16.5,smooth((t-2.5)/4)):mix(16.5,20.5,smooth((t-7.3)/4.5));
  const body=t>=2.5&&t<12?{x:31,y:z/.5-.5,heading:t<7.3?0:Math.PI,motion:t>6.5&&t<7.3?'listen':'investigate',
    strength:1,radiusM:5.2,heightM:2.18,widthM:.68}:null;
  return{shotId:wide?'b3-mouth':'speaker-through-glass',seconds:t,body,done:t>=12.5,
    camera:{eye,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(dy,Math.hypot(dx,dz)),tanHalfFov:Math.tan((wide?52:42)*Math.PI/360),
      near:.08,far:90,lens:{focalLengthMm:wide?24:30,sensorHeightMm:24,focusDistanceM:Math.hypot(dx,dy,dz),apertureFNumber:5.6,maxBlurPx:1.6}},cover:t<.18?1-t/.18:t>12.15?clamp((t-12.15)/.35):0};
}
export function createB3SpeakerFilm({getHeld=()=>false,onDone=()=>{},onFootstep=()=>{},onExit=()=>{},toWorldView=x=>x,paintCover=()=>{},reducedMotion=false}={}){
  let elapsed=0,closed=false,finished=false,lastFoot=-1;
  const held=new Set();
  function finish(){if(finished||closed)return;finished=true;onDone();}
  return{id:'b3-speaker-film',blocksInput:true,blocksWorld:false,sourcePressureLive:true,suppressesHud:true,worldPresentation:'visible',
    update(dt){if(closed||finished||getHeld())return;elapsed+=Math.max(0,Math.min(.1,Number(dt)||0));const frame=b3SpeakerFilmFrame(elapsed,{reducedMotion});
      const foot=Math.floor(elapsed/.85);if(frame.body&&frame.body.motion!=='listen'&&foot!==lastFoot){lastFoot=foot;onFootstep(frame);}
      if(elapsed>=12.5)finish();},
    key(e={}){const k=String(e.code||e.key||'');if(e.repeat)return true;held.add(k);return true;},
    keyup(e={}){const k=String(e.code||e.key||'');const fresh=held.delete(k);if(fresh&&/Escape/.test(k))finish();return true;},
    blur(){held.clear();},suspend(){held.clear();},
    worldView(){return toWorldView(b3SpeakerFilmFrame(elapsed,{reducedMotion}));},
    render(){paintCover(b3SpeakerFilmFrame(elapsed,{reducedMotion}).cover);},
    view(){return{elapsed,closed,finished,frame:b3SpeakerFilmFrame(elapsed,{reducedMotion})};},
    exit(){closed=true;held.clear();onExit();},
  };
}
