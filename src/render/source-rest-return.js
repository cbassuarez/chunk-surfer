// A finite view back into the actual listening place. This is presentation,
// never an exit, a second room, a portal crossing, or another world owner.
import {continuationDoors,SOURCE_CONTINUATION} from '../data/source-continuation.js';
import {SOURCE_REST_SEATS} from '../game/source-rest-seat.js';
import {SOURCE_REST_BLACK_PROGRESS,SOURCE_REST_CUES} from '../game/source-rest-pacing.js';
import {doorAssembly,doorLeafLocalMatrix} from '../data/source-door-fields.js';
import {portalClipPlanes,portalExcludeArray,portalIdentity,portalInverse,portalMultiply,portalTransformPoint} from './source-mesh-portals.js';

export const SOURCE_REST_RETURN=Object.freeze({openStart:SOURCE_REST_CUES.ornaments-.03,openEnd:SOURCE_REST_CUES.ornaments+.05,maxProjectedProps:64,maxProjectedLights:3,
  upperWestMouth:Object.freeze({x:-15.4,zOffset:-4}),catchTangentOffset:-1.8,
  catchMouthWidth:2.2,catchDestination:Object.freeze({tangent:-.2,back:1.85})});
const finite=(n,d=0)=>Number.isFinite(n)?n:d;
const clamp=n=>Math.max(0,Math.min(1,finite(n)));
const smooth=(a,b,n)=>{const p=clamp((n-a)/(b-a));return p*p*(3-2*p);};
const chart=p=>p.chartId??0;
const centre=p=>[p.x,p.y,p.z];
const canonical=p=>p.canonicalId||p.id;
const rigid=(x,y,z,yaw=0)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return[c,0,s,0,0,1,0,0,-s,0,c,0,x,y,z,1];};
const samePlane=(a,b)=>a.length===b.length&&a.every((p,i)=>p.every((v,j)=>Math.abs(v-b[i][j])<1e-8));
const goods=doorAssembly('bay-goods-pair',{activeLeaves:'all'});
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);

export function sourceRestReturnConfig(seat=SOURCE_REST_SEATS[0],{origin={x:0,y:0,z:0},doorDrop=0}={}){
  const third=seat.phase==='catch',doorId=third?'catch-return-0':'wrong-entry-return',door=continuationDoors().find(p=>p.id===doorId);
  const normal=third?[Math.cos(.92),0,Math.sin(.92)]:[1,0,0],right=[normal[2],0,-normal[0]],height=door.height,
    width=third?SOURCE_REST_RETURN.catchMouthWidth:door.width;
  // The actual upper-west landing puts the return below/right of the sky
  // organism. The former close mouth cut away nearly half its silhouette.
  const source=third?{x:SOURCE_CONTINUATION.catch.center.x+normal[0]*9.5+right[0]*SOURCE_REST_RETURN.catchTangentOffset,
    z:SOURCE_CONTINUATION.catch.center.z+normal[2]*9.5+right[2]*SOURCE_REST_RETURN.catchTangentOffset}
    :{x:SOURCE_REST_RETURN.upperWestMouth.x,z:seat.z+SOURCE_REST_RETURN.upperWestMouth.zOffset};
  // The Catch's real counterweight keeps its path and right-hand foreground.
  // This supported side-step exposes the return without moving that actor.
  const destination=third?{x:seat.x+normal[0]*SOURCE_REST_RETURN.catchDestination.back+right[0]*SOURCE_REST_RETURN.catchDestination.tangent,
    z:seat.z+normal[2]*SOURCE_REST_RETURN.catchDestination.back+right[2]*SOURCE_REST_RETURN.catchDestination.tangent}:null;
  const shift=third?[source.x-destination.x,0,source.z-destination.z]:[source.x-2.1,0,source.z-seat.z],sourceAperture={x:origin.x+source.x,y:origin.y+seat.feet+height/2+doorDrop,z:origin.z+source.z,
    normal,right,up:[0,1,0],halfWidth:width/2,halfHeight:height/2};
  const destinationAperture={...sourceAperture,x:sourceAperture.x-shift[0],y:sourceAperture.y-doorDrop,z:sourceAperture.z-shift[2],normal:normal.map(v=>-v),right:right.map(v=>-v)};
  return{doorId,door,sourceAperture,destinationAperture,toCurrent:rigid(shift[0],doorDrop,shift[2]),sourceYaw:Math.atan2(-normal[0],normal[2])};
}

