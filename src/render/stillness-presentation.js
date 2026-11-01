// One transient material owner shared by the architectural and mesh passes.
// This never writes threat, collision, injury, recording or consent state.
const zero=Object.freeze({amount:0,profile:0,time:0,anchor:Object.freeze([0,0,0]),direction:Object.freeze([0,0,-1]),reducedMotion:false});
let current=zero;
let renderMode='relief';
export function setStillnessRenderMode(value='relief'){
  if(!['relief','legacy','off'].includes(value))throw new Error('Unknown stillness rendering mode');
  renderMode=value;return renderMode;
}
export const stillnessRenderMode=()=>renderMode;
const finite=(n,f=0)=>Number.isFinite(Number(n))?Number(n):f;
const vector=(v,f)=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite)?v.map(n=>Math.max(-1e6,Math.min(1e6,n))):[...f];
export function setStillnessPresentation(frame){
  if(!frame||!(frame.amount>0)){current=zero;return current;}
  let direction=vector(frame.direction,[0,0,-1]);
  let length=Math.hypot(...direction);
  if(length<1e-8){direction=[0,0,-1];length=1;}
  current=Object.freeze({amount:Math.max(0,Math.min(1,finite(frame.amount))),profile:Math.max(0,Math.min(2,Math.round(finite(frame.profile)))),
    time:Math.max(0,Math.min(1e6,finite(frame.motionTime,finite(frame.time)))),anchor:Object.freeze(vector(frame.anchor,[0,0,0])),
    direction:Object.freeze(direction.map(n=>n/length)),reducedMotion:!!(frame.reducedMotion||frame.reduceFlash)});
  return current;
}
export const stillnessPresentation=()=>current;
export function bindStillnessPresentation(gl,uniform){
  const f=current;
  gl.uniform4f(uniform('uStillnessState'),f.amount,f.profile,f.time,f.reducedMotion?1:0);
  gl.uniform3fv(uniform('uStillnessAnchor'),f.anchor);
  gl.uniform3fv(uniform('uStillnessDirection'),f.direction);
  gl.uniform1f(uniform('uStillnessTreatment'),renderMode==='legacy'?0:renderMode==='relief'?1:2);
}

// Mesh walls use the same treatment as marched walls. Keep authored writing,
// living performers, glazing and small handled objects in their own material.
export function stillnessSurfaceEligible(mesh,material={}){
  const name=String(mesh?.name||mesh||''),label=String(material.materialName||'');
  const sourceArchitecture=mesh?.extras?.sourceContinuation===true||mesh?.extras?.standingTear===true||/^source[-_]/i.test(name);
  if(mesh?.characterAsset||(material.printedSurface&&!sourceArchitecture)||material.portrait||material.vegetationClass||material.alphaCut>0)return false;
  if(/glass|glaz|water|running water|paper|toner|letter|screen|display|portrait|skin|hair|garment|cloth|velvet|upholster|rubber|brass|copper|operator/i.test(label))return false;
  if(/missing-man|quiet-metal|margin|fold|character|skin|garment|stillness-relief|stillness-wall-proxy/i.test(material.materialRole||'')||material.cutTissue||material.tissueSurface)return false;
  if(/(?:^|[-_])head(?:[-_]|$)/i.test(name)&&!/arch_|[-_](?:solid|wall|window|jamb)[-_]/i.test(name))return false;
  if(/(?:^|[-_])(?:pigeon|crow|bird|vigil|character|guard|patron|surfer|operator|hush|body|torso|jacket|trousers|sleeve|arm|finger|boot|shoe|hand|cup|glass|bottle|paper|note|sheet|poster|sign|door|bench|seat|chair|settle|recorder|console|piano|plant|tree|foliage|green|wire|mote|rain|drip|lightning|spark|lamp)(?:[-_]|$)/i.test(name))return false;
  if(/(?:^|[-_])rest[-_](?:body|debris|note|bell|water|cube|settle|bench)/i.test(name))return false;
  return sourceArchitecture||/wall|floor|ceiling|roof|interior|exterior|facade|frontage|elevation|architecture|(?:^|_)arch_|masonry|stone|loggia|alcove|conservatory|building|^source[-_]/i.test(name);
}
