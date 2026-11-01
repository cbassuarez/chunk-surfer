import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFootstepAudio } from '../src/audio/footsteps.js';
import { FOOTSTEP_AUDIO_SOURCES } from '../src/data/footstep-audio-assets.js';
import { CREDITS } from '../src/data/credits.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture({ deferred = false, maxVoices = 32, maxDecodedBytes = 48 * 1024 * 1024, random = () => .37 } = {}) {
  const sources = [], nodes = [], requests = [];
  const param = (value = 0) => ({ value, values: [],
    setValueAtTime(v, at) { this.value = v; this.values.push([v, at]); },
    setTargetAtTime(v, at) { this.value = v; this.values.push([v, at]); },
    linearRampToValueAtTime(v, at) { this.value = v; this.values.push([v, at]); },
    exponentialRampToValueAtTime(v, at) { this.value = v; this.values.push([v, at]); },
    cancelScheduledValues() {}, cancelAndHoldAtTime() {},
  });
  const node = (kind = 'node') => {
    const n = { kind, connections: [], disconnected: false,
      connect(to) { this.connections.push(to); return to; },
      disconnect() { this.disconnected = true; },
    };
    nodes.push(n); return n;
  };
  const destination = node('world-sfx');
  const clips = {};
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
    clips[id] = { url: `${id}.wav`, duration: .5, channels: 1, kind: 'dry', primaryContactSeconds: .020, onsetSeconds: .020 };
  }
  for (const id of ['wet-a', 'wet-b', 'wet-c', 'wet-d', 'settle-a', 'settle-b', 'layer-a', 'scuff-a']) {
    clips[id] = { url: `${id}.wav`, duration: id.startsWith('wet') ? 1.2 : .7,
      channels: id.startsWith('wet') ? 2 : 1,
      kind: id.startsWith('layer') ? 'substrate' : id.startsWith('scuff') ? 'dry' : 'response' };
    if (id.startsWith('wet')) Object.assign(clips[id], { onsetSeconds: .022, responseAttackSeconds: .040, peakAttackSeconds: .040 });
    if (id.startsWith('settle')) Object.assign(clips[id], { duration: 1.2, onsetSeconds: .630, responseAttackSeconds: .720, peakAttackSeconds: .9 });
  }
  const response = Object.fromEntries(['a', 'b', 'c', 'd'].map(id => [id, ['wet-a', 'wet-b']]));
  const compiledResponse = Object.fromEntries(Object.keys(response).map(id => [id, ['wet-a', 'wet-b', 'wet-c', 'wet-d']]));
  const manifest = { version: 1, sampleRate: 48000, maxResponseSeconds: 6.25,
    profileGainDb: { glazed: 0, erased: 0, 'compiled-field': 0, 'compiled-path': 0, 'compiled-fault': 0 },
    clips, banks: {
      concrete: { walk: ['a', 'b', 'c', 'd'], slow: ['a', 'b'], scuff: ['scuff-a'] },
      tile: { walk: ['a', 'b', 'c', 'd'], slow: ['a', 'b'], scuff: ['scuff-a'] },
      wood: { walk: ['e', 'f', 'g', 'h'] },
      body: { walk: ['a', 'b', 'c', 'd'], layer: ['layer-a'] },
    }, responses: { glazed: response, erased: Object.fromEntries(Object.keys(response).map(id => [id, 'settle-a'])),
      'compiled-field': compiledResponse, 'compiled-path': compiledResponse, 'compiled-fault': compiledResponse },
    profileParameters: Object.fromEntries(['compiled-field','compiled-path','compiled-fault'].map(key=>[key,{responseSelection:'random-note-no-adjacent-repeat'}])),
  };
  const ctx = { currentTime: 1, state: 'running', sampleRate: 48000,
    createGain: () => Object.assign(node('gain'), { gain: param(1) }),
    createStereoPanner: () => Object.assign(node('pan'), { pan: param(0) }),
    createBiquadFilter: () => Object.assign(node('filter'), { frequency: param(6000), Q: param(.5) }),
    createConvolver: () => node('convolver'),
    createBuffer(channels, length, sampleRate) { return { numberOfChannels: channels, length, sampleRate,
      duration: length / sampleRate, getChannelData: () => new Float32Array(length) }; },
    createBufferSource() {
      const s = { ...node('source'), playbackRate: param(1), starts: [], stops: [],
        start(...args) { this.starts.push(args); }, stop(...args) { this.stops.push(args); } };
      sources.push(s); return s;
    },
    async decodeAudioData(data) {
      const id = new TextDecoder().decode(data).replace(/\.wav$/, '');
      const c = clips[id];
      assert.ok(c, `unknown test asset ${id}`);
      return { id, duration: c.duration, numberOfChannels: c.channels, sampleRate: 48000,
        length: c.duration * 48000, getChannelData: () => new Float32Array(c.duration * 48000) };
    },
  };
  let current = { ctx, destination };
  const fetcher = url => {
    const reply = () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(String(url).split('/').at(-1)).buffer });
    if (!deferred) { requests.push({ url }); return Promise.resolve(reply()); }
    return new Promise(resolve => requests.push({ url, resolve: () => resolve(reply()) }));
  };
  const engine = createFootstepAudio({ getAudio: () => current, fetcher, urlFor: value => value,
    manifest, maxVoices, maxDecodedBytes, random });
  const plant = (extra = {}) => engine.contact({ owner: 'player', surface: 'concrete', profile: 'physical',
    level: .22, plantIndex: 0, footSide: 'left', ...extra });
  const preload = extra => engine.preload({ surface: 'concrete', profile: 'physical', ...extra });
  const finish = () => { for (const s of sources) if (!s.disconnected) s.onended?.(); };
  return { ctx, destination, nodes, sources, requests, manifest, engine, plant, preload, finish,
    switchAudio: next => { current = next; } };
}

