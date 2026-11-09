// Anatomical near-field pressure, submitted into the ordinary P3 colour/depth
// targets before final acquisition. No separate canvas, lens or CSS vignette.
import {assetUrl} from '../platform/paths.js';
import {RECORDING_EMBODIMENT} from '../game/recording-embodiment.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const smooth=n=>{const t=clamp(n);return t*t*(3-2*t);};
export const RECORDING_EMBODIMENT_MESHES=Object.freeze(['recording_pressure_hand_left','recording_pressure_hand_right']);
const DONORS=Object.freeze(['rest_hand_left','rest_hand_right']);
const MATERIAL_REVISION=2;
const pending=new WeakMap();
// Exact distal vertices from the retained GLB, not artist-invented screen grabs.
// The brace delta is the same target sampled by the ordinary character pass.
// Asset SHA634f089a… is verified against these indices in the retained-vertex tests.
export const RECORDING_EMBODIMENT_CONTACTS=Object.freeze([
  Object.freeze({side:'left',mesh:DONORS[0],vertex:1219,
    position:Object.freeze([-.009782000444829464,-.05215999856591225,-.18802599608898163]),
    brace:Object.freeze([0,-.02508700080215931,.03398500010371208]),
    bounds:Object.freeze([Object.freeze([-.067556002,.078899004]),Object.freeze([-.083973,.022893001]),Object.freeze([-.188025997,.050220002])])}),
  Object.freeze({side:'right',mesh:DONORS[1],vertex:1231,
    position:Object.freeze([.009782000444829464,-.05215999856591225,-.18802599608898163]),
    brace:Object.freeze([0,-.02508700080215931,.03398500010371208]),
    bounds:Object.freeze([Object.freeze([-.078899004,.067556002]),Object.freeze([-.083973,.022893001]),Object.freeze([-.188025997,.050220002])])}),
]);
const dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);
const lerp=(a,b,t)=>a+(b-a)*t;
const matrixPoint=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
const positive=(n,fallback)=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):fallback;
const projection=camera=>({tan:positive(camera?.tanHalfFov,.95),
  aspect:positive(camera?.width,1280)/positive(camera?.height,720)});

export function installRecordingEmbodimentMaterials(_gl,pack){
  if(!pack?.catalog||DONORS.some(name=>!pack.catalog.has(name)))return false;
  for(let k=0;k<DONORS.length;k++){
    const original=pack.catalog.get(DONORS[k]),name=RECORDING_EMBODIMENT_MESHES[k];
    if(pack.catalog.get(name)?.recordingDonor===original
      &&pack.catalog.get(name)?.recordingMaterialRevision===MATERIAL_REVISION)continue;
    // Geometry, repaired finger chains and morph targets remain exactly the
    // retained hand asset. Only this pair's receiving material is anonymous.
    // Sharing VAOs does not transfer their resource ownership or mutate skin.
    pack.catalog.set(name,{...original,name,recordingDonor:original,recordingMaterialRevision:MATERIAL_REVISION,
      extras:{...original.extras,recordingEmbodiment:true},
      primitives:original.primitives.map(p=>({...p,
        // Retain the original skin's relative reflectance. The private normal-
        // facing material floor in P3 resolves anatomical planes; it is not a
        // light, white rim or uniform emissive silhouette.
        base:[...(p.base||[.47,.32,.245,1]).slice(0,3).map(v=>v*.7),1],
        emissive:[0,0,0],metallic:0,roughness:.94,
        materialName:'recording-pressure-negative-hand',materialRole:null,portrait:false}))});
  }
  return RECORDING_EMBODIMENT_MESHES;
}

export async function prewarmRecordingEmbodimentMeshes({renderer,props,resolveAsset=assetUrl}={}){
  if(!renderer||!props)return false;
  if(pending.has(props))return pending.get(props);
  const task=(async()=>{
    if(await renderer.r3dBasePropsReady?.()===false)return false;
    let catalog=new Set(props.propMeshCatalog?.()||[]);
    if(DONORS.some(name=>!catalog.has(name))){
      if(typeof props.addCharacterPack!=='function')return false;
      await props.addCharacterPack(resolveAsset(RECORDING_EMBODIMENT.asset),{allowedMeshes:DONORS});
    }
    if(props.installAuthoredPropMeshes?.(installRecordingEmbodimentMaterials)===false)return false;
    catalog=new Set(props.propMeshCatalog?.()||[]);
    return RECORDING_EMBODIMENT_MESHES.every(name=>catalog.has(name));
  })().finally(()=>pending.delete(props));
  pending.set(props,task);return task;
}