export function sourceRestReturnFrame(state,{eye,forward=null,origin={x:0,y:0,z:0},doorDrop=0}={}){
  const view=state?.sourceRestView,seat=SOURCE_REST_SEATS.find(p=>p.id===view?.seatId),mode=view?.mode;
  const active=!!(state?.status==='active'&&seat&&state.phase===seat.phase&&chart(state)===seat.chartId
    &&(seat.phase!=='catch'||state.level===seat.level)&&['sitting','seated','committed'].includes(mode)&&finite(view.progress)>0);
  const p=clamp(view?.degradation),opening=smooth(SOURCE_REST_RETURN.openStart,SOURCE_REST_RETURN.openEnd,p);
  if(!active||p>=SOURCE_REST_BLACK_PROGRESS)return{active:false,stage:p>=SOURCE_REST_BLACK_PROGRESS?'black':'ordinary',reason:'outside-listening',opening:0};
  const config=sourceRestReturnConfig(seat,{origin,doorDrop}),delta=centre(config.sourceAperture).map((v,k)=>v-(eye?.[k]??v));
  const visible=Array.isArray(eye)&&eye.length===3&&eye.every(Number.isFinite)&&dot(config.sourceAperture.normal,eye.map((v,k)=>v-centre(config.sourceAperture)[k]))>.03
    &&(!forward||dot(delta,forward)>-.1);
  return{active:true,stage:opening<=0?'establish':opening<1?'opening':'return',opening,seatId:seat.id,seat,visible,
    ...config,virtualEye:Array.isArray(eye)?portalTransformPoint(portalInverse(config.toCurrent),eye):null};
}

