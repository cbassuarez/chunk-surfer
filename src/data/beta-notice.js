export const BETA_NOTICE_CATEGORIES = Object.freeze([
  'critical',
  'gameplay',
  'visual',
  'audio',
  'controls',
  'save',
  'platform',
]);

export const BETA_NOTICE_CATEGORY_LABEL = Object.freeze({
  critical: 'CRITICAL',
  gameplay: 'GAMEPLAY',
  visual: 'VISUAL',
  audio: 'AUDIO',
  controls: 'CONTROLS',
  save: 'SAVE',
  platform: 'PLATFORM',
});

export const BETA_NOTICE_STATUS_LABEL = Object.freeze({
  known: 'KNOWN',
  investigating: 'INVESTIGATING',
  'fixed-next': 'FIXED NEXT BUILD',
  intentional: 'INTENTIONAL',
  watching: 'WATCHING',
});

export const BETA_NOTICE_SEVERITY_LABEL = Object.freeze({
  blocker: 'BLOCKS PROGRESS',
  major: 'MAJOR',
  annoying: 'ANNOYING',
  cosmetic: 'COSMETIC',
  platform: 'PLATFORM-ONLY',
  note: 'NOTE',
});

export const BETA_NOTICE_CONTENT = Object.freeze({
  revision: 1,
  updatedAt: '2026-07-25',

  knownIssues: [
                {
                    id: 'controls-camera-focus-errors',
                    title: 'Camera mouse/trackpad controls can drop',
                    category: 'controls',
                    severity: 'minor',
                    status: 'investigating',
                    summary: 'Sometimes, on some actions, camera/mouse can drop, resulting in an inability to control the camera momentarily.',
                    workaround: 'Simply unfocus and focus the app by clicking on the game, then multitasking to and from another appliication.',
                    reportIf: 'Report if this happens and you are not able to get the camera to unlock/refocus after repeated attempts.',
                  },
                {
                    id: 'controls-camera-small-window',
                    title: 'Non-fullscreened windows suffer worse camera controls',
                    category: 'controls',
                    severity: 'major',
                    status: 'investigating',
                    summary: 'On non-fullscreened windows, the camera control is shifted upwards indefinitely.',
                    workaround: 'Please fullscreen the game until this is fixed. Apologies.',
                    reportIf: 'Report if this happens and you are not able to get the camera to work in fullscreen mode.',
                  },
                {
                    id: 'source-space-is-tiny',
                    title: 'Some parts of the game are not fully fleshed out',
                    category: 'gameplay',
                    severity: 'major',
                    status: 'investigating',
                    summary: 'Some late game events are not finished.',
                    workaround: 'No workaround here :(',
                    reportIf: 'Report if there is a part that is completely blocking you.',
                  },
                {
                    id: 'endings are stubs',
                    title: 'Endings are pretty bare',
                    category: 'gameplay',
                    severity: 'minor',
                    status: 'investigating',
                    summary: 'Most endings are pretty short.',
                    workaround: "Don't worry, they wont be for long!",
                    reportIf: 'N/A',
                  },
                {
                    id: 'dialog-fixes',
                    title: 'Dialog is mostly pretty lazy',
                    category: 'audio',
                    severity: 'minor',
                    status: 'investigating',
                    summary: 'A good 35% of dialog is underdeveloped.',
                    workaround: 'Do not get too attached to the dialog you hear.',
                    reportIf: 'N/A',
                  },
                {
                    id: 'ghost-doors',
                    title: 'Ghost thresholds around stairwells',
                    category: 'audio',
                    severity: 'minor',
                    status: 'investigating',
                    summary: 'Stairwells have flashing thresholds when you get too close to them. This one has stumped me.',
                    workaround: 'N/A',
                    reportIf: 'N/A',
                  },
                {
                    id: 'trick-stairs-flashing',
                    title: 'Trick stairwell has similar flashing issues',
                    category: 'audio',
                    severity: 'minor',
                    status: 'investigating',
                    summary: 'The trick stairwell also flashing thresholds when you get too close to them. This one has stumped me.',
                    workaround: 'N/A',
                    reportIf: 'N/A',
                  },
                ],

  expectedBehavior: [
    {
      id: 'expected-interference',
      title: 'Interference may interrupt a take',
      category: 'gameplay',
      severity: 'note',
      status: 'intentional',
      summary: 'Some signal loss, take spoilage, and hostile contact events are authored behaviours rather than stability failures.',
      workaround: 'Continue unless the game stops accepting input or progression becomes impossible.',
      reportIf: 'Report if the interruption soft-locks the room, persists after restart, or prevents a new run.',
    },
    {
      id: 'expected-distortion',
      title: 'Audio and display distortion can be deliberate',
      category: 'visual',
      severity: 'note',
      status: 'intentional',
      summary: 'Visual contamination, display flicker, noise, and rough audio transitions can be part of the scene language.',
      workaround: 'Use this notice as the practical boundary: report only when distortion hides essential UI or damages playback/output.',
      reportIf: 'Report if text becomes unreadable, audio clips painfully, or the issue survives a restart on the same build.',
    },
  ],

  reportingGuide: {
    title: 'USEFUL FIELD REPORTS',
    summary: 'A short reproducible report is more useful than a long theory. Copy the template, then add the room, action, and result.',
    rows: [
      { id: 'what', label: 'WHAT HAPPENED', detail: 'Describe the visible or audible failure in one or two sentences.' },
      { id: 'where', label: 'WHERE', detail: 'Name the room, menu, encounter, or screen where it happened.' },
      { id: 'repro', label: 'REPRODUCTION', detail: 'Say whether it happened once, every time, or only after a restart/continue.' },
      { id: 'platform', label: 'PLATFORM', detail: 'Include OS, desktop/web build, renderer mode, and whether a controller was connected.' },
      { id: 'evidence', label: 'EVIDENCE', detail: 'Attach a screenshot, short clip, save backup, or copied diagnostic report when available.' },
    ],
  },
});
