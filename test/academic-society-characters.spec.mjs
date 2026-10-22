import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {ACADEMIC_SOCIETY_CHARACTER_DESIGNS as DESIGNS,ACADEMIC_SOCIETY_CHARACTER_RIGS as RIGS,ACADEMIC_SOCIETY_CHARACTER_MESHES as MESHES,ACADEMIC_FLOOR_POPULATION_DESIGNS as POPULATION,ACADEMIC_CHARACTER_PACK_MESHES as PACK_MESHES} from '../src/data/academic-society-character-design.js';
import {sourceLastReceptionResidentPose} from '../src/render/source-last-reception-residents.js';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(new URL('../public/assets/academic-society-characters.glb',import.meta.url));
const stats=JSON.parse(fs.readFileSync(new URL('../public/assets/academic-society-characters.stats.json',import.meta.url)));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const originalAnatomy={celeste:'5b06403209827166af35046706839ee04fbb6eeb298ed433e8fc1c08d8d78567',emile:'3e0f1923e2bc3adedbaf215898a776f27308bc840b9bce54231b9fe9a5c738fe',odette:'6e864c50dbea2ed541b7902c44971ec857cdb868035c9a9a639c7fa2e8ff1f25',lucien:'52ababa477121d1f4b3aec4cfc571574c6f7bc8c895236a31dbdf2ccb4350473',agathe:'c3a114686b2518c68f0bcf175a0933065b7ee0f434cf28b57a40bc43618817b7',noe:'c1b12282656e4207f788a281767a6fe0d90d89d7f02bbd166036ddbda6b73157',sabine:'88cb23787adac10e416015601851ae17e8285d64676071f07bc60164c6142bd5'};
const anatomyDigest=entry=>{const hash=crypto.createHash('sha256'),part=entry.extras.parts.find(p=>p.name==='original resculpted face neck and anatomical hands'),skin=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='skin');for(const[key,width]of[['positions',3],['normals',3],['joints',4],['weights',4]])hash.update(Buffer.from(skin[key].buffer,skin[key].byteOffset,part.vertices*width*skin[key].BYTES_PER_ELEMENT));hash.update(Buffer.from(skin.indices.buffer,skin.indices.byteOffset,part.triangles*3*skin.indices.BYTES_PER_ELEMENT));for(const role of['eye white','iris','lip']){const p=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole===role);if(p)for(const key of['positions','normals','indices','joints','weights'])hash.update(Buffer.from(p[key].buffer,p[key].byteOffset,p[key].byteLength));}return hash.digest('hex');};
const partSamples=(entry,pattern)=>{const offsets=new Map(),points=[];for(const part of entry.extras.parts){const material=asset.json.materials.findIndex(m=>m.name===part.material),primitive=entry.primitives.find(p=>p.material===material),offset=offsets.get(material)||0;if(pattern.test(part.name))for(let i=0;i<part.vertices;i++)points.push({position:[...primitive.positions.slice((offset+i)*3,(offset+i+1)*3)],normal:[...primitive.normals.slice((offset+i)*3,(offset+i+1)*3)]});offsets.set(material,offset+part.vertices);}return points;};
const partPoints=(entry,pattern)=>partSamples(entry,pattern).map(sample=>sample.position);
const bounds=points=>({min:[0,1,2].map(axis=>Math.min(...points.map(p=>p[axis]))),max:[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis])))});
assert.equal(digest(bytes),stats.sha256,'asset identity must match its generator receipt');
assert.equal(bytes.length,stats.bytes);assert.ok(bytes.length<16*1024*1024,'dedicated named/population pack stays under sixteen MiB');
for(const[file,sha]of Object.entries(stats.sourceSha256))assert.equal(digest(fs.readFileSync(new URL('../'+file,import.meta.url))),sha,'character source is newer than pack: '+file);
assert.equal(Object.keys(DESIGNS).length,7);assert.equal(MESHES.length,7);assert.equal(asset.entries.length,11);assert.deepEqual(asset.entries.map(e=>e.name),PACK_MESHES);assert.equal(asset.nodes.length,119,'two shared rigs avoid node limit');
const sourceHeights={male:1.78,female:1.70};let samples=0,posedVertices=0;
const add=(a,b)=>a.map((v,k)=>v+b[k]),mul=(a,n)=>a.map(v=>v*n),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],sub=(a,b)=>a.map((v,k)=>v-b[k]);
const rotate=(v,q)=>{const t=mul(cross(q.slice(0,3),v),2);return add(v,add(mul(t,q[3]),cross(q.slice(0,3),t)));};
const faces=[];
for(const[id,d]of Object.entries(DESIGNS)){
 const entry=asset.entries.find(e=>e.name===d.mesh),parts=asset.json.meshes.find(m=>m.name===d.mesh).extras.parts;
 assert.equal(anatomyDigest(entry),originalAnatomy[id],'dated clothing must preserve all seven original faces, eyes, lips, hands and their numerical skin weights');
 assert.deepEqual(entry.extras.costume,d.costume);assert.ok(d.costume.sourceUrl.startsWith('https://'));assert.ok(d.costume.date.length>0);
 assert.equal(entry.extras.identity,d.name);assert.equal(entry.extras.originalCharacter,id);assert.deepEqual(entry.extras.forward,[0,0,-1]);assert.equal(entry.skin.joints.length,54);
 for(let i=0;i<RIGS[d.source].length;i++){const bone=RIGS[d.source][i],node=asset.nodes[entry.skin.joints[i]];assert.equal(node.name,`society_${d.source}_${bone.name}`);for(let axis=0;axis<3;axis++)assert.ok(Math.abs(node.translation[axis]-bone.head[axis])<1e-6,'render and performance rest skeletons must agree');}
 assert.ok(parts.some(p=>/resculpted face/.test(p.name)));assert.ok(parts.some(p=>/fitted scalp|clipped silver hair|raised punk crest/.test(p.name)),'each character needs actual geometry for its approved hair or headwear');assert.ok(parts.some(p=>/eyebrow/.test(p.name)),'eyebrows must be actual geometry');assert.ok(parts.some(p=>/shoe/.test(p.name)));
 assert.ok(entry.primitives.length<=16);assert.ok(entry.primitives.reduce((n,p)=>n+p.vertexCount,0)<50000);
 const material=role=>asset.json.materials.findIndex(m=>m.name===id+' '+role),eye=entry.primitives.find(p=>p.material===material('eye white')),iris=entry.primitives.find(p=>p.material===material('iris')),skin=entry.primitives.find(p=>p.material===material('skin'));
 assert.ok(eye?.indices.length>100&&iris?.indices.length>100,'eyes and irises are retained visible surfaces');
 const head=RIGS[d.source].find(b=>b.name==='head').head,face=[...new Set(skin.indices)].filter(v=>skin.positions[v*3+1]>head[1]-.06&&skin.positions[v*3+2]<head[2]-.05);
 assert.ok(face.length>400,'anatomical face must retain nose, mouth, lids, cheeks and chin topology');
 const zs=face.map(v=>skin.positions[v*3+2]);assert.ok(Math.max(...zs)-Math.min(...zs)>.04,'faces retain real depth rather than erased flat relief');
 faces.push(digest(Buffer.from(new Float32Array(face.flatMap(v=>[skin.positions[v*3],skin.positions[v*3+1],skin.positions[v*3+2]])).buffer)));
 for(const side of['L','R'])for(const digit of['thumb','index','middle','ring','little'])for(const suffix of['','_mid','_tip']){const name=`society_${d.source}_${digit}${suffix}_${side}`,j=entry.skin.joints.findIndex(i=>asset.nodes[i].name===name);assert.ok(j>=0);assert.ok(skin.joints.some((value,i)=>value===j&&skin.weights[i]>.05),`${id} ${name} must influence actual skin`);}
 const ys=entry.primitives.flatMap(p=>[...p.positions].filter((_,i)=>i%3===1));assert.ok(Math.min(...ys)>-.02);assert.ok(Math.abs(RIGS[d.source].find(b=>b.name==='head').tail[1]*d.height/sourceHeights[d.source]-d.height)<.02,'authored anatomical stature is separate from historical headwear');assert.ok(Math.max(...ys)*d.height/sourceHeights[d.source]-d.height<(id==='lucien'?.14:.055),'headwear/crest must stay within its explicit height allowance without scaling the body');
 const alias=d.source==='female'?'guest-a':id==='emile'?'guest-b':'host',rest=new Map(RIGS[d.source].map(b=>[b.name,b]));
 for(const mode of['idle','walk','reach'])for(let step=0;step<8;step++){
  const frame={mode,elapsed:step*.31,distance:step*.1,speed:mode==='walk'?.8:0,attention:mode==='reach'?1:0},pose=sourceLastReceptionResidentPose(alias,frame),joints=Object.fromEntries(Object.entries(pose.joints).map(([name,joint])=>[name.replace(/^reception_/,'society_'),joint]));
  const gpu=sampleCharacterPose(asset,entry,{joints});samples++;assert.ok([...gpu.bones].every(Number.isFinite));
  for(const side of['L','R'])for(const[a,b]of[[`upperarm_${side}`,`forearm_${side}`],[`forearm_${side}`,`hand_${side}`],[`thigh_${side}`,`shin_${side}`],[`shin_${side}`,`foot_${side}`]]){const one=rest.get(a),two=rest.get(b),ja=joints[`society_${d.source}_${a}`],jb=joints[`society_${d.source}_${b}`],end=add(add(one.head,ja.translation),rotate(sub(one.tail,one.head),ja.rotation)),start=add(two.head,jb.translation);assert.ok(Math.hypot(...sub(end,start))<1e-5,`${id} ${mode} articulated ${a}/${b} must remain connected`);}
  if(step===0||step===4)for(const p of entry.primitives)for(const v of new Set(p.indices)){for(let axis=0;axis<3;axis++){let value=0;for(let slot=0;slot<4;slot++){const weight=p.weights[v*4+slot],at=p.joints[v*4+slot]*16;value+=weight*(gpu.bones[at+axis]*p.positions[v*3]+gpu.bones[at+axis+4]*p.positions[v*3+1]+gpu.bones[at+axis+8]*p.positions[v*3+2]+gpu.bones[at+axis+12]);}assert.ok(Number.isFinite(value)&&Math.abs(value)<3,`${id} ${mode} skin must stay within human scale`);}posedVertices++;}
 }
}
assert.equal(new Set(faces).size,7,'original identities cannot share an unchanged donor face');
assert.equal(new Set(Object.values(DESIGNS).map(d=>d.hair)).size,7);assert.equal(new Set(Object.values(DESIGNS).map(d=>d.dress)).size,7);
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.celeste.mesh).extras.parts.some(p=>/ivory knot/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.odette.mesh).extras.parts.some(p=>/full cotton day-dress skirt/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.emile.mesh).extras.parts.some(p=>/cravat/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.lucien.mesh).extras.parts.some(p=>/lapel clasp/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.agathe.mesh).extras.parts.some(p=>/side braid/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.agathe.mesh).extras.parts.some(p=>/attendance ledger/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.noe.mesh).extras.parts.some(p=>/printmaker.*beard/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.noe.mesh).extras.parts.some(p=>/waist apron without modern bib/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.sabine.mesh).extras.parts.some(p=>/pelisse short tabbed cape collar/.test(p.name)));
assert.ok(asset.json.meshes.find(m=>m.name===DESIGNS.sabine.mesh).extras.parts.some(p=>/high swept.*knot/.test(p.name)));
for(const id of['celeste','agathe','odette','sabine']){
 const entry=asset.entries.find(e=>e.name===DESIGNS[id].mesh),p=partPoints(entry,id==='celeste'?/contrasting continuous petticoat/:id==='agathe'?/separate compact petticoat/:id==='odette'?/full cotton day-dress skirt/:/high-waisted gored pelisse skirt/),b=bounds(p);
 assert.ok(p.length>800,'period gowns need a real continuous skinned skirt surface');assert.ok(b.max[0]-b.min[0]>.45&&b.max[2]-b.min[2]>.35,'skirts must have actual lateral and front/back volume');assert.ok(b.min[1]>.09&&b.min[1]<.16,'compact gown hems stay visibly above the floor');
 const top=p.filter(v=>v[1]>b.max[1]-.015),hem=p.filter(v=>v[1]<b.min[1]+.015);assert.ok(bounds(hem).max[0]-bounds(hem).min[0]>(bounds(top).max[0]-bounds(top).min[0])*1.25,'gown silhouette must widen from its fitted waist');
 if(id==='sabine')assert.ok(b.max[1]>1.22,'pelisse waist must actually rise above the natural waist');else assert.ok(b.max[1]<1.10,'other gowns retain distinct natural waist levels');
}
{
 const noe=asset.entries.find(e=>e.name===DESIGNS.noe.mesh),breeches=bounds(partPoints(noe,/full knee breeches/)),hose=bounds(partPoints(noe,/separate pale knitted stocking/));
 assert.ok(breeches.min[1]>.46&&breeches.min[1]<.53);assert.ok(hose.min[1]<.08&&Math.abs(hose.max[1]-breeches.min[1])<.0001,'separate stockings must start at the actual breeches knee hem');
 assert.ok(partPoints(noe,/waist apron without modern bib/).every(p=>p[1]<=1.111),'1642 work apron must start at the waist rather than remain a modern bib');
 const frontmost=partSamples(noe,/full knee breeches/).sort((a,b)=>a.position[2]-b.position[2])[0];assert.ok(frontmost.normal[2]<-.4,'breeches must face outward so the native culling pass can see their fronts');
 assert.ok(partSamples(noe,/waist apron without modern bib/).every(v=>v.normal[2]<-.8),'waist apron must have outward front-facing triangles');
 const punk=asset.entries.find(e=>e.name===DESIGNS.lucien.mesh),crest=bounds(partPoints(punk,/raised punk crest/)),boot=bounds(partPoints(punk,/ankle boot shaft/)),strap=bounds(partPoints(punk,/physical buckled bondage thigh strap/));
 const crestAboveStature=crest.max[1]*DESIGNS.lucien.height/1.78-DESIGNS.lucien.height;assert.ok(crestAboveStature>.08&&crestAboveStature<.12,'punk crest must rise8–11cm rather than read as a small nodule');assert.ok(boot.max[1]>.30&&boot.min[1]<.08,'punk boots need real high shafts');assert.ok(strap.max[2]-strap.min[2]>.13,'bondage straps must physically wrap the trouser volume');
}
for(const[id,d]of Object.entries(POPULATION)){
 const entry=asset.entries.find(e=>e.name===d.mesh),meta=asset.json.meshes.find(m=>m.name===d.mesh).extras;assert.equal(meta.identityKind,'population');assert.equal(meta.populationArchetype,id);assert.equal(meta.originalCharacter,null);assert.equal(meta.hollow,d.hollow||null);assert.equal(entry.skin.joints.length,54);
 if(!d.hollow){assert.ok(meta.parts.some(p=>/resculpted face/.test(p.name)),'anonymous ordinary people retain real faces');const skin=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='skin'),H=RIGS[d.source].find(b=>b.name==='head').head,front=[...new Set(skin.indices)].filter(v=>skin.positions[v*3+1]>H[1]-.06&&skin.positions[v*3+2]<H[2]-.05),face=digest(Buffer.from(new Float32Array(front.flatMap(v=>[skin.positions[v*3],skin.positions[v*3+1],skin.positions[v*3+2]])).buffer));assert.ok(!faces.includes(face),'anonymous role bodies cannot duplicate a named original face');}
 else if(d.hollow==='empty-coat'){
  assert.ok(meta.parts.every(p=>!/face|hair|scalp|eyebrow|shoe|trouser|hand/.test(p.name)||/hand stitched|hand finished/.test(p.name)),'empty cloak must not conceal a head, hand, leg or foot body');
  const cloak=partPoints(entry,/empty circular sleeveless cloak/),top=Math.max(...cloak.map(p=>p[1])),rim=cloak.filter(p=>p[1]>top-.001);assert.ok(rim.length>30&&rim.every(p=>Math.hypot(p[0],p[2])>.06),'cloak neck must be an actual open ring rather than an opaque capped body');
  assert.ok(meta.parts.every(p=>!/^period fitted continuous sleeve/.test(p.name)),'empty cloak is physically sleeveless');
 }
 else {
  assert.ok(meta.parts.every(p=>!/eyebrow|eyes|iris/.test(p.name)),'unfinished face cannot leave disconnected eyes or eyebrows across its cavity');
  const skin=entry.primitives.find(p=>asset.json.materials[p.material].extras.characterRole==='skin'),H=RIGS[d.source].find(b=>b.name==='head').head;
  // A vertical ray through the nose/eye region must see through actual missing
  // triangles. No dark face decal or opaque replacement plane counts as hollow.
  const rayHits=(x,y)=>{let hits=0;for(let i=0;i<skin.indices.length;i+=3){const p=skin.indices.slice(i,i+3).map(v=>[skin.positions[v*3],skin.positions[v*3+1],skin.positions[v*3+2]]),[a,b,c]=p,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v,z=u*a[2]+v*b[2]+w*c[2];if(u>=0&&v>=0&&w>=0&&z<H[2]-.03)hits++;}return hits;};
  assert.equal(rayHits(0,H[1]+.025),0,'head cavity must pass through the central facial skin');
 }
}
console.log(JSON.stringify({ok:true,characters:asset.entries.length,bytes:bytes.length,samples,posedVertices,nativeVisualAcceptance:false}));
