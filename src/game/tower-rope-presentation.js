const TENOR_PART=/^tower-rope-(?:upper|sally|tail|guide)-8$/;
const AUTOMATIC_STATIC=/^tower-rope-[1-7]$/;
const RUNTIME_ROPE=/^tower-rope-(?:upper|sally|tail|guide)-(\d)$/;
const GUIDANCE_EMISSIVE=Object.freeze([1,.52,.12,.62]);

export function presentTowerRuntimeInstances(instances,{tenorRopeTaken=false,activeBells=null,highlightTenor=false}={}){
  const active=activeBells?new Set(activeBells):null;
  const out=[];
  for(const instance of instances||[]){
    const id=String(instance?.id||''),match=id.match(RUNTIME_ROPE),bell=match?Number(match[1]):null;
    const tenorPart=TENOR_PART.test(id);
    if(tenorPart&&!tenorRopeTaken)continue;
    if(bell&&active&&!active.has(bell))continue;
    let presented=instance;
    if(tenorPart&&instance.mesh==='tower_rope_sally')presented={...instance,mesh:'tower_rope_sally_tenor'};
    else if(tenorPart&&instance.mesh==='tower_rope_tail')presented={...instance,mesh:'tower_rope_tail_tenor'};
    if(tenorPart&&highlightTenor)presented={...presented,emissive:GUIDANCE_EMISSIVE};
    out.push(presented);
  }
  return out;
}

export function hideStaticTowerRope(instance,{live=false,tenorRopeTaken=false}={}){
  if(!live)return false;
  const id=String(instance?.id||'');
  return AUTOMATIC_STATIC.test(id)||(tenorRopeTaken&&id==='tower-rope-8');
}
