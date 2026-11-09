import {CAB_LIGHT_GLSL} from './cab-light.js';
import { SOURCE_DEMOLITION_GEOMETRY } from '../data/generated/source-demolition-geometry.js';
/* THRESHOLD_GAG_APPARITION_IMPORT_BEGIN */
import {THRESHOLD_GAG_APPARITION_VERTEX_GLSL,THRESHOLD_GAG_APPARITION_FUNCTIONS_GLSL,THRESHOLD_GAG_APPARITION_FRAGMENT_GLSL} from './threshold-gag-apparition.js';
/* THRESHOLD_GAG_APPARITION_IMPORT_END */
import { createPropRangeController } from './prop-range.js';
import {SOURCE_REST_HORIZON_TIDE_GLSL,writePropHorizonTide,sourceRestHorizonTideUniforms} from './source-rest-horizon-pass.js';
import {NATATORIUM_METRIC_GLSL,NATATORIUM_METRIC_IDENTITY,normalizeNatatoriumMetric,natatoriumMetricUniform,natatoriumMetricPoint} from './natatorium-metric.js';
import {CURVED_SPACE_GLSL,CURVED_SPACE_OFF,curvedSpaceUniforms} from './curved-space.js';
import { LOCAL_LIGHT_CONE_GLSL } from './local-light-cone.js';
import { DIPPED_BEAM_GLSL } from './dipped-beam.js';
import { resolveTorchFrame, normalizeTorchOptics, TORCH_OPTICS_GLSL } from './torch-optics.js';
import { APPARITION_GORE_FIELD_GLSL, APPARITION_GLINT_GLSL } from './apparition-gore.js';
import { PUB_FRONT_SKY_GLSL, PUB_FASCIA_PAINT_GLSL, pubFrontSkyEligible, pubFrontFasciaEligible } from './pub-front-material.js';
// GLB prop pass for the first-person renderer. Architecture remains the sector
// raymarcher; meshes render into colour + depth first, and r3d.js composites
// whichever surface is actually nearer to the camera.

// Use the floorplan's outdoor-zone contract for the mesh sky hemisphere too.
import { PROP_INSTANCE_FLOATS, PROP_INSTANCE_BINDINGS, writePropInstanceFlags, propPoweredMaterialScale } from './prop-instance-layout.js';
import {RECORDING_HAND_MATERIAL_GLSL} from './recording-hand-material.js';
import { ZONE, OUTDOOR_ZONES } from '../data/floorplan/legend.js';
import { PAPER_ATLAS_HANDLING } from '../generated/paper-catalog.js';
import { PAPER_PIGMENT_SURFACE } from '../data/paper-pigment.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { CHARACTER_LIMITS, CHARACTER_DEFORM_GLSL, parseCharacterAsset, sampleCharacterPose } from './character-asset.js';
import { installDivideMeshes } from './source-divide-meshes.js';
import { cameraBasis } from './camera-basis.js';
import { installReceptionMeshes } from './source-last-reception-meshes.js';
import { installTowerPersonalMeshes } from './tower-personal-meshes.js';
import { installAcademicPopulationSocialMeshes } from './academic-society-characters.js';
import { installAcademicGalleryPAMeshes } from './academic-gallery-pa.js';
import { ACADEMIC_ATRIUM_LIGHT_GLSL, academicAtriumHollowKind } from './academic-atrium-light.js';
import { realmCameraPosition, homeRealmAcquisition } from './realm-pocket-geometry.js';
import { createRealmEyeInterpolator } from './realm-eye.js';
import { FIRE_ESCAPE_INK_GLSL } from './fire-escape-ink.js';
import { SOURCE_CHUNK_ERROR_GLSL } from './source-material-finish.js';
import { SOURCE_WALKWAY_MARK_GLSL } from './source-walkway-finish.js';
import {SOURCE_CODE_LIFT_METRES,sourceCodeMaterialEligible,sourceCodePhysicalLifts,sourceCodeTextEligible,sourceCodeStock,sourceCodeTargetSize,
  SOURCE_CODE_PHYSICAL_FRAG,SOURCE_CODE_TEXT_FRAG,SOURCE_CODE_COMPOSITE_VERT,SOURCE_CODE_COMPOSITE_FRAG} from './source-code-screen.js';
import {sourceRestFacultyUniforms} from './source-rest-faculties.js';
import {sourceExecutionParameters} from './source-execution-trails.js';
import { ROOF_SURFACE_INK_GLSL, ROOF_GLASS_INK_GLSL } from './roof-surface-ink.js';
import { PRINTED_SURFACE_GLSL, printedSurfaceDescriptor, PRINTED_SURFACE_POLARITY } from './printed-surface.js';
import { PROP_MATERIAL_GLSL, propMaterialFactors, letteringFinishDescriptor, tissueSurfaceDescriptor, propTextureWrap } from './prop-material-contract.js';
import { ensureWorldLetteringFonts } from './world-lettering-fonts.js';
import { sourceTextAtlasCacheKey, planSourceTextAtlas, paintSourceTextAtlas, sourceTextQuadMatrix } from './source-text-atlas.js';
import { ROOF_WATCHERS } from '../data/roof-watchers.js';
import { stepRoofWatcherPerformance } from './roof-watcher-performance.js';
import { academicGalleryMesh } from '../data/academic-gallery-treatment.js';
import { ELLERY_COURTYARD_SKY } from '../data/ellery-courtyard-architecture.js';
import { stBrendansTreatmentMesh, ST_BRENDANS_TREATMENT_MESH_NAMES } from '../data/st-brendans-treatment.js';
import { ST_BRENDANS_PRESENCE_MESH } from '../data/st-brendans-presences.js';
import { viewFrustum, sphereInView, quadInView } from './view-frustum.js';
import { includePositionBounds, propBoundsInView } from './prop-frustum-culling.js';
import { deferGlProgram } from './deferred-gl-program.js';
import { MISSING_MAN_MATERIAL_GLSL } from './missing-man-material.js';
import { GLASS_COURT_PANE_RAIN_GLSL } from './glass-court-weather.js';
import {STILLNESS_FACES_GLSL} from './stillness-faces.js';
import {STILLNESS_RELIEF_PROXY_GLSL} from './stillness-relief-contract.js';
import {updateStillnessReliefMeshes,stillnessReliefDiagnostics,releaseStillnessReliefMeshes} from './stillness-relief.js';
import {bindStillnessPresentation,stillnessPresentation,stillnessSurfaceEligible} from './stillness-presentation.js';
import {SOURCE_SURROUNDINGS_VISIBILITY_GLSL,normalizeSourceSurroundingsGate,sourceSurroundingsPrimitiveSide} from './source-surroundings-visibility.js';
import {SOURCE_SURROUNDINGS_PRESSURE_GLSL,encodeSourceSurroundingsPressure} from './source-surroundings-pressure.js';
import {HUSH_COSMOS_GLSL} from './hush-cosmos.js';
import {SOURCE_MESH_PORTAL_CLIP_GLSL,portalClipArray,portalExcludeArray,portalBatchKey,portalInverse} from './source-mesh-portals.js';

const VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
layout(location=7) in vec4 aInstanceFlags;
layout(location=8) in float aDressingZone;
#define aZone aInstanceFlags.x
#define aPortrait aInstanceFlags.y
#define aStructural aInstanceFlags.z
layout(location=10) in vec4 aEmissive;
layout(location=11) in float aPaperIndex;
layout(location=12) in vec4 aPaperHandling;
#define aFixturePower aInstanceFlags.w
${CHARACTER_DEFORM_GLSL}
uniform mat4 uView,uProj;
uniform float uSourceCodeLift;
${NATATORIUM_METRIC_GLSL}
${CURVED_SPACE_GLSL}
uniform vec3 uWorldPatternOffset;
uniform float uTimeSec,uReducedMotion;
${SOURCE_SURROUNDINGS_PRESSURE_GLSL}
// x amplitude metres, y frequency Hz, z local anchor height, w affected height.
uniform vec4 uVegetationWind;
${SOURCE_REST_HORIZON_TIDE_GLSL}
out float vRestHorizonGone;
out vec3 vWorld,vNormal,vSourceSurroundingsRestWorld,vSourceSurroundingsLocal;out vec2 vUv;out float vLocalHeight;flat out int vZone;flat out int vPortrait;flat out int vStructural;flat out vec4 vEmissive;flat out int vPaperIndex;flat out vec4 vPaperHandling;flat out float vFixturePower;
void main(){
  mat4 m=mat4(aM0,aM1,aM2,aM3);vec3 local=aPos,localNormal=aNormal;deformCharacter(local,localNormal);int paper=int(floor(aPaperIndex+.5));
  if(paper>=0){
    float u=aUv.x,v=aUv.y;float disp=.00055*sin(3.14159265*u)*sin(3.14159265*v)+.00065*pow(abs(u-.5)*2.0,3.0);
    if(aPaperHandling.x>=0.0)disp+=exp(-abs(v-aPaperHandling.x)*92.0)*aPaperHandling.y*.0012;
    disp+=smoothstep(.62,1.0,u)*smoothstep(.62,1.0,v)*aPaperHandling.z*.0028;
    local+=aNormal*disp;
  }
  // Only the first-shore release loses its original anatomy. Its initial
  // trace still fits the measured opening; density rises after leaving it.
  if(aPortrait>13.5&&aPortrait<14.5){
    float unravel=smoothstep(.18,.42,aEmissive.a);
    float h=clamp(local.y/1.8,0.0,1.0),seed=dot(aM3.xz+uWorldPatternOffset.xz,vec2(.19,.31));
    local.x+=unravel*(.15*sin(local.y*6.3+seed)+.32*h*h);
    local.z*=1.0-.72*unravel;
    local.y+=unravel*.42*h*h;
  }
  vec4 w=m*vec4(local,1.0);
/* THRESHOLD_GAG_APPARITION_VERT_BEGIN */
  ${THRESHOLD_GAG_APPARITION_VERTEX_GLSL}
  w=m*vec4(local,1.0);
/* THRESHOLD_GAG_APPARITION_VERT_END */
  vSourceSurroundingsRestWorld=w.xyz;vSourceSurroundingsLocal=local;
  w.xyz+=sourceSurroundingsPressureDisplacement(local,w.xyz,mat3(m));
  // With no light the apparition changes the silhouette by millimetres, like
  // an unstable pressure boundary. Reduced motion keeps the field still.
  if(aPortrait>11.5&&aPortrait<12.5&&uReducedMotion<.5){
    float breath=sin(uTimeSec*1.7+local.y*13.0+(w.x+uWorldPatternOffset.x)*2.3+(w.z+uWorldPatternOffset.z)*1.9);
    w.xz+=vec2(breath,-breath)*.006;
  }
  float windHeight=clamp((local.y-uVegetationWind.z)/uVegetationWind.w,0.0,1.0);
  float windActive=(1.0-uReducedMotion)*step(.00001,uVegetationWind.x);
  float windPhase=uTimeSec*uVegetationWind.y*6.2831853+dot(w.xz+uWorldPatternOffset.xz,vec2(.173,.219));
  float windWave=sin(windPhase)+sin(windPhase*.47+1.9)*.34;
  w.xz+=vec2(windWave,sin(windPhase*.73+.8))*(uVegetationWind.x*windHeight*windHeight*windActive);
  // A released Source II piece follows the horizon's infall per vertex.
  vec3 worldNormal=normalize(transpose(inverse(mat3(m)))*localNormal);vRestHorizonGone=0.0;
  if(aPaperIndex<-.5&&aPaperHandling.x<-1.5)vRestHorizonGone=restHorizonTide(w.xyz,worldNormal,aM3.xyz,aPaperHandling);
  w.xyz+=worldNormal*uSourceCodeLift;
  vWorld=w.xyz;vNormal=worldNormal;vUv=aUv;vLocalHeight=local.y;vZone=int((aDressingZone>0.0?aDressingZone-1.0:aZone)+.5);vPortrait=int(aPortrait+.5);vStructural=int(aStructural+.5);vEmissive=aEmissive;vPaperIndex=aNormal.y>.5?paper:-1;vPaperHandling=aPaperHandling;vFixturePower=aFixturePower;gl_Position=uProj*uView*vec4(natatoriumMetricPoint(w.xyz),w.w);
  if(uCurvedSpace.x!=0.0)gl_Position=uProj*uView*vec4(curvedSpacePoint(w.xyz,aM3.xyz),w.w);
}`;

// The acquisition renderer's existing line-field contract: density, doubled
// grain angle in a dominant surface plane, then that plane's identity. A flat
// untextured material has no derived engraving and writes the zero sentinel.
const SURFACE_MARK_GLSL=`
vec4 packSurfaceMark(vec3 normal,vec3 grain,float density,float coherence){
  vec3 n=abs(normal);float plane=n.y>=max(n.x,n.z)?0.0:n.x>n.z?.5:1.0;
  vec2 direction=plane<.25?grain.xz:plane<.75?grain.zy:grain.xy;
  float size=length(direction);direction=size>.0001?direction/size:vec2(1.0,0.0);
  vec2 doubled=vec2(direction.x*direction.x-direction.y*direction.y,2.0*direction.x*direction.y)*clamp(coherence,0.0,1.0);
  return vec4(density,doubled*.5+.5,plane);
}`;

const FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal,vSourceSurroundingsRestWorld,vSourceSurroundingsLocal;in vec2 vUv;in float vLocalHeight;flat in int vZone;flat in int vPortrait;flat in int vStructural;flat in vec4 vEmissive;flat in int vPaperIndex;flat in vec4 vPaperHandling;flat in float vFixturePower;
uniform vec4 uDriveHeadlight,uDriveInspection[2];uniform float uDriveSurface,uDriveInterior,uDriveWetRoad,uDriveWetSurface,uDriveTissue;
${CAB_LIGHT_GLSL}
uniform vec2 uTissueSurface;
uniform float uPubFrontSky,uPubFasciaPaint;
// Only the incompatible arrival returns emerge through night extinction.
// Ordinary materials, depth, lighting and the final dither keep their contract.
uniform vec2 uOutskirtsFold;
uniform vec3 uTorchOrigin,uTorchRight,uTorchUp;
uniform vec3 uEye,uForward,uBase,uMaterialEmissive,uZoneTint[${Math.max(...Object.values(ZONE))+1}];uniform float uLight,uAlphaCut,uBaseAlpha;uniform sampler2D uTex,uNormalTex,uOrmTex,uFogTex;uniform float uUseTex,uUseNormal,uUseOrm,uMetallic,uRoughness,uNormalScale,uAoStrength,uFogSize,uCellMeters;uniform vec2 uFogOrigin;
// Street surfaces laid onto untextured props by world position (outskirts only):
// the opening street's own albedo and ORM, blended over three axes.
uniform float uStreetTex,uStreetOrmEnabled,uStreetScale,uStreetMix,uStreetRoughnessFactor,uPayphoneCast,uLetteringFinish;
uniform vec3 uWorldPatternOffset;
// x class (1 leaf, 2 stem, 3 dead leaf, 4 soil, 5 stone), y thin-leaf
// transmission, z rain wetness, w reserved.
uniform vec4 uVegetation;
uniform vec3 uTorchColor,uAmbientColor;uniform float uTorchReach,uTorchSpill,uTorchShoulder,uAmbientIntensity,uSkyExposed;uniform vec2 uTorchCone;
uniform int uLocalLightCount,uLocalShadowIndex;uniform vec4 uLocalLightPos[12],uLocalLightColor[12];uniform float uLocalLightPenetration[12];
// See reserveEmergencyRed in r3d.js: red belongs to the emergency circuit, and
// props must reserve it on the same terms as the architecture or a red chair
// sits in the auditorium glowing like a fitting.
uniform float uLocalLightEmergency[12];
${LOCAL_LIGHT_CONE_GLSL}
${DIPPED_BEAM_GLSL}
vec3 reserveEmergencyRed(vec3 shaded,float emergencyShare){
  float redness=(shaded.r-max(shaded.g,shaded.b))/max(shaded.r,1e-4);
  float claim=smoothstep(.55,.84,redness);
  float backing=clamp(emergencyShare*4.0,0.0,1.0);
  float grey=dot(shaded,vec3(.2126,.7152,.0722));
  return mix(shaded,vec3(grey),claim*(1.0-backing));
}
uniform sampler2D uPlanTex;uniform vec2 uPlanSize,uPlanOrigin;uniform float uPlanReady;
uniform sampler2D uPortraitAtlas;uniform float uUsePortrait;
uniform sampler2D uPaperAtlas;uniform float uUsePaperAtlas;uniform vec2 uPaperAtlasGrid;
uniform sampler2D uPaperMaterial;uniform float uUsePaperMaterial,uPaperHeightRangeM;uniform vec2 uPaperMaterialTexel;
uniform sampler2D uShadowTex;uniform mat4 uShadowMatrix;uniform float uShadowReady;uniform vec2 uShadowTexel;
uniform float uSourceRoomLighting,uRenFold,uQuietFireEscape,uRoofSurface,uRoofGlass;
uniform float uSourceChunkError;
uniform float uSourceWalkway;
uniform float uSourceCodeClean;
uniform vec3 uSourceCodeStock;
uniform float uAcademicHollow;
uniform float uMissingManCore,uMissingManSmoke,uFountainWater;
// x ink polarity, y solid pigment instead of texture coverage, z lamp mask.
uniform vec3 uPrintedSurface;
uniform float uPrintedAreaCoverage;
${SOURCE_MESH_PORTAL_CLIP_GLSL}
uniform vec4 uExteriorClipPlane,uExteriorPortalA;
uniform vec3 uExteriorPortalB;
uniform int uSourceSurroundingsSide;
uniform vec4 uSourceSurroundingsGate;
uniform vec3 uSourceSurroundingsGateFrame;
uniform float uTimeSec,uReducedMotion;
${SOURCE_SURROUNDINGS_PRESSURE_GLSL}
layout(location=0) out vec4 o;
layout(location=2) out vec4 oSurfaceMarks;
${SURFACE_MARK_GLSL}
${RECORDING_HAND_MATERIAL_GLSL}
/* THRESHOLD_GAG_APPARITION_FUNCTIONS_BEGIN */
${THRESHOLD_GAG_APPARITION_FUNCTIONS_GLSL}
/* THRESHOLD_GAG_APPARITION_FUNCTIONS_END */
${ACADEMIC_ATRIUM_LIGHT_GLSL}
${FIRE_ESCAPE_INK_GLSL}
${SOURCE_CHUNK_ERROR_GLSL}
${ROOF_SURFACE_INK_GLSL}
${ROOF_GLASS_INK_GLSL}
${PRINTED_SURFACE_GLSL}
${SOURCE_WALKWAY_MARK_GLSL}
${MISSING_MAN_MATERIAL_GLSL}
${TORCH_OPTICS_GLSL}
${PROP_MATERIAL_GLSL}
${STILLNESS_FACES_GLSL}
${STILLNESS_RELIEF_PROXY_GLSL}
uniform float uStillnessEligible;
uniform float uStillnessWallProxy,uStillnessProxyMaterial;
${PUB_FRONT_SKY_GLSL}
${GLASS_COURT_PANE_RAIN_GLSL}
float flashlightShadow(vec3 world,vec3 normal,vec3 lightDir){
  if(uShadowReady<.5)return 1.0;
  vec4 clip=uShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 1.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
  float bias=max(.00018,.00115*(1.0-max(dot(normal,lightDir),0.0))),visible=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(vec2(float(x),float(y))-.5)*uShadowTexel;visible+=q.z-bias<=texture(uShadowTex,q.xy+tap).r?1.0:0.0;}
  return mix(.20,1.0,visible*.25);
}
${APPARITION_GORE_FIELD_GLSL}
${APPARITION_GLINT_GLSL}
// The wide, leaky twin that feathers the apparition — see the long note on
// propFlashHalo in r3d.js, including why this is a depth-GAP test and not a
// scaled bias. A scaled bias makes a slanted surface shadow itself over its
// whole area; a gap test cannot, because slope is a small depth difference and a
// body standing in front of a wall is a large one.
const float HALO_GAP=.00042;
float flashlightHalo(vec3 world,vec3 normal,vec3 lightDir){
  if(uShadowReady<.5)return 0.0;
  vec4 clip=uShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 0.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 0.0;
  float blocked=0.0;
  for(int i=0;i<12;i++){
    float angle=float(i)*.5236,ring=i<6?8.0:18.0;
    vec2 tap=vec2(cos(angle),sin(angle))*ring*uShadowTexel;
    blocked+=q.z-texture(uShadowTex,q.xy+tap).r>HALO_GAP?1.0:0.0;
  }
  return blocked/12.0;
}
float architecturalLightVisibility(vec3 fromM,vec3 toM){
  if(uPlanReady<.5)return 1.0;
  float distanceM=length(toM-fromM);int checks=int(clamp(ceil(distanceM),1.0,8.0));
  for(int i=1;i<8;i++){
    if(i>=checks)break;
    vec3 q=mix(fromM,toM,float(i)/float(checks));
    ivec2 local=ivec2(floor(q.xz/uCellMeters))-ivec2(uPlanOrigin);
    if(local.x<0||local.y<0||local.x>=int(uPlanSize.x)||local.y>=int(uPlanSize.y))return .16;
    int flags=int(texelFetch(uPlanTex,local,0).b*255.0+.5);
    if((flags&1)!=0)return .16;
  }
  return 1.0;
}
${SOURCE_SURROUNDINGS_VISIBILITY_GLSL}
in float vRestHorizonGone;
uniform float uFigureFade;
void main(){
  if(vRestHorizonGone>.5)discard;
  // One person going, stippled away with the same grain the picture is printed in.
  if(uFigureFade>0.0&&fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))<uFigureFade)discard;
  clipMeshPortal(vWorld);
  // Over the open courts the skylight is glass, not a lid: from below, its panes
  // give way to the slice's real sky and weather, and about a third of them keep a
  // diagonal highlight stroke, the way glass is drawn. The ribs and beams are other
  // primitives, and from above the roof's own through-pane view owns these pixels.
  if(uRoofGlass>.5&&uEye.y<vWorld.y&&vWorld.z>=${ELLERY_COURTYARD_SKY.z0.toFixed(1)}){
    vec2 glassWorld=(vWorld+uWorldPatternOffset).xz,glassPane=floor(glassWorld/vec2(2.0,2.16667));
    float glassPick=fract(sin(dot(glassPane,vec2(12.9898,78.233)))*43758.5453);
    if(glassPick>.34||abs(fract((glassWorld.x+glassWorld.y*.62)/1.9+glassPick*7.0)-.5)*1.9>.075)discard;
  }
  if(!sourceSurroundingsVisible(uSourceSurroundingsSide,sourceSurroundingsWorldPoint(uEye),sourceSurroundingsWorldPoint(vWorld),uSourceSurroundingsGate,uSourceSurroundingsGateFrame))discard;
  // Sampling coordinates keep their authored phase across a floating origin.
  // vWorld remains physical for lighting, clipping, depth and shadow lookup.
  vec3 patternWorld=vWorld+uWorldPatternOffset;
  if(length(uExteriorClipPlane.xyz)>.5){
    if(dot(vec4(vWorld,1.0),uExteriorClipPlane)<-.001)discard;
    if(uExteriorPortalB.z>.5){
      vec3 ray=vWorld-uEye;float denominator=uExteriorPortalA.x>.5?ray.x:ray.z;
      if(abs(denominator)<.00001)discard;
      float t=(uExteriorPortalA.y-(uExteriorPortalA.x>.5?uEye.x:uEye.z))/denominator;
      vec3 crossing=uEye+ray*t;float along=uExteriorPortalA.x>.5?crossing.z:crossing.x;
      if(t<=0.0||t>=1.001||along<uExteriorPortalA.z||along>uExteriorPortalA.w||crossing.y<uExteriorPortalB.x||crossing.y>uExteriorPortalB.y)discard;
    }
  }
  if(uStillnessWallProxy>.5){
    // Geometry and shadow passes own the displaced wall. MARCH takes this
    // normal/depth before evaluating its ORIGINAL material and illumination.
    vec3 proxyNormal=normalize(vNormal);
    proxyNormal=dot(proxyNormal,uEye-vWorld)<0.0?-proxyNormal:proxyNormal;
    o=vec4(stillnessReliefEncodeNormal(proxyNormal),STILLNESS_RELIEF_PROXY_TAG);
    oSurfaceMarks=vec4(packPropWorldDepth(gl_FragCoord.z),clamp(uStillnessProxyMaterial,0.0,255.0)/255.0);
    return;
  }
  if(uUsePaperAtlas>.5&&vPaperIndex>=0&&vPaperHandling.w>0.0&&vUv.y>.68){
    float q=smoothstep(.68,1.0,vUv.y);float rag=(fract(sin((floor(vUv.y*170.0)+float(vPaperIndex)*13.7)*12.9898)*43758.5453)-.5)*.018;
    if(vUv.x>1.0-vPaperHandling.w*q+rag*q)discard;
  }
  vec4 texel=uUseTex>.5?texture(uTex,vUv):vec4(1.0);
  // The original pigment is drawn once by the post-print code pass. Neither
  // glyph RGB nor its alpha/normal/ORM relief can enter world acquisition.
  if(uSourceCodeClean>.5)texel=vec4(uSourceCodeStock,0.0);
  // STREET SURFACES, by where the surface is rather than by its UVs: most props
  // out past the grey doors were authored flat, with no texture coordinates
  // worth sampling. Three axes, weighted by the normal, so walls, roofs and the
  // ground all take the street's grain the right way up.
  vec3 streetW=vec3(0.0),streetP=patternWorld*uStreetScale;
  if(uStreetTex>.5){
    streetW=pow(abs(normalize(vNormal)),vec3(4.0));streetW/=max(1e-4,streetW.x+streetW.y+streetW.z);
    vec3 streetAlbedo=texture(uTex,streetP.zy).rgb*streetW.x+texture(uTex,streetP.xz).rgb*streetW.y+texture(uTex,streetP.xy).rgb*streetW.z;
    texel=vec4(mix(vec3(1.0),clamp(streetAlbedo*1.8,0.0,1.25),uStreetMix),texel.a);
  }
  vec2 paperUv=vec2(0.0),paperMaterialMin=vec2(0.0),paperMaterialMax=vec2(1.0);
  if(uUsePaperAtlas>.5&&vPaperIndex>=0){
    float cols=max(1.0,uPaperAtlasGrid.x),rows=max(1.0,uPaperAtlasGrid.y);
    float idx=float(vPaperIndex),cx=mod(idx,cols),cy=floor(idx/cols);
    vec2 local=clamp(vUv,.002,.998);
    // Atlas is uploaded with Y flipped, matching ordinary GLB texture UVs.
    vec2 paperCell=vec2(cx,rows-1.0-cy),paperGrid=vec2(cols,rows);
    paperUv=(paperCell+local)/paperGrid;
    // Clamp each coarse material footprint to this same real sheet. The
    // neighboring page must not supply a gradient at the visible perimeter.
    paperMaterialMin=paperCell/paperGrid+uPaperMaterialTexel*.5;
    paperMaterialMax=(paperCell+1.0)/paperGrid-uPaperMaterialTexel*.5;
    texel=texture(uPaperAtlas,paperUv);
  }
  if(uUsePortrait>.5){int slot=clamp(vPortrait,0,5);vec2 cell=vec2(float(slot%3),float(slot/3));vec2 local=clamp(vUv,.006,.994);texel=texture(uPortraitAtlas,(cell+local)/vec2(3.0,2.0));}
  vec2 courtWet=glassCourtRainFaceEvidence(vWorld,vNormal);
  if(courtWet.x>.0){
    // Sparse glass textures have zero RGB in their transparent texels. Newly
    // formed water inherits the actual ordinary streak pigment before shadow
    // absorption, so raising coverage cannot create an unlit black decal.
    texel.rgb=mix(texel.rgb,vec3(173.0,191.0,172.0)/255.0,1.0-step(.5,texel.a));
    texel.rgb*=1.0-clamp(courtWet.y,0.0,.85);
    texel.a=max(texel.a,courtWet.x);
  }
  float printPolarity=uPrintedSurface.x;
  if(uUsePaperAtlas>.5&&vPaperIndex<0)printPolarity=0.0;
  float sampledAlpha=texel.a*uBaseAlpha;
  float printedCoverage=uPrintedSurface.y>.5?1.0:texel.a;
  // Preserve thin cards as they minify instead of letting a fixed cutoff eat
  // the whole crown one mip at a time.
  float coverageWidth=clamp(fwidth(sampledAlpha)*.58,0.0,.16);
  if(sampledAlpha<uAlphaCut-coverageWidth)discard;
  // A finite opaque body material. It keeps the same skinning, depth and
  // shadows as its real garments, but no torch/specular term can light it.
  if(uMissingManCore>.5){
    o=vec4(0.0,0.0,0.0,MISSING_MAN_CORE_TAG);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,MISSING_MAN_CORE_TAG):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
  if(uFountainWater>.5){
    // Water leaving a lip falls in pieces. Breaks travel down each strand at
    // its own pace, so the falls run instead of standing, and the separation
    // is also what survives the one-bit print.
    // Pattern space, not raw world: kilometre-scale positions lose the bits a
    // per-strand hash needs.
    float strand=fract(sin(dot(floor(patternWorld.xz*9.0),vec2(12.9898,78.233)))*43758.5453);
    float runTime=uTimeSec*(1.0-uReducedMotion*.85);
    if(fract(patternWorld.y*2.6+runTime*(1.3+strand*.9)+strand*5.0)<.30)discard;
  }
  if(uMissingManSmoke>.5){
    // Crossed finite ribbons are world geometry, not an overlay.
    // The ribbon TAPERS rather than speckles. Stochastic coverage dissolved
    // the whole plume in the one-bit halftone, so young smoke keeps most of
    // its width and old smoke narrows to a thread before it is gone.
    // Segments join end to end along each strand, so only the width tapers.
    float side=1.0-abs(vUv.x*2.0-1.0);
    float fibre=.9+.1*sin(vUv.y*28.0+sin(vUv.x*19.0)*2.0);
    if(side*fibre<1.0-clamp(vEmissive.a*6.0,0.0,.97))discard;
    // Near white: a one-bit hatch gives mid-grey almost no ink.
    o=vec4(vec3(.84,.85,.82)*(.8+.2*side),MISSING_MAN_SMOKE_TAG);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,MISSING_MAN_SMOKE_TAG):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
  // Apparition states travel with ordinary prop geometry through world depth
  // and the final scene dither. 10: red beat / body and cast shadow. 11: red
  // circuit dark / scattered residual charge. 12: no light / almost no ink.
  // The latter two discard most fragments so the room remains visible through
  // them; neither creates a white lamp or an opaque human cutout in darkness.
  // Private Source demolition world volume. It has real depth and reaches
  // the same final acquisition as architecture; the torch cannot light void.
  if(vPortrait==13){
    o=vec4(0.0,0.0,0.0,1.0);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
  // This release begins as a human residue, then tears into pressure in the
  // first shore. World-space breakup leaves gaps through the real volume;
  // it is neither a solid crowd nor a translucent white body. Keep the pattern
  // fixed in the world so turning the head cannot rearrange its charge.
  if(vPortrait==14){
    vec3 cell=floor(patternWorld*vec3(12.0,9.0,12.0));
    float grain=fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453);
    float edge=pow(1.0-abs(dot(normalize(vNormal),normalize(uEye-vWorld))),1.4);
    float strand=.55+.45*smoothstep(-.65,.65,sin(patternWorld.y*8.0+patternWorld.x*1.7+sin(patternWorld.z*2.3)*1.5));
    // Standing knees/feet and complete heads would turn the passage back
    // into a crowd. Keep an incomplete upper trace with an eroded crown.
    float trace=smoothstep(.72,1.10,vLocalHeight)*(1.0-.52*smoothstep(1.55,2.05,vLocalHeight));
    float torn=smoothstep(-.35,.12,sin(patternWorld.y*3.5+sin(patternWorld.x*2.1+patternWorld.z*.7)*2.4));
    float density=clamp(vEmissive.a,.05,.95)*strand*trace*torn*(1.0-.62*edge);
    if(grain>density)discard;
    o=vec4(0.0,0.0,0.0,1.0);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
/* THRESHOLD_GAG_APPARITION_FRAGMENT_BEGIN */
${THRESHOLD_GAG_APPARITION_FRAGMENT_GLSL}
/* THRESHOLD_GAG_APPARITION_FRAGMENT_END */
  if(vPortrait>=10&&vPortrait<=12){
    vec3 eyeDir=normalize(uEye-vWorld),normal=normalize(vNormal);
    float edge=pow(1.0-abs(dot(normal,eyeDir)),2.2);
    float ground=1.0-smoothstep(.04,.55,vLocalHeight);
    float grainClock=floor(uTimeSec*(vPortrait==12 ? .48 : 2.0)*(1.0-uReducedMotion));
    float grain=fract(sin(dot(floor(gl_FragCoord.xy*.5)+grainClock*vec2(.31,.17),vec2(12.9898,78.233)))*43758.5453);
    vec3 apparitionColor;
    if(vPortrait==10){
      // The broad cast shadow supplies the rim; the mesh itself stays a dark
      // eminence rather than drawing a bright human outline over that feather.
      float charge=vEmissive.a*(.32+.24*edge+.26*ground);
      apparitionColor=vec3(.009,.012,.015)+vEmissive.rgb*charge;
    }else if(vPortrait==11){
      if(grain>.022+.095*edge+.13*ground)discard;
      apparitionColor=vec3(.15,.18,.19)*( .66+.34*edge+.18*ground );
      // Close up in the torch, a few of these same specks glint as wet flesh
      // (apparition-gore.js). Coverage is untouched; beyond the radius, so is
      // every colour.
      float nearGore=goreNear(vWorld);
      if(nearGore>0.0){
        vec4 glint=apparitionGlint(vSourceSurroundingsLocal,vWorld,normal,nearGore,floor(gl_FragCoord.xy*.5)+grainClock*vec2(.31,.17));
        apparitionColor=mix(apparitionColor,glint.rgb,glint.a);
      }
    }else{
      if(grain>.008+.019*edge+.025*ground)discard;
      apparitionColor=vec3(.105,.116,.125);
    }
    // The lit state carries a private coverage tag into the architecture
    // composite. That pass can feather the actual 3D silhouette before the
    // one-bit display resolves it; changing only the cast shadow left a hard
    // mesh cutout inside a soft penumbra. The two dark states stay fully opaque
    // here and keep their established sparse-fragment behavior.
    o=vec4(apparitionColor,vPortrait==10?.76:1.0);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
  float memory=1.0;
  float surroundingsStress=sourceSurroundingsPressureSample(vSourceSurroundingsLocal,vSourceSurroundingsRestWorld).stress;
  vec3 n=normalize(vNormal),toEye=uEye-vWorld;float dist=length(toEye);vec3 viewDir=normalize(toEye),toLamp=uTorchOrigin-vWorld;float torchDist=length(toLamp);vec3 ldir=normalize(toLamp);
  if(uSourceSurroundingsPressureShape.x>.5){vec3 displacedNormal=cross(dFdx(vWorld),dFdy(vWorld));if(length(displacedNormal)>.000001)n=normalize(displacedNormal);}
  n=dot(n,viewDir)<0.0?-n:n;   // two-sided: imported meshes have arbitrary winding, light whichever face we see
  if(uUseNormal>.5){
    vec3 mapped=texture(uNormalTex,vUv).xyz*2.0-1.0;mapped.xy*=uNormalScale;
    n=propMappedNormal(vWorld,n,vUv,mapped);n=dot(n,viewDir)<0.0?-n:n;
  }
  vec3 orm=uUseOrm>.5?texture(uOrmTex,vUv).rgb:vec3(1.0);
  float roughValue=orm.g*uRoughness;
  if(uStreetTex>.5&&uStreetOrmEnabled>.5){
    vec3 streetOrm=texture(uOrmTex,streetP.zy).rgb*streetW.x+texture(uOrmTex,streetP.xz).rgb*streetW.y+texture(uOrmTex,streetP.xy).rgb*streetW.z;
    roughValue=mix(roughValue,streetOrm.g*uStreetRoughnessFactor,uStreetMix);
    orm.r=mix(orm.r,streetOrm.r,uStreetMix);
  }
  float driveWet=uDriveWetRoad*uDriveWetSurface*(.72+.28*sin(patternWorld.x*.83+patternWorld.z*.47));roughValue=mix(roughValue,.30,driveWet);
  float rough=clamp(roughValue,.08,1.0),metal=clamp(orm.b*uMetallic,0.0,1.0);
  float ao=mix(1.0,orm.r,clamp(uAoStrength,0.0,1.0));
  if(uUsePaperAtlas>.5&&vPaperIndex>=0){
    // Fused toner changes the sheet's grazing response a little; it is not a
    // black decal floating over generic prop plastic. Use the finished print
    // itself as a low-cost process mask. Blue/black ink remains subtle and the
    // bare stock stays very matte.
    float ink=printPolarity>.5?texel.a:clamp(1.0-dot(texel.rgb,vec3(.2126,.7152,.0722)),0.0,1.0);
    rough=mix(.86,.66,smoothstep(.10,.72,ink));
    metal=0.0;
    if(uUsePaperMaterial>.5){
      vec2 materialUv=clamp(paperUv,paperMaterialMin,paperMaterialMax);
      // Packed inspect channels: R roughness, G signed print micro-height,
      // B transmission. This opaque world sheet uses R/G; it does not invent
      // a back-light transport model from the stored transmission channel.
      vec3 paperMaterial=texture(uPaperMaterial,materialUv).rgb;
      rough=clamp(paperMaterial.r,.42,.96);
      vec2 sx=vec2(uPaperMaterialTexel.x,0.0),sy=vec2(0.0,uPaperMaterialTexel.y);
      float hx=texture(uPaperMaterial,clamp(materialUv+sx,paperMaterialMin,paperMaterialMax)).g-texture(uPaperMaterial,clamp(materialUv-sx,paperMaterialMin,paperMaterialMax)).g;
      float hy=texture(uPaperMaterial,clamp(materialUv+sy,paperMaterialMin,paperMaterialMax)).g-texture(uPaperMaterial,clamp(materialUv-sy,paperMaterialMin,paperMaterialMax)).g;
      vec2 ux=dFdx(vUv),uy=dFdy(vUv);vec3 px=dFdx(vWorld),py=dFdy(vWorld);
      float determinant=ux.x*uy.y-ux.y*uy.x;
      if(abs(determinant)>1e-12){
        // Convert height differences to slopes on the actual transformed
        // page, then use the shared signed material frame. No camera-space
        // normal axes or millimetre-scale fake ridges are introduced.
        vec3 du=(px*uy.y-py*ux.y)/determinant,dv=(-px*uy.x+py*ux.x)/determinant;
        vec2 localStep=uPaperMaterialTexel*max(uPaperAtlasGrid,vec2(1.0));
        vec2 slopes=vec2(hx,hy)*uPaperHeightRangeM/(2.0*localStep*max(vec2(length(du),length(dv)),vec2(.00001)));
        n=propMappedNormal(vWorld,n,vUv,normalize(vec3(-slopes,1.0)));n=dot(n,viewDir)<0.0?-n:n;
      }
    }
  }
  vec4 stillFace=vec4(0.0);
  if(uStillnessTreatment<.5&&uStillnessEligible>.5&&uStillnessState.x>.001){
    vec3 substrateNormal=normalize(vNormal);substrateNormal=dot(substrateNormal,viewDir)<0.0?-substrateNormal:substrateNormal;
    stillFace=stillnessFaceRelief(vWorld,substrateNormal);
    n=normalize(mix(n,substrateNormal,smoothstep(.06,.75,stillFace.w)));
    stillnessFaceNormal(n,vWorld,stillFace);
  }
  ${import.meta.env?.DEV&&typeof location!=='undefined'&&new URLSearchParams(location.search).has('stillnessFieldReview')?'o=vec4(stillFace.y,stillFace.z,stillFace.w,1.0);oSurfaceMarks=vec4(0.0,.5,.5,0.0);return;':''}
  float letteringFinishEnabled=max(max(uLetteringFinish,uTissueSurface.y),(uUsePaperMaterial>.5&&uUsePaperAtlas>.5&&vPaperIndex>=0)?1.0:0.0);
  float lambert=max(dot(n,ldir),0.0);float wrappedLeaf=max((dot(n,ldir)+.34)/1.34,0.0);lambert=mix(lambert,wrappedLeaf,clamp(uVegetation.y,0.0,.42));vec3 fromEye=normalize(vWorld-uEye);float axis=dot(normalize(vWorld-uTorchOrigin),uForward);
  float cone=smoothstep(uTorchCone.x,uTorchCone.y,axis);
  float falloff=torchFalloff(torchDist,uTorchReach);
  float beamProfile=torchAngular(vWorld-uTorchOrigin,uForward,uTorchRight,uTorchUp,uTorchCone,uTorchSpill);
  float beam=beamProfile*uLight;
  float shadow=beam>0.0?flashlightShadow(vWorld,n,ldir):1.0;
  vec3 base=uBase*texel.rgb*(1.0-driveWet*.12);
  base=stillnessFaceAlbedo(base,stillFace);
${PUB_FASCIA_PAINT_GLSL}
  float lamp=torchReceive(lambert*falloff*3.0*beam*(uLocalShadowIndex<0?shadow:1.0),uTorchShoulder);
  float ambient=uAmbientIntensity*mix(1.0,1.12,uLight);vec3 localLight=academicAtriumSurfaceLight(vWorld,n),localFinish=vec3(0.0);vec3 emergencyLight=vec3(0.0);
  // One shadow map, applied to the whole red field — see the long note in
  // r3d.js. Five overlapping lamps made a single-lamp silhouette invisible.
  // Its low-energy cool veil follows the same broad occlusion as the room.
  float heroShadow=1.0,apparitionBody=0.0,apparitionHalo=0.0;vec3 emergencyReach=vec3(0.0);
  if(uLocalShadowIndex>=0){
    vec3 heroDir=normalize(uLocalLightPos[uLocalShadowIndex].xyz-vWorld);
    float heroLit=clamp((flashlightShadow(vWorld,n,heroDir)-.20)/.80,0.0,1.0);
    float sharpBody=1.0-heroLit;
    float wideBody=flashlightHalo(vWorld,n,heroDir);
    apparitionBody=mix(sharpBody,wideBody,.72);
    heroShadow=1.0-.985*apparitionBody;
    apparitionHalo=max(wideBody-sharpBody,0.0);
  }
  for(int li=0;li<12;li++){
    if(li>=uLocalLightCount)break;
    if(uDriveHeadlight.w>.5&&li==2&&uDriveInterior<.5)continue;
    vec3 delta=uLocalLightPos[li].xyz-vWorld;float d=length(delta),r=max(.01,uLocalLightPos[li].w);
    vec3 lightDir=delta/max(d,.00001);float att=pow(clamp(1.0-d/r,0.0,1.0),2.0),ndl=max(dot(n,lightDir),0.0);
    // Out of reach or behind the face, this lamp adds nothing (the lettering
    // finish is zero there too), so skip the wall walk it would have paid for.
    if(att<=0.0||ndl<=0.0)continue;
    float emergency=clamp(uLocalLightEmergency[li],0.0,1.0);
    float localShadow=max(float(li==uLocalShadowIndex),emergency)>.5?heroShadow:1.0;
    float arch=architecturalLightVisibility(vWorld,uLocalLightPos[li].xyz);
    arch=mix(arch,1.0,clamp(uLocalLightPenetration[li],0.0,1.0));
    // Inside the van, nothing outside it gets in except through the glass.
    if(uCabInterior>.5&&uCabLight.x>0.0)arch*=cabGlassTransmission((uCabWorldToLocal*vec4(vWorld,1.0)).xyz,(uCabWorldToLocal*vec4(uLocalLightPos[li].xyz,1.0)).xyz);
    float driveBeam=localEmitterCone(li,-delta);
    if(uDriveHeadlight.w>.5&&uDriveHeadlight.z<.5&&li<2){
      // The UK dipped beam (dipped-beam.js): flat cut-off on the offside, kicked up to the nearside.
      driveBeam=ukDippedBeam(vWorld-uLocalLightPos[li].xyz,uDriveHeadlight.x,uDriveHeadlight.y);
    }
    if(uDriveHeadlight.w>.5&&li>=3&&li<5){vec4 spot=uDriveInspection[li-3];if(spot.w>.5)driveBeam=smoothstep(.12,.68,dot(normalize(vWorld-uLocalLightPos[li].xyz),spot.xyz));}
    vec3 irradiance=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*arch*driveBeam;
    vec3 unshadowed=irradiance*ndl,contribution=unshadowed*localShadow;
    localLight+=contribution;emergencyLight+=contribution*emergency;emergencyReach+=unshadowed*emergency;
    if(letteringFinishEnabled>.5)localFinish+=irradiance*localShadow*letteringLocalReflectance(n,ldir,lightDir,base,rough,metal);
  }
  // Through the finish, not localLight: the drive's stock throws localLight away.
  if(uCabInterior>.5&&uCabLight.x>0.0)localFinish+=base*cabOwnLight(vWorld,n)*uCabInterior;
  float apparitionReach=max(max(emergencyReach.r,emergencyReach.g),emergencyReach.b);
  float apparitionLit=smoothstep(.06,.40,apparitionReach);
  vec3 apparitionVeil=vec3(.67,.72,.78)*pow(apparitionBody,1.10)*apparitionLit*.46+vec3(.60,.67,.75)*pow(apparitionHalo,.75)*apparitionLit*.24;
  vec3 halfDir=normalize(ldir+normalize(toEye));float spec=pow(max(dot(n,halfDir),0.0),mix(72.0,5.0,rough))*mix(.08,.72,metal)*beamProfile*falloff*shadow*uLight;
  spec=spec/(1.0+uTorchShoulder*spec);
  vec3 incident=uAmbientColor*ambient*ao+uTorchColor*lamp*(1.0-metal*.45)+localLight;
  vec3 surfaceIncident=uAmbientColor*ambient*ao+uTorchColor*lamp*(1.0-metal*.45)+(letteringFinishEnabled>.5?vec3(0.0):localLight);
  float printedEmission=uPrintedSurface.z>.5?(uPrintedSurface.z<1.5?1.0-printedCoverage:printedCoverage):1.0;
  vec3 col=base*surfaceIncident+localFinish+uTorchColor*spec*mix(vec3(1.0),base,metal)+vEmissive.rgb*vEmissive.a+uMaterialEmissive*vFixturePower*printedEmission;
  // Compression exposes the stock at the travelling front, on opaque
  // material only. Its finite surface field cannot paint the absent centre.
  col+=mix(base,vec3(.75,.79,.69),.35)*surroundingsStress*.62;
  float vegetationSheen=pow(max(dot(n,ldir),0.0),18.0)*clamp(uVegetation.z,0.0,1.0)*(ambient*.35+beam*.22);
  col+=vec3(.13,.16,.19)*vegetationSheen;
  // Apply the reservation AFTER emissive materials. A red-painted or red-lit
  // surface does not become an emergency source merely because it glows.
  // The selected kiosk's vermilion is paint, not an emergency fitting. Keep
  // this exception on its authored cast-iron material rather than on a zone.
  if(uPayphoneCast<.5&&uDriveTissue<.5&&uTissueSurface.x<.5)col=reserveEmergencyRed(col,dot(emergencyLight,vec3(.2126,.7152,.0722))/max(dot(incident,vec3(.2126,.7152,.0722)),1e-4));
  col+=mix(vec3(1.0),base,.34)*apparitionVeil;
  // OUTDOORS.
  //
  // Everything above is a lamp model: a source in the room, an occlusion term, a
  // falloff. None of it describes standing in a yard, where the source is the
  // whole hemisphere and the object is lit for the same reason the cloud is. The
  // raymarcher grew a hemispherical term for this (see hitSky in r3d.js) and the
  // mesh pass did not, so the loading bay's canopy, the gate, the lodge and the
  // entire west elevation of the conservatory rendered as black cut-outs against
  // a sky that was working perfectly.
  //
  // The yard, streets, courts and exposed roof share the same sky. The test is
  // the zone, carried per instance from the cell the
  // prop stands in. Weighted by how much sky the face can see: full for anything
  // looking up, a third for a wall.
  if(${OUTDOOR_ZONES.map(zone=>`vZone==${zone}`).join('||')}||uSkyExposed>.5||pubFrontSkySurface(uPubFrontSky,vWorld,n)){
    float facingSky=.30+.70*clamp(n.y*.5+.5,0.0,1.0);
    col+=base*vec3(.30,.36,.47)*facingSky*(uDriveHeadlight.w>.5?.45:1.0);
    // And the sheen. It has been raining on all of this all night, and a wet
    // face at a grazing angle returns the lit deck rather than its own colour —
    // which is the only thing that reads on brick at forty metres in the dark.
    // Not multiplied by albedo, because a film of water has none.
    float graze=pow(1.0-abs(dot(n,normalize(uEye-vWorld))),3.0);
    col+=vec3(.052,.062,.086)*graze*facingSky*mix(1.0,.18,uQuietFireEscape)*(uDriveHeadlight.w>.5?.35:1.0);
    // AERIAL PERSPECTIVE, WHICH IS THE ONLY DEPTH CUE OUT HERE.
    //
    // The hemispherical term above has no falloff, and that is right — the sky
    // is not further away over the far end of the yard. But it means a wall
    // forty-five metres off reads at exactly the value of one at eight, and with
    // no torch reaching either of them the whole exterior flattened into one
    // plane: the far side of the road came forward and sat on the gate.
    //
    // There is a night's worth of rain in between. Wash toward the horizon's own
    // value, which is what the shader's own distance haze does to the skyline
    // (see the shoulder in nightSky) — the two have to agree or the meshes and
    // the painted city recede at different rates.
    float haze=smoothstep(20.0,76.0,dist);
    if(uDriveHeadlight.w<.5)col=mix(col,vec3(.100,.122,.168),haze*.82);
  }
  // Ren's ordinary half is never treated as an apparition. The folded-away
  // half uses the same charged / residual / pressure readings as portraits
  // 10-12, but follows illumination at THIS fragment. The sky reaches the
  // exposed tissue; recessed, downward-facing tissue can almost disappear.
  // All three readings write into the ordinary world/depth acquisition.
  if(uRenFold>.5){
    float edge=pow(1.0-abs(dot(n,normalize(uEye-vWorld))),2.0);
    float localCharge=max(lamp*dot(uTorchColor,vec3(.2126,.7152,.0722)),
      max(dot(localLight,vec3(.2126,.7152,.0722)),apparitionReach));
    float skyAccess=clamp(n.y*.5+.5,0.0,1.0);
    float residue=uAmbientIntensity*(.30+.70*skyAccess);
    float slowClock=floor(uTimeSec*.48*(1.0-uReducedMotion));
    // Coherent hanging tissue streaks, with no independent point grain or
    // bright particles. The shared dither supplies the fine ink texture.
    float fiber=sin(patternWorld.y*25.0+patternWorld.x*17.0+sin(patternWorld.z*13.0)*1.6);
    float vein=fiber+.34*sin(patternWorld.y*9.0-patternWorld.x*12.0+patternWorld.z*15.0+slowClock*.11);
    float memoryFold=clamp(vEmissive.a,0.0,1.0);
    bool margin=uRenFold>1.5;
    if(localCharge>.12){
      // Close light reveals the undercut flesh and the attached coat; the
      // broad fold remains dimmer than the intact cheek and jacket.
      col=(col*(margin?.76:.56)+vec3(.012,.008,.010)*edge)*(1.0-.72*memoryFold);
    }else if(residue>.064){
      // Emergency-off analogue on the roof: cold sky and city reach broken
      // strands across the WHOLE lost hemisphere, not just its thin margin.
      float threshold=(margin?.45:.82)-edge*(margin?.14:.08)+.38*memoryFold;
      if(vein<threshold)discard;
      col=(col*(margin?.25:.16)+vec3(.020,.015,.018)*(.35+.65*edge))*(1.0-.55*memoryFold);
    }else{
      // An underside with neither cone nor sky takes the nearly unlit state.
      float threshold=(margin?1.00:1.18)-edge*.08+.25*memoryFold;
      if(vein<threshold)discard;
      col=vec3(.080,.068,.074)*(.46+.54*edge)*(1.0-.55*memoryFold);
    }
  }
  if(uDriveSurface>.5){vec2 texUv=uDriveSurface<1.5?vec2(1.0-vUv.x,vUv.y):vUv;vec4 reflected=texture(uTex,texUv);col=(uDriveSurface<1.5?mix(vec3(.0035,.0045,.006),reflected.rgb,reflected.a):reflected.rgb)*(uDriveSurface<1.5?.84:1.15);if(uDriveSurface>2.5){float edge=pow(clamp(1.0-length((vUv-.5)*1.12),0.0,1.0),.16);col*=vec3(.76,.94,.84)*edge*(.93+.07*cos(vUv.y*320.0*6.2831853));}}
  if(uOutskirtsFold.x>.5){
    float night=1.0-smoothstep(38.0,82.0,length(vWorld-uEye));
    col*=night*uOutskirtsFold.y;
  }
  col=stillnessFaceOcclusion(col,stillFace);
  if(uRecordingFace>.5)col=max(col,recordingHandPlane(base,n,normalize(uEye-vWorld)));
  col=col/(1.0+col*.30);
  // The light uncovers an existing empty neck or unfinished face rather than
  // spawning a body. Torch inspection also restores the actual material detail;
  // ordinary guests and named residents never enter this exact-mesh branch.
  if(uAcademicHollow>.5&&uAcademicAtriumLight>.5)
    col=academicAtriumHollowColor(vWorld,n,base,col,max(0.0,lamp*uLight*dot(uTorchColor,vec3(.2126,.7152,.0722))));
  o=vec4(col,uQuietFireEscape>.5?FIRE_ESCAPE_INK_TAG:uRoofSurface>.5?ROOF_SURFACE_INK_TAG:uRoofGlass>.5?ROOF_GLASS_INK_TAG:1.0);
  // Reuse this existing MRT and the world's depth sampler slot for 24-bit
  // depth plus material identity. Colour alpha remains ordinary opacity.
  oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
  if(uSourceRoomLighting>.5&&uUseTex>.5&&printPolarity<.5){
    // Printed identity owns the plane byte. Keep its grain neutral: pigment
    // gradients are lettering, and cannot also describe substrate relief.
    // Derive engraving from the actual albedo texture, in its own UVs. No
    // screen-space hatch, inferred room colour or invented material grain.
    vec2 texelStep=1.0/vec2(textureSize(uTex,0));
    float gx=dot(texture(uTex,vUv+vec2(texelStep.x,0.0)).rgb-texture(uTex,vUv-vec2(texelStep.x,0.0)).rgb,vec3(.2126,.7152,.0722));
    float gy=dot(texture(uTex,vUv+vec2(0.0,texelStep.y)).rgb-texture(uTex,vUv-vec2(0.0,texelStep.y)).rgb,vec3(.2126,.7152,.0722));
    vec3 dpdx=dFdx(vWorld),dpdy=dFdy(vWorld);vec2 uvDx=dFdx(vUv),uvDy=dFdy(vUv);
    vec3 tangent=dpdx*uvDy.y-dpdy*uvDx.y,bitangent=-dpdx*uvDy.x+dpdy*uvDx.x;
    // The old finish cannot engrave its unchanged grain over the emerging
    // tissue after its RGB and normal were replaced. Outside the head it
    // remains the same physical wood with the same acquisition marks.
    float contrast=length(vec2(gx,gy))*(1.0-smoothstep(.06,.65,stillFace.w));vec3 grain=tangent*(-gy)+bitangent*gx;
    if(contrast>.0001&&length(grain)>.0001)oSurfaceMarks=packSurfaceMark(n,normalize(grain),clamp(.22+contrast*.35,.02,.65),clamp(contrast*4.0,0.0,1.0));
  }
  if(uQuietFireEscape>.5)oSurfaceMarks.a=FIRE_ESCAPE_INK_TAG;
  if(uRoofSurface>.5)oSurfaceMarks.a=ROOF_SURFACE_INK_TAG;
  if(uRoofGlass>.5)oSurfaceMarks.a=ROOF_GLASS_INK_TAG;
  if(printPolarity>.5){
    printedCoverage=stillnessFacePigment(printedCoverage,printPolarity,stillFace);
    oSurfaceMarks.a=uPrintedAreaCoverage>.5?printedAreaSurfaceTag(printedCoverage):printedSurfaceTag(printedCoverage,printPolarity);
  }
  if(uSourceRoomLighting>.5&&uSourceWalkway>.5){
    // The categorical family carries glyph coverage, while GB retains the
    // actual token's albedo hue/saturation. It never consumes another sampler.
    oSurfaceMarks=vec4(0.0,sourceSyntaxHueSaturation(texel.rgb),printedSourceRouteTag(printedCoverage));
  }
  // A depth-winning fault mesh keeps its authored hyperchromatic RGB through
  // acquisition. This categorical identity never comes from a color key.
  if(uSourceChunkError>.5)oSurfaceMarks.a=SOURCE_CHUNK_ERROR_TAG;
}`;

const TEXT_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aM0;
layout(location=3) in vec4 aM1;
layout(location=4) in vec4 aM2;
layout(location=5) in vec4 aM3;
layout(location=6) in vec4 aUvRect;
layout(location=7) in vec4 aColor;
layout(location=8) in float aSyntax;
uniform mat4 uView,uProj;
uniform float uSourceCodeLift;
${NATATORIUM_METRIC_GLSL}
out vec2 vUv;out vec4 vColor;out vec3 vWorld,vNormal,vBaseline;flat out float vSyntax;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vUv=mix(aUvRect.xy,aUvRect.zw,aUv);vColor=aColor;vSyntax=aSyntax;vec4 world=m*vec4(aPos,0.0,1.0);vNormal=normalize(cross(m[0].xyz,m[1].xyz));world.xyz+=vNormal*uSourceCodeLift;vWorld=world.xyz;vBaseline=normalize(m[0].xyz);gl_Position=uProj*uView*vec4(natatoriumMetricPoint(world.xyz),world.w);}`;
const TEXT_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;in vec4 vColor;in vec3 vWorld,vNormal,vBaseline;
flat in float vSyntax;
uniform sampler2D uGlyphAtlas,uShadowTex;uniform mat4 uShadowMatrix;
uniform vec3 uEye,uForward,uTorchOrigin,uTorchRight,uTorchUp,uTorchColor,uAmbientColor;
uniform float uLight,uTorchReach,uTorchSpill,uTorchShoulder,uAmbientIntensity,uSourceRoomLighting,uShadowReady,uMarksOnly;
uniform vec2 uTorchCone,uShadowTexel;
uniform int uLocalLightCount;uniform vec4 uLocalLightPos[12],uLocalLightColor[12];uniform float uLocalLightEmergency[12];
layout(location=0) out vec4 o;layout(location=2) out vec4 oSurfaceMarks;
${SURFACE_MARK_GLSL}
${PRINTED_SURFACE_GLSL}
${TORCH_OPTICS_GLSL}
float glyphTorchShadow(vec3 world,vec3 normal,vec3 lightDir){
  if(uShadowReady<.5)return 1.0;
  vec4 clip=uShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 1.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
  float bias=max(.00018,.00115*(1.0-max(dot(normal,lightDir),0.0))),visible=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(vec2(float(x),float(y))-.5)*uShadowTexel;visible+=q.z-bias<=texture(uShadowTex,q.xy+tap).r?1.0:0.0;}
  return mix(.20,1.0,visible*.25);
}
void main(){
  vec4 glyph=texture(uGlyphAtlas,vUv);
  float a=glyph.a*vColor.a;if(a<.035)discard;
  // Legacy direct Source text also reads lexical RGB; explicit page/material
  // cards retain their supplied physical material color and coverage.
  vec3 color=vSyntax>.5?glyph.rgb:vColor.rgb;oSurfaceMarks=vec4(0.0,.5,.5,0.0);
  if(uMarksOnly>.5){
    o=vec4(0.0);
    oSurfaceMarks=uSourceRoomLighting>.5?vec4(0.0,.5,.5,printedSurfaceTag(a,2.0)):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
    return;
  }
  if(uSourceRoomLighting>.5){
    vec3 toEye=uEye-vWorld;float dist=length(toEye);vec3 dir=normalize(toEye),n=normalize(vNormal);n=dot(n,dir)<0.0?-n:n;
    vec3 toLamp=uTorchOrigin-vWorld;vec3 lampDir=normalize(toLamp);
    float beam=torchAngular(-toLamp,uForward,uTorchRight,uTorchUp,uTorchCone,uTorchSpill);
    float lamp=torchReceive(max(dot(n,lampDir),0.0)*torchFalloff(length(toLamp),uTorchReach)*3.0*beam*uLight*glyphTorchShadow(vWorld,n,lampDir),uTorchShoulder);
    vec3 incident=uAmbientColor*uAmbientIntensity*mix(1.0,1.12,uLight)+uTorchColor*lamp,emergency=vec3(0.0);
    for(int li=0;li<12;li++){if(li>=uLocalLightCount)break;vec3 delta=uLocalLightPos[li].xyz-vWorld;float d=length(delta),radius=max(.01,uLocalLightPos[li].w);float att=pow(clamp(1.0-d/radius,0.0,1.0),2.0);vec3 contribution=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*max(dot(n,normalize(delta)),0.0);incident+=contribution;emergency+=contribution*clamp(uLocalLightEmergency[li],0.0,1.0);}
    color*=incident;
    float redness=(color.r-max(color.g,color.b))/max(color.r,1e-4),backing=clamp(dot(emergency,vec3(.2126,.7152,.0722))/max(dot(incident,vec3(.2126,.7152,.0722)),1e-4)*4.0,0.0,1.0);
    color=mix(color,vec3(dot(color,vec3(.2126,.7152,.0722))),smoothstep(.55,.84,redness)*(1.0-backing));
    color=color/(1.0+color*.30);
    oSurfaceMarks=packSurfaceMark(n,vBaseline,.22,.65);
  }
  o=vec4(color*a,a);
}`;

