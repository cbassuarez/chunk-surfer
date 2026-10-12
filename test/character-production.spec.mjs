import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';

const bytes=readFileSync(new URL('../public/assets/outskirts-characters.glb',import.meta.url));
const asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
function deform(entry,primitive,v,pose){
  const p=Array.from(primitive.positions.subarray(v*3,v*3+3));
  for(let m=0;m<entry.morphCount;m++)for(let k=0;k<3;k++)p[k]+=primitive.targets[m].positions[v*3+k]*pose.morphs[m];
  const q=[0,0,0];for(let j=0;j<4;j++){const at=primitive.joints[v*4+j]*16,w=primitive.weights[v*4+j];for(let k=0;k<3;k++)q[k]+=(pose.bones[at+k]*p[0]+pose.bones[at+4+k]*p[1]+pose.bones[at+8+k]*p[2]+pose.bones[at+12+k])*w;}return q;
}
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((n,x,k)=>n+x*b[k],0);
function jointIndex(entry,name){const j=entry.skin.joints.findIndex(n=>asset.nodes[n].name===name);assert.ok(j>=0,`missing joint ${name}`);return j;}
function bindPosition(entry,name){
  const m=entry.skin.inverseBind[jointIndex(entry,name)],a=Array.from(m.subarray(0,3)),b=Array.from(m.subarray(4,7)),c=Array.from(m.subarray(8,11)),t=Array.from(m.subarray(12,15),x=>-x),det=dot(a,cross(b,c));
  assert.ok(Math.abs(det)>1e-8,'inverse bind must be invertible');
  return[dot(t,cross(b,c))/det,dot(a,cross(t,c))/det,dot(a,cross(b,t))/det];
}
function jointPosition(entry,name,pose){const p=bindPosition(entry,name),at=jointIndex(entry,name)*16;return[0,1,2].map(k=>pose.bones[at+k]*p[0]+pose.bones[at+4+k]*p[1]+pose.bones[at+8+k]*p[2]+pose.bones[at+12+k]);}
function jointDirection(entry,name,pose,direction){const at=jointIndex(entry,name)*16,p=[0,1,2].map(k=>pose.bones[at+k]*direction[0]+pose.bones[at+4+k]*direction[1]+pose.bones[at+8+k]*direction[2]),length=Math.hypot(...p);return p.map(x=>x/length);}

