// GLB prop pass for the first-person renderer. Architecture remains the sector
// raymarcher; meshes render into colour + depth first, and r3d.js composites
// whichever surface is actually nearer to the camera.

// The one zone that is outdoors. Baked into the fragment shader so a prop
// standing in the yard is lit by the sky rather than by a lamp that is not there.
import { ZONE } from '../data/floorplan/legend.js';
import { PAPER_ATLAS_HANDLING } from '../generated/paper-catalog.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { CHARACTER_LIMITS, CHARACTER_DEFORM_GLSL, parseCharacterAsset, sampleCharacterPose } from './character-asset.js';
import { installDivideMeshes } from './source-divide-meshes.js';
import { installTowerPersonalMeshes } from './tower-personal-meshes.js';
import { realmCameraPosition, homeRealmAcquisition } from './realm-pocket-geometry.js';
import { createRealmEyeInterpolator } from './realm-eye.js';

const VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
layout(location=7) in float aZone;
layout(location=8) in float aPortrait;
layout(location=9) in float aStructural;
layout(location=10) in vec4 aEmissive;
layout(location=11) in float aPaperIndex;
layout(location=12) in vec4 aPaperHandling;
layout(location=15) in float aFixturePower;
${CHARACTER_DEFORM_GLSL}
uniform mat4 uView,uProj;
uniform float uTimeSec,uReducedMotion;
// x amplitude metres, y frequency Hz, z local anchor height, w affected height.
uniform vec4 uVegetationWind;
out vec3 vWorld,vNormal;out vec2 vUv;flat out int vZone;flat out int vPortrait;flat out int vStructural;flat out vec4 vEmissive;flat out int vPaperIndex;flat out vec4 vPaperHandling;flat out float vFixturePower;
void main(){
  mat4 m=mat4(aM0,aM1,aM2,aM3);vec3 local=aPos,localNormal=aNormal;deformCharacter(local,localNormal);int paper=int(floor(aPaperIndex+.5));
  if(paper>=0){
    float u=aUv.x,v=aUv.y;float disp=.00055*sin(3.14159265*u)*sin(3.14159265*v)+.00065*pow(abs(u-.5)*2.0,3.0);
    if(aPaperHandling.x>=0.0)disp+=exp(-abs(v-aPaperHandling.x)*92.0)*aPaperHandling.y*.0012;
    disp+=smoothstep(.62,1.0,u)*smoothstep(.62,1.0,v)*aPaperHandling.z*.0028;
    local+=aNormal*disp;
  }
  vec4 w=m*vec4(local,1.0);
  float windHeight=clamp((local.y-uVegetationWind.z)/max(.01,uVegetationWind.w),0.0,1.0);
  float windActive=(1.0-uReducedMotion)*step(.00001,uVegetationWind.x);
  float windPhase=uTimeSec*uVegetationWind.y*6.2831853+dot(w.xz,vec2(.173,.219));
  float windWave=sin(windPhase)+sin(windPhase*.47+1.9)*.34;
  w.xz+=vec2(windWave,sin(windPhase*.73+.8))*(uVegetationWind.x*windHeight*windHeight*windActive);
  vWorld=w.xyz;vNormal=normalize(transpose(inverse(mat3(m)))*localNormal);vUv=aUv;vZone=int(aZone+.5);vPortrait=int(aPortrait+.5);vStructural=int(aStructural+.5);vEmissive=aEmissive;vPaperIndex=paper;vPaperHandling=aPaperHandling;vFixturePower=aFixturePower;gl_Position=uProj*uView*w;
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
in vec3 vWorld,vNormal;in vec2 vUv;flat in int vZone;flat in int vPortrait;flat in int vStructural;flat in vec4 vEmissive;flat in int vPaperIndex;flat in vec4 vPaperHandling;flat in float vFixturePower;
uniform vec3 uEye,uForward,uBase,uMaterialEmissive,uZoneTint[21];uniform float uLight,uAlphaCut,uBaseAlpha;uniform sampler2D uTex,uNormalTex,uOrmTex,uFogTex;uniform float uUseTex,uUseNormal,uUseOrm,uMetallic,uRoughness,uNormalScale,uAoStrength,uFogSize,uCellMeters;uniform vec2 uFogOrigin;
// Street surfaces laid onto untextured props by world position (outskirts only):
// the opening street's own albedo and ORM, blended over three axes.
uniform float uStreetTex,uStreetScale,uStreetMix,uPayphoneCast;
// x class (1 leaf, 2 stem, 3 dead leaf, 4 soil, 5 stone), y thin-leaf
// transmission, z rain wetness, w reserved.
uniform vec4 uVegetation;
uniform vec3 uTorchColor,uAmbientColor;uniform float uTorchReach,uTorchSpill,uTorchShoulder,uAmbientIntensity;uniform vec2 uTorchCone;
uniform int uLocalLightCount,uLocalShadowIndex;uniform vec4 uLocalLightPos[12],uLocalLightColor[12];uniform float uLocalLightPenetration[12];
// See reserveEmergencyRed in r3d.js: red belongs to the emergency circuit, and
// props must reserve it on the same terms as the architecture or a red chair
// sits in the auditorium glowing like a fitting.
uniform float uLocalLightEmergency[12];
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
uniform sampler2D uShadowTex;uniform mat4 uShadowMatrix;uniform float uShadowReady;uniform vec2 uShadowTexel;
uniform float uSourceRoomLighting;
layout(location=0) out vec4 o;
layout(location=2) out vec4 oSurfaceMarks;
${SURFACE_MARK_GLSL}
float flashlightShadow(vec3 world,vec3 normal,vec3 lightDir){
  if(uShadowReady<.5)return 1.0;
  vec4 clip=uShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 1.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
  float bias=max(.00018,.00115*(1.0-max(dot(normal,lightDir),0.0))),visible=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(vec2(float(x),float(y))-.5)*uShadowTexel;visible+=q.z-bias<=texture(uShadowTex,q.xy+tap).r?1.0:0.0;}
  return mix(.20,1.0,visible*.25);
}
// The wide, leaky twin that carries the apparition's glow — see the long note on
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
    float angle=float(i)*.5236,ring=i<6?5.0:11.0;
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
void main(){
  if(uUsePaperAtlas>.5&&vPaperIndex>=0&&vPaperHandling.w>0.0&&vUv.y>.68){
    float q=smoothstep(.68,1.0,vUv.y);float rag=(fract(sin((floor(vUv.y*170.0)+float(vPaperIndex)*13.7)*12.9898)*43758.5453)-.5)*.018;
    if(vUv.x>1.0-vPaperHandling.w*q+rag*q)discard;
  }
  vec4 texel=uUseTex>.5?texture(uTex,vUv):vec4(1.0);
  // STREET SURFACES, by where the surface is rather than by its UVs: most props
  // out past the grey doors were authored flat, with no texture coordinates
  // worth sampling. Three axes, weighted by the normal, so walls, roofs and the
  // ground all take the street's grain the right way up.
  vec3 streetW=vec3(0.0),streetP=vWorld*uStreetScale;
  if(uStreetTex>.5){
    streetW=pow(abs(normalize(vNormal)),vec3(4.0));streetW/=max(1e-4,streetW.x+streetW.y+streetW.z);
    vec3 streetAlbedo=texture(uTex,streetP.zy).rgb*streetW.x+texture(uTex,streetP.xz).rgb*streetW.y+texture(uTex,streetP.xy).rgb*streetW.z;
    texel=vec4(mix(vec3(1.0),clamp(streetAlbedo*1.8,0.0,1.25),uStreetMix),texel.a);
  }
  if(uUsePaperAtlas>.5&&vPaperIndex>=0){
    float cols=max(1.0,uPaperAtlasGrid.x),rows=max(1.0,uPaperAtlasGrid.y);
    float idx=float(vPaperIndex),cx=mod(idx,cols),cy=floor(idx/cols);
    vec2 local=clamp(vUv,.002,.998);
    // Atlas is uploaded with Y flipped, matching ordinary GLB texture UVs.
    vec2 paperUv=(vec2(cx,rows-1.0-cy)+local)/vec2(cols,rows);
    texel=texture(uPaperAtlas,paperUv);
  }
  if(uUsePortrait>.5){int slot=clamp(vPortrait,0,5);vec2 cell=vec2(float(slot%3),float(slot/3));vec2 local=clamp(vUv,.006,.994);texel=texture(uPortraitAtlas,(cell+local)/vec2(3.0,2.0));}
  float sampledAlpha=texel.a*uBaseAlpha;
  // Preserve thin cards as they minify instead of letting a fixed cutoff eat
  // the whole crown one mip at a time.
  float coverageWidth=clamp(fwidth(sampledAlpha)*.58,0.0,.16);
  if(sampledAlpha<uAlphaCut-coverageWidth)discard;
  float memory=1.0;
  vec3 n=normalize(vNormal),toEye=uEye-vWorld;float dist=length(toEye);vec3 ldir=normalize(toEye);
  n=dot(n,ldir)<0.0?-n:n;   // two-sided: imported meshes have arbitrary winding, light whichever face we see
  if(uUseNormal>.5){
    vec3 dpdx=dFdx(vWorld),dpdy=dFdy(vWorld);vec2 dtdx=dFdx(vUv),dtdy=dFdy(vUv);
    vec3 tangent=normalize(dpdx*dtdy.y-dpdy*dtdx.y);vec3 bitangent=normalize(-dpdx*dtdy.x+dpdy*dtdx.x);
    vec3 mapped=texture(uNormalTex,vUv).xyz*2.0-1.0;mapped.xy*=uNormalScale;
    n=normalize(mat3(tangent,bitangent,n)*mapped);n=dot(n,ldir)<0.0?-n:n;
  }
  vec3 orm=uUseOrm>.5?texture(uOrmTex,vUv).rgb:vec3(1.0,uRoughness,uMetallic);
  if(uStreetTex>.5){
    vec3 streetOrm=texture(uOrmTex,streetP.zy).rgb*streetW.x+texture(uOrmTex,streetP.xz).rgb*streetW.y+texture(uOrmTex,streetP.xy).rgb*streetW.z;
    orm=mix(orm,vec3(streetOrm.r,streetOrm.g,orm.b),uStreetMix);
  }
  float rough=clamp(orm.g*uRoughness,.08,1.0),metal=clamp(orm.b*uMetallic,0.0,1.0);
  float ao=mix(1.0,orm.r,clamp(uAoStrength,0.0,1.0));
  if(uUsePaperAtlas>.5&&vPaperIndex>=0){
    // Fused toner changes the sheet's grazing response a little; it is not a
    // black decal floating over generic prop plastic. Use the finished print
    // itself as a low-cost process mask. Blue/black ink remains subtle and the
    // bare stock stays very matte.
    float ink=clamp(1.0-dot(texel.rgb,vec3(.2126,.7152,.0722)),0.0,1.0);
    rough=mix(.86,.66,smoothstep(.10,.72,ink));
    metal=0.0;
  }
  float lambert=max(dot(n,ldir),0.0);float wrappedLeaf=max((dot(n,ldir)+.34)/1.34,0.0);lambert=mix(lambert,wrappedLeaf,clamp(uVegetation.y,0.0,.42));vec3 fromEye=normalize(vWorld-uEye);float axis=dot(fromEye,uForward);
  float cone=smoothstep(uTorchCone.x,uTorchCone.y,axis);float rim=smoothstep(uTorchCone.x-.04,uTorchCone.x+.015,axis)*.30;float spill=smoothstep(.30,uTorchCone.x-.02,axis)*uTorchSpill;
  float reach=max(.35,uTorchReach);float falloff=1.0/(1.0+(.10/reach)*dist+(.045/(reach*reach))*dist*dist);float shadow=flashlightShadow(vWorld,n,ldir);
  float nearSoft=smoothstep(0.0,1.4,dist)*.55+.45;float beam=(cone+rim+spill)*uLight;
  float lamp=lambert*falloff*nearSoft*3.0*beam*(uLocalShadowIndex<0?shadow:1.0);float ambient=uAmbientIntensity*mix(1.0,1.12,uLight);vec3 localLight=vec3(0.0);vec3 emergencyLight=vec3(0.0);
  lamp=lamp/(1.0+uTorchShoulder*lamp);
  // One shadow map, applied to the whole red field — see the long note in
  // r3d.js. Five overlapping lamps made a single-lamp silhouette invisible.
  // And the shadow it leaves is WHITE, for the reasons set out there too.
  float heroShadow=1.0,apparitionBody=0.0,apparitionHalo=0.0;vec3 emergencyReach=vec3(0.0);
  if(uLocalShadowIndex>=0){
    vec3 heroDir=normalize(uLocalLightPos[uLocalShadowIndex].xyz-vWorld);
    float heroLit=clamp((flashlightShadow(vWorld,n,heroDir)-.20)/.80,0.0,1.0);
    heroShadow=mix(.015,1.0,heroLit);apparitionBody=1.0-heroLit;
    apparitionHalo=max(flashlightHalo(vWorld,n,heroDir)-apparitionBody,0.0);
  }
  for(int li=0;li<12;li++){if(li>=uLocalLightCount)break;vec3 delta=uLocalLightPos[li].xyz-vWorld;float d=length(delta),r=max(.01,uLocalLightPos[li].w);float att=pow(clamp(1.0-d/r,0.0,1.0),2.0);float ndl=max(dot(n,normalize(delta)),0.0);float emergency=clamp(uLocalLightEmergency[li],0.0,1.0);float localShadow=max(float(li==uLocalShadowIndex),emergency)>.5?heroShadow:1.0;float arch=architecturalLightVisibility(vWorld,uLocalLightPos[li].xyz);arch=mix(arch,1.0,clamp(uLocalLightPenetration[li],0.0,1.0));vec3 unshadowed=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*ndl*arch;vec3 contribution=unshadowed*localShadow;localLight+=contribution;emergencyLight+=contribution*emergency;emergencyReach+=unshadowed*emergency;}
  float apparitionReach=max(max(emergencyReach.r,emergencyReach.g),emergencyReach.b);
  float apparitionLit=smoothstep(.06,.40,apparitionReach);
  vec3 apparitionWhite=vec3(.94,.96,1.0)*pow(apparitionBody,.45)*apparitionLit*.78+vec3(.90,.93,1.0)*pow(apparitionHalo,.60)*apparitionLit*.34;
  vec3 base=uBase*texel.rgb;vec3 halfDir=normalize(ldir+normalize(toEye));float spec=pow(max(dot(n,halfDir),0.0),mix(72.0,5.0,rough))*mix(.08,.72,metal)*cone*falloff*shadow*uLight;
  spec=spec/(1.0+uTorchShoulder*spec);
  vec3 incident=uAmbientColor*ambient*ao+uTorchColor*lamp*(1.0-metal*.45)+localLight;
  vec3 col=base*incident+uTorchColor*spec*mix(vec3(1.0),base,metal)+vEmissive.rgb*vEmissive.a+uMaterialEmissive*vFixturePower;
  float vegetationSheen=pow(max(dot(n,ldir),0.0),18.0)*clamp(uVegetation.z,0.0,1.0)*(ambient*.35+beam*.22);
  col+=vec3(.13,.16,.19)*vegetationSheen;
  // Apply the reservation AFTER emissive materials. A red-painted or red-lit
  // surface does not become an emergency source merely because it glows.
  // The selected kiosk's vermilion is paint, not an emergency fitting. Keep
  // this exception on its authored cast-iron material rather than on a zone.
  if(uPayphoneCast<.5)col=reserveEmergencyRed(col,dot(emergencyLight,vec3(.2126,.7152,.0722))/max(dot(incident,vec3(.2126,.7152,.0722)),1e-4));
  col+=mix(vec3(1.0),base,.34)*apparitionWhite;
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
  // ZONE.dock is the yard and the apron, and it is the only outdoor zone in the
  // building — so the test is the zone, carried per instance from the cell the
  // prop stands in. Weighted by how much sky the face can see: full for anything
  // looking up, a third for a wall.
  if(vZone==${ZONE.dock}){
    float facingSky=.30+.70*clamp(n.y*.5+.5,0.0,1.0);
    col+=base*vec3(.30,.36,.47)*facingSky;
    // And the sheen. It has been raining on all of this all night, and a wet
    // face at a grazing angle returns the lit deck rather than its own colour —
    // which is the only thing that reads on brick at forty metres in the dark.
    // Not multiplied by albedo, because a film of water has none.
    float graze=pow(1.0-abs(dot(n,normalize(uEye-vWorld))),3.0);
    col+=vec3(.052,.062,.086)*graze*facingSky;
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
    col=mix(col,vec3(.100,.122,.168),haze*.82);
  }
  col=col/(1.0+col*.30);o=vec4(col,1.0);
  oSurfaceMarks=vec4(0.0,.5,.5,0.0);
  if(uSourceRoomLighting>.5&&uUseTex>.5){
    // Derive engraving from the actual albedo texture, in its own UVs. No
    // screen-space hatch, inferred room colour or invented material grain.
    vec2 texelStep=1.0/vec2(textureSize(uTex,0));
    float gx=dot(texture(uTex,vUv+vec2(texelStep.x,0.0)).rgb-texture(uTex,vUv-vec2(texelStep.x,0.0)).rgb,vec3(.2126,.7152,.0722));
    float gy=dot(texture(uTex,vUv+vec2(0.0,texelStep.y)).rgb-texture(uTex,vUv-vec2(0.0,texelStep.y)).rgb,vec3(.2126,.7152,.0722));
    vec3 dpdx=dFdx(vWorld),dpdy=dFdy(vWorld);vec2 uvDx=dFdx(vUv),uvDy=dFdy(vUv);
    vec3 tangent=dpdx*uvDy.y-dpdy*uvDx.y,bitangent=-dpdx*uvDy.x+dpdy*uvDx.x;
    float contrast=length(vec2(gx,gy));vec3 grain=tangent*(-gy)+bitangent*gx;
    if(contrast>.0001&&length(grain)>.0001)oSurfaceMarks=packSurfaceMark(n,normalize(grain),clamp(.22+contrast*.35,.02,.65),clamp(contrast*4.0,0.0,1.0));
  }
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
uniform mat4 uView,uProj;
out vec2 vUv;out vec4 vColor;out vec3 vWorld,vNormal,vBaseline;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vUv=mix(aUvRect.xy,aUvRect.zw,aUv);vColor=aColor;vec4 world=m*vec4(aPos,0.0,1.0);vWorld=world.xyz;vNormal=normalize(cross(m[0].xyz,m[1].xyz));vBaseline=normalize(m[0].xyz);gl_Position=uProj*uView*world;}`;
const TEXT_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;in vec4 vColor;in vec3 vWorld,vNormal,vBaseline;
uniform sampler2D uGlyphAtlas,uShadowTex;uniform mat4 uShadowMatrix;
uniform vec3 uEye,uForward,uTorchColor,uAmbientColor;
uniform float uLight,uTorchReach,uTorchSpill,uTorchShoulder,uAmbientIntensity,uSourceRoomLighting,uShadowReady,uMarksOnly;
uniform vec2 uTorchCone,uShadowTexel;
uniform int uLocalLightCount;uniform vec4 uLocalLightPos[12],uLocalLightColor[12];uniform float uLocalLightEmergency[12];
layout(location=0) out vec4 o;layout(location=2) out vec4 oSurfaceMarks;
${SURFACE_MARK_GLSL}
float glyphTorchShadow(vec3 world,vec3 normal,vec3 lightDir){
  if(uShadowReady<.5)return 1.0;
  vec4 clip=uShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 1.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
  float bias=max(.00018,.00115*(1.0-max(dot(normal,lightDir),0.0))),visible=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(vec2(float(x),float(y))-.5)*uShadowTexel;visible+=q.z-bias<=texture(uShadowTex,q.xy+tap).r?1.0:0.0;}
  return mix(.20,1.0,visible*.25);
}
void main(){
  float a=texture(uGlyphAtlas,vUv).a*vColor.a;if(a<.035)discard;
  vec3 color=vColor.rgb;oSurfaceMarks=vec4(0.0,.5,.5,0.0);
  if(uMarksOnly>.5){o=vec4(0.0);oSurfaceMarks=packSurfaceMark(normalize(vNormal),vBaseline,.22,.65);return;}
  if(uSourceRoomLighting>.5){
    vec3 toEye=uEye-vWorld;float dist=length(toEye);vec3 dir=normalize(toEye),n=normalize(vNormal);n=dot(n,dir)<0.0?-n:n;
    float axis=dot(normalize(vWorld-uEye),uForward);
    float cone=smoothstep(uTorchCone.x,uTorchCone.y,axis),rim=smoothstep(uTorchCone.x-.04,uTorchCone.x+.015,axis)*.30;
    float spill=smoothstep(.30,uTorchCone.x-.02,axis)*uTorchSpill;
    float reach=max(.35,uTorchReach),falloff=1.0/(1.0+(.10/reach)*dist+(.045/(reach*reach))*dist*dist);
    float lamp=max(dot(n,dir),0.0)*falloff*(smoothstep(0.0,1.4,dist)*.55+.45)*3.0*(cone+rim+spill)*uLight*glyphTorchShadow(vWorld,n,dir);
    lamp=lamp/(1.0+uTorchShoulder*lamp);
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
uniform mat4 uShadowMatrix;uniform float uTimeSec,uReducedMotion;uniform vec4 uVegetationWind;out vec2 vUv;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vec3 local=aPos,localNormal=aNormal;deformCharacter(local,localNormal);vec4 w=m*vec4(local,1.0);float windHeight=clamp((local.y-uVegetationWind.z)/max(.01,uVegetationWind.w),0.0,1.0);float windActive=(1.0-uReducedMotion)*step(.00001,uVegetationWind.x);float windPhase=uTimeSec*uVegetationWind.y*6.2831853+dot(w.xz,vec2(.173,.219));float windWave=sin(windPhase)+sin(windPhase*.47+1.9)*.34;w.xz+=vec2(windWave,sin(windPhase*.73+.8))*(uVegetationWind.x*windHeight*windHeight*windActive);vUv=aUv;gl_Position=uShadowMatrix*w;}`;
const SHADOW_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;uniform sampler2D uTex;uniform float uUseTex,uBaseAlpha,uAlphaCut;
void main(){float alpha=(uUseTex>.5?texture(uTex,vUv).a:1.0)*uBaseAlpha;float coverageWidth=clamp(fwidth(alpha)*.58,0.0,.16);if(alpha<uAlphaCut-coverageWidth)discard;}`;

// A separate identity target retains nearest skinned triangles and real surface
// relief for the final recording compositor. RG is big-endian 16-bit linear
// view metres / FAR; B is six relief bits, then core/glow flags; A is strength.
const PRESSURE_FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal;in vec2 vUv;
uniform vec3 uEye,uForward,uBase;
uniform sampler2D uTex,uNormalTex,uOrmTex;
uniform float uUseTex,uUseNormal,uUseOrm,uNormalScale,uRoughness,uBaseAlpha,uAlphaCut,uPressureFar;
uniform vec4 uPressure;
out vec4 o;
void main(){
  vec4 texel=uUseTex>.5?texture(uTex,vUv):vec4(1.0);
  float alpha=texel.a*uBaseAlpha;
  if(alpha<uAlphaCut||uPressure.x<=.001||(uPressure.y+uPressure.z)<.5)discard;
  vec3 n=normalize(vNormal),toEye=normalize(uEye-vWorld);
  if(dot(n,toEye)<0.0)n=-n;
  if(uUseNormal>.5){
    vec3 dx=dFdx(vWorld),dy=dFdy(vWorld);vec2 ux=dFdx(vUv),uy=dFdy(vUv);
    vec3 tangent=dx*uy.y-dy*ux.y,bitangent=-dx*uy.x+dy*ux.x;
    if(dot(tangent,tangent)>1e-12&&dot(bitangent,bitangent)>1e-12){
      vec3 mapped=texture(uNormalTex,vUv).xyz*2.0-1.0;mapped.xy*=uNormalScale;
      n=normalize(mat3(normalize(tangent),normalize(bitangent),n)*mapped);
      if(dot(n,toEye)<0.0)n=-n;
    }
  }
  float rough=clamp((uUseOrm>.5?texture(uOrmTex,vUv).g:1.0)*uRoughness,0.0,1.0);
  float pigment=dot(texel.rgb*uBase,vec3(.2126,.7152,.0722));
  float relief=clamp(.16+.28*(1.0-abs(dot(n,toEye)))+.26*max(0.0,dot(n,normalize(vec3(.31,.82,.48))))+.28*max(0.0,dot(n,normalize(toEye+vec3(.28,.65,.12))))+.12*pigment+.08*(1.0-rough),0.0,1.0);
  float linearDepth=max(0.0,dot(vWorld-uEye,uForward));
  float packed=floor(clamp(linearDepth/uPressureFar,0.0,1.0)*65535.0+.5);
  vec2 depthBytes=vec2(floor(packed/256.0),mod(packed,256.0))/255.0;
  float flags=floor(relief*63.0+.5)+64.0*uPressure.y+128.0*uPressure.z;
  o=vec4(depthBytes,flags/255.0,clamp(uPressure.x,0.0,1.0));
}`;

