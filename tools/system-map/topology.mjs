const cite = (path, anchor, purpose) => ({ path, anchor, purpose });

export const FLOW_TYPES = Object.freeze({
  control: { label: 'Control', description: 'Commands, ticks, and lifecycle ownership.' },
  data: { label: 'Data', description: 'Structured state, render plans, and media payloads.' },
  event: { label: 'Event', description: 'Semantic facts broadcast between runtime systems.' },
  generation: { label: 'Generation', description: 'Authoring or source inputs compiled into runtime assets.' },
  persistence: { label: 'Persistence', description: 'State crossing an in-memory or on-disk lifetime boundary.' },
  ipc: { label: 'IPC', description: 'Browser, Tauri, sidecar, or operating-system boundary.' },
});

export const DISTRICTS = Object.freeze([
  { id: 'runtime', label: 'Runtime', description: 'The shipped browser game and its live simulation.', bounds: { x: 0, z: 0, w: 36, d: 27 } },
  { id: 'platform', label: 'Platform', description: 'Tauri, storage adapters, and the local material service.', bounds: { x: 38, z: 0, w: 20, d: 27 } },
  { id: 'content', label: 'Content pipeline', description: 'Authored content, validation, generated registries, and assets.', bounds: { x: 0, z: 30, w: 38, d: 22 } },
  { id: 'delivery', label: 'Delivery', description: 'Web and desktop bundling and release automation.', bounds: { x: 40, z: 30, w: 18, d: 22 } },
]);

