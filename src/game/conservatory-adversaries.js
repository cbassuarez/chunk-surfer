// Two spatial performances in the real conservatory. They occupy rooms and
// share neither the Presence state nor its hunt/noise inputs. The scare is the
// uncertainty of crossing their reach; first contact is deliberately a miss.

const clamp=(value,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(value)||0));
const inside=(p,x0,y0,x1,y1)=>p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1;
const distance=(p,x,y)=>Math.hypot(p.x-x,p.y-y);
const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const bearing=(from,to)=>Math.atan2(to.x-from.x,from.y-to.y);
const eccentricity=(p,yaw,at)=>Math.abs(angleDelta(bearing(p,at),yaw));

// The corridor only supplies a glimpse at the edge of the lens. Find a short
// run that begins in the player's peripheral cone and moves farther out; if no
// such line exists yet, wait for another turn instead of crossing the reticle.
function peripheralPass(p,yaw){
  const y=p.y<23.15?24.05:22.05,candidates=[];
  for(const side of [-1,1])for(const reach of [3.2,4.2,5.2])for(const travel of [-1,1]){
    const startX=p.x+side*reach,endX=startX+travel*2.7;
    if(startX<4.8||startX>12.5||endX<4.8||endX>12.5)continue;
    const start={x:startX,y},mid={x:startX+travel*1.8,y},end={x:endX,y};
    const a=eccentricity(p,yaw,start),b=eccentricity(p,yaw,mid),c=eccentricity(p,yaw,end);
    if(a<.55||a>.78||b<a+.02||c<b+.07)continue;
    candidates.push({passStartX:startX,passEndX:endX,passY:y,score:Math.abs(a-.68)});
  }
  candidates.sort((a,b)=>a.score-b.score);
  const selected=candidates[0];
  return selected?{passStartX:selected.passStartX,passEndX:selected.passEndX,passY:selected.passY}:null;
}

export const CONSERVATORY_ADVERSARY_FLAGS=Object.freeze({
  costume:'adversary.costume.exchange.complete',
  held:'adversary.held.note.complete',
});

export function costumeScreamCallsHush(actor,{rms=0,screamRms=.26,playerNoiseLikely=false,hasB3Take=false,presenceActive=false}={}){
  return Number(rms)>=Number(screamRms)&&playerNoiseLikely&&hasB3Take&&!presenceActive
    &&['startle','exchange','threshold'].includes(actor?.phase);
}

export function freshConservatoryAdversaries({costumeComplete=false,heldComplete=false}={}){
  return {
    costume:{phase:costumeComplete?'done':'dormant',elapsed:0,lastYaw:null,turnAccum:0,seen:false,inStore:false,passLost:false,
      passStartX:20,passEndX:5,passY:23.9,lookYaw:0,lungeAt:{x:2.55,y:16.6},playerAt:null},
    held:{phase:heldComplete?'done':'dormant',elapsed:0,lureIndex:0,seen:false},
  };
}

const cue=(kind,at,caption)=>({kind,at,caption});
function enter(actor,phase){return {...actor,phase,elapsed:0};}