function roomPart(p,seat){
  if(seat.phase!=='catch')return!!(p.restPlace||p.restSeatDetail||String(p.id).includes('rest-alcove-')||p.descriptorId==='wrong-upper-refuge'
    ||p.restFracture&&/(window-head|west-head|ceiling-panel|ceiling-rib)/.test(p.fracturedFrom||''));
  // The physical goods door remains owned by the route. It must not be copied
  // into this instrument cavity as another door, handle or industrial lamp.
  if(p.doorId==='catch-return-0')return false;
  return p.restReturnCanonical||p.restHarpsichordPart||(p.restPlace||p.role==='rest-seat')&&p.region==='catch'
    ||['catch-0-case-crescent','catch-0-return-pad','catch-0-return-arm'].includes(p.descriptorId)
    ||/source-continuation-(fabricated-catch-0|refuge-rib-0)$/.test(p.id||'');
}
export function sourceRestReturnRoom(props,seat=SOURCE_REST_SEATS[0]){
  return props.filter(p=>chart(p)===seat.chartId&&roomPart(p,seat)&&!p.restBody&&!p.playerBody&&!p.operatorClothing
    &&!p.portalDestination&&!p.portalFragment&&!p.portalClipPlanes&&!p.restReturnMouth);
}
function moved(row,map,extra={}){
  const [x,y,z]=portalTransformPoint(map,centre(row));
  return{...row,...extra,matrix:portalMultiply(map,row.matrix),x,y,z,
    ...((row.sourceWorldMatrix||row.surroundings)?{sourceWorldMatrix:portalMultiply(map,row.sourceWorldMatrix||portalIdentity())}:{})};
}
function caseMouthProps(frame){
  const a=frame.sourceAperture,w=a.halfWidth*2,h=a.halfHeight*2,
    base=rigid(a.x,a.y-a.halfHeight,a.z,frame.sourceYaw),rows=[];
  const scale=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
  const add=(id,mesh,x,y,z,sx,sy,sz,local=null)=>{
    const m=portalMultiply(base,portalMultiply(local||rigid(x,y,z),scale(sx,sy,sz)));
    rows.push({id:'source-continuation-catch-case-mouth-'+id,mesh:'source-continuation-'+mesh,
      matrix:m,x:m[12],y:m[13],z:m[14],chartId:frame.seat.chartId,region:'catch',
      canonicalDoorId:frame.doorId,role:'rest-return-mouth',restReturnMouth:true,restHarpsichordPart:true,
      casePart:'mouth-'+id,interactive:false,structural:false,decorative:true,noShadow:true,
      portalExcludePlanes:null,portalClipPlanes:null,portalDestination:false,cullRadius:4});
  };
  // Thick bevelled wooden cheeks and a low case lip surround the exact finite
  // opening. No fabricated floor/exit, goods leaves, handles or free lamp.
  for(const side of[-1,1])add(side<0?'left-cheek':'right-cheek','rest-oak',side*(w/2+.075),-.08,0,.15,h+.20,.28);
  add('head','rest-oak',0,h+.02,0,w+.30,.14,.30);
  add('lip','rest-oak',0,-.08,.04,w+.34,.10,.34);
  for(const side of[-1,1])add(side<0?'left-hinge':'right-hinge','rest-copper',side*w*.32,h+.015,.10,.23,.055,.12);
  // One case lid rotates UP about its actual head hinge. Its pose follows the
  // existing Return opening, never elapsed wall time or a second state owner.
  const angle=frame.opening*1.48,c=Math.cos(angle),s=Math.sin(angle),rotate=[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1],
    lid=portalMultiply(rigid(0,h,.015),portalMultiply(rotate,rigid(0,-h,0)));
  add('lid','rest-oak',0,0,0,w+.12,h,.08,lid);
  return rows;
}
function mouthProps(rows,frame,origin){
  const {door,sourceAperture:a,sourceYaw,seat}=frame,root=rows.find(p=>p.role==='return');if(!root)return[];
  if(seat.phase==='catch')return caseMouthProps(frame);
  // The alias uses the building's exact joinery and hinge motion. Its visual
  // opening belongs to this apparition; the genuine door's state is untouched.
  const map=portalMultiply(rigid(a.x,origin.y+seat.feet,a.z,sourceYaw),portalInverse(rigid(origin.x+door.x,origin.y+door.y,origin.z+door.z,door.yaw)));
  const aliasRoot=portalMultiply(map,root.matrix);
  return rows.map(row=>{
    const q=moved(row,map,{id:row.id+':rest-return-mouth',canonicalId:canonical(row),canonicalDoorId:door.id,doorId:undefined,
      role:'rest-return-mouth',restReturnMouth:true,interactive:false,structural:false,noShadow:true,
      portalExcludePlanes:null,portalClipPlanes:null,portalDestination:false});
    const match=String(row.id).match(/(?:leaf|wear|handle).*-(\d)$/);
    if(match){const m=portalMultiply(aliasRoot,doorLeafLocalMatrix(goods,Number(match[1]),frame.opening));q.matrix=m;[q.x,q.y,q.z]=[m[12],m[13],m[14]];}
    return q;
  });
}

/** Keep all current scene layers. Only the finite mouth replaces their depth
 * behind its plane; the semiangel, stars, weather, bodies and effects outside
 * that aperture remain the very same instances. Returns no mutable owner. */
