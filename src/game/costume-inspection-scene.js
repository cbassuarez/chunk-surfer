import * as scenes from './scenes.js';
import {uiSize,uiText,uiFill} from '../render/ui.js';

export const COSTUME_INSPECTION_SCENE='costume-inspection';
const revealed=phase=>['startle','exchange','threshold','done'].includes(phase);
const clamp=n=>Math.max(0,Math.min(1,n));
const ease=n=>{n=clamp(n);return n*n*(3-2*n);};
const mix=(a,b,t)=>a+(b-a)*t;

// A physical insert in the real store. The chair and the body remain world
// geometry; the inspection owns only this brief view of them.
export function costumeInspectionCamera(actor,{floor=-4.35,actorPoint={x:3,z:17},recoveryElapsed=0,reducedMotion=false}={}){
  const phase=actor?.phase||'inspect',t=Math.max(0,Number(actor?.elapsed)||0);
  const notice=phase==='notice'?ease(t/.65):['startle','exchange','threshold','done'].includes(phase)?1:0;
  const recoil=!reducedMotion&&phase==='startle'?.085*Math.sin(Math.PI*clamp(t/.28)):0;
  const eye={x:3.25,y:floor+mix(1.40,1.62,notice),z:19.25+recoil};
  const face={x:actorPoint.x,y:floor+1.72,z:actorPoint.z};
  const pin={x:3.955,y:floor+.491,z:18.235};
  let target={x:mix(pin.x,face.x,notice),y:mix(pin.y,face.y,notice),z:mix(pin.z,face.z,notice)};
  if(phase==='threshold'){
    const down=ease((t-.38)/.8);target={x:mix(face.x,4,down),y:mix(face.y,floor+.12,down),z:mix(face.z,18,down)};
  }else if(phase==='done')target={x:4,y:floor+.12,z:18};
  const dx=target.x-eye.x,dz=target.z-eye.z;
  return{eye,target,yaw:Math.atan2(dx,-dz),pitch:Math.atan2(target.y-eye.y,Math.hypot(dx,dz)),
    veil:phase==='inspect'?Math.max(0,1-t/.18)*.88:phase==='done'?ease((recoveryElapsed-.68)/.20)*.25:0};
}

// This scene is the sole clock owner while it holds the player's body. An
// external removal always runs the same release path as completion/Escape.
export function makeCostumeInspectionScene({getActor=()=>null,advance=()=>{},worldView=()=>null,
  isActive=()=>true,onDone=()=>{},onCancel=()=>{},onExit=()=>{},onSuspend=()=>{},onTick=()=>{},captions=()=>false}={}){
  let entered=false,closed=false,settled=false,committed=false,suspended=false,age=0,recoveryElapsed=0,unsubscribe=null;
  const current=()=>getActor()||{phase:'work',elapsed:0};
  const view=()=>({phase:current().phase,elapsed:current().elapsed||0,age,recoveryElapsed,committed,closed,suspended,
    worldView:worldView(current(),{recoveryElapsed})});
  function suspend(value){if(suspended===value)return;suspended=value;if(value)onSuspend();}
  function settle(completed,reason){
    if(settled||closed)return;
    settled=true;committed ||= revealed(current().phase);
    try{(completed?onDone:onCancel)({completed,reason,committed});}
    finally{scenes.remove(scene);}
  }
  const scene={
    // Keep an existing mouse-capture lease: a timer cannot request another
    // browser gesture. The authored worldView and main's delta drain hold aim.
    id:COSTUME_INSPECTION_SCENE,blocksInput:true,blocksWorld:true,allowsLook:true,suppressesHud:true,handlesEscape:true,
    enter(){
      if(entered)return;entered=true;
      unsubscribe=scenes.subscribe(()=>{if(!closed)suspend(scenes.top()!==scene||!isActive());});
    },
    update(dt){
      if(closed||settled||!entered)return;
      suspend(!isActive()||scenes.top()!==scene);if(suspended)return;
      const step=Math.max(0,Math.min(.1,Number(dt)||0));age+=step;
      advance(step);committed ||= revealed(current().phase);onTick(step);
      if(!['inspect','notice','startle','exchange','threshold','done'].includes(current().phase)){
        settle(false,'interrupted');return;
      }
      if(age>9){settle(committed,'timeout');return;}
      if(current().phase==='done'){
        recoveryElapsed+=step;
        if(recoveryElapsed>=.9)settle(true,'complete');
      }
    },
    worldView(){return worldView(current(),{recoveryElapsed});},
    view,
    key(event={}){
      if(event.repeat)return true;
      if(event.key==='Escape'||event.code==='Escape'||event.controllerAction==='back')settle(revealed(current().phase),'let-go');
      return true;
    },
    pointer(){return true;},
    exit(){
      if(closed)return;closed=true;unsubscribe?.();unsubscribe=null;
      try{if(!settled){settled=true;committed ||= revealed(current().phase);onCancel({completed:false,reason:'removed',committed});}}
      finally{onExit({committed});}
    },
    render(){
      const {cols,rows}=uiSize(),frame=worldView(current(),{recoveryElapsed});
      if(frame?.veil>.001)uiFill(0,0,cols,rows,`rgba(2,3,4,${frame.veil.toFixed(3)})`);
      if(['inspect','notice'].includes(current().phase))uiText(2,rows-2,'[ESC] LET GO','ui-dim',.7);
      if(captions()&&current().phase==='done')uiText(2,rows-3,'The chair is empty. The pin is still there.','ui-secondary');
    },
  };
  return scene;
}
