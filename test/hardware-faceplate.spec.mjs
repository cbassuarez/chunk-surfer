import test from 'node:test';
import assert from 'node:assert/strict';
import { drawHardwarePrint, drawHardwareScrew } from '../src/render/hardware-faceplate.js';

function canvasProbe() {
  const commands = [];
  const state = { globalAlpha: 0.8, shadowBlur: 7, shadowOffsetX: 2, shadowOffsetY: 3, font: '10px sans-serif', fillStyle: '#fff', strokeStyle: '#fff' };
  const stack = [];
  let measurements = 0;
  const methods = {
    save() { stack.push({ ...state }); },
    restore() {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, stack.pop());
    },
    measureText(value) {
      measurements += 1;
      const size = Number(/([\d.]+)px/.exec(state.font)?.[1] || 10);
      return { width: value.length * size * 0.55, actualBoundingBoxAscent: size * 0.72, actualBoundingBoxDescent: size * 0.12 };
    },
    createLinearGradient(...args) { return gradient('linear', args); },
    createRadialGradient(...args) { return gradient('radial', args); },
  };
  function gradient(type, args) {
    const value = { type, args, stops: [] };
    Object.defineProperty(value, 'addColorStop', { value(at, color) { value.stops.push([at, color]); } });
    return value;
  }
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in methods) return methods[key];
      if (key in target) return target[key];
      return (...args) => commands.push({ method: key, args, state: { ...state } });
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { ctx, commands, state, measurements: () => measurements };
}

test('screws have a countersink, domed steel, and a single recessed slot', () => {
  const { ctx, commands } = canvasProbe();
  drawHardwareScrew(ctx, 12, 20, 4, { seed: 'recorder:top-left' });
  const fills = commands.filter((c) => c.method === 'fill');
  assert.ok(fills.some((c) => c.state.fillStyle?.type === 'linear'), 'conical seat reflects the plate');
  assert.ok(fills.some((c) => c.state.fillStyle?.type === 'radial'), 'head has dome lighting');
  assert.equal(commands.filter((c) => c.method === 'rotate').length, 1, 'only the milled slot is rotated');
  const slot = commands.filter((c) => c.method === 'fillRect');
  assert.equal(slot.length, 3, 'cut mouth, black floor, and caught lower edge');
  assert.ok(slot.every((c) => c.args[2] > c.args[3] * 3), 'all three are one long straight channel, not an X');
  assert.ok(commands.filter((c) => c.method === 'arc').length >= 5);
  assert.ok(commands.every((c) => c.state.shadowBlur === 0), 'metal does not glow');
});

test('screw slot identity is deterministic and does not rotate its lighting', () => {
  const a = canvasProbe(), b = canvasProbe(), c = canvasProbe();
  drawHardwareScrew(a.ctx, 12, 20, 4, { seed: 'A' });
  drawHardwareScrew(b.ctx, 12, 20, 4, { seed: 'A' });
  drawHardwareScrew(c.ctx, 12, 20, 4, { seed: 'B' });
  assert.deepEqual(a.commands, b.commands);
  const angle = (probe) => probe.commands.find((command) => command.method === 'rotate').args[0];
  assert.notEqual(angle(a), angle(c));
  const head = (probe) => probe.commands.find((command) => command.state.fillStyle?.type === 'radial').state.fillStyle;
  assert.deepEqual(head(a), head(c), 'world light remains fixed between screw orientations');
});

test('raw hardware composes alpha and restores all caller state', () => {
  for (const draw of [
    (ctx) => drawHardwareScrew(ctx, 12, 20, 4, { alpha: 0.5 }),
    (ctx) => drawHardwarePrint(ctx, 'MONITOR', 1, 2, { width: 100, height: 14, alpha: 0.5 }),
  ]) {
    const probe = canvasProbe();
    const initial = { ...probe.state };
    draw(probe.ctx);
    assert.deepEqual(probe.state, initial);
    assert.ok(probe.commands.every((command) => command.state.globalAlpha <= 0.4));
  }
});

