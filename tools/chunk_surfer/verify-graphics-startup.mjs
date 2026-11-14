// Real browser fault injection against a frozen source snapshot. This verifies
// quiet diagnostics and no-fake-success gate, not Windows/Linux native GPUs.
import { cp, mkdir, mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

const repo = process.cwd();
const out = resolve(process.env.GRAPHICS_STARTUP_OUT || 'artifacts/graphics-startup-2026-11-08');
const frozen = await mkdtemp(join(tmpdir(), 'chunk-graphics-startup-'));
const profile = await mkdtemp(join(tmpdir(), 'chunk-graphics-browser-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {
  passed: false,
  scope: 'Injected graphics startup failures remain quietly waiting with bounded diagnostics in the actual browser host. No failure pane or fabricated readiness. No Windows/Linux native, automatic process-restart, GPU-vendor or OS-compositor acceptance.',
  silence: { browserMuted: true, microphoneDisabled: true, audioCapture: false },
  sources: {}, scenarios: [],
};
let server, browser;
try {
  await mkdir(out, { recursive: true });
  for (const name of ['src', 'content', 'LEGAL', 'index.html', 'package.json']) {
    await cp(join(repo, name), join(frozen, name), { recursive: true });
  }
  for (const name of ['assets', 'public', 'node_modules']) {
    await symlink(join(repo, name), join(frozen, name), 'dir');
  }
  for (const name of ['src/main.js', 'src/render/r3d.js', 'src/render/graphics-startup.js', 'public/startup-guard.js', 'index.html']) {
    report.sources[name] = hash(await readFile(join(frozen, name)));
  }
  server = await createServer({
    root: frozen, configFile: false, cacheDir: join(frozen, '.vite-cache'), base: './',
    define: { __APP_VERSION__: JSON.stringify(JSON.parse(await readFile(join(frozen, 'package.json'), 'utf8')).version), __LOCAL_TEXT_REVIEW__: true },
    publicDir: join(repo, 'public'), envPrefix: ['VITE_', 'TAURI_ENV_*'],
    server: { host: '127.0.0.1', port: 5629, strictPort: true, hmr: false, watch: null, fs: { allow: [repo, frozen] } },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  const url = `http://127.0.0.1:${port}/?mode=story&nomic=1&sam=0&nodisplaynotice=1&skipwarn=1&silentReview=1`;
  browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    userDataDir: profile, protocolTimeout: 120000,
    args: ['--mute-audio', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  });
  for (const scenario of [
    { id: 'webgl2-unavailable', expected: 'webgl2 unavailable' },
    { id: 'shader-rejected', expected: 'injected graphics startup shader compiler rejection' },
  ]) {
    const page = await browser.newPage();
    const result = { id: scenario.id, passed: false, pageErrors: [], consoleErrors: [], failedResponses: [] };
    report.scenarios.push(result);
    try {
      await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      page.on('pageerror', error => result.pageErrors.push(String(error.stack || error)));
      page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400) result.failedResponses.push({ url: response.url(), status: response.status() }); });
      await page.evaluateOnNewDocument(id => {
        window.__graphicsFaultDocument = String(Date.now()) + ':' + Math.random();
        if (id === 'webgl2-unavailable') {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (kind, ...options) {
            return kind === 'webgl2' ? null : original.call(this, kind, ...options);
          };
        } else {
          const original = WebGL2RenderingContext.prototype.getShaderParameter;
          WebGL2RenderingContext.prototype.getShaderParameter = function (shader, parameter) {
            return parameter === this.COMPILE_STATUS ? false : original.call(this, shader, parameter);
          };
          WebGL2RenderingContext.prototype.getShaderInfoLog = function () {
            return 'injected graphics startup shader compiler rejection';
          };
        }
      }, scenario.id);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.bringToFront();
      await page.waitForFunction(expected => {
        const guard = window.__chunkStartup, diagnostics = guard?.diagnostics?.();
        return guard?.status() === 'waiting' && diagnostics?.graphicsAttempted === true
          && diagnostics.entries.some(entry => entry.category === 'graphics'
            && entry.code === 'CHUNK_GRAPHICS_STARTUP' && entry.detail.includes(expected));
      }, { timeout: 90000 }, scenario.expected);
      result.surface = await page.evaluate(() => {
        const surface = document.querySelector('#startupRecovery');
        const bounds = surface.getBoundingClientRect();
        return {
          phase: surface.dataset.phase, hidden: surface.hidden,
          visible: bounds.width > 0 && bounds.height > 0 && getComputedStyle(surface).display !== 'none',
          title: document.querySelector('#startupRecoveryTitle')?.textContent,
          message: document.querySelector('#startupRecoveryMessage')?.textContent,
          failureControlsPresent: !!document.querySelector('#startupRecoveryDetails, #startupRecoveryRetry, #startupRecoveryGraphics'),
          mainLoaded: !!window.__probe,
          tauriPresent: !!(window.__TAURI_INTERNALS__ || window.__TAURI__),
          apiStatus: window.__chunkStartup?.status(),
          diagnostics: window.__chunkStartup?.diagnostics(),
          documentToken: window.__graphicsFaultDocument,
        };
      });
      assert.equal(result.surface.phase, 'waiting');
      assert.equal(result.surface.apiStatus, 'waiting');
      assert.equal(result.surface.hidden, false);
      assert.equal(result.surface.visible, true);
      assert.equal(result.surface.failureControlsPresent, false, 'no failed-to-load pane or manual recovery buttons');
      assert.equal(result.surface.tauriPresent, false);
      assert.equal(result.surface.mainLoaded, true, 'the actual game module ran');
      assert.ok(!/could not|failed|try again/i.test(result.surface.title + ' ' + result.surface.message), 'loading copy stays neutral');
      assert.equal(result.surface.diagnostics.bootComplete, false, 'fatal boot did not get credited');
      assert.equal(result.surface.diagnostics.frameComplete, false, 'failed rendering did not certify a frame');
      assert.equal(result.surface.diagnostics.graphicsAttempted, true, 'the tagged native recovery path was attempted once');
      assert.equal(result.surface.diagnostics.graphicsActive, false, 'a non-native host cannot claim a backend restart');
      assert.equal(result.surface.diagnostics.reloadScheduled, false, 'tagged graphics recovery does not also schedule a generic reload');
      assert.equal(result.surface.diagnostics.reloadUsed, false);
      assert.ok(result.surface.diagnostics.entries.length <= 32, 'diagnostics are bounded');
      assert.ok(result.surface.diagnostics.entries.some(entry => entry.category === 'graphics'
        && entry.code === 'CHUNK_GRAPHICS_STARTUP' && entry.detail.includes(scenario.expected)), 'the real fault is retained diagnostically');
      assert.ok(result.consoleErrors.some(error => error.includes('r3d init failed')), 'renderer initialization failed through the real host catch');
      assert.ok(result.consoleErrors.some(error => error.includes('boot failed')), 'fatal renderer initialization propagated through boot');
      // Wait beyond the quiet-reload interval: this tagged graphics failure
      // must stay in the same uncredited document, without an error pane.
      await new Promise(resolve => setTimeout(resolve, 1200));
      result.afterRecoveryWindow = await page.evaluate(() => ({
        status: window.__chunkStartup.status(), diagnostics: window.__chunkStartup.diagnostics(),
        documentToken: window.__graphicsFaultDocument,
      }));
      assert.equal(result.afterRecoveryWindow.documentToken, result.surface.documentToken);
      assert.equal(result.afterRecoveryWindow.status, 'waiting');
      assert.equal(result.afterRecoveryWindow.diagnostics.bootComplete, false);
      assert.equal(result.afterRecoveryWindow.diagnostics.frameComplete, false);
      assert.equal(result.afterRecoveryWindow.diagnostics.reloadScheduled, false);
      result.screenshot = join(out, `quiet-waiting-${scenario.id}.png`);
      await page.screenshot({ path: result.screenshot });
      result.passed = true;
    } catch (error) {
      result.failure = String(error.stack || error);
      try { await page.screenshot({ path: join(out, `failure-${scenario.id}.png`) }); } catch {}
      throw error;
    } finally {
      await page.close();
    }
  }
  report.passed = report.scenarios.every(result => result.passed);
} catch (error) {
  report.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await server?.close();
  await rm(profile, { recursive: true, force: true });
  await rm(frozen, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, out, scenarios: report.scenarios.map(result => ({ id: result.id, passed: result.passed })), failure: report.failure || null }));
}
