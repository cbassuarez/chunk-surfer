import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {PUB_CHARACTER_DESIGNS as DESIGNS,PUB_CHARACTER_MESHES,PUB_HELD_PROP_MESHES,PUB_DRINK_SHAPES,pubCharacterPerformance,pubCharacterPose,pubCharacterDescriptor,pubCharacterInstances,pubSeatedVigilPose} from '../src/render/pub-character-performance.js';
import {VIGIL_CHARACTER_RIGS} from '../src/data/vigil-character-rigs.js';
import {vigilCharacterPose} from '../src/render/vigil-character-performance.js';
import {PUB_NEW_ACTORS} from '../src/data/pub-population.js';
import {pubServiceDrinks} from '../src/render/pub-service-presentation.js';
import {buildPubInterior,PUB_INTERIOR_LAYOUT as layout} from '../tools/chunk_surfer/pub-interior-geometry.mjs';
import {pubLocalFromWorld} from '../src/data/exterior-pub.js';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url)),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const receipt=JSON.parse(read('public/assets/pub-characters.credits.json')),bytes=read('public/assets/pub-characters.glb'),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));
assert.equal(asset.entries.length,7);assert.deepEqual(asset.entries.map(e=>e.name),PUB_CHARACTER_MESHES);assert.equal(asset.nodes.length,115,'two shared anatomical rigs keep the isolated pack within the renderer node limit');assert.ok(bytes.length<10*1024*1024);
for(const pack of receipt.packs){const bytes=read(pack.file);assert.equal(sha(bytes),pack.sha256);assert.equal(bytes.length,pack.bytes);}
for(const[file,digest]of Object.entries(receipt.sourceSha256))assert.equal(sha(read(file)),digest,'rebuild pub pack after its owned source changes: '+file);
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const faces=[],bounds={};let vertices=0,samples=0;
for(const[id,d]of Object.entries(DESIGNS)){
  const entry=asset.entries.find(e=>e.name===d.mesh),meta=asset.json.meshes.find(m=>m.name===d.mesh).extras;
  assert.equal(entry.skin.joints.length,54);assert.equal(meta.anatomical,true);assert.deepEqual(meta.forward,[0,0,-1]);assert.ok(!meta.parts.some(p=>/umbrella|map|photograph|folder|attendance ledger|shoulder cape/.test(p)),'new ordinary patrons carry pub objects and clothing');
  const skin=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='skin'),hair=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='hair');assert.ok(skin?.vertexCount>3000);assert.ok(hair?.vertexCount>250);faces.push(sha(Buffer.from(skin.positions.buffer,skin.positions.byteOffset,skin.positions.byteLength)));
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const timeSec of[0,1.7,8.4]){
    const pose=pubCharacterPose(id,{timeSec,reducedMotion:true,seatY:Number.isFinite(d.seatY)?d.seatY-.012:undefined}),gpu=sampleCharacterPose(asset,entry,{joints:pose.joints});assert.ok([...gpu.bones].every(Number.isFinite));samples++;
    for(const contact of pose.contacts)assert.ok(contact.error<1e-4,id+' all anatomical '+contact.kind+' contacts remain reachable '+contact.error);
    if(Number.isFinite(d.seatY))for(const c of pose.contacts.filter(c=>c.kind==='seat')){assert.equal(c.seatY,d.seatY-.012);assert.ok(c.knee[2]<-.30);assert.ok(Math.abs(c.ankle[1]-(d.stance==='stool'?.343:((d.source==='male'?.072566-.00244:.078185-.00917)*pose.scale[1]+.0015)))<.002);}
    if(timeSec)continue;
    for(const p of entry.primitives)for(const v of new Set(p.indices)){for(let axis=0;axis<3;axis++){let q=0;for(let k=0;k<4;k++){const j=p.joints[v*4+k]*16,w=p.weights[v*4+k];q+=w*(gpu.bones[j+axis]*p.positions[v*3]+gpu.bones[j+axis+4]*p.positions[v*3+1]+gpu.bones[j+axis+8]*p.positions[v*3+2]+gpu.bones[j+axis+12]);}q*=pose.scale[axis];assert.ok(Number.isFinite(q)&&Math.abs(q)<2.5);min[axis]=Math.min(min[axis],q);max[axis]=Math.max(max[axis],q);}vertices++;}
  }
  assert.ok(max[0]-min[0]<.73,'compact held elbows fit the patron seat envelope');assert.ok(max[2]-min[2]<(d.stance==='stool'?1:.80),id+' keeps a compact envelope while reaching its actual table or counter');assert.ok(min[1]>-.012,'feet cannot sink through the parquet');
  if(d.wardrobe==='apron'){assert.ok(!meta.parts.some(p=>/polishing cloth|polishing tumbler/.test(p)),'held props have independent static instances instead of being baked into the body');assert.ok(min[2]>-.56&&max[2]<.24,'bartender back remains clear of the back bar');}
  if(Number.isFinite(d.seatY))assert.ok(max[1]<d.height+.02,'seated patrons cannot remain standing on their chairs');
  bounds[id]={min,max};
}
assert.equal(new Set(faces).size,7,'each new occupant keeps a different anatomical face rather than a repeated cloned donor');
const reduced=pubCharacterDescriptor('pub-patron-ed',{timeSec:0,reducedMotion:true}),reducedLater=pubCharacterDescriptor('pub-patron-ed',{timeSec:200,reducedMotion:true});assert.deepEqual(reduced,reducedLater);assert.equal(pubCharacterDescriptor('missing'),null);
const instance=pubCharacterInstances([{id:'pub-patron-mavis',x:2,y:.132,z:4,yaw:Math.PI/2,seatY:.503}],{reducedMotion:true})[0];assert.equal(instance.mesh,'pub_patron_mavis');assert.deepEqual([...instance.matrix.slice(12,15)],[2,Math.fround(.132),4]);assert.ok(instance.character.joints.pub_female_pelvis);
for(const actor of PUB_NEW_ACTORS){const [instance]=pubCharacterInstances([actor],{reducedMotion:true});assert.equal(instance.y,actor.floor,'district actor.y is horizontal; physical floor owns vertical placement');if(Number.isFinite(actor.seatHeight))assert.deepEqual(instance.character,pubCharacterDescriptor(actor.id,{reducedMotion:true,seatY:actor.seatHeight-.012}));}
const original=vigilCharacterPose('malcolm',{reducedMotion:true}),seated=pubSeatedVigilPose('vigil_malcolm_vey',null,{seatY:.8205,reducedMotion:true}),rig=VIGIL_CHARACTER_RIGS.malcolm,delta=.8205+.09-rig.find(b=>b.name==='pelvis').head[1];assert.ok(seated);assert.equal(pubSeatedVigilPose('missing'),null);
for(const name of['hand_L','hand_R','object']){const key='vigil_malcolm_'+name;assert.deepEqual(seated.joints[key].rotation,original.joints[key].rotation);assert.ok(Math.abs(seated.joints[key].translation[1]-original.joints[key].translation[1]-delta)<1e-8,'seated map and hands move together');}
for(const c of seated.contacts.filter(c=>c.kind==='seat'))assert.ok(c.error<1e-5&&Math.abs(c.ankle[1]-.343)<1e-6);
assert.deepEqual(pubSeatedVigilPose('vigil_part_malcolm_map',null,{reducedMotion:true}).joints,seated.joints,'the map part and seated body use the same pose');
const propsBytes=read('public/assets/pub-quest-props.glb'),view=new DataView(propsBytes.buffer,propsBytes.byteOffset,propsBytes.byteLength),json=JSON.parse(new TextDecoder().decode(propsBytes.subarray(20,20+view.getUint32(12,true))));assert.deepEqual(json.meshes.map(m=>m.name),['pub_service_tray_loaded','pub_service_tray_empty','pub_service_tray_bare',...PUB_HELD_PROP_MESHES.slice(0,4),'pub_service_water_glass','pub_service_empty_glass','pub_polishing_cloth','pub_bottle_opener','pub_order_book']);assert.ok(!json.skins,'service tray, opener and book use the ordinary static prop path');for(const mesh of json.meshes)for(const p of mesh.primitives){assert.equal(p.mode,4);assert.ok(p.attributes.POSITION!=null&&p.attributes.NORMAL!=null);assert.equal(p.attributes.JOINTS_0,undefined);}