const SHADOW_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
${CHARACTER_DEFORM_GLSL}
uniform mat4 uShadowMatrix;uniform vec3 uWorldPatternOffset;uniform float uTimeSec,uReducedMotion;uniform vec4 uVegetationWind;out vec2 vUv;
${SOURCE_SURROUNDINGS_PRESSURE_GLSL}
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vec3 local=aPos,localNormal=aNormal;deformCharacter(local,localNormal);vec4 w=m*vec4(local,1.0);w.xyz+=sourceSurroundingsPressureDisplacement(local,w.xyz,mat3(m));float windHeight=clamp((local.y-uVegetationWind.z)/uVegetationWind.w,0.0,1.0);float windActive=(1.0-uReducedMotion)*step(.00001,uVegetationWind.x);float windPhase=uTimeSec*uVegetationWind.y*6.2831853+dot(w.xz+uWorldPatternOffset.xz,vec2(.173,.219));float windWave=sin(windPhase)+sin(windPhase*.47+1.9)*.34;w.xz+=vec2(windWave,sin(windPhase*.73+.8))*(uVegetationWind.x*windHeight*windHeight*windActive);vUv=aUv;gl_Position=uShadowMatrix*w;}`;
const SHADOW_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;uniform sampler2D uTex;uniform float uUseTex,uBaseAlpha,uAlphaCut;
void main(){float alpha=(uUseTex>.5?texture(uTex,vUv).a:1.0)*uBaseAlpha;float coverageWidth=clamp(fwidth(alpha)*.58,0.0,.16);if(alpha<uAlphaCut-coverageWidth)discard;}`;

// A separate identity target retains nearest skinned triangles and real surface
// material for the final recording compositor. RG is big-endian 16-bit linear
// view metres / FAR; B is five relief/cosmic-signal bits, cosmic/core/glow flags;
// A is manifestation strength. Human references never receive the cosmic flag.
const PRESSURE_FRAG=`#version 300 es
precision highp float;
${SOURCE_MESH_PORTAL_CLIP_GLSL}
in vec3 vWorld,vNormal;in vec2 vUv;
uniform vec3 uEye,uForward,uBase;
${NATATORIUM_METRIC_GLSL}
uniform sampler2D uTex,uNormalTex,uOrmTex;
uniform float uUseTex,uUseNormal,uUseOrm,uNormalScale,uRoughness,uBaseAlpha,uAlphaCut,uPressureFar;
uniform vec4 uPressure;
uniform vec2 uHushViewport;
out vec4 o;
${PROP_MATERIAL_GLSL}
${HUSH_COSMOS_GLSL}
void main(){
  clipMeshPortal(vWorld);
  vec4 texel=uUseTex>.5?texture(uTex,vUv):vec4(1.0);
  float alpha=texel.a*uBaseAlpha;
  if(alpha<uAlphaCut||uPressure.x<=.001||(uPressure.y+uPressure.z)<.5)discard;
  vec3 n=normalize(vNormal),toEye=normalize(uEye-vWorld);
  if(dot(n,toEye)<0.0)n=-n;
  if(uUseNormal>.5){
    vec3 mapped=texture(uNormalTex,vUv).xyz*2.0-1.0;mapped.xy*=uNormalScale;
    n=propMappedNormal(vWorld,n,vUv,mapped);
    if(dot(n,toEye)<0.0)n=-n;
  }
  float rough=clamp((uUseOrm>.5?texture(uOrmTex,vUv).g:1.0)*uRoughness,0.0,1.0);
  float pigment=dot(texel.rgb*uBase,vec3(.2126,.7152,.0722));
  float relief=clamp(.16+.28*(1.0-abs(dot(n,toEye)))+.26*max(0.0,dot(n,normalize(vec3(.31,.82,.48))))+.28*max(0.0,dot(n,normalize(toEye+vec3(.28,.65,.12))))+.12*pigment+.08*(1.0-rough),0.0,1.0);
  float linearDepth=max(0.0,dot(natatoriumMetricPoint(vWorld)-natatoriumMetricPoint(uEye),uForward));
  float packed=floor(clamp(linearDepth/uPressureFar,0.0,1.0)*65535.0+.5);
  vec2 depthBytes=vec2(floor(packed/256.0),mod(packed,256.0))/255.0;
  float material=relief;
  if(uPressure.w>.5){material=hushCosmosWorldField(normalize(vWorld-uEye)).a;}
  float flags=floor(material*31.0+.5)+32.0*uPressure.w+64.0*uPressure.y+128.0*uPressure.z;
  o=vec4(depthBytes,flags/255.0,clamp(uPressure.x,0.0,1.0));
}`;

let gl=null,program=null,textProgram=null,shadowProgram=null,pack=null,staticInstances=[],dynamicInstances=[],diagnosticInstances=[],emergencyShadowInstances=[],sourceStaticTextInstances=[],sourceStaticTextBatches=[],sourceVisibleBatchCount=0,sourceVisibleInstanceCount=0,sourceDynamicTextInstances=[],sourceTextCorpus=[],sourceSceneKey='',sourceCorpusKey='',portraitAtlas=null,paperAtlas=null,paperAtlasGrid=[1,1],paperAtlasHasPigment=false,paperMaterialAtlas=null,paperMaterialTexel=[1,1],paperHeightRangeM=.00036;
let stillnessReliefDrawInstances=[];
let propDiagnosticsEnabled=false,propDiagnosticOptions=null,activePropDiagnostics=null,lastPropDiagnostics=null;
let sourceSurroundingsGate=normalizeSourceSurroundingsGate();
export function setSourceSurroundingsGate(value=null){sourceSurroundingsGate=normalizeSourceSurroundingsGate(value);return{...sourceSurroundingsGate};}
let sourceSurroundingsPressure=encodeSourceSurroundingsPressure();
export function setSourceSurroundingsPressure(value=null){
  sourceSurroundingsPressure=encodeSourceSurroundingsPressure(value);
  return{count:sourceSurroundingsPressure.count,reducedMotion:sourceSurroundingsPressure.reducedMotion,maximumDisplacement:sourceSurroundingsPressure.maximumDisplacement};
}
function bindSourceSurroundingsPressure(uniform){
  gl.uniform1i(uniform('uSourceSurroundingsPresentationActive'),0);
  gl.uniform1i(uniform('uSourceSurroundingsPressureCount'),sourceSurroundingsPressure.count);
  gl.uniform4fv(uniform('uSourceSurroundingsPressureOrigins[0]'),sourceSurroundingsPressure.origins);
  gl.uniform4fv(uniform('uSourceSurroundingsPressureFronts[0]'),sourceSurroundingsPressure.fronts);
  gl.uniform2f(uniform('uSourceSurroundingsPressureShape'),0,0);
}
function bindSourceSurroundingsPresentation(uniform,matrix=null){
  const active=matrix?.length===16&&Array.from(matrix).every(Number.isFinite);
  gl.uniform1i(uniform('uSourceSurroundingsPresentationActive'),active?1:0);
  if(active){gl.uniformMatrix4fv(uniform('uSourceSurroundingsWorldToPresented'),false,matrix);gl.uniformMatrix4fv(uniform('uSourceSurroundingsPresentedToWorld'),false,portalInverse(matrix));}
}
function bindSourceSurroundingsPressureShape(uniform,primitive){
  const side=primitive.sourceSurroundingsPressure===true?primitive.sourceSurroundingsSide:0;
  gl.uniform2f(uniform('uSourceSurroundingsPressureShape'),side===1||side===2?side:0,Number(primitive.sourceSurroundingsArcRadius)||0);
}
const vegetationLodState=new Map();
let practicalLightFrameByPropId=new Map();
let roofWatcherAnchor=null,roofWatcherState=null,roofWatcherInstances=[],roofWatcherMeshEntry=null;
let roofWatcherFrame={active:false,reason:'no-roof-structure',watchers:[]},roofWatcherDrawnIds=[];
function clearRoofWatcherFrame(reason){
  roofWatcherState=null;roofWatcherInstances=[];roofWatcherMeshEntry=null;roofWatcherDrawnIds=[];
  roofWatcherFrame={active:false,reason,watchers:[]};
}
function prepareRoofWatcherFrame(eye,timeSec,reducedMotion){
  const entry=roofWatcherAnchor&&pack?.catalog.get(roofWatcherAnchor.mesh);
  // Older cached packs retain complete static carvings. Only a structure
  // explicitly baked with separate heads may submit these moving parts.
  if(!roofWatcherAnchor||entry?.extras?.roofWatchers!==1){
    const reason=roofWatcherAnchor?'static-carvings':'no-roof-structure';
    if(roofWatcherState||roofWatcherInstances.length||roofWatcherFrame.active||roofWatcherFrame.reason!==reason)
      clearRoofWatcherFrame(reason);
    return;
  }
  if(!ROOF_WATCHERS.every(w=>pack.catalog.has(w.mesh))){clearRoofWatcherFrame('parts-loading');return;}
  if(entry!==roofWatcherMeshEntry){roofWatcherState=null;roofWatcherMeshEntry=entry;}
  const frame=stepRoofWatcherPerformance(roofWatcherState,{anchor:roofWatcherAnchor,eye,timeSec,reducedMotion});
  roofWatcherState=frame.state;roofWatcherInstances=frame.instances;roofWatcherFrame=frame.presentation;
}
export function roofWatcherPresentation(){
  return structuredClone({...roofWatcherFrame,drawnIds:roofWatcherDrawnIds,
    instances:roofWatcherInstances.map(({id,mesh,x,y,z,yaw,matrix})=>({id,mesh,x,y,z,yaw,matrix}))});
}
// Character geometry is shared, but each actor owns one immutable palette for
// the entire rendered frame (including wet-road and torch-shadow passes).
const characterBundles=new Set();
let characterSnapshots=new WeakMap(),characterFramePoses=[],characterFrameTime=null,characterFrameDirty=true,characterLoadError=null;
const characterPoseErrors=new Set();
let pressureProgram=null,pressureInstances=[],pressureSurfaceInstances=[],pressureColorTex=null,pressureDepthTex=null,pressureFbo=null,pressureWidth=0,pressureHeight=0,pressureReady=false,pressureDraws=0,pressureError=null;
const pressureUniformCache=new Map();
function disposeCharacterBundle(bundle){
  const context=bundle.context;
  for(const vao of bundle.vaos)context.deleteVertexArray(vao);
  for(const buffer of bundle.buffers)context.deleteBuffer(buffer);
  for(const texture of bundle.textures)if(texture)context.deleteTexture(texture);
}
function resetCharacters(){
  for(const bundle of characterBundles){disposeCharacterBundle(bundle);for(const name of bundle.catalog.keys())if(pack?.catalog.get(name)===bundle.catalog.get(name))pack.catalog.delete(name);}
  characterBundles.clear();characterSnapshots=new WeakMap();characterFramePoses=[];characterFrameTime=null;characterFrameDirty=true;characterLoadError=null;characterPoseErrors.clear();
}
let colorTex=null,depthTex=null,marksTex=null,marksReady=false,litApparitionsVisible=false,missingManCoreVisible=false,fbo=null,width=0,height=0;
// A separate coverage channel for light-absorbing door surfaces. Glyph alpha
// cannot carry this identity: antialiased text uses every value in that channel.
let openingMaskTex=null,openingMaskReady=false;
// THE MIRRORED PASS (the outskirts' wet road): the scene again from under the
// road, at half size, into its own target. What the road is made of is left out
// of it, or the camera under the road would see only the road's underside.
let reflColorTex=null,reflDepthTex=null,reflFbo=null,reflW=0,reflH=0;
const REFLECTION_SKIP=new Set(['yard_road','outskirts_road','yard_markings','wet_footprint']);
let shadowDepthTex=null,shadowFbo=null,shadowSize=0,shadowReady=false,shadowActive=false,shadowMatrix=new Float32Array(16);
const NEAR=.05;let FAR=90;
let natatoriumMetric=NATATORIUM_METRIC_IDENTITY;
// Set by the host world renderer EVERY frame, including its ordinary reset.
export function setNatatoriumMetricFrame(value){natatoriumMetric=normalizeNatatoriumMetric(value);}
// Horizon's space, when it is curved. Off for every other scene in the game.
let curvedSpace=CURVED_SPACE_OFF;
export function setCurvedSpaceFrame(value){curvedSpace=value||CURVED_SPACE_OFF;}
const effectivePropFar=()=>Math.abs(natatoriumMetric.k)>0?Math.max(FAR,320):FAR;

const authoredPropRange=createPropRangeController();
const uniformCache=new Map();
const textUniformCache=new Map();
const shadowUniformCache=new Map();
// Source gets one bounded atlas, even on hardware advertising larger textures.
// A 4096px allocation at the first-lift handoff was enough to stall or lose the
// WebGL context on the target renderer. Overflow is already non-fatal below, so
// extra lines cost a missing card instead of the entire picture.
const SOURCE_TEXT_CELL_WIDTH=192,SOURCE_TEXT_CELL_HEIGHT=28,SOURCE_TEXT_ATLAS_CAP=2048,SOURCE_TEXT_ATLAS_MIN=256;
export const SOURCE_TEXT_VISIBLE_CAP=1536;
export function sourceTextVisibleBudget(requested=0,{cap=SOURCE_TEXT_VISIBLE_CAP}={}){
  return Math.max(0,Math.min(Math.floor(Number(requested)||0),Math.max(1,Math.floor(Number(cap)||SOURCE_TEXT_VISIBLE_CAP))));
}
let textVao=null,textInstanceBuffer=null,textAtlas=null,textAtlasKey='',textAtlasEntries=new Map(),textAtlasBuilds=0,textAtlasSize=0,textAtlasCapacity=0,textAtlasEntryCount=0;
let sourceCodeFrame=null,sourceCodeGpu=null;

function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`prop shader: ${gl.getShaderInfoLog(s)}`);return s;}
function linkProgram(vertex,fragment,label='prop'){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`${label} link: ${gl.getProgramInfoLog(p)}`);return p;}
function makeProgram(){return linkProgram(VERT,FRAG);}
const U=(n)=>{if(!uniformCache.has(n))uniformCache.set(n,gl.getUniformLocation(program,n));return uniformCache.get(n);};
const TU=(n)=>{if(!textUniformCache.has(n))textUniformCache.set(n,gl.getUniformLocation(textProgram,n));return textUniformCache.get(n);};
const SU=(n)=>{if(!shadowUniformCache.has(n))shadowUniformCache.set(n,gl.getUniformLocation(shadowProgram,n));return shadowUniformCache.get(n);};
const HU=(n)=>{if(!pressureUniformCache.has(n))pressureUniformCache.set(n,gl.getUniformLocation(pressureProgram,n));return pressureUniformCache.get(n);};

function disposePressureTargets(){
  if(gl){if(pressureColorTex)gl.deleteTexture(pressureColorTex);if(pressureDepthTex)gl.deleteTexture(pressureDepthTex);if(pressureFbo)gl.deleteFramebuffer(pressureFbo);}
  pressureColorTex=null;pressureDepthTex=null;pressureFbo=null;pressureWidth=0;pressureHeight=0;pressureReady=false;
}
function resizePressureTarget(w,h){
  disposePressureTargets();pressureWidth=w;pressureHeight=h;pressureError=null;
  try{
    const texture=(internal,format,type)=>{
      const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,internal,w,h,0,format,type,null);
      // Packed depth and mode bits must never be filtered into each other.
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;
    };
    pressureColorTex=texture(gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE);pressureDepthTex=texture(gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT);
    pressureFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,pressureFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,pressureColorTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,pressureDepthTex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Pressure framebuffer incomplete');
    pressureReady=true;
  }catch(error){pressureError=String(error?.message||error);disposePressureTargets();console.warn('Pressure identity target unavailable',error);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
}

function initTextPass(){
  textProgram=linkProgram(TEXT_VERT,TEXT_FRAG,'source text');
  textVao=gl.createVertexArray();gl.bindVertexArray(textVao);
  const quad=new Float32Array([-.5,-.5,0,0,.5,-.5,1,0,-.5,.5,0,1,.5,.5,1,1]);
  const vertex=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertex);gl.bufferData(gl.ARRAY_BUFFER,quad,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,16,8);
  textInstanceBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,textInstanceBuffer);
  const stride=25*4;
  for(let c=0;c<4;c++){gl.enableVertexAttribArray(2+c);gl.vertexAttribPointer(2+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(2+c,1);}
  gl.enableVertexAttribArray(6);gl.vertexAttribPointer(6,4,gl.FLOAT,false,stride,64);gl.vertexAttribDivisor(6,1);
  gl.enableVertexAttribArray(7);gl.vertexAttribPointer(7,4,gl.FLOAT,false,stride,80);gl.vertexAttribDivisor(7,1);
  gl.enableVertexAttribArray(8);gl.vertexAttribPointer(8,1,gl.FLOAT,false,stride,96);gl.vertexAttribDivisor(8,1);
  gl.bindVertexArray(null);
}
export function props3dInit(context){
  disposeWorldVideoResources();
  releaseSourceCodeScreen();
  if(gl&&pack)releaseStillnessReliefMeshes(gl,pack);
  stillnessReliefDrawInstances=[];
  disposeDriveStudyResources();
  resetCharacters();
  clearRoofWatcherFrame('renderer-initializing');
  disposePressureTargets();if(gl&&pressureProgram)gl.deleteProgram(pressureProgram);
  pressureProgram=null;pressureInstances=[];pressureSurfaceInstances=[];pressureDraws=0;pressureError=null;pressureUniformCache.clear();
  // The lazily linked passes below belong to the context they were linked on.
  // Their guards used to ask gl.isProgram every frame, which is a synchronous
  // round trip to the GPU process: the first one in a frame waited out the whole
  // previous frame, so the CPU and GPU took turns instead of overlapping.
  // Restore reuses the SAME JS context while invalidating every GPU object.
  // Reinitialisation must forget both compiled and still-pending programs.
  resetSourceDoorPrograms();
  gl=context;
  openingMaskReady=false;
  // Program-local uniform locations cannot survive a renderer re-init/HMR.
  // Compile/link eagerly so a shader error is reported here rather than later
  // as a misleading getUniformLocation() TypeError in the frame loop.
  uniformCache.clear();textUniformCache.clear();shadowUniformCache.clear();
  program=null;textProgram=null;shadowProgram=null;textAtlas=null;textAtlasKey='';textAtlasEntries=new Map();textAtlasSize=0;textAtlasCapacity=0;textAtlasEntryCount=0;
  const nextProgram=makeProgram();
  const nextShadowProgram=linkProgram(SHADOW_VERT,SHADOW_FRAG,'prop shadow');
  const nextPressureProgram=linkProgram(VERT,PRESSURE_FRAG,'pressure identity');
  program=nextProgram;shadowProgram=nextShadowProgram;pressureProgram=nextPressureProgram;
  // Static VAOs deliberately have no skin attributes. Their disabled integer
  // joint input still needs an integer generic value under WebGL validation.
  gl.vertexAttribI4ui(13,0,0,0,0);
  initTextPass();
  if(!gl.isProgram(program)||!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('prop program unavailable after successful link');
  // These large views first become visible after a long walk. Begin their
  // shader work during the existing asset load instead of on a door animation.
  try{portalProgramPending=deferGlProgram(gl,PORTAL_VERT,PORTAL_FRAG,'source portal');}
  catch(error){portalProgramFailed=true;console.warn('Source portal preview unavailable',error);}
  try{towerViewProgramPending=deferGlProgram(gl,TOWER_VIEW_VERT,TOWER_VIEW_FRAG,'source tower view');}
  catch(error){towerViewProgramFailed=true;console.warn('Source tower preview unavailable',error);}
}
export function loadPortraitAtlas(url){return new Promise((resolve,reject)=>{if(!gl){reject(new Error('props3dInit first'));return;}const img=new Image();img.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);portraitAtlas=t;resolve(t);};img.onerror=reject;img.src=url.href||String(url);});}
export async function loadPaperAtlas(url,{columns=1,rows=1,pigmentCoverage=false,materialUrl=null,heightRangeM=.00036}={}){
  if(!gl)throw new Error('props3dInit first');
  const response=await fetch(String(url));if(!response.ok)throw new Error(`paper atlas ${response.status}`);
  // ImageBitmap ignores UNPACK_FLIP_Y: select its orientation explicitly.
  // The coverage alpha belongs to opaque pigment, so straight RGB must survive
  // even on bare paper (alpha zero). It is never display transparency.
  const bitmap=await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',imageOrientation:'flipY'});
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);bitmap.close?.();
  gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  if(paperAtlas)gl.deleteTexture(paperAtlas);paperAtlas=texture;paperAtlasHasPigment=!!pigmentCoverage;
  paperAtlasGrid=[Math.max(1,columns|0),Math.max(1,rows|0)];
  if(paperMaterialAtlas)gl.deleteTexture(paperMaterialAtlas);paperMaterialAtlas=null;paperMaterialTexel=[1,1];
  paperHeightRangeM=Number.isFinite(heightRangeM)?Math.max(0,Math.min(.001,heightRangeM)):.00036;
  if(materialUrl){
    let materialBitmap=null,materialTexture=null;
    try{
      const materialResponse=await fetch(String(materialUrl));if(!materialResponse.ok)throw new Error(`paper material ${materialResponse.status}`);
      materialBitmap=await createImageBitmap(await materialResponse.blob(),{premultiplyAlpha:'none',imageOrientation:'flipY',colorSpaceConversion:'none'});
      const {width:mw,height:mh}=materialBitmap;
      if(mw%paperAtlasGrid[0]||mh%paperAtlasGrid[1]||mw/paperAtlasGrid[0]<2||mh/paperAtlasGrid[1]<2)throw new Error('paper material does not match atlas cells');
      materialTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,materialTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,materialBitmap);
      gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      paperMaterialAtlas=materialTexture;paperMaterialTexel=[1/mw,1/mh];
    }catch(error){if(materialTexture)gl.deleteTexture(materialTexture);console.warn('paper material unavailable; retaining existing print roughness',error);}
    finally{materialBitmap?.close?.();}
  }
  return texture;
}
function resizeShadowTarget(size){
  if(shadowDepthTex)gl.deleteTexture(shadowDepthTex);if(shadowFbo)gl.deleteFramebuffer(shadowFbo);
  shadowDepthTex=null;shadowFbo=null;shadowReady=false;shadowSize=size;
  try{
    shadowDepthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,shadowDepthTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,size,size,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    shadowFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,shadowDepthTex,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);
    shadowReady=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
  }catch(err){console.warn('prop shadows unavailable; continuing without them',err);shadowReady=false;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  if(!shadowReady){if(shadowDepthTex)gl.deleteTexture(shadowDepthTex);if(shadowFbo)gl.deleteFramebuffer(shadowFbo);shadowDepthTex=null;shadowFbo=null;}
}
export function props3dResize(w,h,{shadowMapSize=1024}={}){
  if(!gl)return;const targetShadow=shadowMapSize<=512?512:1024,frameChanged=w!==width||h!==height;
  if(frameChanged){width=w;height=h;
    if(colorTex)gl.deleteTexture(colorTex);if(depthTex)gl.deleteTexture(depthTex);if(marksTex)gl.deleteTexture(marksTex);if(fbo)gl.deleteFramebuffer(fbo);marksReady=false;
    if(openingMaskTex)gl.deleteTexture(openingMaskTex);openingMaskReady=false;
    colorTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,colorTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    depthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    openingMaskTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,openingMaskTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    marksTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,marksTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,colorTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,openingMaskTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT2,gl.TEXTURE_2D,marksTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(status!==gl.FRAMEBUFFER_COMPLETE)throw new Error(`prop framebuffer ${status}`);
    if(reflColorTex)gl.deleteTexture(reflColorTex);if(reflDepthTex)gl.deleteTexture(reflDepthTex);if(reflFbo)gl.deleteFramebuffer(reflFbo);
    reflW=Math.max(1,w>>1);reflH=Math.max(1,h>>1);
    reflColorTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,reflColorTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,reflW,reflH,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    reflDepthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,reflDepthTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,reflW,reflH,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    reflFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,reflFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,reflColorTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,reflDepthTex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){gl.deleteFramebuffer(reflFbo);reflFbo=null;}
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
  if(targetShadow!==shadowSize||!shadowFbo)resizeShadowTarget(targetShadow);
  if(w!==pressureWidth||h!==pressureHeight||!pressureFbo)resizePressureTarget(w,h);
}

const COMPONENT={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
const BYTES={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
const SIZE={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function readAccessor(json,bin,index){
  const a=json.accessors[index],v=json.bufferViews[a.bufferView],n=SIZE[a.type],Ctor=COMPONENT[a.componentType];if(!Ctor)throw new Error(`unsupported component ${a.componentType}`);
  const stride=v.byteStride||n*BYTES[a.componentType],off=(v.byteOffset||0)+(a.byteOffset||0),out=new Ctor(a.count*n),view=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
  const getter={5120:'getInt8',5121:'getUint8',5122:'getInt16',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType];
  for(let i=0;i<a.count;i++)for(let k=0;k<n;k++)out[i*n+k]=view[getter](off+i*stride+k*BYTES[a.componentType],true);
  return out;
}
function nodeMatrix(n={}){
  if(n.matrix)return new Float32Array(n.matrix);
  const t=n.translation||[0,0,0],s=n.scale||[1,1,1],q=n.rotation||[0,0,0,1];
  const x=q[0],y=q[1],z=q[2],w=q[3],x2=x+x,y2=y+y,z2=z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2,wx=w*x2,wy=w*y2,wz=w*z2;
  return new Float32Array([(1-yy-zz)*s[0],(xy+wz)*s[0],(xz-wy)*s[0],0,(xy-wz)*s[1],(1-xx-zz)*s[1],(yz+wx)*s[1],0,(xz+wy)*s[2],(yz-wx)*s[2],(1-xx-yy)*s[2],0,t[0],t[1],t[2],1]);
}

async function makeTexture(json,bin,textureIndex,{srgb=false,maxSize=Infinity,pigmentCoverage=false}={}){
  const textureGl=gl;
  if(textureIndex==null)return null;const texDef=json.textures?.[textureIndex],img=json.images?.[texDef?.source];if(img?.bufferView==null)return null;
  const bv=json.bufferViews[img.bufferView],bytes=bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength),bmp=await createImageBitmap(new Blob([bytes],{type:img.mimeType||'image/png'}),pigmentCoverage?{premultiplyAlpha:'none'}:undefined);
  if(bmp.width>maxSize||bmp.height>maxSize){bmp.close?.();throw new Error('character texture dimensions exceed limit');}
  const wrap=propTextureWrap(json.samplers?.[texDef.sampler]||{});
  const t=textureGl.createTexture();textureGl.bindTexture(textureGl.TEXTURE_2D,t);textureGl.pixelStorei(textureGl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);textureGl.texImage2D(textureGl.TEXTURE_2D,0,srgb?textureGl.SRGB8_ALPHA8:textureGl.RGBA8,textureGl.RGBA,textureGl.UNSIGNED_BYTE,bmp);textureGl.generateMipmap(textureGl.TEXTURE_2D);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_MIN_FILTER,textureGl.LINEAR_MIPMAP_LINEAR);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_MAG_FILTER,textureGl.LINEAR);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_WRAP_S,wrap.wrapS);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_WRAP_T,wrap.wrapT);const anisotropy=textureGl.getExtension('EXT_texture_filter_anisotropic');if(anisotropy)textureGl.texParameterf(textureGl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,textureGl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)||1));bmp.close?.();return t;
}

