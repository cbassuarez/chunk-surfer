import { CREDITS } from '../data/credits.js';

// One musical statement. Legal/source details remain available in the complete,
// static record; the automatic programme gives people room to be recognised.
export const CREDIT_PROGRAM_SECONDS = 196.008;
export const CREDIT_CARD_MIN_HOLD = 5.5;
export const CREDIT_PROGRAM_BLACK_HOLD = 1.6;
const words = value => String(value || '').trim().split(/\s+/u).filter(Boolean).length;
const strings = values => (values || []).map(value => String(value ?? ''));
// Source-record process notes remain in READ RECORD, not in the human-name
// programme. Positive credit evidence is retained rather than guessing authors.
export function isCreditRecognitionLine(text) {
  const value = String(text || '').trim();
  if (!value || /^(https?:|Adapted:|Also spatially|Excerpted,|Commons derivatives|Public source parts:|Creator reports |Temporary piano|CC BY |NASA archive material|Electronic revoicing|Performed timing|Published HQ|Ordinary shoe|Original lossless studio|Latin recitations|Five-part recorded|Contemporary material)/iu.test(value)) return false;
  // This is a duplicate combined attribution + long modification statement.
  // Its credited scan author is already the section's first source line.
  if (/^Infinite, 3D Head Scan by /u.test(value)) return true;
  return true;
}

// Reviewed against the original source sentences. Entries are exact substrings,
// not identity guesses (in particular David Joseph and David Joseph Stith stay
// distinct). If the canonical source changes, fall back to its complete credit
// line rather than silently keeping a stale or incomplete name.
const VERIFIED_RECOGNITION = Object.freeze({
  'Chunk Surfer': [[0, ['Sebastian Suarez-Solis']]],
  'Anatomical Reference Models': [[0, ['Browne K., Schlehlein H., Herr II B. W.,', 'Quardokus E., Bueckle A., Börner K.']], [1, ['Kristen Browne']]],
  'Stillness — Human Relief Scan': [[0, ['Lee Perry-Smith']], [4, ['Lee Perry-Smith', 'www.triplegangers.com']]],
  'Window Collage Footage': [
    [0, ['Renato Morselli']], [1, ['George Si']], [2, ['Estormiz']], [3, ['John Fowler']],
    [4, ['Adrian Parsons']], [5, ['Oscar Gil Fernández']], [6, ['Otranto and Eberhard']],
    [7, ['Dr. W.E. Burr']], [8, ['Sebastian Suarez-Solis']], [9, ['Brandizzi']],
    [13, ['William Kennedy-Laurie Dickson / William Heise', 'Walter Murch and Sean Cullen']],
  ],
  'Sheet Music Recordings': [[0, ['J. S. BACH', 'KIMIKO ISHIZAKA']], [1, ['C. MONTEVERDI']],
    [2, ['J. DOWLAND', 'SOPRANO AND LUTE']], [3, ['F. COUPERIN', 'DAVID JOSEPH']],
    [4, ['E. SATIE', 'MICHAEL LAUCKE, GUITAR']], [5, ['W. A. MOZART', 'MUSOPEN']]],
  'Arrival — Cab Radio': [[1, ['Franz Schubert']], [2, ['Awadagin Pratt and Lucy Hattemer']],
    [5, ['Anton Diabelli', 'PianoMelodyNotes Gabry']], [8, ['William Anders, Jim Lovell and Frank Borman', 'NASA audio courtesy Kipp Teague.']]],
  'Standing Tear — Retained Music': [[0, ['Chunk Surfer canonical student material']],
    [2, ['François Couperin', 'David Joseph']], [6, ['J. S. Bach', 'Victor Eijkhout']]],
  'Source III — Harpsichord and Revoicing': [[0, ['François Couperin', 'David Joseph Stith']]],
  'Chapel Choir — Provisional Ensemble Treatment': [[0, ['Giovanni Pierluigi da Palestrina', 'The Tudor Consort']]],
});

function recognitionLines(section, sectionIndex) {
  const lines = strings(section.lines);
  const candidates = lines.map((text, index) => ({ text, index })).filter(item => isCreditRecognitionLine(item.text));
  const compact = !/Music|Radio|Harpsichord|Choir|Anatomical|Tools|Production|Chunk Surfer|Website|Copyright/iu.test(section.heading || '');
  const seen = new Map();
  const verified = new Map(VERIFIED_RECOGNITION[section.heading] || []);
  for (const item of candidates) {
    const fragments = verified.get(item.index);
    if (fragments && fragments.every(fragment => item.text.includes(fragment))) {
      for (const text of fragments) {
        const prior = seen.get(text);
        if (prior) prior.sourceLineIndices.push(item.index);
        else seen.set(text, { text, sourceLineIndices: [item.index] });
      }
      continue;
    }
    // The subtitle is already the opening attribution, not another creator.
    if (section.heading === 'Chunk Surfer' && item.index === 1) continue;
    let text = item.text;
    if (/^Infinite, 3D Head Scan by /u.test(text)) text = text.split('. Modified for Chunk Surfer:')[0];
    // Foley source titles belong in the source record. Recognise each credited
    // creator once per category rather than repeating their name per sample.
    if (compact && text.includes(' — ')) text = text.slice(text.indexOf(' — ') + 3)
      .replace(/\s*\((?:CC[^)]*|Public domain[^)]*)\)\.?$/iu, '').trim();
    const prior = seen.get(text);
    if (prior) prior.sourceLineIndices.push(item.index);
    else seen.set(text, { text, sourceLineIndices: [item.index] });
  }
  return [...seen.values()];
}

