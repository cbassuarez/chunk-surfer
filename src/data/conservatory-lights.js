// THE CONSERVATORY'S LIGHT, AUTHORED.
//
// Every practical in the building used to live in two hardcoded blocks inside
// `syncArchitecturalLocalLights` (main.js), keyed on render group. Two groups had
// light; seven spaces — basement, hall, chapel, foyer, plant, store, the dance
// wing — got an empty array and were lit by the torch and a 0.034 ambient
// constant alone. That is most of why the lighting read as unintentional: it was
// not inconsistent so much as absent, and there was nowhere to author it.
//
// ── WHAT AN INTENSITY MEANS ──────────────────────────────────────────────────
//
// The renderer's local lights are `intensity` × a radius-squared falloff
// (r3d.js: `pow(1 - d/radius, 2)`), with a hard cutoff at `radius`. The number is
// therefore only meaningful next to its KIND, which is why every light declares
// one. Before this, the natatorium ran at 8.0–10.0 while the whole tower ran at
// 1.0–1.35, and nothing said whether 8.0 was a mistake or a sky. It is a sky:
// daylight through a failed roof genuinely is an order of magnitude above a
// fluorescent tube, and flattening it would have been the wrong fix.
//
//   sky        1.0 – 12.0   daylight/moonlight through glass, a louvre, or a hole.
//                           A slot window and a collapsed clerestory are the same
//                           KIND at very different apertures — hence the range.
//   fitting    0.8 –  1.6   a working luminaire: tube, pendant, bulkhead.
//   emergency  0.15 –  0.9  MAINTAINED fittings on their own DC packs. These are
//                           the only lights that survive a dead building, and —
//                           because a battery pack does not hum — the only ones
//                           that never contaminate a take.
//   indicator  0.01 –  0.2  panel LEDs. You cannot see by them. That is the point.
//
// `test/lighting-rig.spec.mjs` enforces the bands per kind, so a fitting authored
// at 8.0 fails the build instead of quietly becoming the brightest thing in the
// conservatory.
//
// ── CIRCUITS ─────────────────────────────────────────────────────────────────
//
// `circuit: null` means the light does not need mains — sky and maintained
// emergency fittings. A named circuit (`sp01`/`sp02`/`sp03`, the three panels
// authored in conservatory-props.js) means the light is dead until that breaker
// is thrown, and hums while it is live.

export const LIGHT_KIND = Object.freeze({
  SKY: 'sky',
  FITTING: 'fitting',
  EMERGENCY: 'emergency',
  INDICATOR: 'indicator',
});

export const LIGHT_BANDS = Object.freeze({
  [LIGHT_KIND.SKY]: Object.freeze([1.0, 12.0]),
  [LIGHT_KIND.FITTING]: Object.freeze([0.8, 1.6]),
  [LIGHT_KIND.EMERGENCY]: Object.freeze([0.15, 0.9]),
  [LIGHT_KIND.INDICATOR]: Object.freeze([0.01, 0.2]),
});

// The renderer takes eight. Authoring more than eight for one place is allowed —
// the selector keeps the nearest — but it is worth knowing when you cross it.
export const LOCAL_LIGHT_SLOTS = 8;

const L = (id, kind, x, z, y, color, intensity, radius, extra = {}) => Object.freeze({
  id, kind, x, z, y, color: Object.freeze(color), intensity, radius,
  circuit: extra.circuit ?? null,
  ...extra,
});

// ── the ground floor and the third floor ─────────────────────────────────────
// Values lifted verbatim from the original rig. The academic skylight and the
// natatorium's roof are the only two places in the building with real sky.
const GROUND_AND_ACADEMIC = Object.freeze([
  L('academic-skylight-spill', LIGHT_KIND.SKY, 85, 15, 16.25, [.52, .67, .80], 1.12, 22),
  L('academic-emergency-west', LIGHT_KIND.EMERGENCY, 77, 7, 11.8, [1, .62, .32], .54, 7.2),
  // The east one is failing. `flutter` is applied by the selector so the data
  // stays static and testable; `flash !== 'full'` holds it steady instead.
  L('academic-emergency-east-failing', LIGHT_KIND.EMERGENCY, 93, 23, 11.8, [1, .57, .28], .22, 6.4,
    { flutter: { amount: .34, steady: .42 } }),
  // Cold roof spill, not powered fittings: the reference hall's long clerestory
  // remains legible while every practical stays dead.
  L('natatorium-roof-spill-north', LIGHT_KIND.SKY, 84, 31, 9.4, [.66, .82, .90], 10.0, 18),
  L('natatorium-roof-spill-mid', LIGHT_KIND.SKY, 84, 36, 9.7, [.62, .79, .88], 9.2, 18),
  L('natatorium-roof-spill-south', LIGHT_KIND.SKY, 84, 41, 9.7, [.59, .76, .86], 8.5, 18),
  L('natatorium-roof-spill-far', LIGHT_KIND.SKY, 84, 46, 9.4, [.56, .73, .83], 8.0, 18),
  L('natatorium-end-window-spill', LIGHT_KIND.SKY, 84, 49, 5.4, [.64, .80, .88], 7.0, 15),
]);

