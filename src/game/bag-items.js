// Pure field-case item contract.
//
// The world owns acquisition and effects. The case owns only presentation and
// intent: which truthful verb is available, whether it closes before dispatch,
// and which objects the world may apply automatically at a matching target.

export const BAG_ACTION_MODE = Object.freeze({
  COMMAND: 'command',
  DIALOG: 'dialog',
  OPEN: 'open',
  CONSUME: 'consume',
});

export const BAG_AUTOMATIC_USE = Object.freeze({
  keyring: Object.freeze({ targets: ['locked-door'], role: 'keys', priority: 100 }),
  'plant-spanner': Object.freeze({ targets: ['plant-header-valve'], role: 'tool', priority: 100 }),
  'marble-eyes': Object.freeze({ targets: ['academic-bust'], role: 'puzzle-piece', priority: 100 }),
});

export const BAG_ITEM_REGISTRY = Object.freeze({
  light: Object.freeze({ role: 'exploration-command', automaticUse: null }),
  recorder: Object.freeze({ role: 'exploration-command', automaticUse: null }),
  map: Object.freeze({ role: 'navigation', automaticUse: null }),
  radio: Object.freeze({ role: 'communications', automaticUse: null }),
  interface: Object.freeze({ role: 'combat-gear', automaticUse: null }),
  'tuning-fork': Object.freeze({ role: 'combat-gear', automaticUse: null }),
  coffee: Object.freeze({ role: 'consumable', automaticUse: null }),
  // Sheet music. The only thing in the case there is more than one of, and the
  // only one you spend on yourself. Reading a bar of somebody's handwriting is
  // the one thing in this building that reliably settles him.
  'sheet-music': Object.freeze({ role: 'consumable', automaticUse: null }),
  'plant-spanner': Object.freeze({ role: 'puzzle-tool', automaticUse: BAG_AUTOMATIC_USE['plant-spanner'] }),
  'marble-eyes': Object.freeze({ role: 'puzzle-piece', automaticUse: BAG_AUTOMATIC_USE['marble-eyes'] }),
  keyring: Object.freeze({ role: 'access', automaticUse: BAG_AUTOMATIC_USE.keyring }),
});

// The complete acquisition audit. Patterns are deliberate where the game owns
// a bounded family (fifteen room pages and the in-place Source sheets).
export const COLLECTED_ITEM_AUDIT = Object.freeze([
  { id: 'light', acquired: 'bag.taken', destination: 'kit' },
  { id: 'recorder', acquired: 'bag.taken', destination: 'kit' },
  { id: 'map', acquired: 'bag.taken', destination: 'kit' },
  { id: 'radio', acquired: 'bag.taken', destination: 'kit' },
  { id: 'work-order', acquired: 'bag.taken', destination: 'file' },
  { id: 'master-key', acquired: 'prologueDone', destination: 'keyring' },
  { id: 'interface', acquired: 'has.interface', destination: 'kit' },
  { id: 'tuning-fork', acquired: 'has.fork', destination: 'kit' },
  { id: 'coffee', acquired: 'has.coffee', destination: 'kit' },
  { id: 'sheet-music', acquired: 'pickup', destination: 'kit' },
  { id: 'plant-spanner', acquired: 'plant.spannerOwned', destination: 'kit' },
  { id: 'marble-eyes', acquired: 'marbleHead.carrying', destination: 'kit' },
  { id: 'chapel-key', acquired: 'chapel_key', destination: 'keyring' },
  { id: 'services-core-key', acquired: 'services_core_key', destination: 'keyring' },
  { id: 'building-pages:1-15', acquired: 'obj.read', destination: 'file' },
  { id: 'battery-cells', acquired: 'pickup', destination: 'battery-resource' },
  { id: 'calibration-pins', acquired: 'pickup', destination: 'skill-resource' },
  { id: 'plant-stillson', acquired: 'grip', destination: 'external-load' },
  { id: 'source-sheets', acquired: 'read-in-place', destination: 'transient-source-document' },
]);

const STARTER_CASE_ITEMS = Object.freeze(['light', 'recorder', 'map', 'radio']);

