// TIME SKIPS ON THE CLIFF ROAD. Seb, 2026-11-05: the drives on the bluffs, the
// ones before the crash, are longer and come apart in time. Each stretch is a few
// seconds of the same night's road, later than the last, often the same bend
// again; the THE HAPPY RETURN boards count their miles down and then up. Most
// stretches put something precarious in the lamps: a figure stood in the lane, a
// lorry over the line on a bend, a van like his stopped with no lights, a bus
// pulling out. Not quick actions, just situations: steer round it, or don't.
// If he is about to touch it, the station changes first, so he never sees
// whether it hit. Every cut sounds and looks like turning the radio dial.
//
// A stretch ends on road actually driven forward, never on a clock: waiting, or
// reversing, cannot push the journey on (source-drive-door-teaser.test).
//
// Pure: road distance/lateral in, poses, boxes and the cut request out. The
// door teaser (door-teaser.js) owns the van, the scene and the radio.
import {DRIVE_BODY_FOOTPRINT} from './vehicle-contacts.js';

const freeze=Object.freeze;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=x=>{const t=clamp(x);return t*t*(3-2*t);};
// The left-hand lane, where the van drives.
const LANE=-1.35;

export const DRIVE_TIME_SKIPS=freeze({
  // The dial: out of the picture, the van placed at the next stretch in the dark
  // middle, and back in. Contact is cut this far ahead of it. The turn stays
  // short and soft: the road stays visible under the static, so a cut reads as
  // the dial moving rather than as a blackout.
  cut:freeze({seconds:.72,placeAt:.45,contactLead:.32}),
  stretches:freeze([
    freeze({id:'road',start:freeze({d:-600,lateral:LANE,speed:13}),station:'service',until:freeze({metres:330})}),
    freeze({id:'figure',start:freeze({d:-470,lateral:LANE,speed:13}),station:'music',rain:.06,until:freeze({metres:300,passed:140}),
      hazard:freeze({kind:'figure',d:-392,lateral:-1.05})}),
    // Back down the road, later on. The boards say the same miles again.
    freeze({id:'again',start:freeze({d:-560,lateral:LANE,speed:12}),station:'company',rain:.1,fog:.04,until:freeze({metres:260})}),
    freeze({id:'oncoming',start:freeze({d:-335,lateral:LANE,speed:13}),station:'service',rain:.12,fog:.04,until:freeze({metres:340,passed:120}),
      hazard:freeze({kind:'lorry',d:-205,lateral:1.9,speed:11,drift:freeze({from:1.9,to:-.55,start:-250,end:-285})})}),
    // The cut sets him down on the way to the stand, whichever way the lorry went, so
    // nobody misses it. The van with no lights is further on.
    freeze({id:'stalled',start:freeze({d:-215,lateral:LANE,speed:13}),station:'music',rain:.16,fog:.06,until:freeze({metres:260,passed:130}),
      hazard:freeze({kind:'van',d:-82,lateral:-1.25})}),
    freeze({id:'bus',start:freeze({d:-40,lateral:LANE,speed:13}),station:'company',rain:.18,fog:.07,until:freeze({metres:200,passed:110}),
      hazard:freeze({kind:'bus',d:42,lateral:-8,to:-1.7,trigger:46,seconds:4.2})}),
    // The last stretch has no end of its own: it is the road to the queue and the edge.
    freeze({id:'edge',start:freeze({d:95,lateral:LANE,speed:13}),station:'service',rain:.2,fog:.08,until:null}),
  ]),
});

