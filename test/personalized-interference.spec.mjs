import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEphemeralIdentityCache,
  normalizeNativeIdentity,
  normalizePersonalInterferenceSettings,
  safeInterferenceSettingsForStorage,
  sanitizeInterferenceDevice,
  sanitizeInterferenceName,
  requestIdentitySnapshot,
} from '../src/game/personalized-interference.js';
import { obscuredNameShape } from '../src/narrative/obscured-name.js';
import {
  appendInterferenceRevision,
  createInterferenceRecord,
  finalizeInterferenceRecord,
  interferenceHtml,
  interferenceManifest,
  maskIdentitySnapshot,
  normalizeInterferenceRecord,
} from '../src/game/interference-case.js';
import { createBattleInterferenceDirector, interferenceStageForBattle } from '../src/game/interference-director.js';
import { buildInterferenceWav } from '../src/platform/interference-artifacts.js';
import {
  createPersonalizedWindowEffects,
  substantiallyOnscreenPosition,
} from '../src/platform/personalized-window-effects.js';
import { titleCompositionPlan, windowMediaContentId } from '../src/platform/window-composition.js';
import { normalizeSettings } from '../src/progression/schema.js';

assert.equal(sanitizeInterferenceName('Sebastian'), 'Sebastian');
assert.equal(sanitizeInterferenceName('  Seb\tSuarez  '), 'Seb Suarez');
assert.equal(sanitizeInterferenceName('seb@example.com'), null);
assert.equal(sanitizeInterferenceName('/Users/seb'), null);
assert.equal(sanitizeInterferenceName('a'), null);
assert.equal(sanitizeInterferenceName('________________________________'), null);
assert.equal(sanitizeInterferenceName('safe\u202Etxt.exe'), 'safe txt.exe', 'bidi overrides are stripped');
assert.equal([...sanitizeInterferenceName('😀'.repeat(40))].length, 32, 'long emoji is cut at whole graphemes');
assert.equal(sanitizeInterferenceDevice('Scarlett 2i2 USB / 1'), null, 'path-like device labels are rejected');

const nativeCandidates = {
  names: [
    { source: 'steam', display: 'Steam Persona' },
    { source: 'os', display: 'deck' },
  ],
  hostname: 'Deck Host',
};
assert.deepEqual(normalizeNativeIdentity(nativeCandidates, normalizePersonalInterferenceSettings({
  enabled: true, sourceSteam: true, sourceOs: true, sourceHost: true, sourceMic: true,
}), { micLabel: 'Scarlett USB', micPermission: true }), {
  schema: 1,
  persona: { source: 'steam', value: 'Steam Persona' },
  hostname: { source: 'host', value: 'Deck Host' },
  mic: { source: 'mic', value: 'Scarlett USB' },
}, 'Steam persona wins when both persona sources are available');
assert.deepEqual(normalizeNativeIdentity({
  ...nativeCandidates,
  names: [{ source: 'steam', display: '' }, { source: 'os', display: 'deck' }],
}, normalizePersonalInterferenceSettings({
  enabled: true, sourceSteam: true, sourceOs: true, sourceHost: false, sourceMic: true,
}), { micLabel: 'Scarlett USB', micPermission: false }), {
  schema: 1,
  persona: { source: 'os', value: 'deck' },
  hostname: null,
  mic: null,
}, 'blank Steam persona uses the separately enabled OS fallback and never obtains a mic label without prior permission');
assert.equal(normalizeNativeIdentity({ names: [{ source: 'os', display: 'deck' }] }, normalizePersonalInterferenceSettings({
  enabled: true, sourceSteam: true, sourceOs: false,
})).persona, null, 'direct-launch failure stays unresolved when OS fallback is off');

const normalized = normalizeSettings({
  personalInterference: {
    enabled: true,
    sourceSteam: false,
    sourceOs: true,
    sourceHost: false,
    sourceMic: true,
    vfdText: true,
    localSpeech: true,
    intensity: 'hostile',
    display: 'SHOULD_NOT_SURVIVE',
    username: 'SHOULD_NOT_SURVIVE',
  },
});
assert.deepEqual(normalized.personalInterference, {
  enabled: true,
  sourceSteam: false,
  sourceOs: true,
  sourceHost: false,
  sourceMic: true,
  vfdText: true,
  localSpeech: false,
  intensity: 'hostile',
});
assert.equal(JSON.stringify(normalized).includes('SHOULD_NOT_SURVIVE'), false);

