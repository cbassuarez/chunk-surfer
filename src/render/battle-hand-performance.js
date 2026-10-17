// Animation samples use the combat clock directly. An eased HUD progress is
// unsuitable here: it moves the finger contact ahead of the resolved action.
const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, Number(n) || 0));
const smooth = n => { const t = clamp(n); return t * t * (3 - 2 * t); };
function pulse(t, start, contact, release, end) {
  if (t < start || t >= end) return 0;
  if (t < contact) return smooth((t - start) / (contact - start));
  if (t <= release) return 1;
  return 1 - smooth((t - release) / (end - release));
}

export function battleHandReach(amount) {
  const progress = clamp(amount);
  return { progress, cameraArc: Math.sin(Math.PI * progress) * .14,
    closure: smooth(Math.min(1, progress * 2)) };
}

export function battleHandPerformance(frame = {}) {
  const injury = ({ steady: 0, hurt: 1, wounded: 2, critical: 3 })[frame.injury] || 0;
  const reduced = !!frame.reducedMotion;
  const time = Number(frame.now ?? frame.time) || 0;
  const raw = clamp(frame.rawProgress ?? frame.progress ?? frame.resolveProgress);
  const actor = frame.actionActor;
  const action = String(frame.move || '').toLowerCase();
  const player = actor === 'player';
  const guardAction = player && ['hold', 'spanner-guard', 'parry'].includes(action);
  // SELF is a voice, a breath, or a defensive palm. The recordist has no
  // unarmed punch action; tool identity alone must never invent one.
  const handling = !player ? frame.brace ? 'guard' : 'idle'
    : guardAction ? 'guard'
      : action === 'steady-hands' && frame.tool === 'coffee' ? 'drink'
        : action === 'swing' && frame.tool === 'spanner' ? 'strike'
          : action === 'tune' && frame.tool === 'fork' ? 'tune'
            : action === 'compose' ? 'breathe'
              : action === 'shout' ? 'voice'
                : action === 'listen' ? 'listen'
                  : ['put-it-down', 'end-tempo'].includes(action) ? 'release'
                    : action && action !== 'wait' && frame.tool !== 'self' ? 'operate' : 'idle';
  const operates = !['idle', 'guard', 'listen', 'release'].includes(handling);
  const strike = ['strike', 'tune'].includes(handling);
  const operation = operates ? pulse(raw, 0, .28, .37, .86) : 0;
  const parry = frame.parry;
  const elapsed = Number(frame.actionElapsed) || 0;
  const contact = Number(parry?.impactSeconds) || 60 / 168 * 2.5;
  const release = Number(parry?.contactEnds) || contact + 60 / 168 * .25;
  const turned = parry?.parried === true || parry?.phase === 'turned';
  const intercept = parry && actor === 'enemy' && turned
    ? pulse(elapsed, Math.max(0, contact - .28), contact, release, release + .3) : 0;
  const guardStrength = frame.brace ? 1 : guardAction ? pulse(raw, 0, .16, .70, 1) : 0;
  const guard = guardStrength > 0;
  // The visible hit flash ends first. The hands retain the protective recoil
  // briefly, then recover into the persistent injury pose on the same clock.
  const hitRecovery = frame.hurtAge != null && Number.isFinite(Number(frame.hurtAge))
    ? 1 - smooth((Math.max(0, Number(frame.hurtAge)) - .06) / .64) : 0;
  const flinch = Math.max(clamp(frame.hurt), hitRecovery);
  const wounded = Math.max(0, injury - 1) / 2;
  const breath = reduced ? 0 : Math.sin(time * 1.4);
  // Grip fingers never inherit this tremor: the entire tool and its gripping
  // wrist form one transform, so recoil cannot shear their points of contact.
  const tremor = reduced ? 0 : injury * .0007 * Math.sin(time * (8 + injury))
    + wounded * .0008 * Math.sin(time * 17.3);
  const prepare = operates ? pulse(raw, 0, .10, .15, .28) : 0;
  const listening = handling === 'listen' ? pulse(raw, 0, .16, .65, 1) : 0;
  const aim = frame.tool === 'torch' && handling === 'operate' ? operation : 0;
  const toolGuard = frame.tool === 'spanner' ? guardStrength : 0;
  const fingers = [.25, .33, .40, .46].map((base, i) => {
    const relaxed = handling === 'breathe' ? 1 - operation * .45 : 1;
    const painCurl = injury * (.055 + i * .025) + wounded * (.14 + i * .075);
    const spasm = reduced ? 0 : wounded * .035 * Math.sin(time * 4.7 - i * .8);
    const resting = base * relaxed + painCurl + spasm;
    const defensive = .12 + i * .045;
    const protect = Math.max(guardStrength, intercept);
    const curl = resting * (1 - protect) + defensive * protect + flinch * (.52 + i * .065);
    const tension = Math.max(protect, flinch, wounded);
    return [clamp(curl, 0, 1.25), clamp(curl * (1.15 + tension * .03) + .08, 0, 1.55),
      clamp(curl * (.65 + tension * .01) + .04, 0, 1.05)];
  });
  const protect = Math.max(guardStrength, intercept);
  const speaking = handling === 'voice' ? operation : 0;
  const breathing = handling === 'breathe' ? operation : 0;
  return {
    injury, operation, prepare, handling, strike, guard, guardStrength, flinch, intercept,
    // Reduced motion keeps actual contact and defensive poses. Only continuous
    // drift, recoil travel and tremor are removed.
    travel: reduced ? 0 : 1,
    leftOffset: [tremor + injury * .008 + guardStrength * .025 + intercept * .105 - flinch * .035 + speaking * .035 - breathing * .025 - listening * .025,
      breath * .0012 + injury * .004 + guardStrength * .055 + intercept * .065 + flinch * .037 + speaking * .055 + breathing * .020 + listening * .065,
      injury * .008 + guardStrength * .012 + intercept * .028 + flinch * .055 + speaking * .045 + listening * .035],
    toolOffset: [tremor * .5 + injury * .004 + protect * .018 + flinch * .026 - operation * .015 - aim * .04 - toolGuard * .06,
      breath * .0006 - injury * .007 - protect * .024 - flinch * .038 + operation * .018 - prepare * .009 + aim * .025 + toolGuard * .085,
      injury * .006 + protect * .016 + flinch * .035 + prepare * .012 - aim * .015 - toolGuard * .025],
    toolRotation: [injury * .045 + protect * .10 - flinch * .32 - aim * .95,
      injury * .025 + flinch * .18, -injury * .055 + protect * .13 + flinch * .32 + toolGuard * .55],
    leftRotation: [-.45 + injury * .10 + guardStrength * .19 - intercept * .35 + flinch * .65 - speaking * .25 - breathing * .15,
      Math.PI - .50 - injury * .10 + guardStrength * .34 + intercept * .23 - flinch * .38 - speaking * .45 - breathing * .30 - listening * .5,
      .32 + injury * .15 - guardStrength * .16 + intercept * .86 - flinch * .55 - speaking * .35 - breathing * .25 - listening * .5],
    leftFingers: Object.fromEntries(['index', 'middle', 'ring', 'pinky'].map((name, i) => [name, fingers[i]])),
    spread: { index: -.035 - protect * .09, middle: 0 - protect * .02,
      ring: .025 + protect * .035, pinky: .05 + protect * .08 },
    thumb: { opposition: .32 + injury * .10 - protect * .10 + flinch * .40,
      abduction: .18 + protect * .16 - flinch * .10,
      mcp: .18 + injury * .06 + flinch * .30, ip: .12 + injury * .035 + flinch * .30 },
    control: handling === 'drink' ? 'drink' : handling === 'tune' ? 'strike'
      : action === 'invert' ? 'invert' : action === 'radio-decoy' ? 'transmit'
        : ['monitor', 'master-take'].includes(action) ? 'rec'
          : /stop|hold/.test(action) ? 'stop' : /play|take|rewind/.test(action) ? 'takes'
          : /tune|scan|jam|feedback/.test(action) ? 'tune' : 'rec',
    rawProgress: raw,
  };
}

