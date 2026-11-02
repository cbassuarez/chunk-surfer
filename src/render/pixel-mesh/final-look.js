// The finished ordinary-world plate: blue-black carbon and warm limestone ink.
// These are recording endpoints; lighting, material hue and explicit Source,
// warning and authored-surface inks still belong to their existing passes.
export const FINAL_INK = Object.freeze({
  dark: Object.freeze([0.003, 0.0042, 0.007]),
  light: Object.freeze([0.93, 0.90, 0.79]),
});

const vec = v => `vec3(${v.map(n => Number(n).toFixed(5)).join(',')})`;

// Two almost aligned recording screens form one slow interference band. The
// high-frequency carriers are cancelled analytically, avoiding unstable pixel
// aliasing. The surface phase is spatial and held: no time oscillator, noise
// flash, post-process tint or additional tonal endpoint is introduced.
export const FINAL_LOOK_GLSL = `
const vec3 FINAL_CARBON_INK = ${vec(FINAL_INK.dark)};
const vec3 FINAL_LIMESTONE_INK = ${vec(FINAL_INK.light)};
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
