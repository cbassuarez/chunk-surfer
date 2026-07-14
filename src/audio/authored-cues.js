import { authoringAudioProject } from '../narrative/generated-content.js';
import { assetUrl } from '../platform/paths.js';

const AUDIO_PROJECT = authoringAudioProject || { assets: [], cues: [] };
const assets = new Map(AUDIO_PROJECT.assets.map((asset) => [asset.id, asset]));
const cues = new Map(AUDIO_PROJECT.cues.map((cue) => [cue.id, cue]));

export function authoredCue(id) { return cues.get(id) || null; }
export function authoredAudioProject() { return AUDIO_PROJECT; }
export function authoredCueUrls() {
  return [...new Set(AUDIO_PROJECT.cues.flatMap((cue) => (cue.layers || []).map((layer) => assets.get(layer.assetId)).filter((asset) => asset?.path).map((asset) => assetUrl(asset.path))))];
}

export function dispatchAuthoredCue(id, { play, effect, acoustic } = {}) {
  const cue = authoredCue(id);
  if (!cue) return false;
  for (const layer of cue.layers || []) {
    const asset = assets.get(layer.assetId);
    if (!asset?.path) continue;
    play?.(assetUrl(asset.path), {
      gain: layer.gain ?? 1,
      rate: layer.playbackRate ?? 1,
      pan: layer.pan ?? 0,
      delay: layer.delay ?? 0,
      trimStart: layer.trimStart ?? 0,
      trimEnd: layer.trimEnd,
      fadeIn: layer.fadeIn ?? 0,
      fadeOut: layer.fadeOut ?? 0,
      loop: !!layer.loop,
    }, layer, cue);
  }
  for (const event of cue.effects || []) effect?.(event, cue);
  if (cue.acoustic) acoustic?.(cue.acoustic, cue);
  return true;
}
