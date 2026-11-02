import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { COMPLETION_CONTROL_TIMING,createCompletionControlRelay, installCompletionControlRelay, validateCompletionControlCommand } from '../src/dev/completion-control-relay.js';
import { createCompletionControlService } from '../tools/chunk_surfer/completion-pass-server.mjs';

function core() {
  let time = 0;
  const context = { runId: 'ordinary-run', sceneId: null, focused: true, hidden: false, paused: false };
  const events = [], labels = [];
  const relay = createCompletionControlRelay({ now: () => time, getContext: () => context,
    onKeyDown: event => events.push(['down', event]), onKeyUp: event => events.push(['up', event]),
    onControllerDown: action => events.push(['controller-down', action]), onControllerUp: action => events.push(['controller-up', action]),
    onLook: value => events.push(['look', value]), clearLook: () => events.push(['clear-look']), onInput: value => labels.push(value) });
  relay.connect();
  return { relay, events, labels, context, time: value => { time = value; } };
}
function serviceFixture() {
  let time = 0;
  const service = createCompletionControlService({ port: 5511, now: () => time });
  async function request(path, { method = 'POST', body = {}, auth = true, headers = {}, remoteAddress = '127.0.0.1' } = {}) {
    const req = Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]);
    Object.assign(req, { method, url: '/__completion_control' + path, socket: { remoteAddress }, headers: {
      host: '127.0.0.1:5511', ...(auth ? { authorization: 'Bearer ' + service.credentials.token } : {}), ...headers } });
    const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; },
      end(value) { this.body = JSON.parse(value); } };
    await service.middleware(req, res, () => { throw Error('unexpected fallthrough'); });
    return { status: res.statusCode, body: res.body, headers: res.headers };
  }
  const clientId = 'completion-browser-ordinary-1';
  async function session(id = clientId) {
    return request('/session', { auth: false, body: { clientId: id }, headers: { referer: 'http://127.0.0.1:5511/?completionPass=1&completionInput=1' } });
  }
  async function poll(context = { focused: true, hidden: false, paused: false, runId: 'real-run', sceneId: null }, receipts = []) {
    return request('/poll', { body: { clientId, sessionId: service.credentials.sessionId, context, receipts } });
  }
  return { service, request, session, poll, clientId, time: value => { time = value; } };
}

test('the protocol accepts only bounded normal inputs and rejects all state/code/modifier surfaces', () => {
  assert.deepEqual(validateCompletionControlCommand({ kind: 'key', code: 'KeyW', durationMs: 2000 }), { kind: 'key', code: 'KeyW', durationMs: 2000 });
  assert.deepEqual(validateCompletionControlCommand({ kind: 'look', turnX: -.3 }), { kind: 'look', turnX: -.3, lookY: 0, durationMs: 100 });
  for (const value of [null, [], { kind: 'eval', code: 'x=1' }, { kind: 'warp', x: 0 },
    { kind: 'key', code: 'F10' }, { kind: 'key', code: 'Backquote' }, { kind: 'key', code: 'MetaLeft' },
    { kind: 'key', code: 'KeyW', durationMs: 2001 }, { kind: 'key', code: 'KeyE', durationMs: -1 },
    { kind: 'key', code: 'KeyE', ctrlKey: true }, { kind: 'key', code: 'KeyE', eligible: true },
    { kind: 'controller', action: 'grant-all' }, { kind: 'look', durationMs: 1001 }, { kind: 'look', turnX: Infinity }])
    assert.equal(validateCompletionControlCommand(value), null, JSON.stringify(value));
});

test('timed keyboard/controller/look leases release through normal callbacks without repeat or time changes', () => {
  const h = core();
  h.relay.receive({ kind: 'key', code: 'KeyW', durationMs: 2000 }, { commandId: 'walking' });
  assert.equal(h.events[0][0], 'down'); assert.equal(h.events[0][1].repeat, false); assert.equal(h.events[0][1].isTrusted, false);
  assert.equal(h.events[0][1].timeStamp, 0);
  h.time(1999); h.relay.tick(); assert.equal(h.events.length, 1);
  h.time(2000); h.relay.tick(); assert.equal(h.events[1][0], 'up'); assert.equal(h.relay.status().held.length, 0);
  h.relay.receive({ kind: 'controller', action: 'interact', durationMs: 100 });
  h.time(2100); h.relay.tick(); assert.deepEqual(h.events.slice(-2), [['controller-down', 'interact'], ['controller-up', 'interact']]);
  h.relay.receive({ kind: 'look', turnX: 1, durationMs: 1000 }); h.time(3100); h.relay.tick();
  assert.equal(h.events.at(-1)[0], 'clear-look');
  assert.equal(h.labels.every(row => row.source === 'local-test-api' && row.kind === 'test-control-relay-input'), true);
  assert.deepEqual(Object.keys(h.relay).sort(), ['clear', 'connect', 'disconnect', 'dispose', 'receive', 'status', 'tick']);
});