test('complete dry takes retain natural rate and never repeat at adjacent bag boundaries', async () => {
  const f = fixture(); await f.preload();
  const played = [];
  for (let i = 0; i < 16; i++) {
    f.ctx.currentTime += .6;
    const receipt = f.plant({ plantIndex: i, footSide: i % 2 ? 'right' : 'left' });
    assert.equal(receipt.played, true);
    played.push(receipt.dryId); f.finish();
  }
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
  for (const s of f.sources) {
    assert.equal(s.playbackRate.value, 1, 'a new take must not be fabricated by rate roulette');
    assert.equal(s.starts[0].length, 1, 'whole contacts begin at zero, without arbitrary source slicing');
    assert.ok(s.stops[0][0] - s.starts[0][0] >= s.buffer.duration);
  }
  assert.ok(f.nodes.some(n => n.connections.includes(f.destination)), 'all output must enter supplied world SFX');
  assert.equal(f.engine.snapshot().playedDry, 16); f.engine.destroy();
});

test('a missing decode cannot replay a missed plant, even after owner clear or pause', async () => {
  const f = fixture({ deferred: true });
  const result = f.plant();
  assert.equal(result.played, false); assert.equal(f.sources.length, 0);
  await tick();
  f.engine.clear('player'); f.engine.update({ paused: true, moving: false });
  for (let pass = 0; pass < 8; pass++) {
    for (const r of f.requests) if (r.resolve) { const resolve = r.resolve; r.resolve = null; resolve(); }
    await tick();
  }
  assert.equal(f.sources.length, 0, 'loading is preparation, never a delayed action queue');
  assert.ok(f.engine.snapshot().missedContacts >= 1);
  f.engine.update({ paused: false, moving: false });
  assert.equal(f.sources.length, 0, 'focus return must not replay spent contacts');
  f.engine.destroy();
});

test('Compiled Ground chooses one random related note per plant without adjacent repetition or a forced cycle', async () => {
  let state=0x12003456;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/0x100000000;};
  const f = fixture({random}); await f.preload({ surface: 'tile', profile: 'compiled', tone: 'field' });
  const notes=[];
  for (let i = 0; i < 32; i++) {
    const before = f.sources.length;
    const receipt = f.plant({ surface: 'tile', profile: 'compiled', tone: 'field', plantIndex: i });
    assert.equal(receipt.played, true);
    assert.ok(['wet-a','wet-b','wet-c','wet-d'].includes(receipt.responseId));
    notes.push(receipt.responseId);
    if(i)assert.notEqual(notes[i],notes[i-1]);
    const newSources = f.sources.slice(before);
    assert.equal(newSources.filter(s => !s.buffer.id.startsWith('wet')).length, 1);
    assert.equal(newSources.filter(s => s.buffer.id.startsWith('wet')).length, 1);
    f.ctx.currentTime += .5; f.finish();
  }
  assert.equal(new Set(notes).size,4,'all four related notes remain available');
  assert.ok(notes.slice(4).some((note,index)=>note!==notes[index]),'four notes must not become a fixed four-step ostinato');
  assert.equal(f.engine.snapshot().playedDry, 32);
  assert.equal(f.engine.snapshot().playedResponses, 32); f.engine.destroy();
});

