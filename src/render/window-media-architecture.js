import {WINDOW_SURFACE_LOOK_GLSL} from './window-surface-look.js';
import {windowMediaAsset} from '../platform/window-composition.js';

export const WINDOW_ARCHITECTURE_LIMITS=Object.freeze({meshes:24,vertices:65536,triangles:32768,panes:2,layers:2,instancesPerPane:64,drawTrianglesPerPane:65536,interpolationMs:40});
const surfaceIds=['rest:source','rest:answer'],number=Number.isFinite,clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),
  vector=(v,n)=>v?.length===n&&Array.from(v).every(x=>number(x)&&Math.abs(x)<=1e6),
  id=v=>typeof v==='string'&&v.length>0&&v.length<=180&&/^[a-z0-9:_./-]+$/i.test(v),
  mix=(a,b,t)=>a+(b-a)*t,dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],
  cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  unit=v=>{const n=Math.hypot(...v);return n>1e-10?v.map(x=>x/n):[0,0,1];},
  lerp=(a,b,t)=>a.map((v,k)=>mix(v,b[k],t));
export const windowArchitectureCueAllowed=cue=>['source-rest:architecture:','source-rest:apertures:'].some(prefix=>String(cue||'').startsWith(prefix));
export function windowArchitectureCatalogue(meshes=[]){return new Map(meshes.map(m=>[m.id,{triangles:m.i.length/3,vertices:m.p.length/3}]));}
function cameraValid(c){
  const p=c?.projection,r=c?.crop,b=c?.basis;
  return vector(c?.eye,3)&&vector(b?.right,3)&&vector(b?.up,3)&&vector(b?.forward,3)
    &&[b.right,b.up,b.forward].every(v=>Math.hypot(...v)>.1)
    &&number(p?.tanHalfFov)&&p.tanHalfFov>.02&&p.tanHalfFov<10&&number(p.aspect)&&p.aspect>.05&&p.aspect<20
    &&number(p.near)&&p.near>=.0001&&number(p.far)&&p.far>p.near&&p.far<=1e6
    &&r&&['x','y','width','height'].every(k=>number(r[k]))&&Math.abs(r.x)<=8&&Math.abs(r.y)<=8&&r.width>.0001&&r.width<=16&&r.height>.0001&&r.height<=16
    &&(!c.matrix||vector(c.matrix,16));
}
export function validateWindowArchitecturePacket(packet,{catalogue=null}={}){
  const bad=reason=>({ok:false,reason});
  if(packet?.version!==1||!['wrong-return','catch'].includes(packet.phase)||!id(packet.meshRevision)||!number(packet.sourceSeconds)||packet.sourceSeconds<0||packet.sourceSeconds>1e6)return bad('identity');
  let book=catalogue;
  if(packet.meshes!==undefined){
    if(!Array.isArray(packet.meshes)||!packet.meshes.length||packet.meshes.length>WINDOW_ARCHITECTURE_LIMITS.meshes)return bad('meshes');
    let vertices=0,triangles=0;const names=new Set();
    for(const m of packet.meshes){
      if(!id(m?.id)||names.has(m.id)||!m.p?.length||m.p.length%3||!m.i?.length||m.i.length%3)return bad('mesh-shape');names.add(m.id);
      const count=m.p.length/3;vertices+=count;triangles+=m.i.length/3;
      if(vertices>WINDOW_ARCHITECTURE_LIMITS.vertices||triangles>WINDOW_ARCHITECTURE_LIMITS.triangles)return bad('mesh-budget');
      if(!Array.from(m.p).every(x=>number(x)&&Math.abs(x)<=1e6)||!Array.from(m.i).every(x=>Number.isInteger(x)&&x>=0&&x<count)||m.base&&!vector(m.base,4))return bad('mesh-data');
    }
    const incoming=windowArchitectureCatalogue(packet.meshes);
    if(catalogue&&(incoming.size!==catalogue.size||[...incoming].some(([name,value])=>{const old=catalogue.get(name);return!old||old.vertices!==value.vertices||old.triangles!==value.triangles;})))return bad('immutable-catalogue');
    book=catalogue||incoming;
  }
  if(!book?.size)return bad('unknown-mesh-revision');
  if(!Array.isArray(packet.panes)||!packet.panes.length||packet.panes.length>2||new Set(packet.panes.map(p=>p.surfaceId)).size!==packet.panes.length)return bad('panes');
  for(const pane of packet.panes){
    if(!surfaceIds.includes(pane?.surfaceId))return bad('surface');
    const layers=pane.layers||[{camera:pane.camera,instances:pane.instances}];
    if(!Array.isArray(layers)||!layers.length||layers.length>2)return bad('layers');
    if(pane.layers&&(layers.some(p=>!id(p.id))||new Set(layers.map(p=>p.id)).size!==layers.length))return bad('layer-identity');
    let instances=0,triangles=0;
    for(const layer of layers){
      const names=new Set();
      if(!cameraValid(layer.camera)||!Array.isArray(layer.instances))return bad('camera');
      if(layer.clip){const c=layer.clip;if(!['x','y','width','height'].every(k=>number(c[k]))||c.x<0||c.y<0||c.width<=0||c.height<=0||c.x+c.width>1.000001||c.y+c.height>1.000001||c.edge!=null&&!['left','right','both'].includes(c.edge)||c.edgeWidth!=null&&(!number(c.edgeWidth)||c.edgeWidth<0||c.edgeWidth>.05)||c.edgeShade!=null&&(!number(c.edgeShade)||c.edgeShade<0||c.edgeShade>1))return bad('clip');}
      for(const instance of layer.instances){
        instances++;const mesh=book.get(instance?.meshId);triangles+=mesh?.triangles||0;
        if(!id(instance?.id)||names.has(instance.id)||!mesh||!vector(instance.matrix,16)||instance.base&&!vector(instance.base,4))return bad('instance');names.add(instance.id);
      }
    }
    if(instances>64||triangles>WINDOW_ARCHITECTURE_LIMITS.drawTrianglesPerPane)return bad('draw-budget');
    if(pane.background!=null){const a=windowMediaAsset(pane.background.assetId);if(!a||a.kind!=='video'||a.sensitivity==='clinical'||!number(pane.background.mediaTime)||pane.background.mediaTime<0||pane.background.mediaTime>1e6)return bad('background');}
  }
  return{ok:true,reason:null,catalogue:book};
}
function quaternion(m,s){
  const a=m[0]/s[0],b=m[4]/s[1],c=m[8]/s[2],d=m[1]/s[0],e=m[5]/s[1],f=m[9]/s[2],g=m[2]/s[0],h=m[6]/s[1],i=m[10]/s[2],trace=a+e+i;let q;
  if(trace>0){const t=Math.sqrt(trace+1)*2;q=[(h-f)/t,(c-g)/t,(d-b)/t,.25*t];}
  else if(a>e&&a>i){const t=Math.sqrt(Math.max(1e-10,1+a-e-i))*2;q=[.25*t,(b+d)/t,(c+g)/t,(h-f)/t];}
  else if(e>i){const t=Math.sqrt(Math.max(1e-10,1+e-a-i))*2;q=[(b+d)/t,.25*t,(f+h)/t,(c-g)/t];}
  else{const t=Math.sqrt(Math.max(1e-10,1+i-a-e))*2;q=[(c+g)/t,(f+h)/t,.25*t,(d-b)/t];}
  const n=Math.hypot(...q)||1;return q.map(v=>v/n);
}
function decomposition(m){const a=[m[0],m[1],m[2]],b=[m[4],m[5],m[6]],c=[m[8],m[9],m[10]],s=[Math.max(1e-9,Math.hypot(...a))*(dot(a,cross(b,c))<0?-1:1),Math.max(1e-9,Math.hypot(...b)),Math.max(1e-9,Math.hypot(...c))];return{t:[m[12],m[13],m[14]],s,q:quaternion(m,s)};}
function slerp(a,b,t){let d=a.reduce((s,v,k)=>s+v*b[k],0);if(d<0){b=b.map(v=>-v);d=-d;}if(d>.9995){const q=lerp(a,b,t),n=Math.hypot(...q)||1;return q.map(v=>v/n);}const angle=Math.acos(clamp(d,-1,1)),s=Math.sin(angle);return a.map((v,k)=>(v*Math.sin((1-t)*angle)+b[k]*Math.sin(t*angle))/s);}
function compose({t,s,q}){const[x,y,z,w]=q,xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,wx=w*x,wy=w*y,wz=w*z;return[(1-2*(yy+zz))*s[0],2*(xy+wz)*s[0],2*(xz-wy)*s[0],0,2*(xy-wz)*s[1],(1-2*(xx+zz))*s[1],2*(yz+wx)*s[1],0,2*(xz+wy)*s[2],2*(yz-wx)*s[2],(1-2*(xx+yy))*s[2],0,...t,1];}
function matrixBetween(a,b,t){if(t>=1)return Array.from(b);const x=decomposition(a),y=decomposition(b);return compose({t:lerp(x.t,y.t,t),s:lerp(x.s,y.s,t),q:slerp(x.q,y.q,t)});}
function cameraBetween(a,b,t){
  const rotation=c=>[...c.basis.right,0,...c.basis.up,0,...c.basis.forward.map(v=>-v),0,0,0,0,1],m=matrixBetween(rotation(a),rotation(b),t),right=unit(m.slice(0,3)),up=unit(m.slice(4,7)),forward=unit(m.slice(8,11).map(v=>-v));
  return{eye:lerp(a.eye,b.eye,t),basis:{right,up,forward},projection:Object.fromEntries(Object.keys(b.projection).map(k=>[k,mix(a.projection[k]??b.projection[k],b.projection[k],t)])),crop:Object.fromEntries(Object.keys(b.crop).map(k=>[k,mix(a.crop[k]??b.crop[k],b.crop[k],t)]))};}
