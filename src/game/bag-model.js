//
//  bag-model.js
//
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Pure field-case model.
//
// Converts the game's small, irregular bag/job payloads into one stable shape
// for presentation and navigation. It deliberately knows nothing about scenes,
// canvas, key events, saves, or the world clock.

import {
  combatCompartment,
  isBattleGear,
  normalizeCombatLoadout,
} from './combat-loadout.js';
import {
  TECHNIQUE_DEFS,
  normalizeCombatBuild,
  techniqueAvailability,
} from './combat-progression.js';
import { sheetDialogueFor } from './bag-sheets.js';

export const EMPTY_JOB = Object.freeze({
  rooms: [],
  unfiled: [],
  done: 0,
  total: 5,
});

const KNOWN_GEAR = Object.freeze({
  light: {
    title: 'LIGHT',
    subtitle: 'FIELD TORCH',
    icon: 'light',
    status: ['READY', 'active'],
    description: 'Hand torch issued with the field kit.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'ILLUMINATION'], ['BATTLE', 'EXPOSE · DMG · COUNTERS CONCEAL · USES BATTERY']],
  },
  recorder: {
    title: 'RECORDER + HEADPHONES',
    subtitle: 'PORTABLE RECORDER',
    icon: 'recorder',
    status: ['READY', 'active'],
    description: 'Captures one uninterrupted minute of room tone.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'CAPTURE / MONITOR'], ['BATTLE', 'MONITOR CAPTURES A TAKE · PLAYBACK SPENDS IT · COUNTERS BROADCAST']],
  },
  interface: {
    title: 'BENT RIG INTERFACE',
    subtitle: 'CIRCUIT-BENT RETURN',
    icon: 'interface',
    status: ['READY', 'active'],
    description: 'A rewired return path capable of reversing a hostile signal.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'INVERT / FEEDBACK'], ['BATTLE', 'INVERT RETURNS A LOOP · SPENDS THE TAKE · COUNTERS LOOP']],
  },
  'tuning-fork': {
    title: 'TUNING FORK',
    subtitle: 'STEEL REFERENCE / A440',
    icon: 'tuning-fork',
    status: ['READY', 'active'],
    description: 'A stable reference tone carried into unstable rooms.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'TUNE / REVEAL'], ['BATTLE', 'TUNE IS FREE · REVEALS THE NEXT TWO INTENTS']],
  },
  map: {
    title: 'LOCATION INDICATOR',
    subtitle: 'BUILDING PLAN / CURRENT SLICE',
    icon: 'room',
    status: ['LIVE', 'active'],
    description: 'Tracks the current physical floor, marked destination, and nearby interference.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'LOCATION / BEARING']],
  },
  radio: {
    title: 'RADIO',
    subtitle: 'PORTABLE SET',
    icon: 'radio',
    status: ['LIVE', 'active'],
    description: 'Portable service radio assigned with the work order.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'RADIO CHECK-IN'], ['BATTLE', 'THROW VOICE · GUARD 2 · COUNTERS BROADCAST · ONCE PER FIGHT']],
  },
  coffee: {
    title: "THE GUARD'S COFFEE",
    subtitle: 'PAPER CUP',
    icon: 'coffee',
    status: ['GETTING COLD', 'metadata'],
    description: 'Coffee from the service booth. Still technically warm.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'STIMULANT'], ['BATTLE', 'STEADY HANDS · +3 COMPOSURE · ONE CUP']],
  },
  'plant-spanner': {
    title: 'ADJUSTABLE SPANNER',
    subtitle: 'PLANT TOOL / SIDE POCKET',
    icon: 'spanner',
    status: ['READY', 'active'],
    description: 'A compact adjustable spanner set close to the heating-header gland size.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'PLANT ISOLATION']],
  },
  'marble-eyes': {
    title: 'TWO MARBLE EYES',
    subtitle: 'BROKEN PORTRAIT BUST',
    icon: 'bust',
    status: ['CARRIED', 'active'],
    description: 'A cleanly broken pair of marble eyes recovered from the yard fountain.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'RETURN TO MATCHING BUST']],
  },
  keyring: {
    title: 'STANDARD KEY RING',
    subtitle: 'FACILITIES KEYS',
    icon: 'keyring',
    status: ['CARRIED', 'dim'],
    description: 'The standard key ring supplied for the building.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'ACCESS']],
  },
  'chapel-key': {
    title: 'CHAPEL KEY',
    subtitle: 'TAG C-17',
    icon: 'keyring',
    status: ['ADDED', 'complete'],
    description: 'A later-generation key tagged C-17.',
    facts: [['POSITION', 'KEY RING'], ['FUNCTION', 'CHAPEL ACCESS']],
  },
  'key-c17': {
    title: 'KEY RING',
    subtitle: 'TAG C-17',
    icon: 'keyring',
    status: ['ADDED', 'dim'],
    description: 'A tagged key ring taken from the box-office cabinet.',
    facts: [['POSITION', 'KEY RING'], ['FUNCTION', 'UNKNOWN']],
  },
});

