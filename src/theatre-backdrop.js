import { emit, listen } from '@tauri-apps/api/event';
import { paintTheatreHouse, theatreHouseScene } from './render/theatre-house.js';

const canvas = document.querySelector('canvas'), context = canvas.getContext('2d', { alpha: false });
let scene = theatreHouseScene(), frame = {}, pending = 0, timer = 0, paintedAt = -Infinity;
function paint() {
  pending = 0; paintedAt = performance.now();
  if (document.hidden) return;
  const scale = Math.min(1 / 1.5, 1280 / Math.max(innerWidth, innerHeight));
  canvas.width = Math.max(1, Math.round(innerWidth * scale));
  canvas.height = Math.max(1, Math.round(innerHeight * scale));
  paintTheatreHouse(context, canvas.width, canvas.height, scene, frame);
}
function schedule() {
  if (pending || timer || document.hidden) return;
  const delay = Math.max(0, 100 - (performance.now() - paintedAt));
  if (delay) timer = setTimeout(() => { timer = 0; schedule(); }, delay);
  else pending = requestAnimationFrame(paint);
}
async function boot() {
  const stops = await Promise.all([
    listen('theatre-backdrop:scene', ({ payload }) => { scene = theatreHouseScene(payload); schedule(); }),
    listen('theatre-backdrop:frame', ({ payload }) => { frame = payload || {}; if (scene.kind === 'wash') schedule(); }),
  ]);
  window.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(pending); clearTimeout(timer); pending = timer = 0; } else schedule(); });
  window.addEventListener('pointerdown', () => { void emit('theatre-backdrop:pointer'); });
  window.addEventListener('pagehide', () => { cancelAnimationFrame(pending); clearTimeout(timer); stops.forEach(stop => stop()); }, { once: true });
  paint();
  await emit('theatre-backdrop:ready');
}
void boot().catch(error => console.warn('[theatre] backdrop could not connect', error));