let gl=null,program=null,textProgram=null,shadowProgram=null,pack=null,staticInstances=[],dynamicInstances=[],diagnosticInstances=[],emergencyShadowInstances=[],sourceStaticTextInstances=[],sourceStaticTextBatches=[],sourceVisibleBatchCount=0,sourceVisibleInstanceCount=0,sourceDynamicTextInstances=[],sourceTextCorpus=[],sourceSceneKey='',sourceCorpusKey='',portraitAtlas=null,paperAtlas=null,paperAtlasGrid=[1,1];
let propDiagnosticsEnabled=false,propDiagnosticOptions=null,activePropDiagnostics=null,lastPropDiagnostics=null;
const vegetationLodState=new Map();
let practicalLightFrameByPropId=new Map();
// Character geometry is shared, but each actor owns one immutable palette for
// the entire rendered frame (including wet-road and torch-shadow passes).
const characterBundles=new Set();
let characterSnapshots=new WeakMap(),characterFramePoses=[],characterFrameTime=null,characterFrameDirty=true,characterLoadError=null;
const characterPoseErrors=new Set();
let pressureProgram=null,pressureInstances=[],pressureColorTex=null,pressureDepthTex=null,pressureFbo=null,pressureWidth=0,pressureHeight=0,pressureReady=false,pressureDraws=0,pressureError=null;
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
let colorTex=null,depthTex=null,marksTex=null,marksReady=false,fbo=null,width=0,height=0;
// A separate coverage channel for light-absorbing door surfaces. Glyph alpha
// cannot carry this identity: antialiased text uses every value in that channel.
let openingMaskTex=null,openingMaskReady=false;
// THE MIRRORED PASS (the outskirts' wet road): the scene again from under the
// road, at half size, into its own target. What the road is made of is left out
// of it, or the camera under the road would see only the road's underside.
let reflColorTex=null,reflDepthTex=null,reflFbo=null,reflW=0,reflH=0;
const REFLECTION_SKIP=new Set(['yard_road','outskirts_road','yard_markings','wet_footprint']);
let shadowDepthTex=null,shadowFbo=null,shadowSize=0,shadowReady=false,shadowActive=false,shadowMatrix=new Float32Array(16);
const NEAR=.05,FAR=90;
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
  const stride=24*4;
  for(let c=0;c<4;c++){gl.enableVertexAttribArray(2+c);gl.vertexAttribPointer(2+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(2+c,1);}
  gl.enableVertexAttribArray(6);gl.vertexAttribPointer(6,4,gl.FLOAT,false,stride,64);gl.vertexAttribDivisor(6,1);
  gl.enableVertexAttribArray(7);gl.vertexAttribPointer(7,4,gl.FLOAT,false,stride,80);gl.vertexAttribDivisor(7,1);
  gl.bindVertexArray(null);
}
export function props3dInit(context){
  resetCharacters();
  disposePressureTargets();if(gl&&pressureProgram)gl.deleteProgram(pressureProgram);
  pressureProgram=null;pressureInstances=[];pressureDraws=0;pressureError=null;pressureUniformCache.clear();
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
}
export function loadPortraitAtlas(url){return new Promise((resolve,reject)=>{if(!gl){reject(new Error('props3dInit first'));return;}const img=new Image();img.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);portraitAtlas=t;resolve(t);};img.onerror=reject;img.src=url.href||String(url);});}
export function loadPaperAtlas(url,{columns=1,rows=1}={}){return new Promise((resolve,reject)=>{if(!gl){reject(new Error('props3dInit first'));return;}const img=new Image();img.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);paperAtlas=t;paperAtlasGrid=[Math.max(1,columns|0),Math.max(1,rows|0)];resolve(t);};img.onerror=reject;img.src=url.href||String(url);});}
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

