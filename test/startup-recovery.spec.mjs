import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/startup-guard.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const graphicsError=()=>Object.assign(Error('shader: driver compiler failed'),{code:'CHUNK_GRAPHICS_STARTUP'});
function fixture({invoke,van,storage=new Map(),storageMode='normal',href='tauri://localhost/index.html',reloadThrows=false}={}){
  const elements=new Map(['startupRecovery','startupRecoveryTitle','startupRecoveryMessage','startupRecoveryDetails','startupRecoveryRetry','startupRecoveryGraphics'].map(id=>[id,{
    hidden:id==='startupRecoveryRetry'||id==='startupRecoveryGraphics',textContent:'unchanged',
    setAttribute(name,value){this[name]=value;},focus(){this.focused=true;}
  }]));
  const listeners=new Map(),timers=new Map(),calls=[];let serial=0,reloads=0;
  const location={href,reload(){reloads++;if(reloadThrows)throw Error('reload unavailable');}};
  const window={location,
    addEventListener(type,fn){listeners.set(type,fn);},removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);},
    setTimeout(fn,ms){timers.set(++serial,{fn,ms});return serial;},clearTimeout(id){timers.delete(id);}
  };
  if(storageMode==='denied')Object.defineProperty(window,'sessionStorage',{get(){throw Error('storage denied');}});
  else if(storageMode!=='absent')window.sessionStorage={
    getItem:key=>storage.has(key)?storage.get(key):null,
    setItem(key,value){if(storageMode==='unreliable')return;storage.set(key,String(value));},
    removeItem:key=>storage.delete(key),
  };
  if(invoke)window.__TAURI_INTERNALS__={invoke:(command,args)=>{calls.push({command,args});return invoke(command,args);}};
  if(van)window.__chunkStartupVan=van;
  const document={hidden:false,getElementById:id=>elements.get(id)};
  runInNewContext(source,{window,document});
  return{window,document,elements,timers,storage,calls,api:window.__chunkStartup,
    fire(type,value){listeners.get(type)?.(value);},
    run(ms){for(const[id,timer]of[...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}},
    get reloads(){return reloads;}
  };
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('real boot plus first frame retires immediately; artwork and cleanup never hold readiness',async()=>{
  let queries=0,reveals=0;
  const f=fixture({invoke:()=>Promise.resolve(),van:{canReveal(){queries++;return false;},reveal(){reveals++;}}});
  assert.equal(f.api.booted(true),false);assert.equal(f.api.status(),'starting');assert.equal(f.calls.length,0);
  assert.equal(f.api.frame(),true);await settle();
  assert.equal(f.api.status(),'ready');assert.equal(f.elements.get('startupRecovery').hidden,true);
  assert.equal(f.elements.get('startupRecovery')['aria-hidden'],'true');assert.equal(f.timers.size,0);
  assert.equal(queries,0);assert.equal(reveals,1);assert.deepEqual(f.calls.map(c=>c.command),['chunk_graphics_ready']);
  assert.equal(f.api.frame(),false);assert.equal(f.calls.length,1);
});

test('an active departure releases world input and native readiness before retiring its decoration',()=>{
  let depart;
  const f=fixture({invoke:()=>Promise.resolve(),van:{reveal(complete){depart=complete;return true;}}});
  const surface=f.elements.get('startupRecovery');
  f.api.booted(true);assert.equal(f.api.frame(),true);
  assert.equal(f.api.status(),'ready');assert.equal(surface['data-phase'],'ready');assert.equal(surface['aria-hidden'],'true');
  assert.equal(surface.hidden,false);assert.deepEqual(f.calls.map(c=>c.command),['chunk_graphics_ready']);
  assert.equal(f.timers.size,0);assert.equal(f.api.frame(),false);
  depart();assert.equal(surface.hidden,true);
});

test('generic global, rejected, optional and render-loop errors are diagnostic rather than fatal',async()=>{
  const f=fixture({invoke:()=>Promise.resolve()});
  f.fire('error',{error:Error('optional analyser failed')});
  f.fire('unhandledrejection',{reason:Error('optional asset decode failed')});
  for(const tagName of['IMG','AUDIO','LINK','SCRIPT'])f.fire('error',{target:{tagName,src:'optional-missing'}});
  f.api.report(Error('one render-loop fault'),{source:'render-loop'});
  assert.equal(f.api.status(),'starting');assert.equal(f.api.diagnostics().reloadScheduled,false);assert.equal(f.calls.length,0);
  assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,90000);
  assert.equal(f.api.booted(true),false);assert.equal(f.api.frame(),true);await settle();assert.equal(f.api.status(),'ready');
  const reports=f.api.diagnostics().entries;
  assert.ok(reports.some(e=>e.source==='global-error'&&e.category==='runtime'));
  assert.ok(reports.some(e=>e.source==='promise-rejection'));
  assert.ok(reports.some(e=>e.source==='resource'&&e.category==='optional'));
  assert.ok(reports.some(e=>e.source==='render-loop'));
  assert.deepEqual(f.calls.map(c=>c.command),['chunk_graphics_ready']);
});

