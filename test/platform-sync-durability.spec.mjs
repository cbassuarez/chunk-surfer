import test from 'node:test';
import assert from 'node:assert/strict';
class MemoryStorage { constructor(){this.map=new Map();} getItem(k){return this.map.get(k)??null;} setItem(k,v){this.map.set(k,String(v));} removeItem(k){this.map.delete(k);} }
globalThis.localStorage=new MemoryStorage(); globalThis.window=undefined;
const save=await import('../src/game/save.js');
const runtime=await import('../src/progression/runtime.js');
const {syncPlatform,platformSyncStatus}=await import('../src/progression/platform-sync.js');
const {createSteamPlatform}=await import('../src/platform/steam.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fresh(){save.clearAllData();save.saveLoad();save.newGame({preset:'contract',now:100});runtime.progressionInit({build:'TEST'});}
const adapter=overrides=>({nativeAchievements:true,async initialize(){return{ready:true,achievements:[],stats:{}};},async unlockAchievement(){return true;},async setStat(){return true;},async flush(){return true;},...overrides});

test('successful cache writes stay queued when store returns false or throws',async()=>{
 for(const flush of[async()=>false,async()=>{throw Error('offline');}]){
  fresh();runtime.unlockAchievement('ACH_FIRST_TAKE');
  const result=await syncPlatform({platform:adapter({flush})});
  assert.equal(result.ok,false);assert.equal(result.confirmed,false);
  assert.ok(save.getMeta().platform.pendingAchievements.includes('ACH_FIRST_TAKE'));
  assert.ok(save.getMeta().achievements.ACH_FIRST_TAKE);assert.equal(platformSyncStatus().reason,'STORE_UNCONFIRMED');
 }
});
test('not-ready initialization never writes, flushes, merges an empty profile or drops local pending work',async()=>{
 fresh();runtime.unlockAchievement('ACH_FIRST_TAKE');let writes=0;
 const result=await syncPlatform({platform:adapter({async initialize(){return{ready:false,reason:'NO_RUNTIME',achievements:['ACH_COFFEE'],stats:{STAT_TAKES_COMPLETED:99}};},async unlockAchievement(){writes++;},async flush(){writes++;}})});
 assert.equal(writes,0);assert.equal(result.reason,'NO_RUNTIME');assert.ok(save.getMeta().achievements.ACH_FIRST_TAKE);
 assert.equal(save.getMeta().achievements.ACH_COFFEE,undefined);assert.equal(save.getMeta().stats.takesCompleted,0);
 assert.ok(save.getMeta().platform.pendingAchievements.includes('ACH_FIRST_TAKE'));
});
test('an award earned during initialize is part of the current transaction rather than overwritten',async()=>{
 fresh();runtime.unlockAchievement('ACH_FIRST_TAKE');const gate=deferred(),started=deferred(),sent=[];
 const result=syncPlatform({platform:adapter({async initialize(){started.resolve();await gate.promise;return{ready:true,achievements:[],stats:{}};},async unlockAchievement(id){sent.push(id);return true;}})});
 await started.promise;runtime.unlockAchievement('ACH_COFFEE');gate.resolve();assert.equal((await result).ok,true);
 assert.deepEqual(sent.sort(),['ACH_COFFEE','ACH_FIRST_TAKE']);assert.ok(save.getMeta().achievements.ACH_COFFEE);
});
test('new awards and increased stat values earned during flush are not acknowledged by an older batch',async()=>{
 fresh();runtime.unlockAchievement('ACH_FIRST_TAKE');
 save.metaCommit({stats:{...save.getMeta().stats,takesCompleted:2},platform:{...save.getMeta().platform,pendingStats:{STAT_TAKES_COMPLETED:2}}});
 const gate=deferred(),started=deferred();
 const result=syncPlatform({platform:adapter({async flush(){started.resolve();await gate.promise;return true;}})});
 await started.promise;runtime.unlockAchievement('ACH_COFFEE');
 save.metaCommit({stats:{...save.getMeta().stats,takesCompleted:3},platform:{...save.getMeta().platform,pendingStats:{...save.getMeta().platform.pendingStats,STAT_TAKES_COMPLETED:3}}});
 gate.resolve();const complete=await result;assert.equal(complete.ok,false);assert.equal(complete.confirmed,true);
 assert.deepEqual(save.getMeta().platform.pendingAchievements,['ACH_COFFEE']);
 assert.equal(save.getMeta().platform.pendingStats.STAT_TAKES_COMPLETED,3);
});
test('simultaneous sync requests have one native transaction owner',async()=>{
 fresh();runtime.unlockAchievement('ACH_FIRST_TAKE');let active=0,max=0,completed=0;
 const platform=adapter({async initialize(){active++;max=Math.max(max,active);await Promise.resolve();return{ready:true,achievements:[],stats:{}};},async flush(){await Promise.resolve();active--;completed++;return true;}});
 await Promise.all([syncPlatform({platform}),syncPlatform({platform})]);assert.equal(max,1);assert.equal(completed,2);
});
test('remote unlock timestamps and known monotonic stats merge without accepting unknown or nonfinite values',async()=>{
 fresh();const result=await syncPlatform({platform:adapter({async initialize(){return{ready:true,achievements:['ACH_COFFEE','ACH_NOT_REAL'],unlockTimes:{ACH_COFFEE:12345},stats:{STAT_TAKES_COMPLETED:5,STAT_NOT_REAL:99,STAT_RUNS_STARTED:Infinity}};}})});
 assert.equal(result.ok,true);assert.equal(save.getMeta().achievements.ACH_COFFEE.unlockedAt,12345000);
 assert.equal(save.getMeta().achievements.ACH_NOT_REAL,undefined);assert.equal(save.getMeta().stats.takesCompleted,5);
 assert.equal(save.getMeta().stats.STAT_NOT_REAL,undefined);assert.ok(Number.isFinite(save.getMeta().stats.runsStarted));
});
test('native adapter stays ordinary desktop until Steam is actually ready and rejects unknown command IDs',async()=>{
 const calls=[];let available=false;const platform=createSteamPlatform({native:true,getBridge:()=>null,invoke:async(name,args)=>{calls.push([name,args]);return name==='chunk_steam_initialize'?{ready:available,achievements:[],stats:{},reason:available?null:'NO_RUNTIME'}:true;}});
 assert.equal(platform.kind,'tauri');assert.equal(platform.nativeNotifications,false);assert.equal((await platform.initialize()).ready,false);
 assert.equal(platform.kind,'tauri');assert.equal(await platform.unlockAchievement('ACH_FIRST_TAKE'),false);
 available=true;await platform.initialize();assert.equal(platform.kind,'steam');assert.equal(platform.nativeNotifications,true);
 assert.equal(await platform.unlockAchievement('ACH_NOT_REAL'),false);assert.equal(await platform.unlockAchievement('constructor'),false);assert.equal(await platform.setStat('constructor',1),false);assert.equal(await platform.setStat('STAT_RUNS_STARTED',-1),false);
 assert.equal(await platform.setStat('STAT_NOT_REAL',1),false);assert.equal(await platform.setStat('STAT_RUNS_STARTED',1.5),false);
 assert.equal(await platform.unlockAchievement('ACH_FIRST_TAKE'),true);assert.equal(await platform.setStat('STAT_RUNS_STARTED',4),true);
 assert.equal(await platform.flush(),true);assert.equal(calls.filter(c=>c[0]==='chunk_steam_unlock').length,1);
});
test('automatic sync coalesces quiet-frame requests, rejects overlap and waits sixty seconds after every attempt',async()=>{
 const {createPlatformSyncScheduler}=await import('../src/progression/platform-sync.js');
 let now=1000,calls=0;const timers=[],gate=deferred();
 const scheduler=createPlatformSyncScheduler({now:()=>now,timer:fn=>{timers.push(fn);},sync:async()=>{calls++;await gate.promise;}});
 for(let n=0;n<120;n++)assert.equal(scheduler.request(),n===0);
 assert.equal(timers.length,1);const pending=timers.shift()();assert.equal(calls,1);assert.equal(scheduler.request(),false);
 assert.equal(scheduler.nextAttemptAt(),61000);gate.resolve();await pending;
 now=60999;assert.equal(scheduler.request(),false);now=61000;assert.equal(scheduler.request(),true);
 await timers.shift()();assert.equal(calls,2);assert.equal(scheduler.nextAttemptAt(),121000);
 now=80000;scheduler.noteAttempt();assert.equal(scheduler.nextAttemptAt(),140000,'a direct forced attempt postpones automatic retry');
});
test('remote restoration runs synchronous profile reconciliation and sends its completion award without overwriting it',async()=>{
 const {configurePlatformReconciliation}=await import('../src/progression/platform-sync.js');
 fresh();const sent=[];
 configurePlatformReconciliation(()=>runtime.unlockAchievement('ACH_COFFEE'));
 try{
  const result=await syncPlatform({platform:adapter({async initialize(){return{ready:true,achievements:['ACH_FIRST_TAKE'],stats:{}};},async unlockAchievement(id){sent.push(id);return true;}})});
  assert.equal(result.ok,true);assert.ok(save.getMeta().achievements.ACH_FIRST_TAKE);assert.ok(save.getMeta().achievements.ACH_COFFEE);
  assert.deepEqual(sent,['ACH_COFFEE']);assert.deepEqual(save.getMeta().platform.pendingAchievements,[]);
 }finally{configurePlatformReconciliation(null);}
});
test('identity and achievements use one native Steam lifetime without broad identity access',async()=>{
 const {readFile}=await import('node:fs/promises');
 const identity=await readFile(new URL('../src-tauri/src/identity.rs',import.meta.url),'utf8');
 const owner=await readFile(new URL('../src-tauri/src/steam_achievements.rs',import.meta.url),'utf8');
 assert.match(identity,/crate::steam_achievements::persona_name/);assert.doesNotMatch(identity,/SteamAPI_Init|SteamAPI_Shutdown/);
 assert.match(owner,/SteamAPI_ISteamFriends_GetPersonaName/);assert.doesNotMatch(identity+owner,/GetSteamID|GetFriend|Enumerate|PersonaState/);
});