// Read only the two actual static support meshes. This avoids declaring a
// floating seated body valid merely because an authored number says 'seat'.
const props=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),propView=new DataView(props.buffer,props.byteOffset,props.byteLength);let propJson,propBin;
for(let at=12;at<props.length;){const length=propView.getUint32(at,true),type=propView.getUint32(at+4,true),chunk=props.subarray(at+8,at+8+length);if(type===0x4e4f534a)propJson=JSON.parse(new TextDecoder().decode(chunk).trim());if(type===0x004e4942)propBin=chunk;at+=8+length;}
function supportMesh(name){
  const mesh=propJson.meshes.find(m=>m.name===name);assert.ok(mesh,`missing physical support ${name}`);const triangles=[];
  function values(index,width){const a=propJson.accessors[index],v=propJson.bufferViews[a.bufferView],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],read={5121:'getUint8',5123:'getUint16',5125:'getUint32',5126:'getFloat32'}[a.componentType],d=new DataView(propBin.buffer,propBin.byteOffset,propBin.byteLength),start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||bytes*width;return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>d[read](start+i*stride+k*bytes,true)));}
  for(const p of mesh.primitives){const positions=values(p.attributes.POSITION,3),indices=values(p.indices,1).flat();for(let i=0;i<indices.length;i+=3)triangles.push(indices.slice(i,i+3).map(v=>positions[v]));}
  return triangles;
}
function surfaceY(triangles,x,z,near){let result=null,gap=Infinity;for(const[a,b,c]of triangles){const det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);if(Math.abs(det)<1e-9)continue;const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det,w=1-u-v;if(Math.min(u,v,w)<-1e-5)continue;const y=u*a[1]+v*b[1]+w*c[1],d=Math.abs(y-near);if(d<gap){gap=d;result=y;}}return result;}
assert.deepEqual(asset.entries.map(e=>e.name).sort(),['outskirts_fold_guard','outskirts_overprint_body']);
for(const name of['fold','writhe','idle','walk','turn'])assert.ok(asset.clips.has(name),`missing production clip ${name}`);
// Finite palettes and conservative bounds cannot detect bad weights pulling a
// small patch of skin or clothing into a long spike. Measure real indexed
// edges in the performances each role actually uses. The generous extension
// limit permits the forced twist; it does not stand in for visual approval.
let worstExtension={ratio:0};
for(const entry of asset.entries){
  const bind=sampleCharacterPose(asset,entry,{}),clips=entry.name==='outskirts_fold_guard'?['idle','fold','writhe']:['idle','walk','turn'];
  const surfaces=entry.primitives.map(primitive=>{
    const points=Array.from({length:primitive.vertexCount},(_,v)=>deform(entry,primitive,v,bind)),edges=[],seen=new Set();
    for(let i=0;i<primitive.indices.length;i+=3)for(let k=0;k<3;k++){
      const a=primitive.indices[i+k],b=primitive.indices[i+(k+1)%3],key=Math.min(a,b)*primitive.vertexCount+Math.max(a,b);if(seen.has(key))continue;seen.add(key);
      const rest=distance(points[a],points[b]);if(rest>.005)edges.push({a,b,rest});
    }
    return{primitive,edges};
  });
  for(const clip of clips){const duration=asset.clips.get(clip).duration;
    for(const time of[...new Set([0,1.1,2.55,duration*.25,duration*.5,duration*.75,duration].filter(t=>t<=duration))]){
      const pose=sampleCharacterPose(asset,entry,{clip,time});
      for(const{primitive,edges}of surfaces){
        const points=Array.from({length:primitive.vertexCount},(_,v)=>deform(entry,primitive,v,pose));
        for(const{a,b,rest}of edges){const length=distance(points[a],points[b]),ratio=length/rest;
          if(ratio>worstExtension.ratio)worstExtension={ratio,mesh:entry.name,material:asset.json.materials[primitive.material]?.name,clip,time,rest,length};
        }
      }
    }
  }
}
assert.ok(worstExtension.ratio<8,`exported surface stretches ${worstExtension.ratio.toFixed(2)}x (${(worstExtension.rest*1000).toFixed(1)} to ${(worstExtension.length*1000).toFixed(1)}mm): ${worstExtension.mesh}/${worstExtension.material}/${worstExtension.clip}@${worstExtension.time}`);
for(const entry of asset.entries){
  assert.equal(entry.skin.joints.length,34);
  assert.deepEqual(entry.morphNames,['rib_compression','shoulder_tension','throat_strain','mouth_pain']);
  for(const name of['neck','head','jaw'])assert.ok(entry.skin.joints.some(i=>asset.nodes[i].name===name),`missing runtime override joint ${name}`);
  for(const [name,clip]of asset.clips)for(const time of[0,.5,1,2.55,clip.duration/2,clip.duration]){
    const pose=sampleCharacterPose(asset,entry,{clip:name,time});
    assert.ok([...pose.bones,...pose.morphs,...pose.bounds.min,...pose.bounds.max].every(Number.isFinite),`${entry.name}/${name}/${time} has non-finite deformation`);
    // Sample real exported vertices under weighted skinning and correctives;
    // conservative bounds must remain safe through forced twist and pain.
    for(const primitive of entry.primitives)for(let v=0;v<primitive.vertexCount;v+=Math.max(1,Math.floor(primitive.vertexCount/16))){
      const q=deform(entry,primitive,v,pose);
      for(let k=0;k<3;k++)assert.ok(q[k]>=pose.bounds.min[k]-1e-4&&q[k]<=pose.bounds.max[k]+1e-4,`${entry.name}/${name} escapes animated bounds`);
    }
  }
  const forceEnd=sampleCharacterPose(asset,entry,{clip:'fold',time:12}),painStart=sampleCharacterPose(asset,entry,{clip:'writhe',time:0}),painEnd=sampleCharacterPose(asset,entry,{clip:'writhe',time:24});
  for(let i=0;i<forceEnd.bones.length;i++){assert.ok(Math.abs(forceEnd.bones[i]-painStart.bones[i])<1e-4,'fold-to-pain seam changes body pose');assert.ok(Math.abs(painStart.bones[i]-painEnd.bones[i])<1e-4,'pain loop seam resets body pose');}
  for(let i=0;i<4;i++){assert.ok(Math.abs(forceEnd.morphs[i]-painStart.morphs[i])<1e-4,'corrective jumps at continuation');assert.ok(Math.abs(painStart.morphs[i]-painEnd.morphs[i])<1e-4,'corrective jumps at loop seam');}
}