export function creditRecognitionCards(credits = CREDITS) {
  const cards = [];
  for (const [sectionIndex, section] of credits.entries()) {
    const label = String(section.heading || 'Credits');
    const lines = strings(section.lines);
    if (!lines.length) { cards.push({ id: `section-${sectionIndex}`, sectionIndex, label, lines: [''] }); continue; }
    // Roles are grouped by their credited person, never by an invented studio
    // or an inferred contribution. The full, unchanged lines remain in RECORD.
    if (label.toLowerCase() === 'production') {
      const people = new Map();
      for (const [lineIndex, line] of lines.entries()) {
        const split = line.indexOf(' — ');
        const role = split >= 0 ? line.slice(0, split) : '';
        const name = split >= 0 ? line.slice(split + 3) : line;
        if (!people.has(name)) people.set(name, { name, roles: [], sourceLineIndices: [] });
        const person = people.get(name);
        if (role) person.roles.push(role);
        person.sourceLineIndices.push(lineIndex);
      }
      for (const [i, person] of [...people.values()].entries()) cards.push({
        id: `section-${sectionIndex}-person-${i}`, sectionIndex, label: person.roles.join(' · ') || label, kind: 'names',
        lines: [person.name], sourceLineIndices: person.sourceLineIndices,
      });
    } else {
      const recognised = recognitionLines(section, sectionIndex);
      cards.push({ id: `section-${sectionIndex}`, sectionIndex, label: sectionIndex === 0 ? 'A game by' : label, kind: sectionIndex === 0 ? 'names' : 'body',
        lines: recognised.map(item => item.text),
        sourceLineIndices: recognised.flatMap(item => item.sourceLineIndices),
      });
    }
  }
  return cards;
}

export function creditCardMinimumSeconds(card) {
  return Math.max(CREDIT_CARD_MIN_HOLD, 2.6 + words([card.label, ...card.lines].join(' ')) / 3.2);
}

// The caller supplies actual-ROM wrapping and a measured capacity. No type is
// shrunk, name clipped or accelerated to force a viewport into the music cue.
export function createCreditProgram({ credits = CREDITS, paginate = card => [card.lines],
  openingSeconds = 3.8, closingSeconds = 4, quoteSeconds = 11.8,
  targetSeconds = CREDIT_PROGRAM_SECONDS, quiet = false } = {}) {
  const cards = creditRecognitionCards(credits).flatMap(card => {
    const pages = paginate(card);
    return (pages.length ? pages : [[]]).map((lines, page) => ({ ...card,
      id: `${card.id}-page-${page}`, page, pages: pages.length, lines: strings(lines),
      minHold: creditCardMinimumSeconds({ ...card, lines }),
    }));
  });
  const minimum = cards.reduce((sum, card) => sum + card.minHold, 0);
  const fixed = openingSeconds + closingSeconds + (quiet ? 0 : quoteSeconds + CREDIT_PROGRAM_BLACK_HOLD);
  const cardBudget = Math.max(minimum, targetSeconds - fixed);
  const extra = cards.length ? (cardBudget - minimum) / cards.length : 0;
  let at = openingSeconds;
  for (const card of cards) {
    card.duration = card.minHold + extra;
    card.start = at;
    at += card.duration;
    card.end = at;
  }
  return { cards, cardSeconds: cardBudget, minimumCardSeconds: minimum,
    openingSeconds, closingSeconds, quoteSeconds: quiet ? 0 : quoteSeconds,
    totalSeconds: fixed + cardBudget, closingAt: at };
}

// Each fragment retains its exact source text and line identity. It can be
// reconstructed byte-for-byte even where a URL needs a physical line break.
export function creditRecordPages({ credits = CREDITS, wrapLine = text => [text], capacity = 12 } = {}) {
  return credits.map((section, sectionIndex) => {
    const max = Math.max(1, Math.floor(typeof capacity === 'function' ? capacity(section, sectionIndex) : capacity));
    const fragments = strings(section.lines).flatMap((text, sourceLineIndex) => {
      const wrapped = wrapLine(text, section, sectionIndex);
      return (wrapped.length ? wrapped : ['']).map((value, fragmentIndex) => ({
        text: String(value), sourceText: text, sourceLineIndex, fragmentIndex,
      }));
    });
    const pages = [];
    for (let i = 0; i < fragments.length || !pages.length; i += max) pages.push({
      sectionIndex, heading: String(section.heading || 'Credits'),
      fragments: fragments.slice(i, i + max), lines: fragments.slice(i, i + max).map(part => part.text),
    });
    return { sectionIndex, heading: String(section.heading || 'Credits'), sourceLines: strings(section.lines), pages };
  });
}