async function parsePropPack(url){
  if(!gl)throw new Error('props3dInit first');const res=await fetch(url);if(!res.ok)throw new Error(`prop pack ${res.status}`);const ab=await res.arrayBuffer(),dv=new DataView(ab);if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw new Error('prop pack is not GLB 2');
  let at=12,json=null,bin=null;while(at<ab.byteLength){const len=dv.getUint32(at,true),type=dv.getUint32(at+4,true),bytes=new Uint8Array(ab,at+8,len);if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(bytes));else if(type===0x004e4942)bin=bytes;at+=8+len;}
  if(!json||!bin)throw new Error('prop pack missing JSON/BIN');
  if(json.animations||json.skins||json.extensionsUsed?.length||json.extensionsRequired?.length)throw new Error('prop pack contains unsupported animation, skin or extension');
  if(json.accessors?.some((a)=>a.sparse))throw new Error('prop pack contains sparse accessors');
  const srgbTextures=new Set((json.materials||[]).map((material)=>material.pbrMetallicRoughness?.baseColorTexture?.index).filter(Number.isInteger));
  const pigmentTextures=new Set((json.materials||[]).filter(m=>m.extras?.printedSurface?.coverage==='baseColorAlpha').map(m=>m.pbrMetallicRoughness?.baseColorTexture?.index).filter(Number.isInteger));
  const textures=await Promise.all((json.textures||[]).map((_,i)=>makeTexture(json,bin,i,{srgb:srgbTextures.has(i),pigmentCoverage:pigmentTextures.has(i)}))); 
  const nodeByMesh=new Map();for(const n of json.nodes||[])if(n.mesh!=null&&!nodeByMesh.has(n.mesh))nodeByMesh.set(n.mesh,nodeMatrix(n));
  const accessorCache=new Map();const accessor=index=>{if(!accessorCache.has(index))accessorCache.set(index,readAccessor(json,bin,index));return accessorCache.get(index);};
  const catalog=new Map();
  for(let mi=0;mi<(json.meshes||[]).length;mi++){
    const md=json.meshes[mi],entry={name:md.name||`mesh-${mi}`,nodeMatrix:nodeByMesh.get(mi)||identity(),extras:md.extras||{},primitives:[],instanceBuffer:gl.createBuffer(),cullBounds:null,cullBoundsValid:true};
    for(const pd of md.primitives||[]){
      if(pd.mode!=null&&pd.mode!==4)throw new Error(`${entry.name}: triangles only`);if(pd.indices==null)throw new Error(`${entry.name}: indices required`);if(pd.targets?.length)throw new Error(`${entry.name}: morph targets unsupported`);const pos=accessor(pd.attributes.POSITION),norm=pd.attributes.NORMAL!=null?accessor(pd.attributes.NORMAL):null,uv=pd.attributes.TEXCOORD_0!=null?accessor(pd.attributes.TEXCOORD_0):null,idx=accessor(pd.indices);
      if(entry.cullBoundsValid){entry.cullBounds=includePositionBounds(entry.cullBounds,pos);entry.cullBoundsValid=!!entry.cullBounds;}
      if(!norm)throw new Error(`${entry.name}: normals required`);const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      const bind=(loc,data,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};bind(0,pos,3);bind(1,norm,3);bind(2,uv||new Float32Array(pos.length/3*2),2);
      if(pd.attributes._DRESSING_ZONE!=null){const zones=accessor(pd.attributes._DRESSING_ZONE);if(zones.length!==pos.length/3)throw new Error(`${entry.name}: invalid dressing zone count`);bind(8,zones,1);}else{gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);}
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,entry.instanceBuffer);const stride=PROP_INSTANCE_FLOATS*4;for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(3+c,1);}for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(location,1);}
      const matDef=json.materials?.[pd.material||0]||{},mat=matDef.pbrMetallicRoughness||{},alphaMode=matDef.alphaMode||'OPAQUE';if(alphaMode!=='OPAQUE'&&alphaMode!=='MASK')throw new Error(`${entry.name}: ${alphaMode} material unsupported`);entry.primitives.push({vao,count:idx.length,indexType:json.accessors[pd.indices].componentType,base:mat.baseColorFactor||[1,1,1,1],emissive:Array.isArray(matDef.emissiveFactor)?matDef.emissiveFactor:[0,0,0],texture:textures[mat.baseColorTexture?.index]||null,normalTexture:textures[matDef.normalTexture?.index]||null,normalScale:matDef.normalTexture?.scale??1,ormTexture:textures[mat.metallicRoughnessTexture?.index]||null,metallic:mat.metallicFactor??1,roughness:mat.roughnessFactor??1,mainFactors:propMaterialFactors({roughness:mat.roughnessFactor??1,metallic:mat.metallicFactor??1,hasOrm:!!textures[mat.metallicRoughnessTexture?.index],semantics:matDef.extras?.materialFactors}),letteringFinish:letteringFinishDescriptor(matDef.extras?.letteringFinish),tissueSurface:tissueSurfaceDescriptor(matDef.extras?.tissueSurface),studyLocalFinish:matDef.extras?.studyLocalFinish===true,cutTissue:matDef.extras?.cutTissue===true,aoStrength:Number(matDef.occlusionTexture?.strength??matDef.extras?.openingStreetAoStrength??matDef.extras?.vegetationAoStrength)||0,materialRole:matDef.extras?.renRole||matDef.extras?.openingStreetRole||matDef.extras?.fireEscapeRole||matDef.extras?.roofRole||null,materialName:matDef.name||null,vegetationClass:matDef.extras?.vegetationClass||null,vegetationTransmission:Number(matDef.extras?.vegetationTransmission)||0,vegetationWetness:Number(matDef.extras?.vegetationWetness)||0,printedSurface:printedSurfaceDescriptor(matDef.extras?.printedSurface,{alphaMode,hasTexture:Number.isInteger(mat.baseColorTexture?.index)}),portrait:matDef.name==='portrait surface',alphaCut:alphaMode==='MASK'?(matDef.alphaCutoff??.5):0});
      const retained=entry.primitives.at(-1);retained.nativeReceiverGeometry={positions:pos,normals:norm,uvs:uv,indices:idx};retained.nativeReceiverBounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};for(const v of idx)for(let k=0;k<3;k++){const n=pos[v*3+k];retained.nativeReceiverBounds.min[k]=Math.min(retained.nativeReceiverBounds.min[k],n);retained.nativeReceiverBounds.max[k]=Math.max(retained.nativeReceiverBounds.max[k],n);}
    }
    catalog.set(entry.name,entry);
  }
  gl.bindVertexArray(null);return{json,catalog};
}

export async function loadPropPack(url){await ensureWorldLetteringFonts();pack=await parsePropPack(url);installDivideMeshes(gl,pack);installReceptionMeshes(gl,pack);installTowerPersonalMeshes(gl,pack);installAcademicPopulationSocialMeshes(gl,pack);installAcademicGalleryPAMeshes(gl,pack);return pack;}

// Small authored hero packs can be loaded alongside the conservative shared
// prop pack without rebuilding or flattening their embedded textures. Catalog
// names remain the runtime contract, so instances do not care which GLB owns a
// mesh.
export async function addPropPack(url){
  const extra=await parsePropPack(url);
  if(!pack){pack=extra;return pack;}
  for(const[name,entry]of extra.catalog)pack.catalog.set(name,entry);
  return pack;
}

export function sourceDemolitionStats(){
  const g=SOURCE_DEMOLITION_GEOMETRY,names=[g.staticMesh,g.darkMesh,...g.parts.map(p=>p.mesh)];
  const count=names.filter(name=>pack?.catalog.has(name)).length;
  const presenceNames=Object.values(ST_BRENDANS_PRESENCE_MESH),presences=presenceNames.filter(name=>pack?.catalog.has(name)).length;
  return{loaded:count===names.length&&presences===presenceNames.length,loadedMeshes:count,expectedMeshes:names.length,presenceMeshes:presences,expectedPresences:presenceNames.length};
}
export function stBrendansTreatmentStats(){
  const meshes=ST_BRENDANS_TREATMENT_MESH_NAMES.filter(name=>pack?.catalog.has(name));
  const instances=[...staticInstances,...dynamicInstances].flatMap(instance=>{
    const target=stBrendansTreatmentMesh(instance);
    return target!==instance.mesh?[{id:instance.id,original:instance.mesh,mesh:pack?.catalog.has(target)?target:instance.mesh}]:[];
  });
  return{loaded:meshes.length===ST_BRENDANS_TREATMENT_MESH_NAMES.length,
    loadedMeshes:meshes.length,expectedMeshes:ST_BRENDANS_TREATMENT_MESH_NAMES.length,instances};
}
export function stBrendansPresenceStats(){
  const names=Object.values(ST_BRENDANS_PRESENCE_MESH),meshes=names.filter(name=>pack?.catalog.has(name));
  return{loaded:meshes.length===names.length,loadedMeshes:meshes.length,expectedMeshes:names.length};
}

// A separate loader keeps the static prop validator deliberately static. The
// character pack is installed transactionally: malformed geometry, textures or
// an interrupted context never remove the room that was already loaded.
export async function addCharacterPack(url,{allowedMeshes=null}={}){
  if(!gl)throw new Error('props3dInit first');
  const context=gl,bundle={context,buffers:[],vaos:[],textures:[],catalog:new Map(),asset:null,url:String(url)};
  try{
    const response=await fetch(url);if(!response.ok)throw new Error(`character pack ${response.status}`);
    const asset=parseCharacterAsset(await response.arrayBuffer());bundle.asset=asset;
    if(allowedMeshes){
      const permitted=new Set(allowedMeshes);
      for(const entry of asset.entries)if(!permitted.has(entry.name))throw new Error(`character pack unexpected mesh ${entry.name}`);
    }
    if(gl!==context)throw new Error('character load interrupted by renderer re-init');
    if(context.getParameter(context.MAX_VERTEX_UNIFORM_VECTORS)<CHARACTER_LIMITS.joints*4+24)throw new Error('character palette exceeds vertex uniform budget');
    if((asset.json.textures?.length||0)>48)throw new Error('character texture count exceeds limit');
    const srgb=new Set((asset.json.materials||[]).map(m=>m.pbrMetallicRoughness?.baseColorTexture?.index).filter(Number.isInteger));
    // Images must be embedded, bounded and actually referenced through valid
    // buffer views. Do not silently turn a failed cloth texture into white skin.
    for(const texture of asset.json.textures||[]){const image=asset.json.images?.[texture.source],view=asset.json.bufferViews?.[image?.bufferView];if(!view||view.buffer!==0||view.byteLength>16*1024*1024||(view.byteOffset||0)+view.byteLength>asset.bin.byteLength||!['image/png','image/jpeg','image/webp'].includes(image.mimeType))throw new Error('character embedded texture invalid');}
    for(let i=0;i<(asset.json.textures||[]).length;i++){
      const texture=await makeTexture(asset.json,asset.bin,i,{srgb:srgb.has(i),maxSize:4096});bundle.textures.push(texture);
      if(gl!==context)throw new Error('character load interrupted by renderer re-init');
    }
    const buffer=(target,data)=>{const b=context.createBuffer();bundle.buffers.push(b);context.bindBuffer(target,b);context.bufferData(target,data,context.STATIC_DRAW);return b;};
    for(const entry of asset.entries){
      const instanceBuffer=context.createBuffer();bundle.buffers.push(instanceBuffer);
      const mesh={name:entry.name,nodeMatrix:identity(),extras:entry.extras,primitives:[],instanceBuffer,characterAsset:asset,characterEntry:entry};
      for(const source of entry.primitives){
        const definition=asset.json.materials?.[source.material]||{},material=definition.pbrMetallicRoughness||{},mode=definition.alphaMode||'OPAQUE';
        if(!['OPAQUE','MASK'].includes(mode))throw new Error(`${entry.name}: unsupported character alpha mode ${mode}`);
        const vao=context.createVertexArray();bundle.vaos.push(vao);context.bindVertexArray(vao);
        const attr=(loc,data,size,integer=false)=>{buffer(context.ARRAY_BUFFER,data);context.enableVertexAttribArray(loc);if(integer)context.vertexAttribIPointer(loc,size,data instanceof Uint8Array?context.UNSIGNED_BYTE:context.UNSIGNED_SHORT,0,0);else context.vertexAttribPointer(loc,size,context.FLOAT,false,0,0);};
        attr(0,source.positions,3);attr(1,source.normals,3);attr(2,source.uv,2);attr(13,source.joints,4,true);attr(14,source.weights,4);
        buffer(context.ELEMENT_ARRAY_BUFFER,source.indices);
        context.bindBuffer(context.ARRAY_BUFFER,instanceBuffer);const stride=PROP_INSTANCE_FLOATS*4;
        for(let c=0;c<4;c++){context.enableVertexAttribArray(3+c);context.vertexAttribPointer(3+c,4,context.FLOAT,false,stride,c*16);context.vertexAttribDivisor(3+c,1);}
        for(const[loc,size,offset]of PROP_INSTANCE_BINDINGS){context.enableVertexAttribArray(loc);context.vertexAttribPointer(loc,size,context.FLOAT,false,stride,offset);context.vertexAttribDivisor(loc,1);}
        let morphTexture=null,morphSize=[1,1];
        if(source.targets.length){
          const max=context.getParameter(context.MAX_TEXTURE_SIZE),texels=source.vertexCount*2*source.targets.length,w=Math.min(max,Math.max(1,source.vertexCount)),h=Math.ceil(texels/w);
          if(h>max)throw new Error('character morph texture exceeds device limit');
          const data=new Float32Array(w*h*4);
          source.targets.forEach((target,k)=>{for(let v=0;v<source.vertexCount;v++){data.set(target.positions.subarray(v*3,v*3+3),(k*source.vertexCount*2+v)*4);data.set(target.normals.subarray(v*3,v*3+3),(k*source.vertexCount*2+source.vertexCount+v)*4);}});
          morphTexture=context.createTexture();bundle.textures.push(morphTexture);context.bindTexture(context.TEXTURE_2D,morphTexture);context.texImage2D(context.TEXTURE_2D,0,context.RGBA32F,w,h,0,context.RGBA,context.FLOAT,data);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.NEAREST);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.NEAREST);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);morphSize=[w,h];
        }
        mesh.primitives.push({vao,count:source.indices.length,indexType:source.indexType,base:material.baseColorFactor||[1,1,1,1],emissive:definition.emissiveFactor||[0,0,0],texture:bundle.textures[material.baseColorTexture?.index]||null,normalTexture:bundle.textures[definition.normalTexture?.index]||null,normalScale:definition.normalTexture?.scale??1,ormTexture:bundle.textures[material.metallicRoughnessTexture?.index]||null,metallic:material.metallicFactor??1,roughness:material.roughnessFactor??1,mainFactors:propMaterialFactors({roughness:material.roughnessFactor??1,metallic:material.metallicFactor??1,hasOrm:!!bundle.textures[material.metallicRoughnessTexture?.index],semantics:definition.extras?.materialFactors}),letteringFinish:letteringFinishDescriptor(definition.extras?.letteringFinish),tissueSurface:tissueSurfaceDescriptor(definition.extras?.tissueSurface),studyLocalFinish:definition.extras?.studyLocalFinish===true,cutTissue:definition.extras?.cutTissue===true,aoStrength:definition.occlusionTexture?.strength??(definition.occlusionTexture?1:0),materialRole:definition.extras?.characterRole||null,materialName:definition.name||null,portrait:false,alphaCut:mode==='MASK'?(definition.alphaCutoff??.5):0,characterMorphTexture:morphTexture,characterMorphSize:morphSize,characterMorphCount:source.targets.length,characterVertexCount:source.vertexCount});
      }
      bundle.catalog.set(entry.name,mesh);
    }
    context.bindVertexArray(null);
    if(!pack)pack={json:{},catalog:new Map()};
    for(const[name,entry]of bundle.catalog)pack.catalog.set(name,entry);
    for(const previous of characterBundles)if([...previous.catalog.keys()].every(name=>pack.catalog.get(name)!==previous.catalog.get(name))){disposeCharacterBundle(previous);characterBundles.delete(previous);}
    characterBundles.add(bundle);characterFrameDirty=true;characterLoadError=null;
    return {meshes:[...bundle.catalog.keys()],clips:[...asset.clips.keys()]};
  }catch(error){context.bindVertexArray(null);disposeCharacterBundle(bundle);characterLoadError=String(error?.message||error);console.warn('character pack unavailable; preserving the loaded scene',error);throw error;}
}

function characterSnapshot(instance,mesh=pack?.catalog.get(instance?.mesh)){
  if(!mesh?.characterAsset)return null;
  const cached=characterSnapshots.get(instance);if(cached)return cached;
  let pose;
  try{pose=sampleCharacterPose(mesh.characterAsset,mesh.characterEntry,instance.character||{});}
  catch(error){const message=String(error?.message||error);if(!characterPoseErrors.has(message)){characterPoseErrors.add(message);console.warn('character pose unavailable; using bind pose',error);}pose=sampleCharacterPose(mesh.characterAsset,mesh.characterEntry,{});}
  const snapshot={key:characterFramePoses.length,mesh:mesh.name,id:instance.id??null,pose};
  characterSnapshots.set(instance,snapshot);characterFramePoses.push(snapshot);return snapshot;
}
// Character poses are cached per frame. Re-sampling every rAF tick at display
// rate doubles the skinning cost above the 30 fps bar and doubles the GC from
// pose allocation for nothing visible: the clips are authored and reviewed at
// 30 Hz. Quantizing the frame time to 30 Hz lets frames above the bar share a
// pose; at or below the bar behaviour is unchanged.
const CHARACTER_FRAME_HZ = 30;
export function prepareCharacterFrame(frameTime=0){
  const quantized=Math.round(Number(frameTime||0)*CHARACTER_FRAME_HZ)/CHARACTER_FRAME_HZ;
  if(quantized!==characterFrameTime||characterFrameDirty){characterSnapshots=new WeakMap();characterFramePoses=[];characterFrameTime=quantized;characterFrameDirty=false;}
  for(const instance of [...staticInstances,...dynamicInstances,...emergencyShadowInstances,...pressureInstances,...pressureSurfaceInstances,...(propDiagnosticsEnabled?diagnosticInstances:[])])characterSnapshot(instance);
  return characterFramePoses.length;
}
export function characterStats(){
  return {loaded:characterBundles.size>0,error:characterLoadError,frame:characterFrameTime,packs:[...characterBundles].map(b=>({url:b.url,meshes:[...b.catalog.keys()]})),meshes:[...characterBundles].flatMap(b=>[...b.catalog.keys()]),assets:[...characterBundles].flatMap(b=>b.asset.entries.map(e=>({mesh:e.name,vertices:e.primitives.reduce((n,p)=>n+p.vertexCount,0),triangles:e.primitives.reduce((n,p)=>n+p.indices.length/3,0),primitives:e.primitives.length,joints:e.skin.joints.length,morphs:e.morphCount}))),clips:[...new Set([...characterBundles].flatMap(b=>[...b.asset.clips.keys()]))],poses:characterFramePoses.map(p=>({id:p.id,mesh:p.mesh,clip:p.pose.clip,time:p.pose.time,layers:p.pose.layers,bounds:p.pose.bounds})),poseErrors:[...characterPoseErrors]};
}
function groupMeshName(key){return key.split('\0',1)[0];}
function bindCharacterPose(uniform,mesh,instance){
  const snapshot=characterSnapshot(instance,mesh);gl.uniform1f(uniform('uCharacterEnabled'),snapshot?1:0);gl.uniform1f(uniform('uFigureFade'),snapshot?Number(instance?.figureFade)||0:0);
  if(snapshot){gl.uniformMatrix4fv(uniform('uCharacterBones[0]'),false,snapshot.pose.bones);gl.uniform4fv(uniform('uCharacterMorphWeights'),snapshot.pose.morphs);}
}
function bindCharacterMorph(uniform,primitive){
  gl.uniform1i(uniform('uCharacterMorphCount'),primitive.characterMorphCount||0);gl.uniform1i(uniform('uCharacterVertexCount'),primitive.characterVertexCount||0);const size=primitive.characterMorphSize||[1,1];gl.uniform2i(uniform('uCharacterMorphSize'),size[0],size[1]);gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,primitive.characterMorphTexture||null);gl.uniform1i(uniform('uCharacterMorphTex'),9);
}
function bindMeshCharacterMorph(uniform,mesh,primitive){
  // bindCharacterPose disables the vertex deformation entirely for ordinary
  // props. Their shader never reads the morph uniforms or texture, so avoid
  // rebinding them for every static material primitive.
  if(mesh.characterAsset)bindCharacterMorph(uniform,primitive);
}

const VEGETATION_CLASS={leaf:1,stem:2,'dead-leaf':3,soil:4,stone:5};
export function vegetationLodForDistance(distance,previous=null,config={}){
  const d=Math.max(0,Number(distance)||0),medium=Math.max(0,Number(config.mediumDistanceM)||28),far=Math.max(medium,Number(config.farDistanceM)||55),h=Math.max(0,Number(config.hysteresisM)||3);
  if(previous==='near')return d>=far+h?'far':d>=medium+h?'medium':'near';
  if(previous==='medium')return d>=far+h?'far':d<medium-h?'near':'medium';
  if(previous==='far')return d<medium-h?'near':d<far-h?'medium':'far';
  return d>=far?'far':d>=medium?'medium':'near';
}
function resolvedMeshName(instance,lodEye){
  if(!pack)return null;
  const brendan=stBrendansTreatmentMesh(instance);
  const authored=brendan!==instance.mesh&&pack.catalog.has(brendan)?brendan:academicGalleryMesh(instance,name=>pack.catalog.has(name));
  let name=pack.catalog.has(authored)?authored:(instance.fallbackMesh&&pack.catalog.has(instance.fallbackMesh)?instance.fallbackMesh:null);
  if(!name)return null;
  const base=pack.catalog.get(name),lod=base?.extras?.vegetationLods;
  if(!lod)return name;
  const ix=Number.isFinite(instance?.x)?instance.x:instance?.matrix?.[12],iz=Number.isFinite(instance?.z)?instance.z:instance?.matrix?.[14];
  if(!Number.isFinite(ix)||!Number.isFinite(iz))return name;
  const key=instance.id||instance,previous=vegetationLodState.get(key)||null;
  const tier=vegetationLodForDistance(Math.hypot(ix-lodEye[0],iz-lodEye[2]),previous,lod);
  vegetationLodState.set(key,tier);
  const candidate=tier==='far'?lod.far:tier==='medium'?lod.medium:name;
  return pack.catalog.has(candidate)?candidate:name;
}

function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function modelMatrix(i,base=identity()){
  if(i.matrix&&i.matrix.length===16)return multiply(new Float32Array(i.matrix),base);
  const s=i.scale||1,sx=(i.scaleX??1)*s,sy=(i.scaleY??1)*s,sz=(i.scaleZ??1)*s,c=Math.cos(i.yaw||0),n=Math.sin(i.yaw||0);
  return multiply(new Float32Array([c*sx,0,n*sx,0,0,sy,0,0,-n*sz,0,c*sz,0,i.x,i.y||0,i.z,1]),base);
}
let frameCameraTanHalfFov=.95;
// The world renderer sets this every frame, including the ordinary reset.
export function setFrameCameraTanHalfFov(value=.95){frameCameraTanHalfFov=Number.isFinite(value)?Math.max(.08,Math.min(2.25,value)):.95;}
function perspective(aspect){const f=1/(driveMirrorAspect ? .95 : driveStudyFrame ? .65 : frameCameraTanHalfFov),n=NEAR,fa=effectivePropFar();return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(fa+n)/(n-fa),-1,0,0,(2*fa*n)/(n-fa),0]);}
function perspectiveFov(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,(2*far*near)/(near-far),0]);}
function view(eye,yaw,pitch=0){
  // Derive right/up from the authored yaw, not a normalised horizontal
  // forward projection: that projection vanishes at a vertical camera pole.
  const {forward:f,right:x,up:y}=cameraBasis(yaw,pitch),z=f.map(v=>-v);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],-y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],-z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2],1]);
}
export { view as propViewMatrix };

