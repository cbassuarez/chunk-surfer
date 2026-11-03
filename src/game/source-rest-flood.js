// One continuing flood in the existing listening place. This module owns no
// input, support, audio clock or water mesh: the shared coastal compositor owns
// the actual surface, refraction and underwater depth treatment.
import {SOURCE_REST_SEATS,SOURCE_REST_EYE_HEIGHT} from './source-rest-seat.js';
import {sourceRestVehicleImage} from './source-rest-memories.js';
import {coastalBodyMatrix,coastalMultiply,COASTAL_SETTLED_POSE} from '../data/coastal-memory.js';
import {sourceRestHeadlampPower} from './source-rest-headlamps.js';

const seat=SOURCE_REST_SEATS[0];
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const finite=(n,fallback=0)=>Number.isFinite(n)?n:fallback;
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const identity=Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export const SOURCE_REST_FLOOD_ASSETS=Object.freeze(['assets/source-return/fauna.glb']);
export const SOURCE_REST_FLOOD_MESHES=Object.freeze(['source_return_fish_body','source_return_fish_fins']);
// Three seven-piece vans, nine two-piece fish, twelve storm bubbles, up to
// three breaths and two lamp lenses bound the entire changing scene.
export const SOURCE_REST_FLOOD_LIMITS=Object.freeze({fish:9,wrecks:3,bubbles:12,maxProps:56,riseFrom:8,riseTo:19,eyeY:seat.feet+SOURCE_REST_EYE_HEIGHT});

function nearWreckPose(p){
  const settle=smooth(.18,.30,p);
  return{position:[seat.x-6.25,seat.feet-.15-.70*settle,seat.z-2.65],heading:-Math.PI/2+COASTAL_SETTLED_POSE.heading,
    pitch:COASTAL_SETTLED_POSE.pitch-.10*settle,roll:.05+.10*settle};
}
function wreckHeadlamps(pose,power=1,source='sunken-near'){
  const body=coastalBodyMatrix(pose),direction=[-body[8],-body[9],-body[10]];
  return[-1,1].map((side,index)=>{
    const local=[side*.6,.65,-2.2],position=[0,1,2].map(k=>body[k]*local[0]+body[k+4]*local[1]+body[k+8]*local[2]+body[k+12]);
    return{id:`rest-flood-wreck-headlamp-${index}`,position,direction:[...direction],intensity:5*power,spread:.38,source};
  });
}
// From the moment the listener sits, the same coastal water lies below the
// settle and rises with the conversation toward the walkway lip. The van is
// already down there, lamps toward the bench. The storm's surge still crosses
// the seat as authored and falls back only to this tide.
export const SOURCE_REST_TIDE=Object.freeze({from:seat.feet-4.56,to:seat.feet-.6,until:.96,
  // Far enough beyond the refuge floor for both lamps to clear its real edge
  // from the seated eye. The front faces the listener through the west opening.
  deepPose:Object.freeze({position:Object.freeze([seat.x-36.5,seat.feet-5.3,seat.z]),heading:Math.PI/2,pitch:0,roll:0})});
export function sourceRestTideY(progress=0){
  return SOURCE_REST_TIDE.from+(SOURCE_REST_TIDE.to-SOURCE_REST_TIDE.from)*Math.pow(smooth(0,SOURCE_REST_TIDE.until,progress),1.15);
}

export const SOURCE_REST_STORM=Object.freeze({triggerProgress:.64,duration:54,riseStart:8,riseEnd:19,holdEnd:32,recedeEnd:47});

/** Pure canonical medium shared by weather, sound and the water renderer. */
export function sourceRestFloodFrame({active=true,progress=0,clock=0,stormAge=null,reducedMotion=false}={}){
  const p=clamp(progress),time=Math.max(0,finite(clock)),age=stormAge===null?(p-SOURCE_REST_STORM.triggerProgress)*530:Number(stormAge),
    rise=smooth(8,19,age)*(1-smooth(32,47,age)),tideY=sourceRestTideY(p),storming=!!active&&age>=8&&age<54,
    waterY=storming?Math.max(tideY,seat.feet-1.6+5.6*rise):tideY,eyeY=SOURCE_REST_FLOOD_LIMITS.eyeY,
    lamps=sourceRestHeadlampPower({time,progress:p,marked:true,reducedMotion}),
    enabled=!!active&&age>=8&&age<54,submersion=enabled?smooth(eyeY-.10,eyeY+.22,waterY):0,
    pressure=enabled?clamp((waterY-eyeY)/3.2):0,
    flow=enabled?smooth(6,15,age)*(1-smooth(38,51,age)):0,
    bubbles=enabled?submersion*(.20+.80*pressure):0,
    rain=active&&age>=0&&age<54?smooth(0,5,age)*(1-smooth(39,54,age)):0;
  return{active:enabled,progress:p,waterProgress:rise*.30,stormAge:age,clock:time,waterY,submersion,submerged:submersion,pressure,flow,bubbles,rain,
    tide:{active:!!active,y:tideY,headlampPower:lamps},
    water:{active:!!active,siteMatrix:Array.from(identity),waterY,time:reducedMotion?0:time,
      flood:enabled?clamp((waterY-seat.feet+.10)/1.3):0,
      lights:!active?[]:enabled&&rise*.30>=.18?wreckHeadlamps(nearWreckPose(rise*.30),lamps):lamps>0?wreckHeadlamps(SOURCE_REST_TIDE.deepPose,lamps,'sunken-deep'):[],
      // The same clear deep-water calibration as the actual return flashback.
      waterOptics:{absorptionScale:.35,scatterScale:.12}},
    diagnostics:{rise,eyeY,depth:Math.max(0,waterY-eyeY),surfaceOwner:'coastal-memory-compositor',collisionChanged:false}};
}

