import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import chokidar from 'chokidar';
import { WebSocketServer } from 'ws';
import {
  stableJson,
  validateAudioProject,
  validateMediaProject,
  validateNarrativeDocument,
  validateProjectManifest,
} from '../../src/narrative/contracts.js';

const ROOT = resolve(import.meta.dirname, '../..');
const STUDIO_ROOT = resolve(ROOT, 'tools/narrative-studio');
const CONTENT_ROOT = resolve(ROOT, 'content');
const PUBLIC_ROOT = resolve(ROOT, 'public');
const HOST = '127.0.0.1';
const PORT = Number(process.env.STUDIO_PORT || 4317);
const TOKEN = randomUUID();
const writableRoots = [resolve(CONTENT_ROOT, 'narrative'), resolve(CONTENT_ROOT, 'audio'), resolve(CONTENT_ROOT, 'layout'), resolve(CONTENT_ROOT, 'media')];
const hash = (text) => createHash('sha256').update(text).digest('hex');
const json = (res, status, data) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(data)); };

function authorized(reqUrl, req) {
  const url = new URL(reqUrl, `http://${HOST}:${PORT}`);
  return url.searchParams.get('token') === TOKEN || req.headers['x-studio-token'] === TOKEN;
}

function safeContentPath(relativePath) {
  const full = resolve(CONTENT_ROOT, String(relativePath || ''));
  if (full === resolve(CONTENT_ROOT, 'project.json')) return full;
  if (!writableRoots.some((root) => full === root || full.startsWith(`${root}${sep}`))) throw new Error('path is outside the authoring roots');
  if (!/\.(story|audio|layout|media)\.json$/.test(full)) throw new Error('unsupported authoring file');
  return full;
}

async function readDocument(full) {
  const source = await readFile(full, 'utf8');
  return { data: JSON.parse(source), revision: hash(source) };
}

async function listFiles(dir, suffix) {
  try { return (await readdir(dir)).filter((name) => name.endsWith(suffix)).sort(); }
  catch { return []; }
}

async function projectSnapshot() {
  const projectLoaded = await readDocument(resolve(CONTENT_ROOT, 'project.json'));
  const documents = [];
  for (const documentPath of projectLoaded.data.narrative || []) {
    const name = documentPath.split('/').pop();
    const path = `narrative/${name}`;
    const loaded = await readDocument(safeContentPath(path));
    const layoutName = name.replace(/\.story\.json$/, '.layout.json');
    const layoutPath = `layout/${layoutName}`;
    let layout = { data: { schemaVersion: 1, documentId: loaded.data.id, positions: {}, regions: {} }, revision: '' };
    try { layout = await readDocument(safeContentPath(layoutPath)); } catch (_) {}
    documents.push({ path, revision: loaded.revision, document: loaded.data, layoutPath, layoutRevision: layout.revision, layout: layout.data });
  }
  const fallbackAudio = (await listFiles(resolve(CONTENT_ROOT, 'audio'), '.audio.json'))[0];
  const audioPath = projectLoaded.data.audio?.[0] || (fallbackAudio ? `audio/${fallbackAudio}` : '');
  const audio = audioPath ? await readDocument(safeContentPath(audioPath)) : { data: null, revision: '' };
  const fallbackMedia = (await listFiles(resolve(CONTENT_ROOT, 'media'), '.media.json'))[0];
  const mediaPath = projectLoaded.data.media?.[0] || (fallbackMedia ? `media/${fallbackMedia}` : '');
  const media = mediaPath ? await readDocument(safeContentPath(mediaPath)) : { data: null, revision: '' };
  return {
    project: projectLoaded.data,
    projectRevision: projectLoaded.revision,
    documents,
    audio: { path: audioPath, document: audio.data, revision: audio.revision },
    media: { path: mediaPath, document: media.data, revision: media.revision },
  };
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function serveAsset(req, res, url) {
  const relativePath = decodeURIComponent(url.pathname.slice('/project-assets/'.length));
  const full = resolve(PUBLIC_ROOT, relativePath);
  if (!(full === PUBLIC_ROOT || full.startsWith(`${PUBLIC_ROOT}${sep}`))) return json(res, 403, { error: 'asset path denied' });
  let info;
  try { info = await stat(full); } catch { return json(res, 404, { error: 'asset not found' }); }
  const types = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.json': 'application/json' };
  res.setHeader('content-type', types[extname(full).toLowerCase()] || 'application/octet-stream');
  res.setHeader('accept-ranges', 'bytes');
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = Number(match?.[1] || 0);
    const end = match?.[2] ? Math.min(info.size - 1, Number(match[2])) : info.size - 1;
    res.statusCode = 206;
    res.setHeader('content-range', `bytes ${start}-${end}/${info.size}`);
    res.setHeader('content-length', end - start + 1);
    createReadStream(full, { start, end }).pipe(res);
  } else {
    res.setHeader('content-length', info.size);
    createReadStream(full).pipe(res);
  }
}

