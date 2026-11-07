// The dash in front of him. The cabin mesh has the right shapes in the right places and nothing
// on them; this is what's printed on them and what stands off them, the same way the radio is
// its own pack on its own bracket. Metres in cab space, so it lands on the cabin it was measured
// from (tools/chunk_surfer/source-drive-study/build-drive-cabin.py). No maker's name on any of it.
const freeze=Object.freeze;
const rows=list=>freeze(list.map(freeze));

export const CAB_DASH_PACK='assets/source-drive/cab-dash/cab-dash.glb';
// The parked cab reaches the same mesh through its own name, as the radio does.
export const CAB_DASH_MESHES=freeze(['drive_cabin_dash','opening_drive_cabin_dash']);

export const CAB_DASH=freeze({
  // The instrument face, just ahead of the old dials and just behind the needles (z -.626).
  cluster:freeze({x0:.296,x1:.704,y0:1.122,y1:1.302,z:-.6285}),
  // The dials sit exactly where the needles already pivot.
  speed:freeze({x:.575,y:1.207,r:.062,maxMph:90,sweep:2.261946710584651}),
  fuel:freeze({x:.385,y:1.207,r:.05,sweep:2.261946710584651}),
  lamps:rows([
    {id:'oil',x:.480,y:1.262,tint:'red'},{id:'battery',x:.480,y:1.236,tint:'red'},{id:'brake',x:.480,y:1.210,tint:'red'},
    {id:'indicator',x:.480,y:1.184,tint:'green'},{id:'beam',x:.480,y:1.158,tint:'blue'},
  ]),
  // The face of the fascia moulding.
  fascia:freeze({x0:-.84,x1:.84,y0:.935,y1:1.145,z:-.5985}),
  // Moulded panel breaks, as [x0,x1,y0,y1]. The glovebox one is the lid that's already there.
  panels:rows([[-.76,-.24,.968,1.122],[-.20,.15,.95,1.13],[.165,.335,.95,1.13],[.72,.825,.95,1.13]]),
  // Rockers beside the column, where a hand finds them without looking.
  rockers:rows([
    {id:'hazard',x:.198,y:1.092,w:.034,h:.046,tint:'red'},
    {id:'rear-screen',x:.246,y:1.092,w:.034,h:.046,tint:'amber'},
    {id:'fog',x:.294,y:1.092,w:.034,h:.046,tint:'amber'},
  ]),
  lampSwitch:freeze({x:.772,y:1.086,r:.024,proud:.020}),
  dimmer:freeze({x:.772,y:1.008,w:.022,h:.046,proud:.006}),
  lighter:freeze({x:.206,y:.992,r:.015,proud:.010}),
  ashtray:freeze({x:.276,y:.992,w:.082,h:.05,proud:.005}),
  blanks:rows([{x:-.13,y:1.09,w:.09,h:.03},{x:.05,y:.985,w:.15,h:.034}]),
  // The top of the moulding either side of the binnacle: (y,z) from the glass back to the lip.
  top:freeze({spans:rows([[-.84,.27],[.73,.84]]),profile:rows([[1.2835,-.968],[1.2665,-.79],[1.2465,-.58]])}),
  demisters:rows([{x0:-.70,x1:-.22,z0:-.925,z1:-.885},{x0:.0,x1:.22,z0:-.925,z1:-.885}]),
});