test('post-ready errors remain diagnostic and never reopen or restart the game',()=>{
  const f=fixture();f.api.booted(true);f.api.frame();
  f.fire('error',{error:Error('later runtime error')});f.fire('unhandledrejection',{reason:Error('later rejection')});
  assert.equal(f.api.fail(Error('late explicit boot failure')),false);
  assert.equal(f.api.status(),'ready');assert.equal(f.elements.get('startupRecovery').hidden,true);
  assert.equal(f.reloads,0);assert.equal(f.timers.size,0);assert.ok(f.api.diagnostics().totalReports>=3);
});

test('main import failures get one quiet same-URL reload after at least one second, without failure UI',()=>{
  for(const target of[{tagName:'SCRIPT',src:'http://localhost/src/main.js?v=1'},{tagName:'SCRIPT',id:'chunkMain',src:'tauri://localhost/assets/index-abcd.js'}]){
    const f=fixture();f.fire('error',{target});
    assert.equal(f.api.status(),'waiting');assert.equal(f.reloads,0);
    assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,1000);
    assert.ok(f.api.diagnostics().entries.some(e=>e.source==='main-import'&&e.category==='import'));
    assert.equal(f.elements.get('startupRecoveryTitle').textContent,'unchanged');
    assert.equal(f.elements.get('startupRecoveryMessage').textContent,'unchanged');
    assert.equal(f.elements.get('startupRecoveryDetails').textContent,'unchanged');
    assert.equal(f.elements.get('startupRecoveryRetry').hidden,true);assert.equal(f.elements.get('startupRecoveryGraphics').hidden,true);
    f.run(1000);assert.equal(f.reloads,1);f.api.fail(Error('duplicate boot failure'));f.run(1000);assert.equal(f.reloads,1);
  }
});

test('the reload budget survives the retry document and resets only after genuine successful boot',()=>{
  const storage=new Map([['player-save','keep']]);
  const first=fixture({storage});first.api.fail(Error('boot failed'));first.run(1000);assert.equal(first.reloads,1);
  const second=fixture({storage});second.api.fail(Error('still broken'));second.run(1000);
  assert.equal(second.reloads,0);assert.equal(second.api.diagnostics().reloadUsed,true);
  assert.equal(second.api.booted(true),false);assert.ok([...storage.keys()].some(key=>key.startsWith('chunk.startup.quiet-reload.v1:')));
  second.api.frame();assert.equal(second.api.status(),'ready');assert.deepEqual([...storage],[['player-save','keep']]);
  const later=fixture({storage});later.api.fail(Error('a later independent launch failed'));later.run(1000);assert.equal(later.reloads,1);
});

test('unavailable or unreliable storage never permits a repeating reload',()=>{
  for(const storageMode of['absent','denied','unreliable']){
    const f=fixture({storageMode});f.api.fail(Error('boot failed'));f.run(1000);f.api.fail(Error('again'));f.run(1000);
    assert.equal(f.reloads,0);assert.equal(f.api.diagnostics().reloadScheduled,false);assert.equal(f.api.status(),'waiting');
    f.api.booted(true);f.api.frame();assert.equal(f.api.status(),'ready');
  }
});

test('URL changes and reload exceptions cannot redirect or consume a repeating attempt',()=>{
  const changed=fixture();changed.api.fail(Error('boot failed'));changed.window.location.href='tauri://localhost/another.html';changed.run(1000);
  assert.equal(changed.reloads,0);assert.equal(changed.api.status(),'waiting');
  const denied=fixture({reloadThrows:true});denied.api.fail(Error('boot failed'));denied.run(1000);
  assert.equal(denied.reloads,1);assert.ok(denied.api.diagnostics().entries.some(e=>e.source==='quiet-reload'&&e.category==='recovery-unavailable'));
  denied.api.fail(Error('again'));denied.run(1000);assert.equal(denied.reloads,1);
});

