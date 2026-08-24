import assert from 'node:assert/strict';

import { ZONE } from '../src/data/floorplan/legend.js';
import {
  isExteriorObserver,
  isLoadingBaySightlineProp,
  shouldHideCrossEnvelopeProp,
} from '../src/game/prop-visibility.js';
import { propInstanceVisible } from '../src/render/props3d.js';

// ASKED OF THE ZONE NOW. The old fixtures were coordinates, and the second one
// was the bug in miniature: physical (65,7.5) is the loading bay APRON, which is
// authored as weather and which the renderer's own test calls exterior — but the
// positional box called it interior, hid the elevation, and left sixteen cells of
// see-through building at the opening spawn. A genuinely interior observer is
// somewhere with an interior zone.
const outside={observerZone:ZONE.dock};
const inside={observerZone:ZONE.foyer};

assert.equal(isExteriorObserver({zone:ZONE.dock}),true,'the yard and the apron are both weather');
assert.equal(isExteriorObserver({zone:ZONE.street}),true);
assert.equal(isExteriorObserver({zone:ZONE.foyer}),false);
assert.equal(isExteriorObserver({zone:ZONE.hall}),false);
// The church is its own zone and is NOT outdoors — see OUTDOOR_ZONES.
assert.equal(isExteriorObserver({zone:ZONE.church}),false);
assert.equal(isLoadingBaySightlineProp({id:'dock-chandelier-frame'}),true);
assert.equal(isLoadingBaySightlineProp({id:'bay-apron-route-board'}),true);
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5},outside),false);
assert.equal(shouldHideCrossEnvelopeProp({id:'dock-chandelier-frame',mesh:'tower_frame',x:69,z:6.25},outside),false,'open loading-bay dressing survives the exterior envelope filter');
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-apron-route-board',mesh:'notice_board',x:51.5,z:4.05},outside),false,'apron wall fixtures survive the exterior envelope filter');
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-getin-sightline',mesh:'getin_sightline_shell',x:53,z:7.5},outside),false,
  'the aligned Get-In shell closes the room through the exterior aperture');
assert.equal(shouldHideCrossEnvelopeProp({id:'main-open-well-stair',mesh:'main_open_well_stair',x:63,z:37},outside),true,'deep interior structure cannot leak through exterior courts');
assert.equal(shouldHideCrossEnvelopeProp({id:'yard-van',mesh:'yard_van',x:16,z:4.8},outside),false);
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5},inside),true,'exterior facade cannot cross the interior camera');
assert.equal(shouldHideCrossEnvelopeProp({id:'dock-chandelier-frame',mesh:'tower_frame',x:69,z:6.25},inside),false);
assert.equal(shouldHideCrossEnvelopeProp({id:'bay-getin-sightline',mesh:'getin_sightline_shell',x:53,z:7.5},inside),true,
  'the sightline stand-in yields to the real floorplan walls indoors');

// THE SHELL IS NOT A POINT.
//
// Being allowed past the cross-envelope filter is only half of being drawn: the
// prop pass culls on distance too, and it used to measure that from the
// instance's ORIGIN. `bay-west-elevation` is the entire visible envelope of
// Ellery, eighty-eight metres of it, addressed by one point down in the
// loading-bay corner — so from the south street, the east street and the whole
// south-east of the ring the building simply stopped being drawn. These are the
// three viewpoints that were broken, in metres, against the real bounds.
{
  const shell={id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5};
  for(const [name,x,z] of [['south street',64,99],['east street',135,46],['south-east ring corner',135,99]]){
    assert.equal(propInstanceVisible(shell,[x,0,z]),true,`the conservatoire shell is culled from the ${name}`);
  }
  // And the reach is still a reach: it is the mesh's own footprint, not a
  // licence for everything to be drawn from anywhere.
  assert.equal(propInstanceVisible(shell,[400,0,400]),false,'the shell is not drawn from the next district');
  assert.equal(propInstanceVisible({id:'c',mesh:'chair',x:50,z:7.5},[64,0,99]),false,'ordinary props still cull at ninety metres');
}

// THE APRON, WHICH IS THE WHOLE BUG.
//
// Sixteen cells of the loading bay are authored as weather and stand inside the
// building's footprint. physicalRenderPlanFor removes the ray-marched walls
// there because the zone is outdoors; if this file disagrees and calls the same
// observer interior, it also removes the elevation mesh, and the player is left
// standing in a building with neither. Both must say outdoors.
{
  const apron={observerZone:ZONE.dock};
  assert.equal(isExteriorObserver({zone:apron.observerZone}),true,'the apron is weather — the renderer already treats it as such');
  assert.equal(shouldHideCrossEnvelopeProp({id:'bay-west-elevation',mesh:'conservatory_west_elevation',x:50,z:7.5},apron),false,
    'the shell must be drawn on the apron, or there is nothing between the player and the interior');
  assert.equal(shouldHideCrossEnvelopeProp({id:'main-open-well-stair',mesh:'main_open_well_stair',x:63,z:37},apron),true,
    'and the interior must not be, or the building is see-through from the opening spawn');
  // The bay's own dressing is the deliberate exception: it is an open aperture.
  assert.equal(shouldHideCrossEnvelopeProp({id:'dock-chandelier-frame',mesh:'tower_frame',x:69,z:6.25},apron),false);
}

console.log('cross-envelope prop visibility tests ok');
