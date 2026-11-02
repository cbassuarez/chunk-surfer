import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceRestWeatherScore} from '../src/game/source-rest-weather-score.js';
import {createSourceRestWeather} from '../src/audio/source-rest-weather.js';
import {sourceRestFuneralPlan,SOURCE_REST_FUNERAL_BELLS} from '../src/game/source-rest-funeral-director.js';
import {sourceRestBellGeometryLibrary,sourceRestBellProps} from '../src/render/source-rest-bells.js';
import {sourceRestCatchScenery} from '../src/game/source-rest-catch-scenery.js';
import {sourceRestCouperinAffliction} from '../src/game/source-rest-couperin-affliction.js';
import {sourceRestHarpsichordGeometryLibrary,sourceRestHarpsichordSeatGeometry} from '../src/render/source-rest-harpsichord-models.js';
import {sourceRestHarpsichordBoardGeometry} from '../src/render/source-rest-harpsichord-board.js';
import {SOURCE_REST_SEATS,sourceRestEyePosition} from '../src/game/source-rest-seat.js';
import {continuationSupportAt,continuationRadialPoint} from '../src/data/source-continuation.js';
import {freshSourceContinuation,normalizeSourceContinuation} from '../src/game/source-continuation.js';
import {sourceContinuationRenderFrame,installSourceContinuationMeshes} from '../src/render/source-continuation-renderer.js';

function audioHarness(){
  const ctx={state:'running',currentTime:0},destination={},hits=[],stops=[];
  const owner=createSourceRestWeather({getAudio:()=>({ctx,destination}),
    makeFlood:()=>({input:{},update(){},pause(){},dispose(){}}),makeVoice:()=>({update(){},stop(){}}),
    makeThunder:()=>({prepare(){return true;},strike(){return true;},stop(){}}),
    makeBells:()=>({prepare:async()=>true,update(){},strike:event=>{hits.push(event);return true;},pause(){stops.push('hold');},fade(){stops.push('fade');},dispose(){}})});
  return{owner,ctx,hits,stops,update(cue,extra={}){ctx.currentTime=cue.funeral?.audioTime||0;owner.update({active:true,cue,...extra});}};
}
const stateFor=(phase,cue)=>{
  const seat=SOURCE_REST_SEATS.find(value=>value.phase===phase);
  return{...normalizeSourceContinuation({...freshSourceContinuation(),status:'active',phase,chartId:0,level:seat.level,feet:seat.feet,...seat.approach}),
    sourceRestView:{seatId:seat.id,progress:1,look:seat.view,musicTime:cue.funeral.clock,audibleSeconds:cue.clock,weatherCue:cue,musicPlaying:true,musicSignal:.5,musicRevoicing:{electronic:.5}}};
};

test('one score update sends the same physical funeral contacts to both audio and scene, for both performances',()=>{
  for(const phase of['wrong-return','catch']){
    const score=createSourceRestWeatherScore(),audio=audioHarness(),expected=sourceRestFuneralPlan(phase);let contacts=0;
    for(let mediaTime=0;mediaTime<850;mediaTime+=.04){
      const cue=score.update({phase,active:true,seated:false,musicTime:mediaTime,audibleSeconds:mediaTime,audioTime:mediaTime/.72,playbackRate:.72});
      assert.equal(cue.judgment.bellContacts,true);assert.equal(cue.judgment.bellEvents,cue.funeral.contacts);assert.equal(cue.judgment.bells,cue.funeral.bells);assert.equal(cue.musicDuck,cue.funeral.musicDuck);
      audio.update(cue);audio.update(cue);
      for(const event of cue.funeral.contacts){
        contacts++;const props=sourceRestBellProps(stateFor(phase,cue)),mouth=props.find(p=>p.bellId===event.bellId&&p.bellPart==='bell');
        assert.equal(mouth.strikeId,event.id);assert.equal(mouth.contact,cue.funeral.bells.find(b=>b.id===event.bellId).impact);
        assert.equal(props.filter(p=>p.bellId===event.bellId).length,5);assert.equal(props.filter(p=>p.bellId===event.bellId&&p.muffled).length,1);
      }
    }
    assert.equal(contacts,expected.length);assert.equal(audio.hits.length,expected.length);assert.deepEqual(audio.hits.map(v=>v.id),expected.map(v=>v.id));audio.owner.dispose();
  }
});

