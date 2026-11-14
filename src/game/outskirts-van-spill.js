export const OUTSKIRTS_VAN_SPILL_ASSETS = Object.freeze(['assets/source-return/fauna.glb']);
export const OUTSKIRTS_SPILL_WATER = Object.freeze({
  fall: 'outskirts_fountain_fall',
  splash: 'outskirts_fountain_splash',
});

const FISH_MESHES = Object.freeze(['source_return_fish_body', 'source_return_fish_fins']);
const SPILL_YAW = .67;
const ROAD_CONTACT = .25;

// Release time, position on the lip, and exit velocity. The first fish slips
// out behind the initial water, toward the open lane where it clears the
// silhouette of the door. The stronger second wash carries the others.
const FISH = Object.freeze([
  { at: .34, lip: -.24, drift: .65, speed: 4.2, lift: .12, size: .96 },
  { at: .88, lip: .17, drift: .86, speed: 4.7, lift: .46, size: 1.15 },
  { at: .98, lip: -.12, drift: -1.36, speed: 5.2, lift: .34, size: .89 },
  { at: 1.12, lip: .26, drift: 1.87, speed: 3.8, lift: .17, size: .79 },
  { at: 1.24, lip: -.18, drift: -.22, speed: 4.3, lift: .23, size: 1.02 },
  { at: 1.52, lip: .19, drift: 1.19, speed: 3.25, lift: .06, size: .77 },
  { at: 1.79, lip: -.21, drift: -.87, speed: 2.7, lift: .06, size: .74 },
]);

const clamp = t => Math.max(0, Math.min(1, t));
function ease(t) {
  const p = clamp(t);
  return p * p * (3 - 2 * p);
}
const easeOut = t => 1 - (1 - clamp(t)) ** 2;

function flowPoint(outlet, localX, localZ) {
  const yaw = outlet.yaw + SPILL_YAW;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: outlet.x + c * localX + s * localZ, z: outlet.z - s * localX + c * localZ, yaw };
}

function wetFront(elapsed) {
  return easeOut((elapsed - ROAD_CONTACT) / 2.25);
}

export function outskirtsVanSpillPuddle(elapsed, outlet) {
  if (!outlet || !Number.isFinite(elapsed) || elapsed <= ROAD_CONTACT) return null;
  const spread = wetFront(elapsed);
  const centre = flowPoint(outlet, .18 * spread, 1.08 + 1.62 * spread);
  return [centre.x, centre.z, 2.18 * spread];
}

// Body and fin extents of the existing fauna model, used only for road contact.
function fishClearance(pitch, roll, size) {
  const x = Math.cos(pitch) * Math.sin(roll), y = Math.cos(pitch) * Math.cos(roll), z = -Math.sin(pitch);
  const body = Math.hypot(.075 * x, .125 * y, .39 * z) + .025 * z;
  const tail = .18 * Math.abs(y) - .53 * z;
  const dorsalFin = -.23 * y - .12 * z;
  const bottomFin = .17 * y - .18 * z;
  const sideFins = .17 * Math.abs(x) + .06 * y + .025 * z;
  return Math.max(body, tail, dorsalFin, bottomFin, sideFins) * size + .012;
}

