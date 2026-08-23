// THE CONSERVATORY'S AUTHORED LIGHT.
//
// `intensity: 1` means the exposure of one working fitting at roughly three
// metres. Aperture and reach belong in radius/placement, not in a magic 10x
// intensity. The eight-light renderer budget is resolved after room, phase and
// circuit filtering, so a fitting in the next room cannot steal a slot.

import { ZONE } from './floorplan/legend.js';
import { CHURCH_LIGHTS } from './st-brendans.js';

export const LIGHT_KIND = Object.freeze({
  SKY: 'sky',
  FITTING: 'fitting',
  EMERGENCY: 'emergency',
  INDICATOR: 'indicator',
});

export const LIGHT_POWER_MODE = Object.freeze({
  // Ordinary work/service fittings. The associated circuit is an actual runtime
  // breaker and the light is absent while that circuit is dead.
  CIRCUIT: 'circuit',
  // Battery-backed / unswitched maintained practicals. They may still carry a
  // circuit label for inspection, panel cards or authorship, but that label is
  // not their runtime supply.
  MAINTAINED: 'maintained',
  // Road, sky, yard and other sources outside Ellery's switchgear.
  EXTERNAL: 'external',
  // Compatibility mode for local practicals with no circuit relationship.
  ALWAYS: 'always',
});
const LIGHT_POWER_MODE_VALUES = new Set(Object.values(LIGHT_POWER_MODE));

function normalizeLightPowerMode(kind, extra = {}) {
  if (LIGHT_POWER_MODE_VALUES.has(extra.powerMode)) return extra.powerMode;
  if (extra.maintained === true) return LIGHT_POWER_MODE.MAINTAINED;
  if (kind === LIGHT_KIND.SKY) return LIGHT_POWER_MODE.EXTERNAL;
  if (extra.circuit) return LIGHT_POWER_MODE.CIRCUIT;
  return LIGHT_POWER_MODE.ALWAYS;
}

function lightHasRuntimePower(light, live) {
  switch (light?.powerMode) {
    case LIGHT_POWER_MODE.CIRCUIT:
      return !!light.circuit && live.has(light.circuit);
    case LIGHT_POWER_MODE.MAINTAINED:
    case LIGHT_POWER_MODE.EXTERNAL:
    case LIGHT_POWER_MODE.ALWAYS:
      return true;
    default:
      return light?.circuit ? live.has(light.circuit) : true;
  }
}

// Emergency red is not a maintained exit sign. It is the concert hall's visual
// alarm: a short, extremely high-candela exposure that should feel physical.
// Ordinary fittings retain the conservative 1.8 ceiling; the alarm owns a
// separate 3.6 ceiling because five broad sources have to turn the auditorium
// into one red volume after falloff, occlusion and the one-bit acquisition pass.
export const LIGHT_BANDS = Object.freeze({
  [LIGHT_KIND.SKY]: Object.freeze([.45, 1.8]),
  [LIGHT_KIND.FITTING]: Object.freeze([.70, 1.6]),
  [LIGHT_KIND.EMERGENCY]: Object.freeze([.12, 3.6]),
  [LIGHT_KIND.INDICATOR]: Object.freeze([.01, .2]),
});

// Not amber, not sodium, not a warm wayfinding lamp. The emergency circuit is
// the one impossible colour in Ellery: a saturated electrical red that survives
// both the material pass and the one-bit display's selective chroma.
export const EMERGENCY_RED = Object.freeze([1, .018, .008]);

export const LOCAL_LIGHT_SLOTS = 8;

const AMBIENT = Object.freeze({
  [ZONE.none]: { color: [.64, .65, .62], intensity: .022 },
  // The loading bay is the only place in this game with weather over it: cold,
  // wet and bluer than any interior, and far brighter, because a sodium-lit
  // overcast is still hugely more light than a building with no power in it.
  //
  // This number looks wrong beside the others and is not. Ambient does not fall
  // off with distance, and the yard is fifty metres of ground that no fitting
  // reaches — a local light with a nineteen-metre radius lights the near third
  // and leaves the rest black. Out here the sky IS the light source, so it has
  // to arrive as ambient or it does not arrive at all.
  [ZONE.dock]: { color: [.38, .47, .66], intensity: .155 },
  [ZONE.street]: { color: [.40, .47, .60], intensity: .142 },
  [ZONE.civicCourt]: { color: [.45, .49, .57], intensity: .126 },
  [ZONE.serviceYard]: { color: [.36, .42, .52], intensity: .104 },
  [ZONE.foyer]: { color: [.66, .71, .70], intensity: .034 },
  [ZONE.studio]: { color: [.48, .57, .45], intensity: .024 },
  [ZONE.natatorium]: { color: [.43, .63, .57], intensity: .040 },
  [ZONE.hall]: { color: [.50, .37, .31], intensity: .020 },
  [ZONE.practice]: { color: [.66, .51, .35], intensity: .027 },
  [ZONE.chapel]: { color: [.72, .80, .88], intensity: .043 },
  [ZONE.plant]: { color: [.43, .48, .40], intensity: .020 },
  [ZONE.stair]: { color: [.55, .52, .45], intensity: .024 },
  [ZONE.chapelOuter]: { color: [.54, .61, .66], intensity: .025 },
  [ZONE.bellTower]: { color: [.58, .45, .30], intensity: .025 },
  [ZONE.academic]: { color: [.62, .69, .70], intensity: .036 },
  [ZONE.danceStudio]: { color: [.38, .34, .27], intensity: .014 },
  [ZONE.store]: { color: [.42, .43, .40], intensity: .016 },
  // The get-in keeps the sodium and rust the old dock room had.
  [ZONE.getIn]: { color: [.84, .57, .31], intensity: .028 },
});

