import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { localGraphicsEnvironment, normalizeAngleBackend, hasExplicitAngleBackend } from '../scripts/local-graphics.mjs';

const runner=readFileSync('scripts/run-latest.mjs','utf8');
const packageSource=readFileSync('package.json','utf8');
const pkg=JSON.parse(packageSource);

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
async function launch(args = [], {platform='linux',env={},graphicsConfig} = {}) {
  const launches = [], checks = [], fileReads = [], logs = [], signals = new Map(), timers = [];
  const files = new Map([['/game/package.json', packageSource]]);
  if(graphicsConfig!==undefined)files.set('/game/graphics.local.json',typeof graphicsConfig==='string'?graphicsConfig:JSON.stringify(graphicsConfig));
  const readFile = async (file, encoding) => {
    fileReads.push(file);
    assert.equal(encoding, 'utf8');
    if(!files.has(file))throw Object.assign(new Error(`missing ${file}`),{code:'ENOENT'});
    return files.get(file);
  };
  let portRequests = 0, tokenRequests = 0;
  const process = {
    argv: ['node', 'run-latest.mjs', ...args],
    platform,
    execPath:'C:/node/node.exe',
    // An old shell endpoint must not silently opt a normal launch back in.
    env: { VITE_LENS_DEV_URL: 'ws://127.0.0.1:9999', VITE_LENS_DEV_TOKEN: 'old-token', VITE_STABLE_DIFFUSION: '1',...env },
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
  const result = await new AsyncFunction('access', 'readFile', 'constants', 'spawn', 'net', 'randomBytes', 'fileURLToPath', 'path', 'process', 'console', 'setTimeout', 'localGraphicsEnvironment', launchBody)(
    async (file) => checks.push(file), readFile, { X_OK: 1 }, spawn, net,
    (size) => { tokenRequests++; assert.equal(size, 24); return { toString: () => 'fresh-auth-token' }; },
    () => '/game/scripts/run-latest.mjs', path.posix, process, { log: (...args) => logs.push(args.join(' ')), error() {} },
    (fn) => { timers.push(fn); return { unref() {} }; },
    options=>localGraphicsEnvironment({...options,read:readFile}),
  );
  assert.ok(fileReads.includes('/game/package.json'), 'the build label reads the project package');
  assert.ok(fileReads.every(file=>file==='/game/package.json'||platform==='win32'&&file==='/game/graphics.local.json'));
  assert.deepEqual(logs.filter(line => line.startsWith('Build: ')), [
    `Build: ${pkg.version} · frontend: http://127.0.0.1:42001`,
  ], 'the build label uses the current package version and reserved frontend port');
  return { ...result, launches, checks, fileReads, portRequests, tokenRequests, signals, timers };
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

const windows=await launch([],{platform:'win32',graphicsConfig:{angleBackend:'vulkan'}});
assert.equal(windows.launches[0].file,'C:/node/node.exe','Windows uses Node, never a POSIX shim or cmd shell');
assert.equal(windows.launches[0].argv[0],'/game/node_modules/@tauri-apps/cli/tauri.js');
assert.deepEqual(windows.launches[0].argv.slice(1,3),['dev','--config']);
assert.equal(JSON.parse(windows.launches[0].argv[3]).build.devUrl,'http://127.0.0.1:42001','config remains one structured argument');
assert.equal(windows.launches[0].options.shell,undefined,'Windows arguments never pass through shell interpolation');
assert.equal(windows.launches[0].options.env.CHUNK_SURFER_ANGLE_BACKEND,'vulkan');
assert.equal(windows.launches[0].options.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,undefined,'only native startup applies the explicit graphics request');
windows.stop();

const automatic=await launch([],{platform:'win32'});
assert.equal(automatic.launches[0].options.env.CHUNK_SURFER_ANGLE_BACKEND,undefined,'missing local config retains platform defaults');
automatic.stop();
const environment=await launch([],{platform:'win32',env:{CHUNK_SURFER_ANGLE_BACKEND:' DEFAULT '},graphicsConfig:{angleBackend:'vulkan'}});
assert.equal(environment.launches[0].options.env.CHUNK_SURFER_ANGLE_BACKEND,'default','explicit default disables a local workaround');
assert.ok(!environment.fileReads.includes('/game/graphics.local.json'));
environment.stop();
const browserOverride='--other-option --use-angle=d3d11';
const explicit=await launch([],{platform:'win32',env:{WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:browserOverride},graphicsConfig:'not JSON'});
assert.equal(explicit.launches[0].options.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS,browserOverride);
assert.equal(explicit.launches[0].options.env.CHUNK_SURFER_ANGLE_BACKEND,undefined);
assert.ok(!explicit.fileReads.includes('/game/graphics.local.json'));
explicit.stop();
const mac=await launch([],{platform:'darwin',graphicsConfig:'not JSON'});
assert.equal(mac.launches[0].options.env.CHUNK_SURFER_ANGLE_BACKEND,undefined,'checkout-local Windows settings do not affect macOS');
mac.stop();
for(const bad of [{angleBackend:'vulkan --untrusted-switch'},[],{},null,'not JSON']){
  await assert.rejects(()=>launch([],{platform:'win32',graphicsConfig:bad}));
}
assert.equal(normalizeAngleBackend(' VULKAN '),'vulkan');
assert.ok(hasExplicitAngleBackend('"--use-angle=vulkan"'));
assert.ok(hasExplicitAngleBackend('--use-angle d3d11'));
assert.equal(hasExplicitAngleBackend('--other=--use-angle=vulkan'),false);

console.log('development launch contract tests ok');
