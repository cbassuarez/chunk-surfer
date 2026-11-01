import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sourceRestBodyFrame,SOURCE_REST_BODY_BENCHES} from '../src/game/source-rest-body-frame.js';
import {SOURCE_REST_SEATS,sourceRestEyeHeight,sourceRestEyePosition,sourceRestCamera,SOURCE_REST_EYE_HEIGHT,SOURCE_REST_EYE_FORWARD} from '../src/game/source-rest-seat.js';
import {sourceRestGeometryLibrary} from '../src/render/source-rest-models.js';
import {continuationSupportAt} from '../src/data/source-continuation.js';
import {sourceRestBodyPose,SOURCE_REST_HAND_ASSET,SOURCE_REST_HAND_MESHES} from '../src/render/source-rest-body.js';
import {sourceRestBodyGeometryLibrary} from '../src/render/source-rest-body-models.js';
import {sourceRestAfflictionCamera} from '../src/render/source-rest-affliction-view.js';
import {sourceRestAfflictionFrame} from '../src/game/source-rest-affliction.js';
import {SOURCE_REST_PERFORMANCE} from '../src/data/source-rest-performance.js';

const near=(a,b)=>assert.ok(Math.abs(a-b)<2e-6,`${a} != ${b}`);
function benchGlb(){
  const bytes=readFileSync(new URL('../public/assets/conservatory-props.glb',import.meta.url)),length=bytes.readUInt32LE(12),
    json=JSON.parse(bytes.subarray(20,20+length)),binary=28+length,mesh=json.meshes.find(mesh=>mesh.name==='yard_look_bench');
  const scalar=(accessor,index,component=0)=>{
    const a=json.accessors[accessor],v=json.bufferViews[a.bufferView],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],
      count={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],offset=binary+(v.byteOffset||0)+(a.byteOffset||0)+index*(v.byteStride||size*count)+component*size;
    return a.componentType===5126?bytes.readFloatLE(offset):a.componentType===5125?bytes.readUInt32LE(offset):a.componentType===5123?bytes.readUInt16LE(offset):bytes.readUInt8(offset);
  };
  return mesh.primitives.map(primitive=>{
    const position=primitive.attributes.POSITION,p=Array.from({length:json.accessors[position].count},(_,k)=>[0,1,2].map(n=>scalar(position,k,n))).flat(),
      i=Array.from({length:json.accessors[primitive.indices].count},(_,k)=>scalar(primitive.indices,k));return{p,i};
  });
}
const second=sourceRestGeometryLibrary(),third=benchGlb();
function highestSurfaceAt(models,x,z){
  let top=-Infinity;
  for(const g of models)for(let k=0;k<g.i.length;k+=3){
    const[a,b,c]=g.i.slice(k,k+3).map(index=>g.p.slice(index*3,index*3+3)),
      d=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
    if(Math.abs(d)<1e-12)continue;
    const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/d,
      v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/d,w=1-u-v;
    if(Math.min(u,v,w)>=-1e-7)top=Math.max(top,u*a[1]+v*b[1]+w*c[1]);
  }
  return top;
}

test('measured seat and arm contacts touch actual bench triangles after their actual lateral scale',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const frame=sourceRestBodyFrame(seat),models=seat.phase==='catch'?third:[second['rest-settle-frame'],second['rest-settle-cloth']],
      contacts=[...frame.contacts.seat,frame.contacts.leftArm,frame.contacts.rightArm].filter(Boolean);
    for(const contact of contacts){
      const[f,u,r]=contact.local;near(highestSurfaceAt(models,f,r/frame.benchScaleZ),u);
      near(contact.point[1],seat.feet+u);
      const supported=continuationSupportAt(contact.point[0],contact.point[2],seat);assert.ok(supported);near(supported.y,seat.feet);
    }
    if(seat.phase==='catch'){
      assert.equal(frame.contacts.leftArm,null);assert.equal(frame.contacts.rightArm,null);
      assert.equal(frame.contacts.seat.length,4,'points land on actual slats, not a synthetic filled seat');
      assert.equal(highestSurfaceAt(models,0,0),-Infinity,'the GLB has a real narrow gap between its middle slats');
    }else{
      near(frame.contacts.leftArm.local[2],-.67);near(frame.contacts.rightArm.local[2],.67);
    }
  }
});

