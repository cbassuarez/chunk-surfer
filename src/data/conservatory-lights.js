// THE CONSERVATORY'S AUTHORED LIGHT.
//
// `intensity: 1` means the exposure of one working fitting at roughly three
// metres. Aperture and reach belong in radius/placement, not in a magic 10x
// intensity. The eight-light renderer budget is resolved after room, phase and
// circuit filtering, so a fitting in the next room cannot steal a slot.

import { ZONE } from './floorplan/legend.js';

export const LIGHT_KIND = Object.freeze({
  SKY: 'sky',
  FITTING: 'fitting',
  EMERGENCY: 'emergency',
  INDICATOR: 'indicator',
});

export const LIGHT_BANDS = Object.freeze({
  [LIGHT_KIND.SKY]: Object.freeze([.45, 1.8]),
  [LIGHT_KIND.FITTING]: Object.freeze([.70, 1.6]),
  [LIGHT_KIND.EMERGENCY]: Object.freeze([.12, .9]),
  [LIGHT_KIND.INDICATOR]: Object.freeze([.01, .2]),
});

export const LOCAL_LIGHT_SLOTS = 8;

const AMBIENT = Object.freeze({
  [ZONE.none]: { color: [.64, .65, .62], intensity: .022 },
  [ZONE.dock]: { color: [.84, .57, .31], intensity: .028 },
  [ZONE.foyer]: { color: [.66, .71, .70], intensity: .034 },
  [ZONE.studio]: { color: [.48, .57, .45], intensity: .024 },
  [ZONE.natatorium]: { color: [.43, .63, .57], intensity: .040 },
  [ZONE.hall]: { color: [.50, .37, .31], intensity: .020 },
  [ZONE.practice]: { color: [.66, .51, .35], intensity: .027 },
  [ZONE.chapel]: { color: [.72, .80, .88], intensity: .043 },
  [ZONE.plant]: { color: [.43, .48, .40], intensity: .020 },
  [ZONE.stair]: { color: [.49, .50, .48], intensity: .018 },
  [ZONE.chapelOuter]: { color: [.54, .61, .66], intensity: .025 },
  [ZONE.bellTower]: { color: [.58, .45, .30], intensity: .025 },
  [ZONE.academic]: { color: [.62, .69, .70], intensity: .036 },
  [ZONE.danceStudio]: { color: [.38, .34, .27], intensity: .014 },
  [ZONE.store]: { color: [.42, .43, .40], intensity: .016 },
});

const freezeLight = (id, kind, x, z, y, color, intensity, radius, extra = {}) => Object.freeze({
  id, kind, x, z, y,
  color: Object.freeze(color),
  intensity, radius,
  groups: Object.freeze(extra.groups || []),
  zones: Object.freeze(extra.zones || []),
  circuit: extra.circuit ?? null,
  maintained: kind === LIGHT_KIND.EMERGENCY,
  ...extra,
});
const L = freezeLight;

