import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.__LOCAL_TEXT_REVIEW__ = true;
const review = await import('../src/game/local-text-review.js');
const { makeCombatScene, battleTextReviewLines, battleThoughtReviewLine, cathedralCombatLayout } = await import('../src/game/combat.js');
const { uiInit, uiSize } = await import('../src/render/ui.js');
const { machinePanelBody } = await import('../src/render/presentation.js');
const { combatHudLayout } = await import('../src/render/combat-hud-layout.js');
const { hardWrapBattleText, battleDialoguePageView } = await import('../src/game/combat-dialogue-model.js');

const noop = () => {};
const flush = async () => { for (let n=0;n<12;n++) await Promise.resolve(); };
function enableReview() {
  const values = new Map();
  review.configureLocalTextReview({ location:{protocol:'http:',hostname:'127.0.0.1'},
    storage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)} });
  assert.equal(review.setTextReviewEnabled(true),true);
}
function fixture({cathedral=false,intro=null,onListen=[]}={}) {
  return {id:'review-fixture',enemy:'REFERENCE',intro:intro || [
    {sourceId:'first-line',who:'direction',lead:'A separate lead-in.',text:'The original battle line.',cue:'review.once'},
    {sourceId:'player-line',who:'me',prompt:'A short picker label.',text:'The full utterance the player actually says.'},
  ],win:[],lose:[],combat:{id:'review-fixture',enemy:'REFERENCE',kind:cathedral?'cathedral':'source',
    objective:'LISTEN TO THE CROSSING',cathedralPhase:1,baseComposure:40,pinnedCycle:true,
    movements:[{id:'first-movement',title:'FIRST',coherence:100,before:[],after:[],onListen,
      intents:[{id:'broadcast',label:'REFERENCE',kind:'broadcast',damage:1,recordable:true,playbackDamage:10}]}]}};
}
async function harness(options={}) {
  const battle=fixture(options),cues=[],read=[],typing=[];
  const scene=makeCombatScene({battle,difficulty:'standard',getAudio:()=>null,
    fx:{cue:id=>cues.push(id),stopCues:noop,flash:noop,glitch:noop,shake:noop},
    audio:{startTyping:()=>typing.push('start'),stopTyping:()=>typing.push('stop'),menuMove:noop,menuConfirm:noop},
    replay:{lineStatus:()=> 'unseen',markLine:id=>read.push(id)},
    resources:{playImpact:noop,playTool:noop},onAbort:noop});
  scene.enter();await flush();
  for(let n=0;n<30&&scene.battleView().phase==='arrival';n++)scene.update(.1);
  return {scene,battle,cues,read,typing};
}
function canvasSize(cols=80,rows=40) {
  const previous={document:globalThis.document,window:globalThis.window,getComputedStyle:globalThis.getComputedStyle};
  globalThis.document={createElement:()=>({style:{},getContext:()=>null}),hidden:false};
  globalThis.window={devicePixelRatio:1,addEventListener:noop,removeEventListener:noop};
  globalThis.getComputedStyle=()=>({position:'relative'});
  uiInit({clientWidth:cols*8.45+.01,clientHeight:rows*20,appendChild:noop});
  return ()=>{for(const [key,value] of Object.entries(previous))if(value===undefined)delete globalThis[key];else globalThis[key]=value;};
}
const rect = ({x,y,w,h}) => ({x,y,w,h});

test('battle identities retain raw indices and full spoken text independently of a picker prompt',()=>{
  const lines=[{text:'Hidden first.',if:'never'},'Visible second.',{sourceId:'authored',who:'me',prompt:'Short.',text:'Full spoken sentence.',lead:'Lead.'}];
  const before=structuredClone(lines),context={sceneId:'battle:a',nodeId:'movement:one:before'};
  const wrapped=battleTextReviewLines(lines,context);
  assert.equal(wrapped[1].reviewFieldKeys.text,review.reviewKey({...context,collection:'battle-lines',index:1,field:'text'}));
  assert.equal(wrapped[2].reviewTarget.sourceId,'authored');
  assert.deepEqual(wrapped[2].reviewTarget.fields.map(field=>field.original),['Full spoken sentence.','Lead.']);
  assert.notEqual(wrapped[2].reviewFieldKeys.text,battleTextReviewLines(lines,{...context,nodeId:'movement:two:before'})[2].reviewFieldKeys.text);
  assert.deepEqual(lines,before);
});