async function makeTexture(json,bin,textureIndex,{srgb=false,maxSize=Infinity}={}){
  const textureGl=gl;
  if(textureIndex==null)return null;const texDef=json.textures?.[textureIndex],img=json.images?.[texDef?.source];if(img?.bufferView==null)return null;
  const bv=json.bufferViews[img.bufferView],bytes=bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength),bmp=await createImageBitmap(new Blob([bytes],{type:img.mimeType||'image/png'}));
  if(bmp.width>maxSize||bmp.height>maxSize){bmp.close?.();throw new Error('character texture dimensions exceed limit');}
  const t=textureGl.createTexture();textureGl.bindTexture(textureGl.TEXTURE_2D,t);textureGl.texImage2D(textureGl.TEXTURE_2D,0,srgb?textureGl.SRGB8_ALPHA8:textureGl.RGBA8,textureGl.RGBA,textureGl.UNSIGNED_BYTE,bmp);textureGl.generateMipmap(textureGl.TEXTURE_2D);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_MIN_FILTER,textureGl.LINEAR_MIPMAP_LINEAR);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_MAG_FILTER,textureGl.LINEAR);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_WRAP_S,textureGl.REPEAT);textureGl.texParameteri(textureGl.TEXTURE_2D,textureGl.TEXTURE_WRAP_T,textureGl.REPEAT);const anisotropy=textureGl.getExtension('EXT_texture_filter_anisotropic');if(anisotropy)textureGl.texParameterf(textureGl.TEXTURE_2D,anisotropy.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,textureGl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT)||1));bmp.close?.();return t;
}

