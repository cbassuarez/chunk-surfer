import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {DesktopStorage,MemoryFileAdapter} from '../src/platform/storage/desktopStorage.js';
import {BrowserStorage} from '../src/platform/storage/browserStorage.js';

class MemoryStorage{
 constructor(){this.data=new Map();}
 getItem(key){return this.data.get(key)??null;}
 setItem(key,value){this.data.set(key,String(value));}
 removeItem(key){this.data.delete(key);}
 clear(){this.data.clear();}
}
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
let instance=0;
const fresh=()=>import(new URL(`../src/platform/storage/storageService.js?initialization-race=${++instance}`,import.meta.url));
function isolate(t){
 const previous=globalThis.localStorage;globalThis.localStorage=new MemoryStorage();
 t.after(()=>{globalThis.localStorage=previous;});
}
function replace(t,prototype,name,method){const original=prototype[name];prototype[name]=method;t.after(()=>{prototype[name]=original;});return original;}

test('one reserved initialization holds every early queued write until the real desktop adapter exists',async t=>{
 isolate(t);const service=await fresh(),gate=deferred(),entered=deferred(),adapter=new MemoryFileAdapter(),writes=[];let starts=0;
 const originalInit=DesktopStorage.prototype.init;
 replace(t,DesktopStorage.prototype,'init',async function(){starts++;this.adapter=null;entered.resolve();await gate.promise;this.adapter=adapter;return originalInit.call(this);});
 for(const [name,label]of [['saveSettings','settings'],['saveProfile','profile'],['saveGame','save']]){
  const original=DesktopStorage.prototype[name];replace(t,DesktopStorage.prototype,name,async function(...args){assert(this.adapter,'no write can observe a null adapter');writes.push(label);return original.apply(this,args);});
 }
 const first=service.initGameStorage({kind:'desktop',adapter,gameVersion:'INIT-RACE'});
 // These are deliberately submitted in the same turn, before diagnostics or
 // adapter setup yields. They must be retained, not returned as false.
 const queued=[service.saveSettingsQueued({volume:.24}),service.saveProfileQueued({runs:7}),
  service.saveGameQueued({version:3,area:'chapel',settings:{volume:.24}}),service.saveSettingsQueued({volume:.71})];
 const joined=service.initGameStorage({kind:'browser',gameVersion:'MUST-NOT-REPLACE'});assert.equal(first,joined);
 await entered.promise;await turn();assert.equal(starts,1);assert.deepEqual(writes,[]);assert.equal(service.storageReady(),false);assert.equal(service.currentStorage(),null);
 gate.resolve();const store=await first;assert.deepEqual(await Promise.all(queued),[true,true,true,true]);
 assert.equal(store.kind,'desktop');assert.equal(store.gameVersion,'INIT-RACE');assert.equal(service.currentStorage(),store);assert.equal(service.storageReady(),true);
 assert.deepEqual(writes,['settings','profile','save','settings'],'all operations retain their original order');
 assert.equal((await store.loadSettings()).volume,.71);assert.equal((await store.loadProfile()).runs,7);assert.equal((await store.loadSave()).area,'chapel');
});

test('loadGameState joins an in-progress initialization instead of replacing or reading a partial store',async t=>{
 isolate(t);const adapter=new MemoryFileAdapter(),seed=new DesktopStorage({adapter,gameVersion:'PRESERVED'});await seed.init();
 await seed.saveSettings({volume:.23});await seed.saveProfile({runs:9});await seed.saveGame('autosave',{version:3,area:'practice',settings:{volume:.23}});
 const service=await fresh(),gate=deferred(),entered=deferred(),originalInit=DesktopStorage.prototype.init;let starts=0,loaded=false;
 replace(t,DesktopStorage.prototype,'init',async function(){starts++;const ready=this.adapter;this.adapter=null;entered.resolve();await gate.promise;this.adapter=ready;return originalInit.call(this);});
 const initializing=service.initGameStorage({kind:'desktop',adapter,gameVersion:'PRESERVED'});await entered.promise;
 const loading=service.loadGameState({gameVersion:'MUST-NOT-REPLACE'}).then(value=>{loaded=true;return value;});await turn();
 assert.equal(loaded,false);assert.equal(starts,1);gate.resolve();await initializing;const loadedState=await loading;
 assert.equal(loadedState.settings.volume,.23);assert.equal(loadedState.profile.runs,9);assert.equal(loadedState.save.area,'practice');
});

test('writes wait through failed desktop setup and land on its initialized browser fallback without deleting desktop data',async t=>{
 isolate(t);const service=await fresh(),desktopGate=deferred(),fallbackGate=deferred(),fallbackEntered=deferred(),adapter=new MemoryFileAdapter();
 await adapter.writeText('untouched-existing-save','preserve me',adapter.baseData);
 replace(t,DesktopStorage.prototype,'init',async function(){this.adapter=null;await desktopGate.promise;throw Error('fixture adapter unavailable');});
 const originalBrowserInit=BrowserStorage.prototype.init;replace(t,BrowserStorage.prototype,'init',async function(){fallbackEntered.resolve();await fallbackGate.promise;return originalBrowserInit.call(this);});
 const initializing=service.initGameStorage({kind:'desktop',adapter,gameVersion:'FALLBACK-RACE'});let written=false;
 const writes=Promise.all([service.saveSettingsQueued({volume:.39}),service.saveProfileQueued({runs:4}),service.saveGameQueued({version:3,area:'main_b3',settings:{volume:.39}})]).then(value=>{written=true;return value;});
 desktopGate.resolve();await fallbackEntered.promise;await turn();assert.equal(written,false);assert.equal(service.storageReady(),false);assert.equal(service.currentStorage(),null);
 fallbackGate.resolve();const store=await initializing;assert.equal(store.kind,'browser');assert.deepEqual(await writes,[true,true,true]);
 assert.equal((await store.loadSettings()).volume,.39);assert.equal((await store.loadProfile()).runs,4);assert.equal((await store.loadSave()).area,'main_b3');
 assert.equal(await adapter.readText('untouched-existing-save',adapter.baseData),'preserve me');
});

test('later explicit initialization remains possible and cannot redirect a previously queued write',async t=>{
 isolate(t);const service=await fresh(),firstAdapter=new MemoryFileAdapter(),secondAdapter=new MemoryFileAdapter();
 const first=await service.initGameStorage({kind:'desktop',adapter:firstAdapter,gameVersion:'FIRST'}),gate=deferred(),entered=deferred(),originalSave=first.saveSettings;
 first.saveSettings=async function(settings){entered.resolve();await gate.promise;return originalSave.call(this,settings);};
 const firstWrite=service.saveSettingsQueued({volume:.18});await entered.promise;
 const second=await service.initGameStorage({kind:'desktop',adapter:secondAdapter,gameVersion:'SECOND'});assert.notEqual(first,second);
 const secondWrite=service.saveSettingsQueued({volume:.82});gate.resolve();assert.deepEqual(await Promise.all([firstWrite,secondWrite]),[true,true]);
 assert.equal((await first.loadSettings()).volume,.18);assert.equal((await second.loadSettings()).volume,.82);
});
