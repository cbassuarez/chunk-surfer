// THE TRANSFER ROOM REGISTRY.
//
// What the institution wrote down about the paper, as opposed to the paper. The
// building's documents are authored elsewhere — PAGES and WORK_ORDER in
// conservatory-script.js, the eight holdings in game/hush-dossier.js — and this
// module is the FILE they were put in: a reference, a date, who issued it, what
// it is physically, and one line from whoever filed it.
//
// THE NOTES COLUMN IS THE POINT. It carries the story that no line of dialogue
// and no object in the building ever says. Two rules keep it honest:
//
//   · A note is written by somebody who worked here. There is no system voice in
//     this game and there is not one in here either. A clerk, an Ellery hand, a
//     stamp in the wrong ink, a pencil addition with illegible initials — the
//     eight holdings already establish the register and these are in it.
//   · NOT EVERY ROW HAS A NOTE. A notes column with something in every cell is
//     a column of noise, and the empty ones are what make the full ones read.
//
// The registry note is the FILING note and is a separate layer from the
// document's own marginalia, which stays inside the document where it was
// written.
//
// Pure, and the corpora arrive as arguments, so the rules can be checked against
// a fixture rather than against 211 baked documents.

export const REGISTER = Object.freeze({
  FILE: 'file',
  HOLDINGS: 'holdings',
  NIGHTS: 'nights',
});

// What the paper physically IS, mirroring assets/paper/catalog.json. Held here
// rather than read from the catalog because the catalog is a build product that
// arrives as fetched webp pages, and a menu surface must not wait on an asset
// load to draw a list. Kept small on purpose: only what a registry would record.
const PROVENANCE = Object.freeze({
  'work-order':                    { issuer: 'ELLERY WORKS',  repro: 'ORIGINAL',   process: 'IMPACT 24' },
  'work-order-carbon':             { issuer: 'ELLERY WORKS',  repro: 'COPY G1',    process: 'PHOTOCOPY' },
  'pre-roll-analysis':             { issuer: 'CONSERVATOIRE', repro: 'ORIGINAL',   process: 'LASER' },
  'faculty-reference-requirement': { issuer: 'CONSERVATOIRE', repro: 'COPY G1',    process: 'PHOTOCOPY' },
  'student-monitoring-notes':      { issuer: 'CONSERVATOIRE', repro: 'COPY G2',    process: 'PHOTOCOPY' },
  'foh-overflow-note':             { issuer: 'BUILDINGS',     repro: 'COPY G1',    process: 'PHOTOCOPY' },
});

// The night log, as filed. The times are the sheets' own, and they are the
// reason this register exists: read one at a time in a bag they are ten notes,
// and read as a column they are a clock failing.
const LOG_DATE = Object.freeze({
  'page-1': '21:40', 'page-2': '22:15', 'page-3': '23:02', 'page-4': '00:20',
  'page-5': '01:35', 'page-6': '02:10', 'page-7': '02:5?', 'page-8': '??:??',
  'page-9': '??:??', 'page-10': '—',
});

const FILED_DATE = Object.freeze({
  'work-order': '21:10',
  'work-order-carbon': '21:10',
  'pre-roll-analysis': '14 FEB 91',
  'faculty-reference-requirement': '03 OCT 87',
  // The same day as Incident 17, which is a thing you can only notice in a
  // column. Neither document says so.
  'student-monitoring-notes': '17 FEB 91',
  'foh-overflow-note': 'UNDATED',
  'reference-requirement': '03 OCT 87',
  'second-performance': 'UNDATED 89',
  'incident-17': '17 FEB 91',
  'density-sites': 'REVISION 6',
  'before-first-bar': 'CAPTURES A-E',
  'transfer-without-owner': '01 JAN 04',
  'work-order-4417-c': '21:10',
  'returned-before-entry': 'GATE 22:41',
});

