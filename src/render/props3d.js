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
uniform mat4 uView,uProj;
out vec3 vWorld,vNormal;out vec2 vUv;flat out int vZone;flat out int vPortrait;flat out int vStructural;
void main(){mat4 m=mat4(aM0,aM1,aM2,aM3);vec4 w=m*vec4(aPos,1.0);vWorld=w.xyz;vNormal=normalize(transpose(inverse(mat3(m)))*aNormal);vUv=aUv;vZone=int(aZone+.5);vPortrait=int(aPortrait+.5);vStructural=int(aStructural+.5);gl_Position=uProj*uView*w;}`;

const FRAG=`#version 300 es
precision highp float;
in vec3 vWorld,vNormal;in vec2 vUv;flat in int vZone;flat in int vPortrait;flat in int vStructural;
uniform vec3 uEye,uForward,uBase,uZoneTint[13];uniform float uLight,uAlphaCut,uBaseAlpha;uniform sampler2D uTex,uNormalTex,uOrmTex,uFogTex;uniform float uUseTex,uUseNormal,uUseOrm,uMetallic,uRoughness,uNormalScale,uFogSize,uCellMeters;uniform vec2 uFogOrigin;
uniform int uLocalLightCount;uniform vec4 uLocalLightPos[8],uLocalLightColor[8];
uniform sampler2D uPortraitAtlas;uniform float uUsePortrait;
out vec4 o;
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
  float lambert=max(dot(n,ldir),0.12);vec3 fromEye=normalize(vWorld-uEye);float axis=dot(fromEye,uForward);
  float cone=smoothstep(.86,.94,axis)*uLight;float falloff=1.0/(1.0+.10*dist+.045*dist*dist);
  float lamp=lambert*falloff*(.35+3.2*cone);float ambient=mix(.012,.035,uLight);vec3 localLight=vec3(0.0);
  for(int li=0;li<8;li++){if(li>=uLocalLightCount)break;vec3 delta=uLocalLightPos[li].xyz-vWorld;float d=length(delta),r=max(.01,uLocalLightPos[li].w);float att=pow(clamp(1.0-d/r,0.0,1.0),2.0);float ndl=max(dot(n,normalize(delta)),0.0);localLight+=uLocalLightColor[li].rgb*uLocalLightColor[li].w*att*(.18+.82*ndl);}
  vec3 base=uBase*texel.rgb;vec3 halfDir=normalize(ldir+normalize(toEye));float spec=pow(max(dot(n,halfDir),0.0),mix(72.0,5.0,rough))*mix(.08,.72,metal)*cone*falloff;
  vec3 col=base*(ambient+lamp*(1.0-metal*.45)+localLight)+spec*mix(vec3(1.0),base,metal);
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

let gl=null,program=null,textProgram=null,pack=null,staticInstances=[],dynamicInstances=[],sourceTextInstances=[],portraitAtlas=null;
let colorTex=null,depthTex=null,fbo=null,width=0,height=0;
const NEAR=.05,FAR=90;
const uniformCache=new Map();
const textUniformCache=new Map();
let textVao=null,textInstanceBuffer=null,textAtlas=null,textAtlasKey='',textAtlasEntries=new Map();

function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`prop shader: ${gl.getShaderInfoLog(s)}`);return s;}
function linkProgram(vertex,fragment,label='prop'){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`${label} link: ${gl.getProgramInfoLog(p)}`);return p;}
function makeProgram(){return linkProgram(VERT,FRAG);}
const U=(n)=>{if(!uniformCache.has(n))uniformCache.set(n,gl.getUniformLocation(program,n));return uniformCache.get(n);};
const TU=(n)=>{if(!textUniformCache.has(n))textUniformCache.set(n,gl.getUniformLocation(textProgram,n));return textUniformCache.get(n);};

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
export function props3dInit(context){gl=context;program=makeProgram();initTextPass();}
export function loadPortraitAtlas(url){return new Promise((resolve,reject)=>{if(!gl){reject(new Error('props3dInit first'));return;}const img=new Image();img.onload=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);portraitAtlas=t;resolve(t);};img.onerror=reject;img.src=url.href||String(url);});}
export function props3dResize(w,h){
  if(!gl||w===width&&h===height)return;width=w;height=h;
  if(colorTex)gl.deleteTexture(colorTex);if(depthTex)gl.deleteTexture(depthTex);if(fbo)gl.deleteFramebuffer(fbo);
  colorTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,colorTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  depthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,depthTex);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,w,h,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  fbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,colorTex,0);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depthTex,0);
  const status=gl.checkFramebufferStatus(gl.FRAMEBUFFER);gl.bindFramebuffer(gl.FRAMEBUFFER,null);if(status!==gl.FRAMEBUFFER_COMPLETE)throw new Error(`prop framebuffer ${status}`);
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
      gl.bindBuffer(gl.ARRAY_BUFFER,entry.instanceBuffer);const stride=19*4;for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(3+c,1);}gl.enableVertexAttribArray(7);gl.vertexAttribPointer(7,1,gl.FLOAT,false,stride,64);gl.vertexAttribDivisor(7,1);gl.enableVertexAttribArray(8);gl.vertexAttribPointer(8,1,gl.FLOAT,false,stride,68);gl.vertexAttribDivisor(8,1);gl.enableVertexAttribArray(9);gl.vertexAttribPointer(9,1,gl.FLOAT,false,stride,72);gl.vertexAttribDivisor(9,1);
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
function view(eye,yaw){const f=[Math.sin(yaw),0,-Math.cos(yaw)],z=[-f[0],0,-f[2]],x=[z[2],0,-z[0]],y=[0,1,0];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[2]*eye[2],-eye[1],-z[0]*eye[0]-z[2]*eye[2],1]);}

