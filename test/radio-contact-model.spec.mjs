import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { buildRadioContactModel, RADIO_CONTACT_BOUNDS, RADIO_CONTACT_CONTROLS, RADIO_CONTACT_STRAP_LENGTH } from '../src/render/radio-contact-model.js';

test('contact radio preserves the authored walkie silhouette and bounded physical dimensions',()=>{
  const model=buildRadioContactModel();model.group.updateMatrixWorld(true);
  const bounds=new Box3().setFromObject(model.group),size=bounds.getSize(new Vector3());
  assert.ok(size.x>.105&&size.x<.14,`width ${size.x}`);
  assert.ok(size.y>.30&&size.y<.36,`antenna/body height ${size.y}`);
  assert.ok(size.z>.065&&size.z<.10,`rear battery + face depth ${size.z}`);
  const names=[...model.group.userData.authoredPartNames];model.group.traverse(n=>names.push(n.name));
  for(const detail of ['shoulder-tapered moulded chassis','lower speaker recessed cavity','side PTT moving keycap','detented channel knob','volume and power knob','removable rear battery and lower shoe','wrist lanyard'])assert.ok(names.includes(detail),detail);
  assert.ok(!names.some(name=>/FM|MHz/.test(name)),'channel radio is not replaced with a broadcast receiver');
  const info=model.diagnostics();assert.ok(info.triangles<45000,`triangles ${info.triangles}`);assert.ok(info.draws<80,`draws ${info.draws}`);
  assert.equal(RADIO_CONTACT_BOUNDS.body.height,.18);model.dispose();
});

test('control targets follow physical travel without inheriting the renderer parent transform',()=>{
  const model=buildRadioContactModel();model.group.position.set(2,3,4);model.group.rotation.y=.4;
  model.update({ptt:0,batteryGap:0,channel:2});const atRest=structuredClone(model.controls);
  model.update({ptt:1,batteryGap:1,channel:8});
  assert.ok(Math.abs(model.controls.ptt.position[0]-atRest.ptt.position[0]-.0016)<1e-8);
  assert.ok(model.controls.battery.position[2]<atRest.battery.position[2]);
  const openZ=model.controls.battery.position[2];model.update({batteryGap:1,batteryPress:1,channel:8});
  assert.ok(model.controls.battery.position[2]>openZ);
  assert.deepEqual(model.controls.battery.position,atRest.battery.position);
  for(const control of Object.values(model.controls)){assert.ok(control.position.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...control.normal)-1)<1e-8);}
  assert.ok(Object.isFrozen(RADIO_CONTACT_CONTROLS.ptt.position));model.dispose();
});

test('dead radio cannot light a carrier or display and presentation cannot change its input frame',()=>{
  const model=buildRadioContactModel(),frame={channel:12,volume:.7,ptt:1,batteryGap:1,batteryPress:.2,carrier:'tx',dead:true,interaction:{id:'key2',pressed:true}};
  const before=structuredClone(frame);model.update(frame);
  assert.deepEqual(frame,before);assert.equal(model.parts.display.visible,false);assert.equal(model.parts.indicator.material.emissiveIntensity,0);
  assert.equal(model.diagnostics().frame.carrier,'off');
  model.update({channel:16,carrier:'rx',dead:false});assert.equal(model.parts.display.visible,true);assert.equal(model.diagnostics().channel,16);
  assert.ok(model.parts.channelKnob.rotation.y<0);
  model.update({channel:16,carrier:'off',ptt:1});assert.equal(model.parts.indicator.material.emissiveIntensity,0,'explicitly lost carrier cannot be relit by a pressed cap');model.dispose();
});

test('key legends and caps travel as one part at their actual electrical contact positions',()=>{
  const model=buildRadioContactModel(),cap=model.parts.keys[3],legend=cap.children[0];
  assert.match(legend.name,/engraved key legend 1/);const localLegend=legend.position.toArray();
  model.update({interaction:{id:'key:1',pressure:1},channel:2});assert.ok(Math.abs(cap.position.z-.0291)<1e-9);assert.deepEqual(legend.position.toArray(),localLegend);assert.ok(Math.abs(model.controls['key:1'].position[2]-.0313)<1e-9);
  model.update({interaction:{id:'key:2',pressure:1},channel:2});assert.equal(cap.position.z,.030);
  for(const id of ['confirm','select','back','previous','next','key:1','key:2','key:3','key:4','key:5','key:6','key:7','key:8','key:9','key:*','key:0','key:#'])assert.ok(model.controls[id],id);
  for(const [i,id]of['previous','next'].entries()){
    const cap=model.parts.auxiliaryKeys[i],initial=cap.position.x,anchor=model.controls[id].position[0];model.update({interaction:{id,pressure:1}});
    assert.ok(cap.position.x>initial);assert.ok(model.controls[id].position[0]>anchor);model.update({});assert.equal(cap.position.x,initial);
  }model.dispose();
});