test('print uses real sans ink, top-of-box geometry, and width-constrained letterforms', () => {
  const { ctx, commands } = canvasProbe();
  const box = drawHardwarePrint(ctx, 'MONITOR VOLUME', 10, 20, { width: 92, height: 14 });
  assert.ok(box.width <= 92 + 0.001);
  assert.ok(box.baseline > 20 && box.baseline < 34);
  assert.equal(box.x, 10);
  const print = commands.filter((command) => command.method === 'fillText');
  assert.equal(print.map((command) => command.args[0]).join(''), 'MONITOR VOLUME');
  assert.ok(print.every((command) => command.state.font.includes('Hardware Sans')));
  assert.ok(print.every((command) => command.state.textBaseline === 'alphabetic'));
  assert.ok(print.every((command) => command.state.shadowBlur === 0));
  assert.ok(!commands.some((command) => command.method === 'scale'), 'fitting does not squash glyph geometry');
  assert.deepEqual(commands.find((command) => command.method === 'rect').args, [10, 20, 92, 14]);
});

test('centre/right alignment and high DPI preserve logical print placement', () => {
  const a = canvasProbe(), b = canvasProbe(), c = canvasProbe();
  const left = drawHardwarePrint(a.ctx, 'REC', 10, 20, { width: 100, height: 14 });
  const center = drawHardwarePrint(b.ctx, 'REC', 20, 40, { width: 200, height: 28, dpr: 2, align: 'center' });
  const right = drawHardwarePrint(c.ctx, 'REC', 10, 20, { width: 100, height: 14, align: 'right' });
  assert.equal(center.width / 2, left.width);
  assert.equal(center.fontSize / 2, left.fontSize);
  assert.equal(center.baseline / 2, left.baseline);
  assert.equal(center.x / 2, 10 + (100 - left.width) / 2);
  assert.equal(right.x + right.width, 110);
});

test('screen print stays clean at small size; engraving adds restrained cut relief', () => {
  const a = canvasProbe(), b = canvasProbe();
  drawHardwarePrint(a.ctx, 'GAIN', 0, 0, { width: 50, height: 11, seed: 'worn' });
  const small = a.commands.filter((command) => command.method === 'fillText');
  assert.ok(small.every((command) => command.state.globalAlpha === 0.8));
  drawHardwarePrint(b.ctx, 'GAIN', 0, 0, { width: 50, height: 11, finish: 'engraved' });
  const engraved = b.commands.filter((command) => command.method === 'fillText');
  assert.equal(engraved.length, small.length * 3, 'lower caught edge, upper cut shadow, then legible ink');
  assert.ok(engraved[0].args[2] > small[0].args[2]);
});

test('permanent faceplate markings are smaller and lighter than cap legends', () => {
  const cap = canvasProbe(), panel = canvasProbe();
  const options = { width: 240, height: 24 };
  const capLayout = drawHardwarePrint(cap.ctx, 'MONITOR', 0, 0, options);
  const panelLayout = drawHardwarePrint(panel.ctx, 'MONITOR', 0, 0, { ...options, finish: 'faceplate' });
  assert.equal(capLayout.fontSize, 15);
  assert.equal(panelLayout.fontSize, 12);
  const capPrint = cap.commands.filter((command) => command.method === 'fillText');
  const panelPrint = panel.commands.filter((command) => command.method === 'fillText');
  assert.match(capPrint[0].state.font, /^600 /);
  assert.match(panelPrint[0].state.font, /^400 /);
  assert.equal(panelPrint.length, capPrint.length, 'both are one non-emissive ink pass');
  const capPitch = (capPrint[1].args[1] - capPrint[0].args[1]) / capLayout.fontSize;
  const panelPitch = (panelPrint[1].args[1] - panelPrint[0].args[1]) / panelLayout.fontSize;
  assert.ok(Math.abs((panelPitch - capPitch) - 0.03) < 1e-9, 'faceplate tracking is 0.085em versus cap 0.055em');
});