const REFERENCE = Object.freeze({
  'page-1': 'SHEET 01', 'page-2': 'SHEET 02', 'page-3': 'SHEET 03',
  'page-4': 'SHEET 04', 'page-5': 'SHEET 05', 'page-6': 'SHEET 06',
  'page-7': 'SHEET 07', 'page-8': 'SHEET 08', 'page-9': 'SHEET 09',
  'page-10': 'SHEET 10',
  'work-order': 'W.E./4417',
  'work-order-carbon': 'W.E./4417-C',
  'pre-roll-analysis': '4417-B',
  'faculty-reference-requirement': 'E.C.M. 14-R',
  'student-monitoring-notes': 'E.C.M. M5',
  'foh-overflow-note': 'E.C.M./B F-06',
  'reference-requirement': 'HOLD 14-R',
  'second-performance': 'HOLD M5',
  'incident-17': 'HOLD 17',
  'density-sites': 'HOLD ARR-6',
  'before-first-bar': 'HOLD 4417-B',
  'transfer-without-owner': 'HOLD SCH-K',
  'work-order-4417-c': 'HOLD 4417-C',
  'returned-before-entry': 'HOLD TDC',
});

// One line from whoever filed it. Terse, because a filing clerk is not writing
// for you.
const FILING_NOTE = Object.freeze({
  // ── the paper you can carry out of the building ──────────────────────────
  'work-order': 'Top copy. RETURNED column blank at filing.',
  'work-order-carbon': 'Carbon three. Site copy. Authority line left unconfirmed.',
  'pre-roll-analysis': 'Laser. Not our stock and not our printer. Held for return to the Conservatoire; no address answers.',
  'faculty-reference-requirement': 'Circular 14-R. Reissued three times. Only the 1987 reissue is in the file.',
  'student-monitoring-notes': 'Transfer label attached over the student’s name. The label is ours. Nobody here attached it.',
  'foh-overflow-note': 'Buildings dept. Furniture listed out and never listed back. That corridor is not on the plan we were issued.',

  // The log. Most of these are deliberately blank — the clerk only wrote when
  // something needed saying, and the silence is the shape of the column.
  'page-3': 'Ink change mid-sheet. Same hand.',
  'page-7': 'Minute digit not written.',
  'page-8': 'Clock not entered. Sheets 8 and 9 are the same paper as 7.',
  'page-10': 'No time and no room. Filed last because it was on top.',

  // ── the holdings ─────────────────────────────────────────────────────────
  'reference-requirement': 'Faculty circular. Not ours to hold. In the completion bundle regardless.',
  'second-performance': 'Found in the M5 deck at decommission. Not entered in the student file. There is no student file.',
  'incident-17': 'Closed as fatigue. Reopened by the transfer clerk in 1998 and closed again the same day.',
  'density-sites': 'Claims support. Not to be released outside the company.',
  'before-first-bar': 'Engineering dispute open since 1991. No engineer is named on either side of it.',
  'transfer-without-owner': 'Schedule K. Renews on termination. Legal have stopped answering.',
  'work-order-4417-c': 'Operations copy. The RETURNED column has never cleared.',
  'returned-before-entry': 'Clock sheet. Clocks verified. By whom the result was withheld is not recorded.',
});

// A row may point at another row. Five of the eight holdings are the file copies
// of paper that is still in the building, which is the spine of the whole
// register: you find the sheet, and the file has been holding its twin for
// thirty years with a note on it.
const CITES = Object.freeze({
  'work-order': ['work-order-carbon', 'work-order-4417-c'],
  'work-order-carbon': ['work-order', 'work-order-4417-c'],
  'work-order-4417-c': ['work-order', 'work-order-carbon', 'returned-before-entry'],
  'pre-roll-analysis': ['before-first-bar'],
  'before-first-bar': ['pre-roll-analysis'],
  'faculty-reference-requirement': ['reference-requirement'],
  'reference-requirement': ['faculty-reference-requirement'],
  'student-monitoring-notes': ['second-performance', 'incident-17'],
  'second-performance': ['student-monitoring-notes', 'incident-17'],
  'incident-17': ['second-performance', 'density-sites'],
  'returned-before-entry': ['work-order-4417-c'],
});

