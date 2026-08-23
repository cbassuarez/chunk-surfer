import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { readFile } from 'node:fs/promises';

import {
  buildSystemMapSnapshot,
  topologyContractErrors,
} from '../tools/system-map/snapshot.mjs';
import {
  parseSystemMapArgs,
  startSystemMapServer,
} from '../tools/system-map/server.mjs';

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

assert.deepEqual(topologyContractErrors(), [], 'system-map topology is structurally valid');

const snapshot = await buildSystemMapSnapshot();
assert.equal(snapshot.schema, 1);
assert.equal(snapshot.nodes.length, 20, 'the full lifecycle is represented by twenty subsystem buildings');
assert.equal(snapshot.edges.length, 35, 'semantic routes stay curated instead of becoming a raw import graph');
assert.equal(snapshot.traces.length, 7);
assert.ok(snapshot.traces.some((trace) => trace.id === snapshot.defaultTraceId));
for (const node of snapshot.nodes) {
  assert.ok(node.summary && node.responsibilities.length, `${node.id} has an explainer contract`);
  assert.ok(node.evidence.length, `${node.id} has current source evidence`);
  for (const citation of node.evidence) {
    assert.ok(citation.line > 0 && citation.excerpt.length, `${node.id} citation resolves to a live excerpt`);
  }
}
for (const edge of snapshot.edges) {
  assert.ok(edge.payload && edge.evidence.length, `${edge.id} names its payload and evidence`);
  assert.ok(edge.evidence.every((citation) => citation.line > 0 && citation.excerpt.length), `${edge.id} evidence resolves`);
}

assert.deepEqual(parseSystemMapArgs([]), { host: '127.0.0.1', port: 4318, open: true });
assert.deepEqual(parseSystemMapArgs(['--no-open', '--port', '4931']), { host: '127.0.0.1', port: 4931, open: false });
assert.deepEqual(parseSystemMapArgs(['--port=4932']), { host: '127.0.0.1', port: 4932, open: true });
assert.throws(() => parseSystemMapArgs(['--wat']), /unknown system-map option/);
assert.throws(() => parseSystemMapArgs(['--port', '80']), /invalid system-map port/);

const frontendSource = await readFile('tools/system-map/src/main.js', 'utf8');
const frontendStyles = await readFile('tools/system-map/src/styles.css', 'utf8');
assert.match(frontendSource, /import \{ Heerich \} from 'heerich'/, 'the city is rendered by Heerich');
assert.match(frontendSource, /data-flow-toggle/, 'payload-flow filters are present');
assert.match(frontendSource, /prefers-reduced-motion/, 'moving payload markers respect reduced motion');
assert.match(frontendStyles, /grid-template-columns:\s*minmax\(0, 1fr\)/, 'desktop map keeps the explainer beside the city');
assert.match(frontendStyles, /@media \(max-width: 1040px\)/, 'tablet and narrow layouts stack the explainer');

const port = await reservePort();
const running = await startSystemMapServer({ port, open: false });
try {
  assert.equal(running.url, `http://127.0.0.1:${port}/`);
  assert.equal(running.server.httpServer.listening, true);
  const response = await fetch(`${running.url}api/system-map`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const live = await response.json();
  assert.equal(live.nodes.length, snapshot.nodes.length);
  assert.equal(live.repo.root.endsWith('/chunk-surfer'), true);

  const denied = await fetch(`${running.url}api/source?path=package.json`);
  assert.equal(denied.status, 404, 'the server exposes no arbitrary source-file endpoint');
  const write = await fetch(`${running.url}api/system-map`, { method: 'POST', body: '{}' });
  assert.equal(write.status, 404, 'the system-map API is read-only');
} finally {
  await running.server.close();
}
assert.equal(running.server.httpServer.listening, false, 'the local server shuts down cleanly');

console.log('system map contracts pass');
