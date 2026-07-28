// GLB prop pass for the first-person renderer. Architecture remains the sector
// raymarcher; meshes render into colour + depth first, and r3d.js composites
// whichever surface is actually nearer to the camera.

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
uniform mat4 uView,uProj;
out vec3 vWorld,vNormal;out vec2 vUv;flat out int vZone;flat out int vPortrait;flat out int vStructural;flat out vec4 vEmissive;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vec4 w=m*vec4(aPos,1.0);vWorld=w.xyz;vNormal=normalize(transpose(inverse(mat3(m)))*aNormal);vUv=aUv;vZone=int(aZone+.5);vPortrait=int(aPortrait+.5);vStructural=int(aStructural+.5);vEmissive=aEmissive;gl_Position=uProj*uView*w;}`;

const FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal;in vec2 vUv;flat in int vZone;flat in int vPortrait;flat in int vStructural;flat in vec4 vEmissive;
uniform vec3 uEye,uForward,uBase,uZoneTint[14];uniform float uLight,uAlphaCut,uBaseAlpha;uniform sampler2D uTex,uNormalTex,uOrmTex,uFogTex;uniform float uUseTex,uUseNormal,uUseOrm,uMetallic,uRoughness,uNormalScale,uFogSize,uCellMeters;uniform vec2 uFogOrigin;
uniform vec3 uTorchColor,uAmbientColor;uniform float uTorchReach,uTorchSpill,uAmbientIntensity;uniform vec2 uTorchCone;
uniform int uLocalLightCount,uLocalShadowIndex;uniform vec4 uLocalLightPos[8],uLocalLightColor[8];
uniform sampler2D uPlanTex;uniform vec2 uPlanSize,uPlanOrigin;uniform float uPlanReady;
uniform sampler2D uPortraitAtlas;uniform float uUsePortrait;
uniform sampler2D uShadowTex;uniform mat4 uShadowMatrix;uniform float uShadowReady;uniform vec2 uShadowTexel;
out vec4 o;
float flashlightShadow(vec3 world,vec3 normal,vec3 lightDir){
  if(uShadowReady<.5)return 1.0;
  vec4 clip=uShadowMatrix*vec4(world+normal*.008,1.0);if(clip.w<=0.0)return 1.0;
  vec3 q=clip.xyz/clip.w*.5+.5;if(q.x<=0.0||q.x>=1.0||q.y<=0.0||q.y>=1.0||q.z<=0.0||q.z>=1.0)return 1.0;
  float bias=max(.00018,.00115*(1.0-max(dot(normal,lightDir),0.0))),visible=0.0;
  for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(vec2(float(x),float(y))-.5)*uShadowTexel;visible+=q.z-bias<=texture(uShadowTex,q.xy+tap).r?1.0:0.0;}
  return mix(.20,1.0,visible*.25);
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
  vec4 texel=uUseTex>.5?texture(uTex,vUv):vec4(1.0);
  if(uUsePortrait>.5){int slot=clamp(vPortrait,0,5);vec2 cell=vec2(float(slot%3),float(slot/3));vec2 local=clamp(vUv,.006,.994);texel=texture(uPortraitAtlas,(cell+local)/vec2(3.0,2.0));}
  if(texel.a*uBaseAlpha<uAlphaCut)discard;
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
  float rough=clamp(orm.g*uRoughness,.08,1.0),metal=clamp(orm.b*uMetallic,0.0,1.0);
  float lambert=max(dot(n,ldir),0.0);vec3 fromEye=normalize(vWorld-uEye);float axis=dot(fromEye,uForward);
  float cone=smoothstep(uTorchCone.x,uTorchCone.y,axis);float rim=smoothstep(uTorchCone.x-.04,uTorchCone.x+.015,axis)*.30;float spill=smoothstep(.30,uTorchCone.x-.02,axis)*uTorchSpill;
  float reach=max(.35,uTorchReach);float falloff=1.0/(1.0+(.10/reach)*dist+(.045/(reach*reach))*dist*dist);float shadow=flashlightShadow(vWorld,n,ldir);
  float nearSoft=smoothstep(0.0,1.4,dist)*.55+.45;float beam=(cone+rim+spill)*uLight;
  float lamp=lambert*falloff*nearSoft*3.0*beam*(uLocalShadowIndex<0?shadow:1.0);float ambient=uAmbientIntensity*mix(1.0,1.12,uLight);vec3 localLight=vec3(0.0);
  for(int li=0;li<8;li++){if(li>=uLocalLightCount)break;vec3 delta=uLocalLightPos[li].xyz-vWorld;float d=length(delta),r=max(.01,uLocalLightPos[li].w);float att=pow(clamp(1.0-d/r,0.0,1.0),2.0);float ndl=max(dot(n,normalize(delta)),0.0);float localShadow=li==uLocalShadowIndex?flashlightShadow(vWorld,n,normalize(delta)):1.0;float arch=architecturalLightVisibility(vWorld,uLocalLightPos[li].xyz);localLight+=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*ndl*localShadow*arch;}
  vec3 base=uBase*texel.rgb;vec3 halfDir=normalize(ldir+normalize(toEye));float spec=pow(max(dot(n,halfDir),0.0),mix(72.0,5.0,rough))*mix(.08,.72,metal)*cone*falloff*shadow*uLight;
  vec3 col=base*(uAmbientColor*ambient+uTorchColor*lamp*(1.0-metal*.45)+localLight)+uTorchColor*spec*mix(vec3(1.0),base,metal)+vEmissive.rgb*vEmissive.a;
  col=col/(1.0+col*.30);o=vec4(col,1.0);
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
out vec2 vUv;out vec4 vColor;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vUv=mix(aUvRect.xy,aUvRect.zw,aUv);vColor=aColor;gl_Position=uProj*uView*m*vec4(aPos,0.0,1.0);}`;
const TEXT_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;in vec4 vColor;uniform sampler2D uGlyphAtlas;out vec4 o;
void main(){float a=texture(uGlyphAtlas,vUv).a*vColor.a;if(a<.035)discard;o=vec4(vColor.rgb*a,a);}`;

const SHADOW_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=2) in vec2 aUv;
layout(location=3) in vec4 aM0;
layout(location=4) in vec4 aM1;
layout(location=5) in vec4 aM2;
layout(location=6) in vec4 aM3;
uniform mat4 uShadowMatrix;out vec2 vUv;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vUv=aUv;gl_Position=uShadowMatrix*m*vec4(aPos,1.0);}`;
const SHADOW_FRAG=`#version 300 es
precision highp float;
in vec2 vUv;uniform sampler2D uTex;uniform float uUseTex,uBaseAlpha,uAlphaCut;
void main(){float alpha=uUseTex>.5?texture(uTex,vUv).a:1.0;if(alpha*uBaseAlpha<uAlphaCut)discard;}`;

