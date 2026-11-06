// WHAT CAN BE SEEN OF IT, this frame. Pure. It starts as a whole field, and with decay
// it goes the way the outskirts road goes: the far things first, piece by piece, then
// the variety. The near grass and the daisies are the last to go, and they repeat.
import {MEMORY_FIELD as C} from '../data/memory-field.js';
import {EYE,ZONE} from '../data/floorplan/legend.js';
import {memoryFieldGeometry,memoryGeometryBounds} from './memory-field-models.js';

const SHARED=Object.freeze({structural:false,decorative:true,zone:ZONE.street,noReflection:true,noShadow:true});
const bounds=new Map();
function boundsOf(name){
  if(!bounds.has(name)){
    const row=memoryFieldGeometry().find(item=>item.name===name),{min,max}=memoryGeometryBounds(row);
    bounds.set(name,{c:[(min[0]+max[0])/2,(min[1]+max[1])/2,(min[2]+max[2])/2],r:Math.max(.5,Math.hypot(max[0]-min[0],max[1]-min[1],max[2]-min[2])/2)});
  }
  return bounds.get(name);
}
function instance(mesh,id,m,extra={}){
  const{c,r}=boundsOf(mesh),scale=Math.hypot(m[0],m[1],m[2])||1;
  return{...SHARED,id:'memory-field:'+id,mesh,matrix:m,x:m[0]*c[0]+m[4]*c[1]+m[8]*c[2]+m[12],y:m[1]*c[0]+m[5]*c[1]+m[9]*c[2]+m[13],z:m[2]*c[0]+m[6]*c[1]+m[10]*c[2]+m[14],cullRadius:r*Math.max(1,scale),...extra};
}
const translate=(x,y,z,s=1)=>new Float32Array([s,0,0,0,0,s,0,0,0,0,s,0,x,y,z,1]);
const yawed=(x,y,z,yaw,s=1)=>{const c=Math.cos(yaw)*s,n=Math.sin(yaw)*s;return new Float32Array([c,0,-n,0,0,s,0,0,n,0,c,0,x,y,z,1]);};
// The grass leans on the wind. A shear from the root, so the roots stay put.
const leaning=(x,z,lx,lz)=>new Float32Array([1,0,0,0,lx,1,lz,0,0,0,1,0,x,0,z,1]);
const cellHash=(x,z)=>{let h=Math.imul(x|0,73856093)^Math.imul(z|0,19349663);h=Math.imul(h^(h>>>13),0x5bd1e995);return(h^(h>>>15))>>>0;};
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};

export function memoryFieldSunDirection(visit){
  const alt=visit.sunAlt,az=visit.sunAz,cos=Math.cos(alt);
  return[Math.sin(az)*cos,Math.sin(alt),-Math.cos(az)*cos];
}

// Where the bag is. The same bag, doing less and less of what bags do. Mode by visit:
// on the wire, on the wind, hanging, keeping its distance, and then simply there.
export function memoryFieldBagPose(bag,state,{reducedMotion=false}={}){
  if(!bag)return null;
  const t=reducedMotion?0:state.elapsed,scale=bag.scale||1;
  if(bag.mode==='snag')return{x:bag.x,y:1.02,z:bag.z,yaw:.3+.2*Math.sin(t*1.3),scale,frame:Math.floor(t*4)};
  if(bag.mode==='drift'){const along=(t*1.9)%90;return{x:bag.x+along,y:1.1+.8*Math.sin(t*.7)+.4*Math.sin(t*1.9),z:bag.z+7*Math.sin(t*.21),yaw:t*.9,scale,frame:Math.floor(t*5)};}
  if(bag.mode==='hang')return{x:bag.x,y:1.68+.05*Math.sin(t*.8),z:bag.z,yaw:.4*Math.sin(t*.33),scale,frame:Math.floor(t*1.5)};
  if(bag.mode==='attend'){
    const dx=bag.x-state.x,dz=bag.z-state.z,d=Math.hypot(dx,dz)||1,keep=Math.max(5.5,d);
    return{x:state.x+dx/d*keep,y:1.72+.08*Math.sin(t*.6),z:state.z+dz/d*keep,yaw:Math.atan2(state.x-bag.x,state.z-bag.z),scale,frame:Math.floor(t*1.1)};
  }
  return{x:bag.x,y:.5+.1*Math.sin(t*.4),z:bag.z,yaw:Math.atan2(state.x-bag.x,state.z-bag.z)+.1*Math.sin(t*.2),scale,frame:Math.floor(t*.7)};
}