export function setPropInstances(next){staticInstances=Array.isArray(next)?next:[];}
export function setDynamicPropInstances(next){dynamicInstances=Array.isArray(next)?next:[];}
export function setSourceTextInstances(next){sourceTextInstances=Array.isArray(next)?next:[];}
// Deliberately no visual state: the active HUSH source is found by sound.
export function setHushProp(_id){}
export function propTargets(){return{color:colorTex,depth:depthTex,ready:!!(pack&&fbo),near:NEAR,far:FAR};}

const TEXT_PALETTE={field:[.03,.96,.20,1],path:[.03,.72,1,1],page:[.92,.94,.84,1],fault:[1,.11,.08,1],white:[.92,.94,.90,1],red:[1,.10,.07,1],cyan:[.03,.72,1,1],green:[.03,.96,.20,1]};
function textColor(instance){
  if(Array.isArray(instance.color))return[instance.color[0]||0,instance.color[1]||0,instance.color[2]||0,instance.color[3]??1];
  return TEXT_PALETTE[instance.colorClass]||TEXT_PALETTE.field;
}
function atlasSignature(values){let h=2166136261;for(const value of values){for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,16777619);}h^=10;h=Math.imul(h,16777619);}return`${values.length}:${h>>>0}`;}
function ensureTextAtlas(){
  const unique=[...new Set(sourceTextInstances.map((entry)=>String(entry.text||entry.source?.text||'')).filter(Boolean))];
  const key=atlasSignature(unique);if(key===textAtlasKey&&textAtlas)return;
  textAtlasKey=key;textAtlasEntries=new Map();
  const size=Math.min(4096,gl.getParameter(gl.MAX_TEXTURE_SIZE)||2048),cellW=512,cellH=48,cols=Math.max(1,Math.floor(size/cellW)),rows=Math.max(1,Math.floor(size/cellH));
  const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size,size);ctx.textBaseline='middle';ctx.fillStyle='#fff';
  unique.slice(0,cols*rows).forEach((text,index)=>{
    const col=index%cols,row=Math.floor(index/cols),x=col*cellW,y=row*cellH;
    let font=20;ctx.font=`${font}px monospace`;while(font>8&&ctx.measureText(text).width>cellW-10){font-=1;ctx.font=`${font}px monospace`;}
    ctx.fillText(text,x+4,y+cellH/2);
    textAtlasEntries.set(text,[(x+1)/size,(y+1)/size,(x+cellW-1)/size,(y+cellH-1)/size]);
  });
  if(textAtlas)gl.deleteTexture(textAtlas);textAtlas=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,textAtlas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,canvas);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
}
function renderSourceText(viewMatrix,projection,eye,forward,maxDistance){
  if(!sourceTextInstances.length||!textProgram)return;
  ensureTextAtlas();const visible=[];
  for(const entry of sourceTextInstances){const m=entry.matrix;if(!m||m.length!==16)continue;const dx=m[12]-eye[0],dz=m[14]-eye[2],d=Math.hypot(dx,dz);if(d>maxDistance)continue;if(d>4&&(dx*forward[0]+dz*forward[2])/Math.max(.001,d)<-.15)continue;const text=String(entry.text||entry.source?.text||''),uv=textAtlasEntries.get(text);if(!uv)continue;visible.push({entry,m,uv});}
  if(!visible.length)return;
  const data=new Float32Array(visible.length*24);visible.forEach(({entry,m,uv},index)=>{data.set(m,index*24);data.set(uv,index*24+16);data.set(textColor(entry),index*24+20);});
  gl.useProgram(textProgram);gl.uniformMatrix4fv(TU('uView'),false,viewMatrix);gl.uniformMatrix4fv(TU('uProj'),false,projection);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,textAtlas);gl.uniform1i(TU('uGlyphAtlas'),3);gl.bindVertexArray(textVao);gl.bindBuffer(gl.ARRAY_BUFFER,textInstanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,4,visible.length);gl.disable(gl.BLEND);gl.bindVertexArray(null);
}

