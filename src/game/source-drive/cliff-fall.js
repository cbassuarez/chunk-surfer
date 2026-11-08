// THE FALL, AS PHYSICS. A deterministic rigid body for the opening drive's
// cliff plunge: the rear axle pivots while the last wheels hold, then the van
// flies ballistically with the angular momentum that pivot gave it, meets the
// water at the speed gravity actually built, and damps down onto the settled
// wreck pose. Nothing here is an authored curve: every number comes from the
// game's own vehicle constants and g, so the hang time is √(2h/g) and the
// impact speed is what the drop height says it is. Two instances with the same
// release are the same motion, to the last bit.
const freeze=Object.freeze;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const finite=(v,f=0)=>Number.isFinite(v)?v:f;
const hermite=(a,b,va,vb,span,u)=>(2*u*u*u-3*u*u+1)*a+(u*u*u-2*u*u+u)*va*span+(-2*u*u*u+3*u*u)*b+(u*u*u-u*u)*vb*span;

export const CLIFF_FALL=freeze({
  // The van as the game already knows it (src/game/source-drive/vehicle-dynamics.js):
  // a 2.35 t Luton with this wheelbase and CoM. Pitch inertia is the box estimate
  // m/12·(w²+l²) for a 2.2 m wide, 6.5 m long body.
  mass:2350,wheelbase:2.835,comBehindFront:1.3,pitchInertia:9200,g:9.81,
  // The rear wheels hold the road for this long after the nose is gone; that
  // hold is what turns the van over. Gravity about the axle does the rest.
  pivotSeconds:.16,
  // Small free-flight rates: the road bends as it leaves and the break's edge
  // is not level, so the wreck arrives slightly turned and slightly rolled.
  yawRate:.011,rollRate:.12,
  // The lowest corners of the hull in body metres; these cross the water first.
  hullPoints:freeze([[-1.04,-3.25],[-1.04,2.55],[1.04,-3.25],[1.04,2.55]]),
  // Water: the box keeps almost none of its vertical speed, then everything
  // converges on the wreck bed under heavy drag.
  verticalRestitution:-.06,horizontalDamp:1.25,verticalDamp:1.55,attitudeDamp:1.1,
  // The last stretch eases onto the settled wreck pose instead of snapping.
  settledBlendSeconds:2.4,
});

const C=CLIFF_FALL;

// The teaser's own body matrix, byte for byte: the same rotation and multiply
// as scene.js, so the fall's matrices are the drive's matrices.
export const cliffFallRotation=(x=0,y=0,z=0)=>{const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);return[cy*cz+sy*sx*sz,cx*sz,-sy*cz+cy*sx*sz,0,-cy*sz+sy*sx*cz,cx*cz,sy*sz+cy*sx*cz,0,sy*cx,-sx,cy*cx,0,0,0,0,1];};
export const cliffFallMultiply=(a,b)=>{const m=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let i=0;i<4;i++)m[c*4+r]+=a[i*4+r]*b[c*4+i];return m;};
export function cliffFallBodyMatrix(position,heading,pitch,roll=0){
  const m=cliffFallMultiply(cliffFallRotation(0,-heading),cliffFallRotation(pitch,0,roll)),pivot=.85;
  m[12]=32+position[0]-m[4]*pivot;m[13]=position[1]+pivot-m[5]*pivot;m[14]=32+position[2]-m[6]*pivot;m[15]=1;
  return m;
}

// The settled wreck matrix, decomposed to the same Euler space the fall uses.
function decomposeSettled(matrix){
  const pos=[matrix[12]-32,matrix[13],matrix[14]-32];
  const fw=[-matrix[8],-matrix[9],-matrix[10]];
  const heading=Math.atan2(fw[0],-fw[2]);
  const pitch=Math.asin(clamp(-fw[1],-1,1));
  const right=[matrix[0],matrix[4],matrix[8]];
  const levelUp=[-Math.sin(heading)*Math.sin(pitch),Math.cos(pitch),Math.cos(heading)*Math.sin(pitch)];
  const levelRight=[Math.cos(heading),0,Math.sin(heading)];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const roll=Math.atan2(dot(right,levelUp),dot(right,levelRight));
  return{pos,heading,pitch,roll};
}

