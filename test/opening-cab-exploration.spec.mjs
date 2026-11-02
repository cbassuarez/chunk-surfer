import test from 'node:test';
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';
import {Ray,Vector3,Matrix4} from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OPENING_CAB_DRIVER_DOOR,OPENING_CAB_VISIBLE_OBJECTS,OPENING_CAB_PAPERS,OPENING_CAB_REHEARSAL_NOTES} from '../src/data/opening-cab-objects.js';
import {OPENING_CAB_GEOMETRY} from '../src/data/opening-cab-object-geometry.js';
import {OPENING_VEHICLE,openingVehiclePoint,openingVehicleInstances} from '../src/data/opening-vehicle.js';
import {openingCabDoorTarget,openingCabFocus,openingCabTargets,openingCabInstances,openingCabInspectionModel,makeOpeningCabInspectionScene} from '../src/game/opening-cab-inspection.js';
import {paperAssetProbe,paperPageAsset} from '../src/game/paper-assets.js';

const aim=(frame,point)=>{const dx=point.x-frame.eye.x,dz=point.z-frame.eye.z;return{...frame,
  yaw:Math.atan2(dx,-dz),pitch:Math.atan2(point.y-frame.eye.y,Math.hypot(dx,dz))};};

test('the only cab exit target is the real recessed release lever, follows the van and remains available without optional dressing',()=>{
  assert.equal(openingCabDoorTarget(null),null);
  for(const yaw of[0,Math.PI/2,-1.1,Math.PI]){
    const anchor={x:16,y:.4,z:8,yaw},eye=openingVehiclePoint(anchor,OPENING_VEHICLE.eye),door=openingCabDoorTarget(anchor),
      frame=aim({phase:'parked',anchor,eye},door.position);
    assert.equal(door.id,'driver-door');assert.deepEqual(door.meshIds,['opening_drive_cabin_door_r']);
    const turn=Math.atan2(Math.sin(frame.yaw-yaw),Math.cos(frame.yaw-yaw));
    assert.ok(Math.abs(turn)<2.4&&frame.pitch>=-1.2&&frame.pitch<=.75);
    for(const ready of[true,false]){
      const hit=openingCabFocus(frame,{ready});assert.equal(hit?.type,'exit');assert.equal(hit.id,door.id);
      assert.deepEqual(hit.position,door.position);assert.ok(hit.distance>0&&hit.distance<.8);
      assert.equal(openingCabFocus({...frame,yaw:frame.yaw+.4},{ready}),null);
      assert.equal(openingCabFocus({...frame,phase:'driving'},{ready}),null);
    }
  }
});

test('aiming at the canonical handle first hits the actual zinc release lever in the shipped cabin, not empty air or a window crank',async()=>{
  const doc=await new NodeIO().read(new URL('../public/assets/source-vehicle-interior.glb',import.meta.url).pathname),
    eye=new Vector3(...OPENING_VEHICLE.eye),end=new Vector3(...OPENING_CAB_DRIVER_DOOR.point),
    ray=new Ray(eye,end.clone().sub(eye).normalize());let nearest=null;
  for(const mesh of doc.getRoot().listMeshes())if(['opening_drive_cabin','opening_drive_cabin_door_r'].includes(mesh.getName())){
    for(const primitive of mesh.listPrimitives()){
      const p=primitive.getAttribute('POSITION'),ids=primitive.getIndices().getArray();
      for(let i=0;i<ids.length;i+=3){
        const hit=ray.intersectTriangle(...[0,1,2].map(k=>new Vector3(...p.getElement(ids[i+k],[]))),false,new Vector3());
        if(hit&&(!nearest||hit.distanceTo(eye)<nearest.distance))nearest={mesh:mesh.getName(),
          material:primitive.getMaterial().getName(),distance:hit.distanceTo(eye),point:hit.toArray()};
      }
    }
  }
  assert.ok(nearest);assert.equal(nearest.mesh,'opening_drive_cabin_door_r');
  assert.equal(nearest.material,'worn formed edges / zinc');
  assert.ok(nearest.distance<.6&&nearest.distance>0);
  nearest.point.forEach((value,k)=>assert.ok(value>=OPENING_CAB_DRIVER_DOOR.bounds.min[k]&&value<=OPENING_CAB_DRIVER_DOOR.bounds.max[k]));
  assert.ok(nearest.point[2]>.20,'the release lever is behind the separate forward window-winder assembly');
});

test('the cab presents seven connected belongings while preparation equipment remains absent from both rendered props and focus',()=>{
  const ids=['job-papers','notebook','self-check','practice-note','first-take-note','recital-programme','radio'];
  assert.deepEqual(OPENING_CAB_VISIBLE_OBJECTS.map(object=>object.id),ids);
  for(const yaw of[0,Math.PI/2,-1.1,Math.PI]){
    const anchor={x:16,y:.2,z:8,yaw},eye=openingVehiclePoint(anchor,OPENING_VEHICLE.eye),props=openingCabInstances(anchor),targets=openingCabTargets(anchor);
    assert.deepEqual(targets.map(object=>object.id),ids);assert.equal(props.length,7);
    assert.ok(props.every(p=>!['case','recorder','headphones','microphone','flashlight','amp'].includes(p.objectId)));
    for(const target of targets){
      const frame=aim({phase:'parked',anchor,eye},target.position),focus=openingCabFocus(frame);
      assert.equal(focus?.id,target.id,target.id+' has a separate reachable sightline');
      const relative=Math.atan2(Math.sin(frame.yaw-yaw),Math.cos(frame.yaw-yaw));assert.ok(Math.abs(relative)<2.4&&frame.pitch>=-1.2&&frame.pitch<=.75);
      assert.equal(openingCabFocus({...frame,phase:'driving'}),null);
      assert.equal(openingCabFocus(frame,{ready:false})?.id||null,target.id==='radio'?'radio':null,
        'the dashboard radio belongs to the resident vehicle, not the optional belongings pack');
    }
  }
});

