import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {conservatory as C} from '../src/data/floorplan/conservatory.js';
import {MESH_SURFACE as ACADEMIC_CLUE_HOST_SURFACES} from '../src/data/generated/prop-geometry.js';
import {ACADEMIC_BOUNCER_CLUES,ACADEMIC_BOUNCER_CLUE_PROPS,ACADEMIC_BOUNCER_SPOKEN_CLUES,
  ACADEMIC_BOUNCER_PHRASE as PHRASE,ACADEMIC_BOUNCER_CUE as CUE} from '../src/data/academic-bouncers.js';
import {ACADEMIC_ROOF_DRESSING_OBSERVATIONS} from '../src/data/academic-roof-dressing.js';
import {createAcademicBouncers} from '../src/game/academic-bouncers.js';
import {makeAcademicBouncerScene} from '../src/game/academic-bouncer-scene.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import * as scenes from '../src/game/scenes.js';

const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function productionFunction(name){
  const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}\n',start+1)+2;
  assert.ok(start>=0&&end>start,`actual main function ${name} exists`);
  return main.slice(start,end);
}
const source=['syncAcademicBouncerClueProps','inspectPropTracked','saveAcademicGhostClub',
  'talkToAcademicAdmissionAdvice','talkToAcademicBouncers','interactAcademicRoofProp'].map(productionFunction).join('\n');
const plain=value=>JSON.parse(JSON.stringify(value));
FP.compile(C.levels,{width:C.width,height:C.height,widenCorridors:C.widenCorridors,
  connectors:C.connectors,edgePortals:C.edgePortals,doors:C.doors});

function fixture(saved={}){
  scenes.clear();PROPS.propsInit(FP);PROPS.loadPropState({});
  const writes=[],dialogues=[],said=[],voices=[];
  const c={FP,PROPS,scenes,ACADEMIC_CLUE_HOST_SURFACES,ACADEMIC_BOUNCER_CLUES,ACADEMIC_BOUNCER_CLUE_PROPS,
    ACADEMIC_BOUNCER_SPOKEN_CLUES,ACADEMIC_ROOF_DRESSING_OBSERVATIONS,academicBouncers:createAcademicBouncers(saved),
    academicSociety:{save:()=>({consent:'declined',visits:3})},academicFloorPopulation:{save:()=>({remarks:{kept:2}})},
    academicBouncerScene:null,academicBouncerSocialScene:null,academicBouncerDialogueLine:null,
    academicGhostDispatch:null,academicPopulationDispatch:null,academicBouncerSocialDispatch:null,
    actx:null,dialogGain:null,master:null,paused:false,
    OBJ:{objState:()=>({read:[]})},EVENT_TYPES:{PROP_INSPECTED:'prop-inspected'},flagTest:()=>false,
    emitProgress(){},furnitureRecognitionLine:(_id,{fallback})=>fallback,
    ensureCtx(){},updateAcademicGhostAudio(){},academicGhostSpeechDestination:()=>null,
    gameplayInputLifecycleActive:()=>true,focusedAcademicBouncer:()=>({actorId:'academic-bouncer-dry'}),
    talkToAcademicBouncerSociety:()=>false,
    SPEECH:{say:line=>said.push(line)},
    saveCommit:patch=>writes.push(plain(patch)),
    converse:(id,nodes,options)=>{const scene={id:`thought:${id}`,view:()=>({voice:false})};dialogues.push({id,nodes,options,scene});return scene;},
    makeAcademicBouncerScene:options=>makeAcademicBouncerScene({...options,createVoice:()=>({warm(){},stop(){},dispose(){},
      start(text){const handle={text,done:()=>false};voices.push(handle);return handle;}})}),
  };
  vm.createContext(c);vm.runInContext(source,c);
  return{c,writes,dialogues,said,voices,press:key=>{scenes.key({key});scenes.keyup({key});}};
}
function approaches(prop){
  const out=[];
  for(let y=prop.ry-8;y<=prop.ry+8;y++)for(let x=prop.rx-8;x<=prop.rx+8;x++){
    if(FP.isSolid(x,y)||FP.isCollisionOnly(x,y)||!PROPS.propCanOccupy(x,y)||Math.abs(FP.floorAt(x,y)-prop.floor)>.1)continue;
    const dx=prop.interactionX-(x+.5)*.5,dz=prop.interactionY-(y+.5)*.5,distance=Math.hypot(dx,dz);
    if(distance<.6||distance>3.2)continue;
    const yaw=Math.atan2(dx,-dz),pitch=Math.atan2(prop.floor+(prop.elevation||0)+Math.max(.12,prop.h||.55)/2-(FP.floorAt(x,y)+1.58),distance);
    if(PROPS.pickProp(x,y,0,3.2,{yaw,pitch})?.id===prop.id)out.push({x,y,yaw,pitch});
  }
  return out;
}
test.afterEach(()=>scenes.clear());

