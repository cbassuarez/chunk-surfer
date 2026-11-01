// Approved opening-only staging. Physical native IDs and fixture positions are
// bounded to the reviewed edit; gameplay/save/door state is never changed here.
import {ZONE} from '../data/floorplan/legend.js';
import {resolveLightingContext} from '../data/conservatory-lights.js';
import {PUB_ACTORS} from '../data/pub-population.js';
import {pubCharacterInstances} from './pub-character-performance.js';
import {streetCrowdInstances} from './street-crowd-performance.js';
import {vigilCharacterDescriptor} from './vigil-character-performance.js';

const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const copyLight=light=>({...light,color:light.color&&[...light.color],direction:light.direction&&[...light.direction]});
// Source-native set/prop identities used by the approved cinematic only.
const PROFILES=freeze({
  "R01": {
    "set": "pub",
    "staticIds": [
      "pub-complete-frontage",
      "pub-complete-interior",
      "yard-rehearsal-annex"
    ],
    "extraIds": []
  },
  "R02": {
    "set": "vigil",
    "staticIds": [
      "vigil-part-crowd-east-1-sign",
      "vigil-part-crowd-east-3-leaning-sign",
      "yard-baths-plant",
      "yard-laundry-room"
    ],
    "extraIds": []
  },
  "R03": {
    "set": "school",
    "staticIds": [
      "ellery-actual-public-front",
      "bay-west-elevation"
    ],
    "extraIds": [
      "opening-study:actual-ellery-forecourt",
      "door-frame:front-main",
      "door-head:front-main",
      "door-leaf:front-main:0",
      "door-leaf:front-main:1"
    ]
  },
  "R04": {
    "set": "yard",
    "staticIds": [
      "yard-van",
      "yard-former-stables",
      "yard-rehearsal-annex"
    ],
    "extraIds": [
      "bay-canopy",
      "bay-getin-sightline",
      "dock-scene-fabric",
      "dock-scene-roof",
      "bay-apron-route-board",
      "bay-apron-conduit-north",
      "bay-apron-bulkhead-north",
      "bay-apron-loading-notice",
      "bay-apron-conduit-south",
      "bay-apron-bulkhead-south",
      "bay-apron-bay-number",
      "bay-apron-isolator",
      "yard-dock-access",
      "door-frame:dock-grey-exterior",
      "door-head:dock-grey-exterior",
      "door-leaf:dock-grey-exterior:0",
      "door-leaf:dock-grey-exterior:1"
    ]
  },
  "R05": {
    "set": "chamber",
    "staticIds": [
      "academic-chamber-piano",
      "academic-chamber-bench",
      "academic-chamber-chair-1",
      "academic-chamber-chair-2",
      "academic-chamber-chair-3",
      "academic-chamber-chair-4",
      "academic-chamber-chair-5",
      "academic-chamber-chair-6",
      "academic-chamber-chair-7",
      "academic-chamber-chair-8",
      "academic-chamber-fresco-north-1",
      "academic-chamber-fresco-north-2",
      "academic-chamber-fresco-north-3",
      "academic-chamber-fresco-south-1",
      "academic-chamber-fresco-south-2",
      "building-window-unit-W1-chamber-north"
    ],
    "extraIds": []
  },
  "R06": {
    "set": "b3",
    "staticIds": [
      "b3-session-case",
      "b3-session-boom-1",
      "b3-session-boom-2",
      "b3-session-folded-mic",
      "b3-session-snake",
      "b3-control-console",
      "b3-console-fader-01",
      "b3-console-fader-02",
      "b3-console-fader-03",
      "b3-console-fader-04",
      "b3-console-fader-05",
      "b3-console-fader-06",
      "b3-console-fader-07",
      "b3-console-fader-08",
      "b3-console-fader-09",
      "b3-console-fader-10",
      "b3-console-fader-11",
      "b3-console-fader-12",
      "b3-console-fader-13",
      "b3-console-fader-14",
      "b3-console-fader-15",
      "b3-console-fader-16",
      "b3-rack-1",
      "b3-session-card",
      "b3-speaker-1",
      "b3-foam-north-1",
      "b3-foam-north-2",
      "b3-foam-north-3",
      "b3-foam-north-4",
      "b3-foam-north-5",
      "b3-foam-north-6",
      "b3-foam-north-7",
      "b3-foam-north-8",
      "b3-foam-west-1",
      "b3-foam-west-2",
      "b3-foam-west-3",
      "b3-foam-west-4",
      "b3-foam-west-5",
      "b3-foam-east-1",
      "b3-foam-east-2",
      "b3-foam-east-3",
      "b3-foam-east-4",
      "b3-carpet-1",
      "b3-carpet-2",
      "b3-carpet-3",
      "b3-carpet-4",
      "b3-carpet-5",
      "b3-carpet-6",
      "b3-carpet-7",
      "b3-carpet-8",
      "b3-carpet-9",
      "b3-patchbay",
      "b3-cable-coil",
      "b3-chair",
      "b3-music-stand",
      "light-b3-work-casing",
      "light-b3-control-casing",
      "light-b3-exit-casing",
      "architecture-space-studio-b3-control-grille",
      "architecture-target-main_b3-grille"
    ],
    "extraIds": []
  },
  "R07": {
    "set": "school",
    "staticIds": [
      "ellery-actual-public-front",
      "bay-west-elevation"
    ],
    "extraIds": []
  }
});
// Reviewed native fixture positions, with source IDs retained. These bounded
// snapshots avoid selecting a different scene's live gameplay light rig.
const NATIVE_FIXTURES=freeze({
  "pub":[
    {"id":"pub-entry-light","radius":3.8,"intensity":1.05,"color":[1,0.74,0.48],"x":32.7,"y":2.69,"z":30.3,"castsShadow":false},
    {"id":"pub-snug-light","radius":3.8,"intensity":1.1,"color":[1,0.71,0.43],"x":34.3,"y":2.69,"z":32.85,"castsShadow":false},
    {"id":"pub-bar-light","radius":4.2,"intensity":1.15,"color":[1,0.75,0.49],"castsShadow":true,"x":42.3,"y":2.69,"z":31.900000000000002},
    {"id":"pub-wc-light","radius":2.4,"intensity":1.05,"color":[1,0.83,0.61],"x":46.3,"y":3.1,"z":32.85,"castsShadow":false},
    {"id":"pub-hearth-light","radius":2.45,"intensity":0.9,"color":[1,0.43,0.14],"penetration":0.18,"x":31.85,"y":0.64,"z":32.8,"castsShadow":false},
    {"id":"pub-table-lamp-0","radius":2.8,"intensity":1.12,"color":[1,0.71,0.43],"penetration":0.2,"x":32.94,"y":1.225,"z":33.07,"castsShadow":false},
    {"id":"pub-table-lamp-2","radius":2.8,"intensity":1.12,"color":[1,0.71,0.43],"penetration":0.2,"x":35.739999999999995,"y":1.225,"z":33.07,"castsShadow":false},
    {"id":"pub-counter-lamp","radius":3.3,"intensity":1.25,"color":[1,0.75,0.49],"penetration":0.2,"x":43,"y":1.5750000000000002,"z":32.63,"castsShadow":false},
    {"id":"pub-window-sconce-west","radius":4.7,"intensity":1.5,"color":[1,0.75,0.48],"penetration":0.12,"x":35.55,"y":2.02,"z":29.57,"castsShadow":false},
    {"id":"pub-window-sconce-east","radius":4.7,"intensity":1.5,"color":[1,0.75,0.48],"penetration":0.12,"x":43.55,"y":2.02,"z":29.57,"castsShadow":false}
  ],
  "vigil":[

  ],
  "school":[
    {"id":"glass-court-fluorescent-2","kind":"fitting","color":[0.82,0.94,1],"intensity":0.86,"radius":5.8,"penetration":0,"x":84,"y":3.281373,"z":17,"castsShadow":false},
    {"id":"glass-court-fluorescent-5","kind":"fitting","color":[0.82,0.94,1],"intensity":0.86,"radius":5.8,"penetration":0,"x":84,"y":3.281373,"z":20,"castsShadow":false},
    {"id":"glass-court-fluorescent-8","kind":"fitting","color":[0.82,0.94,1],"intensity":0.86,"radius":5.8,"penetration":0,"x":84,"y":3.281373,"z":23,"castsShadow":false},
    {"id":"glass-court-fluorescent-11","kind":"fitting","color":[0.82,0.94,1],"intensity":0.86,"radius":5.8,"penetration":0,"x":84,"y":3.281373,"z":26,"castsShadow":false},
    {"id":"glass-court-changing-light-13.3","kind":"fitting","color":[0.85,0.96,1],"intensity":0.82,"radius":4,"penetration":0,"x":84,"y":2.981373,"z":28.3,"castsShadow":false},
    {"id":"glass-court-changing-light-15.7","kind":"fitting","color":[0.85,0.96,1],"intensity":0.82,"radius":4,"penetration":0,"x":84,"y":2.981373,"z":30.7,"castsShadow":false},
    {"id":"glass-court-exit-globe","kind":"fitting","color":[1,0.72,0.42],"intensity":0.9,"radius":4,"penetration":0,"x":85.55,"y":2.281373,"z":26.75,"castsShadow":false},
    {"id":"pub-bar-light","kind":"fitting","color":[1,0.75,0.49],"intensity":1.15,"radius":4.2,"penetration":0,"castsShadow":true,"x":42.3,"y":2.69,"z":31.9},
    {"id":"pub-wc-light","kind":"fitting","color":[1,0.83,0.61],"intensity":1.05,"radius":2.4,"penetration":0,"castsShadow":false,"x":46.3,"y":3.1,"z":32.85},
    {"id":"pub-counter-lamp","kind":"fitting","color":[1,0.75,0.49],"intensity":1.25,"radius":3.3,"penetration":0.2,"castsShadow":false,"x":43,"y":1.575,"z":32.63},
    {"id":"pub-window-sconce-east","kind":"fitting","color":[1,0.75,0.48],"intensity":1.5,"radius":4.7,"penetration":0.12,"castsShadow":false,"x":43.55,"y":2.02,"z":29.57},
    {"id":"pub-front-lantern--20--1.57","kind":"fitting","color":[1,0.72,0.4],"intensity":1.55,"radius":6.2,"penetration":0.12,"x":41.43,"y":2.92,"z":28.26,"castsShadow":false},
    {"id":"pub-front-lantern--20-3.63","kind":"fitting","color":[1,0.72,0.4],"intensity":1.55,"radius":6.2,"penetration":0.12,"x":46.63,"y":2.92,"z":28.26,"castsShadow":false},
    {"id":"getin-grey-door-seam","kind":"emergency","color":[1,0.018,0.008],"intensity":0.34,"radius":30,"penetration":0.78,"x":65.5,"y":2.1,"z":4.2,"castsShadow":false},
    {"id":"bay-sky-wash","kind":"sky","color":[0.54,0.62,0.8],"intensity":1.28,"radius":20,"penetration":0,"x":50,"y":5.2,"z":7.5,"castsShadow":false},
    {"id":"bay-facade-wash","kind":"sky","color":[0.5,0.58,0.74],"intensity":1.42,"radius":26,"penetration":0,"x":46,"y":11,"z":9,"castsShadow":false},
    {"id":"natatorium-break-sky","kind":"sky","color":[0.5,0.58,0.74],"intensity":0.9,"radius":14,"penetration":0,"direction":[0,-1,0],"coneOuterCos":-0.05,"coneInnerCos":0.45,"x":84,"y":9.4,"z":41.2,"castsShadow":false},
    {"id":"bay-canopy-bulkhead","kind":"fitting","color":[1,0.74,0.42],"intensity":0.86,"radius":7.5,"penetration":0,"flutter":{"amount":0.09,"steady":0.55},"x":55.2,"y":4.1,"z":7.5,"castsShadow":false},
    {"id":"construction-conservatoire-work-heads","kind":"fitting","color":[1,0.91,0.76],"intensity":1.32,"radius":18,"penetration":0,"x":44.5,"y":4.47,"z":12.83,"castsShadow":false},
    {"id":"district-south-lamp-east","kind":"fitting","color":[1,0.6,0.27],"intensity":0.88,"radius":20,"penetration":0,"x":106,"y":6.1,"z":99,"castsShadow":false},
    {"id":"district-ellery-west-relief","kind":"sky","color":[0.44,0.52,0.67],"intensity":0.56,"radius":42,"penetration":0,"x":42,"y":14,"z":40,"castsShadow":false},
    {"id":"district-ellery-south-relief","kind":"sky","color":[0.42,0.5,0.65],"intensity":0.5,"radius":38,"penetration":0,"x":67,"y":13,"z":101,"castsShadow":false},
    {"id":"district-chapel-tower-relief","kind":"sky","color":[0.48,0.56,0.72],"intensity":0.58,"radius":44,"penetration":0,"x":105,"y":23,"z":74,"castsShadow":false},
    {"id":"academic-skylight-spill","kind":"sky","color":[0.52,0.67,0.8],"intensity":1.12,"radius":24,"penetration":0,"x":85,"y":16.25,"z":15,"castsShadow":false},
    {"id":"atrium-main-exit","kind":"fitting","color":[1,0.64,0.34],"intensity":1.05,"radius":6.4,"penetration":0,"x":77.5,"y":1.8,"z":4,"castsShadow":false},
    {"id":"foh-live-west","kind":"fitting","color":[0.74,0.82,0.78],"intensity":1.52,"radius":15,"penetration":0,"flutter":{"amount":0.06,"steady":1.46},"x":75,"y":3.43,"z":18.5,"castsShadow":false},
    {"id":"foh-live-east","kind":"fitting","color":[0.74,0.82,0.78],"intensity":1.46,"radius":15,"penetration":0,"flutter":{"amount":0.05,"steady":1.41},"x":92,"y":3.43,"z":10.75,"castsShadow":false},
    {"id":"foh-emergency","kind":"emergency","color":[1,0.018,0.008],"intensity":0.46,"radius":30,"penetration":0.78,"x":98,"y":2.33,"z":18.5,"castsShadow":false},
    {"id":"hall-entrance-maintained-north","kind":"emergency","color":[1,0.018,0.008],"intensity":3.25,"radius":42,"penetration":0.86,"x":95.89,"y":2.36,"z":23.33,"castsShadow":false},
    {"id":"hall-entrance-maintained-south","kind":"emergency","color":[1,0.018,0.008],"intensity":3.25,"radius":42,"penetration":0.86,"x":95.89,"y":2.36,"z":26.17,"castsShadow":false},
    {"id":"natatorium-roof-spill-north","kind":"sky","color":[0.55,0.75,0.72],"intensity":1.52,"radius":20,"penetration":0,"x":80,"y":9.4,"z":31,"castsShadow":false},
    {"id":"natatorium-roof-spill-mid","kind":"sky","color":[0.51,0.7,0.68],"intensity":1.4,"radius":21,"penetration":0,"x":85,"y":9.7,"z":37,"castsShadow":false},
    {"id":"natatorium-roof-spill-south","kind":"sky","color":[0.48,0.67,0.65],"intensity":1.28,"radius":19,"penetration":0,"x":81,"y":9.5,"z":44,"castsShadow":false},
    {"id":"natatorium-roof-spill-far","kind":"sky","color":[0.46,0.64,0.62],"intensity":1.1,"radius":17,"penetration":0,"x":88,"y":9.3,"z":46,"castsShadow":false},
    {"id":"natatorium-end-window-spill","kind":"sky","color":[0.58,0.74,0.72],"intensity":1.18,"radius":16,"penetration":0,"x":89,"y":5.4,"z":49,"castsShadow":false},
    {"id":"pool-service-live-a","kind":"fitting","color":[0.69,0.83,0.78],"intensity":0.94,"radius":10,"penetration":0,"flutter":{"amount":0.05,"steady":0.9},"x":96,"y":3.48,"z":43,"castsShadow":false},
    {"id":"pool-service-live-b","kind":"fitting","color":[0.67,0.81,0.76],"intensity":0.86,"radius":10,"penetration":0,"flutter":{"amount":0.07,"steady":0.82},"x":71,"y":3.48,"z":43,"castsShadow":false},
    {"id":"natatorium-emergency-entry","kind":"emergency","color":[1,0.018,0.008],"intensity":0.48,"radius":30,"penetration":0.78,"x":85.5,"y":1.8,"z":27.5,"castsShadow":false},
    {"id":"natatorium-emergency-west","kind":"emergency","color":[1,0.018,0.008],"intensity":0.4,"radius":30,"penetration":0.78,"x":71,"y":1.8,"z":38.5,"castsShadow":false},
    {"id":"natatorium-emergency-east","kind":"emergency","color":[1,0.018,0.008],"intensity":0.4,"radius":30,"penetration":0.78,"x":96,"y":1.8,"z":38.5,"castsShadow":false},
    {"id":"natatorium-emergency-far","kind":"emergency","color":[1,0.018,0.008],"intensity":0.36,"radius":30,"penetration":0.78,"x":89,"y":1.8,"z":50,"castsShadow":false},
    {"id":"hall-stage-door-maintained","kind":"emergency","color":[1,0.018,0.008],"intensity":3.6,"radius":52,"penetration":0.9,"x":99,"y":3.83,"z":8,"castsShadow":false},
    {"id":"deadend-ground-chandelier","kind":"fitting","color":[0.8,0.76,0.64],"intensity":0.74,"radius":7.5,"penetration":0,"flutter":{"amount":0.05,"steady":0.88},"x":73,"y":3.07,"z":23.5,"castsShadow":false},
    {"id":"hall-galleria-west-foot","kind":"emergency","color":[1,0.018,0.008],"intensity":3.45,"radius":48,"penetration":0.88,"x":99,"y":0.06,"z":20.5,"castsShadow":false},
    {"id":"main-stair-ground-opal","kind":"fitting","color":[1,0.78,0.51],"intensity":0.86,"radius":9.5,"penetration":0,"x":66.4,"y":4.15,"z":38.8,"castsShadow":false},
    {"id":"main-stair-upper-opal","kind":"fitting","color":[1,0.78,0.51],"intensity":0.92,"radius":10.5,"penetration":0,"x":66.4,"y":8.85,"z":36,"castsShadow":false},
    {"id":"landing-ground-bulkhead","kind":"fitting","color":[1,0.84,0.62],"intensity":0.74,"radius":5.5,"penetration":0,"x":58.2,"y":1.76,"z":24.86,"castsShadow":false}
  ],
  "yard":[
    {"id":"pub-entry-light","kind":"fitting","color":[1,0.74,0.48],"intensity":1.05,"radius":3.8,"penetration":0,"castsShadow":false,"x":32.7,"y":2.69,"z":30.3},
    {"id":"pub-snug-light","kind":"fitting","color":[1,0.71,0.43],"intensity":1.1,"radius":3.8,"penetration":0,"castsShadow":false,"x":34.3,"y":2.69,"z":32.85},
    {"id":"pub-bar-light","kind":"fitting","color":[1,0.75,0.49],"intensity":1.15,"radius":4.2,"penetration":0,"castsShadow":true,"x":42.3,"y":2.69,"z":31.9},
    {"id":"pub-wc-light","kind":"fitting","color":[1,0.83,0.61],"intensity":1.05,"radius":2.4,"penetration":0,"castsShadow":false,"x":46.3,"y":3.1,"z":32.85},
    {"id":"pub-hearth-light","kind":"fitting","color":[1,0.43,0.14],"intensity":0.9,"radius":2.45,"penetration":0.18,"castsShadow":false,"x":31.85,"y":0.64,"z":32.8},
    {"id":"pub-table-lamp-0","kind":"fitting","color":[1,0.71,0.43],"intensity":1.12,"radius":2.8,"penetration":0.2,"castsShadow":false,"x":32.94,"y":1.225,"z":33.07},
    {"id":"pub-table-lamp-2","kind":"fitting","color":[1,0.71,0.43],"intensity":1.12,"radius":2.8,"penetration":0.2,"castsShadow":false,"x":35.74,"y":1.225,"z":33.07},
    {"id":"pub-counter-lamp","kind":"fitting","color":[1,0.75,0.49],"intensity":1.25,"radius":3.3,"penetration":0.2,"castsShadow":false,"x":43,"y":1.575,"z":32.63},
    {"id":"pub-window-sconce-west","kind":"fitting","color":[1,0.75,0.48],"intensity":1.5,"radius":4.7,"penetration":0.12,"castsShadow":false,"x":35.55,"y":2.02,"z":29.57},
    {"id":"pub-window-sconce-east","kind":"fitting","color":[1,0.75,0.48],"intensity":1.5,"radius":4.7,"penetration":0.12,"castsShadow":false,"x":43.55,"y":2.02,"z":29.57},
    {"id":"pub-front-lantern--28--1.57","kind":"fitting","color":[1,0.72,0.4],"intensity":1.55,"radius":6.2,"penetration":0.12,"x":33.43,"y":2.92,"z":28.26,"castsShadow":false},
    {"id":"pub-front-lantern--28-3.63","kind":"fitting","color":[1,0.72,0.4],"intensity":1.55,"radius":6.2,"penetration":0.12,"x":38.63,"y":2.92,"z":28.26,"castsShadow":false},
    {"id":"pub-front-lantern--20--1.57","kind":"fitting","color":[1,0.72,0.4],"intensity":1.55,"radius":6.2,"penetration":0.12,"x":41.43,"y":2.92,"z":28.26,"castsShadow":false},
    {"id":"pub-front-lantern--20-3.63","kind":"fitting","color":[1,0.72,0.4],"intensity":1.55,"radius":6.2,"penetration":0.12,"x":46.63,"y":2.92,"z":28.26,"castsShadow":false},
    {"id":"bay-facade-wash","kind":"sky","color":[0.5,0.58,0.74],"intensity":1.42,"radius":26,"penetration":0,"x":46,"y":11,"z":9,"castsShadow":false},
    {"id":"bay-yard-sodium","kind":"fitting","color":[1,0.52,0.18],"intensity":1.05,"radius":22,"penetration":0,"x":22,"y":6.6,"z":4,"castsShadow":false},
    {"id":"yard-park-sodium","kind":"fitting","color":[1,0.54,0.21],"intensity":0.96,"radius":19,"penetration":0,"x":15,"y":0.2,"z":31.5,"castsShadow":false},
    {"id":"construction-conservatoire-work-heads","kind":"fitting","color":[1,0.91,0.76],"intensity":1.32,"radius":18,"penetration":0,"x":44.5,"y":4.47,"z":12.83,"castsShadow":false},
    {"id":"bay-booth-window","kind":"fitting","color":[1,0.82,0.58],"intensity":0.92,"radius":12,"penetration":0,"flutter":{"amount":0.04,"steady":0.9},"x":24.9,"y":2.25,"z":14.2,"castsShadow":false},
    {"id":"district-south-pub-spill","kind":"fitting","color":[1,0.76,0.46],"intensity":0.72,"radius":13,"penetration":0,"flutter":{"amount":0.03,"steady":0.95},"x":39,"y":2.4,"z":27.25,"castsShadow":false}
  ],
  "chamber":[

  ],
  "b3":[
    {"id":"b3-work-live","kind":"fitting","color":[0.78,0.78,0.65],"intensity":0.82,"radius":9,"penetration":0,"flutter":{"amount":0.07,"steady":0.78},"x":16.5,"y":-1.37,"z":6,"castsShadow":false},
    {"id":"b3-control-work-live","kind":"fitting","color":[0.76,0.73,0.62],"intensity":0.58,"radius":7.2,"penetration":0,"flutter":{"amount":0.05,"steady":0.82},"x":25,"y":-1.37,"z":9.5,"castsShadow":false},
    {"id":"b3-exit-maintained","kind":"fitting","color":[1,0.84,0.63],"intensity":1.6,"radius":7,"penetration":0,"x":14.5,"y":-1.67,"z":18.65,"castsShadow":false}
  ]
});
const CROWD_ANCHORS=freeze([
  {
    "id": "vigil-crowd-east-1",
    "mesh": "vigil_crowd_east_1",
    "x": 28,
    "y": 0,
    "z": 53.5,
    "sourceMatrix": [
      -1.105347,
      0,
      0.101526,
      0,
      0,
      0.976471,
      0,
      0,
      -0.096953,
      0,
      -1.055557,
      0,
      28,
      0,
      53.5,
      1
    ]
  },
  {
    "id": "vigil-crowd-east-2",
    "mesh": "vigil_crowd_east_2",
    "x": 30,
    "y": 0,
    "z": 51.5,
    "sourceMatrix": [
      -0.900893,
      0,
      0.128419,
      0,
      0,
      1,
      0,
      0,
      -0.134064,
      0,
      -0.940493,
      0,
      30,
      0,
      51.5,
      1
    ]
  },
  {
    "id": "vigil-crowd-east-3",
    "mesh": "vigil_crowd_east_3",
    "x": 30.5,
    "y": 0,
    "z": 53.5,
    "sourceMatrix": [
      -0.878087,
      0,
      0.362578,
      0,
      0,
      1.023529,
      0,
      0,
      -0.389294,
      0,
      -0.942788,
      0,
      30.5,
      0,
      53.5,
      1
    ]
  },
  {
    "id": "vigil-crowd-east-4",
    "mesh": "vigil_crowd_east_4",
    "x": 27.5,
    "y": 0,
    "z": 55,
    "sourceMatrix": [
      -1.119548,
      0,
      -0.031812,
      0,
      0,
      0.970588,
      0,
      0,
      0.029824,
      0,
      -1.049576,
      0,
      27.5,
      0,
      55,
      1
    ]
  }
]);
const RUTH_ANCHORS=freeze([
  {
    "id": "vigil-ruth-mallory",
    "mesh": "vigil_ruth_mallory",
    "matrix": [
      0.988771,
      0,
      0.149438,
      0,
      0,
      1,
      0,
      0,
      -0.149438,
      0,
      0.988771,
      0,
      28,
      0,
      52,
      1
    ],
    "position": [
      28,
      0,
      52
    ]
  },
  {
    "id": "vigil-part-ruth-mallory-binder",
    "mesh": "vigil_part_ruth_binder",
    "matrix": [
      0.988771,
      0,
      0.149438,
      0,
      0,
      1,
      0,
      0,
      -0.149438,
      0,
      0.988771,
      0,
      28,
      0,
      52,
      1
    ],
    "position": [
      28,
      0,
      52
    ]
  }
]);
export const OPENING_CINEMATIC_ASSETS=freeze([
  {
    "url": "/assets/conservatory-props.glb",
    "character": false,
    "base": true,
    "meshes": [
      "academic_frieze",
      "acoustic_foam_panel",
      "arch_vent_grille",
      "b3_boom_microphone",
      "b3_fader_cap",
      "b3_flight_case",
      "b3_folded_mic_stand",
      "b3_mixing_console",
      "b3_session_card",
      "b3_stage_snake",
      "bay_canopy",
      "building_window_chamber",
      "cable_coil",
      "chair",
      "door_stencil",
      "ellery_public_forecourt",
      "equipment_rack",
      "exterior_pub_frontage",
      "getin_sightline_shell",
      "legacy_patchbay",
      "music_stand_folded",
      "notice_board",
      "piano_bench",
      "plant_pipe_bank",
      "scene_dock_roof_structure",
      "scene_dock_room_fabric",
      "speaker_cabinet",
      "textile_studio_carpet",
      "tower_bulkhead",
      "upright_piano",
      "vigil_part_sign_record",
      "vigil_part_sign_save",
      "yard_baths_plant",
      "yard_dock_access",
      "yard_laundry_room",
      "yard_rehearsal_range",
      "yard_stable_range",
      "yard_van"
    ]
  },
  {
    "url": "/assets/pub-hospitality.glb",
    "character": false,
    "base": false,
    "meshes": [
      "pub_warm_interior"
    ]
  },
  {
    "url": "/assets/pub-characters.glb",
    "character": true,
    "base": false,
    "meshes": [
      "pub_bartender_iona",
      "pub_patron_arthur",
      "pub_patron_bert",
      "pub_patron_ed",
      "pub_patron_farah",
      "pub_patron_mavis",
      "pub_patron_nell"
    ]
  },
  {
    "url": "/assets/pub-quest-props.glb",
    "character": false,
    "base": false,
    "meshes": [
      "pub_held_glass",
      "pub_held_mug",
      "pub_held_pint",
      "pub_polishing_cloth"
    ]
  },
  {
    "url": "/assets/street-crowd-characters.glb",
    "character": true,
    "base": false,
    "meshes": [
      "vigil_crowd_east_1",
      "vigil_crowd_east_2",
      "vigil_crowd_east_3",
      "vigil_crowd_east_4"
    ]
  },
  {
    "url": "/assets/street-crowd-props.glb",
    "character": false,
    "base": false,
    "meshes": [
      "street_crowd_folding_chair"
    ]
  },
  {
    "url": "/assets/vigil-characters-ruth-leila.glb",
    "character": true,
    "base": false,
    "meshes": [
      "vigil_part_ruth_binder",
      "vigil_ruth_mallory"
    ]
  },
  {
    "url": "/assets/ellery-public-front.glb",
    "character": false,
    "base": false,
    "meshes": [
      "conservatory_west_elevation",
      "ellery_public_front"
    ]
  },
  {
    "url": "/assets/conservatory-doors.glb",
    "character": false,
    "base": false,
    "meshes": [
      "door_frame_goods",
      "door_frame_pair",
      "door_head_goods",
      "door_head_transom",
      "door_leaf_bay_goods",
      "door_leaf_public"
    ]
  },
  {
    "url": "/assets/conservatory-acquisitions.glb",
    "character": false,
    "base": false,
    "meshes": [
      "power_box_01"
    ]
  }
]);