let gl=null,program=null,textProgram=null,shadowProgram=null,pack=null,staticInstances=[],dynamicInstances=[],emergencyShadowInstances=[],sourceStaticTextInstances=[],sourceStaticTextBatches=[],sourceVisibleBatchCount=0,sourceDynamicTextInstances=[],sourceTextCorpus=[],sourceSceneKey='',sourceCorpusKey='',portraitAtlas=null;
let practicalLightScaleByPropId=new Map();
let colorTex=null,depthTex=null,fbo=null,width=0,height=0;
let shadowDepthTex=null,shadowFbo=null,shadowSize=0,shadowReady=false,shadowActive=false,shadowMatrix=new Float32Array(16);
const NEAR=.05,FAR=90;
const uniformCache=new Map();
const textUniformCache=new Map();
const shadowUniformCache=new Map();
let textVao=null,textInstanceBuffer=null,textAtlas=null,textAtlasKey='',textAtlasEntries=new Map(),textAtlasBuilds=0;

function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`prop shader: ${gl.getShaderInfoLog(s)}`);return s;}
function linkProgram(vertex,fragment,label='prop'){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`${label} link: ${gl.getProgramInfoLog(p)}`);return p;}
function makeProgram(){return linkProgram(VERT,FRAG);}
const U=(n)=>{if(!uniformCache.has(n))uniformCache.set(n,gl.getUniformLocation(program,n));return uniformCache.get(n);};
const TU=(n)=>{if(!textUniformCache.has(n))textUniformCache.set(n,gl.getUniformLocation(textProgram,n));return textUniformCache.get(n);};
const SU=(n)=>{if(!shadowUniformCache.has(n))shadowUniformCache.set(n,gl.getUniformLocation(shadowProgram,n));return shadowUniformCache.get(n);};

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
export function props3dInit(context){gl=context;program=makeProgram();shadowProgram=linkProgram(SHADOW_VERT,SHADOW_FRAG,'prop shadow');initTextPass();}
export function loadPortraitAtlas(url){return new Promise((resolve,reject)=>{if(!gl){reject(new Error('props3dInit first'));return;}const img=new Image();img.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);portraitAtlas=t;resolve(t);};img.onerror=reject;img.src=url.href||String(url);});}
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
    if(colorTex)gl.deleteTexture(colorTex);if(depthTex)gl.deleteTexture(depthTex);if(fbo)gl.deleteFramebuffer(fbo);
    colorTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,colorTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    depthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,colorTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(status!==gl.FRAMEBUFFER_COMPLETE)throw new Error(`prop framebuffer ${status}`);
  }
  if(targetShadow!==shadowSize||!shadowFbo)resizeShadowTarget(targetShadow);
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