const layersOf=p=>p.layers||[{id:'primary',camera:p.camera,instances:p.instances}];
function paneBetween(a,b,t){if(!a||t>=1)return b;const prior=layersOf(a),layers=layersOf(b).map((layer,k)=>{const old=prior.find(p=>p.id===layer.id)||prior[k];if(!old)return layer;const rows=new Map(old.instances.map(p=>[p.id,p]));return{...layer,camera:cameraBetween(old.camera,layer.camera,t),instances:layer.instances.map(p=>{const before=rows.get(p.id);return before&&before.meshId===p.meshId?{...p,matrix:matrixBetween(before.matrix,p.matrix,t),base:p.base&&before.base?lerp(before.base,p.base,t):p.base}:p;})};});return{...b,layers};}
export function windowArchitectureCameraMatrices(c){
  const r=c.basis.right,u=c.basis.up,f=c.basis.forward,e=c.eye,p=c.projection,q=c.crop,near=p.near,far=p.far,
    view=new Float32Array([r[0],u[0],-f[0],0,r[1],u[1],-f[1],0,r[2],u[2],-f[2],0,-dot(r,e),-dot(u,e),dot(f,e),1]),
    projection=new Float32Array([1/(p.tanHalfFov*p.aspect*q.width),0,0,0,0,1/(p.tanHalfFov*q.height),0,0,(2*q.x+q.width-1)/q.width,(1-2*q.y-q.height)/q.height,-(far+near)/(far-near),-1,0,0,-2*far*near/(far-near),0]);
  return{view,projection};
}
const vertex=`#version 300 es
in vec3 position;uniform mat4 model;uniform mat4 view;uniform mat4 projection;out vec3 world;
void main(){vec4 p=model*vec4(position,1.);world=p.xyz;gl_Position=projection*view*p;}`;
const fragment=`#version 300 es
precision highp float;in vec3 world;out vec4 outColor;uniform vec4 base;uniform sampler2D blueNoise;uniform vec2 desktopOrigin;uniform vec2 framebufferSize;uniform float dpr;uniform float coherence;uniform float negative;uniform vec4 layerClip;uniform vec2 clipEdge;uniform float clipRight;
${WINDOW_SURFACE_LOOK_GLSL}
void main(){vec3 n=normalize(cross(dFdx(world),dFdy(world)));float shade=.32+.68*abs(dot(n,normalize(vec3(.42,.74,.52))));vec3 rgb=pow(clamp(base.rgb*shade,0.,1.),vec3(1./2.2));float localX=gl_FragCoord.x/framebufferSize.x;bool leftEdge=localX<layerClip.x+clipEdge.x;bool rightEdge=localX>layerClip.x+layerClip.z-clipEdge.x;bool edge=clipRight>1.5?(leftEdge||rightEdge):clipRight>.5?rightEdge:leftEdge;if(clipEdge.x>0.&&edge)rgb*=clipEdge.y;vec2 pt=vec2(gl_FragCoord.x,framebufferSize.y-gl_FragCoord.y)/max(1.,dpr)+desktopOrigin;vec2 cell=floor(pt/CELL_PT);float rank=texture(blueNoise,(mod(cell,64.)+.5)/64.).r;float quant=texture(blueNoise,(mod(cell+vec2(23.,47.),64.)+.5)/64.).r;outColor=vec4(windowSurfaceLook(rgb,rank,quant,coherence,negative),1.);}`;
function createGpu(gl){
  const buffers=new Map();let program=null,uniforms=null;
  const compile=(kind,code)=>{const s=gl.createShader(kind);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Architecture shader');return s;};
  function initialize(){if(program)return;const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader?.(vs);gl.deleteShader?.(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Architecture link');uniforms=Object.fromEntries(['model','view','projection','base','blueNoise','desktopOrigin','framebufferSize','dpr','coherence','negative','layerClip','clipEdge','clipRight'].map(k=>[k,gl.getUniformLocation(program,k)]));}
  function clear(){for(const b of buffers.values()){gl.deleteBuffer?.(b.positions);gl.deleteBuffer?.(b.indices);gl.deleteVertexArray?.(b.vao);}buffers.clear();}
  function upload(meshes){initialize();clear();for(const mesh of meshes){const vao=gl.createVertexArray(),positions=gl.createBuffer(),indices=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,positions);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.p),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indices);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(mesh.i),gl.STATIC_DRAW);buffers.set(mesh.id,{vao,positions,indices,count:mesh.i.length,base:mesh.base||[.45,.43,.33,1]});}gl.bindVertexArray(null);}
  function draw(pane,{width,height,dpr=1,desktopOrigin={x:0,y:0},blueNoiseTexture,coherence=0,negative=0}={}){
    if(!program)return false;gl.useProgram(program);gl.viewport(0,0,width,height);gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,blueNoiseTexture);gl.uniform1i(uniforms.blueNoise,3);gl.uniform2f(uniforms.desktopOrigin,desktopOrigin.x||0,desktopOrigin.y||0);gl.uniform2f(uniforms.framebufferSize,width,height);gl.uniform1f(uniforms.dpr,dpr);gl.uniform1f(uniforms.coherence,coherence);gl.uniform1f(uniforms.negative,negative);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.clearDepth(1);
    for(const layer of layersOf(pane)){gl.disable(gl.SCISSOR_TEST);gl.clear(gl.DEPTH_BUFFER_BIT);const clip=layer.clip||{x:0,y:0,width:1,height:1};gl.uniform4fv(uniforms.layerClip,[clip.x,clip.y,clip.width,clip.height]);gl.uniform2f(uniforms.clipEdge,clip.edgeWidth||0,clip.edgeShade??.38);gl.uniform1f(uniforms.clipRight,clip.edge==='both'?2:clip.edge==='right'?1:0);if(layer.clip){gl.enable(gl.SCISSOR_TEST);gl.scissor?.(Math.round(clip.x*width),Math.round((1-clip.y-clip.height)*height),Math.ceil(clip.width*width),Math.ceil(clip.height*height));}const c=windowArchitectureCameraMatrices(layer.camera);gl.uniformMatrix4fv(uniforms.view,false,c.view);gl.uniformMatrix4fv(uniforms.projection,false,c.projection);for(const instance of layer.instances){const mesh=buffers.get(instance.meshId);if(!mesh)continue;gl.bindVertexArray(mesh.vao);gl.uniformMatrix4fv(uniforms.model,false,new Float32Array(instance.matrix));gl.uniform4fv(uniforms.base,instance.base||mesh.base);gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_INT,0);}}
    gl.bindVertexArray(null);gl.disable(gl.SCISSOR_TEST);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);return true;
  }
  return{upload,draw,dispose(){clear();if(program)gl.deleteProgram?.(program);program=null;},size:()=>buffers.size};
}
/** One existing pane context; immutable buffers, latest pose, no image readback,
 * second animation clock, extrapolation or new native-window owner. */