test('actual main stages all sixteen independent sources on real floors and each wins a legal E pick',()=>{
  const {c,writes}=fixture(),before=c.academicBouncers.save();c.syncAcademicBouncerClueProps();
  assert.equal(ACADEMIC_BOUNCER_CLUES.length,16);
  for(const clue of ACADEMIC_BOUNCER_CLUES){
    const target=PROPS.propById(clue.id==='practice'?'academic-admission-note':clue.propId);
    assert.ok(target,clue.propId);assert.ok(Math.abs(target.floor-clue.floor)<.01,clue.id+' actual compiled floor');
    const witness=approaches(target)[0];assert.ok(witness,clue.id+' actual main-staged E approach');
    c.academicBouncers.load({});
    const picked=PROPS.pickProp(witness.x,witness.y,0,3.2,{yaw:witness.yaw,pitch:witness.pitch});
    const text=c.inspectPropTracked(picked.id);assert.ok(text.includes(PHRASE),clue.id);assert.ok(text.includes(CUE),clue.id);
    if(ACADEMIC_BOUNCER_CLUE_PROPS.some(placement=>placement.id===picked.id)){
      assert.ok(text.startsWith(clue.title),clue.id+' opens with its readable running-order title');
      assert.doesNotMatch(text,/Nothing useful\./,'a new clue card must not dismiss its own useful writing');
    }
    if(clue.needsAuthoredInteraction)assert.equal(picked.label,clue.title,'the public wall clue prompt names the reception cue');
    assert.equal(c.academicBouncers.view().knowsPhrase,true);assert.equal(c.academicBouncers.save().clues[clue.id],true);
    assert.equal(c.academicBouncers.save().admitted,false);
    assert.deepEqual(Object.entries(c.academicBouncers.save().clues).filter(([,earned])=>earned),[[clue.id,true]]);
  }
  assert.equal(writes.length,16,'one actual first inspection persists each independent source');
  c.academicBouncers.load(before);const count=writes.length;c.syncAcademicBouncerClueProps();
  assert.deepEqual(c.academicBouncers.save(),before);assert.equal(writes.length,count,'staging never learns the words');
});

test('actual programme inspection upgrades only its new receipt, without retroactively teaching old pointer saves',()=>{
  const {c,writes}=fixture({version:2,clues:{boxOffice:true}});c.syncAcademicBouncerClueProps();
  assert.equal(c.academicBouncers.view().knowsPhrase,false);assert.equal(writes.length,0);
  const text=c.inspectPropTracked('box-office-program-stack');assert.ok(text.includes(PHRASE));assert.match(text,/LET THE QUESTION FINISH/);
  assert.equal(c.academicBouncers.save().clues.boxOffice,true);assert.equal(c.academicBouncers.save().clues.boxOfficeInstructions,true);
  assert.equal(c.academicBouncers.view().knowsPhrase,true);assert.equal(writes.length,1);
  c.inspectPropTracked('box-office-program-stack');assert.equal(writes.length,1);
  assert.equal(writes[0].academicSociety.consent,'declined');assert.equal(writes[0].academicFloorPopulation.remarks.kept,2);
});

test('actual roof-bell action displays the taught words instead of silently saving an unseen clue',()=>{
  const {c,said,writes}=fixture();c.syncAcademicBouncerClueProps();
  assert.equal(c.interactAcademicRoofProp(PROPS.propById('roof-school-bell')),true);
  assert.ok(said.at(-1).text.includes(ACADEMIC_ROOF_DRESSING_OBSERVATIONS['roof-school-bell'].text));
  assert.ok(said.at(-1).text.includes(PHRASE));assert.ok(said.at(-1).text.includes(CUE));
  assert.equal(c.academicBouncers.save().clues.roofBell,true);assert.equal(writes.length,1);
});

