// Request-scoped study adapter. No production source is written.
// Final acquisition ink/dither and POST are preserved. A private camera-ray
// calibration matches the narrower cabin projection; source hashes are receipted.
import{createHash}from'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
// Transparent glass and air are resolved against actual material depth before
// acquisition. The pane is a cabin-space plane, never a screen-space overlay.
const DRIVE_WEATHER_GLSL=`
uniform mat4 uDriveCabinInverse,uDriveVolumeShadowMatrix;
uniform vec4 uDriveWeather,uDrivePane,uDrivePaneSlope,uDriveWeatherExtra;
uniform vec4 uDriveFogLamp0,uDriveFogLamp1;
uniform sampler2D uDriveWetness,uDriveVolumeShadow;
uniform float uDriveVolumeShadowReady;
float driveDepth(vec2 q){float z=texture(uDepth,q).r*2.0-1.0;return 2.0*uNearFar.x*uNearFar.y/max(.0001,uNearFar.y+uNearFar.x-z*(uNearFar.y-uNearFar.x));}
float driveCabinExit(vec3 p,vec3 d){
 vec3 safe=sign(d)*max(abs(d),vec3(.00001));safe=mix(vec3(.00001),safe,step(vec3(.00001),abs(d)));
 vec3 face=mix(vec3(-.905,.60,-1.20),vec3(.905,2.23,.95),step(vec3(0.0),d));
 vec3 t=(face-p)/safe;return max(0.0,min(t.x,min(t.y,t.z)));
}
float driveFogShadow(vec3 p){if(uDriveVolumeShadowReady<.5)return 1.0;vec4 clip=uDriveVolumeShadowMatrix*vec4(p,1.0);if(clip.w<=0.0)return 1.0;vec3 q=clip.xyz/clip.w*.5+.5;if(any(lessThanEqual(q,vec3(0.0)))||any(greaterThanEqual(q,vec3(1.0))))return 1.0;return q.z-.00035<=texture(uDriveVolumeShadow,q.xy).r?1.0:.04;}
float driveLampBeam(vec3 p,vec4 lamp){vec3 r=p-lamp.xyz,forward=vec3(sin(uDriveWeatherExtra.x),0.0,-cos(uDriveWeatherExtra.x));float along=dot(r,forward),across=abs(dot(r,vec3(cos(uDriveWeatherExtra.x),0.0,sin(uDriveWeatherExtra.x))));float spread=1.0-smoothstep(.19,.46,across/max(.3,along));float cutoff=1.0-smoothstep(-.010,.018,r.y/max(.3,along)+uDriveWeatherExtra.y);return lamp.w*step(.05,along)*spread*cutoff*min(2.0,pow(18.0/(10.0+max(0.0,along)),2.0));}
vec4 driveAir(vec3 eye,vec3 rd,float begin,float end){
 float lengthM=clamp(end-begin,0.0,180.0),stepM=lengthM*.25,transmission=1.0;vec3 scattered=vec3(0.0);
 for(int i=0;i<4;i++){vec3 p=eye+rd*(begin+(float(i)+.5)*stepM);float pocket=.80+.20*sin(p.x*.037+p.z*.021+uDrivePaneSlope.z*.017);float low=exp(-max(0.0,p.y-1.0)*.16);float beta=uDriveWeather.y*pocket*low;
  float t=exp(-beta*stepM),lamps=(driveLampBeam(p,uDriveFogLamp0)+driveLampBeam(p,uDriveFogLamp1))*driveFogShadow(p);
  scattered+=transmission*(1.0-t)*(vec3(.005,.0065,.008)+vec3(1.0,.89,.72)*lamps*.018);transmission*=t;}
 return vec4(scattered,transmission);
}
vec3 driveDrop(vec3 ro,vec3 rd,vec2 cell,float end){
 float seed=hash01(cell.x+19.0,cell.y-7.0),occupancy=.48*sqrt(clamp(uDriveWeather.x,0.0,1.0));if(uDriveWeather.x<=.001||seed<1.0-occupancy)return vec3(0.0);
 float clock=uDriveWeather.z*mix(1.0,.38,uReduceMotionOptical),fall=mix(5.5,8.5,seed),span=9.0;
 float top=6.0-mod(seed*span+clock*fall,span),streak=mix(.16,.30,seed)*mix(1.0,.4,uReduceMotionOptical);
 vec3 a=vec3((cell.x+hash01(cell.x+3.0,cell.y))*1.1,top,(cell.y+hash01(cell.x,cell.y+9.0))*1.1),b=a-vec3(streak*.23,streak,streak*.10),v=b-a,w=ro-a;
 float B=dot(rd,v),C=dot(v,v),D=dot(rd,w),E=dot(v,w),den=C-B*B;
 float along=den>.000001?(B*E-C*D)/den:0.0,t=clamp((E+B*max(0.0,along))/max(.000001,C),0.0,1.0);along=max(0.0,dot(a+v*t-ro,rd));
 if(along<=.02||along>=end)return vec3(0.0);float distanceM=length(ro+rd*along-a-v*t),radius=.006+.004*seed,pixelRadius=along*.65/uRes.y,aa=max(.001,pixelRadius);
 float coverage=(1.0-smoothstep(max(0.0,radius-aa),radius+aa,distanceM))*min(1.0,radius/max(.001,pixelRadius))*(1.0-smoothstep(end*.85,end,along));if(coverage<=.001)return vec3(0.0);
 vec3 hit=ro+rd*along;float lamps=(driveLampBeam(hit,uDriveFogLamp0)+driveLampBeam(hit,uDriveFogLamp1))*driveFogShadow(hit);
 // Rain controls how many world drops exist, not the brightness of each one.
 // A detected drop reflects a dim sky plus its actual bounded lamp exposure.
 return coverage*(vec3(.014,.016,.019)+vec3(1.0,.89,.72)*min(.060,lamps*.022));
}
vec3 driveRain(vec3 ro,vec3 rd,float end){
 float horizontal=length(rd.xz);if(horizontal<.001||end<=.02)return vec3(0.0);vec2 pos=ro.xz/1.1,cell=floor(pos),dir=rd.xz/horizontal,stp=sign(dir),safe=max(abs(dir),vec2(.00001)),delta=1.0/safe;
 vec2 boundary=cell+max(stp,vec2(0.0)),next=abs(boundary-pos)/safe;vec3 acc=driveDrop(ro,rd,cell,end);
 for(int i=0;i<10;i++){float travelled;if(next.x<next.y){travelled=next.x;next.x+=delta.x;cell.x+=stp.x;}else{travelled=next.y;next.y+=delta.y;cell.y+=stp.y;}if(travelled*1.1/horizontal>min(end,14.0))break;acc=max(acc,driveDrop(ro,rd,cell,end));}
 return acc;
}
`;
const DRIVE_WEATHER_COMPOSITE=`
  if(uDriveWeather.w>.5){
    vec3 fwd=vec3(sin(uYaw)*cos(uPitch),sin(uPitch),-cos(uYaw)*cos(uPitch));
    float viewDot=max(.001,dot(wd,fwd)),surfaceT=distanceM/viewDot;vec3 eye=uEyeCells*.5;
    vec3 cabEye=(uDriveCabinInverse*vec4(eye,1.0)).xyz,cabRay=mat3(uDriveCabinInverse)*wd;
    float slope=uDrivePaneSlope.y,den=cabRay.z-slope*cabRay.y;
    float paneT=abs(den)>.00001?(uDrivePaneSlope.x+slope*(cabEye.y-uDrivePane.z)-cabEye.z)/den:-1.0;
    vec3 paneHit=cabEye+cabRay*paneT;
    bool throughPane=paneT>.0&&paneHit.x>uDrivePane.x&&paneHit.x<uDrivePane.y&&paneHit.y>uDrivePane.z&&paneHit.y<uDrivePane.w;
    float outside=throughPane?paneT:driveCabinExit(cabEye,cabRay);float end=body.a>.001?surfaceT:min(surfaceT,220.0);
    vec4 air=vec4(0.0,0.0,0.0,1.0);
    if(end>outside+.025){
      air=driveAir(eye,wd,outside+.025,end);vec3 linearColour=acquisitionColour(colour);linearColour=linearColour*air.a+air.rgb;
      linearColour+=driveRain(eye+wd*(outside+.025),wd,end-outside-.025);colour=displayColour(linearColour);
    }
    if(throughPane&&surfaceT>paneT+.012){
      vec2 paneUv=vec2((paneHit.x-uDrivePane.x)/(uDrivePane.y-uDrivePane.x),(paneHit.y-uDrivePane.z)/(uDrivePane.w-uDrivePane.z));
      float wet=texture(uDriveWetness,paneUv).r;
      vec2 metres=vec2(paneHit.x,(paneHit.y-uDrivePane.z)*sqrt(1.0+slope*slope)),dropP=metres*vec2(28.0,34.0)+vec2(0.0,uDriveWeather.z*.022),cell=floor(dropP),local=dropP-cell;
      float seed=hash01(cell.x+uDrivePaneSlope.z,cell.y),occupancy=hash01(cell.x+97.13,cell.y-21.97+uDrivePaneSlope.z),present=step(1.0-clamp(wet*.55,0.0,.85),occupancy);vec2 centre=vec2(.19+.62*hash01(cell.x+4.0,cell.y),.18+.64*hash01(cell.x,cell.y+8.0));
      vec2 q=(local-centre)/vec2(.08+.16*seed,.12+.28*hash01(cell.x+9.0,cell.y+6.0));float radius=length(q),drop=(1.0-smoothstep(.72,1.0,radius))*present;
      if(drop>.001){
        vec2 bend=clamp(q,-1.0,1.0)*drop*vec2(1.8,2.2)/uRes,shiftedUv=clamp(uv+bend,vec2(.001),vec2(.999));vec4 shifted=texture(uProps,shiftedUv);float shiftedDepth=driveDepth(shiftedUv);
        if(shifted.a>.001&&shiftedDepth>paneT*viewDot+.015){vec3 refracted=shifted.rgb*air.a+air.rgb;colour=mix(colour,displayColour(refracted),drop*.65);}
        vec3 normalCab=normalize(vec3(q.x*.8,-slope+q.y*.85,1.0)),normalWorld=normalize(transpose(mat3(uDriveCabinInverse))*normalCab),reflected=reflect(wd,normalWorld);
        float fresnel=.020+.980*pow(1.0-clamp(abs(dot(normalWorld,-wd)),0.0,1.0),5.0),skyVisible=smoothstep(-.03,.35,reflected.y);
        vec3 sky=vec3(.014,.017,.021)*(.45+.55*exp(-pow(reflected.y*.65,2.0)));
        colour=displayColour(acquisitionColour(colour)+sky*fresnel*skyVisible*drop);
      }
      vec3 linearColour=acquisitionColour(colour);linearColour=mix(linearColour,linearColour*.87+vec3(.004,.005,.0055),wet*.12);colour=displayColour(linearColour);
      // Transmitted opaque geometry retains its depth. Treating transparent
      // beads as opaque near silhouettes made the final edge stage draw rings.
    }
  }
`;
export function sourceDriveRendererAdapter(){
 const receipts=new Map();
 return{name:'isolated-source-drive-renderer',enforce:'pre',
 transform(source,id){if(!id.includes('drive-study=2'))return null;const original=source;
 const replace=(anchor,next)=>{if(!source.includes(anchor))throw Error(`Driving adapter anchor missing in ${id}: ${anchor.slice(0,80)}`);source=source.replace(anchor,next);};
 if(id.split('?')[0].endsWith('/src/render/r3d.js')){
  replace("import * as P3 from './props3d.js';","import * as P3 from './props3d.js?drive-study=2';");
  replace("import { PIXEL_MESH_FRAG } from './pixel-mesh/shader.js';","import { PIXEL_MESH_FRAG } from './pixel-mesh/shader.js?drive-study=2';");
  replace('vec2 screen=(uv*2.0-1.0)*vec2(uRes.x/uRes.y*.95,.95);','vec2 screen=(uv*2.0-1.0)*vec2(uRes.x/uRes.y,1.0)*(uDriveSky.a>.5?.65:.95);');
  replace('const viewX=(dx*right[0]+dz*right[2])/(depth*.95);','const viewX=(dx*right[0]+dz*right[2])/(depth*.65);');
  replace('const viewY=(dx*up[0]+dy*up[1]+dz*up[2])/(depth*.95);','const viewY=(dx*up[0]+dy*up[1]+dz*up[2])/(depth*.65);');
  replace("gl.uniform1f(pixelMeshU('uRecordingPatternScale'), look.recording.patternScale);","gl.uniform1f(pixelMeshU('uRecordingPatternScale'), state?.driveStudy?480:look.recording.patternScale);");
  replace("gl.uniform1f(pixelMeshU('uEdgeGain'), look.vfd.edgeGain);","gl.uniform1f(pixelMeshU('uEdgeGain'),state?.driveStudy?.active ? .65 : look.vfd.edgeGain);");
  const begin=source.indexOf('function drawSourceVoidPhysical('),end=source.indexOf('\nfunction ',begin+20);if(begin<0||end<0)throw Error('Physical renderer boundary absent');
  let part=source.slice(begin,end);
  replace('uniform vec2 uRes, uNearFar;\nuniform float uPitch;', 'uniform vec2 uRes, uNearFar;\nuniform vec4 uDriveSky;\nuniform float uPitch;');
  replace('`+RAIN_GLSL+HZ.UNRAVELLING_GLSL+`\nvoid main(){',DRIVE_WEATHER_GLSL+'`+RAIN_GLSL+HZ.UNRAVELLING_GLSL+`\nvoid main(){');
  replace('  colour=mix(colour,vec3(0.0),texture(uOpeningMask,uv).r*uOpeningMaskReady);',DRIVE_WEATHER_COMPOSITE+'  colour=mix(colour,vec3(0.0),texture(uOpeningMask,uv).r*uOpeningMaskReady);');
  replace('  vec3 empty=mix(vec3(.007,.010,.013),vec3(.017,.021,.023),below);', '  vec3 empty=mix(vec3(.007,.010,.013),vec3(.017,.021,.023),below);\n  float driveHorizon=exp(-pow((rayY+.015)*10.0,2.0));\n  empty=mix(empty,displayColour(vec3(.0035,.0045,.006)+uDriveSky.rgb*driveHorizon),uDriveSky.a);');
  const shiftedBegin=source.indexOf('function drawSourceVoidPhysical('),shiftedEnd=source.indexOf('\nfunction ',shiftedBegin+20);part=source.slice(shiftedBegin,shiftedEnd);
  part=part.replace('const eyeX=camX*CELL,eyeY=camY*CELL,eyeZ=camZ*CELL;','const eyeX=camX*CELL,eyeY=camY*CELL,eyeZ=camZ*CELL;\n  const drive=voidState?.driveStudy||null;');
  part=part.replaceAll('localLightCount:2,localLightPositions:sourceVoidPhysicalLightPositions,','localLightCount:drive?localLightCount:2,localLightPositions:drive?localLightPositions:sourceVoidPhysicalLightPositions,');
  part=part.replaceAll('localLightColors:sourceVoidPhysicalLightColours,localLightPenetrations:sourceVoidPhysicalLightPenetration,','localLightColors:drive?localLightColors:sourceVoidPhysicalLightColours,localLightPenetrations:drive?localLightPenetrations:sourceVoidPhysicalLightPenetration,');
  part=part.replaceAll('localLightEmergency:sourceVoidPhysicalLightEmergency,localShadowIndex:-1,shadowLight:null,','localLightEmergency:drive?localLightEmergency:sourceVoidPhysicalLightEmergency,localShadowIndex:drive?localShadowIndex:-1,shadowLight:drive?localShadowLight:null,');
  part=part.replace('light:voidTorch,shadowLight:null,timeSec:now,reducedMotion:pixelMeshSettings.reduceMotion,torchYawOffset});','light:drive?1:voidTorch,shadowLight:drive?localShadowLight:null,timeSec:now,reducedMotion:pixelMeshSettings.reduceMotion,torchYawOffset});');
  const main='  P3.renderPropPass({\n    camX:eyeX,camY:eyeY,camZ:eyeZ,yaw:worldYaw,pitch,light:voidTorch,';
  if(!part.includes(main))throw Error('Drive main physical pass absent');
  part=part.replace(main,`  if(drive)P3.captureDriveMirrors({fogTexture,fogOrigin,fogSize:FOG_TEX,cellMeters:CELL,zoneTints:ZONE_TINTS,localLightCount,localLightPositions,localLightColors,localLightPenetrations,localLightEmergency,ambientColor:lightingAmbientColor,ambientIntensity:lightingAmbientIntensity,timeSec:now});\n${main}`);
  part=part.replace('ambientColor:[.66,.73,.80],ambientIntensity:(horizonState.active','ambientColor:drive?lightingAmbientColor:[.66,.73,.80],ambientIntensity:drive?lightingAmbientIntensity:(horizonState.active');
  part=part.replace('streetTextures:true,\n  });','streetTextures:!drive,maxDistance:drive?240:90,\n  });');
  part=part.replace("gl.uniform1f(sourceVoidPhysicalU('uPitch'),pitch);","gl.uniform1f(sourceVoidPhysicalU('uPitch'),pitch);gl.uniform4f(sourceVoidPhysicalU('uDriveSky'),.016,.019,.024,drive?1:0);");
  part=part.replace("gl.uniform4f(sourceVoidPhysicalU('uDriveSky'),.016,.019,.024,drive?1:0);",`gl.uniform4f(sourceVoidPhysicalU('uDriveSky'),.016,.019,.024,drive?1:0);
  const weather=drive?.weather||null,wp=weather?.pane||{},wl=weather?.headlamps||[];gl.activeTexture(gl.TEXTURE5);const wt=P3.driveStudyWeatherTarget?.();
  gl.uniform4f(sourceVoidPhysicalU('uDriveWeather'),weather?.rain||0,weather?.extinction||0,weather?.timeSec||0,weather?.active&&wt?1:0);
  gl.uniformMatrix4fv(sourceVoidPhysicalU('uDriveCabinInverse'),false,weather?.worldToCabin||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  gl.uniform4f(sourceVoidPhysicalU('uDrivePane'),wp.left??-.79,wp.right??.79,wp.bottomY??1.30,wp.topY??2.16);
  gl.uniform4f(sourceVoidPhysicalU('uDrivePaneSlope'),wp.bottomZ??-1.17,((wp.topZ??-.77)-(wp.bottomZ??-1.17))/((wp.topY??2.16)-(wp.bottomY??1.30)),weather?.seed||0,weather?.roadWetness||0);
  gl.uniform4f(sourceVoidPhysicalU('uDriveWeatherExtra'),drive?.heading||0,drive?.lampDip??.020,0,0);
  for(let i=0;i<2;i++){const l=wl[i]||{};gl.uniform4f(sourceVoidPhysicalU('uDriveFogLamp'+i),l.x||0,l.y||0,l.z||0,l.intensity||0);}
  gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,wt||null);gl.uniform1i(sourceVoidPhysicalU('uDriveWetness'),5);
  gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,targets.shadow||null);gl.uniform1i(sourceVoidPhysicalU('uDriveVolumeShadow'),6);
  gl.uniformMatrix4fv(sourceVoidPhysicalU('uDriveVolumeShadowMatrix'),false,targets.shadowMatrix);gl.uniform1f(sourceVoidPhysicalU('uDriveVolumeShadowReady'),targets.shadowReady?1:0);`);
  source=source.slice(0,shiftedBegin)+part+source.slice(shiftedEnd);
 }else if(id.split('?')[0].endsWith('/src/render/props3d.js')){
  replace('const NEAR=.05,FAR=90;','const NEAR=.05,FAR=260;');
  replace('function perspective(aspect){const f=1/.95,','function perspective(aspect){const f=1/(driveMirrorAspect ? .95 : .65),');
  source=source.replaceAll('projection=perspective(width/height);','projection=perspective(driveMirrorAspect||width/height);');
  replace('uniform vec3 uEye,uForward,uBase,uMaterialEmissive,','uniform vec4 uDriveHeadlight,uDriveInspection[2];uniform float uDriveSurface,uDriveInterior,uDriveWetRoad,uDriveWetSurface,uDriveTissue;\nuniform vec3 uEye,uForward,uBase,uMaterialEmissive,');
  replace('  float rough=clamp(roughValue,.08,1.0),metal=clamp(orm.b*uMetallic,0.0,1.0);','  float driveWet=uDriveWetRoad*uDriveWetSurface*(.72+.28*sin(vWorld.x*.83+vWorld.z*.47));roughValue=mix(roughValue,.30,driveWet);\n  float rough=clamp(roughValue,.08,1.0),metal=clamp(orm.b*uMetallic,0.0,1.0);');
  replace('  vec3 base=uBase*texel.rgb;','  vec3 base=uBase*texel.rgb*(1.0-driveWet*.12);');
  replace('col+=base*vec3(.30,.36,.47)*facingSky;','col+=base*vec3(.30,.36,.47)*facingSky*(uDriveHeadlight.w>.5?.45:1.0);');
  replace('col+=vec3(.052,.062,.086)*graze*facingSky*mix(1.0,.18,uQuietFireEscape);','col+=vec3(.052,.062,.086)*graze*facingSky*mix(1.0,.18,uQuietFireEscape)*(uDriveHeadlight.w>.5?.35:1.0);');
  replace('col=mix(col,vec3(.100,.122,.168),haze*.82);','if(uDriveHeadlight.w<.5)col=mix(col,vec3(.100,.122,.168),haze*.82);');
  replace('if(li>=uLocalLightCount)break;','if(li>=uLocalLightCount)break;\n    if(uDriveHeadlight.w>.5&&li==2&&uDriveInterior<.5)continue;');
  replace('vec3 irradiance=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*arch;',`float driveBeam=1.0;
    if(uDriveHeadlight.w>.5&&li<2){
      vec3 ray=vWorld-uLocalLightPos[li].xyz;vec3 forward=vec3(sin(uDriveHeadlight.x),0.0,-cos(uDriveHeadlight.x));
      float along=dot(ray,forward);float across=abs(dot(ray,vec3(cos(uDriveHeadlight.x),0.0,sin(uDriveHeadlight.x))));
      float spread=1.0-smoothstep(.19,.46,across/max(.3,along));
      float cutoff=1.0-smoothstep(-.010,.018,ray.y/max(.3,along)+uDriveHeadlight.y);
      driveBeam=step(.05,along)*spread*cutoff*min(2.0,pow(18.0/(10.0+max(0.0,along)),2.0));
    }
    if(uDriveHeadlight.w>.5&&li>=3&&li<5){vec4 spot=uDriveInspection[li-3];if(spot.w>.5)driveBeam=smoothstep(.12,.68,dot(normalize(vWorld-uLocalLightPos[li].xyz),spot.xyz));}
    vec3 irradiance=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*arch*driveBeam;`);
  replace('  col=col/(1.0+col*.30);',`  if(uDriveSurface>.5){vec2 texUv=uDriveSurface<1.5?vec2(1.0-vUv.x,vUv.y):vUv;vec4 reflected=texture(uTex,texUv);col=(uDriveSurface<1.5?mix(vec3(.0035,.0045,.006),reflected.rgb,reflected.a):reflected.rgb)*(uDriveSurface<1.5?.84:1.15);}
  col=col/(1.0+col*.30);`);
  replace("gl.uniform1f(U('uSourceRoomLighting'),sourceRoomLighting?1:0);","gl.uniform1f(U('uSourceRoomLighting'),sourceRoomLighting?1:0);gl.uniform4f(U('uDriveHeadlight'),driveStudyFrame?.heading||0,driveStudyFrame?.lampDip??.02,0,driveStudyFrame?1:0);gl.uniform1f(U('uDriveWetRoad'),driveStudyFrame?.weather?.roadWetness||0);for(let i=0;i<2;i++){const dir=driveStudyFrame?.inspectionLights?.[i]?.direction||[0,0,0];gl.uniform4f(U('uDriveInspection['+i+']'),dir[0],dir[1],dir[2],driveStudyFrame?.inspectionLights?.[i]?1:0);}");
  replace('letteringFinish:letteringFinishDescriptor(matDef.extras?.letteringFinish),','letteringFinish:letteringFinishDescriptor(matDef.extras?.letteringFinish),studyLocalFinish:matDef.extras?.studyLocalFinish===true,cutTissue:matDef.extras?.cutTissue===true,');
  replace('letteringFinish:letteringFinishDescriptor(definition.extras?.letteringFinish),','letteringFinish:letteringFinishDescriptor(definition.extras?.letteringFinish),studyLocalFinish:definition.extras?.studyLocalFinish===true,cutTissue:definition.extras?.cutTissue===true,');
  replace('if(uPayphoneCast<.5)col=reserveEmergencyRed','if(uPayphoneCast<.5&&uDriveTissue<.5)col=reserveEmergencyRed');
  replace("gl.uniform1f(U('uLetteringFinish'),p.letteringFinish?.localSpecular?1:0);","gl.uniform1f(U('uLetteringFinish'),(p.letteringFinish?.localSpecular||p.studyLocalFinish)?1:0);gl.uniform1f(U('uDriveTissue'),p.cutTissue?1:0);");
  replace('for(const p of m.primitives){const factors=p.mainFactors',"for(const p of m.primitives){gl.uniform1f(U('uDriveInterior'),/^drive_(cabin|radio|wheel|wiper|speed|recorder|right|left)/.test(name)?1:0);gl.uniform1f(U('uDriveSurface'),p.driveStudySurface||0);gl.uniform1f(U('uDriveWetSurface'),name==='drive_road'?1:0);const factors=p.mainFactors");
  source+=`\n// Isolated study resources. The P3 material/depth target and final acquisition remain shared.
let driveStudyFrame=null,driveMirrorAt=-1,driveMirrorAspect=0,driveWetTexture=null,driveWetUploadUnit=null,driveWetRevision=-1,driveWetOwner=null,driveWetSize='';const driveTextures=new Map(),driveMirrorTargets=new Map();
export function setDriveStudyFrame(frame){driveStudyFrame=frame;}
export function driveStudyWeatherTarget(){const wet=driveStudyFrame?.weather?.wetness;if(!gl||!wet?.data)return null;const size=wet.width+'x'+wet.height;if(!driveWetTexture){driveWetUploadUnit=gl.getParameter(gl.ACTIVE_TEXTURE)-gl.TEXTURE0;driveWetTexture=gl.createTexture();}if(driveWetOwner!==wet.owner||driveWetRevision!==wet.revision||driveWetSize!==size){gl.bindTexture(gl.TEXTURE_2D,driveWetTexture);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);if(driveWetSize!==size){gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,wet.width,wet.height,0,gl.RED,gl.UNSIGNED_BYTE,wet.data);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,wet.width,wet.height,gl.RED,gl.UNSIGNED_BYTE,wet.data);gl.pixelStorei(gl.UNPACK_ALIGNMENT,4);driveWetRevision=wet.revision;driveWetSize=size;driveWetOwner=wet.owner;}return driveWetTexture;}
export function setDriveStudyCanvas(name,canvas){if(!gl||!pack?.catalog.has(name))return false;let t=driveTextures.get(name);if(!t){t=gl.createTexture();driveTextures.set(name,t);}gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);for(const p of pack.catalog.get(name).primitives){p.texture=t;p.base=[1,1,1,1];p.driveStudySurface=2;}return true;}
function driveMirrorTarget(name){
 let target=driveMirrorTargets.get(name);if(target)return target;
 const w=128,h=192,color=gl.createTexture(),depth=gl.createRenderbuffer(),framebuffer=gl.createFramebuffer();
 gl.bindTexture(gl.TEXTURE_2D,color);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,w,h);gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,color,0);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Drive mirror target incomplete');
 target={w,h,color,depth,framebuffer};driveMirrorTargets.set(name,target);driveTextures.set(name,color);return target;
}
export function captureDriveMirrors(lighting={}){
 const f=driveStudyFrame;if(!f?.mirrors?.length||!pack)return;const time=lighting.timeSec||0;if(time-driveMirrorAt<.08)return;driveMirrorAt=time;
 const all=staticInstances,saved={reflFbo,reflW,reflH};
 // Outside rearward cameras need the external shell and roadside; cabin organs
 // neither occupy that view nor need repeated skinned draws in the tiny targets.
 staticInstances=all.filter(i=>!String(i.mesh||'').startsWith('drive_')||['drive_vehicle_body','drive_tyre','drive_road','drive_road_joint','drive_verge','drive_bank','drive_hedge','drive_tree','drive_fence','drive_bridge','drive_gate','drive_reflector','drive_pole'].includes(i.mesh));
 try{for(const m of f.mirrors){if(!pack.catalog.has(m.mesh))continue;const target=driveMirrorTarget(m.mesh);reflFbo=target.framebuffer;reflW=target.w;reflH=target.h;
 driveMirrorAspect=m.aspect||.6447;renderPropPass({...lighting,camX:m.eye[0],camY:m.eye[1],camZ:m.eye[2],yaw:m.yaw,pitch:m.pitch??-.025,light:0,maxDistance:150,reflection:true,streetTextures:false,shadowPrepared:true});
 for(const p of pack.catalog.get(m.mesh).primitives){p.texture=target.color;p.base=[1,1,1,1];p.driveStudySurface=1;}
 }}finally{driveMirrorAspect=0;reflFbo=saved.reflFbo;reflW=saved.reflW;reflH=saved.reflH;staticInstances=all;gl.bindFramebuffer(gl.FRAMEBUFFER,null);}
}
export function driveStudyRendererStatus(){return{adapter:2,tanHalfFov:.65,verticalFovDegrees:66.047735,patternScale:480,headlightCones:!!driveStudyFrame,mirrors:[...driveTextures.keys()].filter(k=>k.startsWith('drive_mirror')),recordedCanvas:driveTextures.has('drive_recorder_readout'),mirrorTargets:[...driveMirrorTargets.values()].map(t=>({width:t.w,height:t.h})),mirrorHz:12.5,far:FAR,weather:driveStudyFrame?.weather?{active:true,rain:driveStudyFrame.weather.rain,extinction:driveStudyFrame.weather.extinction,wetnessTexture:driveWetSize,wetnessInitialUploadUnit:driveWetUploadUnit,revision:driveWetRevision,paneSpace:'cabin metres',fogSpace:'world metres; starts beyond cabin/pane; geometry-depth clipped',finalAcquisition:'shared; no weather POST overlay'}:{active:false}};}
`;
 }else if(id.split('?')[0].endsWith('/src/render/pixel-mesh/shader.js')){
  replace('return normalize(fwd + uv.x * rgt * 0.95 + uv.y * up * 0.95);','return normalize(fwd + uv.x * rgt * 0.65 + uv.y * up * 0.65);');
 }else return null;
 receipts.set(id,{id,inputSha256:digest(original),adaptedSha256:digest(source),bytes:source.length});return{code:source,map:null};},
 configureServer(server){server.middlewares.use('/__drive-study-renderer',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({scope:'isolated query modules only; no production writes',receipts:[...receipts.values()]}));});}
 };
}