const SCENES=freeze({
  pub:{group:'ground',zone:ZONE.pub},vigil:{group:'ground',zone:ZONE.dock},
  school:{group:'ground',zone:ZONE.dock},yard:{group:'ground',zone:ZONE.dock},
  chamber:{group:'academic',zone:ZONE.academic},b3:{group:'basement',zone:ZONE.studio},
});
const PUB_IDS=new Set(['pub-bartender-iona','pub-patron-mavis','pub-patron-ed','pub-patron-bert','pub-patron-farah','pub-patron-nell','pub-patron-arthur']);
const PUB_CAST=PUB_ACTORS.filter(actor=>PUB_IDS.has(actor.id));
const ROOM_AMBIENT=freeze({b3:.10,chamber:.11});
const STUDY_KEYS=freeze({
  b3:[{id:'Exit/booth bounce proposal',position:[22.4,-1.35,12.5],color:[1,.80,.58],intensity:3.2,radius:9,penetration:.08},{id:'Live-room work-light bounce',position:[13,-1.15,14],color:[.73,.83,1],intensity:3.4,radius:12,penetration:.08}],
  chamber:[{id:'Study north-window interior bounce',position:[57.1,12.7,1.35],color:[.56,.70,1],intensity:5.2,radius:16,penetration:.08},{id:'Study chamber high fitting bounce',position:[61,13.6,6],color:[1,.76,.47],intensity:2.4,radius:14,penetration:.08}],
  yard:[{id:'Study yard practical bounce',position:[24,6,3],color:[1,.68,.32],intensity:3.2,radius:28,penetration:.8},{id:'Study open night sky',position:[12,18,24],color:[.52,.68,1],intensity:2.2,radius:65,penetration:1}],
  school:[{id:'Study facade open sky',position:[82,24,-9],color:[.55,.69,1],intensity:3.5,radius:95,penetration:1},{id:'Study Tower moon separation',position:[115,30,83],color:[.61,.73,1],intensity:5.5,radius:44,penetration:1}],
  pub:[{id:'Study warm bar work key',position:[40,3.1,32],color:[1,.73,.42],intensity:2.4,radius:10,penetration:.12},{id:'Study reflected street fill',position:[40,2,26],color:[.59,.73,1],intensity:1.6,radius:12,penetration:.2}],
  vigil:[{id:'Study street practical key',position:[26.5,5,49],color:[1,.77,.45],intensity:3.8,radius:18,penetration:1},{id:'Study cool open-sky side',position:[34,8,56],color:[.58,.72,1],intensity:2.2,radius:26,penetration:1}],
});
const staticIds=new Map(Object.entries(PROFILES).map(([id,p])=>[id,new Set([...p.staticIds,...p.extraIds])]));
const extraIds=new Map(Object.entries(PROFILES).map(([id,p])=>[id,new Set(p.extraIds)]));
const preparation=new WeakMap();
const profile=frame=>PROFILES[frame?.sourcePlanId]||null;
const stageValue=(frame,key)=>frame?.[key]??frame?.staging?.[key];