const sockets = new Set();
const internalWrites = new Set();
const broadcast = (event) => {
  const payload = JSON.stringify(event);
  for (const socket of sockets) if (socket.readyState === socket.OPEN) socket.send(payload);
};

const studioApi = {
  name: 'chunk-surfer-narrative-studio-api',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      try {
        const url = new URL(req.url, `http://${HOST}:${PORT}`);
        if (url.pathname.startsWith('/project-assets/')) {
          if (!authorized(req.url, req)) return json(res, 401, { error: 'unauthorized' });
          return serveAsset(req, res, url);
        }
        if (!url.pathname.startsWith('/api/')) return next();
        if (!authorized(req.url, req)) return json(res, 401, { error: 'unauthorized' });
        if (req.method === 'GET' && url.pathname === '/api/project') return json(res, 200, await projectSnapshot());
        if (req.method === 'PUT' && url.pathname === '/api/document') {
          const input = await body(req);
          const full = safeContentPath(input.path);
          let current = '';
          try { current = await readFile(full, 'utf8'); } catch (_) {}
          if (input.revision && hash(current) !== input.revision) return json(res, 409, { error: 'file changed outside the studio', revision: hash(current) });
          const validation = input.path.endsWith('.story.json') ? validateNarrativeDocument(input.data)
            : input.path.endsWith('.audio.json') ? validateAudioProject(input.data)
            : input.path.endsWith('.media.json') ? validateMediaProject(input.data)
            : input.path === 'project.json' ? validateProjectManifest(input.data)
            : { ok: true, errors: [] };
          if (!validation.ok) return json(res, 422, { error: 'validation failed', validation });
          await mkdir(resolve(full, '..'), { recursive: true });
          const output = stableJson(input.data);
          const temporary = `${full}.${process.pid}.tmp`;
          await writeFile(temporary, output, 'utf8');
          internalWrites.add(relative(CONTENT_ROOT, full).replaceAll('\\', '/'));
          await rename(temporary, full);
          return json(res, 200, { ok: true, revision: hash(output), validation });
        }
        if (req.method === 'POST' && url.pathname === '/api/validate') {
          const input = await body(req);
          const validation = input.kind === 'audio' ? validateAudioProject(input.data)
            : input.kind === 'media' ? validateMediaProject(input.data)
            : input.kind === 'project' ? validateProjectManifest(input.data)
            : validateNarrativeDocument(input.data);
          return json(res, validation.ok ? 200 : 422, validation);
        }
        return json(res, 404, { error: 'unknown studio endpoint' });
      } catch (error) { return json(res, 500, { error: error.message }); }
    });
  },
};

await access(CONTENT_ROOT);
const server = await createViteServer({
  root: STUDIO_ROOT,
  publicDir: false,
  plugins: [react(), studioApi],
  server: { host: HOST, port: PORT, strictPort: true, fs: { allow: [ROOT] } },
});
await server.listen();

const wss = new WebSocketServer({ noServer: true });
server.httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  if (url.pathname !== '/studio-events' || url.searchParams.get('token') !== TOKEN) return;
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
});
wss.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
const watcher = chokidar.watch(CONTENT_ROOT, { ignoreInitial: true });
watcher.on('all', (event, path) => {
  const authoringPath = relative(CONTENT_ROOT, path).replaceAll('\\', '/');
  if (internalWrites.delete(authoringPath)) return;
  broadcast({ type: 'file-change', event, path: authoringPath });
});

const url = `http://${HOST}:${PORT}/?token=${TOKEN}`;
server.printUrls();
console.log(`Narrative Studio: ${url}`);
if (!process.env.STUDIO_NO_OPEN) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await watcher.close(); wss.close(); await server.close(); process.exit(0);
});