test('an already admitted contact survives a slightly different host playhead and is still delivered once',()=>{
  const phase='catch',score=createSourceRestWeatherScore(),audio=audioHarness(),at=sourceRestFuneralPlan(phase)[0].at;
  score.update({phase,musicTime:at-.05,audioTime:40,audibleSeconds:at-.05});
  const cue=score.update({phase,musicTime:at,audioTime:40.05,audibleSeconds:at});
  cue.judgment={...cue.judgment,clock:at-.08};
  audio.update(cue);audio.update(cue);assert.equal(audio.hits.length,1);assert.equal(audio.hits[0].at,at);
  audio.owner.pause();audio.update(cue);assert.equal(audio.hits.length,1,'same stored contact cannot replay after lifecycle resume');audio.owner.dispose();
});

test('global funeral duty continues outside local weather and entering the refuge retains the same duty history',()=>{
  for(const phase of['wrong-return','catch']){
    const score=createSourceRestWeatherScore(),audio=audioHarness(),plan=sourceRestFuneralPlan(phase),at=plan[0].at;
    const update=(t,active)=>{
      const cue=score.update({phase,active,funeralActive:true,seated:false,musicTime:t,audibleSeconds:t,audioTime:t/.72,playbackRate:.72});
      audio.update(cue);return cue;
    };
    update(at-.05,false);const remote=update(at,false);
    assert.equal(remote.stage,'absent');assert.equal(remote.sunset.active,false);assert.equal(remote.sunset.amount,0);assert.equal(remote.rain,0);assert.deepEqual(remote.particles,[]);
    assert.deepEqual(remote.judgment.flashes,[]);assert.deepEqual(remote.judgment.thunder,[]);assert.equal(remote.judgment.active,true,'bell contact carrier stays audible independently of weather');
    assert.equal(remote.funeral.contacts.length,1);assert.equal(audio.hits.length,1);assert.ok(remote.musicDuck.gain<1);
    const local=update(at,true);assert.equal(local.funeral.contacts.length,0);assert.equal(local.funeral.diagnostics.totalContacts,1);assert.equal(audio.hits.length,1);
    assert.equal(local.stage,'last-sunset');assert.equal(local.sunset.active,true);assert.equal(local.funeral.bells.find(b=>b.id===plan[0].bellId).lastStrikeId,plan[0].id);
    for(let t=at+.04;t<plan[1].at+.02;t+=.04)update(t,true);
    assert.deepEqual(audio.hits.map(v=>v.id),plan.slice(0,2).map(v=>v.id),'entering weather range does not restart or duplicate duty');
    audio.owner.dispose();
  }
});

test('holds and missed scene intervals never create a volley, while ordinary range loss retains struck tails',()=>{
  const phase='wrong-return',score=createSourceRestWeatherScore(),audio=audioHarness(),at=sourceRestFuneralPlan(phase)[0].at;
  const update=(t,extra={})=>{const cue=score.update({phase,musicTime:t,audibleSeconds:t,audioTime:t,...extra});audio.update(cue,{active:extra.active!==false,hold:!!extra.held});return cue;};
  update(at-.05);update(at);assert.equal(audio.hits.length,1);
  update(at+.8);assert.equal(audio.hits.length,1);assert.equal(audio.stops.length,0,'forward gap skips history but retains struck metal');
  update(at+.9,{active:false});assert.equal(audio.stops.length,0);
  const held=update(at+1,{held:true});assert.equal(held.funeral.contacts.length,0);assert.equal(held.musicDuck.gain,1);assert.equal(audio.stops.length,1);
  update(106.9);assert.equal(audio.hits.length,1,'resume at a new actual playhead does not replay history');
  update(107);assert.equal(audio.hits.length,1);audio.owner.dispose();
});

test('III submits its funeral bells while preserving all harpsichord models and physical geometry',()=>{
  const phase='catch',score=createSourceRestWeatherScore(),at=sourceRestFuneralPlan(phase)[0].at;
  const cue=score.update({phase,musicTime:at,audibleSeconds:at,audioTime:30}),state=stateFor(phase,cue),scenery=sourceRestCatchScenery(state),frame=sourceContinuationRenderFrame(state);
  assert.equal(scenery.bells.length,15);assert.equal(new Set(scenery.bells.map(v=>v.bellId)).size,3);
  assert.ok(frame.props.filter(p=>p.restBell).length>=15);assert.equal(scenery.harpsichord.parts,22);assert.equal(scenery.harpsichord.newAudio,false);
  const absent=sourceContinuationRenderFrame({...state,sourceRestView:{...state.sourceRestView,weatherCue:null}});
  assert.deepEqual(frame.geometry,absent.geometry);
  assert.deepEqual(scenery.place.map(v=>({id:v.id,matrix:v.matrix})),sourceRestCatchScenery({...state,sourceRestView:{...state.sourceRestView,weatherCue:null}}).place.map(v=>({id:v.id,matrix:v.matrix})));
  const reduced=sourceRestBellProps(state,{reducedMotion:true});assert.equal(reduced.find(v=>v.bellPart==='bell'&&v.bellId===cue.funeral.contacts[0].bellId).contact,1);
  assert.equal(reduced.length,15,'reduced motion retains every physical mouth and muffle');
});

