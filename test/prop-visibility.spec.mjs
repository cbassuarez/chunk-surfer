import assert from 'node:assert/strict';

import {
  isExteriorObserver,
  isLoadingBaySightlineProp,
  shouldHideCrossEnvelopeProp,
} from '../src/game/prop-visibility.js';

const outside={observerX:20,observerZ:7.5};
const inside={observerX:65,observerZ:7.5};

assert.equal(isExteriorObserver({x:20,z:7.5}),true);
assert.equal(isExteriorObserver({x:65,z:7.5}),false);
assert.equal(isLoadingBaySightlineProp({id:'dock-chandelier-frame'}),true);
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5},outside),false);
assert.equal(shouldHideCrossEnvelopeProp({id:'dock-chandelier-frame',mesh:'tower_frame',x:69,z:6.25},outside),false,'open loading-bay dressing survives the exterior envelope filter');
assert.equal(shouldHideCrossEnvelopeProp({id:'main-open-well-stair',mesh:'main_open_well_stair',x:63,z:37},outside),true,'deep interior structure cannot leak through exterior courts');
assert.equal(shouldHideCrossEnvelopeProp({id:'yard-van',mesh:'yard_van',x:16,z:4.8},outside),false);
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5},inside),true,'exterior facade cannot cross the interior camera');
assert.equal(shouldHideCrossEnvelopeProp({id:'dock-chandelier-frame',mesh:'tower_frame',x:69,z:6.25},inside),false);

console.log('cross-envelope prop visibility tests ok');