// A real return is ordinary gameplay even while black. A semantic shot name or
// retained cinematic metadata alone never acquires staging ownership.
export function shouldStageOpeningCinematic(frame){
  return !!profile(frame)&&!frame.nativeReturn&&frame.stage!=='return'&&frame.staging?.enabled!==false&&frame.stagingEnabled!==false;
}

export function openingCinematicLighting(frame,{ordinaryContext=null,ordinaryLights=[],eye}={}){
  if(!shouldStageOpeningCinematic(frame))return{active:false,context:ordinaryContext,lights:ordinaryLights};
  const {set}=profile(frame),scene=SCENES[set],base=resolveLightingContext(scene);
  const spec=stageValue(frame,'lightingOverride')||stageValue(frame,'lightOverride')||{};
  const disabled=new Set(spec.disableProposalLights||[]);
  const keys=(STUDY_KEYS[set]||[]).filter(l=>!disabled.has(l.id)).map(l=>({...copyLight(l),x:l.position[0],y:l.position[1],z:l.position[2],photographyProposal:true}));
  const replacements=(spec.replaceProposalLights||[]).map(l=>({id:l.name,x:l.positionM[0],y:l.positionM[1],z:l.positionM[2],color:[...l.color],intensity:clamp(l.powerWProxy/60,.25,6),radius:Math.max(5,(l.sizeM||1)*4+4),penetration:.12,photographyProposal:true}));
  const observer=eye||frame.camera?.eye||frame.eye||[0,0,0];
  const score=l=>Math.hypot(l.x-observer[0],l.y-observer[1],l.z-observer[2])/Math.max(1,Number(l.radius)||4);
  const fixtures=(NATIVE_FIXTURES[set]||[]).filter(l=>!disabled.has(l.id)).map(copyLight).sort((a,b)=>score(a)-score(b));
  // The reviewed edit used eight slots, even though the native renderer now
  // supports twelve. Reserve the authored shot keys before nearest fixtures.
  const authored=[...replacements,...keys].slice(0,8),scales=stageValue(frame,'lightScales')||{};
  const lights=[...authored,...fixtures.slice(0,Math.max(0,8-authored.length))].map(l=>({...l,intensity:l.intensity*(scales[l.id]??1)}));
  let context=ROOM_AMBIENT[set]?{...base,ambientIntensity:ROOM_AMBIENT[set],bounce:{color:[...base.ambientColor],intensity:.09}}:base;
  if(Number.isFinite(spec.ambientIntensity))context={...context,ambientIntensity:spec.ambientIntensity};
  if(Number.isFinite(spec.bounceIntensity))context={...context,bounce:{color:[...base.ambientColor],intensity:spec.bounceIntensity}};
  return{active:true,context,lights};
}

