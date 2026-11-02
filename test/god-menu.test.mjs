import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { godTabLines, makeGodMenuScene, resolveGodRowDanger, resolveGodRowValue } from '../src/game/god-menu.js';

test('god menu accepts both dynamic and literal row values', () => {
  assert.equal(resolveGodRowValue({value:()=> 'READY'}),'READY');
  assert.equal(resolveGodRowValue({value:'[RESUME]'}),'[RESUME]');
  assert.equal(resolveGodRowValue({activate(){}}),'[FIRE]');
});

test('god menu accepts dynamic danger rows', () => {
  let active = false;
  assert.equal(resolveGodRowDanger({danger:()=>active}), false);
  active = true;
  assert.equal(resolveGodRowDanger({danger:()=>active}), true);
  assert.equal(resolveGodRowDanger({danger:true}), true);
});

test('god menu exposes tabbed conditions and closes with F10', () => {
  let value = 0;
  let closed = 0;
  const scene = makeGodMenuScene({
    tabs: [
      { id:'session', name:'Session', rows:[
        { kind:'section', label:'Run' },
        { id:'start', label:'Start', activate:()=>{} },
      ] },
      { id:'conditions', name:'Conditions', rows:[
        { id:'fear', label:'Fear', value:()=>value, adjust:(delta)=>{ value+=delta; } },
      ] },
    ],
    onClose:()=>{closed++;},
  });

  assert.deepEqual(scene.view().tabs.map((tab)=>tab.id), ['session','conditions']);
  scene.key({key:'Tab',preventDefault(){}});
  assert.equal(scene.view().tab, 'conditions');
  scene.key({key:'ArrowRight',preventDefault(){}});
  assert.equal(value, 1);
  scene.key({key:'F10',preventDefault(){}});
  assert.equal(closed, 1);
});

test('god menu scene blocks both player input and world simulation', () => {
  const scene = makeGodMenuScene({tabs:[{id:'one',rows:[{id:'fire',activate(){}}]}]});
  assert.equal(scene.id, 'god-menu');
  assert.equal(scene.blocksInput, true);
  assert.equal(scene.blocksWorld, true);
});

test('god menu tabs wrap onto further lines instead of running off the panel', () => {
  // The fifteen production tab names at the panel's 92-cell body width.
  const names = ['SESSION','PLACES','DRIVES','CATHEDRAL','ROOF','SOURCE','TOWER','DOORS','CONDITIONS',
    'LOOK STACK','ITEMS','GAME PARTS','SIDE QUESTS','THIRD FLOOR','AUDIO'];
  const lines = godTabLines(names, 92);
  assert.ok(lines.length >= 2);
  assert.deepEqual(lines.flat().map(({ index }) => index), names.map((_, index) => index));
  for (const line of lines) {
    const cells = line.reduce((sum, { name }) => sum + name.length + 2, 0) - 1;
    assert.ok(cells <= 92, `line of ${cells} cells`);
  }
  assert.equal(godTabLines(['SESSION', 'PLACES'], 92).length, 1);
  assert.deepEqual(godTabLines(['A-VERY-LONG-TAB'], 4).map((line) => line.length), [1]);
});

test('action guard runs before close and every activation or adjustment', () => {
  for (const key of ['Enter', ' ', 'ArrowRight', 'ArrowLeft']) {
    const order = [];
    const scene = makeGodMenuScene({
      tabs: [{ id: 'one', rows: [{ id: 'mutate', closeMenu: true,
        activate: () => order.push('activate'), adjust: delta => order.push('adjust:' + delta) }] }],
      beforeInvoke: (row, detail) => { order.push('guard:' + row.id + ':' + detail.adjustment); return true; },
      onClose: () => order.push('close'),
    });
    scene.key({ key });
    assert.deepEqual(order, key.startsWith('Arrow')
      ? ['guard:mutate:' + (key === 'ArrowRight' ? 1 : -1), 'adjust:' + (key === 'ArrowRight' ? 1 : -1)]
      : ['guard:mutate:null', 'close', 'activate']);
  }
});

