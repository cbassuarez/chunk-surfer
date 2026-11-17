import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {titleMenuItems,titleOptionsLayout} from '../src/game/title-menu.js';
import {makeTitleScene} from '../src/game/title.js';
import {withTransientGameState} from '../src/game/save.js';

const ids=(meta,options)=>titleMenuItems(meta,options).map(row=>row.id);
test('first launch offers usable actions and no empty history or disabled Continue',()=>{
  assert.deepEqual(ids({}, {desktop:true}),['new-run','settings','about','quit']);
  assert.deepEqual(ids({}, {}),['new-run','settings','about']);
  assert.equal(titleMenuItems()[0].confirms,false);
});
test('returning profiles retain each available kind of history without an active run',()=>{
  assert.deepEqual(ids({endingsSeen:['one'],knowledge:{documents:{sheet:{}}}}, {desktop:true}),
    ['new-run','archive','return-index','transfer-room','settings','about','quit']);
  assert.deepEqual(ids({knowledge:{documents:{sheet:{}}}}, {}),['new-run','archive','transfer-room','settings','about']);
  assert.deepEqual(ids({knowledge:{props:{door:{}}}}, {}),['new-run','archive','settings','about']);
});
test('an active run selects Continue and new game requires two distinct presses',async()=>{
  await withTransientGameState({save:{run:{id:'title-fixture',status:'active'}}},()=>{
    const calls=[];let selected;
    const scene=makeTitleScene({onContinue:()=>calls.push('continue'),onNewGame:()=>calls.push('new'),onSelectionChange:id=>selected=id});
    scene.key({key:'Enter'});assert.deepEqual(calls,['continue']);
    scene.keyup({key:'Enter'});scene.key({key:'ArrowDown'});assert.equal(selected,'new-run');
    scene.key({key:'Enter'});assert.deepEqual(calls,['continue']);
    scene.key({key:'Enter',repeat:true});scene.key({key:'Enter'});
    assert.deepEqual(calls,['continue'],'holding a key cannot confirm replacement');
    scene.keyup({key:'Enter'});scene.key({key:'Enter'});assert.deepEqual(calls,['continue','new']);
  });
});
test('fresh New game needs one press and overlays release the activation latch on resume',async()=>{
  await withTransientGameState({save:{run:null},meta:{}},()=>{
    const calls=[];
    const scene=makeTitleScene({onNewGame:()=>calls.push('new'),onSettings:()=>calls.push('settings'),onAbout:()=>calls.push('about'),onQuit:()=>calls.push('quit')});
    scene.key({key:'Enter'});assert.deepEqual(calls,['new']);
    scene.resume();scene.key({key:'ArrowDown'});scene.key({key:'Enter'});assert.deepEqual(calls,['new','settings']);
    scene.resume();scene.key({key:'Enter'});assert.deepEqual(calls,['new','settings','settings']);
    scene.keyup({key:'Enter'});scene.key({key:'End'});scene.key({key:'Enter'});assert.equal(calls.at(-1),'quit');
  });
});
test('the single-column list scrolls within its existing option area',()=>{
  for(const [bodyW,availableHeight] of [[72,6.2],[54,4.6],[44,3]]){
    const body={x:5,y:5,w:bodyW,h:22};
    const menuY=body.y+12,bottom=menuY+availableHeight;
    let scroll=0;
    for(let selected=0;selected<8;selected++){
      const p=titleOptionsLayout(body,{menuY,bottom,itemCount:8,selected,scroll});scroll=p.start;
      assert.ok(selected>=p.start&&selected<p.start+p.visible,'selected action stays in view');
      assert.ok(p.x>=body.x&&p.x+p.w<=body.x+body.w);
      assert.ok(menuY+(p.visible-1)*p.rowStep+.8<=bottom);
      assert.equal(p.x,body.x+7,'the list keeps the original single-column inset');
    }
    for(let selected=7;selected>=0;selected--){
      const p=titleOptionsLayout(body,{menuY,bottom,itemCount:8,selected,scroll});scroll=p.start;
      assert.ok(selected>=p.start&&selected<p.start+p.visible);
    }
  }
});
test('Path register retains the instrument stack, live bezel meter and menu actions',()=>{
  const source=readFileSync('src/game/title.js','utf8'),main=readFileSync('src/main.js','utf8');
  const header=readFileSync('src/render/title-path-register.js','utf8');
  assert.match(source,/withMachinePanel/);assert.doesNotMatch(source,/finish:|glass:/);
  assert.match(source,/display.draw\(layout,items,sel/);
  assert.match(header,/vfdGlyph/);assert.match(source,/monitorProgramMeasurement/);
  assert.match(source,/meter: true/);assert.match(source,/meterSnapshot:.*monitorSnapshotForRms/);
  assert.match(source,/label: 'CASE SELECT'/);assert.match(source,/source: '4417-C'/);
  assert.doesNotMatch(source,/FIVE ROOM TONES|STANDBY \/ CASE FILE|AUDIOCORP LOCAL MONITOR READY|drawLocationIndicator/);
  assert.match(source,/createPathRegisterMotion/);
  assert.doesNotMatch(source,/previousSelUntil/,'old selection never ghosts over the new action');
  assert.match(source,/const frameItemCount = transferRoomOpen \? 7 : 6/);
  assert.doesNotMatch(source,/renderCinematicConservatory|Georgia|Times New Roman/);
  assert.match(main,/onAbout:openAboutPanel/);assert.match(main,/onQuit:IS_TAURI\?requestQuitDesktop:null/);
});