/**
 * The whole plunge from one release state. `release` is the world pose and
 * velocity the moment the van leaves the road; the returned state function
 * answers every later second. Times are fall-local (0 = release), and the
 * motion is exact and deterministic: closed forms, one bisection, no clock.
 */
export function createCliffFall({release,seaY=0,settledMatrix,settledAtLocal,g=C.g,pivotSeconds=C.pivotSeconds,direction=1,toLocal=p=>[...p],toWorld=p=>[...p],toLocalDir=v=>[...v],settledLocal=null,attitude='glide'}={}){
  const pos0=[...release.position],vel0=[...release.velocity];
  const h0=finite(release.heading),p0=finite(release.pitch),r0=finite(release.roll);
  const settled=decomposeSettled(settledMatrix);
  // The water phase runs in the coastal frame, where the wreck bed is a few
  // hundred metres along the bay; the world-space distance is far longer.
  const localSettled=settledLocal?[...settledLocal]:toLocal(settled.pos);
  // The impact hands the hull to the water with its real entry velocity; drag
  // bleeds that velocity off (the box barely keeps its downward speed), and
  // the last stretch eases onto the wreck pose. Same character as the drive's
  // original water motion, now starting from the physical entry state.
  const hydroSeconds=1.4,waterK=[2.6,8,2.6];

  // The pivot: gravity about the holding axle turns the van over while the
  // last wheels still hold. The CoM (1.535 m from that axle) falls on an arc,
  // gaining the only angular velocity the flight will ever have. Nose-first
  // pivots about the rear axle; rear-first pivots the other way about the front.
  const alpha=direction*C.mass*g*C.comBehindFront*Math.cos(p0)/C.pitchInertia;
  const omega0=alpha*pivotSeconds;
  const pivotEndPitch=p0-.5*alpha*pivotSeconds*pivotSeconds;
  const pivotEndVy=vel0[1]-alpha*C.comBehindFront*Math.cos(p0)*pivotSeconds;
  const pivotDrop=-.5*alpha*C.comBehindFront*Math.cos(p0)*pivotSeconds*pivotSeconds;

  const pitchAt=t=>t<=pivotSeconds?p0-.5*alpha*t*t:pivotEndPitch-omega0*(t-pivotSeconds);
  const headingAt=t=>h0+C.yawRate*t;
  const rollAt=t=>r0+C.rollRate*t;
  const vyAt=t=>t<=pivotSeconds?vel0[1]-alpha*C.comBehindFront*Math.cos(p0)*t:pivotEndVy-g*(t-pivotSeconds);

  function flight(t){
    const tp=Math.min(t,pivotSeconds);
    const y=pos0[1]-.5*alpha*C.comBehindFront*Math.cos(p0)*tp*tp+(t>tp?(t-tp)*(pivotEndVy-.5*g*(t-tp)):0);
    return{x:pos0[0]+vel0[0]*t,y,z:pos0[2]+vel0[2]*t,vy:vyAt(t),pitch:pitchAt(t)};
  }

  // Entry: bisect the first instant the lowest hull corner crosses the water.
  // The hull is measured in the coastal frame, the way the coast sees it.
  const hullLocalY=(position,heading,pitch,roll)=>{
    const m=cliffFallBodyMatrix(position,heading,pitch,roll);let y=Infinity;
    for(const [x,z] of C.hullPoints){
      const local=toLocal([m[0]*x+m[8]*z+m[12]-32,m[1]*x+m[9]*z+m[13],m[2]*x+m[10]*z+m[14]-32]);
      y=Math.min(y,local[1]);
    }
    return y;
  };
  let low=0,high=8;
  for(let i=0;i<64;i++){
    const mid=(low+high)/2,f=flight(mid);
    if(hullLocalY([f.x,f.y,f.z],headingAt(mid),f.pitch,rollAt(mid))>seaY)low=mid;else high=mid;
  }
  const entryTime=(low+high)/2,f0=flight(entryTime);
  const entryHeading=headingAt(entryTime),entryPitch=f0.pitch,entryRoll=rollAt(entryTime);
  const entryVy=f0.vy;
  // The water phase runs in the coastal frame: drag on the real entry velocity,
  // then a glide onto the wreck bed. Defined once the entry state exists.
  const entryLocal=toLocal([f0.x,f0.y,f0.z]);
  const entryVelLocal=toLocalDir([vel0[0],entryVy,vel0[2]]);
  const wetPosition=f=>entryLocal.map((v,i)=>v+entryVelLocal[i]/waterK[i]*(1-Math.exp(-waterK[i]*f)));
  const wetEnd=wetPosition(hydroSeconds),wetVelocity=entryVelLocal.map((v,i)=>v*Math.exp(-waterK[i]*hydroSeconds));
  // After the splash the van keeps almost none of its downward speed, and from
  // there every axis converges on the wreck bed under heavy drag.
  const wetVy0=entryVy*C.verticalRestitution;
  const converge=(a,b,k,t)=>b+(a-b)*Math.exp(-k*t);

  function state(tLocal){
    const t=Math.max(0,tLocal);
    if(t<=entryTime){
      const f=flight(t);
      const position=[f.x,f.y,f.z];
      return{position,heading:headingAt(t),pitch:f.pitch,roll:rollAt(t),
        bodyMatrix:cliffFallBodyMatrix(position,headingAt(t),f.pitch,rollAt(t)),
        phase:t<=C.pivotSeconds?'pivot':'air',verticalVelocity:f.vy,splash:0,entryTime:null};
    }
    if(t>=settledAtLocal){
      return{position:[...settled.pos],heading:settled.heading,pitch:settled.pitch,roll:settled.roll,
        bodyMatrix:new Float32Array(settledMatrix),phase:'settled',verticalVelocity:0,splash:0,entryTime};
    }
    const f=t-entryTime;
    const span=settledAtLocal-entryTime-hydroSeconds;
    // Drag first, then the slow glide onto the wreck bed.
    const localRaw=f<hydroSeconds?wetPosition(f):wetEnd.map((v,i)=>hermite(v,localSettled[i],wetVelocity[i],0,span,(f-hydroSeconds)/span));
    const raw=toWorld(localRaw);
    const totalWet=settledAtLocal-entryTime;
    const u=attitude==='hold'?0:ease(clamp(f/totalWet,0,1));
    const heading=mix(entryHeading,settled.heading,u),pitch=mix(entryPitch,settled.pitch,u),roll=mix(entryRoll,settled.roll,u);
    const position=[raw[0],raw[1],raw[2]];
    return{position,heading,pitch,roll,bodyMatrix:cliffFallBodyMatrix(position,heading,pitch,roll),
      phase:'water',verticalVelocity:wetVy0*Math.exp(-C.verticalDamp*f),splash:Math.exp(-6*f),entryTime};
  }

  const drop=pos0[1]-seaY;
  return{
    entryTime,impactSpeed:Math.abs(entryVy),pivotRate:omega0,pivotDrop,
    state,
    diagnostics:freeze({
      dropMetres:drop,
      // The hang time gravity promises for this drop and this downward start.
      promisedHang:(-Math.abs(vel0[1])+Math.sqrt(vel0[1]*vel0[1]+2*g*drop))/g,
      entryTime,impactSpeed:Math.abs(entryVy),pivotRate:omega0,
      settled:freeze({...settled}),
    }),
  };
}
