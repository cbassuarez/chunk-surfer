// The selected Cut journey under the game's frame, input, audio and save owners.
// No RAF, window listener, iframe, AudioContext, production save or alternate tape
// is created here. The host commits checkpoint/return transactions explicitly.
import { createDrive, stepDrive, selectStation, power, note, saveDrive, restoreDrive, PHASES, applyRoadImpulse, canDismountDrive } from './source-drive/drive-state.js';
import { roadAt } from './source-drive/road.js';
import { ORDINARY_BRIDGE } from './source-drive/route-layout.js';
import { crossedRoadJoints, JOINT_OFFSETS } from './source-drive/road-joints.js';
import { makeDriveScene, driveColliders } from './source-drive/scene.js';
import { createDriveWeather, stepDriveWeather, driveWeatherFrame, serializeDriveWeather, restoreDriveWeather } from './source-drive/weather.js';
import { wheelHandDiagnostics, resetWheelHands } from './source-drive/geometry/wheel-hands-pose.js';
import { SourceDriveAcoustics } from './source-drive/acoustics.js';
import { recoverDriveCheckpointPosition } from './source-drive/checkpoint-recovery.js';
import { driveEvolutionFrame } from './source-drive/evolution.js';
import { programmeFrame } from './source-drive/radio-programmes.js';
import { SOURCE_DRIVE_OPENING, seedMovingDriveEntry, driveOpeningView } from './source-drive/entry-cut.js';
import {driveDoorCrossingFrame} from './source-drive/door-crossing.js';