const asText = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.raw === 'string') return value.raw;
  return '';
};

// Document body, flattened to lines the reader can wrap. `{raw}` entries are
// monospace table rows in the source and are passed through as written.
export function documentLines(doc) {
  if (!doc) return [];
  if (Array.isArray(doc.paragraphs)) return doc.paragraphs.map(asText).filter(Boolean);
  if (Array.isArray(doc.body)) return doc.body.map(asText);
  return [];
}

// The progression bus slugifies a document's id before filing it
// (`progressionDocumentId` in main.js): lowercased, every run of non-alphanumeric
// characters folded to a hyphen. Today every authored page id already survives
// that unchanged, which is exactly why this is worth doing — the day one does
// not, the file silently loses a row and looks like a document nobody found.
export function progressionDocumentId(id) {
  return String(id || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function knownRecord(knowledge, id) {
  const record = knowledge?.[id] || knowledge?.[progressionDocumentId(id)];
  if (!record || typeof record !== 'object') return null;
  return {
    firstSeenAt: Number(record.firstSeenAt) || 0,
    firstSeenRunId: typeof record.firstSeenRunId === 'string' ? record.firstSeenRunId : '',
    count: Math.max(1, Math.floor(Number(record.count) || 1)),
  };
}

function baseRow(doc, register) {
  const id = String(doc?.id || '');
  const provenance = PROVENANCE[id] || null;
  return {
    id,
    register,
    ref: REFERENCE[id] || id.toUpperCase(),
    title: String(doc?.title || id),
    byline: String(doc?.byline || doc?.source || ''),
    date: LOG_DATE[id] || FILED_DATE[id] || '',
    // The document's own date line, which is usually a sentence rather than a
    // date. It belongs in the detail pane, never in a 12-character column.
    fullDate: String(doc?.date || ''),
    issuer: provenance?.issuer || '',
    reproduction: provenance?.repro || '',
    process: provenance?.process || '',
    status: String(doc?.status || ''),
    note: FILING_NOTE[id] || '',
    cites: CITES[id] ? [...CITES[id]] : [],
    lines: documentLines(doc),
  };
}

/**
 * The FILE: every document the operator has actually handled, across every run.
 *
 * A document nobody has picked up is not in the file, and is not listed as
 * missing either — the registry is what the company holds, not an index of the
 * building. `includeUnseen` exists for the tests and the god menu.
 */
export function fileRegisterRows({ knowledge = {}, pages = [], workOrder = null, includeUnseen = false } = {}) {
  const corpus = workOrder ? [workOrder, ...pages] : [...pages];
  const rows = [];
  for (const doc of corpus) {
    const id = String(doc?.id || '');
    if (!id) continue;
    const record = knownRecord(knowledge, id);
    if (!record && !includeUnseen) continue;
    rows.push({
      ...baseRow(doc, REGISTER.FILE),
      seen: !!record,
      firstSeenRunId: record?.firstSeenRunId || '',
      count: record?.count || 0,
    });
  }
  return rows;
}

/**
 * The HOLDINGS: what the company has that nobody went and found.
 *
 * These are always listed. They are the file's own contents rather than
 * anything the operator carried out, and a filing cabinet does not conceal its
 * own drawer.
 */
export function holdingsRegisterRows({ dossier = [] } = {}) {
  return dossier.map((doc) => ({
    ...baseRow(doc, REGISTER.HOLDINGS),
    seen: true,
    firstSeenRunId: '',
    count: 0,
  }));
}

/** Resolve a row's citations against every register in play. */
export function resolveCitations(row, rows) {
  if (!row?.cites?.length) return [];
  const byId = new Map(rows.map((entry) => [entry.id, entry]));
  return row.cites.map((id) => byId.get(id) || null).filter(Boolean);
}

/** Every reference the registry knows, for the tests and the audit tools. */
export function registryReferences() { return { ...REFERENCE }; }
export function filingNotes() { return { ...FILING_NOTE }; }
