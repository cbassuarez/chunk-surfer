import test from 'node:test';
import assert from 'node:assert/strict';
import {DISPLAY_CONTRACT,computeStageLayout} from '../src/platform/display-policy.js';
import {machinePanelAperture} from '../src/render/presentation.js';
import {titleMenuItems} from '../src/game/title-menu.js';
import {PATH_REGISTER_COPY,PATH_REGISTER_CONFIRM,createPathRegisterMotion,pathRegisterArt,
  pathRegisterCopy,pathRegisterLayout,pathRegisterLevel,pathRegisterWrap} from '../src/render/title-path-register-model.js';

test('all actions address the same 595 separate physical anodes',()=>{
  const footprint=art=>art.map(({x,y,w,h})=>[x,y,w,h]);
  const bank=pathRegisterArt('new-run');
  assert.equal(bank.length,595);
  for(const id of Object.keys(PATH_REGISTER_COPY)) {
    const art=pathRegisterArt(id);
    assert.deepEqual(footprint(art),footprint(bank),id);
    assert.ok(art.some(s=>s.level===1),`${id} has a full-duty action marker`);
    for(const s of art) {
      assert.ok(s.x>=0&&s.x+s.w<=320&&s.y>=0&&s.y+s.h<=256);
      assert.equal(pathRegisterLevel(s,480,id),s.level,'every sequence reaches its exact resting state');
    }
  }
  for(let i=0;i<bank.length;i++)for(let j=i+1;j<bank.length;j++) {
    const a=bank[i],b=bank[j];
    assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'anode footprints do not overlap');
  }
});

test('New game locates the origin, Continue preserves history and locates a saved position',()=>{
  const at=(id,x,y)=>pathRegisterArt(id).find(s=>s.x===7+x*20&&s.y===5+y*20&&s.w===6&&s.h===6);
  assert.equal(at('new-run',2,10).level,1);
  assert.equal(at('continue',9,4).level,1);
  assert.ok(at('new-run',9,4).level<.5,'the fresh night does not claim retained progress');
  for(const s of pathRegisterArt('continue').filter(s=>s.level&&s.level<=.65))
    assert.equal(pathRegisterLevel(s,0,'continue'),s.level,'retained history is already present on entry');
  assert.equal(pathRegisterCopy('new-run',{activeRun:true,confirm:true}).lines[0],PATH_REGISTER_CONFIRM);
  assert.match(pathRegisterCopy('new-run',{activeRun:true}).lines[1],/PROFILE KEPT/);
  assert.match(pathRegisterCopy('transfer-room').lines.join(' '),/SCENES OR PLAY SOURCE MEDIA/);
});

test('selection is immediate, bounded and never replays after reduced motion or lost focus',()=>{
  const m=createPathRegisterMotion('new-run');
  assert.equal(m.time(0),Infinity,'initial menu has a readable resting state');
  m.select('continue',200);assert.equal(m.time(219),0);assert.equal(m.time(221),20);
  assert.equal(m.select('continue',300),false);assert.equal(m.time(300),100,'reselection does not reset the sequence');
  m.select('settings',450);assert.equal(m.time(450),0);
  m.select('archive',500);assert.equal(m.time(500),Infinity,'rapid navigation snaps to the newest target');
  m.select('about',700);assert.equal(m.time(1180),Infinity);
  m.select('quit',1400);assert.equal(m.time(1410,{reduced:true}),Infinity);
  assert.equal(m.time(1420),Infinity,'turning Reduced Motion off does not replay');
  m.select('settings',1700);assert.equal(m.time(1710,{visible:false}),Infinity);
  assert.equal(m.time(1720),Infinity,'focus restoration has no elapsed animation debt');
  m.select('about',1900,true);assert.equal(m.time(1900),Infinity);
});

test('all supported windows, UI scales and profile actions fit the unchanged aperture',()=>{
  const profiles=[{}, {runs:1}, {endingsSeen:['one']}, {knowledge:{documents:{one:{}}}}];
  let count=0;
  for(const preset of DISPLAY_CONTRACT.windowPresets)for(const ui of DISPLAY_CONTRACT.uiScalePresets)
    for(const activeRun of [false,true])for(const desktop of [false,true])for(const meta of profiles) {
      const stage=computeStageLayout(preset.width,preset.height),cellW=8.45*ui.value,cellH=20*ui.value;
      const cols=Math.floor(stage.stageWidth/cellW),rows=Math.floor(stage.stageHeight/cellH);
      const w=Math.min(78,cols-4),h=Math.min(28,rows-4);
      const aperture=machinePanelAperture(Math.floor((cols-w)/2),Math.floor((rows-h)/2),w,h);
      const items=titleMenuItems(meta,{activeRun,desktop});let scroll=0;
      for(const selected of [...items.keys(),...items.keys()].reverse()) {
        const l=pathRegisterLayout(aperture,{cellW,cellH,displayScale:stage.scale},{itemCount:items.length,selected,scroll});scroll=l.start;
        const description=`${preset.id} UI${ui.id} ${items[selected].id}`;
        assert.ok(l.rows.some(r=>r.index===selected),`selection in view: ${description}`);
        assert.ok(7*l.labelPitch*stage.scale>=11-1e-8,`legible labels: ${description}`);
        assert.ok(l.art.x+l.art.w<=l.width&&l.art.y+l.art.h<l.helpY,`picture fit: ${description}`);
        assert.ok(l.art.w>l.menuWidth*.7,`right graphic retains visual weight: ${description}`);
        assert.ok((l.art.x-(l.pad-3*l.unit+l.menuWidth))*stage.scale>=24-1e-8,`column clearance: ${description}`);
        assert.ok(l.profile.y+7*l.profile.pitch<l.categories.y,`profile/category separation: ${description}`);
        for(const row of l.rows) {
          const labelWidth=(items[row.index].label.length*6-1)*l.labelPitch;
          assert.ok(l.x+row.x+labelWidth<=(row.hit.x+row.hit.w)*cellW,`full label hit target: ${description}`);
          assert.ok(l.y+row.y+7*l.labelPitch<=(row.hit.y+row.hit.h)*cellH,`vertical hit target: ${description}`);
          assert.ok(row.hit.y*cellH>=l.y&&((row.hit.y+row.hit.h)*cellH-l.y)<l.helpY,`row fit: ${description}`);
        }
        const copy=pathRegisterCopy(items[selected].id,{activeRun,confirm:true});
        assert.ok(copy.lines.every(line=>line.length<=l.helpCapacity),`untruncated action help: ${description}`);
        const caption=pathRegisterWrap(copy.caption,l.caption.capacity);
        assert.ok(caption.every(line=>line.length<=l.caption.capacity),`caption width: ${description}`);
        assert.ok(l.caption.y+(caption.length-1)*9*l.caption.pitch+7*l.caption.pitch<=l.helpY,`caption/help separation: ${description}`);
        count++;
      }
    }
  assert.ok(count>7000);
});
