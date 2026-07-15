#!/usr/bin/env node

import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serviceDir = path.join(root, 'tools/chunk_surfer/diffusion_server');
const lens = path.join(serviceDir, 'run-local.sh');
const python = path.join(serviceDir, '.venv-local/bin/python');
const tauri = path.join(root, 'node_modules/.bin/tauri');
function reserveRandomPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address=server.address();
      server.close(()=>resolve(address.port));
    });
  });
}

async function executable(file, help) {
  try {
    await access(file, constants.X_OK);
  } catch {
    console.error(help);
    process.exit(1);
  }
}

await executable(python, 'Local lens runtime is missing. Run: npm run lens:setup');
await executable(tauri, 'Tauri dependencies are missing. Run: npm install');

const frontendPort=await reserveRandomPort();
const lensPort=await reserveRandomPort();
const endpoint=`ws://127.0.0.1:${lensPort}`;
const lensToken=randomBytes(24).toString('hex');
const devConfig=JSON.stringify({
  build:{
    devUrl:`http://127.0.0.1:${frontendPort}`,
    beforeDevCommand:`npm run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort`,
  },
});

console.log('Starting the current game with the local critical lens.');
console.log(`Build: 0.1.1-beta.1 · frontend: http://127.0.0.1:${frontendPort}`);
console.log('The first 10 material textures load before the 22-second opening; the remaining banks continue in the background.');

const lensChild = spawn(lens, [], {
  cwd: root,
  env: { ...process.env, LENS_EAGER: '0', LENS_PORT:String(lensPort), LENS_TOKEN:lensToken },
  stdio: 'inherit',
});
const tauriChild = spawn(tauri, ['dev','--config',devConfig], {
  cwd: root,
  env: { ...process.env, VITE_LENS_DEV_URL:endpoint, VITE_LENS_DEV_TOKEN:lensToken },
  stdio: 'inherit',
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (!lensChild.killed) lensChild.kill('SIGTERM');
  if (!tauriChild.killed) tauriChild.kill('SIGTERM');
  setTimeout(() => process.exit(code), 100).unref();
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => stop(0));
}
lensChild.on('error', (error) => { console.error(`Lens launch failed: ${error.message}`); stop(1); });
tauriChild.on('error', (error) => { console.error(`Tauri launch failed: ${error.message}`); stop(1); });
lensChild.on('exit', (code, signal) => {
  if (!stopping) {
    console.error(`Lens stopped unexpectedly (${signal || code}).`);
    stop(code || 1);
  }
});
tauriChild.on('exit', (code) => stop(code || 0));

await new Promise(() => {});