// Light positions are authored metres unless `anchorPropId` is present. An
// anchored light resolves from the prop every frame; moving a fitting moves its
// emitted light. The fallback coordinates keep deterministic tests and early
// asset-load frames stable.
export const CONSERVATORY_LIGHTS = Object.freeze([
  // Loading dock: only the sodium seam. The freight-frame chandelier is
  // disconnected and is exclusively controlled by the haunting override.
  L('dock-grey-door-seam', LIGHT_KIND.EMERGENCY, 65.5, 4.2, 2.1, [1, .43, .16], .34, 6.2,
    { groups:['ground'], zones:[ZONE.dock] }),

  // Basement and dance wing. The corridors deliberately remain absent.
  L('dance-stair-failing', LIGHT_KIND.EMERGENCY, 45.0, 20.75, -1.32, [1, .48, .22], .20, 6.0,
    { groups:['basement'], zones:[ZONE.danceStudio, ZONE.stair], anchorPropId:'light-dance-stair-casing', anchorOffset:[0,.18,0], flutter:{ amount:.17, steady:.20 } }),
  L('plant-panel-green', LIGHT_KIND.INDICATOR, 37.55, 30.0, -2.0, [.18, 1, .30], .10, 2.2,
    { groups:['basement'], zones:[ZONE.plant] }),
  L('plant-service-live', LIGHT_KIND.FITTING, 35.0, 25.75, -1.37, [.69, .83, .70], .88, 9.0,
    { groups:['basement'], zones:[ZONE.plant], circuit:'sp01', anchorPropId:'light-plant-service-casing', anchorOffset:[0,.18,0], flutter:{ amount:.06, steady:.84 } }),
  L('dance-work-live', LIGHT_KIND.FITTING, 18.0, 5.75, -1.37, [.78, .78, .65], .82, 9.0,
    { groups:['basement'], zones:[ZONE.danceStudio], circuit:'sp01', anchorPropId:'light-dance-work-casing', anchorOffset:[0,.18,0], flutter:{ amount:.07, steady:.78 } }),

  // Ground/atrium and natatorium.
  L('academic-skylight-spill', LIGHT_KIND.SKY, 85, 15, 16.25, [.52, .67, .80], 1.12, 24,
    { groups:['ground','academic'], zones:[ZONE.foyer,ZONE.academic], anchorPropId:'academic-skylight', anchorOffset:[0,6.25,0] }),
  L('academic-emergency-west', LIGHT_KIND.EMERGENCY, 78.75, 8, 11.8, [1, .62, .32], .54, 7.2,
    { groups:['academic'], zones:[ZONE.academic], anchorPropId:'academic-light-emergency-west', anchorOffset:[0,.18,0] }),
  L('academic-emergency-east-failing', LIGHT_KIND.EMERGENCY, 96.75, 23, 11.8, [1, .57, .28], .22, 6.4,
    { groups:['academic'], zones:[ZONE.academic], anchorPropId:'academic-light-emergency-east-failing', anchorOffset:[0,.18,0], flutter:{ amount:.16, steady:.22 } }),
  L('atrium-main-exit', LIGHT_KIND.EMERGENCY, 77.5, 3.75, 1.8, [1, .64, .34], .48, 6.4,
    { groups:['ground'], zones:[ZONE.foyer], anchorPropId:'atrium-light-main-exit', anchorOffset:[0,.18,0] }),
  L('foh-live-west', LIGHT_KIND.FITTING, 74.75, 12.5, 3.43, [.74, .82, .78], .92, 10,
    { groups:['ground'], zones:[ZONE.foyer], circuit:'sp03', anchorPropId:'light-foh-west-casing', anchorOffset:[0,.18,0], flutter:{ amount:.06, steady:.88 } }),
  L('foh-live-east', LIGHT_KIND.FITTING, 92.0, 16.75, 3.43, [.74, .82, .78], .88, 10,
    { groups:['ground'], zones:[ZONE.foyer], circuit:'sp03', anchorPropId:'light-foh-east-casing', anchorOffset:[0,.18,0], flutter:{ amount:.05, steady:.84 } }),
  // Broad roof spill stays around one exposure unit. Scale comes from overlap,
  // radius and the long aperture, never a raw intensity of ten.
  L('natatorium-roof-spill-north', LIGHT_KIND.SKY, 80, 31, 9.4, [.55, .75, .72], 1.52, 20,
    { groups:['ground'], zones:[ZONE.natatorium] }),
  L('natatorium-roof-spill-mid', LIGHT_KIND.SKY, 85, 37, 9.7, [.51, .70, .68], 1.40, 21,
    { groups:['ground'], zones:[ZONE.natatorium] }),
  L('natatorium-roof-spill-south', LIGHT_KIND.SKY, 81, 44, 9.5, [.48, .67, .65], 1.28, 19,
    { groups:['ground'], zones:[ZONE.natatorium] }),
  L('natatorium-roof-spill-far', LIGHT_KIND.SKY, 88, 46, 9.3, [.46, .64, .62], 1.10, 17,
    { groups:['ground'], zones:[ZONE.natatorium] }),
  L('natatorium-end-window-spill', LIGHT_KIND.SKY, 89, 49, 5.4, [.58, .74, .72], 1.18, 16,
    { groups:['ground'], zones:[ZONE.natatorium] }),
  L('pool-service-live-a', LIGHT_KIND.FITTING, 95.75, 43.0, 3.48, [.69, .83, .78], .94, 10,
    { groups:['ground'], zones:[ZONE.natatorium], circuit:'sp02', anchorPropId:'light-pool-service-a-casing', anchorOffset:[0,.18,0], flutter:{ amount:.05, steady:.90 } }),
  L('pool-service-live-b', LIGHT_KIND.FITTING, 70.75, 43.0, 3.48, [.67, .81, .76], .86, 10,
    { groups:['ground'], zones:[ZONE.natatorium], circuit:'sp02', anchorPropId:'light-pool-service-b-casing', anchorOffset:[0,.18,0], flutter:{ amount:.07, steady:.82 } }),
  L('natatorium-emergency-entry', LIGHT_KIND.EMERGENCY, 84.75, 27.5, 1.8, [1, .65, .36], .48, 6.4,
    { groups:['ground'], zones:[ZONE.none,ZONE.natatorium], anchorPropId:'natatorium-light-emergency-entry', anchorOffset:[0,.18,0] }),
  L('natatorium-emergency-west', LIGHT_KIND.EMERGENCY, 70.75, 38.5, 1.8, [1, .62, .32], .40, 6.4,
    { groups:['ground'], zones:[ZONE.natatorium], anchorPropId:'natatorium-light-emergency-west', anchorOffset:[0,.18,0] }),
  L('natatorium-emergency-east', LIGHT_KIND.EMERGENCY, 95.75, 38.5, 1.8, [1, .62, .32], .40, 6.4,
    { groups:['ground'], zones:[ZONE.natatorium], anchorPropId:'natatorium-light-emergency-east', anchorOffset:[0,.18,0] }),
  L('natatorium-emergency-far', LIGHT_KIND.EMERGENCY, 84, 49.75, 1.8, [1, .60, .30], .36, 6.4,
    { groups:['ground'], zones:[ZONE.natatorium], anchorPropId:'natatorium-light-emergency-far', anchorOffset:[0,.18,0] }),

  // Concert hall and the upper floor.
  L('hall-stage-door-maintained', LIGHT_KIND.EMERGENCY, 98.75, 8.0, 2.83, [1, .40, .22], .48, 7.0,
    { groups:['hall'], zones:[ZONE.hall], anchorPropId:'light-hall-stage-door-casing', anchorOffset:[0,.18,0] }),
  L('hall-lounge-live', LIGHT_KIND.FITTING, 98.75, 27.0, 3.28, [.78, .74, .62], .82, 10,
    { groups:['hall'], zones:[ZONE.hall], circuit:'sp03', anchorPropId:'light-hall-lounge-casing', anchorOffset:[0,.18,0], flutter:{ amount:.06, steady:.78 } }),
  L('practice-emergency-north', LIGHT_KIND.EMERGENCY, 59.5, 55.75, 7.48, [1, .52, .25], .42, 7.5,
    { groups:['upper'], zones:[ZONE.practice], anchorPropId:'light-practice-north-casing', anchorOffset:[0,.18,0] }),
  L('practice-emergency-south', LIGHT_KIND.EMERGENCY, 59.75, 81.0, 7.48, [1, .50, .24], .38, 7.5,
    { groups:['upper'], zones:[ZONE.practice], anchorPropId:'light-practice-south-casing', anchorOffset:[0,.18,0] }),
  L('chapel-cold-shaft', LIGHT_KIND.SKY, 93.5, 73.0, 13.8, [.70, .82, 1], 1.18, 17,
    { groups:['upper'], zones:[ZONE.chapel] }),

  // Tower fittings are attached to their actual casings. They are maintained
  // service units, not a fourth mains circuit.
  L('access-low', LIGHT_KIND.EMERGENCY, 100, 61.75, 6.65, [1, .68, .38], .72, 5.2,
    { groups:['tower'], zones:[ZONE.bellTower], anchorPropId:'tower-light-lower', anchorOffset:[0,.18,0] }),
  L('access-high', LIGHT_KIND.EMERGENCY, 106, 63.25, 13.13, [1, .70, .42], .65, 5.0,
    { groups:['tower'], zones:[ZONE.bellTower], anchorPropId:'tower-light-upper', anchorOffset:[0,.18,0] }),
  L('ringing-pendant', LIGHT_KIND.EMERGENCY, 90, 64, 11.55, [1, .72, .46], .58, 7.5,
    { groups:['tower'], zones:[ZONE.bellTower], anchorPropId:'tower-light-ringing', anchorOffset:[0,-1.25,0] }),
  L('chamber-entry', LIGHT_KIND.EMERGENCY, 97.75, 63.5, 15.65, [.92, .80, .61], .54, 5.0,
    { groups:['tower'], zones:[ZONE.bellTower], anchorPropId:'tower-light-entry', anchorOffset:[0,.18,0] }),
  L('louvre-spill', LIGHT_KIND.SKY, 97, 61, 17.4, [.50, .66, .82], 1.22, 8.2,
    { groups:['tower'], zones:[ZONE.bellTower] }),
  L('winch-lamp', LIGHT_KIND.EMERGENCY, 97.75, 68.5, 15.25, [1, .74, .43], .74, 5.4,
    { groups:['tower'], zones:[ZONE.bellTower], anchorPropId:'tower-light-winch', anchorOffset:[0,.18,0] }),
  L('service-landing', LIGHT_KIND.EMERGENCY, 106, 70.25, 13.13, [1, .69, .40], .61, 5.0,
    { groups:['tower'], zones:[ZONE.bellTower], anchorPropId:'tower-light-service', anchorOffset:[0,.18,0] }),
  L('organ-exit', LIGHT_KIND.SKY, 98, 79, 10.25, [.78, .88, 1], 1.25, 7,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'cleared' }),
  L('organ-loft-exit', LIGHT_KIND.EMERGENCY, 98.5, 78.75, 10.25, [1, .72, .42], .56, 5.4,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'cleared', anchorPropId:'tower-light-organ-exit', anchorOffset:[0,.18,0] }),
  L('nave-exit', LIGHT_KIND.EMERGENCY, 100.5, 82, 6.45, [1, .73, .42], .66, 5.8,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'cleared', anchorPropId:'tower-light-nave-exit', anchorOffset:[0,.18,0] }),
]);

