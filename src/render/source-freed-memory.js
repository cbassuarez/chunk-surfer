// Code retains its authored instance placement after its physical stock leaves.
// Owners supply intact rest props on every call; this module keeps no history,
// graphics objects or camera state, so seeking and entering mid-fall agree.
const descendantMarkers=Object.freeze([':horizon-',':fracture:',':mistake-']);
const deformationKeys=Object.freeze([
  'horizonTide','horizonChip','character','characterPose','characterAnimation',
  'animation','animationTime','animationClock','animationState','clip','clipTime',
  'pose','layers','morph','morphs','morphWeights','deformation','deform',
  'vegetationWind','wind','windPhase','apparitionVariant','portraitIndex','emissive',
  'restDetached','restDrift','restFracture','restPainRattle','restRebuilt',
]);
const named=value=>typeof value==='string'&&value.trim().length>0;
const finiteMatrix=value=>(Array.isArray(value)||ArrayBuffer.isView(value))
  &&value.length===16&&Array.from(value).every(Number.isFinite)&&new Float32Array(value).every(Number.isFinite);
function candidate(part){
  return !!part&&typeof part==='object'&&!part.sourceCodeOnly&&!part.character
    &&!part.playerBody&&part.player!==true&&!part.restBody
    &&!(Number.isFinite(part.paperIndex)&&part.paperIndex>=0)
    &&named(part.id)&&named(part.mesh)&&finiteMatrix(part.matrix);
}
function defaultReleased(_rest,live,{clock}){
  return !live||live.restDetached===true||live.restDrift>0
    ||Number.isFinite(live.horizonTide?.release)&&live.horizonTide.release<=clock;
}
function belongsTo(value,owners){
  if(!named(value))return false;
  if(owners.has(value))return true;
  // A frame can retain hundreds of owners. Resolve a descendant against its
  // bounded id components instead of scanning every owner for every prop.
  for(const marker of descendantMarkers){
    let at=value.indexOf(marker);
    while(at>=0){
      if(at+marker.length<value.length&&owners.has(value.slice(0,at)))return true;
      at=value.indexOf(marker,at+marker.length);
    }
  }
  return false;
}
function ownerGlyph(part,owners){
  return !!part&&typeof part==='object'&&!part.sourceCodeOnly
    &&(belongsTo(part.id,owners)||belongsTo(part.fracturedFrom,owners)||belongsTo(part.restMistakeCarrier,owners));
}
function memoryOf(rest){
  const matrix=new Float32Array(rest.matrix),memory={...rest,
    id:rest.id+':freed-code',matrix,x:matrix[12],y:matrix[13],z:matrix[14],
    sourceCodeOnly:true,sourceCodeDetached:false,sourceCodeMemory:{ownerId:rest.id},
    noShadow:true,noReflection:true,structural:false};
  for(const key of deformationKeys)delete memory[key];
  return memory;
}

/** restProps are canonical intact instances, before degradation or removal.
 * Callbacks receive the original rest/current owner; released replaces the
 * default condition. Physical props retain their order before appended code.
 */
export function sourceFreedMemoryFrame(restProps,liveProps,{clock=0,released=null,eligible=null,limit=512}={}){
  const rest=Array.isArray(restProps)?restProps:[],live=Array.isArray(liveProps)?liveProps:[],
    cap=Number.isFinite(limit)?Math.max(0,Math.floor(limit)):512,
    context={clock:Number.isFinite(clock)?clock:0},release=typeof released==='function'?released:defaultReleased,
    liveById=new Map(),occupied=new Set(),seen=new Set(),memories=[],owners=new Set();
  for(const part of live)if(named(part?.id)){
    occupied.add(part.id);if(!part.sourceCodeOnly&&!liveById.has(part.id))liveById.set(part.id,part);
  }
  let candidates=0,releasedCount=0,omitted=0,skipped=0,detached=0;
  for(const part of rest){
    if(!candidate(part)||seen.has(part.id)||typeof eligible==='function'&&!eligible(part)){skipped++;continue;}
    seen.add(part.id);candidates++;
    if(!release(part,liveById.get(part.id),context))continue;
    releasedCount++;
    // A bounded or colliding memory cannot suppress the owner's live glyphs.
    const id=part.id+':freed-code';
    if(memories.length>=cap||occupied.has(id)){omitted++;continue;}
    const memory=memoryOf(part);memories.push(memory);owners.add(part.id);occupied.add(id);
  }
  const props=live.map(part=>{
    if(!owners.size||!ownerGlyph(part,owners))return part;
    detached++;return part.sourceCodeDetached===true?part:{...part,sourceCodeDetached:true};
  });
  props.push(...memories);
  return{props,memories,diagnostics:{candidates,released:releasedCount,memories:memories.length,detached,omitted,skipped,limit:cap}};
}