const safeStored = safeInterferenceSettingsForStorage({
  personalInterference: { enabled: true, intensity: 'bad', sourceOs: false },
});
assert.deepEqual(safeStored, {
  enabled: true,
  sourceSteam: true,
  sourceOs: false,
  sourceHost: true,
  sourceMic: true,
  vfdText: true,
  localSpeech: false,
  intensity: 'standard',
});

const rawSnapshot = {
  schema: 1,
  persona: { source: 'steam', value: 'Sebastian Secret' },
  hostname: { source: 'host', value: 'Secret-Machine' },
  mic: { source: 'mic', value: 'Secret Microphone' },
};
const masked = await maskIdentitySnapshot(rawSnapshot, new Uint8Array(32).fill(7));
assert.match(masked.caseId, /^FIELD-[0-9A-F]{8}$/);
assert.match(masked.tokens.persona.token, /^OPERATOR [0-9A-F]{4}$/);
assert.match(masked.tokens.hostname.token, /^HOST [0-9A-F]{4}$/);
assert.match(masked.tokens.mic.token, /^INPUT [0-9A-F]{4}$/);
assert.equal(JSON.stringify(masked).includes('Secret'), false);

let record = createInterferenceRecord(masked);
record = appendInterferenceRevision(record, {
  battleId: 'recording-2', stage: 'recognition', result: 'win', roomId: 'the_tub',
  choiceIds: ['conservatory:guard.radio.choice.1'], actionIds: ['monitor'], windowEvents: ['title:operator-resolved'],
  annotation: 'AUDIOCORP: OPERATOR PATH RESOLVED.',
  responseClassification: 'VIGILANCE',
});
record = finalizeInterferenceRecord(record, 'inversion');
assert.equal(record.classification, 'INVERSION');
assert.equal(record.status, 'filed');
assert.equal(record.responseClassification, 'VIGILANCE');
assert.match(interferenceManifest(record), /RESPONSE CLASSIFICATION VIGILANCE/);
assert.match(interferenceManifest(record), /ARCHITECTURAL EVENT HISTORY/);
assert.equal(normalizeInterferenceRecord({ ...record, caseId: '../Secret' }).caseId, null);
for (const output of [JSON.stringify(record), interferenceManifest(record), interferenceHtml(record)]) {
  assert.equal(output.includes('Sebastian Secret'), false);
  assert.equal(output.includes('Secret-Machine'), false);
  assert.equal(output.includes('Secret Microphone'), false);
}
// THE OBSCURED NAME AT THE GATE TAKES ITS SHAPE FROM THE TOKEN, NEVER THE NAME.
//
// The shape is dimensioned by who you are only when you have said it may be.
// The same fixture that must not survive into a filed case must not survive into
// the thing drawn on screen either — and with consent withheld there is no token
// to derive from at all, so the run seed is the whole input.
const consented = obscuredNameShape({ runSeed: 3, token: masked.tokens.persona.token });
const withheld = obscuredNameShape({ runSeed: 3 });
assert.match(consented.cells, /^[░▏▯▓▮█ ]+$/u, 'the shape is blocks, whatever it was derived from');
assert.notEqual(consented.cells, withheld.cells, 'consent has to change the shape or it is theatre');
for (const secret of ['Sebastian Secret', 'Secret-Machine', 'Secret Microphone', 'Secret', masked.tokens.persona.token]) {
  assert.equal(consented.cells.includes(secret), false, `${secret} reached the screen`);
}
// requestIdentitySnapshot refuses before consent, which is what makes the above
// unreachable rather than merely unused.
const denied = await requestIdentitySnapshot(normalizePersonalInterferenceSettings({ enabled: false }));
assert.equal(denied.persona, null);
assert.equal(denied.hostname, null);
assert.equal(denied.mic, null);

// The omnibus itself: an explicit profile on/off choice with complete identity,
// microphone, window, artifact, and local-only boundaries.
const warningSource = readFileSync(new URL('../src/game/warning.js', import.meta.url), 'utf8');
assert.match(warningSource, /askProfile/, 'the durable omnibus is gated, not shown after consent');
assert.match(warningSource, /onProfileOn/);
assert.match(warningSource, /THIS GAME MEASURES YOU PSYCHOLOGICALLY/);
assert.match(warningSource, /Steam display name only—never Steam ID, friends, or account enumeration/);
assert.match(warningSource, /four combat panes or up to eight silent media panes/);
assert.match(warningSource, /move the main frame/);
assert.match(warningSource, /Double-Escape or Settings restores/);
assert.match(warningSource, /They never show personal data/);
assert.match(warningSource, /PROFILE OFF requests nothing/);
const mainSourceForConsent = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(mainSourceForConsent, /consentVersion!==PSYCH_PROFILE_CONSENT_VERSION/);