test('computed thought identities follow the original variant and battle intent context',()=>{
  const context={sceneId:'battle:one',nodeId:'movement:one:intent:broadcast:phase:player'};
  const line={text:'i reckon it will cross.',tone:'read'},before=structuredClone(line);
  const wrapped=battleThoughtReviewLine(line,context);
  assert.deepEqual(line,before);assert.equal(wrapped.reviewTarget.speaker,'you');
  assert.equal(wrapped.reviewFieldKeys.text,review.reviewKey({...context,collection:'battle-thoughts:read',field:'text'},line.text));
  assert.equal(wrapped.reviewTarget.id,battleThoughtReviewLine({...line},context).reviewTarget.id);
  assert.notEqual(wrapped.reviewTarget.id,battleThoughtReviewLine({...line,text:'it might be a feint.'},context).reviewTarget.id);
  assert.notEqual(wrapped.reviewTarget.id,battleThoughtReviewLine(line,{...context,nodeId:'movement:two:intent:broadcast:phase:player'}).reviewTarget.id);
});

test('painted battle thoughts can be edited and flagged without changing intent or flow',async()=>{
  enableReview();const restore=canvasSize();const h=await harness({intro:[]});
  try{
    const before=h.scene.battleView();assert.equal(before.phase,'tool');
    const {cols,rows}=uiSize(),w=Math.max(36,cols-8),x=Math.floor((cols-w)/2);
    const panel=machinePanelBody(x-2,1,w+4,rows-2,{footer:'CONTROLS'}),layout=combatHudLayout({panel,mode:'command'});
    const intentX=panel.x+1,intentW=Math.min(34,Math.floor(panel.w*.30));
    review.beginReviewFrame();h.scene.render();
    const regions=review.textReviewSession.regions();assert.ok(regions.length>0);
    assert.deepEqual(regions.map(rect),regions.map((region,index)=>({x:intentX,y:layout.stage.y+1+index,w:region.target.fields[0].original.slice(0,intentW).length,h:1})));
    for(const region of regions){
      assert.equal(region.target.speaker,'you');assert.match(region.target.nodeId,/^movement:first-movement:intent:broadcast:phase:/);
      assert.equal(review.textReviewSession.hit(region.x+.1,region.y+.1).id,region.target.id);
    }
    const target=regions[0].target,field=target.fields[0],edited='my revised thought.';
    assert.equal(field.original,before.thought.lines[0].text);
    review.textReviewSession.saveFields(target,{[field.key]:edited});
    review.textReviewSession.flag(target,'change','Review the internal thought.');
    review.beginReviewFrame();h.scene.render();
    const after=h.scene.battleView(),updated=review.textReviewSession.regions()[0];
    assert.deepEqual(rect(updated),{x:intentX,y:layout.stage.y+1,w:edited.length,h:1});
    assert.equal(review.reviewText(field.key,field.original),edited);
    assert.equal(review.textReviewSession.snapshot().flags[0].target.id,target.id);
    assert.deepEqual(after.state,before.state);assert.deepEqual(after.intent,before.intent);
    assert.equal(after.phase,before.phase);assert.deepEqual(after.thought,before.thought);
    assert.deepEqual(h.cues,[]);assert.deepEqual(h.read,[]);
    review.setTextReviewEnabled(false);review.beginReviewFrame();h.scene.render();
    assert.deepEqual(review.textReviewSession.regions(),[]);
    assert.equal(review.reviewText(field.key,field.original),field.original);
    assert.deepEqual(h.scene.battleView().state,before.state);
  }finally{h.scene.exit();restore();}
});