// WHAT COUNTS AS WHITE IN THIS ROOM.
//
// The halftone's white point is authored per look profile — explore puts it at
// .46 — and a look profile has no idea which room it is standing in. A wall at
// ambient .028 then lands five per cent up that curve and dithers at three per
// cent ink, which IS the pointillism: the curve is calibrated for a lit exterior
// and this building has no mains. Measured in the get-in before this existed:
// ~90% pure black, ~10% pure white, every intermediate bucket empty.
//
// So a zone declares its own ceiling, as a multiple of its own ambient. K is how
// far above the ambient floor a surface has to be before it reads as white —
// LOWER K gives a lighter, busier, more heavily inked room. It is expressed as a
// scale against explore's white point so the profiles keep their relationship to
// one another: battle is still harder than calm inside the same room.
export const REFERENCE_WHITE_POINT = 0.46;
export const ZONE_WHITE_POINT_K = 4.5;

// Derived rather than hand-authored, so re-lighting a room cannot silently leave
// a stale ceiling behind. The dock opts out: out there the sky is the light
// source, its ambient is already the .17 of an overcast rather than a floor to
// climb off, and scaling it would only darken the one place with weather over it.
const WHITE_POINT_SCALE_OVERRIDE = Object.freeze({
  [ZONE.dock]:1,[ZONE.street]:1,[ZONE.civicCourt]:1,[ZONE.serviceYard]:1,
});

export function zoneWhitePointScale(zone) {
  const override = WHITE_POINT_SCALE_OVERRIDE[zone];
  if (Number.isFinite(override)) return override;
  const ambient = AMBIENT[zone] || AMBIENT[ZONE.none];
  return (ambient.intensity * ZONE_WHITE_POINT_K) / REFERENCE_WHITE_POINT;
}

// THE RETURN TRIP.
//
// Ambient is uniform over the sphere, so it hands a ceiling exactly what it hands
// a floor — and a ceiling is the one surface nothing else in these rooms can
// reach. The torch is a forward cone from eye height and the fittings hang at
// about two metres under five-and-a-half metre ceilings. Measured raw in the
// get-in, against a black point at byte 1.3: walls go 1.3 → 11.4 when the torch
// comes on, ceilings only 1.5 → 2.5, still 46% under the floor. That is why every
// ceiling in the building reads as pure black.
//
// So each room gets a bounce, as a multiple of its own ambient, weighted onto
// downward-facing normals and gained by the torch — light off the floor, coming
// back up. The dock opts out: the sky already arrives from above out there, and a
// bounce would only flatten the one place with real light in it.
export const ZONE_BOUNCE_K = 3.0;
const BOUNCE_OVERRIDE = Object.freeze({
  [ZONE.dock]:0,[ZONE.street]:0,[ZONE.civicCourt]:0,[ZONE.serviceYard]:0,
});

export function zoneBounce(zone) {
  const ambient = AMBIENT[zone] || AMBIENT[ZONE.none];
  const override = BOUNCE_OVERRIDE[zone];
  const intensity = Number.isFinite(override) ? override : ambient.intensity * ZONE_BOUNCE_K;
  return { color: [...ambient.color], intensity };
}

// A LIGHT IS X-RAY IN ITS OWN ROOM AND ORDINARY EVERYWHERE ELSE.
//
// The auditorium's maintained lamps are authored to carry — radius 42-54 with
// penetration .86-.92, which is what makes the hall one continuous red volume
// rather than five pools around five fittings. But they also resolve for the
// foyer, and penetration is what tells the raymarcher to ignore walls: at .90
// the shader's blocked-visibility floor of .16 is remapped to .92, so every
// atrium wall received the auditorium's red through thirty metres of building.
// The whole atrium went red when the concert hall should only be leaking a
// little around its doors.
//
// Declaring the light's HOME zone fixes it without touching the authored figures
// or the look of the room the fitting is actually in. Outside home, penetration
// collapses to a hair and reach is cut, which hands the spill back to
// architecturalLightVisibility — so what reaches the foyer is what genuinely has
// line of sight through the hall doors, and the rest of the atrium goes dark.
// Reach outside home is the reach of the APERTURE, not of the fitting: what gets
// out of a doorway behaves like a source at the doorway, so a fifty-metre
// auditorium throw becomes an eleven-metre pool the far side of the threshold.
// Measured at the S/P-03 panel eight metres into the atrium, .42 still left the
// auditorium supplying 83% of the light there and the breaker with nothing to
// give; at .22 the panel is the foyer's own darkness again.
const SPILL_PENETRATION = .08;
const SPILL_REACH = .22;
// The hall is allowed to be brutal; the foyer is only allowed to see the light
// that escapes its apertures. High-candela sources therefore lose exposure as
// well as reach when resolved outside their authored home zone.
const SPILL_INTENSITY = .28;

const freezeLight = (id, kind, x, z, y, color, intensity, radius, extra = {}) => {
  const powerMode = normalizeLightPowerMode(kind, extra);
  return Object.freeze({
    id, kind, x, z, y,
    color: kind === LIGHT_KIND.EMERGENCY ? EMERGENCY_RED : Object.freeze(color),
    intensity,
    // Emergency light is deliberately spatially wrong. It carries through the
    // auditorium instead of dying around the fitting like an ordinary bulkhead.
    radius: kind === LIGHT_KIND.EMERGENCY ? Math.max(30, radius) : radius,
    penetration: kind === LIGHT_KIND.EMERGENCY ? .78 : 0,
    ...extra,
    groups: Object.freeze(extra.groups || []),
    zones: Object.freeze(extra.zones || []),
    circuit: extra.circuit ?? null,
    powerMode,
    maintained: powerMode === LIGHT_POWER_MODE.MAINTAINED,
  });
};
const L = freezeLight;