test('Compiled Ground does not invent a new note after movement stops', async () => {
  const f = fixture(); await f.preload({surface:'tile',profile:'compiled',tone:'field'});
  f.plant({surface:'tile',profile:'compiled',tone:'field'});
  const count=f.sources.length,notes=f.engine.snapshot().playedResponses;
  f.engine.update({owner:'player',moving:false});
  f.ctx.currentTime+=.3;f.engine.update({owner:'player',moving:false});
  f.ctx.currentTime+=5;f.engine.update({owner:'player',moving:false});
  assert.equal(f.sources.length,count,'the last note may decay, but no sequencer follows a stop');
  assert.equal(f.engine.snapshot().playedResponses,notes);f.engine.destroy();
});

test('erased ground keeps dry feedback and answers once after stopping, never at every plant', async () => {
  const f = fixture(); await f.preload({ surface: 'tile', profile: 'erased' });
  f.plant({ surface: 'tile', profile: 'erased' });
  f.ctx.currentTime += .6; f.engine.update({ owner: 'player', moving: true });
  f.plant({ surface: 'tile', profile: 'erased', plantIndex: 1 });
  assert.equal(f.sources.filter(s => s.buffer.id.startsWith('settle')).length, 0);
  f.engine.update({ owner: 'player', moving: false });
  f.ctx.currentTime += .2; f.engine.update({ owner: 'player', moving: false });
  assert.equal(f.sources.filter(s => s.buffer.id.startsWith('settle')).length, 1);
  f.ctx.currentTime += 5; f.engine.update({ owner: 'player', moving: false });
  assert.equal(f.sources.filter(s => s.buffer.id.startsWith('settle')).length, 1, 'stillness is not an autonomous repetition clock');
  assert.equal(f.engine.snapshot().playedDry, 2); f.engine.destroy();
});

test('a new contact cancels the prior erased residue instead of accumulating disconnected ghosts', async () => {
  const f = fixture(); await f.preload({ surface: 'tile', profile: 'erased' });
  f.plant({ surface: 'tile', profile: 'erased' });
  f.engine.update({ owner: 'player', moving: false }); f.ctx.currentTime += .3;
  f.engine.update({ owner: 'player', moving: false });
  const residue = f.sources.find(s => s.buffer.id === 'settle-a'); assert.ok(residue);
  const stops = residue.stops.length;
  f.plant({ surface: 'tile', profile: 'erased', plantIndex: 1 });
  assert.ok(residue.stops.length > stops || residue.disconnected, 'resuming movement releases the stationary residue');
  f.engine.destroy();
});

test('per-owner clearing releases only that owner and pause releases all sources', async () => {
  const f = fixture(); await f.preload({ surface: 'tile', profile: 'glazed' });
  f.plant({ owner: 'route-a', surface: 'tile', profile: 'glazed' });
  f.plant({ owner: 'route-b', surface: 'tile', profile: 'glazed', plantIndex: 1 });
  assert.ok(f.engine.snapshot().voices >= 4);
  f.engine.clear('route-a');
  assert.equal(f.engine.snapshot().voices, 2);
  assert.ok(f.engine.snapshot().owners.includes('route-b'));
  assert.equal(f.engine.snapshot().owners.includes('route-a'), false);
  f.engine.update({ paused: true });
  assert.equal(f.engine.snapshot().voices, 0);
  assert.equal(f.plant().played, false, 'paused contact cannot make a voice');
  f.engine.update({ paused: false });
  assert.equal(f.engine.snapshot().voices, 0); f.engine.destroy();
});