// The precarious things, as boxes on the road and the props that show them.
const HAZARD=freeze({
  figure:freeze({halfX:.32,halfZ:.32,meshes:freeze([freeze({mesh:'player_shadow_figure',yaw:Math.PI})])}),
  lorry:freeze({halfX:1.25,halfZ:4.1,meshes:freeze(['rc_flatbed','rc_flatbed_lamps','rc_tarp'].map(mesh=>freeze({mesh,yaw:Math.PI}))),
    lamps:freeze([freeze({local:freeze([-.85,.95,-4.1])}),freeze({local:freeze([.85,.95,-4.1])})])}),
  van:freeze({halfX:1.0,halfZ:2.6,meshes:freeze([freeze({mesh:'drive_vehicle_body'}),
    ...[[-1,-1.3],[1,-1.3],[-1,1.535],[1,1.535]].map(([side,axle])=>freeze({mesh:'drive_tyre',local:freeze([side*.83,.33,axle])}))])}),
  bus:freeze({halfX:1.3,halfZ:5.6,meshes:freeze([freeze({mesh:'outskirts_bus'})]),lamps:freeze([freeze({local:freeze([0,2.4,-5.4]),color:freeze([1,.86,.62]),intensity:1.2,radius:9})])}),
});
export const DRIVE_TIME_SKIP_HAZARDS=HAZARD;

/**
 * Where a stretch's hazard is, `t` seconds into the stretch, with the van at
 * road distance `vanD`. Road coordinates: distance along, lateral across.
 */
export function hazardRoadPose(hazard,t,vanD=-Infinity){
  if(!hazard)return null;
  if(hazard.kind==='lorry'){
    const d=hazard.d-hazard.speed*t,drift=hazard.drift,u=smooth((drift.start-d)/(drift.start-drift.end));
    return{d,lateral:drift.from+(drift.to-drift.from)*u,yaw:0,moving:true};
  }
  if(hazard.kind==='bus'){
    // It waits at its stop until he is close enough, then pulls out across him.
    const begin=hazard.d-vanD<=hazard.trigger;
    return{d:hazard.d,lateral:hazard.lateral,yaw:0,moving:false,trigger:begin};
  }
  return{d:hazard.d,lateral:hazard.lateral,yaw:0,moving:false};
}

function corners(cx,cz,yaw,halfX,front,rear){
  const f=[Math.sin(yaw),-Math.cos(yaw)],r=[Math.cos(yaw),Math.sin(yaw)];
  return[[-halfX,front],[halfX,front],[halfX,-rear],[-halfX,-rear]].map(([a,b])=>[cx+r[0]*a+f[0]*b,cz+r[1]*a+f[1]*b]);
}
function overlaps(a,b){
  for(const shape of[a,b])for(let k=0;k<4;k++){
    const p=shape[k],q=shape[(k+1)%4],n=[q[1]-p[1],p[0]-q[0]];
    const project=points=>points.map(v=>v[0]*n[0]+v[1]*n[1]),pa=project(a),pb=project(b);
    if(Math.max(...pa)<Math.min(...pb)||Math.max(...pb)<Math.min(...pa))return false;
  }
  return true;
}
/** Would the van touch this box within `lead` seconds, as both are going? */
export function contactWithin(drive,box,lead,{boxVelocity=[0,0]}={}){
  const{halfWidth,front,rear}=DRIVE_BODY_FOOTPRINT,vx=Math.sin(drive.heading)*drive.speed+Math.cos(drive.heading)*(drive.lateralSpeed||0),
    vz=-Math.cos(drive.heading)*drive.speed+Math.sin(drive.heading)*(drive.lateralSpeed||0);
  for(let k=0;k<=6;k++){
    const t=lead*k/6,van=corners(drive.x+vx*t,drive.z+vz*t,drive.heading,halfWidth,front,rear),
      other=corners(box.x+boxVelocity[0]*t,box.z+boxVelocity[1]*t,box.yaw,box.halfX,box.halfZ,box.halfZ);
    if(overlaps(van,other))return true;
  }
  return false;
}

/**
 * The stretches in order. `worldAt(d, lateral)` is the road's own sampler and
 * `distanceOf(drive)` reads the van's road distance.
 */
