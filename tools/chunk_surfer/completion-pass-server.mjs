import { createServer } from 'vite';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, unlink, chmod } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { COMPLETION_CONTROL_PATH, COMPLETION_CONTROL_TIMING, completionControlContext, validateCompletionControlCommand } from '../../src/dev/completion-control-relay.js';

const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
const secretMatches = (candidate, token) => {
  const a = Buffer.from(String(candidate || '')), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
};
const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
};
async function readBody(req) {
  if (Number(req.headers['content-length'] || 0) > 8192) throw Error('request-too-large');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 8192) throw Error('request-too-large');
  }
  return body ? JSON.parse(body) : {};
}

// The only write surface is a small queue of validated, expiring normal input
// commands. The service neither imports gameplay nor has a game-state API.
export function createCompletionControlService({ port = 5511, now = Date.now, token = randomBytes(32).toString('base64url') } = {}) {
  const origin = `http://127.0.0.1:${port}`, sessionId = randomUUID();
  let client = null;
  const queue = [], results = [];
  function result(value) { results.push({ at: now(), ...value }); if (results.length > 256) results.shift(); }
  function expire() {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].expiresAt <= now()) {
      result({ id: queue[i].id, accepted: false, reason: 'queue-expired' }); queue.splice(i, 1);
    }
  }
  function authorized(req) { return secretMatches(String(req.headers.authorization || '').replace(/^Bearer /, ''), token); }
  function samePage(req) {
    try {
      const ref = new URL(req.headers.referer || '');
      return ref.origin === origin && ref.searchParams.get('completionPass') === '1' && ref.searchParams.get('completionInput') === '1';
    } catch { return false; }
  }
  async function middleware(req, res, next = () => {}) {
    const path = String(req.url || '').split('?')[0];
    if (!path.startsWith(COMPLETION_CONTROL_PATH + '/')) return next();
    if (!loopback(req.socket?.remoteAddress) || req.headers.host !== `127.0.0.1:${port}`
      || req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site')
      return json(res, 403, { error: 'loopback-same-origin-only' });
    expire();
    try {
      if (path === COMPLETION_CONTROL_PATH + '/session') {
        if (req.method !== 'POST' || !samePage(req)) return json(res, 403, { error: 'explicit-test-page-required' });
        const body = await readBody(req);
        if (typeof body.clientId !== 'string' || !/^[a-zA-Z0-9_-]{12,128}$/.test(body.clientId)) return json(res, 400, { error: 'invalid-client' });
        if (client && client.clientId !== body.clientId && now() - client.lastPoll < COMPLETION_CONTROL_TIMING.clientLeaseMs)
          return json(res, 409, { error: 'another-test-page-is-active' });
        if (!client || client.clientId !== body.clientId) {
          queue.length = 0;
          client = { clientId: body.clientId, lastPoll: now(), inputEpoch: 0, context: completionControlContext() };
        }
        return json(res, 200, { token, sessionId, pollIntervalMs: COMPLETION_CONTROL_TIMING.pollIntervalMs, leaseMs: COMPLETION_CONTROL_TIMING.clientLeaseMs });
      }
      if (!authorized(req)) return json(res, 401, { error: 'session-token-required' });
      if (path === COMPLETION_CONTROL_PATH + '/status' && req.method === 'GET')
        return json(res, 200, { sessionId, label: 'approved-test-input-relay', client,
          connected: !!client && now() - client.lastPoll < COMPLETION_CONTROL_TIMING.clientLeaseMs, queued: queue.length, results: results.slice(-64) });
      if (req.method !== 'POST') return json(res, 405, { error: 'post-required' });
      const body = await readBody(req);
      if (path === COMPLETION_CONTROL_PATH + '/command') {
        const command = validateCompletionControlCommand(body);
        if (!command) return json(res, 400, { error: 'invalid-normal-input-command' });
        if (!client || now() - client.lastPoll >= COMPLETION_CONTROL_TIMING.clientLeaseMs || client.context.focused !== true || client.context.hidden)
          return json(res, 409, { error: 'actual-focused-test-page-required' });
        if (queue.length >= 32) return json(res, 429, { error: 'input-queue-full' });
        const row = { id: randomUUID(), command, expiresAt: now() + COMPLETION_CONTROL_TIMING.queueTtlMs,
          owner: { runId: client.context.runId, sceneId: client.context.sceneId, inputEpoch: client.inputEpoch } };
        queue.push(row);
        return json(res, 202, { id: row.id, queued: true, expiresAt: row.expiresAt, label: 'relayed-normal-input' });
      }
      if (!client || body.clientId !== client.clientId || body.sessionId !== sessionId)
        return json(res, 409, { error: 'active-client-required' });
      if (path === COMPLETION_CONTROL_PATH + '/release') {
        client = null; queue.length = 0; return json(res, 200, { released: true });
      }
      if (path === COMPLETION_CONTROL_PATH + '/poll') {
        client.lastPoll = now(); client.context = completionControlContext(body.context);
        client.inputEpoch = Number.isSafeInteger(body.inputEpoch) && body.inputEpoch >= 0 ? body.inputEpoch : 0;
        for (const receipt of (Array.isArray(body.receipts) ? body.receipts : []).slice(0, 16)) {
          if (typeof receipt.id === 'string' && receipt.id.length <= 128)
            result({ id: receipt.id, accepted: receipt.accepted === true, ...(typeof receipt.reason === 'string' ? { reason: receipt.reason.slice(0, 128) } : {}) });
        }
        const available = queue.splice(0, 16), commands = [];
        for (const row of available) {
          if (client.context.focused && !client.context.hidden && row.owner.runId === client.context.runId
            && row.owner.sceneId === client.context.sceneId && row.owner.inputEpoch === client.inputEpoch) commands.push(row);
          else result({ id: row.id, accepted: false, reason: 'input-owner-changed' });
        }
        // Losing focus discards old intentions rather than delaying them until
        // a future tab acquisition. The browser independently releases downs.
        if (!client.context.focused || client.context.hidden) queue.length = 0;
        return json(res, 200, { commands: commands.map(({ id, command, owner,expiresAt }) => ({ id, command, owner,
          expiresInMs:Math.max(0,expiresAt-now()) })) });
      }
      return json(res, 404, { error: 'unknown-input-endpoint' });
    } catch (error) { return json(res, 400, { error: error.message === 'request-too-large' ? 'request-too-large' : 'invalid-request' }); }
  }
  return { middleware, credentials: { origin, path: COMPLETION_CONTROL_PATH, token, sessionId },
    dispose() { client = null; queue.length = 0; } };
}

