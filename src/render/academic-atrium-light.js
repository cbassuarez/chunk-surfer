import {ACADEMIC_ATRIUM_LIGHT as A} from '../data/academic-atrium-light.js';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(lo,hi,v)=>{const t=clamp((v-lo)/(hi-lo));return t*t*(3-2*t);};
const inside=(r,x,z)=>Math.min(x-r.x0,r.x1-x,z-r.z0,r.z1-z);
const outside=(r,x,z)=>Math.max(r.x0-x,x-r.x1,r.z0-z,z-r.z1);
const atY=(p,y)=>({x:p.x-A.direction.x*(y-p.y),z:p.z-A.direction.z*(y-p.y)});
const finite=p=>p&&[p.x,p.y,p.z].every(Number.isFinite);
export const academicAtriumLightEnabled=context=>context?.academicAtriumLight===true&&A.contextGroups.includes(context?.group);
export function academicAtriumLightSample(point,{enabled=false}={}){
  if(!enabled||!finite(point)||point.y<A.groundY||point.y>A.roofY)return{strength:0,reason:'inactive-or-outside',roof:null};
  const roof=atY(point,A.roofY);
  if(inside(A.aperture,roof.x,roof.z)<=0)return{strength:0,reason:'outside-aperture',roof};
  const ix=Math.floor((roof.x-A.aperture.x0)/A.panes.stepX),iz=Math.floor((roof.z-A.aperture.z0)/A.panes.stepZ);
  if(ix<0||ix>=A.panes.columns||iz<0||iz>=A.panes.rows)return{strength:0,reason:'outside-pane-grid',roof};
  const cx=A.panes.firstX+ix*A.panes.stepX,cz=A.panes.firstZ+iz*A.panes.stepZ;
  let strength=smooth(0,A.penumbra,Math.min(A.panes.width/2-Math.abs(roof.x-cx),A.panes.depth/2-Math.abs(roof.z-cz)));
  if(strength<=0)return{strength:0,reason:'iron-grid',roof};
  for(const patch of A.leadPatches)strength*=smooth(0,A.penumbra,outside(patch,roof.x,roof.z));
  if(strength<=0)return{strength:0,reason:'lead-repair',roof};
  if(point.y<A.beams.y+A.beams.halfWidth){
    const beam=atY(point,A.beams.y),projectedHalf=A.beams.halfWidth*(1+Math.abs(A.direction.x));
    for(const x of A.beams.xs)strength*=smooth(0,A.beamPenumbra,
      Math.max(Math.abs(beam.x-x)-projectedHalf,A.beams.z0-beam.z,beam.z-A.beams.z1));
  }
  if(strength<=0)return{strength:0,reason:'primary-beam',roof};
  if(point.y<A.deck.top-.0001){
    // A ray below the deck must traverse its entire actual thickness through
    // the void. A ray landing on the gallery top is allowed to light that top.
    const top=atY(point,A.deck.top),bottom=atY(point,Math.max(point.y,A.deck.bottom));
    strength*=smooth(0,A.deckPenumbra,Math.min(inside(A.void,top.x,top.z),inside(A.void,bottom.x,bottom.z)));
  }
  if(strength<=0)return{strength:0,reason:'gallery-deck',roof};
  strength*=.64+.36*clamp(point.y/A.roofY);
  return{strength,reason:'transmitted',roof,pane:{column:ix,row:iz}};
}
export function academicAtriumLightRayInterval(origin,direction,maxDistance=100){
  if(!finite(origin)||!finite(direction)||!Number.isFinite(maxDistance)||maxDistance<=0)return null;
  let near=0,far=maxDistance;
  for(const[key,index]of[['x',0],['y',1],['z',2]]){
    const d=direction[key],lo=A.bounds.min[index],hi=A.bounds.max[index];
    if(Math.abs(d)<.000001){if(origin[key]<lo||origin[key]>hi)return null;continue;}
    const a=(lo-origin[key])/d,b=(hi-origin[key])/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(far<=near)return null;
  }
  return{near,far};
}
export function academicAtriumRoofRayEnd(origin,direction,{enabled=false}={}){
  if(!enabled||!finite(origin)||!finite(direction)||origin.y<A.roofY||direction.y>=-.000001)return 0;
  const roofT=(A.roofY-origin.y)/direction.y,roof={x:origin.x+direction.x*roofT,y:A.roofY,z:origin.z+direction.z*roofT};
  if(academicAtriumLightSample(roof,{enabled:true}).strength<=0)return 0;
  const at=height=>{const t=(height-origin.y)/direction.y;return{x:origin.x+direction.x*t,z:origin.z+direction.z*t};};
  const top=at(A.deck.top),bottom=at(A.deck.bottom);
  return ((inside(A.void,top.x,top.z)>.001&&inside(A.void,bottom.x,bottom.z)>.001?A.groundY:A.deck.top)-origin.y)/direction.y;
}
export function academicAtriumLightVolume(origin,direction,maxDistance,{enabled=false}={}){
  if(!enabled)return 0;const interval=academicAtriumLightRayInterval(origin,direction,maxDistance);if(!interval)return 0;
  const step=(interval.far-interval.near)/A.volumeSteps;let integral=0;
  for(let i=0;i<A.volumeSteps;i++){
    const t=interval.near+(i+.5)*step,p={x:origin.x+direction.x*t,y:origin.y+direction.y*t,z:origin.z+direction.z*t};
    integral+=academicAtriumLightSample(p,{enabled:true}).strength*step;
  }
  return Math.min(A.volumeCap,1-Math.exp(-integral*A.volumeDensity));
}
const f=n=>Number.isInteger(n)?`${n}.0`:String(Number(n.toFixed(8)));
const v=values=>`vec${values.length}(${values.map(f).join(',')})`;
// The same authored constants feed both paths; no second set of magic shader
// coordinates. Tests exercise real roof panes, repairs, deck thickness and
// compiled floor heights, and the final native shader remains visual proof.
export const ACADEMIC_ATRIUM_LIGHT_GLSL=`
uniform float uAcademicAtriumLight;
const vec3 AAL_COLOR=${v(A.color)};
const vec3 AAL_VOLUME_COLOR=${v(A.volumeColor)};
const float AAL_ENERGY=${f(A.surfaceEnergy)};
const vec3 AAL_TOWARDS=normalize(${v([-A.direction.x,1,-A.direction.z])});
vec2 aalAtY(vec3 p,float y){return p.xz-${v([A.direction.x,A.direction.z])}*(y-p.y);}
float aalInside(vec2 p){return min(min(p.x-${f(A.void.x0)},${f(A.void.x1)}-p.x),min(p.y-${f(A.void.z0)},${f(A.void.z1)}-p.y));}
float aalOutside(vec2 p,vec4 r){return max(max(r.x-p.x,p.x-r.y),max(r.z-p.y,p.y-r.w));}
float academicAtriumSkyAt(vec3 p){
  if(uAcademicAtriumLight<.5||p.y<${f(A.groundY)}||p.y>${f(A.roofY)})return 0.0;
  vec2 roof=aalAtY(p,${f(A.roofY)});
  if(aalInside(roof)<=0.0)return 0.0;
  vec2 cell=floor((roof-${v([A.aperture.x0,A.aperture.z0])})/${v([A.panes.stepX,A.panes.stepZ])});
  if(cell.x<0.0||cell.x>=${f(A.panes.columns)}||cell.y<0.0||cell.y>=${f(A.panes.rows)})return 0.0;
  vec2 center=${v([A.panes.firstX,A.panes.firstZ])}+cell*${v([A.panes.stepX,A.panes.stepZ])};
  vec2 edge=${v([A.panes.width/2,A.panes.depth/2])}-abs(roof-center);
  float field=smoothstep(0.0,${f(A.penumbra)},min(edge.x,edge.y));
  ${A.leadPatches.map(r=>`field*=smoothstep(0.0,${f(A.penumbra)},aalOutside(roof,${v([r.x0,r.x1,r.z0,r.z1])}));`).join('\n  ')}
  if(p.y<${f(A.beams.y+A.beams.halfWidth)}){
    vec2 beam=aalAtY(p,${f(A.beams.y)});
    ${A.beams.xs.map(x=>`field*=smoothstep(0.0,${f(A.beamPenumbra)},max(abs(beam.x-${f(x)})-${f(A.beams.halfWidth*(1+Math.abs(A.direction.x)))},max(${f(A.beams.z0)}-beam.y,beam.y-${f(A.beams.z1)})));`).join("\n    ")}
  }
  if(p.y<${f(A.deck.top-.0001)}){
    vec2 top=aalAtY(p,${f(A.deck.top)}),bottom=aalAtY(p,max(p.y,${f(A.deck.bottom)}));
    field*=smoothstep(0.0,${f(A.deckPenumbra)},min(aalInside(top),aalInside(bottom)));
  }
  return field*(.64+.36*clamp(p.y/${f(A.roofY)},0.0,1.0));
}
float academicAtriumRoofRayEnd(vec3 origin,vec3 direction){
  if(uAcademicAtriumLight<.5||origin.y<${f(A.roofY)}||direction.y>=-.000001)return 0.0;
  float roofT=(${f(A.roofY)}-origin.y)/direction.y;
  vec3 roof=origin+direction*roofT;if(academicAtriumSkyAt(roof)<=0.0)return 0.0;
  vec2 top=(origin+direction*((${f(A.deck.top)}-origin.y)/direction.y)).xz;
  vec2 bottom=(origin+direction*((${f(A.deck.bottom)}-origin.y)/direction.y)).xz;
  float floorY=aalInside(top)>.001&&aalInside(bottom)>.001?${f(A.groundY)}:${f(A.deck.top)};
  return (floorY-origin.y)/direction.y;
}
vec3 academicAtriumSurfaceLight(vec3 p,vec3 n){return AAL_COLOR*AAL_ENERGY*academicAtriumSkyAt(p)*(.14+.86*max(dot(n,AAL_TOWARDS),0.0));}
float academicAtriumSkyVolume(vec3 origin,vec3 direction,float maxDistance){
  if(uAcademicAtriumLight<.5)return 0.0;
  float near=0.0,far=maxDistance;vec3 minimum=${v(A.bounds.min)},maximum=${v(A.bounds.max)};
  for(int axis=0;axis<3;axis++){
    if(abs(direction[axis])<.000001){if(origin[axis]<minimum[axis]||origin[axis]>maximum[axis])return 0.0;}
    else{float a=(minimum[axis]-origin[axis])/direction[axis],b=(maximum[axis]-origin[axis])/direction[axis];near=max(near,min(a,b));far=min(far,max(a,b));}
    if(far<=near)return 0.0;
  }
  float stepSize=(far-near)/${f(A.volumeSteps)},integral=0.0;
  for(int i=0;i<${A.volumeSteps};i++)integral+=academicAtriumSkyAt(origin+direction*(near+(float(i)+.5)*stepSize))*stepSize;
  return min(${f(A.volumeCap)},1.0-exp(-integral*${f(A.volumeDensity)}));
}
`;
