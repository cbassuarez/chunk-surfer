// All parts of each creature use the same skinned world pass as the Wrong Fold.
// Their choreography is sampled from the encounter clock; there are no sprites
// or camera-facing plates, and no motion hidden in the sound renderer.
import { costumeExchangeFrame, heldNoteFrame } from '../game/conservatory-adversaries.js';

const q=(axis,angle)=>[axis[0]*Math.sin(angle/2),axis[1]*Math.sin(angle/2),axis[2]*Math.sin(angle/2),Math.cos(angle/2)];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;
const multiply=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const angleMix=(a,b,t)=>a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;
const COSTUME_ORIGIN=Object.freeze({x:2.55,y:16.6});
const COSTUME_WORK_YAW=Math.PI+.72;
const COSTUME_REMNANT_MARK=Object.freeze({x:3.35,y:17.3});
// Main maps the origin once, then adds metre deltas. This moving endpoint and
// the independent static mark above both land at the actual chair (4,18).
const COSTUME_MOVING_REMNANT_MARK=Object.freeze({x:3.55,y:17.6});

export const COSTUME_INSPECTION_MARKS=Object.freeze({
  origin:COSTUME_ORIGIN,
  chairPhysical:Object.freeze({x:4,z:18,pinX:3.955,pinZ:18.235,pinHeight:.491}),
  cameraPhysical:Object.freeze({x:3.25,z:19.25,inspectEye:1.42,standingEye:1.62}),
  remnant:COSTUME_REMNANT_MARK,
});

function costumePose(frame,{fixed=false}={}){
  const phase=frame.stage,time=Number(frame.clipTime)||0,shift=fixed?0:Number(frame.torsoShift)||0;
  const active=!fixed&&['startle','exchange','threshold'].includes(phase),struggle=active?Math.abs(shift):0;
  const headYaw=fixed?0:clamp(frame.headYaw,-1.05,1.05),notice=!fixed&&phase==='notice';
  const aimed=notice||active,headPitch=aimed?-.035:.17;
  return {clip:'idle',time:0,loop:false,joints:{
    // The clip clock is held at zero. Every foot vertex stays planted while
    // the articulated ribcage moves independently inside its fixed garment.
    spine_lower:{translation:[shift*.11,0,0],rotation:q([1,0,0],-.055)},
    spine_mid:{translation:[shift*.19,0,-.015*struggle],rotation:q([1,0,0],-.075-.09*struggle)},
    spine_upper:{translation:[shift*.27,.010*struggle,-.018*struggle],rotation:q([0,1,0],shift*.90)},
    chest:{translation:[shift*.17,0,-.018*struggle],rotation:q([0,0,1],-.035-shift*.27)},
    neck:{translation:[shift*.07,0,0],rotation:q([0,1,0],headYaw*.22)},
    head:{rotation:multiply(q([0,1,0],headYaw*.78),multiply(q([1,0,0],headPitch),q([0,0,1],active?-.09-.20*struggle:0)))},
    crown_left:{rotation:q([0,0,1],.92*(fixed?0:frame.crownOpen||0))},
    crown_right:{rotation:q([0,0,1],-.92*(fixed?0:frame.crownOpen||0))},
    jaw:{rotation:q([1,0,0],active?.04+.48*struggle:.015)},
    upperarm_L:{rotation:q([0,0,1],-.10-.20*struggle)},
    upperarm_R:{rotation:q([0,0,1],.07+.16*struggle)},
    forearm_L:{rotation:q([1,0,0],-.16-.16*struggle)},
    forearm_R:{rotation:q([1,0,0],-.10-.11*struggle)},
  }};
}

function coverPose({peel=0,side=0,forward=0}={}){
  return{clip:'idle',time:0,loop:false,joints:{
    pelvis:{translation:[side,0,forward]},
    // Only the upper seam drops. Moving the whole cover down drove its hem
    // through the slab in the old fall; this keeps the actual lower seam up.
    head:{translation:[0,-.52*peel,0]},
  }};
}

function collapsedCover(at=COSTUME_REMNANT_MARK){
  return{id:'exchange-cover-remnant',mesh:'costume_exchange_cover',at,anchorAt:at,
    height:-.272,pitch:Math.PI/2,yaw:COSTUME_WORK_YAW,shadow:true,
    character:coverPose(),aftermath:true};
}

