// The finished ordinary-world plate: blue-black carbon and neutral light ink.
// These are recording endpoints; lighting, material hue and explicit Source,
// warning and authored-surface inks still belong to their existing passes.
export const FINAL_INK = Object.freeze({
  dark: Object.freeze([0.003, 0.0042, 0.007]),
  light: Object.freeze([0.90, 0.90, 0.90]),
});

const vec = v => `vec3(${v.map(n => Number(n).toFixed(5)).join(',')})`;
export const MATERIAL_INK_RESPONSE = Object.freeze({
  strength: 0.34,
  saturationLow: 0.04,
  saturationHigh: 0.28,
  maximum: 0.98,
  epsilon: 0.00001,
});

// CPU reference for the approved material-colour resolve. Relative saturation
// admits the same hue at different light levels; the caller's existing black
// protection still decides whether real light was captured at all. A single
// RGB scale brings the ink into gamut without clipping individual channels.
export function finalMaterialLightInk(broadColor, capturedLight = 1) {
  const rgb = Array.from({length: 3}, (_, i) => Number.isFinite(broadColor?.[i]) ? broadColor[i] : 0);
  const response = MATERIAL_INK_RESPONSE, hi = Math.max(...rgb), lo = Math.min(...rgb);
  const relativeSaturation = (hi - lo) / Math.max(response.epsilon, hi);
  const t = Math.max(0, Math.min(1, (relativeSaturation - response.saturationLow) / (response.saturationHigh - response.saturationLow)));
  const presence = t * t * (3 - 2 * t) * Math.max(0, Math.min(1, Number.isFinite(capturedLight) ? capturedLight : 0));
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  const hue = rgb.map(channel => channel - luminance);
  const length = Math.max(response.epsilon, ...hue.map(Math.abs));
  const pigment = hue.map((channel, i) => FINAL_INK.light[i] + channel / length * response.strength * presence);
  const gain = Math.min(1, response.maximum / Math.max(...pigment));
  return pigment.map(channel => channel * gain);
}

// Two almost aligned recording screens form one slow interference band. The
// high-frequency carriers are cancelled analytically, avoiding unstable pixel
// aliasing. The surface phase is spatial and held: no time oscillator, noise
// flash, post-process tint or additional tonal endpoint is introduced.
export const FINAL_LOOK_GLSL = `
const vec3 FINAL_CARBON_INK = ${vec(FINAL_INK.dark)};
const vec3 FINAL_NEUTRAL_INK = ${vec(FINAL_INK.light)};
vec3 finalMaterialLightInk(vec3 broadColor, float capturedLight){
  float hi=max(broadColor.r,max(broadColor.g,broadColor.b));
  float lo=min(broadColor.r,min(broadColor.g,broadColor.b));
  float relativeSaturation=(hi-lo)/max(${MATERIAL_INK_RESPONSE.epsilon.toFixed(5)},hi);
  float presence=smoothstep(${MATERIAL_INK_RESPONSE.saturationLow.toFixed(2)},${MATERIAL_INK_RESPONSE.saturationHigh.toFixed(2)},relativeSaturation)*capturedLight;
  vec3 hue=broadColor-vec3(dot(broadColor,vec3(.2126,.7152,.0722)));
  hue/=max(${MATERIAL_INK_RESPONSE.epsilon.toFixed(5)},max(abs(hue.r),max(abs(hue.g),abs(hue.b))));
  vec3 pigment=FINAL_NEUTRAL_INK+hue*${MATERIAL_INK_RESPONSE.strength.toFixed(2)}*presence;
  return pigment*min(1.0,${MATERIAL_INK_RESPONSE.maximum.toFixed(2)}/max(pigment.r,max(pigment.g,pigment.b)));
}
float finalScreenInterference(vec2 pixel, vec2 grain, vec3 world, float period){
  vec2 normal=vec2(-grain.y,grain.x);
  float angle=.045;
  vec2 second=vec2(normal.x*cos(angle)-normal.y*sin(angle),
                   normal.x*sin(angle)+normal.y*cos(angle));
  float p=max(4.25,period);
  float firstPhase=dot(pixel,normal)/p;
  float secondPhase=dot(pixel,second)/(p*1.055);
  // Grain is an unoriented line: d and -d must yield exactly the same image.
  // Cosine makes the beat sign-invariant, and a separate held surface envelope
  // lets it travel across real material without changing that property.
  float beat=cos(6.28318530718*(firstPhase-secondPhase));
  return beat*cos(dot(world,vec3(.11,.07,.09)));
}
`;
