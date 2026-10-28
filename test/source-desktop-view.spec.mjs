import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SOURCE_ATLAS from '../content/chunk-surf/source-atlas.json' with { type: 'json' };
import { sourceStrataGeometry } from '../src/data/source-exposed-strata.js';
import {
  createSourceDesktopEnvelopeGate, normalizeSourceDesktopSnapshot, sourceDesktopRenderFrame,
  sourceDesktopLayout, sourceDesktopGlyphLines, SOURCE_DESKTOP_PLATES, SOURCE_DESKTOP_DISSOLVE_SECONDS,
  sourceDesktopDiagnosticLayout,
} from '../src/render/source-desktop-view.js';
import {sourceDesktopFailureBeat} from '../src/game/source-desktop-state.js';

const state = overrides => ({ token:'encounter-a', phase:'contained', clock:4,
  cover:{count:3,capacity:3,guard:5,exposed:false}, intent:{kind:'broadcast',progress:.25}, ...overrides });

test('the same authored body survives contained, dissolving and desktop presentation', () => {
  const contained=sourceDesktopRenderFrame(state({active:false}));
  assert.equal(contained.state.active,true,'a not-yet-breached mechanics frame still presents the antagonist');
  assert.equal(contained.openness,0);
  assert.ok(contained.body?.character.joints.chest);
  assert.equal(contained.body.mesh,'pressure_body');
  assert.equal(SOURCE_DESKTOP_DISSOLVE_SECONDS,2.4);
  const frames=[0,.25,.5,.75,1].map(transition=>sourceDesktopRenderFrame(state({phase:'dissolving',transition})));
  assert.deepEqual(frames[0].body,contained.body);
  assert.deepEqual(frames.at(-1).body,contained.body,'the shell dissolves without replacing the borrowed body');
  assert.deepEqual(frames.map(f=>f.openness),[0,.15625,.5,.84375,1]);
  assert.equal(sourceDesktopRenderFrame(state({phase:'desktop'})).openness,1);
  assert.equal(sourceDesktopRenderFrame(state({phase:'reforming',transition:1})).openness,0);
});

test('the authoritative breach clock holds, names the failure, then peels the same physical shelter',()=>{
  const samples=[0,.35,.8,1.15,1.65,2.4].map(sourceDesktopFailureBeat);
  assert.deepEqual(samples.map(x=>x.stage),['held','diagnostic','diagnostic','peeling','peeling','exposed']);
  assert.deepEqual(samples.map(x=>x.diagnostic),[0,1,1,1,0,0]);
  const held=sourceDesktopRenderFrame(state({phase:'dissolving',transition:.3,breach:{elapsed:.8}}));
  assert.equal(held.openness,0);assert.equal(held.failure.stage,'diagnostic');
  const peel=sourceDesktopRenderFrame(state({phase:'dissolving',transition:.75,breach:{elapsed:1.8}}));
  assert.ok(peel.openness>0&&peel.openness<1);assert.deepEqual(peel.body,held.body);
  const paused=normalizeSourceDesktopSnapshot({...held.state,breach:{elapsed:2.4},paused:true},held.state);
  assert.equal(paused.breach.elapsed,.8);assert.equal(sourceDesktopRenderFrame(paused).failure.stage,'diagnostic');
  const restored=sourceDesktopRenderFrame(state({phase:'dissolving',transition:1,breach:{elapsed:2.4}}));
  assert.equal(restored.openness,1);assert.equal(restored.failure.diagnostic,0,'reload must not replay the fatal diagnostic');
});

test('the passive failure diagnostic clears every command and reaction allocation',()=>{
  for(const[w,h]of[[640,480],[1280,800],[2560,1440],[900,1600]])for(const y of[h*.3,h*.5,h*.72]){
    const diagnostic=sourceDesktopDiagnosticLayout(w,h,{command:{x:0,y,width:w,height:h-y}});
    assert.ok(diagnostic.height<y);assert.ok(diagnostic.padding>0);assert.ok(diagnostic.titleSize>=17);
  }
});

test('pause freezes both the sampled character and shell while closing can still clear it', () => {
  const before=normalizeSourceDesktopSnapshot(state({phase:'dissolving',transition:.4,clock:12}));
  const paused=normalizeSourceDesktopSnapshot(state({phase:'desktop',transition:1,clock:90,paused:true}),before);
  assert.equal(paused.clock,12); assert.equal(paused.transition,.4); assert.equal(paused.phase,'dissolving');
  assert.deepEqual(sourceDesktopRenderFrame(paused).body,sourceDesktopRenderFrame(before).body);
  const backwards=normalizeSourceDesktopSnapshot(state({clock:3}),before);
  assert.equal(backwards.clock,12,'reordered owner samples cannot rewind a clip clock');
  assert.equal(normalizeSourceDesktopSnapshot(state({phase:'ended',active:false,paused:true}),before).active,false);
  assert.equal(normalizeSourceDesktopSnapshot(state({token:'encounter-b',clock:1}),before).clock,1,'a new encounter owns a fresh clock');
});