export function renderPropPass({camX,camY,camZ,yaw,light=1,maxDistance=90,fogTexture,fogOrigin=[0,0],fogSize=256,cellMeters=.5,zoneTints,localLightCount=0,localLightPositions,localLightColors}){
  if(!gl||!pack||!fbo)return false;const eye=[camX,camY,camZ],forward=[Math.sin(yaw),0,-Math.cos(yaw)];
  const viewMatrix=view(eye,yaw),projection=perspective(width/height);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniformMatrix4fv(U('uView'),false,viewMatrix);gl.uniformMatrix4fv(U('uProj'),false,projection);gl.uniform3fv(U('uEye'),eye);gl.uniform3fv(U('uForward'),forward);gl.uniform1f(U('uLight'),light);gl.uniform3fv(U('uZoneTint[0]'),zoneTints);gl.uniform2fv(U('uFogOrigin'),fogOrigin);gl.uniform1f(U('uFogSize'),fogSize);gl.uniform1f(U('uCellMeters'),cellMeters);gl.uniform1i(U('uLocalLightCount'),localLightCount);if(localLightPositions)gl.uniform4fv(U('uLocalLightPos[0]'),localLightPositions);if(localLightColors)gl.uniform4fv(U('uLocalLightColor[0]'),localLightColors);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fogTexture);gl.uniform1i(U('uFogTex'),1);
  const groups=new Map();for(const i of [...staticInstances,...dynamicInstances]){const ix=Number.isFinite(i.x)?i.x:i.matrix?.[12],iz=Number.isFinite(i.z)?i.z:i.matrix?.[14];if(!Number.isFinite(ix)||!Number.isFinite(iz))continue;const dx=ix-eye[0],dz=iz-eye[2],d=Math.hypot(dx,dz);if(d>maxDistance||!i.structural&&d>3&&(dx*forward[0]+dz*forward[2])/Math.max(.001,d)<.35)continue;if(!groups.has(i.mesh))groups.set(i.mesh,[]);groups.get(i.mesh).push(i);}
  for(const [name,list] of groups){const m=pack.catalog.get(name);if(!m||!list.length)continue;const data=new Float32Array(list.length*19);for(let k=0;k<list.length;k++){data.set(modelMatrix(list[k],m.nodeMatrix),k*19);data[k*19+16]=list[k].zone||0;data[k*19+17]=list[k].portraitIndex||0;data[k*19+18]=list[k].structural?1:0;}gl.bindBuffer(gl.ARRAY_BUFFER,m.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    for(const p of m.primitives){gl.bindVertexArray(p.vao);gl.uniform3fv(U('uBase'),p.base.slice(0,3));gl.uniform1f(U('uBaseAlpha'),p.base[3]??1);gl.uniform1f(U('uAlphaCut'),p.alphaCut);gl.uniform1f(U('uUseTex'),p.texture?1:0);gl.uniform1f(U('uUseNormal'),p.normalTexture?1:0);gl.uniform1f(U('uUseOrm'),p.ormTexture?1:0);gl.uniform1f(U('uNormalScale'),p.normalScale??1);gl.uniform1f(U('uMetallic'),p.metallic??0);gl.uniform1f(U('uRoughness'),p.roughness??1);gl.uniform1f(U('uUsePortrait'),p.portrait&&portraitAtlas?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,p.texture);gl.uniform1i(U('uTex'),0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,portraitAtlas);gl.uniform1i(U('uPortraitAtlas'),2);gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,p.normalTexture);gl.uniform1i(U('uNormalTex'),4);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_2D,p.ormTexture);gl.uniform1i(U('uOrmTex'),5);gl.drawElementsInstanced(gl.TRIANGLES,p.count,p.indexType,0,list.length);}
  }
  renderSourceText(viewMatrix,projection,eye,forward,maxDistance);
  gl.bindVertexArray(null);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true;
}

export function propPackStats(){return pack?{meshes:pack.catalog.size,instances:staticInstances.length,dynamicInstances:dynamicInstances.length,sourceText:sourceTextInstances.length}:null;}
