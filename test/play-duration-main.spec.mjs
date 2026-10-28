import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createPlayDurationClock,freshPlayDuration} from '../src/game/play-duration.js';
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function body(name){const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}',start);assert.ok(start>=0&&end>start);return main.slice(start,end+2);}
function host(){
 const save={run:{id:'run:first',status:'active'},playSeconds:700,playDuration:freshPlayDuration()},menus=new Set();
 const h={getSave:()=>save,storyMode:true,inRogue:true,paused:false,focused:true,scenes:{has:id=>menus.has(id)},
  runPlayDurationClock:createPlayDurationClock(),gameplayInputLifecycleActive:()=>h.focused};
 vm.createContext(h);vm.runInContext(body('tickRunPlayDuration'),h);
 return{h,save,menus,tick:now=>vm.runInContext(`tickRunPlayDuration(${now})`,h)};
}
test('production duration uses real foreground seconds, not the capped simulation or fictional night clock',()=>{
 const h=host();h.tick(1000);h.tick(9000);assert.equal(h.save.playDuration.seconds,8);
 h.save.playSeconds+=840;h.tick(11000);assert.equal(h.save.playDuration.seconds,10);assert.equal(h.save.playSeconds,1540);
 h.menus.add('ordinary-dialogue');h.tick(14000);assert.equal(h.save.playDuration.seconds,13,'dialogue remains play');
});
test('production menus, pause, native focus and terminal runs cannot accrue background duration',()=>{
 for(const reason of ['settings','archive','pause','title','opening-credits','paused','focus','ended']){
  const h=host();h.tick(0);h.tick(1000);
  if(reason==='paused')h.h.paused=true;else if(reason==='focus')h.h.focused=false;else if(reason==='ended')h.save.run.status='complete';else h.menus.add(reason);
  h.tick(30000);h.tick(60000);assert.equal(h.save.playDuration.seconds,1,reason);
  h.h.paused=false;h.h.focused=true;h.save.run.status='active';h.menus.clear();h.tick(90000);h.tick(91000);
  assert.equal(h.save.playDuration.seconds,2,`${reason} has no return catch-up`);
 }
});
test('pause and blur invalidate the monotonic sample synchronously; a new run starts its own clock',()=>{
 for(const name of ['onBlur','setGameplayPaused'])assert.match(body(name),/runPlayDurationClock\.suspend\(\)/,name);
 assert.match(body('loop'),/const nowLoopMs=performance\.now\(\);\s*tickRunPlayDuration\(nowLoopMs\)/);
 const h=host();h.tick(0);h.tick(2000);h.h.runPlayDurationClock.suspend();h.tick(60000);assert.equal(h.save.playDuration.seconds,2);
 h.save.run={id:'run:second',status:'active'};h.save.playDuration=freshPlayDuration();h.tick(61000);h.tick(62000);
 assert.equal(h.save.playDuration.seconds,1);
});

test('hidden pages and lifecycle returns reset the real-time sample before rendering can stop',()=>{
 for(const [target,event] of [['document','visibilitychange'],['window','pagehide'],['window','pageshow'],['window','focus']]){
  const at=main.lastIndexOf(`${target}.addEventListener('${event}',`);assert.ok(at>=0,event);
  const entry=main.slice(at).split('\n').slice(0,2).join('\n');
  assert.match(entry,/=>\{\n\s+runPlayDurationClock\.suspend\(\);/,`${event} suspends before other side effects`);
  const h=host();h.tick(0);h.tick(1000);h.h.runPlayDurationClock.suspend();
  // No hidden rAF is delivered; return is the next active production tick.
  h.tick(3601000);assert.equal(h.save.playDuration.seconds,1,event);
  h.tick(3602000);assert.equal(h.save.playDuration.seconds,2,event);
 }
});