export const SYSTEM_NODES = Object.freeze([
  {
    id: 'app-shell', label: 'App shell & main loop', district: 'runtime', archetype: 'station',
    grid: { x: 2, z: 2, w: 5, d: 4, h: 5 },
    summary: 'Boots the game, owns the requestAnimationFrame loop, and coordinates the major runtime systems.',
    responsibilities: ['Load storage and authored building state', 'Own the frame loop and global runtime wiring', 'Route scene, world, audio, render, and platform state'],
    evidence: [
      // Anchored on the path, not the cache-busting query: the `?v=` moves with
      // every release and took the whole system map down with it each time.
      cite('index.html', '<script type="module" src="./src/main.js?v=', 'Browser entrypoint'),
      cite('src/main.js', 'async function bootScenes(){', 'Boot orchestration'),
      cite('src/main.js', 'function loop(){', 'Frame loop'),
    ],
  },
  {
    id: 'input-control', label: 'Input & control', district: 'runtime', archetype: 'signal-tower',
    grid: { x: 10, z: 2, w: 4, d: 4, h: 8 },
    summary: 'Normalizes keyboard, pointer, and controller intent into movement, look, and action state.',
    responsibilities: ['Track held movement without browser repeat timing', 'Normalize movement and look axes', 'Feed movement-controller cadence and gameplay bindings'],
    evidence: [
      cite('src/input/input-manager.js', 'export function keyboardMotionAxes(held = new Set()) {', 'Keyboard motion axes'),
      cite('src/player/movement-controller.js', 'export function updateMovement(state, input, dt, { config = MOVEMENT_DEFAULTS, collision = null } = {}) {', 'Movement cadence'),
      cite('src/game/controller.js', 'export function controllerMotionAxes()', 'Controller axes'),
    ],
  },
  {
    id: 'scene-orchestration', label: 'Scenes & game orchestration', district: 'runtime', archetype: 'control-hall',
    grid: { x: 17, z: 2, w: 6, d: 4, h: 6 },
    summary: 'Owns the scene stack and the gameplay handoffs assembled by the main runtime.',
    responsibilities: ['Route input to modal and non-modal scenes', 'Advance gameplay systems and transitions', 'Coordinate world, UI, audio, and persistence side effects'],
    evidence: [
      cite('src/game/scenes.js', 'export function scenesInit({ applyLookProfile, applyLensPreset } = {}) {', 'Scene runtime initialization'),
      cite('src/main.js', 'const traversal=chunkSurfRuntime.tickTraversal?.(dt);', 'Special traversal orchestration'),
    ],
  },
  {
    id: 'world-floorplan', label: 'World & floorplan', district: 'runtime', archetype: 'warehouse',
    grid: { x: 2, z: 10, w: 6, d: 5, h: 4 },
    summary: 'Compiles authored spaces into one collision/render plan and manages physical embedding, doors, and props.',
    responsibilities: ['Compile authored glyphs into runtime cells', 'Keep collision and shader floorplan data in parity', 'Produce physical render plans and door state'],
    evidence: [
      cite('src/world/floorplan.js', '// The floorplan: one authored building, compiled once, read by two consumers.', 'Shared collision/render authority'),
      cite('src/world/floorplan.js', 'export function physicalRenderPlanFor(x,y){', 'Renderer payload'),
      cite('src/game/door-runtime.js', 'export function freshDoorRuntime', 'Door state machine'),
    ],
  },
  {
    id: 'source-space', label: 'Source Space', district: 'runtime', archetype: 'terraced-tower',
    grid: { x: 11, z: 10, w: 5, d: 5, h: 9 },
    summary: 'Runs the late-game text landscape, traversal, contacts, structures, checkpoints, and Source-specific rendering data.',
    responsibilities: ['Resolve Source terrain and connector traversal', 'Advance HUSH/contact and chapter state', 'Emit Source surface, scene, light, and checkpoint payloads'],
    evidence: [
      cite('src/game/source-space-runtime.js', 'export function createSourceSpaceRuntime({', 'Source runtime factory'),
      cite('src/data/source-level.js', 'export function sourceTraversal(fromX, fromY, toX, toY, fromFloor, toFloor) {', 'Lift and chute traversal contract'),
      cite('src/data/source-landing.js', 'export function sourceLandingContract() {', 'Landing composition contract'),
    ],
  },
  {
    id: 'narrative-runtime', label: 'Narrative runtime', district: 'runtime', archetype: 'theatre',
    grid: { x: 19, z: 10, w: 6, d: 5, h: 7 },
    summary: 'Adapts canonical story documents into runtime dialogue, choices, mutations, battles, and cue events.',
    responsibilities: ['Resolve authored documents by stable ID', 'Evaluate conditions and mutations', 'Emit lines, choices, cue IDs, and completion events'],
    evidence: [
      cite('src/narrative/runtime-content.js', 'export function runtimeTree(id, context = {}) {', 'Runtime document adapter'),
      cite('src/narrative/executor.js', 'export function createNarrativeExecutor(document, initialContext = {}) {', 'Pure narrative state machine'),
      cite('src/game/conversation.js', 'export function createConversation({', 'Gameplay conversation state'),
    ],
  },
  {
    id: 'audio-acoustics', label: 'Audio & acoustics', district: 'runtime', archetype: 'generator',
    grid: { x: 28, z: 2, w: 5, d: 5, h: 6 },
    summary: 'Runs authored sound, recording, exposure monitoring, and the semantic world-noise bus.',
    responsibilities: ['Render authored cues through Web Audio', 'Track recorder and monitor state', 'Broadcast semantic acoustic events independently of audible output'],
    evidence: [
      cite('src/audio/acoustic-events.js', 'export function emitAcousticEvent(input) {', 'Semantic noise bus'),
      cite('src/audio/monitor.js', 'export function monitorSnapshot(nowMs = performance.now()) {', 'Exposure snapshot'),
      cite('src/game/recordist.js', 'export function recState()', 'Recorder state'),
    ],
  },
  {
    id: 'render-stack', label: 'Renderer & pixel mesh', district: 'runtime', archetype: 'foundry',
    grid: { x: 28, z: 10, w: 6, d: 5, h: 8 },
    summary: 'Combines the ray-marched world, GLB props, Source text space, lighting, post effects, and pixel-mesh display.',
    responsibilities: ['Upload floorplan and material textures', 'Render props, lights, Source scenes, and special passes', 'Composite pixel mesh, datamosh, and final presentation'],
    evidence: [
      cite('src/render/r3d.js', 'export function r3dSetPlan(rgba, w, h, material = null, options = {}) {', 'Floorplan upload'),
      cite('src/render/r3d.js', 'export function r3dSetSourceScene(scene = {}) {', 'Source rendering payload'),
      cite('src/render/props3d.js', 'export function props3dInit(context){', 'Prop renderer'),
    ],
  },
  {
    id: 'save-progression', label: 'Save & progression', district: 'runtime', archetype: 'archive',
    grid: { x: 11, z: 19, w: 6, d: 5, h: 5 },
    summary: 'Normalizes current-night saves and cross-run profile/progression state before queuing storage writes.',
    responsibilities: ['Normalize and migrate save state', 'Commit save and profile patches', 'Reduce progression events and platform-sync queues'],
    evidence: [
      cite('src/game/save.js', 'export function saveCommit(patch = {}) {', 'Current-run commit'),
      cite('src/game/save.js', 'export function metaCommit(patch = {}) {', 'Cross-run profile commit'),
      cite('src/progression/runtime.js', "export function progressionInit({ build = 'LOCAL' } = {}) {", 'Progression initialization'),
    ],
  },
  {
    id: 'lens-client', label: 'Lens client', district: 'platform', archetype: 'relay',
    grid: { x: 40, z: 2, w: 5, d: 4, h: 9 },
    summary: 'Builds material-bank jobs, speaks the authenticated loopback protocol, and uploads returned images to the renderer.',
    responsibilities: ['Queue material bank recipes and mutation jobs', 'Send source/height/burst frames over WebSocket', 'Commit returned material images into renderer banks'],
    evidence: [
      cite('src/net/diffusion.js', 'export function surfaceDiffusionStart({', 'Material-bank client'),
      cite('src/net/material-mutation.js', 'export function mutationGeneration(profile, slot, serial) {', 'Mutation job recipe'),
      cite('src/main.js', 'window.__diffusion=surfaceDiffusionStart({', 'Renderer callback wiring'),
    ],
  },
  {
    id: 'tauri-shell', label: 'Tauri shell', district: 'platform', archetype: 'courthouse',
    grid: { x: 49, z: 2, w: 6, d: 5, h: 7 },
    summary: 'Hosts the desktop WebView, native commands, menus, windows, identity, filesystem plugins, and Lens lifecycle.',
    responsibilities: ['Register native commands and plugins', 'Own desktop menus and window behavior', 'Start and stop the local Lens service'],
    evidence: [
      cite('src-tauri/src/lib.rs', 'pub fn run() {', 'Desktop application builder'),
      cite('src-tauri/src/lib.rs', '.invoke_handler(tauri::generate_handler![', 'Frontend/native command surface'),
      cite('src-tauri/src/display_policy.rs', 'pub fn chunk_window_metrics(app: AppHandle) -> Result<WindowMetrics, String> {', 'Native display command'),
    ],
  },
  {
    id: 'lens-sidecar', label: 'Local Lens sidecar', district: 'platform', archetype: 'cooling-plant',
    grid: { x: 40, z: 11, w: 6, d: 6, h: 6 },
    summary: 'Runs the bundled Python/PyTorch material service and returns cached or generated JPEG tiles over loopback.',
    responsibilities: ['Validate bundled model resources and GPU backend', 'Authenticate WebSocket work with the launch token', 'Cache content-addressed material frames and return status/results'],
    evidence: [
      cite('src-tauri/src/lens_service.rs', 'pub struct LensBootstrap {', 'Native URL/token bootstrap response'),
      cite('tools/chunk_surfer/diffusion_server/server.py', '@app.websocket("/")', 'Loopback WebSocket service'),
      cite('tools/chunk_surfer/diffusion_server/cache_contract.py', 'def material_cache_key(*, work: dict, source_sha256: str, model_id: str,', 'Content-addressed cache key'),
    ],
  },
  {
    id: 'storage-backends', label: 'Storage backends', district: 'platform', archetype: 'vault',
    grid: { x: 49, z: 12, w: 6, d: 5, h: 5 },
    summary: 'Selects browser or desktop persistence and protects schema envelopes, backups, and causal records.',
    responsibilities: ['Use localStorage/IndexedDB in browsers', 'Use Tauri AppConfig/AppData files on desktop', 'Serialize writes and recover from invalid primaries or newer schemas'],
    evidence: [
      cite('src/platform/storage/storageService.js', 'export function createGameStorage({ kind = detectStorageBackendKind(), gameVersion = \'LOCAL\', adapter = null } = {}) {', 'Backend selection'),
      cite('src/platform/storage/browserStorage.js', 'export class BrowserStorage {', 'Browser persistence'),
      cite('src/platform/storage/desktopStorage.js', 'export class DesktopStorage {', 'Desktop persistence'),
    ],
  },
  {
    id: 'narrative-studio', label: 'Narrative Studio', district: 'content', archetype: 'studio',
    grid: { x: 2, z: 32, w: 6, d: 5, h: 6 },
    summary: 'Provides the local-first React authoring UI and a guarded file service for narrative, audio, media, and layout documents.',
    responsibilities: ['Read a revisioned project snapshot', 'Validate and atomically write allowlisted content files', 'Broadcast external file changes to the editor'],
    evidence: [
      cite('tools/narrative-studio/server.mjs', 'async function projectSnapshot() {', 'Authoring project read model'),
      cite('tools/narrative-studio/server.mjs', 'const studioApi = {', 'Guarded HTTP API'),
      cite('tools/narrative-studio/src/App.tsx', 'export function App() {', 'Studio application'),
    ],
  },
  {
    id: 'canonical-content', label: 'Canonical content', district: 'content', archetype: 'library',
    grid: { x: 11, z: 32, w: 6, d: 5, h: 5 },
    summary: 'Stores the source-of-record project manifest, story graphs, audio recipes, media slots, and editor layouts.',
    responsibilities: ['Declare runtime narrative entrypoints', 'Reference authored audio and media assets', 'Keep semantic content separate from generated runtime modules'],
    evidence: [
      cite('content/project.json', '"runtimeEntrypoints": [', 'Canonical runtime manifest'),
      cite('content/audio/audio-project.audio.json', '"cues": [', 'Authored cue registry'),
      cite('content/narrative/source-space.contact.story.json', '"id": "source-space.contact"', 'Source Space narrative document'),
    ],
  },
  {
    id: 'registry-validation', label: 'Registry & validation', district: 'content', archetype: 'compiler',
    grid: { x: 20, z: 32, w: 6, d: 5, h: 8 },
    summary: 'Validates canonical documents and generates the JavaScript registry imported by the game.',
    responsibilities: ['Validate document graph, cue, media, and asset references', 'Generate static JSON imports for Vite', 'Expose stable document/media lookup tables'],
    evidence: [
      cite('scripts/generate-content-registry.mjs', "await writeFile(resolve(ROOT, 'src/narrative/generated-content.js'), `${lines.join('\\n')}\\n`, 'utf8');", 'Generated runtime registry'),
      cite('scripts/validate-authoring.mjs', 'console.log(`Authoring content valid: ${documents.length} story documents, ${audio.assets.length} audio assets, ${audio.cues.length} cues, ${audio.triggers.length} triggers, ${mediaIds.size} media slots.`);', 'Authoring validation result'),
      cite('src/narrative/generated-content.js', 'export const authoringDocumentsById = new Map(authoringNarrative.map((document) => [document.id, document]));', 'Generated lookup table'),
    ],
  },
  {
    id: 'asset-generators', label: 'Asset generators', district: 'content', archetype: 'workshop',
    grid: { x: 29, z: 32, w: 6, d: 5, h: 6 },
    summary: 'Builds authored GLB packs, atlases, paper assets, bell stems, and other runtime-ready media.',
    responsibilities: ['Convert semantic geometry and source media into runtime packs', 'Emit stats and credits beside generated assets', 'Keep reproducible build commands in package scripts'],
    evidence: [
      cite('package.json', '"assets:source-structures": "node tools/chunk_surfer/build-source-structures.mjs",', 'Asset build command'),
      cite('tools/chunk_surfer/build-source-structures.mjs', "const OUT = path.join(ROOT, 'public/assets/source-structures.glb');", 'Source structure pack output'),
      cite('scripts/build-paper-assets.mjs', "const OUT=path.join(ROOT,'assets/paper');", 'Paper asset output root'),
    ],
  },
  {
    id: 'public-assets', label: 'Public asset bank', district: 'content', archetype: 'depot',
    grid: { x: 11, z: 43, w: 7, d: 5, h: 4 },
    summary: 'Contains shipped GLB packs, surface arrays, story art, and audio fetched by the browser renderer and sound systems.',
    responsibilities: ['Serve runtime-relative assets under Vite/Tauri', 'Provide generated geometry and atlases', 'Supply authored audio and story media'],
    evidence: [
      cite('src/render/r3d.js', "P3.loadPropPack(assetUrl('assets/conservatory-props.glb'))", 'Runtime GLB loading'),
      cite('src/manifest.js', 'export const MANIFEST = {', 'Runtime audio manifest'),
      cite('content/media/story-art.media.json', '"assets": [', 'Story-art asset registry'),
    ],
  },
  {
    id: 'audits', label: 'Audits', district: 'content', archetype: 'reading-room',
    grid: { x: 2, z: 43, w: 6, d: 5, h: 5 },
    summary: 'Read-only pages that assemble one part of the game out of its own declarations and report what is missing.',
    responsibilities: ['Read declared game data and the authored documents beside it', 'Report drift between a description and the code it describes', 'Link every authored line back to the Narrative Studio'],
    evidence: [
      cite('tools/audits/registry.mjs', 'export const AUDITS = Object.freeze([', 'The list of audits and their ports'),
      cite('tools/audits/shared.mjs', 'export function serveAudit({ audit, build, render }) {', 'Shared audit server'),
      cite('tools/audits/shared.mjs', 'export function citationReader() {', 'Description-to-source checking'),
    ],
  },
  {
    id: 'vite-package', label: 'Vite web bundle', district: 'delivery', archetype: 'dispatch',
    grid: { x: 42, z: 33, w: 6, d: 5, h: 6 },
    summary: 'Validates content, builds atlases, and emits the browser bundle used directly or embedded in Tauri.',
    responsibilities: ['Run authoring and paper validation before bundling', 'Bundle game and interference-monitor entrypoints', 'Define the shipped application version and asset base'],
    evidence: [
      // Anchored on the head of the script, not the whole chain. The full string
      // was pinned here and every step added to `build` took the system map down
      // with it — the same brittleness as the index.html cache-buster below.
      cite('package.json', '"build": "npm run studio:validate', 'Production build pipeline'),
      cite('vite.config.js', 'export default defineConfig({', 'Game Vite configuration'),
    ],
  },
  {
    id: 'desktop-release', label: 'Desktop & release', district: 'delivery', archetype: 'shipyard',
    grid: { x: 50, z: 42, w: 6, d: 6, h: 7 },
    summary: 'Bundles the web payload, native shell, offline Lens resources, and platform-specific release artifacts.',
    responsibilities: ['Build Tauri desktop bundles', 'Package the Lens sidecar and Steamworks runtime', 'Validate and publish platform artifacts through CI'],
    evidence: [
      cite('src-tauri/tauri.lens.conf.json', '"bundle": {', 'Desktop bundle resources'),
      cite('.github/workflows/release.yml', 'name: Release Desktop Builds', 'Cross-platform release workflow'),
      cite('package.json', '"tauri:build": "npm run steamworks:verify && npm run lens:verify && tauri build --config src-tauri/tauri.lens.conf.json",', 'Desktop build command'),
    ],
  },
]);

