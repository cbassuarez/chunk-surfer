// Ellery Square's own fittings: the garden railings, gate piers and monument.
// Trees, benches and lamp columns are the park's existing finished meshes.
//
// Local frames are prop frames: +x along a railing panel, y up, origin on the
// ground at the panel's centre line.

// Railings are read through a one-bit halftone. Bars any finer than this, or
// any closer, turn to moire at walking distance; the heavier standards and the
// stone kerb carry the line from across the square.
const PANEL=2,BAR_PITCH=.25;

export function buildEllerySquareFittings({mesh,addBox,addBeam,addCylinder,MAT}){
  {
    const m=mesh('ellery_square_railing');
    addBox(m,[0,.13,0],[PANEL,.26,.34],MAT.stone);
    addBeam(m,[-PANEL/2,.38,0],[PANEL/2,.38,0],.04,MAT.black);
    addBeam(m,[-PANEL/2,1.12,0],[PANEL/2,1.12,0],.045,MAT.black);
    for(let x=-PANEL/2+BAR_PITCH/2;x<PANEL/2;x+=BAR_PITCH){
      addBeam(m,[x,.26,0],[x,1.22,0],.022,MAT.black);
      addBox(m,[x,1.25,0],[.04,.07,.04],MAT.black);
    }
    // One heavier standard per panel, at its west end, so runs read evenly.
    addBox(m,[-PANEL/2+.04,.72,0],[.07,1.0,.07],MAT.black);
    addCylinder(m,[-PANEL/2+.04,1.3,0],.05,.12,MAT.black,8);
  }
  {
    const m=mesh('ellery_square_gate_pier');
    addBox(m,[0,.12,0],[.66,.24,.66],MAT.stone);
    addBox(m,[0,.98,0],[.52,1.5,.52],MAT.stone);
    addBox(m,[0,1.78,0],[.64,.12,.64],MAT.stone);
    addCylinder(m,[0,1.92,0],.16,.18,MAT.stone,10);
  }
  {
    // A plain civic obelisk: whoever it remembers has worn off the die.
    const m=mesh('ellery_square_monument');
    addBox(m,[0,.2,0],[2.6,.4,2.6],MAT.stone);
    addBox(m,[0,.55,0],[2.1,.3,2.1],MAT.stone);
    addBox(m,[0,1.45,0],[1.5,1.5,1.5],MAT.stone);
    addBox(m,[0,2.3,0],[1.7,.2,1.7],MAT.stone);
    for(const[y,w]of[[3.0,1.0],[3.8,.86],[4.5,.72]])addBox(m,[0,y,0],[w,.8,w],MAT.stone);
    addBox(m,[0,5.05,0],[.5,.3,.5],MAT.stone);
  }
}
