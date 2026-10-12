// Renderer experiments only. Loaded by the capture harness and substituted
// into the dev server's r3d.js response; production source remains untouched.
export const SOURCE_PALETTE_VARIANTS = Object.freeze({
  cyanotype: {
    label: 'Cyanotype archive',
    airLow: [.075,.175,.265], airHigh: [.022,.070,.135],
    ink: [.018,.047,.085], surface: [.76,.865,.91],
    code: [.38,.70,.82], light: [1.0,.65,.26],
    cloud: [.10,.21,.31], moon: [.76,.87,.92],
  },
  opal: {
    label: 'Opal and ink',
    airLow: [.72,.68,.79], airHigh: [.88,.86,.92],
    ink: [.11,.073,.16], surface: [.92,.89,.95],
    code: [.53,.62,.73], light: [1.0,.68,.48],
    cloud: [.09,.075,.12], moon: [.97,.94,1.0],
    textInk: [.353,.290,.408],
  },
  oxide: {
    label: 'Oxide',
    airLow: [.105,.255,.215], airHigh: [.022,.090,.078],
    ink: [.015,.055,.045], surface: [.77,.84,.74],
    code: [.36,.63,.56], light: [.98,.55,.25],
    cloud: [.08,.20,.15], moon: [.83,.87,.73],
  },
});

const vec = (v) => `vec3(${v.map(n => n.toFixed(4)).join(',')})`;

export function patchSourcePaletteModule(moduleText, variantName) {
  const p = SOURCE_PALETTE_VARIANTS[variantName];
  if (!p) throw new Error(`Unknown Source palette variant: ${variantName}`);
  const start = moduleText.indexOf('const TEXT_SPACE_FRAG =');
  const end = moduleText.indexOf('const COPY_FRAG =', start);
  if (start < 0 || end < 0) throw new Error('Source text compositor markers not found');
  let shader = moduleText.slice(start, end);
  const air = 'vec3 voidColor=mix(vec3(.0015,.003,.004),vec3(.014,.020,.031),smoothstep(.08,.92,uv.y));';
  if (!shader.includes(air)) throw new Error('Source air expression changed');
  shader = shader.replace(air, `vec3 voidColor=mix(${vec(p.airLow)},${vec(p.airHigh)},smoothstep(.08,.92,uv.y));`);
  shader = shader.replace('vec3(.055,.064,.083)*clouds*uMoonCloud.y', `${vec(p.cloud)}*clouds*uMoonCloud.y`);
  shader = shader.replace('vec3(.72,.77,.80),moon*.86*uMoonCloud.x', `${vec(p.moon)},moon*.86*uMoonCloud.x`);

  const original = `  vec3 paper=vec3(.965,.925,.835);
  vec3 paperScene=mix(paper,vec3(.012,.010,.009),smoothstep(.02,.72,glyphAlpha));
  float lightMix=clamp(max(uSunrise,uPaper*.72),0.0,1.0);
  vec3 composed=mix(darkScene,paperScene,lightMix);`;
  if (!shader.includes(original)) throw new Error('Source paper compositor changed');
  const textInk = p.textInk ? `
  // Pale-air preview: infer the bright premultiplied text separately from
  // the dim, opaque material pass. This is a preview proxy, not a semantic ID.
  float partialText=(1.0-smoothstep(.94,.999,glyphAlpha))*smoothstep(.12,.50,sourcePeak);
  float brightText=smoothstep(.18,.55,sourceEnergy)*(1.0-.75*warmRole);
  float textRole=max(codeRole,max(partialText,brightText));
  materialTone=mix(materialTone,${vec(p.textInk)},clamp(textRole*.90,0.0,.90));` : '';

  // Text render output is premultiplied RGB (TEXT_FRAG rgb*a, blend ONE / 
  // ONE_MINUS_SRC_ALPHA); physical props have opaque alpha and linear RGB.
  // Unpremultiply before deriving value. The fourth-root lift keeps dim real
  // stone/metal distinguishable while preserving the ordering of light/dark.
  // Hue selects a restrained code/light role, rather than recolouring air.
  // Production implementation should carry explicit semantic role metadata;
  // these isolated previews infer it from the existing authored source RGB.
  const replacement = `  vec3 paletteInk=${vec(p.ink)};
  vec3 paletteSurface=${vec(p.surface)};
  vec3 paletteCode=${vec(p.code)};
  vec3 paletteLight=${vec(p.light)};
  vec3 sourceRGB=clamp(glyph/max(glyphAlpha,.025),0.0,1.0);
  float sourceEnergy=dot(sourceRGB,vec3(.2126,.7152,.0722));
  float sourceValue=pow(clamp(sourceEnergy,0.0,1.0),.24);
  float sourcePeak=max(.04,max(sourceRGB.r,max(sourceRGB.g,sourceRGB.b)));
  float warmRole=smoothstep(.12,.64,(sourceRGB.r-sourceRGB.b)/sourcePeak);
  float codeRole=smoothstep(.08,.54,(max(sourceRGB.g,sourceRGB.b)-sourceRGB.r)/sourcePeak);
  vec3 materialTone=mix(paletteInk,paletteSurface,.20+.80*sourceValue);
  materialTone=mix(materialTone,paletteCode,codeRole*(.14+.24*sourceValue));
  materialTone=mix(materialTone,paletteLight,warmRole*(.24+.60*sourceValue));
  // Keep the resolved transition, but let it clarify material values rather
  // than replacing the entire picture with cream and alpha-only black.
  float resolvedLight=clamp(max(uSunrise,uPaper*.72),0.0,1.0);
  materialTone=mix(materialTone,mix(paletteInk,paletteSurface,.27+.73*sourceValue),resolvedLight*.12*(1.0-warmRole));
  ${textInk}
  float coverage=smoothstep(.012,.72,glyphAlpha);
  vec3 composed=mix(voidColor,materialTone,coverage);`;
  shader = shader.replace(original, replacement);
  return moduleText.slice(0, start) + shader + moduleText.slice(end);
}
