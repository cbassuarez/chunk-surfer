import { writeFileSync } from 'node:fs';
import { buildBellsGodPreset } from '../../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../../src/game/source-space-runtime.js';
import { SOURCE_BELLS, SOURCE_HORIZON } from '../../src/data/source-level.js';
import { CELL } from '../../src/data/floorplan/legend.js';

const create = (seed = 4417) => {
  const built = buildBellsGodPreset(480, { seed });
  const runtime = createSourceSpaceRuntime({ initialState: built.state });
  runtime.setPlayerPosition(built.position);
  return runtime;
};
const pose = (door, cells) => ({
  x: (door.threshold[0].x + door.threshold[1].x) / 2 + door.normal[0] * cells,
  y: (door.threshold[0].y + door.threshold[1].y) / 2 + door.normal[2] * cells,
  facing: 0,
});
const cross = (runtime, door) => {
  const open = runtime.openDoorFieldDoor(door.id);
  const from = pose(door, 1.5), to = pose(door, -1.5);
  runtime.setPlayerPosition(from);
  const collision = runtime.geometry.canStep(from.x, from.y, to.x, to.y);
  runtime.onStep(from, to);
  runtime.setPlayerPosition(to);
  return { open, from, to, collision, crossing: runtime.doorCrossingFrame() };
};

const hall = create();
const lockIn = hall.doorFieldDoors().find((door) => door.lockIn);
const entered = cross(hall, lockIn);
// Reproduce the runtime calls in main.finishLockIn(), after its forward-walk input.
hall.setStationWalkState({ ...hall.stationWalkState(), progress: 1, done: true });
const released = hall.releaseHomeCrossing();
hall.setStationWalkState(null);
const entry = hall.enterTowerLand('school-hall');
hall.setPlayerPosition(entry);
const beforeTick = {
  phase: hall.state().phase, towerLand: hall.towerLandState(),
  entry, localY: entry.y - hall.state().landscapeOrigin.y,
  cellAt: hall.geometry.cellAt(entry.x, entry.y),
  neighboringSteps: [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dy]) => ({
    to: { x: entry.x+dx, y: entry.y+dy },
    result: hall.geometry.canStep(entry.x, entry.y, entry.x+dx, entry.y+dy),
  })),
  submittedProps: hall.propInstances(entry.x, entry.y).length,
  ambient: hall.sourceAmbient(), lights: hall.localLights(), weather: hall.doorFieldWeather(),
};
const saved = JSON.parse(JSON.stringify(hall.state()));
const restored = createSourceSpaceRuntime({ initialState: saved });
restored.setPlayerPosition(entry);
const reload = {
  savedKeys: Object.keys(saved), station: saved.station,
  savedHasTowerLand: Object.hasOwn(saved, 'towerLand'),
  savedHasLockInFrom: Object.hasOwn(saved.station, 'lockInFrom'),
  restoredTowerLand: restored.towerLandState(),
  restoredCellAtEntry: restored.geometry.cellAt(entry.x, entry.y),
  restoredPropCount: restored.propInstances(entry.x, entry.y).length,
  lockInDoorErased: restored.doorFieldDoors().find((door) => door.id === lockIn.id)?.erased,
};
const tick = hall.tickBellField(.016);
const displacement = { cells: Math.hypot(tick.position.x-entry.x, tick.position.y-entry.y),
  metres: Math.hypot(tick.position.x-entry.x, tick.position.y-entry.y)*CELL };