// Check the emitted furniture and the WebGL skin palette, rather than inferring
// contact from a reachable wrist or a pelvis centre above a proxy rectangle.
const deform=(primitive,index,gpu,scale)=>[0,1,2].map(axis=>{
  let value=0;
  for(let slot=0;slot<4;slot++){
    const joint=primitive.joints[index*4+slot]*16;
    value+=primitive.weights[index*4+slot]*(gpu.bones[joint+axis]*primitive.positions[index*3]+gpu.bones[joint+axis+4]*primitive.positions[index*3+1]+gpu.bones[joint+axis+8]*primitive.positions[index*3+2]+gpu.bones[joint+axis+12]);
  }
  return value*scale[axis];
});
const shapes=[],materials=[];
const furniture=buildPubInterior({materials,mesh:name=>({name}),...Object.fromEntries(['Box','Cylinder','Beam','Quad'].map(kind=>['add'+kind,(_mesh,...args)=>shapes.push({kind:kind.toLowerCase(),args})]))});
let shapeCursor=0;
const fixtureShapes=new Map(furniture.fixtures.map(fixture=>{
  const group=[];let triangles=0;
  while(triangles<fixture.triangles){const shape=shapes[shapeCursor++];group.push(shape);triangles+=shape.kind==='quad'?2:shape.kind==='cylinder'?shape.args[4]*4:12;}
  assert.equal(triangles,fixture.triangles);return[fixture.id,group];
}));
const origin=[layout.meshOriginInRow.x,layout.meshOriginInRow.y,layout.meshOriginInRow.z];
function supportSurface(shape){
  const [center,size,heightOrMaterial,yawOrMaterial=0,sides]=shape.args,c=add(center,origin);
  const yaw=shape.kind==='box'?yawOrMaterial:0;
  const polygon=shape.kind==='cylinder'?Array.from({length:sides},(_,i)=>[c[0]+Math.cos(i*Math.PI*2/sides)*size,c[2]+Math.sin(i*Math.PI*2/sides)*size]):[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[c[0]+x*size[0]/2*Math.cos(yaw)-z*size[2]/2*Math.sin(yaw),c[2]+x*size[0]/2*Math.sin(yaw)+z*size[2]/2*Math.cos(yaw)]);
  return{top:c[1]+(shape.kind==='cylinder'?heightOrMaterial:size[1])/2,contains:point=>polygon.every(([x,z],i)=>{const next=polygon[(i+1)%polygon.length];return(next[0]-x)*(point[2]-z)-(next[1]-z)*(point[0]-x)>=-1e-7;})};
}
const posedVertices=(entry,gpu,scale,role)=>entry.primitives.filter(p=>asset.json.materials[p.material].extras.characterRole===role).flatMap(p=>[...new Set(p.indices)].map(index=>deform(p,index,gpu,scale)));
function inRow(actor,point){return[actor.local.x-Math.sin(actor.yaw)*point[0]-Math.cos(actor.yaw)*point[2],point[1]+.012,actor.local.z+Math.cos(actor.yaw)*point[0]-Math.sin(actor.yaw)*point[2]];}
const seatEvidence=[];
for(const actor of PUB_NEW_ACTORS.filter(actor=>Number.isFinite(actor.seatHeight))){
  const d=DESIGNS[actor.id],entry=asset.entries.find(e=>e.name===d.mesh),surfaces=fixtureShapes.get(actor.seatId).filter(shape=>shape.kind==='cylinder'&&Math.abs(shape.args[0][1]-.785)<1e-6||shape.kind==='box'&&shape.args[0][1]>.4&&shape.args[0][1]<.5&&shape.args[1][1]>.07&&shape.args[1][1]<.12).map(supportSurface);
  const seatGap=(timeSec,legacy=false)=>{
    const pose=pubCharacterPose(actor.id,{timeSec,seatY:actor.seatHeight-.012,...(legacy?{seatLift:0,seatForward:0}:{})}),gpu=sampleCharacterPose(asset,entry,{joints:pose.joints}),points=posedVertices(entry,gpu,pose.scale,'trousers').map(point=>inRow(actor,point));
    const gaps=surfaces.flatMap(surface=>points.filter(point=>surface.contains(point)&&point[1]>surface.top-.20).map(point=>point[1]-surface.top));
    assert.ok(gaps.length>100,actor.id+' samples the actual trouser underside over its emitted cushion');
    return Math.min(...gaps);
  };
  const gaps=[0,9.5,25].map(time=>seatGap(time));
  for(const gap of gaps)assert.ok(gap>=-.001&&gap<.009,actor.id+' deformed trousers meet the real seat within 9 mm: '+gap);
  const originalGap=seatGap(0,true);
  assert.ok(originalGap<-.02,actor.id+' regression fixture detects the former seat penetration');
  const pose=pubCharacterPose(actor.id,{reducedMotion:true,seatY:actor.seatHeight-.012}),gpu=sampleCharacterPose(asset,entry,{joints:pose.joints}),shoes=posedVertices(entry,gpu,pose.scale,'leather').map(point=>inRow(actor,point));
  const supportTop=d.stance==='stool'?.2825:.012;
  assert.ok(Math.abs(Math.min(...shoes.map(point=>point[1]))-supportTop)<.003,actor.id+' actual shoe soles meet parquet or stool rung');
  if(d.stance==='stool'){
    const rails=fixtureShapes.get(actor.seatId).filter(shape=>shape.kind==='box'&&shape.args[0][1]===.26).map(supportSurface);
    for(const side of[-1,1])assert.ok(shoes.some(point=>Math.sign(point[2]-actor.local.z)===side&&Math.abs(point[1]-supportTop)<.004&&rails.some(rail=>rail.contains(point))),actor.id+' both shoes overlap a real brass rung');
  }
  seatEvidence.push({id:actor.id,gapMm:gaps.map(gap=>Math.round(gap*10000)/10),formerPenetrationMm:Math.round(-originalGap*10000)/10});
}

