// The first nothingness is finite architecture in an unlit, horizonless field.
// Its geometry is fixed in world metres. Only the receiving deck moves. The
// existing prop pack lends its real grating, rails and lift hardware;
// this pass never mutates or disposes those shared mesh buffers.
import { horizonCamera } from './horizon3d.js';
import { sourceStrataGeometry } from '../data/source-exposed-strata.js';
import { sourcePrintTexture } from './physical-source-print.js';
import { PRINTED_SURFACE_GLSL, printedSurfaceDescriptor } from './printed-surface.js';

export const SOURCE_SHORE_RANGE = Object.freeze({ near: .05, far: 1600 });
export const SOURCE_SHORE_AIR = Object.freeze([.73, .79, .80]);
const STEEL = [.16, .20, .21], MASONRY = [.29, .30, .28], DARK = [.085, .11, .12];
const clamp = (n, lo=0, hi=1) => Math.max(lo, Math.min(hi, Number(n)||0));

export function sourceShoreRenderActive(frame) {
  return !!(frame?.active && frame.outside && !frame.proper && frame.room && frame.bank && frame.lift);
}

export function sourceShoreBoundaryVisible(frame) {
  return !!(frame?.visible && frame.proper && frame.room && frame.bank && frame.lift);
}

export function sourceShoreWhiteout(frame,{reduceFlash=false}={}) {
  // The adaptation clock remains physical and durable in both settings. The
  // accessibility mode bounds the veil, leaving geometry continuously visible.
  return clamp(frame?.whiteout)*(reduceFlash?.18:1);
}

// The ordinary room renders through its own architecture pass. Its doorway
// admits absence, rather than the old Source terrain still held by that pass.
export const SOURCE_SHORE_APERTURE_GLSL=`
float sourceShoreApertureView(vec3 eyeM,vec3 ray,vec3 forward,vec4 door,vec2 aperture){
  if(aperture.y<.5||eyeM.z<door.y||ray.z>=-.00001)return -1.0;
  float distanceM=(door.y-eyeM.z)/ray.z;
  vec3 hit=eyeM+ray*distanceM;
  if(distanceM<=0.0||abs(hit.x-door.x)>door.z*.5||hit.y<aperture.x||hit.y>aperture.x+door.w)return -1.0;
  return distanceM*max(.001,dot(ray,forward));
}
`;

export function sourceShoreApertureRay({frame,eye,ray,forward,surfaceView=Infinity}={}) {
  if(!frame?.active||frame.outside||frame.proper||!frame.doorway||!frame.room)return null;
  const d=frame.doorway,floor=frame.room.floor;
  if(eye[2]<d.doorZ||ray[2]>=-.00001)return null;
  const distance=(d.doorZ-eye[2])/ray[2],hit=eye.map((v,i)=>v+ray[i]*distance);
  if(distance<=0||Math.abs(hit[0]-d.centreX)>d.width*.5||hit[1]<floor||hit[1]>floor+d.height)return null;
  const view=distance*Math.max(.001,ray.reduce((sum,v,i)=>sum+v*forward[i],0));
  return view+.015<surfaceView?{view,hit}:null;
}