test('voice pressure stays bounded across long wet walks and disposes detached nodes', async () => {
  const f = fixture({ maxVoices: 6 }); await f.preload({ surface: 'tile', profile: 'glazed' });
  for (let i = 0; i < 60; i++) {
    f.ctx.currentTime += .3;
    f.plant({ surface: 'tile', profile: 'glazed', plantIndex: i });
    assert.ok(f.engine.snapshot().voices <= 6);
  }
  f.engine.destroy();
  assert.equal(f.engine.snapshot().voices, 0);
  assert.ok(f.sources.every(s => s.stops.length >= 1));
  assert.ok(f.sources.every(s => s.disconnected));
});

test('decoded residency is bounded after switching material banks', async () => {
  const f = fixture({ maxDecodedBytes: 450000 });
  await f.preload(); await f.preload({ surface: 'wood' });
  assert.ok(f.engine.snapshot().decodedBytes <= 450000);
  assert.ok(f.engine.snapshot().evictedClips >= 1);
  assert.ok(f.engine.snapshot().decodedClips < Object.keys(f.manifest.clips).length);
  f.engine.destroy();
});

test('substrate layers are finite additions to one sole, not extra semantic steps', async () => {
  const f = fixture(); await f.preload({ surface: 'body' });
  const result = f.plant({ surface: 'body' });
  assert.equal(result.played, true); assert.equal(f.engine.snapshot().playedDry, 1);
  assert.equal(f.sources.filter(s => s.buffer.id === 'layer-a').length, 1);
  assert.equal(f.sources.length, 2);
  assert.ok(f.sources.every(s => s.stops[0][0] - s.starts[0][0] < 1.5));
  f.engine.destroy();
});

test('the weak-leg scuff is an early filtered release rather than a second late sole impact',async()=>{
  const f=fixture();await f.preload();
  assert.equal(f.plant({injury:1,footSide:'left',plantIndex:0}).played,true);
  const dry=f.sources.find(source=>source.buffer.id!=='scuff-a');
  const release=f.sources.find(source=>source.buffer.id==='scuff-a');
  assert.ok(dry&&release);
  assert.ok(Math.abs(release.starts[0][0]-dry.starts[0][0]-.025)<1e-8);
  assert.ok(f.nodes.some(node=>node.kind==='filter'&&node.type==='highpass'&&node.frequency.value>=700));
  assert.equal(f.engine.snapshot().playedDry,1);
  f.engine.destroy();
});

test('closed/replaced audio contexts cannot retain an old graph or replay old plants', async () => {
  const f = fixture(), next = fixture(); await f.preload(); f.plant();
  const old = f.sources[0];
  f.switchAudio({ ctx: next.ctx, destination: next.destination });
  await f.preload();
  assert.ok(old.disconnected && old.stops.length >= 1);
  assert.equal(f.engine.snapshot().voices, 0);
  next.ctx.state = 'closed'; assert.equal(f.plant().played, false);
  f.engine.destroy(); next.engine.destroy();
});

test('explicit pause survives replacement of the audio context', async () => {
  const f = fixture(), next = fixture(); await f.preload();
  f.engine.update({ paused: true });
  f.switchAudio({ ctx: next.ctx, destination: next.destination });
  await f.preload();
  assert.equal(f.plant().played, false, 'an audio device/context change is not permission to resume gameplay audio');
  assert.equal(next.sources.length, 0);
  f.engine.update({ paused: false });
  assert.equal(f.plant().played, true);
  f.engine.destroy(); next.engine.destroy();
});