async function parsePropPack(url){
  if(!gl)throw new Error('props3dInit first');const res=await fetch(url);if(!res.ok)throw new Error(`prop pack ${res.status}`);const ab=await res.arrayBuffer(),dv=new DataView(ab);if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw new Error('prop pack is not GLB 2');
  let at=12,json=null,bin=null;while(at<ab.byteLength){const len=dv.getUint32(at,true),type=dv.getUint32(at+4,true),bytes=new Uint8Array(ab,at+8,len);if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(bytes));else if(type===0x004e4942)bin=bytes;at+=8+len;}
  if(!json||!bin)throw new Error('prop pack missing JSON/BIN');
  if(json.animations||json.skins||json.extensionsUsed?.length||json.extensionsRequired?.length)throw new Error('prop pack contains unsupported animation, skin or extension');
  if(json.accessors?.some((a)=>a.sparse))throw new Error('prop pack contains sparse accessors');
  const srgbTextures=new Set((json.materials||[]).map((material)=>material.pbrMetallicRoughness?.baseColorTexture?.index).filter(Number.isInteger));
  const textures=await Promise.all((json.textures||[]).map((_,i)=>makeTexture(json,bin,i,{srgb:srgbTextures.has(i)})));
  const nodeByMesh=new Map();for(const n of json.nodes||[])if(n.mesh!=null&&!nodeByMesh.has(n.mesh))nodeByMesh.set(n.mesh,nodeMatrix(n));
  const catalog=new Map();
  for(let mi=0;mi<(json.meshes||[]).length;mi++){
    const md=json.meshes[mi],entry={name:md.name||`mesh-${mi}`,nodeMatrix:nodeByMesh.get(mi)||identity(),extras:md.extras||{},primitives:[],instanceBuffer:gl.createBuffer()};
    for(const pd of md.primitives||[]){
      if(pd.mode!=null&&pd.mode!==4)throw new Error(`${entry.name}: triangles only`);if(pd.indices==null)throw new Error(`${entry.name}: indices required`);if(pd.targets?.length)throw new Error(`${entry.name}: morph targets unsupported`);const pos=readAccessor(json,bin,pd.attributes.POSITION),norm=pd.attributes.NORMAL!=null?readAccessor(json,bin,pd.attributes.NORMAL):null,uv=pd.attributes.TEXCOORD_0!=null?readAccessor(json,bin,pd.attributes.TEXCOORD_0):null,idx=readAccessor(json,bin,pd.indices);
      if(!norm)throw new Error(`${entry.name}: normals required`);const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      const bind=(loc,data,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};bind(0,pos,3);bind(1,norm,3);bind(2,uv||new Float32Array(pos.length/3*2),2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,entry.instanceBuffer);const stride=29*4;for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(3+c,1);}gl.enableVertexAttribArray(7);gl.vertexAttribPointer(7,1,gl.FLOAT,false,stride,64);gl.vertexAttribDivisor(7,1);gl.enableVertexAttribArray(8);gl.vertexAttribPointer(8,1,gl.FLOAT,false,stride,68);gl.vertexAttribDivisor(8,1);gl.enableVertexAttribArray(9);gl.vertexAttribPointer(9,1,gl.FLOAT,false,stride,72);gl.vertexAttribDivisor(9,1);gl.enableVertexAttribArray(10);gl.vertexAttribPointer(10,4,gl.FLOAT,false,stride,76);gl.vertexAttribDivisor(10,1);gl.enableVertexAttribArray(11);gl.vertexAttribPointer(11,1,gl.FLOAT,false,stride,92);gl.vertexAttribDivisor(11,1);gl.enableVertexAttribArray(12);gl.vertexAttribPointer(12,4,gl.FLOAT,false,stride,96);gl.vertexAttribDivisor(12,1);gl.enableVertexAttribArray(15);gl.vertexAttribPointer(15,1,gl.FLOAT,false,stride,112);gl.vertexAttribDivisor(15,1);
      const matDef=json.materials?.[pd.material||0]||{},mat=matDef.pbrMetallicRoughness||{},alphaMode=matDef.alphaMode||'OPAQUE';if(alphaMode!=='OPAQUE'&&alphaMode!=='MASK')throw new Error(`${entry.name}: ${alphaMode} material unsupported`);entry.primitives.push({vao,count:idx.length,indexType:json.accessors[pd.indices].componentType,base:mat.baseColorFactor||[1,1,1,1],emissive:Array.isArray(matDef.emissiveFactor)?matDef.emissiveFactor:[0,0,0],texture:textures[mat.baseColorTexture?.index]||null,normalTexture:textures[matDef.normalTexture?.index]||null,normalScale:matDef.normalTexture?.scale??1,ormTexture:textures[mat.metallicRoughnessTexture?.index]||null,metallic:mat.metallicFactor??1,roughness:mat.roughnessFactor??1,aoStrength:Number(matDef.occlusionTexture?.strength??matDef.extras?.openingStreetAoStrength??matDef.extras?.vegetationAoStrength)||0,materialRole:matDef.extras?.openingStreetRole||null,materialName:matDef.name||null,vegetationClass:matDef.extras?.vegetationClass||null,vegetationTransmission:Number(matDef.extras?.vegetationTransmission)||0,vegetationWetness:Number(matDef.extras?.vegetationWetness)||0,portrait:matDef.name==='portrait surface',alphaCut:alphaMode==='MASK'?(matDef.alphaCutoff??.5):0});
    }
    catalog.set(entry.name,entry);
  }
  gl.bindVertexArray(null);return{json,catalog};
}

export async function loadPropPack(url){pack=await parsePropPack(url);installDivideMeshes(gl,pack);installTowerPersonalMeshes(gl,pack);return pack;}

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

