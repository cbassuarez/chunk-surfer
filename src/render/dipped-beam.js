// THE VAN'S DIPPED BEAM. Seb, 2026-11-06 (Northern drives audit): the lamps lit
// a round pool at the bumper because the old beam fell off as (18/(10+d))^2, so
// the road ten metres out was forty times brighter than the road at thirty.
//
// This is a UK passing beam, for traffic on the left: a sharp, flat cut-off on
// the offside (right, toward oncoming drivers) that rises at 15 degrees from the
// elbow toward the nearside (left), so the verge, the walls and the signs on his
// side of the road light up further out than the crown. Its intensity is
// highest just under the cut-off and lower in the foreground, which is what
// spreads light down the road in a long tongue instead of a puddle.
//
// Angles are tangents in the van's own axes: h across (right positive), v up,
// both over distance along the heading. `dip` lowers the cut-off below the
// lamp's horizontal (the session passes 0.020 minus the road's pitch).
//
// One function, three users: surface light (props3d), the beam in the rain and
// fog (r3d), and the cat's eyes, which answer whatever the beam gives them.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export const DIPPED_BEAM=Object.freeze({
  rise:Math.tan(15*Math.PI/180),   // the nearside kick-up, from the elbow
  maxRise:.030,                    // tops out about 1.7 degrees above the flat part
  edge:Object.freeze([-.006,.010]),// soft below, a little softer above: a visible line, not a blur
  hotAxis:-.040,                   // the hot zone sits a touch to the left
  spread:Object.freeze([.26,.62]), // full to about 15 degrees each way, gone by about 32
  nearsideWidth:.88,               // the nearside reaches a little wider than the offside
  floor:.09,                       // foreground intensity
  hot:.72,                         // added just under the cut-off: the road prints mid-tone, so paint, signs and studs read over it
  hotDepth:.050,                   // how far below the cut-off the hot zone fades
});

/** Beam intensity toward `ray` (lamp to point, world metres). */
export function dippedBeamWeight(ray,heading=0,dip=.02,beam=DIPPED_BEAM){
  const fx=Math.sin(heading),fz=-Math.cos(heading),rx=Math.cos(heading),rz=Math.sin(heading);
  const along=ray[0]*fx+ray[2]*fz;if(along<.05)return 0;
  const a=Math.max(.3,along),h=(ray[0]*rx+ray[2]*rz)/a,v=ray[1]/a+dip;
  const kick=Math.min(beam.maxRise,beam.rise*Math.max(0,-h)),over=v-kick;
  const cut=1-smoothstep(beam.edge[0],beam.edge[1],over);
  const across=h-beam.hotAxis,side=across<0?Math.abs(across)*beam.nearsideWidth:Math.abs(across);
  const spread=1-smoothstep(beam.spread[0],beam.spread[1],side);
  const below=Math.max(0,-over);
  return cut*spread*(beam.floor+beam.hot*Math.exp(-below/beam.hotDepth));
}

const f=n=>{const s=String(n);return s.includes('.')||s.includes('e')?s:s+'.0';};
const B=DIPPED_BEAM;
export const DIPPED_BEAM_GLSL=`
float ukDippedBeam(vec3 ray,float heading,float dip){
 vec3 forward=vec3(sin(heading),0.0,-cos(heading)),right=vec3(cos(heading),0.0,sin(heading));
 float along=dot(ray,forward);if(along<.05)return 0.0;
 float a=max(.3,along),h=dot(ray,right)/a,v=ray.y/a+dip;
 float over=v-min(${f(B.maxRise)},${f(B.rise)}*max(0.0,-h));
 float cut=1.0-smoothstep(${f(B.edge[0])},${f(B.edge[1])},over);
 float across=h-(${f(B.hotAxis)});float side=across<0.0?abs(across)*${f(B.nearsideWidth)}:abs(across);
 float spread=1.0-smoothstep(${f(B.spread[0])},${f(B.spread[1])},side);
 return cut*spread*(${f(B.floor)}+${f(B.hot)}*exp(-max(0.0,-over)/${f(B.hotDepth)}));
}
`;
