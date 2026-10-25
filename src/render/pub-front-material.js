// The Lyric's existing two deeds stand outdoors but share a mesh with six
// closed shops. Give only their outward-facing skin the sky already used by
// the yard; this is incident light, never an emissive sign or exposure change.
import { EXTERIOR_PUB } from '../data/exterior-pub.js';
import { ZONE } from '../data/floorplan/legend.js';

export const PUB_FRONT_SKY = Object.freeze({
  mesh: 'exterior_pub_frontage',
  zones: Object.freeze([ZONE.street, ZONE.civicCourt, ZONE.dock, ZONE.pub]),
  x0: EXTERIOR_PUB.bounds.x0 - .25,
  x1: EXTERIOR_PUB.bounds.x1 + .25,
  z0: EXTERIOR_PUB.frontWorldZ - 1.90,
  z1: EXTERIOR_PUB.bounds.z1 + .20,
  floor: EXTERIOR_PUB.floor - .05,
  top: 17.25,
  frontLimit: EXTERIOR_PUB.frontWorldZ + .25,
  sideLimit: .30,
  roofMinimum: EXTERIOR_PUB.floor + 12.5,
});

export function pubFrontSkyEligible(mesh, instances = []) {
  return mesh === PUB_FRONT_SKY.mesh && instances.length > 0
    && instances.every(instance => PUB_FRONT_SKY.zones.includes(Number(instance.zone)));
}

// The CPU witness mirrors the fragment test, including the viewed normal.
// From inside, the two-sided renderer turns a wall normal toward the room;
// it must not make that interior face an outdoor hemisphere receiver.
export function pubFrontSkySurface(point, normal, enabled = true) {
  const c = PUB_FRONT_SKY;
  if (!enabled || point.x < c.x0 || point.x > c.x1 || point.z < c.z0 || point.z > c.z1
    || point.y < c.floor || point.y > c.top) return false;
  return (point.z <= c.frontLimit && normal.z < -.05)
    || (point.x <= EXTERIOR_PUB.bounds.x0 + c.sideLimit && normal.x < -.05)
    || (point.x >= EXTERIOR_PUB.bounds.x1 - c.sideLimit && normal.x > .05)
    || (point.z >= EXTERIOR_PUB.bounds.z1 - c.sideLimit && normal.z > .05)
    || (point.y >= c.roofMinimum && normal.y > .05);
}

const f = number => Number.isInteger(number) ? `${number}.0` : String(number);
export const PUB_FRONT_SKY_GLSL = `
bool pubFrontSkySurface(float enabled, vec3 point, vec3 normal) {
  if(enabled<.5||point.x<${f(PUB_FRONT_SKY.x0)}||point.x>${f(PUB_FRONT_SKY.x1)}
    ||point.z<${f(PUB_FRONT_SKY.z0)}||point.z>${f(PUB_FRONT_SKY.z1)}
    ||point.y<${f(PUB_FRONT_SKY.floor)}||point.y>${f(PUB_FRONT_SKY.top)})return false;
  return (point.z<=${f(PUB_FRONT_SKY.frontLimit)}&&normal.z<-.05)
    ||(point.x<=${f(EXTERIOR_PUB.bounds.x0 + PUB_FRONT_SKY.sideLimit)}&&normal.x<-.05)
    ||(point.x>=${f(EXTERIOR_PUB.bounds.x1 - PUB_FRONT_SKY.sideLimit)}&&normal.x>.05)
    ||(point.z>=${f(EXTERIOR_PUB.bounds.z1 - PUB_FRONT_SKY.sideLimit)}&&normal.z>.05)
    ||(point.y>=${f(PUB_FRONT_SKY.roofMinimum)}&&normal.y>.05);
}
`;

// The existing, unlit high-metallic gilt reduced to isolated glints after
// acquisition. Ordinary house lettering is now warm matte paint. The opaque
// field, exact glyph coverage/UVs, relief and brass architectural fittings stay
// as authored; no light is manufactured by this material.
export const PUB_FASCIA_PAINT = Object.freeze({
  materialName: 'physical print: institution: aged gilt pub fascia lettering',
  process: 'aged gilt pub fascia lettering',
  color: Object.freeze([.78, .69, .48]),
  metallic: 0,
  roughness: .78,
});

export function pubFrontFasciaEligible(mesh, primitive, instances = []) {
  const print = primitive?.printedSurface;
  return pubFrontSkyEligible(mesh, instances)
    && primitive?.materialName === PUB_FASCIA_PAINT.materialName
    && print?.coverage === 'baseColorAlpha'
    && print?.polarity === 'light-on-dark'
    && print?.process === PUB_FASCIA_PAINT.process
    && print?.emission === 'none';
}

export function pubFrontFasciaSample({ base, metallic, roughness, coverage, enabled = true }) {
  const a = enabled ? Math.max(0, Math.min(1, Number(coverage) || 0)) : 0;
  return {
    base: base.map((v, i) => v + (PUB_FASCIA_PAINT.color[i] - v) * a),
    metallic: metallic + (PUB_FASCIA_PAINT.metallic - metallic) * a,
    roughness: roughness + (PUB_FASCIA_PAINT.roughness - roughness) * a,
  };
}

export const PUB_FASCIA_PAINT_GLSL = `
  if(uPubFasciaPaint>.5){
    float fasciaPigment=clamp(printedCoverage,0.0,1.0);
    base=mix(base,vec3(${PUB_FASCIA_PAINT.color.map(f).join(',')}),fasciaPigment);
    metal=mix(metal,${f(PUB_FASCIA_PAINT.metallic)},fasciaPigment);
    rough=mix(rough,${f(PUB_FASCIA_PAINT.roughness)},fasciaPigment);
  }
`;