// A PROP IS NOT A POINT, AND THE BIG ONES ARE NOT ANYWHERE NEAR THEIR ORIGIN.
//
// This used to cull on the distance from the eye to the instance's origin, which
// is right for a chair and catastrophic for an envelope. `bay-west-elevation` is
// the complete visible shell of Ellery — eighty-eight metres by ninety-six — and
// it is addressed by a single point at (50, 7.5), down in the loading-bay corner
// of it. Ninety metres from THAT corner is only sixty metres from the far side of
// the building it is wrapping, so from the south street, the east street and the
// whole south-east of the ring the entire conservatoire stopped being drawn and
// the block behind it came through. The same arithmetic quietly dropped
// district_outer_sprawl, city_frontage and the baseboards.
//
// So the reach is the cull distance plus the mesh's own footprint. The radius is
// the largest horizontal extent from the origin, which is rotation-invariant and
// therefore safe to cache per mesh and to apply before yaw is known — it is a
// conservative bound, and a conservative bound is the only kind allowed here: a
// prop wrongly kept is a few triangles, a prop wrongly dropped is a hole in the
// world.
// Standing plants bend from their root upward. A negative height hangs instead:
// it measures down from the anchor, so the shader's division keeps its sign.
function propWindHeight(wind){const height=Number(wind?.heightM)||1;return Math.abs(height)<.01?.01:height;}
const MESH_CULL_RADIUS=new Map();
function meshCullRadius(mesh){
  if(!mesh)return 0;
  const cached=MESH_CULL_RADIUS.get(mesh);
  if(cached!==undefined)return cached;
  const b=PROP_BOUNDS[mesh]||pack?.catalog.get(mesh)?.extras?.bounds;
  // Runtime-installed meshes gain bounds when the pack finishes loading; an
  // early visibility query must not permanently cache a missing mesh at zero.
  if(!b)return 0;
  const radius=Math.hypot(...[0,1,2].map(axis=>Math.max(Math.abs(b.min[axis]),Math.abs(b.max[axis]))));
  MESH_CULL_RADIUS.set(mesh,radius);
  return radius;
}
export function propInstanceVisible(instance,eye,maxDistance=90){
  const ix=Number.isFinite(instance?.x)?instance.x:instance?.matrix?.[12];
  const iz=Number.isFinite(instance?.z)?instance.z:instance?.matrix?.[14];
  if(!Number.isFinite(ix)||!Number.isFinite(iz))return false;
  let scale=Math.abs(Number(instance?.scale)||1)
    *Math.max(Math.abs(Number(instance?.scaleX??1)),Math.abs(Number(instance?.scaleZ??1)));
  if(instance?.matrix)scale=Math.max(scale,...[0,4,8].map(offset=>Math.hypot(instance.matrix[offset],instance.matrix[offset+1],instance.matrix[offset+2])));
  let radius=Math.max(meshCullRadius(instance?.mesh),Number(instance?.cullRadius)||0);
  if(instance?.character){const snapshot=characterSnapshot(instance);if(snapshot){const b=snapshot.pose.bounds;radius=Math.hypot(Math.max(Math.abs(b.min[0]),Math.abs(b.max[0])),Math.max(Math.abs(b.min[2]),Math.abs(b.max[2])));if(instance.matrix)scale=Math.hypot(...[0,1,2,4,5,6,8,9,10].map(k=>instance.matrix[k]));}}
  return Math.hypot(ix-eye[0],iz-eye[2])<=maxDistance+radius*scale;
}
const SOURCE_DOOR_SCENERY=new Set(['door-field','door-planting','station-edge','station-service']);
// A draw uploads one portal uniform for every instance in its batch. A
// window-clipped object must never lend that uniform to an outside object
// sharing the same mesh, or inherit the outside object's empty portal.
function propPortalBatchKey(instance,cache=null){
  const plane=instance?.exteriorClipPlane;
  const side=instance?.sourceSurroundingsSide,sideKey=Number.isInteger(side)&&side>=0&&side<=2?'\0source-side:'+side:'';
  const memoryKey=instance?.sourceCodeOnly===true?'\0source-code-memory':'';
  const meshPortal=portalBatchKey(instance,cache)+sideKey+memoryKey;
  if(!(Array.isArray(plane)||ArrayBuffer.isView(plane)))return meshPortal;
  const portal=instance.exteriorPortal;
  return `\0portal:${Array.from(plane).slice(0,4).join(',')}|${portal?Array.from(portal).slice(0,6).join(','):'none'}`+meshPortal;
}
function sourceDoorSceneryInView(instance,frustum){
  if(!frustum||!SOURCE_DOOR_SCENERY.has(instance.sourceStructure)||instance.character)return true;
  const radius=Math.max(meshCullRadius(instance.mesh),Number(instance.cullRadius)||0);
  // Unknown late-loaded bounds cannot safely exclude anything.
  if(!radius)return true;
  const matrix=instance.matrix;
  const centre=matrix?[matrix[12],matrix[13],matrix[14]]:[instance.x,instance.y||0,instance.z];
  // The Frobenius norm bounds every possible shear/nonuniform scale. It is
  // intentionally looser than max(axis length), which can cut rotated pieces.
  const scale=matrix?Math.hypot(matrix[0],matrix[1],matrix[2],matrix[4],matrix[5],matrix[6],matrix[8],matrix[9],matrix[10])
    :Math.abs(Number(instance.scale)||1)*Math.max(Math.abs(Number(instance.scaleX??1)),Math.abs(Number(instance.scaleY??1)),Math.abs(Number(instance.scaleZ??1)));
  return sphereInView(frustum,centre,radius*scale+.25);
}
function ordinaryPropInView(instance,mesh,frustum,matrices=null){
  // POSITION bounds do not include shader deformation, skeletal animation or
  // runtime-generated meshes. Keep those fully submitted until they have
  // their own verified dynamic bounds.
  if(!frustum||!mesh?.cullBoundsValid||!mesh.cullBounds||instance.character||mesh.characterAsset||
    Number(instance.paperIndex)>=0||Number(instance.apparitionVariant??instance.portraitIndex)>0||instance.horizonTide||
    Number(mesh.extras?.vegetationWind?.amplitudeM)>0||
    mesh.primitives.some(p=>p.sourceSurroundingsPressure===true))return true;
  const matrix=modelMatrix(instance,mesh.nodeMatrix);
  if(!propBoundsInView(mesh.cullBounds,matrix,frustum))return false;
  matrices?.set(instance,matrix);
  return true;
}
function visibleGroups(eye,maxDistance,{shadow=false,emergencyOnly=false,lodEye=eye,reflection=false,frustum=null,matrices=null,sourceCode=false}={}){
  const groups=new Map(),portalKeys=new WeakMap();
  const ordinary=propDiagnosticsEnabled&&propDiagnosticOptions?.exclusive
    ?[]:[...staticInstances,...dynamicInstances,...roofWatcherInstances,...emergencyShadowInstances,...stillnessReliefDrawInstances,...pressureSurfaceInstances];
  const instances=emergencyOnly?emergencyShadowInstances:[...ordinary,...(propDiagnosticsEnabled?diagnosticInstances:[])];
  for(const original of instances){
    // Glyph memories own no stock, shadow or reflection. Select them before
    // culling so a departed owner's live bounds cannot hide its old letters.
    if(original.sourceCodeOnly===true&&!sourceCode)continue;
    if(sourceCode&&original.sourceCodeDetached===true)continue;
    const resolved=resolvedMeshName(original,lodEye);if(!resolved)continue;
    // A fallback can contain its own baked placement, unlike the actor root.
    const i=resolved!==original.mesh&&resolved===original.fallbackMesh
      ?{...original,...original.fallbackTransform,mesh:resolved,character:null}:original;
    if(propDiagnosticsEnabled&&propDiagnosticOptions?.excludedMeshes?.has(i.mesh))continue;
    if(!shadow&&i.shadowOnly)continue;
    if(shadow&&(i.noShadow||i.portalClipPlanes))continue;
    // Seen only mirrored in the wet (the double), and never in the mirror what the road is made of.
    if(!reflection&&i.reflectionOnly)continue;
    if(reflection&&(i.noReflection||REFLECTION_SKIP.has(i.mesh)))continue;
    if(!propInstanceVisible(i,eye,maxDistance))continue;
    if(!sourceDoorSceneryInView(i,frustum))continue;
    if(!ordinaryPropInView(i,pack.catalog.get(resolved),frustum,matrices))continue;
    const pose=i.character?characterSnapshot(i,pack?.catalog.get(resolved)):null;
    const key=(pose?`${resolved}\0${pose.key}`:Number.isFinite(i.outskirtsFoldVisibility)?`${resolved}\0outskirts-fold`:resolved)+propPortalBatchKey(i,portalKeys);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);
  }
  return groups;
}
function uploadInstances(mesh,list,matrices=null,{sourceCode=false}={}){
  const data=new Float32Array(list.length*PROP_INSTANCE_FLOATS);
  for(let k=0;k<list.length;k++){
    const at=k*PROP_INSTANCE_FLOATS,authored=Array.isArray(list[k].emissive)?list[k].emissive:[0,0,0,0],practical=practicalLightFrameByPropId.get(list[k].id),emissive=practical?.color?[practical.color[0],practical.color[1],practical.color[2],authored[3]]:authored,lightScale=practical?.scale??list[k].practicalEmissiveScale??1;
    data.set(matrices?.get(list[k])||modelMatrix(list[k],mesh.nodeMatrix),at);writePropInstanceFlags(data,at,{zone:list[k].zone||0,portrait:list[k].apparitionVariant??list[k].portraitIndex??0,structural:list[k].structural,fixturePower:propPoweredMaterialScale(list[k],lightScale)});data[at+20]=Number(emissive[0])||0;data[at+21]=Number(emissive[1])||0;data[at+22]=Number(emissive[2])||0;data[at+23]=Math.max(0,(Number(emissive[3])||0)*lightScale);
    // The isolated glyph program owns these otherwise unused instance floats.
    // Main, shadow and reflection uploads retain their real material emission.
    if(sourceCode)data.set(sourceExecutionParameters(list[k].sourceExecution),at+20);
    const paperIndex=Number.isFinite(list[k].paperIndex)?Number(list[k].paperIndex):-1;data[at+24]=paperIndex;
    const handling=paperIndex>=0&&Array.isArray(PAPER_ATLAS_HANDLING?.[paperIndex])?PAPER_ATLAS_HANDLING[paperIndex]:[-1,0,0,0];
    data[at+25]=Number(handling[0])||0;if(handling[0]===-1)data[at+25]=-1;data[at+26]=Number(handling[1])||0;data[at+27]=Number(handling[2])||0;data[at+28]=Number(handling[3])||0;
    if(paperIndex<0&&list[k].horizonTide)writePropHorizonTide(data,at,list[k].horizonTide);
  }
  // Static props produce byte-identical instance data frame after frame, and
  // the same per-mesh buffer is re-uploaded for every pass. Re-uploading costs
  // a driver copy plus the CPU build on every pass; track what the buffer
  // holds and skip uploads that would write identical bytes.
  const held=mesh.instanceBufferContent;
  if(held&&held.buffer===mesh.instanceBuffer&&held.data.length===data.length){
    let same=true;
    for(let k=0;k<data.length;k++){if(held.data[k]!==data[k]){same=false;break;}}
    if(same)return;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  mesh.instanceBufferContent={buffer:mesh.instanceBuffer,data};
}
function renderShadowPass(eye,yaw,pitch,light,shadowLight=null,{timeSec=0,reducedMotion=false,lodEye=eye,torchFrame=null,torch={},patternOriginOffsetMetres=[0,0,0]}={}){
  if(!gl||!shadowProgram||gl.isContextLost())return false;
  const practical=shadowLight&&Number.isFinite(shadowLight.x)&&Number.isFinite(shadowLight.y)&&Number.isFinite(shadowLight.z)?shadowLight:null;
  shadowActive=false;if(!shadowReady||!shadowFbo||(!practical&&light<=.001)||!pack)return false;
  const lamp=torchFrame||resolveTorchFrame({eye,yaw,pitch});
  const optics=normalizeTorchOptics(torch);
  const lightYaw=practical&&Number.isFinite(practical.shadowYaw)?practical.shadowYaw:lamp.yaw;
  const lightPitch=practical&&Number.isFinite(practical.shadowPitch)?practical.shadowPitch:lamp.pitch;
  const lightEye=practical?[practical.x,practical.y,practical.z]:lamp.origin;
  const shadowFov=practical?104*Math.PI/180:Math.min(140*Math.PI/180,Math.max(40*Math.PI/180,2*Math.acos(Math.max(-.99,optics.coneInner-.045))));
  // The shadow map only needs a fresh render when something it can see moved.
  // Re-drawing the whole catalogue every frame was the single most expensive
  // prop pass; a static scene with a still torch now reuses the previous map.
  // Scenes with dynamic/pressure/roof-watcher/emergency actors keep the
  // per-frame render because those actors move without list changes.
  const gateableScene=dynamicInstances.length===0&&pressureInstances.length===0&&pressureSurfaceInstances.length===0
    &&stillnessReliefDrawInstances.length===0&&roofWatcherInstances.length===0&&emergencyShadowInstances.length===0;
  if(gateableScene){
    // Quantised to the same 30 Hz grid as character poses, so a shared pose
    // frame and a shared shadow frame always show the same silhouette.
    const quantizedTime=Math.round(Number(timeSec||0)*30)/30;
    const gateKey=[
      (Math.round(Number(light)*1000)/1000).toFixed(3),
      lightYaw.toFixed(4),lightPitch.toFixed(4),
      lightEye[0].toFixed(3),lightEye[1].toFixed(3),lightEye[2].toFixed(3),
      shadowFov.toFixed(4),quantizedTime,
      patternOriginOffsetMetres.map(v=>v.toFixed(2)).join(','),
      lodEye[0].toFixed(3),lodEye[1].toFixed(3),lodEye[2].toFixed(3),
      staticRevision,
    ].join('|');
    if(gateKey===lastShadowGateKey&&shadowActive)return true;
    lastShadowGateKey=gateKey;
  }else lastShadowGateKey=null;
  shadowMatrix=multiply(perspectiveFov(shadowFov,1,.05,64),view(lightEye,lightYaw,lightPitch));
  // A normal torch shadow map contains the room. The red apparition pass is a
  // projection event: admitting every chair, portal and handrail buried the
  // three human silhouettes in a pile of rectangular ordinary shadows.
  const matrices=new WeakMap();
  const groups=visibleGroups(lightEye,64,{shadow:true,emergencyOnly:!!practical&&emergencyShadowInstances.length>0,lodEye,frustum:viewFrustum(view(lightEye,lightYaw,lightPitch),perspectiveFov(shadowFov,1,.05,64)),matrices});
  gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo);gl.viewport(0,0,shadowSize,shadowSize);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.2,2.0);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProgram);bindSourceSurroundingsPressure(SU);gl.uniform3fv(SU('uWorldPatternOffset'),patternOriginOffsetMetres);gl.uniformMatrix4fv(SU('uShadowMatrix'),false,shadowMatrix);gl.uniform1f(SU('uTimeSec'),Number(timeSec)||0);gl.uniform1f(SU('uReducedMotion'),reducedMotion?1:0);
  for(const[name,list]of groups){const mesh=pack.catalog.get(groupMeshName(name));if(!mesh||!list.length)continue;bindCharacterPose(SU,mesh,list[0]);bindSourceSurroundingsPresentation(SU,list[0].sourceWorldMatrix);const wind=mesh.extras?.vegetationWind||{};gl.uniform4f(SU('uVegetationWind'),Number(wind.amplitudeM)||0,Number(wind.frequencyHz)||0,Number(wind.anchorY)||0,propWindHeight(wind));uploadInstances(mesh,list,matrices);for(const primitive of mesh.primitives){bindSourceSurroundingsPressureShape(SU,primitive);bindMeshCharacterMorph(SU,mesh,primitive);gl.bindVertexArray(primitive.vao);gl.uniform1f(SU('uBaseAlpha'),primitive.base[3]??1);gl.uniform1f(SU('uAlphaCut'),primitive.alphaCut);gl.uniform1f(SU('uUseTex'),primitive.texture?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,primitive.texture);gl.uniform1i(SU('uTex'),0);gl.drawElementsInstanced(gl.TRIANGLES,primitive.count,primitive.indexType,0,list.length);if(activePropDiagnostics){activePropDiagnostics.shadowDrawCalls+=1;activePropDiagnostics.shadowTriangles+=primitive.count/3*list.length;}}}
  gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);shadowActive=true;return true;
}

// Prepare once before reflection and main so both see this frame's blockers.
// Callers that do not need reflection retain renderPropPass's automatic path.
export function preparePropShadowPass({camX,camY,camZ,yaw,pitch=0,light=1,shadowLight=null,timeSec=0,reducedMotion=false,torchYawOffset=0,torch={},patternOriginOffsetMetres=[0,0,0]}){
  prepareRoofWatcherFrame([camX,camY,camZ],timeSec,reducedMotion);
  if(characterFrameDirty)prepareCharacterFrame(timeSec);
  return renderShadowPass([camX,camY,camZ],yaw,pitch,light,shadowLight,{timeSec,reducedMotion,lodEye:[camX,camY,camZ],torch,patternOriginOffsetMetres,torchFrame:resolveTorchFrame({eye:[camX,camY,camZ],yaw,pitch,yawOffset:torchYawOffset})});
}

// The van the camera may be riding in: the one instance that declares a cab
// volume (the drive body, or the opening's parked body).
let cabinVolumeInstance=null;
export function cabinVolume(){const i=cabinVolumeInstance;return i?.matrix&&i.cabinVolume?{matrix:i.matrix,min:i.cabinVolume.min,max:i.cabinVolume.max}:null;}
function findCabinVolume(){cabinVolumeInstance=staticInstances.find(i=>i?.cabinVolume&&!i.sourceCodeOnly)||dynamicInstances.find(i=>i?.cabinVolume&&!i.sourceCodeOnly)||null;}
let staticRevision=0;
let lastShadowGateKey=null;
export function setPropInstances(next){
  staticInstances=Array.isArray(next)?next:[];staticRevision+=1;findCabinVolume();
  roofWatcherAnchor=staticInstances.find(i=>i.id==='academic-roof-structure'&&i.mesh==='academic_roof_structure')||null;
  if(!roofWatcherAnchor)clearRoofWatcherFrame('no-roof-structure');
  vegetationLodState.clear();characterFrameDirty=true;
}
export function setDynamicPropInstances(next){dynamicInstances=Array.isArray(next)?next:[];findCabinVolume();characterFrameDirty=true;}
// Source II's horizon infall clock and frame, shared by every prop draw.
let restHorizonTide=sourceRestHorizonTideUniforms(null);
export function setSourceRestHorizonTide(frame=null){restHorizonTide=sourceRestHorizonTideUniforms(frame);return restHorizonTide.clock[1]>0;}
function bindRestHorizonTide(U){gl.uniform4fv(U('uRestHorizonCentre'),restHorizonTide.centre);gl.uniform4fv(U('uRestHorizonSpin'),restHorizonTide.spin);gl.uniform4fv(U('uRestHorizonClock'),restHorizonTide.clock);}

// A separate, bounded presentation channel. It shares the real prop depth,
// shadow and material passes without replacing any actor or world prop list.
export function setStillnessReliefState(frame,receivers=[]){
  stillnessReliefDrawInstances=updateStillnessReliefMeshes(gl,pack,frame,receivers);
  return stillnessReliefDrawInstances.length;
}
export function props3dStillnessReliefStatus(){return stillnessReliefDiagnostics(pack);}
export function stillnessNativeReceiverScene(){
  return{catalog:pack?.catalog||null,instances:[...staticInstances,...dynamicInstances].filter(instance=>instance.sourceCodeOnly!==true)};
}
export function stillnessReceiverObstacles(){
  const out=[];
  for(const instance of [...staticInstances,...dynamicInstances]){
    if(instance.sourceCodeOnly===true)continue;
    const mesh=pack?.catalog.get(instance.mesh);if(!mesh||mesh.extras?.stillnessRelief)continue;
    const matrix=modelMatrix(instance,mesh.nodeMatrix);
    for(const primitive of mesh.primitives){
      if(stillnessSurfaceEligible(mesh,primitive))continue;
      const bounds=primitive.nativeReceiverBounds||mesh.cullBounds||mesh.extras?.bounds;
      if(!bounds?.min||!bounds.max)continue;
      const points=[];for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]])
        points.push([matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14]]);
      out.push({id:instance.id||instance.mesh,min:[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),max:[0,1,2].map(k=>Math.max(...points.map(p=>p[k])))});
    }
  }
  return out;
}

// Independent from ordinary prop instances: these never enter torch shadows,
// material lighting or the wet reflection pass. Their simulation stays outside
// the renderer and their root transforms never depend on the viewing camera.
export function setPressureInstances(next){
  const instances=[];
  for(const value of Array.isArray(next)?next.slice(0,16):[]){
    if(!value||typeof value.mesh!=='string')continue;
    const matrix=value.matrix?.length===16?Array.from(value.matrix):null;
    if(matrix&&!matrix.every(Number.isFinite))continue;
    const x=matrix?matrix[12]:value.x,y=matrix?matrix[13]:value.y??0,z=matrix?matrix[14]:value.z;
    if(![x,y,z].every(Number.isFinite))continue;
    const p=value.pressure||{},mode=['live','core','glow','off'].includes(p.mode)?p.mode:'live';
    try{
      const instance={id:String(value.id||`pressure:${instances.length}`).slice(0,96),mesh:value.mesh.slice(0,96),x,y,z,
        yaw:Number(value.yaw)||0,scale:Number(value.scale)||1,scaleX:Number(value.scaleX??1),scaleY:Number(value.scaleY??1),scaleZ:Number(value.scaleZ??1),
        character:structuredClone(value.character||{}),pressure:{strength:Math.max(0,Math.min(1,Number(p.strength)||0)),glow:Math.max(0,Math.min(3.2,Number(p.glow??1)||0)),mode,seed:Math.max(0,Math.floor(Number(p.seed)||0))}};
      if(matrix)instance.matrix=matrix;
      const clip=portalClipArray(value.portalClipPlanes);if(clip){instance.portalClipPlanes=clip;instance.portalClipId=String(value.portalClipId||'');}
      const excludes=portalExcludeArray(value.portalExcludePlanes);if(excludes)instance.portalExcludePlanes=excludes;
      if(![instance.yaw,instance.scale,instance.scaleX,instance.scaleY,instance.scaleZ].every(Number.isFinite))continue;
      instances.push(instance);if(instances.length===4)break;
    }catch{ /* A malformed descriptor cannot invalidate the other actors. */ }
  }
  pressureInstances=instances;characterFrameDirty=true;
  return pressureInstances.length;
}

// A coupled opaque surface may return real light inside the pressure mass.
// Keep it independent of dynamic scenery and of the pressure identity target:
// the same captured character pose and portal cuts feed both submissions.
export function setPressureSurfaceInstances(next){
  pressureSurfaceInstances=[];
  for(const value of Array.isArray(next)?next.slice(0,4):[]){
    if(!value||typeof value.mesh!=='string')continue;
    try{
      const instance=structuredClone(value);
      if(instance.matrix){
        if(instance.matrix.length!==16||!Array.from(instance.matrix).every(Number.isFinite))continue;
        instance.matrix=Array.from(instance.matrix);
      }else if(![instance.x,instance.y??0,instance.z,instance.scale??1,instance.scaleX??1,instance.scaleY??1,instance.scaleZ??1].every(Number.isFinite))continue;
      const clip=portalClipArray(instance.portalClipPlanes);
      if(clip)instance.portalClipPlanes=clip;else delete instance.portalClipPlanes;
      const excludes=portalExcludeArray(instance.portalExcludePlanes);
      if(excludes)instance.portalExcludePlanes=excludes;else delete instance.portalExcludePlanes;
      instance.noShadow=true;instance.noReflection=true;
      pressureSurfaceInstances.push(instance);
    }catch{ /* Reject only the malformed surface. */ }
  }
  characterFrameDirty=true;
  return pressureSurfaceInstances.length;
}

export function renderPressurePass({camX,camY,camZ,yaw,pitch=0,timeSec=0,reducedMotion=false,maxDistance=90}={}){
  pressureDraws=0;
  if(!gl||!pressureReady||!pressureFbo||!pressureProgram||gl.isContextLost())return false;
  const eye=[camX,camY,camZ];if(![...eye,yaw,pitch].every(Number.isFinite))return false;
  if(characterFrameDirty)prepareCharacterFrame(timeSec);
  const cp=Math.cos(pitch),forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  gl.bindFramebuffer(gl.FRAMEBUFFER,pressureFbo);gl.viewport(0,0,pressureWidth,pressureHeight);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(pressureProgram);bindSourceSurroundingsPressure(HU);gl.uniform3f(HU('uWorldPatternOffset'),0,0,0);gl.uniformMatrix4fv(HU('uView'),false,view(natatoriumMetricPoint(eye,natatoriumMetric),yaw,pitch));gl.uniformMatrix4fv(HU('uProj'),false,perspective(pressureWidth/pressureHeight));
  gl.uniform3fv(HU('uEye'),eye);gl.uniform3fv(HU('uForward'),forward);gl.uniform1f(HU('uPressureFar'),effectivePropFar());gl.uniform4fv(HU('uNatatoriumMetric'),natatoriumMetricUniform(natatoriumMetric));
  gl.uniform2f(HU('uHushViewport'),pressureWidth,pressureHeight);
  gl.uniform1f(HU('uTimeSec'),Number(timeSec)||0);gl.uniform1f(HU('uReducedMotion'),reducedMotion?1:0);gl.uniform4f(HU('uVegetationWind'),0,0,0,1);
  for(const instance of pressureInstances){
    const mesh=pack?.catalog.get(instance.mesh),p=instance.pressure;
    if(!mesh?.characterAsset||p.mode==='off'||p.strength<=.001||!propInstanceVisible(instance,eye,maxDistance))continue;
    const core=p.mode==='glow'?0:1,glow=p.mode==='core'||p.glow<=0?0:1;
    // Seed belongs to captured pose, never to a surface-attached star map.
    const cosmos=instance.mesh==='hush_density_core'||instance.mesh==='hush_density_volume';
    bindCharacterPose(HU,mesh,instance);uploadInstances(mesh,[instance]);gl.uniform4f(HU('uPressure'),p.strength,core,glow,cosmos?1:0);
    const portalPlanes=portalClipArray(instance.portalClipPlanes);gl.uniform1i(HU('uMeshPortalClipCount'),portalPlanes?5:0);if(portalPlanes)gl.uniform4fv(HU('uMeshPortalClipPlanes[0]'),portalPlanes);
    const portalExcludes=portalExcludeArray(instance.portalExcludePlanes);gl.uniform1i(HU('uMeshPortalExcludeCount'),portalExcludes?portalExcludes.length/20:0);if(portalExcludes)gl.uniform4fv(HU('uMeshPortalExcludePlanes[0]'),portalExcludes);
    for(const primitive of mesh.primitives){
      bindCharacterMorph(HU,primitive);gl.bindVertexArray(primitive.vao);
      gl.uniform3fv(HU('uBase'),primitive.base.slice(0,3));gl.uniform1f(HU('uBaseAlpha'),primitive.base[3]??1);gl.uniform1f(HU('uAlphaCut'),primitive.alphaCut);
      gl.uniform1f(HU('uUseTex'),primitive.texture?1:0);gl.uniform1f(HU('uUseNormal'),primitive.normalTexture?1:0);gl.uniform1f(HU('uUseOrm'),primitive.ormTexture?1:0);gl.uniform1f(HU('uNormalScale'),primitive.normalScale??1);gl.uniform1f(HU('uRoughness'),primitive.roughness??1);
      for(const[unit,name,texture]of[[0,'uTex',primitive.texture],[4,'uNormalTex',primitive.normalTexture],[5,'uOrmTex',primitive.ormTexture]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(HU(name),unit);}
      gl.drawElementsInstanced(gl.TRIANGLES,primitive.count,primitive.indexType,0,1);pressureDraws++;
    }
  }
  gl.bindVertexArray(null);gl.disable(gl.DEPTH_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return true;
}

export function pressureTargets(){return{color:pressureColorTex,depth:pressureDepthTex,ready:pressureReady,width:pressureWidth,height:pressureHeight,near:NEAR,far:effectivePropFar(),instances:pressureInstances.length,draws:pressureDraws,error:pressureError};}
export function setDiagnosticPropInstances(next){diagnosticInstances=Array.isArray(next)?next:[];characterFrameDirty=true;}
export function setPropDiagnostics(enabled,options=null){
  propDiagnosticsEnabled=!!enabled;
  propDiagnosticOptions=propDiagnosticsEnabled?{
    exclusive:!!options?.exclusive,
    excludedMeshes:new Set(Array.isArray(options?.excludeMeshes)?options.excludeMeshes.filter(Boolean):[]),
  }:null;
  if(!propDiagnosticsEnabled){diagnosticInstances=[];activePropDiagnostics=null;lastPropDiagnostics=null;}
  return propDiagnosticsEnabled;
}
export function setEmergencyShadowInstances(next){emergencyShadowInstances=Array.isArray(next)?next:[];characterFrameDirty=true;}
export function setPracticalLightFrame(lights){
  practicalLightFrameByPropId=new Map((Array.isArray(lights)?lights:[])
    .filter((light)=>light?.anchorPropId&&Number.isFinite(light.emissiveScale))
    .map((light)=>[light.anchorPropId,{
      scale:Math.max(0,Math.min(1,Number(light.emissiveScale)||0)),
      color:Array.isArray(light.color)?light.color:null,
    }]));
}
export function setSourceTextInstances(next){sourceStaticTextInstances=Array.isArray(next)?next:[];sourceStaticTextBatches=[];sourceVisibleBatchCount=0;sourceVisibleInstanceCount=0;sourceDynamicTextInstances=[];sourceTextCorpus=[];sourceCorpusKey='';sourceSceneKey='legacy';}
export function sourceTextCorpusTransition(current={},scene={}){
  const currentKey=String(current.key||'');
  const currentCorpus=Array.isArray(current.corpus)?current.corpus:[];
  const nextKey=String(scene.atlasKey||'');
  const nextCorpus=Array.isArray(scene.corpus)?scene.corpus:[];
  // A landing-only scene carries the HUSH wake but no text architecture. It
  // must not reserve the eventual corpus key with an empty array: doing so made
  // the first lift reject the real corpus under that same key and fall back to
  // rasterising every resident card variant in the first Text Space frame.
  if(!nextKey||!nextCorpus.length)return{key:currentKey,corpus:currentCorpus,changed:false};
  if(nextKey===currentKey&&currentCorpus.length)return{key:currentKey,corpus:currentCorpus,changed:false};
  return{key:nextKey,corpus:nextCorpus,changed:true};
}
export function setSourceScene(scene={}){
  const key=String(scene.key||'');
  if(key!==sourceSceneKey){sourceSceneKey=key;sourceStaticTextInstances=Array.isArray(scene.staticInstances)?scene.staticInstances:[];sourceStaticTextBatches=Array.isArray(scene.staticBatches)?scene.staticBatches.filter((batch)=>Array.isArray(batch?.instances)):[];}
  sourceDynamicTextInstances=Array.isArray(scene.dynamicInstances)?scene.dynamicInstances:[];
  const corpus=sourceTextCorpusTransition({key:sourceCorpusKey,corpus:sourceTextCorpus},scene);
  if(corpus.changed){sourceCorpusKey=corpus.key;sourceTextCorpus=corpus.corpus;}
}
// Deliberately no visual state: the active HUSH source is found by sound.
export function setHushProp(_id){}
let lastReflectionInstances=0,lastReflectionOnly=0;
// What the mirrored pass drew last time, and how much of its target it covered.
export function reflectionStats(){
  if(!gl||!reflFbo)return{ready:false};
  const px=new Uint8Array(4*16*16);let covered=0;
  gl.bindFramebuffer(gl.FRAMEBUFFER,reflFbo);
  for(let k=0;k<16*16;k+=1){const x=Math.floor(((k%16)+.5)/16*reflW),y=Math.floor((Math.floor(k/16)+.5)/16*reflH);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px.subarray(k*4,k*4+4));if(px[k*4+3]>8)covered+=1;}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  return{ready:true,width:reflW,height:reflH,coverage:covered/256,instances:lastReflectionInstances,reflectionOnly:lastReflectionOnly};
}
export function reflectionTargets(){return{color:reflColorTex,depth:reflDepthTex,ready:!!reflFbo,width:reflW,height:reflH};}
export function propTargets(){return{color:colorTex,depth:depthTex,marks:marksTex,marksReady,missingManCoreVisible,worldData:marksTex,worldDataReady:!!fbo&&!marksReady,litApparitionsVisible,openingMask:openingMaskTex,openingMaskReady,ready:!!fbo,near:NEAR,far:effectivePropFar(),shadow:shadowDepthTex,shadowReady:!!(shadowReady&&shadowActive),shadowMatrix,shadowTexel:new Float32Array([1/Math.max(1,shadowSize),1/Math.max(1,shadowSize)]),shadowSize};}

const TEXT_PALETTE={field:[.03,.96,.20,1],path:[.03,.72,1,1],page:[.92,.94,.84,1],fault:[1,.11,.08,1],white:[.92,.94,.90,1],red:[1,.10,.07,1],cyan:[.03,.72,1,1],green:[.03,.96,.20,1]};
const SOURCE_TEXT_MATERIALS=Object.freeze({
  field:[.69,.72,.66],path:[.69,.72,.66],page:[.82,.80,.69],
  fault:[.69,.72,.66],white:[.82,.80,.69],red:[.69,.72,.66],
  cyan:[.69,.72,.66],green:[.69,.72,.66],
});
export function sourceGlyphMaterialColor(instance={}){
  const base=Array.isArray(instance.materialColor)?instance.materialColor:SOURCE_TEXT_MATERIALS[instance.colorClass]||SOURCE_TEXT_MATERIALS.field;
  return[...base.slice(0,3),instance.color?.[3]??1];
}
function textColor(instance,material=false){
  if(material)return sourceGlyphMaterialColor(instance);
  if(Array.isArray(instance.color))return[instance.color[0]||0,instance.color[1]||0,instance.color[2]||0,instance.color[3]??1];
  return TEXT_PALETTE[instance.colorClass]||TEXT_PALETTE.field;
}
function atlasSignature(values){let h=2166136261;for(const value of values){for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}h^=10;h=Math.imul(h,16777619);}return`${values.length}:${h>>>0}`;}
let sourceTextAtlasOverflowWarned=false,sourceTextAtlasDiagnostics=null;
export function sourceTextAtlasLayout(entryCount,maxTextureSize=SOURCE_TEXT_ATLAS_CAP){
  const count=Math.max(0,Math.floor(Number(entryCount)||0));
  const supported=Math.min(SOURCE_TEXT_ATLAS_CAP,Math.floor(Number(maxTextureSize)||0));
  let largest=1;while(largest*2<=supported)largest*=2;
  if(largest<SOURCE_TEXT_ATLAS_MIN)throw new RangeError(`Source text atlas requires at least ${SOURCE_TEXT_ATLAS_MIN}px texture support; renderer reports ${maxTextureSize}`);
  for(let size=SOURCE_TEXT_ATLAS_MIN;size<=largest;size*=2){
    const columns=Math.floor(size/SOURCE_TEXT_CELL_WIDTH),rows=Math.floor(size/SOURCE_TEXT_CELL_HEIGHT),capacity=columns*rows;
    if(count<=capacity)return{size,cellWidth:SOURCE_TEXT_CELL_WIDTH,cellHeight:SOURCE_TEXT_CELL_HEIGHT,columns,rows,capacity,entries:count};
  }
  // OVER CAPACITY IS A DROPPED LINE, NOT A DEAD RENDERER.
  //
  // This threw, and it is called from the frame loop — so the moment the corpus
  // outgrew the atlas the exception came out of the renderer every frame and the
  // picture froze while the simulation, the audio and the HUD carried on. That
  // is the worst failure shape available: the game looks crashed and isn't.
  //
  // It happened for real when the red approach made the field deeper and pulled
  // in nine more unique source lines than a 2048px atlas holds (739 against 730).
  // Nine lines are worth losing; the renderer is not. It reports the overflow
  // once and fills what it can.
  const capacity=Math.floor(largest/SOURCE_TEXT_CELL_WIDTH)*Math.floor(largest/SOURCE_TEXT_CELL_HEIGHT);
  const columns=Math.floor(largest/SOURCE_TEXT_CELL_WIDTH),rows=Math.floor(largest/SOURCE_TEXT_CELL_HEIGHT);
  if(!sourceTextAtlasOverflowWarned){
    sourceTextAtlasOverflowWarned=true;
    console.warn(`Source text atlas overflow: ${count} entries exceed ${capacity} at ${largest}x${largest}; the remainder will not be drawn`);
  }
  return{size:largest,cellWidth:SOURCE_TEXT_CELL_WIDTH,cellHeight:SOURCE_TEXT_CELL_HEIGHT,columns,rows,capacity,entries:capacity,overflow:count-capacity};
}
function ensureTextAtlas(){
  const instances=[...sourceStaticTextInstances,...sourceDynamicTextInstances];
  const maxTextureSize=Math.min(SOURCE_TEXT_ATLAS_CAP,gl.getParameter(gl.MAX_TEXTURE_SIZE)||SOURCE_TEXT_ATLAS_CAP);
  let size=1;while(size*2<=maxTextureSize)size*=2;
  if(size<SOURCE_TEXT_ATLAS_MIN)throw new RangeError('Source lettering texture support is too small');
  const key=sourceTextAtlasCacheKey(sourceTextCorpus,instances,{size});if(key===textAtlasKey&&textAtlas)return;
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d'),plan=planSourceTextAtlas(ctx,{corpus:sourceTextCorpus,instances,size});
  paintSourceTextAtlas(ctx,plan);
  textAtlasKey=key;textAtlasEntries=plan.entries;textAtlasBuilds+=1;textAtlasSize=size;
  textAtlasCapacity=plan.accepted;textAtlasEntryCount=plan.requested;
  sourceTextAtlasDiagnostics={fontSize:plan.fontSize,fontKey:plan.fontKey,occupancy:plan.occupancy,requested:plan.requested,
    accepted:plan.accepted,omitted:plan.omitted,interactiveOmissions:plan.interactiveOmissions,residentOmissions:plan.residentOmissions,
    policy:'Exact copy, lossless raster rows, real glyph aspect within authored physical bounds'};
  if(plan.omitted.length&&!sourceTextAtlasOverflowWarned){sourceTextAtlasOverflowWarned=true;console.warn('Source lettering atlas omissions',sourceTextAtlasDiagnostics);}
  if(textAtlas)gl.deleteTexture(textAtlas);textAtlas=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,textAtlas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
  gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
}
function visibleSourceText(eye,forward,maxDistance){
  let staticTextInstances=sourceStaticTextInstances;
  if(sourceStaticTextBatches.length){
    const visibleBatches=sourceStaticTextBatches.filter((batch)=>{
      const b=batch.bounds;if(!b)return true;
      const x=Math.max(Number(b.minX)||0,Math.min(eye[0],Number(b.maxX)||0));
      const z=Math.max(Number(b.minZ)||0,Math.min(eye[2],Number(b.maxZ)||0));
      return Math.hypot(x-eye[0],z-eye[2])<=maxDistance;
    });
    sourceVisibleBatchCount=visibleBatches.length;
    staticTextInstances=visibleBatches.flatMap((batch)=>batch.instances);
  }else sourceVisibleBatchCount=sourceStaticTextInstances.length?1:0;
  const sourceTextInstances=[...staticTextInstances,...sourceDynamicTextInstances];
  if(!sourceTextInstances.length||!textProgram)return [];
  ensureTextAtlas();const visible=[];
  for(const entry of sourceTextInstances){const m=entry.matrix;if(!m||m.length!==16)continue;const dx=m[12]-eye[0],dz=m[14]-eye[2],d=Math.hypot(dx,dz);if(d>maxDistance)continue;if(!natatoriumMetric.k&&d>4&&(dx*forward[0]+dz*forward[2])/Math.max(.001,d)<-.15)continue;const text=String(entry.text||entry.source?.text||''),uv=textAtlasEntries.get(text);if(!uv)continue;visible.push({entry,m:sourceTextQuadMatrix(m,uv),uv:uv.uv,d});}
  if(!visible.length){sourceVisibleInstanceCount=0;return [];}
  // The first lift used to submit more than five thousand cards in one upload.
  // That is not density; at this range it is overdraw, and on the first frame
  // it also coincides with atlas creation. Keep the nearest authored surfaces
  // plus every interaction card inside a fixed GPU budget.
  visible.sort((a,b)=>{
    const ap=a.entry?.interactiveId?1:0,bp=b.entry?.interactiveId?1:0;
    return bp-ap||a.d-b.d||String(a.entry?.id||'').localeCompare(String(b.entry?.id||''));
  });
  visible.length=sourceTextVisibleBudget(visible.length);
  sourceVisibleInstanceCount=visible.length;
  return visible;
}
function renderSourceText(viewMatrix,projection,eye,forward,maxDistance,lighting={}){
  const physical=lighting.sourceRoomLighting===true;
  const postCode=physical||lighting.sourceCodeScreen===true;
  const visible=visibleSourceText(eye,forward,maxDistance).filter(({entry})=>!postCode||!sourceCodeTextEligible(entry));
  if(!visible.length)return;
  const data=new Float32Array(visible.length*25);visible.forEach(({entry,m,uv},index)=>{data.set(m,index*25);data.set(uv,index*25+16);data.set(textColor(entry,physical),index*25+20);data[index*25+24]=sourceCodeTextEligible(entry)?1:0;});
  gl.useProgram(textProgram);gl.uniform4fv(TU('uNatatoriumMetric'),natatoriumMetricUniform(natatoriumMetric));gl.uniformMatrix4fv(TU('uView'),false,viewMatrix);gl.uniformMatrix4fv(TU('uProj'),false,projection);
  gl.uniform1f(TU('uSourceRoomLighting'),physical?1:0);
  gl.uniform1f(TU('uMarksOnly'),0);gl.uniform1f(TU('uSourceCodeLift'),0);
  if(physical){
    const torch={...lighting.torch,...normalizeTorchOptics(lighting.torch)};
    const lamp=lighting.torchFrame||resolveTorchFrame({eye,yaw:Math.atan2(forward[0],-forward[2]),pitch:Math.asin(forward[1])});
    gl.uniform3fv(TU('uEye'),eye);gl.uniform3fv(TU('uForward'),lamp.forward);gl.uniform3fv(TU('uTorchOrigin'),lamp.origin);gl.uniform3fv(TU('uTorchRight'),lamp.right);gl.uniform3fv(TU('uTorchUp'),lamp.up);
    gl.uniform1f(TU('uLight'),Number(lighting.light)||0);gl.uniform3fv(TU('uTorchColor'),torch.color||[1,.94,.82]);gl.uniform1f(TU('uTorchReach'),torch.reach);gl.uniform2f(TU('uTorchCone'),torch.coneInner,torch.coneOuter);gl.uniform1f(TU('uTorchSpill'),Number(torch.spill??.05)||0);gl.uniform1f(TU('uTorchShoulder'),torch.shoulder);
    gl.uniform3fv(TU('uAmbientColor'),lighting.ambientColor||[.64,.65,.62]);gl.uniform1f(TU('uAmbientIntensity'),Number(lighting.ambientIntensity)||0);
    gl.uniform1i(TU('uLocalLightCount'),lighting.localLightCount||0);
    if(lighting.localLightPositions)gl.uniform4fv(TU('uLocalLightPos[0]'),lighting.localLightPositions);
    if(lighting.localLightColors)gl.uniform4fv(TU('uLocalLightColor[0]'),lighting.localLightColors);
    gl.uniform1fv(TU('uLocalLightEmergency[0]'),lighting.localLightEmergency||new Float32Array(12));
    gl.uniform1f(TU('uShadowReady'),shadowActive?1:0);gl.uniformMatrix4fv(TU('uShadowMatrix'),false,shadowMatrix);gl.uniform2f(TU('uShadowTexel'),1/Math.max(1,shadowSize),1/Math.max(1,shadowSize));gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,shadowDepthTex);gl.uniform1i(TU('uShadowTex'),6);
  }
  gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,textAtlas);gl.uniform1i(TU('uGlyphAtlas'),3);gl.bindVertexArray(textVao);gl.bindBuffer(gl.ARRAY_BUFFER,textInstanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,visible.length);gl.disable(gl.BLEND);
  // Mark alpha names a world plane, not opacity. Render it without colour
  // blending so a horizontal glyph cannot blend with the previous material.
  {gl.uniform1f(TU('uMarksOnly'),1);gl.drawBuffers([gl.NONE,gl.NONE,gl.COLOR_ATTACHMENT2]);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,visible.length);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.uniform1f(TU('uMarksOnly'),0);}
  gl.bindVertexArray(null);
}

