// Dedicated physical-paper inspection renderer.
//
// The document glyphs are already baked. This renderer only gives that
// manufactured sheet physical geometry and material response: exact A4 aspect,
// millimetre-scale bow/curl, causal fold/corner/tear deformation, two-sided
// lighting and the packed print material map. It is intentionally isolated from
// r3d.js so a paper shader failure cannot take down the gameplay renderer.

const MESH_X=33,MESH_Y=47;
const PAGE_W=.210,PAGE_H=.297;
const FOV=35*Math.PI/180;

const VERT=`#version 300 es
precision highp float;
layout(location=0) in vec2 aUv;
uniform mat4 uModel,uProj;
uniform vec4 uHandling; // foldY, foldStrength, cornerStrength, tearDepth
uniform vec4 uShape;    // bow metres, edge curl metres, turn, turn direction
out vec2 vUv;out vec3 vWorld;
const float PI=3.141592653589793;
void main(){
  float u=aUv.x,v=aUv.y;
  float x=(u-.5)*${PAGE_W.toFixed(6)};
  float y=(.5-v)*${PAGE_H.toFixed(6)};
  float z=0.0;
  z += uShape.x*sin(PI*u)*sin(PI*v);
  z += uShape.y*pow(abs(u-.5)*2.0,3.0);
  if(uHandling.x>=0.0){
    float d=abs(v-uHandling.x);
    float crease=exp(-d*94.0)*uHandling.y;
    z += crease*.00135;
    y += sign(v-uHandling.x)*crease*.00034;
  }
  float corner=smoothstep(.61,1.0,u)*smoothstep(.61,1.0,v)*uHandling.z;
  z += corner*.0042;
  x -= corner*.0012;
  // A page turn is a real geometric compression/curl, not a 2-D wipe. The
  // current/next sheets meet at edge-on in document.js.
  float turn=clamp(uShape.z,0.0,1.0);
  float dir=uShape.w;
  float bend=turn*(.18+.82*smoothstep(0.0,1.0,u));
  float theta=bend*PI*.50*dir;
  float xr=x*cos(theta)+z*sin(theta);
  float zr=-x*sin(theta)+z*cos(theta)+sin(PI*u)*turn*.0065;
  vec4 world=uModel*vec4(xr,y,zr,1.0);
  vWorld=world.xyz;vUv=aUv;gl_Position=uProj*world;
}`;

const FRAG=`#version 300 es
precision highp float;
in vec2 vUv;in vec3 vWorld;
uniform sampler2D uPage,uMaterial;
uniform vec2 uMaterialTexel;
uniform vec4 uHandling;
uniform float uSeed,uUseMaterial;
out vec4 o;
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
void main(){
  // Causal bottom-right tear. Depth comes from the physical handling manifest;
  // the tiny fibre irregularity is deterministic from the sheet seed.
  if(uHandling.w>0.0&&vUv.y>.68){
    float q=smoothstep(.68,1.0,vUv.y);
    float rag=(hash21(vec2(floor(vUv.y*180.0),uSeed))-.5)*.018;
    float edge=1.0-uHandling.w*q+rag*q;
    if(vUv.x>edge)discard;
  }
  // DOM image uploads already arrive top-row at v=0 in this renderer.
  // Sampling v directly keeps the printed front upright; the previous extra
  // inversion displayed the sheet upside down.
  vec2 tuv=vUv;
  vec3 albedo=texture(uPage,tuv).rgb;
  vec3 mat=uUseMaterial>.5?texture(uMaterial,tuv).rgb:vec3(.86,.502,.09);
  float rough=clamp(mat.r,.42,.96);
  float h=mat.g-.5;
  float hx=(texture(uMaterial,tuv+vec2(uMaterialTexel.x,0)).g-texture(uMaterial,tuv-vec2(uMaterialTexel.x,0)).g);
  float hy=(texture(uMaterial,tuv+vec2(0,uMaterialTexel.y)).g-texture(uMaterial,tuv-vec2(0,uMaterialTexel.y)).g);
  vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
  vec3 tx=normalize(dFdx(vWorld)),ty=normalize(dFdy(vWorld));
  n=normalize(n+tx*hx*.31-ty*hy*.31);
  if(!gl_FrontFacing)n=-n;
  vec3 key=normalize(vec3(-.42,.32,.85));
  vec3 fill=normalize(vec3(.36,-.18,.92));
  float ndk=max(dot(n,key),0.0),ndf=max(dot(n,fill),0.0);
  vec3 viewDir=normalize(-vWorld);vec3 halfV=normalize(key+viewDir);
  float spec=pow(max(dot(n,halfV),0.0),mix(54.0,9.0,rough))*(1.0-rough)*.15;
  float transmission=mat.b;
  if(!gl_FrontFacing){
    // From the rear, office stock dominates and front ink only ghosts through.
    float ink=1.0-dot(albedo,vec3(.2126,.7152,.0722));
    albedo=mix(vec3(.925,.916,.875),albedo,.055+transmission*.10);
    albedo-=ink*.035;
  }
  float fibre=(hash21(floor(vUv*vec2(840.0,1188.0))+uSeed)-.5)*.008;
  vec3 lit=albedo*(.78+ndk*.26+ndf*.055)+spec+fibre;
  o=vec4(clamp(lit,0.0,1.0),1.0);
}`;

let canvas=null,gl=null,program=null,vao=null,indexCount=0,failed=null;
let pageTexture=null,materialTexture=null,lastPageImage=null,lastMaterialImage=null;
const U=new Map();