// A separate loader keeps the static prop validator deliberately static. The
// character pack is installed transactionally: malformed geometry, textures or
// an interrupted context never remove the room that was already loaded.
export async function addCharacterPack(url){
  if(!gl)throw new Error('props3dInit first');
  const context=gl,bundle={context,buffers:[],vaos:[],textures:[],catalog:new Map(),asset:null,url:String(url)};
  try{
    const response=await fetch(url);if(!response.ok)throw new Error(`character pack ${response.status}`);
    const asset=parseCharacterAsset(await response.arrayBuffer());bundle.asset=asset;
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
        context.bindBuffer(context.ARRAY_BUFFER,instanceBuffer);const stride=29*4;
        for(let c=0;c<4;c++){context.enableVertexAttribArray(3+c);context.vertexAttribPointer(3+c,4,context.FLOAT,false,stride,c*16);context.vertexAttribDivisor(3+c,1);}
        for(const[loc,size,offset]of[[7,1,64],[8,1,68],[9,1,72],[10,4,76],[11,1,92],[12,4,96],[15,1,112]]){context.enableVertexAttribArray(loc);context.vertexAttribPointer(loc,size,context.FLOAT,false,stride,offset);context.vertexAttribDivisor(loc,1);}
        let morphTexture=null,morphSize=[1,1];
        if(source.targets.length){
          const max=context.getParameter(context.MAX_TEXTURE_SIZE),texels=source.vertexCount*2*source.targets.length,w=Math.min(max,Math.max(1,source.vertexCount)),h=Math.ceil(texels/w);
          if(h>max)throw new Error('character morph texture exceeds device limit');
          const data=new Float32Array(w*h*4);
          source.targets.forEach((target,k)=>{for(let v=0;v<source.vertexCount;v++){data.set(target.positions.subarray(v*3,v*3+3),(k*source.vertexCount*2+v)*4);data.set(target.normals.subarray(v*3,v*3+3),(k*source.vertexCount*2+source.vertexCount+v)*4);}});
          morphTexture=context.createTexture();bundle.textures.push(morphTexture);context.bindTexture(context.TEXTURE_2D,morphTexture);context.texImage2D(context.TEXTURE_2D,0,context.RGBA32F,w,h,0,context.RGBA,context.FLOAT,data);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MIN_FILTER,context.NEAREST);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_MAG_FILTER,context.NEAREST);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_S,context.CLAMP_TO_EDGE);context.texParameteri(context.TEXTURE_2D,context.TEXTURE_WRAP_T,context.CLAMP_TO_EDGE);morphSize=[w,h];
        }
        mesh.primitives.push({vao,count:source.indices.length,indexType:source.indexType,base:material.baseColorFactor||[1,1,1,1],emissive:definition.emissiveFactor||[0,0,0],texture:bundle.textures[material.baseColorTexture?.index]||null,normalTexture:bundle.textures[definition.normalTexture?.index]||null,normalScale:definition.normalTexture?.scale??1,ormTexture:bundle.textures[material.metallicRoughnessTexture?.index]||null,metallic:material.metallicFactor??1,roughness:material.roughnessFactor??1,aoStrength:definition.occlusionTexture?.strength??(definition.occlusionTexture?1:0),materialRole:definition.extras?.characterRole||null,materialName:definition.name||null,portrait:false,alphaCut:mode==='MASK'?(definition.alphaCutoff??.5):0,characterMorphTexture:morphTexture,characterMorphSize:morphSize,characterMorphCount:source.targets.length,characterVertexCount:source.vertexCount});
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
export function prepareCharacterFrame(frameTime=0){
  if(frameTime!==characterFrameTime||characterFrameDirty){characterSnapshots=new WeakMap();characterFramePoses=[];characterFrameTime=frameTime;characterFrameDirty=false;}
  for(const instance of [...staticInstances,...dynamicInstances,...emergencyShadowInstances,...pressureInstances,...(propDiagnosticsEnabled?diagnosticInstances:[])])characterSnapshot(instance);
  return characterFramePoses.length;
}
export function characterStats(){
  return {loaded:characterBundles.size>0,error:characterLoadError,frame:characterFrameTime,meshes:[...characterBundles].flatMap(b=>[...b.catalog.keys()]),assets:[...characterBundles].flatMap(b=>b.asset.entries.map(e=>({mesh:e.name,vertices:e.primitives.reduce((n,p)=>n+p.vertexCount,0),triangles:e.primitives.reduce((n,p)=>n+p.indices.length/3,0),primitives:e.primitives.length,joints:e.skin.joints.length,morphs:e.morphCount}))),clips:[...new Set([...characterBundles].flatMap(b=>[...b.asset.clips.keys()]))],poses:characterFramePoses.map(p=>({id:p.id,mesh:p.mesh,clip:p.pose.clip,time:p.pose.time,layers:p.pose.layers,bounds:p.pose.bounds})),poseErrors:[...characterPoseErrors]};
}
function groupMeshName(key){return key.split('\0',1)[0];}
function bindCharacterPose(uniform,mesh,instance){
  const snapshot=characterSnapshot(instance,mesh);gl.uniform1f(uniform('uCharacterEnabled'),snapshot?1:0);
  if(snapshot){gl.uniformMatrix4fv(uniform('uCharacterBones[0]'),false,snapshot.pose.bones);gl.uniform4fv(uniform('uCharacterMorphWeights'),snapshot.pose.morphs);}
}
function bindCharacterMorph(uniform,primitive){
  gl.uniform1i(uniform('uCharacterMorphCount'),primitive.characterMorphCount||0);gl.uniform1i(uniform('uCharacterVertexCount'),primitive.characterVertexCount||0);const size=primitive.characterMorphSize||[1,1];gl.uniform2i(uniform('uCharacterMorphSize'),size[0],size[1]);gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,primitive.characterMorphTexture||null);gl.uniform1i(uniform('uCharacterMorphTex'),9);
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
  let name=pack.catalog.has(instance.mesh)?instance.mesh:(instance.fallbackMesh&&pack.catalog.has(instance.fallbackMesh)?instance.fallbackMesh:null);
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
function perspective(aspect){const f=1/.95,n=NEAR,fa=FAR;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(fa+n)/(n-fa),-1,0,0,(2*fa*n)/(n-fa),0]);}
function perspectiveFov(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,(2*far*near)/(near-far),0]);}
function view(eye,yaw,pitch=0){
  const cp=Math.cos(pitch),f=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp],z=[-f[0],-f[1],-f[2]];
  const xl=Math.max(.0001,Math.hypot(z[0],z[2])),x=[z[2]/xl,0,-z[0]/xl];
  const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[1]*eye[1]-x[2]*eye[2],-y[0]*eye[0]-y[1]*eye[1]-y[2]*eye[2],-z[0]*eye[0]-z[1]*eye[1]-z[2]*eye[2],1]);
}

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
function visibleGroups(eye,maxDistance,{shadow=false,emergencyOnly=false,lodEye=eye,reflection=false}={}){
  const groups=new Map();
  const ordinary=propDiagnosticsEnabled&&propDiagnosticOptions?.exclusive
    ?[]:[...staticInstances,...dynamicInstances,...emergencyShadowInstances];
  const instances=emergencyOnly?emergencyShadowInstances:[...ordinary,...(propDiagnosticsEnabled?diagnosticInstances:[])];
  for(const original of instances){
    const resolved=resolvedMeshName(original,lodEye);if(!resolved)continue;
    // A fallback can contain its own baked placement, unlike the actor root.
    const i=resolved!==original.mesh&&resolved===original.fallbackMesh
      ?{...original,...original.fallbackTransform,mesh:resolved,character:null}:original;
    if(propDiagnosticsEnabled&&propDiagnosticOptions?.excludedMeshes?.has(i.mesh))continue;
    if(!shadow&&i.shadowOnly)continue;
    if(shadow&&i.noShadow)continue;
    // Seen only mirrored in the wet (the double), and never in the mirror what the road is made of.
    if(!reflection&&i.reflectionOnly)continue;
    if(reflection&&(i.noReflection||REFLECTION_SKIP.has(i.mesh)))continue;
    if(!propInstanceVisible(i,eye,maxDistance))continue;
    const pose=i.character?characterSnapshot(i,pack?.catalog.get(resolved)):null;
    const key=pose?`${resolved}\0${pose.key}`:resolved;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);
  }
  return groups;
}
function uploadInstances(mesh,list){
  const data=new Float32Array(list.length*29);
  for(let k=0;k<list.length;k++){
    const at=k*29,authored=Array.isArray(list[k].emissive)?list[k].emissive:[0,0,0,0],practical=practicalLightFrameByPropId.get(list[k].id),emissive=practical?.color?[practical.color[0],practical.color[1],practical.color[2],authored[3]]:authored,lightScale=practical?.scale??list[k].practicalEmissiveScale??1;
    data.set(modelMatrix(list[k],mesh.nodeMatrix),at);data[at+16]=list[k].zone||0;data[at+17]=list[k].portraitIndex||0;data[at+18]=list[k].structural?1:0;data[at+19]=Number(emissive[0])||0;data[at+20]=Number(emissive[1])||0;data[at+21]=Number(emissive[2])||0;data[at+22]=Math.max(0,(Number(emissive[3])||0)*lightScale);
    const paperIndex=Number.isFinite(list[k].paperIndex)?Number(list[k].paperIndex):-1;data[at+23]=paperIndex;
    const handling=paperIndex>=0&&Array.isArray(PAPER_ATLAS_HANDLING?.[paperIndex])?PAPER_ATLAS_HANDLING[paperIndex]:[-1,0,0,0];
    data[at+24]=Number(handling[0])||0;if(handling[0]===-1)data[at+24]=-1;data[at+25]=Number(handling[1])||0;data[at+26]=Number(handling[2])||0;data[at+27]=Number(handling[3])||0;
    // Source fixtures retain authored emissive materials, but their real power
    // state must gate those materials as well as the instance glow.
    data[at+28]=list[k].sourceMemoryFixture?Math.max(0,Number(lightScale)||0):1;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
}
function renderShadowPass(eye,yaw,pitch,light,shadowLight=null,{timeSec=0,reducedMotion=false,lodEye=eye}={}){
  if(!gl||!shadowProgram||!gl.isProgram(shadowProgram))return false;
  const practical=shadowLight&&Number.isFinite(shadowLight.x)&&Number.isFinite(shadowLight.y)&&Number.isFinite(shadowLight.z)?shadowLight:null;
  shadowActive=false;if(!shadowReady||!shadowFbo||(!practical&&light<=.001)||!pack)return false;
  const forward=[Math.sin(yaw),0,-Math.cos(yaw)],right=[Math.cos(yaw),0,Math.sin(yaw)];
  const lightYaw=practical&&Number.isFinite(practical.shadowYaw)?practical.shadowYaw:yaw;
  const lightPitch=practical&&Number.isFinite(practical.shadowPitch)?practical.shadowPitch:pitch;
  const lightEye=practical?[practical.x,practical.y,practical.z]:[eye[0]+right[0]*.12,eye[1]-.08,eye[2]+right[2]*.12];
  const shadowFov=practical?104*Math.PI/180:66*Math.PI/180;
  shadowMatrix=multiply(perspectiveFov(shadowFov,1,.05,64),view(lightEye,lightYaw,lightPitch));
  // A normal torch shadow map contains the room. The red apparition pass is a
  // projection event: admitting every chair, portal and handrail buried the
  // three human silhouettes in a pile of rectangular ordinary shadows.
  const groups=visibleGroups(lightEye,64,{shadow:true,emergencyOnly:!!practical&&emergencyShadowInstances.length>0,lodEye});
  gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo);gl.viewport(0,0,shadowSize,shadowSize);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.2,2.0);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProgram);gl.uniformMatrix4fv(SU('uShadowMatrix'),false,shadowMatrix);gl.uniform1f(SU('uTimeSec'),Number(timeSec)||0);gl.uniform1f(SU('uReducedMotion'),reducedMotion?1:0);
  for(const[name,list]of groups){const mesh=pack.catalog.get(groupMeshName(name));if(!mesh||!list.length)continue;bindCharacterPose(SU,mesh,list[0]);const wind=mesh.extras?.vegetationWind||{};gl.uniform4f(SU('uVegetationWind'),Number(wind.amplitudeM)||0,Number(wind.frequencyHz)||0,Number(wind.anchorY)||0,Math.max(.01,Number(wind.heightM)||1));uploadInstances(mesh,list);for(const primitive of mesh.primitives){bindCharacterMorph(SU,primitive);gl.bindVertexArray(primitive.vao);gl.uniform1f(SU('uBaseAlpha'),primitive.base[3]??1);gl.uniform1f(SU('uAlphaCut'),primitive.alphaCut);gl.uniform1f(SU('uUseTex'),primitive.texture?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,primitive.texture);gl.uniform1i(SU('uTex'),0);gl.drawElementsInstanced(gl.TRIANGLES,primitive.count,primitive.indexType,0,list.length);if(activePropDiagnostics){activePropDiagnostics.shadowDrawCalls+=1;activePropDiagnostics.shadowTriangles+=primitive.count/3*list.length;}}}
  gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);shadowActive=true;return true;
}

