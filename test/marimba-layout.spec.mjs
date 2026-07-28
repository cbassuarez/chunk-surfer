import assert from 'node:assert/strict';
import {
  MARIMBA_ACCIDENTAL_AFTER,
  MARIMBA_LOWER_BAR_COUNT,
  MARIMBA_NATURAL_SPACING,
  marimbaAccidentalGroups,
  marimbaAccidentalX,
  marimbaNaturalX,
} from '../src/data/marimba-layout.js';

assert.equal(MARIMBA_LOWER_BAR_COUNT,17);
assert.deepEqual(MARIMBA_ACCIDENTAL_AFTER,[0,1,3,4,5,7,8,10,11,12,14,15]);
assert.deepEqual(marimbaAccidentalGroups(),[[0,1],[3,4,5],[7,8],[10,11,12],[14,15]],
  'accidentals form correct two- and three-bar chromatic groups');
for(const index of MARIMBA_ACCIDENTAL_AFTER){
  const midpoint=(marimbaNaturalX(index)+marimbaNaturalX(index+1))/2;
  assert.ok(Math.abs(marimbaAccidentalX(index)-midpoint)<1e-12,`accidental after natural ${index} is centered`);
}
const gaps=MARIMBA_ACCIDENTAL_AFTER.slice(1).map((index,i)=>
  +(marimbaAccidentalX(index)-marimbaAccidentalX(MARIMBA_ACCIDENTAL_AFTER[i])).toFixed(6));
assert.equal(gaps.filter((gap)=>Math.abs(gap-MARIMBA_NATURAL_SPACING*2)<1e-6).length,4,
  'E-F and B-C omissions create four visible upper-manual gaps');
assert.ok(gaps.every((gap)=>Math.abs(gap-MARIMBA_NATURAL_SPACING)<1e-6||Math.abs(gap-MARIMBA_NATURAL_SPACING*2)<1e-6));

console.log('marimba chromatic upper-manual spacing contracts passed');