export const SYSTEM_EDGES = Object.freeze([
  { id: 'input-to-shell', from: 'input-control', to: 'app-shell', kind: 'control', label: 'Movement intent', payload: 'Held key set, moveX/moveY axes, pointer deltas, controller actions', evidence: [cite('src/main.js', 'const keyboard=keyboardMotionAxes(keysDown),controller=CONTROLLER.controllerMotionAxes();', 'Input aggregation')] },
  { id: 'shell-to-scenes', from: 'app-shell', to: 'scene-orchestration', kind: 'control', label: 'Frame and input routing', payload: 'Frame delta, key/action events, pause and overlay ownership', evidence: [cite('src/main.js', 'scenes.scenesInit({ applyLookProfile, applyLensPreset });', 'Scene system wiring')] },
  { id: 'scenes-to-world', from: 'scene-orchestration', to: 'world-floorplan', kind: 'control', label: 'Movement and interaction query', payload: 'Player coordinates, step delta, door focus, current render group', evidence: [cite('src/main.js', 'else if(R3.r3dSolid(px+dx, py+dy)) return;', 'Collision gate')] },
  { id: 'world-to-render', from: 'world-floorplan', to: 'render-stack', kind: 'data', label: 'Physical render plan', payload: 'RGBA floor/ceiling/flags/zone texture, material array, origins, ambient and render group', evidence: [cite('src/main.js', 'R3.r3dSetPlan(physicalPlan.rgba,physicalPlan.w,physicalPlan.h,physicalPlan.material,{ambient:physicalPlan.ambient,originX:physicalPlan.originX,originY:physicalPlan.originY});', 'Floorplan-to-render upload')] },
  { id: 'scenes-to-render', from: 'scene-orchestration', to: 'render-stack', kind: 'control', label: 'Presentation state', payload: 'Camera pose, look profile, props, lights, fear, UI and post-effect commands', evidence: [cite('src/main.js', 'R3.r3dSetFear(pressure.visualDread);  // vignette, grain, desaturation', 'Runtime visual pressure')] },
  { id: 'scenes-to-source', from: 'scene-orchestration', to: 'source-space', kind: 'control', label: 'Source chapter tick', payload: 'dt, player position, facing, focus and traversal requests', evidence: [cite('src/main.js', 'chunkSurfRuntime.tick(dt,{px,py,facing:R3.r3dFacing()});', 'Source tick')] },
  { id: 'source-to-render', from: 'source-space', to: 'render-stack', kind: 'data', label: 'Source scene frame', payload: 'Surface lines, corpus, static/dynamic structures, local lights, weather and look state', evidence: [cite('src/main.js', 'R3.r3dSetSourceScene(scene);', 'Source renderer handoff')] },
  { id: 'source-to-save', from: 'source-space', to: 'save-progression', kind: 'persistence', label: 'Source checkpoint', payload: 'Player position, Source phase, checkpoint, contacts, structures and traversal outcome', evidence: [cite('src/main.js', "saveCommit({px,py,chunkSurf:chunkSurfRuntime.state(),rec:REC.saveRecState(),area:'source-space'});", 'Source contact checkpoint save')] },
  { id: 'registry-to-narrative', from: 'registry-validation', to: 'narrative-runtime', kind: 'data', label: 'Runtime story registry', payload: 'NarrativeDocument map, audio project, media slots and runtime entrypoints', evidence: [cite('src/narrative/runtime-content.js', "} from './generated-content.js';", 'Generated registry import')] },
  { id: 'narrative-to-scenes', from: 'narrative-runtime', to: 'scene-orchestration', kind: 'event', label: 'Dialogue and mutations', payload: 'Visible line, choices, flags, node-enter, completion and battle profile events', evidence: [cite('src/narrative/executor.js', "events.push({ type: 'choice', nodeId, choiceId });", 'Narrative event')] },
  { id: 'narrative-to-audio', from: 'narrative-runtime', to: 'audio-acoustics', kind: 'event', label: 'Authored cue dispatch', payload: 'Stable cue IDs attached to node, line, choice and gameplay events', evidence: [cite('src/narrative/runtime-content.js', 'export function runtimeCuesForLine(documentId, line = {}) {', 'Line-to-cue lookup')] },
  { id: 'scenes-to-audio', from: 'scene-orchestration', to: 'audio-acoustics', kind: 'control', label: 'Sound and recording commands', payload: 'Cue recipes, record/playback actions, ambience, spatial position and mix state', evidence: [cite('src/main.js', 'CUES.playCue(CUES.CUE.recorder,{gain:drop ? .055+impact*.035 : .045,rate:drop ? .46-impact*.12 : .62});', 'Traversal sound command')] },
  { id: 'audio-to-scenes', from: 'audio-acoustics', to: 'scene-orchestration', kind: 'event', label: 'Semantic acoustic event', payload: 'schema, kind, source, spatial position, dB/spectrum and audibility semantics', evidence: [cite('src/audio/acoustic-events.js', 'for (const listener of [...listeners]) {', 'Noise event broadcast')] },
  { id: 'scenes-to-save', from: 'scene-orchestration', to: 'save-progression', kind: 'persistence', label: 'Run and profile patches', payload: 'Position, flags, items, takes, encounters, settings, run ledger and achievements', evidence: [cite('src/game/save.js', 'Object.assign(save, patch);', 'Save patch application')] },
  { id: 'save-to-storage', from: 'save-progression', to: 'storage-backends', kind: 'persistence', label: 'Queued envelopes', payload: 'Normalized settings, profile, autosave and causal-session envelopes', evidence: [cite('src/platform/storage/storageService.js', 'return enqueue(() => storage.saveGame(SAVE_SLOT_AUTOSAVE, save).then(() => true));', 'Serialized save write')] },
  { id: 'storage-to-save', from: 'storage-backends', to: 'save-progression', kind: 'data', label: 'Loaded state', payload: 'Migrated settings, profile and autosave with safe defaults and backup recovery', evidence: [cite('src/platform/storage/storageService.js', 'return { settings, profile, save: save ? normalizePersistedSave({ ...save, settings: save.settings || settings }, { profile, settings }) : null };', 'Normalized load result')] },
  { id: 'render-to-lens', from: 'render-stack', to: 'lens-client', kind: 'control', label: 'Visible material demand', payload: 'Visible slots, active look bank, source albedo/height and optional scene/depth burst', evidence: [cite('src/main.js', 'captureBurstFrame:async(size)=>{', 'Renderer capture callback')] },
  { id: 'lens-to-tauri', from: 'lens-client', to: 'tauri-shell', kind: 'ipc', label: 'Bootstrap command', payload: 'chunk_lens_bootstrap/retry/stop invoke with no remote endpoint fallback', evidence: [cite('src/platform/lens-service.js', "const config = await invoke(restart ? 'chunk_lens_retry' : 'chunk_lens_bootstrap');", 'Frontend/native command')] },
  { id: 'tauri-to-sidecar', from: 'tauri-shell', to: 'lens-sidecar', kind: 'ipc', label: 'Owned process lifecycle', payload: 'Random port, 256-bit token, backend, cache/log paths and bundled resource environment', evidence: [cite('src-tauri/src/lens_service.rs', '.env("LENS_TOKEN", &spec.token)', 'Authenticated child environment')] },
  { id: 'lens-to-sidecar', from: 'lens-client', to: 'lens-sidecar', kind: 'ipc', label: 'Material generation job', payload: 'Authenticated WebSocket JSON plus source JPEG, depth JPEG, prompt, seed, bank, slot and frame', evidence: [cite('src/net/diffusion.js', 'requestId: `${profile.bankId}:${slot}:${frame}:${recipeSha256.slice(0, 12)}`,', 'Material request identity')] },
  { id: 'sidecar-to-lens', from: 'lens-sidecar', to: 'lens-client', kind: 'data', label: 'Generated material result', payload: 'Status frames and cached/generated JPEG payloads keyed by request, bank, slot and frame', evidence: [cite('tools/chunk_surfer/diffusion_server/server.py', '"bankId": work.get("bankId"), "slot": work.get("slot"),', 'Result metadata')] },
  { id: 'lens-to-render', from: 'lens-client', to: 'render-stack', kind: 'data', label: 'Resident material bank', payload: 'Decoded material images, frame mix and committed bank transition', evidence: [cite('src/main.js', 'applySurface:(slot,frame,image,mix)=>R3.r3dSetSurfaceDream(slot,frame,image,mix),', 'Lens image upload')] },
  { id: 'tauri-to-storage', from: 'tauri-shell', to: 'storage-backends', kind: 'ipc', label: 'Desktop filesystem plugin', payload: 'AppConfig/AppData reads, temp writes, verified envelopes, rename and backup operations', evidence: [cite('src/platform/storage/desktopStorage.js', "const fs = await import('@tauri-apps/plugin-fs');", 'Tauri filesystem adapter')] },
  { id: 'studio-to-content', from: 'narrative-studio', to: 'canonical-content', kind: 'persistence', label: 'Revisioned authoring write', payload: 'Validated story/audio/media/layout JSON plus expected source revision', evidence: [cite('tools/narrative-studio/server.mjs', "if (req.method === 'PUT' && url.pathname === '/api/document') {", 'Authoring write endpoint')] },
  { id: 'studio-to-registry', from: 'narrative-studio', to: 'registry-validation', kind: 'data', label: 'Draft validation', payload: 'Narrative, audio, media or project document submitted to shared contracts', evidence: [cite('tools/narrative-studio/server.mjs', "if (req.method === 'POST' && url.pathname === '/api/validate') {", 'Live validation endpoint')] },
  { id: 'content-to-registry', from: 'canonical-content', to: 'registry-validation', kind: 'generation', label: 'Canonical document set', payload: 'Project manifest paths, story graphs, audio recipes, media slots and stable IDs', evidence: [cite('scripts/generate-content-registry.mjs', "const project = JSON.parse(await readFile(resolve(ROOT, 'content/project.json'), 'utf8'));", 'Registry source manifest')] },
  { id: 'generators-to-assets', from: 'asset-generators', to: 'public-assets', kind: 'generation', label: 'Generated runtime assets', payload: 'GLB packs, surface arrays, atlases, stems, stats and credits', evidence: [cite('package.json', '"assets:opening-street": "node tools/chunk_surfer/build-opening-street.mjs",', 'Generated asset command')] },
  { id: 'assets-to-render', from: 'public-assets', to: 'render-stack', kind: 'data', label: 'Visual asset fetch', payload: 'GLB buffers, textures, atlases, HUSH body and surface arrays', evidence: [cite('src/render/r3d.js', "loadTextureArray(assetUrl('assets/surfaces/surface-albedo.jpg'),{srgb:true}),", 'Surface asset load')] },
  { id: 'assets-to-audio', from: 'public-assets', to: 'audio-acoustics', kind: 'data', label: 'Audio asset fetch', payload: 'Manifest URLs, authored audio assets, cue layers and bell stems', evidence: [cite('src/audio/authored-cues.js', 'export function authoredCueUrls({ excludeCuePrefixes = [] } = {}) {', 'Authored audio URLs')] },
  { id: 'content-to-audits', from: 'canonical-content', to: 'audits', kind: 'data', label: 'Authored documents under audit', payload: 'Story graphs, line ids and the project manifest, read to count what each ending says and to find dead references', evidence: [cite('tools/audits/endings/audit.mjs', 'async function loadDocument(documentId) {', 'Authored document reader')] },
  { id: 'progression-to-audits', from: 'save-progression', to: 'audits', kind: 'data', label: 'Declared progression tables', payload: 'Achievements, calibration pins, the technique tree, ending ids and replay unlocks', evidence: [cite('tools/audits/progression/audit.mjs', 'export async function buildAudit() {', 'Progression audit assembly')] },
  { id: 'audits-to-studio', from: 'audits', to: 'narrative-studio', kind: 'control', label: 'Open this line for editing', payload: 'Document id, node and line, resolved against the running studio session at the moment the link is followed', evidence: [cite('tools/audits/shared.mjs', "if (url.pathname.startsWith('/open/')) {", 'Studio deep-link redirect')] },
  { id: 'registry-to-vite', from: 'registry-validation', to: 'vite-package', kind: 'generation', label: 'Generated JavaScript content', payload: 'Static JSON imports and lookup maps consumed by the production bundle', evidence: [cite('scripts/generate-content-registry.mjs', "lines.push('', 'export const authoringProject = project;');", 'Generated module exports')] },
  { id: 'content-to-vite', from: 'canonical-content', to: 'vite-package', kind: 'data', label: 'Validated content contract', payload: 'Project, narrative, audio, media and paper validation success', evidence: [cite('package.json', '"studio:validate": "npm run studio:registry && node scripts/validate-authoring.mjs",', 'Build validation gate')] },
  { id: 'vite-to-shell', from: 'vite-package', to: 'app-shell', kind: 'generation', label: 'Browser application bundle', payload: 'ES modules, styles, public assets and interference-monitor entrypoint', evidence: [cite('vite.config.js', "main: resolve(import.meta.dirname, 'index.html'),", 'Vite entrypoint')] },
  { id: 'vite-to-release', from: 'vite-package', to: 'desktop-release', kind: 'generation', label: 'Desktop web payload', payload: 'Compiled dist embedded in the Tauri application bundle', evidence: [cite('src-tauri/tauri.conf.json', '"frontendDist": "../dist"', 'Tauri frontend bundle')] },
  { id: 'tauri-to-release', from: 'tauri-shell', to: 'desktop-release', kind: 'generation', label: 'Native application', payload: 'Rust binary, plugins, capabilities, icons and platform bundles', evidence: [cite('.github/workflows/release.yml', 'run: npm run tauri:build -- --bundles appimage', 'Native release build')] },
  { id: 'sidecar-to-release', from: 'lens-sidecar', to: 'desktop-release', kind: 'generation', label: 'Offline Lens payload', payload: 'Packaged Python runtime, model resources, executable sidecar and notices', evidence: [cite('.github/workflows/release.yml', 'run: python tools/chunk_surfer/diffusion_server/build_bundle.py --target ${{ matrix.target }}', 'Lens bundle build')] },
]);