/** Pixel bounds stay in the existing stage; a fixed metric hand size is fitted
 * vertically. Widening a window changes separation, never finger proportions. */
export function battleHandFraming({ width, height, left, right } = {}) {
  const w = Math.max(1, Number(width) || 1), h = Math.max(1, Number(height) || 1);
  // A narrow aperture pulls the camera back uniformly so the 274 mm recorder
  // still fits; finger and palm proportions never change with window shape.
  const extent = Math.max(.30, .304 * h / w);
  const scale = extent / h;
  const point = (x, y) => [(x - w / 2) * scale, (h / 2 - y) * scale, 0];
  const l = left || { x: w * .14, y: h * .25, w: h * .8, h: h * .78 };
  const r = right || { x: w * .62, y: h * .32, w: h * .9, h: h * .7 };
  const leftWrist = point(l.x + l.w * .5, Math.min(h + h * .1, l.y + l.h * .97));
  const tool = point(r.x + r.w * .42, r.y + r.h * .36);
  // Keep both arms and the wide recorder inside narrow stages. This moves a
  // whole rigid assembly; it never scales the palm independently of its digits.
  const halfWidth = extent * w / h / 2;
  const toolHalf = .15;
  tool[0] = clamp(tool[0], -Math.max(0, halfWidth - toolHalf), Math.max(0, halfWidth - toolHalf));
  leftWrist[0] = clamp(leftWrist[0], -Math.max(0, halfWidth - .065), Math.max(0, halfWidth - .065));
  return { extent, halfWidth, leftWrist, tool, scale };
}
