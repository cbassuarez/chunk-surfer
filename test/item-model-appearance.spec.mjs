import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyItemModelAppearance,disposeItemModelAppearance,fitItemModelPose} from '../src/render/item-model-appearance.js';
import {itemPortrait} from '../src/data/item-portraits.js';
import {fieldKitInspection} from '../src/game/field-kit.js';
import {normalizeEquipment} from '../src/game/bag-model.js';
import {recorderAppearance} from '../src/render/recorder-instrument.js';

test('shared inspector restores original colors and lid pose between equipment owners',()=>{
  const root=new THREE.Group(),lid=new THREE.Group();lid.name='open-lid-hinge';lid.rotation.x=-.31;root.add(lid);
  const mat=new THREE.MeshStandardMaterial({color:'#232929'});mat.name='flashlight-housing';
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(),mat);lid.add(mesh);
  const strap=new THREE.Object3D();strap.name='lid-retaining-strap';root.add(strap);
  const secondStrap=strap.clone();secondStrap.name='lid-retaining-strap_1';root.add(secondStrap);
  const original=mat.color.getHex();
  applyItemModelAppearance(root,{materialColors:{'flashlight-housing':'#d8d0b9'},nodeRotations:{'open-lid-hinge':[Math.PI/2,0,0]},hiddenNodes:['lid-retaining-strap']});
  assert.equal(mat.color.getHexString(),'d8d0b9');assert.equal(lid.rotation.x,Math.PI/2);assert.equal(strap.visible,false);
  assert.equal(secondStrap.visible,false);
  applyItemModelAppearance(root);
  assert.equal(mat.color.getHex(),original);assert.equal(lid.rotation.x,-.31);assert.equal(strap.visible,true);
  assert.equal(secondStrap.visible,true);
  applyItemModelAppearance(root,{materialColors:{'flashlight-housing':'not a color'},nodeRotations:{'open-lid-hinge':[NaN,0,0]}});
  assert.equal(mat.color.getHex(),original);assert.equal(lid.rotation.x,-.31);
  mesh.geometry.dispose();mat.dispose();
});

test('selected flashlight resolves its own shipped model without changing combat identity',()=>{
  for(const variant of ['reference','throw','flood']){
    const entry={id:'gear:light',sourceId:'light',source:{modelId:`flashlight-${variant}`}};
    assert.equal(itemPortrait(entry).id,`flashlight-${variant}`);
    assert.equal(entry.sourceId,'light');
  }
  assert.equal(itemPortrait({id:'light',modelId:'https://invalid.example/model.glb'}).id,'light');
});

test('ordinary recorder inspection carries the same chosen metal, legend and key pigments as the bench',()=>{
 const kit={cosmetics:{faceplate:'black',buttons:'signal',vfd:'amber'}};
 const details=fieldKitInspection(kit,'recorder'),entry=normalizeEquipment({...details,present:true});
 assert.equal(entry.sourceId,'recorder');assert.equal(itemPortrait(entry).model,'assets/items/field-recorder.glb');
 assert.equal(entry.source.recorderPhosphor,'amber');
 assert.deepEqual(entry.source.materialColors,{
  'recorder-faceplate':'#242b2d','recorder-ink':'#d7d9bd',
  'recorder-button-rec':'#bc6b57','recorder-button-stop':'#729aa9','recorder-button-takes':'#d0bc64',
 });
 const aluminum=fieldKitInspection({},'recorder');
 assert.equal(aluminum.materialColors['recorder-ink'],'#28312b');
 assert.equal(aluminum.recorderPhosphor,'faithful');
 const root=new THREE.Group();
 for(const name of Object.keys(details.materialColors)){
  const material=new THREE.MeshStandardMaterial({color:'#111111'});material.name=name;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
 }
 applyItemModelAppearance(root,details);
 root.traverse(node=>{if(node.material){assert.equal(`#${node.material.color.getHexString()}`,details.materialColors[node.material.name]);node.material.dispose();node.geometry.dispose();}});
});

