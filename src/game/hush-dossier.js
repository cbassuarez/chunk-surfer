export const HUSH_DOSSIER = Object.freeze([
  Object.freeze({
    id: 'reference-requirement', title: 'REFERENCE REQUIREMENT', source: 'FACULTY CIRCULAR 14-R', date: 'REISSUED 03 OCT 1987', status: 'MANDATORY / SIGN-OFF REQUIRED',
    paragraphs: [
      'No submitted performance is complete until the player can name every deviation from the departmental reference. After any correction, rewind to the beginning of the passage. Do not audition the repair in isolation.',
      'Tutors will enter reference-listening hours beside performance hours. A student unable to distinguish the live attack from the issued attack has not listened enough.',
      'PENCIL ADDITION, INITIALS ILLEGIBLE: The room counts the rewinds even when the tutor does not.',
    ],
  }),
  Object.freeze({
    id: 'second-performance', title: 'THE SECOND PERFORMANCE', source: 'NOTE FOUND IN M5 DECK', date: 'UNDATED / PAPER STOCK 1989', status: 'NOT ENTERED IN STUDENT FILE',
    paragraphs: [
      'At pass 12 we stopped together. The room stopped after us. At pass 19, somebody breathed before I pressed PLAY.',
      'I put one ear to the ensemble and one to the reference. They have run together. There is only the thick part now, and it knows the entrance better than I do.',
      'If I miss it, it supplies the note. If I play it, it was already there.',
    ],
  }),
  Object.freeze({
    id: 'incident-17', title: 'INCIDENT 17', source: 'CONSERVATORY HEALTH OFFICE', date: '17 FEB 1991 / 02:14–06:40', status: 'CLOSED AS FATIGUE EVENT',
    paragraphs: [
      'Supervisor dismissed the quartet at 02:14. One student remained at the monitor, marking entrances for a fifth chair. Witness statements disagree on whether either reel was moving.',
      'At 05:58 the student answered questions with take numbers. At 06:40 the chair was empty. Headphones were warm. The deck counter continued with both transport motors isolated.',
      'TRANSFER CLERK, 1998: Same waveform filed under CHUNK SURFER. Do not list as a person. List as continuing performance.',
    ],
  }),
  Object.freeze({
    id: 'density-sites', title: 'DENSITY SITES', source: 'ACOUSTIC RISK REGISTER', date: 'REVISION 6 / SITES 03–31', status: 'INTERNAL / CLAIMS SUPPORT',
    paragraphs: [
      'High recurrence: conservatories, examination rooms, scoring stages, rehearsal libraries. Low recurrence: clubs, domestic radios, public address systems. Instrument, repertoire, and electrical supply show no useful correlation.',
      'Common factors are retained acoustics, exact replay, named errors, and consequences for an incorrect performance. Risk rises sharply when listening is logged as labour.',
      'Ordinary musical use produces measurable density without organization. No intervention authorized below the repeat-attention threshold.',
    ],
  }),
  Object.freeze({
    id: 'before-first-bar', title: 'BEFORE THE FIRST BAR', source: 'PRE-ROLL ANALYSIS 4417-B', date: 'CAPTURES A–E / FIVE ROOMS', status: 'ENGINEERING DISPUTE OPEN',
    paragraphs: [
      'The same displacement begins 1.8 seconds before the first intentional sound in all five captures. Head block contamination rejected: interval survives deck, stock, and operator substitution.',
      'Do not label this MUSIC BLEED. The interval precedes the bar used to define it. Music gives the interval repeatable edges; it does not supply the material inside them.',
      'Margin query: If the first bar is removed, why does the pre-roll remain?',
    ],
  }),
  Object.freeze({
    id: 'transfer-without-owner', title: 'TRANSFER WITHOUT OWNER', source: 'W. ELLERY HOLDINGS / SCHEDULE K', date: 'EFFECTIVE 01 JAN 2004', status: 'AUTOMATIC RENEWAL / AUTHORITY UNVERIFIED',
    paragraphs: [
      'Assignee accepts the monitoring obligation together with fixtures, recordings, corrective works, issued personnel, and all items described as returned whether or not presently in possession.',
      'Original authority: no matching officer, company, estate, trust, or living person found. Counsel recommends termination. Schedule K renews upon each attempted termination and records acceptance one business day earlier.',
      'ELLERY HAND: We did not buy this contract. It arrived in the completion bundle already signed by us.',
    ],
  }),
  Object.freeze({
    id: 'work-order-4417-c', title: 'WORK ORDER 4417-C', source: 'OPERATIONS COPY / CARBON 3', date: 'ISSUED 21:10 / SITE NIGHT', status: 'DO NOT CLOSE UNTIL RETURNED COLUMN CLEARS',
    paragraphs: [
      'Attend five rooms. Collect the spoken name and consent of each operator. Produce one clean reference per room. Mark deviations as exploitable signal. Do not combine rooms on a single take sheet.',
      'Demolition may begin only after recorders, keys, treatments, operators, and unresolved contacts appear in the RETURNED column. A replacement operator does not clear the original line.',
      'STAMP, WRONG INK: ORDER REPEATED / PROPERTY OPTIONAL.',
    ],
  }),
  Object.freeze({
    id: 'returned-before-entry', title: 'RETURNED BEFORE ENTRY', source: 'TRANSFER DECK CLOCK SHEET', date: 'DECK 00:00:00 / GATE 22:41:16', status: 'CLOCKS VERIFIED / RESULT WITHHELD',
    paragraphs: [
      'Gate entry: 22:41:16. First contact on source: 22:39:04. Prop displacement resolved on source: 22:40:11. Operator voice: 22:42:03. All four clocks passed substitution test.',
      'Second transport contains causes for the first transport events. Where the cause is not performed, the source loses an interval of equal length and resumes with the event intact.',
      'Technician refused signature. Deck had already entered his name in RETURNED.',
    ],
  }),
]);

export function dossierRecord(id) {
  return HUSH_DOSSIER.find((record) => record.id === id) || null;
}