// Prepare once before reflection and main so both see this frame's blockers.
// Callers that do not need reflection retain renderPropPass's automatic path.
export function preparePropShadowPass({camX,camY,camZ,yaw,pitch=0,light=1,shadowLight=null,timeSec=0,reducedMotion=false,torchYawOffset=0}){
  if(characterFrameDirty)prepareCharacterFrame(timeSec);
  return renderShadowPass([camX,camY,camZ],yaw+torchYawOffset,pitch,light,shadowLight,{timeSec,reducedMotion,lodEye:[camX,camY,camZ]});
}

export function setPropInstances(next){staticInstances=Array.isArray(next)?next:[];vegetationLodState.clear();characterFrameDirty=true;}
export function setDynamicPropInstances(next){dynamicInstances=Array.isArray(next)?next:[];characterFrameDirty=true;}

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
      if(![instance.yaw,instance.scale,instance.scaleX,instance.scaleY,instance.scaleZ].every(Number.isFinite))continue;
      instances.push(instance);if(instances.length===4)break;
    }catch{ /* A malformed descriptor cannot invalidate the other actors. */ }
  }
  pressureInstances=instances;characterFrameDirty=true;
  return pressureInstances.length;
}

export function renderPressurePass({camX,camY,camZ,yaw,pitch=0,timeSec=0,reducedMotion=false,maxDistance=90}={}){
  pressureDraws=0;
  if(!gl||!pressureReady||!pressureFbo||!pressureProgram||!gl.isProgram(pressureProgram))return false;
  const eye=[camX,camY,camZ];if(![...eye,yaw,pitch].every(Number.isFinite))return false;
  if(characterFrameDirty)prepareCharacterFrame(timeSec);
  const cp=Math.cos(pitch),forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  gl.bindFramebuffer(gl.FRAMEBUFFER,pressureFbo);gl.viewport(0,0,pressureWidth,pressureHeight);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(pressureProgram);gl.uniformMatrix4fv(HU('uView'),false,view(eye,yaw,pitch));gl.uniformMatrix4fv(HU('uProj'),false,perspective(pressureWidth/pressureHeight));
  gl.uniform3fv(HU('uEye'),eye);gl.uniform3fv(HU('uForward'),forward);gl.uniform1f(HU('uPressureFar'),FAR);
  gl.uniform1f(HU('uTimeSec'),Number(timeSec)||0);gl.uniform1f(HU('uReducedMotion'),reducedMotion?1:0);gl.uniform4f(HU('uVegetationWind'),0,0,0,1);
  for(const instance of pressureInstances){
    const mesh=pack?.catalog.get(instance.mesh),p=instance.pressure;
    if(!mesh?.characterAsset||p.mode==='off'||p.strength<=.001||!propInstanceVisible(instance,eye,maxDistance))continue;
    const core=p.mode==='glow'?0:1,glow=p.mode==='core'||p.glow<=0?0:1;
    bindCharacterPose(HU,mesh,instance);uploadInstances(mesh,[instance]);gl.uniform4f(HU('uPressure'),p.strength,core,glow,p.seed);
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

export function pressureTargets(){return{color:pressureColorTex,depth:pressureDepthTex,ready:pressureReady,width:pressureWidth,height:pressureHeight,near:NEAR,far:FAR,instances:pressureInstances.length,draws:pressureDraws,error:pressureError};}
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
export function propTargets(){return{color:colorTex,depth:depthTex,marks:marksTex,marksReady,openingMask:openingMaskTex,openingMaskReady,ready:!!fbo,near:NEAR,far:FAR,shadow:shadowDepthTex,shadowReady:!!(shadowReady&&shadowActive),shadowMatrix,shadowTexel:new Float32Array([1/Math.max(1,shadowSize),1/Math.max(1,shadowSize)]),shadowSize};}

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
let sourceTextAtlasOverflowWarned=false;
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
  const unique=[...new Set((sourceTextCorpus.length?sourceTextCorpus:instances.map((entry)=>String(entry.text||entry.source?.text||''))).filter(Boolean))];
  const layout=sourceTextAtlasLayout(unique.length,gl.getParameter(gl.MAX_TEXTURE_SIZE)||SOURCE_TEXT_ATLAS_CAP);
  const baseKey=sourceCorpusKey?`corpus:${sourceCorpusKey}`:atlasSignature(unique),key=`${baseKey}@${layout.size}:${unique.length}`;if(key===textAtlasKey&&textAtlas)return;
  textAtlasKey=key;textAtlasEntries=new Map();textAtlasBuilds+=1;textAtlasSize=layout.size;textAtlasCapacity=layout.capacity;textAtlasEntryCount=unique.length;
  const {size,cellWidth:cellW,cellHeight:cellH,columns:cols}=layout;
  // Never write past the atlas: layout.entries is the clamped count.
  if(unique.length>layout.entries)unique.length=layout.entries;
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);ctx.textBaseline='middle';ctx.fillStyle='#fff';
  unique.forEach((text,index)=>{
    const col=index%cols,row=Math.floor(index/cols),x=col*cellW,y=row*cellH;
    ctx.save();ctx.beginPath();ctx.rect(x+1,y+1,cellW-2,cellH-2);ctx.clip();
    let font=14;ctx.font=`${font}px monospace`;while(font>6&&ctx.measureText(text).width>cellW-8){font-=1;ctx.font=`${font}px monospace`;}
    ctx.fillText(text,x+4,y+cellH/2);
    ctx.restore();
    // Canvas rows are uploaded with FLIP_Y so authored top-left coordinates
    // live at the top of the GL texture. Mirror the V rect to sample those
    // populated rows instead of the transparent bottom of the atlas.
    textAtlasEntries.set(text,[(x+1)/size,1-(y+cellH-1)/size,(x+cellW-1)/size,1-(y+1)/size]);
  });
  if(textAtlas)gl.deleteTexture(textAtlas);textAtlas=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,textAtlas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
}
function renderSourceText(viewMatrix,projection,eye,forward,maxDistance,lighting={}){
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
  if(!sourceTextInstances.length||!textProgram)return;
  ensureTextAtlas();const visible=[];
  for(const entry of sourceTextInstances){const m=entry.matrix;if(!m||m.length!==16)continue;const dx=m[12]-eye[0],dz=m[14]-eye[2],d=Math.hypot(dx,dz);if(d>maxDistance)continue;if(d>4&&(dx*forward[0]+dz*forward[2])/Math.max(.001,d)<-.15)continue;const text=String(entry.text||entry.source?.text||''),uv=textAtlasEntries.get(text);if(!uv)continue;visible.push({entry,m,uv,d});}
  if(!visible.length){sourceVisibleInstanceCount=0;return;}
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
  const physical=lighting.sourceRoomLighting===true;
  const data=new Float32Array(visible.length*24);visible.forEach(({entry,m,uv},index)=>{data.set(m,index*24);data.set(uv,index*24+16);data.set(textColor(entry,physical),index*24+20);});
  gl.useProgram(textProgram);gl.uniformMatrix4fv(TU('uView'),false,viewMatrix);gl.uniformMatrix4fv(TU('uProj'),false,projection);
  gl.uniform1f(TU('uSourceRoomLighting'),physical?1:0);
  gl.uniform1f(TU('uMarksOnly'),0);
  if(physical){
    const torch=lighting.torch||{};
    gl.uniform3fv(TU('uEye'),eye);gl.uniform3fv(TU('uForward'),lighting.torchForward||forward);
    gl.uniform1f(TU('uLight'),Number(lighting.light)||0);gl.uniform3fv(TU('uTorchColor'),torch.color||[1,.94,.82]);gl.uniform1f(TU('uTorchReach'),Number(torch.reach)||1);gl.uniform2f(TU('uTorchCone'),Number(torch.coneInner)||.88,Number(torch.coneOuter)||.94);gl.uniform1f(TU('uTorchSpill'),Number(torch.spill??.05)||0);gl.uniform1f(TU('uTorchShoulder'),Math.max(0,Math.min(2,Number(torch.shoulder)||0)));
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
  if(physical){gl.uniform1f(TU('uMarksOnly'),1);gl.drawBuffers([gl.NONE,gl.NONE,gl.COLOR_ATTACHMENT2]);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,visible.length);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.uniform1f(TU('uMarksOnly'),0);}
  gl.bindVertexArray(null);
}

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

