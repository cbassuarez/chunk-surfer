// Four sparse, still tears in the space revealed behind a false Ellery door.
// Their vertices are local to the doorway; each shown copy is rigidly fixed
// to that particular Source-facing opening and never changes collision.
import {sourceAmbientFaultGeometry} from './source-ambient-fault-geometry.js';
import {sourceContinuationMeshPayload} from './source-continuation-renderer.js';
import {sourcePrintMaps,SOURCE_PRINT_SURFACE} from './physical-source-print.js';
import {PROP_INSTANCE_FLOATS,PROP_INSTANCE_BINDINGS} from './prop-instance-layout.js';

export const SOURCE_FALSE_RETURN_FAULT_SITES=Object.freeze([
  Object.freeze({id:'beyond-door',x:0,y:2,z:2.6,count:4,spreadX:.55,spreadY:1.8,spreadZ:1,seed:621,size:1.2}),
]);
const library=sourceAmbientFaultGeometry({sites:SOURCE_FALSE_RETURN_FAULT_SITES,palettePrefix:'source-false-return-fault'});
export const SOURCE_FALSE_RETURN_FAULT_MESHES=Object.freeze(library.map(p=>p.name));
const payloads=new Map(library.map(p=>[p.name,sourceContinuationMeshPayload(p)]));
export function sourceFalseReturnFaultLibrary(){return library;}
export function sourceFalseReturnFaultCenter(name){return payloads.get(name)?.bounds.center;}

export function installSourceFalseReturnFaultMeshes(gl,pack,{maps=null}={}){
  if(!gl||!pack?.catalog)return false;
  let printed=maps;
  for(const piece of library){
    if(pack.catalog.has(piece.name))continue;
    const data=payloads.get(piece.name),vao=gl.createVertexArray(),instanceBuffer=gl.createBuffer();gl.bindVertexArray(vao);
    const bind=(location,values,size)=>{gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};
    bind(0,data.positions,3);bind(1,data.normals,3);bind(2,data.uvs,2);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,data.indices,gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);
    for(let c=0;c<4;c++){gl.enableVertexAttribArray(3+c);gl.vertexAttribPointer(3+c,4,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,c*16);gl.vertexAttribDivisor(3+c,1);}
    for(const[location,size,offset]of PROP_INSTANCE_BINDINGS){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,PROP_INSTANCE_FLOATS*4,offset);gl.vertexAttribDivisor(location,1);}
    gl.disableVertexAttribArray(8);gl.vertexAttrib1f(8,0);
    const silver=piece.palette==='silver';if(silver&&!printed)printed=sourcePrintMaps(gl,'divide');
    pack.catalog.set(piece.name,{name:piece.name,nodeMatrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),instanceBuffer,
      extras:{sourceFalseReturnFault:true,triangles:data.triangles,bounds:{min:data.bounds.min.map((v,k)=>v-data.bounds.center[k]),max:data.bounds.max.map((v,k)=>v-data.bounds.center[k])}},
      primitives:[{vao,count:data.indices.length,indexType:gl.UNSIGNED_INT,nativeReceiverGeometry:Object.freeze({positions:data.positions,normals:data.normals,uvs:data.uvs,indices:data.indices}),
        base:piece.base,emissive:piece.emissive,texture:silver?printed.texture:null,normalTexture:silver?printed.normalTexture:null,ormTexture:silver?printed.ormTexture:null,
        letteringFinish:silver?printed.letteringFinish:null,sourceCodeStock:silver?printed.sourceCodeStock:undefined,printedSurface:silver?SOURCE_PRINT_SURFACE:null,
        metallic:0,roughness:1,materialFactors:'gltf',aoStrength:0,portrait:false,alphaCut:0,materialName:`false-return fixed ${piece.palette} tear`,materialRole:piece.materialRole}]});
  }
  gl.bindVertexArray(null);return SOURCE_FALSE_RETURN_FAULT_MESHES;
}
