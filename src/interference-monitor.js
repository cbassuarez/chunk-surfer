import { emit, listen } from '@tauri-apps/api/event';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') === 'echo' ? 'echo' : 'monitor';
document.documentElement.dataset.mode = mode;
document.documentElement.dataset.silhouette = String(params.get('silhouette') || 'return').slice(0, 32);

const text = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value || 'UNRESOLVED').slice(0, 96);
};

listen('interference-sidecar', ({ payload = {} }) => {
  text('state', payload.state || 'MONITOR RETURN');
  text('operator', payload.operator || 'UNRESOLVED');
  text('host', payload.host || 'WITHHELD');
  text('input', payload.input || 'WITHHELD');
  const annotation = document.getElementById('annotation');
  if (annotation) {
    annotation.textContent = String(payload.annotation || '').slice(0, 180);
    annotation.style.display = payload.annotation ? 'block' : 'none';
  }
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
