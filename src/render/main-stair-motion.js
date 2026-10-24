// A render-only step for the main open-well stair. Collision and the active
// movement clock belong to main.js; sampling this object never advances either.
// Coordinates are the same runtime physical coordinates supplied to r3dFrame.
// floorH is in metres, not runtime cells. No look input, pitch or bob lives here.
export const MAIN_STAIR_MOTION = Object.freeze({
  horizontalSpeedMps: 1.35,
  verticalSpeedMps: .42,
  minimumDurationMs: 80,
  contactPhase: .8,
});

const clampPhase = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothRise = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
};
const positive = (value, label) => {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
  return value;
};

function poseCopy(pose, label) {
  if (!pose || typeof pose !== 'object') throw new TypeError(`${label} pose is required`);
  const copy = {
    x: finite(pose.x, `${label}.x`),
    z: finite(pose.z, `${label}.z`),
    floorH: finite(pose.floorH, `${label}.floorH`),
    yawOffset: finite(pose.yawOffset ?? 0, `${label}.yawOffset`),
  };
  if (pose.arc) {
    if (pose.arc.id == null) throw new TypeError(`${label}.arc.id is required`);
    copy.arc = Object.freeze({
      id: pose.arc.id,
      cx: finite(pose.arc.cx, `${label}.arc.cx`),
      cz: finite(pose.arc.cz, `${label}.arc.cz`),
    });
  }
  return Object.freeze(copy);
}

/**
 * from/to: {x,z,floorH,yawOffset,arc?:{id,cx,cz}}.
 * Give contiguous helical treads the same arc id; omit arc on flat aprons.
 * unitsPerMetre converts runtime coordinates, while floorH is already metres.
 * paceScale retains the ordinary quiet/carry multiplier without changing path.
 *
 * A portal may change the logical look frame by logicalFrameTurn. The caller
 * must apply that frame turn immediately to both live and target logical yaw.
 * We re-express the old offset in that new frame, preserving the starting world
 * bearing. yawOffset may be unwrapped; consume it through sin/cos as usual.
 */
export function createMainStairMotionStep({
  from,
  to,
  unitsPerMetre = 2,
  paceScale = 1,
  logicalFrameTurn = 0,
  horizontalSpeedMps = MAIN_STAIR_MOTION.horizontalSpeedMps,
  verticalSpeedMps = MAIN_STAIR_MOTION.verticalSpeedMps,
  durationMs,
} = {}) {
  const a = poseCopy(from, 'from'), b = poseCopy(to, 'to');
  positive(unitsPerMetre, 'unitsPerMetre');
  positive(paceScale, 'paceScale');
  positive(horizontalSpeedMps, 'horizontalSpeedMps');
  positive(verticalSpeedMps, 'verticalSpeedMps');
  finite(logicalFrameTurn, 'logicalFrameTurn');

  let polar = null;
  if (a.arc && b.arc && a.arc.id === b.arc.id
    && Math.abs(a.arc.cx - b.arc.cx) < 1e-8
    && Math.abs(a.arc.cz - b.arc.cz) < 1e-8) {
    const cx = a.arc.cx, cz = a.arc.cz;
    const radius0 = Math.hypot(a.x - cx, a.z - cz);
    const radius1 = Math.hypot(b.x - cx, b.z - cz);
    if (radius0 < 1e-8 || radius1 < 1e-8)
      throw new RangeError('a helical pose cannot stand at its arc centre');
    const angle0 = Math.atan2(a.x - cx, -(a.z - cz));
    const angle1 = Math.atan2(b.x - cx, -(b.z - cz));
    polar = Object.freeze({cx,cz,radius0,radius1,angle0,sweep:angleDelta(angle0,angle1)});
  }

  // Integrate the actual polar path once. A diagonal lane change is a short
  // spiral rather than its chord; frame sampling does no integration or work
  // proportional to tread count. Simpson's rule is ample at a single tread.
  let horizontalDistance;
  if (polar) {
    const dr = polar.radius1 - polar.radius0;
    const speed = (t) => Math.hypot(dr, lerp(polar.radius0,polar.radius1,t) * polar.sweep);
    let sum = speed(0) + speed(1);
    for (let i=1;i<8;i++) sum += (i%2 ? 4 : 2)*speed(i/8);
    horizontalDistance = sum/24;
  } else horizontalDistance = Math.hypot(b.x-a.x,b.z-a.z);
  const horizontalDistanceM = horizontalDistance/unitsPerMetre;
  const verticalDistanceM = Math.abs(b.floorH-a.floorH);
  const naturalDurationMs = Math.max(MAIN_STAIR_MOTION.minimumDurationMs,
    1000*horizontalDistanceM/horizontalSpeedMps,
    1000*verticalDistanceM/verticalSpeedMps)*paceScale;
  const resolvedDurationMs = durationMs == null
    ? naturalDurationMs : positive(durationMs,'durationMs');
  const yaw0 = a.yawOffset-logicalFrameTurn;
  return Object.freeze({
    from:a,to:b,polar,
    durationMs:resolvedDurationMs,
    horizontalDistanceM,verticalDistanceM,
    yaw0,yawSweep:angleDelta(yaw0,b.yawOffset),
    contactPhase:MAIN_STAIR_MOTION.contactPhase,
  });
}

/** Same phase resolves path, rise and bearing. The caller owns active time. */
export function sampleMainStairMotion(step, phase = 0) {
  const t = clampPhase(phase), {from:a,to:b,polar:p} = step;
  let x, z;
  if (t === 0) { x=a.x; z=a.z; }
  else if (t === 1) { x=b.x; z=b.z; }
  else if (p) {
    const angle=p.angle0+p.sweep*t,radius=lerp(p.radius0,p.radius1,t);
    x=p.cx+Math.sin(angle)*radius;
    z=p.cz-Math.cos(angle)*radius;
  } else { x=lerp(a.x,b.x,t); z=lerp(a.z,b.z,t); }
  return {
    x,z,
    floorH:lerp(a.floorH,b.floorH,smoothRise(t)),
    yawOffset:step.yaw0+step.yawSweep*t,
    phase:t,
    contactReached:t>=step.contactPhase,
    complete:t===1,
  };
}

// A dropped frame can cross contact and completion together. One comparison
// still produces one contact; a frozen/repeated sample produces none.
export function mainStairContactCrossed(previousPhase, phase, contactPhase=MAIN_STAIR_MOTION.contactPhase) {
  const before=clampPhase(previousPhase),after=clampPhase(phase);
  return before<contactPhase&&after>=contactPhase;
}
