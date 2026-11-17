// Lighting audit capture. Read-only: boots the dev game in headless Chrome on
// the real GPU with inject.js, visits fixed stations and writes raw captures.
//
//   node tools/chunk_surfer/lighting-audit/capture.mjs [station ...]
//
// Needs a dev server (LIGHT_AUDIT_BASE, default http://127.0.0.1:5547/).
// Output: artifacts/lighting-audit/raw/<station>/
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {STATIONS} from './stations.mjs';

const root = path.resolve(import.meta.dirname, '../../..');
const out = path.join(root, 'artifacts/lighting-audit/raw');
const base = process.env.LIGHT_AUDIT_BASE || 'http://127.0.0.1:5547/';
const only = process.argv.slice(2);
const phase = label => console.log('PHASE', new Date().toISOString().slice(11, 19), label);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-light-'));
// LIGHT_AUDIT_MODE=preview: only the rig previews below, added beside an
// existing capture. Gains act on the uniforms the renderer already uploads.
const PREVIEW = ['preview', 'residual', 'sweep', 'verify'].includes(process.env.LIGHT_AUDIT_MODE);
const VERIFY = process.env.LIGHT_AUDIT_MODE === 'verify';
const SWEEP = process.env.LIGHT_AUDIT_MODE === 'sweep';
const RESIDUAL = process.env.LIGHT_AUDIT_MODE === 'residual';
export const PREVIEWS = Object.freeze([
  {id: 'base', title: 'As now', gain: null},
  {id: 'plus-one-stop', title: 'Every light +1 stop', gain: {ambient: 2, local: 2, torch: 2}},
  {id: 'key-over-fill', title: 'Ambient -1 stop, lamps and torch +2 stops', gain: {ambient: .5, local: 4, torch: 4}},
]);
// Exposure sweep: every light scaled together, as exposure would.
export const SWEEP_STEPS = Object.freeze([
  {id: 'plus-half', title: '+½ stop', gain: {ambient: 1.414, local: 1.414, torch: 1.414}},
  {id: 'plus-one-and-half', title: '+1½ stops', gain: {ambient: 2.828, local: 2.828, torch: 2.828}},
  {id: 'plus-two', title: '+2 stops', gain: {ambient: 4, local: 4, torch: 4}},
]);
const TIMING_FRAMES = Number(process.env.LIGHT_AUDIT_FRAMES || 50);
const TIMING_ROUNDS = Number(process.env.LIGHT_AUDIT_ROUNDS || 2);

const browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, userDataDir: profile, protocolTimeout: 300000,
  args: ['--no-sandbox', '--use-angle=gl', '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--mute-audio', '--window-size=1280,800']});
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 800});
  page.on('pageerror', error => errors.push(String(error).slice(0, 300)));
  await page.evaluateOnNewDocument(fs.readFileSync(new URL('./inject.js', import.meta.url), 'utf8'));
  await page.evaluateOnNewDocument(() => Object.defineProperty(document, 'hasFocus', {configurable: true, value: () => true}));
  const url = new URL(base);
  for (const [key, value] of Object.entries({nodisplaynotice: '1', skipwarn: '1', nomic: '1', sam: '0', nothink: '1', ...(process.env.LIGHT_AUDIT_MUTE === '0' ? {} : {lightauditmute: '1'})})) url.searchParams.set(key, value);
  await page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: 90000});
  await page.waitForFunction(() => window.__probe?.testRun, {timeout: 240000});
  for (let i = 0; i < 60; i++) {
    const id = await page.evaluate(() => window.__scenes?.top()?.id);
    if (id === 'title' || id === 'world-title' || (i > 1 && !id)) break;
    if (id === 'eula') await page.keyboard.press('Enter');
    await sleep(500);
  }
  await page.evaluate(async () => { await window.__probe.testRun(); window.__probe.tutSkip(); window.__probe.hush(); });
  await sleep(1500);
  const gpu = await page.evaluate(() => {
    const A = window.__lightAudit, gl = A.gl, info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null, patched: A.patched, timerQuery: !!A.timerExt,
      canvas: [gl?.drawingBufferWidth, gl?.drawingBufferHeight], userAgent: navigator.userAgent, audioDecodesStubbed: A.mutedDecodes || 0};
  });
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'environment.json'), JSON.stringify({...gpu, viewport: [1280, 800], capturedAt: new Date().toISOString()}, null, 1));
  console.log('ENV', JSON.stringify(gpu));

  const setAudit = state => page.evaluate(async state => {
    Object.assign(window.__lightAudit, {clay: false, solo: null, noLocal: false, noTorch: false, timing: false, gain: null, noSelf: false, noSky: false}, state);
    for (let i = 0; i < 4; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 260));
  }, state);
  const grab = async (dir, name, {image = false} = {}) => {
    const result = await page.evaluate(async image => {
      const grid = await window.__lightAudit.sceneGrid(320, 'scene');
      const props = await window.__lightAudit.sceneGrid(320, 'props');
      let data = null;
      if (image) data = await new Promise(resolve => requestAnimationFrame(() => resolve(document.querySelector('canvas.r3d').toDataURL('image/png'))));
      return {grid, props, data, seen: {...window.__lightAudit.seen}};
    }, image);
    if (!result.grid) throw Error(`no float scene for ${name}`);
    fs.writeFileSync(path.join(dir, `${name}.f32`), Buffer.from(result.grid.base64, 'base64'));
    if (result.props) fs.writeFileSync(path.join(dir, `${name}.props.f32`), Buffer.from(result.props.base64, 'base64'));
    if (result.data) fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(result.data.split(',')[1], 'base64'));
    return {columns: result.grid.columns, rows: result.grid.rows, scene: [result.grid.sceneWidth, result.grid.sceneHeight], props: result.props ? {columns: result.props.columns, rows: result.props.rows} : null, seen: result.seen};
  };
  const time = async state => {
    await setAudit({...state});
    const result = {};
    for (const mode of ['frame', 'passes']) {
      result[mode] = await page.evaluate(async ({mode, frames}) => {
        const A = window.__lightAudit, start = A.frames.length ? A.frames.at(-1).frame : 0;
        A.timing = mode;
        while (A.frames.filter(f => f.frame > start).length < frames + 4) await new Promise(resolve => requestAnimationFrame(resolve));
        A.timing = false;
        for (let i = 0; i < 10; i++) await new Promise(resolve => requestAnimationFrame(resolve));
        A.frames = A.frames.filter(f => f.frame > start + 4);
        const summary = A.timingSummary(mode); A.frames = [];
        return summary;
      }, {mode, frames: TIMING_FRAMES});
    }
    return result;
  };

  for (const station of STATIONS) {
    if (only.length && !only.includes(station.id)) continue;
    const dir = path.join(out, station.id);
    if (!PREVIEW) fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    try {
      await setAudit({});
      const entered = await page.evaluate(async station => {
        const probe = window.__probe;
        if (station.enter) { const result = await (new Function('probe', `return (async()=>{${station.enter}})()`))(probe); if (result !== true) return 'enter: ' + JSON.stringify(result); }
        else if (station.hook) { let ok = false; for (const hook of [].concat(station.hook)) { if (await probe.godWarpHook(hook)) { ok = hook; break; } } if (!ok) return 'hook failed'; }
        else if (station.sourcePreset) probe.sourcePreset(station.sourcePreset);
        else if (station.drive) { if (!await probe.sourceDrive.fixture(station.drive === true ? null : station.drive)) return 'drive failed'; }
        return true;
      }, station);
      if (entered !== true) throw Error(String(entered));
      await sleep(station.settleMs || 3200);
      await page.evaluate(station => {
        const probe = window.__probe; probe.hush?.();
        if (station.offset && probe.sourceWarp) { const p = probe.pos(); probe.sourceWarp(p.x + station.offset.x, p.y + station.offset.y); }
        if (station.cell) probe.warpCell(station.cell.x, station.cell.y);
        if (Number.isFinite(station.yaw)) probe.lookAtWorld(station.yaw, station.pitch || 0);
        if (typeof station.torch === 'boolean' && !station.drive) probe.setTorch(station.torch);
      }, station);
      await sleep(1600);
      const meta = await page.evaluate(() => {
        const probe = window.__probe, safe = fn => { try { return fn(); } catch (error) { return {error: String(error)}; } };
        return {where: safe(() => probe.whereAmI()), look: safe(() => probe.lookAngles()), renderer: safe(() => probe.r3dLighting()),
          sourceLights: safe(() => probe.sourceLights()), rig: safe(() => { const l = probe.light(); return {on: l.on, context: l.context}; }),
          torch: safe(() => probe.torchState?.()), drive: safe(() => probe.sourceDrive.state()), scene: window.__scenes?.top()?.id || null,
          uniforms: {...window.__lightAudit.seen}};
      });
      const captures = {};
      if (VERIFY) {
        // The shipped frame, unmodified, to compare with an earlier preview.
        await setAudit({}); const shipped = await grab(dir, 'verify-shipped', {image: true});
        fs.writeFileSync(path.join(dir, 'verify.json'), JSON.stringify({captures: {shipped}, meta, capturedAt: new Date().toISOString()}, null, 1));
        console.log('VERIFY', station.id, 'done');
        continue;
      }
      if (RESIDUAL) {
        const residual = {};
        await setAudit({solo: 'none'}); residual.none = await grab(dir, 'residual-none');
        await setAudit({solo: 'none', noSelf: true}); residual.noSelf = await grab(dir, 'residual-noself');
        await setAudit({solo: 'none', noSky: true}); residual.noSky = await grab(dir, 'residual-nosky');
        await setAudit({noSky: true}); residual.allNoSky = await grab(dir, 'residual-all-nosky', {image: true});
        await setAudit({noSelf: true}); residual.allNoSelf = await grab(dir, 'residual-all-noself', {image: true});
        await setAudit({}); residual.all = await grab(dir, 'residual-all', {image: true});
        const patched = await page.evaluate(() => window.__lightAudit.patched);
        fs.writeFileSync(path.join(dir, 'residual.json'), JSON.stringify({captures: residual, patched}, null, 1));
        console.log('RESIDUAL', station.id, patched.join(','));
        continue;
      }
      if (PREVIEW) {
        const previews = {};
        for (const variant of SWEEP ? SWEEP_STEPS : PREVIEWS) {
          await setAudit({gain: variant.gain});
          previews[variant.id] = await grab(dir, `preview-${variant.id}`, {image: true});
        }
        await setAudit({});
        fs.writeFileSync(path.join(dir, SWEEP ? 'sweep.json' : 'preview.json'), JSON.stringify({previews: SWEEP ? SWEEP_STEPS : PREVIEWS, captures: previews, meta}, null, 1));
        console.log('PREVIEW', station.id, 'done');
        continue;
      }
      phase('entered'); captures.final = await grab(dir, 'final', {image: true}); phase('final');
      await setAudit({clay: true});
      captures.clay = await grab(dir, 'clay', {image: true});
      const count = Math.max(0, Math.min(12, captures.final.seen.localLightCount || 0));
      const solos = ['none', 'ambient', ...(captures.final.seen.torch > 0.01 ? ['torch'] : []), ...Array.from({length: count}, (_, i) => i)];
      for (const solo of solos) {
        await setAudit({solo});
        captures[`solo-${solo}`] = await grab(dir, `solo-${solo}`); phase('solo ' + solo);
      }
      await setAudit({});
      phase('timing'); if (TIMING_ROUNDS > 1) await time({}); // warm-up, discarded: the first round after the captures runs slow
      const timing = {};
      for (const round of [1, 2].slice(0, TIMING_ROUNDS)) for (const [name, state] of [['all', {}], ['noLocal', {noLocal: true}], ['noLights', {noLocal: true, noTorch: true}]]) timing[`${name}${round}`] = await time(state);
      await setAudit({});
      fs.writeFileSync(path.join(dir, 'station.json'), JSON.stringify({...station, meta, captures, solos, timing}, null, 1));
      const brief = t => `${t.frame.gpu.frame?.median?.toFixed(1)}gpu/${t.frame.wallMs?.median?.toFixed(1)}wall march ${t.passes.gpu.march?.median?.toFixed(1)} props ${t.passes.gpu.props?.median?.toFixed(1)}`;
      console.log('STATION', station.id, `lights ${count} torch ${captures.final.seen.torch}`, '| all', brief(timing.all1), '| noLocal', brief(timing.noLocal1), '| none', brief(timing.noLights1), '| all again', timing.all2 ? brief(timing.all2) : '-');
    } catch (error) {
      fs.writeFileSync(path.join(dir, PREVIEW ? `${process.env.LIGHT_AUDIT_MODE}-failed.json` : 'station.json'), JSON.stringify({...station, failed: String(error.stack || error)}, null, 1));
      console.log('STATION FAILED', station.id, String(error).slice(0, 300));
    }
  }
  if (errors.length) console.log('PAGE ERRORS', errors.length, errors.slice(0, 5));
} finally {
  await browser.close();
  fs.rmSync(profile, {recursive: true, force: true});
}
