import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function runIsolated(source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

const web = runIsolated(`
  globalThis.window = { location: { protocol: 'http:', hostname: 'localhost' } };
  globalThis.location = { href: 'http://localhost:5173/labs/chunk-surfer/index.html', protocol: 'http:', pathname: '/labs/chunk-surfer/index.html', search: '', hostname: 'localhost' };
  globalThis.document = { baseURI: 'http://localhost:5173/labs/chunk-surfer/index.html' };
  const launch = await import('./src/platform/launch.js');
  const paths = await import('./src/platform/paths.js');
  const qp = launch.runtimeParams();
  console.log(JSON.stringify({ snapshot: launch.runtimeSnapshot(), renderer: qp.get('renderer'), lens: qp.get('lens'), asset: paths.assetUrl('assets/example.bin') }));
`);
assert.equal(web.snapshot.tauri, false);
assert.equal(web.renderer, null);
assert.equal(web.lens, null);
assert.match(web.asset, /\/labs\/chunk-surfer\/assets\/example\.bin$/);

const desktop = runIsolated(`
  globalThis.window = { location: { protocol: 'tauri:', hostname: 'tauri.localhost' }, __TAURI_INTERNALS__: {} };
  globalThis.location = { href: 'tauri://localhost/', protocol: 'tauri:', pathname: '/', search: '', hostname: 'tauri.localhost' };
  globalThis.document = { baseURI: 'tauri://localhost/' };
  const launch = await import('./src/platform/launch.js');
  const paths = await import('./src/platform/paths.js');
  const qp = launch.runtimeParams();
  console.log(JSON.stringify({ snapshot: launch.runtimeSnapshot(), renderer: qp.get('renderer'), lens: qp.get('lens'), asset: paths.assetUrl('assets/example.bin') }));
`);
assert.equal(desktop.snapshot.tauri, true);
assert.equal(desktop.renderer, '3d');
assert.equal(desktop.lens, '1');
assert.equal(desktop.snapshot.params.renderer, '3d');
assert.equal(desktop.snapshot.params.lens, '1');
assert.doesNotMatch(desktop.asset, /\/labs\/chunk-surfer\//);
assert.match(desktop.asset, /^tauri:\/\/localhost\/assets\/example\.bin$/);

const override = runIsolated(`
  globalThis.window = { location: { protocol: 'http:', hostname: 'tauri.localhost' } };
  globalThis.location = { href: 'http://tauri.localhost/?renderer=dom&lens=0&debug=1', protocol: 'http:', pathname: '/', search: '?renderer=dom&lens=0&debug=1', hostname: 'tauri.localhost' };
  const launch = await import('./src/platform/launch.js');
  const qp = launch.runtimeParams();
  console.log(JSON.stringify({ snapshot: launch.runtimeSnapshot(), renderer: qp.get('renderer'), lens: qp.get('lens'), debug: qp.get('debug') }));
`);
assert.equal(override.snapshot.tauri, true);
assert.equal(override.renderer, 'dom');
assert.equal(override.lens, '0');
assert.equal(override.debug, '1');

console.log('launch parity tests ok');
