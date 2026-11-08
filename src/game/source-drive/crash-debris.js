// THE CRASH'S SECONDARY MOTION, AS ENERGY. A deterministic debris field for
// the cliff plunge: dust off the snapped rail, kicked gravel arcing off the
// break, a spray crown at the water, foam drifting after. Every particle is a
// closed form in the film's own clocks — dust and foam under drag, gravel and
// spray under gravity — so the same film second always throws the same dust,
// whatever the frame rate. One fixed-seed LCG decides the burst shapes, and
// that seed is the whole randomness.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};

export const CRASH_DEBRIS=Object.freeze({
  g:9.81,
  dust:{count:26,life:2.6,speed:3.4,up:1.6,spread:2.3,drag:1.8,scale:[1.4,2.2]},
  gravel:{count:9,life:2.2,speed:4.2,up:.7,spread:1.9,scale:[.34,.62]},
  spray:{count:22,life:.9,speed:7.2,spread:4.4,g:8.8,scale:[1.6,2.6]},
  foam:{count:12,life:4.2,speed:.55,up:.3,spread:1.8,drag:.7,scale:[1.1,1.9]},
});

const C=CRASH_DEBRIS;

function lcg(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

function burst({count,origin,life,speed,up=0,spread,kind,mesh,rand,grav=0,drag=0},t0=0){
  const parts=[];
  for(let i=0;i<count;i++){
    const yaw=rand()*Math.PI*2,pitch=rand()*Math.PI*.5,v=speed*(.4+.6*rand());
    parts.push({
      kind,mesh,life,t0,age:0,
      p0:[origin[0]+(rand()-.5)*spread,origin[1]+.2+rand()*.6,origin[2]+(rand()-.5)*spread],
      v0:[Math.cos(yaw)*Math.cos(pitch)*v,Math.sin(pitch)*v+up,Math.sin(yaw)*Math.cos(pitch)*v],
      grav,drag,spin0:rand()*Math.PI*2,spinRate:(rand()-.5)*4,
    });
  }
  return parts;
}

// Each particle's state is exact in its age: drag damps velocity, gravity
// curves the arc. No accumulation, so the field cannot drift with frame rate.
function particleAt(q,age){
  const t=Math.max(0,age);
  let x,y,z;
  if(q.drag>0){
    const k=q.drag,e=Math.exp(-k*t);
    x=q.p0[0]+q.v0[0]/k*(1-e);y=q.p0[1]+q.v0[1]/k*(1-e);z=q.p0[2]+q.v0[2]/k*(1-e);
  }else{
    x=q.p0[0]+q.v0[0]*t;y=q.p0[1]+q.v0[1]*t-.5*q.grav*t*t;z=q.p0[2]+q.v0[2]*t;
  }
  return{x,y,z,spin:q.spin0+q.spinRate*t};
}

function propFor(q,index){
  const t=clamp(q.age/q.life,0,1);
  const grow=q.kind==='dust'?smooth(Math.min(1,q.age/.35)):q.kind==='spray'?smooth(Math.min(1,q.age/.12)):1;
  const fade=q.kind==='gravel'?1:1-smooth(clamp((t-.55)/.45,0,1));
  const [lo,hi]=q.kind==='gravel'?C.gravel.scale:q.kind==='spray'?C.spray.scale:q.kind==='foam'?C.foam.scale:C.dust.scale;
  const s=(lo+(hi-lo)*grow)*fade;
  if(s<=0)return null;
  const at=particleAt(q,q.age),ch=Math.cos(at.spin),sh=Math.sin(at.spin);
  return{
    id:`drive-crash-debris-${index}`,mesh:q.mesh,decorative:true,structural:false,noReflection:true,cullRadius:.6,
    x:at.x,y:at.y,z:at.z,
    matrix:new Float32Array([ch*s,0,-sh*s,0,0,s,0,0,sh*s,0,ch*s,0,at.x,at.y,at.z,1]),
  };
}

/**
 * The debris field. `fallSeconds`/`waterSeconds` are the pose's film clocks
 * (the same numbers doorDriveTeaserPoseAt carries); `sceneAnchor` is the break
 * edge; `position` the pose's world position, used once for the water entry.
 * Returns the live particles as props, or [] outside the plunge.
 */
export function createCrashDebris(){
  let parts=[],prevFall=-1,prevWater=-1,gravelFired=false,entryFired=false,entryPoint=null;
  const now=(fallSeconds,waterSeconds)=>waterSeconds>=0?fallSeconds+waterSeconds:fallSeconds;
  return{
    reset(){parts=[];prevFall=-1;prevWater=-1;gravelFired=false;entryFired=false;entryPoint=null;},
    step({fallSeconds=-1,waterSeconds=-1,sceneAnchor=null,position=null}={}){
      if(fallSeconds<0){parts=[];prevFall=-1;prevWater=-1;gravelFired=false;entryFired=false;return [];}
      // Fire each burst on the first frame of its beat, at its nominal film
      // second, so a 30 fps field and a 120 fps field agree to the last bit.
      const film=fallSeconds+Math.max(0,waterSeconds),rand=lcg(0x51F1E000|0);
      if(prevFall<0){
        parts.push(...burst({...C.dust,origin:[sceneAnchor.x,sceneAnchor.y+.3,sceneAnchor.z+3.2],mesh:'wind_leaf_blade_pale',kind:'dust',rand,drag:C.dust.drag},0));
      }
      if(!gravelFired&&fallSeconds>=.15){
        gravelFired=true;
        parts.push(...burst({...C.gravel,origin:[sceneAnchor.x,sceneAnchor.y+.2,sceneAnchor.z+3.4],mesh:'dp_cliff_mass',kind:'gravel',rand,grav:C.g},.15));
      }
      if(!entryFired&&waterSeconds>=0){
        entryFired=true;entryPoint=[position[0],position[1],position[2]];
        parts.push(...burst({...C.spray,origin:entryPoint,mesh:'wind_leaf_lobed_pale',kind:'spray',rand,grav:C.spray.g},film));
        parts.push(...burst({...C.foam,origin:[entryPoint[0],entryPoint[1]+.2,entryPoint[2]],mesh:'wind_leaf_curled_pale',kind:'foam',rand,drag:C.foam.drag},film));
      }
      // Ages are the exact film seconds since each burst's nominal start.
      if(prevFall>=0){for(const q of parts)q.age=film-q.t0;parts=parts.filter(q=>q.age>=0&&q.age<q.life);}
      prevFall=fallSeconds;prevWater=waterSeconds;
      return parts.map(propFor).filter(Boolean);
    },
  };
}