// Light positions are authored metres unless `anchorPropId` is present. An
// anchored light resolves from the prop every frame; moving a fitting moves its
// emitted light. The fallback coordinates keep deterministic tests and early
// asset-load frames stable.
export const CONSERVATORY_LIGHTS = Object.freeze([
  // The get-in: only the sodium seam under the grey door. The freight-frame
  // chandelier is disconnected and is exclusively controlled by the haunting
  // override.
  L('getin-grey-door-seam', LIGHT_KIND.EMERGENCY, 65.5, 4.2, 2.1, [1, .43, .16], .34, 6.2,
    { groups:['ground'], zones:[ZONE.getIn], circuit:'sp03' }),

  // THE LOADING BAY. The only lit place in this building that nobody is paying
  // for: the sky over the yard, and a lamp on a pole beyond the fence that
  // belongs to the road, not to the conservatory.
  //
  // The wash is a SKY light and takes its reach from radius, not intensity —
  // twenty metres of open weather over an apron, arriving through the mouth. It
  // is the only fitting in the game whose source is not in the building.
  L('bay-sky-wash', LIGHT_KIND.SKY, 50.0, 7.5, 5.2, [.54, .62, .80], 1.28, 20.0,
    { groups:['ground'], zones:[ZONE.dock] }),
  // A second wash, high and out in front of the elevation. The building's west
  // face is the tallest thing in the bay and the apron's own fittings all point
  // down; without this it is a fifteen-metre unlit plane at the top of the shot.
  L('bay-facade-wash', LIGHT_KIND.SKY, 46.0, 9.0, 11.0, [.50, .58, .74], 1.42, 26.0,
    { groups:['ground'], zones:[ZONE.dock] }),
  // A bulkhead over the dock door, on the same dead circuit as everything else,
  // still running because it is wired to the yard supply and not the building's.
  L('bay-canopy-bulkhead', LIGHT_KIND.FITTING, 55.2, 7.5, 4.1, [1, .74, .42], .86, 7.5,
    { groups:['ground'], zones:[ZONE.dock], flutter:{ amount:.09, steady:.55 } }),
  // Sodium on the road's own column, too far to hear and too far to help.
  L('bay-yard-sodium', LIGHT_KIND.FITTING, 22.0, 4.0, 6.6, [1, .52, .18], 1.05, 22.0,
    { groups:['ground'], zones:[ZONE.dock] }),
  // The park's one working column, at the corner of the crossing paths. Sodium,
  // like the road's, because a municipal park and a municipal road were lit by
  // the same department out of the same store — and because the one thing that
  // has to read at the far end of that lawn is the fountain, which is directly
  // under it. Anchored to the column so the glow comes out of a visible fitting
  // rather than out of the air above the grass.
  L('yard-park-sodium', LIGHT_KIND.FITTING, 12.5, 33.0, 6.6, [1, .54, .21], .96, 19.0,
    { groups:['ground'], zones:[ZONE.dock], anchorPropId:'yard-park-lamp', anchorOffset:[0,.20,0] }),
  // ── ST BRENDAN'S ─────────────────────────────────────────────────────────
  //
  // Nothing in this building has power and nothing in it is lit. What is in here
  // is weather: the moon coming down the belfry shaft and in through the lancets,
  // which is why these are cold, dim and high. LIGHT_KIND.SKY rather than
  // FITTING — there is no fitting, and putting one in would be inventing a
  // caretaker this church has not had in years.
  //
  // The intensities look high for moonlight and are not negotiable: LIGHT_BANDS
  // floors SKY at .45, because a sky legitimately runs an order above a bulkhead.
  // The dimness in here is bought with RADIUS instead — short reaches that die
  // before they touch a wall, which is what a shaft of light actually does.
  //
  // Authored on ZONE.church so none of it spills into the yard's sodium.
  //
  ...CHURCH_LIGHTS.map((light)=>L(`brendan-${light.id}`,LIGHT_KIND.SKY,
    light.x,light.y,light.h,[.58,.67,.86],light.intensity,light.radius,
    {groups:['ground','cathedral'],zones:[ZONE.church]})),

  // The booth window. The only lit one on the site, and the last shift in it.
  L('bay-booth-window', LIGHT_KIND.FITTING, 24.0, 14.0, 2.0, [1, .82, .58], .92, 12.0,
    { groups:['ground'], zones:[ZONE.dock], flutter:{ amount:.04, steady:.90 } }),

  // THE INHABITED BLOCK. Road-owned sodium, shop spill and ordinary domestic
  // windows stay warm and limited. They belong to the town and stop resolving
  // as soon as the player leaves its street and pavement zones for Ellery.
  L('district-west-lamp-north', LIGHT_KIND.FITTING, -7, 18, 6.1, [1,.61,.28], .92, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-west-lamp-south', LIGHT_KIND.FITTING, -7, 78, 6.1, [1,.58,.25], .88, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-north-lamp-west', LIGHT_KIND.FITTING, 28, -7, 6.1, [1,.62,.30], .92, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-north-lamp-east', LIGHT_KIND.FITTING, 98, -7, 6.1, [1,.58,.25], .86, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-east-lamp-north', LIGHT_KIND.FITTING, 135, 20, 6.1, [1,.60,.28], .90, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-east-lamp-south', LIGHT_KIND.FITTING, 135, 78, 6.1, [1,.57,.24], .84, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-south-pub-spill', LIGHT_KIND.FITTING, 18, 99, 2.4, [1,.76,.46], .72, 13,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt],flutter:{amount:.03,steady:.95}}),
  L('district-south-lamp-east', LIGHT_KIND.FITTING, 106, 99, 6.1, [1,.60,.27], .88, 20,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  // Cold overcast relief on Ellery itself. These reveal cornices and roof depth
  // without suggesting a powered institution; warm sources remain exclusively
  // town windows, the lodge and the impossible stair pane.
  L('district-ellery-west-relief', LIGHT_KIND.SKY, 42, 40, 14, [.44,.52,.67], .56, 42,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt,ZONE.dock]}),
  L('district-ellery-east-relief', LIGHT_KIND.SKY, 136, 43, 13, [.43,.51,.66], .54, 40,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-ellery-north-relief', LIGHT_KIND.SKY, 62, -8, 13, [.46,.54,.69], .52, 38,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-ellery-south-relief', LIGHT_KIND.SKY, 67, 101, 13, [.42,.50,.65], .50, 38,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),
  L('district-chapel-tower-relief', LIGHT_KIND.SKY, 105, 74, 23, [.48,.56,.72], .58, 44,
    {groups:['ground'],zones:[ZONE.street,ZONE.civicCourt]}),

  // Basement and dance wing. The corridors deliberately remain absent.
  L('dance-stair-failing', LIGHT_KIND.EMERGENCY, 45.0, 20.75, -1.32, EMERGENCY_RED, .38, 6.0,
    { groups:['basement'], zones:[ZONE.danceStudio, ZONE.stair], circuit:'sp01', anchorPropId:'light-dance-stair-casing', anchorOffset:[0,.18,0], flutter:{ amount:.17, steady:.20 } }),
  L('plant-panel-green', LIGHT_KIND.INDICATOR, 37.55, 30.0, -2.0, [.18, 1, .30], .10, 2.2,
    { groups:['basement'], zones:[ZONE.plant] }),
  L('plant-emergency', LIGHT_KIND.EMERGENCY, 30.35, 30.5, -1.72, EMERGENCY_RED, .44, 7.0,
    { groups:['basement'], zones:[ZONE.plant], circuit:'sp01', anchorPropId:'light-plant-entry-casing', anchorOffset:[0,.18,0] }),
  L('plant-service-live', LIGHT_KIND.FITTING, 35.0, 25.75, -1.37, [.69, .83, .70], .88, 9.0,
    { groups:['basement'], zones:[ZONE.plant], circuit:'sp01', anchorPropId:'light-plant-service-casing', anchorOffset:[0,.18,0], flutter:{ amount:.06, steady:.84 } }),
  L('plant-switchgear-live', LIGHT_KIND.FITTING, 38.75, 28.7, -1.22, [.66,.82,.72], .82, 8.2,
    { groups:['basement'], zones:[ZONE.plant], circuit:'sp01', anchorPropId:'light-plant-switchgear-casing', anchorOffset:[0,.18,0], flutter:{amount:.04,steady:.80} }),
  L('plant-manifold-live', LIGHT_KIND.FITTING, 33.0, 38.15, -1.78, [.70,.84,.74], .78, 7.4,
    { groups:['basement'], zones:[ZONE.plant], circuit:'sp01', anchorPropId:'light-plant-manifold-casing', anchorOffset:[0,.18,0], flutter:{amount:.08,steady:.72} }),
  // B3's work light stands in B3 and is zoned to it. It used to carry
  // ZONE.danceStudio while sitting at (18,6) — inside the take room — so it was
  // filtered out for the player standing under it and resolved only for one
  // stood in B2, eight metres away through a wall. B3 has no other practical.
  L('b3-work-live', LIGHT_KIND.FITTING, 18.0, 5.75, -1.37, [.78, .78, .65], .82, 9.0,
    { groups:['basement'], zones:[ZONE.studio], circuit:'sp01', anchorPropId:'light-b3-work-casing', anchorOffset:[0,.18,0], flutter:{ amount:.07, steady:.78 } }),
  L('b3-emergency', LIGHT_KIND.EMERGENCY, 23.5, 20.75, -1.67, EMERGENCY_RED, .40, 7.0,
    { groups:['basement'], zones:[ZONE.studio], circuit:'sp01', anchorPropId:'light-b3-emergency-casing', anchorOffset:[0,.18,0] }),
  L('dance-work-live', LIGHT_KIND.FITTING, 32.0, 5.75, -1.37, [.78, .78, .65], .82, 9.0,
    { groups:['basement'], zones:[ZONE.danceStudio], circuit:'sp01', anchorPropId:'light-dance-work-casing', anchorOffset:[0,.18,0], flutter:{ amount:.07, steady:.78 } }),

  // Ground/atrium and natatorium.
  L('academic-skylight-spill', LIGHT_KIND.SKY, 85, 15, 16.25, [.52, .67, .80], 1.12, 24,
    { groups:['ground','academic'], zones:[ZONE.foyer,ZONE.academic], anchorPropId:'academic-skylight', anchorOffset:[0,6.25,0] }),
  L('academic-emergency-west', LIGHT_KIND.EMERGENCY, 78.75, 8, 11.8, EMERGENCY_RED, .54, 7.2,
    { groups:['academic'], zones:[ZONE.academic], circuit:'sp05', anchorPropId:'academic-light-emergency-west', anchorOffset:[0,.18,0] }),
  L('academic-emergency-east-failing', LIGHT_KIND.EMERGENCY, 96.75, 23, 11.8, EMERGENCY_RED, .22, 6.4,
    { groups:['academic'], zones:[ZONE.academic], circuit:'sp05', anchorPropId:'academic-light-emergency-east-failing', anchorOffset:[0,.18,0], flutter:{ amount:.16, steady:.22 } }),
  // The public entrance is permanently chained, so its local wayfinding body
  // survives the dead house circuit. This is a small amber maintained fitting,
  // not part of the concert hall's building-wide red emergency snap.
  L('atrium-main-exit', LIGHT_KIND.FITTING, 77.5, 3.75, 1.8, [1, .64, .34], 1.05, 6.4,
    { groups:['ground'], zones:[ZONE.foyer], maintained:true, anchorPropId:'atrium-light-main-exit', anchorOffset:[0,.18,0] }),
  L('foh-live-west', LIGHT_KIND.FITTING, 74.75, 18.5, 3.43, [.74, .82, .78], 1.52, 15,
    { groups:['ground'], zones:[ZONE.foyer], circuit:'sp03', anchorPropId:'light-foh-west-casing', anchorOffset:[0,.18,0], flutter:{ amount:.06, steady:1.46 } }),
  L('foh-live-east', LIGHT_KIND.FITTING, 92.0, 10.5, 3.43, [.74, .82, .78], 1.46, 15,
    { groups:['ground'], zones:[ZONE.foyer], circuit:'sp03', anchorPropId:'light-foh-east-casing', anchorOffset:[0,.18,0], flutter:{ amount:.05, steady:1.41 } }),
  L('foh-emergency', LIGHT_KIND.EMERGENCY, 96.75, 18.5, 2.33, EMERGENCY_RED, .46, 7.2,
    { groups:['ground'], zones:[ZONE.foyer], circuit:'sp03', anchorPropId:'light-foh-emergency-casing', anchorOffset:[0,.18,0] }),
  // The hall threshold sits on the same impossible battery circuit as the
  // auditorium. The red snap must be legible from the foyer and from deep in the
  // room, so these are cross-group emergency sources rather than warm sconces.
  //
  // Reach and exposure are both deliberate here. Radius/penetration carries the
  // red almost like an X-ray and the hall intensity sits near the alarm ceiling;
  // resolveLocalLights applies a separate spill exposure outside the home zone,
  // so restoring S/P-03 can still visibly relight the ordinary foyer.
  L('hall-entrance-maintained-north',LIGHT_KIND.EMERGENCY,98.25,24.08,2.36,[1,0,0],3.25,42,
    {groups:['ground','hall'],zones:[ZONE.foyer,ZONE.hall],home:ZONE.hall,maintained:true,penetration:.86,anchorPropId:'hall-entrance-light-1',anchorOffset:[-1.15,.18,0]}),
  L('hall-entrance-maintained-south',LIGHT_KIND.EMERGENCY,98.25,26.92,2.36,[1,0,0],3.25,42,
    {groups:['ground','hall'],zones:[ZONE.foyer,ZONE.hall],home:ZONE.hall,maintained:true,penetration:.86,anchorPropId:'hall-entrance-light-2',anchorOffset:[-1.15,.18,0]}),
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
    { groups:['ground'], zones:[ZONE.none,ZONE.natatorium], circuit:'sp02', anchorPropId:'natatorium-light-emergency-entry', anchorOffset:[0,.18,0] }),
  L('natatorium-emergency-west', LIGHT_KIND.EMERGENCY, 70.75, 38.5, 1.8, [1, .62, .32], .40, 6.4,
    { groups:['ground'], zones:[ZONE.natatorium], circuit:'sp02', anchorPropId:'natatorium-light-emergency-west', anchorOffset:[0,.18,0] }),
  L('natatorium-emergency-east', LIGHT_KIND.EMERGENCY, 95.75, 38.5, 1.8, [1, .62, .32], .40, 6.4,
    { groups:['ground'], zones:[ZONE.natatorium], circuit:'sp02', anchorPropId:'natatorium-light-emergency-east', anchorOffset:[0,.18,0] }),
  L('natatorium-emergency-far', LIGHT_KIND.EMERGENCY, 84, 49.75, 1.8, [1, .60, .30], .36, 6.4,
    { groups:['ground'], zones:[ZONE.natatorium], circuit:'sp02', anchorPropId:'natatorium-light-emergency-far', anchorOffset:[0,.18,0] }),

  // Concert hall and the upper floor.
  L('hall-stage-door-maintained', LIGHT_KIND.EMERGENCY, 98.75, 8.0, 2.83, [1, 0, 0], 3.60, 52,
    { groups:['ground','hall'], zones:[ZONE.foyer,ZONE.hall], home:ZONE.hall, maintained:true, penetration:.90, anchorPropId:'light-hall-stage-door-casing', anchorOffset:[0,.18,0] }),
  // The dead end's chandelier. ZONE.none ambient is 0.022 — without a practical
  // this room is a black corridor with furniture you cannot see. Anchored to the
  // fitting so moving it moves its light.
  L('deadend-ground-chandelier', LIGHT_KIND.FITTING, 73.0, 23.5, 3.35, [.80, .76, .64], .74, 7.5,
    { groups:['ground'], zones:[ZONE.none], circuit:'sp03',
      anchorPropId:'deadend-ground-chandelier', anchorOffset:[0,-.28,0],
      flutter:{ amount:.05, steady:.88 } }),
  L('hall-lounge-live', LIGHT_KIND.FITTING, 98.75, 27.0, 3.28, [.78, .74, .62], .82, 10,
    { groups:['hall'], zones:[ZONE.hall], maintained:true, anchorPropId:'light-hall-lounge-casing', anchorOffset:[0,.18,0], flutter:{ amount:.06, steady:.78 } }),
  // THE GALLERIA FEET. Maintained, because these are the escape route off two
  // balconies and are the one thing in a dead auditorium that would still be
  // wired to a battery pack. They also do the level-design work: the aisles are
  // the darkest part of this building and the flights in them were invisible, so
  // the way up read as more black wall. A stair nobody can see is not a stair.
  L('hall-galleria-west-foot', LIGHT_KIND.EMERGENCY, 100.25, 20.5, .62, [1, 0, 0], 3.45, 48,
    { groups:['ground','hall'], zones:[ZONE.foyer,ZONE.hall], home:ZONE.hall, maintained:true, penetration:.88, anchorPropId:'light-hall-galleria-west-casing', anchorOffset:[0,.18,0] }),
  L('hall-galleria-east-foot', LIGHT_KIND.EMERGENCY, 126.25, 31.5, 5.36, [1, 0, 0], 3.45, 54,
    { groups:['ground','hall'], zones:[ZONE.foyer,ZONE.hall], home:ZONE.hall, maintained:true, penetration:.92, anchorPropId:'light-hall-galleria-east-casing', anchorOffset:[0,.18,0] }),
  L('practice-emergency-north', LIGHT_KIND.EMERGENCY, 59.5, 55.75, 7.48, EMERGENCY_RED, .42, 7.5,
    { groups:['upper'], zones:[ZONE.practice], circuit:'sp04', anchorPropId:'light-practice-north-casing', anchorOffset:[0,.18,0] }),
  L('practice-emergency-south', LIGHT_KIND.EMERGENCY, 59.75, 81.0, 7.48, EMERGENCY_RED, .38, 7.5,
    { groups:['upper'], zones:[ZONE.practice], circuit:'sp04', anchorPropId:'light-practice-south-casing', anchorOffset:[0,.18,0] }),
  // The open-well stair is kept as a readable vertical room. These coincide
  // with the opal bodies in the hero mesh, but remain ordinary authored lights
  // so the renderer can illuminate real construction instead of relying on an
  // emissive decal. Each level sees the next landing before committing to it.
  L('main-stair-ground-opal', LIGHT_KIND.FITTING, 66.4, 38.8, 4.15, [1, .78, .51], .86, 9.5,
    { groups:['ground'], zones:[ZONE.stair] }),
  L('main-stair-upper-opal', LIGHT_KIND.FITTING, 66.4, 36, 8.85, [1, .78, .51], .92, 10.5,
    { groups:['ground','upper'], zones:[ZONE.stair] }),
  L('main-stair-academic-opal', LIGHT_KIND.FITTING, 66.4, 35.5, 13.25, [1, .80, .55], .88, 10.5,
    { groups:['upper','academic'], zones:[ZONE.stair,ZONE.academic] }),
  L('main-stair-loggia-maintained', LIGHT_KIND.EMERGENCY, 66.5, 36.5, 11.8, [1, .62, .32], .42, 7.2,
    { groups:['academic'], zones:[ZONE.academic], circuit:'sp05' }),
  L('chapel-cold-shaft', LIGHT_KIND.SKY, 93.5, 73.0, 13.8, [.70, .82, 1], 1.18, 17,
    { groups:['upper'], zones:[ZONE.chapel] }),

  // Tower fittings are attached to their actual casings and belong only to the
  // bell/peal route's phase machinery. No occupied-floor breaker can light or
  // extinguish them.
  L('access-low', LIGHT_KIND.EMERGENCY, 100, 61.75, 6.65, [1, .68, .38], .72, 5.2,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'tower', anchorPropId:'tower-light-lower', anchorOffset:[0,.18,0] }),
  L('access-high', LIGHT_KIND.EMERGENCY, 106, 63.25, 13.13, [1, .70, .42], .65, 5.0,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'tower', anchorPropId:'tower-light-upper', anchorOffset:[0,.18,0] }),
  L('ringing-pendant', LIGHT_KIND.EMERGENCY, 90, 64, 11.55, [1, .72, .46], .58, 7.5,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'tower', anchorPropId:'tower-light-ringing', anchorOffset:[0,-1.25,0] }),
  L('chamber-entry', LIGHT_KIND.EMERGENCY, 97.75, 63.5, 15.65, [.92, .80, .61], .54, 5.0,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'tower', anchorPropId:'tower-light-entry', anchorOffset:[0,.18,0] }),
  L('louvre-spill', LIGHT_KIND.SKY, 97, 61, 17.4, [.50, .66, .82], 1.22, 8.2,
    { groups:['tower'], zones:[ZONE.bellTower] }),
  L('winch-lamp', LIGHT_KIND.EMERGENCY, 97.75, 68.5, 15.25, [1, .74, .43], .74, 5.4,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'tower', anchorPropId:'tower-light-winch', anchorOffset:[0,.18,0] }),
  L('service-landing', LIGHT_KIND.EMERGENCY, 106, 70.25, 13.13, [1, .69, .40], .61, 5.0,
    { groups:['tower'], zones:[ZONE.bellTower], phase:'tower', anchorPropId:'tower-light-service', anchorOffset:[0,.18,0] }),
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
    whitePointScale: zoneWhitePointScale(zone),
    bounce: zoneBounce(zone),
  };
}

