import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes=readFileSync('public/assets/conservatory-props.glb');
assert.equal(bytes.subarray(0,4).toString('ascii'),'glTF');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
const binStart=20+jsonLength+8;
const mesh=gltf.meshes.find((entry)=>entry.name==='conservatory_west_elevation');
assert.ok(mesh,'west elevation is missing from the prop pack');

const componentBytes={5121:1,5123:2,5125:4,5126:4};
function accessorValues(index){
  const accessor=gltf.accessors[index],view=gltf.bufferViews[accessor.bufferView];
  const width=accessor.type==='VEC3'?3:1;
  const componentSize=componentBytes[accessor.componentType];
  const stride=view.byteStride||componentSize*width;
  const offset=binStart+(view.byteOffset||0)+(accessor.byteOffset||0);
  const out=[];
  for(let i=0;i<accessor.count;i++){
    const at=offset+i*stride,row=[];
    for(let c=0;c<width;c++){
      const p=at+c*componentSize;
      row.push(accessor.componentType===5126?bytes.readFloatLE(p)
        :accessor.componentType===5125?bytes.readUInt32LE(p)
        :accessor.componentType===5123?bytes.readUInt16LE(p)
        :bytes.readUInt8(p));
    }
    out.push(width===1?row[0]:row);
  }
  return out;
}

function pointInTriangle(py,pz,a,b,c){
  const cross=(u,v,w)=>(v[2]-u[2])*(w[1]-u[1])-(v[1]-u[1])*(w[2]-u[2]);
  const p=[0,py,pz],d1=cross(a,b,p),d2=cross(b,c,p),d3=cross(c,a,p);
  const hasNeg=d1<-.0001||d2<-.0001||d3<-.0001;
  const hasPos=d1>.0001||d2>.0001||d3>.0001;
  return !(hasNeg&&hasPos);
}

function westFaceBlocks(y,z){
  for(const primitive of mesh.primitives){
    const positions=accessorValues(primitive.attributes.POSITION);
    const indices=accessorValues(primitive.indices);
    for(let i=0;i<indices.length;i+=3){
      const triangle=[positions[indices[i]],positions[indices[i+1]],positions[indices[i+2]]];
      const xs=triangle.map((point)=>point[0]);
      if(Math.max(...xs)-Math.min(...xs)>.0001)continue;
      if(xs[0]<-1.0||xs[0]>.7)continue;
      if(pointInTriangle(y,z,...triangle))return true;
    }
  }
  return false;
}

const blocked=[];
for(const z of[-3.2,0,2.8])for(const y of[.5,2.5,5.0]){
  if(westFaceBlocks(y,z))blocked.push({y,z});
}
assert.deepEqual(blocked,[],`bay mouth contains blocking west faces: ${JSON.stringify(blocked)}`);
assert.equal(westFaceBlocks(6.0,0),true,'the authored lintel must still close the head of the opening');

console.log('loading-bay aperture geometry tests ok');