test('actual focus, visibility, run, scene, pause and disconnect boundaries release held input', () => {
  for (const boundary of ['focus', 'hidden', 'run', 'scene', 'pause', 'disconnect']) {
    const h = core(); h.relay.receive({ kind: 'key', code: 'KeyW', durationMs: 2000 });
    h.relay.receive({ kind: 'look', turnX: 1, durationMs: 1000 });
    if (boundary === 'focus') h.context.focused = false;
    else if (boundary === 'hidden') h.context.hidden = true;
    else if (boundary === 'run') h.context.runId = 'next-run';
    else if (boundary === 'scene') h.context.sceneId = 'bag';
    else if (boundary === 'pause') h.context.paused = true;
    else h.relay.disconnect();
    h.relay.tick();
    assert.equal(h.relay.status().held.length, 0, boundary);
    assert.ok(h.events.some(row => row[0] === 'up'), boundary);
    assert.ok(h.events.some(row => row[0] === 'clear-look'), boundary);
  }
  const h = core(); h.context.focused = false;
  assert.equal(h.relay.receive({ kind: 'key', code: 'Enter' }).accepted, false);
  assert.equal(h.events.length, 0);
  assert.equal(h.context.focused, false, 'the relay cannot acquire or counterfeit native focus');
});

test('one real transport loss releases and advances once; idle loss cannot amplify trace writes',()=>{
 const h=core(),owner={...h.relay.status().context,inputEpoch:h.relay.status().inputEpoch};
 h.relay.receive({kind:'key',code:'KeyW',durationMs:2000});h.relay.receive({kind:'look',turnX:1,durationMs:1000});
 h.relay.disconnect('heartbeat-expired');const epoch=h.relay.status().inputEpoch,count=h.labels.length;
 assert.equal(epoch,owner.inputEpoch+1);assert.equal(h.relay.status().held.length,0);assert.equal(h.relay.status().lookUntil,0);
 for(let i=0;i<1000;i++)h.relay.disconnect('heartbeat-expired');
 assert.equal(h.labels.length,count);assert.equal(h.relay.status().inputEpoch,epoch);
 assert.equal(h.events.filter(e=>e[0]==='up').length,1);assert.equal(h.events.filter(e=>e[0]==='clear-look').length,1);
 h.relay.connect();assert.equal(h.relay.receive({kind:'key',code:'KeyE'},{owner}).reason,'input-owner-changed');
 const fresh={...h.relay.status().context,inputEpoch:h.relay.status().inputEpoch};
 assert.equal(h.relay.receive({kind:'key',code:'KeyE'},{owner:fresh}).accepted,true);
});

test('already-disconnected empty transport produces no clear trace or owner generation',()=>{
 const notes=[],relay=createCompletionControlRelay({onInput:n=>notes.push(n)}),before=relay.status();
 for(let i=0;i<1000;i++)relay.disconnect('transport-unavailable');
 assert.equal(notes.length,0);assert.equal(relay.status().inputEpoch,before.inputEpoch);assert.equal(relay.status().connected,false);
});

test('pause permits its ordinary UI controls while declining hidden walking and look', () => {
  const h = core(); h.context.paused = true; h.relay.tick();
  assert.equal(h.relay.receive({ kind: 'key', code: 'KeyW' }).accepted, false);
  assert.equal(h.relay.receive({ kind: 'look', turnX: 1 }).accepted, false);
  assert.equal(h.relay.receive({ kind: 'key', code: 'Escape' }).accepted, true);
  assert.equal(h.relay.receive({ kind: 'controller', action: 'confirm' }).accepted, true);
  h.relay.dispose(); assert.equal(h.relay.status().held.length, 0);
});