// Maintained means the circuit and its ballast stay alive; it does not mean the
// lamp presents a constant image. The electrical state is binary: full red or
// black, with no cinematic fade pretending to be a failing lamp. Reduced/off
// effects hold the lamp steadily on.
//
// THE EMERGENCY LAMPS ARE ONE CIRCUIT, AND THEY MUST BLINK LIKE ONE.
//
// They used to own private periods (3.9-5.2s) and private offsets spread across
// a whole period. Six of them meet in the hall/foyer pair, and independent
// phases at a 42% duty cycle leave EVERY lamp dark together 2.4% of the time —
// measured. The room was therefore red continuously and the blink was invisible:
// the player's report was "the lights do not flash at all now", and they were
// right, because in aggregate they did not. A building on a failing battery pack
// snaps the whole circuit at once.
//
// SO IT IS ONE PERIOD, IN UNISON, AT THE RATE REAL ALARM OPTICS ACTUALLY RUN.
//
// The first attempt invented a 4.6-second cycle with a 1.56-second on-time and
// a per-lamp jitter, which reads as a slow sectional ripple rather than an
// alarm. Both were wrong, and the real figures are not a matter of taste:
//
//   NFPA 72 / UL 1971 (US visual notification appliances)  1 Hz, range 1–2 Hz
//   EN 54-23 / ISO 7240-23 (European VADs)                 0.5–2 Hz
//   UL 1638 (visual signalling appliances)                 1–3 Hz
//   rotating beacons, 60–90 rpm                            1–1.5 Hz
//
// One hertz, and the standards are emphatic that synchronised appliances fire
// TOGETHER — NFPA 72 requires them within 10 ms of each other, because a room
// of strobes rippling out of step is both wrong and, for photosensitive people,
// worse than one that snaps. So jitter is zero. A circuit, not a chorus.
//
// A xenon flashtube's actual pulse is under a millisecond; that is invisible at
// 60fps, so the on-time is the shortest a frame budget can honestly carry and
// still read as a stab of light — about eight frames.
//
// AND THAT IS WHERE THE STANDARDS STOP BEING THE BRIEF.
//
// Everything above is right about the appliance and wrong about the room. The
// cadence is authored in two halves for two different jobs, and only one of them
// is an alarm:
//
//   THE DARK is the alarm, and it is unchanged — 0.672s, the gap this circuit
//   has always had. It is the interval the apparitions move in (see
//   EMERGENCY_DARK_HASTE), and its length is a measured quantity: change it and
//   the figures travel a different distance between two beats.
//
//   THE HOLD is the shot. 0.53s was still a strobe: long enough to know the room
//   flashed, too short to look at anything IN it, and the whole point of the beat
//   is that you find a white body standing on the far wall. You cannot search a
//   frame you only saw for half a second. 1.75s is a look.
//
// The honest consequence: 0.41Hz is below EN 54-23's 0.5Hz floor, so this is no
// longer a to-spec visual notification appliance. It is a failing battery pack in
// a condemned building, which owes UL nothing. What the standards were actually
// protecting is untouched and is the only part that was ever safety-critical:
// one circuit in unison (jitter 0), and a transition rate an order of magnitude
// under the three-hertz photosensitivity threshold — further under it now than
// at 1Hz, not closer.
const EMERGENCY_HOLD = 1.75;
const EMERGENCY_DARK = .672;
export const EMERGENCY_CADENCE = Object.freeze({
  // The two authored halves. Everything else here is derived from them, so the
  // hold can be retimed without silently retiming the dark the apparitions move
  // in — which is what a bare period/duty pair could not express.
  hold: EMERGENCY_HOLD,
  dark: EMERGENCY_DARK,
  period: EMERGENCY_HOLD + EMERGENCY_DARK,
  // Fraction of the shared cycle the circuit is energised. The rest is black.
  duty: EMERGENCY_HOLD / (EMERGENCY_HOLD + EMERGENCY_DARK),
  // Fraction of a cycle a single lamp may lag the circuit. NFPA 72 says 10ms
  // across an entire building; at this period that rounds to nothing at all.
  jitter: 0,
  // Reduced flash is not the strobe slowed down — a slow breathe is still a
  // flash. It runs its own long period and never inherits this one.
  reducedPeriod: 6.0,
});

