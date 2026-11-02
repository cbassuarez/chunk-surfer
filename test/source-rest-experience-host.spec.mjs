import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {r3dSetSourceRestFaculties,r3dSourceRestFacultyStatus} from '../src/render/r3d.js';
import {sourceRestFacultyFrame} from '../src/game/source-rest-vision.js';
import {sourceRestFacultyVisibility} from '../src/render/source-rest-faculties.js';
import {PIXEL_MESH_FRAG} from '../src/render/pixel-mesh/shader.js';

const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const embodied={active:true,embodied:true,canLeave:false,bodyProgress:1};

test('the production renderer state can leave a late embodied decline without leaking into another world owner',()=>{
  r3dSetSourceRestFaculties(sourceRestFacultyFrame(.85,{affliction:embodied}));
  assert.equal(r3dSourceRestFacultyStatus().enabled,true);
  assert.ok(r3dSourceRestFacultyStatus().bindingLoss>.65);
  r3dSetSourceRestFaculties(sourceRestFacultyFrame(.85,{affliction:{...embodied,embodied:false}}));
  assert.equal(r3dSourceRestFacultyStatus().enabled,false);
  r3dSetSourceRestFaculties({enabled:true,canLeave:false,fieldLoss:1,black:1});
  r3dSetSourceRestFaculties(null);
  assert.equal(sourceRestFacultyVisibility([.2,.7],5,r3dSourceRestFacultyStatus()),1);
});

test('the acquired-world losses bracket the real grade/dither so inversion and contours cannot restore the missing field',()=>{
  const shader=PIXEL_MESH_FRAG;
  assert.ok(shader.indexOf('c=sourceRestFacultyColour(c,fullUv,facultyDepth)')<shader.indexOf('vec3 inv = mix(c'));
  assert.ok(shader.indexOf('lumaEdge*=facultyDetail;depthEdge*=facultyDetail')<shader.indexOf('float silhouette ='));
  assert.ok(shader.indexOf('float facultyVisibility=sourceRestFacultyVisibility(fullUv,facultyDepth)')>shader.indexOf('vec3 oneBitScene ='));
  for(const gradeNegative of [false,true]){
    const value=sourceRestFacultyFrame(.96,{affliction:embodied}),acquired=.13,
      graded=gradeNegative?1-acquired:acquired,
      output=graded*sourceRestFacultyVisibility([.2,.7],5,value);
    assert.equal(output,0,'terminal absence must survive either grade polarity');
  }
});

test('the actual ending release adopts its live source before resetting the ending bus or disposing the score',()=>{
  const start=source.indexOf('function releaseSourceRestEndingMusic('),end=source.indexOf('\nconst sourceContinuationTrace',start);
  const events=[],carrier={dispose:()=>events.push('carrier-dispose')};
  const context=vm.createContext({events,carrier,
    endingStaticMix:{takeCarrier(){events.push('take');return carrier;},reset(){events.push('reset');}},
    sourceRestEndingMusic:{stop(){events.push('score-stop');},dispose(){events.push('score-dispose');}},
    STORY:{adoptMenuHiss(value){assert.equal(value,carrier);events.push('adopt');return true;}}});
  vm.runInContext(source.slice(start,end),context);
  assert.equal(vm.runInContext('releaseSourceRestEndingMusic({toMenu:true})',context),true);
  assert.deepEqual(events,['take','adopt','score-stop','score-dispose','reset']);
  assert.equal(context.sourceRestEndingMusic,null);
});

test('both return-to-title cleanup layers preserve the transferred transport and boot credits acquire it before title',()=>{
  const returnBody=source.slice(source.indexOf('function returnToTitle(){'),source.indexOf('\nfunction showReturnReport'));
  assert.match(returnBody,/STORY\.stopAll\(\{preserveMenuHiss:true\}\)/);
  const resetBody=source.slice(source.indexOf("function resetRunAudio(reason="),source.indexOf('\nfunction enterStory'));
  assert.match(resetBody,/preserveMenuHiss:reason==='return-to-title'/);
  const boot=source.slice(source.indexOf('openAudio:()=>{',source.indexOf('const afterCredits=')));
  assert.ok(boot.indexOf('STORY.startMenuHiss()')<boot.indexOf('return createBootWeatherAudio'));
});