// The fold remains seated and faces the road, but the cranium must lie beyond
// the right thigh. A centered face between the knees changes the pose's read.
// Check a real weighted mouth landmark as well as the head joint and supports.
const guard=asset.entries.find(e=>e.name==='outskirts_fold_guard'),rest=sampleCharacterPose(asset,guard,{clip:'fold',time:0}),palmTarget=[-.55,.82,-.14],chair=supportMesh('outskirts_fold_chair'),ledge=supportMesh('outskirts_fold_sideledge');
assert.ok(Math.abs(surfaceY(chair,0,.04,.47)-.47)<.003,'the exported chair seat must support the authored seated pose');
assert.ok(Math.abs(surfaceY(ledge,palmTarget[0],palmTarget[2],.82)-.82)<.003,'the exported side ledge must meet the left palm');
function closestWeighted(target,names,minWeight=.7){
  const joints=new Set(guard.skin.joints.flatMap((node,i)=>names.test(asset.nodes[node].name)?[i]:[]));let best=null;
  for(const primitive of guard.primitives)for(let v=0;v<primitive.vertexCount;v++){
    let weight=0;for(let j=0;j<4;j++)if(joints.has(primitive.joints[v*4+j]))weight+=primitive.weights[v*4+j];
    if(weight<minWeight)continue;const p=deform(guard,primitive,v,rest),d=distance(p,target);if(!best||d<best.distance)best={primitive,v,p,distance:d};
  }return best;
}
const palm=closestWeighted(palmTarget,/^(?:forearm|hand|thumb|index|middle|ring|little)_L$/,.95);
assert.ok(palm&&palm.distance<.020,'the actual left palm misses the physical side ledge');
const palmSupport=surfaceY(ledge,palm.p[0],palm.p[2],.82);assert.notEqual(palmSupport,null,'left palm must lie over the exported ledge');assert.ok(Math.abs(palm.p[1]-palmSupport)<.010,'left palm must actually meet the ledge surface');
const seatContacts=[-.12,.12].map(x=>closestWeighted([x,.47,.04],/^(?:pelvis|thigh_[LR])$/));
assert.ok(seatContacts.every(p=>p&&p.distance<.055),'both actual clothed buttocks must contact the seat');
// The mapped 'spine_upper' joint is lower-thoracic, not the jacket's visible
// hump. Use a real posterior upper-back surface patch and its 95th percentile
// height so one stray vertex cannot satisfy the silhouette requirement.
const backJoints=new Set(guard.skin.joints.flatMap((node,i)=>/^(?:spine_upper|chest|clavicle_[LR])$/.test(asset.nodes[node].name)?[i]:[])),backPatch=[],bindChest=bindPosition(guard,'chest'),bindSpine=bindPosition(guard,'spine_upper'),bindNeck=bindPosition(guard,'neck');
for(const primitive of guard.primitives){if(!/workcoat_guard/.test(asset.json.materials[primitive.material]?.name||''))continue;for(let v=0;v<primitive.vertexCount;v++){let weight=0;for(let j=0;j<4;j++)if(backJoints.has(primitive.joints[v*4+j]))weight+=primitive.weights[v*4+j];if(weight>.55&&primitive.positions[v*3+1]>bindSpine[1]-.04&&primitive.positions[v*3+1]<bindNeck[1]+.08&&primitive.positions[v*3+2]>bindChest[2]+.02)backPatch.push({primitive,v});}}
assert.ok(backPatch.length>20,'the real upper-back coat patch must be identifiable');
// Keep one authored underside-palm surface landmark fixed while the jacket
// and hand writhe. Nearest contact is measured against the real moving coat,
// not a wrist joint or a different fingertip selected anew every frame.
const clutchSource=[.50875586,1.09416747,-.29024392],clutchJoints=new Set(guard.skin.joints.flatMap((node,i)=>/^(?:hand|thumb|index|middle|ring|little)_R$/.test(asset.nodes[node].name)?[i]:[]));let clutch=null;
for(const primitive of guard.primitives)for(let v=0;v<primitive.vertexCount;v++){let weight=0;for(let j=0;j<4;j++)if(clutchJoints.has(primitive.joints[v*4+j]))weight+=primitive.weights[v*4+j];if(weight<.9)continue;const d=distance(Array.from(primitive.positions.subarray(v*3,v*3+3)),clutchSource);if(!clutch||d<clutch.distance)clutch={primitive,v,distance:d};}
assert.ok(clutch&&clutch.distance<.001,'the authored underside-palm landmark must remain on the exported hand');
const mouthSource=[0,1.5850901604,-.1316766888];let mouth=null;
const mouthJoints=new Set(guard.skin.joints.flatMap((node,i)=>/^(?:jaw|head|neck)$/.test(asset.nodes[node].name)?[i]:[]));
for(const primitive of guard.primitives)for(let v=0;v<primitive.vertexCount;v++){
  let weight=0;for(let j=0;j<4;j++)if(mouthJoints.has(primitive.joints[v*4+j]))weight+=primitive.weights[v*4+j];
  if(weight<.95)continue;const d=distance(Array.from(primitive.positions.subarray(v*3,v*3+3)),mouthSource);if(!mouth||d<mouth.distance)mouth={primitive,v,distance:d};
}
assert.ok(mouth&&mouth.distance<.001,'the actual anatomical mouth landmark must be present');
const soles=[];
for(const primitive of guard.primitives){if(!/sole/i.test(asset.json.materials[primitive.material]?.name||''))continue;
  let bottom=Infinity;for(let v=0;v<primitive.vertexCount;v++)bottom=Math.min(bottom,primitive.positions[v*3+1]);
  for(let v=0;v<primitive.vertexCount;v++)if(primitive.positions[v*3+1]<bottom+.012)soles.push({primitive,v,p:deform(guard,primitive,v,rest)});
}
assert.ok(soles.some(s=>s.p[0]<-.05)&&soles.some(s=>s.p[0]>.05),'both exported boot soles must be sampled');
for(const sign of[-1,1]){const boot=soles.filter(s=>Math.sign(s.p[0])===sign),center=[0,1,2].map(k=>boot.reduce((n,s)=>n+s.p[k],0)/boot.length);assert.ok(Math.abs(center[0]-sign*.20)<.07&&Math.abs(center[2]+.51)<.12,'seated boots must sit forward beneath the knees');const gaps=boot.map(s=>{const y=surfaceY(chair,s.p[0],s.p[2],0);assert.notEqual(y,null,'boot must lie over the physical paving apron');return s.p[1]-y;});assert.ok(Math.abs(Math.min(...gaps))<.006,'each boot must have actual ground contact');}
let palmDrift=0,soleDrift=0,seatGap=0,clutchGap=0;
for(const clip of['fold','writhe'])for(const time of[...new Set([...Array.from({length:Math.round(asset.clips.get(clip).duration/.25)+1},(_,i)=>i*.25),...(clip==='fold'?[1.1,2.55]:[])])].sort((a,b)=>a-b)){
  const pose=sampleCharacterPose(asset,guard,{clip,time}),pelvis=jointPosition(guard,'pelvis',pose),head=jointPosition(guard,'head',pose);
  assert.ok(pelvis[1]>.52&&pelvis[1]<.65&&Math.abs(pelvis[2]-.05)<.10,`${clip}@${time}: pelvis must remain seated`);
  for(const side of['L','R']){const knee=jointPosition(guard,`shin_${side}`,pose);assert.ok(knee[2]<pelvis[2]-.25&&knee[1]>.34&&knee[1]<.65,`${clip}@${time}: ${side} knee must project forward from the seat`);}
  if(clip==='writhe'||time>=2.55){
    assert.ok(head[1]>.72&&head[1]<.90&&head[2]<pelvis[2]-.20&&head[0]>.30,`${clip}@${time}: the head must fold diagonally outside the right thigh`);
    const lip=deform(guard,mouth.primitive,mouth.v,pose);
    assert.ok(lip[0]>.28&&lip[1]>pelvis[1]+.25,`${clip}@${time}: the real mouth must remain laterally clear of the lap and above the pelvis`);
    const back=backPatch.map(p=>deform(guard,p.primitive,p.v,pose)).sort((a,b)=>a[1]-b[1]),arch=back[Math.floor(back.length*.95)];
    assert.ok(arch[1]>.90&&arch[1]<1.25&&arch[1]>head[1]+.15,`${clip}@${time}: actual upper-back coat must form a visible arch above the diagonal head (back ${arch[1].toFixed(3)}, head ${head[1].toFixed(3)})`);
    const palmPoint=deform(guard,clutch.primitive,clutch.v,pose),gap=Math.min(...back.map(p=>distance(p,palmPoint)));clutchGap=Math.max(clutchGap,gap);assert.ok(gap<.035,`${clip}@${time}: right palm must retain its jacket-back clutch (${(gap*1000).toFixed(1)}mm gap)`);
    const up=jointDirection(guard,'head',pose,[0,1,0]),face=jointDirection(guard,'head',pose,[0,0,-1]);
    assert.ok(up[0]>.55&&up[1]<-.55&&face[2]<-.80&&face[1]>.15,`${clip}@${time}: the sideways face must turn outward and upward, away from the pelvis`);
  }
  palmDrift=Math.max(palmDrift,distance(deform(guard,palm.primitive,palm.v,pose),palm.p));
  for(const contact of seatContacts){const p=deform(guard,contact.primitive,contact.v,pose),support=surfaceY(chair,p[0],p[2],.47);assert.notEqual(support,null,'seated support must remain over the actual chair');seatGap=Math.max(seatGap,Math.abs(p[1]-support));}
  for(const sole of soles){const p=deform(guard,sole.primitive,sole.v,pose),support=surfaceY(chair,p[0],p[2],0);assert.notEqual(support,null,'boots must remain over the physical paving apron');assert.ok(p[1]>=support-.006&&p[1]<=support+.020,'actual sole must meet the ground without penetration or hovering');soleDrift=Math.max(soleDrift,distance(p,sole.p));}
}
assert.ok(jointPosition(guard,'head',rest)[1]>1.15,'the seated initial pose must be upright before the force begins');
assert.ok(jointDirection(guard,'head',rest,[0,1,0])[1]>.75&&jointDirection(guard,'head',rest,[0,0,-1])[2]<-.5,'the initial seated face must look forward before the force');
assert.ok(palmDrift<.003,`weighted left palm slides ${(palmDrift*1000).toFixed(3)}mm`);
assert.ok(soleDrift<.001,`weighted boot sole slides ${(soleDrift*1000).toFixed(3)}mm`);
assert.ok(seatGap<.035,`clothed seat contact misses the chair by ${(seatGap*1000).toFixed(1)}mm`);