export function recordingEmbodimentCameraBasis({eye,yaw=0,pitch=0}={}){
  const position=Array.isArray(eye)||ArrayBuffer.isView(eye)?Array.from(eye):[eye?.x,eye?.y,eye?.z];
  if(position.length!==3||!position.every(Number.isFinite)||!Number.isFinite(yaw)||!Number.isFinite(pitch))return null;
  const c=Math.cos(pitch),right=[Math.cos(yaw),0,Math.sin(yaw)],forward=[Math.sin(yaw)*c,Math.sin(pitch),-Math.cos(yaw)*c],
    up=[-Math.sin(yaw)*Math.sin(pitch),c,Math.cos(yaw)*Math.sin(pitch)];
  return{eye:position,right,forward,up};
}

export function recordingEmbodimentInstances(frame,camera, {zone=0}={}){
  const basis=recordingEmbodimentCameraBasis(camera);
  if(!basis||!frame?.active||!(frame.presence>0))return[];
  const release=smooth(frame.release),dread=frame.reducedDread?.55:1,
    {tan,aspect}=projection(camera),
    phase=String(frame.phase||'approach'),point=(r,u,f)=>basis.eye.map((n,k)=>n+basis.right[k]*r+basis.up[k]*u+basis.forward[k]*f);
  return DONORS.map((_,k)=>{
    const left=k===0,side=left?-1:1,source=frame.hands?.find(h=>h.side===(left?'left':'right')),
      hand=source||{presence:frame.presence,seat:clamp(frame.grip),traction:clamp(frame.pull),brace:clamp(frame.grip)*.82,recoil:0},
      // A fixed peripheral contact in Reduced Motion. Per-press key feedback
      // remains the transport's, not autonomous head/hand movement.
      score=frame.reducedMotion?.48:clamp(frame.performanceProgress??frame.progress??frame.proximity),
      approach=frame.reducedMotion?.40:smooth((score-(left?.10:.18))/(left?.42:.42))*dread,
      seat=frame.reducedMotion?(left?.8:.52):clamp(hand.seat),
      traction=frame.reducedMotion?0:clamp(hand.traction)*dread,
      recoil=frame.reducedMotion?0:clamp(hand.recoil),
      brace=frame.reducedMotion?(left?.27:.21):clamp(hand.brace,0,.52),
      // Distinct diagonal fingers reach inward from behind the brow/temples.
      // Keeping the wrist outside the frame avoids a complete floating glove.
      // Fingers descend from above. Across-digit spread therefore lies along
      // the brow rather than vertically hiding three digits behind the matte.
      roll=left?lerp(-1.22,-1.38,seat)+traction*.05+recoil*.025
        :lerp(1.63,1.30,seat)-traction*.05-recoil*.018,
      tilt=left?.105+traction*.035:-.17-traction*.025,
      rotate=v=>{
        const r=v[0]*Math.cos(roll)-v[1]*Math.sin(roll),u=v[0]*Math.sin(roll)+v[1]*Math.cos(roll);
        return[r*Math.cos(tilt)+v[2]*Math.sin(tilt),u,-r*Math.sin(tilt)+v[2]*Math.cos(tilt)];
      },
      axes=[rotate([0,-side,0]),rotate([0,0,1]),rotate([side,0,0])],
      contact=RECORDING_EMBODIMENT_CONTACTS[k],pad=contact.position.map((v,n)=>v+contact.brace[n]*brace),
      local=pad.map((_,n)=>axes.reduce((sum,axis,j)=>sum+axis[n]*pad[j],0)),
      // Conservative support of the exact relaxed→brace asset envelope. This
      // prevents near-plane slicing for any intervening morph/rotation, rather
      // than accepting a clean screenshot that hides a clipped finger.
      minimumLocalDepth=axes.reduce((sum,axis,j)=>sum+axis[2]*contact.bounds[j][axis[2]>=0?0:1],0),
      targetDepth=Math.max(lerp(1.10,.170,approach),.065-minimumLocalDepth),
      // Start behind the eye, travel outside the temple, then curl into the
      // peripheral view. A frontal glove shrinking toward us would imply an
      // attacker standing in the room ahead. Release reverses this rear path.
      rearApproach=frame.reducedMotion?1:clamp(approach/dread),
      depth=lerp(lerp(-.65,targetDepth,rearApproach),-.65,release),
      padDepth=depth+local[2],
      entrance=smooth((score-(left?.10:.18))/(left?.28:.30)),
      anchor=[lerp(left?.17:.83,left?.25:.76,frame.reducedMotion?1:entrance)
        +(left?-.035:.045)*traction+(left?.006:-.004)*recoil+side*release*.52,
        lerp(left?-.20:-.15,left?.30:.29,frame.reducedMotion?1:entrance)
          +(left?-.025:-.045)*traction-recoil*.004-release*.30],
      // Keep the complete retained envelope outside the frustum as it passes
      // the near plane. It enters only once every vertex has cleared .05m.
      enterView=smooth((depth+minimumLocalDepth-.05)/.015)*smooth((rearApproach-.60)/.40),
      rearLateral=side*((Math.max(0,depth)+.24)*tan*aspect+.24),
      lateral=lerp(rearLateral,(anchor[0]*2-1)*padDepth*tan*aspect-local[0],enterView),
      vertical=lerp(.20,(1-anchor[1]*2)*padDepth*tan-local[1],enterView),position=point(lateral,vertical,depth),
      worldAxis=axis=>basis.eye.map((_,n)=>basis.right[n]*axis[0]+basis.up[n]*axis[1]+basis.forward[n]*axis[2]),
      [x,y,z]=axes.map(worldAxis),matrix=new Float32Array([...x,0,...y,0,...z,0,...position,1]);
    return{id:`recording-pressure-face:${frame.takeId}:${side}`,mesh:RECORDING_EMBODIMENT_MESHES[k],
      x:position[0],y:position[1],z:position[2],matrix,
      character:{morphs:{brace,slack:0},loop:false},
      decorative:true,structural:false,noShadow:true,noReflection:true,zone,
      recordingEmbodiment:true,cullRadius:.5,
      diagnostics:{phase,depth,lateral,vertical,proximity:frame.proximity,release,
        side:contact.side,seat,traction,recoil,roll,tilt,contactVertex:contact.vertex,contactLocal:pad,
        contactAnchor:anchor,minimumLocalDepth,
        rearApproach,enterView,origin:'behind-temples',
        attachment:'resolved-current-eye',additionalLight:false,noiseEvent:false}};
  });
}

