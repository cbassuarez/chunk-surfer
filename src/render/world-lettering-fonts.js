// Exact world-pigment faces. These names never alias the approved UI fonts.
// A CanvasTexture must wait for this promise before its first permanent bake.
import { assetUrl as defaultAssetUrl } from '../platform/paths.js';

export const WORLD_LETTERING_FONT = Object.freeze({
  mono: 'World Lettering Mono', monoBold: 'World Lettering Mono Bold',
  sans: 'World Lettering Sans', sansBold: 'World Lettering Sans Bold',
  serif: 'World Lettering Roman',
});
export const WORLD_LETTERING_FONT_FILES = Object.freeze([
  Object.freeze({ role: 'mono', file: 'NimbusMonoPS-Regular.otf', sha256: '4f225ca8e13acb16f733ce741693105e527d5f7a5443901b9ecc190fca4e149b' }),
  Object.freeze({ role: 'monoBold', file: 'NimbusMonoPS-Bold.otf', sha256: 'f036d05d2168c7f71cb11d31e81d11133f3d09711e24ebde19d08a24842384d5' }),
  Object.freeze({ role: 'sans', file: 'NimbusSans-Regular.otf', sha256: '7c25be4d78155523080ab85b10277150657ff7dabbcad7037bdd536c9b6d0d08' }),
  Object.freeze({ role: 'sansBold', file: 'NimbusSans-Bold.otf', sha256: '7f33328e6b4d4cd21b45fa625791928c9407dc702db6780e56b09ca9a3ecaa67' }),
  Object.freeze({ role: 'serif', file: 'NimbusRoman-Regular.otf', sha256: 'fd41669443616a7ae890c42e53a58f47fa24a940fd1e367acaff665cf5b6e9d8' }),
]);
export const WORLD_LETTERING_FONT_KEY = WORLD_LETTERING_FONT_FILES.map(face => `${face.role}:${face.sha256}`).join('|');
const states = new WeakMap();

export function worldLetteringFont(size, role = 'mono') {
  const family = WORLD_LETTERING_FONT[role];
  if (!family) throw new RangeError(`Unknown world lettering role: ${role}`);
  if (!(Number(size) > 0)) throw new RangeError('World lettering needs a positive font size');
  return `${Number(size)}px "${family}"`;
}
export function worldLetteringFontsStatus(owner = globalThis.document) {
  const state = owner?.fonts && states.get(owner);
  return { ready: !!state?.ready, pending: !!state?.promise && !state?.ready && !state?.error,
    error: state?.error || '', key: WORLD_LETTERING_FONT_KEY };
}
export function ensureWorldLetteringFonts({ assetUrl = defaultAssetUrl, ownerDocument = globalThis.document, FontFaceClass = globalThis.FontFace } = {}) {
  const set = ownerDocument?.fonts;
  if (!set || typeof FontFaceClass !== 'function') return Promise.reject(new Error('World lettering requires the Canvas font-loading API'));
  // Keep readiness on the document. Native DOM FontFaceSet wrappers can be
  // collected/recreated between an asynchronous load and a later material bake.
  const existing = states.get(ownerDocument);
  if (existing) return existing.promise;
  const state = { ready: false, error: '', promise: null };
  states.set(ownerDocument, state);
  state.promise = Promise.all(WORLD_LETTERING_FONT_FILES.map(async face => {
    const url = String(assetUrl(`assets/fonts/${face.file}`));
    // Each explicit role is a separate family at normal weight. Callers choose
    // the actual bold face instead of triggering synthetic browser bolding.
    const font = new FontFaceClass(WORLD_LETTERING_FONT[face.role], `url(${JSON.stringify(url)})`, { style: 'normal', weight: '400' });
    const loaded = await font.load(); set.add(loaded);
    return { role: face.role, family: font.family, url, sha256: face.sha256 };
  })).then(faces => {
    state.ready = true;
    return { ready: true, key: WORLD_LETTERING_FONT_KEY, faces };
  }).catch(error => {
    state.error = String(error?.message || error);
    throw new Error(`World lettering font load failed: ${state.error}`, { cause: error });
  });
  return state.promise;
}