// Overprint replays an ordinary human gait. Same-side arm/leg swing made the
// final body march unnaturally even though its walk clip was continuous.
// Recover each exported joint's bind position from its actual inverse bind,
// then apply the sampled palette rather than inferring motion from clip names.
const walker=asset.entries.find(e=>e.name==='outskirts_overprint_body');
const walkDuration=asset.clips.get('walk').duration,walkA=sampleCharacterPose(asset,walker,{clip:'walk',time:0}),walkB=sampleCharacterPose(asset,walker,{clip:'walk',time:walkDuration/2}),walkEnd=sampleCharacterPose(asset,walker,{clip:'walk',time:walkDuration});
for(const side of['L','R']){
  const hand=`hand_${side}`,foot=`foot_${side}`,handTravel=jointPosition(walker,hand,walkA)[2]-jointPosition(walker,hand,walkB)[2],footTravel=jointPosition(walker,foot,walkA)[2]-jointPosition(walker,foot,walkB)[2];
  assert.ok(Math.abs(handTravel)>.10&&Math.abs(footTravel)>.40,`${side} gait must actually swing an arm and leg`);
  assert.ok(handTravel*footTravel<0,`${side} hand and foot must move in opposite phases`);
  for(const name of[hand,foot])assert.ok(distance(jointPosition(walker,name,walkA),jointPosition(walker,name,walkEnd))<.001,`${name} jumps at the gait loop seam`);
}
console.log(`production character GLB: bounded asset, seated diagonal fold and clear mouth/lap separation, physical support, continuous pain, animated bounds, surface extension and gait passed (edge ${worstExtension.ratio.toFixed(2)}x; palm ${(palmDrift*1000).toFixed(3)}mm; sole ${(soleDrift*1000).toFixed(3)}mm; seat ${(seatGap*1000).toFixed(1)}mm; clutch ${(clutchGap*1000).toFixed(1)}mm)`);
