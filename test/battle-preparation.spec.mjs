import { readFileSync } from 'node:fs';
import { BATTLE_GEAR } from '../src/game/combat-loadout.js';
import { PATCH_COLORS } from '../src/render/patchbay-material.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattlePreparationModel } from '../src/game/battle-preparation-model.js';
import { makeBattlePreparation } from '../src/game/battle-preparation.js';
import { normalizeCombatBuild, PIN_SOURCES } from '../src/game/combat-progression.js';
import { TECHNIQUE as T } from '../src/game/combat-state.js';
import { makeCombatScene } from '../src/game/combat.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';
import { paintBattlePreparationReadout } from '../src/render/battle-preparation-view.js';
const funded=()=>normalizeCombatBuild(null,PIN_SOURCES.encounters);
const equipment=['light','recorder','radio','interface'];

function readoutFixture({dpr=1,zoom=1,available=true}={}) {
  const pixels=[],ctx={globalAlpha:1,save(){},restore(){},clearRect(){pixels.length=0;},
    fillRect(...args){pixels.push([...args,this.globalAlpha]);},
    fillText(){throw Error('LCD must not use a browser font');},measureText(){throw Error('LCD must not use browser font metrics');}};
  const canvas={dataset:{},width:0,height:0,setAttribute(k,v){this[k]=v;},getContext:()=>available?ctx:null,
    getBoundingClientRect:()=>({left:zoom,top:zoom,width:198*zoom,height:50*zoom})};
  const entry=(text,x,y,width,size,tagName='SPAN')=>({textContent:text,tagName,fontSize:`${size}px`,
    getBoundingClientRect:()=>({left:(x+1)*zoom,top:(y+1)*zoom,width:width*zoom,height:size*zoom})});
  const labels=[entry('BATTERY',12,8,70,9),entry('67%',12,22,70,14,'B'),
    entry('SPARE LEADS',102,8,83,9),entry('2',102,22,83,14,'B')];
  let attached=false;
  const element={dataset:{},clientWidth:198,clientHeight:50,offsetWidth:200,
    getBoundingClientRect:()=>({left:0,top:0,width:200*zoom,height:52*zoom}),
    ownerDocument:{createElement:()=>canvas},appendChild(){attached=true;},
    querySelector:()=>attached?canvas:null,querySelectorAll:()=>labels};
  return{element,canvas,pixels,labels,window:{devicePixelRatio:dpr,getComputedStyle:node=>({fontSize:node.fontSize})}};
}

test('preparation LCD retains accessible live values and repaints only changed data',()=>{
  const f=readoutFixture();
  assert.equal(paintBattlePreparationReadout(f.element,{window:f.window}),true);
  assert.equal(f.element.dataset.electronicPainted,'true');assert.equal(f.canvas['aria-hidden'],'true');
  assert.deepEqual(f.labels.map(n=>n.textContent),['BATTERY','67%','SPARE LEADS','2']);
  assert.ok(f.labels.every(n=>n['aria-hidden']===undefined),'semantic labels remain in the accessibility tree');
  const first=JSON.stringify(f.pixels),key=f.canvas.dataset.paintKey;
  paintBattlePreparationReadout(f.element,{window:f.window});assert.equal(f.canvas.dataset.paintKey,key);
  assert.equal(JSON.stringify(f.pixels),first,'idle paint reuses the same raster');
  const available=f.canvas.getContext;f.canvas.getContext=()=>null;
  assert.equal(paintBattlePreparationReadout(f.element,{window:f.window}),false);
  assert.equal(f.element.dataset.electronicPainted,undefined,'lost context returns to the service label');
  f.canvas.getContext=available;
  assert.equal(paintBattlePreparationReadout(f.element,{window:f.window}),true);
  assert.equal(f.element.dataset.electronicPainted,'true','unchanged cached content restores the LCD after recovery');
  f.labels[3].textContent='1';paintBattlePreparationReadout(f.element,{window:f.window});
  assert.notEqual(JSON.stringify(f.pixels),first,'a spent lead changes the displayed number');
  assert.equal(f.labels[3].textContent,'1');
});

test('preparation LCD backs CSS zoom and Retina with real device pixels',()=>{
  const f=readoutFixture({dpr:2,zoom:1.5});
  paintBattlePreparationReadout(f.element,{window:f.window});
  assert.equal(f.canvas.width,594);assert.equal(f.canvas.height,150);
  assert.ok(f.pixels.length>0);
  assert.ok(f.pixels.every(([x,y,w,h])=>x>=0&&y>=0&&x+w<=594&&y+h<=150));
});