/** The rear cargo lip supplies a finite jet, with a grounded aftermath. */
export function outskirtsVanSpillInstances({elapsed, outlet, restOutlet = outlet, floor, reducedMotion = false, matrix, zone}) {
  if (!outlet || !Number.isFinite(elapsed) || elapsed <= 0) return [];
  const props = [];
  const liveHeight = Math.max(.28, outlet.y - floor);
  const sillHeight = Math.max(.28, restOutlet.y - floor);
  const draw = (origin, id, mesh, localX, localY, localZ, options, emissive, groundWater = false) => {
    const at = flowPoint(origin, localX, localZ);
    const transform = matrix({ ...at, y: floor + localY, ...options });
    props.push({id: `outskirts-van-spill:${id}`, mesh, matrix: transform, zone,
      sourceStructure: 'outskirts', structural: false, noShadow: true, noReflection: groundWater, emissive});
  };

  const firstWash = .52 * ease(elapsed / .17) * (1 - ease((elapsed - .48) / .67));
  const secondWash = .84 * ease((elapsed - .53) / .37) * (1 - ease((elapsed - 1.28) / 1.83));
  const flow = firstWash + secondWash;
  if (flow > .024) {
    const drop = easeOut(elapsed / ROAD_CONTACT);
    const reach = (2.75 + 5.5 * flow) * drop;
    // The selected fountain strand is 1.60 m tall. Its lower end reaches
    // the road as the first wash hits, while its top follows the cargo sill.
    draw(outlet, 'sheet-main', OUTSKIRTS_SPILL_WATER.fall, 0, liveHeight, 0,
      { scaleX: 1.62 * flow, scaleY: (liveHeight - .009) * drop / 1.60, scaleZ: reach },
      [.69, .75, .78, .16 + .18 * flow], true);
    if (elapsed > ROAD_CONTACT) {
      draw(outlet, 'sheet-side', OUTSKIRTS_SPILL_WATER.fall, .26, liveHeight - .02, .035,
        { yaw: outlet.yaw + SPILL_YAW + .15, scaleX: .88 * flow, scaleY: (liveHeight - .029) * drop / 1.60, scaleZ: reach * .89 },
        [.65, .71, .74, .09 + .13 * flow], true);
    }
  }

  // Each wash loses its crown once it spreads along the tarmac. Nothing loops
  // back to the sill after crossing the wet edge.
  const splashes = reducedMotion ? 4 : 7;
  for (let index = 0; index < splashes; index++) {
    const start = ROAD_CONTACT + (index < 3 ? index * .09 : .52 + (index - 3) * .10);
    const age = elapsed - start;
    if (age < 0 || age >= 1.12) continue;
    const life = ease(age / .11) * (1 - ease((age - .15) / .97));
    if (life < .025) continue;
    const travel = easeOut(age / 1.12);
    const distance = Math.min(1.08 + 3.8 * wetFront(elapsed), .89 + travel * (1.75 + index % 4 * .32));
    const side = Math.sin(index * 2.399963) * (.18 + travel * 1.10);
    const width = .43 + travel * .72;
    draw(restOutlet, `splash-${index}`, OUTSKIRTS_SPILL_WATER.splash, side, .008, distance,
      { scaleX: width, scaleY: .035 + .39 * life, scaleZ: width * 1.35, yaw: restOutlet.yaw + SPILL_YAW + index * .67 },
      [.75, .80, .81, life * .31], true);
  }

  for (const [index, fish] of FISH.entries()) {
    const { at, lip, drift, speed, lift, size } = fish;
    const age = elapsed - at;
    if (age < 0) continue;
    const startY = sillHeight + .018;
    const gravity = 9.81;
    const bottom = .18 * size;
    const landing = (lift + Math.sqrt(lift * lift + 2 * gravity * Math.max(.1, startY - bottom))) / gravity;
    const air = Math.min(landing, age);
    const onRoad = Math.max(0, age - landing);
    const slide = easeOut(onRoad / .71) * (.18 + speed * .018);
    const twitchAge = onRoad - .18 - .08 * (index % 4);
    const twitch = reducedMotion || twitchAge < 0 || twitchAge > 1.35 ? 0
      : Math.sin(twitchAge * (13 + index * 1.1)) * ease(twitchAge / .14) * (1 - ease(twitchAge / 1.35));
    const heading = Math.PI + Math.atan2(drift, speed) + Math.sin(index * 1.7) * (.14 + .65 * ease(onRoad));
    const pitch = Math.atan2(lift - gravity * air, speed) * (1 - ease((air / landing - .58) / .42));
    const roll = Math.sign(drift) * (1.47 * ease((air + onRoad * .7) / (landing + .25)) + twitch * .48);
    const support = fishClearance(pitch, roll, size);
    const y = onRoad > 0 ? support + Math.abs(twitch) * .034
      : Math.max(support, startY + lift * air - .5 * gravity * air * air);
    const glint = .14 + .07 * Math.abs(Math.sin(roll)) * (1 - ease(onRoad / 1.15));
    for (const [part, mesh] of FISH_MESHES.entries()) {
      draw(restOutlet, `fish-${index}-${part}`, mesh, lip + drift * (air + slide), y,
        (air + slide) * speed, { yaw: restOutlet.yaw + SPILL_YAW + heading, pitch, roll, scaleX: size, scaleY: size, scaleZ: size },
        [.81, .83, .79, glint * (part === 0 ? 1 : .72)]);
    }
  }
  return props;
}
