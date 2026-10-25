import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const runner=readFileSync('scripts/run-latest.mjs','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));

assert.equal(pkg.scripts['tauri:dev'],'node scripts/run-latest.mjs');
assert.match(runner,/port:\s*0/,'dev launcher asks the OS for free ports');
assert.match(runner,/randomBytes\(24\)/,'dev lens uses a per-launch token');
assert.match(runner,/devUrl:`http:\/\/127\.0\.0\.1:\$\{frontendPort\}`/);
assert.match(runner,/LENS_PORT:String\(lensPort\)/);
assert.doesNotMatch(runner,/frontendPort\s*=\s*5173/);

// Execute the actual launch decisions with process/OS seams replaced. Avoid
// starting Tauri, a model process, or a real listening socket in this check.
const launchBody = runner
  .replace(/^#![^\n]*\n/, '')
  .replace(/^import[^\n]*\n/gm, '')
  .replace(/import\.meta\.url/g, "'file:///game/scripts/run-latest.mjs'")
  .replace('await new Promise(() => {});', 'return {stop};');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function launch(args = []) {
  const launches = [], checks = [], signals = new Map(), timers = [];
  let portRequests = 0, tokenRequests = 0;
  const process = {
    argv: ['node', 'run-latest.mjs', ...args],
    // An old shell endpoint must not silently opt a normal launch back in.
    env: { VITE_LENS_DEV_URL: 'ws://127.0.0.1:9999', VITE_LENS_DEV_TOKEN: 'old-token', VITE_STABLE_DIFFUSION: '1' },
    on: (name, fn) => signals.set(name, fn),
    exit: (code) => { throw new Error(`unexpected exit ${code}`); },
  };
  const spawn = (file, argv, options) => {
    const child = { killed: false, events: new Map(), on(name, fn) { this.events.set(name, fn); }, kill(signal) { this.killed = signal; } };
    launches.push({ file, argv, options, child });
    return child;
  };
  const net = { createServer() {
    const port = 42000 + ++portRequests;
    return { unref() {}, once() {}, listen(options, ready) { assert.equal(options.port, 0); ready(); }, address: () => ({ port }), close: (closed) => closed() };
  } };
  const result = await new AsyncFunction('access', 'constants', 'spawn', 'net', 'randomBytes', 'fileURLToPath', 'path', 'process', 'console', 'setTimeout', launchBody)(
    async (file) => checks.push(file), { X_OK: 1 }, spawn, net,
    (size) => { tokenRequests++; assert.equal(size, 24); return { toString: () => 'fresh-auth-token' }; },
    () => '/game/scripts/run-latest.mjs', path, process, { log() {}, error() {} },
    (fn) => { timers.push(fn); return { unref() {} }; },
  );
  return { ...result, launches, checks, portRequests, tokenRequests, signals, timers };
}

const normal = await launch();
assert.equal(normal.launches.length, 1, 'normal launch starts the game only');
assert.match(normal.launches[0].file, /node_modules\/\.bin\/tauri$/);
assert.deepEqual(normal.checks, ['/game/node_modules/.bin/tauri'], 'no Python runtime is required by default');
assert.equal(normal.portRequests, 1, 'only the frontend reserves a port');
assert.equal(normal.tokenRequests, 0, 'no lens token or process exists by default');
assert.equal(normal.launches[0].options.env.VITE_LENS_DEV_URL, '');
assert.equal(normal.launches[0].options.env.VITE_LENS_DEV_TOKEN, '');
assert.equal(normal.launches[0].options.env.VITE_STABLE_DIFFUSION, '0');
normal.stop();
assert.equal(normal.launches[0].child.killed, 'SIGTERM', 'cleanup handles the absence of a lens child');

const optedIn = await launch(['--sd']);
assert.equal(optedIn.launches.length, 2, 'explicit --sd retains the local development lens');
assert.match(optedIn.checks[0], /\.venv-local\/bin\/python$/);
assert.match(optedIn.launches[0].file, /diffusion_server\/run-local\.sh$/);
assert.equal(optedIn.portRequests, 2);
assert.equal(optedIn.tokenRequests, 1);
assert.equal(optedIn.launches[0].options.env.LENS_EAGER, '0');
assert.equal(optedIn.launches[0].options.env.LENS_TOKEN, 'fresh-auth-token');
assert.equal(optedIn.launches[1].options.env.VITE_LENS_DEV_URL, 'ws://127.0.0.1:42002');
assert.equal(optedIn.launches[1].options.env.VITE_LENS_DEV_TOKEN, 'fresh-auth-token');
assert.equal(optedIn.launches[1].options.env.VITE_STABLE_DIFFUSION, '1');
optedIn.signals.get('SIGINT')();
assert.ok(optedIn.launches.every(({ child }) => child.killed === 'SIGTERM'), 'explicit lens and game stop together');

console.log('development launch contract tests ok');