function sourceCodeUniforms(program){
  const cache=new Map();return name=>{if(!cache.has(name))cache.set(name,gl.getUniformLocation(program,name));return cache.get(name);};
}
function releaseSourceCodeScreen(){
  const gpu=sourceCodeGpu;
  if(gpu&&gl&&gpu.context===gl){for(const program of [gpu.physical,gpu.text,gpu.composite])gl.deleteProgram(program);if(gpu.color)gl.deleteTexture(gpu.color);if(gpu.depth)gl.deleteRenderbuffer(gpu.depth);if(gpu.framebuffer)gl.deleteFramebuffer(gpu.framebuffer);}
  sourceCodeGpu=null;sourceCodeFrame=null;
}
function prepareSourceCodeScreen(w,h){
  if(sourceCodeGpu?.context!==gl)sourceCodeGpu=null;
  if(!sourceCodeGpu){
    const physical=linkProgram(VERT,SOURCE_CODE_PHYSICAL_FRAG,'Source code physical'),text=linkProgram(TEXT_VERT,SOURCE_CODE_TEXT_FRAG,'Source code text'),composite=linkProgram(SOURCE_CODE_COMPOSITE_VERT,SOURCE_CODE_COMPOSITE_FRAG,'Source code composite');
    sourceCodeGpu={context:gl,physical,text,composite,physicalU:sourceCodeUniforms(physical),textU:sourceCodeUniforms(text),compositeU:sourceCodeUniforms(composite),width:0,height:0};
  }
  const gpu=sourceCodeGpu;
  if(gpu.width!==w||gpu.height!==h){
    if(gpu.color)gl.deleteTexture(gpu.color);if(gpu.depth)gl.deleteRenderbuffer(gpu.depth);if(gpu.framebuffer)gl.deleteFramebuffer(gpu.framebuffer);
    gpu.color=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,gpu.color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gpu.depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,gpu.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);
    gpu.framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,gpu.color,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,gpu.depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Source code framebuffer incomplete');
    gpu.width=w;gpu.height=h;
  }
  return gpu;
}

// Draw true world-space letters into their own full-output-size color/depth
// target. The final world image is already printed/glassed; this target never
// enters either shader, and it never aliases the world depth being sampled.
export function renderSourceCodeScreen({target={},sceneDepth=null,pressure=null,camera=null,faculties=null,drawAdditionalCode=null}={}){
  if(!gl||gl.isContextLost()||!sceneDepth)return false;
  const physicalFrame=sourceCodeFrame,base=camera||physicalFrame;if(!base?.eye)return false;
  const {width:outW,height:outH}=sourceCodeTargetSize(target,{width,height}),gpu=prepareSourceCodeScreen(outW,outH),eye=base.eye,
    bearing=Number(base.yaw)||0,tilt=Number(base.pitch)||0,viewMatrix=base.viewMatrix||view(natatoriumMetricPoint(eye,natatoriumMetric),bearing,tilt),
    projection=base.projection||perspective(outW/outH),forward=cameraBasis(bearing,tilt).forward,faculty=sourceRestFacultyUniforms(faculties),
    frame={...physicalFrame,...base,viewMatrix,projection,eye,yaw:bearing,pitch:tilt};
  gl.bindFramebuffer(gl.FRAMEBUFFER,gpu.framebuffer);gl.viewport(0,0,outW,outH);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  const bindCommon=(U,{glyphLinear=1,view:alternateView=null}={})=>{
    gl.uniformMatrix4fv(U('uView'),false,alternateView||viewMatrix);gl.uniformMatrix4fv(U('uProj'),false,projection);gl.uniform3fv(U('uEye'),eye);
    gl.uniform2f(U('uOutputSize'),outW,outH);gl.uniform1f(U('uGlyphLinear'),glyphLinear);gl.uniform1f(U('uSourceCodeLift'),SOURCE_CODE_LIFT_METRES);
    gl.uniform4fv(U('uSourceRestFaculties'),faculty.uSourceRestFaculties);gl.uniform4fv(U('uSourceRestFacultyState'),faculty.uSourceRestFacultyState);
    gl.uniform1i(U('uGlyph'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sceneDepth);gl.uniform1i(U('uDepth'),1);gl.uniform1i(U('uSrc'),1);
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,pressure?.color||sceneDepth);gl.uniform1i(U('uPressureGeometry'),2);gl.uniform2f(U('uPressureNearFar'),pressure?.near||.05,pressure?.far||300);gl.uniform1f(U('uPressureReady'),pressure?.ready&&pressure?.draws>0?1:0);
  };
  let physicalDraws=0,textCount=0,memoryDraws=0,memoryInstances=0,executionInstances=0;
  if(physicalFrame&&pack){
    const U=gpu.physicalU;gl.useProgram(gpu.physical);bindCommon(U);gl.uniform4fv(U('uNatatoriumMetric'),natatoriumMetricUniform(natatoriumMetric));
    gl.uniform3fv(U('uWorldPatternOffset'),physicalFrame.patternOriginOffsetMetres||[0,0,0]);gl.uniform1f(U('uTimeSec'),physicalFrame.timeSec||0);gl.uniform1f(U('uReducedMotion'),physicalFrame.reducedMotion?1:0);
    bindSourceSurroundingsPressure(U);bindRestHorizonTide(U);
    gl.uniform4f(U('uSourceSurroundingsGate'),sourceSurroundingsGate.x,sourceSurroundingsGate.y,sourceSurroundingsGate.z,sourceSurroundingsGate.width);gl.uniform3f(U('uSourceSurroundingsGateFrame'),sourceSurroundingsGate.height,sourceSurroundingsGate.normalX,sourceSurroundingsGate.normalZ);
    const matrices=new WeakMap(),groups=visibleGroups(eye,physicalFrame.maxDistance||90,{frustum:viewFrustum(viewMatrix,projection),matrices,sourceCode:true});
    for(const [key,list]of groups){
      const marker=key.indexOf('\0portal:'),name=marker<0?key:key.slice(0,marker),mesh=pack.catalog.get(groupMeshName(name));if(!mesh)continue;
      const primitives=mesh.primitives.filter(p=>p.texture&&sourceCodeMaterialEligible(p));if(!primitives.length)continue;
      const fixedMemory=list[0].sourceCodeOnly===true;
      if(fixedMemory)memoryInstances+=list.length;
      executionInstances+=list.filter(instance=>sourceExecutionParameters(instance.sourceExecution)[1]>0).length;
      bindCharacterPose(U,mesh,list[0]);uploadInstances(mesh,list,matrices,{sourceCode:true});
      const wind=fixedMemory?{}:mesh.extras?.vegetationWind||{};gl.uniform4f(U('uVegetationWind'),Number(wind.amplitudeM)||0,Number(wind.frequencyHz)||0,Number(wind.anchorY)||0,propWindHeight(wind));
      const clip=portalClipArray(list[0].portalClipPlanes),excludes=portalExcludeArray(list[0].portalExcludePlanes);
      gl.uniform1i(U('uMeshPortalClipCount'),clip?5:0);if(clip)gl.uniform4fv(U('uMeshPortalClipPlanes[0]'),clip);
      gl.uniform1i(U('uMeshPortalExcludeCount'),excludes?excludes.length/20:0);if(excludes)gl.uniform4fv(U('uMeshPortalExcludePlanes[0]'),excludes);
      gl.uniform4fv(U('uExteriorClipPlane'),list[0].exteriorClipPlane||[0,0,0,0]);
      const portal=list[0].exteriorPortal;gl.uniform4fv(U('uExteriorPortalA'),portal?portal.slice(0,4):[0,0,0,0]);gl.uniform3f(U('uExteriorPortalB'),portal?.[4]||0,portal?.[5]||0,portal?1:0);
      bindSourceSurroundingsPresentation(U,list[0].sourceWorldMatrix);
      for(const primitive of primitives){
        bindMeshCharacterMorph(U,mesh,primitive);bindSourceSurroundingsPressureShape(U,primitive);gl.uniform1i(U('uSourceSurroundingsSide'),sourceSurroundingsPrimitiveSide(primitive,list[0]));gl.uniform1f(U('uBaseAlpha'),primitive.base?.[3]??1);gl.bindVertexArray(primitive.vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,primitive.texture);
        if(fixedMemory)gl.uniform2f(U('uSourceSurroundingsPressureShape'),0,0);
        const lifts=sourceCodePhysicalLifts(primitive);
        for(const lift of lifts){gl.uniform1f(U('uSourceCodeLift'),lift);gl.drawElementsInstanced(gl.TRIANGLES,primitive.count,primitive.indexType,0,list.length);physicalDraws++;if(fixedMemory)memoryDraws++;}
        if(lifts.length>1)gl.uniform1f(U('uSourceCodeLift'),SOURCE_CODE_LIFT_METRES);
      }
    }
    const visible=visibleSourceText(eye,forward,physicalFrame.maxDistance||90).filter(({entry})=>sourceCodeTextEligible(entry));
    if(visible.length){
      const U=gpu.textU;gl.useProgram(gpu.text);bindCommon(U,{glyphLinear:0});gl.uniform4fv(U('uNatatoriumMetric'),natatoriumMetricUniform(natatoriumMetric));
      const data=new Float32Array(visible.length*25);visible.forEach(({entry,m,uv},index)=>{const execution=sourceExecutionParameters(entry.sourceExecution);data.set(m,index*25);data.set(uv,index*25+16);data.set([execution[0],execution[1],execution[2],entry.color?.[3]??1],index*25+20);data[index*25+24]=execution[3];if(execution[1]>0)executionInstances++;});
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textAtlas);gl.bindVertexArray(textVao);gl.bindBuffer(gl.ARRAY_BUFFER,textInstanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,visible.length);textCount=visible.length;
    }
  }
  drawAdditionalCode?.({framebuffer:gpu.framebuffer,width:outW,height:outH,sceneDepth,pressure,camera:{...frame,view:viewMatrix},visibility:faculties,bindCommon});
  gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.bindVertexArray(null);gl.useProgram(gpu.composite);gl.bindFramebuffer(gl.FRAMEBUFFER,target.fbo||null);gl.viewport(0,0,outW,outH);
  const U=gpu.compositeU;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,gpu.color);gl.uniform1i(U('uGlyphLayer'),0);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sceneDepth);gl.uniform1i(U('uSceneDepth'),1);gl.uniform2f(U('uOutputSize'),outW,outH);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.disable(gl.BLEND);gl.depthMask(true);gpu.physicalDraws=physicalDraws;gpu.textCount=textCount;gpu.memoryDraws=memoryDraws;gpu.memoryInstances=memoryInstances;gpu.executionInstances=executionInstances;
  return true;
}
export function sourceCodeScreenDiagnostics(){return sourceCodeGpu?{ready:true,stage:'after-world-post',source:sourceCodeFrame?'source-room':'source-shore',width:sourceCodeGpu.width,height:sourceCodeGpu.height,physicalDraws:sourceCodeGpu.physicalDraws||0,textInstances:sourceCodeGpu.textCount||0,memoryDraws:sourceCodeGpu.memoryDraws||0,memoryInstances:sourceCodeGpu.memoryInstances||0,executionInstances:sourceCodeGpu.executionInstances||0}: {ready:false};}
export const sourceCodeScreenStatus=sourceCodeScreenDiagnostics;
export function sourceCodeScreenTargets(){return sourceCodeGpu?{...sourceCodeScreenDiagnostics(),color:sourceCodeGpu.color,depth:sourceCodeGpu.depth,depthType:'renderbuffer',framebuffer:sourceCodeGpu.framebuffer}:{ready:false};}

// STREET SURFACES FOR PROPS THAT HAVE NONE. The conservatory pack was authored
// with material colours and no textures at all, which reads as bare PBR out in
// the dark. The opening street's pack already carries real texture sets; an
// untextured primitive whose material is one of these takes the named set,
// sampled by world position (see uStreetTex in the fragment shader).
// [set, how much of it, texture repeats per metre]
const STREET_SET_FOR_MATERIAL=Object.freeze({
  'outskirts municipal enamel':['rustyPaintedMetal',.35,.75],
  'outskirts worn enamel edge':['rustyMetal04',.30,3],
  'outskirts ivory coachwork':['weatheredRender',.24,.7],
  'outskirts black iron':['rustyMetal04',.35,1.1],
  'outskirts joint oxidation':['rustyMetal04',.8,2.5],
  'outskirts green moquette':['weatheredRender',.12,4],
  'outskirts rain stained paper':['weatheredRender',.12,5],
  'painted steel':['rustyPaintedMetal',.8,.9],'black lacquer':['rustyMetal04',.35,.9],'pub green paint':['rustyPaintedMetal',.55,.9],
  'board marked concrete':['roughStone',.85,.7],'chapel stone':['roughStone',.8,.6],
  'ellery red brick':['brick',.85,.6],'ellery dark brick':['brick',.85,.6],'municipal glazed brick':['brick',.6,.6],
  'aged white paint':['weatheredRender',.8,.6],'academic plaster':['weatheredRender',.7,.6],'dull terracotta':['weatheredRender',.65,.6],
  'wet slate':['asphalt',.95,.45],'dry soil':['cobbles',.75,.6],'dead foliage':['grass',.75,.8],
});
let streetSetsKey=-1,streetSets=new Map();
function streetSetFor(materialName){
  const spec=STREET_SET_FOR_MATERIAL[materialName];
  if(!spec||!pack)return null;
  if(streetSetsKey!==pack.catalog.size){
    streetSetsKey=pack.catalog.size;streetSets=new Map();
    for(const entry of pack.catalog.values())for(const p of entry.primitives){
      const name=String(p.materialName||'');
      if(name.startsWith('openingStreet.')&&p.texture&&!streetSets.has(name.slice(14)))streetSets.set(name.slice(14),p);
    }
  }
  const set=streetSets.get(spec[0]);
  return set?{texture:set.texture,ormTexture:set.ormTexture,mix:spec[1],scale:spec[2]}:null;
}
export function streetTextureSetsLoaded(){return [...streetSets.keys()];}
export function streetSetForMaterial(materialName){return STREET_SET_FOR_MATERIAL[materialName]?.[0]||null;}

