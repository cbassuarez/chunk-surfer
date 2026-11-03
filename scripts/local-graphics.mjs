import { readFile } from 'node:fs/promises';

const BACKENDS = new Set(['default', 'd3d11', 'vulkan']);
export function normalizeAngleBackend(value) {
  if (typeof value !== 'string' || !BACKENDS.has(value.trim().toLowerCase())) {
    throw new Error('ANGLE backend must be default, d3d11, or vulkan.');
  }
  return value.trim().toLowerCase();
}

export function hasExplicitAngleBackend(argumentsText = '') {
  return String(argumentsText).split(/\s+/).some(token => /^--use-angle(?:=|$)/.test(token.replace(/^"|"$/g, '')));
}

// A checkout-local preference only affects this launch. Packaged applications
// retain WebView2's default unless the user explicitly sets the native override.
export async function localGraphicsEnvironment({ platform, env, file, read = readFile }) {
  const result = { ...env };
  if (platform !== 'win32' || hasExplicitAngleBackend(env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS)) return result;
  if (env.CHUNK_SURFER_ANGLE_BACKEND?.trim()) {
    result.CHUNK_SURFER_ANGLE_BACKEND = normalizeAngleBackend(env.CHUNK_SURFER_ANGLE_BACKEND);
    return result;
  }
  let text;
  try {
    text = await read(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return result;
    throw error;
  }
  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: invalid JSON (${error.message}).`);
  }
  if (!config || Array.isArray(config) || typeof config !== 'object' || !Object.hasOwn(config, 'angleBackend')) {
    throw new Error(`${file}: expected an object with angleBackend.`);
  }
  result.CHUNK_SURFER_ANGLE_BACKEND = normalizeAngleBackend(config.angleBackend);
  return result;
}
