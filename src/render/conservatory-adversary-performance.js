// All parts of each creature use the same skinned world pass as the Wrong Fold.
// Their choreography is sampled from the encounter clock; there are no sprites
// or camera-facing plates, and no motion hidden in the sound renderer.
import { costumeExchangeFrame, heldNoteFrame } from '../game/conservatory-adversaries.js';

const q=(axis,angle)=>[axis[0]*Math.sin(angle/2),axis[1]*Math.sin(angle/2),axis[2]*Math.sin(angle/2),Math.cos(angle/2)];

function costumePose(frame,shift){
  const struggle=Math.abs(shift),time=frame.clipTime||0;
  return {clip:frame.clip,time,loop:true,joints:{
    spine_lower:{translation:[shift*.14,0,0],rotation:q([1,0,0],-.20)},
    spine_mid:{translation:[shift*.24,0,-.018*struggle],rotation:q([1,0,0],-.37-.13*struggle)},
    spine_upper:{translation:[shift*.38,.010*struggle,-.026*struggle],rotation:q([0,1,0],shift*1.18)},
    chest:{translation:[shift*.23,0,-.021*struggle],rotation:q([0,0,1],-.14-shift*.38)},
    neck:{translation:[shift*.10,-.018*struggle,-.05]},
    head:{rotation:q([0,0,1],-.14-.34*struggle+.09*Math.sin(time*6.2))},
    crown_left:{rotation:q([0,0,1],.92*(frame.crownOpen||0))},
    crown_right:{rotation:q([0,0,1],-.92*(frame.crownOpen||0))},
    jaw:{rotation:q([1,0,0],.10+.66*struggle)},
    upperarm_L:{rotation:q([0,0,1],-1.03-.44*struggle+.08*Math.sin(time*6.1))},
    upperarm_R:{rotation:q([0,0,1],.33+.38*struggle-.10*Math.sin(time*5.7))},
    forearm_L:{rotation:q([1,0,0],-.24-.34*struggle)},
  }};
}

export function costumeExchangeParts(actor){
  const frame=costumeExchangeFrame(actor);
  if(!frame.visible)return [];
  const position=frame.at,common={at:position,height:0,yaw:frame.yaw,pitch:0,shadow:true};
  const body=costumePose(frame,frame.torsoShift);
  const fixed=costumePose({...frame,clip:'idle',clipTime:0},0);
  const parts=[
    {id:'exchange-body',mesh:'costume_exchange_body',...common,character:body},
    {id:'exchange-features',mesh:'costume_exchange_features',...common,character:body},
    {id:'exchange-garments',mesh:'costume_exchange_attachments',...common,character:fixed},
  ];
  if(frame.cover&&actor?.phase==='passing'){
    parts.push({id:'exchange-pass-cover',mesh:'costume_exchange_cover',...common,character:fixed});
  }
  if(frame.cover&&frame.coverProgress){
    // After the first snap the body stops short. Only the bloodied front cover
    // reaches the place where the player put a hand, then falls.
    const p=frame.coverProgress;
    const fall=Math.max(0,Math.min(1,(p-.56)/.44));
    const target=actor?.playerAt||{x:position.x,y:position.y+2.1};
    parts.push({id:'exchange-cover',mesh:'costume_exchange_cover',at:{
      x:position.x+(target.x-position.x)*1.25*p,
      y:position.y+(target.y-position.y)*1.25*p,
    },
      height:.20+.14*Math.sin(Math.PI*p)-1.13*fall*fall,yaw:frame.yaw,pitch:.52*fall,shadow:true,character:fixed});
  }
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