const propBinOffset=20+view.getUint32(12,true)+8,propBin=propsBytes.subarray(propBinOffset);
function staticVertices(name){
  return json.meshes.find(mesh=>mesh.name===name).primitives.flatMap(primitive=>{
    const a=json.accessors[primitive.attributes.POSITION],v=json.bufferViews[a.bufferView],offset=(v.byteOffset||0)+(a.byteOffset||0),points=[];
    for(let i=0;i<a.count;i++)points.push([0,1,2].map(k=>propBin.readFloatLE(offset+i*12+k*4)));
    return points;
  });
}
const transform=(matrix,point)=>[0,1,2].map(axis=>matrix[axis]*point[0]+matrix[axis+4]*point[1]+matrix[axis+8]*point[2]+matrix[axis+12]);
const distance=(a,b)=>Math.hypot(...sub(a,b));
const drinkEvidence=[];
for(const {actor,water} of PUB_NEW_ACTORS.filter(actor=>DESIGNS[actor.id].drink).flatMap(actor=>actor.id==='pub-patron-mavis'?[{actor,water:true},{actor,water:false}]:[{actor,water:false}])){
  const d=DESIGNS[actor.id],entry=asset.entries.find(e=>e.name===d.mesh),kind=water?'water':d.drink,shape=PUB_DRINK_SHAPES[kind],timing=pubCharacterPerformance(actor.id),clock=seconds=>(seconds-d.seed*7.1+timing.period*2)%timing.period;
  const sampleSeconds=d.stance==='polish'?[3,12,13,14,19]:[3,9,timing.period-4.8,timing.period-3.4,timing.period-1.8];
  const phases=new Set();let actualGripError=0,actualMouthError=0;
  for(const seconds of sampleSeconds){
    const timeSec=water?[0,.9,2,4,5.1][sampleSeconds.indexOf(seconds)]:clock(seconds),drinksByActor=water?pubServiceDrinks({'pub.help.complete':true},{timeSec}):{};
    const instances=pubCharacterInstances([actor],{timeSec,drinksByActor}),body=instances[0],drink=instances.find(p=>p.id===actor.id+':drink'),contact=drink.pubDrinkContact;
    assert.equal(body.id,actor.id);assert.equal(drink.mesh,shape.mesh);phases.add(contact.phase);
    assert.ok(contact.gripError<1e-5,actor.id+' hand reaches the physical cup throughout its action');
    assert.ok(distance(transform(drink.matrix,contact.grip),contact.palm)<1e-5,'static vessel and skinned palm share the same sampled transform');
    const rim=transform(drink.matrix,[0,shape.height,shape.radius]);
    assert.ok(distance(rim,contact.rim)<1e-5);
    assert.ok(staticVertices(drink.mesh).some(point=>distance(point,[0,shape.height,shape.radius])<1e-6),'tested rim is a real vessel vertex');
    const gpu=sampleCharacterPose(asset,entry,body.character),skin=entry.primitives.filter(p=>asset.json.materials[p.material].extras.characterRole==='skin');
    const handPointsFor=side=>skin.flatMap(p=>[...new Set(p.indices)].filter(index=>{
      let weight=0;for(let k=0;k<4;k++)if(new RegExp(`_(hand|thumb|index|middle|ring|pinky)_${side}`).test(asset.nodes[entry.skin.joints[p.joints[index*4+k]]].name))weight+=p.weights[index*4+k];return weight>.5;
    }).map(index=>transform(body.matrix,deform(p,index,gpu,[1,1,1]))));
    const handPoints=handPointsFor(d.stance==='polish'?'L':'R');
    if(d.stance!=='polish'){
      const top=actor.tableId ? .790 : 1.14,supports=fixtureShapes.get(actor.tableId||'pub-counter').filter(s=>s.kind==='cylinder'&&Math.abs(s.args[0][1]+s.args[2]/2-top)<1e-6||s.kind==='box'&&Math.abs(s.args[0][1]+s.args[1][1]/2-top)<1e-6).map(supportSurface);
      for(const point of handPoints){const row=pubLocalFromWorld({x:point[0],z:point[2]});assert.ok(!(point[1]>top+.12-.069&&point[1]<top+.12-.001&&supports.some(surface=>surface.contains([row.x,0,row.z]))),actor.id+' fingers stay out of the real table or counter slab');}
    }else if(contact.phase==='polish'){
      const cloth=instances.find(p=>p.id===actor.id+':cloth'),clothPoints=staticVertices('pub_polishing_cloth').map(p=>transform(cloth.matrix,p)),rightHand=handPointsFor('R');
      assert.ok(Math.min(...clothPoints.flatMap(p=>rightHand.map(q=>distance(p,q))))<.004,'polishing cloth touches Iona’s actual right-hand skin');
    }
    // Bring world samples back through actor yaw as well as the drink tilt.
    const toVessel=point=>{const delta=sub(point,contact.position),c=Math.cos(actor.yaw),s=Math.sin(actor.yaw);return rotate([c*delta[0]+s*delta[2],delta[1],-s*delta[0]+c*delta[2]],[-contact.rotation[0],-contact.rotation[1],-contact.rotation[2],contact.rotation[3]]);};
    const gaps=handPoints.map(toVessel).filter(point=>point[1]>.01&&point[1]<shape.height-.01).map(point=>Math.abs(Math.hypot(point[0],point[2])-(shape.radius*.8+shape.radius*.2*point[1]/shape.height)));
    assert.ok(gaps.length>10);const gripGap=Math.min(...gaps);actualGripError=Math.max(actualGripError,gripGap);assert.ok(gripGap<.003,actor.id+' actual hand skin contacts the bowl');
    if(contact.phase==='sip'){
      const lips=entry.primitives.filter(p=>asset.json.materials[p.material].extras.characterRole==='lip').flatMap(p=>[...new Set(p.indices)].map(index=>transform(body.matrix,deform(p,index,gpu,[1,1,1]))));
      const lipGap=Math.min(...lips.map(point=>distance(point,rim)));actualMouthError=Math.max(actualMouthError,lipGap);
      assert.ok(lipGap<.004,actor.id+' actual glass rim reaches deformed lip geometry');
    }
    if(contact.phase==='rest'&&d.stance!=='polish'){
      const support=fixtureShapes.get(actor.tableId||'pub-counter'),top=actor.tableId ? .790 : 1.14;
      const surfaces=support.filter(s=>s.kind==='cylinder'&&Math.abs(s.args[0][1]+s.args[2]/2-top)<1e-6||s.kind==='box'&&Math.abs(s.args[0][1]+s.args[1][1]/2-top)<1e-6).map(supportSurface);
      const bottom=staticVertices(drink.mesh).filter(p=>p[1]<.00001).map(point=>transform(drink.matrix,point));assert.ok(bottom.length>40);
      for(const point of bottom){const row=pubLocalFromWorld({x:point[0],z:point[2]});assert.ok(Math.abs(point[1]-(top+.12))<1e-5);assert.ok(surfaces.some(surface=>surface.contains([row.x,top,row.z])),actor.id+' full glass base is supported by the real table or bar');}
      if(water)assert.ok(distance(contact.position,drinksByActor[actor.id].restWorld)<1e-8,'served water rests at the same saved service placement');
    }
    assert.ok([...drink.matrix].every(Number.isFinite));
  }
  assert.ok(phases.has('rest')&&phases.has(d.stance==='polish'?'polish':'sip'));
  assert.deepEqual(pubCharacterInstances([actor],{timeSec:0,reducedMotion:true}),pubCharacterInstances([actor],{timeSec:200,reducedMotion:true}),'reduced motion freezes body, vessel and cloth');
  drinkEvidence.push({id:actor.id,kind,phases:[...phases],actualGripMm:Math.round(actualGripError*10000)/10,actualLipMm:Math.round(actualMouthError*10000)/10});
}
for(const actor of PUB_NEW_ACTORS){
  const none=pubCharacterInstances([actor],{drinksByActor:{[actor.id]:null}});assert.equal(none.length,1);assert.ok(Object.values(none[0].character.joints).every(j=>[...j.translation,...j.rotation].every(Number.isFinite)),'removing a drink retains a valid rest pose');
  const timing=pubCharacterPerformance(actor.id),actions=Array.from({length:100},(_,i)=>pubCharacterPerformance(actor.id,{timeSec:i*timing.period/100}));
  assert.ok(actions.filter(action=>action.phase==='rest'||action.phase==='listen').length>70,'finite gestures leave long quiet rests');
}
const iona=PUB_NEW_ACTORS.find(actor=>actor.id==='pub-bartender-iona'),ionaRest=pubCharacterInstances([iona],{timeSec:0}),ionaPolish=pubCharacterInstances([iona],{timeSec:13-.8*7.1});
assert.equal(ionaPolish.filter(p=>p.mesh==='pub_polishing_cloth').length,1);
assert.notDeepEqual(ionaRest.find(p=>p.mesh==='pub_polishing_cloth').matrix,ionaPolish.find(p=>p.mesh==='pub_polishing_cloth').matrix,'the cloth follows Iona’s sampled polishing hand');
assert.equal(new Set(PUB_NEW_ACTORS.filter(actor=>DESIGNS[actor.id].drink&&actor!==iona).map(actor=>{
  const d=DESIGNS[actor.id],p=pubCharacterPerformance(actor.id);return Math.round((p.period-4-d.seed*7.1+p.period*2)%p.period);
})).size,4,'patrons take staggered sips');
assert.ok(propsBytes.length<512*1024,'separate opaque held props stay within the isolated service pack budget');
for(const name of ['pub_service_water_glass','pub_service_empty_glass',...PUB_HELD_PROP_MESHES.filter(name=>name!=='pub_polishing_cloth')]){
  const points=staticVertices(name),height=Math.max(...points.map(p=>p[1])),top=points.filter(p=>Math.abs(p[1]-height)<1e-6),radii=new Set(top.map(p=>Math.round(Math.hypot(p[0],p[2])*1000)));
  assert.ok(height<=.13&&height>=.09);assert.ok(radii.size>=2,name+' has an actual open thick rim');
}


// The visible handoff agrees with the service line: support first, a brief
// toast in thanks, then the same vessel returns to the same support.
{
 const actor=PUB_NEW_ACTORS.find(a=>a.id==='pub-patron-mavis'),flags={'pub.help.complete':true};
 const sample=timeSec=>pubCharacterInstances([actor],{drinksByActor:pubServiceDrinks(flags,{timeSec})}).find(p=>p.pubDrinkContact)?.pubDrinkContact;
 assert.equal(sample(0).lift,0);assert.equal(sample(2).phase,'sip');assert.equal(sample(5.1).lift,0);
 assert.ok(distance(sample(0).position,sample(5.1).position)<1e-8,'the glass returns to its exact physical support');
 for(let t=0;t<72;t+=.25)assert.ok(sample(t).gripError<1e-5,'the served water remains reachable across breathing and repeated cycles');
}
console.log(JSON.stringify({ok:true,seatEvidence,drinkEvidence,characters:7,samples,vertices,characterBytes:bytes.length,propBytes:propsBytes.length,bounds,nativeMaterialAcceptance:false}));