export function resolveBagOwnership(context = {}) {
  const caseOwned = !!context.bagTaken;
  if (!caseOwned) return { caseOwned: false, kit: [], filesAvailable: false, keyring: null };

  const kit = [...STARTER_CASE_ITEMS];
  if (context.interfaceOwned) kit.push('interface');
  if (context.forkOwned) kit.push('tuning-fork');
  if (context.spannerOwned) kit.push('plant-spanner');
  if (context.marbleCarried) kit.push('marble-eyes');
  if (context.coffeeOwned && !context.coffeeConsumed) kit.push('coffee');
  // The only stacked item in the case. It leaves the kit when the last one is
  // read, the way the cup does when it is empty.
  if (Number(context.sheetsCarried) > 0) kit.push('sheet-music');

  const keyring = {
    master: !!context.masterKey,
    chapel: !!context.chapelKey,
    chapelIdentified: !!context.chapelKey && !!context.chapelIdentified,
    services: !!context.servicesKey,
  };
  keyring.visible = keyring.master || keyring.chapel || keyring.services;

  return { caseOwned: true, kit, filesAvailable: true, keyring: keyring.visible ? keyring : null };
}

const ACTIONABLE_ITEMS = new Set(Object.keys(BAG_ITEM_REGISTRY));

function action(id, label, mode, {
  enabled = true,
  reason = '',
  confirm = null,
  closeBefore = false,
} = {}) {
  return { id, label, mode, enabled: !!enabled, reason, confirm, closeBefore: !!closeBefore };
}

export function resolveBagItemAction(itemId, context = {}) {
  const id = String(itemId || '');
  const carried = context.present !== false && !context.missing;

  if (!ACTIONABLE_ITEMS.has(id)) {
    return action('none', '', BAG_ACTION_MODE.DIALOG, {
      enabled: false,
      reason: 'NO DIRECT ACTION',
    });
  }

  if (id === 'radio' && context.dropped && !context.missing) {
    return action('radio-show-map', 'SHOW ON MAP', BAG_ACTION_MODE.OPEN);
  }

  if (!carried) {
    return action('missing', '', BAG_ACTION_MODE.DIALOG, {
      enabled: false,
      reason: 'ITEM NOT CARRIED',
    });
  }

  switch (id) {
    case 'light':
      return action('light-toggle', context.lightOn ? 'TURN OFF' : 'TURN ON', BAG_ACTION_MODE.COMMAND, { closeBefore: true });
    case 'recorder':
      return action('recorder-command', context.listening ? 'ROLL' : 'MONITOR', BAG_ACTION_MODE.COMMAND, { closeBefore: true });
    case 'map':
      return action('map-open', 'OPEN MAP', BAG_ACTION_MODE.OPEN);
    case 'radio': {
      const unavailable = context.radioDead
        ? 'NO CARRIER'
        : context.radioUnavailableReason
          ? String(context.radioUnavailableReason)
        : context.recording
          ? 'NOT WHILE RECORDING'
          : context.listening
            ? 'RECORDER CHANNEL OPEN'
            : context.inCombat
              ? 'NOT WHILE IT IS LOOKING AT YOU'
              : context.radioChannelOccupied
                ? 'CHANNEL OCCUPIED'
                : '';
      return action('radio-call', 'CALL FRONT DESK', BAG_ACTION_MODE.DIALOG, {
        enabled: !unavailable,
        reason: unavailable,
        closeBefore: true,
      });
    }
    case 'interface':
      return action('inspect-interface', 'INSPECT', BAG_ACTION_MODE.DIALOG);
    case 'tuning-fork':
      return action('inspect-tuning-fork', 'INSPECT', BAG_ACTION_MODE.DIALOG);
    case 'coffee':
      return action('coffee-drink', 'DRINK', BAG_ACTION_MODE.CONSUME, {
        closeBefore: true,
        confirm: { title: 'DRINK THE COFFEE?', body: 'THIS CANNOT BE UNDONE.' },
      });
    case 'sheet-music':
      // NOT IN A FIGHT. The pool is what the fight is fought with; letting him
      // reach into the case mid-exchange would make every battle a question of
      // how many sheets he happens to have rather than how well he reads.
      if (context.inCombat) {
        return action('sheet-read', 'READ IT', BAG_ACTION_MODE.CONSUME, {
          enabled: false,
          reason: 'NOT WHILE IT IS LOOKING AT YOU',
        });
      }
      // Nothing to gain is not the same as nothing to spend. A composed
      // recordist keeps his sheets.
      if (context.composed) {
        return action('sheet-read', 'READ IT', BAG_ACTION_MODE.CONSUME, {
          enabled: false,
          reason: 'ALREADY COMPOSED',
        });
      }
      return action('sheet-read', 'READ IT', BAG_ACTION_MODE.CONSUME, {
        closeBefore: true,
        confirm: { title: 'READ THE SHEET?', body: 'THERE ARE NOT MANY.' },
      });
    case 'plant-spanner':
      return action('inspect-plant-spanner', 'INSPECT', BAG_ACTION_MODE.DIALOG);
    case 'marble-eyes':
      return action('inspect-marble-eyes', 'INSPECT', BAG_ACTION_MODE.DIALOG);
    case 'keyring':
      return action('inspect-keyring', 'CHECK KEYS', BAG_ACTION_MODE.DIALOG);
    default:
      return action('none', '', BAG_ACTION_MODE.DIALOG, { enabled: false, reason: 'NO DIRECT ACTION' });
  }
}