const GEAR_ALIAS = Object.freeze({
  'recorder-headphones': 'recorder',
  'recorder-+-headphones': 'recorder',
  'standard-keyring': 'keyring',
  'the-guards-coffee': 'coffee',
  torch: 'light',
});

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

export function slug(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\+/g, ' + ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'entry';
}

function displayTitle(value = '') {
  return String(value || 'ENTRY').trim().toUpperCase();
}

function actionDescriptor(id, verb, label, {
  enabled = true, reason = '', confirm = null, exitPolicy = 'stay', special = false,
} = {}) {
  return {
    id, verb, label: displayTitle(label || verb), enabled: !!enabled,
    reason: enabled ? '' : displayTitle(reason || 'UNAVAILABLE'),
    confirm: confirm || null, exitPolicy, special: !!special,
  };
}

function gearKey(raw) {
  const direct = slug(raw?.id || raw?.label || 'gear');
  return GEAR_ALIAS[direct] || direct;
}

function gearProfile(raw) {
  const key = gearKey(raw);
  const known = KNOWN_GEAR[key];
  if (known) return { key, ...known };

  return {
    key,
    title: displayTitle(raw?.label || raw?.id || 'GEAR'),
    subtitle: 'FIELD EQUIPMENT',
    icon: raw?.icon || 'unknown',
    status: ['CARRIED', 'dim'],
    description: 'Field equipment carried with the work order.',
    facts: [['POSITION', 'CARRIED']],
  };
}

function normalizeStatus(value, fallbackLabel, fallbackTone) {
  if (value && typeof value === 'object') {
    return {
      label: displayTitle(value.label || fallbackLabel),
      tone: value.tone || fallbackTone,
    };
  }

  return {
    label: displayTitle(value || fallbackLabel),
    tone: fallbackTone,
  };
}

export function normalizeEquipment(item, index = 0) {
  const raw = typeof item === 'string'
    ? { id: slug(item), label: item }
    : { ...(item || {}) };

  const profile = gearProfile(raw);
  const present = raw.present !== false;
  const [defaultStatus, defaultTone] = profile.status;
  const status = present
    ? normalizeStatus(raw.status || raw.value, defaultStatus, raw.statusTone || defaultTone)
    : normalizeStatus(raw.status || raw.value, 'EMPTY', raw.statusTone || 'danger');

  const facts = Array.isArray(raw.facts)
    ? raw.facts
    : profile.facts.map(([k, v]) => [k, k === 'POSITION' && !present ? (raw.location || 'NOT CARRIED') : v]);

  let primary = null;
  let actionReason = '';
  const resolvedAction = raw.primaryAction || raw.actions?.primary || null;
  if (resolvedAction && resolvedAction.enabled !== false) {
    primary = {
      id: resolvedAction.id,
      label: displayTitle(resolvedAction.label),
      mode: resolvedAction.mode || 'command',
      enabled: true,
      reason: '',
      closeBefore: !!resolvedAction.closeBefore,
      destructive: !!resolvedAction.confirm,
      confirm: resolvedAction.confirm || null,
    };
  } else if (resolvedAction) {
    actionReason = displayTitle(resolvedAction.reason || 'ACTION UNAVAILABLE');
  } else if (present && typeof raw.action === 'function') {
    // Compatibility for small render labs and older fixtures. The live game
    // supplies semantic descriptors and dispatches them through one boundary.
    const defaultLabel = profile.key === 'radio'
      ? 'SET DOWN'
      : profile.key === 'coffee'
        ? 'DRINK'
        : 'USE';

    const destructive = raw.destructive ?? (profile.key === 'radio' || profile.key === 'coffee');

    primary = {
      id: raw.actionId || (profile.key === 'radio' ? 'drop' : profile.key === 'coffee' ? 'consume' : 'activate'),
      label: displayTitle(raw.actionLabel || defaultLabel),
      mode: 'command',
      enabled: true,
      reason: '',
      closeBefore: false,
      destructive: !!destructive,
      confirm: destructive
        ? {
            title: displayTitle(raw.confirm?.title || (profile.key === 'radio' ? 'SET DOWN RADIO?' : 'DRINK THE COFFEE?')),
            body: displayTitle(raw.confirm?.body || (profile.key === 'radio'
              ? 'THE RADIO WILL REMAIN IN THIS ROOM.'
              : 'THIS CANNOT BE UNDONE.')),
          }
        : null,
    };
  }

  return {
    id: `gear:${profile.key || raw.id || index}`,
    sourceId: profile.key || raw.id,
    section: 'kit',
    kind: 'gear',
    title: displayTitle(raw.title || profile.title),
    subtitle: displayTitle(raw.subtitle || profile.subtitle),
    icon: raw.icon || profile.icon,
    present,
    status,
    description: String(raw.description || profile.description),
    facts,
    badges: Array.isArray(raw.badges) ? raw.badges : [],
    actionReason: actionReason || (raw.actionReason ? displayTitle(raw.actionReason) : ''),
    automaticUse: raw.automaticUse || null,
    actions: { primary, secondary: null },
    source: raw,
  };
}