async function makeTexture(json,bin,textureIndex){
  if(textureIndex==null)return null;const texDef=json.textures?.[textureIndex],img=json.images?.[texDef?.source];if(!img?.bufferView)return null;
  const bv=json.bufferViews[img.bufferView],bytes=bin.slice(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength),bmp=await createImageBitmap(new Blob([bytes],{type:img.mimeType||'image/png'}));
  const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bmp);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return t;
}

async function parsePropPack(url){
  if(!gl)throw new Error('props3dInit first');const res=await fetch(url);if(!res.ok)throw new Error(`prop pack ${res.status}`);const ab=await res.arrayBuffer(),dv=new DataView(ab);if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw new Error('prop pack is not GLB 2');
  let at=12,json=null,bin=null;while(at<ab.byteLength){const len=dv.getUint32(at,true),type=dv.getUint32(at+4,true),bytes=new Uint8Array(ab,at+8,len);if(type===0x4e4f534a)json=JSON.parse(new TextDecoder().decode(bytes));else if(type===0x004e4942)bin=bytes;at+=8+len;}
  if(!json||!bin)throw new Error('prop pack missing JSON/BIN');
  if(json.animations||json.skins||json.extensionsUsed?.length||json.extensionsRequired?.length)throw new Error('prop pack contains unsupported animation, skin or extension');
  if(json.accessors?.some((a)=>a.sparse))throw new Error('prop pack contains sparse accessors');
  const textures=await Promise.all((json.textures||[]).map((_,i)=>makeTexture(json,bin,i)));
  const nodeByMesh=new Map();for(const n of json.nodes||[])if(n.mesh!=null&&!nodeByMesh.has(n.mesh))nodeByMesh.set(n.mesh,nodeMatrix(n));
  const catalog=new Map();
  for(let mi=0;mi<(json.meshes||[]).length;mi++){
    const md=json.meshes[mi],entry={name:md.name||`mesh-${mi}`,nodeMatrix:nodeByMesh.get(mi)||identity(),primitives:[],instanceBuffer:gl.createBuffer()};
    for(const pd of md.primitives||[]){
      if(pd.mode!=null&&pd.mode!==4)throw new Error(`${entry.name}: triangles only`);if(pd.indices==null)throw new Error(`${entry.name}: indices required`);if(pd.targets?.length)throw new Error(`${entry.name}: morph targets unsupported`);const pos=readAccessor(json,bin,pd.attributes.POSITION),norm=pd.attributes.NORMAL!=null?readAccessor(json,bin,pd.attributes.NORMAL):null,uv=pd.attributes.TEXCOORD_0!=null?readAccessor(json,bin,pd.attributes.TEXCOORD_0):null,idx=readAccessor(json,bin,pd.indices);
      if(!norm)throw new Error(`${entry.name}: normals required`);const vao=gl.createVertexArray();gl.bindVertexArray(vao);
      const bind=(loc,data,size)=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);};bind(0,pos,3);bind(1,norm,3);bind(2,uv||new Float32Array(pos.length/3*2),2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,entry.instanceBuffer);const stride=23*4;for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(3+c,1);}gl.enableVertexAttribArray(7);gl.vertexAttribPointer(7,1,gl.FLOAT,false,stride,64);gl.vertexAttribDivisor(7,1);gl.enableVertexAttribArray(8);gl.vertexAttribPointer(8,1,gl.FLOAT,false,stride,68);gl.vertexAttribDivisor(8,1);gl.enableVertexAttribArray(9);gl.vertexAttribPointer(9,1,gl.FLOAT,false,stride,72);gl.vertexAttribDivisor(9,1);gl.enableVertexAttribArray(10);gl.vertexAttribPointer(10,4,gl.FLOAT,false,stride,76);gl.vertexAttribDivisor(10,1);
      const matDef=json.materials?.[pd.material||0]||{},mat=matDef.pbrMetallicRoughness||{},alphaMode=matDef.alphaMode||'OPAQUE';if(alphaMode!=='OPAQUE'&&alphaMode!=='MASK')throw new Error(`${entry.name}: ${alphaMode} material unsupported`);entry.primitives.push({vao,count:idx.length,indexType:json.accessors[pd.indices].componentType,base:mat.baseColorFactor||[1,1,1,1],texture:textures[mat.baseColorTexture?.index]||null,normalTexture:textures[matDef.normalTexture?.index]||null,normalScale:matDef.normalTexture?.scale??1,ormTexture:textures[mat.metallicRoughnessTexture?.index]||null,metallic:mat.metallicFactor??1,roughness:mat.roughnessFactor??1,portrait:matDef.name==='portrait surface',alphaCut:alphaMode==='MASK'?(matDef.alphaCutoff??.5):0});
    }
    catalog.set(entry.name,entry);
  }
  gl.bindVertexArray(null);return{json,catalog};
}