const byGroup = new Map();
for (const light of CONSERVATORY_LIGHTS) for (const group of light.groups) {
  const list = byGroup.get(group) || [];
  list.push(light); byGroup.set(group, list);
}

export const LIGHT_RIGS = Object.freeze(Object.fromEntries(
  [...byGroup.entries()].map(([group, lights]) => [group, Object.freeze(lights)]),
));

export function lightRigFor(group) { return LIGHT_RIGS[group] || null; }
export function allAuthoredLights() { return [...CONSERVATORY_LIGHTS]; }

export function resolveLightingContext(context = {}) {
  const zone = Number.isFinite(context?.zone) ? context.zone : ZONE.none;
  const ambient = AMBIENT[zone] || AMBIENT[ZONE.none];
  return {
    group: typeof context === 'string' ? context : String(context.group || ''),
    zone,
    spaceId: typeof context?.spaceId === 'string' ? context.spaceId : '',
    ambientColor: [...ambient.color],
    ambientIntensity: ambient.intensity,
  };
}

export function resolveLocalLights(context, {
  timeSec = 0,
  reducedFlash = false,
  towerCleared = false,
  liveCircuits = null,
  origin = null,
  slots = LOCAL_LIGHT_SLOTS,
  anchorPosition = null,
} = {}) {
  const group = typeof context === 'string' ? context : String(context?.group || '');
  const zone = typeof context === 'string' ? null : context?.zone;
  const rig = lightRigFor(group);
  if (!rig) return [];
  const live = liveCircuits instanceof Set ? liveCircuits : new Set(liveCircuits || []);
  const flutter = .5 + .5 * Math.sin(timeSec * 7.1) * Math.sin(timeSec * 2.37);
  const out = [];
  for (const light of rig) {
    if (Number.isFinite(zone) && light.zones.length && !light.zones.includes(zone)) continue;
    if (light.phase === 'cleared' && !towerCleared) continue;
    if (light.circuit && !live.has(light.circuit)) continue;
    let intensity = light.intensity;
    if (light.flutter) intensity = reducedFlash
      ? light.flutter.steady
      : Math.min(LIGHT_BANDS[light.kind][1], light.intensity + flutter * light.flutter.amount);
    const anchored = light.anchorPropId && typeof anchorPosition === 'function'
      ? anchorPosition(light.anchorPropId)
      : null;
    const offset = light.anchorOffset || [0,0,0];
    out.push({
      id: light.id,
      x: anchored ? anchored.x + offset[0] : light.x,
      y: anchored ? anchored.y + offset[1] : light.y,
      z: anchored ? anchored.z + offset[2] : light.z,
      color: light.color,
      intensity,
      radius: light.radius,
      kind: light.kind,
      circuit: light.circuit,
      maintained: light.maintained,
      anchorPropId: light.anchorPropId || null,
      castsShadow: !!light.castsShadow,
    });
  }
  if (out.length <= slots) return out;
  if (!origin) return out.slice(0, slots);
  const near = (light) => {
    const dx = light.x - (Number(origin.x) || 0);
    const dz = light.z - (Number(origin.z ?? origin.y) || 0);
    return dx * dx + dz * dz;
  };
  return out.sort((a, b) => near(a) - near(b)).slice(0, slots);
}
