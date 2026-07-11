// Fixed objects in the conservatory. Coordinates are authored metres, not
// runtime cells. A prop's sound belongs to the object, never to whichever zone
// or corridor happens to contain it.

const P = (id, mesh, x, y, yaw = 0, extra = {}) => ({ id, mesh, x, y, yaw, scale:1, ...extra });
const inspect = (first, again) => ({ first, again });
const play = (family, first, again) => ({ interaction:'play', sampleFamily:family, inspect:inspect(first,again) });

const MARIMBA = [
  {worldId:'amplifications',fileLabel:'amp-001'},
  {worldId:'amplifications',fileLabel:'amp-014'},
  {worldId:'amplifications',fileLabel:'amp-028'},
  {worldId:'amplifications',fileLabel:'amp-043'},
];
const PIANO = [
  {worldId:'main_b3',fileLabel:'03'},
  {worldId:'main_b3',fileLabel:'17'},
  {worldId:'main_b3',fileLabel:'31'},
  {worldId:'main_b3',fileLabel:'46'},
];
const STRINGS = [
  {worldId:'soundnoisemusic',fileLabel:'snm-001'},
  {worldId:'soundnoisemusic',fileLabel:'snm-019'},
  {worldId:'soundnoisemusic',fileLabel:'snm-037'},
  {worldId:'soundnoisemusic',fileLabel:'snm-053'},
];
const PERCUSSION = [
  {worldId:'amplifications',fileLabel:'amp-008'},
  {worldId:'amplifications',fileLabel:'amp-024'},
  {worldId:'amplifications',fileLabel:'amp-040'},
];
const CHAPEL = [
  {worldId:'lux_nova',fileLabel:'lux-001'},
  {worldId:'lux_nova',fileLabel:'lux-017'},
  {worldId:'lux_nova',fileLabel:'lux-033'},
  {worldId:'lux_nova',fileLabel:'lux-049'},
];

export const PROP_MESH = Object.freeze({
  school_desk:{w:.72,d:.78,blocks:true}, pew:{w:2.8,d:.72,blocks:true},
  chair:{w:.52,d:.56,blocks:false}, music_stand:{w:.45,d:.45,blocks:false},
  instrument_case:{w:1.25,d:.5,blocks:false}, equipment_cart:{w:1.2,d:.72,blocks:true},
  upright_piano:{w:1.55,d:.72,blocks:true}, grand_piano:{w:1.75,d:2.45,blocks:true},
  marimba:{w:2.8,d:1.05,blocks:true}, timpani:{w:.92,d:.92,blocks:true},
  cello:{w:.62,d:.42,blocks:false}, speaker_cabinet:{w:.64,d:.58,blocks:true},
  organ_console:{w:1.65,d:.88,blocks:true}, organ_pipes:{w:2.2,d:.36,blocks:true},
  equipment_rack:{w:.72,d:.7,blocks:true},
  violin:{w:.4,d:.3,blocks:false},
  portrait_frame:{w:.76,d:.12,blocks:false},
  hall_seating:{w:25.6,d:18.6,blocks:false},
  hall_structure:{w:29,d:37,blocks:false},
  chapel_vault:{w:12.5,d:34.5,blocks:false},
});

