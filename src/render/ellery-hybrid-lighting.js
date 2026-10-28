// Sources are paired with the three small physical diffusers in the dedicated
// public-front model. Positions are physical metres; directions point OUT.
// Nothing changes ambient exposure or the building's emergency circuit.
const emitter = value => Object.freeze({
  ...value,
  color:Object.freeze(value.color),direction:Object.freeze(value.direction),
  penetration:0,spilling:false,kind:'fitting',circuit:null,
  powerMode:'external',maintained:false,castsShadow:false,
});

export const ELLERY_HYBRID_LIGHTS=Object.freeze([
  emitter({id:'ellery-hybrid-canopy-entrance',x:79,y:4.096,z:1.95,
    color:[1,.77,.51],intensity:1.08,radius:6.4,
    direction:[0,-.97,.24],coneOuterCos:.70,coneInnerCos:.91}),
  emitter({id:'ellery-hybrid-canopy-window',x:86.4,y:3.786,z:1.95,
    color:[1,.89,.74],intensity:.56,radius:4.8,
    direction:[0,-.88,.47],coneOuterCos:.68,coneInnerCos:.90}),
  emitter({id:'ellery-hybrid-canopy-relief',x:79,y:4.302,z:2.42,
    color:[1,.75,.47],intensity:1.3,radius:5.2,
    direction:[0,.992,.124],coneOuterCos:.88,coneInnerCos:.96}),
]);

// A W3 outlook can include real outdoor fixtures when the pack is ready. The
// active room rig comes first, including emergencies; only genuinely unused
// renderer slots can carry the outside sources. Select against the aperture,
// not the listener 25 metres away in the greenhouse.
export function selectW3OutlookLights({window=null,ready=false,local=[],exterior=[],maxLights=12}={}){
  if(!ready||window?.id!=='W3-foyer-north'||!window.physical||!Array.isArray(local))return local;
  const budget=Number.isFinite(maxLights)?Math.max(0,Math.min(12,Math.floor(maxLights))):0;
  const available=Math.min(2,Math.max(0,budget-local.length));
  if(!available)return local;
  const seen=new Set(local.map(light=>light?.id).filter(Boolean));
  const center=(window.physical.from+window.physical.to)/2,plane=window.physical.plane;
  if(!Number.isFinite(center)||!Number.isFinite(plane))return local;
  const choices=[];
  for(const light of Array.isArray(exterior)?exterior:[]){
    if(!light||typeof light.id!=='string'||seen.has(light.id)||
       ![light.x,light.y,light.z,light.intensity,light.radius].every(Number.isFinite)||
       light.intensity<=0||light.radius<=0)continue;
    // Accept only the actual civic frontage's fittings, not arbitrary sources.
    if(!light.id.startsWith('ellery-public-entrance-lamp-')&&!light.id.startsWith('ellery-hybrid-canopy-'))continue;
    seen.add(light.id);choices.push(light);
  }
  choices.sort((a,b)=>{
    const da=(a.x-center)**2+(a.z-plane)**2,db=(b.x-center)**2+(b.z-plane)**2;
    return da-db||(a.id<b.id?-1:a.id>b.id?1:0);
  });
  return choices.length?[...local,...choices.slice(0,available)]:local;
}
