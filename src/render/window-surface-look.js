// THE LOOK OF THE LOOSE WINDOWS.
//
// Up to eight media surfaces and four fireball casts leave the game and stand
// on the desktop as real OS windows. They have to read as one instrument --
// with each other, and with the game they came out of -- and the pass that was
// here did neither. This module owns that look as data so it can be measured,
// and hands the shader the one copy of the GLSL.
//
// WHAT WAS WRONG, in the order it mattered:
//
//   1. The dither was switched OFF exactly when the surfaces settle. The
//      threshold was `mix(blueNoiseRank, 0.5, coherence)`, so at coherence 1 --
//      the resting state -- every pixel was measured against a constant 0.5 and
//      the screen stopped being a screen. What was left was a four-level
//      posterisation into five colours: flat violet continents with hard edges.
//      That is the "way too low-res" complaint, and it is not resolution at all.
//   2. It quantised by luminance alone. The game's own mesh has a comment about
//      this exact mistake -- "a palette that quantises by luminance alone throws
//      away everything the material said in colour" -- and the fix there is to
//      let the source's chroma bend the block it lands in. Same fix here, same
//      two lines, so the two images are made the same way.
//   3. There was no pixel grid, and the grid it did have was in the wrong
//      space. `globalPx` added a desktop origin measured in CSS points to a
//      gl_FragCoord measured in device pixels, so on any retina display the
//      "shared" desktop lattice was offset by half in every window and the
//      surfaces could not line up with each other even in principle.
//
// The result is a 16-bit look rather than an 8-bit one: a long ramp, dithered
// between its steps and again into a 5/6/5 output grid, on a pixel lattice fine
// enough to sit beside the game's own mesh rather than shout over it.

// THE CELL, IN DESKTOP LOGICAL POINTS.
//
// The lattice has to be defined in a space every window agrees on. Device
// pixels are not it: two windows on displays of different scale would disagree,
// and the origin arrives from a DOM rect in points anyway. In points, every
// surface floors the same coordinate and the cells line up across the bezels --
// which is the whole of "cohesive as a unit".
//
// 1.5pt is 3 device pixels at 2x, which is exactly the game's own vfd.cellPx on
// battle/hush/rupture and one off calm's. Deliberately fine: the ask was 16-bit,
// not 8-bit, so the pixels should be visible without being the subject.
export const WINDOW_CELL_PT = 1.5;

// The sector grid the NVMe fault tears along, also moved into points so it is
// the same size on every display. 56x23pt is the 112x46 device pixels it used
// to be at 2x, so the fault looks as it always did on the machine it was tuned on.
export const WINDOW_FAULT_SECTOR_PT = Object.freeze({ w: 56, h: 23 });

// HOW MUCH THE SCREEN CALMS WHEN A SURFACE SETTLES.
//
// Coherence used to run this to 1.0 and erase the dither. It is a mood, not a
// switch: at its calmest the mask still carries two thirds of its weight, so a
// settled surface is quieter than a faulting one and still a screen.
export const WINDOW_COHERENT_FLATTEN = 0.34;

// THE RAMP.
//
// The violet is the window channel's own voice and it stays -- these are not
// the amber and green machines, they are the thing that gets out of them. The
// five colours below at the EVEN indices are the approved palette, unchanged
// and exact; what is new are the four between them. Five swatches with nothing
// in between is why the pass could only round to the nearest one and print flat
// continents. With a step either side, the dither has somewhere to go, and the
// same five colours now read as a ramp instead of as a posterisation.
const A=[0.004,0.008,0.018];   // the approved five
const B=[0.018,0.045,0.105];
const C=[0.115,0.105,0.350];
const D=[0.380,0.200,0.560];
const E=[0.730,0.880,1.000];
const between=(x,y)=>Object.freeze(x.map((v,i)=>Number(((v+y[i])/2).toFixed(4))));
export const WINDOW_RAMP = Object.freeze([
  Object.freeze(A), between(A,B),
  Object.freeze(B), between(B,C),
  Object.freeze(C), between(C,D),
  Object.freeze(D), between(D,E),
  Object.freeze(E),
]);

// The approved five, kept addressable so a test can prove they survived.
export const WINDOW_RAMP_APPROVED = Object.freeze([A,B,C,D,E].map(Object.freeze));

// THE RAMP THE FRONT END BORROWS.
//
// While the opening and the menu are up, the desktop behind these windows is
// the camera printed as a negative (see FRONT_END_GRADE in look-profiles.js) --
// paper where the night was, ink where the rain was. Four violet fragments
// unfolding onto a paper-white desktop belong to a different picture, so for as
// long as that plate is on, the surfaces are graded to it instead.
//
// Both ends are MEASURED off the graded title, not chosen: sampling the plate
// either side of the menu card, the ink sits at rgb(0,1,1) and the paper caps
// at rgb(130,138,134) -- a cool green-grey, and dimmer than it looks, because
// the paper end is the VFD's light ink rather than white. Everything between is
// a straight line: the plate's own mid, rgb(95,101,98), lands within half a
// level of the lerp, so the ramp is that line at nine even stops. Matching the
// cap is the point -- a window that ran to white would sit ON the desktop
// rather than in it.
const FRONT_END_INK = Object.freeze([0 / 255, 1 / 255, 1 / 255]);
const FRONT_END_PAPER = Object.freeze([130 / 255, 138 / 255, 134 / 255]);
export const WINDOW_FRONT_END_RAMP = Object.freeze(
  Array.from({ length: WINDOW_RAMP.length }, (_, i) => {
    const t = i / (WINDOW_RAMP.length - 1);
    return Object.freeze(FRONT_END_INK.map((v, c) => Number((v + (FRONT_END_PAPER[c] - v) * t).toFixed(4))));
  }),
);
export const WINDOW_FRONT_END_ENDS = Object.freeze({ ink: FRONT_END_INK, paper: FRONT_END_PAPER });