test('actual production profiles prepare complete dry and wet banks within the default cache', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/footsteps/manifest.json', import.meta.url)));
  for(const [profile,count] of [['compiled-field',4],['compiled-path',6],['compiled-fault',8]]){
    const parameters=manifest.profileParameters[profile];
    assert.equal(parameters.noteCount,count);
    assert.equal(parameters.notesPerPlant,1);
    assert.equal(parameters.responseSelection,'random-note-no-adjacent-repeat');
    for(const responses of Object.values(manifest.responses[profile])){
      assert.equal(responses.length,count);
      responses.forEach((id,index)=>{
        const clip=manifest.clips[id];
        assert.equal(clip.noteIndex,index);
        assert.equal(clip.voices,1,'a contact excites one note, not the entire related pool');
        assert.equal(clip.simultaneousPoolNotes,1);
      });
    }
  }
  const f = fixture();
  const byFile = new Map(Object.entries(manifest.clips).map(([id, c]) => [c.url.split('/').at(-1), [id, c]]));
  f.ctx.decodeAudioData = async data => {
    const [id, clip] = byFile.get(new TextDecoder().decode(data));
    return { id, duration: clip.duration, sampleRate: 48000, numberOfChannels: clip.channels,
      length: Math.round(clip.duration * 48000) };
  };
  const engine = createFootstepAudio({ getAudio: () => ({ctx: f.ctx, destination: f.destination}), manifest,
    fetcher: async url => ({ok:true, arrayBuffer: async () => new TextEncoder().encode(String(url).split('/').at(-1)).buffer}),
    urlFor: value => value });
  for (const profile of ['glazed', 'compiled-field', 'compiled-path', 'compiled-fault', 'erased']) {
    for (const careful of [false, true]) {
      const input = { owner: 'player', surface: 'tile', profile, careful, level: .22 };
      assert.equal(await engine.preload(input), true, profile);
      const start = engine.snapshot();
      for (let index = 0; index < 16; index++) {
        f.ctx.currentTime += .6;
        const result = engine.contact({...input, plantIndex:index});
        assert.equal(result.played, true, `${profile} ${careful ? 'careful' : 'walk'} dry ${index}`);
        assert.ok(result.responseId, `${profile} has a corresponding response for each dry take`);
        for (const source of f.sources) if (!source.disconnected) source.onended?.();
      }
      const end = engine.snapshot();
      assert.equal(end.missedContacts, start.missedContacts);
      if (profile !== 'erased') assert.equal(end.playedResponses - start.playedResponses, 16, `${profile} must not silently omit a prepared response`);
      assert.ok(end.decodedBytes <= 48 * 1024 * 1024);
      engine.clear();
    }
  }
  assert.deepEqual(engine.snapshot().errors, []); engine.destroy(); f.engine.destroy();
});

test('production source credits derive from the same verified manifest and preserve source quality qualifications', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/footsteps/manifest.json', import.meta.url)));
  assert.deepEqual(FOOTSTEP_AUDIO_SOURCES.map(s => s.id).sort(), Object.keys(manifest.sources).sort());
  const section = CREDITS.find(s => s.heading === 'Footstep and Source Surface Recordings');
  assert.ok(section);
  for (const source of FOOTSTEP_AUDIO_SOURCES) {
    assert.equal(source.licence, 'CC0-1.0');
    assert.ok(section.lines.includes(source.url));
    assert.ok(section.lines.includes(source.licenceUrl));
    assert.ok(section.lines.some(line => line.includes(source.author) && line.includes(source.title)));
  }
  assert.ok(section.lines.some(line => /MP3 previews/.test(line)));
  assert.ok(section.lines.some(line => /original lossless masters were not acquired/.test(line)));
});

test('Surface Lag changes only the response phase while dry, substrate and release anchors stay fixed',async()=>{
  const baseline=fixture(),lagged=fixture();
  for(const f of[baseline,lagged])await f.preload({surface:'body',profile:'compiled',tone:'field'});
  const values=[];
  for(let i=0;i<16;i++){
    baseline.ctx.currentTime+=.28;lagged.ctx.currentTime+=.28;
    const input={surface:'body',profile:'compiled',tone:'field',interval:.28,latenessSeconds:.010,
      plantIndex:i,footSide:i%2?'right':'left',injury:1};
    const beforeBase=baseline.sources.length,beforeLag=lagged.sources.length;
    const dry=baseline.plant(input),wet=lagged.plant({...input,responseLagSeconds:.080,responseLagWanderSeconds:.025});
    assert.ok(dry.played&&wet.played);
    assert.equal(wet.dryId,dry.dryId);assert.equal(wet.responseId,dry.responseId);
    assert.equal(wet.scheduledAt,dry.scheduledAt);assert.equal(wet.onsetAt,dry.onsetAt);
    assert.ok(wet.responseLagAppliedSeconds>=0&&wet.responseLagAppliedSeconds<=.095);
    assert.ok(Math.abs(wet.responseOnsetAt-wet.onsetAt-wet.responseLagAppliedSeconds-.002)<1e-8);
    const core=f=>f.filter(s=>!s.buffer.id.startsWith('wet')).map(s=>[s.buffer.id,s.starts[0][0]]);
    assert.deepEqual(core(lagged.sources.slice(beforeLag)),core(baseline.sources.slice(beforeBase)));
    values.push(wet.responseLagAppliedSeconds);
    baseline.finish();lagged.finish();
  }
  assert.ok(values.at(-1)>.055,'the phase treatment should actually emerge over real contacts');
  values.forEach((lag,index)=>{if(index)assert.ok(Math.abs(lag-values[index-1])<=.012+1e-8);});
  assert.equal(lagged.engine.snapshot().playedDry,16);
  assert.equal(lagged.engine.snapshot().playedResponses,16);
  baseline.engine.destroy();lagged.engine.destroy();
});