const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
function segmentHitsTriangle(from,to,tri){
  const direction=sub(to,from),a=sub(tri[1],tri[0]),b=sub(tri[2],tri[0]),p=cross(direction,b),det=dot(a,p);if(Math.abs(det)<1e-10)return false;
  const t=sub(from,tri[0]),u=dot(t,p)/det;if(u< -1e-8||u>1+1e-8)return false;
  const q=cross(t,a),v=dot(direction,q)/det;if(v< -1e-8||u+v>1+1e-8)return false;
  const distance=dot(b,q)/det;return distance>1e-5&&distance<.99999;
}
const triangles=(prop,model)=>Array.from({length:model.i.length/3},(_,k)=>model.i.slice(k*3,k*3+3).map(i=>transform(prop.matrix,model.p.slice(i*3,i*3+3))));

test('the real seated eye sees each III clapper through the broken cheek at its physical contact',()=>{
  const seat=SOURCE_REST_SEATS[1],eye=sourceRestEyePosition(seat),models={...sourceRestHarpsichordGeometryLibrary(),'rest-harpsichord-soundboard':sourceRestHarpsichordBoardGeometry(),
    'rest-harpsichord-seat-upholstery':sourceRestHarpsichordSeatGeometry().upholstery},bellModels=sourceRestBellGeometryLibrary();
  for(const signal of[0,1])for(const electronic of[0,1])for(const event of sourceRestFuneralPlan('catch').slice(0,3)){
    const score=createSourceRestWeatherScore(),cue=score.update({phase:'catch',musicTime:event.at,audibleSeconds:event.at,audioTime:100}),state=stateFor('catch',cue);
    state.sourceRestView.musicSignal=signal;state.sourceRestView.musicRevoicing={electronic};
    const scenery=sourceRestCatchScenery(state),props=sourceRestBellProps(state),clapper=props.find(p=>p.bellId===event.bellId&&p.bellPart==='clapper'),target=transform(clapper.matrix,[0,-1.30,0]);
    for(const prop of scenery.place){
      const model=models[prop.mesh.replace('source-continuation-','')];
      assert.equal(triangles(prop,model).some(tri=>segmentHitsTriangle(eye,target,tri)),false,`${event.bellId} contact is hidden by ${prop.id}`);
    }
    for(const prop of props.filter(p=>p.bellId!==event.bellId))assert.equal(triangles(prop,bellModels[prop.mesh]).some(tri=>segmentHitsTriangle(eye,target,tri)),false,`${prop.id} hides ${event.bellId}`);
  }
});

test('all III frame feet land on existing support and remain outside the instrument body and rear walking gap',()=>{
  const seat=SOURCE_REST_SEATS[1],props=sourceRestBellProps({phase:'catch',chartId:0}),model=sourceRestBellGeometryLibrary()['rest-judgment-frame'];
  const frames=props.filter(p=>p.bellPart==='frame');
  for(const prop of frames){
    const feet=[];for(let k=0;k<model.p.length;k+=3)if(model.p[k+1]===-4.17)feet.push(transform(prop.matrix,model.p.slice(k,k+3)));
    assert.ok(feet.length>=8);
    for(const p of feet){assert.ok(p[1]>seat.feet&&p[1]<seat.feet+.02);assert.ok(continuationSupportAt(p[0],p[2],{phase:'catch',chartId:0,level:seat.level,feet:seat.feet}),`${prop.id} has an unsupported foot at ${p[0]},${p[2]}`);}
    assert.ok(Math.hypot(prop.x-seat.x,prop.z-seat.z)>7);
    // The r7.5 arc is the actual level-two walk to the refuge, not an
    // invented access path. Full frame footprints leave body clearance.
    for(let angle=Math.PI+.04;angle<=4.13;angle+=.025){
      const p=continuationRadialPoint(7.5,angle),dx=p.x-prop.x,dz=p.z-prop.z,
        scale=Math.hypot(prop.matrix[0],prop.matrix[2]),x=(dx*prop.matrix[0]+dz*prop.matrix[2])/scale,
        z=(dx*prop.matrix[8]+dz*prop.matrix[10])/scale,
        distance=Math.hypot(Math.max(0,Math.abs(x)-1.30*scale),Math.max(0,Math.abs(z)-.42*scale));
      assert.ok(distance>.22,`${prop.id} blocks the existing counterarc walk`);
    }
  }
  for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
    const a=frames[i],b=frames[j],basis=p=>{const s=Math.hypot(p.matrix[0],p.matrix[2]);return{scale:s,x:[p.matrix[0]/s,p.matrix[2]/s],z:[p.matrix[8]/s,p.matrix[10]/s]};},
      aa=basis(a),bb=basis(b),delta=[b.x-a.x,b.z-a.z],extent=(p,v)=>1.30*p.scale*Math.abs(dot(p.x,v))+.42*p.scale*Math.abs(dot(p.z,v));
    assert.ok([aa.x,aa.z,bb.x,bb.z].some(axis=>Math.abs(dot(delta,axis))>extent(aa,axis)+extent(bb,axis)+.20),'adjacent frame footprints retain physical clearance');
  }
  assert.equal(SOURCE_REST_FUNERAL_BELLS.catch.length,3);
});