test('a recovered boot cancels its pending reload and does not wait for its deadline',()=>{
  const f=fixture();f.api.fail(Error('transient boot failure'));assert.equal(f.api.diagnostics().reloadScheduled,true);
  f.api.booted(true);assert.equal(f.api.frame(),true);assert.equal(f.api.status(),'ready');assert.equal(f.timers.size,0);
  f.run(1000);assert.equal(f.reloads,0);assert.equal(f.storage.size,0);
});

test('an explicit boot failure invalidates old frame evidence but permits a fresh successful attempt',async()=>{
  const f=fixture({invoke:()=>Promise.resolve()});f.api.frame();f.api.fail(Error('boot failure after an earlier frame'));
  assert.equal(f.api.diagnostics().frameComplete,false);assert.equal(f.api.diagnostics().bootComplete,false);
  assert.equal(f.api.booted(true),false);assert.equal(f.api.status(),'waiting');assert.equal(f.calls.length,0);
  assert.equal(f.api.frame(),true);await settle();assert.equal(f.api.status(),'ready');
  assert.deepEqual(f.calls.map(c=>c.command),['chunk_graphics_ready']);
  const reverse=fixture();reverse.api.fail(Error('failed'));assert.equal(reverse.api.frame(),false);assert.equal(reverse.api.booted(true),true);
});

test('a stalled load records waiting without restarting, clearing saves or fabricating readiness',()=>{
  const f=fixture({invoke:()=>Promise.resolve({canRecover:true})});f.run(90000);
  assert.equal(f.api.status(),'waiting');assert.equal(f.reloads,0);assert.equal(f.calls.length,0);
  assert.equal(f.api.diagnostics().bootComplete,false);assert.equal(f.api.diagnostics().frameComplete,false);
  assert.ok(f.api.diagnostics().entries.some(e=>e.source==='startup-watchdog'&&e.category==='stalled'));
  assert.equal(f.api.booted(true),false);assert.equal(f.api.frame(),true);assert.equal(f.api.status(),'ready');
});

test('only a tagged graphics failure can use the one native recovery attempt',async()=>{
  const f=fixture({invoke:()=>Promise.resolve({restarting:true})});
  f.api.report(Error('generic rendering issue'),{source:'render-loop'});
  assert.equal(await f.api.retryGraphics(),false);assert.equal(f.calls.length,0);
  f.api.fail(graphicsError());assert.equal(f.api.status(),'recovering');
  f.fire('unhandledrejection',{reason:graphicsError()});f.api.fail(graphicsError());await settle();
  assert.deepEqual(f.calls.map(c=>c.command),['chunk_graphics_recover']);assert.equal(f.calls[0].args.manual,false);
  assert.equal(f.reloads,0);assert.equal(f.api.diagnostics().reloadScheduled,false);
  f.api.booted(true);f.api.frame();assert.equal(f.api.status(),'recovering');
  assert.ok(!f.calls.some(c=>c.command==='chunk_graphics_ready'));
});

test('exhausted or failed native recovery stays waiting, records its cause and accepts new real evidence',async()=>{
  for(const result of['exhausted','rejected']){
    const f=fixture({invoke:command=>command==='chunk_graphics_recover'
      ?result==='exhausted'?Promise.resolve({canRecover:false}):Promise.reject(Error('native recovery unavailable'))
      :Promise.resolve()});
    f.api.frame();f.api.fail(graphicsError());await settle();
    assert.equal(f.api.status(),'waiting');assert.equal(f.api.diagnostics().frameComplete,false);assert.equal(f.api.diagnostics().graphicsActive,false);
    assert.equal(await f.api.retryGraphics(),false);assert.equal(f.calls.filter(c=>c.command==='chunk_graphics_recover').length,1);
    assert.ok(f.api.diagnostics().entries.some(e=>e.source==='native-graphics-recovery'&&e.category==='recovery-unavailable'));
    assert.equal(f.api.booted(true),false);assert.equal(f.api.frame(),true);await settle();assert.equal(f.api.status(),'ready');
    assert.equal(f.calls.filter(c=>c.command==='chunk_graphics_ready').length,1);assert.equal(f.reloads,0);
  }
});

