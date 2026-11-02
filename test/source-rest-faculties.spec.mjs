import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestFacultyFrame,sourceRestVisionFrame} from '../src/game/source-rest-vision.js';
import {SOURCE_REST_FACULTIES,normalizeSourceRestFaculties,sourceRestFacultyUniforms,
  sourceRestFacultyColour,sourceRestFacultyDetail,sourceRestFacultyVisibility} from '../src/render/source-rest-faculties.js';

const occupied={active:true,embodied:true,canLeave:false,bodyProgress:1},
  frame=(p,options={})=>sourceRestFacultyFrame(p,{affliction:occupied,...options}),
  luma=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722,
  zeroChannels=v=>['colourSeparation','colourFlattening','bindingLoss','fieldLoss','black'].every(k=>v[k]===0);

test('only the embodied listening encounter owns the acquired-image treatment',()=>{
  assert.ok(zeroChannels(sourceRestFacultyFrame(1)));
  for(const affliction of [{...occupied,active:false},{...occupied,embodied:false},{...occupied,bodyProgress:0}]){
    const v=sourceRestFacultyFrame(1,{affliction});
    assert.equal(v.enabled,false);assert.ok(zeroChannels(v));
  }
  const input=structuredClone(occupied),before=structuredClone(input);
  frame(.7,{affliction:input});assert.deepEqual(input,before);
  assert.equal(frame(.4).enabled,true);
  assert.deepEqual(sourceRestVisionFrame(.7,{affliction:occupied}).faculties,frame(.7));
});

test('colour registration, broad regions, grouping and sustained loss are distinct phases',()=>{
  const early=frame(.40),middle=frame(.57),late=frame(.77),end=frame(.96);
  assert.ok(early.colourSeparation>.4);assert.equal(early.colourFlattening,0);assert.equal(early.bindingLoss,0);
  assert.ok(middle.colourFlattening>0);assert.equal(middle.bindingLoss,0);assert.equal(middle.fieldLoss,0);
  assert.ok(late.colourFlattening>.95);assert.ok(late.bindingLoss>.5);assert.ok(late.fieldLoss>0);assert.equal(late.black,0);
  assert.equal(end.colourSeparation,0);assert.equal(end.colourFlattening,1);assert.equal(end.black,1);
  // A short marked mistake cannot invent the irreversible faculty chronology.
  assert.deepEqual(frame(.4,{affliction:{...occupied,pain:1,strain:1,facultyLoss:1}}),early);
});

test('leaveable seating never darkens the whole field, even on a late or migrated clock',()=>{
  const v=frame(1,{affliction:{...occupied,canLeave:true}});
  assert.equal(v.canLeave,true);assert.equal(v.fieldLoss,0);assert.equal(v.black,0);
  assert.ok(v.colourSeparation<=.23&&v.colourFlattening<=.32&&v.bindingLoss<=.14);
  const original=[.32,.55,.20];let reads=0;
  for(const uv of [[.5,.55],[.1,.2],[.8,.38],[.5,.66]]){
    assert.deepEqual(sourceRestFacultyColour(original,uv,2,v,{sampleAt:()=>{reads++;return[1,0,0];}}),original);
    assert.equal(sourceRestFacultyDetail(uv,2,v),1);
    assert.equal(sourceRestFacultyVisibility(uv,2,v),1);
  }
  assert.equal(reads,0,'immediate footing and the central view do not borrow displaced samples');
  assert.ok(sourceRestFacultyDetail([.9,.9],2,v)<1,'the peripheral warning remains visible');
});

test('the legacy Canvas cover cannot undo world-image leave/standing protection, while committed black remains authored',()=>{
  const leaveable=sourceRestVisionFrame(1,{affliction:{...occupied,canLeave:true,pain:1,strain:1,facultyLoss:1}});
  assert.equal(leaveable.black,0);assert.ok(leaveable.periphery<=.25);assert.ok(leaveable.aperture>=.72);
  const standing=sourceRestVisionFrame(1,{interruption:true,affliction:{...occupied,embodied:false}});
  assert.equal(standing.black,0);assert.equal(standing.periphery,0);assert.equal(standing.interruption,0);assert.equal(standing.rally,0);
  assert.equal(sourceRestVisionFrame(1,{affliction:occupied}).black,1);
  assert.equal(sourceRestVisionFrame(1).black,1,'legacy callers without an embodied owner retain their authored ending');
});

test('normalization independently enforces safety when a renderer receives malformed or unbounded data',()=>{
  const raw={enabled:true,canLeave:true,colourSeparation:100,colourFlattening:100,bindingLoss:100,fieldLoss:100,black:1};
  const v=normalizeSourceRestFaculties(raw);
  assert.equal(v.colourSeparation,.23);assert.equal(v.colourFlattening,.32);assert.equal(v.bindingLoss,.14);
  assert.equal(v.fieldLoss,0);assert.equal(v.black,0);
  assert.ok(zeroChannels(normalizeSourceRestFaculties({...raw,enabled:false})));
  assert.equal(normalizeSourceRestFaculties({...raw,colourFlattening:NaN}).colourFlattening,0);
  assert.equal(normalizeSourceRestFaculties({...raw,bindingLoss:Infinity}).bindingLoss,0);
  assert.deepEqual(sourceRestFacultyUniforms(null),{uSourceRestFaculties:[0,0,0,0],uSourceRestFacultyState:[0,1,0,0]});
});