test('the physical bench frame is anchored in world space and cannot follow a turning head or elapsed time',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const original=sourceRestBodyFrame(seat),turned=sourceRestBodyFrame({...seat,view:{yaw:seat.view.yaw+2,pitch:-1.1},time:9000}),
      moved=sourceRestBodyFrame(seat,{origin:{x:17,y:-3,z:40}});
    assert.deepEqual(turned.forward,original.forward);assert.deepEqual(turned.right,original.right);assert.deepEqual(turned.contacts,original.contacts);
    assert.equal(original.seatId,seat.id);assert.equal(original.phase,seat.phase);
    near(original.forward.reduce((sum,v,k)=>sum+v*original.right[k],0),0);
    near(Math.hypot(...original.forward),1);near(Math.hypot(...original.right),1);
    for(const[f,u,r]of[[0,0,0],[.4,.6,-.2],[.8,.04,.2]]){
      const a=original.point(f,u,r),b=moved.point(f,u,r);[17,-3,40].forEach((delta,k)=>near(b[k]-a[k],delta));
    }
    for(let k=0;k<original.contacts.seat.length;k++)[17,-3,40].forEach((delta,axis)=>near(moved.contacts.seat[k].point[axis]-original.contacts.seat[k].point[axis],delta));
  }
  assert.equal(sourceRestBodyFrame(null),null);assert.equal(sourceRestBodyFrame({phase:'ellery'}),null);
  assert.ok(Object.isFrozen(SOURCE_REST_BODY_BENCHES.catch.seatContacts[0]));
});

test('per-seat eye heights give the same credible sitting interval and the production camera uses them',()=>{
  assert.equal(SOURCE_REST_EYE_HEIGHT,1.23);assert.equal(sourceRestEyeHeight(null),1.23);
  for(const seat of SOURCE_REST_SEATS){
    const frame=sourceRestBodyFrame(seat),eye=sourceRestEyeHeight(seat),camera=sourceRestCamera(seat,{eye:[seat.x,seat.feet+1.62,seat.z],yaw:0,pitch:0},1);
    assert.equal(eye,seat.phase==='catch'?1.27:1.23);assert.ok(eye-frame.seatHeight>=.65&&eye-frame.seatHeight<=.67);
    const position=sourceRestEyePosition(seat);camera.eye.forEach((value,k)=>near(value,position[k]));
    near(camera.eye[1],seat.feet+eye);
    near((camera.eye[0]-seat.x)*frame.forward[0]+(camera.eye[2]-seat.z)*frame.forward[2],SOURCE_REST_EYE_FORWARD);
    near((camera.eye[0]-seat.x)*frame.right[0]+(camera.eye[2]-seat.z)*frame.right[2],0);
    assert.equal(camera.strictOverhead,false);assert.equal(camera.restOverride,true);
    // The supporting furniture stays below the normal central view, rather
    // than being pushed ahead of the camera to make it artificially visible.
    const f=[Math.sin(seat.view.yaw)*Math.cos(seat.view.pitch),Math.sin(seat.view.pitch),-Math.cos(seat.view.yaw)*Math.cos(seat.view.pitch)],
      r=[Math.cos(seat.view.yaw),0,Math.sin(seat.view.yaw)],up=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
    for(const contact of frame.contacts.seat){
      const delta=contact.point.map((value,k)=>value-camera.eye[k]),depth=delta.reduce((n,v,k)=>n+v*f[k],0),vertical=delta.reduce((n,v,k)=>n+v*up[k],0);
      assert.ok(depth<=0||vertical/(depth*.95)<-.8,'seat contacts stay out of the forward central composition');
    }
  }
});

const garmentModels=sourceRestBodyGeometryLibrary(),distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k])),
  column=(m,n)=>Array.from(m.slice(n*4,n*4+3)),dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),
  transform=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[k+4]*p[1]+m[k+8]*p[2]+m[k+12]);
