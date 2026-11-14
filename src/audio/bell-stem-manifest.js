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

// Validate the recording before decodeAudioData consumes/detaches its bytes.
// The encoded source remains 48kHz; Web Audio resamples its decoded buffer to
// the context's rate. Those are separate contracts, not an asset failure.
function sourceWavInfo(bytes, url) {
  const invalid = (reason) => { throw new Error(`bell stem ${url} ${reason}`); };
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 12) invalid('must be a complete RIFF/WAVE recording');
  const view = new DataView(bytes);
  const tag = (at) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') invalid('must be a RIFF/WAVE recording');
  const end = view.getUint32(4, true) + 8;
  if (end < 12 || end > bytes.byteLength) invalid('has a truncated RIFF payload');
  let format = null, dataBytes = null, cursor = 12;
  while (cursor + 8 <= end) {
    const id = tag(cursor), size = view.getUint32(cursor + 4, true), start = cursor + 8;
    if (start + size > end) invalid(`has a truncated ${id} chunk`);
    if (id === 'fmt ') {
      if (format || size < 16) invalid('has an invalid format chunk');
      let encoding = view.getUint16(start, true);
      const channels = view.getUint16(start + 2, true), sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true), blockAlign = view.getUint16(start + 12, true), bits = view.getUint16(start + 14, true);
      if (encoding === 65534) {
        if (size < 40 || view.getUint16(start + 16, true) < 22) invalid('has an incomplete extensible format');
        const tail = [0,0,16,0,128,0,0,170,0,56,155,113];
        if (!tail.every((value, i) => view.getUint8(start + 28 + i) === value)) invalid('has an unsupported extensible encoding');
        encoding = view.getUint32(start + 24, true);
      }
      if (![1, 3].includes(encoding)) invalid('must contain uncompressed PCM or float samples');
      if (channels !== 1) invalid('source must be mono');
      if (sampleRate !== 48000) invalid('source sampleRate must equal 48000');
      if (!(encoding === 1 ? [8,16,24,32] : [32,64]).includes(bits)
        || blockAlign !== channels * bits / 8 || byteRate !== sampleRate * blockAlign) invalid('has inconsistent PCM frame metadata');
      format = { sampleRate, channels, blockAlign };
    }
    if (id === 'data') {
      if (dataBytes !== null) invalid('has duplicate audio payload chunks');
      dataBytes = size;
    }
    cursor = start + size + (size & 1);
  }
  if (cursor !== end || !format || dataBytes === null || dataBytes % format.blockAlign) invalid('has incomplete WAV sample data');
  const frames = dataBytes / format.blockAlign, duration = frames / format.sampleRate;
  if (duration < 12) invalid('source must be at least 12 seconds');
  return { ...format, frames, duration };
}

export async function loadBellStemBank(context, manifestValue, { fetchImpl = globalThis.fetch, baseUrl = null } = {}) {
  const manifest = normalizeBellStemManifest(resolveBellStemManifestUrls(manifestValue, baseUrl));
  if (typeof fetchImpl !== 'function') throw new Error('bell stem loading requires fetch');
  const bank = new Map();
  await Promise.all(manifest.entries.map(async (entry) => {
    const response = await fetchImpl(entry.url);
    if (!response.ok) throw new Error(`bell stem ${entry.url} returned ${response.status}`);
    const bytes = await response.arrayBuffer(), source = sourceWavInfo(bytes, entry.url);
    const buffer = await decodeAudioData(context, bytes);
    // decodeAudioData's normative resampling step targets BaseAudioContext,
    // not the file's original clock: https://www.w3.org/TR/webaudio/#dom-baseaudiocontext-decodeaudiodata
    if (buffer.sampleRate !== context.sampleRate) throw new Error(`bell stem ${entry.url} decoded at ${buffer.sampleRate} Hz instead of context ${context.sampleRate} Hz`);
    if (buffer.numberOfChannels !== 1) throw new Error(`bell stem ${entry.url} must decode as mono`);
    if (!Number.isFinite(buffer.duration) || buffer.duration < 11.99) throw new Error(`bell stem ${entry.url} must be at least 12 seconds`);
    if (Math.abs(buffer.duration - source.duration) > 2 / context.sampleRate) throw new Error(`bell stem ${entry.url} changed duration during decode`);
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
