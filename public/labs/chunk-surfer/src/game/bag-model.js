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
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'ILLUMINATION']],
  },
  recorder: {
    title: 'RECORDER + HEADPHONES',
    subtitle: 'PORTABLE RECORDER',
    icon: 'recorder',
    status: ['READY', 'active'],
    description: 'Captures one uninterrupted minute of room tone.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'CAPTURE / MONITOR']],
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
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'CHECK-IN / FIELD CONTACT']],
  },
  coffee: {
    title: "THE GUARD'S COFFEE",
    subtitle: 'PAPER CUP',
    icon: 'coffee',
    status: ['GETTING COLD', 'metadata'],
    description: 'Coffee from the service booth. Still technically warm.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'STIMULANT']],
  },
  keyring: {
    title: 'STANDARD KEYRING',
    subtitle: 'FACILITIES KEYS',
    icon: 'keyring',
    status: ['CARRIED', 'dim'],
    description: 'The standard keyring supplied for the building.',
    facts: [['POSITION', 'CARRIED'], ['FUNCTION', 'ACCESS']],
  },
  'chapel-key': {
    title: 'CHAPEL KEY',
    subtitle: 'TAG C-17',
    icon: 'keyring',
    status: ['ADDED', 'complete'],
    description: 'A later-generation key tagged C-17.',
    facts: [['POSITION', 'KEYRING'], ['FUNCTION', 'CHAPEL ACCESS']],
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
  if (present && typeof raw.action === 'function') {
    const defaultLabel = profile.key === 'radio'
      ? 'SET DOWN'
      : profile.key === 'coffee'
        ? 'DRINK'
        : 'USE';

    const destructive = raw.destructive ?? (profile.key === 'radio' || profile.key === 'coffee');

    primary = {
      id: raw.actionId || (profile.key === 'radio' ? 'drop' : profile.key === 'coffee' ? 'consume' : 'activate'),
      label: displayTitle(raw.actionLabel || defaultLabel),
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

function manifestStatus(state) {
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
  const status = manifestStatus(state);
  const timestamp = raw.stamp || '--:--';

  return {
    id: `room:${roomId}`,
    section: 'manifest',
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
  if (doc?.unread) out.push('NEW');
  if (doc?.updated) out.push('UPDATED');
  if (doc?.newlyFiled) out.push('FILED');
  return [...new Set(out.map(displayTitle))];
}

export function normalizeFiles(job = EMPTY_JOB) {
  const files = [];
  const rooms = Array.isArray(job.rooms) ? job.rooms : [];

  for (const room of rooms) {
    for (const doc of Array.isArray(room.notes) ? room.notes : []) {
      files.push(normalizeFile(doc, {
        roomId: room.roomId,
        folder: room.label,
        marked: !!room.marked,
      }));
    }
  }

  for (const doc of Array.isArray(job.unfiled) ? job.unfiled : []) {
    files.push(normalizeFile(doc, {
      roomId: null,
      folder: 'UNFILED',
      marked: false,
    }));
  }

  return files;
}

function normalizeFile(doc, { roomId, folder, marked = false }) {
  const raw = doc || {};
  const title = displayTitle(raw.title || raw.id || 'DOCUMENT');
  const preview = firstBodyText(raw).replace(/\s+/g, ' ').trim();
  const read = raw.read === true;

  return {
    id: `file:${raw.id || slug(title)}`,
    section: 'files',
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
    ],
    badges: documentBadges(raw),
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

export function buildBagModel({ equipment = [], job = EMPTY_JOB } = {}) {
  const safeJob = {
    ...EMPTY_JOB,
    ...(job || {}),
    rooms: Array.isArray(job?.rooms) ? job.rooms : [],
    unfiled: Array.isArray(job?.unfiled) ? job.unfiled : [],
  };

  const kit = (Array.isArray(equipment) ? equipment : []).map(normalizeEquipment);
  const total = Math.max(0, Number(safeJob.total) || safeJob.rooms.length || 0);
  const manifest = safeJob.rooms.map((room, index) => normalizeRoom(room, index, total || safeJob.rooms.length || 5));
  const files = normalizeFiles(safeJob);
  const done = clampInt(safeJob.done, 0, total || Math.max(0, safeJob.done || 0));

  return {
    sections: [
      { id: 'kit', label: 'KIT', countLabel: String(kit.filter((e) => e.present).length).padStart(2, '0'), entries: kit },
      { id: 'manifest', label: 'MANIFEST', countLabel: `${done}/${total}`, entries: manifest },
      { id: 'files', label: 'FILES', countLabel: String(files.length).padStart(2, '0'), entries: files },
    ],
    progress: { done, total },
    job: safeJob,
  };
}

export function bagSection(model, sectionId) {
  return model?.sections?.find((section) => section.id === sectionId) || null;
}

export function bagEntry(model, sectionId, entryId) {
  return bagSection(model, sectionId)?.entries?.find((entry) => entry.id === entryId) || null;
}
