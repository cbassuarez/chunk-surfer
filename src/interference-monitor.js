import { listen } from '@tauri-apps/api/event';

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
