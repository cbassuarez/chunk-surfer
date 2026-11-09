import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntry = path.join(root, 'node_modules/vite/bin/vite.js');
const mockEntry = path.join(root, 'tools/chunk_surfer/tests/mock-lens-service.mjs');
const captureEntry = path.join(root, 'scripts/capture-van-icon.mjs');
const chrome = (process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find((candidate) => candidate && existsSync(candidate))) || null;
if (!chrome) throw new Error('Chrome executable not found; set CHROME_PATH explicitly');

const reservePort = () => new Promise((resolve) => {
  const server = net.createServer();
  server.unref();
  server.once('error', () => server.listen(0));
  server.listen({ host: '127.0.0.1', port: 0 }, () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});

const children = [];
const launch = (label, args, options = {}) => {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...options.env }, stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  if (!options.inherit) {
    child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
    child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  }
  return child;
};
const waitForHttp = async (url, child, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Vite exited before the page was ready');
    try { const response = await fetch(url); if (response.ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Timed out waiting for ' + url);
};
const waitForOutput = (child, pattern, timeoutMs = 30000) => new Promise((resolve, reject) => {
  let output = '';
  const timer = setTimeout(() => reject(new Error('Mock lens never became ready')), timeoutMs);
  const onData = (chunk) => { output += chunk.toString(); if (pattern.test(output)) finish(); };
  const onExit = () => finish(new Error('Mock lens exited before ready'));
  function finish() { clearTimeout(timer); child.stdout.off('data', onData); child.off('exit', onExit); resolve(); }
  child.stdout.on('data', onData);
  child.once('exit', onExit);
});

try {
  const [frontendPort, lensPort] = await Promise.all([reservePort(), reservePort()]);
  const base = `http://127.0.0.1:${frontendPort}`;
  const lens = `ws://127.0.0.1:${lensPort}`;
  const mock = launch('lens', [mockEntry], { env: { MOCK_LENS_PORT: String(lensPort) } });
  const mockReady = waitForOutput(mock, /mock lens ready/);
  const vite = launch('vite', [viteEntry, '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort']);
  await Promise.all([mockReady, waitForHttp(`${base}/index.html`, vite)]);
  const capture = launch('capture', [captureEntry], { inherit: true, env: { CHROME_PATH: chrome, CHUNK_SURFER_URL: base, MOCK_LENS_URL: lens } });
  await new Promise((resolve, reject) => {
    capture.once('exit', (code) => (code === 0 ? resolve() : reject(new Error('Icon capture failed with ' + code))));
    capture.once('error', reject);
  });
} finally {
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}