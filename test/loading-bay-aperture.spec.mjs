import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bytes=readFileSync('public/assets/conservatory-props.glb');
assert.equal(bytes.subarray(0,4).toString('ascii'),'glTF');
const jsonLength=bytes.readUInt32LE(12);
const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString('utf8'));
const binStart=20+jsonLength+8;
const mesh=gltf.meshes.find((entry)=>entry.name==='conservatory_west_elevation');
assert.ok(mesh,'west elevation is missing from the prop pack');
const canopy=gltf.meshes.find((entry)=>entry.name==='bay_canopy');
const sightlineShell=gltf.meshes.find((entry)=>entry.name==='getin_sightline_shell');
const dockAccess=gltf.meshes.find((entry)=>entry.name==='yard_dock_access');
assert.ok(canopy&&sightlineShell&&dockAccess,'loading-bay enclosure, Get-In sightline shell and pedestrian access must all be packed');

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

const meshPositions=(entry)=>entry.primitives.flatMap((primitive)=>accessorValues(primitive.attributes.POSITION));
const canopyPositions=meshPositions(canopy);
// Sample the projecting face of the shutter casing/guides. The aligned masonry
// wall begins at x=4.05, so this slice proves the gear without mixing in wall
// vertices from the same elevation.
const shutterGear=canopyPositions.filter(([x,y,z])=>x>3.84&&x<4.03&&y<4.20&&z>.5);
assert.ok(shutterGear.length,'the canopy retains its goods-door shutter guides');
const shutterMinZ=Math.min(...shutterGear.map((point)=>point[2]));
assert.ok(shutterMinZ>.9,
  `shutter gear no longer advertises a false door in the solid centre return (${shutterMinZ})`);
assert.ok(Math.max(...shutterGear.map((point)=>point[2]))>4.2,
  'shutter gear spans the canonical goods-door aperture at the south end of the bay');

const canopyBounds=(axis)=>[Math.min(...canopyPositions.map((point)=>point[axis])),Math.max(...canopyPositions.map((point)=>point[axis]))];
const [canopyMinX,canopyMaxX]=canopyBounds(0),[canopyMinY,canopyMaxY]=canopyBounds(1),[canopyMinZ,canopyMaxZ]=canopyBounds(2);
assert.ok(canopyMinX<-3.6&&canopyMaxX>4.2,'the canopy runs from the yard mouth to the real goods-door wall');
assert.ok(canopyMinZ<-4&&canopyMaxZ>4.5,'north and south return walls enclose the full loading throat');
assert.ok(canopyMinY<=0&&canopyMaxY>5.45,'the side walls and complete roof occupy the full loading-bay height');
const roofVertices=canopyPositions.filter(([,y])=>y>5.44);
assert.ok(roofVertices.length>120,'corrugated roof sheeting spans the bay instead of surviving only over the doors');

const shellPositions=meshPositions(sightlineShell);
const shellBounds=(axis)=>[Math.min(...shellPositions.map((point)=>point[axis])),Math.max(...shellPositions.map((point)=>point[axis]))];
const [shellMinX,shellMaxX]=shellBounds(0),[shellMinY,shellMaxY]=shellBounds(1),[shellMinZ,shellMaxZ]=shellBounds(2);
assert.ok(shellMinX<=4.25&&shellMaxX>20.3,'the exterior sightline shell reaches from the threshold to the far Get-In wall');
assert.ok(shellMinZ<-4.3&&shellMaxZ>7.8,'the shell includes both long Get-In walls');
assert.ok(shellMinY<=0&&shellMaxY>=5.5,'the shell includes floor and ceiling, not floating wall fragments');
assert.ok(shellPositions.filter(([x,y])=>x>20.1&&y>1).length>20,'the far Get-In wall is a substantial rendered surface');

const accessPositions=meshPositions(dockAccess);
const bounds=(axis)=>[Math.min(...accessPositions.map((point)=>point[axis])),Math.max(...accessPositions.map((point)=>point[axis]))];
const [accessMinX,accessMaxX]=bounds(0),[accessMinY,accessMaxY]=bounds(1),[accessMinZ,accessMaxZ]=bounds(2);
assert.ok(accessMinX<-1.5&&accessMaxX>2.4,'dock access mesh covers the complete four-riser run');
assert.ok(accessMinY<-.8&&accessMaxY>.9,'dock access mesh rises from yard floor to apron handrail height');
assert.ok(accessMinZ<-4&&accessMaxZ>4,'dock access mesh visibly owns both pedestrian flights');

console.log('loading-bay aperture geometry tests ok');