export function renderPropPass({camX,camY,camZ,yaw,pitch=0,light=1,maxDistance=90,timeSec=0,reducedMotion=false,fogTexture,fogOrigin=[0,0],fogSize=256,cellMeters=.5,zoneTints,localLightCount=0,localLightPositions,localLightColors,localLightPenetrations,localLightEmergency=null,localShadowIndex=-1,shadowLight=null,torch={},ambientColor=[.64,.65,.62],ambientIntensity=.022,planTexture=null,planSize=[0,0],planOrigin=[0,0],streetTextures=false,reflection=false,torchYawOffset=0,shadowPrepared=false,sourceRoomLighting=false}){
  if(!reflection){openingMaskReady=false;marksReady=false;}
  if(!gl||!fbo||!program||!gl.isProgram(program))return false;if(reflection&&!reflFbo)return false;const cp=Math.cos(pitch),eye=[camX,camY,camZ],forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  // uForward is only the torch's axis: a beam that is not quite pointing where he looks.
  const torchForward=torchYawOffset?[Math.sin(yaw+torchYawOffset)*cp,Math.sin(pitch),-Math.cos(yaw+torchYawOffset)*cp]:forward;
  const viewMatrix=view(eye,yaw,pitch),projection=perspective(width/height);
  activePropDiagnostics=propDiagnosticsEnabled?{visibleMaterialRoles:new Set(),mainDrawCalls:0,shadowDrawCalls:0,renderedInstances:0,triangles:0,shadowTriangles:0}:null;
  if(characterFrameDirty)prepareCharacterFrame(timeSec);
  if(!reflection&&!shadowPrepared)renderShadowPass(eye,yaw,pitch,light,shadowLight,{timeSec,reducedMotion,lodEye:eye});
  gl.bindFramebuffer(gl.FRAMEBUFFER,reflection?reflFbo:fbo);gl.viewport(0,0,reflection?reflW:width,reflection?reflH:height);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.drawBuffers(sourceRoomLighting&&!reflection?[gl.COLOR_ATTACHMENT0,gl.NONE,gl.COLOR_ATTACHMENT2]:[gl.COLOR_ATTACHMENT0]);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniform1f(U('uSourceRoomLighting'),sourceRoomLighting?1:0);gl.uniformMatrix4fv(U('uView'),false,viewMatrix);gl.uniformMatrix4fv(U('uProj'),false,projection);gl.uniform3fv(U('uEye'),eye);gl.uniform3fv(U('uForward'),torchForward);gl.uniform1f(U('uLight'),light);gl.uniform1f(U('uTimeSec'),Number(timeSec)||0);gl.uniform1f(U('uReducedMotion'),reducedMotion?1:0);gl.uniform3fv(U('uTorchColor'),torch.color||[1,.94,.82]);gl.uniform1f(U('uTorchReach'),Number(torch.reach)||1);gl.uniform2f(U('uTorchCone'),Number(torch.coneInner)||.88,Number(torch.coneOuter)||.94);gl.uniform1f(U('uTorchSpill'),Number(torch.spill??.05)||0);gl.uniform1f(U('uTorchShoulder'),Math.max(0,Math.min(2,Number(torch.shoulder)||0)));gl.uniform3fv(U('uAmbientColor'),ambientColor);gl.uniform1f(U('uAmbientIntensity'),Number(ambientIntensity)||.022);gl.uniform3fv(U('uZoneTint[0]'),zoneTints);gl.uniform2fv(U('uFogOrigin'),fogOrigin);gl.uniform1f(U('uFogSize'),fogSize);gl.uniform1f(U('uCellMeters'),cellMeters);gl.uniform1i(U('uLocalLightCount'),localLightCount);gl.uniform1i(U('uLocalShadowIndex'),localShadowIndex);if(localLightPositions)gl.uniform4fv(U('uLocalLightPos[0]'),localLightPositions);if(localLightColors)gl.uniform4fv(U('uLocalLightColor[0]'),localLightColors);if(localLightPenetrations)gl.uniform1fv(U('uLocalLightPenetration[0]'),localLightPenetrations);if(localLightEmergency)gl.uniform1fv(U('uLocalLightEmergency[0]'),localLightEmergency);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fogTexture);gl.uniform1i(U('uFogTex'),1);gl.uniform1f(U('uShadowReady'),shadowActive?1:0);gl.uniformMatrix4fv(U('uShadowMatrix'),false,shadowMatrix);gl.uniform2f(U('uShadowTexel'),1/Math.max(1,shadowSize),1/Math.max(1,shadowSize));gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,shadowDepthTex);gl.uniform1i(U('uShadowTex'),6);gl.uniform1f(U('uPlanReady'),planTexture&&planSize[0]>0&&planSize[1]>0?1:0);gl.uniform2f(U('uPlanSize'),planSize[0]||0,planSize[1]||0);gl.uniform2f(U('uPlanOrigin'),planOrigin[0]||0,planOrigin[1]||0);gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,planTexture);gl.uniform1i(U('uPlanTex'),7);
  const groups=visibleGroups(eye,maxDistance,{lodEye:eye,reflection});
  if(reflection){lastReflectionInstances=0;lastReflectionOnly=0;for(const list of groups.values()){lastReflectionInstances+=list.length;lastReflectionOnly+=list.filter((i)=>i.reflectionOnly).length;}}
  for(const [name,list] of groups){const m=pack?.catalog.get(groupMeshName(name));if(!m||!list.length)continue;bindCharacterPose(U,m,list[0]);const wind=m.extras?.vegetationWind||{};gl.uniform4f(U('uVegetationWind'),Number(wind.amplitudeM)||0,Number(wind.frequencyHz)||0,Number(wind.anchorY)||0,Math.max(.01,Number(wind.heightM)||1));uploadInstances(m,list);
    if(activePropDiagnostics)activePropDiagnostics.renderedInstances+=list.length;
    for(const p of m.primitives){bindCharacterMorph(U,p);gl.bindVertexArray(p.vao);gl.uniform1f(U('uPayphoneCast'),p.materialName==='payphone cast iron'?1:0);gl.uniform3fv(U('uBase'),p.base.slice(0,3));gl.uniform3fv(U('uMaterialEmissive'),p.emissive||[0,0,0]);gl.uniform4f(U('uVegetation'),VEGETATION_CLASS[p.vegetationClass]||0,p.vegetationTransmission||0,p.vegetationWetness||0,0);gl.uniform1f(U('uBaseAlpha'),p.base[3]??1);gl.uniform1f(U('uAlphaCut'),p.alphaCut);const street=streetTextures&&!p.texture?streetSetFor(p.materialName):null;gl.uniform1f(U('uStreetTex'),street?1:0);gl.uniform1f(U('uStreetMix'),street?street.mix:0);gl.uniform1f(U('uStreetScale'),street?street.scale:1);gl.uniform1f(U('uUseTex'),p.texture?1:0);gl.uniform1f(U('uUseNormal'),p.normalTexture?1:0);gl.uniform1f(U('uUseOrm'),p.ormTexture?1:0);gl.uniform1f(U('uNormalScale'),p.normalScale??1);gl.uniform1f(U('uAoStrength'),p.aoStrength??0);gl.uniform1f(U('uMetallic'),p.metallic??0);gl.uniform1f(U('uRoughness'),p.roughness??1);gl.uniform1f(U('uUsePortrait'),p.portrait&&portraitAtlas?1:0);gl.uniform1f(U('uUsePaperAtlas'),name.startsWith('loose_note')&&paperAtlas?1:0);gl.uniform2f(U('uPaperAtlasGrid'),paperAtlasGrid[0],paperAtlasGrid[1]);gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,paperAtlas);gl.uniform1i(U('uPaperAtlas'),8);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,p.texture);gl.uniform1i(U('uTex'),0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,portraitAtlas);gl.uniform1i(U('uPortraitAtlas'),2);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,p.normalTexture);gl.uniform1i(U('uNormalTex'),4);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,p.ormTexture);gl.uniform1i(U('uOrmTex'),5);gl.drawElementsInstanced(gl.TRIANGLES,p.count,p.indexType,0,list.length);if(activePropDiagnostics){activePropDiagnostics.mainDrawCalls+=1;activePropDiagnostics.triangles+=p.count/3*list.length;if(p.materialRole)activePropDiagnostics.visibleMaterialRoles.add(p.materialRole);}}
  }
  if(!reflection){renderSourceText(viewMatrix,projection,eye,forward,maxDistance,{sourceRoomLighting,torch,torchForward,light,ambientColor,ambientIntensity,localLightCount,localLightPositions,localLightColors,localLightEmergency});marksReady=!!sourceRoomLighting;}
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
  if(activePropDiagnostics){lastPropDiagnostics={visibleMaterialRoles:[...activePropDiagnostics.visibleMaterialRoles].sort(),mainDrawCalls:activePropDiagnostics.mainDrawCalls,shadowDrawCalls:activePropDiagnostics.shadowDrawCalls,renderedInstances:activePropDiagnostics.renderedInstances,triangles:activePropDiagnostics.triangles,shadowTriangles:activePropDiagnostics.shadowTriangles};activePropDiagnostics=null;}
  gl.bindVertexArray(null);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true;
}