export function createWindowMediaArchitecture({gl=null,now=()=>globalThis.performance?.now?.()??Date.now(),surfaceId='rest:source',reducedMotion=false}={}){
  let gpu=null,catalogue=null,meshes=[],meshRevision=null,revision=0,from=null,to=null,start=0,end=0,held=false,heldPane=null,sourceSeconds=0,priorSeconds=0,error=null,uploads=0,drawFrames=0,poseUpdates=0,lastSourceSeconds=0;
  const sample=(at=now())=>{if(!to)return null;const t=held?0:clamp((at-start)/Math.max(1,end-start),0,1);return{...(held?heldPane:paneBetween(from,to,t)),sourceSeconds:held?sourceSeconds:mix(priorSeconds,sourceSeconds,t)};};
  function setGl(next){gpu?.dispose();gpu=null;gl=next;if(gl&&meshes.length){try{gpu=createGpu(gl);gpu.upload(meshes);uploads++;}catch(e){error=String(e);gpu?.dispose();gpu=null;}}}
  function update(packet,{revision:next}={}){
    if(held||!Number.isSafeInteger(next)||next<=revision||reducedMotion&&to)return false;
    if(packet?.meshRevision!==meshRevision&&!packet?.meshes)return false;
    const valid=validateWindowArchitecturePacket(packet,{catalogue:packet.meshRevision===meshRevision?catalogue:null});if(!valid.ok)return false;
    const pane=packet.panes.find(p=>p.surfaceId===surfaceId);if(!pane)return false;
    const current=sample(now());
    if(packet.meshRevision!==meshRevision){meshes=packet.meshes;catalogue=valid.catalogue;meshRevision=packet.meshRevision;setGl(gl);}
    from=current;to=pane;priorSeconds=current?.sourceSeconds??packet.sourceSeconds;sourceSeconds=packet.sourceSeconds;start=now();end=start+(current&&!reducedMotion?WINDOW_ARCHITECTURE_LIMITS.interpolationMs:0);revision=next;poseUpdates++;return true;
  }
  function hold(value=true){if(!!value===held)return;const current=sample(now());held=!!value;if(held){heldPane=current;sourceSeconds=current?.sourceSeconds??sourceSeconds;}else{from=to=current;priorSeconds=sourceSeconds=current?.sourceSeconds??sourceSeconds;start=end=now();heldPane=null;}}
  function clear(){gpu?.dispose();gpu=null;catalogue=null;meshes=[];meshRevision=null;revision=0;from=to=heldPane=null;sourceSeconds=priorSeconds=0;held=false;error=null;}
  return{update,sample,hold,setGl,clear,dispose:clear,draw(options){const pane=sample();if(!pane||!gpu)return false;try{const result=gpu.draw(pane,options);if(result){drawFrames++;lastSourceSeconds=pane.sourceSeconds;}return result;}catch(e){error=String(e);return false;}},snapshot:()=>({active:!!to,revision,meshRevision,meshes:meshes.length,held,uploads,gpuMeshes:gpu?.size()||0,drawFrames,poseUpdates,lastSourceSeconds,error})};
}