export function sourceShoreGeometry(frame) {
  if (!frame?.room || !frame.bank || !frame.lift || !frame.ledge || !frame.doorway) return null;
  const {room:r,bank:b,lift:l,ledge:g,doorway:d} = frame;
  const boxes=[], hardware=[];
  const box=(id,minX,maxX,minY,maxY,minZ,maxZ,colour=STEEL,grain=1,moving=false) => {
    if(maxX<=minX||maxY<=minY||maxZ<=minZ)return;
    boxes.push({id,minX,maxX,minY,maxY,minZ,maxZ,colour,grain,moving});
  };
  const mesh=(id,name,x,y,z,sx=1,sy=sx,sz=sx,moving=false,yaw=0,glow=0) => hardware.push({id,name,x,y,z,sx,sy,sz,moving,yaw,glow});
  const dw=d.width/2, front=r.minZ, wall=.38;
  // The room remains a complete object from every exterior angle. Its closed
  // back is deliberately finite even though its remembered hall persists inside.
  box('room-underside',r.minX,r.maxX,r.underside,r.floor,front,r.maxZ,MASONRY,2);
  box('room-roof',r.minX,r.maxX,r.roof,r.roof+.24,front,r.maxZ,DARK,1);
  box('room-west',r.minX,r.minX+wall,r.floor,r.roof,front,r.maxZ,MASONRY,2);
  box('room-east',r.maxX-wall,r.maxX,r.floor,r.roof,front,r.maxZ,MASONRY,2);
  box('room-back',r.minX,r.maxX,r.floor,r.roof,r.maxZ-.5,r.maxZ,MASONRY,2);
  box('room-front-left',r.minX,d.centreX-dw,r.floor,r.roof,front,d.doorZ,MASONRY,2);
  box('room-front-right',d.centreX+dw,r.maxX,r.floor,r.roof,front,d.doorZ,MASONRY,2);
  box('room-door-head',d.centreX-dw,d.centreX+dw,r.floor+d.height,r.roof,front,d.doorZ,MASONRY,2);
  // Oak jambs and a lit head keep the tiny remembered doorway identifiable.
  for(const x of [d.centreX-dw-.045,d.centreX+dw+.045])
    box(`room-door-jamb-${x}`,x-.045,x+.045,r.floor,r.floor+d.height+.12,d.doorZ-.025,d.doorZ+.09,[.24,.16,.095],0);
  box('room-door-oak-head',d.centreX-dw-.09,d.centreX+dw+.09,r.floor+d.height,r.floor+d.height+.12,d.doorZ-.025,d.doorZ+.09,[.24,.16,.095],0);
  mesh('room-head-lamp','tower_bulkhead',d.centreX,r.floor+d.height+.2,d.doorZ+.14,.8,.8,.8,false,Math.PI,.20);
  // Roof seams, plinth and corner returns make the room a finished building,
  // rather than an untextured rectangle left in an editor.
  for(const x of [r.minX+.24,r.maxX-.24])
    box(`room-corner-${x}`,x-.13,x+.13,r.floor,r.roof,front-.03,r.maxZ+.03,[.23,.24,.22],2);
  for(let z=front+1;z<r.maxZ;z+=3)
    box(`room-roof-seam-${z}`,r.minX-.035,r.maxX+.035,r.roof+.24,r.roof+.28,z-.035,z+.035,STEEL,1);

  // The exposed source bank is the same finite geometry used by collision.
  // Its cut courses carry their own ends and undersides, with no building
  // shell, lintel or louvres enclosing the open-sky cleft.
  const pieces=sourceStrataGeometry(frame.originMetres||{x:0,z:0});
  box('receiving-ledge',g.minX,g.maxX,g.underside,g.floor,g.minZ,g.maxZ,DARK,1);
  // The broad lift has a solid underpan, the game's real open grating, visible
  // guides, bearings and railwork. Every moving part shares one floor offset.
  box('lift-underpan',l.minX,l.maxX,-l.thickness,0,l.minZ,l.maxZ,DARK,1,true);
  const cx=(l.minX+l.maxX)/2,cz=(l.minZ+l.maxZ)/2;
  mesh('lift-grating','tower_catwalk',cx,-.12,cz,(l.maxX-l.minX)/11.87,.72,(l.maxZ-l.minZ)/7.91,true);
  for(const x of [l.minX-.16,l.maxX+.16]){
    box(`lift-guide-${x}`,x-.105,x+.105,-.28,b.floor+3.1,l.minZ-.15,l.minZ+.13,[.27,.29,.28],1);
    box(`lift-carriage-${x}`,x-.21,x+.21,-.13,.66,l.minZ-.22,l.minZ+.22,DARK,1,true);
    mesh(`lift-bearing-${x}`,'tower_winch',x,b.floor+1.2,l.minZ-.36,.6,.6,.6,false,Math.PI/2);
  }
  // Rails stay off the deck's open boarding and receiving edges.
  for(const x of [l.minX+.075,l.maxX-.075])
    mesh(`lift-side-rail-${x}`,'tower_loft_rail',x,0,cz,(l.maxZ-l.minZ)/10,1,1,true,Math.PI/2);
  // Two counter-sliding bars protect the receiving edge during ascent, then
  // draw into their side housings. They open continuously over the final 30cm.
  for(const [side,min,max]of [[-1,l.minX,cx],[1,cx,l.maxX]])
    for(const y of [.54,1.05])box(`lift-safety-bar-${side}-${y}`,min,max,y-.035,y+.035,l.minZ-.055,l.minZ+.055,[.34,.32,.22],1,side<0?2:3);
  for(const side of [-1,1]){
    const min=side<0?g.minX:l.maxX,max=side<0?l.minX:g.maxX;
    mesh(`ledge-front-rail-${side}`,'tower_loft_rail',(min+max)/2,g.floor,g.maxZ-.055,(max-min)/10,1,1);
    mesh(`ledge-edge-light-${side}`,'tower_bulkhead',side<0?l.minX-.55:l.maxX+.55,g.floor+.20,g.maxZ-.04,1,1,1,false,0,.12);
  }
  for(const x of [g.minX+.04,g.maxX-.04])
    mesh(`ledge-end-rail-${x}`,'tower_loft_rail',x,g.floor,(g.minZ+g.maxZ)/2,(g.maxZ-g.minZ)/10,1,1,false,Math.PI/2);
  return {boxes,hardware,pieces,lights:[
    {x:d.centreX,y:r.floor+1.85,z:d.doorZ+.28,radius:5.5,power:.82},
    {x:l.minX-.55,y:g.floor+.40,z:g.maxZ-.04,radius:5.2,power:.45},
    {x:l.maxX+.55,y:g.floor+.40,z:g.maxZ-.04,radius:5.2,power:.45},
  ]};
}

const VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUv;
// Imported hardware borrows the prop VAO. Its character joints at 13 are
// integer inputs, so all optional hull attributes must occupy float slots even
// when uImported makes their values irrelevant to the material calculation.
layout(location=7) in vec3 aTint;
layout(location=8) in float aGrain;
layout(location=9) in float aMoving;
uniform mat4 uView,uProjection,uModel;
uniform float uImported,uLiftFloor,uMoving,uGateOpen,uGateTravel;
uniform vec3 uBase;
out vec3 vWorld,vNormal,vBase;
out vec2 vUv;
out float vGrain,vLocalHeight;
void main(){
  vec4 world=uModel*vec4(aPosition,1.0);
  float moving=mix(aMoving,uMoving,uImported);
  world.y+=uLiftFloor*min(moving,1.0);
  if(moving>1.5)world.x+=(moving<2.5?-1.0:1.0)*uGateOpen*uGateTravel;
  vWorld=world.xyz;vNormal=normalize(transpose(inverse(mat3(uModel)))*aNormal);
  vBase=mix(aTint,uBase,uImported);vGrain=mix(aGrain,0.0,uImported);vUv=aUv;vLocalHeight=aPosition.y;
  gl_Position=uProjection*uView*world;
}`;

export const SOURCE_SHORE_MATERIAL_FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal,vBase;
in vec2 vUv;
in float vGrain,vLocalHeight;
uniform vec3 uEye,uForward,uTorchColour,uEmissive;
uniform vec4 uTorch; // power, range multiplier, penumbra cosine, hotspot cosine
uniform float uTorchSpill,uShoulder,uGlow,uMetallic,uRoughness,uUseTex,uClipTop,uRecordingExposure;
uniform float uPrintedPolarity,uPrintedCoverage;
uniform vec4 uLights[3];
uniform sampler2D uTex,uSourceTex;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
${PRINTED_SURFACE_GLSL}
void main(){
  // The borrowed catwalk's perimeter rails belong to a belfry. Keep its real
  // grating and underframe; this lift has its own open-ended safety railwork.
  if(uClipTop>0.0&&vLocalHeight>uClipTop)discard;
  vec3 toEye=uEye-vWorld;float distanceM=length(toEye);
  vec3 facing=normalize(toEye),n=normalize(vNormal);
  n=dot(n,facing)<0.0?-n:n;
  vec4 texel=texture(uTex,vUv);
  vec3 base=vBase*mix(vec3(1.0),texel.rgb,uUseTex);
  float pigment=uPrintedCoverage>1.5?1.0:texel.a;
  float printPolarity=uPrintedPolarity;
  // Fine, stationary construction marks, confined to actual material. Their
  // projected width suppresses shimmer before any distant facade can alias.
  vec2 plane=abs(n.y)>.6?vWorld.xz:abs(n.x)>.6?vWorld.zy:vWorld.xy;
  // Real source is a low-contrast material grain at a fixed world scale.
  // Close grazing light can find its print; the silhouette carries distance.
  if(vGrain>2.5){
    vec3 originalNormal=normalize(vNormal);
    vec2 sourcePlane=abs(originalNormal.y)>.6?vWorld.xz:
      vec2(abs(originalNormal.x)>.6?-sign(originalNormal.x)*vWorld.z:sign(originalNormal.z)*vWorld.x,-vWorld.y);
    vec4 source=texture(uSourceTex,sourcePlane/vec2(6.0,4.0));
    base*=mix(vec3(1.0),source.rgb,.38);
    pigment=source.a;printPolarity=1.0;
    float fibres=sin(plane.y*138.0+sin(plane.x*1.7)*.6)*.025;
    base*=1.0+fibres*(1.0-smoothstep(.015,.08,length(fwidth(plane))));
  }
  float seamPhase=abs(fract(plane.x/3.0+.5)-.5)*3.0;
  float seam=1.0-smoothstep(.012,.028+fwidth(plane.x),seamPhase);
  float grain=sin(plane.x*49.0)*sin(plane.y*43.0)*.018;
  base*=1.0+grain*(1.0-smoothstep(.02,.12,length(fwidth(plane))))*step(.5,vGrain)-seam*.055*step(.5,vGrain);
  float hemisphere=.22+.16*max(n.y,0.0)+.11*max(dot(n,normalize(vec3(-.4,.7,.55))),0.0);
  vec3 incident=vec3(.67,.74,.77)*hemisphere;
  float reach=10.0*max(.35,uTorch.y);
  float finite=1.0-smoothstep(reach*.62,reach,distanceM);
  float axis=dot(-facing,uForward);
  float cone=smoothstep(uTorch.z,uTorch.w,axis);
  float spill=smoothstep(.35,uTorch.z,axis)*uTorchSpill;
  float fall=1.0/(1.0+.10*distanceM+.045*distanceM*distanceM);
  float lamp=(cone+spill)*uTorch.x*finite*fall*max(dot(n,facing),0.0)*2.4;
  lamp=lamp/(1.0+max(.6,uShoulder)*lamp);
  incident+=uTorchColour*lamp;
  for(int i=0;i<3;i++){
    vec3 delta=uLights[i].xyz-vWorld;float d=length(delta);
    float attenuation=pow(clamp(1.0-d/(i==0?5.5:5.2),0.0,1.0),2.0);
    incident+=vec3(1.0,.69,.36)*attenuation*max(dot(n,normalize(delta)),.12)*uLights[i].w;
  }
  float spec=pow(max(dot(n,facing),0.0),mix(48.0,8.0,uRoughness))*cone*fall*finite*uTorch.x*mix(.018,.10,uMetallic);
  vec3 colour=base*incident+uTorchColour*spec/(1.0+spec)+uEmissive+vec3(1.0,.63,.26)*uGlow;
  // Source records this boundary at a higher exposure than the pale shore.
  // Compress received highlights before that acquisition, retaining the cut
  // material's ratios instead of letting a nearby face become a white plate.
  float receptionShoulder=1.0+max(0.0,uRecordingExposure-1.0)*2.0*dot(colour,vec3(.2126,.7152,.0722));
  o=vec4(colour/receptionShoulder,1.0);
  oMark=vec4(0.0,.5,.5,printPolarity>.5?printedSurfaceTag(pigment,printPolarity):0.0);
}`;

