import { ELLERY_BELLS } from '../data/bell-tower.js';

export const BELL_STEM_MANIFEST_SCHEMA = 1;
export const BELL_STEM_STROKES = Object.freeze(['hand', 'back']);

const finiteInt = (value) => Number.isInteger(Number(value)) && Number(value) >= 0;
const keyFor = (bell, stroke, variation) => `${bell}:${stroke}:${variation}`;

export function validateBellStemManifest(value) {
  const errors = [];
  if (!value || typeof value !== 'object') return { ok: false, errors: ['manifest must be an object'] };
  if (value.schema !== BELL_STEM_MANIFEST_SCHEMA) errors.push(`schema must equal ${BELL_STEM_MANIFEST_SCHEMA}`);
  if (Number(value.sampleRate) !== 48000) errors.push('sampleRate must equal 48000');
  if (value.contactAlignment !== 'sample-offset') errors.push('contactAlignment must equal sample-offset');
  const entries = Array.isArray(value.entries) ? value.entries : [];
  if (!entries.length) errors.push('entries must not be empty');
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const label = `entries[${index}]`;
    if (!ELLERY_BELLS.some((bell) => bell.id === Number(entry?.bell))) errors.push(`${label}.bell must be 1-8`);
    if (!BELL_STEM_STROKES.includes(entry?.stroke)) errors.push(`${label}.stroke must be hand or back`);
    if (!finiteInt(entry?.variation)) errors.push(`${label}.variation must be a non-negative integer`);
    if (typeof entry?.url !== 'string' || !entry.url.trim()) errors.push(`${label}.url is required`);
    if (!finiteInt(entry?.contactOffsetSamples)) errors.push(`${label}.contactOffsetSamples must be a non-negative integer`);
    if (entry?.gainDb != null && !Number.isFinite(Number(entry.gainDb))) errors.push(`${label}.gainDb must be finite`);
    const key = keyFor(Number(entry?.bell), entry?.stroke, Number(entry?.variation));
    if (seen.has(key)) errors.push(`${label} duplicates ${key}`); else seen.add(key);
  }
  for (const bell of ELLERY_BELLS) for (const stroke of BELL_STEM_STROKES) {
    if (!entries.some((entry) => Number(entry.bell) === bell.id && entry.stroke === stroke)) errors.push(`missing bell ${bell.id} ${stroke}`);
  }
  return { ok: errors.length === 0, errors };
}

export function normalizeBellStemManifest(value) {
  const validation = validateBellStemManifest(value);
  if (!validation.ok) throw new Error(`invalid bell stem manifest: ${validation.errors.join('; ')}`);
  return Object.freeze({
    schema: BELL_STEM_MANIFEST_SCHEMA,
    sampleRate: 48000,
    contactAlignment: 'sample-offset',
    entries: Object.freeze(value.entries.map((entry) => Object.freeze({
      bell: Number(entry.bell),
      stroke: entry.stroke,
      variation: Number(entry.variation),
      url: entry.url,
      contactOffsetSamples: Number(entry.contactOffsetSamples),
      gainDb: Number(entry.gainDb) || 0,
      licenseId: typeof entry.licenseId === 'string' ? entry.licenseId : null,
    }))),
  });
}

export function chooseBellStem(manifest, record) {
  if (!manifest?.entries?.length) return null;
  const candidates = manifest.entries.filter((entry) => entry.bell === record.bell && entry.stroke === record.stroke);
  if (!candidates.length) return null;
  const selector = Math.abs((Number(record.rowIndex) || 0) * 11 + (Number(record.place) || 0) * 3 + record.bell);
  return candidates[selector % candidates.length];
}

export function resolveBellStemManifestUrls(value, baseUrl = null) {
  if (!baseUrl || !Array.isArray(value?.entries)) return value;
  return {
    ...value,
    entries: value.entries.map((entry) => ({
      ...entry,
      url: new URL(entry.url, baseUrl).href,
    })),
  };
}

function decodeAudioData(context, bytes) {
  return new Promise((resolve, reject) => {
    const result = context.decodeAudioData(bytes, resolve, reject);
    if (result && typeof result.then === 'function') result.then(resolve, reject);
  });
}

export async function loadBellStemBank(context, manifestValue, { fetchImpl = globalThis.fetch, baseUrl = null } = {}) {
  const manifest = normalizeBellStemManifest(resolveBellStemManifestUrls(manifestValue, baseUrl));
  if (typeof fetchImpl !== 'function') throw new Error('bell stem loading requires fetch');
  const bank = new Map();
  await Promise.all(manifest.entries.map(async (entry) => {
    const response = await fetchImpl(entry.url);
    if (!response.ok) throw new Error(`bell stem ${entry.url} returned ${response.status}`);
    const buffer = await decodeAudioData(context, await response.arrayBuffer());
    if (buffer.sampleRate !== manifest.sampleRate) throw new Error(`bell stem ${entry.url} decoded at ${buffer.sampleRate} Hz`);
    if (buffer.numberOfChannels !== 1) throw new Error(`bell stem ${entry.url} must decode as mono`);
    if (buffer.duration < 11.99) throw new Error(`bell stem ${entry.url} must be at least 12 seconds`);
    bank.set(keyFor(entry.bell, entry.stroke, entry.variation), { ...entry, buffer });
  }));
  return {
    manifest,
    size: bank.size,
    pick(record) {
      const entry = chooseBellStem(manifest, record);
      return entry ? bank.get(keyFor(entry.bell, entry.stroke, entry.variation)) || null : null;
    },
  };
}

export async function loadBellStemBankFromUrl(context, manifestUrl, { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('bell stem loading requires fetch');
  const response = await fetchImpl(manifestUrl);
  if (!response.ok) throw new Error(`bell stem manifest ${manifestUrl} returned ${response.status}`);
  return loadBellStemBank(context, await response.json(), { fetchImpl, baseUrl: manifestUrl });
}

export function bellStemTemplate({ roundRobins = 1, baseUrl = '/assets/audio/bell-tower' } = {}) {
  const entries = [];
  for (const bell of ELLERY_BELLS) for (const stroke of BELL_STEM_STROKES) for (let variation = 0; variation < Math.max(1, roundRobins); variation++) {
    entries.push({
      bell: bell.id,
      stroke,
      variation,
      url: `${baseUrl}/bell-${String(bell.id).padStart(2, '0')}-${stroke}-${String(variation + 1).padStart(2, '0')}.wav`,
      contactOffsetSamples: 0,
      gainDb: 0,
      licenseId: null,
    });
  }
  return { schema: BELL_STEM_MANIFEST_SCHEMA, sampleRate: 48000, contactAlignment: 'sample-offset', entries };
}