const EMPTY_LIGHT_DIRECTIONS=new Float32Array(48),EMPTY_LIGHT_CONE_INNER=new Float32Array(12).fill(1);
let glassCourtRainFrame={active:0,faces:new Float32Array(8),motion:new Float32Array(4)};
const courtRainNumber=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
export function setGlassCourtRainFrame(frame){
  const faces=new Float32Array(8),motion=new Float32Array(4);
  const validFaces=Array.isArray(frame?.faces)&&frame.faces.length===2&&frame.faces.every(face=>
    (Array.isArray(face)||ArrayBuffer.isView(face))&&face.length>=4&&Array.from(face).slice(0,4).every(Number.isFinite)
    &&Array.from(face).slice(0,3).every(value=>Math.abs(value)<=1e6));
  const active=!!frame&&courtRainNumber(frame.active)>.5&&validFaces?1:0;
  if(active){
    for(let i=0;i<2;i++)for(let j=0;j<4;j++)faces[i*4+j]=j===3?Math.max(0,Math.min(1,frame.faces[i][j])):frame.faces[i][j];
    motion[0]=Math.max(0,Math.min(1e6,courtRainNumber(frame.motion?.[0])));
    for(const i of[1,2])motion[i]=Math.max(-.045,Math.min(.045,courtRainNumber(frame.motion?.[i])));
    motion[3]=Math.max(0,Math.min(1,courtRainNumber(frame.motion?.[3])));
  }
  glassCourtRainFrame={active,faces,motion};
  // A detached receipt is useful to tooling without exposing the live buffers.
  return{active,faces:[Array.from(faces.slice(0,4)),Array.from(faces.slice(4,8))],motion:Array.from(motion)};
}
export function renderPropPass({camX,camY,camZ,yaw,pitch=0,light=1,maxDistance=90,timeSec=0,reducedMotion=false,fogTexture,fogOrigin=[0,0],fogSize=256,cellMeters=.5,zoneTints,localLightCount=0,localLightPositions,localLightColors,localLightPenetrations,localLightEmergency=null,localLightDirections=null,localLightConeInner=null,physicalStudyMaterials=false,sourceBodyTissue=false,localShadowIndex=-1,shadowLight=null,torch={},ambientColor=[.64,.65,.62],ambientIntensity=.022,planTexture=null,planSize=[0,0],planOrigin=[0,0],streetTextures=false,reflection=false,torchYawOffset=0,lampFrame=null,shadowPrepared=false,sourceRoomLighting=false,sourceCodeScreen=false,academicAtriumLight=false,patternOriginOffsetMetres=[0,0,0]}){
  if(!reflection){openingMaskReady=false;marksReady=false;missingManCoreVisible=false;}
  if(!gl||!fbo||!program||gl.isContextLost())return false;if(reflection&&!reflFbo)return false;const cp=Math.cos(pitch),eye=[camX,camY,camZ],forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  // uForward is only the torch's axis: a beam that is not quite pointing where he looks.
  const torchFrame=lampFrame||resolveTorchFrame({eye,yaw,pitch,yawOffset:torchYawOffset}),torchForward=torchFrame.forward;
  torch={...torch,...normalizeTorchOptics(torch)};
  const viewMatrix=view(natatoriumMetricPoint(eye,natatoriumMetric),yaw,pitch),projection=perspective(driveMirrorAspect||width/height);
  activePropDiagnostics=propDiagnosticsEnabled?{visibleMaterialRoles:new Set(),mainDrawCalls:0,mainDrawCallsByMesh:{},shadowDrawCalls:0,renderedInstances:0,triangles:0,shadowTriangles:0}:null;
  if(!reflection)prepareRoofWatcherFrame(eye,timeSec,reducedMotion);
  if(characterFrameDirty)prepareCharacterFrame(timeSec);
  if(!reflection&&!shadowPrepared)renderShadowPass(eye,yaw,pitch,light,shadowLight,{timeSec,reducedMotion,lodEye:eye,torchFrame,torch,patternOriginOffsetMetres});
  gl.bindFramebuffer(gl.FRAMEBUFFER,reflection?reflFbo:fbo);gl.viewport(0,0,reflection?reflW:width,reflection?reflH:height);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.drawBuffers(!reflection?[gl.COLOR_ATTACHMENT0,gl.NONE,gl.COLOR_ATTACHMENT2]:[gl.COLOR_ATTACHMENT0]);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniform1f(U('uSourceCodeLift'),0);gl.uniform4fv(U('uNatatoriumMetric'),natatoriumMetricUniform(natatoriumMetric));bindStillnessPresentation(gl,U);bindSourceSurroundingsPressure(U);bindRestHorizonTide(U);gl.uniform3fv(U('uWorldPatternOffset'),patternOriginOffsetMetres);gl.uniform1f(U('uGlassCourtRainActive'),glassCourtRainFrame.active);gl.uniform4fv(U('uGlassCourtRainFaces[0]'),glassCourtRainFrame.faces);gl.uniform4fv(U('uGlassCourtRainMotion'),glassCourtRainFrame.motion);gl.uniform1f(U('uSourceRoomLighting'),sourceRoomLighting?1:0);gl.uniform1f(U('uAcademicAtriumLight'),academicAtriumLight&&!sourceRoomLighting?1:0);gl.uniform4f(U('uDriveHeadlight'),driveStudyFrame?.heading||0,driveStudyFrame?.lampDip??.02,driveStudyFrame?.physicalHeadlampCones?1:0,driveStudyFrame?1:0);{const cab=driveStudyFrame?.cabLight||parkedCabLight;gl.uniform4f(U('uCabLight'),cab?cab.gain:0,cab?.radio||0,cab?.road||0,cab?.sky||0);if(cab)gl.uniformMatrix4fv(U('uCabWorldToLocal'),false,cab.worldToCab);}gl.uniform1f(U('uDriveWetRoad'),driveStudyFrame?.weather?.roadWetness||0);for(let i=0;i<2;i++){const dir=driveStudyFrame?.inspectionLights?.[i]?.direction||[0,0,0];gl.uniform4f(U('uDriveInspection['+i+']'),dir[0],dir[1],dir[2],driveStudyFrame?.inspectionLights?.[i]?1:0);}gl.uniformMatrix4fv(U('uView'),false,viewMatrix);gl.uniformMatrix4fv(U('uProj'),false,projection);gl.uniform3fv(U('uEye'),eye);gl.uniform3fv(U('uForward'),torchForward);gl.uniform3fv(U('uTorchOrigin'),torchFrame.origin);gl.uniform3fv(U('uTorchRight'),torchFrame.right);gl.uniform3fv(U('uTorchUp'),torchFrame.up);gl.uniform1f(U('uLight'),light);gl.uniform1f(U('uTimeSec'),Number(timeSec)||0);gl.uniform1f(U('uReducedMotion'),reducedMotion?1:0);gl.uniform3fv(U('uTorchColor'),torch.color||[1,.94,.82]);gl.uniform1f(U('uTorchReach'),torch.reach);gl.uniform2f(U('uTorchCone'),torch.coneInner,torch.coneOuter);gl.uniform1f(U('uTorchSpill'),Number(torch.spill??.05)||0);gl.uniform1f(U('uTorchShoulder'),torch.shoulder);gl.uniform3fv(U('uAmbientColor'),ambientColor);gl.uniform1f(U('uAmbientIntensity'),Number(ambientIntensity)||.022);gl.uniform3fv(U('uZoneTint[0]'),zoneTints);gl.uniform2fv(U('uFogOrigin'),fogOrigin);gl.uniform1f(U('uFogSize'),fogSize);gl.uniform1f(U('uCellMeters'),cellMeters);gl.uniform1i(U('uLocalLightCount'),localLightCount);gl.uniform1i(U('uLocalShadowIndex'),localShadowIndex);if(localLightPositions)gl.uniform4fv(U('uLocalLightPos[0]'),localLightPositions);if(localLightColors)gl.uniform4fv(U('uLocalLightColor[0]'),localLightColors);if(localLightPenetrations)gl.uniform1fv(U('uLocalLightPenetration[0]'),localLightPenetrations);if(localLightEmergency)gl.uniform1fv(U('uLocalLightEmergency[0]'),localLightEmergency);gl.uniform4fv(U('uLocalLightDirection[0]'),localLightDirections||EMPTY_LIGHT_DIRECTIONS);gl.uniform1fv(U('uLocalLightConeInner[0]'),localLightConeInner||EMPTY_LIGHT_CONE_INNER);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fogTexture);gl.uniform1i(U('uFogTex'),1);gl.uniform1f(U('uShadowReady'),shadowActive?1:0);gl.uniformMatrix4fv(U('uShadowMatrix'),false,shadowMatrix);gl.uniform2f(U('uShadowTexel'),1/Math.max(1,shadowSize),1/Math.max(1,shadowSize));gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,shadowDepthTex);gl.uniform1i(U('uShadowTex'),6);gl.uniform1f(U('uPlanReady'),planTexture&&planSize[0]>0&&planSize[1]>0?1:0);gl.uniform2f(U('uPlanSize'),planSize[0]||0,planSize[1]||0);gl.uniform2f(U('uPlanOrigin'),planOrigin[0]||0,planOrigin[1]||0);gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,planTexture);gl.uniform1i(U('uPlanTex'),7);
  {const c=curvedSpaceUniforms(curvedSpace);gl.uniform4fv(U('uCurvedSpace'),c.space);gl.uniformMatrix4fv(U('uCurvedEye'),false,c.eye);}
  // Bind the current owner's physical aperture for both main and reflected draws.
  gl.uniform1i(U('uSourceSurroundingsSide'),0);
  gl.uniform4f(U('uSourceSurroundingsGate'),sourceSurroundingsGate.x,sourceSurroundingsGate.y,sourceSurroundingsGate.z,sourceSurroundingsGate.width);
  gl.uniform3f(U('uSourceSurroundingsGateFrame'),sourceSurroundingsGate.height,sourceSurroundingsGate.normalX,sourceSurroundingsGate.normalZ);
  const matrices=new WeakMap();
  // Bounds are authored. A nonlinear vertex projection invalidates their old
  // frustum planes; conservatively submit the small nearby room for these ten
  // seconds, while canonical distance/LOD culling remains authoritative.
  const groups=natatoriumMetric.k||curvedSpace.sign
    ?visibleGroups(eye,maxDistance,{lodEye:eye,reflection,frustum:null,matrices})
    :visibleGroups(eye,maxDistance,{lodEye:eye,reflection,frustum:viewFrustum(viewMatrix,projection),matrices});
  if(!reflection)roofWatcherDrawnIds=[...groups.values()].flatMap(list=>list.filter(i=>ROOF_WATCHERS.some(w=>w.id===i.id)).map(i=>i.id));
  if(!reflection)litApparitionsVisible=[...groups.values()].some((list)=>list.some((instance)=>
    !instance.shadowOnly&&Number(instance.apparitionVariant??instance.portraitIndex)===10));
  if(reflection){lastReflectionInstances=0;lastReflectionOnly=0;for(const list of groups.values()){lastReflectionInstances+=list.length;lastReflectionOnly+=list.filter((i)=>i.reflectionOnly).length;}}
  // Unit9 belongs to vertex morphs; unit10 is the optional world-paper data
  // atlas. The main fragment program uses nine samplers, below WebGL2's16.
  gl.uniform1f(U('uUsePaperMaterial'),paperMaterialAtlas?1:0);gl.uniform2fv(U('uPaperMaterialTexel'),paperMaterialTexel);gl.uniform1f(U('uPaperHeightRangeM'),paperHeightRangeM);
  gl.activeTexture(gl.TEXTURE10);gl.bindTexture(gl.TEXTURE_2D,paperMaterialAtlas);gl.uniform1i(U('uPaperMaterial'),10);
  // These values are properties of each material or group. Adjacent draws
  // often share them; skip duplicate WebGL calls only within this program pass.
  // The cache starts empty each pass, so shadow/reflection/other renderers can
  // change programs freely without leaving stale values on the next draw.
  const materialScalars = new Map();
  const setMaterialScalar = (name,value) => {
    if(materialScalars.has(name)&&Object.is(materialScalars.get(name),value))return;
    materialScalars.set(name,value);
    gl.uniform1f(U(name),value);
  };
  // The atlas and morph bindings use different units, so material units can
  // retain their last bindings across adjacent primitives within this pass.
  const materialTextures = new Map();
  const setMaterialTexture = (unit,texture) => {
    if(materialTextures.has(unit)&&materialTextures.get(unit)===texture)return;
    materialTextures.set(unit,texture);
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D,texture);
  };
  // These samplers and atlas textures belong to the program/pass, not to an
  // individual material. Character morphs use unit 9 and do not touch them.
  gl.uniform1i(U('uTex'),0);gl.uniform1i(U('uNormalTex'),4);gl.uniform1i(U('uOrmTex'),5);
  gl.uniform1i(U('uPaperAtlas'),8);gl.uniform1i(U('uPortraitAtlas'),2);
  gl.uniform2f(U('uPaperAtlasGrid'),paperAtlasGrid[0],paperAtlasGrid[1]);
  gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,paperAtlas);
  gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,portraitAtlas);
  for(const [key,list] of groups){const marker=key.indexOf('\0portal:'),name=marker<0?key:key.slice(0,marker),m=pack?.catalog.get(groupMeshName(name));if(!m||!list.length)continue;bindCharacterPose(U,m,list[0]);const wind=m.extras?.vegetationWind||{};gl.uniform4f(U('uVegetationWind'),Number(wind.amplitudeM)||0,Number(wind.frequencyHz)||0,Number(wind.anchorY)||0,propWindHeight(wind));uploadInstances(m,list,matrices);
    const fold=list[0].outskirtsFoldVisibility;gl.uniform2f(U('uOutskirtsFold'),Number.isFinite(fold)?1:0,Number.isFinite(fold)?fold:1);
    // The isolated street proof explicitly shares the existing outdoor sky
    // model. Other street meshes retain their current lighting treatment.
    setMaterialScalar('uSkyExposed',list.every(instance=>instance.skyExposed===true)?1:0);
    setMaterialScalar('uPubFrontSky',pubFrontSkyEligible(name,list)?1:0);
    if(activePropDiagnostics)activePropDiagnostics.renderedInstances+=list.length;
    gl.uniform4fv(U('uExteriorClipPlane'),list[0].exteriorClipPlane||[0,0,0,0]);
    const portalPlanes=portalClipArray(list[0].portalClipPlanes);gl.uniform1i(U('uMeshPortalClipCount'),portalPlanes?5:0);if(portalPlanes)gl.uniform4fv(U('uMeshPortalClipPlanes[0]'),portalPlanes);
    const portalExcludes=portalExcludeArray(list[0].portalExcludePlanes);gl.uniform1i(U('uMeshPortalExcludeCount'),portalExcludes?portalExcludes.length/20:0);if(portalExcludes)gl.uniform4fv(U('uMeshPortalExcludePlanes[0]'),portalExcludes);
    bindSourceSurroundingsPresentation(U,list[0].sourceWorldMatrix);
    const portal=list[0].exteriorPortal;gl.uniform4fv(U('uExteriorPortalA'),portal?portal.slice(0,4):[0,0,0,0]);gl.uniform3f(U('uExteriorPortalB'),portal?.[4]||0,portal?.[5]||0,portal?1:0);
    for(const p of m.primitives){setMaterialScalar('uRecordingFace',m.extras?.recordingEmbodiment===true?1:0);setMaterialScalar('uStillnessWallProxy',p.materialRole==='stillness-wall-proxy'?1:0);setMaterialScalar('uStillnessProxyMaterial',Number(p.stillnessProxyMaterial)||0);setMaterialScalar('uStillnessEligible',stillnessSurfaceEligible(m,p)?1:0);gl.uniform1i(U('uSourceSurroundingsSide'),sourceSurroundingsPrimitiveSide(p,list[0]));bindSourceSurroundingsPressureShape(U,p);setMaterialScalar('uGlassCourtRainMaterial',m.name==='glass_court_glass'&&p.materialName==='court sparse glazed reflection'?1:0);if(!reflection&&p.materialRole==='missing-man-core')missingManCoreVisible=true;setMaterialScalar('uMissingManCore',p.materialRole==='missing-man-core'?1:0);setMaterialScalar('uMissingManSmoke',p.materialRole==='missing-man-smoke'?1:0);setMaterialScalar('uFountainWater',p.materialName==='fountain running water'?1:0);setMaterialScalar('uPubFasciaPaint',pubFrontFasciaEligible(name,p,list)?1:0);setMaterialScalar('uDriveInterior',/^drive_(cabin|radio|wheel|wiper|speed|recorder|right|left)/.test(name)?1:0);setMaterialScalar('uCabInterior',/^(?:(?:opening_)?drive_(?:cabin|radio|wheel|speed|recorder))/.test(name)?1:name==='ending_van_cup'?.55:0);setMaterialScalar('uDriveSurface',p.worldVideo?3:driveStudyFrame||name==='opening_drive_radio_readout'?(p.driveStudySurface||0):0);setMaterialScalar('uDriveWetSurface',(name==='drive_road'||name==='drive_plain_paving')?1:0);const factors=p.mainFactors||(p.mainFactors=propMaterialFactors({roughness:p.roughness??1,metallic:p.metallic??0,hasOrm:!!p.ormTexture,semantics:p.materialFactors}));bindMeshCharacterMorph(U,m,p);gl.bindVertexArray(p.vao);setMaterialScalar('uAcademicHollow',academicAtriumHollowKind(m.name));setMaterialScalar('uRenFold',p.materialRole==='margin'?2:p.materialRole==='fold'?1:0);setMaterialScalar('uQuietFireEscape',p.materialRole==='quiet-metal'?1:0);setMaterialScalar('uRoofSurface',p.materialRole==='weathered-surface'?1:0);setMaterialScalar('uSourceChunkError',p.materialRole==='source-chunk-error'?1:0);setMaterialScalar('uSourceWalkway',p.printedSurface?.family==='source-ii-route'?1:0);const cleanSourceCode=(sourceRoomLighting||sourceCodeScreen)&&sourceCodeMaterialEligible(p);setMaterialScalar('uSourceCodeClean',cleanSourceCode?1:0);if(cleanSourceCode)gl.uniform3fv(U('uSourceCodeStock'),sourceCodeStock(p));setMaterialScalar('uRoofGlass',(name==='academic_roof_glazing'||name==='academic_roof_seat')&&p.materialName==='wired roof glass'?1:0);setMaterialScalar('uPayphoneCast',p.materialName==='payphone cast iron'?1:0);const print=p.printedSurface||(name.startsWith('loose_note')&&paperAtlasHasPigment?PAPER_PIGMENT_SURFACE:null);gl.uniform3f(U('uPrintedSurface'),PRINTED_SURFACE_POLARITY[print?.polarity]||0,print?.coverage==='solid'?1:0,print?.emission==='substrate'?1:print?.emission==='pigment'?2:0);setMaterialScalar('uPrintedAreaCoverage',print?.sampling==='area'?1:0);gl.uniform3fv(U('uBase'),p.base.slice(0,3));gl.uniform3fv(U('uMaterialEmissive'),p.emissive||[0,0,0]);gl.uniform4f(U('uVegetation'),VEGETATION_CLASS[p.vegetationClass]||0,p.vegetationTransmission||0,p.vegetationWetness||0,0);setMaterialScalar('uBaseAlpha',p.base[3]??1);setMaterialScalar('uAlphaCut',p.alphaCut);const street=streetTextures&&!p.texture?streetSetFor(p.materialName):null;setMaterialScalar('uStreetTex',street?1:0);setMaterialScalar('uStreetOrmEnabled',street?.ormTexture?1:0);setMaterialScalar('uStreetMix',street?street.mix:0);setMaterialScalar('uStreetScale',street?street.scale:1);setMaterialScalar('uUseTex',p.texture?1:0);setMaterialScalar('uUseNormal',!cleanSourceCode&&p.normalTexture?1:0);setMaterialScalar('uUseOrm',!cleanSourceCode&&p.ormTexture?1:0);setMaterialScalar('uNormalScale',p.normalScale??1);setMaterialScalar('uAoStrength',p.aoStrength??0);setMaterialScalar('uMetallic',cleanSourceCode?0:factors.metallic);setMaterialScalar('uRoughness',cleanSourceCode?.90:factors.roughness);setMaterialScalar('uStreetRoughnessFactor',factors.streetRoughnessFactor);setMaterialScalar('uLetteringFinish',!cleanSourceCode&&(p.letteringFinish?.localSpecular||((driveStudyFrame||physicalStudyMaterials)&&p.studyLocalFinish))?1:0);setMaterialScalar('uDriveTissue',driveStudyFrame&&p.cutTissue?1:0);gl.uniform2f(U('uTissueSurface'),p.tissueSurface?.preservePigment||(sourceBodyTissue&&p.cutTissue)?1:0,p.tissueSurface?.localSpecular||(sourceBodyTissue&&p.cutTissue)?1:0);setMaterialScalar('uUsePortrait',p.portrait&&portraitAtlas?1:0);setMaterialScalar('uUsePaperAtlas',name.startsWith('loose_note')&&paperAtlas?1:0);setMaterialTexture(0,street?.texture||p.texture);setMaterialTexture(4,p.normalTexture);setMaterialTexture(5,street?.ormTexture||p.ormTexture);gl.drawElementsInstanced(gl.TRIANGLES,p.count,p.indexType,0,list.length);if(activePropDiagnostics){activePropDiagnostics.mainDrawCalls+=1;activePropDiagnostics.mainDrawCallsByMesh[m.name]=(activePropDiagnostics.mainDrawCallsByMesh[m.name]||0)+1;activePropDiagnostics.triangles+=p.count/3*list.length;if(p.materialRole)activePropDiagnostics.visibleMaterialRoles.add(p.materialRole);}}
  }
  gl.uniform1i(U('uSourceSurroundingsSide'),0);
  if(!reflection){sourceCodeFrame=sourceRoomLighting||sourceCodeScreen?{eye:[...eye],yaw,pitch,viewMatrix,projection,maxDistance,timeSec,reducedMotion,patternOriginOffsetMetres:[...patternOriginOffsetMetres]}:null;renderSourceText(viewMatrix,projection,eye,forward,maxDistance,{sourceRoomLighting,sourceCodeScreen,torch,torchForward,torchFrame,light,ambientColor,ambientIntensity,localLightCount,localLightPositions,localLightColors,localLightEmergency});marksReady=!!sourceRoomLighting;}
  if(!reflection&&driveStudyFrame?.retroreflectors)drawDriveRetroreflectors(viewMatrix,projection,eye,localLightPositions,localLightColors,height);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  if(activePropDiagnostics){lastPropDiagnostics={visibleMaterialRoles:[...activePropDiagnostics.visibleMaterialRoles].sort(),mainDrawCalls:activePropDiagnostics.mainDrawCalls,mainDrawCallsByMesh:activePropDiagnostics.mainDrawCallsByMesh,shadowDrawCalls:activePropDiagnostics.shadowDrawCalls,renderedInstances:activePropDiagnostics.renderedInstances,triangles:activePropDiagnostics.triangles,shadowTriangles:activePropDiagnostics.shadowTriangles};activePropDiagnostics=null;}
  gl.bindVertexArray(null);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true;
}

export function propPackStats(){return pack?{meshes:pack.catalog.size,instances:staticInstances.length,dynamicInstances:dynamicInstances.length,litApparitionsVisible,diagnosticInstances:propDiagnosticsEnabled?diagnosticInstances.length:0,diagnosticMeshes:propDiagnosticsEnabled?diagnosticInstances.map((instance)=>({mesh:instance.mesh,loaded:pack.catalog.has(instance.mesh),x:instance.x,y:instance.y,z:instance.z})):null,diagnosticOptions:propDiagnosticsEnabled?{exclusive:!!propDiagnosticOptions?.exclusive,excludedMeshes:[...(propDiagnosticOptions?.excludedMeshes||[])]}:null,emergencyShadowInstances:emergencyShadowInstances.length,sourceText:sourceStaticTextInstances.length+sourceDynamicTextInstances.length,sourceStaticText:sourceStaticTextInstances.length,sourceDynamicText:sourceDynamicTextInstances.length,sourceStaticBatches:sourceStaticTextBatches.length,sourceVisibleBatches:sourceVisibleBatchCount,sourceVisibleInstances:sourceVisibleInstanceCount,sourceTextVisibleCap:SOURCE_TEXT_VISIBLE_CAP,sourceSceneKey,sourceCorpusKey,textAtlasBuilds,textAtlasSize,textAtlasCapacity,textAtlasEntries:textAtlasEntryCount,textAtlasDiagnostics:sourceTextAtlasDiagnostics,diagnosticsEnabled:propDiagnosticsEnabled,diagnostics:propDiagnosticsEnabled?lastPropDiagnostics:null,shadow:{ready:shadowReady,active:shadowActive,size:shadowSize}}:null;}
export function propInstanceIds(){return staticInstances.map((instance)=>instance.id);}
export function props3dDebugShaders(){return {vertex:VERT,fragment:FRAG,textVertex:TEXT_VERT,textFragment:TEXT_FRAG,shadowVertex:SHADOW_VERT,shadowFragment:SHADOW_FRAG,pressureVertex:VERT,pressureFragment:PRESSURE_FRAG};}
// Read-only evidence from the linked program and meshes actually submitted.
// Only the DEV review requests this; ordinary rendering performs no readback.
export function props3dStillnessStatus(){
  const ready=!!(gl&&program&&!gl.isContextLost()&&gl.getProgramParameter(program,gl.LINK_STATUS));
  const shaders=ready?gl.getAttachedShaders(program)||[]:[];
  const fragment=shaders.find(s=>gl.getShaderParameter(s,gl.SHADER_TYPE)===gl.FRAGMENT_SHADER);
  const source=fragment?gl.getShaderSource(fragment)||'':'';
  const read=name=>{if(!ready)return null;const location=U(name);return location?Array.from(gl.getUniform(program,location)||[]):null;};
  const meshes=Object.keys(lastPropDiagnostics?.mainDrawCallsByMesh||{}).slice(0,80).map(name=>{
    const mesh=pack?.catalog.get(name);return{name,eligible:mesh?.primitives.some(p=>stillnessSurfaceEligible(mesh,p))||false,
      materials:mesh?.primitives.slice(0,5).map(p=>({name:p.materialName,role:p.materialRole,eligible:stillnessSurfaceEligible(mesh,p)}))||[]};
  });
  return{ready,frame:stillnessPresentation(),state:read('uStillnessState'),anchor:read('uStillnessAnchor'),
    shader:{driverSourceAvailable:!!source,revision:source.match(/stillness-material-version:([a-z0-9-]+)/)?.[1]||null,
      relief:source.includes('stillnessFaceRelief'),pigment:source.includes('printedCoverage=stillnessFacePigment')},meshes};
}

// ── ELSEWHERE, THROUGH A DOOR FRAME ─────────────────────────────────────────
//
// The outskirts' open door frames do not show the void behind them. Each opening
// is drawn as a quad into the prop target, depth-tested and depth-writing like
// any mesh, and paints a landscape that is not here: looked up by the view ray,
// so it sits infinitely far behind the frame and parallaxes like a place rather
// than a picture. Only the front shows it; from behind, the frame is a frame.
import { ELSEWHERE_GLSL } from './elsewhere-glsl.js';

// SOMEWHERE ELSE, BEHIND AN OPEN DOOR. The opening is a quad in the world; the
// world behind it is marched in the door's own space (elsewhere-glsl.js), so it
// has depth and moves as you do.
const PORTAL_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aSeed;
layout(location=3) in vec3 aNormal;
layout(location=4) in vec4 aFrame;
uniform mat4 uView,uProj;
out vec3 vWorld;out vec2 vUv;flat out vec4 vSeed;flat out vec3 vNormal;flat out vec4 vFrame;
void main(){vWorld=aPos;vUv=aUv;vSeed=aSeed;vNormal=aNormal;vFrame=aFrame;gl_Position=uProj*uView*vec4(aPos,1.0);}`;
const PORTAL_FRAG=`#version 300 es
precision highp float;
in vec3 vWorld;in vec2 vUv;flat in vec4 vSeed;flat in vec3 vNormal;flat in vec4 vFrame;
uniform vec3 uEye;uniform float uTime,uCalm,uMarksPhysical;
layout(location=0) out vec4 o;
layout(location=2) out vec4 oSurfaceMarks;
${PRINTED_SURFACE_GLSL}
${ELSEWHERE_GLSL}
void main(){
  vec3 ray=normalize(vWorld-uEye);
  // From behind, an opening is only an opening.
  if(dot(ray,vNormal)>=0.0)discard;
  // Into the door's own space: x right, y up from the threshold, z into the world.
  vec3 f=normalize(vec3(-vNormal.x,0.0,-vNormal.z));
  vec3 r=vec3(-f.z,0.0,f.x);
  vec3 d=uEye-vFrame.xyz;
  vec3 ro=vec3(dot(d,r),d.y,dot(d,f));
  vec3 rd=vec3(dot(ray,r),ray.y,dot(ray,f));
  // The world begins at the opening, not at the eye.
  ro+=rd*max(0.0,-ro.z/max(.001,rd.z));
  vec3 c=elsewhereScene(ro,rd,int(vSeed.x+.5),vSeed.y,vSeed.z,uTime,uCalm);
  float edge=smoothstep(0.0,.035,min(min(vUv.x,1.0-vUv.x),1.0-vUv.y));
  o=vec4(c*mix(.25,1.0,edge),1.0);
  oSurfaceMarks=uMarksPhysical>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
}`;
// THE CROSSING. Walking through an open door is a few seconds stood inside its
// world: it grows out of a doorway to the edges of sight, holds, and folds back
// down to a doorway and shuts. Drawn over the composed frame, so it is displayed
// the way the prop pass is.
const CROSSING_VERT=`#version 300 es
layout(location=0) in vec2 aPos;
void main(){gl_Position=vec4(aPos,0.0,1.0);}`;
const CROSSING_FRAG=`#version 300 es
precision highp float;
uniform vec2 uRes,uDir;
uniform float uPitch,uTime,uCalm,uReveal,uRealmDepth;
uniform vec4 uWorld;
uniform vec3 uRealmEye;
out vec4 o;
${ELSEWHERE_GLSL}
vec3 crossingDisplay(vec3 linear){
  vec3 low=linear*12.92;
  vec3 high=1.055*pow(max(linear,vec3(0.0)),vec3(1.0/2.4))-.055;
  return mix(low,high,step(vec3(.0031308),linear));
}
void main(){
  if(uReveal<.02)discard;
  vec2 ndc=gl_FragCoord.xy/uRes*2.0-1.0;
  float aspect=uRes.x/max(1.0,uRes.y);
  float w=mix(.16,1.7,uReveal),h=mix(.5,1.7,uReveal);
  float inside=min(w-abs(ndc.x),h-abs(ndc.y));
  if(inside<0.0)discard;
  vec3 fwd=normalize(vec3(uDir.x*cos(uPitch),sin(uPitch),uDir.y*cos(uPitch)));
  vec3 right=normalize(vec3(uDir.y,0.0,-uDir.x));
  vec3 up=cross(fwd,right);
  vec3 rd=normalize(fwd+right*ndc.x*aspect*.95+up*ndc.y*.95);
  // The whiteout's walk goes toward its one lit window (x 70 at z 420): walked far
  // enough, as on the way home, the camera arrives at it. An ordinary crossing drifts
  // only a couple of metres, so the lean is nothing.
  float towardHome=step(4.5,uWorld.x)*step(uWorld.x,5.5);
  vec3 ro=uRealmActive>.5?uRealmEye:vec3(uWorld.w*(70.0/420.0)*towardHome,1.6,2.0+uWorld.w);
  float loss=clamp(uRealmDecoherence,0.0,1.0);
  if(uRealmActive>.5&&uCalm<.5){
    if(uWorld.x>1.5&&uWorld.x<2.5)rd.y=mix(rd.y,-rd.y,loss*.46);
    if(uWorld.x>3.5&&uWorld.x<4.5){
      float fracture=floor(ndc.x*5.0+ndc.y*2.0);
      rd.x+=sin(fracture*7.1)*loss*.13;rd=normalize(rd);
    }
  }
  float surfaceHit;
  vec3 c=elsewhereSceneDepth(ro,rd,int(uWorld.x+.5),uWorld.y,uWorld.z,uTime,uCalm,surfaceHit);
  // Material failures resolve abruptly into the waiting station during the last
  // part of the automatic reassembly. No white flash or injury tint.
  float cohesion=1.0-smoothstep(.84,1.0,loss);
  float packedDepth=1.0/(1.0+surfaceHit*max(.001,dot(rd,fwd))*.14);
  // The bedroom joins the linear scene target before acquisition. Encoding it
  // for a display here washes out lamplight and cloth in the later engraving.
  vec3 sceneColour=uHomeState.x>.5?clamp(c,0.0,1.0):crossingDisplay(clamp(c,0.0,1.0));
  o=vec4(sceneColour,uRealmDepth>.5?packedDepth:smoothstep(0.0,.04,inside)*cohesion);
}`;
// CAT'S EYES. Seb, 2026-11-06 (Northern drives audit). Road studs return the
// van's own beam straight back at the driver, so a line of them draws the road's
// curve far past what the lamps light. As geometry they are 15 cm lenses and
// fall below a pixel within a few metres, where the dither drops them. Here
// each stud is a point, depth-tested against the props, lit by the same UK
// dipped beam (dipped-beam.js) plus the little light every real lamp spills
// above its cut-off, and brighter the closer the eye is to the lamp's axis:
// near studs, seen from well above the lamps, are dimmer than the ones at fifty
// metres. Added into colour only, so depth, marks and material tags are kept.
const RETRO_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec4 aStud;
uniform mat4 uView,uProj;uniform vec3 uEye;uniform vec4 uLamp[2];uniform vec2 uBeam;uniform vec3 uSize;uniform float uGain,uSpill,uForce;
out float vLevel;
${DIPPED_BEAM_GLSL}
void main(){
  vec3 p=aStud.xyz;float lit=0.0;
  for(int i=0;i<2;i++){
    vec3 ray=p-uLamp[i].xyz;float d=max(length(ray),.1);
    float observation=acos(clamp(dot(-ray/d,normalize(uEye-p)),-1.0,1.0));
    float beam=ukDippedBeam(ray,uBeam.x,uBeam.y)+uSpill*ukDippedBeam(ray,uBeam.x,uBeam.y-.05);
    lit+=uLamp[i].w*beam*exp(-observation/.022)/(1.0+pow(d/90.0,2.0));
  }
  float dist=length(p-uEye);
  // Retroreflection is efficient: a lit stud is a bright point; distance shows as size.
  vLevel=(1.0-exp(-lit*aStud.w*uGain))*(1.0-smoothstep(170.0,240.0,dist));
  if(uForce>.5)vLevel=1.0; // review captures only
  gl_Position=uProj*uView*vec4(p,1.0);
  gl_PointSize=vLevel<.06?0.0:max(uSize.y,min(uSize.z,uSize.x*.10/max(dist,.1))*(.7+.6*vLevel));
}`;
const RETRO_FRAG=`#version 300 es
precision highp float;
in float vLevel;
layout(location=0) out vec4 o;
void main(){
  vec2 q=gl_PointCoord*2.0-1.0;if(dot(q,q)>1.0)discard;
  o=vec4(vec3(1.25)*smoothstep(.12,.42,vLevel),0.0);
}`;
export const DRIVE_RETROREFLECTOR=Object.freeze({gain:10,spill:.18,minPx:2.4,maxPx:7,lift:.03,limit:96});
// Live tuning for review captures; the game never calls it.
let retroTuning=DRIVE_RETROREFLECTOR;
export function setDriveRetroreflectorTuning(overrides=null){retroTuning=overrides?{...DRIVE_RETROREFLECTOR,...overrides}:DRIVE_RETROREFLECTOR;return retroTuning;}
let retroProgram=null,retroProgramPending=null,retroProgramFailed=false,retroVao=null,retroBuffer=null,lastRetroDrawn=0;
const retroUniforms=new Map();
function RU(name){if(!retroUniforms.has(name))retroUniforms.set(name,gl.getUniformLocation(retroProgram,name));return retroUniforms.get(name);}
export function driveRetroreflectorShaders(){return{vertex:RETRO_VERT,fragment:RETRO_FRAG};}
export function driveRetroreflectorsDrawn(){return lastRetroDrawn;}
function resetRetroreflectorProgram(){
  retroProgramPending?.dispose?.();
  if(gl){if(retroProgram)gl.deleteProgram(retroProgram);if(retroVao)gl.deleteVertexArray(retroVao);if(retroBuffer)gl.deleteBuffer(retroBuffer);}
  retroProgram=null;retroProgramPending=null;retroProgramFailed=false;retroVao=null;retroBuffer=null;retroUniforms.clear();
}
function drawDriveRetroreflectors(viewMatrix,projection,eye,lampPositions,lampColors,targetHeight){
  lastRetroDrawn=0;
  const studs=driveStudyFrame?.retroreflectors;
  if(!gl||gl.isContextLost()||retroProgramFailed||!Array.isArray(studs)||!studs.length||!lampPositions||!lampColors)return 0;
  if(!retroProgram){
    try{
      retroProgramPending ||= deferGlProgram(gl,RETRO_VERT,RETRO_FRAG,'drive retroreflectors');
      retroProgram=retroProgramPending.poll();if(!retroProgram)return 0;
    }catch(error){retroProgramPending?.dispose?.();retroProgramPending=null;retroProgramFailed=true;console.warn('Drive cat\'s eyes unavailable',error);return 0;}
    retroProgramPending=null;retroUniforms.clear();
    retroVao=gl.createVertexArray();retroBuffer=gl.createBuffer();
    gl.bindVertexArray(retroVao);gl.bindBuffer(gl.ARRAY_BUFFER,retroBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);
    gl.bindVertexArray(null);
  }
  const R=retroTuning,count=Math.min(R.limit,studs.length),data=new Float32Array(count*4);
  for(let i=0;i<count;i++){const s=studs[i];data.set([s.x,s.y+R.lift,s.z,Number.isFinite(s.gain)?s.gain:1],i*4);}
  const lamp=k=>{const on=(Number(lampColors[k*4+3])||0)>0?1:0;return[lampPositions[k*4],lampPositions[k*4+1],lampPositions[k*4+2],on];};
  // The text pass before this may leave its own target bound: draw into the prop target.
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);gl.blendEquation(gl.FUNC_ADD);gl.blendFunc(gl.ONE,gl.ONE);
  gl.useProgram(retroProgram);
  gl.uniformMatrix4fv(RU('uView'),false,viewMatrix);gl.uniformMatrix4fv(RU('uProj'),false,projection);
  gl.uniform3fv(RU('uEye'),eye);gl.uniform4fv(RU('uLamp[0]'),[...lamp(0),...lamp(1)]);
  gl.uniform2f(RU('uBeam'),driveStudyFrame.heading||0,driveStudyFrame.lampDip??.02);
  gl.uniform3f(RU('uSize'),projection[5]*targetHeight/2,R.minPx,R.maxPx);gl.uniform1f(RU('uGain'),R.gain);gl.uniform1f(RU('uSpill'),R.spill);gl.uniform1f(RU('uForce'),R.force?1:0);
  gl.bindVertexArray(retroVao);gl.bindBuffer(gl.ARRAY_BUFFER,retroBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.POINTS,0,count);gl.bindVertexArray(null);
  gl.disable(gl.BLEND);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);
  lastRetroDrawn=count;return count;
}
let portalProgram=null,portalProgramPending=null,portalProgramFailed=false,portalVao=null,portalBuffer=null;
const portalUniforms=new Map();
function PU(name){if(!portalUniforms.has(name))portalUniforms.set(name,gl.getUniformLocation(portalProgram,name));return portalUniforms.get(name);}
export function sourcePortalShaders(){return{vertex:PORTAL_VERT,fragment:PORTAL_FRAG};}
export function sourceCrossingShaders(){return{vertex:CROSSING_VERT,fragment:CROSSING_FRAG};}
export function sourcePortalProgramReady(){return !!(gl&&portalProgram&&gl.isProgram(portalProgram));}
function resetSourceDoorPrograms(){
  resetRetroreflectorProgram();
  portalProgramPending?.dispose?.();towerViewProgramPending?.dispose?.();
  if(gl){
    for(const p of [portalProgram,towerViewProgram,openingProgram,crossingProgram])if(p)gl.deleteProgram(p);
    for(const v of [portalVao,towerViewVao,openingVao,crossingVao])if(v)gl.deleteVertexArray(v);
    for(const b of [portalBuffer,towerViewBuffer,openingBuffer])if(b)gl.deleteBuffer(b);
  }
  portalProgram=null;portalProgramPending=null;portalProgramFailed=false;portalVao=null;portalBuffer=null;
  towerViewProgram=null;towerViewProgramPending=null;towerViewProgramFailed=false;towerViewVao=null;towerViewBuffer=null;
  openingProgram=null;openingVao=null;openingBuffer=null;crossingProgram=null;crossingVao=null;
  portalUniforms.clear();towerViewUniforms.clear();crossingUniforms.clear();
}
// Each open door is a marched world, so only the nearest few are drawn.
const PORTAL_LIMIT=4;
export function renderSourcePortals({camX,camY,camZ,yaw,pitch=0,portals=[],timeSec=0,reducedMotion=false,stormFlash=0}={}){
  if(!gl||gl.isContextLost()||portalProgramFailed||!fbo||!Array.isArray(portals)||!portals.length)return 0;
  const eye=[camX,camY,camZ];
  const originOf=(portal)=>{
    if(Array.isArray(portal?.origin)&&portal.origin.length===3)return portal.origin;
    const c=portal?.corners;
    return Array.isArray(c)&&c.length===4?[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2,(c[0][2]+c[1][2])/2]:null;
  };
  const viewMatrix=view(eye,yaw,pitch),projection=perspective(width/height),frustum=viewFrustum(viewMatrix,projection);
  const nearest=portals.map((portal)=>({portal,origin:originOf(portal)}))
    .filter(({portal,origin})=>origin&&Array.isArray(portal.corners)&&portal.corners.length===4
      &&(!portal.normal||(eye[0]-origin[0])*portal.normal[0]+(eye[1]-origin[1])*portal.normal[1]+(eye[2]-origin[2])*portal.normal[2]>0)
      &&quadInView(frustum,portal.corners))
    .sort((a,b)=>Math.hypot(a.origin[0]-eye[0],a.origin[2]-eye[2])-Math.hypot(b.origin[0]-eye[0],b.origin[2]-eye[2]))
    .slice(0,PORTAL_LIMIT);
  if(!nearest.length)return 0;
  if(!portalProgram){
    try{
      portalProgramPending ||= deferGlProgram(gl,PORTAL_VERT,PORTAL_FRAG,'source portal');
      portalProgram=portalProgramPending.poll();if(!portalProgram)return 0;
    }catch(error){portalProgramPending?.dispose?.();portalProgramPending=null;portalProgramFailed=true;console.warn('Source portal preview unavailable',error);return 0;}
    portalProgramPending=null;portalUniforms.clear();
    portalVao=gl.createVertexArray();portalBuffer=gl.createBuffer();
    gl.bindVertexArray(portalVao);gl.bindBuffer(gl.ARRAY_BUFFER,portalBuffer);
    const stride=64;
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,stride,0);
    gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,2,gl.FLOAT,false,stride,12);
    gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,4,gl.FLOAT,false,stride,20);
    gl.enableVertexAttribArray(3);gl.vertexAttribPointer(3,3,gl.FLOAT,false,stride,36);
    gl.enableVertexAttribArray(4);gl.vertexAttribPointer(4,4,gl.FLOAT,false,stride,48);
    gl.bindVertexArray(null);
  }
  const data=new Float32Array(nearest.length*96),uv=[[0,0],[1,0],[1,1],[0,1]];let vertices=0;
  for(const {portal,origin} of nearest){
    const corners=portal.corners,normal=portal.normal||[0,0,1];
    for(const k of[0,1,2,0,2,3]){
      data.set([corners[k][0],corners[k][1],corners[k][2],uv[k][0],uv[k][1],Number(portal.variant)||0,Number(portal.seed)||0,portal.key?1:0,0,
        normal[0],normal[1],normal[2],origin[0],origin[1],origin[2],0],vertices*16);
      vertices+=1;
    }
  }
  if(!vertices)return 0;
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.NONE,gl.COLOR_ATTACHMENT2]);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.useProgram(portalProgram);
  gl.uniformMatrix4fv(PU('uView'),false,viewMatrix);gl.uniformMatrix4fv(PU('uProj'),false,projection);
  gl.uniform3fv(PU('uEye'),eye);gl.uniform1f(PU('uTime'),reducedMotion?0:Number(timeSec)||0);gl.uniform1f(PU('uCalm'),reducedMotion?1:0);gl.uniform1f(PU('uStormFlash'),Number(stormFlash)||0);gl.uniform1f(PU('uMarksPhysical'),marksReady?1:0);
  gl.bindVertexArray(portalVao);gl.bindBuffer(gl.ARRAY_BUFFER,portalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,data.subarray(0,vertices*16),gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES,0,vertices);gl.bindVertexArray(null);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  return vertices/6;
}