for (const kind of ['false', 'throw', 'promise-resolve', 'promise-reject']) {
  test('action guard fails closed for ' + kind + ' before activate, adjust or closing', async () => {
    for (const key of ['Enter', 'ArrowRight']) {
      let closes = 0, changes = 0, allow = false;
      const errors = [];
      const scene = makeGodMenuScene({
        tabs: [{ id: 'one', rows: [{ id: 'mutate', closeMenu: true,
          activate: () => changes++, adjust: () => changes++ }] }],
        beforeInvoke: () => {
          if (allow) return true;
          if (kind === 'throw') throw Error('guard-save-failed');
          if (kind === 'promise-resolve') return Promise.resolve(true);
          if (kind === 'promise-reject') return Promise.reject(Error('guard-rejected'));
          return false;
        },
        onClose: () => closes++, onError: error => errors.push(error.message),
      });
      scene.key({ key });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(changes, 0); assert.equal(closes, 0);
      assert.deepEqual(errors, kind === 'false' ? [] : [kind === 'throw' ? 'guard-save-failed' : 'God-menu action guard must be synchronous']);
      // A denied action leaves the same usable menu, not a permanent pending lock.
      allow = true; scene.key({ key });
      assert.equal(changes, 1); assert.equal(closes, key === 'Enter' ? 1 : 0);
    }
  });
}

test('guard permits asynchronous actions only after synchronous protection and remains single-flight', async () => {
  const order = []; let release;
  const scene = makeGodMenuScene({
    tabs: [{ id: 'one', rows: [{ id: 'mutate', activate: () => {
      order.push('change'); return new Promise(resolve => { release = resolve; });
    } }] }],
    beforeInvoke: () => { order.push('guard'); return true; },
  });
  for (let i = 0; i < 8; i++) scene.key({ key: 'Enter', repeat: i > 0 });
  assert.deepEqual(order, ['guard', 'change']);
  release(); await new Promise(resolve => setImmediate(resolve));
  scene.key({ key: 'Enter' }); assert.deepEqual(order, ['guard', 'change', 'guard', 'change']); release();
});

test('opening, inspecting values, navigating and closing do not invoke a mutation guard', () => {
  let guarded = 0, closed = 0;
  const scene = makeGodMenuScene({
    tabs: [{ id: 'one', rows: [{ kind: 'info', id: 'status', value: () => 'READY' },
      { id: 'first', value: () => 'READ', activate() {} }, { id: 'second', activate() {} }] }],
    beforeInvoke: () => { guarded++; return true; }, onClose: () => closed++,
  });
  scene.view(); assert.equal(resolveGodRowValue({ value: () => 'READY' }), 'READY');
  scene.key({ key: 'ArrowDown' }); scene.view(); scene.key({ key: 'Escape' });
  assert.equal(guarded, 0); assert.equal(closed, 1);
});