test('a synchronous scene handoff cannot inherit a held key, and duplicate downs do not extend it', () => {
  const context = { focused: true, sceneId: 'world' }, events = [];
  const relay = createCompletionControlRelay({ getContext: () => context,
    onKeyDown: event => { events.push(event.type); context.sceneId = 'dialogue'; }, onKeyUp: event => events.push(event.type) });
  relay.connect(); relay.receive({ kind: 'key', code: 'KeyE', durationMs: 2000 });
  assert.deepEqual(events, ['keydown', 'keyup']); assert.equal(relay.status().held.length, 0);
  const h = core(); h.relay.receive({ kind: 'key', code: 'KeyW', durationMs: 2000 });
  h.time(1900); assert.equal(h.relay.receive({ kind: 'key', code: 'KeyW', durationMs: 2000 }).reason, 'already-held');
  h.time(2000); h.relay.tick(); assert.equal(h.relay.status().held.length, 0);
});

test('queued intentions cannot cross scene/run/focus generations, including focus loss followed by recovery', () => {
  const h = core(), owner = { ...h.relay.status().context, inputEpoch: h.relay.status().inputEpoch };
  h.context.focused = false; h.relay.tick(); h.context.focused = true; h.relay.tick();
  assert.equal(h.relay.receive({ kind: 'key', code: 'KeyW' }, { owner }).reason, 'input-owner-changed');
  assert.equal(h.events.length, 0, 'a regained focus lease cannot execute a stale walk');
  const next = { ...h.relay.status().context, inputEpoch: h.relay.status().inputEpoch };
  assert.equal(h.relay.receive({ kind: 'key', code: 'KeyE' }, { owner: next }).accepted, true);
});

test('host/observer errors fail closed and cannot leave leased keys held', () => {
  let ups = 0;
  const relay = createCompletionControlRelay({ getContext: () => ({ focused: true }),
    onKeyDown: () => { throw Error('ordinary handler failed'); }, onKeyUp: () => { ups++; }, onInput: () => { throw Error('observer failed'); } });
  relay.connect();
  assert.equal(relay.receive({ kind: 'key', code: 'KeyW' }).reason, 'handler-error');
  assert.equal(ups, 1); assert.equal(relay.status().held.length, 0);
});