export async function loadPropPack(url){pack=await parsePropPack(url);return pack;}

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

export function propInstanceVisible(instance,eye,maxDistance=90){
  const ix=Number.isFinite(instance?.x)?instance.x:instance?.matrix?.[12];
  const iz=Number.isFinite(instance?.z)?instance.z:instance?.matrix?.[14];
  if(!Number.isFinite(ix)||!Number.isFinite(iz))return false;
  return Math.hypot(ix-eye[0],iz-eye[2])<=maxDistance;
}
function visibleGroups(eye,maxDistance,{shadow=false}={}){
  const groups=new Map();
  for(const i of [...staticInstances,...dynamicInstances,...emergencyShadowInstances]){
    if(!shadow&&i.shadowOnly)continue;
    if(!propInstanceVisible(i,eye,maxDistance))continue;
    if(!groups.has(i.mesh))groups.set(i.mesh,[]);groups.get(i.mesh).push(i);
  }
  return groups;
}
function uploadInstances(mesh,list){const data=new Float32Array(list.length*23);for(let k=0;k<list.length;k++){const at=k*23,emissive=Array.isArray(list[k].emissive)?list[k].emissive:[0,0,0,0],lightScale=practicalLightScaleByPropId.get(list[k].id)??1;data.set(modelMatrix(list[k],mesh.nodeMatrix),at);data[at+16]=list[k].zone||0;data[at+17]=list[k].portraitIndex||0;data[at+18]=list[k].structural?1:0;data[at+19]=Number(emissive[0])||0;data[at+20]=Number(emissive[1])||0;data[at+21]=Number(emissive[2])||0;data[at+22]=Math.max(0,(Number(emissive[3])||0)*lightScale);}gl.bindBuffer(gl.ARRAY_BUFFER,mesh.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);}
function renderShadowPass(eye,yaw,pitch,light,shadowLight=null){
  const practical=shadowLight&&Number.isFinite(shadowLight.x)&&Number.isFinite(shadowLight.y)&&Number.isFinite(shadowLight.z)?shadowLight:null;
  shadowActive=false;if(!shadowReady||!shadowFbo||(!practical&&light<=.001)||!pack)return false;
  const forward=[Math.sin(yaw),0,-Math.cos(yaw)],right=[Math.cos(yaw),0,Math.sin(yaw)];
  const lightYaw=practical&&Number.isFinite(practical.shadowYaw)?practical.shadowYaw:yaw;
  const lightPitch=practical&&Number.isFinite(practical.shadowPitch)?practical.shadowPitch:pitch;
  const lightEye=practical?[practical.x,practical.y,practical.z]:[eye[0]+right[0]*.12,eye[1]-.08,eye[2]+right[2]*.12];
  const shadowFov=practical?92*Math.PI/180:66*Math.PI/180;
  shadowMatrix=multiply(perspectiveFov(shadowFov,1,.05,35),view(lightEye,lightYaw,lightPitch));
  const groups=visibleGroups(lightEye,35,{shadow:true});
  gl.bindFramebuffer(gl.FRAMEBUFFER,shadowFbo);gl.viewport(0,0,shadowSize,shadowSize);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1.2,2.0);gl.clearDepth(1);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProgram);gl.uniformMatrix4fv(SU('uShadowMatrix'),false,shadowMatrix);
  for(const[name,list]of groups){const mesh=pack.catalog.get(name);if(!mesh||!list.length)continue;uploadInstances(mesh,list);for(const primitive of mesh.primitives){gl.bindVertexArray(primitive.vao);gl.uniform1f(SU('uBaseAlpha'),primitive.base[3]??1);gl.uniform1f(SU('uAlphaCut'),primitive.alphaCut);gl.uniform1f(SU('uUseTex'),primitive.texture?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,primitive.texture);gl.uniform1i(SU('uTex'),0);gl.drawElementsInstanced(gl.TRIANGLES,primitive.count,primitive.indexType,0,list.length);}}
  gl.disable(gl.POLYGON_OFFSET_FILL);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);shadowActive=true;return true;
}

