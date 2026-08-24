import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'echo' ? 'echo' : 'monitor';
document.documentElement.dataset.mode = mode;

const canvas = document.getElementById('tableau');
const ctx = canvas.getContext('2d');
const title = document.getElementById('title');
const state = document.getElementById('state');
const caption = document.getElementById('caption');
const action = document.getElementById('action');
const currentWindow = getCurrentWindow();
let scene = null;
let interaction = null;
let responseSent = false;

const hash = (value = '') => {
  let out = 0x811c9dc5;
  for (const ch of String(value)) out = Math.imul(out ^ ch.charCodeAt(0), 16777619) >>> 0;
  return out;
};
const colour = (index, fallback) => scene?.palette?.[index] || fallback;

function fitCanvas() {
  if (!canvas || !ctx) return;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.max(1, Math.min(2, devicePixelRatio || 1));
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  draw();
}

function line(x1, y1, x2, y2, alpha = 1, width = 1) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawNatatorium(w, h, seed) {
  const water = h * (0.42 + ((seed % 11) / 100));
  for (let row = 0; row < 11; row += 1) {
    const y = water + row * (h - water) / 10;
    ctx.beginPath();
    for (let x = -20; x <= w + 20; x += 10) {
      const wave = Math.sin((x + seed % 97) * 0.035 + row * .8) * (3 + row * .35);
      if (x < 0) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = .78;
  ctx.strokeRect(w * .28, h * .13, w * .44, h * .18);
  line(w * .31, h * .22, w * .69, h * .22, .55, 2);
  ctx.save();
  ctx.translate(0, water * 2);
  ctx.scale(1, -1);
  ctx.globalAlpha = .18;
  ctx.strokeRect(w * .28, h * .13, w * .44, h * .18);
  ctx.restore();
}

function drawHall(w, h, seed) {
  const rows = 5;
  for (let row = 0; row < rows; row += 1) {
    const count = 5 + row * 2;
    const y = h * (.18 + row * .15);
    for (let at = 0; at < count; at += 1) {
      const x = w * (.08 + .84 * (at + .5) / count);
      const radius = Math.max(3, w * .012);
      ctx.globalAlpha = .35 + row * .1;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      line(x, y + radius, x, y + radius * 3.4, .35 + row * .1);
    }
  }
  const missing = (seed % 7) + 2;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillRect(w * (missing / 11), h * .46, w * .08, h * .14);
  ctx.globalCompositeOperation = 'source-over';
}

function drawPractice(w, h, seed) {
  for (let stave = 0; stave < 3; stave += 1) {
    const top = h * (.18 + stave * .28);
    for (let lineAt = 0; lineAt < 5; lineAt += 1) line(w * .04, top + lineAt * 8, w * .96, top + lineAt * 8, .38);
    for (let note = 0; note < 9; note += 1) {
      const x = w * (.08 + note * .105);
      const y = top + ((note * 3 + seed) % 5) * 8;
      ctx.globalAlpha = .72;
      ctx.fillRect(x, y - 3, 7, 6);
      line(x + 7, y, x + 7, y - 22, .72);
    }
  }
  ctx.globalAlpha = .35;
  ctx.strokeRect(w * .39, h * .08, w * .22, h * .80);
}

function drawChapel(w, h, seed) {
  const arches = 3;
  for (let at = 0; at < arches; at += 1) {
    const x = w * (.12 + at * .31);
    const aw = w * .20;
    const bottom = h * .88;
    ctx.globalAlpha = .62;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, h * .34);
    ctx.quadraticCurveTo(x + aw / 2, h * (.06 + (seed % 4) * .01), x + aw, h * .34);
    ctx.lineTo(x + aw, bottom);
    ctx.stroke();
  }
  ctx.globalAlpha = .28;
  ctx.font = `${Math.max(10, Math.floor(w / 35))}px ui-monospace, monospace`;
  for (let row = 0; row < 8; row += 1) ctx.fillText('CLAUSE / BODY / RETURN / CONSENT', w * .06, h * (.18 + row * .09));
}

function drawSource(w, h, seed) {
  for (let frame = 0; frame < 9; frame += 1) {
    const inset = frame * Math.min(w, h) * .035;
    ctx.globalAlpha = .72 - frame * .065;
    ctx.strokeRect(inset + (seed % 3), inset, w - inset * 2, h - inset * 2);
  }
  ctx.globalAlpha = .62;
  ctx.font = `${Math.max(11, Math.floor(w / 30))}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('RETURN( RETURN( RETURN ) )', w / 2, h / 2);
  ctx.textAlign = 'start';
}

function draw() {
  if (!ctx || !scene) return;
  const w = canvas.width;
  const h = canvas.height;
  const seed = hash(`${scene.battleId}:${scene.movementId}:${scene.intentId}:${scene.channelIndex}:${scene.phase}:${scene.resolution?.outcome || ''}`);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = colour(0, '#030606');
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = colour(1, '#74a49b');
  ctx.fillStyle = colour(2, '#d5d0a3');
  ctx.lineWidth = Math.max(1, Math.round(w / 420));
  if (scene.battleId === 'natatorium') drawNatatorium(w, h, seed);
  else if (scene.battleId === 'hall') drawHall(w, h, seed);
  else if (scene.battleId === 'practice') drawPractice(w, h, seed);
  else if (scene.battleId === 'chapel') drawChapel(w, h, seed);
  else drawSource(w, h, seed);
  ctx.globalAlpha = .12;
  ctx.fillStyle = colour(2, '#d5d0a3');
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  ctx.globalAlpha = 1;
}

function applyScene(next = {}, { interactive = false } = {}) {
  scene = {
    battleId: next.battleId || next.tableau?.battleId || 'source-final',
    movementId: next.movementId || next.tableau?.movementId || 'return',
    intentId: next.intentId || '',
    intentLabel: next.intentLabel || '',
    title: next.title || next.tableau?.title || 'AUDIOCORP / WINDOW CHANNEL',
    caption: next.caption || next.tableau?.caption || next.annotation || 'THE RETURN PATH IS OPEN.',
    palette: next.palette || next.tableau?.palette || ['#030606', '#74a49b', '#d5d0a3', '#160707'],
    channelIndex: Number(next.channelIndex) || 0,
    phase: next.phase || 'tableau',
    resolution: next.resolution && typeof next.resolution === 'object' ? { ...next.resolution } : null,
  };
  interaction = interactive ? next.interaction : null;
  responseSent = false;
  document.body.dataset.interactive = interaction ? 'true' : 'false';
  document.documentElement.style.setProperty('--bg', scene.palette[0]);
  document.documentElement.style.setProperty('--line', scene.palette[1]);
  document.documentElement.style.setProperty('--ink', scene.palette[2]);
  document.documentElement.style.setProperty('--wound', scene.palette[3]);
  title.textContent = scene.title.slice(0, 80);
  state.textContent = interaction === 'return' ? `RETURN / ${Number(next.tier) >= 3 ? 'FULL' : 'PARTIAL'}`
    : interaction === 'cut' ? `HOSTILE CHANNEL ${scene.channelIndex + 1}`
      : scene.resolution?.outcome ? `${scene.phase.toUpperCase()} / ${String(scene.resolution.outcome).toUpperCase()}`.slice(0, 48)
        : String(next.state || 'MONITOR RETURN').slice(0, 48);
  caption.textContent = interaction === 'return'
    ? (Number(next.tier) >= 3 ? 'THREE CLEAN PASSES. SEND THE FULL CHANNEL BACK.' : 'TWO CLEAN PASSES. RETURN IT NOW, OR HOLD FOR THREE.')
    : `${scene.caption}${scene.intentLabel ? `\n${scene.intentLabel}` : ''}${scene.resolution?.damage ? `\n${scene.resolution.damage} COMPOSURE CROSSED THE FRAME` : ''}`;
  action.textContent = interaction === 'return' ? 'RETURN SIGNAL' : 'CUT THIS CHANNEL';
  fitCanvas();
}

async function respond(actionId) {
  if (!interaction || responseSent || !scene) return;
  responseSent = true;
  const payload = {
    sessionToken: scene.sessionToken,
    attackId: scene.attackId,
    channelId: interaction === 'return' ? 'return' : scene.channelId,
    action: actionId,
  };
  await emit('window-channel-response', payload).catch(() => {});
  await currentWindow.hide().catch(() => {});
}

listen('interference-sidecar', ({ payload = {} }) => applyScene(payload, { interactive: false }));
listen('window-channel-scene', ({ payload = {} }) => {
  applyScene(payload, { interactive: true });
  scene = { ...scene,
    sessionToken: payload.sessionToken,
    attackId: payload.attackId,
    channelId: payload.channelId,
  };
});
listen('window-channel-event', ({ payload = {} }) => applyScene(payload, { interactive: false }));

action.addEventListener('click', () => respond(interaction === 'return' ? 'return' : 'cut'));
canvas.addEventListener('click', () => respond(interaction === 'return' ? 'return' : 'cut'));
currentWindow.onCloseRequested((event) => {
  if (!interaction || responseSent) return;
  event.preventDefault();
  void respond(interaction === 'return' ? 'decline' : 'cut');
});

const restore = () => emit('interference-emergency-restore', { source: mode }).catch(() => {});
document.getElementById('restore')?.addEventListener('click', restore);

let escapeAt = 0;
let escapeTimer = null;
window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.repeat) return;
  escapeAt = performance.now();
  clearTimeout(escapeTimer);
  escapeTimer = setTimeout(() => {
    if (escapeAt && performance.now() - escapeAt >= 1175) restore();
  }, 1200);
});
window.addEventListener('keyup', (event) => {
  if (event.key !== 'Escape') return;
  escapeAt = 0;
  clearTimeout(escapeTimer);
});

new ResizeObserver(fitCanvas).observe(canvas);
applyScene({ battleId: 'source-final', movementId: 'return', caption: 'THE RETURN PATH IS QUIET.' });
