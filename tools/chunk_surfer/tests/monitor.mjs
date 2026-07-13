import {
  MONITOR_THRESHOLDS, monitorInject, monitorReset, monitorSnapshot,
  monitorSetAuxInput, monitorSnapshotForRms,
} from '../../../public/labs/chunk-surfer/src/audio/monitor.js';
import { micIgnoreSpoilFor, micMaySpoil, micStop, micTest } from '../../../public/labs/chunk-surfer/src/game/mic.js';

const ck = (name, ok, got='') => {
  if (!ok) throw new Error(`${name}${got ? `: ${got}` : ''}`);
  console.log(`✓ ${name}`);
};

ck('twelve fixed display thresholds', MONITOR_THRESHOLDS.length === 12);
ck('silence is dark', monitorSnapshotForRms(0).segments === 0);

let prev = -1;
for (const rms of [0, .001, .004, .01, .03, .1, .3, 1]) {
  const s = monitorSnapshotForRms(rms);
  ck(`segments are monotonic at ${rms}`, s.segments >= prev, `${s.segments} after ${prev}`);
  prev = s.segments;
}
ck('full scale lights every segment', monitorSnapshotForRms(1).segments === 12);

monitorReset(); monitorInject(.5);
const attackA = monitorSnapshot(1000);
const attackB = monitorSnapshot(1100);
ck('meter attacks toward the signal', attackB.rms > attackA.rms);
monitorInject(0);
const release = monitorSnapshot(1200);
ck('meter releases instead of dropping to zero', release.rms > 0 && release.rms < attackB.rms);
ck('peak holds above the falling envelope', release.peakDb >= release.db);
const expired = monitorSnapshot(2000);
ck('peak hold expires', Math.abs(expired.peakDb - expired.db) < 0.001);
monitorInject(null); monitorReset();

monitorInject(0); monitorSetAuxInput(() => 0.1);
monitorSnapshot(3000);
const aux = monitorSnapshot(3100);
ck('room mic contributes to the always-live monitor without an audio connection', aux.rms > 0.05);
monitorReset();

micTest(0.2); micIgnoreSpoilFor(1400);
const micNow = performance.now();
ck('recorder transport guard suppresses only spoil evaluation', !micMaySpoil(micNow) && micMaySpoil(micNow + 1500));
micStop(); micTest(null);
