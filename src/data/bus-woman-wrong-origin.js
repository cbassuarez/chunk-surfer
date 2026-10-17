// Thirteen remembered appearances, in road order. This is an authored sequence:
// a later copy inherits the same wrong force path, rather than rolling damage.
// Runtime is the single owner of these permanent joint origins. The skin is
// rest-bound to the canonical arm; the sculpt supplies the receiving cavity.
const ORIGINS = Object.freeze([
  Object.freeze({ shoulder:Object.freeze([0,0,0]), jaw:Object.freeze([0,0,0]) }),
  Object.freeze({ shoulder:Object.freeze([0,0,0]), jaw:Object.freeze([0,0,0]) }),
  Object.freeze({ shoulder:Object.freeze([0,0,0]), jaw:Object.freeze([0,0,0]) }),
  Object.freeze({ shoulder:Object.freeze([-.025,-.018,-.018]), jaw:Object.freeze([0,0,0]) }),
  Object.freeze({ shoulder:Object.freeze([-.048,-.034,-.038]), jaw:Object.freeze([.010,-.008,-.010]) }),
  Object.freeze({ shoulder:Object.freeze([-.080,-.058,-.065]), jaw:Object.freeze([.018,-.012,-.020]) }),
]);
const entry = (stretch, stage, transmission, restraint, jaw, action) => Object.freeze({
  stretch, stage, transmission, restraint, jaw, action,
  origin:ORIGINS[stage],
  mesh: stage === 0 ? 'outskirts_bus_woman' : `outskirts_bus_woman_wrong_origin_${stage}`,
});
export const BUS_WOMAN_WRONG_ORIGIN_RETURNS = Object.freeze([
  entry(0, 0, 0, 0, 0, 'An ordinary economical search. Nothing elsewhere answers the grip.'),
  entry(1, 0, .18, .05, 0, 'The first closure pulls her shoulder. She stops to check the hand.'),
  entry(2, 1, .28, .12, 0, 'She tests the same closure, holds, then tries with less of the hand.'),
  entry(3, 1, .36, .20, .02, 'The displaced wrist-to-chest route tightens under an otherwise useful action.'),
  entry(4, 2, .46, .30, .08, 'She interrupts the pocket reach before the full contraction.'),
  entry(5, 2, .54, .40, .15, 'She braces her hand before allowing herself to look.'),
  entry(6, 2, .62, .48, .23, 'Bag weight is ordinary; she supports it around the injured connection.'),
  entry(7, 3, .72, .58, .48, 'The arm begins inside the pectoral route. She holds the first reach, protects it, then retries with less.'),
  entry(8, 3, .78, .67, .62, 'The restrained search checks the real pocket; the returned ticket needs fewer fingers.'),
  entry(9, 3, .84, .73, .78, 'The same contraction now draws the original jaw toward the useful hand.'),
  entry(10, 4, .90, .80, .88, 'Her shoulder begins farther inside her chest. She prepares a counterbrace before the remembered closure.'),
  entry(11, 4, .95, .86, .95, 'She preserves a deliberate gaze and a practiced two-finger courtesy around the displaced origin.'),
  entry(12, 5, 1, .94, 1, 'The arm starts in the opened chest and the jaw follows its useful hand. She chooses a smaller retry; the ticket ends the search.'),
]);

export const BUS_WOMAN_WRONG_ORIGIN_MESHES = Object.freeze([
  'outskirts_bus_woman_wrong_origin_1', 'outskirts_bus_woman_wrong_origin_2',
  'outskirts_bus_woman_wrong_origin_3', 'outskirts_bus_woman_wrong_origin_4',
  'outskirts_bus_woman_wrong_origin_5',
]);

export function busWomanWrongOriginReturn(stretch = 0) {
  const index = Math.max(0, Math.min(12, Math.trunc(Number(stretch) || 0)));
  return BUS_WOMAN_WRONG_ORIGIN_RETURNS[index];
}
