// Live lens tuner. Press `t` to toggle. Dev instrument, not player UI:
// nothing here ships in the story build (M6 strips it behind a flag).
//
// Every control writes straight through window.__diffusion.tune(), so the
// running feedback loop responds without a reload. "copy settings" emits a
// JS object you can paste into lens-presets.js — the intended workflow is
// tune by hand, then promote what you like into a named preset.

import { PRESETS } from './lens-presets.js';

const FIELDS = [
  { key: 'strength', min: 0.1, max: 0.95, step: 0.01, note: '>0.6 dissolves geometry' },
  { key: 'guidance', min: 0.0, max: 6.0, step: 0.1, note: '>2 goes neon/kitsch' },
  { key: 'passes', min: 1, max: 5, step: 1, note: 'cost: linear' },
  { key: 'feedback', min: 0.0, max: 0.92, step: 0.01, note: 'high = self-converges' },
  { key: 'drift', min: 0.0, max: 4.0, step: 0.1, note: 'warp of the feedback' },
  { key: 'smooth', min: 0.0, max: 0.9, step: 0.05, note: '0 = raw/flickery, .6 = settled' },
];

export function mountTuner(hostEl, getDiffusion) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute', 'top:0', 'right:0', 'z-index:20', 'display:none',
    'width:310px', 'max-height:100%', 'overflow:auto', 'padding:10px 12px',
    'background:rgba(8,9,11,0.92)', 'border-left:1px solid #2a2f38',
    'border-bottom:1px solid #2a2f38', 'color:#b9c2cc',
    "font:11px 'Courier New',monospace", 'pointer-events:auto',
  ].join(';');

  const state = { strength: 0.42, guidance: 1.2, passes: 1, feedback: 0.18, drift: 0.5, smooth: 0.6 };
  const rows = {};

  const h = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  panel.appendChild(h('<div style="color:#e6ecf2;letter-spacing:.12em;margin-bottom:8px">LENS TUNER <span style="color:#5c6672">[t]</span></div>'));

  // presets
  const presetRow = document.createElement('div');
  presetRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px';
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button');
    b.textContent = name;
    b.style.cssText = 'font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:3px 7px;cursor:pointer';
    b.onclick = () => {
      const d = getDiffusion(); if (!d) return;
      const p = PRESETS[name];
      Object.assign(state, p);
      d.resetFeedback();
      d.tune(p);
      // a preset carrying a prompt owns it; otherwise the zone prompt resumes
      window.__lensPromptLocked = !!p.prompt;
      syncInputs();
      status(`preset: ${name}${p.prompt ? ' (prompt locked)' : ''}`);
    };
    presetRow.appendChild(b);
  }
  panel.appendChild(presetRow);

  // sliders
  for (const f of FIELDS) {
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:9px';
    const label = document.createElement('div');
    label.style.cssText = 'display:flex;justify-content:space-between;color:#8b95a1';
    const val = document.createElement('span');
    label.append(Object.assign(document.createElement('span'), { textContent: f.key }), val);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = f.min; input.max = f.max; input.step = f.step; input.value = state[f.key];
    input.style.cssText = 'width:100%;accent-color:#7f9c86';
    input.oninput = () => {
      state[f.key] = parseFloat(input.value);
      val.textContent = state[f.key];
      const d = getDiffusion(); if (d) d.tune({ [f.key]: state[f.key] });
    };
    val.textContent = state[f.key];
    const note = document.createElement('div');
    note.style.cssText = 'color:#4d5560;font-size:10px';
    note.textContent = f.note;
    row.append(label, input, note);
    panel.appendChild(row);
    rows[f.key] = { input, val };
  }

  // prompt override
  const ta = document.createElement('textarea');
  ta.rows = 4;
  ta.placeholder = 'prompt override (blank = per-zone prompt)';
  ta.style.cssText = 'width:100%;background:#0c0e11;color:#b9c2cc;border:1px solid #333a44;font:inherit;padding:5px;resize:vertical';
  panel.appendChild(ta);
  const applyPrompt = document.createElement('button');
  applyPrompt.textContent = 'apply prompt';
  applyPrompt.style.cssText = 'font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:3px 8px;margin:6px 0;cursor:pointer;width:100%';
  applyPrompt.onclick = () => {
    const d = getDiffusion(); if (!d) return;
    if (ta.value.trim()) { d.tune({ prompt: ta.value.trim() }); status('prompt applied (zone prompt paused)'); window.__lensPromptLocked = true; }
    else { window.__lensPromptLocked = false; status('zone prompt resumed'); }
  };
  panel.appendChild(applyPrompt);

  // actions
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:4px;margin-bottom:6px';
  const mk = (txt, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText = 'flex:1;font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:3px 6px;cursor:pointer';
    b.onclick = fn; return b;
  };
  actions.append(
    mk('reset dream', () => { getDiffusion()?.resetFeedback(); status('feedback cleared'); }),
    mk('copy settings', async () => {
      const out = JSON.stringify(state, null, 2);
      try { await navigator.clipboard.writeText(out); status('copied to clipboard'); }
      catch { console.log(out); status('logged to console'); }
    }),
  );
  panel.appendChild(actions);

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'color:#5c6672;min-height:1.2em';
  panel.appendChild(statusEl);
  let statusTimer = null;
  function status(msg) {
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { statusEl.textContent = ''; }, 2600);
  }
  function syncInputs() {
    for (const f of FIELDS) {
      rows[f.key].input.value = state[f.key];
      rows[f.key].val.textContent = state[f.key];
    }
  }

  hostEl.appendChild(panel);
  // Don't let the game's key handler eat typing in the textarea.
  panel.addEventListener('keydown', (e) => e.stopPropagation());

  window.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  return { panel, setState: (s) => { Object.assign(state, s); syncInputs(); } };
}
