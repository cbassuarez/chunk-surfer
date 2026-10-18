// Isolated authoring contract for one existing north-street proof segment.
// Not installed by importing this file. Physical coordinates are world metres;
// the existing floorplan remains the authority for player collision and saves.

// A fresh developer-only test URL can compile the genuine old road heights
// and parked positions before the world loads. Mid-run authoring comparisons
// cannot undo a compiled floorplan and are labelled separately in the report.
export const STREET_PILOT_BASELINE=!!(import.meta.env?.DEV&&typeof location!=='undefined'
  &&new URLSearchParams(location.search).get('streetProof')==='baseline');

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const STREET_PILOT_MESHES=freeze({
  surface:'street_pilot_surface',
  ground:'street_pilot_ground',
  pavement:'street_pilot_pavement',
  setts:'street_pilot_setts',
  kerbs:'street_pilot_kerbs',
  markings:'street_pilot_markings',
  repairs:'street_pilot_repairs',
  carBody:'street_pilot_car_body',
  carWheel:'street_pilot_car_wheel',
  vehicleHousing:'street_pilot_signal_housing',
  vehicleHead:'street_pilot_signal_head',
  vehicleRed:'street_pilot_signal_red',
  vehicleAmber:'street_pilot_signal_amber',
  vehicleGreen:'street_pilot_signal_green',
  pedestrianHousing:'street_pilot_ped_housing',
  pedestrianRed:'street_pilot_ped_red',
  pedestrianGreen:'street_pilot_ped_green',
});

export const STREET_PILOT=freeze({
  id:'north-borough-passage-pilot',
  version:1,
  status:'isolated-prototype',
  coordinateSpace:'physical-metres',
  districtRoad:{x0:-14.5,x1:142.5},
  patch:{x0:63,x1:93,z0:-14.5,z1:-.5},
  groundAnchor:{x:78,y:0,z:-7.5},
  road:{z0:-10.5,z1:-4.5,y:.012,collisionFloorM:0},
  crossing:{x0:76.6,x1:79.4,z0:-12.5,z1:-2.5,centreX:78},
  stopLines:{eastbound:74,westbound:82,widthM:.20},
  noseClearanceM:.35,
  parkingStripZ:-3.5,
  cycle:{
    seconds:54,
    pedestrianGreenEnd:6,
    pedestrianClearanceEnd:16,
    vehicleRedAmberStart:17,
    vehicleGreenStart:19,
    vehicleGreenEnd:48,
    vehicleAmberEnd:51,
    // Far-side pedestrian heads are dark during clearance. Vehicle red+amber
    // lasts two seconds before green; amber lasts three before red.
    pedestrianPresentation:'far-side-blackout-clearance',
    demand:'authored-automatic-prototype',
  },
  motion:{
    speedMps:8,
    accelerationMps2:1,
    brakingMps2:1,
    entryWestX:-23,
    entryEastX:149,
    reducedMotionRate:.55,
    maxAdvanceDeltaSec:.25,
  },
  car:{
    mesh:STREET_PILOT_MESHES.carBody,
    wheelMesh:STREET_PILOT_MESHES.carWheel,
    // Source-specific body dimensions, not a collision box. The conservative
    // envelope also includes lamps/trim; collision with traffic is not added.
    bodyLengthM:4.358,bodyWidthM:1.823,bodyHeightM:1.484,
    envelopeLengthM:4.6,envelopeWidthM:2.05,
    wheelRadiusM:.306,wheelWidthM:.205,
    wheelCentres:[
      {x:-.775,y:.306,z:-1.330},{x:.775,y:.306,z:-1.330},
      {x:-.775,y:.306,z:1.318},{x:.775,y:.306,z:1.318},
    ],
    headlamps:[{x:-.61,y:.78,z:-2.10},{x:.61,y:.78,z:-2.10}],
    meshForward:'local-negative-z',wheelAxle:'local-x',
  },
  bus:{
    // Existing bus is retained until the asset owner supplies a wheel-less
    // replacement. Its wheels remain baked; do not draw duplicate wheel parts.
    mesh:'ambient_late_bus',wheelMesh:null,
    bodyLengthM:9.2,bodyWidthM:2.45,bodyHeightM:2.55,
    envelopeLengthM:9.6,envelopeWidthM:2.9,
    wheelRadiusM:.42,wheelCentres:[],
    headlamps:[{x:-.75,y:.88,z:-4.72},{x:.75,y:.88,z:-4.72}],
    meshForward:'local-negative-z',
  },
  vehicles:[
    {id:'late-bus',kind:'bus',direction:1,laneZ:-9,stopLineX:74},
    {id:'north-night-car',kind:'car',direction:-1,laneZ:-6,stopLineX:82},
  ],
  vehicleSignals:[
    {id:'eastbound-primary',x:75.6,y:0,z:-12.9,yaw:-Math.PI/2},
    {id:'eastbound-secondary',x:80.4,y:0,z:-1.1,yaw:-Math.PI/2},
    {id:'westbound-primary',x:80.4,y:0,z:-1.1,yaw:Math.PI/2},
    {id:'westbound-secondary',x:75.6,y:0,z:-12.9,yaw:Math.PI/2},
  ],
  pedestrianSignals:[
    // Far-side faces look back toward the pedestrian approaching from across
    // the road. Each housing includes its own ground-rooted pole.
    {id:'north-far-side',x:79.8,y:0,z:-12.9,yaw:Math.PI},
    {id:'south-far-side',x:76.2,y:0,z:-1.1,yaw:0},
  ],
  signalGeometry:{
    vehicleHeadBottomM:2.45,
    vehicleLensCentresM:[3.3625,3.0125,2.6625],
    pedestrianLensCentresM:[3.0125,2.6625],
    lensDiameterM:.210,lensPitchM:.350,housingWidthM:.425,
    meshForward:'local-negative-z',root:'pole-ground',
  },
  headlight:{projectionAheadM:1.1,intensity:.48,radiusM:8.5,
    color:[1,.80,.51],maxVehicles:2,maxDistanceM:48},
  // These raw-source decisions remain explicit rather than becoming claims
  // that this fictional street satisfies a real highway design approval.
  researchStatus:{
    cycle:'DfT sequence and durations checked; local layout remains prototype',
    pedestrianClearance:'10m kerb-to-kerb with 10s blackout and 1s all-red; participant observation pending',
    signals:'new pilot feature; no existing crossing system is being preserved',
    vehicle:'body sockets pending generated-asset measurement',
  },
});

const smooth=(lo,hi,value)=>{
  const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));
  return t*t*(3-2*t);
};

// Exact playable-floor counterpart of the pilot ground builder. Outside the
// existing patch return null so a caller retains its existing floor profile.
// The render road receiver sits .012m above collision floor, not a new step.
export function streetPilotFloorAt(worldX,worldZ){
  if(STREET_PILOT_BASELINE)return null;
  const p=STREET_PILOT.patch;
  if(!Number.isFinite(worldX)||!Number.isFinite(worldZ)
    ||worldX<p.x0||worldX>p.x1||worldZ<p.z0||worldZ>p.z1)return null;
  const x=Math.abs(worldX-STREET_PILOT.groundAnchor.x);
  const z=Math.abs(worldZ-STREET_PILOT.groundAnchor.z);
  if(z<=3)return 0;
  if(z<=5)return .025;
  return .12-.095*(1-smooth(1.4,2,x))*(1-smooth(5,6.5,z));
}