export const SYSTEM_TRACES = Object.freeze([
  { id: 'input-frame', label: 'Player input → rendered frame', summary: 'A movement intent crosses the frame loop, scene ownership, collision authority, and renderer.', edgeIds: ['input-to-shell', 'shell-to-scenes', 'scenes-to-world', 'world-to-render', 'scenes-to-render'] },
  { id: 'source-checkpoint', label: 'Source traversal → frame + checkpoint', summary: 'Source-specific motion branches to both visual presentation and a normalized checkpoint save.', edgeIds: ['input-to-shell', 'shell-to-scenes', 'scenes-to-source', 'source-to-render', 'source-to-save', 'save-to-storage'] },
  { id: 'story-cue', label: 'Authored story → dialogue + cues', summary: 'Canonical JSON is generated into lookup tables, adapted to runtime events, then routed to scenes and audio.', edgeIds: ['content-to-registry', 'registry-to-narrative', 'narrative-to-scenes', 'narrative-to-audio'] },
  { id: 'acoustic-event', label: 'Acoustic event → game response', summary: 'Gameplay sound facts are broadcast independently of the audible mix and return to orchestration as perception state.', edgeIds: ['scenes-to-audio', 'audio-to-scenes'] },
  { id: 'autosave', label: 'Autosave → browser or desktop', summary: 'A gameplay patch is normalized, serialized, and written through the selected storage backend.', edgeIds: ['scenes-to-save', 'save-to-storage', 'tauri-to-storage', 'storage-to-save'] },
  { id: 'lens-bank', label: 'Material request → GPU texture bank', summary: 'Rendered demand starts an authenticated native sidecar, sends local generation work, and commits returned images.', edgeIds: ['render-to-lens', 'lens-to-tauri', 'tauri-to-sidecar', 'lens-to-sidecar', 'sidecar-to-lens', 'lens-to-render'] },
  { id: 'audit-fix', label: 'Audit → studio → content', summary: 'An audit reads the authored content and the tables beside it, names what is missing, and hands the exact line back to the studio to fix.', edgeIds: ['content-to-audits', 'progression-to-audits', 'audits-to-studio', 'studio-to-content'] },
  { id: 'authoring-release', label: 'Narrative Studio → desktop package', summary: 'Revisioned content is validated, generated, bundled for the browser, and embedded with native and Lens payloads.', edgeIds: ['studio-to-content', 'studio-to-registry', 'content-to-registry', 'registry-to-vite', 'content-to-vite', 'vite-to-release', 'tauri-to-release', 'sidecar-to-release'] },
]);

export const DEFAULT_TRACE_ID = 'input-frame';