export function costumeExchangeParts(actor){
  const frame=costumeExchangeFrame(actor);
  if(frame.remnant)return[collapsedCover(frame.remnantAt||COSTUME_REMNANT_MARK)];
  if(!frame.visible)return [];
  const position=frame.at,common={at:position,anchorAt:COSTUME_ORIGIN,height:0,yaw:frame.yaw,pitch:0,shadow:true};
  const body=actor?.phase==='passing'?{clip:'walk',time:frame.clipTime,loop:true}:costumePose(frame);
  const fixed=costumePose(frame,{fixed:true});
  const parts=[
    {id:'exchange-body',mesh:'costume_exchange_body',...common,character:body},
    {id:'exchange-features',mesh:'costume_exchange_features',...common,character:body},
    {id:'exchange-garments',mesh:'costume_exchange_attachments',...common,character:fixed},
  ];
  if(actor?.phase==='passing'){
    parts.push({id:'exchange-pass-cover',mesh:'costume_exchange_cover',...common,character:fixed});
    return parts;
  }
  if(actor?.phase!=='threshold'){
    const notice=actor?.phase==='notice',revealed=['startle','exchange'].includes(actor?.phase);
    const peel=revealed?1:notice?ease((Number(actor.elapsed)-.045)/.20):0;
    parts.push({id:'exchange-hanging-cover',mesh:'costume_exchange_cover',...common,
      character:coverPose({peel,side:-.32*peel,forward:-.30})});
    return parts;
  }
  // The empty lining reaches below the lens and stops three quarters of a
  // metre short of the eye. It then folds onto the chair's actual floor mark.
  const p=clamp(frame.coverProgress),fall=ease((p-.46)/.54),flight=ease(p/.46);
  const target=frame.headAim||actor?.cameraAt||actor?.inspectAt||actor?.playerAt||{x:position.x,y:position.y+2.1};
  const dx=target.x-position.x,dy=target.y-position.y,distance=Math.hypot(dx,dy),travel=Math.min(.95,Math.max(0,distance-.75));
  const near={x:position.x+(distance?dx/distance:0)*travel,y:position.y+(distance?dy/distance:1)*travel};
  const at=fall>0?{x:mix(near.x,COSTUME_MOVING_REMNANT_MARK.x,fall),y:mix(near.y,COSTUME_MOVING_REMNANT_MARK.y,fall)}
    :{x:mix(position.x,near.x,flight),y:mix(position.y,near.y,flight)};
  const pitch=Math.PI/2*fall,peel=1-fall,forward=-.30*(1-fall);
  // Exact retained cover envelope: y>=.13, z<=-.27504. Compressing its upper
  // seam changes the latter by at most .162m. This support plane prevents the
  // world mesh (including its shadow) from dropping below the concrete.
  const minBound=.13*Math.cos(pitch)-(-.275+.162*peel+forward)*Math.sin(pitch);
  const lift=(.14+.055*Math.sin(Math.PI*flight))*(1-fall);
  parts.push({id:'exchange-cover',mesh:'costume_exchange_cover',at,anchorAt:COSTUME_ORIGIN,
    height:lift-minBound+.003,pitch,yaw:angleMix(frame.yaw,COSTUME_WORK_YAW,fall),shadow:true,
    character:coverPose({peel,side:-.32*(1-fall),forward})});
  return parts;
}

// Reused by the retained ceiling witnesses in the Last Reception. Only the
// pose is shared; the third-floor encounter still owns its original actor.
export function heldNotePose(frame={}){
  const t=frame.clipTime||0,travel=frame.crossing||0,descent=frame.descent||0;
  const load=frame.wingTension||0;
  return {clip:'idle',time:t,loop:true,joints:{
    pelvis:{rotation:q([1,0,0],.12+.11*Math.sin(t*1.5))},
    spine_mid:{rotation:q([0,0,1],-.09*travel+.035*Math.sin(t*1.9))},
    chest:{translation:[.008*Math.sin(t*1.8),-.018*load,0],rotation:q([1,0,0],-.12*load)},
    neck:{rotation:q([0,0,1],.025*Math.sin(t*.7))},
    head:{rotation:q([1,0,0],-.13-.08*descent)},
    jaw:{rotation:q([1,0,0],.08+.19*descent)},
    upperarm_L:{rotation:q([0,0,1],-.83-.20*load)},
    upperarm_R:{rotation:q([0,0,1],.83+.20*load)},
    forearm_L:{rotation:q([1,0,0],-.26)},
    forearm_R:{rotation:q([1,0,0],-.26)},
    thigh_L:{rotation:q([1,0,0],.56+.15*Math.sin(t*1.2))},
    thigh_R:{rotation:q([1,0,0],-.38-.12*Math.sin(t*1.1))},
    shin_L:{rotation:q([1,0,0],-.65)},
    shin_R:{rotation:q([1,0,0],.54)},
    wing_upper_left:{rotation:q([0,0,1],-.10*load)},
    wing_upper_right:{rotation:q([0,0,1],.10*load)},
    wing_lower_left:{rotation:q([0,0,1],.16*load)},
    wing_lower_right:{rotation:q([0,0,1],-.16*load)},
    wheel:{rotation:q([0,0,1],frame.wheelAngle||0)},
  }};
}

export function heldNoteParts(actor){
  const frame=heldNoteFrame(actor);
  if(!frame.visible)return [];
  const pose=heldNotePose(frame),common={at:frame.at,height:frame.height,yaw:frame.yaw,pitch:.76+.17*frame.descent,scale:1.35,
    shadow:true,character:pose};
  return [
    {id:'held-ceiling-wound',mesh:'held_note_ceiling_wound',at:{x:8.3,y:244.8},height:3.75,
      yaw:0,pitch:0,shadow:false},
    {id:'held-body',mesh:'held_note_body',...common},
    {id:'held-faces',mesh:'held_note_faces',...common},
    {id:'held-anatomy',mesh:'held_note_anatomy',...common},
  ];
}

// Yaw stays fixed while the body translates sideways. Pitch leans the chest
// out from its ceiling contact, not toward whichever way it happens to travel.
export function adversaryWorldMatrix(x,y,z,yaw=0,pitch=0,scale=1){
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch);
  return new Float32Array([
    cy*scale,0,-sy*scale,0,
    sy*sx*scale,cx*scale,cy*sx*scale,0,
    sy*cx*scale,-sx*scale,cy*cx*scale,0,
    x,y,z,1,
  ]);
}