function compile(type,source,label){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s)||'unknown error';gl.deleteShader(s);throw new Error(`paper3d ${label} compile: ${log}`);}return s;}
function link(){const p=gl.createProgram(),vs=compile(gl.VERTEX_SHADER,VERT,'vertex'),fs=compile(gl.FRAGMENT_SHADER,FRAG,'fragment');gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){const log=gl.getProgramInfoLog(p)||'unknown error';gl.deleteProgram(p);throw new Error(`paper3d link: ${log}`);}return p;}
function uniform(name){if(!program)return null;if(!U.has(name))U.set(name,gl.getUniformLocation(program,name));return U.get(name);}

function mesh(){
  const verts=new Float32Array(MESH_X*MESH_Y*2);let at=0;
  for(let y=0;y<MESH_Y;y++)for(let x=0;x<MESH_X;x++){verts[at++]=x/(MESH_X-1);verts[at++]=y/(MESH_Y-1);}
  const indices=new Uint16Array((MESH_X-1)*(MESH_Y-1)*6);at=0;
  for(let y=0;y<MESH_Y-1;y++)for(let x=0;x<MESH_X-1;x++){const a=y*MESH_X+x,b=a+1,c=a+MESH_X,d=c+1;indices[at++]=a;indices[at++]=c;indices[at++]=b;indices[at++]=b;indices[at++]=c;indices[at++]=d;}
  const vbo=gl.createBuffer(),ibo=gl.createBuffer();vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,verts,gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,indices,gl.STATIC_DRAW);gl.bindVertexArray(null);indexCount=indices.length;
}
function init(){
  if(gl||failed)return !!gl;
  if(typeof document==='undefined')return false;
  try{
    canvas=document.createElement('canvas');gl=canvas.getContext('webgl2',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false,preserveDrawingBuffer:false});
    if(!gl)throw new Error('WebGL2 unavailable');program=link();mesh();gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(0,0,0,0);return true;
  }catch(error){failed=error instanceof Error?error:new Error(String(error));console.warn('[paper3d] disabled:',failed);gl=null;program=null;return false;}
}
function upload(image,existing){if(!image)return existing;const t=existing||gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.SRGB8_ALPHA8,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function uploadMaterial(image,existing){if(!image)return existing;const t=existing||gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB8,gl.RGB,gl.UNSIGNED_BYTE,image);gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;}
function ident(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
function rotX(a){const c=Math.cos(a),s=Math.sin(a),m=ident();m[5]=c;m[6]=s;m[9]=-s;m[10]=c;return m;}
function rotY(a){const c=Math.cos(a),s=Math.sin(a),m=ident();m[0]=c;m[2]=-s;m[8]=s;m[10]=c;return m;}
function rotZ(a){const c=Math.cos(a),s=Math.sin(a),m=ident();m[0]=c;m[1]=s;m[4]=-s;m[5]=c;return m;}
function translate(x,y,z){const m=ident();m[12]=x;m[13]=y;m[14]=z;return m;}
function perspective(fov,aspect,near=.05,far=4){const f=1/Math.tan(fov/2),m=new Float32Array(16);m[0]=f/aspect;m[5]=f;m[10]=(far+near)/(near-far);m[11]=-1;m[14]=(2*far*near)/(near-far);return m;}
function size(w,h){const W=Math.max(320,Math.min(1536,Math.round(w))),H=Math.max(454,Math.min(2172,Math.round(h)));if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}gl.viewport(0,0,W,H);return [W,H];}

export function paper3dRender({image,materialImage=null,width=900,height=1273,handlingVector=[-1,0,0,0],seed=0,bow=.0009,edgeCurl=.0007,yaw=0,pitch=0,roll=0,turn=0,turnDir=1}={}){
  if(!image||!init())return null;
  try{
    const [W,H]=size(width,height);if(lastPageImage!==image){pageTexture=upload(image,pageTexture);lastPageImage=image;}if(materialImage&&lastMaterialImage!==materialImage){materialTexture=uploadMaterial(materialImage,materialTexture);lastMaterialImage=materialImage;}
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);gl.bindVertexArray(vao);
    let model=translate(0,0,-.515);model=mul(model,rotZ(roll));model=mul(model,rotY(yaw));model=mul(model,rotX(pitch));
    const proj=perspective(FOV,W/H);
    gl.uniformMatrix4fv(uniform('uModel'),false,model);gl.uniformMatrix4fv(uniform('uProj'),false,proj);gl.uniform4fv(uniform('uHandling'),new Float32Array(handlingVector||[-1,0,0,0]));gl.uniform4f(uniform('uShape'),bow,edgeCurl,Math.max(0,Math.min(1,turn)),turnDir>=0?1:-1);gl.uniform1f(uniform('uSeed'),Number(seed)||0);
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,pageTexture);gl.uniform1i(uniform('uPage'),0);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,materialTexture);gl.uniform1i(uniform('uMaterial'),1);gl.uniform1f(uniform('uUseMaterial'),materialImage&&materialTexture?1:0);gl.uniform2f(uniform('uMaterialTexel'),materialImage?1/Math.max(1,materialImage.naturalWidth||materialImage.width):1/1024,materialImage?1/Math.max(1,materialImage.naturalHeight||materialImage.height):1/1448);
    gl.drawElements(gl.TRIANGLES,indexCount,gl.UNSIGNED_SHORT,0);gl.bindVertexArray(null);return canvas;
  }catch(error){failed=error instanceof Error?error:new Error(String(error));console.warn('[paper3d] frame failed; using 2-D fallback:',failed);return null;}
}

export function paper3dProbe(){return {available:!!gl||(!failed&&typeof document!=='undefined'),ready:!!program,failed:failed?String(failed.message||failed):null,mesh:[MESH_X,MESH_Y],pageMetres:[PAGE_W,PAGE_H]};}
export function paper3dDebugShaders(){return {vertex:VERT,fragment:FRAG};}
