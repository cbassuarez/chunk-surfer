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
uniform vec3 uEye,uForward,uBase,uZoneTint[10];uniform float uLight,uAlphaCut,uBaseAlpha;uniform sampler2D uTex,uFogTex;uniform float uUseTex,uFogSize,uCellMeters;uniform vec2 uFogOrigin;
uniform sampler2D uPortraitAtlas;uniform float uUsePortrait;
out vec4 o;
void main(){
  vec4 texel=uUseTex>.5?texture(uTex,vUv):vec4(1.0);
  if(uUsePortrait>.5){int slot=clamp(vPortrait,0,5);vec2 cell=vec2(float(slot%3),float(slot/3));vec2 local=clamp(vUv,.006,.994);texel=texture(uPortraitAtlas,(cell+local)/vec2(3.0,2.0));}
  if(texel.a*uBaseAlpha<uAlphaCut)discard;
  vec2 fogUv=(vWorld.xz/uCellMeters-uFogOrigin+.5)/uFogSize;float memory=texture(uFogTex,fogUv).r;if(memory<.04&&vStructural==0)discard;if(vStructural!=0)memory=max(memory,.22);
  vec3 n=normalize(vNormal),toEye=uEye-vWorld;float dist=length(toEye);vec3 ldir=normalize(toEye);
  n=dot(n,ldir)<0.0?-n:n;   // two-sided: imported meshes have arbitrary winding, light whichever face we see
  float lambert=max(dot(n,ldir),0.12);vec3 fromEye=normalize(vWorld-uEye);float axis=dot(fromEye,uForward);
  float cone=smoothstep(.86,.94,axis)*uLight;float falloff=1.0/(1.0+.10*dist+.045*dist*dist);
  float lamp=lambert*falloff*(.35+3.2*cone);float ambient=mix(.012,.035,uLight);
  vec3 base=uBase*texel.rgb*uZoneTint[clamp(vZone,0,9)];vec3 col=base*(ambient+lamp)*mix(.25,1.0,memory);
  col=col/(1.0+col*.30);o=vec4(col,1.0);
}`;

let gl=null,program=null,pack=null,instances=[],portraitAtlas=null;
let colorTex=null,depthTex=null,fbo=null,width=0,height=0;
const NEAR=.05,FAR=90;

function shader(type,src){const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(`prop shader: ${gl.getShaderInfoLog(s)}`);return s;}
function makeProgram(){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,VERT));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,FRAG));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`prop link: ${gl.getProgramInfoLog(p)}`);return p;}
const U=(n)=>gl.getUniformLocation(program,n);

export function props3dInit(context){gl=context;program=makeProgram();}
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

export async function loadPropPack(url){
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
      const matDef=json.materials?.[pd.material||0]||{},mat=matDef.pbrMetallicRoughness||{},alphaMode=matDef.alphaMode||'OPAQUE';if(alphaMode!=='OPAQUE'&&alphaMode!=='MASK')throw new Error(`${entry.name}: ${alphaMode} material unsupported`);entry.primitives.push({vao,count:idx.length,indexType:json.accessors[pd.indices].componentType,base:mat.baseColorFactor||[1,1,1,1],texture:textures[mat.baseColorTexture?.index]||null,portrait:matDef.name==='portrait surface',alphaCut:alphaMode==='MASK'?(matDef.alphaCutoff??.5):0});
    }
    catalog.set(entry.name,entry);
  }
  gl.bindVertexArray(null);pack={json,catalog};return pack;
}

function identity(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function multiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function modelMatrix(i,base=identity()){const s=i.scale||1,c=Math.cos(i.yaw||0),n=Math.sin(i.yaw||0);return multiply(new Float32Array([c*s,0,n*s,0,0,s,0,0,-n*s,0,c*s,0,i.x,i.y||0,i.z,1]),base);}
function perspective(aspect){const f=1/.95,n=NEAR,fa=FAR;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(fa+n)/(n-fa),-1,0,0,(2*fa*n)/(n-fa),0]);}
function view(eye,yaw){const f=[Math.sin(yaw),0,-Math.cos(yaw)],z=[-f[0],0,-f[2]],x=[z[2],0,-z[0]],y=[0,1,0];return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-x[0]*eye[0]-x[2]*eye[2],-eye[1],-z[0]*eye[0]-z[2]*eye[2],1]);}

export function setPropInstances(next){instances=Array.isArray(next)?next:[];}
// Deliberately no visual state: the active HUSH source is found by sound.
export function setHushProp(_id){}
export function propTargets(){return{color:colorTex,depth:depthTex,ready:!!(pack&&fbo),near:NEAR,far:FAR};}

export function renderPropPass({camX,camY,camZ,yaw,light=1,maxDistance=90,fogTexture,fogOrigin=[0,0],fogSize=256,cellMeters=.5,zoneTints}){
  if(!gl||!pack||!fbo)return false;const eye=[camX,camY,camZ],forward=[Math.sin(yaw),0,-Math.cos(yaw)];
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,width,height);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.uniformMatrix4fv(U('uView'),false,view(eye,yaw));gl.uniformMatrix4fv(U('uProj'),false,perspective(width/height));gl.uniform3fv(U('uEye'),eye);gl.uniform3fv(U('uForward'),forward);gl.uniform1f(U('uLight'),light);gl.uniform3fv(U('uZoneTint[0]'),zoneTints);gl.uniform2fv(U('uFogOrigin'),fogOrigin);gl.uniform1f(U('uFogSize'),fogSize);gl.uniform1f(U('uCellMeters'),cellMeters);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,fogTexture);gl.uniform1i(U('uFogTex'),1);
  const groups=new Map();for(const i of instances){const dx=i.x-eye[0],dz=i.z-eye[2],d=Math.hypot(dx,dz);if(d>maxDistance||!i.structural&&d>3&&(dx*forward[0]+dz*forward[2])/Math.max(.001,d)<.35)continue;if(!groups.has(i.mesh))groups.set(i.mesh,[]);groups.get(i.mesh).push(i);}
  for(const [name,list] of groups){const m=pack.catalog.get(name);if(!m||!list.length)continue;const data=new Float32Array(list.length*19);for(let k=0;k<list.length;k++){data.set(modelMatrix(list[k],m.nodeMatrix),k*19);data[k*19+16]=list[k].zone||0;data[k*19+17]=list[k].portraitIndex||0;data[k*19+18]=list[k].structural?1:0;}gl.bindBuffer(gl.ARRAY_BUFFER,m.instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
    for(const p of m.primitives){gl.bindVertexArray(p.vao);gl.uniform3fv(U('uBase'),p.base.slice(0,3));gl.uniform1f(U('uBaseAlpha'),p.base[3]??1);gl.uniform1f(U('uAlphaCut'),p.alphaCut);gl.uniform1f(U('uUseTex'),p.texture?1:0);gl.uniform1f(U('uUsePortrait'),p.portrait&&portraitAtlas?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,p.texture);gl.uniform1i(U('uTex'),0);gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,portraitAtlas);gl.uniform1i(U('uPortraitAtlas'),2);gl.drawElementsInstanced(gl.TRIANGLES,p.count,p.indexType,0,list.length);}
  }
  gl.bindVertexArray(null);gl.disable(gl.CULL_FACE);gl.disable(gl.DEPTH_TEST);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true;
}

export function propPackStats(){return pack?{meshes:pack.catalog.size,instances:instances.length}:null;}