function copyInstance(instance,zone){
  const next={...instance,mesh:instance.mesh?.replace(/__pose0$/,''),zone,structural:true};
  if(instance.matrix?.length===16)next.matrix=Array.from(instance.matrix);
  return next;
}

// Feed the existing native prop list. Geometry/placement stays unchanged; only
// approved IDs and reviewed render-zone presentation survive inside the film.
// Native frames/heads/closed leaves come from the source plan's own additions,
// never by changing FP door state. Addition IDs are bounded per shot as well.
export function openingCinematicStaticProps(frame,instances=[]){
  if(!shouldStageOpeningCinematic(frame))return instances;
  const id=frame.sourcePlanId,{set}=profile(frame),zone=SCENES[set].zone,allowed=staticIds.get(id),out=new Map();
  for(const instance of instances)if(allowed.has(instance.id)){
    const next=copyInstance(instance,zone);
    if(next.id==='pub-complete-interior')next.mesh='pub_warm_interior';
    out.set(next.id,next);
  }
  for(const instance of stageValue(frame,'additionalInstances')||[])if(extraIds.get(id).has(instance.id))out.set(instance.id,copyInstance(instance,zone));
  return [...out.values()];
}

export function openingCinematicActors(frame,{reducedMotion=false}={}){
  if(!shouldStageOpeningCinematic(frame))return[];
  const {set}=profile(frame),seconds=Number.isFinite(frame.performanceSeconds)?frame.performanceSeconds:0;
  if(set==='pub')return pubCharacterInstances(PUB_CAST,{timeSec:seconds,reducedMotion,zone:ZONE.pub});
  if(set!=='vigil')return[];
  const crowd=CROWD_ANCHORS.map(p=>({id:p.id,mesh:p.mesh,x:p.x,y:p.y,z:p.z,yaw:Math.atan2(p.sourceMatrix[2],p.sourceMatrix[0]),zone:ZONE.dock}));
  const actors=streetCrowdInstances(crowd,{timeSec:seconds,reducedMotion});
  const action=frame.vigilAction||null;
  for(const p of RUTH_ANCHORS)actors.push({id:p.id,mesh:p.mesh,x:p.position[0],y:p.position[1],z:p.position[2],matrix:[...p.matrix],zone:ZONE.dock,structural:true,character:vigilCharacterDescriptor(p.mesh,action,{timeSec:seconds,reducedMotion})});
  return actors;
}

