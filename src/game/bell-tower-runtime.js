import {
  ELLERY_BELLS,
  RINGING_SCORE,
  SCHEDULE_AHEAD_SEC,
  rounds,
  scheduleRow,
} from '../data/bell-tower.js';

export const BELL_TOWER_RUNTIME_STATE = Object.freeze({
  IDLE: 'idle', TENOR: 'tenor', RINGING: 'ringing',
  STOP_REQUESTED: 'stop_requested', STANDING: 'standing', CLEARED: 'cleared',
});

const BELL_STAND_SETTLE_MS = 900;
const RESUME_SKIP_MS = 1500;
const LATE_AUDIO_GRACE_MS = 80;
export const RELAY_INTERRUPT_REQUIRED = 3;
export const RELAY_INTERRUPT_CYCLE_MS = 5600;
export const RELAY_INTERRUPT_LEAD_IN_MS = 2600;
const RELAY_INTERRUPT_WINDOW_START = .46;
const RELAY_INTERRUPT_WINDOW_END = .86;
const RELAY_INTERRUPT_GUARD_MS = 900;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const ease = (t) => { const x = clamp01(t); return x * x * (3 - 2 * x); };

export function relayInterventionWindowAt(elapsedMs) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  if (elapsed < RELAY_INTERRUPT_LEAD_IN_MS) {
    return {
      open: false,
      phase: 0,
      opensInMs: RELAY_INTERRUPT_LEAD_IN_MS - elapsed,
      closesInMs: 0,
    };
  }
  const cycleElapsed = (elapsed - RELAY_INTERRUPT_LEAD_IN_MS) % RELAY_INTERRUPT_CYCLE_MS;
  const phase = cycleElapsed / RELAY_INTERRUPT_CYCLE_MS;
  const open = phase >= RELAY_INTERRUPT_WINDOW_START && phase <= RELAY_INTERRUPT_WINDOW_END;
  const opensInMs = open
    ? 0
    : phase < RELAY_INTERRUPT_WINDOW_START
      ? (RELAY_INTERRUPT_WINDOW_START - phase) * RELAY_INTERRUPT_CYCLE_MS
      : (1 - phase + RELAY_INTERRUPT_WINDOW_START) * RELAY_INTERRUPT_CYCLE_MS;
  return {
    open,
    phase,
    opensInMs,
    closesInMs: open ? (RELAY_INTERRUPT_WINDOW_END - phase) * RELAY_INTERRUPT_CYCLE_MS : 0,
  };
}
function writePivotMatrix(out,pivot,yaw,angle,s=1,offsetX=0,offsetY=0,offsetZ=0){
  const cy=Math.cos(yaw||0),sy=Math.sin(yaw||0),c=Math.cos(angle),sn=Math.sin(angle);
  out[0]=cy*c*s;out[1]=sn*s;out[2]=-sy*c*s;out[3]=0;
  out[4]=-cy*sn*s;out[5]=c*s;out[6]=sy*sn*s;out[7]=0;
  out[8]=sy*s;out[9]=0;out[10]=cy*s;out[11]=0;
  out[12]=pivot.x+offsetX*cy+offsetZ*sy;out[13]=pivot.y+offsetY;out[14]=pivot.z-offsetX*sy+offsetZ*cy;out[15]=1;
  return out;
}

