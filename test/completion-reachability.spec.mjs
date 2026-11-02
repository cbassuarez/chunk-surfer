import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import * as OBJ from '../src/game/objectives.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { PAGES } from '../src/data/conservatory-script.js';

// Current compiled collision and actual resolved furniture, not only the list
// of authored document IDs. This is local physical eligibility, not proof of a
// complete player route through all doors, dialogue and floor transitions.
FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const pickupStances = at => {
  const rows = [], radius = OBJ.objState().pickupRadius;
  for (let y = Math.floor(at.y - radius); y <= Math.ceil(at.y + radius); y++)
    for (let x = Math.floor(at.x - radius); x <= Math.ceil(at.x + radius); x++) {
      if (Math.hypot(x - at.x, y - at.y) <= radius && !FP.isSolid(x, y) && PROPS.propCanOccupy(x, y)) rows.push({ x, y });
    }
  return rows;
};

test('each actual loose field paper spawns on real floor with an ordinary unblocked pickup stance', () => {
  const positions = new Set();
  for (const page of PAGES.filter(row => !row.hosted)) {
    const at = FP.toRuntimePoint(page.at), key = `${Math.round(at.x)},${Math.round(at.y)}`;
    assert.equal(FP.isSolid(at.x, at.y), false, `${page.id} is discarded by production placement`);
    assert.equal(positions.has(key), false, `${page.id} overwrites another paper in OBJ's position map`);
    positions.add(key);
    const stances = pickupStances(at);
    assert.ok(stances.length, `${page.id} cannot be reached by the actual body inside its pickup radius`);
    OBJ.loadObjState({}); OBJ.placePage(at.x, at.y, page.room, page.id);
    assert.equal(OBJ.tryPickup(stances[0].x, stances[0].y)?.id, page.id);
  }
});

test('student monitoring notes belong to the practice wing and are no longer buried in the orchestra obstruction', () => {
  const page = PAGES.find(row => row.id === 'student-monitoring-notes'), at = FP.toRuntimePoint(page.at);
  assert.equal(FP.logicalToPhysical(at.x, at.y).owner, 'practice_wing');
  assert.equal(FP.worldAt(at.x, at.y), 'soundnoisemusic');
  assert.ok(Math.abs(FP.floorAt(at.x, at.y) - 4.8) < .001);
  assert.ok(pickupStances(at).length >= 10);
});

test('hosted papers and physical collectible hosts remain real production props with local interaction stances', () => {
  const ids = [...PAGES.filter(row => row.hosted).map(row => row.hosted),
    'academic-garden-planter-west', 'academic-bust-5', 'tower-ringing-bench-west'];
  for (const id of ids) {
    const host = PROPS.propById(id);
    assert.ok(host, `${id} is absent after current floor and prop contact resolution`);
    assert.notEqual(host.interactive, false, `${id} cannot be selected`);
    let selected = false;
    const ix = host.interactionX, iy = host.interactionY;
    for (let dy = -4; dy <= 4 && !selected; dy++) for (let dx = -4; dx <= 4 && !selected; dx++) {
      const x = Math.round(host.interactionRx) + dx, y = Math.round(host.interactionRy) + dy;
      if (FP.isSolid(x, y) || !PROPS.propCanOccupy(x, y)) continue;
      const yaw = Math.atan2(ix - (x + .5) * .5, -(iy - (y + .5) * .5));
      selected = PROPS.pickProp(x, y, 0, 2, { yaw })?.id === id;
    }
    assert.ok(selected, `${id} cannot be picked from nearby free floor using the actual interaction selector`);
  }
});

