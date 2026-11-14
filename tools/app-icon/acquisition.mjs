// The hero van is photographed by the game's acquisition, not an icon-only
// approximation. Geometry/light remain the caller's; this owns only its passes.
import {createTransparentPixelMesh} from '../../src/render/pixel-mesh/transparent.js';
import {getLookProfile} from '../../src/render/look-profiles.js';
import {PIXEL_MESH_FRAG} from '../../src/render/pixel-mesh/shader.js';
import {screenUniforms} from '../../src/render/pixel-mesh/screens.js';
import {worldLightTreatmentFrame,fineMarkFootprint} from '../../src/render/world-light-treatment.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fingerprint=text=>{let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return `fnv1a32:${(hash>>>0).toString(16).padStart(8,'0')}`;};
const calm=getLookProfile('calm');
const marks=Object.freeze(worldLightTreatmentFrame('marks-only'));
const sharedFragment=PIXEL_MESH_FRAG.replace(/^#version 300 es\s*/,'');
// The full game fragment owns both the VFD source-form branch and acquisition.
// Pure acquisition studies lost the van's lettering and wheels. These two
// bounded hero mixtures let its existing form/colour branch support the ink;
// no raw image is composited over the result. Compact output needs more form.
export const VAN_ICON_ACQUISITION_VARIANTS=freeze({
  detail:{recordingMix:.45,toneAmount:.12},
  ink:{recordingMix:.65,toneAmount:.15},
});
const profileFor=(variant,compact)=>{
  const choice=VAN_ICON_ACQUISITION_VARIANTS[variant];
  return freeze({...calm,id:`van-icon-${variant}${compact?'-compact':''}`,bankId:'calm',
    vfd:{...calm.vfd,cellPx:1,whitePoint:.92,edgeGain:calm.vfd.edgeGain,lineAmount:.48,glow:.06,
      toneAmount:compact?.10:choice.toneAmount},
    recording:{...calm.recording,captureMix:compact?.30:choice.recordingMix,densityGamma:.96,scenePinning:1,
      thresholdNoise:.018,thresholdIrregularity:.40,temporalSmear:0},
  });
};
const heroProfiles=freeze(Object.fromEntries(Object.keys(VAN_ICON_ACQUISITION_VARIANTS).map(variant=>[variant,
  {hero:profileFor(variant,false),compact:profileFor(variant,true)}])));
export const VAN_ICON_ACQUISITION_PROFILE=heroProfiles.detail.hero;
export function vanIconAcquisitionProfile(width=256,height=width,variant='detail'){
  const selected=Object.hasOwn(heroProfiles,variant)?variant:'detail';
  const layout=vanIconAcquisitionLayout(width,height);
  return heroProfiles[selected][layout.lod];
}
export const VAN_ICON_ACQUISITION_PROVENANCE=freeze({
  revision:'hero-vfd-acquisition-mix-4',
  factory:'src/render/pixel-mesh/transparent.js#createTransparentPixelMesh',
  shaderModule:'src/render/pixel-mesh/shader.js',shaderExport:'PIXEL_MESH_FRAG',
  shaderFingerprint:fingerprint(PIXEL_MESH_FRAG),shaderCharacters:PIXEL_MESH_FRAG.length,
  shaderDefine:'SOURCE_DESKTOP_TRANSPARENT',startingProfile:'calm',profile:'van-icon-detail',
  colourResolve:'src/render/pixel-mesh/final-look.js#finalMaterialLightInk (Living Materials)',
  interference:'src/render/pixel-mesh/final-look.js#finalScreenInterference (moire)',
  screen:'crosshatch',fineDetail:'runtime formStipple / luma-edge crossover',
  coverage:'separate real scene alpha; premultiplied output',depth:'inverse real orthographic/perspective projection',
  toneMapping:'linear scene → ACES/exposure → sRGB → runtime acquisition, once',
  temporalMemory:false,pressureFinish:false,externalRawOverlay:false,pureOneBit:false,
  recordingMode:'hero mix of game VFD/acquisition; variant and output dependent',
  variants:VAN_ICON_ACQUISITION_VARIANTS,compactPolicy:{belowPixels:64,recordingMix:.30,toneAmount:.10},
  markPolicy:'src/render/world-light-treatment.js (marks-only)',
  screenPhase:'existing continuous held runtime phase, not floor(world*3.1)',
  fineRank:'runtime blueNoise / fineMarkFootprint in output pixels',
  tonePolicy:'recording capture uses real broad source luma and densityGamma; VFD whitePoint shapes the supporting form/colour branch',
});

function extent(value,fallback=256){return Number.isFinite(value)&&value>0?Math.max(1,Math.min(4096,Math.round(value))):fallback;}
// Screen period is always expressed in final output pixels. Compact icons use
// the same screen at its existing 4.25px tight spacing, not a downsampled 1024px
// hatch. The source geometry and acquisition both render at this exact size.
export function vanIconAcquisitionLayout(width=256,height=width){
  const w=extent(width),h=extent(height,w),compact=Math.min(w,h)<64;
  return Object.freeze({width:w,height:h,dpr:1,sceneScale:1,cellScale:1,
    screen:'crosshatch',screenScale:compact?4.25/screenUniforms('crosshatch').periodPx:1,
    screenPeriodPx:compact?4.25:screenUniforms('crosshatch').periodPx,lod:compact?'compact':'hero'});
}
function sceneParticipation(scene){
  const materials=new Set(),names=new Set();let meshes=0,sprites=0,paintMeshes=0,weatherMeshes=0;
  scene?.traverse?.(object=>{
    if(!object.isMesh&&!object.isSprite)return;
    for(let parent=object;parent;parent=parent.parent)if(parent.visible===false)return;
    if(object.isSprite)sprites++;else meshes++;
    if(/rain|thunder|weather/i.test(object.name||''))weatherMeshes++;
    const list=Array.isArray(object.material)?object.material:[object.material];let painted=false;
    for(const material of list)if(material){materials.add(material);names.add(material.name||material.type||'unnamed');
      if(/owner paint|albion|union.flag/i.test(material.name||''))painted=true;}
    if(painted)paintMeshes++;
  });
  return{meshes,sprites,paintMeshes,weatherMeshes,materialCount:materials.size,materialNames:[...names].sort()};
}

export function createVanIconAcquisition(THREE,renderer){
  // Resolve from this module, not the review page's nested document base.
  // The generic transparent pass predates the ordinary world's revised mark
  // uniforms. Supply those EXISTING runtime inputs only on its full post
  // material, through a facade; never patch the caller's renderer or shader.
  let markUploads=0;
  const render=(scene,camera)=>{
    const material=scene?.children?.[0]?.material;
    if(material?.isRawShaderMaterial&&material.defines?.SOURCE_DESKTOP_TRANSPARENT===1
      &&material.fragmentShader===sharedFragment){
      const set=(name,value)=>{if(material.uniforms[name])material.uniforms[name].value=value;else material.uniforms[name]={value};};
      set('uWorldLightTreatment',marks.level);
      set('uFineMarkPx',fineMarkFootprint(VAN_ICON_ACQUISITION_PROFILE.vfd.cellPx));
      markUploads++;
    }
    return renderer.render(scene,camera);
  };
  const facade=new Proxy(renderer,{get(target,key){
    if(key==='render')return render;
    const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});
  const pass=createTransparentPixelMesh(THREE,facade,{
    assetUrl:path=>new URL('../../'+String(path).replace(/^\/+/,''),import.meta.url).href,
    profile:VAN_ICON_ACQUISITION_PROFILE,pressureFinish:false,
  });
  let disposed=false,prepared=false,lastLayout=null,lastSnapshot=null,participation=null,cameraType=null,
    lastProfile=VAN_ICON_ACQUISITION_PROFILE,lastVariant='detail';
  const ready=pass.ready.then(ok=>{prepared=ok!==false&&!disposed;return prepared;});
  return{
    ready,
    render(scene,camera,{width=256,height=width,time=0,reducedMotion=false,reduceFlash=false,variant='detail'}={}){
      if(disposed||!prepared)return false;
      const layout=vanIconAcquisitionLayout(width,height),snapshot={clock:Number.isFinite(time)?Math.max(0,time):0,
        reducedMotion:!!reducedMotion,reduceFlash:!!reduceFlash,audio:0,fear:0};
      const selected=Object.hasOwn(heroProfiles,variant)?variant:'detail',profile=vanIconAcquisitionProfile(layout.width,layout.height,selected);
      const rendered=pass.render(scene,camera,{...layout,profile,
        stageHeight:layout.height,cellSize:'auto',screenOffset:[0,0],worldUnitScale:1,snapshot});
      if(rendered){lastLayout=layout;lastSnapshot=snapshot;lastProfile=profile;lastVariant=selected;participation=sceneParticipation(scene);cameraType=camera.type||'Camera';}
      return rendered;
    },
    debug:()=>({...pass.debug(),ready:prepared,disposed,cameraType,provenance:VAN_ICON_ACQUISITION_PROVENANCE,
      profilePolicy:lastProfile,variant:lastVariant,layout:lastLayout,snapshot:lastSnapshot,participation,
      marks:{...marks,fineMarkPx:fineMarkFootprint(VAN_ICON_ACQUISITION_PROFILE.vfd.cellPx),uploads:markUploads},
      sourceTone:{exposure:renderer.toneMappingExposure,recordingInput:'real broad source luma',
        formColourInput:'existing game VFD branch',
        densityGamma:lastProfile.recording.densityGamma,blackFloor:lastProfile.recording.blackFloor,
        supportingVfdWhitePoint:lastProfile.vfd.whitePoint,recordingMix:lastProfile.recording.captureMix,
        supportingVfdToneAmount:lastProfile.vfd.toneAmount},
      branches:{crosshatch:true,fineDetailStipple:true,livingMaterials:true,moire:true,
        realDepth:true,transparentCoverage:true,continuousRuntimeScreenPhase:true,pixelSizedFineRank:true,sourceBlueprint:false,pressureCosmos:false,temporalMemory:false},
      validation:'CPU contract only until an actual GPU export is inspected'}),
    dispose(){if(disposed)return;disposed=true;prepared=false;pass.dispose();},
  };
}