// The leaf hangs at the left post and swings away from him.
export function memoryFieldRenderFrame(state,visit,{reducedMotion=false,reducedDread=false,hasWheel=true}={}){
  const decay=Math.max(0,Math.min(1,state.decay||0)),t=reducedMotion?0:state.elapsed,props=[];
  const breath=reducedMotion?0:.012*Math.sin(state.elapsed*1.5);
  const eye=[state.x,C.eye+breath,state.z];
  const dx=state.x,dz=state.z;
  const variety=Math.max(1,Math.round(C.variants*(1-smooth(.35,.7,decay))));
  const heldGrid=smooth(.5,.8,decay)>.5;
  props.push(instance('mf_ground','ground',translate(Math.round(dx/8)*8,0,Math.round(dz/8)*8),{cullRadius:900}));
  if(decay<.85)props.push(instance('mf_hills','hills',translate(dx,0,dz),{cullRadius:900}));
  // Near: repeating squares of grass and daisies, leaning on one wind.
  const S=C.chunk,cx=Math.floor(dx/S),cz=Math.floor(dz/S),gust=reducedMotion?0:.035+.03*Math.sin(t*.33);
  for(let iz=-C.near;iz<=C.near;iz++)for(let ix=-C.near;ix<=C.near;ix++){
    const x=cx+ix,z=cz+iz,variant=heldGrid?0:cellHash(x,z)%variety,wx=x*S,wz=z*S;
    if(Math.hypot(wx+S/2-dx,wz+S/2-dz)>S*(C.near+.5))continue;
    const phase=t*1.2+wx*.09+wz*.07,lx=reducedMotion?0:gust*(.7+.5*Math.sin(phase)),lz=reducedMotion?0:gust*.35*Math.sin(phase*.8+1);
    for(const part of['dark','light','petal','yellow']){
      // Cones cost more oxygen than rods. The yellow goes first.
      if(part==='yellow'&&decay>.92)continue;
      props.push(instance(`mf_near_${variant}_${part}`,`n${x}:${z}:${part}`,leaning(wx,wz,lx,lz),{cullRadius:S*.8}));
    }
  }
  // Far: the same field from further off, ringing the near.
  if(decay<.9){
    const F=C.farChunk,fx=Math.floor(dx/F),fz=Math.floor(dz/F);
    for(let iz=-C.far;iz<=C.far;iz++)for(let ix=-C.far;ix<=C.far;ix++){
      const x=fx+ix,z=fz+iz,wx=x*F,wz=z*F,d=Math.hypot(wx+F/2-dx,wz+F/2-dz);
      if(d<S*(C.near-1)||d>F*(C.far+.5))continue;
      const variant=heldGrid?0:cellHash(x,z)%3;
      for(const part of['grass','white','yellow'])props.push(instance(`mf_far_${variant}_${part}`,`f${x}:${z}:${part}`,translate(wx,0,wz),{cullRadius:F*.8}));
    }
  }
  // The fence runs on, and goes before the grass does. The poles go before it.
  if(decay<.72){
    const span=48,start=Math.floor(dz/span)*span;
    for(let k=-3;k<=3;k++){
      const z=start+k*span;
      props.push(instance('mf_fence_post',`fence-post-${k}`,translate(-14,0,z)),instance('mf_fence_wire',`fence-wire-${k}`,translate(-14,0,z)));
    }
  }
  if(decay<.58)for(let k=-5;k<=5;k++){const z=Math.floor(dz/60)*60+k*60;props.push(instance('mf_pole',`pole-${k}`,translate(58,0,z)));}
  if(decay<.46)props.push(instance('mf_tree_trunk','tree-trunk',translate(-92,0,-160)),instance('mf_tree_crown','tree-crown',translate(-92,0,-160)));
  // The few nearest daisies, whole, which can turn. They face the sun, as daisies do,
  // and as it gets later they stop doing that and face him.
  const facing=reducedDread?0:smooth(.3,.8,decay);
  const sun=memoryFieldSunDirection(visit),heroCell=2.2,hx=Math.floor(dx/heroCell),hz=Math.floor(dz/heroCell);
  for(let iz=-3;iz<=3;iz++)for(let ix=-3;ix<=3;ix++){
    const x=hx+ix,z=hz+iz,h=cellHash(x+31,z-17),wx=(x+((h&255)/255))*heroCell,wz=(z+(((h>>8)&255)/255))*heroCell,height=.2+(((h>>16)&63)/63)*.26;
    if((h>>24)%5===0)continue;
    const toX=dx-wx,toZ=dz-wz,sunYaw=Math.atan2(sun[0],sun[2]),eyeYaw=Math.atan2(toX,toZ),yaw=sunYaw+Math.atan2(Math.sin(eyeYaw-sunYaw),Math.cos(eyeYaw-sunYaw))*facing,sway=reducedMotion?0:.02*Math.sin(t*1.4+wx);
    const m=yawed(wx+sway,height,wz,yaw,2);
    props.push(instance('mf_hero_petal',`hero-p${x}:${z}`,m),instance('mf_hero_disc',`hero-d${x}:${z}`,m));
  }
  // THE DOOR.
  if(visit.door){
    const{x,z}=visit.door,gave=state.released==null?0:smooth(0,C.swingSeconds,state.elapsed-state.released),rattle=state.lastTry!=null&&state.elapsed-state.lastTry<.2&&!reducedMotion?Math.sin((state.elapsed-state.lastTry)*90)*.012:0;
    const frame=translate(x,0,z);
    props.push(instance('mf_door_post','door-post',frame),instance('mf_door_sill','door-sill',frame),instance('mf_door_hole','door-hole',frame));
    const hinge=yawed(x-C.door.halfWidth,0,z,rattle-gave*1.75);
    for(const part of['leaf','glass','trim','metal'])props.push(instance(`mf_door_${part}`,`door-${part}`,hinge,{cullRadius:2.2}));
  }
  if(visit.jumper)props.push(instance('mf_jumper','jumper',translate(visit.jumper.x-.8,1.1,visit.jumper.z)));
  if(visit.wheel&&hasWheel){
    const spin=(reducedMotion?.6:state.elapsed*3.4),{x,z}=visit.wheel,c=Math.cos(spin),s=Math.sin(spin);
    // On its side in the daisies, still going round.
    props.push({...SHARED,id:'memory-field:wheel',mesh:'dp_detached_wheel',matrix:new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,x,.02,z,1]),x,y:.1,z,cullRadius:1.2});
    props.push(instance('mf_hubcap','hubcap',yawed(x+.9,.02,z+.5,.6)));
  }
  const bag=memoryFieldBagPose(visit.bag,state,{reducedMotion});
  if(bag)props.push(instance(`the_bag_${((bag.frame%4)+4)%4}`,'bag',yawed(bag.x,bag.y,bag.z,bag.yaw,bag.scale),{cullRadius:bag.scale}));
  // What the world is made of, starting to show. The same faults as Source.
  if(decay>.22&&!reducedDread){
    const amount=Math.floor(smooth(.22,1,decay)*6);
    const rows=memoryFieldGeometry().filter(row=>row.fault);
    for(let k=0;k<rows.length&&k<amount;k++)props.push(instance(rows[k].name,`fault-${k}`,translate(Math.floor(dx/28)*28+7,0,Math.floor(dz/28)*28-12),{cullRadius:40,sourceAmbientFault:true}));
  }
  return{props,eye,authoredCamera:{eye,yaw:state.yaw,pitch:state.pitch},floorH:eye[1]-EYE};
}