function stableLightHash(id) {
  let hash = 2166136261;
  const text = String(id || 'emergency');
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function emergencyBlinkState(id, timeSec = 0, { effectsMode = 'full' } = {}) {
  const hash = stableLightHash(id);
  const { period, duty, jitter } = EMERGENCY_CADENCE;
  // Added, not subtracted: a lamp LEADS the circuit by its own ballast's margin,
  // which keeps the whole rig energised at t=0 and leaves the deterministic
  // photometry of a still frame unchanged. Visually a lead and a lag are the
  // same ragged edge.
  const lag = ((hash & 0xffff) / 0xffff) * jitter * period;
  const cycleTime = Math.max(0, Number(timeSec) || 0) + lag;
  const pulseIndex = Math.floor(cycleTime / period);
  const phase = (cycleTime - pulseIndex * period) / period;
  const mode = ['full', 'reduced', 'off'].includes(effectsMode) ? effectsMode : 'full';
  const snappedOn = phase < duty;

  // REDUCED FLASH IS NOT NO FLASH.
  //
  // Both softened modes used to return a flat scale of 1, which means a player
  // who turns FLASH / STROBE down — or ticks Reduce Flash in the desktop menu —
  // gets the emergency circuit pinned permanently at full red. In the concert
  // hall, where six of these lamps overlap, that is a room bathed in unchanging
  // red with no cadence in it at all: the accessibility setting silently deleted
  // the effect and left only the glare, which is the worst of both.
  //
  // So reduced keeps a cadence and throws away the strobe: one slow raised
  // cosine at half the circuit's rate, no edges anywhere in it.
  //
  // The depth is deliberate. A first attempt floored this at .42 — a 2.4:1
  // modulation — which is so shallow it still reads as "the lights do not
  // flash", i.e. the original complaint with the pin removed and nothing put in
  // its place. Nothing about photosensitivity requires a floor that high: the
  // clinical threshold is a matter of TRANSITION RATE, three hertz and up, and
  // this is a 0.11Hz cosine with no edge in it at any depth. So it runs a real
  // 4.5:1 and the room visibly breathes; what makes it safe is the shape, which
  // the spec pins by asserting no two consecutive frames may jump.
  //
  // Off is the real opt-out and stays steady. It sits below full rather than at
  // the beat's time-average, and it is a fixed number rather than a function of
  // duty — a player who asked for less flash asked for less flash, and retiming
  // the hold must not quietly rebrighten or darken their building.
  const breathePhase = (Math.max(0, Number(timeSec) || 0) % EMERGENCY_CADENCE.reducedPeriod)
    / EMERGENCY_CADENCE.reducedPeriod;
  const breathe = .61 + .39 * Math.cos(breathePhase * Math.PI * 2);
  const scale = mode === 'full' ? (snappedOn ? 1 : 0)
    : mode === 'reduced' ? breathe
    : .55;
  // If the red is on, the frightening part is on. Shadow selection downstream
  // still admits only one practical to the single shadow-map pass.
  const shadowReveal = mode === 'off' ? 0
    : mode === 'reduced' ? breathe
    : (snappedOn ? 1 : 0);

  return Object.freeze({
    scale,
    shadowReveal,
    pulseIndex,
    phase,
    period,
  });
}

// THE CLOCK THE APPARITIONS MOVE ON.
//
// They drift slowly while you can see them and faster while the circuit is dark,
// so between two red beats a silhouette has plainly moved and you never once
// catch it moving. That is the whole trick, and it has to be a pure function of
// wall-clock time because the light runtime holds no state between frames — so
// the warp is integrated in closed form off the shared cadence above.
//
// Steady (reduced/off) effects get an unwarped clock: with no dark beat to hide
// in there is nothing to hide, and a lamp that never blinks must not imply one.
//
// THIS IS CALIBRATED AGAINST EMERGENCY_DARK, NOT AGAINST THE PERIOD. The
// quantity that has to stay constant is how far a body MOVES between two
// flashes — about twenty centimetres, plainly different and never caught in the
// act — and that is haste × the dark window alone. Lengthening the hold to
// 1.75s therefore does not buy the figures any hidden travel; the explicit 9x
// dark haste below is what makes the next pose legibly different.
//
// The cost of the long hold is paid here and is worth naming: a 1.75s look is
// 8-9cm of drift you are watching happen, against 2.6cm at the old half-second
// dwell. Below the threshold at which a distant silhouette reads as moving, but
// it is no longer nothing, and it is the reason the hold is 1.75 and not 3.
export const EMERGENCY_DARK_HASTE = 9.0;

export function emergencyWanderClock(timeSec = 0, { effectsMode = 'full' } = {}) {
  const time = Math.max(0, Number(timeSec) || 0);
  const mode = ['full', 'reduced', 'off'].includes(effectsMode) ? effectsMode : 'full';
  if (mode !== 'full') return time;
  const { period, hold: lit, dark } = EMERGENCY_CADENCE;
  const perCycle = lit + dark * EMERGENCY_DARK_HASTE;
  const cycles = Math.floor(time / period);
  const into = time - cycles * period;
  const partial = into <= lit ? into : lit + (into - lit) * EMERGENCY_DARK_HASTE;
  return cycles * perCycle + partial;
}

export function resolveLocalLights(context, {
  timeSec = 0,
  reducedFlash = false,
  effectsMode = null,
  towerCleared = false,
  towerActive = false,
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
  const resolvedEffectsMode = effectsMode || (reducedFlash ? 'reduced' : 'full');
  const out = [];
  for (const light of rig) {
    if (Number.isFinite(zone) && light.zones.length && !light.zones.includes(zone)) continue;
    if (light.phase === 'tower' && !towerActive) continue;
    if (light.phase === 'cleared' && !towerCleared) continue;
    if (!lightHasRuntimePower(light, live)) continue;
    let intensity = light.intensity;
    const blink = light.kind === LIGHT_KIND.EMERGENCY
      ? emergencyBlinkState(light.id, timeSec, { effectsMode: resolvedEffectsMode })
      : null;
    if (light.flutter && light.kind !== LIGHT_KIND.EMERGENCY) intensity = resolvedEffectsMode !== 'full'
      ? light.flutter.steady
      : Math.min(LIGHT_BANDS[light.kind][1], light.intensity + flutter * light.flutter.amount);
    if (blink) intensity *= blink.scale;
    const anchored = light.anchorPropId && typeof anchorPosition === 'function'
      ? anchorPosition(light.anchorPropId)
      : null;
    const offset = light.anchorOffset || [0,0,0];
    const spilling = Number.isFinite(light.home) && Number.isFinite(zone) && zone !== light.home;
    const sourceZone = Number.isFinite(light.home)
      ? light.home
      : (light.zones.length === 1 ? light.zones[0] : zone);
    out.push({
      id: light.id,
      x: anchored ? anchored.x + offset[0] : light.x,
      y: anchored ? anchored.y + offset[1] : light.y,
      z: anchored ? anchored.z + offset[2] : light.z,
      color: light.color,
      intensity: spilling ? intensity * SPILL_INTENSITY : intensity,
      radius: spilling ? light.radius * SPILL_REACH : light.radius,
      penetration: spilling ? Math.min(light.penetration || 0, SPILL_PENETRATION) : (light.penetration || 0),
      spilling,
      sourceZone,
      kind: light.kind,
      circuit: light.circuit,
      powerMode: light.powerMode,
      maintained: light.maintained,
      anchorPropId: light.anchorPropId || null,
      floorY: Number.isFinite(anchored?.floorY) ? anchored.floorY : (light.y - 1.8),
      anchorYaw: Number.isFinite(anchored?.yaw) ? anchored.yaw : null,
      nominalIntensity: light.intensity,
      emissiveScale: blink?.scale ?? 1,
      emergencyPulse: blink?.scale ?? null,
      shadowReveal: blink?.shadowReveal ?? 0,
      pulseIndex: blink?.pulseIndex ?? null,
      castsShadow: !!light.castsShadow,
      zone: Number.isFinite(zone) ? zone : 0,
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
