import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {faceplateUsesCurrentRunModules,CURRENT_RUN_FACEPLATE_IDS,CURRENT_RUN_FACEPLATE_PREFIXES} from '../src/render/faceplate-module-state.js';
import {makeRecorderScene} from '../src/game/recorder-scene.js';
import {makeRadioScene} from '../src/game/radio-scene.js';
import {makeB3ConsoleScene} from '../src/game/b3-console-scene.js';
import {makeControllerSettingsScene} from '../src/game/controller-settings.js';
import {createBellPealScene} from '../src/game/bell-peal-scene.js';
import {makeDocumentScene} from '../src/game/document.js';
import {makeBagScene} from '../src/game/bag.js';
import {makeThoughtScene} from '../src/game/thoughts.js';
import {makeColdOpenScene} from '../src/game/coldopen.js';
import {makeAchievementNoticeScene} from '../src/game/achievement-notice.js';

const nodes={start:{lines:[{who:'you',text:'A field note.'}],end:true}};
test('actual instrument, console, controller, paper and dialogue constructors declare the shared-device owners',()=>{
  // Construct without entering: no rendering, asset preparation, voice or
  // transport runs. Constructors remain the authority for the real scene ids.
  const current=[makeRecorderScene(),makeRadioScene({nodes}),makeB3ConsoleScene(),makeControllerSettingsScene(),
    createBellPealScene(),makeDocumentScene({id:'field-note',title:'FIELD NOTE',body:[]}),
    makeBagScene({memory:null}),makeBagScene({sectionIds:['map'],sceneId:'field-map',memory:null}),
    makeThoughtScene({id:'field-note',nodes}),makeAchievementNoticeScene({notice:{id:'field',type:'achievement',achievementId:'ACH_FIRST_TAKE'}})];
  assert.deepEqual(current.map(scene=>scene.id),['recorder','radio:radio','b3-console','controller-settings',
    'tower-tenor-performance','doc:field-note','bag','field-map','thought:field-note','achievement-notice:field']);
  for(const scene of current)assert.equal(faceplateUsesCurrentRunModules(scene),true,scene.id);
  assert.equal(current[0].suppressesHud,true);assert.equal(current[1].suppressesHud,true);
  assert.equal(current[4].suppressesHud,true,'suppressing ordinary HUD cannot suppress the visible physical device');
});

test('one explicit inventory covers active-run root panel families without treating every blocking scene as hardware',()=>{
  for(const id of CURRENT_RUN_FACEPLATE_IDS)assert.equal(faceplateUsesCurrentRunModules({id}),true,id);
  for(const prefix of CURRENT_RUN_FACEPLATE_PREFIXES)assert.equal(faceplateUsesCurrentRunModules({id:prefix+'test'}),true,prefix);
  for(const [path,needle,id] of[
    ['game/combat.js','id: `battle:${battle.id}`','battle:natatorium'],
    ['game/academic-bouncer-scene.js',"id:'academic-bouncers'",'academic-bouncers'],
    ['game/payphone-scene.js',"id: 'payphone'",'payphone'],
    ['game/setup-handoff-scene.js',"id:'setup-field-case'",'setup-field-case'],
    ['game/setup-handoff-scene.js',"id:'setup-level-hold'",'setup-level-hold'],
    ['game/dialogue.js','id: `dialogue:${nodeId}`','dialogue:guard'],
    ['game/difficulty-select.js',"id: 'difficulty-select'",'difficulty-select'],
  ]){
    assert.ok(readFileSync(new URL('../src/'+path,import.meta.url),'utf8').includes(needle),path+' production id');
    assert.equal(faceplateUsesCurrentRunModules({id}),true,id);
  }
  assert.equal(faceplateUsesCurrentRunModules({id:'unidentified-capture',blocksInput:true,suppressesHud:true}),false);
  assert.equal(faceplateUsesCurrentRunModules(null),false);
});

test('mixed cold-open presenter exposes metadata for its actual monitor versus cinematic treatment',()=>{
  for(const id of['cold-open','finale','taken-dialogue','source-contact']){
    const monitor=makeColdOpenScene({id,opening:nodes,presentation:'monitor',ambient:false});
    const cinematic=makeColdOpenScene({id,opening:nodes,presentation:'cinematic',ambient:false});
    assert.equal(monitor.faceplate,true);assert.equal(faceplateUsesCurrentRunModules(monitor),true,id+' monitor');
    assert.equal(cinematic.faceplate,false);assert.equal(faceplateUsesCurrentRunModules(cinematic),false,id+' cinematic');
  }
});

test('future faceplate metadata is explicit, while title, historical and film exclusions cannot be overridden',()=>{
  assert.equal(faceplateUsesCurrentRunModules({id:'external-instrument',faceplate:true}),true);
  assert.equal(faceplateUsesCurrentRunModules({id:'recorder',faceplate:false}),false);
  for(const id of['title','world-title','archive','history','transfer-room','return-report','return-index','credits',
    'opening-overture','student-strike','standing-tear','first-strike','ending-shore']){
    assert.equal(faceplateUsesCurrentRunModules({id,faceplate:true}),false,id);
  }
  for(const scope of['historical','title','archive','cinematic','none'])assert.equal(faceplateUsesCurrentRunModules({id:'recorder',faceplate:true,scope}),false,scope);
});