function handAsset(){
  const bytes=readFileSync(new URL('../public/'+SOURCE_REST_HAND_ASSET,import.meta.url)),length=bytes.readUInt32LE(12),
    json=JSON.parse(bytes.subarray(20,20+length)),binary=28+length;
  const values=index=>{
    const a=json.accessors[index],v=json.bufferViews[a.bufferView],size={5121:1,5123:2,5125:4,5126:4}[a.componentType],count={SCALAR:1,VEC3:3}[a.type];
    return Array.from({length:a.count*count},(_,k)=>{const offset=binary+(v.byteOffset||0)+(a.byteOffset||0)+Math.floor(k/count)*(v.byteStride||size*count)+k%count*size;
      return a.componentType===5126?bytes.readFloatLE(offset):a.componentType===5125?bytes.readUInt32LE(offset):a.componentType===5123?bytes.readUInt16LE(offset):bytes.readUInt8(offset);});
  };
  return{json,values};
}

test('actual seated limbs retain anatomical lengths, finite right-handed bases and one bounded body submission',()=>{
  for(const seat of SOURCE_REST_SEATS)for(const presence of[.15,.5,1])for(const pain of[0,.85])for(const loss of[0,.6,1]){
    const cue={embodied:true,bodyProgress:presence,pain,facultyLoss:loss,strain:.5,progress:.3},before=structuredClone(cue),
      pose=sourceRestBodyPose({seat,cue});
    assert.equal(pose.parts.length,12);assert.equal(new Set(pose.parts.map(part=>part.id)).size,12);assert.equal(pose.contacts.length,2);
    assert.deepEqual(cue,before);assert.equal(pose.diagnostics.anchoredTo,'physical-bench');assert.equal(pose.diagnostics.independentBreathing,false);
    for(const contact of pose.contacts){
      near(distance(contact.shoulder,contact.elbow),.30);near(distance(contact.elbow,contact.wrist),.27);
      const upper=pose.parts.find(part=>part.id.endsWith('upper-sleeve-'+contact.id)),fore=pose.parts.find(part=>part.id.endsWith('affliction-sleeve-'+contact.id));
      near(Math.hypot(...column(upper.matrix,1)),.30);near(Math.hypot(...column(fore.matrix,1)),.27);
      const hand=pose.parts.find(part=>part.mesh==='rest_hand_'+contact.id),x=column(hand.matrix,0),y=column(hand.matrix,1),z=column(hand.matrix,2);
      for(const basis of[x,y,z])near(Math.hypot(...basis),1);
      near(dot(x,y),0);near(dot(y,z),0);near(dot(z,x),0);
      near(dot([x[1]*y[2]-x[2]*y[1],x[2]*y[0]-x[0]*y[2],x[0]*y[1]-x[1]*y[0]],z),1);
      const morph=hand.character.morphs;assert.ok(morph.brace>=0&&morph.slack>=0&&morph.brace+morph.slack<=1.000001);
      assert.equal(hand.character.loop,false);
    }
    for(const part of pose.parts){
      assert.ok(Array.from(part.matrix).every(Number.isFinite));assert.equal(part.restBody,true);assert.equal(part.region,seat.phase);
      assert.equal(part.structural,false);assert.equal(part.decorative,true);
      assert.ok(SOURCE_REST_HAND_MESHES.includes(part.mesh)||garmentModels[part.mesh.replace('source-continuation-','')]);
    }
  }
});