test('hanging cloth unfolds toward the held wrist without stretching or independent animation',()=>{
  const model=buildRadioContactModel();let rest;
  for(const release of [0,.25,.5,.75,1]){
    const frame={release,strapTarget:[.072-release*.003,-.020+release*.054,.015-release*.012]};model.update(frame);
    const attr=model.parts.strapBand.geometry.attributes.position,centres=[];
    for(let i=0;i<attr.count;i+=4){const centre=new Vector3();for(let j=0;j<4;j++)centre.add(new Vector3().fromBufferAttribute(attr,i+j));centres.push(centre.multiplyScalar(.25));}
    const length=centres.slice(1).reduce((n,v,i)=>n+v.distanceTo(centres[i]),0);
    assert.ok(Math.abs(length-RADIO_CONTACT_STRAP_LENGTH)<.00002,`release ${release}: length ${length}`);
    assert.ok(centres[0].distanceTo(new Vector3(.044,-.075,-.015))<1e-7,'body attachment stays attached');
    assert.ok([...attr.array].every(Number.isFinite));
    if(!release)rest=[...attr.array];
    if(release===1)assert.ok(Math.max(...centres.map(p=>p.y))>.035,'band loops over held wrist above the dropped body');
  }
  model.update({});assert.deepEqual([...model.parts.strapBand.geometry.attributes.position.array],rest,'ordinary held loop is restored exactly');
  const held=[...model.parts.strapBand.geometry.attributes.position.array];model.update({time:100});assert.deepEqual([...model.parts.strapBand.geometry.attributes.position.array],held,'no self-running cloth clock');model.dispose();
});

test('physical LCD RX/TX marks follow actual carrier and go dark after contact loss',()=>{
  const model=buildRadioContactModel();model.update({carrier:'rx'});assert.equal(model.parts.receiveMark.visible,true);assert.equal(model.parts.transmitMark.visible,false);
  model.update({carrier:'tx'});assert.equal(model.parts.receiveMark.visible,false);assert.equal(model.parts.transmitMark.visible,true);
  model.update({carrier:'off',ptt:1});assert.equal(model.parts.receiveMark.visible,false);assert.equal(model.parts.transmitMark.visible,false);
  model.update({carrier:'tx',dead:true});assert.equal(model.parts.transmitMark.visible,false);assert.equal(model.parts.display.visible,false);model.dispose();
});

test('radio LCD electrodes sit between the substrate and cover and emit only while powered',()=>{
  const model=buildRadioContactModel(),{screen,lens,display}=model.parts;
  const electrodes=display.children.filter(part=>part.name.startsWith('LCD digit segment'));
  assert.ok(electrodes.length>0);
  assert.ok(electrodes.every(part=>part.position.z>screen.position.z&&part.position.z<lens.position.z));
  assert.ok(electrodes.some(part=>part.visible&&part.material.emissiveIntensity>0));
  assert.equal(lens.material.depthWrite,false);
  assert.ok(lens.material.transparent&&lens.material.opacity<.2);
  model.update({dead:true});
  assert.equal(screen.material.emissiveIntensity,0);
  assert.ok(electrodes.every(part=>!part.visible&&part.material.emissiveIntensity===0));
  model.dispose();
});

test('radio model disposes its owned shared geometry and materials exactly once',()=>{
  const model=buildRadioContactModel(),geometries=new Set(),materials=new Set();
  model.group.traverse(mesh=>{if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)materials.add(mesh.material);});
  let g=0,m=0;for(const resource of geometries)resource.addEventListener('dispose',()=>g++);for(const resource of materials)resource.addEventListener('dispose',()=>m++);
  model.dispose();model.dispose();model.update({ptt:1});assert.equal(g,geometries.size);assert.equal(m,materials.size);assert.equal(model.group.children.length,0);
});
