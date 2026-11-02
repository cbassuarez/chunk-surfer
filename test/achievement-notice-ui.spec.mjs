import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {achievementNoticeLayout,achievementTextLines} from '../src/render/achievement-deck.js';
import {achievementEarnedReason} from '../src/data/achievement-presentation.js';
import {ACHIEVEMENT_DEFS} from '../src/progression/achievement-defs.js';

function fixture({held=false,reduced=true,duration=4,id='ACH_PLAYBACK'}={}){
 let consumed=0,removed=0,sounds=0,announced=0,hold=held;const draws=[];
 const def=ACHIEVEMENT_DEFS.find(a=>a.id===id);
 const context={achievementNoticeLayout,achievementEarnedReason,hardwareMotionReduced:()=>reduced,
  resolveNotice:()=>({title:def.name,body:def.description}),consumeNotice:()=>consumed++,achievementDefinition:()=>def,
  achievementCompletion:()=>({completed:2,total:38}),getMeta:()=>({}),
  scenes:{remove:()=>removed++},AUDIO:{menuConfirm:()=>sounds++},uiSize:()=>({cols:68,rows:20}),uiCellMetrics:()=>({cellW:8.45,cellH:20}),
  drawAchievementNotice:(rect,content)=>draws.push({rect,content}),
  document:{createElement:()=>({style:{},setAttribute(){},remove(){}}),body:{appendChild:n=>{assert.match(n.textContent,/Achievement unlocked/);announced++;}}},
 };
 const source=fs.readFileSync(new URL('../src/game/achievement-notice.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\n/gm,'').replaceAll('export function ','function ');
 vm.createContext(context);vm.runInContext(source,context);
 const scene=context.makeAchievementNoticeScene({notice:{id:'notice:1',achievementId:id},duration,isHeld:()=>hold});
 return{scene,draws,hold:v=>hold=v,counts:()=>({consumed,removed,sounds,announced})};
}

test('the deck notice stays passive, uses the exact name and earned reason, and consumes once',()=>{
 const f=fixture();assert.equal(f.scene.blocksInput,false);assert.equal(f.scene.blocksWorld,false);assert.equal(f.scene.overlay,true);assert.equal(f.scene.key({key:'Escape'}),false);
 f.scene.enter();f.scene.update(.2);f.scene.render();
 assert.deepEqual(f.counts(),{consumed:0,removed:0,sounds:1,announced:1});
 assert.equal(f.draws[0].content.title,'Contains What You Did Not Hear');
 assert.equal(f.draws[0].content.reason,achievementEarnedReason('ACH_PLAYBACK'));
 assert.equal(f.draws[0].content.total,38);assert.equal(f.draws[0].content.alpha,1);
 f.scene.update(3.7);assert.equal(f.counts().consumed,0);f.scene.update(.2);f.scene.update(30);
 assert.equal(f.counts().consumed,1);assert.equal(f.counts().removed,1);f.scene.exit();
});

test('new pause/danger/recording holds hide and freeze an existing notice without consuming or replaying it',()=>{
 const f=fixture();f.scene.enter();f.scene.update(.4);f.scene.render();
 f.hold(true);f.scene.update(30);f.scene.render();assert.equal(f.scene.view().elapsed,.4);assert.equal(f.draws.length,1);assert.equal(f.counts().consumed,0);
 f.hold(false);f.scene.update(.3);f.scene.render();assert.equal(f.scene.view().elapsed,.7);assert.equal(f.draws.length,2);assert.equal(f.counts().sounds,1);
 f.scene.update(3.4);assert.equal(f.counts().consumed,1);
});

test('a held entry does not announce, emit sound, render, or age; reduced motion removes travel',()=>{
 const f=fixture({held:true});f.scene.enter();f.scene.update(20);f.scene.render();assert.deepEqual(f.counts(),{consumed:0,removed:0,sounds:0,announced:0});assert.equal(f.draws.length,0);
 f.hold(false);f.scene.update(.05);f.scene.render();assert.equal(f.counts().announced,1);assert.equal(f.counts().sounds,0);
 const expected=achievementNoticeLayout({cols:68,rows:20,cellW:8.45,cellH:20,title:f.scene.view().title,reason:f.scene.view().reason});
 assert.equal(f.draws[0].rect.y,expected.y);assert.ok(f.draws[0].content.alpha>0&&f.draws[0].content.alpha<1);
});

test('all 38 real names and earned reasons survive notice wrapping at compact and normal sizes',()=>{
 for(const size of[{cols:38,rows:24},{cols:68,rows:20},{cols:116,rows:36}])for(const def of ACHIEVEMENT_DEFS){
  const reason=achievementEarnedReason(def.id),l=achievementNoticeLayout({...size,title:def.name,reason});
  assert.equal(l.titleLines.join(' '),def.name.toUpperCase());assert.equal(l.reasonLines.join(' '),reason.toUpperCase());
  assert.ok(l.x>=0&&l.x+l.w<=size.cols);assert.ok(l.y>=0&&l.y+l.h<=size.rows);
  for(const line of l.titleLines)assert.ok(line.length*l.fontPx*.64<=l.textWidth+.01);
  for(const line of l.reasonLines)assert.ok(line.length*13*.64<=l.textWidth+.01);
  const required=l.stacked?64+l.titleLines.length*22+l.reasonLines.length*17+29:39+l.titleLines.length*22+l.reasonLines.length*17+22;
  assert.ok(l.hPx>=required,`${size.cols} / ${def.id}: ${required} into ${l.hPx}`);
 }
 assert.deepEqual(achievementTextLines('ONE TWO THREE',50,{fontPx:15}),['ONE','TWO','THREE']);
});