test('depth disagreement excludes a near obstruction from a background-colour sample',()=>{
  const v=frame(.74),original=[.35,.42,.53],uv=[.81,.88],depth=2;
  const excluded=sourceRestFacultyColour(original,uv,depth,v,{sampleAt:()=>[1,.0,.0],depthAt:()=>30}),
    neutral=sourceRestFacultyColour(original,uv,depth,v,{sampleAt:()=>original,depthAt:()=>depth});
  assert.deepEqual(excluded,neutral);
  let reads=0;
  assert.deepEqual(sourceRestFacultyColour(original,uv,.5,v,{sampleAt:()=>{reads++;return[1,1,1];}}),original);
  assert.equal(reads,0,'the near instrument is not acquired as room geometry');
  assert.equal(sourceRestFacultyDetail(uv,.5,v),1);
});

test('colour simplification never supplies light to darkness or increases the acquired luminance',()=>{
  const v=frame(.78),uv=[.88,.84];
  assert.deepEqual(sourceRestFacultyColour([0,0,0],uv,3,v,{sampleAt:()=>[1,.9,.8]}),[0,0,0]);
  for(let n=0;n<50;n++){
    const original=[n/50,(50-n)/50,.24],changed=sourceRestFacultyColour(original,uv,3,v,{sampleAt:()=>[1,1,1]});
    assert.ok(changed.every(Number.isFinite));assert.ok(changed.every(c=>c>=0));
    assert.ok(luma(changed)<=luma(original)+1e-12);
  }
});

test('neutral surfaces stay neutral and the late field loses grouping without moving the sample coordinates',()=>{
  const v=frame(.9),uv=[.88,.84],colour=[.48,.48,.48],at=[];
  const changed=sourceRestFacultyColour(colour,uv,3,v,{sampleAt:where=>{at.push(where);return colour;}});
  assert.equal(changed[0],changed[1]);assert.equal(changed[1],changed[2]);
  assert.ok(changed[0]<colour[0]);assert.ok(sourceRestFacultyDetail(uv,3,v)<.4);
  assert.equal(at.length,2);assert.ok(at.every(p=>Math.hypot(p[0]-uv[0],p[1]-uv[1])<=SOURCE_REST_FACULTIES.maximumPoolingUv+1e-9));
  assert.deepEqual(uv,[.88,.84],'the controller still owns the actual player view');
  assert.equal(sourceRestFacultyVisibility(uv,3,frame(1)),0);
  assert.equal(sourceRestFacultyVisibility(uv,3,null),1);
  assert.ok(sourceRestFacultyVisibility(uv,3,v)<1);
  assert.equal(sourceRestFacultyVisibility(uv,.5,frame(.85)),1,'the near instrument survives nonterminal field loss');
});

test('reduced motion removes optical misregistration; effects-off and reduced dread have explicit behavior',()=>{
  const reduced=frame(.4,{reducedMotion:true});assert.equal(reduced.colourSeparation,0);
  assert.deepEqual(sourceRestFacultyColour([.2,.4,.6],[.9,.9],3,reduced,{sampleAt:()=>[1,0,0]}),[.2,.4,.6]);
  assert.ok(zeroChannels(frame(1,{effectsMode:'off'})));
  const full=frame(.74),quiet=frame(.74,{reducedDread:true});
  for(const key of ['colourFlattening','bindingLoss','fieldLoss'])assert.ok(Math.abs(quiet[key]-full[key]*.65)<1e-12);
  assert.equal(frame(.96,{reducedDread:true}).black,1,'the existing story departure remains sustained black');
});

test('progression is deterministic and continuous, with one final sustained blackout and no frame-clock noise',()=>{
  let previous=frame(0),maxStep=0,lastBlack=0;
  for(let index=1;index<=2000;index++){
    const p=index/2000,next=frame(p);
    assert.deepEqual(next,frame(p));
    for(const key of ['colourSeparation','colourFlattening','bindingLoss','fieldLoss','black']){
      assert.ok(next[key]>=0&&next[key]<=1);maxStep=Math.max(maxStep,Math.abs(next[key]-previous[key]));
    }
    assert.ok(next.black>=lastBlack);lastBlack=next.black;previous=next;
  }
  assert.ok(maxStep<.02);assert.equal(lastBlack,1);
  const colour=[.3,.5,.6],uv=[.83,.78],v=frame(.85),args={sampleAt:()=>[.7,.2,.4]};
  assert.deepEqual(sourceRestFacultyColour(colour,uv,3,v,args),sourceRestFacultyColour(colour,uv,3,v,args));
});

test('field transitions are broad and smooth rather than rectangular tiles or flashing islands',()=>{
  const v=frame(.9),colour=[.55,.55,.55];
  for(const uv of [[.24,.65],[.74,.36],[.91,.82]]){
    const a=sourceRestFacultyColour(colour,uv,4,v),b=sourceRestFacultyColour(colour,[uv[0]+.00001,uv[1]+.00001],4,v);
    assert.ok(Math.max(...a.map((c,k)=>Math.abs(c-b[k])))<.0001);
    assert.ok(Math.abs(sourceRestFacultyDetail(uv,4,v)-sourceRestFacultyDetail([uv[0]+.00001,uv[1]+.00001],4,v))<.0001);
  }
});
