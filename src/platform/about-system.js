export const APP_LINKS = Object.freeze({
  website: 'https://cbassuarez.com',
  reportProblem: 'https://github.com/cbassuarez/chunk-surfer/issues/new',
});

export const APP_COPYRIGHT = '© 2026 Sebastian Suarez-Solis';

function finiteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanText(value, fallback = '') {
  const text = String(value ?? fallback).replace(/[\r\n\t]+/g, ' ').trim();
  return text || fallback;
}

export function normalizeAboutSnapshot(input = {}) {
  return {
    appName: cleanText(input.appName, 'Chunk Surfer'),
    version: cleanText(input.version, '0.1.0'),
    build: cleanText(input.build, 'LOCAL'),
    website: cleanText(input.website, APP_LINKS.website),
    reportProblem: cleanText(input.reportProblem, APP_LINKS.reportProblem),
    copyright: cleanText(input.copyright, APP_COPYRIGHT),

    runtime: {
      mode: cleanText(input.runtime?.mode, 'web'),
      platform: cleanText(input.runtime?.platform, 'unknown'),
      renderer: cleanText(input.runtime?.renderer, 'default'),
      lens: typeof input.runtime?.lens === 'boolean' ? input.runtime.lens : null,
    },

    performance: {
      fps: finiteNumber(input.performance?.fps, null),
      frameMs: finiteNumber(input.performance?.frameMs, null),
    },

    display: {
      width: finiteNumber(input.display?.width, 0),
      height: finiteNumber(input.display?.height, 0),
      dpr: finiteNumber(input.display?.dpr, 1),
      stageScale: cleanText(input.display?.stageScale, '1'),
      uiScale: cleanText(input.display?.uiScale, '1'),
      renderScale: cleanText(input.display?.renderScale, 'auto'),
    },

    audio: {
      state: cleanText(input.audio?.state, 'unknown'),
      sampleRate: finiteNumber(input.audio?.sampleRate, null),
    },

    storage: {
      backend: cleanText(input.storage?.backend, 'unknown'),
      healthy: input.storage?.healthy !== false,
    },
  };
}

export function formatAboutValue(value, fallback = 'Unavailable') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

export function formatFps(fps) {
  const value = Number(fps);
  if (!Number.isFinite(value) || value <= 0) return 'Measuring…';
  return `${Math.round(value)} FPS`;
}

export function formatRuntime(snapshot) {
  const runtime = snapshot?.runtime || {};
  const mode = runtime.mode === 'desktop' ? 'Desktop' : 'Web';
  const platform = runtime.platform && runtime.platform !== 'unknown'
    ? ` / ${runtime.platform}`
    : '';
  return `${mode}${platform}`;
}

export function formatLens(value) {
  if (value === true) return 'On';
  if (value === false) return 'Off';
  return 'Unknown';
}

function safeRecentEntries(recent) {
  if (!Array.isArray(recent) || !recent.length) return ['- None recorded'];
  return recent.slice(-10).map((entry) => {
    const level = cleanText(entry?.level, 'info').toLowerCase();
    const message = cleanText(entry?.message, '').slice(0, 180);
    return `- ${level}: ${message}`;
  });
}

export function formatDiagnosticReport(snapshot, extra = {}) {
  const s = normalizeAboutSnapshot(snapshot);

  return [
    `${s.appName} Diagnostic Report`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `Version: ${s.version}`,
    `Build: ${s.build}`,
    `Runtime: ${formatRuntime(s)}`,
    `Renderer: ${formatAboutValue(s.runtime.renderer)}`,
    `Lens: ${formatLens(s.runtime.lens)}`,
    '',
    `Window: ${s.display.width}×${s.display.height} @ DPR ${s.display.dpr}`,
    `Stage Scale: ${s.display.stageScale}`,
    `UI Scale: ${s.display.uiScale}`,
    `Render Scale: ${s.display.renderScale}`,
    '',
    `Performance: ${formatFps(s.performance.fps)}`,
    `Audio: ${s.audio.state}${s.audio.sampleRate ? ` / ${s.audio.sampleRate} Hz` : ''}`,
    `Storage: ${s.storage.backend}${s.storage.healthy ? ' / OK' : ' / Check needed'}`,
    '',
    `Website: ${s.website}`,
    `Report: ${s.reportProblem}`,
    '',
    'Recent Diagnostics:',
    ...safeRecentEntries(extra.recent),
  ].join('\n');
}

export async function copyText(text) {
  if (globalThis.navigator?.clipboard?.writeText) {
    await globalThis.navigator.clipboard.writeText(String(text ?? ''));
    return true;
  }
  return false;
}
