// Finite world-space cigarette filaments. Their real triangles share prop
// depth and acquisition; no screen-facing card, new animation clock or layer.
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';
export const MISSING_MAN_SMOKE_MESH='tower_warning_inward_smoke';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=a=>{const d=Math.hypot(...a)||1;return a.map(v=>v/d);};
export function missingManSmokePoint(tip,sink,u,{clock=0,strand=0}={}){
  if(!finite(tip)||!finite(sink)||!Number.isFinite(u))return null;
  u=clamp(u,0,1);const v=1-u,span=Math.hypot(...sub(tip,sink));
  const c1=[tip[0]+.035,tip[1]+Math.min(.22,span*.42),tip[2]-.025];
  const c2=[sink[0]-.018,sink[1]-.065,sink[2]-.085];
  const p=tip.map((n,k)=>n*v*v*v+3*c1[k]*v*v*u+3*c2[k]*v*u*u+sink[k]*u*u*u);
  const curl=Math.sin(Math.PI*u)**2,phase=u*7.4-clock*.72+strand*1.7;
  p[0]+=(Math.sin(phase)*.014+Math.sin(phase*1.83+.8)*.005)*curl;
  p[2]+=Math.cos(phase*.83)*.011*curl;
  return p;
}
export function sampleMissingManSmoke({tip,sink,clock=0,engaged=false,reducedMotion=false,densityScale=1}={}){
  if(!finite(tip)||!finite(sink)||Math.hypot(...sub(tip,sink))>1.5)return[];
  clock=reducedMotion?0:Math.max(0,Number(clock)||0);
  densityScale=clamp(Number.isFinite(densityScale)?densityScale:1,0,1.4);
  const segments=[];
  // Four separated filaments advect from the ember, rise, then disappear
  // under the brim. Endpoint wrapping never draws a line through the body.
  for(let strand=0;strand<4;strand++){
    const start=((clock/4.6+strand*.257)%1+1)%1;
    for(let n=0;n<6;n++){
      const u=start+n*.045,next=u+.052;if(next>=1)continue;
      const a=missingManSmokePoint(tip,sink,u,{clock,strand}),b=missingManSmokePoint(tip,sink,next,{clock,strand});
      const envelope=Math.sin(Math.PI*u),packet=Math.sin(Math.PI*(n+.5)/6);
      segments.push({a,b,age:u,strand,width:(.008+envelope*.016)*(1-.38*u),
        density:(engaged?.66:.48)*Math.max(.12,envelope)*Math.max(.2,packet)*densityScale});
    }
  }
  return segments;
}
function segmentMatrix(a,b,width){
  const along=sub(b,a),length=Math.hypot(...along);if(length<1e-6)return null;
  const y=norm(along),x=norm(cross(y,Math.abs(y[2])<.85?[0,0,1]:[1,0,0])),z=cross(x,y);
  return[x[0]*width,x[1]*width,x[2]*width,0,along[0],along[1],along[2],0,
    z[0]*width,z[1]*width,z[2]*width,0,a[0],a[1],a[2],1];
}
export function missingManSmokeInstances(input,{zone=0}={}){
  return sampleMissingManSmoke(input).flatMap((s,index)=>{
    const matrix=segmentMatrix(s.a,s.b,s.width);if(!matrix)return[];
    return[{id:`tower-warning:smoke:${index}`,mesh:MISSING_MAN_SMOKE_MESH,
      x:s.a[0],y:s.a[1],z:s.a[2],matrix,zone,structural:false,interactive:false,blocks:false,
      noShadow:true,noReflection:false,emissive:[0,0,0,s.density]}];
  });
}
export function installMissingManSmoke(gl,pack){
  if(!gl||!pack?.catalog)return false;if(pack.catalog.has(MISSING_MAN_SMOKE_MESH))return true;
  const positions=[],normals=[],uv=[],indices=[];
  for(let plane=0;plane<3;plane++){
    const a=plane*Math.PI/3,c=Math.cos(a)*.5,s=Math.sin(a)*.5,i=positions.length/3;
    positions.push(-c,0,-s,c,0,s,-c,1,-s,c,1,s);
    for(let n=0;n<4;n++){normals.push(-Math.sin(a),0,Math.cos(a));uv.push(n%2,Math.floor(n/2));}
    indices.push(i,i+1,i+2,i+2,i+1,i+3);
  }
  const vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
  const attr=(location,data,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
  attr(0,positions,3);attr(1,normals,3);attr(2,uv,2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);const stride=PROP_INSTANCE_FLOATS*4;
  for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,stride,c*16);gl.vertexAttribDivisor(3+c,1);}
  for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride,offset);gl.vertexAttribDivisor(location,1);}
  gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
  pack.catalog.set(MISSING_MAN_SMOKE_MESH,{name:MISSING_MAN_SMOKE_MESH,
    nodeMatrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),instanceBuffer,
    extras:{missingManSmoke:true},primitives:[{vao,count:indices.length,indexType:gl.UNSIGNED_SHORT,
      base:[.11,.12,.115,1],emissive:[0,0,0],metallic:0,roughness:1,portrait:false,alphaCut:0,
      materialName:'warning_smoke',materialRole:'missing-man-smoke'}]});
  gl.bindVertexArray(null);return true;
}
