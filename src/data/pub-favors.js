// The ordinary objects Iona asks about have authored homes. Removing one for
// a favor and restoring it after loading uses the same prop id and exact pose.
import { districtLogicalAt } from './exterior-district.js';
import { EXTERIOR_PUB } from './exterior-pub.js';
import { PUB_SERVICE_TRAY } from './pub-population.js';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
export const PUB_FAVOR_MESHES = freeze({
  pub_service_tray_loaded: { w: .394, d: .394, h: .117, blocks: false },
  pub_service_tray_empty: { w: .394, d: .394, h: .145, blocks: false },
  pub_bottle_opener: { w: .046, d: .164, h: .013, blocks: false },
  pub_order_book: { w: .138, d: .20, h: .028, blocks: false },
});

const prop = (id, mesh, x, y, extra) => ({
  id, mesh, x, y, yaw: 0, scale: 1, interactive: true, structural: true, blocks: false,
  renderOffsetX: x - Math.round(x * 2) / 2,
  renderOffsetZ: y - Math.round(y * 2) / 2,
  interactionPriority: 6, ...extra,
});
const trayAt = districtLogicalAt(PUB_SERVICE_TRAY.x, PUB_SERVICE_TRAY.y);
const trayInspect = districtLogicalAt(PUB_SERVICE_TRAY.inspectAt.x, PUB_SERVICE_TRAY.inspectAt.y);
const trayApproach = districtLogicalAt(PUB_SERVICE_TRAY.approach.x, PUB_SERVICE_TRAY.approach.y);

export const PUB_FAVOR_PROPS = freeze([
  prop('pub-service-tray', 'pub_service_tray_loaded', trayAt.x, trayAt.y, {
    action: 'pub-service-tray', label: 'Iona’s tray with two waters',
    floorOverride: EXTERIOR_PUB.floor, elevation: PUB_SERVICE_TRAY.elevation,
    inspectAt: trayInspect, pubApproachAt: trayApproach,
    renderGroups: ['ground'], worldAligned: true, pubSupportId: 'pub-counter',
  }),
  // Counter-local(.40,.10), safely on the dry top beside the mugs, beyond the
  // sink cutout and kettle. Its name stamp faces up, matching the mesh origin.
  // Explicit height is intentional: the generated generic surface catalogue
  // currently selects this counter's low plinth instead of its dry worktop.
  prop('pub-favor-opener', 'pub_bottle_opener', 18.2, 271.8, {
    yaw: Math.PI / 2, action: 'pub-favor', pubFavorId: 'opener', label: 'the bottle opener marked LYRIC',
    floorOverride: 10, elevation: .9425, renderGroups: ['academic'],
    inspectAt: { x: 17.85, y: 271.8 }, pubApproachAt: { x: 17.25, y: 271.75 },
    pubSupportId: 'amenity-staff-tea-counter',
  }),
  // The front-right corner of the existing desk, clear of the phone at
  //93.90,9.12 and the returns tray to the west. A typed .53m uses the actual
  // desktop; generic `on:` snapping would choose the .47m lower face here.
  prop('pub-favor-orderbook', 'pub_order_book', 93.85, 8.83, {
    action: 'pub-favor', pubFavorId: 'orderbook', label: 'The Lyric’s brown order book',
    floorOverride: 0, elevation: .53, renderGroups: ['ground'],
    inspectAt: { x: 94.1, y: 9.05 }, pubApproachAt: { x: 94.75, y: 9.25 },
    pubSupportId: 'box-office-desk',
  }),
]);
export const PUB_FAVOR_FIXTURES = freeze(Object.fromEntries(PUB_FAVOR_PROPS.map(entry => [entry.id, entry])));
export const pubFavorFixture = id => PUB_FAVOR_FIXTURES[String(id || '')] || null;