function submittedMeshGeometry(){
  // Capture the production installer over a no-op CPU API. No WebGL context
  // or native window is created; the receiver triangles are the real upload.
  const catalog=new Map(),gl=new Proxy({getParameter:()=>0,createVertexArray:()=>({}),createBuffer:()=>({}),createTexture:()=>({})},{
    get(object,key){if(key in object)return object[key];if(/^[A-Z0-9_]+$/.test(key))return 1;return()=>{};},
  });
  installSourceContinuationMeshes(gl,{catalog},{maps:{blueprint:false,texture:{},normalTexture:{},ormTexture:{}}});
  const out=new Map([...catalog].map(([name,mesh])=>[name,mesh.primitives.map(p=>({p:Array.from(p.nativeReceiverGeometry.positions),i:Array.from(p.nativeReceiverGeometry.indices)}))]));
  const bytes=readFileSync(new URL('../public/assets/source-continuation-architecture.glb',import.meta.url)),jsonBytes=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonBytes).toString()),binary=bytes.subarray(28+jsonBytes);
  const read=index=>{
    const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],sizes={5121:1,5123:2,5125:4,5126:4},size=sizes[a.componentType],stride=v.byteStride||components*size,offset=(v.byteOffset||0)+(a.byteOffset||0),out=[];
    for(let n=0;n<a.count;n++)for(let k=0;k<components;k++){const at=offset+n*stride+k*size;out.push(a.componentType===5126?binary.readFloatLE(at):a.componentType===5125?binary.readUInt32LE(at):a.componentType===5123?binary.readUInt16LE(at):binary.readUInt8(at));}return out;
  };
  for(let index=0;index<gltf.meshes.length;index++){
    const mesh=gltf.meshes[index],node=gltf.nodes.find(node=>node.mesh===index);
    assert.equal(node.matrix,undefined);assert.equal(node.translation,undefined);assert.equal(node.rotation,undefined);assert.equal(node.scale,undefined);
    out.set(mesh.name,mesh.primitives.map(p=>({p:read(p.attributes.POSITION),i:p.indices===undefined?Array.from({length:gltf.accessors[p.attributes.POSITION].count},(_,n)=>n):read(p.indices)})));
  }
  return out;
}

test('the final submitted physical floors, giant case architecture and seated garment geometry also leave each III contact in view',()=>{
  const meshes=submittedMeshGeometry();
  for(const event of sourceRestFuneralPlan('catch').slice(0,3)){
    const score=createSourceRestWeatherScore(),cue=score.update({phase:'catch',musicTime:event.at,audibleSeconds:event.at,audioTime:event.at}),state=stateFor('catch',cue);
    state.sourceRestView.affliction={...sourceRestCouperinAffliction({active:true,progress:0,currentTime:event.at}),embodied:true,bodyProgress:1,canLeave:true};
    const frame=sourceContinuationRenderFrame(state),
      clapper=sourceRestBellProps(state).find(p=>p.bellId===event.bellId&&p.bellPart==='clapper'),target=transform(clapper.matrix,[0,-1.30,0]);
    let checked=0,garments=0;
    for(const prop of frame.props.filter(p=>!p.restBell&&(p.physicalKind||p.architecture||p.restBody||p.restHarpsichordPart))){
      const geometry=meshes.get(prop.mesh);if(!geometry)continue;
      for(const model of geometry){checked+=model.i.length/3;if(prop.restBody)garments++;assert.equal(triangles(prop,model).some(tri=>segmentHitsTriangle(frame.eye,target,tri)),false,`${event.bellId} is hidden by submitted ${prop.id}`);}
    }
    assert.ok(checked>20000,'the proof must cover the actual compiled scene, not just the small new case');
    assert.ok(garments>=5,'the seated garment meshes must actually participate in the occlusion proof');
  }
});