test('Surface Lag drift is deterministic and separate from note selection randomness',async()=>{
  const first=fixture({random:()=>.1}),second=fixture({random:()=>.8});
  for(const f of[first,second])await f.preload({surface:'tile',profile:'compiled',tone:'field'});
  const observations=[];
  for(let i=0;i<24;i++){
    const pair=[first,second].map(f=>{
      f.ctx.currentTime+=.30;
      const receipt=f.plant({surface:'tile',profile:'compiled',tone:'field',plantIndex:i,interval:.30,
        responseLagSeconds:.065,responseLagWanderSeconds:.025});
      f.finish();return receipt;
    });
    assert.equal(pair[0].responseLagAppliedSeconds,pair[1].responseLagAppliedSeconds);
    assert.equal(pair[0].responseLagWanderAppliedSeconds,pair[1].responseLagWanderAppliedSeconds);
    assert.ok(Math.abs(pair[0].responseLagWanderAppliedSeconds)<=.025);
    observations.push(pair[0].responseLagAppliedSeconds);
  }
  assert.ok(new Set(observations.slice(8).map(value=>value.toFixed(5))).size>5,'drift should not be a fixed delay');
  first.engine.destroy();second.engine.destroy();
});

test('removing Surface Lag catches up gradually without a short response pair or autonomous note',async()=>{
  const f=fixture();await f.preload({surface:'tile',profile:'compiled',tone:'field'});
  const receipts=[];
  for(let i=0;i<28;i++){
    f.ctx.currentTime+=.24;
    receipts.push(f.plant({surface:'tile',profile:'compiled',tone:'field',plantIndex:i,interval:.24,
      responseLagSeconds:i<10?.095:0,responseLagWanderSeconds:i<10?.025:0}));
    f.finish();
  }
  assert.ok(receipts[9].responseLagAppliedSeconds>.06);
  assert.ok(receipts[10].responseLagAppliedSeconds>0,'switching off must not snap the delayed surface attack forward');
  assert.equal(receipts.at(-1).responseLagAppliedSeconds,0);
  receipts.forEach((receipt,index)=>{
    assert.equal(receipt.responseSuppressedReason,null);
    if(index){
      assert.ok(Math.abs(receipt.responseLagAppliedSeconds-receipts[index-1].responseLagAppliedSeconds)<=.012+1e-8);
      assert.ok(receipt.responseAttackAt-receipts[index-1].responseAttackAt>=.72*.24-1e-8);
    }
  });
  const count=f.sources.length;
  f.engine.update({moving:false});f.ctx.currentTime+=2;f.engine.update({moving:false});
  assert.equal(f.sources.length,count);assert.equal(f.engine.snapshot().playedResponses,28);
  f.engine.destroy();
});

