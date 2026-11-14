// Puts hand-built {p,i,base,...} meshes into the resident prop pack. Flat-shaded
// from winding unless a piece carries its own per-vertex normals in `n`.
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';

const identity=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
export const proceduralMeshBounds=piece=>{
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let k=0;k<piece.p.length;k+=3)for(let n=0;n<3;n++){min[n]=Math.min(min[n],piece.p[k+n]);max[n]=Math.max(max[n],piece.p[k+n]);}
  return{min,max};
};
function meshPayload(piece){
  const positions=[],normals=[],uvs=[];
  for(let at=0;at<piece.i.length;at+=3){
    const ids=[piece.i[at],piece.i[at+1],piece.i[at+2]],[a,b,c]=ids.map(id=>piece.p.slice(id*3,id*3+3)),u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]),
      n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n)||1;
    [a,b,c].forEach((point,k)=>{
      positions.push(...point);uvs.push(...(piece.uv?piece.uv.slice(ids[k]*2,ids[k]*2+2):[point[0],point[2]]));
      if(piece.n)normals.push(...piece.n.slice(ids[k]*3,ids[k]*3+3));else normals.push(n[0]/length,n[1]/length,n[2]/length);
    });
  }
  return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:Uint32Array.from({length:positions.length/3},(_,k)=>k)};
}
export function installProceduralMeshes(gl,pack,pieces){
  if(!gl||!pack?.catalog)return false;
  for(const piece of pieces){
    if(pack.catalog.has(piece.name))continue;
    const d=meshPayload(piece),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    for(const[location,data,size]of[[0,d.positions,3],[1,d.normals,3],[2,d.uvs,2]]){gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);}
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,d.indices,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    for(let col=0;col<4;col++){gl.enableVertexAttribArray(3+col);gl.vertexAttribPointer(3+col,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,col*16);gl.vertexAttribDivisor(3+col,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
    gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:identity(),instanceBuffer,extras:{procedural:true,triangles:d.indices.length/3,bounds:proceduralMeshBounds(piece)},primitives:[{vao,count:d.indices.length,indexType:gl.UNSIGNED_INT,base:piece.base,emissive:piece.emissive||[0,0,0],materialFactors:'gltf',metallic:piece.metallic||0,roughness:piece.roughness,aoStrength:1,portrait:false,alphaCut:0,materialName:piece.name,materialRole:piece.materialRole,nativeReceiverGeometry:d}]});
  }
  gl.bindVertexArray(null);return true;
}
