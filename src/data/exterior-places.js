// Where am I, outdoors? Names come from the block plan, not from a floor zone:
// every paved exterior cell used to report "municipal park" and every street
// "Ellery west road". Physical metres in, a place name out (or null).
import {exteriorStreetAt} from './exterior-district.js';
import {ELLERY_SQUARE} from './ellery-square.js';
import {YARD_PARK_RAIN_BOUNDS} from './exterior-district.js';

export const EXTERIOR_PLACE_NAMES=Object.freeze({
  'north-street':'North Street','west-street':'West Street','east-street':'East Street','south-street':'Chapel Street',
  'west-mews-court':'West Mews','east-workshop-court':'Workshop Court','south-pub-yard':'Lyric Yard',
});
const inside=(r,x,z)=>x>=r.x0&&x<r.x1&&z>=r.z0&&z<r.z1;

export function exteriorPlaceAt(x,z){
  if(!Number.isFinite(x)||!Number.isFinite(z))return null;
  if(inside(ELLERY_SQUARE.bounds,x,z))return ELLERY_SQUARE.name;
  const p=YARD_PARK_RAIN_BOUNDS;
  if(x>=p.x0&&x<=p.x1&&z>=p.y0&&z<=p.y1)return 'the park';
  const street=exteriorStreetAt(Math.floor(x),Math.floor(z));
  return street?EXTERIOR_PLACE_NAMES[street.id]||null:null;
}