test('editing live battle speech reveals revised text without replaying cues, reading flags, or combat mechanics',async()=>{
  enableReview();const h=await harness();
  try{
    const before=h.scene.battleView(),original=structuredClone(h.battle.intro),target=before.dialogue.reviewTarget;
    assert.deepEqual(h.cues,['review.once']);
    h.scene.textReviewSuspend();
    review.textReviewSession.saveFields(target,{[target.fields[0].key]:'An immediately revised line.',[target.fields[1].key]:'Revised lead.'});
    h.scene.textReviewResume();
    const after=h.scene.battleView();
    assert.equal(after.phase,'talk');assert.equal(after.dialogue.text,'An immediately revised line.');
    assert.equal(after.dialogue.lead,'Revised lead.');assert.equal(after.dialogue.typed,after.dialogue.text.length);
    assert.equal(after.dialogue.reviewTarget.id,target.id);assert.deepEqual(after.state,before.state);
    assert.deepEqual(h.cues,['review.once']);assert.deepEqual(h.read,[]);assert.ok(h.typing.includes('stop'));
    // Empty text remains the same authored beat; editing cannot skip the DAG.
    review.textReviewSession.saveFields(target,{[target.fields[0].key]:''});h.scene.textReviewResume();
    assert.equal(h.scene.battleView().dialogue.reviewTarget.id,target.id);assert.equal(h.scene.battleView().phase,'talk');
    // A future utterance reads its override when it becomes the active voice line.
    const future=battleTextReviewLines(h.battle.intro,{sceneId:'battle:review-fixture',nodeId:'intro'})[1].reviewTarget;
    review.textReviewSession.saveFields(future,{[future.fields[0].key]:'The revised full spoken utterance.'});
    h.scene.update(.3);h.scene.key({key:'Enter'});h.scene.keyup({key:'Enter'});
    assert.equal(h.scene.battleView().dialogue.text,'The revised full spoken utterance.');
    assert.equal(h.scene.battleView().dialogue.reviewTarget.speaker,'me');
    assert.deepEqual(h.battle.intro,original);assert.deepEqual(h.read,[]);
  }finally{h.scene.exit();}
});

test('a saved blank preview keeps its authored battle beat and cue in the flow',async()=>{
  enableReview();
  const target=battleTextReviewLines(fixture().intro,{sceneId:'battle:review-fixture',nodeId:'intro'})[0].reviewTarget;
  review.textReviewSession.saveFields(target,{[target.fields[0].key]:''});
  const h=await harness();
  try{
    const view=h.scene.battleView();assert.equal(view.phase,'talk');assert.equal(view.dialogue.text,'');
    assert.equal(view.dialogue.reviewTarget.id,target.id);assert.deepEqual(h.cues,['review.once']);
    assert.equal(view.state.turns,0);
  }finally{h.scene.exit();}
});

test('normal battle review regions follow the exact wrapped lead and visible body rows',async()=>{
  enableReview();const restore=canvasSize();const h=await harness();
  try{
    h.scene.textReviewSuspend();
    const view=h.scene.battleView(),{cols,rows}=uiSize(),w=Math.max(36,cols-8),x=Math.floor((cols-w)/2);
    const panel=machinePanelBody(x-2,1,w+4,rows-2,{footer:'CONTROLS'}),layout=combatHudLayout({panel,mode:'dialogue'});
    const dlgW=Math.max(20,panel.w-2),textY=layout.dialogue.y+1,lead=hardWrapBattleText(view.dialogue.lead,dlgW);
    const body=battleDialoguePageView({text:view.dialogue.text,typed:view.dialogue.typed,width:dlgW-2,
      maxRows:Math.max(1,Math.max(2,Math.floor(layout.contentBottom-textY))-lead.length),page:0});
    review.beginReviewFrame();h.scene.render();
    const regions=review.textReviewSession.regions();
    assert.deepEqual(regions.map(rect),[
      ...lead.map((line,index)=>({x:panel.x,y:textY+index,w:line.length,h:1})),
      ...body.rows.map((line,index)=>({x:panel.x+2,y:textY+lead.length+index,w:line.length,h:1})),
    ]);
    for(const region of regions)assert.equal(review.textReviewSession.hit(region.x+.1,region.y+.1).id,view.dialogue.reviewTarget.id);
    assert.equal(review.textReviewSession.hit(panel.x+panel.w-.1,textY),null,'blank panel space cannot select an unseen line');
  }finally{h.scene.exit();restore();}
});