test('each new close-reading has a real immutable baked page, and inspecting never accepts the work or acquires belongings',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/assets/opening-cab/papers.json',import.meta.url),'utf8'));
  for(const id of['practice-note','first-take-note','recital-programme']){
    const before={flags:{},journal:[],recordist:{}},original=JSON.stringify(before),m=openingCabInspectionModel(before,id),
      record=manifest.papers.find(p=>p.id===m.document.id),asset=paperPageAsset(m.document);
    assert.ok(m.document.body.length>0);assert.equal(m.workOrder,null);assert.equal(m.accepted,false);
    assert.equal(paperAssetProbe(m.document).resolved,true);assert.ok(record&&asset);assert.equal(asset.path,record.path);
    const bytes=readFileSync(new URL('../public/'+record.path,import.meta.url));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256);
    let read=null,closed=0;
    const scene=makeOpeningCabInspectionScene({id,getState:()=>before,onClose:()=>closed++,makeReader:(doc)=>{read=doc;return{enter(){},view:()=>({reading:false}),key(){},render(){},update(){}};}});
    scene.enter();assert.equal(read.id,m.document.id);scene.key({code:'KeyE'});assert.equal(closed,1);
    assert.equal(JSON.stringify(before),original);
  }
  assert.equal(OPENING_CAB_PAPERS.some(paper=>/Sarah|Lyle|\b20\d\d\b/.test(paper.body.join(' '))),false,'no invented names, reactions or recital date');
});

test('the notebook contains rehearsal material on a fresh run and the radio reports only real supplied playback state',()=>{
  const notes=openingCabInspectionModel({journal:[]},'notebook');
  assert.deepEqual(notes.rehearsalNotes,OPENING_CAB_REHEARSAL_NOTES);assert.ok(notes.rehearsalNotes.some(line=>/marimba/.test(line)));
  assert.deepEqual(notes.notes,[]);
  assert.equal(openingCabInspectionModel({},'radio').radio.on,null);
  const state={cabRadio:{on:true,playing:true,station:'MUSIC',programme:'Chamber recital',volume:.42}},before=JSON.stringify(state),radio=openingCabInspectionModel(state,'radio');
  assert.deepEqual(radio.radio,{on:true,playing:true,station:'MUSIC',programme:'Chamber recital',volume:42,selectedStation:'',stations:[]});
  assert.equal(JSON.stringify(state),before);assert.equal(radio.readOnly,false);
});

test('new cab objects are actual visible surfaces in the resident geometry with bounded draw submissions',async()=>{
  const io=new NodeIO(),cabin=await io.read(new URL('../public/assets/source-vehicle-interior.glb',import.meta.url).pathname),
    pack=await io.read(new URL('../public/assets/opening-cab-objects.glb',import.meta.url).pathname),anchor={x:0,y:0,z:0,yaw:0},at=openingVehiclePoint(anchor,OPENING_VEHICLE.eye),eye=new Vector3(at.x,at.y,at.z),
    names=new Set(openingCabInstances(anchor).map(p=>p.mesh)),triangles=[],models=new Map([cabin,pack].flatMap(doc=>doc.getRoot().listMeshes().map(mesh=>[mesh.getName(),mesh])));
  for(const instance of[...openingVehicleInstances(anchor),...openingCabInstances(anchor)]){
    const mesh=models.get(instance.mesh);if(!mesh)continue;
    const matrix=new Matrix4().fromArray(instance.matrix);
    for(const primitive of mesh.listPrimitives()){
      const p=primitive.getAttribute('POSITION'),ids=primitive.getIndices().getArray();
      for(let i=0;i<ids.length;i+=3)triangles.push({mesh:mesh.getName(),points:[0,1,2].map(k=>new Vector3(...p.getElement(ids[i+k],[])).applyMatrix4(matrix))});
    }
  }
  for(const target of openingCabTargets(anchor).filter(object=>object.id!=='job-papers')){
    const end=new Vector3(target.position.x,target.position.y,target.position.z),ray=new Ray(eye,end.clone().sub(eye).normalize());let nearest=null;
    for(const row of triangles){const hit=ray.intersectTriangle(...row.points,false,new Vector3());if(hit&&(!nearest||hit.distanceTo(eye)<nearest.distance))nearest={mesh:row.mesh,distance:hit.distanceTo(eye)};}
    assert.ok(nearest);assert.ok(target.meshIds.includes(nearest.mesh),target.id+' is occluded by '+nearest.mesh);
  }
  const shown=OPENING_CAB_GEOMETRY.meshes.filter(mesh=>names.has(mesh.mesh));
  assert.ok(shown.reduce((sum,mesh)=>sum+mesh.triangles,0)<1500);
  for(const mesh of shown.filter(m=>/note$|programme$|clipboard$/.test(m.mesh)))assert.ok(mesh.primitives<=3,mesh.mesh+' must merge strokes into bounded material submissions');
});
