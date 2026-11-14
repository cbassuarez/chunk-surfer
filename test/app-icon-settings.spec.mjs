import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppIconController} from '../src/platform/app-icon.js';
import {makeSettingsScene} from '../src/game/settings.js';
import * as SAVE from '../src/game/save.js';
import {normalizeSettings} from '../src/progression/schema.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const enter=(scene,repeat=false)=>scene.key({key:'Enter',code:'Enter',repeat});
const rows=scene=>scene.debugState().rows;
const iconRow=scene=>rows(scene).find(row=>row.id==='about:appIcon');

test('browser and unsupported platforms never send a native icon change',async()=>{
  let calls=0;const browser=createAppIconController({desktop:false,invoke:()=>calls++});
  assert.equal((await browser.refresh()).supported,false);
  await assert.rejects(browser.setChoice('ear'),/unavailable/);assert.equal(calls,0);
  const desktop=createAppIconController({desktop:true,invoke:async command=>{calls++;assert.equal(command,'chunk_app_icon_status');return{supported:false,choice:'van'};}});
  await assert.rejects(desktop.setChoice('ear'),/unavailable/);assert.equal(calls,1);
});

test('native confirmation owns the icon across independent controller lifetimes',async()=>{
  let native='van';const calls=[];
  const invoke=async(command,args)=>{calls.push([command,args]);if(command==='chunk_set_app_icon')native=args.choice;return{supported:true,choice:native};};
  const first=createAppIconController({desktop:true,invoke});await first.refresh();await first.setChoice('ear');
  assert.equal(first.snapshot().choice,'ear');
  const afterNewNight=createAppIconController({desktop:true,invoke});assert.equal((await afterNewNight.refresh()).choice,'ear');
  await afterNewNight.setChoice('van');assert.equal(native,'van');
  assert.equal(calls.filter(([command])=>command==='chunk_set_app_icon').length,2);
});

test('a failed or unconfirmed switch retains the confirmed choice and permits a real retry',async()=>{
  let mode='fail';
  const c=createAppIconController({desktop:true,invoke:async command=>{
    if(command==='chunk_app_icon_status')return{supported:true,choice:'van'};
    if(mode==='fail')throw Error('native refused');
    return{supported:true,choice:mode==='wrong'?'van':'ear'};
  }});
  await c.refresh();await assert.rejects(c.setChoice('ear'),/refused/);assert.equal(c.snapshot().choice,'van');assert.equal(c.snapshot().pending,false);
  mode='wrong';await assert.rejects(c.setChoice('ear'),/confirm/);assert.equal(c.snapshot().choice,'van');
  mode='success';await c.setChoice('ear');assert.equal(c.snapshot().choice,'ear');assert.equal(c.snapshot().error,null);
});

test('rapid requests share one native operation and an already selected choice cannot strand the controller',async()=>{
  const gate=deferred(),calls=[];
  const c=createAppIconController({desktop:true,invoke:async(command,args)=>{
    calls.push([command,args]);if(command==='chunk_app_icon_status'){await gate.promise;return{supported:true,choice:'van'};}return{supported:true,choice:args.choice};
  }});
  const first=c.setChoice('ear'),second=c.setChoice('ear');gate.resolve();await Promise.all([first,second]);
  assert.equal(calls.length,2);assert.equal(c.snapshot().choice,'ear');
  await c.setChoice('ear');await c.setChoice('van');assert.equal(c.snapshot().choice,'van');assert.equal(calls.length,3);
  await assert.rejects(c.setChoice('other'),/van or the ear/);assert.equal(calls.length,3);
});

test('seven deliberate version activations reveal a persistent setting; held confirmations do not',async()=>{
  await SAVE.withTransientGameState({save:{...SAVE.getSave(),settings:{...SAVE.getSave().settings,appIconUnlocked:false}}},async()=>{
    const current={supported:true,choice:'van',pending:false};
    const scene=makeSettingsScene({initialTab:'system',hooks:{appIconStatus:()=>current,setAppIcon:async choice=>({...current,choice})}});
    assert.equal(iconRow(scene),undefined);
    enter(scene);for(let n=0;n<30;n++)enter(scene,true);
    for(let n=0;n<5;n++)enter(scene);assert.equal(iconRow(scene),undefined);
    enter(scene);assert.equal(iconRow(scene).value,'VAN');assert.equal(SAVE.getSave().settings.appIconUnlocked,true);
    const resumed=makeSettingsScene({initialTab:'system',hooks:{appIconStatus:()=>current,setAppIcon:async choice=>({...current,choice})}});
    assert.ok(iconRow(resumed));assert.equal(normalizeSettings(SAVE.getSave().settings).appIconUnlocked,true);
  });
});

test('revealed menu shows pending and failure truthfully, blocks auto-repeat and restores the van',async()=>{
  await SAVE.withTransientGameState({save:{...SAVE.getSave(),settings:{...SAVE.getSave().settings,appIconUnlocked:true}}},async()=>{
    const pending=deferred();let choice='van',calls=0,fail=true;
    const scene=makeSettingsScene({initialTab:'system',hooks:{appIconStatus:()=>({supported:true,choice,pending:false}),setAppIcon:async next=>{
      calls++;await pending.promise;if(fail)throw Error('failed');choice=next;return{supported:true,choice};
    }}});
    enter(scene,true);scene.key({key:'ArrowDown'});assert.equal(scene.debugState().selectedId,'about:appIcon');
    enter(scene);enter(scene);enter(scene,true);assert.equal(calls,1);assert.equal(iconRow(scene).value,'VAN · CHANGING');
    pending.resolve();await flush();assert.equal(iconRow(scene).value,'VAN · RETRY');
    fail=false;enter(scene);await flush();assert.equal(iconRow(scene).value,'EAR');
    enter(scene);await flush();assert.equal(iconRow(scene).value,'VAN');
    assert.equal(SAVE.getSave().settings.appIcon,undefined,'confirmed selection is not duplicated in a night save');
  });
});

test('an unsupported platform never advertises the discovered row',async()=>{
  await SAVE.withTransientGameState({save:{...SAVE.getSave(),settings:{...SAVE.getSave().settings,appIconUnlocked:false}}},async()=>{
    let calls=0;
    const scene=makeSettingsScene({initialTab:'system',hooks:{appIconStatus:()=>({supported:false,choice:'van'}),setAppIcon:()=>calls++}});
    for(let n=0;n<7;n++)enter(scene);
    assert.equal(iconRow(scene),undefined);scene.key({key:'ArrowDown'});enter(scene);assert.equal(calls,0);
  });
});