test('inspection VFD uses one bounded opaque substrate texture, changes phosphor and restores resources on close',()=>{
 const root=new THREE.Group(),original=new THREE.MeshStandardMaterial({color:'#14251c'});
 const substrate=new THREE.Mesh(new THREE.PlaneGeometry(),original);substrate.name='recorder-display-substrate';root.add(substrate);
 const electrodes=new THREE.Group();electrodes.name='recorder-idle-electrodes_1';root.add(electrodes);
 const before=recorderAppearance(),textures=[];let disposed=0;
 const textureFactory=(width,height,draw)=>{
  assert.equal(width,1332);assert.equal(height,478);assert.equal(typeof draw,'function');
  const texture=new THREE.Texture();texture.addEventListener('dispose',()=>disposed++);textures.push(texture);return texture;
 };
 applyItemModelAppearance(root,{recorderPhosphor:'amber',textureFactory});
 const material=substrate.material;
 assert.notEqual(material,original);assert.equal(textures.length,1);assert.equal(electrodes.visible,false);
 assert.equal(material.map,textures[0]);assert.equal(material.emissiveMap,textures[0]);assert.equal(material.transparent,false);
 assert.equal(material.opacity,1);assert.equal(material.depthWrite,true);assert.equal(textures[0].flipY,true);
 applyItemModelAppearance(root,{recorderPhosphor:'amber',textureFactory});
 assert.equal(textures.length,1,'reapplying appearance does not allocate another display');
 applyItemModelAppearance(root,{recorderPhosphor:'ice',textureFactory});
 assert.equal(textures.length,2);assert.equal(disposed,1);assert.equal(material.map,textures[1]);
 assert.deepEqual(recorderAppearance(),before,'inspection never changes the carried recorder appearance singleton');
 disposeItemModelAppearance(root);disposeItemModelAppearance(root);
 assert.equal(disposed,2);assert.equal(substrate.material,original);assert.equal(electrodes.visible,true);
 assert.equal(original.map,null,'cached authored substrate is restored');
 applyItemModelAppearance(root,{recorderPhosphor:'faithful',textureFactory});
 applyItemModelAppearance(root);
 assert.equal(disposed,3);assert.equal(substrate.material,original);assert.equal(electrodes.visible,true);
 substrate.geometry.dispose();original.dispose();
});

test('posed case framing excludes hidden straps and remains centered through cached close/open transitions',()=>{
 const parent=new THREE.Group();parent.position.set(3,5,7);parent.scale.setScalar(2.7);parent.rotation.set(.2,.5,.1);
 const root=new THREE.Group();parent.add(root);
 const base=new THREE.Mesh(new THREE.BoxGeometry(2,.5,1.5),new THREE.MeshBasicMaterial());base.position.y=.25;root.add(base);
 const lid=new THREE.Group();lid.name='open-lid-hinge';lid.position.set(0,.5,-.75);lid.rotation.x=-.31;root.add(lid);
 const shell=new THREE.Mesh(new THREE.BoxGeometry(2,1.5,.1),new THREE.MeshBasicMaterial());shell.position.set(0,.75,-.05);lid.add(shell);
 const strap=new THREE.Mesh(new THREE.BoxGeometry(.1,1,.1),new THREE.MeshBasicMaterial());strap.name='lid-retaining-strap_1';strap.position.y=20;root.add(strap);
 const close=()=>applyItemModelAppearance(root,{nodeRotations:{'open-lid-hinge':[Math.PI/2,0,0]},hiddenNodes:['lid-retaining-strap']});
 close();assert.ok(Math.abs(fitItemModelPose(THREE,root)-2)<1e-8);
 const closedPosition=root.position.clone();assert.ok(Math.abs(closedPosition.y+.3)<1e-8);
 for(let i=0;i<8;i++){close();fitItemModelPose(THREE,root);assert.ok(root.position.distanceTo(closedPosition)<1e-8,'parent orbit and zoom do not create cumulative fit drift');}
 applyItemModelAppearance(root,{hiddenNodes:['lid-retaining-strap']});fitItemModelPose(THREE,root);
 assert.ok(root.position.distanceTo(closedPosition)>.1,'open lid receives its own center');
 close();fitItemModelPose(THREE,root);assert.ok(root.position.distanceTo(closedPosition)<1e-8);
 for(const mesh of[base,shell,strap]){mesh.geometry.dispose();mesh.material.dispose();}
});
