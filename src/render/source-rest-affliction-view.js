const unit=n=>Math.max(0,Math.min(1,Number(n)||0));

// Render-only bodily motion never rewrites the player's chosen orientation or
// the controller's supported body. A flinch passes; the late slump remains.
export function sourceRestAfflictionCamera(camera,cue,{reducedMotion=false}={}){
  if(!cue?.embodied||!Array.isArray(camera?.eye)||reducedMotion)return camera;
  const weight=unit(cue.bodyProgress??1),pain=unit(cue.pain),strain=unit(cue.strain),loss=unit(cue.facultyLoss),
    age=Math.max(0,Number(cue.painAge)||0),time=Math.max(0,Number(cue.time)||0),
    flinch=pain*Math.sin(Math.min(Math.PI,age*29))*.045,
    slump=(loss*.13+strain*.025)*weight,right=[Math.cos(camera.yaw),0,Math.sin(camera.yaw)];
  const eye=[...camera.eye];eye[0]+=right[0]*flinch*weight;eye[2]+=right[2]*flinch*weight;
  eye[1]-=(pain*.085+slump)*weight;
  return{...camera,eye,pitch:camera.pitch+(pain*.060-loss*.085+strain*Math.sin(time*.85)*.012)*weight,
    afflictionOverride:true};
}

// Reuse the game's dark transmission failure. The text/choice plane remains
// outside this world-image pass; no white flash or frame-clock rhythm is added.
export function sourceRestAfflictionFault(cue,{reducedMotion=false}={}){
  if(!cue?.active||!cue.embodied)return 0;
  const pain=unit(cue.pain),strain=unit(cue.strain),pressure=Math.max(pain,strain*.65);
  if(pressure<.005)return 0;
  const count=Math.max(0,Math.floor(Number(cue.mistakeCount)||0));
  return{active:true,nvme:pain*.62,ps2:strain*.20,transition:pressure*.28,
    seed:count*17.13,slot:Math.floor((Number(cue.time)||0)*6),
    overflow:reducedMotion?0:pain*.42,overflowHead:unit((cue.painAge||0)/.55),
    overflowLane:count%4,overflowDirection:count%2?-1:1,overflowRun:count,
    reduceMotion:!!reducedMotion,flashMode:'off'};
}