test('adversarial lag and attack changes cannot compress heard responses or delay them past the bounded slot',async()=>{
  const f=fixture();
  f.manifest.clips['wet-b'].responseAttackSeconds=.085;
  f.manifest.clips['wet-c'].responseAttackSeconds=.035;
  await f.preload({surface:'tile',profile:'compiled',tone:'field'});
  const heard=[];
  for(let i=0;i<32;i++){
    f.ctx.currentTime+=.15;
    const receipt=f.plant({surface:'tile',profile:'compiled',tone:'field',plantIndex:i,interval:.18,
      responseLagSeconds:i%8<4?.095:0,responseLagWanderSeconds:.025});
    assert.equal(receipt.played,true,'a wet timing conflict must never remove the dependable dry contact');
    if(receipt.responseScheduledAt!=null){
      assert.ok(receipt.responseLagAppliedSeconds<=.4*.18+1e-8);
      const previous=heard.at(-1);
      if(previous){
        assert.ok(receipt.responseAttackAt-previous.responseAttackAt>=.14-1e-8);
        assert.ok(receipt.responseOnsetAt-previous.responseOnsetAt>=.14-1e-8);
      }
      heard.push(receipt);
    }else{
      assert.equal(receipt.responseSuppressedReason,'response-spacing');
      assert.equal(receipt.responseLagAppliedSeconds,null);
    }
    f.finish();
  }
  assert.ok(heard.length>8);
  assert.ok(f.engine.snapshot().suppressedResponses>0,'an infeasible response must be omitted, not queued into a later footfall');
  assert.equal(f.engine.snapshot().playedDry,32);
  f.engine.destroy();
});

test('physical support and baseline zero-lag diffusion keep their existing timing',async()=>{
  const f=fixture();await f.preload();
  const plain=f.plant({responseLagSeconds:.095,responseLagWanderSeconds:.025,interval:.2});
  assert.equal(plain.responseId,null);assert.equal(plain.responseScheduledAt,null);
  assert.equal(plain.responseLagCandidateSeconds,0);
  f.ctx.currentTime+=.5;
  f.manifest.clips['wet-a'].onsetSeconds=.030;
  f.manifest.clips['wet-a'].responseAttackSeconds=.034;
  f.manifest.clips['wet-b'].onsetSeconds=.162;
  f.manifest.clips['wet-b'].responseAttackSeconds=.260;
  await f.preload({surface:'tile',profile:'glazed'});
  for(let i=0;i<12;i++){
    f.ctx.currentTime+=.217;
    const receipt=f.plant({surface:'tile',profile:'glazed',plantIndex:i,interval:.217});
    assert.equal(receipt.responseLagAppliedSeconds,0);
    assert.equal(receipt.responseScheduledAt,receipt.scheduledAt);
    assert.equal(receipt.responseSuppressedReason,null,'Surface Lag must not rewrite the authored baseline diffusion');
    f.finish();
  }
  f.engine.destroy();
});

test('lagged sources remain cancellable at pause, owner change and context replacement',async()=>{
  const f=fixture(),next=fixture();await f.preload({surface:'tile',profile:'compiled',tone:'field'});
  for(let i=0;i<10;i++){
    f.ctx.currentTime+=.25;
    f.plant({surface:'tile',profile:'compiled',tone:'field',plantIndex:i,interval:.25,
      latenessSeconds:0,responseLagSeconds:.095,responseLagWanderSeconds:.020});
    if(i<9)f.finish();
  }
  const waiting=f.sources.at(-1);
  assert.ok(waiting.starts[0][0]>f.ctx.currentTime);
  f.engine.update({paused:true});
  assert.ok(waiting.disconnected&&waiting.stops.some(([time])=>time<=f.ctx.currentTime));
  assert.equal(f.engine.snapshot().voices,0);assert.deepEqual(f.engine.snapshot().responseTiming,[]);
  f.engine.update({paused:false});
  f.ctx.currentTime+=1;
  const resumed=f.plant({surface:'tile',profile:'compiled',tone:'field',plantIndex:20,interval:.25,responseLagSeconds:.095});
  assert.ok(resumed.responseLagAppliedSeconds<=.012+1e-8,'old phase debt cannot survive pause');
  f.engine.clear('player');assert.equal(f.engine.snapshot().voices,0);
  f.switchAudio({ctx:next.ctx,destination:next.destination});await f.preload();
  assert.deepEqual(f.engine.snapshot().responseTiming,[]);
  f.engine.destroy();next.engine.destroy();
});

