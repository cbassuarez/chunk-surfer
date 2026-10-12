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
  const intercept = parry && actor === 'enemy'
    ? pulse(elapsed, Math.max(0, contact - .28), contact, release, release + .3) : 0;
  const guardStrength = frame.brace ? 1 : guardAction ? pulse(raw, 0, .16, .70, 1) : 0;
  const guard = guardStrength > 0;
  const flinch = clamp(frame.hurt);
  const breath = reduced ? 0 : Math.sin(time * 1.4);
  // Grip fingers never inherit this tremor: the entire tool and its gripping
  // wrist form one transform, so recoil cannot shear their points of contact.
  const tremor = reduced ? 0 : injury * .00035 * Math.sin(time * (8 + injury));
  const fingers = [.25, .33, .40, .46].map((base, i) => {
    const relaxed = handling === 'breathe' ? 1 - operation * .45 : 1;
    const curl = base * relaxed * (1 - guardStrength * .35) + injury * (.035 + i * .012) + flinch * .22;
    return [clamp(curl, 0, 1.2), clamp(curl * 1.15 + .08, 0, 1.45), clamp(curl * .65 + .04, 0, .9)];
  });
  return {
    injury, operation, handling, strike, guard, guardStrength, flinch, intercept,
    // Reduced motion keeps actual contact and defensive poses. Only continuous
    // drift, recoil travel and tremor are removed.
    travel: reduced ? 0 : 1,
    leftOffset: [tremor - flinch * .014, breath * .0012 - flinch * .012, flinch * .008],
    toolOffset: [tremor * .5, breath * .0006 - flinch * .006, 0],
    leftRotation: [-.45 + guardStrength * .19, Math.PI - .50 + guardStrength * .34 + flinch * .12, .32 - guardStrength * .16 + intercept * .24],
    leftFingers: Object.fromEntries(['index', 'middle', 'ring', 'pinky'].map((name, i) => [name, fingers[i]])),
    spread: { index: -.035, middle: 0, ring: .025, pinky: .05 },
    thumb: { opposition: .32 - guardStrength * .08, abduction: .18, mcp: .18 + flinch * .12, ip: .12 },
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