// The two numbers the game uses for the same job, in the game's own ranges.
//
// paletteAmount is far higher than any game profile because out here the
// palette IS the subject, where in the game it is a tint over a lit render.
// That is also why paletteChroma has to be far LOWER than the game's for the
// same visual weight: at an amount of 0.06-0.22 the game can spend 0.46 of
// chroma and still be a tint, but at 0.82 the same number stops bending the
// block and starts restoring the source. Measured across the four surfaces,
// chroma at 0.34 left the clinical eye 47% warm -- a brown video in a violet
// channel. 0.16 holds it at 21% and still carries ~450 distinct colours in the
// cathedral against the 58 the old pass managed. It lands beside the game's
// `hush` profile, which spends 0.18.
export const WINDOW_PALETTE_AMOUNT = 0.82;
export const WINDOW_PALETTE_CHROMA = 0.16;

// 5/6/5. The literal answer to "not 8 bit, 16 bit": 65,536 colours reached by
// ordered dithering into the grid, rather than five swatches reached by
// rounding to the nearest one.
export const WINDOW_QUANT_STEPS = Object.freeze({ r: 31, g: 63, b: 31 });

const vec3 = ([r, g, b]) => `vec3(${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)})`;

// The look stage, as GLSL. Takes the media colour and the shared cell it landed
// in; returns what the window paints. `rank` is a blue-noise sample keyed to
// that same shared cell, so the mask is continuous across the bezels too.
export const WINDOW_SURFACE_LOOK_GLSL = `
const int RAMP_N=${WINDOW_RAMP.length};
const float CELL_PT=${WINDOW_CELL_PT.toFixed(3)};
const vec2 SECTOR_PT=vec2(${WINDOW_FAULT_SECTOR_PT.w.toFixed(1)},${WINDOW_FAULT_SECTOR_PT.h.toFixed(1)});
const float COHERENT_FLATTEN=${WINDOW_COHERENT_FLATTEN.toFixed(3)};
const float PALETTE_AMOUNT=${WINDOW_PALETTE_AMOUNT.toFixed(3)};
const float PALETTE_CHROMA=${WINDOW_PALETTE_CHROMA.toFixed(3)};
const vec3 QUANT_STEPS=vec3(${WINDOW_QUANT_STEPS.r}.,${WINDOW_QUANT_STEPS.g}.,${WINDOW_QUANT_STEPS.b}.);
vec3 rampAt(int i,float negative){
  vec3 v[RAMP_N]=vec3[RAMP_N](${WINDOW_RAMP.map(vec3).join(',')});
  vec3 f[RAMP_N]=vec3[RAMP_N](${WINDOW_FRONT_END_RAMP.map(vec3).join(',')});
  int j=clamp(i,0,RAMP_N-1);
  return mix(v[j],f[j],clamp(negative,0.,1.));
}
vec3 windowSurfaceLook(vec3 rgb,float rank,float quantRank,float coherence,float negative){
  float y=dot(rgb,vec3(.2126,.7152,.0722));
  y=clamp((y-.47)*1.18+.48,0.,1.);
  // PRINTED, NOT JUST TINTED. The desktop behind these is the camera as a
  // negative, so a fragment that merely borrowed the ramp still read upside
  // down against it: the night sky behind the window prints as paper while the
  // same darkness inside the window printed as ink, and the pane became a hole.
  // Inverting with the plate puts both on the same side of the paper.
  y=mix(y,1.-y,clamp(negative,0.,1.));

  // The mask still carries most of its weight when the surface is settled; it
  // is never replaced by a constant, which is what flattened it before.
  float threshold=mix(rank,.5,clamp(coherence,0.,1.)*COHERENT_FLATTEN);

  // Dither BETWEEN adjacent ramp steps rather than rounding to one of them.
  float t=y*float(RAMP_N-1);
  int low=int(floor(t));
  vec3 pal=rampAt(fract(t)>threshold?low+1:low,negative);

  // The game's line, for the game's reason: let the media's own chroma bend the
  // block it lands in, so the encode keeps what the picture said in colour.
  // The chroma bend and the raw-media mix both stand down as the plate comes
  // up. They exist to keep the violet channel from flattening into luminance;
  // left running against the front-end ramp they would put the video's own
  // colour back into a grey plate and undo the match.
  vec3 chroma=rgb-vec3(dot(rgb,vec3(.2126,.7152,.0722)));
  float keep=1.-clamp(negative,0.,1.);
  pal=clamp(pal+chroma*PALETTE_CHROMA*keep,0.,1.);
  vec3 col=mix(rgb,pal,mix(PALETTE_AMOUNT,1.,clamp(negative,0.,1.)));

  // Into the 16-bit grid, ordered. A second, decorrelated rank: reusing the
  // ramp's would tie the two dithers together and print the pattern twice.
  return floor(col*QUANT_STEPS+quantRank)/QUANT_STEPS;
}
`;
