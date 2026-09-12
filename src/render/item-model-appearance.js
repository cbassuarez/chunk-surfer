// Reversible, named overrides for the shared inspection renderer. Original
// colors and poses are retained so cached models never leak one kit's finish.
import {drawRecorderReadoutCanvas} from './recorder-instrument.js';

const displays=new WeakMap();
const named=(actual,authored)=>actual===authored||
  (actual.startsWith(`${authored}_`)&&/^\d+$/.test(actual.slice(authored.length+1)));

// Measure the posed, visible object in its parent's coordinates, not through
// the inspector's orbit/scale. Repeated fit calls therefore cannot drift.
export function fitItemModelPose(THREE,model){
  if(!model)return null;
  model.updateWorldMatrix(true,true);
  const inverseParent=model.parent?model.parent.matrixWorld.clone().invert():new THREE.Matrix4();
  const bounds=new THREE.Box3(),point=new THREE.Vector3();
  model.traverseVisible(node=>{
    const geometry=node.geometry;if(!geometry)return;
    if(!geometry.boundingBox)geometry.computeBoundingBox();
    const box=geometry.boundingBox;if(!box||box.isEmpty())return;
    const matrix=new THREE.Matrix4().multiplyMatrices(inverseParent,node.matrixWorld);
    for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){
      bounds.expandByPoint(point.set(x,y,z).applyMatrix4(matrix));
    }
  });
  if(bounds.isEmpty())return null;
  const size=bounds.getSize(new THREE.Vector3());
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  model.updateWorldMatrix(false,true);
  return Math.max(size.x,size.y,size.z,1e-4);
}

export function disposeItemModelAppearance(model){
  const display=displays.get(model);if(!display)return;
  display.node.material=display.original;
  for(const[node,visible]of display.electrodes)node.visible=visible;
  display.texture?.dispose();display.material.dispose();displays.delete(model);
}

function applyRecorderDisplay(model,phosphor,textureFactory){
  const key=['faithful','amber','ice'].includes(phosphor)?phosphor:'faithful';
  let display=displays.get(model);
  if(!display){
    let node=null;const electrodes=[];
    model.traverse(part=>{
      if(named(part.name,'recorder-display-substrate')&&part.material&&!Array.isArray(part.material))node=part;
      if(named(part.name,'recorder-idle-electrodes'))electrodes.push([part,part.visible]);
    });
    if(!node||typeof textureFactory!=='function')return;
    display={node,original:node.material,material:node.material.clone(),electrodes,texture:null,key:null};
    node.material=display.material;displays.set(model,display);
  }
  if(display.key!==key&&typeof textureFactory==='function'){
    const texture=textureFactory(1332,478,(ctx,width,height)=>drawRecorderReadoutCanvas(ctx,{
      width,height,phosphor:key,counter:'00:00',mode:'monitor',meter:{db:-96},progress:0,
    }));
    if(texture){
      display.texture?.dispose();display.texture=texture;display.key=key;
      // The authored substrate keeps Three's top=v1 UVs. It is an opaque
      // optical backing; the separate GLB cover supplies the glass above it.
      texture.flipY=true;texture.needsUpdate=true;
    }
  }
  if(!display.texture)return;
  const material=display.material;
  material.color.set('#ffffff');material.map=display.texture;
  material.emissive?.set('#ffffff');material.emissiveMap=display.texture;material.emissiveIntensity=.5;
  material.transparent=false;material.opacity=1;material.depthWrite=true;material.needsUpdate=true;
  for(const[node]of display.electrodes)node.visible=false;
}

export function applyItemModelAppearance(model,{materialColors={},nodeRotations={},hiddenNodes=[],recorderPhosphor=null,textureFactory=null}={}){
  if(!model)return;
  if(!recorderPhosphor)disposeItemModelAppearance(model);
  const seen=new Set();
  model.traverse(node=>{
    if(!node.userData.inspectionBaseRotation)node.userData.inspectionBaseRotation=node.rotation.toArray();
    if(node.userData.inspectionBaseVisible===undefined)node.userData.inspectionBaseVisible=node.visible;
    node.rotation.fromArray(node.userData.inspectionBaseRotation);
    const rotation=nodeRotations[node.name];
    if(Array.isArray(rotation)&&rotation.length===3&&rotation.every(Number.isFinite))node.rotation.set(...rotation);
    // GLTFLoader suffixes duplicate authored node names (strap, strap_1).
    const hidden=hiddenNodes.some(name=>named(node.name,name));
    node.visible=node.userData.inspectionBaseVisible&&!hidden;
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      if(!material?.color||seen.has(material))continue;
      seen.add(material);
      if(!material.userData.inspectionBaseColor)material.userData.inspectionBaseColor=material.color.clone();
      material.color.copy(material.userData.inspectionBaseColor);
      const color=materialColors[material.name];
      if(typeof color==='string'&&/^#[\da-f]{6}$/i.test(color))material.color.set(color);
    }
  });
  if(recorderPhosphor)applyRecorderDisplay(model,recorderPhosphor,textureFactory);
}