// Preserve the reviewed 24.89 x12.445mm active gate at the actual viewport.
// Sensor scaling keeps CoC pixel size consistent with the cropped active gate.
export function openingCinematicGate(frame,{width,height}={}){
  width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
  const full={x:0,y:0,width,height};
  if(!shouldStageOpeningCinematic(frame))return{active:false,activeRect:full,bars:[],lens:null,nativeLensSupported:true};
  const aspect=width/height,w=Math.min(width,height*2),h=w/2,x=(width-w)/2,y=(height-h)/2;
  const sensorHeightMm=12.445*Math.max(1,2/aspect),input=frame.camera?.lens||frame.lens;
  const lens=input?{...input,sensorHeightMm}:null,bars=[];
  if(y>0){bars.push({x:0,y:0,width,height:y},{x:0,y:y+h,width,height:height-y-h});}
  if(x>0){bars.push({x:0,y:0,width:x,height},{x:x+w,y:0,width:width-x-w,height});}
  return{active:true,activeRect:{x,y,width:w,height:h},bars,lens,nativeLensSupported:sensorHeightMm<=36};
}

// Called only after the ordinary base prop pack is ready. No renderer, audio,
// floorplan, save, door or actor clock is initialized/reset by this preparation.
// Injection keeps readiness/error behavior testable without a browser or GPU.
export async function prepareOpeningCinematicAssets({propsRenderer}={}){
  const renderer=propsRenderer||await import('./props3d.js');
  if(preparation.has(renderer))return preparation.get(renderer);
  const task=(async()=>{
    if(typeof renderer.propMeshCatalog!=='function')throw Error('Opening cinematic requires the native prop catalog.');
    let catalog=new Set(renderer.propMeshCatalog());
    if(!catalog.size)throw Error('Opening cinematic requires the ordinary base prop pack to be ready.');
    const loadedPacks=[],needed=[];
    for(const pack of OPENING_CINEMATIC_ASSETS){
      if(pack.meshes.every(mesh=>catalog.has(mesh)))continue;
      if(pack.base)throw Error('Opening cinematic base meshes are not ready: '+pack.meshes.filter(mesh=>!catalog.has(mesh)).join(', '));
      const method=pack.character?'addCharacterPack':'addPropPack';
      if(typeof renderer[method]!=='function')throw Error('Opening cinematic requires native '+method+'.');
      needed.push({pack,method});
    }
    // Validate the whole request before starting any loads, so an invalid
    // base/loader cannot strand earlier unobserved asynchronous work.
    const jobs=needed.map(({pack,method})=>Promise.resolve().then(()=>renderer[method](pack.url)).then(()=>loadedPacks.push(pack.url)));
    const results=await Promise.allSettled(jobs),failures=results.filter(r=>r.status==='rejected');
    if(failures.length)throw Error('Opening cinematic asset preparation failed: '+failures.map(r=>String(r.reason?.message||r.reason)).join('; '));
    catalog=new Set(renderer.propMeshCatalog());
    const requiredMeshes=[...new Set(OPENING_CINEMATIC_ASSETS.flatMap(pack=>pack.meshes))],missing=requiredMeshes.filter(mesh=>!catalog.has(mesh));
    if(missing.length)throw Error('Opening cinematic native meshes unavailable: '+missing.join(', '));
    return{ready:true,loadedPacks,requiredMeshes};
  })();
  preparation.set(renderer,task);
  try{return await task;}catch(error){preparation.delete(renderer);throw error;}
}