export function createTimeSkipDirector({skips=DRIVE_TIME_SKIPS,worldAt,distanceOf}={}){
  let index=0,time=0,busAt=null,cuts=0,driven=0,lastD=null,passedAt=null;
  const stretch=()=>skips.stretches[index];
  function box(vanD){
    const s=stretch(),h=s?.hazard;if(!h)return null;
    const p=hazardRoadPose(h,time,vanD),spec=HAZARD[h.kind];
    let lateral=p.lateral;
    if(h.kind==='bus'){if(p.trigger&&busAt==null)busAt=time;if(busAt!=null)lateral=h.lateral+(h.to-h.lateral)*smooth((time-busAt)/h.seconds);}
    const w=worldAt(p.d,lateral);
    return{kind:h.kind,d:p.d,lateral,x:w.x,y:w.y||0,z:w.z,yaw:w.heading+(spec.yaw||0),heading:w.heading,halfX:spec.halfX,halfZ:spec.halfZ,
      velocity:h.kind==='lorry'?[-Math.sin(w.heading)*h.speed,Math.cos(w.heading)*h.speed]:[0,0]};
  }
  return{
    stretch,index:()=>index,time:()=>time,cuts:()=>cuts,isFinal:()=>!stretch()?.until,
    /** One step of the van on this stretch. A cut request, or null. */
    update(drive,dt){
      const s=stretch();if(!s?.until)return null;
      time+=Math.max(0,Number(dt)||0);
      const vanD=distanceOf(drive),b=box(vanD);
      if(lastD!=null&&vanD>lastD)driven+=vanD-lastD;lastD=vanD;
      if(b&&contactWithin(drive,b,skips.cut.contactLead,{boxVelocity:b.velocity}))return{reason:'contact',from:index,to:index+1};
      // `passed` counts metres, not a flag: clearing the hazard earns the cut
      // only after real driven distance beyond it, so each span stays long.
      const beyond=Number(s.until.passed)||0;
      if(beyond>0&&b&&vanD>b.d+b.halfZ+3&&passedAt==null)passedAt=driven;
      const passed=beyond>0&&passedAt!=null&&driven>=passedAt+beyond;
      if(passed||driven>=s.until.metres)return{reason:passed?'passed':'driven',from:index,to:index+1};
      return null;
    },
    /** Move on to the next stretch; returns where and how the van starts it. */
    advance(){index=Math.min(skips.stretches.length-1,index+1);time=0;busAt=null;driven=0;lastD=null;passedAt=null;cuts+=1;return stretch();},
    driven:()=>driven,
    hazard:drive=>box(distanceOf(drive)),
  };
}

/** Props and lamps for the hazard on the road this frame, in scene space (+32). */
export function hazardSceneRows(b){
  if(!b)return{props:[],lamps:[]};
  const spec=HAZARD[b.kind],c=Math.cos(-b.yaw),s=Math.sin(-b.yaw),props=[],lamps=[];
  const at=local=>{const l=local||[0,0,0];return[b.x+c*l[0]+s*l[2],b.y+l[1],b.z-s*l[0]+c*l[2]];};
  for(const [i,row] of spec.meshes.entries()){
    const yaw=-b.yaw+(row.yaw||0),cy=Math.cos(yaw),sy=Math.sin(yaw),p=at(row.local);
    props.push({id:`time-skip-${b.kind}-${i}`,mesh:row.mesh,matrix:[cy,0,-sy,0,0,1,0,0,sy,0,cy,0,32+p[0],p[1],32+p[2],1],x:32+p[0],y:p[1],z:32+p[2],structural:true,skyExposed:true,sourceStructure:'time-skip'});
  }
  for(const [i,row] of (spec.lamps||[]).entries()){
    // The lorry's lamps point back down the road at him.
    const flip=b.kind==='lorry'?[row.local[0],row.local[1],-row.local[2]]:row.local,p=at(flip);
    lamps.push({id:`time-skip-${b.kind}-lamp-${i}`,x:32+p[0],y:p[1],z:32+p[2],color:[...(row.color||[1,.93,.8])],intensity:row.intensity??2.2,radius:row.radius??18,penetration:1});
  }
  return{props,lamps};
}