export function stepConservatoryAdversaries(previous,input={}){
  const dt=clamp(input.dt,0,.1),p=input.player||{x:0,y:0},group=input.group||'';
  const busy=!!input.busy||!!input.reducedDread;
  let costume={...(previous?.costume||freshConservatoryAdversaries().costume)};
  let held={...(previous?.held||freshConservatoryAdversaries().held)};
  const events=[];
  if(busy)return {state:{costume,held},events};

  if(group==='basement'&&costume.phase!=='done'&&!input.costumeConflict){
    const west=inside(p,4,21.5,11.5,24.9),store=inside(p,1,8,5,21.5);
    const turn=costume.lastYaw==null?0:Math.abs(angleDelta(input.yaw||0,costume.lastYaw));
    costume.lastYaw=Number(input.yaw)||0;
    costume.inStore=store;
    costume.lookYaw=costume.lastYaw;
    costume.turnAccum=west?clamp(costume.turnAccum+turn-(turn<.012?dt*.48:0),0,1.5):0;
    if(costume.phase==='dormant'&&store){
      costume=enter(costume,'work');events.push(cue('cloth-work',{x:2.6,y:16.6},'[Fabric is being fitted to something in the store.]'));
    }else if(costume.phase==='dormant'&&west&&costume.turnAccum>.48){
      const pass=peripheralPass(p,costume.lastYaw);
      if(pass){
        costume=enter({...costume,...pass,passPlayer:{x:p.x,y:p.y},passLost:false,turnAccum:0},'passing');
        events.push(cue('runner',{x:pass.passStartX,y:pass.passY},'[A sole slaps the tile just beyond the light.]'));
      }
    }else if(costume.phase==='passing'){
      costume.passPlayer={x:p.x,y:p.y};
      costume.elapsed+=dt;
      const at={x:costume.passStartX+(costume.passEndX-costume.passStartX)*clamp(costume.elapsed/.42),y:costume.passY};
      const angle=eccentricity(p,costume.lookYaw,at);
      if(angle<.52||angle>.88)costume.passLost=true;
      if(costume.elapsed>=.42){
        costume=enter(costume,'store');events.push(cue('hanger',{x:2.8,y:15},'[A hanger touches a rail, somewhere behind you.]'));
      }
    }else if(costume.phase==='store'){
      costume.elapsed+=dt;
      if(store){
        costume=enter(costume,'work');events.push(cue('cloth-work',{x:2.6,y:16.6},'[Cloth draws across a chair in the dark.]'));
      }
    }else if(costume.phase==='work'){
      costume.elapsed+=dt;
      if(store&&input.reachForPin&&distance(p,3.85,17.8)<3.2){
        const origin={x:2.55,y:16.6},length=distance(p,origin.x,origin.y);
        // A longer root translation passes behind the store's foreground pier
        // in the actual world render. Keep the head in sight, and let the empty
        // cover carry the final near miss to the player's hand.
        const stride=Math.min(1.25,Math.max(0,length-.95));
        const lungeAt=length>.001
          ?{x:origin.x+(p.x-origin.x)*stride/length,y:origin.y+(p.y-origin.y)*stride/length}
          :origin;
        costume=enter({...costume,seen:true,lungeAt,playerAt:{x:p.x,y:p.y}},'startle');
        events.push(cue('pin-snap',{x:lungeAt.x,y:lungeAt.y},'[The lining jerks against your fingertips. Your hand is empty.]'));
      }
    }else if(costume.phase==='startle'){
      costume.elapsed+=dt;
      if(costume.elapsed>=.28){
        costume=enter(costume,'exchange');
        events.push(cue('seam',costume.lungeAt,'[The feet stop. The shape inside the costume keeps moving.]'));
      }
    }else if(costume.phase==='exchange'){
      const before=costume.elapsed;
      costume.elapsed+=dt;
      if(before<.64&&costume.elapsed>=.64){
        events.push(cue('crown-open',costume.lungeAt,null));
      }
      if(costume.elapsed>=2.55){
        costume=enter(costume,'threshold');
        events.push(cue('cover',costume.lungeAt,'[The cover comes loose. Nothing follows it.]'));
      }
    }else if(costume.phase==='threshold'){
      costume.elapsed+=dt;
      if(costume.elapsed>=1.25){costume=enter(costume,'done');events.push(cue('costume-done',costume.lungeAt,null));}
    }
  }

  if(group==='academic'&&held.phase!=='done'){
    const approach=inside(p,7.5,249,11,268),chamber=inside(p,1,241,16,248.8);
    if(held.phase==='dormant'&&(approach||chamber)){
      held=enter(held,chamber?'reveal':'lure');
      if(chamber)events.push(cue('held-reveal',{x:8.4,y:243},'[Four faces hold still above the chairs.]'));
      else events.push(cue('lure-studio',{x:4.7,y:255},'[A thin four-note tune plays behind locked glass.]'));
    }else if(held.phase==='lure'){
      const was=Math.floor(held.elapsed/8.6);
      held.elapsed+=dt;
      const now=Math.floor(held.elapsed/8.6);
      if(now>was){
        held.lureIndex++;
        events.push(cue(held.lureIndex%2?'lure-chamber':'lure-studio',held.lureIndex%2?{x:8.5,y:243}:{x:4.7,y:255},
          held.lureIndex===1?'[The same tune answers from the open chamber.]':null));
      }
      if(chamber){held=enter(held,'reveal');events.push(cue('held-reveal',{x:8.4,y:243},'[Four faces hold still above the chairs.]'));}
    }else if(held.phase==='reveal'){
      held.elapsed+=dt;
      if(chamber&&held.elapsed>1.4&&distance(p,8.5,244.5)<6.2){
        held=enter({...held,seen:true},'traverse');
        events.push(cue('wing-tear',{x:8.4,y:245.2},'[A wing peels from the frieze. The faces do not turn.]'));
      }
    }else if(held.phase==='traverse'){
      held.elapsed+=dt;
      if(held.elapsed>=4.3){held=enter(held,'underpass');events.push(cue('held-note',{x:9,y:248},'[The last note holds directly over the way back.]'));}
    }else if(held.phase==='underpass'){
      held.elapsed+=dt;
      if(p.y>=250.6&&inside(p,7.5,248,11,260)){
        held=enter(held,'done');events.push(cue('held-done',{x:9,y:248},null));
      }
    }
  }
  return {state:{costume,held},events};
}