test('tagged global errors use native recovery while unrelated promise rejections remain reports',async()=>{
  const f=fixture({invoke:()=>Promise.resolve({canRecover:false})});
  f.fire('unhandledrejection',{reason:Error('optional promise')});assert.equal(f.calls.length,0);
  f.fire('error',{error:graphicsError()});await settle();
  assert.equal(f.calls.filter(c=>c.command==='chunk_graphics_recover').length,1);assert.equal(f.api.status(),'waiting');
  assert.ok(f.api.diagnostics().entries.some(e=>e.source==='global-error'&&e.category==='graphics'));
});

test('van exceptions and native readiness bookkeeping cannot cover a completed game',async()=>{
  const f=fixture({invoke:()=>Promise.reject(Error('cache unavailable')),van:{reveal(){throw Error('optional canvas unavailable');}}});
  assert.equal(f.api.booted(true),false);assert.equal(f.api.frame(),true);await settle();
  assert.equal(f.api.status(),'ready');assert.equal(f.elements.get('startupRecovery').hidden,true);
  assert.ok(f.api.diagnostics().entries.some(e=>e.source==='startup-van'&&e.category==='optional'));
  assert.ok(f.api.diagnostics().entries.some(e=>e.source==='native-graphics-ready'));
  assert.equal(f.reloads,0);
});

test('2D readiness does not cache untested graphics; animation completion does not certify boot',async()=>{
  const f=fixture({invoke:()=>Promise.resolve(),van:{canReveal:()=>true,reveal(){}}});
  f.fire('chunk-startup-van-complete');assert.equal(f.api.status(),'starting');assert.equal(f.calls.length,0);
  assert.equal(f.api.booted(false),true);await settle();assert.equal(f.api.status(),'ready');assert.equal(f.calls.length,0);
});

test('diagnostics are bounded, deduplicated and returned without mutable internal references',()=>{
  const f=fixture();
  for(let i=0;i<80;i++)f.api.report('fault'+i,{source:'render-loop',category:'runtime'});
  let snapshot=f.api.diagnostics();assert.equal(snapshot.entries.length,32);assert.equal(snapshot.droppedReports,48);assert.equal(snapshot.totalReports,80);
  f.api.report('fault79',{source:'render-loop',category:'runtime'});f.api.report('fault79',{source:'render-loop',category:'runtime'});
  snapshot=f.api.diagnostics();assert.equal(snapshot.entries.length,32);assert.equal(snapshot.entries.at(-1).count,3);assert.equal(snapshot.totalReports,82);
  snapshot.entries[0].detail='mutated';assert.notEqual(f.api.diagnostics().entries[0].detail,'mutated');
  f.api.report({stack:'x'.repeat(5000),code:'c'.repeat(500)},{source:'s'.repeat(500),category:'z'.repeat(500)});
  const last=f.api.diagnostics().entries.at(-1);assert.equal(last.detail.length,1600);assert.equal(last.source.length,80);assert.equal(last.category.length,64);assert.equal(last.code.length,80);
  assert.equal(f.api.status(),'starting');assert.equal(f.api.diagnostics().reloadScheduled,false);
});

test('quiet reload budgets are per document URL and ignore only fragments',()=>{
  const storage=new Map(),one=fixture({storage,href:'tauri://localhost/index.html?mode=story#a'});
  one.api.fail(Error('failed'));one.run(1000);assert.equal(one.reloads,1);
  const same=fixture({storage,href:'tauri://localhost/index.html?mode=story#b'});same.api.fail(Error('again'));same.run(1000);assert.equal(same.reloads,0);
  const other=fixture({storage,href:'tauri://localhost/index.html?mode=other'});other.api.fail(Error('different document'));other.run(1000);assert.equal(other.reloads,1);
});

test('the actual loading host has no failure pane and loads the dependency-free guard before main',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('src="./startup-guard.js"')<html.indexOf('id="chunkMain" type="module"'));
  assert.match(html,/<section id="startupRecovery"[^>]*data-phase="starting"/);
  assert.doesNotMatch(html,/id="startupRecovery(?:Details|Retry|Graphics)"/);
  assert.doesNotMatch(source,/setPhase\(['"]failed['"]\)/);
  assert.match(html,/#startupRecovery\[hidden\]/);
  assert.match(html,/#startupRecovery\[data-phase="ready"\] \{ pointer-events: none; \}/);
  assert.match(html,/#startupRecovery\[data-phase="ready"\]::before \{ opacity: 0; \}/);
});

