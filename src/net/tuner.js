// Live lens tuner. Press `t` to toggle. Dev instrument, not player UI:
// nothing here ships in the story build (M6 strips it behind a flag).
//
// Every control writes straight through window.__diffusion.tune(), so the
// running feedback loop responds without a reload. "copy settings" emits a
// JS object you can paste into lens-presets.js — the intended workflow is
// tune by hand, then promote what you like into a named preset.

import { PRESETS } from './lens-presets.js';

const FIELDS = [
  { key: 'strength', min: 0.1, max: 0.45, step: 0.01, note: 'local material variation' },
  { key: 'guidance', min: 0.0, max: 2.0, step: 0.1, note: 'prompt pressure on the tile' },
  { key: 'passes', min: 1, max: 2, step: 1, note: 'one-time material generation cost' },
  { key: 'mix', min: 0.0, max: 0.92, step: 0.01, note: 'world-locked generated material' },
];

export function mountTuner(hostEl, getDiffusion, access = {}) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:absolute', 'top:0', 'right:0', 'z-index:20', 'display:none',
    'width:310px', 'max-height:100%', 'overflow:auto', 'padding:10px 12px',
    'background:rgba(8,9,11,0.92)', 'border-left:1px solid #2a2f38',
    'border-bottom:1px solid #2a2f38', 'color:#b9c2cc',
    "font:11px 'Courier New',monospace", 'pointer-events:auto',
  ].join(';');

  const state = { strength: 0.28, guidance: 1.0, passes: 1, mix: 0.76 };
  const rows = {};

  const h = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
  panel.appendChild(h('<div style="color:#e6ecf2;letter-spacing:.12em;margin-bottom:8px">LENS TUNER <span style="color:#5c6672">[t]</span></div>'));

  const bypassRow = document.createElement('div');
  bypassRow.style.cssText = 'display:flex;gap:4px;margin-bottom:10px';
  const bypassBtn = document.createElement('button');
  bypassBtn.type = 'button';
  bypassBtn.style.cssText = 'flex:1;font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:4px 7px;cursor:pointer';
  function syncBypass() {
    const d = getDiffusion();
    const off = !!(d?.stats?.bypassed || d?.isBypassed?.());
    const st=d?.stats?.state||'unavailable',resident=!!d?.stats?.resident;
    if(off)bypassBtn.textContent='LOCAL DIFFUSION: OFF';
    else if(resident)bypassBtn.textContent='LOCAL DIFFUSION: ON · VISIBLE';
    else if(st==='fallback')bypassBtn.textContent='LOCAL DIFFUSION: UNAVAILABLE';
    else bypassBtn.textContent=`LOCAL DIFFUSION: ${String(st).toUpperCase()}`;
    bypassBtn.style.color = off||st==='fallback' ? '#d7a37d' : '#9fb8a5';
  }
  bypassBtn.onclick = () => {
    const d = getDiffusion();
    if (!d?.setBypass) { status('diffusion bypass unavailable'); return; }
    const next = !d.isBypassed?.() && !d.stats?.bypassed;
    d.setBypass(next);
    syncBypass();
    status(next ? 'local rendering paused' : 'local rendering resumed');
  };
  bypassRow.appendChild(bypassBtn);
  panel.appendChild(bypassRow);

  // Session-only access overrides. These operate on the same carried-key set
  // collision uses; they do not rewrite saves or door geometry.
  const accessBox = document.createElement('div');
  accessBox.style.cssText = 'border-top:1px solid #2a2f38;border-bottom:1px solid #2a2f38;padding:7px 0;margin-bottom:10px';
  accessBox.appendChild(h('<div style="color:#8b95a1;letter-spacing:.08em;margin-bottom:5px">ACCESS KEYS</div>'));
  const accessButtons = new Map();
  function syncAccess() {
    const rows = access.keys?.() || [];
    for (const row of rows) {
      let b = accessButtons.get(row.id);
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.style.cssText = 'display:block;width:100%;text-align:left;font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:3px 7px;margin:3px 0;cursor:pointer';
        b.onclick = () => { const cur=(access.keys?.()||[]).find((v)=>v.id===row.id); access.setKey?.(row.id,!cur?.granted); syncAccess(); status(`${row.label}: ${cur?.granted?'closed':'open'}`); };
        accessButtons.set(row.id,b);accessBox.appendChild(b);
      }
      b.textContent = `${row.label}: ${row.granted ? 'OPEN' : 'LOCKED'}`;
      b.style.color = row.granted ? '#9fb8a5' : '#d7a37d';
    }
  }
  const accessActions=document.createElement('div');accessActions.style.cssText='display:flex;gap:4px;margin-top:4px';
  for(const [label,value] of [['GRANT ALL',true],['RESET LOCKS',false]]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='flex:1;font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:3px 6px;cursor:pointer';
    b.onclick=()=>{for(const row of access.keys?.()||[])access.setKey?.(row.id,value || row.defaultGranted);syncAccess();status(value?'all keys granted':'authored locks restored');};accessActions.appendChild(b);
  }
  accessBox.appendChild(accessActions);panel.appendChild(accessBox);syncAccess();

  const takeBox=document.createElement('div');takeBox.style.cssText='border-bottom:1px solid #2a2f38;padding:0 0 7px;margin-bottom:10px';
  takeBox.appendChild(h('<div style="color:#8b95a1;letter-spacing:.08em;margin-bottom:5px">ROOM TAKES</div>'));
  const takeButtons=new Map();
  function syncTakes(){
    for(const row of access.takes?.()||[]){
      let b=takeButtons.get(row.id);if(!b){b=document.createElement('button');b.type='button';b.style.cssText='display:block;width:100%;text-align:left;font:inherit;color:#9fb8a5;background:#12151a;border:1px solid #333a44;padding:3px 7px;margin:3px 0;cursor:pointer';b.onclick=()=>{const cur=(access.takes?.()||[]).find((v)=>v.id===row.id);access.setTake?.(row.id,!cur?.taken);syncTakes();status(`${row.label}: ${cur?.taken?'removed':'granted'}`);};takeButtons.set(row.id,b);takeBox.appendChild(b);}b.textContent=`${row.label}: ${row.taken?'YES':'NO'}`;b.style.color=row.taken?'#9fb8a5':'#d7a37d';
    }
  }
  panel.appendChild(takeBox);syncTakes();

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
    syncBypass();
  }

  hostEl.appendChild(panel);
  syncBypass();
  setInterval(()=>{syncBypass();syncAccess();syncTakes();}, 1000);
  // Don't let the game's key handler eat typing in the textarea.
  panel.addEventListener('keydown', (e) => e.stopPropagation());

  window.addEventListener('keydown', (e) => {
    if (e.key !== 't' && e.key !== 'T') return;
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

  return { panel, setState: (s) => { Object.assign(state, s); syncInputs(); } };
}
