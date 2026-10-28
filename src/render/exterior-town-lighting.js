// Outdoor-only admission into the existing twelve-source renderer budget.
// Callers resolve power, visibility and actual fixture poses before selection.
// This function does not brighten, animate or create a source.
const MAX_TOWN_LIGHTS=12;
const finitePosition=light=>light&&typeof light==='object'
  &&typeof light.id==='string'&&light.id.length>0
  &&[light.x,light.y,light.z].every(Number.isFinite);
const finiteOrigin=value=>Number.isFinite(value)?value:0;
const idOrder=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const unique=lights=>{
  const seen=new Set();
  return(Array.isArray(lights)?lights:[]).filter(light=>{
    if(!finitePosition(light)||seen.has(light.id))return false;
    seen.add(light.id);return true;
  });
};

// W3 borrows two real rooms. Keep one maintained foyer fitting and one
// greenhouse fitting visible across their own thresholds, without borrowing
// an emergency actor, restoring a dead circuit or inventing a camera fill.
export function selectFoyerWindowLights({foyer=[],court=[],window=null}={}){
  if(window?.id!=='W3-foyer-north')return[];
  const exit=unique(foyer).find(light=>light.id==='atrium-main-exit');
  const p=window.physical,cx=(p.from+p.to)/2;
  const greenhouse=unique(court).filter(light=>light.id.startsWith('glass-court-'))
    .sort((a,b)=>Math.abs(a.x-cx)-Math.abs(b.x-cx)||idOrder(a,b))[0];
  return[exit,greenhouse].filter(Boolean);
}

export function selectExteriorTownLights({ordinary=[],traffic=[],van=null,
  entrance=[],borrowed=[],road=[],origin={},maxLights=12}={}){
  const budget=Number.isFinite(maxLights)
    ?Math.max(0,Math.min(MAX_TOWN_LIGHTS,Math.floor(maxLights))):0;
  if(!budget)return[];
  const ox=finiteOrigin(origin?.x),oz=finiteOrigin(origin?.z);
  // Planar distance matches the existing street-light/headlight selector: the
  // caller supplies an X/Z listener point, and overhead height is not a penalty.
  const distance=light=>(light.x-ox)**2+(light.z-oz)**2;
  const nearest=lights=>lights.sort((a,b)=>distance(a)-distance(b)||idOrder(a,b));
  const selected=[],seen=new Set();
  const admit=light=>{
    if(selected.length>=budget||!finitePosition(light)||seen.has(light.id))return false;
    selected.push(light);seen.add(light.id);return true;
  };
  if(finitePosition(van))admit(van);
  const borrowedCandidates=unique(borrowed),borrowedIds=new Set(borrowedCandidates.map(light=>light.id));
  // Reserve at most two visible greenhouse fixtures. Duplicate appearances in
  // ordinary arrays cannot admit a third borrowed fixture through another path.
  for(const light of nearest(borrowedCandidates.filter(light=>!seen.has(light.id))).slice(0,2))admit(light);
  const candidates=unique([
    ...(Array.isArray(ordinary)?ordinary:[]),...(Array.isArray(traffic)?traffic:[]),
    ...(Array.isArray(entrance)?entrance:[]),...(Array.isArray(road)?road:[]),
  ]).filter(light=>!seen.has(light.id)&&!borrowedIds.has(light.id));
  for(const light of nearest(candidates)){if(selected.length>=budget)break;admit(light);}
  // Original objects retain all circuit, maintained, emergency, direction,
  // cone, colour and intensity fields. No source array or source is mutated.
  return selected;
}
