import {B3_CONSOLE_LAYOUT as DESK,b3ConsoleChannelX,b3ConsoleUpperSurfaceY} from '../../src/data/b3-console-layout.js';

// The studio was packed for a return, not abandoned in the middle of a take.
// All dimensions are metres, Y up. The console's operator is on local +Z and
// looks toward local -Z; its lamps are deliberately unpowered.
export function buildB3StudioGeometry({mesh,MAT,addBox,addCylinder,addCylinderX,addBeam,addLegs}){
  {
    const m=mesh('b3_mixing_console');
    // Lightweight fallback of the same 1985 split-monitor desk. The dedicated
    // pack owns final surfaces, but these tracks cannot disagree with its caps.
    addBox(m,[0,.77,-.015],[2.15,.13,.88],MAT.black);
    addBox(m,[0,.85,.28],[2.15,.10,.34],MAT.steel);
    addBox(m,[0,.95,-.10],[2.15,.10,.56],MAT.steel,0,.28);
    for(const x of[-1.112,1.112])addBox(m,[x,.83,-.005],[.076,.20,.95],MAT.wood);
    addBox(m,[0,.16,0],[1.98,.035,.65],MAT.wood);
    addBox(m,[0,.897,.438],[2.18,.076,.068],MAT.black);
    addBox(m,[0,1.175,-.405],[2.17,.252,.14],MAT.black);
    for(let i=0;i<DESK.channels;i++){
      const x=b3ConsoleChannelX(i);
      addBox(m,[x,DESK.trackSurfaceY,DESK.trackCentreZ],[.006,.006,DESK.faderTrack],MAT.black);
      for(const z of[DESK.gainZ,...DESK.eqRows,...DESK.auxRows,DESK.panZ])addCylinder(m,[x,b3ConsoleUpperSurfaceY(z)+.012,z],.010,.021,MAT.black,6);
      addBox(m,[x,.904,.378],[.052,.003,.024],MAT.paper);
      addBox(m,[-.995+i*.071,1.181,-.325],[.041,.174,.012],MAT.cone);
    }
    for(let i=0;i<DESK.groupCount;i++){
      const x=DESK.groupStartX+i*DESK.groupPitch;
      for(const z of[-.29,-.22,-.14,-.07,.01,.08])addCylinder(m,[x,b3ConsoleUpperSurfaceY(z)+.012,z],.010,.021,MAT.black,6);
      addBox(m,[x,.901,.27],[.006,.006,.10],MAT.black);addBox(m,[x,.918,.252],[.045,.026,.032],MAT.ivory);
    }
    for(const x of[.49,.88]){addBox(m,[x,1.178,-.32],[.335,.172,.022],MAT.steel);addBox(m,[x,1.187,-.302],[.279,.095,.003],MAT.paper);}
    for(const x of DESK.masterXs){for(const z of[-.27,-.17,-.07,.04,.14])addCylinder(m,[x,b3ConsoleUpperSurfaceY(z)+.012,z],.016,.021,MAT.black,8);addBox(m,[x,.918,.26],[.055,.026,.036],MAT.ivory);}
    addLegs(m,0,0,2.02,.64,.02,.42,MAT.steel,.027);
  }
  {
    // Individual physical caps are separate from the desk so their world pose
    // follows the user's actual fader positions without moving the collider.
    const m=mesh('b3_fader_cap');
    addBox(m,[0,0,0],[.055,.026,.036],MAT.ivory);
  }
  {
    // Closed spares tin, readable in silhouette after the cell is collected:
    // no baked-in battery remains on display. Dimensions are metres.
    const m=mesh('b3_spares_tin');
    addBox(m,[0,.035,0],[.25,.070,.18],MAT.steel);
    addBox(m,[0,.073,0],[.26,.018,.19],MAT.black);
    addBox(m,[0,.083,0],[.19,.004,.11],MAT.paper);
    for(let i=0;i<3;i++)addBox(m,[-.045+i*.038,.086,0],[.021,.003,.055],MAT.black);
    addBox(m,[0,.040,-.094],[.045,.025,.006],MAT.brass);
  }
  {
    // A card sits directly on the mixing desk; ruled lines and pen strokes are
    // geometry, while the player can inspect its legible content normally.
    const m=mesh('b3_session_card');
    addBox(m,[0,.004,0],[.30,.008,.20],MAT.paper);
    for(let i=0;i<5;i++)addBox(m,[0,.009,-.067+i*.03],[.25,.002,.003],MAT.black);
    addBox(m,[-.055,.010,-.058],[.08,.002,.004],MAT.black);
    addBox(m,[-.03,.010,-.027],[.13,.002,.004],MAT.black);
    addBox(m,[-.02,.010,.003],[.15,.002,.004],MAT.black);
    addBox(m,[-.02,.012,.003],[.16,.002,.008],MAT.black); // third channel crossed through
    addBox(m,[.07,.010,.048],[.045,.002,.004],MAT.brass);
  }
  {
    const m=mesh('b3_boom_microphone');
    // Stand with three deployed feet, telescoping upright, angled boom and mic.
    addCylinder(m,[0,.075,0],.055,.10,MAT.black,8);
    for(const a of[0,Math.PI*2/3,Math.PI*4/3]){
      const x=Math.cos(a),z=Math.sin(a);
      addBeam(m,[x*.04,.10,z*.04],[x*.39,.025,z*.39],.025,MAT.steel);
      addCylinder(m,[x*.39,.021,z*.39],.035,.025,MAT.black,8);
    }
    addCylinder(m,[0,.74,0],.016,1.32,MAT.steel,8);
    addCylinder(m,[0,1.22,0],.027,.055,MAT.black,8);
    addCylinder(m,[0,1.48,0],.011,.52,MAT.steel,8);
    addBeam(m,[-.25,1.47,0],[.48,1.69,0],.025,MAT.steel);
    addCylinder(m,[0,1.55,0],.035,.07,MAT.black,8);
    addBeam(m,[.46,1.68,0],[.61,1.72,0],.055,MAT.black);
    addCylinderX(m,[.615,1.723,0],.034,.07,MAT.steel,10);
    // Loose mic tail, visibly not connected to the floor box.
    addBeam(m,[.51,1.68,.025],[.37,1.41,.035],.012,MAT.black);
    addBeam(m,[.37,1.41,.035],[.18,.23,.06],.012,MAT.black);
    addBeam(m,[.18,.23,.06],[.45,.035,.14],.012,MAT.black);
  }
  {
    const m=mesh('b3_folded_mic_stand');
    addCylinder(m,[0,.54,0],.018,1.02,MAT.steel,8);
    addCylinder(m,[0,1.02,0],.028,.05,MAT.black,8);
    for(const a of[0,Math.PI*2/3,Math.PI*4/3]){
      const x=Math.cos(a),z=Math.sin(a);
      addBeam(m,[x*.035,.09,z*.035],[x*.09,.48,z*.09],.019,MAT.steel);
    }
    addBeam(m,[-.04,.97,0],[.06,1.17,0],.024,MAT.black);
  }
  {
    const m=mesh('b3_stage_snake');
    // Numbered-looking sockets and a heavy multicore whose free tail ends at
    // the coil: nothing suggests the quiet unpowered patchbay is connected.
    addBox(m,[0,.115,0],[.46,.20,.26],MAT.black);
    addBox(m,[0,.218,0],[.43,.012,.23],MAT.steel);
    for(let i=0;i<6;i++){
      const x=-.16+i*.064;
      addCylinder(m,[x,.23,-.04],.021,.012,MAT.black,8);
      addBox(m,[x,.229,.065],[.038,.006,.024],MAT.paper);
    }
    addBeam(m,[.23,.08,0],[.37,.04,.03],.035,MAT.black);
    for(let ring=0;ring<5;ring++){
      const radius=.21+ring*.018;
      for(let i=0;i<20;i++){
        const a=i*Math.PI*2/20,b=(i+1)*Math.PI*2/20;
        addBeam(m,[.67+Math.cos(a)*radius,.035+ring*.017,Math.sin(a)*radius],[.67+Math.cos(b)*radius,.035+ring*.017,Math.sin(b)*radius],.018,MAT.black);
      }
    }
    addBeam(m,[.90,.07,.02],[1.16,.035,.11],.025,MAT.black);
    addBeam(m,[1.16,.035,.11],[1.27,.035,.13],.04,MAT.steel);
  }
  {
    const m=mesh('b3_flight_case');
    addBox(m,[0,.38,0],[1.05,.72,.56],MAT.black);
    for(const y of[.05,.71])addBox(m,[0,y,0],[1.08,.035,.59],MAT.steel);
    for(const x of[-.50,.50])for(const z of[-.27,.27])addBox(m,[x,.38,z],[.035,.72,.035],MAT.steel);
    for(const x of[-.29,.29])addBox(m,[x,.40,-.29],[.12,.09,.025],MAT.brass);
    addBox(m,[.15,.73,0],[.35,.01,.16],MAT.paper);
  }
}