test('cathedral battle review uses its actual command rows and keeps the full unpaged field',async()=>{
  enableReview();const restore=canvasSize();const text='An authored sentence across several rows. '.repeat(5);
  const h=await harness({cathedral:true,intro:[{id:'cathedral-line',who:'direction',text}]});
  try{
    h.scene.textReviewSuspend();review.beginReviewFrame();h.scene.render();
    const panel=cathedralCombatLayout(uiSize()),lines=hardWrapBattleText(text,uiSize().cols-8).slice(0,4);
    const regions=review.textReviewSession.regions();
    assert.deepEqual(regions.map(rect),lines.map((line,index)=>({x:panel.x+1,y:panel.y+4.1+index,w:line.length,h:1})));
    assert.equal(regions[0].target.fields[0].original,text);
  }finally{h.scene.exit();restore();}
});

test('editing an onListen bark updates its actual row without repeating its cue or spending a turn',async()=>{
  enableReview();const restore=canvasSize();
  const h=await harness({intro:[],onListen:[{sourceId:'bark-one',who:'direction',text:'A bark during combat.',cue:'bark.once'}]});
  const press=key=>{h.scene.key({key});h.scene.keyup({key});};
  try{
    let view=h.scene.battleView();
    const tool=view.tools.findIndex(entry=>entry.moves.includes('wait'));
    assert.ok(tool>=0);
    for(let n=0;n<view.tools.length&&h.scene.battleView().selectedTool!==tool;n++)press('ArrowRight');
    press('ArrowDown');view=h.scene.battleView();
    const move=view.moves.findIndex(entry=>entry.id==='wait');assert.ok(move>=0);
    for(let n=0;n<view.moves.length&&h.scene.battleView().selectedMove!==move;n++)press('ArrowRight');
    press('Enter');
    for(let n=0;n<200&&!h.scene.battleView().bark;n++)h.scene.update(.05);
    const before=h.scene.battleView();assert.ok(before.bark);
    assert.equal(h.cues.filter(id=>id==='bark.once').length,1);
    const originalCues=[...h.cues];
    h.scene.textReviewSuspend();
    const target=before.bark.reviewTarget;
    review.textReviewSession.saveFields(target,{[target.fields[0].key]:'The revised live bark.'});
    h.scene.textReviewResume();review.beginReviewFrame();h.scene.render();
    const after=h.scene.battleView(),regions=review.textReviewSession.regions().filter(region=>region.target.id===target.id);
    assert.equal(after.bark.text,'The revised live bark.');assert.deepEqual(after.state,before.state);
    assert.deepEqual(h.cues,originalCues);assert.deepEqual(h.read,[]);
    assert.equal(regions.length,1);assert.equal(regions[0].w,after.bark.text.length);assert.equal(regions[0].h,1);
    assert.equal(regions[0].target.nodeId,'movement:first-movement:onListen');
    review.setTextReviewEnabled(false);review.beginReviewFrame();h.scene.render();
    assert.equal(h.scene.battleView().bark.text,'A bark during combat.');assert.deepEqual(review.textReviewSession.regions(),[]);
  }finally{h.scene.exit();restore();}
});

test('battle review interruption stops both handled speech and nonblocking bark voice',()=>{
  const source=readFileSync(new URL('../src/game/combat.js',import.meta.url),'utf8');
  const reveal=source.slice(source.indexOf('function revealReviewedLine()'),source.indexOf('function refreshReviewedBattleText()'));
  assert.match(reveal,/stopVoice\(\)/);assert.match(reveal,/voice\.stop\?\.\(\)/);
  assert.doesNotMatch(reveal,/nextLine\(|fx\?\.cue|reduceCombat\(|markLine\(/);
});
