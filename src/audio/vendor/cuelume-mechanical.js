// Adapted from Cuelume 0.2.2, Copyright (c) 2026 Daniel Belyi, MIT.
// See CUELUME-LICENSE.txt. Keep this small palette pinned and locally reviewed.
// The contact/noise designs retain Cuelume's envelopes. Game-specific results
// use dry contacts; no shimmer sends or melodic error/achievement phrases.
const noise=(frequency,peak,decay,offset=0,q=1.4)=>({kind:'noise',frequency,peak,attack:.001,decay,offset,q});
const tone=(frequency,peak,decay,offset=0)=>({kind:'tone',frequency,peak,attack:.001,decay,offset});
const recipe=(layers,volume=1,priority=1,gap=45)=>({layers,volume,priority,gap});
export const CONTROL_RECIPES=Object.freeze({
  tick:recipe([noise(5400,.14,.018,0,1.8),tone(2600,.018,.012)],.38,0,75),
  press:recipe([noise(1700,.13,.020)],.72,1,35),
  release:recipe([noise(4600,.12,.016,0,1.8),tone(3200,.012,.030,.006)],.48,1,35),
  toggle:recipe([noise(2200,.12,.016,0,1.6),noise(3800,.10,.020,.024,1.6)],.75,2,65),
  back:recipe([noise(1250,.12,.025),noise(2900,.045,.015,.032)],.65,2,90),
  refuse:recipe([noise(850,.13,.035,0,1.1),noise(620,.07,.026,.045,1)],.85,3,180),
  latch:recipe([noise(2050,.12,.018),noise(3250,.075,.015,.033)],.72,2,65),
  unlatch:recipe([noise(2900,.10,.015),noise(1100,.085,.026,.019)],.7,2,65),
  fit:recipe([noise(940,.12,.042,0,.8),noise(2900,.08,.018,.048)],.85,2,90),
  remove:recipe([noise(2100,.065,.016),noise(820,.10,.04,.027,.8)],.72,2,90),
  patch:recipe([noise(3100,.11,.012,0,2),noise(1200,.12,.024,.029)],.85,2,75),
  unpatch:recipe([noise(1500,.11,.018),noise(3700,.07,.016,.036)],.7,2,75),
  page:recipe([{...noise(1800,.11,.080,0,.7),filter:'lowpass',attack:.006},
    {...noise(4200,.08,.065,.040,1.2),attack:.004},tone(2400,.012,.025,.075)],.6,0,120),
});
export const CONTROL_PROFILES=Object.freeze({panel:1,recorder:.78,radio:.86,combat:.9,bag:.92,van:.82,patch:1.05});