const wav = buildInterferenceWav(record, { sampleRate: 8000, seconds: 1 });
assert.equal(new TextDecoder().decode(wav.slice(0, 4)), 'RIFF');
assert.equal(wav.byteLength, 44 + 8000 * 2);

const endings = {
  sacrifice: 'CONTAINMENT',
  helped: 'INTERVENTION',
  inversion: 'INVERSION',
  drugged: 'CONTAMINATION',
  surfaced: 'EXTRACTION',
};
for (const [endingId, classification] of Object.entries(endings)) {
  const finalized = finalizeInterferenceRecord(createInterferenceRecord(masked), endingId);
  assert.equal(finalized.classification, classification);
  assert.match(interferenceManifest(finalized), new RegExp(`CLASSIFICATION ${classification}`));
}
const inversionArtifact = finalizeInterferenceRecord(record, 'inversion');
const helpedArtifact = finalizeInterferenceRecord(record, 'helped');
assert.ok(
  interferenceManifest(inversionArtifact).indexOf('ending:inversion')
    < interferenceManifest(inversionArtifact).indexOf('recording-2'),
  'inversion files its revision trace in reverse order',
);
const inverseWav = buildInterferenceWav(inversionArtifact, { sampleRate: 8000, seconds: 1 });
const forwardWav = buildInterferenceWav(helpedArtifact, { sampleRate: 8000, seconds: 1 });
assert.equal(
  new DataView(inverseWav.buffer, inverseWav.byteOffset).getInt16(44, true),
  new DataView(forwardWav.buffer, forwardWav.byteOffset).getInt16(forwardWav.byteLength - 2, true),
  'inversion reverses the evidence signal chronology',
);

assert.equal(interferenceStageForBattle('training'), null);
assert.equal(interferenceStageForBattle('practice-room-hush'), 'foreshadow');
assert.equal(interferenceStageForBattle('recording-2'), 'recognition');
assert.equal(interferenceStageForBattle('pre-recording-4'), 'control');
assert.equal(interferenceStageForBattle('natatorium'), 'recognition');
assert.equal(interferenceStageForBattle('hall'), 'control');
assert.equal(interferenceStageForBattle('practice'), 'control');
assert.equal(interferenceStageForBattle('chapel'), 'handoff');
assert.equal(interferenceStageForBattle('other', 'source-final'), 'handoff');

const disabledDirector=createBattleInterferenceDirector({
  identityCache:createEphemeralIdentityCache({provider:async()=>{throw new Error('disabled identity must not be requested');}}),
  getSettings:()=>normalizePersonalInterferenceSettings({enabled:false}),
});
assert.equal(await disabledDirector.primePersona({roomId:'booth'}),null,
  'profile-off booth speech receives no literal persona and uses the obscured fallback');

const identityCache = createEphemeralIdentityCache({ provider: async () => rawSnapshot });
const effectsLog = [];
const artifacts = [];
let persisted = null;
const director = createBattleInterferenceDirector({
  identityCache,
  loadKey: async () => new Uint8Array(32).fill(9),
  effects: {
    begin: async (value) => effectsLog.push(['begin', value.intensity]),
    apply: async (kind, value) => effectsLog.push(['apply', kind, value.title]),
    reject: async () => effectsLog.push(['reject']),
    end: async () => effectsLog.push(['end']),
    statusLine: () => 'HOLD ESC',
  },
  writeArtifact: async (value) => { artifacts.push(JSON.stringify(value)); return { ok: true }; },
  getSettings: () => normalizePersonalInterferenceSettings({ enabled: true, intensity: 'hostile' }),
  getContext: () => ({ roomId: 'the_tub', choiceIds: ['choice:guard'], micPermission: true, micLabel: 'Secret Microphone' }),
  onRecord: (value) => { persisted = value; },
});
assert.match(await director.primeIdentity({ roomId: 'booth' }), /^OPERATOR [0-9A-F]{4}$/,
  'the existing masked-token priming contract is unchanged');
assert.equal(await director.primePersona({ roomId: 'booth' }), 'Sebastian Secret',
  'the opted-in sanitized persona is available to local booth synthesis');
const hook = director.forBattle('recording-2', 'natatorium');
await hook.enter();
await hook.phaseBreak();
assert.match(hook.line().text, /Sebastian Secret/);
hook.action('monitor');
await hook.finish('win', { toolsUsed: { recorder: 1 }, perfectCounters: 1 });
assert.ok(persisted?.caseId);
assert.equal(JSON.stringify(persisted).includes('Secret'), false);
assert.equal(artifacts.some((value) => value.includes('Secret')), false);
assert.ok(effectsLog.some((entry) => entry[0] === 'apply' && entry[1] === 'broadcast'));
assert.deepEqual(director.debug().identity.sources, { persona: 'steam', hostname: true, mic: true });