export function applySourceRestReturn({props=[],lights=[],canonicalProps=props,canonicalLights=lights,state,eye,forward=null,
  origin={x:0,y:0,z:0},portalCount=0,maxInstances=760}={}){
  const view=state?.sourceRestView,seat=SOURCE_REST_SEATS.find(p=>p.id===view?.seatId),doorId=seat?.phase==='catch'?'catch-return-0':'wrong-entry-return';
  const door=continuationDoors().find(p=>p.id===doorId),rows=canonicalProps.filter(p=>p.doorId===doorId&&!p.portalDestination&&!p.portalClipPlanes),root=rows.find(p=>p.role==='return');
  const doorDrop=root?root.y-origin.y-door.y:0,frame=sourceRestReturnFrame(state,{eye,forward,origin,doorDrop});
  const diagnostics={active:frame.active,stage:frame.stage,opening:frame.opening,projected:false,reason:frame.reason||null,
    seatId:seat?.id||null,canonicalDoorId:doorId,projectedProps:0,projectedLights:0,portalSlots:portalCount,physicalExit:false,collisionChanged:false};
  const result=(out=props,outLights=lights,planes=null)=>({props:out,lights:outLights,planes,frame,diagnostics});
  if(!frame.active)return result();
  if(!root){diagnostics.reason='canonical-door-unavailable';return result();}
  const mouth=mouthProps(rows,frame,origin);
  if(props.length+mouth.length>maxInstances){diagnostics.reason='instance-budget';return result();}
  const closed=reason=>{diagnostics.reason=reason;return result([...props,...mouth]);};
  if(frame.opening<=.001)return closed('establishing');
  if(!frame.visible)return closed('outside-view');
  if(portalCount>=2)return closed('portal-budget');
  const targets=sourceRestReturnRoom(canonicalProps,frame.seat);
  if(!targets.length)return closed('canonical-room-unavailable');
  if(targets.length>SOURCE_REST_RETURN.maxProjectedProps||props.length+mouth.length+targets.length>maxInstances)return closed('instance-budget');
  if(targets.some(p=>!p.matrix||p.matrix.length!==16||Array.from(p.matrix).some(v=>!Number.isFinite(v))))return closed('invalid-canonical-matrix');
  const planes=portalClipPlanes(frame.sourceAperture,eye),exclusions=[];
  for(const p of props){
    const old=p.portalExcludePlanes?portalExcludeArray(p.portalExcludePlanes):[];
    if(old===null)return closed('invalid-portal-mask');
    const sets=Array.from({length:old.length/20},(_,i)=>Array.from({length:5},(_,j)=>old.slice(i*20+j*4,i*20+j*4+4)));
    if(sets.length>=2&&!sets.some(p=>samePlane(p,planes)))return closed('portal-budget');
    exclusions.push(sets.some(p=>samePlane(p,planes))?sets:[...sets,planes]);
  }
  const out=props.map((p,i)=>({...p,portalExcludePlanes:exclusions[i]}));
  for(const p of targets)out.push(moved(p,frame.toCurrent,{id:p.id+':through:rest-return:'+frame.seatId,canonicalId:canonical(p),
    restReturnDestination:true,portalDestination:true,portalClipId:'rest-return:'+frame.seatId,portalClipPlanes:planes,portalExcludePlanes:null,noShadow:true}));
  const lightTargets=canonicalLights.filter(l=>chart(l)===frame.seat.chartId&&(frame.seat.phase==='catch'
    ?l.restHarpsichordLight||l.level===0&&(l.shelfPractical||String(l.id).endsWith('door-light-catch-return-0')):l.restPlace))
    .sort((a,b)=>Math.hypot(a.x-eye[0],a.y-eye[1],a.z-eye[2])-Math.hypot(b.x-eye[0],b.y-eye[1],b.z-eye[2])).slice(0,SOURCE_REST_RETURN.maxProjectedLights);
  const outLights=[...lights,...lightTargets.map(l=>{const [x,y,z]=portalTransformPoint(frame.toCurrent,centre(l));return{...l,id:l.id+':through:rest-return:'+frame.seatId,
    canonicalId:canonical(l),x,y,z,restReturnDestination:true,portalClipId:'rest-return:'+frame.seatId};})];
  diagnostics.projected=true;diagnostics.reason=null;diagnostics.projectedProps=targets.length;diagnostics.projectedLights=lightTargets.length;diagnostics.portalSlots=portalCount+1;
  diagnostics.sourceAperture=frame.sourceAperture;diagnostics.destinationAperture=frame.destinationAperture;diagnostics.virtualEye=frame.virtualEye;
  return result([...out,...mouth],outLights,planes);
}
