// Uses and dimensional limits for the four existing closed service buildings.
// Origins, roofs and collision masses remain in exterior-district.js.
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const YARD_RANGE_FRONTAGE_CONTRACT=freeze({
  revision:1,front:'-x',wallDepth:.34,roomDepth:1.05,
  maximumBodyProjection:.18,existingBodyCollisionPad:.20,
  maximumCanopyProjection:.38,minimumCanopyHeight:3,
  maximumAddedTriangles:12000,minimumWindowBackDepth:.88,
});
export const YARD_RANGE_FRONTAGES=freeze([
  {id:'yard-former-stables',mesh:'yard_stable_range',kind:'stable',year:1888,use:'former stables and caretaker store',
    openings:[{id:'caretaker-window',type:'window',z:-1.90,width:1.72,y0:1.02,y1:2.57},
      {id:'caretaker-door',type:'door',z:1.60,width:1.25,y0:.04,y1:2.55}],
    blockedHayDoor:{z:0,width:2.28,y0:4.12,spring:5.87,rise:.91},portableLamp:true},
  {id:'yard-rehearsal-annex',mesh:'yard_rehearsal_range',kind:'rehearsal',year:1912,use:'former rehearsal annex',
    openings:[],backing:{mesh:'opening_street_service_history',westProjection:.12,y0:.12,y1:6},
    acousticDoor:{z:-1.5,width:1.42,height:2.45},oldOpening:{z:-1.5,width:2.34,y0:.05,spring:3.20,rise:.72}},
  {id:'yard-baths-plant',mesh:'yard_baths_plant',kind:'baths',year:1936,use:'baths plant and laundry',
    openings:[{id:'laundry-window',type:'window',z:-2.40,width:1.90,y0:1.18,y1:2.68},
      {id:'plant-door',type:'door',z:2.30,width:1.16,y0:.04,y1:2.50}],
    existingDrainage:'occupation-baths-rainwater',existingServiceGlands:'occupation-baths-service-entry'},
  {id:'yard-covered-stores',mesh:'yard_covered_stores',kind:'stores',year:1986,use:'covered stores',
    openings:[],backing:{mesh:'opening_street_service_history',westProjection:.12,y0:.16,y1:5.82},
    goodsDoor:{z:-1.1,width:3.52,height:3.38},canopy:{z:-1.1,width:4.14,y:3.95,projection:.38}},
]);
export const yardRangeFrontage=kind=>YARD_RANGE_FRONTAGES.find(p=>p.kind===kind)||null;