test('actual main God boundary protects real profile receipts, reload and causal filing while resume stays safe', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
    globalThis.localStorage={map:new Map(),getItem(k){return this.map.get(k)??null},setItem(k,v){this.map.set(k,String(v))},removeItem(k){this.map.delete(k)}};
    globalThis.window=undefined;
    const S=await import('./src/game/save.js'),P=await import('./src/progression/runtime.js');
    const {EVENT_TYPES:E}=await import('./src/progression/events.js');
    const {finalizeCausalReturn}=await import('./src/progression/causal-progression.js');
    const {makeGodMenuScene}=await import('./src/game/god-menu.js');
    const source=fs.readFileSync('./src/main.js','utf8');
    function extract(name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\\n}',start);assert.ok(start>=0&&end>start);return source.slice(start,end+2);}
    const resumeSource=source.split('\\n').find(line=>line.includes("id:'resume',label:'CLOSE GOD MENU'"));assert.ok(resumeSource);
    S.saveLoad();P.progressionInit();S.newGame({preset:'contract'});P.beginRunProgression();P.emitProgress(E.WORK_ORDER_ACCEPTED,{},'ordinary-contract');
    const prior=JSON.stringify(S.getMeta()),stack=[],log=[];let rows=[];
    const ctx=vm.createContext({makeGodMenuScene,paused:false,godMenuWasPaused:false,
      scenes:{top:()=>stack.at(-1),push:scene=>stack.push(scene),pop:()=>stack.pop()},
      godTabs:()=>[{id:'one',rows}],setGameplayPaused:value=>{ctx.paused=value;},resetMotionInput:()=>{},
      markDeveloperRun:reason=>{log.push({kind:'guard',reason});return P.markDeveloperRun(reason);},pushEvent:message=>log.push({kind:'error',message})});
    vm.runInContext(extract('closeGodMenu')+'\\n'+extract('openGodMenu'),ctx);
    const resume=vm.runInContext('('+resumeSource.trim().replace(/,$/,'')+')',ctx);
    rows=[resume];ctx.openGodMenu();stack.at(-1).view();assert.equal(S.getSave().run.integrity.achievements.eligible,true);
    stack.at(-1).key({key:'Enter'});assert.equal(stack.length,0);assert.equal(JSON.stringify(S.getMeta()),prior);
    assert.equal(S.getSave().run.integrity.achievements.eligible,true);assert.equal(log.length,0);
    ctx.openGodMenu();ctx.openGodMenu();assert.equal(stack.length,0);assert.equal(S.getSave().run.integrity.achievements.eligible,true);
    ctx.openGodMenu();stack.at(-1).key({key:'F10'});assert.equal(stack.length,0);assert.equal(S.getSave().run.integrity.achievements.eligible,true);
    for(const key of ['Enter','ArrowRight','ArrowLeft']){
      if(key!=='Enter'){S.newGame({preset:'contract'});P.beginRunProgression();}
      const id='actual-'+key,events=[];
      const mutate=()=>{assert.equal(S.getSave().run.integrity.achievements.eligible,false,'guard precedes handler');
        events.push(P.emitProgress(E.HUSH_MET,{reason:'GOD fixture'},'actual-god-row'));
        events.push(P.emitProgress(E.SECRET_DISCOVERED,{id:'off-air'},'actual-god-row'));};
      rows=[{id,activate:mutate,adjust:mutate}];ctx.openGodMenu();
      for(let i=0;i<4;i++)stack.at(-1).key({key,repeat:i>0});
      assert.equal(events.length,8);assert.ok(events.every(event=>event.unranked===true&&event.unlocked.length===0));
      assert.equal(S.getSave().run.integrity.achievements.reason,'GOD_MENU:'+id);
      const summary=P.commitReturn('sacrifice',{rec:{takes:[],injuries:0}});assert.equal(summary.developerRun,true);
      assert.equal((await finalizeCausalReturn(summary)).ok,false,'unranked summary cannot produce an eligible tape');
      assert.deepEqual(Object.keys(S.getMeta().achievements),['ACH_WORK_ORDER']);
      assert.deepEqual(S.getMeta().completion.secrets,{});assert.deepEqual(S.getMeta().endingsSeen,[]);
      assert.equal(S.getMeta().stats.runsCompleted,0);
      // Existing diagnostics retain explicitly unranked summaries. Their use
      // by ordinary history/world selectors is a separate audited limitation.
      assert.ok(S.getMeta().returns.history.every(id=>S.getMeta().returns.records[id].developerRun===true));
      assert.deepEqual(S.getMeta().platform.pendingAchievements,['ACH_WORK_ORDER']);
      const saved=S.getSave().run;S.saveLoad();assert.equal(S.getSave().run.id,saved.id);
      assert.equal(S.getSave().run.integrity.achievements.eligible,false);ctx.closeGodMenu();
    }
    assert.ok(log.some(row=>row.reason==='GOD_MENU:actual-Enter'));
    assert.equal(log.some(row=>row.kind==='error'),false);
    S.newGame({preset:'contract'});P.beginRunProgression();assert.equal(S.getSave().run.integrity.achievements.eligible,true);
    assert.ok(P.emitProgress(E.HUSH_MET,{},'ordinary-new-night').unlocked.includes('ACH_HUSH_MET'));
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 20000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
