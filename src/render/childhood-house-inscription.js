import { HOME_HOUSE } from '../data/childhood-house.js';

// Finger strokes in the powder. The words are assembled in sill metres and
// get individual spacing, tilt and depth so a repeated letter is never a stamp.
const strokes = {
  L: { advance: 3.8, lines: [[[.6, 6.4], [.46, 3.8], [.68, .47], [2.2, .41], [3.32, .62]]] },
  e: { advance: 3.8, lines: [[[.47, 2.16], [1.97, 2.39], [3.05, 2.68], [2.8, 3.42], [2.17, 3.76],
    [1.24, 3.61], [.58, 2.83], [.51, 1.56], [1.16, .62], [2.04, .41], [2.93, .74], [3.24, 1.05]]] },
  a: { advance: 4, lines: [[[2.89, 3.29], [2.16, 3.66], [1.33, 3.44], [.65, 2.56], [.48, 1.47],
    [.83, .64], [1.51, .43], [2.39, 1.02], [2.95, 2.25]], [[3.11, 3.58], [2.95, 1.92], [3.23, .52]]] },
  v: { advance: 3.6, lines: [[[.46, 3.68], [1.06, 1.98], [1.78, .48], [2.52, 2.16], [3.1, 3.74]]] },
  t: { advance: 3.22, lines: [[[1.58, 5.48], [1.4, 3.34], [1.46, 1.22], [1.89, .55], [2.49, .58], [2.9, .98]],
    [[.39, 3.53], [1.61, 3.72], [2.83, 3.77]]] },
  h: { advance: 3.87, lines: [[[.53, 6.04], [.48, 3.8], [.57, .49]],
    [[.58, 2.63], [1.5, 3.57], [2.29, 3.68], [2.83, 3.22], [2.98, 2.14], [3.03, .64]]] },
  b: { advance: 3.95, lines: [[[.61, 6.08], [.52, 3.67], [.7, .44]],
    [[.61, 2.71], [1.55, 3.58], [2.48, 3.6], [3.07, 2.92], [3.09, 1.78], [2.48, .83], [1.57, .57], [.73, 1.12]]] },
  o: { advance: 4.05, lines: [[[2.45, 3.64], [1.43, 3.61], [.65, 2.85], [.52, 1.75], [1.04, .76],
    [1.91, .46], [2.87, .76], [3.44, 1.74], [3.31, 2.82], [2.56, 3.62], [2.24, 3.67]]] },
  k: { advance: 3.6, lines: [[[.66, 6.14], [.59, 3.13], [.7, .43]],
    [[3.0, 3.86], [2.13, 2.98], [.82, 2.05], [2.03, 2.0], [3.05, .58]]] },
  s: { advance: 3.72, lines: [[[3.04, 3.22], [2.35, 3.67], [1.4, 3.65], [.77, 3.17], [.75, 2.59],
    [1.4, 2.23], [2.4, 2.01], [3, 1.59], [2.92, .95], [2.26, .53], [1.35, .51], [.56, .97]]] },
  r: { advance: 3.38, lines: [[[.56, 3.58], [.63, 1.82], [.65, .44]],
    [[.63, 2.43], [1.48, 3.39], [2.27, 3.61], [2.88, 3.29]]] },
  '.': { advance: 1.48, lines: [[[.5, .56], [.66, .62]]] },
  ' ': { advance: 2.12, lines: [] },
};

const phrase = 'Leave the books here.';
const { x: windowX, z: windowZ, bottom: windowBottom } = HOME_HOUSE.clearPane;
const stoneSurface = windowBottom - .07 + HOME_HOUSE.windowDress.sillThickness;
const advance = Array.from(phrase, letter => strokes[letter].advance).reduce((sum, width) => sum + width, 0);
const letterWidth = .0232;
// The raised frost at the sash begins about ten centimetres forward of the
// glass. Keep the full ascenders in the clear powder on the exposed nosing.
const baseline = windowZ - .259;
const metre = number => number.toFixed(5);
let cursor = windowX - advance * letterWidth * .50;
let lastExit = null;
const joins = new Set([1, 2, 4, 7, 8, 10, 11, 12, 16, 17, 18]);
const letters = Array.from(phrase, (letter, index) => {
  const glyph = strokes[letter];
  const baselineOffset = .0049 * Math.sin(index * 1.54 + .2)
    + (index > 8 && index < 14 ? .005 * Math.sin((index - 8) * .57) : 0);
  const slope = .0027 * Math.sin(index * 2.61 + .4) - .0016;
  const height = .0211 * (1 + .073 * Math.sin(index * 3.37));
  const points = glyph.lines.map(line => line.map(([x, z]) => [
    cursor + x * letterWidth + slope * z,
    baseline + baselineOffset + z * height,
  ]));
  cursor += glyph.advance * letterWidth;
  if (!points.length) {
    lastExit = null;
    return '';
  }
  const point = xy => `vec2(${xy.map(metre).join(',')})`;
  const paths = [];
  const stroke = (a, b, pressure) => paths.push(
    `    hhSillStroke(uv,${point(a)},${point(b)},${metre(pressure)},nearest);`);
  points.forEach((line, strokeIndex) => line.slice(1).forEach((end, i) => {
    const pressure = 1.00 + .25 * Math.sin(index * 2.1 + strokeIndex * 1.4 + i * .83);
    stroke(line[i], end, pressure);
  }));
  const entry = points.flat().filter(([, z]) => z < baseline + .050).sort(([a], [b]) => a - b)[0];
  const exit = points.flat().filter(([, z]) => z < baseline + .051).sort(([a], [b]) => b - a)[0];
  const joinsPrevious = joins.has(index) && entry && lastExit && entry[0] - lastExit[0] < .061;
  const positions = points.flat().map(([x]) => x);
  if (joinsPrevious) {
    const dip = [(entry[0] + lastExit[0]) / 2, Math.min(entry[1], lastExit[1]) - .005];
    stroke(lastExit, dip, .68);
    stroke(dip, entry, .73);
    positions.push(lastExit[0]);
  }
  lastExit = exit;
  const min = Math.min(...positions) - .034;
  const max = Math.max(...positions) + .034;
  return `  if(uv.x>${metre(min)}&&uv.x<${metre(max)}){\n${paths.join('\n')}\n  }`;
}).join('\n');