export function createInertBellAssemblyInstances(bells=[]){
  const out=[];
  for(const bell of bells)for(const [part,mesh] of [
    ['bell',`tower_bell_${String(bell.id).padStart(2,'0')}`],
    ['wheel',`tower_wheel_${String(bell.id).padStart(2,'0')}`],
    ['clapper',`tower_clapper_${String(bell.id).padStart(2,'0')}`],
    ['stay',`tower_stay_${String(bell.id).padStart(2,'0')}`],
    ['slider',`tower_slider_${String(bell.id).padStart(2,'0')}`],
  ])out.push({id:`tower-${part}-${bell.id}`,mesh,matrix:writePivotMatrix(new Float32Array(16),bell.pivot,bell.frameYaw||0,0,bell.visualScale||1),zone:12,structural:true});
  return out;
}
function writeComponentPoint(out,bell,angle,lx,ly,lz=0){
  const c=Math.cos(angle),s=Math.sin(angle),yaw=bell.frameYaw||0,cy=Math.cos(yaw),sy=Math.sin(yaw);
  const rx=lx*c-ly*s,ry=lx*s+ly*c;
  out[0]=bell.pivot.x+rx*cy+lz*sy;out[1]=bell.pivot.y+ry;out[2]=bell.pivot.z-rx*sy+lz*cy;
  return out;
}
const otherStroke = (stroke) => stroke === 'hand' ? 'back' : 'hand';
const strokeAfterRows = (stroke, count) => count % 2 ? otherStroke(stroke) : stroke;

function lowerBound(records, atMs) {
  let lo = 0, hi = records.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (records[mid].atMs < atMs) lo = mid + 1; else hi = mid; }
  return lo;
}

function upperBound(records, atMs) {
  let lo = 0, hi = records.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (records[mid].atMs <= atMs) lo = mid + 1; else hi = mid; }
  return lo;
}

export function fullCircleBellCurve({ phase, direction = 1, balanceHold = .08, strikePhase = .54 } = {}) {
  const p = clamp01(phase), hold = Math.max(.02, Math.min(.18, balanceHold));
  const start = -Math.PI * .94 * direction, end = Math.PI * .94 * direction;
  if (p < hold) return start;
  if (p > 1 - hold) return end;
  const travel = ease((p - hold) / (1 - hold * 2));
  const strikeSettle = Math.max(0, 1 - Math.abs(p - strikePhase) / .11);
  return start + (end - start) * travel + direction * strikeSettle * .025;
}

// Returns a piecewise phase whose authored strikePhase occurs at the exact
// score timestamp. Consecutive strokes share a boundary, so bells never snap
// between handstroke and backstroke even when row spacing changes.
export function bellMotionPhaseAt(records, elapsedMs, strikePhase = .72, out = null) {
  if (!records?.length) return null;
  const insertion = upperBound(records, elapsedMs);
  let first=insertion-1,second=insertion;
  if(first<0){first=second;second=-1;}
  else if(second>=records.length)second=-1;
  else if(Math.abs(records[second].atMs-elapsedMs)<Math.abs(records[first].atMs-elapsedMs)){const swap=first;first=second;second=swap;}
  for (let pass=0;pass<2;pass++) {
    const index=pass===0?first:second;if(index<0||index>=records.length)continue;
    const record = records[index], previous = records[index - 1], next = records[index + 1];
    const beforeMs = previous ? record.atMs - previous.atMs : 900;
    const afterMs = next ? next.atMs - record.atMs : 720;
    const startMs = record.atMs - strikePhase * beforeMs;
    const endMs = record.atMs + (1 - strikePhase) * afterMs;
    if (elapsedMs < startMs || elapsedMs > endMs) continue;
    const phase = elapsedMs <= record.atMs
      ? strikePhase * clamp01((elapsedMs - startMs) / Math.max(1, record.atMs - startMs))
      : strikePhase + (1 - strikePhase) * clamp01((elapsedMs - record.atMs) / Math.max(1, endMs - record.atMs));
    const result=out||{};result.record=record;result.phase=phase;result.startMs=startMs;result.endMs=endMs;return result;
  }
  return null;
}

export function sweptCapsuleIntersectsHazard(previous, current, hazard) {
  const a = previous || current, b = current || previous;
  if (!a || !b || !hazard) return false;
  const vx = b.x - a.x, vz = b.z - a.z;
  const wx = hazard.x - a.x, wz = hazard.z - a.z;
  const t = clamp01((wx * vx + wz * vz) / Math.max(.000001, vx * vx + vz * vz));
  const closestX = a.x + vx * t, closestZ = a.z + vz * t;
  const horizontal = Math.hypot(closestX - hazard.x, closestZ - hazard.z);
  const minY = Math.min(a.minY, b.minY), maxY = Math.max(a.maxY, b.maxY);
  return horizontal < Math.max(a.radius, b.radius) + hazard.radius && maxY > hazard.minY && minY < hazard.maxY;
}

