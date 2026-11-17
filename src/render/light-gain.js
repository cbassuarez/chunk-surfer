// ONE STOP MORE LIGHT. Chosen from the lighting audit (tools/chunk_surfer/
// lighting-audit): in every previewed view, doubling every controllable light
// looked better than moving ambient into the lamps, and it carries 2–4 times
// more of the lit scene onto a visible screen value.
//
// Applied where the values reach the shaders, so it covers exactly what the
// audit previewed: ambient, bounce, every local lamp and the torch, in the
// world march, the Source void composite and both mesh passes. The rig data,
// the acquisition exposure and the light no lamp controls (sky, emitters,
// haze) are unchanged, and r3dLightingDebug still reports the authored values.
export const LIGHT_GAIN_STOPS = 1;
export const LIGHT_GAIN = 2 ** LIGHT_GAIN_STOPS;

/** A gained copy of an RGB colour (the torch carries its strength in its colour). */
export function gainedRgb(rgb, out = new Float32Array(3)) {
  for (let i = 0; i < 3; i++) out[i] = (Number(rgb?.[i]) || 0) * LIGHT_GAIN;
  return out;
}

/** A gained copy of packed [r, g, b, intensity] lamps: only the intensity scales. */
export function gainedLightColors(colors, out = null) {
  if (!colors) return colors;
  if (!out || out.length !== colors.length) out = new Float32Array(colors.length);
  out.set(colors);
  for (let i = 3; i < out.length; i += 4) out[i] *= LIGHT_GAIN;
  return out;
}