export function bagKeyFacts({ master = false, chapel = false, chapelIdentified = false, services = false } = {}) {
  const facts = [['POSITION', 'CARRIED'], ['FUNCTION', 'AUTOMATIC ACCESS']];
  if (master) facts.push(['MASTER', 'BUILDING MASTER']);
  if (chapel) facts.push(['C-17', chapelIdentified ? 'CHAPEL' : 'UNIDENTIFIED TAG']);
  if (services) facts.push(['PLANT', 'PLANT SERVICES']);
  return facts;
}

export function bagInspectionDialogue(itemId, context = {}) {
  const keyLines = [];
  if (context.master) keyLines.push({ who: 'you', text: 'Building master. The one the guard handed over.' });
  if (context.chapel) keyLines.push({ who: 'you', text: context.chapelIdentified ? 'C-seventeen. Chapel.' : 'C-seventeen. Still only a tag.' });
  if (context.services) keyLines.push({ who: 'you', text: 'PLANT SERVICES. Stamped, not written.' });

  const entries = {
    interface: [
      { who: 'direction', text: 'The return lead leaves the converter and comes back before the signal has finished becoming itself.' },
      { who: 'you', text: 'Bent, working, and only useful when something in the signal needs sending back.' },
    ],
    'tuning-fork': [
      { who: 'direction', text: 'Steel. A=440, cut by hand. AND NOTHING ELSE beneath it.' },
      { who: 'you', text: 'A reference, not a weapon. If the Source gives me a target, I can ask whether it agrees.' },
    ],
    'plant-spanner': [
      { who: 'direction', text: 'An adjustable spanner, small enough for the side pocket. The jaw is already set near the heating-header gland.' },
      { who: 'you', text: 'If I put my hand on that header, this is what I use.' },
    ],
    'marble-eyes': [
      { who: 'direction', text: 'Two marble eyes, joined by the clean bridge of a nose. The break remembers another clean break.' },
      { who: 'you', text: 'I do not need to guess from here. I need to put them against the blind bust.' },
    ],
    // The sheets are the one entry that changes with what he is carrying, and
    // the one that MAKES A SOUND — main.js plays the top sheet's figure as this
    // opens (audio/sheet-voice.js). The direction line is the page; the second
    // line is him hearing it, which is the point of looking at all.
    'sheet-music': context.sheet ? [
      { who: 'direction', text: `${context.sheet.composer}. ${context.sheet.title}. ${context.sheet.detail}` },
      { who: 'you', text: context.sheet.line },
      ...(context.sheetsCarried > 1
        ? [{ who: 'you', text: `${context.sheetsCarried} of them in the case now. This is the one on top.` }]
        : []),
    ] : [
      { who: 'you', text: 'Nothing in that pocket.' },
    ],
    keyring: [
      { who: 'direction', text: 'The ring turns once in your palm.' },
      ...(keyLines.length ? keyLines : [{ who: 'you', text: 'No keys on it. Not yet.' }]),
    ],
  };

  const lines = entries[itemId];
  return lines ? { start: { speaker: 'FIELD CASE', lines } } : null;
}