function buildFiniteScore(score = RINGING_SCORE) {
  let atMs = 0, rowIndex = 0, stroke = 'hand';
  const strikes = [], rows = [], sections = [];
  const tenor = score.find((entry) => entry.type === 'toll') || { id: 'tenor-awakens', bell: 8, strokes: 4 };
  for (let index = 0; index < tenor.strokes; index++) {
    strikes.push({ bell: tenor.bell, stroke: index % 2 ? 'back' : 'hand', rowIndex: -1, place: 7, atMs: atMs + 720, section: tenor.id });
    atMs += 1780;
  }
  const tenorEndMs = atMs;
  for (const section of score.filter((entry) => entry.type === 'rows')) {
    const startMs = atMs;
    for (const row of section.source) {
      const scheduled = scheduleRow(row, stroke, atMs, rowIndex);
      strikes.push(...scheduled.strikes.map((strike) => ({ ...strike, section: section.id })));
      rows.push({ row: [...row], rowIndex, stroke, atMs, section: section.id });
      atMs = scheduled.nextRowAtMs; rowIndex += 1; stroke = otherStroke(stroke);
    }
    sections.push({ id: section.id, startMs, endMs: atMs });
  }
  return { strikes, rows, sections, tenorEndMs, endMs: atMs, nextRowIndex: rowIndex, nextStroke: stroke };
}

function buildRows(source, section, startMs, rowIndex, stroke) {
  let atMs = startMs;
  const strikes = [], rows = [];
  for (const row of source) {
    const scheduled = scheduleRow(row, stroke, atMs, rowIndex);
    strikes.push(...scheduled.strikes.map((strike) => ({ ...strike, section })));
    rows.push({ row: [...row], rowIndex, stroke, atMs, section });
    atMs = scheduled.nextRowAtMs; rowIndex += 1; stroke = otherStroke(stroke);
  }
  return { strikes, rows, endMs: atMs, nextRowIndex: rowIndex, nextStroke: stroke };
}

function buildClosing(startMs, rowIndex, stroke) {
  const result = buildRows(rounds(8, 2), 'closing-rounds', startMs, rowIndex, stroke);
  return { ...result, startMs, standAtMs: result.endMs + BELL_STAND_SETTLE_MS };
}

function defaultBellLayout() {
  return ELLERY_BELLS.map((bell, index) => ({
    ...bell,
    pivot: { x: (index % 4 - 1.5) * 2.1, y: 2.1, z: (Math.floor(index / 4) - .5) * 2.9 },
    visualScale: .80 + index * .03,
    sweepRadius: 1.02 * (.80 + index * .03),
  }));
}