test('faceplate hierarchy scales with DPI; reflected panel color never changes screw geometry', () => {
  const standard = canvasProbe(), retina = canvasProbe();
  const normal = drawHardwarePrint(standard.ctx, 'MONITOR', 5, 10, { width: 140, height: 24, finish: 'faceplate' });
  const high = drawHardwarePrint(retina.ctx, 'MONITOR', 10, 20, { width: 280, height: 48, finish: 'faceplate', dpr: 2 });
  for (const key of ['x', 'y', 'width', 'height', 'baseline', 'fontSize']) assert.equal(high[key] / 2, normal[key]);
  const dark = canvasProbe(), light = canvasProbe();
  drawHardwareScrew(dark.ctx, 12, 20, 4, { darkPanel: true });
  drawHardwareScrew(light.ctx, 12, 20, 4, { darkPanel: false });
  const geometry = (probe) => probe.commands.map(({ method, args }) => ({ method, args }));
  assert.deepEqual(geometry(dark), geometry(light));
  const head = (probe) => probe.commands.find((command) => command.state.fillStyle?.type === 'radial').state.fillStyle;
  assert.notDeepEqual(head(dark).stops, head(light).stops, 'steel catches the light faceplate without changing its machining');
});

test('print caches bounded stable metrics and measures again after shipped font loads', () => {
  const oldDocument = globalThis.document;
  let ready = false;
  globalThis.document = { fonts: { check: () => ready } };
  try {
    const probe = canvasProbe();
    const draw = () => drawHardwarePrint(probe.ctx, 'AUDIOCORP', 10, 20, { width: 140, height: 14 });
    draw();
    const first = probe.measurements();
    draw();
    assert.equal(probe.measurements(), first, 'steady frames do not measure fonts again');
    ready = true;
    draw();
    assert.ok(probe.measurements() > first, 'the shipped face replaces fallback metrics');
    const withReadyFont = probe.measurements();
    for (let i = 0; i < 130; i += 1) drawHardwarePrint(probe.ctx, `CHANNEL ${i}`, 0, 0, { width: 140, height: 14 });
    const filled = probe.measurements();
    draw();
    assert.ok(probe.measurements() > filled && filled > withReadyFont, 'old layouts leave a bounded cache');
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test('bold cap metrics refresh even when the regular faceplate font was already ready', () => {
  const oldDocument = globalThis.document;
  let boldReady = false;
  const checked = [];
  globalThis.document = { fonts: { check: (font) => {
    checked.push(font);
    return font.startsWith('400 ') || boldReady;
  } } };
  try {
    const probe = canvasProbe();
    const panel = () => drawHardwarePrint(probe.ctx, 'MONITOR', 0, 0, { width: 140, height: 20, finish: 'faceplate' });
    const cap = () => drawHardwarePrint(probe.ctx, 'MONITOR', 0, 0, { width: 140, height: 20 });
    panel();
    cap();
    const initial = probe.measurements();
    panel(); cap();
    assert.equal(probe.measurements(), initial);
    assert.ok(checked.includes('400 12px "Hardware Sans"'));
    assert.ok(checked.includes('600 12px "Hardware Sans"'));
    boldReady = true;
    panel();
    assert.equal(probe.measurements(), initial, 'already decoded regular metrics remain cached');
    cap();
    assert.ok(probe.measurements() > initial, 'bold readiness invalidates its own fallback metrics');
    drawHardwarePrint(probe.ctx, 'GAIN', 0, 0, { width: 100, height: 20, finish: 'engraved' });
    assert.ok(checked.includes('500 12px "Hardware Sans"'), 'engraved ink checks its requested weight too');
  } finally {
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  }
});

test('invalid or invisible hardware is a no-op', () => {
  const { ctx, commands } = canvasProbe();
  drawHardwareScrew(ctx, 0, 0, 0);
  drawHardwareScrew(ctx, Number.NaN, 0, 4);
  drawHardwareScrew(ctx, 0, 0, 4, { alpha: 0 });
  assert.equal(drawHardwarePrint(ctx, '', 0, 0), null);
  assert.equal(drawHardwarePrint(ctx, 'REC', 0, 0, { width: 0 }), null);
  assert.equal(drawHardwarePrint(ctx, 'REC', 0, 0, { height: -1 }), null);
  assert.equal(commands.length, 0);
});