// ── the tower ────────────────────────────────────────────────────────────────
// Slot windows and bulkheads up the climb. `phase: 'cleared'` lights appear once
// the tower is cleared, which was the one piece of state-gated lighting the game
// already had.
const TOWER = Object.freeze([
  L('access-low', LIGHT_KIND.FITTING, 100, 62, 6.65, [1, .68, .38], 1.35, 5.2),
  L('access-high', LIGHT_KIND.FITTING, 106, 63, 11.45, [1, .70, .42], 1.20, 5.0),
  L('ringing-pendant', LIGHT_KIND.FITTING, 90, 64, 11.55, [1, .72, .46], 1.05, 7.5),
  L('chamber-entry', LIGHT_KIND.FITTING, 97, 64, 15.65, [.92, .80, .61], 1.00, 5.0),
  L('louvre-spill', LIGHT_KIND.SKY, 97, 61, 17.4, [.50, .66, .82], 1.22, 8.2),
  L('winch-lamp', LIGHT_KIND.FITTING, 97, 69, 15.25, [1, .74, .43], 1.35, 5.4),
  L('service-landing', LIGHT_KIND.FITTING, 106, 70, 11.45, [1, .69, .40], 1.10, 5.0),
  L('organ-exit', LIGHT_KIND.SKY, 98, 79, 10.25, [.78, .88, 1], 1.25, 7, { phase: 'cleared' }),
  L('nave-exit', LIGHT_KIND.FITTING, 100.5, 82, 6.45, [1, .73, .42], 1.18, 5.8, { phase: 'cleared' }),
]);

// Render group → authored rig. Groups absent from this table are dark, and that
// is now a statement rather than an oversight: see the plan's per-space table for
// what each of the remaining spaces is getting.
export const LIGHT_RIGS = Object.freeze({
  ground: GROUND_AND_ACADEMIC,
  academic: GROUND_AND_ACADEMIC,
  tower: TOWER,
});

export function lightRigFor(group) {
  return LIGHT_RIGS[group] || null;
}

// Every authored light, for tests and audits.
export function allAuthoredLights() {
  const seen = new Set();
  const out = [];
  for (const rig of Object.values(LIGHT_RIGS)) {
    for (const light of rig) {
      if (seen.has(light.id)) continue;
      seen.add(light.id);
      out.push(light);
    }
  }
  return out;
}

// The live rig for a place, resolved: phase gate, the failing lamp's flutter, the
// circuits that are actually energised, and the renderer's eight slots.
//
// `origin` is the player in the same metric space as the light positions; when it
// is given and a rig exceeds the slot count, the nearest eight win — the shape
// the impossible stair's rig has always used.
export function resolveLocalLights(group, {
  timeSec = 0,
  reducedFlash = false,
  towerCleared = false,
  liveCircuits = null,
  origin = null,
  slots = LOCAL_LIGHT_SLOTS,
} = {}) {
  const rig = lightRigFor(group);
  if (!rig) return [];
  const live = liveCircuits instanceof Set ? liveCircuits : new Set(liveCircuits || []);
  // One flutter for the frame, so several failing fittings breathe together the
  // way fittings on one ballast circuit actually do.
  const flutter = .5 + .5 * Math.sin(timeSec * 7.1) * Math.sin(timeSec * 2.37);
  const out = [];
  for (const light of rig) {
    if (light.phase === 'cleared' && !towerCleared) continue;
    if (light.circuit && !live.has(light.circuit)) continue;
    let intensity = light.intensity;
    if (light.flutter) {
      intensity = reducedFlash
        ? light.flutter.steady
        : light.intensity + flutter * light.flutter.amount;
    }
    out.push({
      id: light.id, x: light.x, z: light.z, y: light.y,
      color: light.color, intensity, radius: light.radius,
    });
  }
  if (out.length <= slots) return out;
  if (!origin) return out.slice(0, slots);
  const near = (light) => {
    const dx = light.x - (origin.x || 0);
    const dz = light.z - (origin.z ?? origin.y ?? 0);
    return dx * dx + dz * dz;
  };
  return out.sort((a, b) => near(a) - near(b)).slice(0, slots);
}