export function createBellTowerRuntime({
  score = RINGING_SCORE,
  bells = defaultBellLayout(),
  audio = null,
  emitAcousticEvent = () => {},
  onCollision = () => {},
  onCleared = () => {},
  now = () => performance.now(),
} = {}) {
  const finite = buildFiniteScore(score);
  const holdingSection = score.find((entry) => entry.type === 'loop');
  const holdingSource = holdingSection?.source || [];
  const rowsPerCourse = holdingSource.length;
  let timeline = [...finite.strikes], rowTimeline = [...finite.rows];
  let perBell = Array.from({ length: bells.length }, () => []);
  let holdingEndMs = finite.endMs;
  let holdingNextRowIndex = finite.nextRowIndex, holdingNextStroke = finite.nextStroke;
  let holdingCourseMs = 0;
  let state = BELL_TOWER_RUNTIME_STATE.IDLE, startedAt = 0, startOffsetMs = 0, previousElapsed = 0;
  let audioCursor = 0, acousticCursor = 0, closing = null, stopRequestedAt = null, clearedSent = false;
  let shutters = 0, retry = false, currentSection = 'idle', currentRow = -1;
  let relayInterruptions = 0, lastRelayInterruptionAt = -Infinity;
  const renderCache=[];
  const hazardCache=[];
  const pointScratch=new Float32Array(3);
  const poseCache=bells.map(()=>({angle:0,clapperAngle:0,stroke:null,phase:0,motion:{},curve:{phase:0,direction:1,balanceHold:.08,strikePhase:.54}}));
  const snapshotCache={
    state:BELL_TOWER_RUNTIME_STATE.IDLE,retry:false,elapsedMs:0,scoreSection:'idle',scoreRow:-1,
    shutters:0,stopAvailable:false,stopAvailableAtMs:null,
    relayInterruptions:0,relayInterruptionsRequired:RELAY_INTERRUPT_REQUIRED,
    relayWindowOpen:false,relayWindowPhase:0,relayWindowOpensInMs:0,relayWindowClosesInMs:0,
    activeBellAngles:new Array(bells.length).fill(0),scheduledStrikeCount:0,
  };
  let poseCacheAt=Number.NaN;
  for(const bell of bells){
    for(const [part,mesh] of [
      ['bell',`tower_bell_${String(bell.id).padStart(2,'0')}`],
      ['wheel',`tower_wheel_${String(bell.id).padStart(2,'0')}`],
      ['clapper',`tower_clapper_${String(bell.id).padStart(2,'0')}`],
      ['stay',`tower_stay_${String(bell.id).padStart(2,'0')}`],
      ['slider',`tower_slider_${String(bell.id).padStart(2,'0')}`],
    ])renderCache.push({id:`tower-${part}-${bell.id}`,mesh,matrix:new Float32Array(16),zone:12,structural:true,bell,part});
    hazardCache.push({id:`bell-${bell.id}:casting`,bell:bell.id,component:'casting',kind:'capsule'});
    for(let segment=0;segment<8;segment++)hazardCache.push({id:`bell-${bell.id}:wheel-${segment}`,bell:bell.id,component:'wheel',segment,kind:'obb',halfExtents:new Float32Array(2)});
    hazardCache.push({id:`bell-${bell.id}:clapper`,bell:bell.id,component:'clapper',kind:'capsule'});
    hazardCache.push({id:`bell-${bell.id}:stay`,bell:bell.id,component:'stay',kind:'capsule'});
    hazardCache.push({id:`bell-${bell.id}:slider`,bell:bell.id,component:'slider',kind:'obb',halfExtents:new Float32Array(2)});
  }

  function rebuildPerBell() {
    perBell = Array.from({ length: bells.length }, () => []);
    for (const strike of timeline) if (perBell[strike.bell - 1]) perBell[strike.bell - 1].push(strike);
  }
  rebuildPerBell();

  function resetTimeline() {
    timeline = [...finite.strikes]; rowTimeline = [...finite.rows];
    holdingEndMs = finite.endMs; holdingNextRowIndex = finite.nextRowIndex; holdingNextStroke = finite.nextStroke;
    holdingCourseMs = 0; closing = null;
    rebuildPerBell();
  }

  function appendHoldingCourse() {
    if (!holdingSource.length || closing) return false;
    const course = buildRows(holdingSource, holdingSection.id, holdingEndMs, holdingNextRowIndex, holdingNextStroke);
    timeline.push(...course.strikes); rowTimeline.push(...course.rows);
    for (const strike of course.strikes) if (perBell[strike.bell - 1]) perBell[strike.bell - 1].push(strike);
    const duration = course.endMs - holdingEndMs;
    if (!holdingCourseMs) holdingCourseMs = duration;
    holdingEndMs = course.endMs; holdingNextRowIndex = course.nextRowIndex; holdingNextStroke = course.nextStroke;
    return true;
  }

  function ensureHoldingThrough(targetMs) {
    while (!closing && holdingEndMs <= targetMs && appendHoldingCourse()) { /* bounded by target */ }
  }

  function currentElapsed() { return state === BELL_TOWER_RUNTIME_STATE.IDLE ? 0 : Math.max(0, now() - startedAt + startOffsetMs); }

  function createClosing(elapsed) {
    if (closing) return;
    if (!holdingCourseMs && holdingSource.length) appendHoldingCourse();
    const completedCourses = holdingCourseMs > 0 ? Math.max(0, Math.ceil((elapsed - finite.endMs) / holdingCourseMs)) : 0;
    const boundary = finite.endMs + completedCourses * holdingCourseMs;
    ensureHoldingThrough(boundary + 1);
    const rowIndex = finite.nextRowIndex + completedCourses * rowsPerCourse;
    const stroke = strokeAfterRows(finite.nextStroke, completedCourses * rowsPerCourse);
    closing = buildClosing(boundary, rowIndex, stroke);
    timeline = timeline.filter((strike) => strike.atMs < boundary).concat(closing.strikes);
    rowTimeline = rowTimeline.filter((row) => row.atMs < boundary).concat(closing.rows);
    rebuildPerBell();
    audioCursor = Math.min(audioCursor, timeline.length);
    acousticCursor = Math.min(acousticCursor, timeline.length);
  }

  function createRelayClosing(elapsed) {
    if (closing) return;
    const nextIndex = upperBound(rowTimeline, elapsed + 900);
    const next = rowTimeline[nextIndex];
    const boundary = Math.max(elapsed + 900, Number(next?.atMs) || 0);
    const rowIndex = Number.isFinite(next?.rowIndex) ? next.rowIndex : Math.max(0, currentRow + 1);
    const stroke = next?.stroke || (rowIndex % 2 ? 'back' : 'hand');
    closing = buildClosing(boundary, rowIndex, stroke);
    timeline = timeline.filter((strike) => strike.atMs < boundary).concat(closing.strikes);
    rowTimeline = rowTimeline.filter((row) => row.atMs < boundary).concat(closing.rows);
    rebuildPerBell();
    audioCursor = lowerBound(timeline, elapsed - LATE_AUDIO_GRACE_MS);
    acousticCursor = lowerBound(timeline, elapsed - LATE_AUDIO_GRACE_MS);
  }

  function emitStrike(record) {
    const bell = bells[record.bell - 1];
    emitAcousticEvent({
      kind: 'bell_change_strike',
      source: { kind: 'surfer', id: `tower-bell-${record.bell}` },
      spatial: { areaId: 'bell_tower', roomId: 'bell_tower', position: { x: bell?.pivot?.x || 0, y: bell?.pivot?.z || 0 } },
      semantics: { audibleToHush: true, audibleToMonitor: true, audibleInWorld: true, canBeMimicked: false, canSpoilTake: false, family: 'bell', tags: [record.stroke, `row:${record.rowIndex}`, `place:${record.place}`] },
      provenance: { system: 'bell-tower', bell: record.bell, stroke: record.stroke, rowIndex: record.rowIndex, place: record.place },
    });
  }

  function scheduleStrikes(elapsed) {
    const lookAheadMs = SCHEDULE_AHEAD_SEC * 1000;
    if (elapsed - previousElapsed > RESUME_SKIP_MS) {
      audioCursor = lowerBound(timeline, elapsed - LATE_AUDIO_GRACE_MS);
      acousticCursor = lowerBound(timeline, elapsed - LATE_AUDIO_GRACE_MS);
    }
    while (audioCursor < timeline.length && timeline[audioCursor].atMs <= elapsed + lookAheadMs) {
      const record = timeline[audioCursor++];
      if (record.atMs >= elapsed - LATE_AUDIO_GRACE_MS) {
        audio?.strike?.(record, bells[record.bell - 1], { delaySec: Math.max(0, (record.atMs - elapsed) / 1000) });
      }
    }
    while (acousticCursor < timeline.length && timeline[acousticCursor].atMs <= elapsed) emitStrike(timeline[acousticCursor++]);
  }

  function poseFor(bell, elapsed, out) {
    if ([BELL_TOWER_RUNTIME_STATE.IDLE, BELL_TOWER_RUNTIME_STATE.CLEARED].includes(state)){out.angle=0;out.clapperAngle=0;out.stroke=null;out.phase=0;return out;}
    const motion = bellMotionPhaseAt(perBell[bell.id - 1], elapsed, bell.strikePhase, out.motion);
    if (!motion){out.angle=0;out.clapperAngle=0;out.stroke=null;out.phase=0;return out;}
    const direction = motion.record.stroke === 'hand' ? 1 : -1;
    const curve=out.curve;curve.phase=motion.phase;curve.direction=direction;curve.balanceHold=bell.balanceHold;curve.strikePhase=bell.strikePhase;
    const angle = fullCircleBellCurve(curve);
    const clapperLag = motion.phase <= bell.strikePhase
      ? Math.sin(Math.PI * motion.phase / Math.max(.001, bell.strikePhase)) * .18
      : -Math.sin(Math.PI * (motion.phase - bell.strikePhase) / Math.max(.001, 1 - bell.strikePhase)) * .10;
    out.angle=angle;out.clapperAngle=angle-direction*clapperLag;out.stroke=motion.record;out.phase=motion.phase;return out;
  }
  function updatePoseCache(elapsed){
    if(elapsed===poseCacheAt)return poseCache;
    for(let i=0;i<bells.length;i++)poseFor(bells[i],elapsed,poseCache[i]);
    poseCacheAt=elapsed;return poseCache;
  }

  function hazardVolumes(elapsed = currentElapsed()) {
    let cursor=0;
    updatePoseCache(elapsed);
    for(let bellIndex=0;bellIndex<bells.length;bellIndex++){
      const bell=bells[bellIndex],pose=poseCache[bellIndex],s=bell.visualScale||1,moving=!!pose.stroke;
      const casting=hazardCache[cursor++];writeComponentPoint(pointScratch,bell,pose.angle,0,-.58*s,0);
      casting.moving=moving;casting.x=pointScratch[0];casting.z=pointScratch[2];casting.minY=pointScratch[1]-.58*s;casting.maxY=pointScratch[1]+.58*s;casting.radius=.62*s;casting.angle=pose.angle;
      for(let segment=0;segment<8;segment++){
        const wheel=hazardCache[cursor++],theta=segment*Math.PI/4;writeComponentPoint(pointScratch,bell,pose.angle+theta,1.02*s,0,.16*s);
        wheel.moving=moving;wheel.x=pointScratch[0];wheel.z=pointScratch[2];wheel.minY=pointScratch[1]-.17*s;wheel.maxY=pointScratch[1]+.17*s;wheel.radius=.18*s;wheel.angle=pose.angle+theta;wheel.halfExtents[0]=.32*s;wheel.halfExtents[1]=.10*s;
      }
      const clapper=hazardCache[cursor++];writeComponentPoint(pointScratch,bell,pose.clapperAngle,0,-.76*s,0);
      clapper.moving=moving;clapper.x=pointScratch[0];clapper.z=pointScratch[2];clapper.minY=pointScratch[1]-.62*s;clapper.maxY=pointScratch[1]+.62*s;clapper.radius=.14*s;clapper.angle=pose.clapperAngle;
      const stay=hazardCache[cursor++];writeComponentPoint(pointScratch,bell,pose.angle,0,.66*s,.18*s);
      stay.moving=moving;stay.x=pointScratch[0];stay.z=pointScratch[2];stay.minY=pointScratch[1]-.62*s;stay.maxY=pointScratch[1]+.62*s;stay.radius=.13*s;stay.angle=pose.angle;
      const slider=hazardCache[cursor++],slide=.42*Math.sin(pose.angle);writeComponentPoint(pointScratch,bell,0,slide*s,1.34*s,.20*s);
      slider.moving=moving;slider.x=pointScratch[0];slider.z=pointScratch[2];slider.minY=pointScratch[1]-.10*s;slider.maxY=pointScratch[1]+.10*s;slider.radius=.20*s;slider.angle=bell.frameYaw||0;slider.halfExtents[0]=.48*s;slider.halfExtents[1]=.10*s;
    }
    return hazardCache;
  }

  function tick(_dt, playerSweep = null) {
    if ([BELL_TOWER_RUNTIME_STATE.IDLE, BELL_TOWER_RUNTIME_STATE.CLEARED].includes(state)) return snapshot();
    const elapsed = currentElapsed();
    ensureHoldingThrough(elapsed + SCHEDULE_AHEAD_SEC * 1000 + 1200);
    if (stopRequestedAt != null) createRelayClosing(elapsed);
    if (!closing) state = elapsed < finite.tenorEndMs ? BELL_TOWER_RUNTIME_STATE.TENOR : BELL_TOWER_RUNTIME_STATE.RINGING;
    else state = BELL_TOWER_RUNTIME_STATE.STOP_REQUESTED;
    scheduleStrikes(elapsed);
    const rowIndex = upperBound(rowTimeline, elapsed) - 1;
    const row = rowTimeline[rowIndex];
    currentSection = row?.section || (elapsed < finite.tenorEndMs ? 'tenor-awakens' : 'rounds');
    currentRow = row?.rowIndex ?? -1;

    if (playerSweep) {
      const current = playerSweep.current || playerSweep;
      const previous = playerSweep.previous || current;
      for (const hazard of hazardVolumes(elapsed)) {
        if (hazard.moving && sweptCapsuleIntersectsHazard(previous, current, hazard)) { onCollision({ hazardId: hazard.id }); break; }
      }
    }

    if (stopRequestedAt != null) {
      shutters = clamp01((elapsed - stopRequestedAt) / 6000);
      audio?.setShutters?.(shutters);
    }
    if (closing && elapsed >= closing.standAtMs) {
      state = BELL_TOWER_RUNTIME_STATE.STANDING;
      if (shutters >= 1 && !clearedSent) {
        clearedSent = true; state = BELL_TOWER_RUNTIME_STATE.CLEARED; audio?.stand?.(); onCleared();
      }
    }
    previousElapsed = elapsed;
    return snapshot();
  }

  function renderInstances() {
    const elapsed=currentElapsed();
    updatePoseCache(elapsed);
    for(const entry of renderCache){
      const pose=poseCache[entry.bell.id-1],s=entry.bell.visualScale||1,angle=entry.part==='clapper'?pose.clapperAngle:entry.part==='slider'?0:pose.angle;
      const sliderOffset=entry.part==='slider' ? .42*Math.sin(pose.angle)*s : 0;
      writePivotMatrix(entry.matrix,entry.bell.pivot,entry.bell.frameYaw||0,angle,s,sliderOffset);
    }
    return renderCache;
  }

  function start({ retry: nextRetry = false, offsetMs = 0, interventions = 0 } = {}) {
    retry = !!nextRetry; startOffsetMs = Math.max(0, Number(offsetMs) || 0);
    resetTimeline();
    state = startOffsetMs < finite.tenorEndMs ? BELL_TOWER_RUNTIME_STATE.TENOR : BELL_TOWER_RUNTIME_STATE.RINGING;
    startedAt = now(); previousElapsed = startOffsetMs; stopRequestedAt = null; shutters = 0; clearedSent = false;poseCacheAt=Number.NaN;
    relayInterruptions = Math.max(0, Math.min(RELAY_INTERRUPT_REQUIRED, Math.floor(Number(interventions) || 0)));
    lastRelayInterruptionAt = -Infinity;
    currentSection = startOffsetMs < finite.tenorEndMs ? 'tenor-awakens' : 'rounds'; currentRow = -1;
    ensureHoldingThrough(startOffsetMs + SCHEDULE_AHEAD_SEC * 1000 + 1200);
    audioCursor = lowerBound(timeline, startOffsetMs - LATE_AUDIO_GRACE_MS);
    acousticCursor = lowerBound(timeline, startOffsetMs - LATE_AUDIO_GRACE_MS);
    audio?.start?.({ retry, offsetMs: startOffsetMs });
    return snapshot();
  }

  function interruptRelay() {
    if ([BELL_TOWER_RUNTIME_STATE.IDLE, BELL_TOWER_RUNTIME_STATE.CLEARED].includes(state)) {
      return { ok: false, reason: 'inactive' };
    }
    if (relayInterruptions >= RELAY_INTERRUPT_REQUIRED) {
      return { ok: true, complete: true, count: relayInterruptions };
    }
    const elapsed = currentElapsed();
    const window = relayInterventionWindowAt(elapsed);
    if (!window.open) return { ok: false, reason: 'unsafe', ...window };
    if (elapsed - lastRelayInterruptionAt < RELAY_INTERRUPT_GUARD_MS) {
      return { ok: false, reason: 'already-cut', ...window };
    }
    relayInterruptions += 1;
    lastRelayInterruptionAt = elapsed;
    return {
      ok: true,
      complete: relayInterruptions >= RELAY_INTERRUPT_REQUIRED,
      count: relayInterruptions,
      required: RELAY_INTERRUPT_REQUIRED,
      ...window,
    };
  }

  function requestStop() {
    const elapsed = currentElapsed();
    if (relayInterruptions < RELAY_INTERRUPT_REQUIRED) {
      return {
        ok: false,
        reason: 'relay-live',
        count: relayInterruptions,
        required: RELAY_INTERRUPT_REQUIRED,
      };
    }
    if (stopRequestedAt == null) { stopRequestedAt = elapsed; createRelayClosing(elapsed); audio?.releaseShutters?.(); }
    return { ok: true };
  }

  function stopImmediately() { audio?.cut?.(); state = BELL_TOWER_RUNTIME_STATE.IDLE;poseCacheAt=Number.NaN; }
  function reset() { stopImmediately(); closing = null; stopRequestedAt = null; shutters = 0; audioCursor = 0; acousticCursor = 0;poseCacheAt=Number.NaN; }
  function destroy() { reset(); audio?.destroy?.(); }
  function snapshot() {
    const elapsed = currentElapsed();
    updatePoseCache(elapsed);
    const relayWindow=relayInterventionWindowAt(elapsed);
    snapshotCache.state=state;snapshotCache.retry=retry;snapshotCache.elapsedMs=elapsed;snapshotCache.scoreSection=currentSection;snapshotCache.scoreRow=currentRow;snapshotCache.shutters=shutters;
    snapshotCache.stopAvailable=relayInterruptions>=RELAY_INTERRUPT_REQUIRED;snapshotCache.stopAvailableAtMs=null;snapshotCache.scheduledStrikeCount=timeline.length;
    snapshotCache.relayInterruptions=relayInterruptions;snapshotCache.relayInterruptionsRequired=RELAY_INTERRUPT_REQUIRED;
    snapshotCache.relayWindowOpen=relayWindow.open;snapshotCache.relayWindowPhase=relayWindow.phase;
    snapshotCache.relayWindowOpensInMs=relayWindow.opensInMs;snapshotCache.relayWindowClosesInMs=relayWindow.closesInMs;
    for(let i=0;i<poseCache.length;i++)snapshotCache.activeBellAngles[i]=poseCache[i].angle;
    return snapshotCache;
  }
  const timing = () => ({
    finiteEndMs: finite.endMs,
    tenorEndMs: finite.tenorEndMs,
    holdingCourseMs,
    rowsPerCourse,
    relayCycleMs: RELAY_INTERRUPT_CYCLE_MS,
    relayLeadInMs: RELAY_INTERRUPT_LEAD_IN_MS,
    relayInterruptionsRequired: RELAY_INTERRUPT_REQUIRED,
  });
  return {
    start, tick, interruptRelay, requestStop, stopImmediately, reset, destroy, renderInstances, hazardVolumes, timing,
    maskingDb: () => audio?.maskingDb?.() || (state === BELL_TOWER_RUNTIME_STATE.RINGING ? 18 : 0),
    isRinging: () => [BELL_TOWER_RUNTIME_STATE.TENOR, BELL_TOWER_RUNTIME_STATE.RINGING, BELL_TOWER_RUNTIME_STATE.STOP_REQUESTED].includes(state),
    state: () => state,
    snapshot,
  };
}