test('hands keep their real rail or clothed-thigh support while the shoulder slumps; shoes rest on the real floor',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const at=loss=>sourceRestBodyPose({seat,cue:{embodied:true,bodyProgress:1,facultyLoss:loss,pain:0,strain:0,progress:.4}}),
      initial=at(0),late=at(1);
    for(let k=0;k<initial.contacts.length;k++){
      const contact=late.contacts[k];assert.deepEqual(contact.support,initial.contacts[k].support);assert.deepEqual(contact.wrist,initial.contacts[k].wrist);
      assert.notDeepEqual(contact.shoulder,initial.contacts[k].shoulder,'the hand does not drift with the failing torso');
      const f=dot(contact.support.map((v,j)=>v-late.frame.origin[j]),late.frame.forward),r=dot(contact.support.map((v,j)=>v-late.frame.origin[j]),late.frame.right),
        height=contact.support[1]-seat.feet;
      if(contact.kind==='bench-armrest')near(highestSurfaceAt([second['rest-settle-frame']],f,r/late.frame.benchScaleZ),height);
      else{
        const lap=late.parts.find(part=>part.id.endsWith('affliction-lap')),scale=Math.hypot(...column(lap.matrix,1)),
          raw=highestSurfaceAt([garmentModels['rest-body-lap']],r,-f);
        near(lap.matrix[13]+raw*scale,contact.support[1]);
      }
    }
    assert.equal(late.contacts[0].kind,seat.phase==='catch'?'thigh':'bench-armrest');assert.equal(late.contacts[1].kind,'thigh');
    for(const shoe of late.parts.filter(part=>part.mesh.includes('rest-body-shoe-'))){
      const geometry=garmentModels[shoe.mesh.replace('source-continuation-','')],vertices=Array.from({length:geometry.p.length/3},(_,k)=>transform(shoe.matrix,geometry.p.slice(k*3,k*3+3))),
        lowest=vertices.reduce((a,b)=>a[1]<b[1]?a:b),support=continuationSupportAt(lowest[0],lowest[2],seat);
      assert.ok(support);assert.ok(lowest[1]-support.y>=.01&&lowest[1]-support.y<=.03,'sole has centimetre-scale physical floor contact');
    }
  }
});

test('held audio and turning the head cannot swim the body, while existing pain and decline drive deliberate morphs',()=>{
  for(const seat of SOURCE_REST_SEATS){
    const cue={embodied:true,bodyProgress:1,pain:0,strain:0,facultyLoss:0,progress:.3,time:120,playedSeconds:120},
      ordinary=sourceRestBodyPose({seat,cue,time:120}),held=sourceRestBodyPose({seat,cue,time:9000,elapsed:9000,paused:true}),
      head=sourceRestBodyPose({seat:{...seat,view:{yaw:seat.view.yaw+2,pitch:-1}},cue}),
      bodyRecord=p=>({parts:p.parts,contacts:p.contacts,gesture:p.gesture,diagnostics:p.diagnostics});
    assert.deepEqual(bodyRecord(held),bodyRecord(ordinary));assert.deepEqual(bodyRecord(head),bodyRecord(ordinary));
    const actualDuration=seat.phase==='catch'?843.157125:SOURCE_REST_PERFORMANCE.duration,
      correctionCue={...cue,progress:.71,facultyLoss:.5,duration:actualDuration,unwrappedTime:actualDuration*.68+.45},
      hurt=sourceRestBodyPose({seat,cue:{...cue,pain:1}}),slack=sourceRestBodyPose({seat,cue:{...cue,facultyLoss:1,progress:.9}}),
      correction=sourceRestBodyPose({seat,cue:correctionCue}),reduced=sourceRestBodyPose({seat,cue:correctionCue,reducedMotion:true});
    assert.equal(ordinary.gesture,'resting');assert.equal(hurt.gesture,seat.phase==='catch'?'resting':'brace');
    assert.equal(slack.gesture,'slackening');assert.equal(correction.gesture,'failed-readjustment');
    assert.ok(correction.contacts.every((contact,k)=>contact.palmClearance>ordinary.contacts[k].palmClearance));
    assert.equal(reduced.diagnostics.correction,0);assert.ok(reduced.contacts.every((contact,k)=>contact.palmClearance===ordinary.contacts[k].palmClearance));
    assert.deepEqual(sourceRestBodyPose({seat,cue:correctionCue,elapsed:9000}).parts,correction.parts,'held musical correction cannot advance on wall time');
    assert.equal(sourceRestBodyPose({seat,cue:{...correctionCue,unwrappedTime:actualDuration*.68+1.251}}).diagnostics.correction,0,'readjustment ends within1.25 actual heard seconds');
    assert.ok(slack.contacts.every(contact=>contact.slack>0));assert.equal(slack.diagnostics.syntheticPain,false);
    if(seat.phase==='catch')assert.ok(hurt.contacts.every(contact=>contact.brace===0),'no fabricated Couperin mistake reaction');
    for(const input of[{cue:{...cue,embodied:false}},{cue:{...cue,bodyProgress:0}},{seat:null}]){
      const absent=sourceRestBodyPose({seat,cue,...input});assert.deepEqual(absent.parts,[]);assert.deepEqual(absent.contacts,[]);assert.equal(absent.gesture,'absent');
    }
  }
});