export const CONSERVATORY_PROPS = [
  // Loading dock / foyer: work furniture, not a showroom.
  P('dock-desk-1','school_desk',60.0,6.0,.15,{inspect:inspect('A school desk used as a signing table. The basket underneath is full of cable ties.','The cable ties are older than the desk.')}),
  P('foyer-pew-1','pew',82.0,7.0,Math.PI/2,{inspect:inspect('One chapel pew never made it upstairs. A paper removal tag is still tied to it.','The tag says RETURN TO CHAPEL.')}),
  P('foyer-cart-1','equipment_cart',88.5,14.0,0,{inspect:inspect('A percussion cart with one wheel wired straight.','It will only travel in a circle.')}),
  P('foyer-portrait-titian','portrait_frame',80.5,5.2,0,{elevation:1.35,portraitIndex:0,inspect:inspect('Titian. Portrait of a Man. A Met Open Access reproduction in an inexpensive gilt frame.','The sitter keeps looking past the entrance.')}),
  P('foyer-portrait-greco','portrait_frame',84.0,5.2,0,{elevation:1.35,portraitIndex:1,inspect:inspect('El Greco. Portrait of an Old Man. Someone has polished the glass more often than the frame.','His eyes catch the corridor light first.')}),

  // Studio B3: equipment, teaching overflow, and stacked desks against walls.
  P('b3-desk-1','school_desk',8.0,8.0,Math.PI/2,{inspect:inspect('A desk pushed into the dead corner, its writing surface stippled with old tape marks.','Nothing is written on it now.')}),
  P('b3-desk-2','school_desk',8.0,9.0,Math.PI/2,{inspect:inspect('Another desk nested behind the first. Surplus becomes acoustic treatment if nobody moves it.','Two desks, making one bad absorber.')}),
  P('b3-rack-1','equipment_rack',23.0,16.5,Math.PI/2,{inspect:inspect('The rack is powered down. Three channels are still labelled in pencil.','No mains. No pilot lights.')}),
  P('b3-speaker-1','speaker_cabinet',22.7,8.0,Math.PI/2,{...play(PIANO,'A nearfield monitor with its cone pushed in and pulled back out.','The cone remembers a thumb.')}),

  // Concert hall and its overflow. The grand is not an upright substitute.
  P('hall-structure','hall_structure',113.0,23.0,0,{interactive:false,structural:true}),
  P('hall-seating','hall_seating',113.0,23.0,0,{interactive:false,structural:true,elevation:-2.5,collisionMask:'hall-seating'}),
  P('hall-grand-1','grand_piano',113.0,8.0,Math.PI,{...play(PIANO,'A grand piano under a black cover, except the keyboard is exposed.','The keys are colder than the room.')}),
  P('hall-marimba-1','marimba',103.0,9.0,Math.PI/2,{...play(MARIMBA,'The concert marimba, brakes on, one resonator tube dented flat.','The dent has a pitch of its own.')}),
  P('hall-marimba-overflow','marimba',125.0,12.0,0,{...play(MARIMBA,'A second marimba parked where the hall narrows. It did not fit wherever it was meant to go.','It is still in everybody’s way.')}),
  P('hall-timpani-1','timpani',121.0,8.0,0,{...play(PERCUSSION,'A timpano with the pedal tied down for transport.','The head gives under one finger.')}),
  P('hall-timpani-2','timpani',122.2,9.0,0,{...play(PERCUSSION,'The larger drum. Dust has settled evenly except where a mallet once lay.','The clean line is mallet-shaped.')}),
  P('hall-portrait-bronzino','portrait_frame',99.0,6.0,0,{elevation:1.45,portraitIndex:2,inspect:inspect('A Bronzino study, silverpoint and chalk. It looks unfinished because it is.','The paper is paler than the wall.')}),
  P('hall-portrait-florentine','portrait_frame',104.0,6.0,0,{elevation:1.45,portraitIndex:3,inspect:inspect('Portrait of a Woman, Florentine, mid-sixteenth century. The brass plate gives no donor.','No donor, only accession numbers.')}),
  ...[0,1,2,3,4,5].flatMap((i)=>[
    P(`hall-chair-l-${i}`,'chair',107.0+i*1.2,10.0,0,{inspect:inspect('A stacking chair, set out and never stacked.','Still facing the stage.')}),
    P(`hall-stand-${i}`,'music_stand',107.0+i*1.2,11.0,0,{inspect:inspect('A music stand at sitting height.','No part on it.')}),
  ]),

  // Practice suite. Mixed rooms, mixed equipment, and corridor surplus.
  P('practice-ensemble-marimba','marimba',58.5,60.4,0,{...play(MARIMBA,'A rehearsal marimba with masking tape on four bars.','Four bars, four old pencil numbers.')}),
  P('practice-ensemble-cello','cello',60.6,62.4,.18,{...play(STRINGS,'A cello left upright in a corner that is not safe for it.','No bow. No case open.')}),
  P('practice-ensemble-violin','violin',59.4,60.9,-.3,{elevation:.48,...play(STRINGS,'A violin left on a chair, chin rest to the door.','Someone put it down mid-phrase.')}),
  ...[[67.2,60.0],[71.0,59.5],[71.0,62.3],[75.0,60.0],[57.8,69.5],[62.0,69.5],[66.0,69.5]].map(([x,y],i)=>
    P(`practice-piano-${i+1}`,'upright_piano',x,y,i%2?Math.PI:0,{...play(PIANO,'An upright piano, lid up, institutional number under the fallboard.','The number has been changed twice.')})),
  ...[[58.2,62.2],[67.0,62.5],[75.0,62.5],[70.0,70.5],[74.5,70.5]].map(([x,y],i)=>
    P(`practice-stand-${i+1}`,'music_stand',x,y,.1*i,{inspect:inspect('A stand left open at playing height.','Nothing on it.')})),
  P('practice-case-1','instrument_case',70.0,68.5,Math.PI/2,{inspect:inspect('A hard case with no instrument name, only a room number.','The room number no longer exists.')}),
  P('practice-case-2','instrument_case',74.5,68.5,Math.PI/2,{inspect:inspect('Another case in the corridor. Locked, light, probably empty.','Probably empty.')}),
  P('practice-desk-stack-1','school_desk',56.4,65.2,Math.PI/2,{inspect:inspect('Two teaching desks shoved together at the wall.','Surplus stored in circulation, as usual.')}),
  P('practice-desk-stack-2','school_desk',57.2,65.2,Math.PI/2,{inspect:inspect('The second desk makes the obstruction official.','Nobody filed a fire plan for this.')}),

  // Chapel: two banks leave a central aisle and side circulation clear.
  ...[62.0,65.0,68.0,71.0,74.0,77.0,80.0,83.0,86.0].flatMap((y,i)=>[
    P(`chapel-pew-l-${i}`,'pew',89.0,y,0,{inspect:inspect('A short pew, polished at the aisle end by hands.','The aisle end is darker.')}),
    P(`chapel-pew-r-${i}`,'pew',96.0,y,0,{inspect:inspect('A matching pew, one kneeler missing.','The empty brackets remain.')}),
  ]),
  P('chapel-organ-console','organ_console',92.5,90.0,Math.PI,{...play(CHAPEL,'The chapel console. Every stop is in and the blower supply is isolated.','No wind. No power.')}),
  P('chapel-organ-pipes','organ_pipes',92.5,91.5,0,{...play(CHAPEL,'A rank of display pipes. The sounding pipes are somewhere behind the wall.','These may never have sounded.')}),
  ...[0,1,2,3].map((i)=>P(`chapel-speaker-${i}`,'speaker_cabinet',97.0,60.0+i*.95,Math.PI/2,{...play(CHAPEL,'A flown-system cabinet brought down onto the floor.','Four cabinets, no amplifier.')})),
  P('chapel-rack-1','equipment_rack',97.0,66.0,Math.PI/2,{inspect:inspect('An electronics rack with the patch leads removed but every label left behind.','The labels name feeds that are not here.')}),
  P('chapel-portrait-pollaiuolo','portrait_frame',88.0,59.5,0,{elevation:1.55,portraitIndex:4,inspect:inspect('Piero del Pollaiuolo. Portrait of a Woman. Profile, tempera, gold held quietly at the edge.','Her profile is exact and unreachable.')}),
  P('chapel-portrait-netherlandish','portrait_frame',96.0,59.5,0,{elevation:1.55,portraitIndex:5,inspect:inspect('Portrait of a Woman, Netherlandish or French. The old label cannot decide.','The frame can decide nothing either.')}),
  P('chapel-vault','chapel_vault',92.5,75.5,0,{interactive:false,structural:true}),

  // Utility spaces remain believable but are not playable instruments.
  P('pool-bench-1','pew',78.0,30.0,Math.PI/2,{mesh:'pew',scale:.72,inspect:inspect('A timber changing bench, grey from chlorine.','The grain has lifted.')}),
  P('pool-cart-1','equipment_cart',92.0,41.0,0,{inspect:inspect('A pool-maintenance cart with an empty chemical tray.','The warning labels have run.')}),
  P('plant-rack-1','equipment_rack',38.5,8.0,Math.PI/2,{inspect:inspect('A controls rack beside equipment too old to report to it.','The indicators are mechanical.')}),
];