hall.advanceStationTime(.7);
const postFold = {
  crossing: hall.doorCrossingFrame(), towerLand: hall.towerLandState(),
  wrong: entered.crossing.wrong,
  wrongReturnSpot: hall.wrongReturnSpot(entered.crossing),
  note: 'main.syncStationErrand calls putBackWrong when this released crossing becomes null, even while towerLand stays active. Components dynamically verified; main integration statically traced.',
};
const scan = [];
for (let seed=1; seed<=250; seed++) {
  const r=create(seed), d=r.doorFieldDoors().find((door)=>door.lockIn);
  if(!d || d.shut) scan.push({ seed, id:d?.id, shut:d?.shut, wrong:d?.wrong,
    variant:d?.variant, open:d ? r.openDoorFieldDoor(d.id) : null });
}
const keysRuntime = create();
const keyProof = [];
for(const key of keysRuntime.doorFieldDoors().filter((door)=>door.key)) {
  const crossed=cross(keysRuntime,key);
  keyProof.push({ door:key.id, crossingId:crossed.crossing?.id,
    unlockedBeforeWait:keysRuntime.doorFieldDoors().find(d=>d.route==='tower')?.unlocked });
  keysRuntime.advanceStationTime(5);
  keyProof.at(-1).unlockedAfterWait=keysRuntime.doorFieldDoors().find(d=>d.route==='tower')?.unlocked;
}
const evidence = {
  generatedAt:new Date().toISOString(),
  scope:'Read-only audit of CURRENT dirty tree. Dedicated bust-revealed tower route / T4 prioritized; production and tests unchanged.',
  method:'Actual imported runtime + seeded presets in Node; main.js integration and authored plan statically traced. This is not a browser playthrough.',
  units:{ cellMetres:CELL },
  sharedPrelude:{
    beats:['Source approach/physical receiving lift','nothingness/Pressure','Source proper/real perimeter door','telephone road','continuous unravelling/video','optional bust audience'],
    observation:'Current unravelling has a broad fixed walkable floor and tickHorizon does not reset the body. Bell-noise resets belong to the separate route AFTER accepting the bust.',
    references:[
      {file:'/Users/seb/chunk-surfer/src/game/source-space-runtime.js',lines:[1106,1117],reason:'wide horizon floor'},
      {file:'/Users/seb/chunk-surfer/src/game/source-space-runtime.js',lines:[2806,2811],reason:'tickHorizon advances decay without returning a body reset'},
      {file:'/Users/seb/chunk-surfer/src/game/source-bell-field.js',lines:[172,178],reason:'separate tower-road noise reset'},
    ],
  },
  dedicatedRoute:{
    current:'Accept qualified bust proposition -> revealed sideways path -> bells/service-door field -> two hidden key doors unlock belfry -> actual tower/finale. Optional lock-in door -> forward walk -> school-hall stub -> its exit returns straight to road.',
    intendedT4:'Lock-in -> snowed hall/boy -> tape field -> dead broadcast/mast -> ash building/last recordist -> second hall/handover/collapse -> original road. Ordered bell errand; playable take, ending flag, combat advantage.',
  },
  reproduction:{
    seed:4417, sourceBounds:{horizon:SOURCE_HORIZON,bells:SOURCE_BELLS},
    ordinaryLockInDoor:lockIn, crossing:entered, released, hallBeforeTick:beforeTick,
    hallTick:tick, displacement, reload, afterReleasedWorldFolds:postFold,
    lockInAvailabilityScan:{seeds:[1,250],failures:scan},
    actualKeyUnlockWithStationTime:keyProof,
  },
  findings:[
    {
      id:'F1',priority:'P1',kind:'confirmed runtime defect',title:'Lock-in hall is outside the current floor and is immediately clamped 190.1m away',
      effect:'Entry localY -3462 is above BELLS.from -3842; all four attempted steps are walls. The next ordinary bell-field tick moves localY to -3842.2 while hall-only props remain active.',
      evidenceStrength:'Dynamic runtime reproduction plus ordinary main loop trace',
      refs:[
        ['src/game/source-space-runtime.js',6033,6034,'legacy unshifted placement'],
        ['src/game/source-space-runtime.js',2876,2882,'floor excludes entry'],
        ['src/game/source-space-runtime.js',2866,2873,'bell step not guarded for active land'],
        ['src/game/source-bell-field.js',187,191,'current field clamp'],
        ['src/main.js',17360,17370,'normal main adopts displacement'],
      ],
      recommendation:'Author lands relative to current route bounds and give their floor/collision/tick ownership an explicit active-land branch.',
    },
    {
      id:'F2',priority:'P1',kind:'confirmed seeded reachability defect',title:'A seed can assign the sole lock-in to a barred door',
      effect:'Seed31 source-tower-door-11 is lockIn=true and shut=true; openDoorFieldDoor returns outskirt-door-shut. The only T4 entrance is unreachable in that seed.',
      evidenceStrength:'Dynamic bounded seed scan (1 failure in seeds1–250) and actual open attempt',
      refs:[
        ['src/game/source-space-runtime.js',5464,5478,'key/openable fallback can select any non-key piece'],
        ['src/game/source-space-runtime.js',5495,5512,'later world coverage pass does not guarantee selected lock-in is unbarred'],
      ],
      recommendation:'Choose the lock-in after the final openable deal or explicitly guarantee that chosen non-key door opens.',
    },
    {
      id:'F3',priority:'P1',kind:'confirmed persistence omission',title:'Hall identity and its return point disappear on reload after entrance consumption is saved',
      effect:'Active hall is closure state; main return point is transient stationWay.lockInFrom. Snapshot omits both, while lockIn.seen/consumed crossing are persisted. Restored runtime has no active hall and the original hall entry has no floor.',
      evidenceStrength:'Focused real-runtime serialize/recreate reproduction; main save/return wiring traced',
      refs:[
        ['src/game/source-space-runtime.js',6097,6106,'unsaved active land'],
        ['src/game/source-space-runtime.js',6244,6247,'snapshot fields'],
        ['src/game/chunk-surf-state.js',135,162,'normalizer has no land/return data'],
        ['src/main.js',7784,7788,'transient return point'],
        ['src/main.js',7841,7852,'entrance marked seen before hall entry'],
        ['src/main.js',7870,7881,'return only uses transient point'],
        ['src/main.js',8686,8690,'resume restores saved position without active land'],
      ],
      recommendation:'Save active land, stage/progress, and exact road return pose together with entrance consumption; repair already stranded saves.',
    },
    {
      id:'F4',priority:'P2',kind:'integration defect with dynamic component proof',title:'A wrong-return lock-in can teleport the player out of the hall when its old world folds',
      effect:'Seed4417 lock-in is wrong=true. finishLockIn releases crossing then enters hall. After .7s crossing=null; syncStationErrand still calls putBackWrong from its old crossing, relocating to road while towerLand remains active.',
      evidenceStrength:'Seed/crossing/fold/return spot dynamically reproduced; main call order statically traced, not browser-executed',
      refs:[
        ['src/game/source-space-runtime.js',5475,5478,'wrong lock-in fallback allowed'],
        ['src/main.js',7846,7852,'release then enter hall'],
        ['src/main.js',7793,7797,'wrong return applies to ended lock-in too'],
        ['src/main.js',7907,7915,'relocation does not clear land state'],
      ],
      recommendation:'Consume the previous crossing return action on entry to a persistent land, or prohibit wrong-return semantics for that entrance.',
    },
    {
      id:'F5',priority:'P2',kind:'authored planned behavior missing, not a proven regression',title:'T4 journey stops at an inspection-only hall and its door immediately returns to road',
      effect:'Only school-hall exists as a walkable land. The boy is a static shadow prop; land-piece only inspects; land-door calls leaveTowerLandNow. No tape/broadcast/ash/second-hall progression occurs.',
      evidenceStrength:'Closed land registry and interaction dispatch traced; plan explicitly remains unchecked',
      refs:[
        ['docs/plans/door-field-station.md',248,265,'authored sequence and return'],
        ['docs/plans/door-field-station.md',334,346,'T4 unchecked'],
        ['src/game/source-space-runtime.js',6029,6035,'only land registered'],
        ['src/game/source-space-runtime.js',6076,6082,'static boy and exit'],
        ['src/game/source-space-runtime.js',3289,3290,'only inspect/exit verbs'],
        ['src/main.js',13300,13300,'exit immediately returns to road'],
        ['src/data/elsewhere-worlds.js',25,39,'the worlds do exist as crossing visual/bed variants'],
      ],
      recommendation:'Design/implement the finite state route and narrative verbs before adding more staging or palette work.',
    },
    {
      id:'F6',priority:'P2',kind:'authored planned behavior missing, not a proven regression',title:'Ordered bell errand and promised recordist rewards have no connected runtime owner',
      effect:'Key-door takebacks only play a remote toll/unlock cue. Physical bell strikes increment noise and can reset; no order comparison, recordist tape grant, ending quote flag, or T4 combat advantage is wired to a land event.',
      evidenceStrength:'Bounded production/search inspection of land dispatch, station snapshot/reducer, key-answer callback, bell field, finale entry, and Source narrative; not a claim that unrelated tapes/recordists do not exist elsewhere',
      refs:[
        ['docs/plans/door-field-station.md',203,209,'ordered bell errand'],
        ['docs/plans/door-field-station.md',255,258,'recordist tape and combat reward'],
        ['docs/plans/door-field-station.md',342,345,'unchecked payoff'],
        ['src/main.js',7924,7934,'key answers are audio only'],
        ['src/game/source-bell-field.js',164,178,'physical rings count noise/reset'],
        ['src/game/chunk-surf-state.js',135,162,'station schema carries no T4 objective/reward state'],
      ],
      recommendation:'Give T4 one saved objective/reward contract and wire order recognition, replayable take, ending consequence, and combat initialization to its completion.',
    },
    {
      id:'F7',priority:'P2',kind:'latent presentation wiring omission',title:'Hall swaps props but keeps the bell-field environment and observer-centred light',
      effect:'Tower-land branch exists for propInstances only. sourceAmbient stays BELLS_AMBIENT, localLights returns source-void-lamp centred on player; stage lamp metadata is only emissive. Main still selects corridor rain/elsewhere crossing beds; released crossing folds away. Static snow drifts exist, but no active hall snow/weather/bed ownership.',
      evidenceStrength:'Dynamic ambient/light/weather values plus traced renderer/audio inputs',
      refs:[
        ['src/game/source-space-runtime.js',6531,6531,'land isolates props only'],
        ['src/game/source-space-runtime.js',2582,2587,'bell ambient remains'],
        ['src/game/source-space-runtime.js',6053,6056,'stage lamps authored emissive'],
        ['src/game/source-space-runtime.js',6086,6094,'no light submission from land props'],
        ['src/game/source-space-runtime.js',7002,7029,'observer lamp wins'],
        ['src/game/source-space-runtime.js',6415,6420,'weather remains corridor rain'],
        ['src/main.js',8277,8288,'renderer/beds/weather use old crossing/road'],
        ['content/narrative/source-space.door-field.story.json',893,915,'snowed hall and warm stage promised in inspection text'],
      ],
      recommendation:'Give each real land its own weather, ambient/local fixture lights, sound bed, and saved environment lifecycle; reuse the actual world-variant identity.',
    },
  ],
  tests:{
    command:'node --test test/horizon-bust.spec.mjs test/horizon.spec.mjs test/source-finale-routes.spec.mjs test/source-bell-field.spec.mjs test/source-bell-passage.spec.mjs test/source-hall-runtime.spec.mjs test/source-station-progression.spec.mjs test/source-station-main.spec.mjs test/station-walk.spec.mjs',
    exitCode:1,total:27,pass:23,fail:4,cancelled:0,skipped:0,todo:0,durationMs:6764.260791,
    failures:[
      {file:'test/horizon.spec.mjs',line:178,assertion:'key doors did not unlock tower door',classification:'stale fixture timing',explanation:'Crosses multiple doors synchronously; active crossing blocks eraseCrossedDoors. No advanceStationTime between visits. Actual two-key reproduction with 5s active station time succeeds.'},
      {file:'test/source-bell-passage.spec.mjs',line:405,assertion:'both key doors left tower locked',classification:'stale fixture timing',explanation:'Same zero-time visit assumption, including decoy during previous visit. Actual two-key reproduction with station time succeeds.'},
      {file:'test/source-hall-runtime.spec.mjs',line:273,assertion:'proper torch normal !== xray',classification:'intentional behavior change / stale expectation',explanation:'Selected Rooms leaking through implementation explicitly restores normal physical torch in Source proper.'},
      {file:'test/source-finale-routes.spec.mjs',line:273,assertion:'God finale preset contains inline godAbortBattle before carry',classification:'stale source-text shape contract',explanation:'godCathedralFinalePreset now uses godWarpToHook; commit calls godReleaseViewForWarp which clears scenes and activeBattleId/godBattleOpen before startCathedralCarry. Static helper trace, not a new interactive finale verification.',refs:[['src/main.js',24121,24134],['src/main.js',23750,23755],['src/main.js',23712,23726]]},
    ],
    coverageGap:'No bounded suite traverses enterTowerLand -> tickBellField -> save/reload -> land exit, seed31 barred lock-in, or the planned T4 story/rewards. Green station tests prove ordinary crossing persistence, not T4 completion.',
    testsEdited:false,
  },
  searchScope:{
    files:['src/game/source-space-runtime.js','src/game/chunk-surf-state.js','src/main.js','src/game/source-bell-field.js','src/game/chapel-tower-state.js','src/game/bell-tower-runtime.js','src/data/elsewhere-worlds.js','content/narrative/source-space.door-field.story.json','docs/plans/door-field-station.md'],
    queries:['TOWER_LANDS / towerLandActive / towerLandState','land-piece / land-door','recordist / reward / errand / tape','ordered bell / bell order / ring order','bell alarm / startCathedralCarry / finale cathedral','lockIn / lockInFrom / stationSnapshot'],
    limitation:'Absence conclusions are scoped to connected Source land/station/finale owners and explicit T4 plan. Existing unrelated recordist art, recordings, combat dialogue, and elsewhere visual variants were not counted as T4 implementation.',
  },
};
for(const finding of evidence.findings) finding.refs=finding.refs.map(([file,start,end,reason])=>({file:'/Users/seb/chunk-surfer/'+file,start,end,reason}));
writeFileSync(new URL('./runtime-audit.json', import.meta.url), JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({findings:evidence.findings.length,hallDisplacementMetres:displacement.metres,restoredTowerLand:reload.restoredTowerLand,barredLockInSeeds:scan.map(s=>s.seed),keyProof,output:new URL('./runtime-audit.json',import.meta.url).pathname},null,2));