const control = director.forBattle('pre-recording-4', 'hall');
await control.enter();
await control.impact({ kind: 'overload', received: 2 });
await control.impact({ kind: 'loop', perfect: true });
await control.finish('lose', { missedCounters: 1 });
assert.ok(effectsLog.some((entry) => entry[0] === 'apply' && entry[1] === 'overload'));
assert.ok(effectsLog.some((entry) => entry[0] === 'reject'));

await director.finalizeEnding('surfaced');
assert.equal(director.currentRecord().classification, 'EXTRACTION');
assert.equal(JSON.stringify(director.currentRecord()).includes('Secret'), false);

assert.deepEqual(substantiallyOnscreenPosition({
  position: { x: -1800, y: 40 },
  size: { width: 1000, height: 700 },
  monitor: { position: { x: -1920, y: 0 }, size: { width: 1920, height: 1080 } },
  dx: -500,
  dy: -500,
}), { x: -2120, y: -140 }, 'negative-origin secondary monitors retain at least eighty percent of the game window');

const windowState = {
  title: 'Chunk Surfer', position: { x: 120, y: 80 }, size: { width: 1280, height: 800 },
  fullscreen: true, minimized: true, alwaysOnTop: false, focused: false, visible: true,
};
const windowHistory = [];
const fakeMain = {
  async title() { return windowState.title; },
  async outerPosition() { return { ...windowState.position }; },
  async outerSize() { return { ...windowState.size }; },
  async isFullscreen() { return windowState.fullscreen; },
  async isMinimized() { return windowState.minimized; },
  async isAlwaysOnTop() { return windowState.alwaysOnTop; },
  async isFocused() { return windowState.focused; },
  async currentMonitor() { return { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } }; },
  async show() { windowState.visible = true; },
  async hide() { windowState.visible = false; },
  async minimize() { windowState.minimized = true; },
  async unminimize() { windowState.minimized = false; },
  async setFullscreen(value) { windowState.fullscreen = value; },
  async setAlwaysOnTop(value) { windowState.alwaysOnTop = value; },
  async setSize(value) { windowState.size = { width: value.width, height: value.height }; windowHistory.push(['size', { ...windowState.size }]); },
  async setPosition(value) { windowState.position = { x: value.x, y: value.y }; windowHistory.push(['position', { ...windowState.position }]); },
  async setTitle(value) { windowState.title = value; },
  async requestUserAttention() { windowHistory.push(['attention']); },
};
class PhysicalSize { constructor(width, height) { this.width = width; this.height = height; } }
class PhysicalPosition { constructor(x, y) { this.x = x; this.y = y; } }
let emergencyCount = 0;
const windowEffects = createPersonalizedWindowEffects({
  runtimeApi: { PhysicalSize, PhysicalPosition },
  mainWindow: fakeMain,
  sleep: async () => {},
  onEmergency: () => { emergencyCount += 1; },
});
const windowToken = await windowEffects.begin({ intensity: 'hostile', reducedMotion: false });
await windowEffects.apply('overload', { title: 'AUDIOCORP / OVERLOAD', inputLocked: true, token: windowToken });
assert.deepEqual(windowState, {
  title: 'Chunk Surfer', position: { x: 120, y: 80 }, size: { width: 1280, height: 800 },
  fullscreen: true, minimized: true, alwaysOnTop: false, focused: false, visible: true,
}, 'fireball presentation never mutates title, bounds, fullscreen, minimized, focus, or topmost state');
assert.equal(windowHistory.length,0,'fireball presentation never requests attention or focus');
await windowEffects.emergencyRestore();
assert.equal(emergencyCount, 1);