function transform(x,y,z,yaw=0,pitch=0,scale=1){
  const c=Math.cos(yaw),s=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
  return[c*scale,0,s*scale,0,-s*sp*scale,cp*scale,c*sp*scale,0,-s*cp*scale,-sp*scale,c*cp*scale,0,x,y,z,1];
}
function decoration(mesh,matrix,id,kind){return{id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],kind,
  chartId:seat.chartId,structural:false,decorative:true,collidable:false,skyExposed:false,cullRadius:kind==='flood-fauna'?1.1:6};}

function wreck(id,pose){
  // coastalBodyMatrix retains the real crash-site .85m body pivot. All cabin,
  // body and tyre pieces follow one rigid transform, even when overturned.
  const body=coastalBodyMatrix(pose);
  return sourceRestVehicleImage(id,{x:0,y:0,z:0,yaw:0},{kind:'flood-wreck'}).map(part=>{
    const matrix=coastalMultiply(body,part.matrix);
    return{...part,...decoration(part.mesh,matrix,part.id,'flood-wreck'),memoryWreck:id,coastalPose:{...pose,position:[...pose.position]}};
  });
}

function lampLenses(pose,power,lights){
  if(power<=0)return[];
  const body=coastalBodyMatrix(pose),s=.32;
  return lights.map((light,index)=>{
    // The lens mesh faces local +Z; reversing X and Z turns its face with the
    // vehicle's real -Z headlamp axis without changing the body pose.
    const m=[...body.slice(0,3).map(v=>-v*s),0,...body.slice(4,7).map(v=>v*s),0,
      ...body.slice(8,11).map(v=>-v*s),0,...light.position,1];
    return{...decoration('source-continuation-rest-seabed-lamp',m,`rest-flood-lens-${index}`,'flood-lens'),
      emissive:[1,.92,.74,3.2*power],headlampPower:power,cullRadius:1};
  });
}

function fish(frame,{reducedMotion=false}={}){
  const rows=[],t=reducedMotion?0:frame.clock;
  for(let i=0;i<SOURCE_REST_FLOOD_LIMITS.fish;i++){
    const lane=i%3,phase=i*2.399963229728653,rate=.18+lane*.025,a=t*rate+phase,
      rx=[1.15,2.5,3.5][lane],rz=[1.8,3.5,4.5][lane],
      cx=seat.x-[3.5,6.8,10][lane],cy=seat.feet+[.95,.4,-1.2][lane],
      x=cx+Math.cos(a)*rx,z=seat.z+Math.sin(a)*rz,
      y=cy+Math.sin(a*.7+phase)*[.30,.50,.65][lane],scale=.70+lane*.17;
    // Whole animals only appear once covered by real water. They never orbit
    // the camera, emerge above its plane, or become a screen-space overlay.
    if(frame.waterY<y+.26*scale+.08)continue;
    const vx=-Math.sin(a)*rx*rate,vz=Math.cos(a)*rz*rate,
      vy=Math.cos(a*.7+phase)*[.30,.50,.65][lane]*.7*rate,
      yaw=Math.atan2(vx,-vz),pitch=Math.atan2(vy,Math.hypot(vx,vz)),
      m=transform(x,y,z,yaw,pitch,scale);
    for(const mesh of SOURCE_REST_FLOOD_MESHES)rows.push({...decoration(mesh,m.slice(),`rest-flood-fish-${i}-${mesh}`,'flood-fauna'),
      memoryFish:i,memoryLane:lane,waterY:frame.waterY,fishScale:scale,forward:{x:vx,z:vz}});
  }
  return rows;
}

