import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

import { createServer as createViteServer } from 'vite';

import { buildSystemMapSnapshot } from './snapshot.mjs';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 4318;

export function parseSystemMapArgs(argv = []) {
  let port = DEFAULT_PORT;
  let open = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-open') open = false;
    else if (arg === '--port') port = Number(argv[++index]);
    else if (arg.startsWith('--port=')) port = Number(arg.slice('--port='.length));
    else throw new Error(`unknown system-map option: ${arg}`);
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`invalid system-map port: ${port}`);
  return { host: HOST, port, open };
}

function writeJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.end(JSON.stringify(body));
}

function systemMapApi() {
  return {
    name: 'chunk-surfer-system-map-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, `http://${HOST}`);
        if (!url.pathname.startsWith('/api/')) return next();
        if (request.method !== 'GET' || url.pathname !== '/api/system-map') return writeJson(response, 404, { error: 'unknown system-map endpoint' });
        try { return writeJson(response, 200, await buildSystemMapSnapshot()); }
        catch (error) { return writeJson(response, 500, { error: error.message, details: error.errors || [] }); }
      });
    },
  };
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

export async function startSystemMapServer({ port = DEFAULT_PORT, open = true } = {}) {
  const snapshot = await buildSystemMapSnapshot();
  const server = await createViteServer({
    configFile: false,
    root: import.meta.dirname,
    publicDir: false,
    clearScreen: false,
    plugins: [systemMapApi()],
    define: { __SYSTEM_MAP_SNAPSHOT__: JSON.stringify(snapshot) },
    server: { host: HOST, port, strictPort: true },
  });
  await server.listen();
  const url = `http://${HOST}:${port}/`;
  console.log(`Chunk Surfer system map: ${url}`);
  if (open) openBrowser(url);
  return { server, url };
}

async function main() {
  const options = parseSystemMapArgs(process.argv.slice(2));
  const { server } = await startSystemMapServer(options);
  const close = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message || error); process.exit(1); });
}