// ST BRENDAN'S BELFRY, THROUGH THE TOWER DOOR.
//
// The building renders the belfry once, off screen, from the arrival point
// (r3d.js r3dCaptureTowerView): its finished colour, and the march's view depth.
// Each pixel of the opening walks its own ray into that picture — a short march
// against the captured depth, refined where it lands — so the room keeps its
// parallax as he walks up to the door, and the view from the arrival point is
// the picture exactly. Past the plane, in the doorway, it is the whole screen.
const TOWER_VIEW_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uView,uProj;uniform float uMode;
void main(){gl_Position=uMode>.5?vec4(aPos.xy,-1.0,1.0):uProj*uView*vec4(aPos,1.0);}`;
const TOWER_VIEW_FRAG=`#version 300 es
precision highp float;
uniform vec2 uRes;uniform vec3 uEye;uniform float uYaw,uPitch,uMode,uMarksPhysical;
uniform sampler2D uViewColor,uViewDepth;
uniform vec3 uViewEye;uniform float uViewYaw,uViewAspect;
uniform vec3 uOrigin;uniform vec2 uForward;
layout(location=0) out vec4 o;
layout(location=2) out vec4 oSurfaceMarks;
${PRINTED_SURFACE_GLSL}
vec3 towerLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec2 towerProject(vec3 p,vec3 vf,vec3 vr,out float z){
  z=dot(p,vf);
  return vec2(dot(p,vr)/(max(z,.001)*.95*uViewAspect),p.y/(max(z,.001)*.95))*.5+.5;
}
float towerDepth(vec2 uv){float a=texture(uViewDepth,uv).a;return (1.0/max(a,1e-4)-1.0)/.14;}
void main(){
  // Both opening and full-screen doorway use ordinary vertex depth. Writing
  // gl_FragDepth here forced the expensive search behind nearer door geometry.
  oSurfaceMarks=uMarksPhysical>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);
  vec2 ndc=gl_FragCoord.xy/uRes*2.0-1.0;
  float aspect=uRes.x/max(1.0,uRes.y),cp=cos(uPitch);
  vec3 fwd=vec3(sin(uYaw)*cp,sin(uPitch),-cos(uYaw)*cp);
  vec3 right=vec3(cos(uYaw),0.0,sin(uYaw));
  vec3 up=cross(right,fwd);
  vec3 rd=normalize(fwd+right*ndc.x*aspect*.95+up*ndc.y*.95);
  vec3 f3=vec3(uForward.x,0.0,uForward.y);
  float eyeDepth=dot(uEye-uOrigin,f3),t0=.02;
  if(eyeDepth<0.0){float den=dot(rd,f3);if(den>1e-4)t0=-eyeDepth/den;else if(uMode<.5)discard;}
  vec3 vf=vec3(sin(uViewYaw),0.0,-cos(uViewYaw)),vr=vec3(cos(uViewYaw),0.0,sin(uViewYaw));
  float prevT=t0,tMax=t0+34.0,z;
  vec2 hit=vec2(-1.0),last=vec2(-1.0);
  for(int i=1;i<=64;i++){
    float k=float(i)/64.0,t=t0+(tMax-t0)*k*k;
    vec2 uv=towerProject(uEye+rd*t-uViewEye,vf,vr,z);
    if(z<.05||uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0){prevT=t;continue;}
    last=uv;
    float gap=z-towerDepth(uv);
    if(gap>=0.0&&gap<max(.3,.07*z)){
      float lo=prevT,hi=t;
      for(int j=0;j<6;j++){
        float m=(lo+hi)*.5;vec2 q=towerProject(uEye+rd*m-uViewEye,vf,vr,z);
        if(z>=towerDepth(q))hi=m;else lo=m;
      }
      hit=towerProject(uEye+rd*hi-uViewEye,vf,vr,z);
      break;
    }
    prevT=t;
  }
  if(hit.x<0.0)hit=last;
  if(hit.x<0.0){o=vec4(.0009,.0008,.0008,1.0);return;}
  o=vec4(towerLinear(texture(uViewColor,hit).rgb),1.0);
}`;
let towerViewProgram=null,towerViewProgramPending=null,towerViewProgramFailed=false,towerViewVao=null,towerViewBuffer=null;
const towerViewUniforms=new Map();
function TVU(name){if(!towerViewUniforms.has(name))towerViewUniforms.set(name,gl.getUniformLocation(towerViewProgram,name));return towerViewUniforms.get(name);}
export function sourceTowerViewShaders(){return{vertex:TOWER_VIEW_VERT,fragment:TOWER_VIEW_FRAG};}
// view: {corners, origin, forward, width, capture:{color, depth, eye, yaw, aspect}}.
// Returns 0 when nothing was drawn, 1 for the opening, 2 for the doorway.
export function renderSourceTowerView({camX,camY,camZ,yaw,pitch=0,view:tower=null,inside=false}={}){
  const capture=tower?.capture;
  if(!gl||gl.isContextLost()||towerViewProgramFailed||!fbo||!capture?.color||!capture?.depth||!Array.isArray(tower.corners)||tower.corners.length!==4)return 0;
  const eye=[camX,camY,camZ],f=tower.forward,o=tower.origin;
  const eyeDepth=(eye[0]-o[0])*f[0]+(eye[2]-o[2])*f[1];
  if(eyeDepth>=0&&!inside)return 0;
  if(!inside&&!quadInView(viewFrustum(view(eye,yaw,pitch),perspective(width/height)),tower.corners))return 0;
  if(!towerViewProgram){
    try{
      towerViewProgramPending ||= deferGlProgram(gl,TOWER_VIEW_VERT,TOWER_VIEW_FRAG,'source tower view');
      towerViewProgram=towerViewProgramPending.poll();if(!towerViewProgram)return 0;
    }catch(error){towerViewProgramPending?.dispose?.();towerViewProgramPending=null;towerViewProgramFailed=true;console.warn('Source tower preview unavailable',error);return 0;}
    towerViewProgramPending=null;towerViewUniforms.clear();
    towerViewVao=gl.createVertexArray();towerViewBuffer=gl.createBuffer();
    gl.bindVertexArray(towerViewVao);gl.bindBuffer(gl.ARRAY_BUFFER,towerViewBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
  }
  const c=tower.corners;
  const data=inside?new Float32Array([-1,-1,0,3,-1,0,-1,3,0])
    :new Float32Array([...c[0],...c[1],...c[2],...c[0],...c[2],...c[3]]);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.NONE,gl.COLOR_ATTACHMENT2]);
  gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.depthMask(true);
  // The doorway writes the nearest depth everywhere (a disabled depth test would
  // write none, and the composite would haze the belfry back into the field).
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(inside?gl.ALWAYS:gl.LEQUAL);
  gl.useProgram(towerViewProgram);
  gl.uniformMatrix4fv(TVU('uView'),false,view(eye,yaw,pitch));gl.uniformMatrix4fv(TVU('uProj'),false,perspective(width/height));
  gl.uniform1f(TVU('uMode'),inside?1:0);gl.uniform2f(TVU('uRes'),width,height);
  gl.uniform1f(TVU('uMarksPhysical'),marksReady?1:0);
  gl.uniform3fv(TVU('uEye'),eye);gl.uniform1f(TVU('uYaw'),Number(yaw)||0);gl.uniform1f(TVU('uPitch'),Number(pitch)||0);
  gl.uniform3fv(TVU('uViewEye'),capture.eye);gl.uniform1f(TVU('uViewYaw'),Number(capture.yaw)||0);gl.uniform1f(TVU('uViewAspect'),Number(capture.aspect)||1);
  gl.uniform3fv(TVU('uOrigin'),o);gl.uniform2f(TVU('uForward'),Number(f[0])||0,Number(f[1])||0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,capture.color);gl.uniform1i(TVU('uViewColor'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,capture.depth);gl.uniform1i(TVU('uViewDepth'),1);
  gl.bindVertexArray(towerViewVao);gl.bindBuffer(gl.ARRAY_BUFFER,towerViewBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES,0,data.length/3);gl.bindVertexArray(null);
  gl.depthFunc(gl.LEQUAL);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  return inside?2:1;
}

// A DOORWAY OF FLAT COLOUR. Which colour depends on which side of the doorway
// the eye stands: opening.front is the colour seen from the side the normal
// faces, opening.back from the other. Real depth, so the leaves and the frame
// still stand in front of it.
const OPENING_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uView,uProj;
void main(){gl_Position=uProj*uView*vec4(aPos,1.0);}`;
const OPENING_FRAG=`#version 300 es
precision highp float;
uniform vec3 uColour;
uniform float uAbsorbsLight,uMarksPhysical;
layout(location=0) out vec4 o;
layout(location=1) out vec4 absence;
layout(location=2) out vec4 oSurfaceMarks;
${PRINTED_SURFACE_GLSL}
void main(){o=vec4(uColour,1.0);absence=vec4(vec3(uAbsorbsLight),1.0);
  oSurfaceMarks=uMarksPhysical>.5?vec4(0.0,.5,.5,0.0):vec4(packPropWorldDepth(gl_FragCoord.z),0.0);}`;
let openingProgram=null,openingVao=null,openingBuffer=null;
export function renderSourceOpenings({camX,camY,camZ,yaw,pitch=0,openings=[]}={}){
  if(!gl||!fbo||!Array.isArray(openings)||!openings.length)return 0;
  if(!openingProgram||gl.isContextLost()){
    openingProgram=linkProgram(OPENING_VERT,OPENING_FRAG,'source opening');
    openingVao=gl.createVertexArray();openingBuffer=gl.createBuffer();
    gl.bindVertexArray(openingVao);gl.bindBuffer(gl.ARRAY_BUFFER,openingBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
  }
  const eye=[camX,camY,camZ];
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);
  // Clear only coverage. Both outputs use the prop depth attachment, so the
  // absorbing surface never paints over a nearer frame, handle or other prop.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2]);
  gl.clearBufferfv(gl.COLOR,1,new Float32Array([0,0,0,0]));
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.useProgram(openingProgram);
  gl.uniform1f(gl.getUniformLocation(openingProgram,'uMarksPhysical'),marksReady?1:0);
  gl.uniformMatrix4fv(gl.getUniformLocation(openingProgram,'uView'),false,view(eye,yaw,pitch));
  gl.uniformMatrix4fv(gl.getUniformLocation(openingProgram,'uProj'),false,perspective(width/height));
  gl.bindVertexArray(openingVao);gl.bindBuffer(gl.ARRAY_BUFFER,openingBuffer);
  let drawn=0;
  for(const opening of openings){
    const c=opening.corners,n=opening.normal||[0,0,1];
    const side=(eye[0]-c[0][0])*n[0]+(eye[1]-c[0][1])*n[1]+(eye[2]-c[0][2])*n[2];
    const colour=side>=0?opening.front:opening.back;
    if(!Array.isArray(colour))continue;
    gl.uniform3fv(gl.getUniformLocation(openingProgram,'uColour'),colour);
    const absorbs=opening.absorbsLight===true&&colour.every((value)=>value<=0.00001);
    gl.uniform1f(gl.getUniformLocation(openingProgram,'uAbsorbsLight'),absorbs?1:0);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([...c[0],...c[1],...c[2],...c[0],...c[2],...c[3]]),gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES,0,6);drawn+=1;
  }
  gl.bindVertexArray(null);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  openingMaskReady=true;
  return drawn;
}

let crossingProgram=null,crossingVao=null;
const crossingUniforms=new Map();
const realmEyeInterpolator=createRealmEyeInterpolator();
export function resetSourceRealmEye(){realmEyeInterpolator.reset();}
function CU(name){if(!crossingUniforms.has(name))crossingUniforms.set(name,gl.getUniformLocation(crossingProgram,name));return crossingUniforms.get(name);}
// `dir` is where the camera looks in the door's space (x right, z into the world).
export function renderSourceCrossing({framebuffer=null,width:targetW=1,height:targetH=1,dir=[0,1],pitch=0,reveal=0,variant=0,seed=0,key=0,drift=0,timeSec=0,frameTimeSec=timeSec,reducedMotion=false,stormFlash=0,wayOut=0,realm=null,realmId=null,homePresentation=null,torchPower=0}={}){
  if(!gl||!(reveal>.02))return false;
  if(!crossingProgram||gl.isContextLost()){
    crossingProgram=linkProgram(CROSSING_VERT,CROSSING_FRAG,'source crossing');crossingUniforms.clear();
    crossingVao=gl.createVertexArray();const buffer=gl.createBuffer();
    gl.bindVertexArray(crossingVao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,targetW,targetH);
  gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  const homeAcquisition=homeRealmAcquisition({realm,variant,reveal});
  if(homeAcquisition)gl.disable(gl.BLEND);
  else{gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}
  gl.useProgram(crossingProgram);
  const dirX=Number.isFinite(Number(dir[0]))?Number(dir[0]):0,dirZ=Number.isFinite(Number(dir[1]))?Number(dir[1]):1;
  gl.uniform2f(CU('uRes'),targetW,targetH);gl.uniform2f(CU('uDir'),dirX,dirZ);
  gl.uniform1f(CU('uPitch'),Number(pitch)||0);gl.uniform1f(CU('uTime'),reducedMotion?0:Number(timeSec)||0);
  gl.uniform1f(CU('uCalm'),reducedMotion?1:0);gl.uniform1f(CU('uStormFlash'),Number(stormFlash)||0);gl.uniform1f(CU('uReveal'),Math.min(1,reveal));
  gl.uniform4f(CU('uWorld'),Number(variant)||0,Number(seed)||0,key?1:0,Number(drift)||0);
  gl.uniform1f(CU('uWayOut'),wayOut?1:0);
  gl.uniform1f(CU('uRealmDepth'),homeAcquisition?1:0);
  gl.uniform1f(CU('uRealmActive'),realm?1:0);
  const realmKey=realm?`${realmId??realm.entryDoorId??''}:${realm.variant??variant}:${realm.startedAt??0}`:null;
  if(!realm)realmEyeInterpolator.reset();
  gl.uniform3fv(CU('uRealmEye'),realm?realmEyeInterpolator.position(realmKey,realmCameraPosition(realm),frameTimeSec):[0,1.62,1]);
  gl.uniform1f(CU('uRealmDecoherence'),Math.max(0,Math.min(1,Number(realm?.decoherence)||0)));
  gl.uniform1f(CU('uRealmTorch'),Math.max(0,Math.min(1.4,Number(torchPower)||0)));
  gl.uniform3f(CU('uRealmView'),dirX*Math.cos(Number(pitch)||0),Math.sin(Number(pitch)||0),dirZ*Math.cos(Number(pitch)||0));
  const home=realm?.home||{},attention=homePresentation?.attention??home.attention??0,hold=homePresentation?.hold??homePresentation?.seduction??attention;
  gl.uniform4f(CU('uHomeState'),home.eligible?1:0,Math.max(0,Math.min(1,Number(attention)||0)),Math.max(0,Math.min(1,Number(hold)||0)),Math.max(0,Math.min(1,Number(home.fold)||0)));
  gl.bindVertexArray(crossingVao);gl.drawArrays(gl.TRIANGLES,0,3);gl.bindVertexArray(null);
  gl.disable(gl.BLEND);
  return true;
}

// Scene-owned finite meshes share the ordinary physical prop material pass.
// Installers are idempotent and can repair residency after a base-pack reload.
export function installAuthoredPropMeshes(installer){
  if(!gl||!pack?.catalog||typeof installer!=='function')return false;
  return installer(gl,pack);
}
export function propMeshCatalog(){return pack?[...pack.catalog.keys()]:[];}

export function setAuthoredPropRange(owner,far=90){
  const release=authoredPropRange.acquire(owner,far);
  FAR=authoredPropRange.current({drive:!!driveStudyFrame});
  return()=>{const released=release();FAR=authoredPropRange.current({drive:!!driveStudyFrame});return released;};
}

// Drive resources use the existing P3 material/depth targets and final acquisition.
// Leaving the drive restores the ordinary lens, range and lighting path.
let driveStudyFrame=null,driveMirrorAt=-1,driveMirrorAspect=0;
// The same cab light for the parked van, which is drawn with the building rather than the drive.
let parkedCabLight=null;
export function setParkedCabLight(frame){parkedCabLight=frame||null;}
let driveWetTexture=null,driveWetUploadUnit=null,driveWetRevision=-1,driveWetOwner=null,driveWetSize='';
let driveRendererError=null;
const driveTextures=new Map(),driveCanvasSizes=new Map(),driveMirrorTargets=new Map();

export function setDriveStudyFrame(frame){
  driveStudyFrame=frame&&frame.active!==false?frame:null;
  FAR=authoredPropRange.current({drive:!!driveStudyFrame});
  if(!driveStudyFrame)driveMirrorAt=-1;
}

export function driveStudyWeatherTarget(){
  const wet=driveStudyFrame?.weather?.wetness;
  if(!gl||gl.isContextLost()||!wet?.data)return null;
  const size=wet.width+'x'+wet.height;
  if(!driveWetTexture){
    driveWetUploadUnit=gl.getParameter(gl.ACTIVE_TEXTURE)-gl.TEXTURE0;
    driveWetTexture=gl.createTexture();
  }
  if(driveWetOwner!==wet.owner||driveWetRevision!==wet.revision||driveWetSize!==size){
    // One physical pane texture: liquid in R, packed snow in G. Both channels
    // share the same fixed-step blade arcs and upload lifetime.
    const data=new Uint8Array(wet.width*wet.height*2);
    for(let i=0;i<wet.data.length;i++){data[i*2]=wet.data[i];data[i*2+1]=wet.snowData?.[i]||0;}
    gl.bindTexture(gl.TEXTURE_2D,driveWetTexture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    if(driveWetSize!==size){
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RG8,wet.width,wet.height,0,gl.RG,gl.UNSIGNED_BYTE,data);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    }else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,wet.width,wet.height,gl.RG,gl.UNSIGNED_BYTE,data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);
    driveWetRevision=wet.revision;driveWetSize=size;driveWetOwner=wet.owner;
  }
  return driveWetTexture;
}

// World video textures have their own lifetime: leaving a driving flashback
// must not dispose the lodge's phosphor face.
const worldVideoTextures=new Map();
function disposeWorldVideoResources(){if(gl)for(const t of worldVideoTextures.values())gl.deleteTexture(t.texture);worldVideoTextures.clear();}
export function setWorldVideoFrame(name,video){
  if(!gl||gl.isContextLost()||!pack?.catalog.has(name)||video?.readyState<2||!video?.videoWidth||!video?.videoHeight)return false;
  let entry=worldVideoTextures.get(name);if(!entry){entry={texture:gl.createTexture(),width:0,height:0};worldVideoTextures.set(name,entry);}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  try{
    if(entry.width===video.videoWidth&&entry.height===video.videoHeight)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,video);
    else{gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,video);entry.width=video.videoWidth;entry.height=video.videoHeight;}
  }finally{gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  for(const p of pack.catalog.get(name).primitives){p.texture=entry.texture;p.base=[1,1,1,1];p.worldVideo=true;}
  return true;
}

export function setDriveStudyCanvas(name,canvas,{mipmaps=false}={}){
  if(!gl||gl.isContextLost()||!pack?.catalog.has(name)||!canvas?.width||!canvas?.height)return false;
  let texture=driveTextures.get(name);
  if(!texture){texture=gl.createTexture();driveTextures.set(name,texture);}
  const size=canvas.width+'x'+canvas.height;
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  if(driveCanvasSizes.get(name)===size)gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
  else{
    gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
    driveCanvasSizes.set(name,size);
  }
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  // A tube seen from the seat is squeezed fifteen times over. Without these it breaks into specks.
  if(mipmaps)gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,mipmaps?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  for(const primitive of pack.catalog.get(name).primitives){
    primitive.texture=texture;primitive.base=[1,1,1,1];primitive.driveStudySurface=2;
  }
  return true;
}

function driveMirrorTarget(name){
  const existing=driveMirrorTargets.get(name);if(existing)return existing;
  const w=128,h=192,color=gl.createTexture(),depth=gl.createRenderbuffer(),framebuffer=gl.createFramebuffer();
  try{
    gl.bindTexture(gl.TEXTURE_2D,color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);
    gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Drive mirror target incomplete');
  }catch(error){
    gl.deleteTexture(color);gl.deleteRenderbuffer(depth);gl.deleteFramebuffer(framebuffer);throw error;
  }
  const target={w,h,color,depth,framebuffer};driveMirrorTargets.set(name,target);driveTextures.set(name,color);return target;
}

const DRIVE_MIRROR_EXTERIORS=new Set(['drive_vehicle_body','drive_tyre','drive_road','drive_plain_paving','drive_road_joint','drive_verge','drive_retaining_wall','drive_bank','drive_hedge','drive_tree','drive_fence','drive_bridge','drive_bridge_earthwork','drive_terrain_ridge','drive_terrain_slope','drive_drain_channel','drive_gate','drive_reflector','drive_pole']);
export function driveMirrorIncludesMesh(mesh){return!String(mesh||'').startsWith('drive_')||DRIVE_MIRROR_EXTERIORS.has(mesh);}
export function captureDriveMirrors(lighting={}){
  const frame=driveStudyFrame;
  if(!gl||gl.isContextLost()||!frame?.mirrors?.length||!pack)return;
  const time=lighting.timeSec||0;if(time-driveMirrorAt<.08)return;driveMirrorAt=time;
  const all=staticInstances,saved={reflFbo,reflW,reflH};
  // These external cameras include the road and shell, without preparing the
  // cabin's skinned hands again or invalidating the shared frame palettes.
  staticInstances=all.filter(instance=>driveMirrorIncludesMesh(instance.mesh));
  try{
    for(const mirror of frame.mirrors){
      if(!pack.catalog.has(mirror.mesh))continue;
      const target=driveMirrorTarget(mirror.mesh);
      reflFbo=target.framebuffer;reflW=target.w;reflH=target.h;driveMirrorAspect=mirror.aspect||.6447;
      renderPropPass({...lighting,camX:mirror.eye[0],camY:mirror.eye[1],camZ:mirror.eye[2],yaw:mirror.yaw,pitch:mirror.pitch??-.025,
        light:0,maxDistance:150,reflection:true,streetTextures:false,shadowPrepared:true});
      for(const primitive of pack.catalog.get(mirror.mesh).primitives){
        primitive.texture=target.color;primitive.base=[1,1,1,1];primitive.driveStudySurface=1;
      }
    }
    driveRendererError=null;
  }catch(error){driveRendererError=String(error?.message||error);}
  finally{
    driveMirrorAspect=0;reflFbo=saved.reflFbo;reflW=saved.reflW;reflH=saved.reflH;staticInstances=all;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  }
}

export function driveStudyRendererStatus(){
  const tanHalfFov=driveStudyFrame ? .65 : .95;
  return{production:true,active:!!driveStudyFrame,tanHalfFov,verticalFovDegrees:2*Math.atan(tanHalfFov)*180/Math.PI,
    patternScale:driveStudyFrame?480:null,headlightCones:!!driveStudyFrame,
    mirrors:[...driveTextures.keys()].filter(name=>name.startsWith('drive_mirror')),recordedCanvas:driveTextures.has('drive_recorder_readout'),
    mirrorTargets:[...driveMirrorTargets.values()].map(target=>({width:target.w,height:target.h})),mirrorHz:12.5,far:FAR,error:driveRendererError,
    weather:driveStudyFrame?.weather?{active:true,rain:driveStudyFrame.weather.rain,extinction:driveStudyFrame.weather.extinction,
      fog:driveStudyFrame.weather.fog||0,snow:driveStudyFrame.weather.snow||0,whiteout:driveStudyFrame.weather.whiteout||0,wetnessChannels:'R liquid / G snow; shared physical wiper arcs',
      wetnessTexture:driveWetSize,wetnessInitialUploadUnit:driveWetUploadUnit,revision:driveWetRevision,paneSpace:'cabin metres',
      fogSpace:'world metres; starts beyond cabin/pane; geometry-depth clipped',finalAcquisition:'shared; no weather POST overlay'}:{active:false}};
}

function disposeDriveStudyResources(){
  if(gl){
    for(const texture of new Set(driveTextures.values()))gl.deleteTexture(texture);
    if(driveWetTexture)gl.deleteTexture(driveWetTexture);
    for(const target of driveMirrorTargets.values()){gl.deleteRenderbuffer(target.depth);gl.deleteFramebuffer(target.framebuffer);}
  }
  driveStudyFrame=null;FAR=authoredPropRange.current();driveMirrorAt=-1;driveMirrorAspect=0;driveRendererError=null;
  driveWetTexture=null;driveWetUploadUnit=null;driveWetRevision=-1;driveWetOwner=null;driveWetSize='';
  driveTextures.clear();driveCanvasSizes.clear();driveMirrorTargets.clear();
}