const identityRust = readFileSync(new URL('../src-tauri/src/identity.rs', import.meta.url), 'utf8');
assert.match(identityRust, /SteamAPI_ISteamFriends_GetPersonaName/);
assert.doesNotMatch(identityRust, /GetSteamID|GetFriend|Enumerate|PersonaState/);
const tauriBundle = readFileSync(new URL('../src-tauri/tauri.lens.conf.json', import.meta.url), 'utf8');
assert.match(tauriBundle, /steamworks-runtime\/.*steamworks\//s);
const gitignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');
assert.match(gitignore, /^steam_appid\.txt$/m);
const directorSource = readFileSync(new URL('../src/game/interference-director.js', import.meta.url), 'utf8');
assert.doesNotMatch(directorSource, /SPEECH|speech|console\.|analytics|telemetry/);
const sidecarSource = readFileSync(new URL('../src/fireball-cast.js', import.meta.url), 'utf8');
assert.doesNotMatch(sidecarSource, /persona|hostname|micLabel|OPERATOR/,
  'fireball surfaces have no identity or generic operator-telemetry surface');
const settingsSource = readFileSync(new URL('../src/game/settings.js', import.meta.url), 'utf8');
assert.match(settingsSource, /AUTHORED FRAME MOTION · FOUR GAME-OWNED PANES/);
assert.match(settingsSource, /PREVIEW FIREBALL CAST/);
const nativeWindowSource = readFileSync(new URL('../src-tauri/src/window_choreography.rs', import.meta.url), 'utf8');
assert.match(nativeWindowSource, /recover_stale_snapshot/);
assert.match(nativeWindowSource, /chunk_window_choreography_begin/);
assert.match(nativeWindowSource, /restore_transaction/);
assert.match(nativeWindowSource, /set_simple_fullscreen\(true\)/,
  'a transaction restores the exact prior Game Mode choice');
assert.match(nativeWindowSource, /pub fn chunk_fireball_cast_focus_main[\s\S]{0,180}main\.set_focus\(\)/,
  'a clicked cast surface returns keyboard focus to the game and nothing else');
assert.ok((nativeWindowSource.match(/\.set_focus\(\)/g)?.length||0)>=2,
  'focus returns after both a pane click and a full transaction restore');

const mediaListeners=new Map(),mediaWindows=new Map(),mediaAssignments=[],mediaPlacements=[];
const fireMediaEvent=(name,payload)=>{for(const listener of mediaListeners.get(name)||[])listener({payload});};
class FakeWebviewWindow{
  constructor(label){this.label=label;this.visible=false;mediaWindows.set(label,this);}
  static async getByLabel(label){return mediaWindows.get(label)||null;}
  once(name,callback){if(name==='tauri://created')queueMicrotask(()=>callback({payload:null}));return Promise.resolve(()=>{});}
  async hide(){this.visible=false;}async show(){this.visible=true;}async close(){mediaWindows.delete(this.label);}
}
const routedMediaApi={
  WebviewWindow:FakeWebviewWindow,
  listen:async(name,callback)=>{const entries=mediaListeners.get(name)||[];entries.push(callback);mediaListeners.set(name,entries);return()=>{};},
  emitTo:async(label,event,payload)=>{
    if(event==='window-media-probe')queueMicrotask(()=>fireMediaEvent('window-media-ready',{protocol:2,label}));
    if(event==='window-media-score'){
      mediaAssignments.push([label,payload]);
      queueMicrotask(()=>fireMediaEvent('window-media-accepted',{
        protocol:2,label,targetLabel:payload.targetLabel,sessionToken:payload.sessionToken,revision:payload.revision,
        cueId:payload.cueId,paneId:payload.paneId,contentId:windowMediaContentId(payload.score.initial),
      }));
    }
  },
  invoke:async(command,{request}={})=>command==='chunk_window_media_place'
    ?(mediaPlacements.push(request),{shown:true,origin:{x:request.x*1000,y:request.y*700},center:{x:request.x*1000,y:request.y*700},width:request.width,height:request.height,monitor:'main'})
    :true,
};
const routedEffects=createPersonalizedWindowEffects({runtimeApi:routedMediaApi,documentApi:null,tokenFactory:()=> 'media-session-test',wait:async()=>{}});
const routedToken=routedEffects.begin({intensity:'standard'});
const routedPlan=titleCompositionPlan({endingId:'contact-won',epochMs:1000});
assert.equal(await routedEffects.showComposition(routedPlan,{token:routedToken}),true,'all acknowledged panes present natively as one composition');
assert.deepEqual(mediaAssignments.map(([label])=>label),['window-media-1','window-media-2','window-media-3','window-media-4']);
assert.equal(new Set(mediaAssignments.map(([,payload])=>windowMediaContentId(payload.score.initial))).size,4,
  'targeted envelopes deliver four distinct initial tracks instead of retaining one shared payload');
assert.ok(mediaAssignments.every(([label,payload])=>label===payload.targetLabel));
assert.ok(mediaPlacements.every((request)=>request.interactive===false),
  'passive title panes remain non-focusable throughout entry and authored movement');
await routedEffects.emergencyRestore({notify:false});

console.log('personalized interference contracts passed');