const QUAD_VERT=`#version 300 es
precision highp float;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;

export const SOURCE_SHORE_COMPOSITE_FRAG=`#version 300 es
precision highp float;
uniform sampler2D uHull,uHullDepth,uHullMarks,uProps,uPropDepth,uPropMarks,uEncoded;
uniform vec2 uResolution,uHullRange,uPropRange;
uniform vec3 uAir;
uniform float uFinal,uWhiteout,uBoundary;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
float linearDepth(float d,vec2 nf){float z=d*2.0-1.0;return 2.0*nf.x*nf.y/max(.0001,nf.y+nf.x-z*(nf.y-nf.x));}
vec3 displayColour(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0.0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
void main(){
  vec2 uv=gl_FragCoord.xy/uResolution;
  vec4 hull=texture(uHull,uv),prop=texture(uProps,uv);
  float hd=linearDepth(texture(uHullDepth,uv).r,uHullRange);
  float pd=linearDepth(texture(uPropDepth,uv).r,uPropRange);
  bool hasHull=hull.a>.01,hasProp=prop.a>.01;
  bool useProp=hasProp&&(!hasHull||pd<hd+.015);
  // Ordinary P3 mark RGB contains packed depth, not grain. Only its explicit
  // pigment tag belongs in this world's acquisition mark target.
  oMark=useProp?vec4(0.0,.5,.5,texture(uPropMarks,uv).a):texture(uHullMarks,uv);
  float coverage=useProp?prop.a:hull.a;
  vec3 material=displayColour(useProp?prop.rgb:hull.rgb);
  // The game's encode remains on architecture. Nothing in the surrounding
  // field receives noise, torch, a floor gradient, weather or a horizon.
  vec3 colour=mix(uAir,material,coverage);
  if(uFinal>.5){
    // Preserve the actual material response. A full Source phosphor palette
    // turns the closed steel bank into a pale green card; here the instrument
    // supplies its engraved dark detail without replacing the object's colour.
    float recorded=dot(texture(uEncoded,uv).rgb,vec3(.2126,.7152,.0722));
    float printed=smoothstep(.055,.48,recorded);
    vec3 received=material*mix(.64,1.0,printed);
    colour=mix(uAir,received,coverage);
    colour=mix(colour,vec3(1.0),uWhiteout);
  }
  if(uBoundary>.5)colour=mix(texture(uEncoded,uv).rgb,material,hasHull&&!useProp?hull.a:0.0);
  float depth=useProp?pd:hd;
  o=vec4(colour,uFinal>.5?1.0:mix(1.0,1.0/(1.0+depth*.14),coverage));
}`;

let gl=null,materialProgram=null,compositeProgram=null,pack=null;
let hullFbo=null,hullColour=null,hullDepth=null,hullMarks=null,finalFbo=null,finalColour=null,width=0,height=0;
let geometryKey='',geometry=null,vao=null,vertexBuffer=null,vertexCount=0;
let sourceMaterialTexture=null;
let importedAttributeState=new WeakMap();
const materialUniforms=new Map(),compositeUniforms=new Map();
const IDENTITY=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export const sourceShoreStats={ready:false,active:false,facade:'exposed-strata',boxCount:0,pieceCount:0,hardwareCount:0,hardwareDraws:0,triangles:0,far:SOURCE_SHORE_RANGE.far};
const uniform=(program,cache,name)=>{if(!cache.has(name))cache.set(name,gl.getUniformLocation(program,name));return cache.get(name);};
const mu=name=>uniform(materialProgram,materialUniforms,name),cu=name=>uniform(compositeProgram,compositeUniforms,name);
function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`Source shore shader: ${gl.getShaderInfoLog(s)}`);return s;}
function program(vertex,fragment){const p=gl.createProgram(),v=compile(gl.VERTEX_SHADER,vertex),f=compile(gl.FRAGMENT_SHADER,fragment);gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.deleteShader(v);gl.deleteShader(f);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`Source shore program: ${gl.getProgramInfoLog(p)}`);return p;}
export function sourceShoreInit(context){
  if(gl===context&&materialProgram)return true;
  gl=context;sourceMaterialTexture=null;importedAttributeState=new WeakMap();materialProgram=program(VERT,SOURCE_SHORE_MATERIAL_FRAG);compositeProgram=program(QUAD_VERT,SOURCE_SHORE_COMPOSITE_FRAG);
  materialUniforms.clear();compositeUniforms.clear();sourceShoreStats.ready=true;return true;
}
export function sourceShoreSetHardwarePack(next){pack=next;return !!pack?.catalog;}
function texture(depth=false,nearest=false){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,depth?gl.DEPTH_COMPONENT24:gl.RGBA8,width,height,0,depth?gl.DEPTH_COMPONENT:gl.RGBA,depth?gl.UNSIGNED_INT:gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,depth||nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,depth||nearest?gl.NEAREST:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function sourceTexture(){
  if(sourceMaterialTexture)return sourceMaterialTexture;
  sourceMaterialTexture=sourcePrintTexture(gl,'divide');return sourceMaterialTexture;
}
function resize(w,h){
  if(width===w&&height===h&&hullFbo)return;
  for(const t of [hullColour,hullDepth,hullMarks,finalColour])if(t)gl.deleteTexture(t);
  for(const f of [hullFbo,finalFbo])if(f)gl.deleteFramebuffer(f);
  width=w;height=h;hullColour=texture();hullDepth=texture(true);hullMarks=texture(false,true);finalColour=texture();
  hullFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,hullFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,hullColour,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT1,gl.TEXTURE_2D,hullMarks,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,hullDepth,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Source shore hull framebuffer incomplete');
  finalFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,finalFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,finalColour,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Source shore composite framebuffer incomplete');
}
const FACES=[[[1,0,0],[1,0,0],[1,1,0],[1,1,1],[1,0,1]],[[-1,0,0],[0,0,1],[0,1,1],[0,1,0],[0,0,0]],[[0,1,0],[0,1,0],[0,1,1],[1,1,1],[1,1,0]],[[0,-1,0],[0,0,1],[0,0,0],[1,0,0],[1,0,1]],[[0,0,1],[1,0,1],[1,1,1],[0,1,1],[0,0,1]],[[0,0,-1],[0,0,0],[0,1,0],[1,1,0],[1,0,0]]];
function uploadGeometry(frame,boundaryOnly=false){
  const key=JSON.stringify([frame.room,frame.bank,frame.ledge,frame.doorway,frame.entry,frame.walls,
    frame.lift.minX,frame.lift.maxX,frame.lift.minZ,frame.lift.maxZ,frame.lift.thickness,boundaryOnly]);
  if(key===geometryKey&&geometry)return;
  geometryKey=key;geometry=sourceShoreGeometry(frame);const vertices=[];
  if(boundaryOnly){
    // The same cut bank and lift remain visible when looking back. There is no
    // second interior shell to wall off the explorable field.
    geometry.boxes=geometry.boxes.filter(b=>b.id.startsWith('lift-')||b.id==='receiving-ledge');
    geometry.hardware=geometry.hardware.filter(h=>/^(lift-|ledge-)/.test(h.id));
  }
  for(const b of geometry.boxes)for(const [n,...corners]of FACES)for(const k of [0,1,2,0,2,3]){
    const p=corners[k];vertices.push(b.minX+p[0]*(b.maxX-b.minX),b.minY+p[1]*(b.maxY-b.minY),b.minZ+p[2]*(b.maxZ-b.minZ),...n,...b.colour,b.grain,Number(b.moving)||0);
  }
  for(const piece of geometry.pieces)for(let j=0;j<piece.i.length;j+=3){
    const points=piece.i.slice(j,j+3).map(index=>piece.p.slice(index*3,index*3+3));
    const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]);
    const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n)||1;
    for(let k=0;k<3;k++)n[k]/=length;
    for(const point of points)vertices.push(...point,...n,...(piece.color||MASONRY),3,0);
  }
  if(!vao)vao=gl.createVertexArray();if(!vertexBuffer)vertexBuffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  for(const [location,size,offset]of [[0,3,0],[1,3,3],[7,3,6],[8,1,9],[9,1,10]]){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,44,offset*4);}
  vertexCount=vertices.length/11;sourceShoreStats.boxCount=geometry.boxes.length;sourceShoreStats.pieceCount=geometry.pieces.length;sourceShoreStats.hardwareCount=geometry.hardware.length;
}
function model(instance,node=IDENTITY){
  const c=Math.cos(instance.yaw),s=Math.sin(instance.yaw),a=[c*instance.sx,0,-s*instance.sx,0,0,instance.sy,0,0,s*instance.sz,0,c*instance.sz,0,instance.x,instance.y,instance.z,1],out=new Float32Array(16);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*node[col*4+k];
  return out;
}
function drawImportedPrimitive(primitive){
  gl.bindVertexArray(primitive.vao);
  // These optional values belong only to our custom hull. On a borrowed prop
  // VAO they are instanced inputs whose instance buffer may never have been
  // populated. Disable them for the imported draw, then restore that VAO's
  // original state. Query once per immutable VAO, not on every frame.
  let enabled=importedAttributeState.get(primitive.vao);
  if(!enabled){
    enabled=[7,8,9].map(location=>gl.getVertexAttrib(location,gl.VERTEX_ATTRIB_ARRAY_ENABLED));
    importedAttributeState.set(primitive.vao,enabled);
  }
  for(let i=0;i<3;i++)if(enabled[i])gl.disableVertexAttribArray(7+i);
  try{gl.drawElements(gl.TRIANGLES,primitive.count,primitive.indexType,0);}
  finally{for(let i=0;i<3;i++)if(enabled[i])gl.enableVertexAttribArray(7+i);}
}
export function sourceShoreDraw({frame,camX,camY,camZ,yaw=0,pitch=0,width:w,height:h,torch={},boundaryOnly=false,recordingExposure=1}={}){
  if(!(boundaryOnly?sourceShoreBoundaryVisible(frame):sourceShoreRenderActive(frame))||!materialProgram)return false;
  resize(w,h);uploadGeometry(frame,boundaryOnly);
  const camera=horizonCamera({camX,camY,camZ,yaw,pitch,aspect:w/h,...SOURCE_SHORE_RANGE});
  const cp=Math.cos(pitch),ty=yaw+(Number(torch.yawOffset)||0),forward=[Math.sin(ty)*cp,Math.sin(pitch),-Math.cos(ty)*cp];
  gl.bindFramebuffer(gl.FRAMEBUFFER,hullFbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,w,h);gl.disable(gl.BLEND);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(materialProgram);gl.uniformMatrix4fv(mu('uView'),false,camera.view);gl.uniformMatrix4fv(mu('uProjection'),false,camera.projection);gl.uniformMatrix4fv(mu('uModel'),false,IDENTITY);gl.uniform3f(mu('uEye'),camX,camY,camZ);gl.uniform3fv(mu('uForward'),forward);gl.uniform3fv(mu('uTorchColour'),torch.color||[1,.95,.86]);gl.uniform4f(mu('uTorch'),clamp(torch.power),clamp(torch.reach,.35,1.25),clamp(torch.coneInner??.84,.72,.97),clamp(torch.coneOuter??.96,.75,.985));gl.uniform1f(mu('uTorchSpill'),clamp(torch.spill??.08,0,.12));gl.uniform1f(mu('uShoulder'),clamp(torch.shoulder??.75,0,2));gl.uniform1f(mu('uLiftFloor'),Number(frame.lift.floor)||0);gl.uniform1f(mu('uImported'),0);gl.uniform1f(mu('uMoving'),0);gl.uniform1f(mu('uGlow'),0);gl.uniform1f(mu('uUseTex'),0);gl.uniform1f(mu('uMetallic'),.1);gl.uniform1f(mu('uRoughness'),.8);gl.uniform3f(mu('uEmissive'),0,0,0);
  gl.uniform4fv(mu('uLights[0]'),new Float32Array(geometry.lights.flatMap(l=>[l.x,l.y,l.z,l.power])));
  gl.uniform1f(mu('uRecordingExposure'),boundaryOnly?clamp(recordingExposure,1,12):1);
  gl.uniform1f(mu('uPrintedPolarity'),0);gl.uniform1f(mu('uPrintedCoverage'),0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,sourceTexture());gl.uniform1i(mu('uSourceTex'),1);gl.activeTexture(gl.TEXTURE0);
  const gate=clamp(((Number(frame.lift.floor)||0)-3.9)/.3);
  gl.uniform1f(mu('uGateOpen'),gate*gate*(3-2*gate));gl.uniform1f(mu('uGateTravel'),(frame.lift.maxX-frame.lift.minX)/2);
  gl.uniform1f(mu('uClipTop'),0);gl.bindVertexArray(vao);gl.drawArrays(gl.TRIANGLES,0,vertexCount);sourceShoreStats.triangles=vertexCount/3;sourceShoreStats.hardwareDraws=0;
  gl.uniform1f(mu('uImported'),1);
  for(const instance of geometry.hardware){
    const entry=pack?.catalog?.get(instance.name);if(!entry)continue;
    gl.uniformMatrix4fv(mu('uModel'),false,model(instance,entry.nodeMatrix));gl.uniform1f(mu('uMoving'),instance.moving?1:0);gl.uniform1f(mu('uGlow'),instance.glow);gl.uniform1f(mu('uClipTop'),instance.name==='tower_catwalk'?.24:0);
    for(const p of entry.primitives){const print=printedSurfaceDescriptor(p.printedSurface);gl.uniform1f(mu('uPrintedPolarity'),print?.polarity==='dark-on-light'?1:print?2:0);gl.uniform1f(mu('uPrintedCoverage'),print?.coverage==='solid'?2:print?1:0);gl.uniform3fv(mu('uBase'),p.base.slice(0,3));gl.uniform3fv(mu('uEmissive'),p.emissive||[0,0,0]);gl.uniform1f(mu('uMetallic'),p.metallic??.1);gl.uniform1f(mu('uRoughness'),p.roughness??.8);gl.uniform1f(mu('uUseTex'),p.texture?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,p.texture);gl.uniform1i(mu('uTex'),0);drawImportedPrimitive(p);sourceShoreStats.hardwareDraws++;sourceShoreStats.triangles+=p.count/3;}
  }
  gl.bindVertexArray(null);gl.disable(gl.DEPTH_TEST);sourceShoreStats.active=true;return true;
}

export function sourceShoreComposite({target,props,encoded=null,frame,boundaryOnly=false,reduceFlash=false}={}){
  if(!hullFbo||!props?.ready)return null;
  const final=!!encoded;gl.bindFramebuffer(gl.FRAMEBUFFER,final?finalFbo:target);gl.drawBuffers(final?[gl.COLOR_ATTACHMENT0]:[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,width,height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindVertexArray(null);gl.useProgram(compositeProgram);
  for(const [unit,name,t]of [[0,'uHull',hullColour],[1,'uHullDepth',hullDepth],[2,'uProps',props.color],[3,'uPropDepth',props.depth],[4,'uEncoded',encoded||hullColour],[5,'uHullMarks',hullMarks],[6,'uPropMarks',props.marks||props.color]]){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(cu(name),unit);}
  gl.uniform2f(cu('uResolution'),width,height);gl.uniform2f(cu('uHullRange'),SOURCE_SHORE_RANGE.near,SOURCE_SHORE_RANGE.far);gl.uniform2f(cu('uPropRange'),props.near,props.far);gl.uniform3fv(cu('uAir'),SOURCE_SHORE_AIR);gl.uniform1f(cu('uFinal'),final?1:0);gl.uniform1f(cu('uBoundary'),boundaryOnly?1:0);gl.uniform1f(cu('uWhiteout'),sourceShoreWhiteout(frame,{reduceFlash}));gl.drawArrays(gl.TRIANGLES,0,3);return final?finalColour:null;
}

export function sourceShoreDebug(){return {...sourceShoreStats,air:[...SOURCE_SHORE_AIR],bounds:geometry?geometry.boxes.filter(b=>['room-back','room-underside','receiving-ledge'].includes(b.id)):[],strata:geometry?.pieces.map(p=>({id:p.id,triangles:p.i.length/3}))||[]};}
// Source proper can acquire a visible return wall through the same recording
// pass as nearby props, selecting real linear depth across the two cameras.
export function sourceShoreTargets(){return {color:hullColour,depth:hullDepth,marks:hullMarks,marksReady:!!hullMarks,near:SOURCE_SHORE_RANGE.near,far:SOURCE_SHORE_RANGE.far,ready:!!hullFbo};}