export function propPackStats(){return pack?{meshes:pack.catalog.size,instances:staticInstances.length,dynamicInstances:dynamicInstances.length,diagnosticInstances:propDiagnosticsEnabled?diagnosticInstances.length:0,diagnosticMeshes:propDiagnosticsEnabled?diagnosticInstances.map((instance)=>({mesh:instance.mesh,loaded:pack.catalog.has(instance.mesh),x:instance.x,y:instance.y,z:instance.z})):null,diagnosticOptions:propDiagnosticsEnabled?{exclusive:!!propDiagnosticOptions?.exclusive,excludedMeshes:[...(propDiagnosticOptions?.excludedMeshes||[])]}:null,emergencyShadowInstances:emergencyShadowInstances.length,sourceText:sourceStaticTextInstances.length+sourceDynamicTextInstances.length,sourceStaticText:sourceStaticTextInstances.length,sourceDynamicText:sourceDynamicTextInstances.length,sourceStaticBatches:sourceStaticTextBatches.length,sourceVisibleBatches:sourceVisibleBatchCount,sourceVisibleInstances:sourceVisibleInstanceCount,sourceTextVisibleCap:SOURCE_TEXT_VISIBLE_CAP,sourceSceneKey,sourceCorpusKey,textAtlasBuilds,textAtlasSize,textAtlasCapacity,textAtlasEntries:textAtlasEntryCount,diagnosticsEnabled:propDiagnosticsEnabled,diagnostics:propDiagnosticsEnabled?lastPropDiagnostics:null,shadow:{ready:shadowReady,active:shadowActive,size:shadowSize}}:null;}
export function propInstanceIds(){return staticInstances.map((instance)=>instance.id);}
export function props3dDebugShaders(){return {vertex:VERT,fragment:FRAG,textVertex:TEXT_VERT,textFragment:TEXT_FRAG,shadowVertex:SHADOW_VERT,shadowFragment:SHADOW_FRAG,pressureVertex:VERT,pressureFragment:PRESSURE_FRAG};}

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
uniform vec3 uEye;uniform float uTime,uCalm;
out vec4 o;
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
let portalProgram=null,portalVao=null,portalBuffer=null;
const portalUniforms=new Map();
function PU(name){if(!portalUniforms.has(name))portalUniforms.set(name,gl.getUniformLocation(portalProgram,name));return portalUniforms.get(name);}
export function sourcePortalShaders(){return{vertex:PORTAL_VERT,fragment:PORTAL_FRAG};}
export function sourceCrossingShaders(){return{vertex:CROSSING_VERT,fragment:CROSSING_FRAG};}
export function sourcePortalProgramReady(){return !!(gl&&portalProgram&&gl.isProgram(portalProgram));}
// Each open door is a marched world, so only the nearest few are drawn.
const PORTAL_LIMIT=4;
export function renderSourcePortals({camX,camY,camZ,yaw,pitch=0,portals=[],timeSec=0,reducedMotion=false,stormFlash=0}={}){
  if(!gl||!fbo||!Array.isArray(portals)||!portals.length)return 0;
  if(!portalProgram||!gl.isProgram(portalProgram)){
    portalProgram=linkProgram(PORTAL_VERT,PORTAL_FRAG,'source portal');portalUniforms.clear();
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
  const eye=[camX,camY,camZ];
  const originOf=(portal)=>{
    if(Array.isArray(portal?.origin)&&portal.origin.length===3)return portal.origin;
    const c=portal?.corners;
    return Array.isArray(c)&&c.length===4?[(c[0][0]+c[1][0])/2,(c[0][1]+c[1][1])/2,(c[0][2]+c[1][2])/2]:null;
  };
  const nearest=portals.map((portal)=>({portal,origin:originOf(portal)}))
    .filter((entry)=>entry.origin&&Array.isArray(entry.portal.corners)&&entry.portal.corners.length===4)
    .sort((a,b)=>Math.hypot(a.origin[0]-eye[0],a.origin[2]-eye[2])-Math.hypot(b.origin[0]-eye[0],b.origin[2]-eye[2]))
    .slice(0,PORTAL_LIMIT);
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
  gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.useProgram(portalProgram);
  gl.uniformMatrix4fv(PU('uView'),false,view(eye,yaw,pitch));gl.uniformMatrix4fv(PU('uProj'),false,perspective(width/height));
  gl.uniform3fv(PU('uEye'),eye);gl.uniform1f(PU('uTime'),reducedMotion?0:Number(timeSec)||0);gl.uniform1f(PU('uCalm'),reducedMotion?1:0);gl.uniform1f(PU('uStormFlash'),Number(stormFlash)||0);
  gl.bindVertexArray(portalVao);gl.bindBuffer(gl.ARRAY_BUFFER,portalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,data.subarray(0,vertices*16),gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES,0,vertices);gl.bindVertexArray(null);
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
void main(){gl_Position=uMode>.5?vec4(aPos.xy,0.0,1.0):uProj*uView*vec4(aPos,1.0);}`;
const TOWER_VIEW_FRAG=`#version 300 es
precision highp float;
uniform vec2 uRes;uniform vec3 uEye;uniform float uYaw,uPitch,uMode;
uniform sampler2D uViewColor,uViewDepth;
uniform vec3 uViewEye;uniform float uViewYaw,uViewAspect;
uniform vec3 uOrigin;uniform vec2 uForward;
out vec4 o;
vec3 towerLinear(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec2 towerProject(vec3 p,vec3 vf,vec3 vr,out float z){
  z=dot(p,vf);
  return vec2(dot(p,vr)/(max(z,.001)*.95*uViewAspect),p.y/(max(z,.001)*.95))*.5+.5;
}
float towerDepth(vec2 uv){float a=texture(uViewDepth,uv).a;return (1.0/max(a,1e-4)-1.0)/.14;}
void main(){
  gl_FragDepth=uMode>.5?0.0:gl_FragCoord.z;
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
let towerViewProgram=null,towerViewVao=null,towerViewBuffer=null;
const towerViewUniforms=new Map();
function TVU(name){if(!towerViewUniforms.has(name))towerViewUniforms.set(name,gl.getUniformLocation(towerViewProgram,name));return towerViewUniforms.get(name);}
export function sourceTowerViewShaders(){return{vertex:TOWER_VIEW_VERT,fragment:TOWER_VIEW_FRAG};}
// view: {corners, origin, forward, width, capture:{color, depth, eye, yaw, aspect}}.
// Returns 0 when nothing was drawn, 1 for the opening, 2 for the doorway.
export function renderSourceTowerView({camX,camY,camZ,yaw,pitch=0,view:tower=null,inside=false}={}){
  const capture=tower?.capture;
  if(!gl||!fbo||!capture?.color||!capture?.depth||!Array.isArray(tower.corners)||tower.corners.length!==4)return 0;
  const eye=[camX,camY,camZ],f=tower.forward,o=tower.origin;
  const eyeDepth=(eye[0]-o[0])*f[0]+(eye[2]-o[2])*f[1];
  if(eyeDepth>=0&&!inside)return 0;
  if(!towerViewProgram||!gl.isProgram(towerViewProgram)){
    towerViewProgram=linkProgram(TOWER_VIEW_VERT,TOWER_VIEW_FRAG,'source tower view');towerViewUniforms.clear();
    towerViewVao=gl.createVertexArray();towerViewBuffer=gl.createBuffer();
    gl.bindVertexArray(towerViewVao);gl.bindBuffer(gl.ARRAY_BUFFER,towerViewBuffer);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    gl.bindVertexArray(null);
  }
  const c=tower.corners;
  const data=inside?new Float32Array([-1,-1,0,3,-1,0,-1,3,0])
    :new Float32Array([...c[0],...c[1],...c[2],...c[0],...c[2],...c[3]]);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);
  gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.depthMask(true);
  // The doorway writes the nearest depth everywhere (a disabled depth test would
  // write none, and the composite would haze the belfry back into the field).
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(inside?gl.ALWAYS:gl.LEQUAL);
  gl.useProgram(towerViewProgram);
  gl.uniformMatrix4fv(TVU('uView'),false,view(eye,yaw,pitch));gl.uniformMatrix4fv(TVU('uProj'),false,perspective(width/height));
  gl.uniform1f(TVU('uMode'),inside?1:0);gl.uniform2f(TVU('uRes'),width,height);
  gl.uniform3fv(TVU('uEye'),eye);gl.uniform1f(TVU('uYaw'),Number(yaw)||0);gl.uniform1f(TVU('uPitch'),Number(pitch)||0);
  gl.uniform3fv(TVU('uViewEye'),capture.eye);gl.uniform1f(TVU('uViewYaw'),Number(capture.yaw)||0);gl.uniform1f(TVU('uViewAspect'),Number(capture.aspect)||1);
  gl.uniform3fv(TVU('uOrigin'),o);gl.uniform2f(TVU('uForward'),Number(f[0])||0,Number(f[1])||0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,capture.color);gl.uniform1i(TVU('uViewColor'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,capture.depth);gl.uniform1i(TVU('uViewDepth'),1);
  gl.bindVertexArray(towerViewVao);gl.bindBuffer(gl.ARRAY_BUFFER,towerViewBuffer);
  gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  gl.drawArrays(gl.TRIANGLES,0,data.length/3);gl.bindVertexArray(null);
  gl.depthFunc(gl.LEQUAL);
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
uniform float uAbsorbsLight;
layout(location=0) out vec4 o;
layout(location=1) out vec4 absence;
void main(){o=vec4(uColour,1.0);absence=vec4(vec3(uAbsorbsLight),1.0);}`;
let openingProgram=null,openingVao=null,openingBuffer=null;
export function renderSourceOpenings({camX,camY,camZ,yaw,pitch=0,openings=[]}={}){
  if(!gl||!fbo||!Array.isArray(openings)||!openings.length)return 0;
  if(!openingProgram||!gl.isProgram(openingProgram)){
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
  gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  gl.clearBufferfv(gl.COLOR,1,new Float32Array([0,0,0,0]));
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  gl.useProgram(openingProgram);
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
  if(!crossingProgram||!gl.isProgram(crossingProgram)){
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
