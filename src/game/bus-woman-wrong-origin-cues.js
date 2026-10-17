// Sparse physical consequences of the authored hand action. These times belong
// to saved performance seconds, never AudioContext time or an ambient loop.
const cue = (at, phase, strength, variant) => Object.freeze({ at, phase, strength, variant });
const SEARCH = Object.freeze([cue(.68, 'pull', .16, 1)]);
const RECEIVE = Object.freeze([cue(.32, 'guard', .11, 0), cue(.84, 'pull', .17, 1), cue(3.10, 'release', .075, 0)]);
const ACKNOWLEDGE = Object.freeze([cue(.22, 'guard', .10, 0), cue(.72, 'pull', .14, 1)]);
const STEP = Object.freeze([cue(.18, 'supported', .11, 1)]);
const READY = Object.freeze([cue(.52, 'grip', .10, 0)]);

export function busWomanWrongOriginCuePlan({ mode, seconds, stage, clock, woman = {} } = {}) {
  const level = Math.max(0, Math.min(4, Math.trunc(Number(stage) || 0)));
  const time = Math.max(0, Number(seconds) || 0), savedClock = Math.max(0, Number(clock) || 0);
  let kind, epoch, track;
  if (mode === 'search') { kind='search'; epoch=Math.floor(savedClock/24); track=SEARCH; }
  else if (mode === 'receive' && woman.receivedAt != null) { kind='receive'; epoch=Math.round(woman.receivedAt*1e6); track=RECEIVE; }
  else if (mode === 'ready' && woman.receivedAt != null) { kind='ready'; epoch=Math.round(woman.receivedAt*1e6); track=READY; }
  else if (mode?.startsWith('acknowledge') && woman.acknowledgedAt != null) { kind='acknowledge'; epoch=Math.round(woman.acknowledgedAt*1e6); track=ACKNOWLEDGE; }
  else if (mode?.startsWith('step') && woman.stepAt != null) { kind='step'; epoch=Math.round(woman.stepAt*1e6); track=STEP; }
  else return null;
  if (!level) return null;
  return { kind, epoch, time, clock:savedClock,
    cues:track.map(value=>({...value,strength:value.strength*(.8+level*.08)})) };
}

export function crossedBusWomanWrongOriginCues(previous, current) {
  if (!previous || !current || previous.kind!==current.kind || previous.epoch!==current.epoch
    || current.clock<=previous.clock || current.clock-previous.clock>.5 || current.time<previous.time) return [];
  return current.cues.filter(cue=>previous.time<cue.at && current.time>=cue.at);
}