test('preparation Canvas failure is an honest service label, never browser type on glass',()=>{
  const f=readoutFixture({available:false});
  assert.equal(paintBattlePreparationReadout(f.element,{window:f.window}),false);
  assert.equal(f.element.dataset.electronicPainted,undefined);
  assert.equal(f.labels[1].textContent,'67%');
  const style=readFileSync('src/render/battle-preparation-style.js','utf8');
  assert.match(style,/\.readout-display\{[^}]*pointer-events:none/);
  assert.match(style,/\.readout\[data-electronic-painted=true\] \[data-readout-text\]\{opacity:0\}/);
  assert.match(style,/\.readout:not\(\[data-electronic-painted=true\]\)\{background:#d0d0b8;[^}]*box-shadow:none/);
});

// ── AN ITEM GOES IN THE EMPTY SLOT, AND ONLY A FULL CASE ASKS ANYTHING ───────
//
// This used to assign to whichever slot happened to be selected, so putting a
// tool in the case meant choosing a slot and then choosing an item — two steps
// to answer one question — and the first step silently threw away whatever that
// slot was already holding. An empty slot takes it now, and the player is asked
// exactly once: when there is no empty slot left.
test('preparation edits an owned-gear draft without changing the save',()=>{
  const loadout={top:['light','recorder','radio']},build=funded();
  const m=createBattlePreparationModel({loadout,build,equipment:[...equipment,{id:'coffee',present:false}]});
  // No slot chosen, nothing overwritten: it lands in the empty fourth.
  assert.equal(m.equip('interface'),true);
  assert.deepEqual(m.snapshot().loadout.top,['light','recorder','radio','interface']);
  assert.equal(m.snapshot().replacing,null,'a free slot asks nothing');
  assert.equal(m.snapshot().selectedSlot,3,'and the inspector follows what you just took out');
  // Gear you do not have is still refused, and the draft is still a draft.
  assert.equal(m.equip('coffee'),false);
  assert.deepEqual(loadout.top,['light','recorder','radio']);assert.deepEqual(build.techniques,[]);
  // Putting one back frees the slot it was in.
  m.slot(1);m.store();assert.deepEqual(m.snapshot().loadout.top,['light','radio','interface']);
  assert.equal(m.equip('recorder'),true);
  assert.deepEqual(m.snapshot().loadout.top,['light','radio','interface','recorder']);
});

test('a full case asks which tool to give up, by name, and takes no for an answer',()=>{
  const m=createBattlePreparationModel({
    loadout:{top:['light','recorder','radio','interface']},build:funded(),
    equipment:[...equipment,'tuning-fork'],
  });
  // Full. The pick does not overwrite anything — it becomes a question.
  assert.equal(m.equip('tuning-fork'),true);
  assert.equal(m.snapshot().replacing,'tuning-fork');
  assert.deepEqual(m.snapshot().loadout.top,['light','recorder','radio','interface'],
    'and nothing has been given up yet');

  // ANSWERED BY NAME, not by slot number. The decision is which tool to lose.
  assert.equal(m.replace('nonsense'),false,'a name that is not in a slot answers nothing');
  assert.equal(m.replace('radio'),true);
  assert.deepEqual(m.snapshot().loadout.top,['light','recorder','tuning-fork','interface'],
    'it takes the place of the one named, in that place');
  assert.equal(m.snapshot().replacing,null);

  // Backing out leaves the loadout alone.
  assert.equal(m.equip('radio'),true);assert.equal(m.snapshot().replacing,'radio');
  assert.equal(m.cancelReplace(),true);
  assert.equal(m.snapshot().replacing,null);
  assert.deepEqual(m.snapshot().loadout.top,['light','recorder','tuning-fork','interface']);

  // And putting something back while one is waiting answers the question by
  // making it moot, rather than leaving a picker up for a choice that is gone.
  assert.equal(m.equip('radio'),true);assert.equal(m.snapshot().replacing,'radio');
  m.slot(0);m.store();
  assert.equal(m.snapshot().replacing,null,'the freed slot takes it');
  assert.deepEqual(m.snapshot().loadout.top,['recorder','tuning-fork','interface','radio']);
});

test('the case flips to the question, and the question names tools',()=>{
  const view=readFileSync('src/render/battle-preparation-view.js','utf8');
  const scene=readFileSync('src/game/battle-preparation.js','utf8');
  // The picker is keyed on the item, never on a slot index.
  assert.match(view,/data-command="replace:\$\{id\}"/);
  assert.doesNotMatch(view,/data-command="replace:\$\{i\}"/);
  assert.match(view,/What does \$\{esc\(incoming\.label\)\} take the place of\?/);
  // The case is the case again as soon as there is room.
  assert.match(view,/const casePanel=incoming/);
  assert.match(scene,/value\.startsWith\('replace:'\)/);
  assert.match(scene,/value==='cancel-replace'/);
  // Escape backs out of the flip before it leaves the case.
  assert.match(scene,/if\(model\.snapshot\(\)\.replacing\)\{command\('cancel-replace'\);return true;\}/);
});
test('empty inventory never restores default phantom equipment',()=>{
  const m=createBattlePreparationModel({equipment:[]});assert.deepEqual(m.snapshot().loadout.top,[]);
  assert.equal(m.equip('light'),false);assert.equal(m.store(),false);
});
test('patching and pulling preserve prerequisites and the earned-lead budget',()=>{
  const m=createBattlePreparationModel({equipment,build:funded(),hasRig:true});
  for(const id of [T.AFTERIMAGE,T.WHITEOUT,T.OVEREXPOSE]){m.skill(id);assert.equal(m.patch().changed,true);}
  assert.equal(m.snapshot().build.unspent,0);m.skill(T.AFTERIMAGE);assert.equal(m.patch().changed,true);
  assert.deepEqual(m.snapshot().build.techniques,[]);assert.equal(m.snapshot().build.unspent,3);
});
test('READY commits once and a failed save leaves a retryable draft',()=>{
  const m=createBattlePreparationModel({equipment});let calls=0;
  assert.equal(m.commit(()=>{calls++;return false;}),false);assert.equal(m.snapshot().committed,false);
  assert.equal(m.commit(value=>{calls++;value.loadout.top.length=0;}),true);assert.ok(m.snapshot().loadout.top.length);
  assert.equal(m.commit(()=>calls++),false);assert.equal(calls,2);assert.equal(m.store(),false);
});
test('the preparation input gate rejects carried and repeated confirmation',()=>{
  let applied=0,ready=0;const p=makeBattlePreparation({getEquipment:()=>equipment,apply:()=>applied++,onReady:()=>ready++});
  p.key({key:'Enter'});p.update(.3);p.key({key:'Enter',repeat:true});assert.equal(applied,0);
  p.key({controllerAction:'start'});p.key({key:'Enter'});assert.equal(applied,1);assert.equal(ready,1);p.dispose();
});
function fight({dialogue=false,prepare=true,intro=true}={}){
  const profile=authoredCombatProfile('natatorium');
  const combat={id:'natatorium',enemy:'TEST',baseComposure:40,...profile,movements:[{...profile.movements[0],before:dialogue?['Before.']:[]}]};
  const battle={id:'preparation-test',enemy:'TEST',intro:dialogue?['Opening.']:[],win:[],lose:[],combat};
  const noop=()=>{};let applied=0;
  const scene=makeCombatScene({battle,difficulty:{},encounterIntro:intro,getAudio:()=>null,playSound:noop,
    fx:{stopCues:noop,flash:noop,cue:noop,glitch:noop,shake:noop},audio:{stopTyping:noop,menuMove:noop,menuConfirm:noop},
    loadout:{tools:{}},getPreparedLoadout:()=>({tools:{light:true,recorder:true},techniques:[T.AFTERIMAGE],battery:.75}),
    preparation:prepare?{getEquipment:()=>equipment,getBuild:funded,apply:()=>{applied++;return true;}}:null,
    resources:{playImpact:noop,playTool:noop}});
  scene.enter();return{scene,get applied(){return applied;}};
}
const tick=(scene,seconds)=>{for(let t=0;t<seconds;t+=1/60)scene.update(1/60);};
test('real combat reveals, reads authored dialogue, then freezes at preparation',()=>{
  const h=fight({dialogue:true}),s=h.scene;
  assert.equal(s.battleView().phase,'arrival');tick(s,1.4);assert.equal(s.battleView().phase,'arrival');tick(s,.2);
  assert.equal(s.battleView().phase,'talk');assert.equal(s.battleView().preparation,null);
  for(let i=0;i<12&&s.battleView().phase==='talk';i++){tick(s,.6);s.key({key:'Enter'});s.keyup({key:'Enter'});}
  assert.equal(s.battleView().phase,'prepare');const before=s.battleView();tick(s,12);
  const after=s.battleView();assert.deepEqual(after.state,before.state);assert.equal(after.turnClock,null);assert.equal(after.fireball.active,null);
  s.key({key:'Enter'});assert.equal(h.applied,1);assert.equal(s.battleView().phase,'ready');assert.ok(s.battleView().state.techniques.includes(T.AFTERIMAGE));
  tick(s,.75);assert.equal(s.battleView().phase,'tool');assert.ok(s.battleView().turnClock);
  s.key({key:'ArrowDown'});assert.equal(s.battleView().phase,'move');
  s.key({key:'Enter'});assert.equal(s.battleView().phase,'move','held READY cannot select the first move');
  s.keyup({key:'Enter'});s.key({key:'Enter'});assert.notEqual(s.battleView().phase,'move');s.exit();
});
test('a direct combat continuation retains its existing entry without preparation',()=>{
  const h=fight({prepare:false,intro:false});assert.equal(h.scene.battleView().phase,'tool');assert.equal(h.applied,0);h.scene.exit();
});

// ── AN ITEM WEARS THE COLOUR OF THE SKILL BRANCH IT FEEDS ────────────────────
//
// The SKILLS tab draws every socket ring with PATCH_COLORS[branch]. The
// EQUIPMENT tab is the same case, one tab over, and had no colour in it at all —
// so nothing tied the torch in quick slot one to the TORCH column it patches
// into. A tool's branch IS its toolId, so the two agree without either naming
// the other, and there is no second table to keep in step.
test('every item in the case carries its own branch colour, and two honestly do not', () => {
  const view = readFileSync('src/render/battle-preparation-view.js', 'utf8');
  const style = readFileSync('src/render/battle-preparation-style.js', 'utf8');

  // Derived from the socket colours, never restated.
  assert.match(view, /const gearBranchColor=\(id\)=>PATCH_COLORS\[BATTLE_GEAR\[id\]\?\.toolId\]/);
  // Both the quick slots and the reserve wear it.
  assert.match(view, /<button class="slot"\$\{branchStyle\(id\)\}/);
  assert.match(view, /<button class="item"\$\{branchStyle\(id\)\}/);
  // And it lands on hardware that was already there: the slot lamp, and the
  // item's edge — the same insulation colour the socket ring is.
  assert.match(style, /\.slot \.lamp\{[^}]*background:var\(--branch,#b2bf85\)/);
  // An INSET rule rather than a border, so an item with no branch gets nothing
  // at all instead of a thicker neutral edge — see the coffee/badge note below.
  assert.match(style, /\.item\{[^}]*box-shadow:inset 0 -2px 0 var\(--branch,transparent\)/);

  // The mapping itself, end to end.
  const coloured = Object.entries(BATTLE_GEAR)
    .filter(([, gear]) => PATCH_COLORS[gear.toolId]);
  assert.deepEqual(coloured.map(([id]) => id).sort(),
    ['interface', 'light', 'radio', 'recorder', 'tuning-fork'],
    'five items patch into a column and are coloured by it');
  assert.equal(PATCH_COLORS[BATTLE_GEAR.light.toolId], PATCH_COLORS.torch,
    'the torch in slot one and the TORCH column are the same amber');

  // COFFEE AND THE FILM BADGE COME BACK EMPTY, and the fallback in the CSS is
  // what makes that a fact rather than a gap: they are the two things in the
  // case with no branch behind them, nothing to patch and no column to point
  // at. The badge's own comment already says it is inert by construction.
  for (const id of ['coffee', 'badge']) {
    assert.equal(PATCH_COLORS[BATTLE_GEAR[id].toolId], undefined,
      `${id} has no skill branch, so it keeps the neutral edge`);
  }
  // ...and one branch has no item, which is the other half of the same fact.
  assert.ok(!Object.values(BATTLE_GEAR).some((gear) => gear.toolId === 'nerve'),
    'NERVE is a column you cannot put in a slot');
});