// Project the same retained anatomical point rendered above. UV is top-left
// 0..1; pull is a UNIT outward direction, not an unbounded displacement. The
// world compositor owns its amplitude, depth and protected-aperture mask.
export function recordingEmbodimentViewPull(frame,camera){
  const basis=recordingEmbodimentCameraBasis(camera),parts=recordingEmbodimentInstances(frame,camera),
    {tan,aspect}=projection(camera),
    result={active:false,strength:0,phase:String(frame?.phase||'absent'),
      seized:frame?.transport?.phase==='seized',release:clamp(frame?.release),
      left:{anchor:[-.1,-.1],pull:[-1,0],strength:0,seat:0,recoil:0},
      right:{anchor:[1.1,-.1],pull:[1,0],strength:0,seat:0,recoil:0},
      aperture:{minY:.43,centralHalfWidth:.20}};
  if(!basis||parts.length!==2||!frame?.active||frame.reducedMotion)return result;
  for(let k=0;k<parts.length;k++){
    const part=parts[k],side=k===0?'left':'right',world=matrixPoint(part.matrix,part.diagnostics.contactLocal),
      delta=world.map((v,n)=>v-basis.eye[n]),depth=dot(delta,basis.forward),
      anchor=[(1+dot(delta,basis.right)/(depth*tan*aspect))/2,(1-dot(delta,basis.up)/(depth*tan))/2],
      direction=k===0?[-.035,-.025]:[.045,-.045],length=Math.hypot(...direction),
      strength=clamp(frame.viewPull?.[side]?.strength)*(1-smooth(frame.release)),
      visible=depth>.05&&anchor.every(Number.isFinite)&&anchor[0]>=0&&anchor[0]<=1&&anchor[1]>=0&&anchor[1]<=1;
    result[side]={anchor,pull:direction.map(v=>v/length),strength:visible?strength:0,
      seat:part.diagnostics.seat,recoil:part.diagnostics.recoil,sourceVertex:part.diagnostics.contactVertex};
  }
  result.strength=Math.max(result.left.strength,result.right.strength);
  result.active=!!frame.viewPull?.active&&result.strength>0;
  return result;
}
