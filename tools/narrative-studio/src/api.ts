import type { ProjectSnapshot } from './types';

export const token = new URLSearchParams(location.search).get('token') || '';

async function request(path: string, options: RequestInit = {}) {
  const url = `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-studio-token': token, ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || `Request failed: ${response.status}`) as Error & { status?: number; detail?: unknown };
    error.status = response.status; error.detail = data; throw error;
  }
  return data;
}

export const loadProject = () => request('/api/project') as Promise<ProjectSnapshot>;

export const saveDocument = (path: string, revision: string, data: unknown) => request('/api/document', {
  method: 'PUT', body: JSON.stringify({ path, revision, data }),
}) as Promise<{ revision: string }>;

export const assetUrl = (path: string) => `/project-assets/${path}?token=${encodeURIComponent(token)}`;

export function subscribeToChanges(onChange: (event: { type: string; path: string; event: string }) => void) {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${protocol}://${location.host}/studio-events?token=${encodeURIComponent(token)}`);
  let disposed = false;
  socket.onmessage = (event) => {
    if (!disposed) onChange(JSON.parse(event.data));
  };
  return () => {
    disposed = true;
    socket.onmessage = null;
    if (socket.readyState === WebSocket.OPEN) socket.close();
    else if (socket.readyState === WebSocket.CONNECTING) socket.addEventListener('open', () => socket.close(), { once: true });
  };
}