export const CHILDHOOD_HOUSE_INSCRIPTION_GLSL = `
// Carry the vector to the stroke so the snow surface has a downhill
// direction on both sides of the trough, including its rounded ends.
void hhSillStroke(vec2 uv,vec2 a,vec2 b,float pressure,inout vec4 nearest){
  vec2 axis=b-a;
  vec2 offset=uv-a-axis*clamp(dot(uv-a,axis)/dot(axis,axis),0.0,1.0);
  float distanceM=length(offset)/pressure;
  if(distanceM<nearest.x)nearest=vec4(distanceM,offset,pressure);
}
vec4 hhSillNearestStroke(vec2 uv){
  vec4 nearest=vec4(.05,0.0,0.0,1.0);
${letters}
  return nearest;
}
// Analytic derivative of smoothstep with respect to distance in metres.
float hhSillSlope(float a,float b,float r){
  float s=clamp((r-a)/(b-a),0.0,1.0);
  return 6.0*s*(1.0-s)/(b-a);
}
vec4 hhSillRelief(vec4 nearest,float width,float cover,float drift,out vec2 gradient){
  float r=nearest.x;
  vec2 outward=nearest.yz/max(length(nearest.yz),.0001);
  float pressure=nearest.w;
  float depth=mix(.009,.030,smoothstep(.67,1.23,pressure));
  float floorWidth=width*.22, wallEnd=width*1.25;
  float cut=1.0-smoothstep(floorWidth,wallEnd,r);
  float sink=min(cover,depth*cut);
  // Displaced snow gathers on the side of the finger's drag and in little
  // broken rolls where a stroke lifts.
  float bankHeight=.0064*mix(.34,1.0,smoothstep(-.45,.66,dot(outward,vec2(-.28,.96))))*drift;
  float bankIn=width*.83, bankTop=width*1.36, bankOut=width*2.05;
  float bank=bankHeight*(smoothstep(bankIn,bankTop,r)-smoothstep(bankTop,bankOut,r));
  float slope=depth*hhSillSlope(floorWidth,wallEnd,r)*step(depth*cut,cover)
    +bankHeight*(hhSillSlope(bankIn,bankTop,r)-hhSillSlope(bankTop,bankOut,r));
  gradient=outward*slope/pressure;
  return vec4(bank-sink,sink,cut,bank/max(bankHeight,.0001));
}
void hhSillWriting(vec3 p,vec3 rd,inout vec3 n,float material,float distanceM,inout vec3 albedo,inout vec3 ambient){
  if(uHomeOldv.y<.5||material<45.5||material>46.5||n.y<.62||distanceM>2.6)return;
  if(abs(p.y-${metre(windowBottom + .012)})>.026||p.z<${metre(windowZ - .283)}
    ||p.z>${metre(windowZ - .101)}||abs(p.x-(${metre(windowX)}))>.94)return;
  float close=1.0-smoothstep(1.85,2.60,distanceM);
  float fine=ewNoise(p.xz*127.0);
  float coarse=ewNoise(p.xz*39.0);
  float width=.0130+(coarse-.5)*.0033;
  float cover=clamp(p.y-${metre(stoneSurface)},.015,.031);
  float drift=mix(.58,1.2,coarse);
  vec2 uv=p.xz+(vec2(fine,coarse)-.5)*.0026;
  vec4 nearest=hhSillNearestStroke(uv);
  if(nearest.x>width*2.06)return;
  vec2 gradient;
  vec4 relief=hhSillRelief(nearest,width,cover,drift,gradient);
  // A bounded relief lookup down the real view ray lets a low-angle view
  // see more of the near wall and less of the stone at the bottom.
  vec2 slide=rd.xz*(-relief.x)*close*.46/max(.33,-rd.y);
  float slideLength=length(slide);
  if(slideLength>.001){
    nearest=hhSillNearestStroke(uv+slide*min(1.0,.009/slideLength));
    relief=hhSillRelief(nearest,width,cover,drift,gradient);
  }
  n=normalize(n+vec3(-gradient.x,0.0,-gradient.y)*close*.77);
  float recess=relief.y/cover;
  float exposed=smoothstep(.78,.98,recess)*(1.0-smoothstep(.21,.56,nearest.x/width));
  vec3 wetStone=vec3(.27,.29,.30)*mix(.87,1.11,fine);
  albedo=mix(albedo*mix(1.0,.82,relief.z*close),wetStone,exposed*close*.86);
  albedo+=vec3(.040,.049,.054)*relief.w*close*drift;
  ambient*=1.0-.24*recess*close;
}
`;