export async function startCompletionPassServer({ port = Number(process.env.COMPLETION_PORT) || 5511 } = {}) {
  // A fresh module URL prevents a retained browser cache from testing an older
  // main module after this isolated server restarts. Gameplay code is unchanged.
  const revision = Date.now(), control = createCompletionControlService({ port });
  const credentialFile = `/private/tmp/chunk-surfer-completion-control-${port}.json`;
  const server = await createServer({
    plugins: [{
      name: 'completion-module-freshness',
      transformIndexHtml(html) { return html.replace(/(src=["'])(?:\.\/)?src\/main\.js[^"']*/g, `$1/src/main.js?completionRevision=${revision}`); },
      configureServer(vite) { vite.middlewares.use((req, res, next) => { void control.middleware(req, res, next); }); },
    }],
    server: { host: '127.0.0.1', port, strictPort: true, hmr: false, watch: null, headers: { 'Cache-Control': 'no-store' } }, logLevel: 'warn',
  });
  await server.listen();
  await writeFile(credentialFile, JSON.stringify({ ...control.credentials, port, pid: process.pid, revision,
    label: 'approved-local-test-input-relay', createdAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
  await chmod(credentialFile, 0o600);
  console.log(`Completion pass http://127.0.0.1:${port}/?completionPass=1&completionInput=1`);
  console.log(`Local test input credentials: ${credentialFile}`);
  let closing = false;
  const close = async () => {
    if (closing) return; closing = true; control.dispose(); await server.close();
    try {
      const current = JSON.parse(await readFile(credentialFile, 'utf8'));
      if (current.pid === process.pid && current.sessionId === control.credentials.sessionId) await unlink(credentialFile);
    } catch { /* Another isolated server owns its own file. */ }
  };
  return { server, control, credentialFile, close };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const running = await startCompletionPassServer();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await running.close(); process.exit(0); });
}