test('published anatomical hands expose finite brace/slack morphs and exactly one open wrist boundary',()=>{
  const {json,values}=handAsset();
  assert.deepEqual(json.meshes.map(mesh=>mesh.name),SOURCE_REST_HAND_MESHES);assert.ok(!json.animations?.length,'no separate animation clock starts with the hands');
  for(const mesh of json.meshes){
    assert.deepEqual(mesh.extras.targetNames,['brace','slack']);assert.deepEqual(mesh.extras.wristOrigin,[0,0,0]);
    assert.equal(mesh.primitives.length,1);const primitive=mesh.primitives[0],positions=values(primitive.attributes.POSITION),indices=values(primitive.indices),edges=new Map();
    assert.ok(positions.every(Number.isFinite));assert.equal(primitive.targets.length,2);
    for(const target of primitive.targets){const morph=values(target.POSITION),normals=values(target.NORMAL);
      assert.equal(morph.length,positions.length);assert.equal(normals.length,positions.length);assert.ok(morph.every(Number.isFinite)&&normals.every(Number.isFinite));
      assert.ok(morph.some(value=>Math.abs(value)>.001),'the named pose actually changes anatomical vertices');
    }
    for(let k=0;k<indices.length;k+=3)for(let n=0;n<3;n++){const key=[indices[k+n],indices[k+(n+1)%3]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
    assert.ok([...edges.values()].every(count=>count===1||count===2));
    const boundary=[...edges].filter(([,count])=>count===1).map(([key])=>key.split(':').map(Number)),neighbors=new Map();
    for(const[a,b]of boundary){if(!neighbors.has(a))neighbors.set(a,[]);if(!neighbors.has(b))neighbors.set(b,[]);neighbors.get(a).push(b);neighbors.get(b).push(a);}
    assert.ok(boundary.length>=16&&boundary.length<=32);assert.ok([...neighbors.values()].every(adjacent=>adjacent.length===2));
    const visited=new Set(),pending=[boundary[0][0]];while(pending.length){const id=pending.pop();if(visited.has(id))continue;visited.add(id);pending.push(...neighbors.get(id));}
    assert.equal(visited.size,neighbors.size,'the only open surface is one continuous wrist seam');
  }
});

test('actual hands and garments leave the forward composition clear and become visible by looking into the lap',()=>{
  const {json,values}=handAsset(),hands=Object.fromEntries(json.meshes.map(mesh=>[mesh.name,{p:values(mesh.primitives[0].attributes.POSITION)}]));
  const projected=(camera,p)=>{
    const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),
      f=[sy*cp,sp,-cy*cp],r=[cy,0,sy],u=[-sy*sp,cp,cy*sp],d=p.map((v,k)=>v-camera.eye[k]),depth=dot(d,f);
    return depth>.02?{x:dot(d,r)/(depth*.95*(16/9)),y:dot(d,u)/(depth*.95),depth}:null;
  };
  for(const seat of SOURCE_REST_SEATS){
    const pose=sourceRestBodyPose({seat,cue:{embodied:true,bodyProgress:1,pain:0,strain:0,facultyLoss:0,progress:.3}}),
      camera=sourceRestCamera(seat,{eye:[seat.x,seat.feet+1.62,seat.z],yaw:0,pitch:0},1),down={...camera,pitch:-.95};
    for(const part of pose.parts){
      const geometry=hands[part.mesh]||garmentModels[part.mesh.replace('source-continuation-','')],
        points=Array.from({length:geometry.p.length/3},(_,k)=>transform(part.matrix,geometry.p.slice(k*3,k*3+3))),
        forward=points.map(p=>projected(camera,p)).filter(Boolean),lookedDown=points.map(p=>projected(down,p)).filter(Boolean),
        central=forward.filter(p=>Math.abs(p.x)<.55&&Math.abs(p.y)<.55);
      assert.equal(central.length,0,`${seat.id}/${part.mesh} must not be suspended across the normal central view`);
      if(part.mesh.startsWith('rest_hand_')||part.mesh.endsWith('rest-body-lap'))
        assert.ok(lookedDown.some(p=>Math.abs(p.x)<=1&&Math.abs(p.y)<=1),`${seat.id}/${part.mesh} is genuinely visible at its world position when looking down`);
    }
  }
});

test('the actual hand surfaces have clear rays past jacket and lap from the forward eye, including slack morphs',()=>{
  const {json,values}=handAsset(),handData=Object.fromEntries(json.meshes.map(mesh=>{
    const primitive=mesh.primitives[0];return[mesh.name,{p:values(primitive.attributes.POSITION),i:values(primitive.indices),
      morphs:primitive.targets.map((target,k)=>({name:mesh.extras.targetNames[k],p:values(target.POSITION)}))}];
  }));
  const sub=(a,b)=>a.map((v,k)=>v-b[k]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
    rayBlocked=(eye,point,triangles)=>{
      const direction=sub(point,eye);
      return triangles.some(([a,b,c])=>{
        const e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-10)return false;
        const relative=sub(eye,a),u=dot(relative,h)/det;if(u<0||u>1)return false;
        const q=cross(relative,e1),v=dot(direction,q)/det;if(v<0||u+v>1)return false;
        const t=dot(e2,q)/det;return t>1e-6&&t<1-1e-5;
      });
    };
  const reported=SOURCE_REST_PERFORMANCE.annotations.find(row=>row.type==='mistake'&&row.start>454&&row.start<470),
    hurt=sourceRestAfflictionFrame({active:true,currentTime:reported.start+.03,playedSeconds:reported.start+.03,progress:.87});
  assert.ok(hurt.pain>0&&hurt.latestMistake.id===reported.id);
  let oldEyeOcclusions=0,checked=0;
  for(const seat of SOURCE_REST_SEATS)for(const state of[
    {name:'neutral',pain:0,strain:0,facultyLoss:0,progress:.3},
    {name:'slack',pain:0,strain:.6,facultyLoss:1,progress:.9},
    ...(seat.phase==='wrong-return'?[{...hurt,name:'reported-pain'}]:[]),
  ]){
    const cue={...state,embodied:true,bodyProgress:1},pose=sourceRestBodyPose({seat,cue}),
      eye=sourceRestAfflictionCamera({eye:sourceRestEyePosition(seat),yaw:seat.view.yaw,pitch:seat.view.pitch},cue).eye,
      oldEye=eye.map((v,k)=>v-pose.frame.forward[k]*SOURCE_REST_EYE_FORWARD),
      occluders=pose.parts.filter(part=>part.mesh.endsWith('rest-body-jacket')||part.mesh.endsWith('rest-body-lap')).flatMap(part=>{
        const g=garmentModels[part.mesh.replace('source-continuation-','')];
        return Array.from({length:g.i.length/3},(_,k)=>g.i.slice(k*3,k*3+3).map(index=>transform(part.matrix,g.p.slice(index*3,index*3+3))));
      });
    for(const hand of pose.parts.filter(part=>part.mesh.startsWith('rest_hand_'))){
      const g=handData[hand.mesh],morphed=g.p.map((v,k)=>v+g.morphs.reduce((sum,morph)=>sum+morph.p[k]*(hand.character.morphs[morph.name]||0),0)),
        surface=[];
      for(let k=0;k<g.i.length;k+=3){
        const vertices=g.i.slice(k,k+3).map(index=>morphed.slice(index*3,index*3+3)),normal=cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0]));
        if(normal[1]>Math.hypot(...normal)*.30)surface.push(vertices[0].map((v,j)=>(v+vertices[1][j]+vertices[2][j])/3));
      }
      assert.ok(surface.length>=24,'actual dorsal triangles provide a spread of ray targets');
      for(let k=0;k<24;k++){
        const target=transform(hand.matrix,surface[Math.floor(k*(surface.length-1)/23)]);
        assert.equal(rayBlocked(eye,target,occluders),false,`${seat.id}/${hand.mesh}/${state.name}: torso or lap hides actual hand surface ${k}`);
        if(rayBlocked(oldEye,target,occluders))oldEyeOcclusions++;checked++;
      }
    }
  }
  assert.equal(checked,240);assert.ok(oldEyeOcclusions>0,'the old over-pelvis eye must reproduce the actual defect this regression guards');
});