const ease=t=>{t=clamp(t);return t*t*(3-2*t);};
export function costumeExchangeFrame(actor){
  const phase=actor?.phase||'dormant',t=actor?.elapsed||0;
  if(phase==='dormant'||phase==='done'||phase==='store')return {visible:false};
  if(phase==='passing'){
    const at={x:(actor.passStartX??20)+((actor.passEndX??5)-(actor.passStartX??20))*ease(t/.42),y:actor.passY??23.9};
    const player=actor.passPlayer||actor.playerAt;
    const angle=player?eccentricity(player,actor.lookYaw||0,at):.76;
    return {visible:t<.42&&!actor.passLost&&angle>=.52&&angle<=.88,
    at,
    yaw:-Math.PI/2,clip:'walk',clipTime:t*2.2,cover:true,rootLocked:false,torsoShift:0,crownOpen:0};
  }
  if(actor?.inStore===false)return {visible:false};
  const shift=phase==='startle' ? .58*ease(t/.20)
    : phase==='exchange' ? .42*Math.sin(Math.PI*ease(t/2.55))*Math.sin(Math.PI*ease(t/2.55)*1.25)
    : phase==='work' ? .045*Math.sin(t*1.8) : .2;
  const crownOpen=phase==='exchange'
    ? ease((t-.17)/.76)*(.84+.10*Math.sin(t*11.8)+.055*Math.sin(t*19.1+.6))
    : phase==='threshold' ? 1-ease((t-.52)/.61)
    : .018+.014*Math.sin(t*1.3);
  const origin={x:2.55,y:16.6},end=actor?.lungeAt||origin;
  const travel=phase==='startle'?ease(t/.20):phase==='work'?0:1;
  const at={x:origin.x+(end.x-origin.x)*travel,y:origin.y+(end.y-origin.y)*travel};
  return {visible:true,at,yaw:Math.PI+.72,clip:'idle',clipTime:t,cover:phase==='threshold',
    coverProgress:phase==='threshold'?ease(t/.68):0,rootLocked:true,torsoShift:shift,crownOpen:clamp(crownOpen)};
}

export function heldNoteFrame(actor){
  const phase=actor?.phase||'dormant',t=actor?.elapsed||0;
  if(['dormant','lure','done'].includes(phase))return {visible:false};
  const crossing=phase==='traverse'?ease(t/4.3):phase==='underpass'?1:0;
  const descent=phase==='underpass'?ease(t/3.3):0;
  return {visible:true,at:{x:8.1+3.6*crossing-2.7*descent,y:245.1+3.0*descent},
    height:2.70-1.05*descent,yaw:Math.PI,wingTension:phase==='reveal'?.2+.08*Math.sin(t*1.7):.55+.24*Math.sin(t*2.4),
    wheelAngle:t*(phase==='traverse'?1.45:.45),clipTime:t,descent,crossing};
}