export const SOURCE_DRIVE_VERSION = 1;
export const SOURCE_DRIVE_ENCOUNTER = 'source-the-cut-v1';
export const SOURCE_DRIVE_ASSETS = Object.freeze({
  drive: '/assets/source-drive/drive.glb',
  metrics: '/assets/source-drive/geometry/metrics.json',
  hands: '/assets/source-drive/geometry/wheel-hands.glb',
  cutStatic: '/assets/source-drive/cut/cut-static.glb',
  cutLiving: '/assets/source-drive/cut/cut-living.glb',
  cutRoadside: '/assets/source-drive/cut/cut-roadside.glb',
  cutLandscape: '/assets/source-drive/cut/cut-landscape.glb',
  predicaments: '/assets/source-drive/predicaments/drive-predicaments.glb',
});
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const clone = value => JSON.parse(JSON.stringify(value));
const clock = seconds => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, '0')}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, '0')}`;
const KEY_INPUTS = { w: 'forward', arrowup: 'forward', s: 'reverse', arrowdown: 'reverse', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', ' ': 'brake' };

function validPose(value) {
  if (!value || ![value.x, value.y].every(Number.isFinite)) return null;
  for (const key of ['yaw', 'pitch', 'facing', 'floorH', 'eyeHeight']) if (value[key] != null && !Number.isFinite(value[key])) return null;
  return clone(value);
}

export function freshSourceDriveCheckpoint({ returnPose = null, runId = '' } = {}) {
  return { version: SOURCE_DRIVE_VERSION, encounterId: SOURCE_DRIVE_ENCOUNTER, runId: String(runId), status: 'not-started',
    returnPose: validPose(returnPose), drive: createDrive({ length: 1200 }), weather: JSON.parse(serializeDriveWeather(createDriveWeather())),
    look: { yaw: 0, pitch: -.14 }, settings: { wipers: true, headlights: true }, fingerprint: null, tape: null,
    started: false, clippedTimeSeconds: 0 };
}

export function normalizeSourceDriveCheckpoint(value = null) {
  if (!value || value.version !== SOURCE_DRIVE_VERSION || value.encounterId !== SOURCE_DRIVE_ENCOUNTER) return freshSourceDriveCheckpoint();
  try {
    if (!['not-started', 'active', 'returned'].includes(value.status)) throw Error('Invalid drive lifecycle.');
    const drive = restoreDrive(JSON.stringify(value.drive));
    if (drive.length !== 1200 || ![drive.x, drive.z, drive.heading, drive.programTime, drive.furthest].every(Number.isFinite)
      || drive.programTime < 0 || drive.furthest < 0) throw Error('Invalid drive state.');
    const weather = restoreDriveWeather(value.weather);
    const pose = validPose(value.returnPose);
    if (value.status !== 'not-started' && !pose) throw Error('An active journey requires its exterior pose.');
    const look = value.look || {};
    const fingerprint = value.fingerprint == null ? null : clone(value.fingerprint);
    if (fingerprint && (!Number.isFinite(fingerprint.startedAt) || !Array.isArray(fingerprint.pending)
      || fingerprint.pending.some(hit => !Number.isFinite(hit.at) || !Number.isFinite(hit.index)))) throw Error('Invalid acoustic continuation.');
    if(value.status==='active')recoverDriveCheckpointPosition(drive);
    return { version: SOURCE_DRIVE_VERSION, encounterId: SOURCE_DRIVE_ENCOUNTER, runId: String(value.runId || ''), status: value.status,
      returnPose: pose, drive, weather, look: { yaw: clamp(Number(look.yaw) || 0, -1.55, 1.55), pitch: clamp(Number(look.pitch) || 0, -.62, .45) },
      settings: { wipers: !!value.settings?.wipers, headlights: value.settings?.headlights !== false }, fingerprint,
      tape: value.tape == null ? null : clone(value.tape), started: !!value.started, clippedTimeSeconds: Math.max(0, Number(value.clippedTimeSeconds) || 0) };
  } catch { return freshSourceDriveCheckpoint({ runId: value.runId }); }
}

/**
 * Host contract:
 * renderer.initialize({assets,metrics}); renderer.render(frame); project(point).
 * context + monitorDestination are the existing game AudioContext/output bus.
 * createRecording({context,cabinBus,playbackDestination}) supplies the shared
 * one-tape adapter; no local take inventory or persistence is invented here.
 * onReturned({returnPose,checkpoint,tape}) must durably commit the real return.
 * Pointer coordinates are local CSS pixels, with width/height of the playfield.
 */
export function createSourceDriveSession(host = {}) {
  if (typeof host.renderer?.render !== 'function') throw Error('A game-owned drive renderer is required.');
  const original = normalizeSourceDriveCheckpoint(host.checkpoint);
  const saved = original.status === 'not-started' ? freshSourceDriveCheckpoint({ returnPose: host.returnPose || original.returnPose, runId: host.runId || original.runId }) : original;
  if (!saved.returnPose) throw Error('Capture the exact exterior pose before entering the drive.');
  const s = saved.drive;
  s.cutEnabled = true;
  s.paused = true;
  const assets = { ...SOURCE_DRIVE_ASSETS, ...host.assets };
  const keys = new Set();
  let weather = restoreDriveWeather(saved.weather), look = { ...saved.look }, settings = { ...saved.settings };
  const opening=host.entry!=='review'&&original.status==='not-started'
    ?{renderPrimed:false,soundStartedAt:null,picture:false,interrupted:false}:null;
  if(opening){seedMovingDriveEntry(s,weather);look={yaw:0,pitch:SOURCE_DRIVE_OPENING.lookPitch};}
  let metrics = host.metrics || null, acoustics = host.acoustics || null, recording = host.recording || null;
  let initialized = false, initializing = null, disposed = false, returning = false, returned = saved.status === 'returned', lifecycleSerial = 0, resourceEpoch = 0;
  let handControl = null, queuedControl = null, drag = null, frame = null, fingerprint = saved.fingerprint;
  let previousAxleDistance = -s.z, started = saved.started, clippedTimeSeconds = saved.clippedTimeSeconds;
  let transport = Promise.resolve(), busy = false, lastError = null, checkpointAt = s.programTime;
  let picturePresented = false, automaticStart = null, retryWait = 0, startFailures = 0;
  let doorFinishRequested=false,doorContacted=s.events?.some(e=>e.type==='goods-threshold-impact')||false,
    doorOpened=driveDoorCrossingFrame(s).open>0;

  const report = error => { lastError = String(error?.message || error); host.onError?.(error); publish(); return error; };
  const event = (type, data = {}) => { const value = note(s, type, data); host.onEvent?.(clone(value)); return value; };
  const tapeStatus = () => recording?.status?.() || recording?.snapshot?.() || {};
  const tapeCheckpoint = () => recording?.checkpoint?.() ?? saved.tape;
  function publish() {
    const tape = tapeStatus();
    host.onStatus?.({ initialized, paused: s.paused, opening:driveOpeningView(opening,s), parked: !!s.arrived, brakeHeld: !!s.brakeHold, positionRecovered: s.boundaryRecovery?.acknowledged===false, returning, returned, busy, error: lastError,
      canBegin: initialized && s.paused && !returned && !returning, canLeave:false,doorCrossing:driveDoorCrossingFrame(s),
      title: returned ? 'The grey doors' : s.paused ? 'The Cut' : '',
      instruction: returned ? '' : s.paused ? 'PICTURE HELD · ESC · MENU' : s.brakeHold ? 'BRAKE HELD · W / S TO MOVE   R · RECORD   E · LISTEN' : s.arrived ? 'W · DRIVE THROUGH THE DOORS   E · LISTEN   R · RECORD' : 'R · RECORD   E · LISTEN   X · STOP',
      recording: !!tape.recording, playing: !!tape.playing });
  }
  function serialize() {
    const tape = tapeCheckpoint();
    return { version: SOURCE_DRIVE_VERSION, encounterId: SOURCE_DRIVE_ENCOUNTER, runId: saved.runId,
      status: returned ? 'returned' : started ? 'active' : 'not-started', returnPose: clone(saved.returnPose),
      drive: JSON.parse(saveDrive(s)), weather: JSON.parse(serializeDriveWeather(weather)), look: { ...look }, settings: { ...settings },
      fingerprint: fingerprint ? clone(fingerprint) : null, tape: tape == null ? null : clone(tape), started, clippedTimeSeconds };
  }
  function checkpoint(reason = 'autosave') { const value = serialize(); host.onCheckpoint?.(value, { reason }); return value; }
  function transaction(fn) {
    const task = transport.then(async () => { if (disposed) throw Error('The drive session is disposed.'); busy = true; publish(); try { return await fn(); } finally { busy = false; publish(); } });
    transport = task.catch(() => {});
    return task;
  }
  async function initialize() {
    if (disposed) throw Error('The drive session is disposed.');
    if (initialized) return session;
    if (initializing) return initializing;
    const epoch = resourceEpoch;
    const cancelled = () => disposed || epoch !== resourceEpoch;
    initializing = (async () => {
      if (returned) { initialized = true; publish(); return session; }
      if (!metrics) {
        const response = await (host.fetch || globalThis.fetch)(assets.metrics);
        if (cancelled()) return false;
        if (!response?.ok) throw Error('The drive cabin geometry could not be loaded.');
        metrics = await response.json();
        if (cancelled()) return false;
      }
      if (!metrics?.wheel || !metrics?.recorder || !Array.isArray(metrics?.eye)) throw Error('Invalid drive geometry metrics.');
      const acquired = await host.renderer.initialize?.({ assets, metrics });
      if (acquired === false || cancelled()) return false;
      acoustics ||= new SourceDriveAcoustics({ context: host.context, destination: host.monitorDestination });
      await acoustics.initialize?.();
      if (cancelled()) return false;
      if (!recording && host.createRecording) {
        const created = await host.createRecording({ context: host.context, cabinBus: acoustics.cabin, playbackDestination: host.playbackDestination });
        // A factory may finish after a menu/warp released the owner. Dispose
        // that late result instead of attaching it to an abandoned session.
        if (cancelled()) { await created?.dispose?.(); return false; }
        recording = created;
      }
      if (recording && saved.tape) await recording.hydrate?.(saved.tape);
      if (cancelled()) return false;
      await recording?.setPaused?.(true);
      if (cancelled()) return false;
      acoustics.setPaused?.(true);
      resetWheelHands(); initialized = true; rebuild(); publish(); return session;
    })().catch(error => { initializing = null; if (cancelled()) return false; report(error); throw error; });
    return initializing;
  }
  async function start() {
    if (initialized && !s.paused && !returned && !returning && !disposed) return true;
    const serial = ++lifecycleSerial;
    await initialize();
    if (disposed || returned || returning || serial !== lifecycleSerial) return false;
    if(opening&&!opening.renderPrimed)return false;
    if(host.renderer.ready?.()===false)return false;
    await host.onStart?.();
    if (disposed || returned || returning || serial !== lifecycleSerial) return false;
    if(opening&&!opening.picture){
      let readiness=acoustics.openingReadiness?.(s);
      if(readiness&&!readiness.ready&&lastError&&acoustics.retryMovingOpening){
        readiness=await acoustics.retryMovingOpening(s);
        if(disposed||returned||returning||serial!==lifecycleSerial)return false;
      }
      if(readiness&&!readiness.ready)throw report(Error(readiness.reason||'The running radio could not be prepared.'));
      if(opening.soundStartedAt==null)acoustics.primeMovingOpening?.(s);
      opening.soundStartedAt??=s.programTime;opening.interrupted=false;
    }
    lastError=null;
    keys.clear(); s.paused = false;
    if(s.boundaryRecovery)s.boundaryRecovery.acknowledged=true;
    acoustics.setPaused?.(false); await recording?.setPaused?.(false);
    rebuild();acoustics.sync?.(s,frame.scene.cut?.sources||[],frame.weather,frame.evolution,frame.scene.predicaments?.sources||[]);
    event(started ? 'journey-resume' : 'journey-start', { encounterId: SOURCE_DRIVE_ENCOUNTER });
    started = true; checkpoint(started ? 'start-or-resume' : 'entry'); publish(); return true;
  }
  async function pause() {
    lifecycleSerial++;
    picturePresented = false;
    if (disposed || returned) return false;
    if(opening&&!opening.picture)opening.interrupted=true;
    if (s.paused) { keys.clear(); drag = null; return true; }
    keys.clear(); drag = null; s.paused = true; acoustics?.setPaused?.(true);
    await recording?.setPaused?.(true);
    if (initialized) { event('journey-pause'); checkpoint('pause'); }
    publish(); return true;
  }
  // The host calls this only while its window and gameplay lifecycle are live.
  // A successful final draw is required on entry and after every hold. Loading
  // and retry time never advances vehicle, weather, programme or physical tape.
  function resumeWhenPresented(dt = 0) {
    retryWait = Math.max(0, retryWait - clamp(Number(dt) || 0, 0, .1));
    if (disposed || returned || returning || !s.paused || retryWait > 0) return Promise.resolve(false);
    if (automaticStart) return automaticStart;
    if (initialized && !picturePresented) return Promise.resolve(false);
    automaticStart = (async () => {
      if (!initialized) { await initialize(); return false; }
      return start();
    })().then(value => {
      if (value) { startFailures = 0; retryWait = 0; }
      return value;
    }).catch(async error => {
      await pause();
      if (lastError !== String(error?.message || error)) report(error);
      retryWait = Math.min(8, .5 * 2 ** Math.min(4, startFailures++));
      return false;
    }).finally(() => { automaticStart = null; });
    return automaticStart;
  }
  async function stopTransport(reason = 'stop') {
    if (!recording) return null;
    const result = await recording.seal?.({ reason });
    await recording.stopPlayback?.();
    lastError = null;
    event('tape-stop', { reason, takeId: result?.takeId || result?.id || null, durationSeconds: result?.durationSeconds ?? null }); checkpoint('transport'); return result;
  }
  function stop(reason = 'player-stop') {
    // STOP must interrupt a pending end-of-tape seek immediately. Queuing it
    // behind record() would let that seek finish and start an unwanted roll.
    recording?.stopPlayback?.();
    return transaction(() => stopTransport(reason));
  }
  function toggleRecord() { return transaction(async () => {
    if (!recording) throw Error('Field recording is unavailable; the journey can still continue.');
    const status = tapeStatus();
    if (status.recording || tapeCheckpoint()?.pending) return stopTransport('player-stop');
    await recording.stopPlayback?.();
    const result = await recording.record({ encounterId: SOURCE_DRIVE_ENCOUNTER, kind: 'field', counted: false, station: s.station,
      phase: PHASES[s.phase], programmeTime: s.programTime, distance: s.furthest, position: { x: s.x, z: s.z }, signal: 'cabin-reference' });
    if (s.paused) await recording.setPaused?.(true);
    event('record-start', { takeId: result?.id || result?.takeId || tapeCheckpoint()?.pending?.takeId || null }); checkpoint('record-start'); return result;
  }); }
  function playLast() { return transaction(async () => {
    if (!recording) throw Error('Field playback is unavailable.');
    await recording.seal?.({ reason: 'playback' });
    await recording.stopPlayback?.();
    const result = await recording.play({});
    if (s.paused) await recording.setPaused?.(true);
    lastError = null; event('tape-play', { takeId: tapeStatus().lastTakeId || null }); checkpoint('transport'); return result;
  }); }
  function operate(kind, fn, preset = null) {
    if (!initialized || s.paused || returned || returning) return false;
    if (handControl) { queuedControl = { kind, fn, preset }; return true; }
    handControl = { kind, fn, preset, startedAt: s.programTime, contacted: false };
    return true;
  }
  const tune = index => operate('tune', () => { selectStation(s, ['service', 'company', 'music'][index]); acoustics.click?.('tuning-control'); checkpoint('station'); }, index);
  function controlPose() { return handControl ? { kind: handControl.kind, preset: handControl.preset, elapsed: s.programTime - handControl.startedAt } : null; }
  function updateControl() {
    if (!handControl) return;
    const reach = wheelHandDiagnostics()?.reach;
    if (reach?.kind !== handControl.kind) return;
    if (!handControl.contacted && reach.atContact) { handControl.contacted = true; Promise.resolve().then(handControl.fn).catch(report); }
    if (reach.complete) { handControl = null; if (queuedControl) { const q = queuedControl; queuedControl = null; operate(q.kind, q.fn, q.preset); } }
  }
  function readout() {
    const tape = tapeStatus(), physical = host.tapeTransport?.() || {};
    // An idle/live microphone meter is not evidence of playback amplitude.
    const level = tape.playing ? (host.playbackLevel?.() || 0) : (acoustics?.level?.() || 0);
    const seconds = tape.playing ? (tape.playbackTapeSeconds ?? physical.headSeconds ?? tape.positionSeconds ?? tape.position ?? 0) : (physical.headSeconds ?? tape.headSeconds ?? tape.tapeEndSeconds ?? tape.elapsedSeconds ?? 0);
    const pendingStorage = tapeCheckpoint()?.pending?.state === 'pending-storage';
    return { counter: clock(seconds), levels: { left: level, right: level }, note: pendingStorage ? 'TAPE HELD · PRESS STOP TO SAVE' : tape.recording ? 'FIELD TAKE · ROLLING' : tape.playing ? 'PLAY · HEADPHONES' : 'FIELD TAKE · READY', mode: tape.recording ? 'record' : tape.playing ? 'play' : 'idle' };
  }
  function rebuild() {
    if (!initialized || !metrics || returned) return;
    const scene = makeDriveScene(s, metrics, { ...settings, handControl: controlPose(), weather: driveWeatherFrame(weather) });
    const wf = driveWeatherFrame(weather, { bodyMatrix: scene.body, cabinMount: metrics.cabinBodyMount, headlamps: scene.lamps.slice(0, 2) });
    frame = { scene, eye: scene.eye, look: { yaw: s.heading + look.yaw, pitch: look.pitch + scene.roadPitch }, props: scene.props, lights: scene.lamps,
      weather: wf, heading: s.heading, lampDip: .020 - scene.roadPitch, mirrors: scene.mirrors, timeSec: s.programTime, driveState: s,
      evolution: scene.evolution, radio: acoustics?.programmeFrame?.()||programmeFrame(s,scene.evolution), readout: readout(), active: true };
  }
  function advanceFingerprint(before) {
    const trigger = ORDINARY_BRIDGE.d - 95;
    if (!fingerprint && before < trigger && s.furthest >= trigger) {
      const speed = Math.max(.5, Math.abs(s.speed));
      const pending = JOINT_OFFSETS.flatMap((d, i) => [{ index: i * 2, at: s.programTime + (d - JOINT_OFFSETS[0]) / speed },
        { index: i * 2 + 1, at: s.programTime + (d - JOINT_OFFSETS[0] + 3.1) / speed }]).sort((a, b) => a.at - b.at);
      fingerprint = { startedAt: s.programTime, referenceSpeed: speed, pending };
      event('broadcast-joint-fingerprint', { referenceSpeed: speed, station: 'service', audible: s.radioOn && s.station === 'service' });
    }
    if (fingerprint) {
      const due = fingerprint.pending.filter(hit => hit.at <= s.programTime);
      fingerprint.pending = fingerprint.pending.filter(hit => hit.at > s.programTime);
      for (const hit of due) { const audible = s.radioOn && s.station === 'service'; if (audible) acoustics.joint?.({ radio: true, strength: 1 }); event('broadcast-road-joint', { index: hit.index, audible }); }
    }
  }
  function update(dt) {
    if (!initialized || disposed || returned || returning || s.paused) return;
    if(opening&&!opening.picture&&host.context&&host.context.state!=='running'){void pause();return;}
    const incoming = Number.isFinite(dt) ? Math.max(0, dt) : 0, elapsed = Math.min(.25, incoming);
    clippedTimeSeconds += incoming - elapsed;
    const old = s.furthest, phase = s.phase, wasArrived = s.arrived, wasHeld = !!s.brakeHold;
    stepDrive(s, elapsed, Object.fromEntries([...keys].map(key => [key, true])), driveColliders(s));
    const crossing=driveDoorCrossingFrame(s);
    if(crossing.open>0&&!doorOpened){doorOpened=true;acoustics.click?.('goods-door-release');event('goods-doors-opening',{distance:crossing.distance,speed:s.speed});}
    if(crossing.contact&&!doorContacted){doorContacted=true;acoustics.joint?.({strength:1.2});applyRoadImpulse(s,.09);event('goods-threshold-impact',{distance:crossing.distance,speed:s.speed});}
    s.lookYaw = look.yaw;
    advanceFingerprint(old);
    const distance = -s.z;
    for (const hit of crossedRoadJoints(previousAxleDistance, distance, { speed: s.speed, roadOffset: s.roadOffset, bridgeDistance: ORDINARY_BRIDGE.d })) {
      acoustics.joint?.({ strength: Math.min(1.2, Math.abs(s.speed) / 9) * (hit.axle === 'front' ? .80 : .63) });
      applyRoadImpulse(s, Math.min(.12, Math.abs(s.speed) * .006) * (hit.axle === 'front' ? 1 : -.6)); event('physical-road-joint', { axle: hit.axle, jointDistance: hit.jointDistance, speed: s.speed });
    }
    previousAxleDistance = distance;
    const evolution=driveEvolutionFrame(s);
    stepDriveWeather(weather, { dt: elapsed, timeSec: s.programTime, ...evolution.weather, wipers: settings.wipers, speed: s.speed });
    rebuild(); updateControl(); acoustics.sync?.(s, frame.scene.cut?.sources || [],frame.weather,evolution,frame.scene.predicaments?.sources||[]); recording?.tick?.();
    if(opening&&!opening.picture&&opening.soundStartedAt!=null&&s.programTime-opening.soundStartedAt>=SOURCE_DRIVE_OPENING.audioLeadSeconds){
      opening.picture=true;event('journey-picture',{speed:s.speed,station:s.station,programmeTime:s.programTime});checkpoint('moving-picture');publish();
    }
    if (s.phase !== phase || s.arrived !== wasArrived || !!s.brakeHold !== wasHeld || s.programTime - checkpointAt >= 4) { checkpointAt = s.programTime; checkpoint('progress'); publish(); }
    if(crossing.complete&&!doorFinishRequested){
      doorFinishRequested=true;
      Promise.resolve(finish({throughDoor:true})).then(ok=>{if(!ok)doorFinishRequested=false;}).catch(error=>{
        doorFinishRequested=false;retryWait=Math.max(retryWait,5);report(error);
      });
    }
  }
  function render() {
    if (!initialized || disposed || returned) return false;
    if (!frame) rebuild();
    if (!frame) return false;
    frame.readout = readout();
    host.renderer.setRecorderReadout?.(frame.readout);
    if(host.renderer.render(frame)===false){void pause();return false;}
    picturePresented=true;
    if(opening&&!opening.renderPrimed){opening.renderPrimed=true;publish();}
    return true;
  }
  function input(action, pressed = true) {
    if (!['forward', 'reverse', 'left', 'right', 'brake'].includes(action)) return false;
    if(opening&&!opening.picture){keys.delete(action);return true;}
    if (pressed && !s.paused && !returned && !returning) keys.add(action); else keys.delete(action);
    return true;
  }
  function key(e) {
    const k = String(e?.key || '').toLowerCase();
    if (k === 'escape') { keys.clear(); host.onPauseRequested?.(); return true; }
    if(opening&&!opening.picture)return true;
    if(e?.repeat&&(k==='enter'||KEY_INPUTS[k]&&!keys.has(KEY_INPUTS[k])))return true;
    if (k === 'enter') return true;
    if (KEY_INPUTS[k]) { input(KEY_INPUTS[k], true); return true; }
    if (s.paused || returned || returning || e?.repeat) return false;
    if (/^[123]$/.test(k)) return tune(Number(k) - 1);
    if (k === 'r') return operate('record', toggleRecord);
    if (k === 'e') return operate('play', playLast);
    if (k === 'x') return operate('stop', () => stop());
    if (k === 'o') return operate('power', () => { power(s); acoustics.click?.('radio-power'); });
    if (k === 'v') { settings.wipers = !settings.wipers; event('wipers', { on: settings.wipers }); return true; }
    if (k === 'l') { settings.headlights = !settings.headlights; event('headlamps', { on: settings.headlights }); return true; }
    if (k === 'f') { look = { yaw: 0, pitch: -.14 }; rebuild(); return true; }
    return false;
  }
  function keyup(e) { const action = KEY_INPUTS[String(e?.key || '').toLowerCase()]; return action ? input(action, false) : false; }
  function pick(x, y, width, height) {
    if (!frame || !host.renderer.project) return null;
    let best = null;
    for (const t of frame.scene.targets) { const p = host.renderer.project(t.point), d = p?.visible ? Math.hypot(p.x * width - x, p.y * height - y) : Infinity; if (d < 25 && (!best || d < best.d)) best = { ...t, d }; }
    return best;
  }
  function activate(target) {
    if (!target) return false;
    if (target.id === 'tune') return tune(target.preset ?? (['service', 'company', 'music'].indexOf(s.station) + 1) % 3);
    if (target.id === 'record') return operate('record', toggleRecord);
    if (target.id === 'play') return operate('play', playLast);
    if (target.id === 'stop') return operate('stop', () => stop());
    if (target.id === 'power') return operate('power', () => { power(s); acoustics.click?.('radio-power'); });
    return false;
  }
  function pointer(e = {}) {
    if(opening&&!opening.picture)return true;
    if (s.paused || returned || returning || !initialized) return false;
    const type = String(e.type || '').replace(/^pointer/, ''), x = Number(e.x), y = Number(e.y), width = Number(e.width), height = Number(e.height);
    if (type === 'cancel' || type === 'lostcapture') { drag = null; return true; }
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
    if (type === 'down') { drag = { x, y, look: { ...look }, control: pick(x, y, width, height) }; return true; }
    if (type === 'move' && drag) { const dx = x - drag.x, dy = y - drag.y; if (!drag.control || Math.hypot(dx, dy) >= 10) { look.yaw = clamp(drag.look.yaw + dx * .0028, -1.55, 1.55); look.pitch = clamp(drag.look.pitch - dy * .0028, -.62, .45); rebuild(); } return true; }
    if (type === 'up') { const target = drag && Math.hypot(x - drag.x, y - drag.y) < 10 ? drag.control : null; drag = null; return activate(target) || true; }
    if (type === 'wheel') { const target = pick(x, y, width, height); if (target?.id === 'power') return operate('power', () => { s.volume = clamp(s.volume - Math.sign(e.deltaY) * .05, 0, 1); }); if (target?.id === 'tune') return tune((['service', 'company', 'music'].indexOf(s.station) + (e.deltaY > 0 ? 1 : 2)) % 3); }
    return false;
  }
  function finish({throughDoor=false}={}) { return transaction(async () => {
    const crossing=driveDoorCrossingFrame(s);
    // Explicit debug callers retain the former parked-finish adapter; normal
    // controls can complete only by crossing the actual open goods threshold.
    if (returned || (throughDoor ? !crossing.complete : !canDismountDrive(s)||keys.has('forward')||keys.has('reverse'))) return false;
    if (typeof host.onReturned !== 'function') throw Error('The game has not installed the exterior return owner.');
    returning = true; keys.clear(); s.paused = true; acoustics.setPaused?.(true); await recording?.setPaused?.(true); publish();
    try {
      await recording?.seal?.({ reason: 'journey-return' });
      await recording?.stopPlayback?.();
      const final = serialize(); final.status = 'returned'; final.drive.finished = true;
      await host.onReturned({ returnPose: clone(saved.returnPose), checkpoint: final, tape: final.tape,crossing:throughDoor?{...crossing,kind:'driven-door',speed:s.speed}:null });
      returned = true; s.finished = true; handControl = queuedControl = null;
      event('journey-returned', { target:throughDoor?'through grey doors into the next Source section':'grey-door exterior',throughDoor });
      return true;
    } catch (error) { report(error); throw error; }
    finally { returning = false; publish(); }
  }); }
  async function dispose() {
    if (disposed) return;
    disposed = true; resourceEpoch++; lifecycleSerial++;
    keys.clear(); drag = null; s.paused = true; acoustics?.setPaused?.(true);
    recording?.stopPlayback?.();
    await recording?.setPaused?.(true);
    // A host may release this scene inside onReturned(). That callback is
    // already inside the final transport transaction: awaiting it here would
    // deadlock the return. Capture has been sealed before that callback runs.
    if (!returning) await transport;
    try { await recording?.dispose?.(); }
    finally { acoustics?.dispose?.(); host.renderer.dispose?.(); handControl = queuedControl = null; resetWheelHands(); }
  }
  const session = { id: 'source-drive', blocksWorld: true, blocksInput: true, suppressesHud: true, allowsLook: false,
    initialize, start, pause, resumeWhenPresented, update, render, key, keyup, pointer, input, serialize, checkpoint, finish, dispose,
    record: toggleRecord, play: playLast, stop,
    status: () => ({ initialized, paused: s.paused, opening:driveOpeningView(opening,s), returned, returning, busy, error: lastError, parked: s.arrived, state: clone(s), look: { ...look }, tape: tapeStatus() }),
    openingFrame:()=>driveOpeningView(opening,s),
    frame: () => frame,
    // Read-only diagnostic taps: the review harness uses the exact existing
    // cabin reference, without a second microphone, listener or audio graph.
    audioDiagnostics:()=>acoustics?.diagnostics?.()||null,
    captureStream:()=>recording?.sink?.stream||null };
  return session;
}
