import { assetUrl } from '../platform/paths.js';
import mediaProject from '../../content/media/story-art.media.json' with { type: 'json' };

export const STORY_ART_TONES = Object.freeze([
  'person',
  'threshold',
  'subject',
  'device',
  'signal',
  'missing',
]);

export const STORY_ART_MODES = Object.freeze([
  'compact',
  'hero',
  'boss',
]);

function buildStoryArtManifest(project) {
  const assets = new Map((project.assets || []).map((asset) => [asset.id, asset]));
  return Object.freeze(Object.fromEntries((project.storyArt || []).map((slot) => {
    const asset = slot.assetId ? assets.get(slot.assetId) : null;
    return [slot.id, {
      ...slot,
      src: asset?.path ? assetUrl(asset.path) : null,
      mode: normalizeStoryArtMode(slot.mode),
      tone: normalizeStoryArtTone(slot.tone),
      transform: slot.transform || asset?.transform || null,
    }];
  })));
}

export const STORY_ART_PROJECT = Object.freeze(mediaProject);
export const STORY_ART = buildStoryArtManifest(STORY_ART_PROJECT);

const imageCache = new Map();

export function normalizeStoryArtMode(mode, fallback = 'compact') {
  return STORY_ART_MODES.includes(mode) ? mode : fallback;
}

export function normalizeStoryArtTone(tone, fallback = 'missing') {
  return STORY_ART_TONES.includes(tone) ? tone : fallback;
}

export function missingStoryArt(id) {
  return {
    id: String(id || 'missing'),
    src: null,
    label: 'Missing Still',
    caption: 'Source not mounted',
    status: 'UNAVAILABLE',
    tone: 'missing',
    mode: 'compact',
    alt: '',
    missing: true,
  };
}

function refId(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return String(ref.id || ref.art || ref.key || ref.artId || '');
}

export function resolveStoryArt(ref, manifest = STORY_ART) {
  if (!ref) return null;
  const id = refId(ref);
  const base = manifest[id] || missingStoryArt(id);
  if (typeof ref === 'string') return base;

  return {
    ...base,
    ...ref,
    id: base.id,
    src: ref.src || base.src,
    label: ref.label || base.label,
    caption: ref.caption ?? base.caption,
    status: ref.status ?? base.status,
    tone: normalizeStoryArtTone(ref.tone || base.tone),
    mode: normalizeStoryArtMode(ref.mode || ref.artMode || base.mode),
    alt: ref.alt ?? base.alt,
    missing: !!base.missing,
  };
}

export function storyArtRefId(ref) {
  return refId(ref);
}

export function artFromNode(node, fallback = null) {
  if (!node) return fallback;
  if (node.art) return node.art;
  if (node.artId) return { id: node.artId, mode: node.artMode };
  return fallback;
}

export function loadStoryArtImage(src) {
  if (!src || typeof Image === 'undefined') return null;
  if (imageCache.has(src)) return imageCache.get(src);

  const image = new Image();
  const rec = { src, image, loaded: false, error: false, loading: true, promise: null };
  image.onload = () => { rec.loaded = true; rec.loading = false; };
  image.onerror = () => { rec.error = true; rec.loading = false; };
  image.decoding = 'async';
  rec.promise = Promise.resolve()
    .then(() => { image.src = src; })
    .then(() => (typeof image.decode === 'function' ? image.decode() : null))
    .then(() => { rec.loaded = true; rec.loading = false; })
    .catch(() => {
      // onload/onerror remain the source of truth in older webviews.
      if (!rec.loaded) rec.loading = false;
    });
  imageCache.set(src, rec);
  return rec;
}

export function preloadStoryArt(ids = Object.keys(STORY_ART)) {
  const records = [];
  for (const id of ids) {
    const art = STORY_ART[id];
    if (art?.src) records.push(loadStoryArtImage(art.src));
  }
  return records.filter(Boolean);
}

export function storyArtCacheSnapshot() {
  return [...imageCache.values()].map((rec) => ({
    src: rec.src,
    loaded: rec.loaded,
    loading: rec.loading,
    error: rec.error,
    width: rec.image?.naturalWidth || 0,
    height: rec.image?.naturalHeight || 0,
  }));
}
