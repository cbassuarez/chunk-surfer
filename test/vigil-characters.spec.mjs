// The cast must remain anatomical and actually grasp its rendered objects.
// Contact errors alone are insufficient: test the flattened GLB skin, knuckle
// continuity, both supporting hands and contact with the object's real surface.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseCharacterAsset,sampleCharacterPose} from '../src/render/character-asset.js';
import {VIGIL_CHARACTER_DESIGNS as designs} from '../src/data/vigil-character-design.js';
import {VIGIL_CHARACTER_RIGS as rigs} from '../src/data/vigil-character-rigs.js';
import {VIGIL_OBJECT_LAYOUT as layouts} from '../src/data/vigil-object-layout.js';
import {vigilCharacterIdForMesh,vigilCharacterPose} from '../src/render/vigil-character-performance.js';
import {VIGIL_MESHES} from '../src/data/exterior-vigil.js';

const pairs=['ruth-leila','owen-denise','malcolm-kit'];
const manifest=JSON.parse(readFileSync(new URL('../public/assets/vigil-characters.manifest.json',import.meta.url)));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.designSha256,digest(readFileSync(new URL('../src/data/vigil-character-design.js',import.meta.url))),'vigil packs need rebuilding after design changes');
for(const[file,sha]of Object.entries(manifest.sourceSha256||{}))assert.equal(sha,digest(readFileSync(new URL('../'+file,import.meta.url))),`vigil packs need rebuilding after ${file} changes`);
assert.ok(manifest.sourceSha256?.['tools/chunk_surfer/characters/vigil-tailoring.mjs'],'asset freshness must cover anatomical weighting and tailoring');
const actions={ruth:['binder-page','weight-shift'],leila:['flask-check','window-look','weight-shift'],owen:['umbrella-settle','key-check','weight-shift'],denise:['photos-sort','weight-shift'],malcolm:['map-fold','weight-shift'],kit:['camera-check','weight-shift']};
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const length=a=>Math.hypot(...a),distance=(a,b)=>length(sub(a,b)),unit=a=>mul(a,1/(length(a)||1));
const rotate=(v,q)=>{const xyz=q.slice(0,3),t=mul(cross(xyz,v),2);return add(v,add(mul(t,q[3]),cross(xyz,t)));};
const close=(a,b,message,tolerance=1e-5)=>assert.ok(distance(a,b)<tolerance,`${message}: ${distance(a,b).toFixed(6)}m`);
const bounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],sum:[0,0,0],count:0});
function skinnedBounds(asset,entry,pose){
  const frame=sampleCharacterPose(asset,entry,{joints:pose.joints}),out=bounds();
  for(const primitive of entry.primitives)for(let vertex=0;vertex<primitive.vertexCount;vertex++){
    const x=primitive.positions[vertex*3],y=primitive.positions[vertex*3+1],z=primitive.positions[vertex*3+2],point=[0,0,0];
    for(let influence=0;influence<4;influence++){
      const weight=primitive.weights[vertex*4+influence];if(!weight)continue;
      const joint=primitive.joints[vertex*4+influence],m=frame.bones.subarray(joint*16,joint*16+16);
      point[0]+=weight*(m[0]*x+m[4]*y+m[8]*z+m[12]);point[1]+=weight*(m[1]*x+m[5]*y+m[9]*z+m[13]);point[2]+=weight*(m[2]*x+m[6]*y+m[10]*z+m[14]);
    }
    for(let axis=0;axis<3;axis++){
      assert.ok(Number.isFinite(point[axis]),`${entry.name} has nonfinite skinned geometry`);
      out.min[axis]=Math.min(out.min[axis],point[axis]);out.max[axis]=Math.max(out.max[axis],point[axis]);out.sum[axis]+=point[axis];
    }
    out.count++;
  }
  out.center=out.sum.map(value=>value/out.count);return out;
}
function triangleDistance(point,a,b,c){
  const ab=sub(b,a),ac=sub(c,a),ap=sub(point,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return length(ap);
  const bp=sub(point,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return length(bp);
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return distance(point,add(a,mul(ab,d1/(d1-d3))));
  const cp=sub(point,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return length(cp);
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return distance(point,add(a,mul(ac,d2/(d2-d6))));
  const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return distance(point,add(b,mul(sub(c,b),(d4-d3)/((d4-d3)+(d5-d6)))));
  const denominator=va+vb+vc;if(Math.abs(denominator)<1e-15)return Math.min(length(ap),length(bp),length(cp));
  return distance(point,add(a,add(mul(ab,vb/denominator),mul(ac,vc/denominator))));
}
function objectSurfaceDistance(point,entry){
  let nearest=Infinity;
  for(const primitive of entry.primitives)for(let i=0;i<primitive.indices.length;i+=3){
    const vertices=[0,1,2].map(j=>primitive.positions.subarray(primitive.indices[i+j]*3,primitive.indices[i+j]*3+3));
    const d=triangleDistance(point,...vertices);if(Number.isFinite(d))nearest=Math.min(nearest,d);
  }
  return nearest;
}
function largestClosedBox(entry){
  const boxes=[];
  for(const primitive of entry.primitives){
    const parent=Array.from({length:primitive.vertexCount},(_,i)=>i),find=i=>parent[i]===i?i:(parent[i]=find(parent[i]));
    for(let i=0;i<primitive.indices.length;i+=3){const a=find(primitive.indices[i]);for(let j=1;j<3;j++)parent[find(primitive.indices[i+j])]=a;}
    const components=new Map();for(let i=0;i<primitive.vertexCount;i++){const key=find(i);if(!components.has(key))components.set(key,[]);components.get(key).push(i);}
    for(const indices of components.values()){
      if(indices.length!==8)continue;
      const min=[0,1,2].map(axis=>Math.min(...indices.map(i=>primitive.positions[i*3+axis]))),max=[0,1,2].map(axis=>Math.max(...indices.map(i=>primitive.positions[i*3+axis])));
      const corners=new Set(indices.map(i=>[0,1,2].map(axis=>Math.abs(primitive.positions[i*3+axis]-min[axis])<1e-6?'0':Math.abs(primitive.positions[i*3+axis]-max[axis])<1e-6?'1':'?').join('')));
      if(corners.size===8&&![...corners].some(key=>key.includes('?')))boxes.push({min,max,volume:max.reduce((v,n,i)=>v*(n-min[i]),1)});
    }
  }
  return boxes.sort((a,b)=>b.volume-a.volume)[0];
}
function solidDepth(point,layout,box){
  if(layout.kind==='folder')return Math.min(...point.flatMap((v,i)=>[v-box.min[i],box.max[i]-v]));
  const radius=layout.kind==='flask'?layout.radius:layout.kind==='microphone'?layout.radius-.001:0;
  if(!radius)return-Infinity;
  const low=layout.kind==='flask'?-layout.height/2+.016:-.10,high=layout.kind==='flask'?layout.height/2-.045:.12;
  return Math.min(radius-Math.hypot(point[0],point[2]),point[1]-low,high-point[1]);
}
function fleshPenetrations(asset,body,pose,layout,box){
  const skin=asset.json.materials.findIndex(m=>m.name===`${body.name} skin`),frame=sampleCharacterPose(asset,body,{joints:pose.joints}),inverse=pose.object.rotation.map((v,i)=>i===3?v:-v);
  let count=0,maxDepth=0;const joints={};
  for(const primitive of body.primitives)if(primitive.material===skin)for(let vertex=0;vertex<primitive.vertexCount;vertex++){
    const p=primitive.positions.subarray(vertex*3,vertex*3+3),point=[0,0,0];
    for(let slot=0;slot<4;slot++){
      const weight=primitive.weights[vertex*4+slot];if(!weight)continue;
      const m=frame.bones.subarray(primitive.joints[vertex*4+slot]*16);
      for(let axis=0;axis<3;axis++)point[axis]+=weight*(m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);
    }
    const local=rotate(sub(point,pose.object.position),inverse),depth=solidDepth(local,layout,box);
    if(depth>.002){count++;maxDepth=Math.max(maxDepth,depth);const joint=asset.nodes[body.skin.joints[primitive.joints[vertex*4]]].name;joints[joint]=(joints[joint]||0)+1;}
  }
  return{count,maxDepth,joints};
}
function paperSkinCrossings(asset,body,part,pose,layout){
  const skin=asset.json.materials.findIndex(m=>m.name===`${body.name} skin`),paper=asset.json.materials.findIndex(m=>m.name===`${body.name} paper`),frame=sampleCharacterPose(asset,body,{joints:pose.joints}),inverse=pose.object.rotation.map((v,i)=>i===3?v:-v),sheets=[];
  for(const primitive of part.primitives)if(primitive.material===paper)for(let i=0;i<primitive.indices.length;i+=3){
    const points=[0,1,2].map(j=>Array.from(primitive.positions.subarray(primitive.indices[i+j]*3,primitive.indices[i+j]*3+3))),normal=unit(cross(sub(points[1],points[0]),sub(points[2],points[0])));
    sheets.push({points,normal});
  }
  assert.ok(sheets.length,'map needs a physical paper surface');let count=0,maxDepth=0;const joints={};
  for(const primitive of body.primitives)if(primitive.material===skin){
    const local=[];
    for(let vertex=0;vertex<primitive.vertexCount;vertex++){
      const p=primitive.positions.subarray(vertex*3,vertex*3+3),point=[0,0,0];
      for(let slot=0;slot<4;slot++){const weight=primitive.weights[vertex*4+slot];if(!weight)continue;const m=frame.bones.subarray(primitive.joints[vertex*4+slot]*16);for(let axis=0;axis<3;axis++)point[axis]+=weight*(m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);}
      local.push(rotate(sub(point,pose.object.position),inverse));
    }
    for(let i=0;i<primitive.indices.length;i+=3){
      const indices=[primitive.indices[i],primitive.indices[i+1],primitive.indices[i+2]],points=indices.map(v=>local[v]);let crossed=false,depth=0;
      if(Math.max(...points.map(p=>p[0]))<-layout.width/2||Math.min(...points.map(p=>p[0]))>layout.width/2||Math.max(...points.map(p=>p[1]))<-layout.height/2-.02||Math.min(...points.map(p=>p[1]))>layout.height/2||Math.min(...points.map(p=>p[2]))>.10||Math.max(...points.map(p=>p[2]))<-.10)continue;
      for(const sheet of sheets){
        const [a,b,c]=sheet.points,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-12)continue;
        for(let edge=0;edge<3;edge++){
          const p=points[edge],q=points[(edge+1)%3],dp=dot(sub(p,a),sheet.normal),dq=dot(sub(q,a),sheet.normal);
          if(dp*dq>=0||Math.min(Math.abs(dp),Math.abs(dq))<=.002)continue;
          const hit=add(p,mul(sub(q,p),dp/(dp-dq)));
          // Wrapping around the cut paper edge is a legitimate grasp. A sheet
          // passing through skin several millimetres inside its edge is not.
          if(Math.abs(hit[0])>=layout.width/2-.004||Math.abs(hit[1])>=layout.height/2-.004)continue;
          const u=((b[1]-c[1])*(hit[0]-c[0])+(c[0]-b[0])*(hit[1]-c[1]))/den,v=((c[1]-a[1])*(hit[0]-c[0])+(a[0]-c[0])*(hit[1]-c[1]))/den;
          if(Math.min(u,v,1-u-v)<-1e-6)continue;
          crossed=true;depth=Math.max(depth,Math.min(Math.abs(dp),Math.abs(dq)));
        }
      }
      if(crossed){count++;maxDepth=Math.max(maxDepth,depth);const joint=asset.nodes[body.skin.joints[primitive.joints[indices[0]*4]]].name;joints[joint]=(joints[joint]||0)+1;}
    }
  }
  return{count,maxDepth,joints};
}
function headphoneHandContact(asset,body,pose){
  const skin=asset.json.materials.findIndex(m=>m.name===`${body.name} skin`),rubber=asset.json.materials.findIndex(m=>m.name===`${body.name} rubber`),frame=sampleCharacterPose(asset,body,{joints:pose.joints}),headIndex=body.skin.joints.findIndex(j=>asset.nodes[j].name==='vigil_kit_head'),shell=[];
  const skinned=(primitive,vertex)=>{
    const p=primitive.positions.subarray(vertex*3,vertex*3+3),point=[0,0,0];
    for(let slot=0;slot<4;slot++){const weight=primitive.weights[vertex*4+slot];if(!weight)continue;const m=frame.bones.subarray(primitive.joints[vertex*4+slot]*16);for(let axis=0;axis<3;axis++)point[axis]+=weight*(m[axis]*p[0]+m[axis+4]*p[1]+m[axis+8]*p[2]+m[axis+12]);}return point;
  };
  for(const primitive of body.primitives)if(primitive.material===rubber)for(let i=0;i<primitive.indices.length;i+=3){
    const ids=Array.from(primitive.indices.subarray(i,i+3));
    if(ids.every(vertex=>primitive.joints[vertex*4]===headIndex&&primitive.weights[vertex*4]>.99&&primitive.positions[vertex*3]<-.05&&primitive.positions[vertex*3+1]>1.53&&primitive.positions[vertex*3+1]<1.65))shell.push(ids.map(vertex=>skinned(primitive,vertex)));
  }
  assert.ok(shell.length>100,'Kit lost the actual left headphone shell/pad geometry');
  const nearest={thumb:Infinity,index:Infinity,middle:Infinity,ring:Infinity,little:Infinity};
  for(const primitive of body.primitives)if(primitive.material===skin)for(let vertex=0;vertex<primitive.vertexCount;vertex++){
    const joint=asset.nodes[body.skin.joints[primitive.joints[vertex*4]]].name,match=joint.match(/^vigil_kit_(thumb|index|middle|ring|little)_tip_L$/);if(!match)continue;
    const point=skinned(primitive,vertex);for(const triangle of shell){const d=triangleDistance(point,...triangle);if(Number.isFinite(d))nearest[match[1]]=Math.min(nearest[match[1]],d);}
  }
  return nearest;
}
function secondaryKeyContact(asset,body,pose){
  const frame=sampleCharacterPose(asset,body,{joints:pose.joints}),skin=asset.json.materials.findIndex(m=>m.name===body.name+' skin'),metal=asset.json.materials.findIndex(m=>m.name===body.name+' metal'),hand=body.skin.joints.findIndex(index=>asset.nodes[index].name==='vigil_owen_hand_L'),triangles=[];
  const skinPoint=(p,v)=>{const point=[0,0,0],rest=p.positions.subarray(v*3,v*3+3);for(let k=0;k<4;k++){const w=p.weights[v*4+k];if(!w)continue;const m=frame.bones.subarray(p.joints[v*4+k]*16);for(let a=0;a<3;a++)point[a]+=w*(m[a]*rest[0]+m[a+4]*rest[1]+m[a+8]*rest[2]+m[a+12]);}return point;};
  for(const p of body.primitives)if(p.material===metal)for(let i=0;i<p.indices.length;i+=3){const ids=Array.from(p.indices.subarray(i,i+3));if(ids.every(v=>p.joints[v*4]===hand&&p.weights[v*4]>.999))triangles.push(ids.map(v=>skinPoint(p,v)));}
  assert.ok(triangles.length>1500,'Owen has no actual hand-bound open keyring and cut keys');
  const nearest={thumb:Infinity,index:Infinity};
  for(const p of body.primitives)if(p.material===skin)for(let v=0;v<p.vertexCount;v++)for(const finger of['thumb','index']){
    let tip=0;for(let k=0;k<4;k++)if(asset.nodes[body.skin.joints[p.joints[v*4+k]]].name==='vigil_owen_'+finger+'_tip_L')tip+=p.weights[v*4+k];if(tip<.45)continue;
    const point=skinPoint(p,v);for(const t of triangles){const d=triangleDistance(point,...t);if(Number.isFinite(d))nearest[finger]=Math.min(nearest[finger],d);}
  }
  return nearest;
}
function recorderLeadContact(asset,body,pose){
  const frame=sampleCharacterPose(asset,body,{joints:pose.joints}),rubber=asset.json.materials.findIndex(m=>m.name===body.name+' rubber'),hand=body.skin.joints.findIndex(index=>asset.nodes[index].name==='vigil_kit_hand_R'),end=add(pose.object.position,rotate([0,-.10,.008],pose.object.rotation));let nearest=Infinity,vertices=0;
  for(const p of body.primitives)if(p.material===rubber)for(let v=0;v<p.vertexCount;v++){
    if(p.joints[v*4]!==hand||p.weights[v*4]<.999)continue;vertices++;
    const point=[0,0,0],rest=p.positions.subarray(v*3,v*3+3);for(let k=0;k<4;k++){const w=p.weights[v*4+k];if(!w)continue;const m=frame.bones.subarray(p.joints[v*4+k]*16);for(let a=0;a<3;a++)point[a]+=w*(m[a]*rest[0]+m[a+4]*rest[1]+m[a+8]*rest[2]+m[a+12]);}
    nearest=Math.min(nearest,distance(point,end));
  }
  assert.ok(vertices>=8,'Kit has no body-bound recorder lead at the microphone hand');return nearest;
}
const silhouettes=new Set(),report={maxContactError:0,maxSurfaceDistance:0,maxWristAngle:0,maxFleshPenetration:0};
for(const pair of pairs){
  const bytes=readFileSync(new URL(`../public/assets/vigil-characters-${pair}.glb`,import.meta.url));
  assert.equal(manifest.packs.find(pack=>pack.file===`vigil-characters-${pair}.glb`)?.sha256,digest(bytes),`${pair} pack bytes differ from manifest`);
  const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));assert.equal(asset.entries.length,4);
  for(const id of pair.split('-')){
    const design=designs[id],layout=layouts[id],body=asset.entries.find(e=>e.name===design.mesh),part=asset.entries.find(e=>e.name===design.part),rest=new Map(rigs[id].map(b=>[b.name,b]));
    assert.ok(body&&part,`${id} needs an anatomical body and real object`);
    assert.equal(vigilCharacterIdForMesh(body.name),id);assert.equal(vigilCharacterIdForMesh(part.name),id);
    assert.equal(body.skin.joints.length,54,`${id} needs three articulated phalanges on every finger`);
    assert.equal(part.skin.joints.length,1,`${id} object needs its independent transform, shared by both hands`);
    assert.equal(asset.nodes[part.skin.joints[0]].name,`vigil_${id}_object`,`${id} prop is still bound to one wrist`);
    const skin=asset.json.materials.find(m=>m.name===`${design.mesh} skin`)?.pbrMetallicRoughness?.baseColorFactor;
    assert.deepEqual(skin?.slice(0,3),design.skin);assert.ok(skin[0]>skin[1]&&skin[1]>=skin[2],`${id} has a non-human skin palette`);
    const coatMaterial=asset.json.materials.findIndex(m=>m.name===`${body.name} coat`),coat=asset.json.materials[coatMaterial];
    assert.ok(coat?.extras?.fabric&&coat.normalTexture?.scale>0&&coat.pbrMetallicRoughness?.baseColorTexture&&coat.pbrMetallicRoughness?.metallicRoughnessTexture,`${id} lost its finished fabric material`);
    for(const primitive of body.primitives.filter(p=>p.material===coatMaterial))assert.ok(Math.max(...primitive.uv)-Math.min(...primitive.uv)>5,`${id} fabric has no physical UV repeat density`);
    for(const primitive of part.primitives)for(let vertex=0;vertex<primitive.vertexCount;vertex++){
      assert.equal(primitive.joints[vertex*4],0,`${id} prop lost its object-space skin`);assert.ok(primitive.weights[vertex*4]>.999);
    }
    for(const side of['L','R'])for(const digit of['thumb','index','middle','ring','little'])for(const suffix of['','_mid','_tip']){
      const name=digit+suffix+'_'+side,joint=body.skin.joints.findIndex(index=>asset.nodes[index].name===`vigil_${id}_${name}`);assert.ok(joint>=0,`${id} lacks ${name}`);
      let influenced=0;for(const primitive of body.primitives)for(let i=0;i<primitive.joints.length;i++)if(primitive.joints[i]===joint&&primitive.weights[i]>.05)influenced++;
      assert.ok(influenced>=15,`${id} ${name} has no meaningful skin influence`);
    }
    const idle=vigilCharacterPose(id),bodyBox=skinnedBounds(asset,body,idle),idleProp=skinnedBounds(asset,part,idle),collider=VIGIL_MESHES[design.mesh];
    const objectBack=Math.max(...part.primitives.flatMap(p=>Array.from(p.positions).filter((_,i)=>i%3===2)));
    const solidBox=layout.kind==='folder'?largestClosedBox(part):null;
    if(layout.kind==='folder')assert.ok(solidBox&&solidBox.volume>0,'folder needs an actual closed backing for penetration checks');
    for(const[box,label]of[[bodyBox,'body'],[idleProp,'prop']]){
      assert.ok(box.min[0]>=-collider.w/2-.01&&box.max[0]<=collider.w/2+.01,`${id} ${label} escapes side collision`);
      assert.ok(box.min[2]>=-collider.d/2-.01&&box.max[2]<=collider.d/2+.01,`${id} ${label} escapes depth collision`);
      assert.ok(box.min[1]>=-.03&&box.max[1]<=collider.h+.01,`${id} ${label} escapes height collision`);
    }
    silhouettes.add(`${Math.round(bodyBox.max[1]*100)}:${Math.round((bodyBox.max[0]-bodyBox.min[0])*100)}:${Math.round((bodyBox.max[2]-bodyBox.min[2])*100)}`);
    for(const action of[null,...actions[id]])for(const reducedMotion of[false,true])for(let frame=0;frame<=20;frame++){
      const progress=frame/20,pose=vigilCharacterPose(id,{action,progress,reducedMotion}),label=`${id} ${action||'idle'} ${progress}${reducedMotion?' reduced-motion':''}`;
      const transform=(name,point)=>{const b=rest.get(name),joint=pose.joints[`vigil_${id}_${name}`];return add(add(b.head,joint.translation),rotate(sub(point,b.head),joint.rotation));};
      const objectJoint=pose.joints[`vigil_${id}_object`];close(objectJoint.translation,pose.object.position,label+' object position');close(objectJoint.rotation,pose.object.rotation,label+' object rotation');
      for(const joint of Object.values(pose.joints)){
        assert.ok(joint.translation.every(Number.isFinite)&&joint.rotation.every(Number.isFinite),label+' nonfinite pose');assert.ok(Math.abs(length(joint.rotation)-1)<1e-6,label+' unnormalized pose rotation');
      }
      for(const side of['L','R']){
        const upper=rest.get('upperarm_'+side),forearm=rest.get('forearm_'+side),hand=rest.get('hand_'+side);
        close(transform(upper.name,upper.tail),transform(forearm.name,forearm.head),label+' disconnected elbow '+side);
        close(transform(forearm.name,forearm.tail),transform(hand.name,hand.head),label+' disconnected wrist '+side);
        const wristContact=pose.contacts.find(c=>c.kind==='wrist'&&c.side===side);assert.ok(wristContact&&wristContact.error<.001,label+' unreachable wrist '+side);
        const palmAxis=unit(sub(transform(hand.name,rest.get('middle_'+side).head),transform(hand.name,hand.head))),forearmAxis=unit(sub(wristContact.point,wristContact.elbow));
        const wristAngle=Math.acos(Math.max(-1,Math.min(1,dot(palmAxis,forearmAxis))));report.maxWristAngle=Math.max(report.maxWristAngle,wristAngle);
        assert.ok(wristAngle<Math.PI*.42,label+` ${side} wrist bends ${(wristAngle*180/Math.PI).toFixed(1)} degrees`);
        for(const digit of['thumb','index','middle','ring','little']){
          const links=['','_mid','_tip'].map(s=>rest.get(digit+s+'_'+side));
          close(transform(hand.name,links[0].head),transform(links[0].name,links[0].head),label+' finger detached from palm '+side+' '+digit);
          for(let segment=0;segment<3;segment++){
            const b=links[segment],head=transform(b.name,b.head),tail=transform(b.name,b.tail);
            assert.ok(Math.abs(distance(head,tail)-distance(b.head,b.tail))<1e-7,label+' changed phalanx length '+b.name);
            if(segment<2)close(tail,transform(links[segment+1].name,links[segment+1].head),label+' disconnected phalanx '+b.name);
          }
          const contact=pose.contacts.find(c=>c.kind==='finger'&&c.side===side&&c.finger===digit);assert.ok(contact,label+' missing contact record');
          close(transform(links[2].name,links[2].tail),contact.point,label+' contact does not describe rendered skeleton');
          report.maxContactError=Math.max(report.maxContactError,contact.error);assert.ok(contact.error<.003,label+' unreachable fingertip '+side+' '+digit);
          if(contact.gripped&&(frame===0||frame===10||frame===20)&&!reducedMotion){
            const inverse=pose.object.rotation.map((v,i)=>i===3?v:-v),local=rotate(sub(contact.point,pose.object.position),inverse),surfaceDistance=objectSurfaceDistance(local,part);
            report.maxSurfaceDistance=Math.max(report.maxSurfaceDistance,surfaceDistance);
            const padThickness=digit==='thumb'?.014:.013;
            assert.ok(surfaceDistance<padThickness,label+` ${side} ${digit} misses rendered prop by ${(surfaceDistance*1000).toFixed(2)}mm`);
            if(layout.kind==='folder'&&digit!=='thumb')assert.ok(local[2]>objectBack+.001,label+' fingertip is inside the solid folder backing');
          }
        }
        if(layout.hands[side])for(const digit of['thumb','index'])assert.ok(pose.contacts.some(c=>c.kind==='finger'&&c.side===side&&c.finger===digit&&c.gripped),label+' lost supporting grasp '+side);
      }
      if(frame===0||frame===20)for(const[name,joint]of Object.entries(idle.joints)){
        close(pose.joints[name].translation,joint.translation,label+' action endpoint pops translation');close(pose.joints[name].rotation,joint.rotation,label+' action endpoint pops orientation');
      }
      // All prop vertices use the independent object transform. Checking the
      // skinned centroid against the same local centroid catches double shifts.
      if(frame===10&&!reducedMotion){
        const transformed=skinnedBounds(asset,part,pose),localCenter=[0,0,0];let count=0;
        for(const p of part.primitives)for(let i=0;i<p.positions.length;i+=3){for(let axis=0;axis<3;axis++)localCenter[axis]+=p.positions[i+axis];count++;}
        close(transformed.center,add(pose.object.position,rotate(localCenter.map(v=>v/count),pose.object.rotation)),label+' rendered prop drifts from object transform');
      }
      if(frame%5===0&&!reducedMotion&&['folder','flask','microphone'].includes(layout.kind)){
        const flesh=fleshPenetrations(asset,body,pose,layout,solidBox);report.maxFleshPenetration=Math.max(report.maxFleshPenetration,flesh.maxDepth);
        assert.equal(flesh.count,0,label+` has ${flesh.count} skin vertices deeper than 2mm inside its prop (max ${(flesh.maxDepth*1000).toFixed(2)}mm; ${JSON.stringify(flesh.joints)})`);
      }
      if(frame%5===0&&!reducedMotion&&layout.kind==='map'){
        const flesh=paperSkinCrossings(asset,body,part,pose,layout);
        assert.equal(flesh.count,0,label+` paper crosses ${flesh.count} skin triangles beyond the 2mm skin tolerance (max ${(flesh.maxDepth*1000).toFixed(2)}mm; ${JSON.stringify(flesh.joints)})`);
      }
      if(id==='kit'&&(action===null||action==='camera-check')&&(frame===0||frame===10)&&!reducedMotion){
        const ear=pose.contacts.find(c=>c.kind==='wrist'&&c.side==='L'),near=headphoneHandContact(asset,body,pose);
        assert.ok(ear.elbow[1]<ear.shoulder[1]-.04&&ear.elbow[2]<ear.shoulder[2]-.10,label+' headphone elbow points up/back');
        for(const finger of['index','middle','ring'])assert.ok(near[finger]<.004,label+` ${finger} skin floats ${(near[finger]*1000).toFixed(2)}mm off its headphone`);
        const cableDistance=recorderLeadContact(asset,body,pose);assert.ok(cableDistance<.0045,label+` recorder lead is ${(cableDistance*1000).toFixed(2)}mm from its microphone input`);
      }
      if(id==='owen'&&(action===null||action==='key-check')&&(frame===0||frame===10)&&!reducedMotion){
        const keys=secondaryKeyContact(asset,body,pose);for(const finger of['thumb','index'])assert.ok(keys[finger]<.0025,label+` ${finger} skin floats ${(keys[finger]*1000).toFixed(2)}mm off the old keyring`);
      }
    }
  }
}
assert.equal(silhouettes.size,6,'the six named figures have duplicate physical silhouettes');
console.log('vigil character specs passed (object-led dual grasps, all action phases, anatomical chain continuity)',report);