// Even above the water, a few small bubbles leave the hands and rise past
// the face: the listener's air is already water.
function breathBubbles(frame,{reducedMotion=false}={}){
  if(reducedMotion||frame.submersion>.5)return[];
  const rows=[],time=frame.clock,period=7.2,age=time%period,cycle=Math.floor(time/period);
  for(let i=0;i<3;i++){
    const t=age-i*.55;if(t<0||t>4.2)continue;
    const phase=t/4.2,radius=(.014+.008*((cycle+i)%3))*(1-smooth(.75,1,phase)),
      x=seat.x-.62+Math.sin(t*2.6+i)*.035,z=seat.z+(i-1)*.06+Math.sin(t*1.9+cycle)*.03,y=seat.feet+.95+phase*2.3;
    rows.push({...decoration('source-continuation-rest-flood-bubble',transform(x,y,z,0,0,radius),`rest-breath-bubble-${i}`,'breath-bubble'),
      bubbleRadius:radius,bubblePhase:phase,cullRadius:.15});
  }
  return rows;
}
function risingBubbles(frame,{reducedMotion=false}={}){
  if(frame.bubbles<=.01)return[];
  const rows=[],time=reducedMotion?0:frame.clock,bottom=seat.feet+.42,top=frame.waterY-.12,
    height=top-bottom,visibility=smooth(.01,.15,frame.bubbles);
  if(height<.12)return rows;
  for(let i=0;i<SOURCE_REST_FLOOD_LIMITS.bubbles;i++){
    const speed=.19+(i%5)*.035,phase=(time*speed/height+i/SOURCE_REST_FLOOD_LIMITS.bubbles)%1,
      radius=(.015+(i%5)*.01)*(.65+.35*phase)*visibility,
      // Three fixed rising chains begin around the hands/window reveal. The
      // upward travel is world-space; turning the head never drags them along.
      x=seat.x-.85-(i%3)*.30+(reducedMotion?0:Math.sin(phase*5.2+i)*.045),
      z=seat.z+(i%3-1)*.18+(reducedMotion?0:Math.sin(phase*3.4+i*.7)*.04),y=bottom+phase*height,
      m=transform(x,y,z,0,0,radius);
    rows.push({...decoration('source-continuation-rest-flood-bubble',m,`rest-flood-bubble-${i}`,'flood-bubble'),
      bubbleRadius:radius,bubblePhase:phase,bubbleSpeed:reducedMotion?0:speed,waterY:frame.waterY,cullRadius:.15});
  }
  return rows;
}

/** Local decorative props; applying a chart origin remains the caller's job. */
export function sourceRestFlood(state,{reducedMotion=false}={}){
  const view=state?.sourceRestView,active=state?.phase===seat.phase&&(state?.chartId??0)===seat.chartId&&view?.seatId===seat.id,
    frame=active&&view?.weatherCue?.flood?view.weatherCue.flood:sourceRestFloodFrame({active,progress:view?.floodProgress??view?.degradation,clock:view?.audibleSeconds,reducedMotion}),props=[];
  if(active){
    props.push(...wreck('sunken-deep',SOURCE_REST_TIDE.deepPose),...breathBubbles(frame,{reducedMotion}));
    const pose=frame.water.lights[0]?.source==='sunken-near'?nearWreckPose(frame.waterProgress):SOURCE_REST_TIDE.deepPose;
    const power=frame.tide?.headlampPower??sourceRestHeadlampPower({time:view?.audibleSeconds,progress:view?.degradation,marked:true,reducedMotion});
    props.push(...lampLenses(pose,power,frame.water.lights));
  }
  if(frame.active){
    const p=frame.waterProgress,settle=smooth(.18,.30,p);
    if(p>=.18)props.push(...wreck('sunken-near',nearWreckPose(p)));
    if(p>=.235)props.push(...wreck('sunken-overturned',{
      position:[seat.x-10.8,seat.feet-.60-.55*settle,seat.z+3.8],heading:.35,
      pitch:COASTAL_SETTLED_POSE.pitch,roll:.25+2.23*smooth(.235,.30,p)}));
    if(p>=.16)props.push(...fish(frame,{reducedMotion}));
    props.push(...risingBubbles(frame,{reducedMotion}));
  }
  return{...frame,props,diagnostics:{...frame.diagnostics,fish:props.filter(p=>p.mesh==='source_return_fish_body').length,
    wrecks:new Set(props.filter(p=>p.memoryWreck).map(p=>p.memoryWreck)).size,props:props.length,
    bubbleProps:props.filter(p=>p.kind==='flood-bubble').length,volumeLights:frame.water.lights.length,
    maxProps:SOURCE_REST_FLOOD_LIMITS.maxProps,coastalPoseSource:'COASTAL_SETTLED_POSE',inputChanged:false,supportChanged:false}};
}