test('HTTP service is loopback/token limited, bootstrap needs the explicit test page and one client owns the queue', async () => {
  const h = serviceFixture();
  assert.equal((await h.request('/status', { method: 'GET', auth: false })).status, 401);
  assert.equal((await h.request('/status', { method: 'GET', remoteAddress: '192.0.2.1' })).status, 403);
  assert.equal((await h.request('/status', { method: 'GET', headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal((await h.request('/session', { auth: false, body: { clientId: h.clientId } })).status, 403);
  assert.equal((await h.session()).status, 200);
  assert.equal((await h.session('another-active-browser')).status, 409);
  assert.equal((await h.request('/command', { body: { kind: 'key', code: 'KeyE' } })).status, 409, 'bootstrap is not actual focus');
  await h.poll();
  const queued = await h.request('/command', { body: { kind: 'key', code: 'KeyE', durationMs: 80 } });
  assert.equal(queued.status, 202); assert.equal(queued.body.label, 'relayed-normal-input');
  const received = await h.poll(); assert.equal(received.body.commands[0].id, queued.body.id);
  assert.equal(received.body.commands[0].expiresInMs,COMPLETION_CONTROL_TIMING.queueTtlMs);
  assert.deepEqual(received.body.commands[0].command, { kind: 'key', code: 'KeyE', durationMs: 80 });
  await h.poll(undefined, [{ id: queued.body.id, accepted: true }]);
  const status = await h.request('/status', { method: 'GET' });
  assert.equal(status.body.results.at(-1).accepted, true); assert.equal(Object.hasOwn(status.body, 'token'), false);
});

test('HTTP queue rejects gameplay setters, drops stale/unfocused intentions and expires disconnected leases', async () => {
  const h = serviceFixture(); await h.session(); await h.poll();
  for (const body of [{ kind: 'key', code: 'F10' }, { kind: 'key', code: 'KeyE', grant: true }, { kind: 'position', x: 1 }])
    assert.equal((await h.request('/command', { body })).status, 400);
  await h.request('/command', { body: { kind: 'key', code: 'KeyW', durationMs: 2000 } });
  assert.equal((await h.poll({ focused: false })).body.commands.length, 0);
  assert.equal((await h.poll()).body.commands.length, 0, 'focus recovery never starts an old walk');
  await h.request('/command', { body: { kind: 'key', code: 'KeyE' } });
  h.time(2600);
  const status = await h.request('/status', { method: 'GET' });
  assert.equal(status.body.connected, true,'queue expiry remains stricter than the longer transport lease'); assert.equal(status.body.queued, 0);
  assert.equal(status.body.results.at(-1).reason, 'queue-expired');
  h.time(COMPLETION_CONTROL_TIMING.clientLeaseMs);
  assert.equal((await h.request('/command', { body: { kind: 'key', code: 'KeyE' } })).status, 409);
  assert.equal((await h.request('/poll', { body: { clientId: h.clientId, sessionId: h.service.credentials.sessionId }, headers: { 'content-length': '9000' } })).status, 400);
});

test('server delivery binds queued commands to the exact observed input owner', async () => {
  const h = serviceFixture(); await h.session(); await h.poll();
  await h.request('/command', { body: { kind: 'key', code: 'KeyW' } });
  const changed = await h.poll({ focused: true, hidden: false, runId: 'new-run', sceneId: 'title' });
  assert.equal(changed.body.commands.length, 0);
  const status = await h.request('/status', { method: 'GET' });
  assert.equal(status.body.results.at(-1).reason, 'input-owner-changed');
});

test('client installation is unavailable to ordinary/remote game URLs', () => {
  for (const location of [{ hostname: '127.0.0.1', search: '' }, { hostname: '127.0.0.1', search: '?completionPass=1' },
    { hostname: 'example.com', search: '?completionPass=1&completionInput=1' }])
    assert.equal(installCompletionControlRelay({ location }), null);
});

test('installed polling transport delivers labeled callbacks and releases immediately on actual blur', async () => {
  const h = serviceFixture(), window = new EventTarget(), document = new EventTarget();
  document.activeElement = { tagName: 'CANVAS' };
  const context = { runId: 'fresh-run', sceneId: null, focused: true, hidden: false, paused: false };
  const inputs = [], labels = [];
  const fetcher = async (url, options = {}) => {
    const headers = Object.fromEntries(Object.entries(options.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    const response = await h.request(String(url).replace('/__completion_control', ''), { method: options.method,
      body: options.body || {}, auth: false, headers: { referer: 'http://127.0.0.1:5511/?completionPass=1&completionInput=1', ...headers } });
    return { ok: response.status >= 200 && response.status < 300, status: response.status, json: async () => response.body };
  };
  const installed = installCompletionControlRelay({
    location: { hostname: '127.0.0.1', search: '?completionPass=1&completionInput=1' }, window, document, fetch: fetcher,
    getContext: () => context, onKeyDown: event => inputs.push(['down', event]), onKeyUp: event => inputs.push(['up', event]),
    onInput: entry => labels.push(entry),
  });
  const until = async predicate => {
    const deadline = Date.now() + 1500;
    while (!await predicate()) { if (Date.now() >= deadline) assert.fail('transport callback timed out'); await new Promise(resolve => setTimeout(resolve, 10)); }
  };
  try {
    await until(async () => (await h.request('/status', { method: 'GET' })).body.client?.context.focused === true);
    assert.equal((await h.request('/command', { body: { kind: 'key', code: 'KeyW', durationMs: 1000 } })).status, 202);
    await until(() => inputs.some(row => row[0] === 'down'));
    assert.equal(inputs[0][1].code, 'KeyW'); assert.equal(inputs[0][1].repeat, false);
    assert.equal(inputs[0][1].target, document.activeElement, 'normal handlers see real DOM focus, including their editable-field guards');
    context.focused = false; window.dispatchEvent(new Event('blur'));
    assert.equal(inputs.at(-1)[0], 'up'); assert.equal(installed.status().held.length, 0);
    assert.equal(context.focused, false, 'transport does not acquire focus');
    assert.ok(labels.some(row => row.kind === 'test-control-relay-input' && row.source === 'local-test-api' && row.phase === 'down'));
  } finally { installed.dispose(); }
});

test('shared DEV transport tolerates1.1s responses while input leases and actual-focus boundaries remain bounded',async()=>{
 assert.ok(COMPLETION_CONTROL_TIMING.requestTimeoutMs<COMPLETION_CONTROL_TIMING.heartbeatMs);
 assert.ok(COMPLETION_CONTROL_TIMING.heartbeatMs<COMPLETION_CONTROL_TIMING.clientLeaseMs);
 assert.equal(COMPLETION_CONTROL_TIMING.queueTtlMs,2500);
 const h=serviceFixture(),window=new EventTarget(),document=new EventTarget(),start=performance.now();
 document.activeElement={tagName:'CANVAS'};const context={runId:'latency-run',sceneId:null,focused:true,hidden:false,paused:false},inputs=[],notes=[];
 const fetcher=async(url,options={})=>{
  h.time(performance.now()-start);
  const headers=Object.fromEntries(Object.entries(options.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const response=await h.request(String(url).replace('/__completion_control',''),{method:options.method,body:options.body||{},auth:false,headers:{referer:'http://127.0.0.1:5511/?completionPass=1&completionInput=1',...headers}});
  if(String(url).endsWith('/poll'))await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,1100);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('request aborted'));},{once:true});});
  return{ok:response.status>=200&&response.status<300,status:response.status,json:async()=>response.body};
 };
 const installed=installCompletionControlRelay({location:{hostname:'127.0.0.1',search:'?completionPass=1&completionInput=1'},window,document,fetch:fetcher,now:()=>performance.now()-start,
  getContext:()=>context,onKeyDown:e=>inputs.push(['down',e]),onKeyUp:e=>inputs.push(['up',e]),onInput:n=>notes.push(n)});
 const until=async p=>{const deadline=Date.now()+6500;while(!await p()){if(Date.now()>deadline)assert.fail('bounded latency mock timed out');await new Promise(r=>setTimeout(r,10));}};
 try{
  await until(async()=>(await h.request('/status',{method:'GET'})).body.client?.context.focused===true);
  const queued=await h.request('/command',{body:{kind:'key',code:'KeyW',durationMs:100}});assert.equal(queued.status,202);
  await until(()=>inputs.some(x=>x[0]==='down'));assert.equal(inputs[0][1].code,'KeyW');
  await until(()=>inputs.some(x=>x[0]==='up'));assert.equal(installed.status().held.length,0);
  assert.equal(notes.some(n=>n.phase==='clear'&&n.reason==='heartbeat-expired'),false);
  context.focused=false;window.dispatchEvent(new Event('blur'));assert.equal(context.focused,false);assert.equal(installed.status().held.length,0);
 }finally{installed.dispose();}
});

test('an intention expiring during the HTTP response is rejected without a down callback',async()=>{
 const h=serviceFixture(),window=new EventTarget(),document=new EventTarget();let time=0;
 document.activeElement={tagName:'CANVAS'};const inputs=[],context={runId:'stale-response',sceneId:null,focused:true,hidden:false,paused:false};
 const fetcher=async(url,options={})=>{
  h.time(time);const headers=Object.fromEntries(Object.entries(options.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const response=await h.request(String(url).replace('/__completion_control',''),{method:options.method,body:options.body||{},auth:false,headers:{referer:'http://127.0.0.1:5511/?completionPass=1&completionInput=1',...headers}});
  if(response.body.commands?.length)time+=1100; // delayed delivery, same real input owner
  return{ok:response.status>=200&&response.status<300,status:response.status,json:async()=>response.body};
 };
 const relay=installCompletionControlRelay({location:{hostname:'127.0.0.1',search:'?completionPass=1&completionInput=1'},window,document,fetch:fetcher,now:()=>time,getContext:()=>context,onKeyDown:e=>inputs.push(e)});
 const until=async p=>{const deadline=Date.now()+2000;while(!await p()){if(Date.now()>deadline)assert.fail('stale-response receipt timed out');await new Promise(r=>setTimeout(r,10));}};
 try{
  await until(async()=>(await h.request('/status',{method:'GET'})).body.client?.context.focused===true);
  const command=await h.request('/command',{body:{kind:'key',code:'KeyE'}});assert.equal(command.status,202);time=2250;
  await until(async()=>(await h.request('/status',{method:'GET'})).body.results.some(r=>r.id===command.body.id&&r.reason==='queue-expired'));
  assert.equal(inputs.length,0);assert.equal(relay.status().held.length,0);
 }finally{relay.dispose();}
});
