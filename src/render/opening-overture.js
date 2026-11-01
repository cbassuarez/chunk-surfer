import {ZONE} from '../data/floorplan/legend.js';
import {OPENING_OVERTURE,OPENING_OVERTURE_BIRDS} from '../data/opening-overture.js';
import {openingOvertureBirdFlight} from '../data/opening-overture-flight.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const I=()=>[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const multiply=(a,b)=>{const m=Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)m[c*4+r]+=a[k*4+r]*b[c*4+k];return m;};
const translation=(x=0,y=0,z=0)=>{const m=I();m.splice(12,3,x,y,z);return m;};
const scale=s=>[s,0,0,0,0,s,0,0,0,0,s,0,0,0,0,1];
const scale3=(x,y,z)=>[x,0,0,0,0,y,0,0,0,0,z,0,0,0,0,1];
const rx=a=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1];
const ry=a=>[Math.cos(a),0,Math.sin(a),0,0,1,0,0,-Math.sin(a),0,Math.cos(a),0,0,0,0,1];
const rz=a=>[Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1];
const compose=(...ms)=>ms.reduce(multiply,I());
export function openingOvertureBirdPose(bird,seconds=0,{reducedMotion=false}={}){
  const t=Math.max(0,Number(seconds)||0),flight=openingOvertureBirdFlight(bird,t),{age,grounded}=flight,until=t-bird.takeoffAt,
    unfold=smooth((until+.24)/.24),cycles=age*(5.2+bird.beat*.25),cycle=cycles%1,
    stroke=cycle<.58?smooth(cycle/.58):1-smooth((cycle-.58)/.42),amplitude=reducedMotion?.76:1,
    wingAngle=grounded?-.16+1.26*smooth((until+.16)/.16):amplitude*(1.10-2.18*stroke),
    compression=smooth((until+.28)/.13),push=smooth((until+.12)/.12),crouch=grounded?-.027*compression+.039*push:.012*(1-smooth(age/.16));
  return{...flight,phase:grounded?unfold>0?'anticipation':'perched':age<.3?'leg-push':'flight',unfold,wingAngle,wingPhase:cycles*Math.PI*2,
    roofRoll:bird.roofRoll*(1-smooth(age/.30)),bodyPitch:grounded?.015*Math.sin(t*2+bird.beat):.30*Math.exp(-age*1.8)+.10,
    crouch,footFold:smooth((age-.06)/.28)*-1.35,scale:bird.scale};
}
// Rigid articulated geometry uses the normal prop catalogue. Each wing carries
// individual solid primary/secondary feathers; no billboard, sprite or timer
// running outside the montage's own paused presentation clock is involved.
export function openingOvertureBirdInstances(seconds=0,{reducedMotion=false}={}){
  const time=Math.max(0,Number(seconds)||0);if(time>OPENING_OVERTURE.birdsVisibleUntil)return[];const instances=[];
  for(const bird of OPENING_OVERTURE_BIRDS){
    const pose=openingOvertureBirdPose(bird,time,{reducedMotion}),root=compose(translation(...pose.position),rz(pose.roofRoll),ry(pose.heading),rz(pose.bank),scale(pose.scale)),body=compose(root,translation(0,pose.crouch,0),rx(pose.bodyPitch));
    function part(name,m){instances.push({id:'opening-overture:'+bird.id+':'+name,mesh:'overture_pigeon_'+name,matrix:m,x:m[12],y:m[13],z:m[14],zone:ZONE.street,structural:false,decorative:true,noCollision:true,walkable:false,noShadow:!pose.grounded,cullRadius:.7,
      openingOverture:true,birdId:bird.id,birdPart:name,grounded:pose.grounded,takeoffAt:bird.takeoffAt,flightAge:pose.age});}
    part('body',body);part('head',compose(body,translation(0,.239,-.080),rx(pose.grounded?Math.sin(time*1.7+bird.beat*3)*.055:-pose.bodyPitch*.4)));part('beak',compose(body,translation(0,.239,-.080),rx(pose.grounded?Math.sin(time*1.7+bird.beat*3)*.055:-pose.bodyPitch*.4)));
    part('tail',compose(body,translation(0,.13,.095),rx(pose.grounded?.04:-.12+.025*Math.sin(pose.wingPhase-.4))));
    for(const side of[-1,1]){
      const suffix=side<0?'l':'r',inner=compose(body,translation(side*.052,.185,.012),ry(side*1.20*(1-pose.unfold)),rz(side*pose.wingAngle));
      part('wing_inner_'+suffix,inner);part('wing_outer_'+suffix,compose(inner,translation(side*.105,0,.012),ry(side*.34*(1-pose.unfold)),rz(side*(-.08-.18*Math.cos(pose.wingPhase-.55))*pose.unfold),scale3(1,1,.34+.66*pose.unfold)));
      part('foot_'+suffix,compose(root,translation(side*.028,.09,.015),rx(pose.footFold),translation(0,-.09,0)));
    }
  }
  return instances;
}