test('HOLD and EXPOSE show only the authoritative surviving cover', () => {
  const hold=sourceDesktopRenderFrame(state({phase:'desktop',actionId:'hold',cover:{count:1,capacity:2,guard:4}}));
  assert.equal(hold.guardVisible,true); assert.equal(hold.state.cover.guard,4); assert.equal(hold.rakeVisible,false);
  const empty=sourceDesktopRenderFrame(state({actionId:'hold',cover:{count:0,capacity:1,guard:3}}));
  assert.equal(empty.guardVisible,false,'the renderer cannot fabricate a destroyed plate');
  const expose=sourceDesktopRenderFrame(state({actionId:'expose',cover:{count:0,capacity:1,guard:3,exposed:true}}));
  assert.equal(expose.guardVisible,false); assert.equal(expose.rakeVisible,true);
  const invalid=normalizeSourceDesktopSnapshot(state({cover:{count:9,capacity:1,guard:5}}));
  assert.equal(invalid.cover.count,1); assert.equal(invalid.cover.capacity,1);
});

test('captured fading or hidden Presence cannot make the combat performer vanish', () => {
  const pressurePresentation={primary:{id:'captured-pressure',x:22,y:13,floorH:4.2,heightM:2.18,mode:'off',strength:0,
    performance:{role:'court-trace',clip:'pressure_arrest',time:1,heading:0,manifestation:0}}};
  const frame=sourceDesktopRenderFrame(state({pressurePresentation}));
  assert.ok(frame.body); assert.equal(frame.body.mesh,'pressure_body');
  assert.equal(frame.body.pressure.mode,'live'); assert.ok(frame.body.pressure.strength>.9);
});

test('comfort settings stop authored motion while retaining tells and attack state', () => {
  for(const kind of ['broadcast','conceal','overload','loop','silence']) {
    const a=sourceDesktopRenderFrame(state({intent:{kind,progress:.6},reducedMotion:true,reduceFlash:true,clock:1}));
    const b=sourceDesktopRenderFrame(state({intent:{kind,progress:.6},reducedMotion:true,reduceFlash:true,clock:101}));
    assert.equal(a.clip,'pressure_hold'); assert.equal(a.clipTime,0); assert.deepEqual(a.body,b.body);
    assert.equal(a.state.intent.kind,kind); assert.equal(a.state.intent.progress,.6);
  }
  assert.notDeepEqual(sourceDesktopRenderFrame(state({intent:{kind:'overload',progress:.6}})).body.character,
    sourceDesktopRenderFrame(state({intent:{kind:'silence',progress:.6}})).body.character,'distinct incoming kinds retain distinct physical cues');
});

test('every supported monitor layout keeps the body above the command island', () => {
  for(const [width,height] of [[640,480],[1280,800],[2560,1440],[900,1600]]) for(const y of [height*.3,height*.5,height*.72]) {
    const layout=sourceDesktopLayout(width,height,{scale:3,command:{x:0,y,width,height:height-y}});
    assert.ok(layout.body.top>=0); assert.ok(layout.body.bottom<y); assert.ok(layout.stageHeight<=height);
    assert.equal(layout.dpr,2,'the passive overlay bounds its rendering cost on dense monitors');
  }
});

test('overlay revisions reject late frames and retired encounter tokens', () => {
  const gate=createSourceDesktopEnvelopeGate(), envelope=(token,revision)=>({token,revision,snapshot:state({clock:revision})});
  assert.ok(gate.accept(envelope('a',0))); assert.equal(gate.accept(envelope('a',0)),null);
  assert.ok(gate.accept(envelope('a',4))); assert.equal(gate.accept(envelope('a',3)),null);
  assert.ok(gate.accept(envelope('b',0))); assert.equal(gate.accept(envelope('a',5)),null);
  assert.equal(gate.accept({token:'b',revision:2,snapshot:null}),null);
  assert.equal(gate.debug().revision,0,'an invalid envelope cannot consume a revision');
});

test('finite desktop plates reuse closed Source strata and their real source glyphs', () => {
  const pieces=new Map(sourceStrataGeometry().map(piece=>[piece.id,piece]));
  for(const spec of SOURCE_DESKTOP_PLATES) {
    const piece=pieces.get(spec.id); assert.ok(piece); assert.ok(spec.size.every(n=>Number.isFinite(n)&&n>0&&n<3));
    const edges=new Map();
    for(let n=0;n<piece.i.length;n+=3) for(const [a,b] of [[0,1],[1,2],[2,0]]) {
      const edge=[piece.i[n+a],piece.i[n+b]].sort((a,b)=>a-b).join(':'); edges.set(edge,(edges.get(edge)||0)+1);
    }
    assert.ok([...edges.values()].every(count=>count===2),`${spec.id} remains closed instead of an infinite decorative plane`);
  }
  const actual=new Set(Object.values(SOURCE_ATLAS.sectors).flatMap(sector=>sector.sourceLines.map(line=>line.text)));
  const lines=sourceDesktopGlyphLines(); assert.ok(lines.length>=24); assert.ok(lines.every(line=>actual.has(line)));
});

test('the shipped borrowed body has its actual skin and all required authored performances', async () => {
  const bytes=await readFile(new URL('../public/assets/pressure-character.glb',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'glTF'); assert.equal(bytes.readUInt32LE(4),2);
  const json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());
  assert.ok(json.skins[0].joints.length>=30);
  const names=new Set(json.animations.map(animation=>animation.name));
  for(const name of ['pressure_hold','pressure_listen','pressure_load','pressure_pivot','pressure_arrest']) assert.ok(names.has(name));
  assert.ok(json.nodes.some(node=>node.skin!==undefined&&node.mesh!==undefined));
  assert.ok(json.meshes.some(mesh=>mesh.primitives.some(primitive=>primitive.targets?.length>=4)));
});