test('erased footing applies lag only to its one owned stop residue and cancels it on resumed contact',async()=>{
  const f=fixture();await f.preload({surface:'tile',profile:'erased'});
  let last;
  for(let i=0;i<10;i++){
    f.ctx.currentTime+=.35;
    last=f.plant({surface:'tile',profile:'erased',plantIndex:i,interval:.35,responseLagSeconds:.080,responseLagWanderSeconds:.020});
    assert.equal(last.responseScheduledAt,null);f.finish();
  }
  assert.equal(f.engine.snapshot().playedResponses,0);
  f.engine.update({owner:'player',moving:false});f.ctx.currentTime+=.2;
  f.engine.update({owner:'player',moving:false});
  const settled=f.engine.snapshot().events.at(-1);
  assert.equal(settled.kind,'settle');assert.ok(settled.responseLagAppliedSeconds>.05);
  assert.ok(Math.abs(settled.responseOnsetAt-settled.responseScheduledAt-.630)<1e-8);
  const residue=f.sources.at(-1);assert.equal(residue.buffer.id,'settle-a');
  // Supported movement cancels the residue before its next ordinary plant
  // becomes eligible under the anti-doublet interval.
  f.engine.update({owner:'player',moving:true});f.ctx.currentTime+=.1;
  f.plant({surface:'tile',profile:'erased',plantIndex:11,interval:.35,responseLagSeconds:.080});
  assert.ok(residue.stops.some(([time])=>time<settled.responseOnsetAt),'resumed movement owns cancellation, including the baked bow pre-delay');
  assert.equal(f.engine.snapshot().playedResponses,1);
  f.engine.destroy();
});

test('real compiled and normal-speed diffuse banks retain one answer per plant under Surface Lag',async()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/footsteps/manifest.json',import.meta.url)));
  const byFile=new Map(Object.entries(manifest.clips).map(([id,clip])=>[clip.url.split('/').at(-1),[id,clip]]));
  for(const [profile,interval] of [['compiled-field',.217],['glazed',.377],['glazed',.408]]){
    const f=fixture();let seed=12001;
    f.ctx.decodeAudioData=async bytes=>{
      const[id,clip]=byFile.get(new TextDecoder().decode(bytes));
      return{id,duration:clip.duration,sampleRate:48000,numberOfChannels:clip.channels,length:Math.round(clip.duration*48000)};
    };
    const engine=createFootstepAudio({getAudio:()=>({ctx:f.ctx,destination:f.destination}),manifest,
      fetcher:async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(String(url).split('/').at(-1)).buffer}),
      urlFor:value=>value,random:()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}});
    assert.equal(await engine.preload({surface:'tile',profile}),true);
    let previous;
    for(let i=0;i<100;i++){
      f.ctx.currentTime+=interval;
      const receipt=engine.contact({owner:'real-player',surface:'tile',profile,level:.22,plantIndex:i,interval,
        responseLagSeconds:.080,responseLagWanderSeconds:.012});
      assert.equal(receipt.played,true);assert.equal(receipt.responseSuppressedReason,null,`${profile} plant${i}`);
      assert.ok(receipt.responseScheduledAt!=null);
      if(previous){
        assert.ok(receipt.responseOnsetAt-previous.responseOnsetAt>=receipt.responseMinimumOnsetSpacingSeconds-1e-8);
        assert.ok(receipt.responseAttackAt-previous.responseAttackAt>=receipt.responseMinimumAttackSpacingSeconds-1e-8);
      }
      previous=receipt;f.finish();
    }
    const status=engine.snapshot();
    assert.equal(status.playedDry,100);assert.equal(status.playedResponses,100);
    assert.equal(status.suppressedResponses,0);assert.equal(status.missedContacts,0);
    assert.ok(status.decodedBytes<=48*1024*1024);
    engine.destroy();f.engine.destroy();
  }
});

test('every shipped response provides measured early landmarks distinct from a long bloom maximum',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/audio/footsteps/manifest.json',import.meta.url)));
  for(const [id,clip]of Object.entries(manifest.clips))if(clip.kind==='response'){
    assert.ok(Number.isFinite(clip.onsetSeconds),id);
    assert.ok(clip.responseAttackSeconds>=clip.onsetSeconds&&clip.responseAttackSeconds<=clip.onsetSeconds+.102,id);
    assert.ok(clip.peakAttackSeconds>=clip.onsetSeconds,id);
  }
  const bowed=manifest.clips[Object.values(manifest.responses.erased)[0]];
  assert.ok(bowed.peakAttackSeconds>bowed.responseAttackSeconds+.5,'the full bowed bloom must not reserve a new step at its much later maximum');
});