function roomState(room) {
  if (room?.recorded) return 'recorded';
  if (room?.current) return 'current';
  if (room?.marked) return 'marked';
  return room?.visited === false ? 'unvisited' : 'available';
}

function mapStatus(state) {
  switch (state) {
    case 'recorded': return { label: 'RECORDED', tone: 'complete', glyph: '✓' };
    case 'current': return { label: 'IN ROOM', tone: 'active', glyph: '●' };
    case 'marked': return { label: 'MARKED', tone: 'active', glyph: '◆' };
    case 'unvisited': return { label: 'UNVISITED', tone: 'dim', glyph: '◇' };
    default: return { label: 'AVAILABLE', tone: 'metadata', glyph: '◇' };
  }
}

export function normalizeRoom(room, index = 0, total = 5) {
  const raw = room || {};
  const roomId = raw.roomId || `room-${index + 1}`;
  const state = roomState(raw);
  const notes = Array.isArray(raw.notes) ? raw.notes : [];
  const status = mapStatus(state);
  const timestamp = raw.stamp || '--:--';

  return {
    id: `room:${roomId}`,
    section: 'map',
    kind: 'room',
    roomId,
    sequence: index + 1,
    title: displayTitle(raw.label || roomId),
    subtitle: `TAKE ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    icon: 'room',
    state,
    recorded: !!raw.recorded,
    marked: !!raw.marked,
    timestamp,
    noteCount: notes.length,
    status,
    description: String(raw.description || (index === 0
      ? "First room named on the client's recording manifest."
      : `Assigned recording room ${index + 1} of ${total}.`)),
    facts: [
      ['RECORDING', raw.recorded ? 'CAPTURED' : 'NOT CAPTURED'],
      ['FILES', String(notes.length).padStart(2, '0')],
      ['TIMESTAMP', timestamp],
    ],
    attached: notes[0] || null,
    actions: {
      primary: notes.length
        ? { id: 'read-attached', label: 'READ FILE', destructive: false }
        : null,
      secondary: {
        id: raw.marked ? 'unmark' : 'mark',
        label: raw.marked ? 'CLEAR WAYPOINT' : 'MARK WAYPOINT',
        destructive: false,
      },
    },
    source: raw,
  };
}

function firstBodyText(doc) {
  if (doc?.preview) return String(doc.preview);
  const body = Array.isArray(doc?.body) ? doc.body : [];

  for (const entry of body) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
    if (entry?.raw && String(entry.raw).trim()) return String(entry.raw).trim();
  }

  return 'Collected paperwork from the building.';
}

function documentType(doc) {
  if (doc?.type) return displayTitle(doc.type);
  const id = String(doc?.id || '').toLowerCase();
  const title = String(doc?.title || '').toLowerCase();
  if (id.includes('work-order') || title.includes('work order')) return 'ARCHIVAL CAPTURE';
  if (id.includes('log') || title.includes('log')) return 'FIELD LOG';
  return 'COLLECTED DOCUMENT';
}

function documentIssued(doc) {
  if (doc?.issued) return String(doc.issued).toUpperCase();
  const m = String(doc?.title || '').match(/\b\d{1,2}:\d{2}\b/);
  return m ? m[0] : '--:--';
}

function documentBadges(doc) {
  const out = Array.isArray(doc?.badges) ? [...doc.badges] : [];
  const id=String(doc?.id||'').toLowerCase(),title=String(doc?.title||'').toLowerCase();
  if(id.includes('work-order')||title.includes('work order'))out.push('WORK ORDER');
  if (doc?.unread) out.push('UNREAD');
  if (doc?.updated) out.push('UPDATED');
  if (doc?.newlyFiled) out.push('FILED');
  return [...new Set(out.map(displayTitle))];
}

export function normalizeFiles(job = EMPTY_JOB, map = null, sheetInsights = null) {
  const files = [];
  const rooms = Array.isArray(job.rooms) ? job.rooms : [];

  for (const room of rooms) {
    for (const doc of Array.isArray(room.notes) ? room.notes : []) {
      const space=map?.spaces?.find((candidate)=>candidate.roomId===room.roomId)||null;
      const floor=map?.floors?.find((candidate)=>candidate.id===space?.floorId)||null;
      files.push(normalizeFile(doc, {
        roomId: room.roomId,
        folder: `${floor?.label ? `${floor.label} · ` : ''}${room.label}`,
        marked: !!room.marked,
        insightComplete:!!sheetInsights?.inspected?.includes?.(doc?.id),
      }));
    }
  }

  for (const doc of Array.isArray(job.unfiled) ? job.unfiled : []) {
    files.push(normalizeFile(doc, {
      roomId: null,
      folder: 'UNFILED',
      marked: false,
      insightComplete:!!sheetInsights?.inspected?.includes?.(doc?.id),
    }));
  }

  return files;
}

function normalizeFile(doc, { roomId, folder, marked = false, insightComplete = false }) {
  const raw = doc || {};
  const title = displayTitle(raw.title || raw.id || 'DOCUMENT');
  const preview = firstBodyText(raw).replace(/\s+/g, ' ').trim();
  const read = raw.read === true;
  const insight=sheetDialogueFor(raw.id);
  const badges=[...(insight?['IMPORTANT']:[]),...(String(folder||'').toUpperCase()==='UNFILED'?['UNFILED']:[]),...documentBadges(raw)];

  return {
    id: `file:${raw.id || slug(title)}`,
    section: 'sheets',
    kind: 'file',
    title,
    subtitle: documentType(raw),
    icon: 'file',
    roomId,
    folder: displayTitle(folder || 'UNFILED'),
    preview,
    status: { label: read ? 'READ' : 'FILED', tone: read ? 'dim' : 'metadata' },
    facts: [
      ['TYPE', documentType(raw)],
      ['FILED UNDER', displayTitle(folder || 'UNFILED')],
      ['ISSUED', documentIssued(raw)],
      ['STATUS', read ? 'READ' : 'FILED'],
      ['INDICATORS', badges.length?[...new Set(badges)].join(' · '):'--'],
    ],
    important:!!insight,
    insight,
    insightComplete:!!insightComplete,
    badges:[...new Set(badges)],
    actionList: [
      actionDescriptor('read','inspect','INSPECT SHEET'),
      ...(insight&&insightComplete?[actionDescriptor('review-insight','review','REVIEW NOTES',{special:true})]:[]),
      ...(roomId?[actionDescriptor(marked?'unmark-room':'mark-room','waypoint',marked?'CLEAR WAYPOINT':`MARK ${displayTitle(folder)}`)]:[]),
    ],
    actions: {
      primary: { id: 'read', label: 'READ', destructive: false },
      secondary: roomId
        ? {
            id: marked ? 'unmark-room' : 'mark-room',
            label: marked ? 'CLEAR WAYPOINT' : `MARK ${displayTitle(folder)}`,
            destructive: false,
          }
        : null,
    },
    source: raw,
  };
}

export const BAG_SECTION_ALIASES = Object.freeze({ manifest: 'map', files: 'sheets' });

export function normalizeBagSectionId(sectionId) {
  return BAG_SECTION_ALIASES[sectionId] || sectionId;
}

// ── the SKILLS section ──────────────────────────────────────────────────────
// One column per branch, its techniques in tier order. Every entry carries the
// three things the screen has to be able to say without the player deducing
// anything: which of the three states it is in, what it does, and — when it is
// locked — what unlocks it BY NAME. "TIER I REQUIRED" told nobody anything.
function buildSkillsSection({ build, settledBuild = null, hasRig }) {
  const current = normalizeCombatBuild(build);
  const settled = normalizeCombatBuild(settledBuild ?? build);
  const nameOf = (id) => TECHNIQUE_DEFS.find((entry) => entry.id === id)?.label || '';
  const branchOrder = [...new Set(TECHNIQUE_DEFS.map((entry) => entry.branch))];
  const branches = branchOrder.map((branch) => ({
    id: branch,
    entries: TECHNIQUE_DEFS
      .filter((entry) => entry.branch === branch)
      .sort((a, b) => a.tier - b.tier)
      .map((entry) => {
        const availability = techniqueAvailability(current, entry.id, { hasRig });
        const owned = current.techniques.includes(entry.id);
        const pending = owned && !settled.techniques.includes(entry.id);
        // A socket emptied THIS session. Not a fifth state — it draws as OPEN —
        // but the detail strip should say the lead came from here.
        const emptied = !owned && settled.techniques.includes(entry.id);
        // What comes out with this one, BY NAME — the view prints these and an
        // id would leak to the player. Head first, then down the run. A lone
        // pull needs no warning; one that takes the run below it does.
        const pulls = (availability.pulls || []).map(nameOf);
        const requiredBy = entry.requires ? TECHNIQUE_DEFS.find((other) => other.id === entry.requires) : null;
        return {
          id: `skill:${entry.id}`,
          techniqueId: entry.id,
          kind: 'skill',
          branch,
          tier: entry.tier,
          label: entry.label,
          detail: entry.detail,
          active: !!entry.active,
          special: !!entry.special,
          owned,
          pending,
          enabled: availability.enabled,
          state: pending ? 'pending' : owned ? 'owned' : availability.enabled ? 'affordable' : 'locked',
          // Named, not numbered.
          blockedBy: owned ? ''
            : availability.enabled ? ''
              : entry.requires && !current.techniques.includes(entry.requires)
                ? `NO CONTINUITY · PATCH ${nameOf(entry.requires)} ABOVE IT`
                : entry.requiresRig && !hasRig
                  ? 'THIS SOCKET IS ON THE BENT RIG · IT IS IN THE PLANT ROOM'
                  : current.unspent <= 0 ? 'NO SPARE LEAD · PULL ONE'
                    : String(availability.reason || 'NO REACH'),
          buyPrompt: 'TAKES EFFECT WHEN THE CASE CLOSES',
          emptied,
          pulls: [...pulls],
          // THE CABLE INTO THIS SOCKET, if there is one.
          //
          // Driven by the prerequisite, never by `tier - 1`. Four sockets sit
          // below another and are not fed by it — ROOM TONE, HEADROOM and the
          // first two rungs of NERVE are patched direct — and the old drawing
          // ran a line into all four anyway.
          lead: requiredBy ? {
            fromTier: requiredBy.tier,
            live: owned && current.techniques.includes(entry.requires),
            fresh: owned && current.techniques.includes(entry.requires)
              && (pending || !settled.techniques.includes(entry.requires)),
          } : null,
          actionList: owned
            ? [actionDescriptor('pull-cable','pull','PULL LEAD',{
                // Only the cascading pull is worth stopping for. A lone pull is
                // undone by pressing the same key again, and a modal in front of
                // that would make re-rigging tedious.
                confirm: pulls.length > 1 ? {
                  title: `PULL ${entry.label}?`,
                  body: `THE RUN BELOW IT LOSES CONTINUITY. ${pulls.length} LEADS COME BACK: ${pulls.join(', ')}.`,
                } : null,
              })]
            : availability.enabled
              ? [actionDescriptor('patch-cable','patch','PATCH')]
              : [],
          actions: {
            primary: owned
              ? { id:'pull-cable',label:'PULL LEAD',destructive:false }
              : availability.enabled
              ? { id: 'patch-cable', label: 'PATCH', destructive: false }
              : null,
          },
        };
      }),
  }));
  const maxTier = branches.reduce((max, branch) => Math.max(max, ...branch.entries.map((e) => e.tier)), 1);
  return {
    id: 'skills',
    label: 'SKILLS',
    // The delta is SIGNED now, because a session can end with fewer patches than
    // it started with. It used to be interpolated raw, so a pull printed
    // `· -2 CHOSEN` on the tab.
    countLabel: (() => {
      const spare = current.unspent;
      const moved = current.techniques.length - settled.techniques.length;
      const change = moved > 0 ? ` · ${moved} NEW` : moved < 0 ? ` · ${-moved} PULLED` : '';
      if (spare) return `${spare} LEAD${spare === 1 ? '' : 'S'}${change}`;
      if (change) return change.slice(3);
      return `${current.techniques.length} PATCHED`;
    })(),
    entries: branches.flatMap((branch) => branch.entries),
    tree: {
      branches,
      maxTier,
      pins: {
        earned: current.pinsEarned,
        spent: current.pinsSpent,
        unspent: current.unspent,
        pending: Math.max(0, current.techniques.length - settled.techniques.length),
        // A session can now end smaller than it began. Clamped the other way so
        // the headline can say what happened either direction.
        pulled: Math.max(0, settled.techniques.length - current.techniques.length),
      },
    },
  };
}

export function buildBagModel({ equipment = [], job = EMPTY_JOB, map = null, loadout = null, build = null, settledBuild = null, hasRig = false, sheetInsights = null } = {}) {
  const safeJob = {
    ...EMPTY_JOB,
    ...(job || {}),
    rooms: Array.isArray(job?.rooms) ? job.rooms : [],
    unfiled: Array.isArray(job?.unfiled) ? job.unfiled : [],
  };

  const normalizedLoadout = normalizeCombatLoadout(loadout);
  const kit = (Array.isArray(equipment) ? equipment : []).map(normalizeEquipment).map((entry) => {
    const battleCapable = entry.source?.battleCapable ?? isBattleGear(entry.sourceId);
    const assignedCompartment = battleCapable ? combatCompartment(normalizedLoadout, entry.sourceId) : 'storage';
    // A saved quick-slot assignment survives loss/deployment, but the slot row only
    // depicts gear physically in hand. Recovery restores the same slot/order.
    const compartment = battleCapable && entry.present ? assignedCompartment : 'storage';
    const topIndex = normalizedLoadout.top.indexOf(entry.sourceId);
    const compartmentLabel = compartment === 'top'
      ? `QUICK SLOT ${topIndex + 1} OF ${normalizedLoadout.capacity}`
      : battleCapable && !entry.present && assignedCompartment === 'top'
        ? `NOT CARRIED / QUICK SLOT ${topIndex + 1} KEPT`
        : battleCapable ? 'IN BAG / NOT SET FOR A FIGHT' : 'IN BAG';
    const primary=entry.actions?.primary||null;
    const primaryIsInspect=String(primary?.id||'').startsWith('inspect-');
    const primaryIsDrop=primary?.id==='radio-deploy'||primary?.id==='drop';
    const primaryIsSpecial=primary?.id==='radio-show-map';
    const setAction=battleCapable
      ? actionDescriptor(compartment==='top'?'unset-slot':'set-slot',compartment==='top'?'unset':'set',compartment==='top'?'UNSET':'SET',{
          enabled:entry.present,reason:entry.present?'':'ITEM NOT CARRIED',
        })
      : actionDescriptor('set-slot','set','SET',{enabled:false,reason:'NOT USED IN A FIGHT'});
    const unavailableUseReason = ({
      interface: 'SET IT IN A QUICK SLOT',
      'tuning-fork': 'SET IT IN A QUICK SLOT',
      radio: 'CHOOSE DROP TO PLACE THE RADIO',
      'plant-spanner': 'USE AT THE HEATING HEADER',
      'marble-eyes': 'USE AT THE BLIND BUST',
      keyring: 'USED AUTOMATICALLY AT LOCKED DOORS',
    })[entry.sourceId] || 'NO USE AVAILABLE FROM THE BAG';
    const useAction=!primaryIsInspect&&!primaryIsDrop&&!primaryIsSpecial&&primary
      ? actionDescriptor(primary.id,'use',primary.label,{enabled:primary.enabled!==false,reason:primary.reason,confirm:primary.confirm,exitPolicy:primary.closeBefore?'close':'stay'})
      : actionDescriptor('use-unavailable','use','USE',{enabled:false,reason:entry.present?unavailableUseReason:'ITEM NOT CARRIED'});
    const dropAction=entry.sourceId==='radio'
      ? primaryIsDrop
        ? actionDescriptor(primary.id,'drop','DROP / DEPLOY HERE',{
            enabled:entry.present,reason:entry.present?'':'ALREADY DEPLOYED',exitPolicy:'close',
            confirm:{title:'DROP RADIO HERE?',body:'THE RADIO WILL REMAIN HERE UNTIL YOU RECOVER IT.'},
          })
        : actionDescriptor('radio-deploy','drop','DROP / DEPLOY HERE',{enabled:false,reason:entry.source?.deployed?'ALREADY DEPLOYED':'ITEM NOT CARRIED'})
      : actionDescriptor('drop-unavailable','drop','DROP',{enabled:false,reason:entry.present?"CAN'T LEAVE THIS ITEM BEHIND":'ITEM NOT CARRIED'});
    const actionList=[
      setAction,useAction,dropAction,
      actionDescriptor('inspect-item','inspect','INSPECT',{enabled:true}),
      ...(primaryIsSpecial?[actionDescriptor(primary.id,'special',primary.label,{enabled:primary.enabled!==false,reason:primary.reason,special:true})]:[]),
    ];
    return {
      ...entry,
      battleCapable,
      compartment,
      topIndex,
      facts: [['COMPARTMENT', compartmentLabel], ...entry.facts],
      badges: [compartment === 'top' ? `SLOT ${topIndex + 1}` : 'IN BAG', ...entry.badges],
      actionList,
      actions: {
        ...entry.actions,
        secondary: battleCapable && entry.present
          ? {
              id: compartment === 'top' ? 'move-storage' : 'move-top',
              label: compartment === 'top' ? 'CLEAR QUICK SLOT' : 'PUT IN QUICK SLOT',
              destructive: false,
            }
          : null,
        // Tray order is the in-fight tool rail order. One "move up" is a
        // complete reorder primitive — walk a tool down by lifting the one below
        // it — and it only exists for gear that has somewhere above to go.
        tertiary: compartment === 'top' && entry.present && topIndex > 0
          ? { id: 'reorder-up', label: 'MOVE UP', destructive: false }
          : null,
      },
    };
  });
  const total = Math.max(0, Number(safeJob.total) || safeJob.rooms.length || 0);
  const mapEntries = safeJob.rooms.map((room, index) => {
    const entry = normalizeRoom(room, index, total || safeJob.rooms.length || 5);
    const space = map?.spaces?.find((candidate) => candidate.roomId === entry.roomId) || null;
    return space ? {
      ...entry,
      floorId: space.floorId,
      mapPosition: space.position,
      current: !!space.current,
      marked: !!space.waypoint,
      state: space.objective?.state || entry.state,
      status: mapStatus(space.objective?.state || entry.state),
      source: { ...entry.source, mapSpace: space },
    } : entry;
  });
  const files = normalizeFiles(safeJob,map,sheetInsights);
  const done = clampInt(safeJob.done, 0, total || Math.max(0, safeJob.done || 0));

  return {
    sections: [
      { id: 'kit', label: 'INVENTORY', countLabel: `${kit.length}`, entries: kit },
      { id: 'map', label: 'MAP', countLabel: `${done}/${total}`, entries: mapEntries, map },
      { id: 'sheets', label: 'SHEETS', countLabel: String(files.length).padStart(2, '0'), entries: files },
      buildSkillsSection({ build, settledBuild, hasRig }),
    ],
    progress: { done, total },
    loadout: normalizedLoadout,
    job: safeJob,
    map,
  };
}

export function bagSection(model, sectionId) {
  const normalized = normalizeBagSectionId(sectionId);
  return model?.sections?.find((section) => section.id === normalized) || null;
}

export function bagEntry(model, sectionId, entryId) {
  return bagSection(model, sectionId)?.entries?.find((entry) => entry.id === entryId) || null;
}