export function setPropInstances(next){staticInstances=Array.isArray(next)?next:[];}
export function setDynamicPropInstances(next){dynamicInstances=Array.isArray(next)?next:[];}
export function setEmergencyShadowInstances(next){emergencyShadowInstances=Array.isArray(next)?next:[];}
export function setPracticalLightFrame(lights){
  practicalLightScaleByPropId=new Map((Array.isArray(lights)?lights:[])
    .filter((light)=>light?.anchorPropId&&Number.isFinite(light.emissiveScale))
    .map((light)=>[light.anchorPropId,Math.max(.012,Math.min(1,Number(light.emissiveScale)||0))]));
}
export function setSourceTextInstances(next){sourceStaticTextInstances=Array.isArray(next)?next:[];sourceStaticTextBatches=[];sourceVisibleBatchCount=0;sourceDynamicTextInstances=[];sourceTextCorpus=[];sourceCorpusKey='';sourceSceneKey='legacy';}
export function setSourceScene(scene={}){
  const key=String(scene.key||'');
  if(key!==sourceSceneKey){sourceSceneKey=key;sourceStaticTextInstances=Array.isArray(scene.staticInstances)?scene.staticInstances:[];sourceStaticTextBatches=Array.isArray(scene.staticBatches)?scene.staticBatches.filter((batch)=>Array.isArray(batch?.instances)):[];}
  sourceDynamicTextInstances=Array.isArray(scene.dynamicInstances)?scene.dynamicInstances:[];
  const atlasKey=String(scene.atlasKey||'');
  if(atlasKey&&atlasKey!==sourceCorpusKey&&Array.isArray(scene.corpus)){sourceCorpusKey=atlasKey;sourceTextCorpus=scene.corpus;}
}
// Deliberately no visual state: the active HUSH source is found by sound.
export function setHushProp(_id){}
export function propTargets(){return{color:colorTex,depth:depthTex,ready:!!fbo,near:NEAR,far:FAR,shadow:shadowDepthTex,shadowReady:!!(shadowReady&&shadowActive),shadowMatrix,shadowTexel:new Float32Array([1/Math.max(1,shadowSize),1/Math.max(1,shadowSize)]),shadowSize};}