test('supplied production receipts earn 38/38 through real filing, New Game and reload transactions without award grants', t => {
  // Isolated acceptance-event test, expressly not a player walk or proof that
  // the supplied events can be earned. The child owns only memory-backed
  // storage; the user's live browser/native profile is never opened.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    globalThis.localStorage={map:new Map(),getItem(k){return this.map.get(k)??null},setItem(k,v){this.map.set(k,String(v))},removeItem(k){this.map.delete(k)}};
    globalThis.window=undefined;
    const S=await import('./src/game/save.js');
    const P=await import('./src/progression/runtime.js');
    const {EVENT_TYPES:E}=await import('./src/progression/events.js');
    const {ACHIEVEMENT_DEFS}=await import('./src/progression/achievement-defs.js');
    const {achievementCompletion}=await import('./src/progression/achievements.js');
    const {COMPLETION_PAPERS,COMPLETION_LEADS,completionCollections}=await import('./src/progression/completion.js');
    const {ENDING_IDS}=await import('./src/progression/schema.js');
    const {DIFFICULTY_PRESETS}=await import('./src/progression/difficulty-defs.js');
    const {POWER_CIRCUIT_IDS}=await import('./src/game/conservatory-power.js');
    const {deriveUnlocks}=await import('./src/progression/unlocks.js');
    const {lastReturnRecord,resolvedReturnHistory}=await import('./src/progression/return-history.js');
    const {returnFileEntries}=await import('./src/game/second-shift.js');
    const {decideNatatoriumWaterEnvironment,NATATORIUM_ROUTE_TRUNKS}=await import('./src/game/natatorium-water.js');
    const {causalRecorder}=await import('./src/causal/recorder.js');
    const {finalizeCausalReturn}=await import('./src/progression/causal-progression.js');
    const {MemoryFileAdapter}=await import('./src/platform/storage/desktopStorage.js');
    const {initGameStorage}=await import('./src/platform/storage/storageService.js');
    await initGameStorage({kind:'desktop',adapter:new MemoryFileAdapter(),gameVersion:'COMPLETION-TRANSACTION-TEST'});
    S.saveLoad();P.progressionInit({build:'COMPLETION-TRANSACTION-TEST'});
    assert.equal(achievementCompletion(S.getMeta()).completed,0);
    const acceptedEvents=[],returns=[],clone=v=>JSON.parse(JSON.stringify(v));
    let capture=false,at=1000;
    const off=P.progressionEvents.on('*',event=>{
      acceptedEvents.push(clone(event));
      if(capture)causalRecorder.recordEvent({actor:'system',type:event.type,payload:event.payload});
    });
    function emit(type,payload={}){
      const result=P.emitProgress(type,payload,'test.supplied-production-receipt',{at:++at,notifyAchievements:false});
      assert.equal(result.ok,true,type);return result;
    }
    function begin(index,preset='contract'){
      const previousAwards=clone(S.getMeta().achievements);
      S.newGame({preset,values:DIFFICULTY_PRESETS[preset].values,now:10000+index*10000});
      P.beginRunProgression();
      assert.deepEqual(S.getMeta().achievements,previousAwards,'New Game preserves earned profile receipts');
      assert.deepEqual(S.getSave().run.ledger.takes.rooms,[]);
      assert.equal(S.getSave().run.ledger.radio.uses,0);
      assert.equal(S.getSave().run.ledger.takes.spoiled,0);
      assert.equal(S.getSave().run.integrity.achievements.eligible,true);
      emit(E.WORK_ORDER_ACCEPTED);
    }
    function room(roomId){emit(E.TAKE_STARTED,{roomId});emit(E.TAKE_COMPLETED,{roomId,elapsed:60,contaminated:false});}
    function manifest(){for(const id of ['main_b3','the_tub','amplifications','soundnoisemusic'])room(id);emit(E.MANIFEST_SLOT_COMPLETED,{roomId:'lux_nova'});}
    function fight(id,result='win'){
      emit(E.BATTLE_STARTED,{id});
      emit(E.BATTLE_FINISHED,{id,result,attempts:7,turns:7,firstPass:result==='win',toolsUsed:{torch:2,recorder:3}});
    }
    async function finish(endingId,variant=null,arrival='agreed'){
      const ledger=S.getSave().run.ledger;
      const summary=P.commitReturn(endingId,{endingVariant:variant,endingArrival:arrival,
        rec:{takes:[...ledger.takes.rooms],injuries:ledger.injuries}},++at);
      if(capture){const sealed=await finalizeCausalReturn(summary);assert.equal(sealed.ok,true);capture=false;}
      const completed=S.getMeta().stats.runsCompleted;
      assert.equal(P.commitReturn(endingId,{},++at).id,summary.id,'refiling is idempotent');
      assert.equal(S.getMeta().stats.runsCompleted,completed);
      emit(E.CREDITS_VIEWED);
      const before=clone(S.getMeta()),save=clone(S.getSave());S.saveLoad();
      assert.deepEqual(S.getMeta().achievements,before.achievements,'stored reload preserves actual award receipts');
      assert.deepEqual(S.getMeta().completion,before.completion,'stored reload preserves collection union');
      assert.equal(S.getSave().run.id,save.run.id);
      assert.equal(S.getSave().run.status,'return-committed');
      assert.ok(S.getMeta().returns.history.every(id=>typeof id==='string'));
      assert.equal(lastReturnRecord(S.getMeta()).id,summary.id);
      returns.push({id:summary.id,runId:summary.runId,endingId,variant,awards:achievementCompletion(S.getMeta()).completed});
      return summary;
    }
    try{
      // Two-room Century Stay. The shared event feed and actual sealed causal
      // filing derive Second Track; no unlockAchievement/profile seeding used.
      begin(0);const run=S.getSave().run;
      causalRecorder.begin({runId:run.id,difficulty:'contract'});capture=true;
      causalRecorder.tick(.1,{x:1,y:1,spaceId:'conservatory'});
      for(const id of ['spine:service-threshold','spine:b3-first-slate'])
        causalRecorder.recordAnchor({id,verb:'haunt',required:true,locus:{x:1,y:1,roomId:'main_b3',spaceId:'conservatory'}});
      room('main_b3');room('amplifications');fight('recording-2');
      emit(E.HUSH_MET,{reason:'take-complete'});emit(E.DREAM_RESOLVED,{outcome:'spared'});
      emit(E.DISCLOSURE_HEARD,{id:'amplifications'});
      for(const id of COMPLETION_PAPERS.slice(0,6))emit(E.DOCUMENT_READ,{id});
      for(const id of ['pin.academic','pin.yard'])emit(E.ITEM_OBTAINED,{id});
      for(const id of ['yard-sign','b3-session-card','academic-roof-effects-index','academic-roof-pressure-pad',
        'academic-stripped-office-cabinet','academic-roof-contrary-account','academic-roof-guarantor-trace','gallery-roof-service-slip'])emit(E.PROP_INSPECTED,{id});
      emit(E.RADIO_USED,{id:'radio',kind:'listening'});emit(E.SECRET_DISCOVERED,{id:'off-air'});
      causalRecorder.tick(.2,{x:2,y:1,spaceId:'conservatory'});
      await finish('sacrifice','century-stay','agreed');
      assert.ok(S.getMeta().achievements.ACH_CENTURY_STAY);
      assert.ok(S.getMeta().achievements.ACH_SECOND_TRACK);
      assert.equal(!!S.getMeta().achievements.ACH_UNBROKEN,false,'two rooms cannot stand in for the full manifest');
      assert.equal(!!S.getMeta().achievements.ACH_RADIO_SILENCE,false,'Off Air listening is radio use');
      assert.equal(!!S.getMeta().achievements.ACH_FIELD_NOTES,false);
      assert.equal(deriveUnlocks(S.getMeta()).deadAir,true,'a filed first ending enables the harder shift');

      // A separate harder full-manifest night satisfies the incompatible
      // power/radio policies without borrowing their predecessor's ledger.
      begin(1,'dead-air');manifest();
      for(const id of ['natatorium-approach','recording-2','pre-recording-4'])fight(id);
      emit(E.ITEM_OBTAINED,{id:'chapel_key'});emit(E.CONFESSION_COMMITTED,{kind:'name',value:'Sarah'});emit(E.COFFEE_DRUNK);
      emit(E.RADIO_CUE_MISSED,{id:'missed_checkin',reason:'unanswered'});
      for(const id of ['the_tub','soundnoisemusic'])emit(E.DISCLOSURE_HEARD,{id});
      for(const id of COMPLETION_PAPERS.slice(6))emit(E.DOCUMENT_READ,{id});
      for(const id of ['pin.gallery','pin.tower'])emit(E.ITEM_OBTAINED,{id});
      for(const circuit of POWER_CIRCUIT_IDS)emit(E.POWER_CIRCUIT_CHANGED,{circuit,live:true});
      await finish('helped');
      for(const id of ['ACH_UNBROKEN','ACH_FIRST_PASS','ACH_DEAD_AIR','ACH_RADIO_SILENCE','ACH_BUILDING_ALIVE',
        'ACH_ONE_TORCH','ACH_FIELD_NOTES','ACH_FIELD_LEADS','ACH_ALL_PLAYBACK'])assert.ok(S.getMeta().achievements[id],id);
      assert.equal(S.getMeta().completion.secrets['call-yourself'],undefined);
      assert.equal(!!S.getMeta().achievements.ACH_HIDDEN_EXCHANGES,false);

      for(const [index,ending]of ['inversion','drugged','surfaced','contact-won','contact-lost','tower-won','tower-lost'].entries()){
        begin(index+2);
        if(['contact-won','contact-lost','tower-won','tower-lost'].includes(ending)){
          for(const id of ['main_b3','the_tub','amplifications','soundnoisemusic'])room(id);
        }else manifest();
        if(ending==='drugged')emit(E.COFFEE_DRUNK);
        if(ending==='inversion'){emit(E.SECRET_DISCOVERED,{id:'call-yourself'});assert.ok(S.getMeta().achievements.ACH_HIDDEN_EXCHANGES);}
        if(ending==='contact-won')for(const chapter of ['I','II','III'])fight('source-contact-'+chapter);
        if(ending==='tower-won')for(const phase of [1,2])fight('cathedral-phase-'+phase);
        if(ending==='tower-lost')for(let attempt=0;attempt<3;attempt++)fight('cathedral-phase-1','lose');
        assert.equal(achievementCompletion(S.getMeta()).complete,false,'the catalogue cannot complete before every ending is filed');
        await finish(ending,ending==='contact-lost'?'source-rest':null,ending==='contact-lost'?'rested':ending==='surfaced'||ending==='tower-won'?'carried':'agreed');
      }
      const total=achievementCompletion(S.getMeta());
      assert.deepEqual({completed:total.completed,total:total.total,percent:total.percent,complete:total.complete},
        {completed:38,total:38,percent:100,complete:true});
      assert.deepEqual([...S.getMeta().endingsSeen].sort(),[...ENDING_IDS].sort());
      assert.equal(S.getMeta().returns.history.length,9);
      assert.equal(Object.keys(S.getMeta().returns.records).length,9);
      assert.equal(S.getMeta().platform.pendingAchievements.length,38);
      assert.equal(new Set(S.getMeta().platform.pendingAchievements).size,38);
      assert.equal(S.getMeta().stats.takesCompleted,34,'authored manifest slots do not fabricate tape recordings');
      for(const def of ACHIEVEMENT_DEFS){const receipt=S.getMeta().achievements[def.id];assert.ok(receipt,def.id);assert.ok(returns.some(row=>row.runId===receipt.runId),def.id+' owner');}
      for(const collection of completionCollections(S.getMeta()))assert.equal(collection.current,collection.target,collection.id);
      assert.equal(resolvedReturnHistory(S.getMeta()).length,9);
      assert.equal(returnFileEntries(S.getMeta()).length,9);
      const rest=Object.values(S.getMeta().returns.records).find(row=>row.endingVariant==='source-rest');
      assert.equal(rest.endingId,'contact-lost');assert.equal(rest.endingArrival,'rested');

      // A repeated previously-seen ending must determine the next world's
      // memory through saved ID->record history, not endingsSeen insertion order.
      begin(10);manifest();await finish('surfaced',null,'carried');
      assert.equal(S.getMeta().endingsSeen.at(-1),'tower-lost');
      assert.equal(lastReturnRecord(S.getMeta()).endingId,'surfaced');
      assert.equal(decideNatatoriumWaterEnvironment({meta:S.getMeta()}).routeTrunk,NATATORIUM_ROUTE_TRUNKS.FLOODED_SURFACE);
      const all=clone(S.getMeta().achievements);begin(11);S.saveLoad();
      assert.deepEqual(S.getMeta().achievements,all);assert.equal(achievementCompletion(S.getMeta()).percent,100);
      assert.equal(S.getSave().run.environment.routeTrunk,NATATORIUM_ROUTE_TRUNKS.FLOODED_SURFACE);
      assert.deepEqual(S.getSave().run.ledger.takes.rooms,[]);
      console.log(JSON.stringify({kind:'isolated-accepted-event-cross-run-transaction',ordinaryPlay:false,completed:38,total:38,
        canonicalEndings:9,completedReturns:10,sourceRestAliasesContactLost:true,acceptedEvents:acceptedEvents.length,
        boundary:'Validated supplied receipts, real reducers/filing/causal seal/New Game/reload. Not world-control or player-route proof.'}));
    }finally{off();}
  `], { cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const witness = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(witness.ordinaryPlay, false); assert.equal(witness.completed, 38); assert.equal(witness.canonicalEndings, 9);
  assert.ok(witness.acceptedEvents > 200, 'the receipts include the actual event transactions, not a seeded award table');
  t.diagnostic(JSON.stringify(witness));
});
