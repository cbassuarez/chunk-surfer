// Reviewable world acquisition/lighting. These modes never change gameplay,
// emitters, power, exposure, material identity or the player's equipment.
export const WORLD_LIGHT_TREATMENT = Object.freeze({ baseline:0, 'marks-only':1, complete:2 });
export function normalizeWorldLightTreatment(value='complete'){
  if(typeof value==='string'&&Object.hasOwn(WORLD_LIGHT_TREATMENT,value))return value;
  return Object.keys(WORLD_LIGHT_TREATMENT).find(key=>WORLD_LIGHT_TREATMENT[key]===value)||'complete';
}
export function worldLightTreatmentFrame(value='complete'){
  const mode=normalizeWorldLightTreatment(value),level=WORLD_LIGHT_TREATMENT[mode];
  return{mode,level,marks:level>=1,lighting:level>=2};
}
export function fineMarkFootprint(sceneCellPx=2){
  return Math.max(.85,Math.min(1.65,(Number(sceneCellPx)||2)*.45));
}
export function reflectedLightColor(rgb,amount=.18){
  const y=v=>v.reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0),source=rgb.map(x=>Math.max(0,Number(x)||0));
  const cold=source.map((x,i)=>x*[.86,.95,1.08][i]),gain=y(source)/Math.max(1e-6,y(cold)),t=Math.max(0,Math.min(1,amount));
  return source.map((x,i)=>x+(cold[i]*gain-x)*t);
}
export function weightedShadowCoverage(samples,fraction){
  const f=fraction.map(x=>Math.max(0,Math.min(1,x))),mix=(a,b,t)=>a+(b-a)*t;
  return mix(mix(samples[0],samples[1],f[0]),mix(samples[2],samples[3],f[0]),f[1]);
}

// CPU reference for a segment through physical plan spans. It is intentionally
// independent of sample density: a narrow blocker cannot fall between probes.
export function planLightVisibility({from,to,cellAt,cellMeters=.5,maxSteps=64}={}){
  if(!Array.isArray(from)||from.length!==3||!from.every(Number.isFinite)||!Array.isArray(to)||to.length!==3||!to.every(Number.isFinite)||typeof cellAt!=='function'||!Number.isFinite(cellMeters)||cellMeters<=0)return 0;
  maxSteps=Math.max(0,Math.min(64,Math.floor(Number(maxSteps)||0)));
  const d=to.map((v,i)=>v-from[i]),length=Math.hypot(...d);
  if(length<1e-6)return 1;
  const offset=Math.min(.012,length*.5),start=from.map((v,i)=>(v+d[i]/length*offset)/cellMeters),end=to.map(v=>v/cellMeters),ray=end.map((v,i)=>v-start[i]);
  let x=Math.floor(start[0]),z=Math.floor(start[2]),t=0;
  const sx=Math.sign(ray[0]),sz=Math.sign(ray[2]),dx=Math.abs(ray[0])>1e-8?1/Math.abs(ray[0]):1e20,dz=Math.abs(ray[2])>1e-8?1/Math.abs(ray[2]):1e20;
  let tx=sx?((x+(sx>0?1:0))-start[0])/ray[0]:1e20,tz=sz?((z+(sz>0?1:0))-start[2])/ray[2]:1e20;
  for(let i=0;i<maxSteps;i++){
    const exit=Math.min(1,tx,tz),cell=cellAt(x,z),y0=(start[1]+ray[1]*t)*cellMeters,y1=(start[1]+ray[1]*exit)*cellMeters;
    if(cell?.solid||Math.min(y0,y1)<(cell?.floor??-Infinity)-.025||Math.max(y0,y1)>(cell?.ceil??Infinity)+.025)return 0;
    if(exit>=1-1e-7)return 1;
    const next=Math.min(tx,tz),advanceX=tx<=tz,advanceZ=tz<=tx;t=next;
    if(advanceX){tx+=dx;x+=sx;}if(advanceZ){tz+=dz;z+=sz;}
  }
  return null; // The renderer explicitly falls back to its legacy far query.
}

export const WORLD_LIGHT_TREATMENT_GLSL=`
uniform float uWorldLightTreatment;
vec3 reflectedLightColor(vec3 source){
  vec3 cold=source*vec3(.86,.95,1.08);
  cold*=dot(source,vec3(.2126,.7152,.0722))/max(.000001,dot(cold,vec3(.2126,.7152,.0722)));
  return mix(source,cold,.18);
}
`;