const TEXT_PALETTE={field:[.03,.96,.20,1],path:[.03,.72,1,1],page:[.92,.94,.84,1],fault:[1,.11,.08,1],white:[.92,.94,.90,1],red:[1,.10,.07,1],cyan:[.03,.72,1,1],green:[.03,.96,.20,1]};
function textColor(instance){
  if(Array.isArray(instance.color))return[instance.color[0]||0,instance.color[1]||0,instance.color[2]||0,instance.color[3]??1];
  return TEXT_PALETTE[instance.colorClass]||TEXT_PALETTE.field;
}
function atlasSignature(values){let h=2166136261;for(const value of values){for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}h^=10;h=Math.imul(h,16777619);}return`${values.length}:${h>>>0}`;}
function ensureTextAtlas(){
  const instances=[...sourceStaticTextInstances,...sourceDynamicTextInstances];
  const unique=[...new Set((sourceTextCorpus.length?sourceTextCorpus:instances.map((entry)=>String(entry.text||entry.source?.text||''))).filter(Boolean))];
  const key=sourceCorpusKey?`corpus:${sourceCorpusKey}`:atlasSignature(unique);if(key===textAtlasKey&&textAtlas)return;
  textAtlasKey=key;textAtlasEntries=new Map();textAtlasBuilds+=1;
  const size=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)||2048),cellW=192,cellH=28,cols=Math.max(1,Math.floor(size/cellW)),rows=Math.max(1,Math.floor(size/cellH));
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);ctx.textBaseline='middle';ctx.fillStyle='#fff';
  unique.slice(0,cols*rows).forEach((text,index)=>{
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
function renderSourceText(viewMatrix,projection,eye,forward,maxDistance){
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
  for(const entry of sourceTextInstances){const m=entry.matrix;if(!m||m.length!==16)continue;const dx=m[12]-eye[0],dz=m[14]-eye[2],d=Math.hypot(dx,dz);if(d>maxDistance)continue;if(d>4&&(dx*forward[0]+dz*forward[2])/Math.max(.001,d)<-.15)continue;const text=String(entry.text||entry.source?.text||''),uv=textAtlasEntries.get(text);if(!uv)continue;visible.push({entry,m,uv});}
  if(!visible.length)return;
  const data=new Float32Array(visible.length*24);visible.forEach(({entry,m,uv},index)=>{data.set(m,index*24);data.set(uv,index*24+16);data.set(textColor(entry),index*24+20);});
  gl.useProgram(textProgram);gl.uniformMatrix4fv(TU('uView'),false,viewMatrix);gl.uniformMatrix4fv(TU('uProj'),false,projection);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,textAtlas);gl.uniform1i(TU('uGlyphAtlas'),3);gl.bindVertexArray(textVao);gl.bindBuffer(gl.ARRAY_BUFFER,textInstanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,visible.length);gl.disable(gl.BLEND);gl.bindVertexArray(null);
}

export function renderPropPass({camX,camY,camZ,yaw,pitch=0,light=1,maxDistance=90,fogTexture,fogOrigin=[0,0],fogSize=256,cellMeters=.5,zoneTints,localLightCount=0,localLightPositions,localLightColors,localShadowIndex=-1,shadowLight=null,torch={},ambientColor=[.64,.65,.62],ambientIntensity=.022,planTexture=null,planSize=[0,0],planOrigin=[0,0]}){
  if(!gl||!fbo)return false;const cp=Math.cos(pitch),eye=[camX,camY,camZ],forward=[Math.sin(yaw)*cp,Math.sin(pitch),-Math.cos(yaw)*cp];
  const viewMatrix=view(eye,yaw,pitch),projection=perspective(width/height);
  renderShadowPass(eye,yaw,pitch,light,shadowLight);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniformMatrix4fv(U('uView'),false,viewMatrix);gl.uniformMatrix4fv(U('uProj'),false,projection);gl.uniform3fv(U('uEye'),eye);gl.uniform3fv(U('uForward'),forward);gl.uniform1f(U('uLight'),light);gl.uniform3fv(U('uTorchColor'),torch.color||[1,.94,.82]);gl.uniform1f(U('uTorchReach'),Number(torch.reach)||1);gl.uniform2f(U('uTorchCone'),Number(torch.coneInner)||.88,Number(torch.coneOuter)||.94);gl.uniform1f(U('uTorchSpill'),Number(torch.spill??.05)||0);gl.uniform3fv(U('uAmbientColor'),ambientColor);gl.uniform1f(U('uAmbientIntensity'),Number(ambientIntensity)||.022);gl.uniform3fv(U('uZoneTint[0]'),zoneTints);gl.uniform2fv(U('uFogOrigin'),fogOrigin);gl.uniform1f(U('uFogSize'),fogSize);gl.uniform1f(U('uCellMeters'),cellMeters);gl.uniform1i(U('uLocalLightCount'),localLightCount);gl.uniform1i(U('uLocalShadowIndex'),localShadowIndex);if(localLightPositions)gl.uniform4fv(U('uLocalLightPos[0]'),localLightPositions);if(localLightColors)gl.uniform4fv(U('uLocalLightColor[0]'),localLightColors);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fogTexture);gl.uniform1i(U('uFogTex'),1);gl.uniform1f(U('uShadowReady'),shadowActive?1:0);gl.uniformMatrix4fv(U('uShadowMatrix'),false,shadowMatrix);gl.uniform2f(U('uShadowTexel'),1/Math.max(1,shadowSize),1/Math.max(1,shadowSize));gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,shadowDepthTex);gl.uniform1i(U('uShadowTex'),6);gl.uniform1f(U('uPlanReady'),planTexture&&planSize[0]>0&&planSize[1]>0?1:0);gl.uniform2f(U('uPlanSize'),planSize[0]||0,planSize[1]||0);gl.uniform2f(U('uPlanOrigin'),planOrigin[0]||0,planOrigin[1]||0);gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,planTexture);gl.uniform1i(U('uPlanTex'),7);
  const groups=visibleGroups(eye,maxDistance);
  for(const [name,list] of groups){const m=pack?.catalog.get(name);if(!m||!list.length)continue;uploadInstances(m,list);
    for(const p of m.primitives){gl.bindVertexArray(p.vao);gl.uniform3fv(U('uBase'),p.base.slice(0,3));gl.uniform1f(U('uBaseAlpha'),p.base[3]??1);gl.uniform1f(U('uAlphaCut'),p.alphaCut);gl.uniform1f(U('uUseTex'),p.texture?1:0);gl.uniform1f(U('uUseNormal'),p.normalTexture?1:0);gl.uniform1f(U('uUseOrm'),p.ormTexture?1:0);gl.uniform1f(U('uNormalScale'),p.normalScale??1);gl.uniform1f(U('uMetallic'),p.metallic??0);gl.uniform1f(U('uRoughness'),p.roughness??1);gl.uniform1f(U('uUsePortrait'),p.portrait&&portraitAtlas?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,p.texture);gl.uniform1i(U('uTex'),0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,portraitAtlas);gl.uniform1i(U('uPortraitAtlas'),2);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,p.normalTexture);gl.uniform1i(U('uNormalTex'),4);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,p.ormTexture);gl.uniform1i(U('uOrmTex'),5);gl.drawElementsInstanced(gl.TRIANGLES,p.count,p.indexType,0,list.length);}
  }
  renderSourceText(viewMatrix,projection,eye,forward,maxDistance);
  gl.bindVertexArray(null);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true;
}

export function propPackStats(){return pack?{meshes:pack.catalog.size,instances:staticInstances.length,dynamicInstances:dynamicInstances.length,emergencyShadowInstances:emergencyShadowInstances.length,sourceText:sourceStaticTextInstances.length+sourceDynamicTextInstances.length,sourceStaticText:sourceStaticTextInstances.length,sourceDynamicText:sourceDynamicTextInstances.length,sourceStaticBatches:sourceStaticTextBatches.length,sourceVisibleBatches:sourceVisibleBatchCount,sourceSceneKey,sourceCorpusKey,textAtlasBuilds,shadow:{ready:shadowReady,active:shadowActive,size:shadowSize}}:null;}
