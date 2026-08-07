// WHAT THE INSTITUTION WROTE DOWN.
//
// ENDING_REPLAY_UNLOCKS (progression/unlocks.js) has declared an `archiveEntry`
// per ending since it was written, and nothing has ever consumed one — the names
// were there, the documents were not. These are the documents.
//
// They are the only voice in this game that was not in the building. Somebody
// read a work order, a signing sheet and a set of files, and wrote a paragraph
// about a night they were not present for, in the register of a company that has
// never seen a ghost and has seen a great many open accounts. Every one of them
// is accurate. Not one of them is true.
//
// The rule for writing these: the document may state facts the player knows are
// wrong, and may not state anything the filer could not have got off paper. Where
// it is wrong, it is wrong in the direction of the paperwork.

const list = (...paragraphs) => Object.freeze(paragraphs.filter(Boolean));

export const ENDING_ARCHIVE = Object.freeze({
  // ── THE SEAL ───────────────────────────────────────────────────────────────
  'sealed-ledger': Object.freeze({
    id: 'sealed-ledger',
    title: 'SEALED LEDGER · 4417-C',
    classification: 'CONTAINMENT',
    filedBy: 'W. ELLERY · ESTATES',
    body: (s) => list(
      'Work order 4417-C is closed. The contractor signed received at 21:38 and did not sign out. Demolition proceeded on schedule at 06:00.',
      `Files recovered from site: ${s?.takes?.completed ?? 0}. Files usable: not assessed. The equipment schedule is short ${s?.equipment?.missing?.length ?? 0} items, which have been written off against the demolition rather than pursued.`,
      'The right-hand column of the gate register has been discontinued at the request of Estates. It was not a required field and its retention was causing questions from contractors at the point of signing in.',
      'No further action. The account is closed and the site no longer exists.',
    ),
  }),

  // ── HE TRIED TO HELP ───────────────────────────────────────────────────────
  'operator-annotation': Object.freeze({
    id: 'operator-annotation',
    title: 'OPERATOR ANNOTATION · GATE 4417',
    classification: 'INTERVENTION',
    filedBy: 'W. ELLERY · SECURITY',
    body: () => list(
      'The gate operator on shift has been spoken to regarding the provision of refreshments to contractors from a personal supply. This is not permitted under the site catering arrangement and has been logged.',
      'The operator states that he has done this on every night shift for a number of years and that nobody has previously raised it. This is accepted.',
      'The operator further states, and it is recorded here at his insistence, that he wishes it noted he offered a hot drink to the contractor on 4417-C before entry. He was advised that this is not a matter for the file.',
      'He has asked twice more since. It has been explained to him twice more.',
    ),
  }),

  // ── THE OTHER DOOR ─────────────────────────────────────────────────────────
  'engineering-appendix': Object.freeze({
    id: 'engineering-appendix',
    title: 'ENGINEERING APPENDIX · STRUCTURAL',
    classification: 'INVERSION',
    filedBy: 'CONSULTING ENGINEER',
    body: (s) => list(
      'We were instructed to comment on the partial collapse recorded at the site during the night of the archival capture, prior to the scheduled demolition.',
      'In our opinion the sequence described is not consistent with the failure of any element we surveyed. The described progression begins below ground and works upward, which is the reverse of what a building of this construction does when it lets go.',
      'We note the contractor was present throughout and that his account is internally consistent. We note also that he is a sound recordist and not an engineer, and that the majority of his account concerns what he could hear.',
      s?.equipment?.missing?.length
        ? 'Equipment left on site was not recovered. Given the demolition, recovery is not proposed.'
        : 'No equipment was left on site.',
      'We are unable to reconcile the recorded timings. We do not consider this material to the demolition, which has taken place.',
    ),
  }),

  // ── COLD, BITTER, GONE ─────────────────────────────────────────────────────
  'contaminant-report': Object.freeze({
    id: 'contaminant-report',
    title: 'CONTAMINANT REPORT · CONTRACTOR',
    classification: 'CONTAMINATION',
    filedBy: 'W. ELLERY · PROCUREMENT',
    body: (s) => list(
      `Delivered files were reviewed and rejected. ${s?.takes?.completed >= 5 ? 'All five' : 'Every one'} contains audible movement, speech and handling noise throughout. No clean minute was obtained in any room.`,
      'The contractor attributes this to intoxication and states that a substance was administered to him on site by a third party. He has not made a formal allegation and has declined to do so on two occasions.',
      'The gate operator denies it. There is no third party on the sheet. The contractor signed in at 21:38 and out at 05:51, and the sheet is in order.',
      'Procurement notes for the file that the contractor has worked for this company for eleven years without incident, and that his account of the night is delivered fluently, in order, and without contradiction.',
      'Recommendation: no further engagement. Not on grounds of the substance, on which we take no view, but on grounds of the files.',
    ),
  }),

  // ── THE OTHER RECORDIST ────────────────────────────────────────────────────
  'other-recordist': Object.freeze({
    id: 'other-recordist',
    title: 'PERSONNEL FILE · CLOSED',
    classification: 'EXTRACTION',
    filedBy: 'W. ELLERY · PERSONNEL',
    body: () => list(
      'The contractor engaged on the preceding survey, missing since the night of his attendance, has presented himself at the gate of the site in the company of the contractor engaged on 4417-C.',
      'He is in poor physical condition and has been admitted. He is able to give his name, his trade and the date of his attendance. He is not able to account for the intervening period and has been assessed as not currently a reliable historian.',
      'He has asked repeatedly about a keyring. It has been explained that the site has been demolished. He continues to ask.',
      'The gate register has him signed in and, as of 05:52, signed out. The right-hand column was completed by the operator on shift, who states that the column has existed for this purpose since he ruled it, and that he was asked once to remove it and did not.',
      'This file is closed on the grounds that he has returned. There is no other ground available on the form.',
    ),
  }),
});

export function endingArchiveEntry(id) {
  return ENDING_ARCHIVE[id] || null;
}

// Resolved against a return summary, because most of these quote the paperwork
// the run actually generated.
export function endingArchiveDocument(id, summary = null) {
  const entry = endingArchiveEntry(id);
  if (!entry) return null;
  return {
    id: entry.id,
    title: entry.title,
    classification: entry.classification,
    filedBy: entry.filedBy,
    body: entry.body(summary),
  };
}
