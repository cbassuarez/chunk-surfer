import { isTauriRuntime } from './detect.js';
import { resolveDesktopPaths } from './paths/desktopPaths.js';
import { revealPath } from './diagnostics/desktopDiagnostics.js';
import { interferenceHtml, interferenceManifest, normalizeInterferenceRecord } from '../game/interference-case.js';

const ROOT = 'field_returns';
const KEY_PATH = 'personalized-interference.key';

function hexToBytes(value) {
  const text = String(value || '').trim();
  if (!/^[0-9a-f]{64}$/iu.test(text)) return null;
  return Uint8Array.from(text.match(/.{2}/gu).map((byte) => Number.parseInt(byte, 16)));
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function tauriFs() {
  if (!isTauriRuntime()) return null;
  try { return await import('@tauri-apps/plugin-fs'); } catch (_) { return null; }
}

export async function loadOrCreateInterferenceKey({ fsApi = null, cryptoApi = globalThis.crypto } = {}) {
  const fs = fsApi || await tauriFs();
  if (!fs || !cryptoApi?.getRandomValues) {
    const ephemeral = new Uint8Array(32);
    cryptoApi?.getRandomValues?.(ephemeral);
    return ephemeral;
  }
  const { BaseDirectory } = fs;
  try {
    const raw = await fs.readTextFile(KEY_PATH, { baseDir: BaseDirectory.AppConfig });
    const parsed = hexToBytes(raw);
    if (parsed) return parsed;
  } catch (_) {}
  const key = cryptoApi.getRandomValues(new Uint8Array(32));
  await fs.writeTextFile(KEY_PATH, bytesToHex(key), { baseDir: BaseDirectory.AppConfig });
  return key;
}

function writeAscii(view, offset, value) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

export function buildInterferenceWav(record, { sampleRate = 11025, seconds = 9 } = {}) {
  const safe = normalizeInterferenceRecord(record);
  const samples = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(out);
  writeAscii(view, 0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true);
  writeAscii(view, 8, 'WAVEfmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); writeAscii(view, 36, 'data'); view.setUint32(40, samples * 2, true);
  const seedText = `${safe?.caseId || 'FIELD-00000000'}:${safe?.artifactRevision || 0}`;
  let seed = 0x43535552;
  for (const ch of seedText) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
  const revisions = Math.max(1, safe?.revisions?.length || 0);
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    const noise = ((seed / 0xffffffff) * 2 - 1) * .025;
    const carrier = Math.sin(Math.PI * 2 * (82 + revisions * 7) * t) * .12;
    const returnTone = Math.sin(Math.PI * 2 * (164 + (safe?.artifactRevision || 0) * 3) * t) * .055;
    const gate = (Math.floor(t * 4) % 8) < Math.min(7, 2 + revisions) ? 1 : .18;
    const fade = Math.min(1, t * 2) * Math.min(1, (seconds - t) * 1.5);
    const sample = Math.max(-1, Math.min(1, (carrier + returnTone + noise) * gate * fade));
    pcm[i] = Math.round(sample * 32767);
  }
  for (let i = 0; i < samples; i++) {
    const sourceIndex = safe?.endingId === 'inversion' ? samples - 1 - i : i;
    view.setInt16(44 + i * 2, pcm[sourceIndex], true);
  }
  return new Uint8Array(out);
}

export async function buildInterferenceSpectrogram(record, { documentApi = globalThis.document } = {}) {
  if (!documentApi?.createElement) return null;
  const safe = normalizeInterferenceRecord(record);
  const canvas = documentApi.createElement('canvas');
  canvas.width = 960; canvas.height = 320;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#030706'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const wav = buildInterferenceWav(safe, { sampleRate: 8000, seconds: 9 });
  const pcm = new DataView(wav.buffer, wav.byteOffset + 44, wav.byteLength - 44);
  const sampleCount = Math.floor(pcm.byteLength / 2);
  const columns = 240;
  const bands = 64;
  const windowSize = 128;
  for (let column = 0; column < columns; column++) {
    const center = Math.floor((column / Math.max(1, columns - 1)) * Math.max(0, sampleCount - windowSize));
    for (let band = 0; band < bands; band++) {
      let real = 0;
      let imaginary = 0;
      for (let i = 0; i < windowSize; i++) {
        const sample = pcm.getInt16((center + i) * 2, true) / 32768;
        const windowed = sample * (.5 - .5 * Math.cos((Math.PI * 2 * i) / (windowSize - 1)));
        const angle = (Math.PI * 2 * band * i) / windowSize;
        real += windowed * Math.cos(angle);
        imaginary -= windowed * Math.sin(angle);
      }
      const magnitude = Math.min(1, Math.log1p(Math.hypot(real, imaginary) * 3) / 3.2);
      const red = Math.round(22 + magnitude * 186);
      const green = Math.round(42 + magnitude * (band > 48 ? 56 : 142));
      const blue = Math.round(39 + magnitude * (band > 48 ? 34 : 104));
      ctx.fillStyle = `rgb(${red},${green},${blue})`;
      ctx.fillRect(column * 4, canvas.height - 1 - band * 4, 4, 4);
    }
  }
  ctx.fillStyle = '#d18a34'; ctx.font = '18px monospace'; ctx.fillText(`AUDIOCORP ${safe?.caseId || 'UNFILED'} / REV ${safe?.artifactRevision || 0}`, 24, 30);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export async function writeInterferenceArtifact(record, { fsApi = null } = {}) {
  const safe = normalizeInterferenceRecord(record);
  if (!safe?.caseId) return { ok: false, reason: 'NO_CASE' };
  const fs = fsApi || await tauriFs();
  if (!fs) return { ok: false, unsupported: true, caseId: safe.caseId };
  const { BaseDirectory } = fs;
  const dir = `${ROOT}/${safe.caseId}`;
  await fs.mkdir(dir, { baseDir: BaseDirectory.AppData, recursive: true });
  await Promise.all([
    fs.writeTextFile(`${dir}/index.html`, interferenceHtml(safe), { baseDir: BaseDirectory.AppData }),
    fs.writeTextFile(`${dir}/manifest.txt`, interferenceManifest(safe), { baseDir: BaseDirectory.AppData }),
    fs.writeFile(`${dir}/field_audio.wav`, buildInterferenceWav(safe), { baseDir: BaseDirectory.AppData }),
    buildInterferenceSpectrogram(safe).then((png) => png
      ? fs.writeFile(`${dir}/spectrogram.png`, png, { baseDir: BaseDirectory.AppData })
      : null),
  ]);
  return { ok: true, caseId: safe.caseId, relativePath: dir };
}

export async function revealInterferenceArtifact(caseId) {
  const safeId = CASE_ID(caseId);
  if (!safeId || !isTauriRuntime()) return { ok: false, unsupported: true };
  const paths = await resolveDesktopPaths();
  if (!paths?.appData) return { ok: false, unsupported: true };
  const separator = paths.appData.endsWith('/') || paths.appData.endsWith('\\') ? '' : '/';
  return revealPath(`${paths.appData}${separator}${ROOT}/${safeId}/index.html`);
}

const CASE_ID = (value) => /^FIELD-[0-9A-F]{8}$/u.test(String(value || '')) ? String(value) : null;

export async function deleteInterferenceArtifact(caseId, { fsApi = null } = {}) {
  const safeId = CASE_ID(caseId);
  if (!safeId) return false;
  const fs = fsApi || await tauriFs();
  if (!fs) return false;
  const { BaseDirectory } = fs;
  try { await fs.remove(`${ROOT}/${safeId}`, { baseDir: BaseDirectory.AppData, recursive: true }); } catch (_) {}
  return true;
}

export async function eraseAllInterferenceData({ fsApi = null } = {}) {
  const fs = fsApi || await tauriFs();
  if (!fs) return false;
  const { BaseDirectory } = fs;
  await Promise.all([
    fs.remove(ROOT, { baseDir: BaseDirectory.AppData, recursive: true }).catch(() => {}),
    fs.remove(KEY_PATH, { baseDir: BaseDirectory.AppConfig }).catch(() => {}),
  ]);
  return true;
}