test('actual optional advice can be cancelled or left without learning or silently starting the timed attempt',()=>{
  for(const route of ['help','listen','leave']){
    const {c,dialogues,writes}=fixture();assert.equal(c.talkToAcademicBouncers(),true);
    const d=dialogues.at(-1);assert.equal(d.id,'academic-admission-advice');assert.equal(c.academicBouncerScene,null);
    const choice=d.nodes.start.choices.find(choice=>(choice.admissionRoute||'leave')===route);d.options.onChoice(choice);
    if(route==='help')for(const line of d.nodes.help.lines)d.options.onLine(line);
    d.options.onCancel();d.options.onDone();
    assert.equal(c.academicBouncers.view().knowsPhrase,false);assert.equal(c.academicBouncers.view().admitted,false);
    assert.equal(c.academicBouncers.view().attempt,null);assert.equal(c.academicBouncerSocialScene,null);
    assert.equal(c.academicBouncerDialogueLine,null);assert.equal(writes.length,0);
  }
  const {c,dialogues}=fixture();c.talkToAcademicBouncers();const d=dialogues.at(-1);
  d.options.onChoice(d.nodes.start.choices.find(choice=>choice.goto==='leave'));d.options.onDone();
  assert.equal(c.academicBouncers.view().knowsPhrase,false);assert.equal(c.academicBouncers.view().attempt,null);
});

test('actual completed spoken explanation teaches once and still requires an earned timed interruption and acknowledgment',()=>{
  const {c,dialogues,writes,press}=fixture();c.talkToAcademicBouncers();const d=dialogues.at(-1);
  d.options.onChoice(d.nodes.start.choices.find(choice=>choice.admissionRoute==='help'));
  const lines=d.nodes.help.lines;assert.equal(lines.length,3);assert.ok(lines[0].text.includes(PHRASE));assert.ok(lines[0].text.includes(CUE));
  for(const line of lines)d.options.onLine(line);
  assert.equal(c.academicBouncers.view().knowsPhrase,false,'reading the last line is still pending');d.options.onDone();
  assert.equal(c.academicBouncers.save().clues.hughAdvice,true);assert.equal(writes.length,1);
  assert.equal(c.academicBouncers.view().admitted,false);assert.equal(c.academicBouncers.view().attempt,null);
  d.options.onDone();d.options.onCancel();assert.equal(writes.length,1,'stale callbacks are inert');
  c.talkToAcademicBouncers();assert.equal(dialogues.length,1,'known visitors go straight to the original timed scene');
  for(let n=0;n<4;n++)press(' ');assert.equal(c.academicBouncerScene.view().phase,'window');
  press('3');for(let n=0;n<3;n++)press(' ');assert.equal(c.academicBouncerScene.view().phase,'terminal');
  assert.equal(c.academicBouncers.view().admitted,false);press('Enter');
  assert.equal(c.academicBouncers.view().admitted,true);assert.equal(writes.length,2);assert.equal(c.academicBouncerScene,null);
});

test('actual listen route starts the original timed attempt only after its own terminal close, without teaching or admission',()=>{
  const {c,dialogues,writes,press}=fixture();c.talkToAcademicBouncers();const d=dialogues.at(-1);
  d.options.onChoice(d.nodes.start.choices.find(choice=>choice.admissionRoute==='listen'));
  assert.equal(c.academicBouncers.view().attempt,null);d.options.onDone();
  assert.equal(c.academicBouncerSocialScene,null);assert.equal(c.academicBouncerScene.id,'academic-bouncers');
  assert.equal(c.academicBouncers.view().attempt.phase,'exchange');assert.equal(c.academicBouncers.view().knowsPhrase,false);
  for(let n=0;n<4;n++)press(' ');assert.equal(c.academicBouncerScene.view().phase,'window');
  assert.ok(c.academicBouncerScene.view().options.every(option=>option.text!==PHRASE));
  assert.equal(c.academicBouncers.view().admitted,false);assert.equal(writes.length,0);press('Escape');
  assert.equal(c.academicBouncers.view().attempt,null);assert.equal(c.academicBouncers.view().admitted,false);
});
