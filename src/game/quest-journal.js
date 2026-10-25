// A field record of existing decisions. This module owns no progress, clocks,
// discovery flags or navigation; every entry is derived anew from its owner.
import { pubQuestState } from './pub-quest.js';
import { normalizeRoofRenState } from './roof-ren.js';
import { createAcademicBouncerState } from './academic-bouncers.js';
import { createAcademicSocietyState } from './academic-society.js';
import { normalizeMarbleHead } from './marble-head.js';
import { ACADEMIC_BOUNCER_CLUES, ACADEMIC_BOUNCER_SPOKEN_CLUES,
  ACADEMIC_BOUNCER_CUE, ACADEMIC_BOUNCER_PHRASE } from '../data/academic-bouncers.js';

const object = value => value && typeof value === 'object' ? value : {};
const list = value => Array.isArray(value) ? value : [];
const status = (label, tone = 'metadata') => ({ label, tone });
const place = (label, spaceId = null, roomId = null) => ({ label,
  ...(spaceId ? { spaceId } : {}), ...(roomId ? { roomId } : {}) });
function entry(id, title, area, options = {}) {
  return { id: `quest:${id}`, title, area, category: 'lead', state: 'active',
    status: status('OPEN', 'amber'), summary: '', next: null, evidence: [], outcome: null,
    location: null, ...options };
}

export function buildQuestJournal({ save = {}, job = {}, bouncers = null, society = null,
  pub = null, marble = null, roofRen = null, guidance = null } = {}) {
  const data = object(save), flags = object(data.flags), entries = [];
  const rooms = list(job?.rooms), takes = new Set([...list(data.takes), ...list(data.rec?.takes)]);
  const knownJob = flags['bag.taken'] === true || flags['radio.work-order-read'] === true
    || rooms.some(r => r.recorded === true || takes.has(r.roomId));
  if (knownJob) {
    const done = rooms.filter(r => r.recorded === true).length;
    const guidanceLabel = typeof guidance?.label === 'string' ? guidance.label.trim() : '';
    const requiredGuidance = !!guidanceLabel && guidance.required === true;
    const complete = rooms.length > 0 && done === rooms.length && !requiredGuidance;
    const marked = rooms.find(r => r.marked && !r.recorded);
    const departed = flags['van.closed'] === true || flags['van.run-started'] === true;
    const guidanceRoom = typeof guidance?.roomId === 'string' && rooms.some(r => r.roomId === guidance.roomId)
      ? guidance.roomId : null;
    const guidanceSpace = typeof guidance?.spaceId === 'string' && /^(space:|outside:)[\w-]+$/.test(guidance.spaceId)
      ? guidance.spaceId : null;
    const guidanceLocation = guidanceRoom || guidanceSpace ? place(guidanceLabel, guidanceSpace, guidanceRoom) : null;
    entries.push(entry('work-order', 'The work order', 'Conservatoire', {
      category: 'assignment', state: complete ? 'resolved' : 'active',
      status: status(complete ? 'RECORDED' : rooms.length ? `${done} / ${rooms.length} RECORDED` : 'ISSUED', complete ? 'success' : 'amber'),
      summary: 'Capture the room tones named in the client’s work order.',
      next: guidanceLabel || (complete ? null : !flags['setup.levels'] && !departed ? 'Set your recorder levels in the Get In.'
        : marked ? `Continue the work in ${marked.label || marked.roomId}.` : 'Review the remaining rooms in the work order.',
      ),
      evidence: rooms.filter(r => r.recorded).map(r => `${r.label || r.roomId}: recorded.`),
      outcome: complete ? 'Every room on the work order has a recorded take.' : null,
      location: guidanceLabel ? guidanceLocation : marked ? place(marked.label || marked.roomId, null, marked.roomId) : null,
    }));
  }

  const bar = pub?.phase && pub?.favors ? pub : pubQuestState(pub ?? flags);
  if (bar.accepted || bar.declined) {
    const favor = [bar.favors?.opener, bar.favors?.orderbook].find(f => f?.accepted && !f.returned);
    const finished = bar.complete && !favor, declined = !bar.accepted && bar.declined;
    let next = null;
    // Live derived state can be ahead of the serialized flags.
    if (!bar.complete && !declined) next = {
      accepted: 'Pick up Iona’s tray with two waters from the public counter.',
      'carrying-waters': 'Take the two waters to Mavis and Ed near the entrance.',
      'served-waters': 'Collect the empty glasses from Bert and Farah at the dominoes table.',
      'carrying-empties': 'Return the tray and empty glasses to Iona.',
    }[bar.phase] || 'Return to Iona at The Lyric.';
    if (favor) next = favor.carried ? `Return Iona’s ${favor.id === 'opener' ? 'bottle opener' : 'order book'} to her at The Lyric.`
      : favor.id === 'opener' ? 'Find Iona’s bottle opener in the conservatory staff kitchen.'
        : 'Find The Lyric’s order book in the front-of-house box office.';
    const evidence = [];
    if (bar.watersServed) evidence.push('The waters were served.');
    if (bar.emptiesCollected) evidence.push('The empty glasses were collected.');
    if (bar.complete) evidence.push('The tray was returned to Iona.');
    for (const f of [bar.favors?.opener, bar.favors?.orderbook]) if (f?.returned)
      evidence.push(`${f.id === 'opener' ? 'Bottle opener' : 'Order book'} returned.`);
    entries.push(entry('lyric', 'A hand at The Lyric', 'The Lyric', {
      state: declined ? 'declined' : finished ? 'resolved' : 'active',
      status: status(declined ? 'DECLINED' : finished ? 'HELP GIVEN' : 'IN PROGRESS', declined ? 'secondary' : finished ? 'success' : 'amber'),
      summary: declined ? 'You declined Iona’s offer to help at the bar.'
        : favor ? 'Iona asked you to bring back something she lent to the school.'
          : bar.complete ? 'You helped Iona serve the waters and clear the glasses.' : 'You agreed to help Iona at the bar.',
      next, evidence, outcome: declined ? 'No promise made.' : finished ? 'The help you agreed to give is finished.' : null,
      location: favor?.accepted && !favor.carried ? favor.id === 'orderbook'
        ? place('Box office', 'space:box-office') : place('Staff kitchen') : place('The Lyric', 'outside:lyric'),
    }));
  }

  const ren = normalizeRoofRenState(roofRen ?? data.roofRen);
  if (ren.met) {
    const refused = ren.stage === 'refused' || ren.locks.sealRefused;
    const returned = ren.stage === 'returned';
    let next = null, destination = place('Roof / Ren', 'space:academic-roof');
    if (ren.stage === 'accepted') {
      destination = place('Stripped office', 'space:stripped-office');
      next = ren.warningRespected ? 'You left the cassette in its drawer. Tell Ren, or reconsider taking it.'
        : !ren.indexRead ? 'Look for the personal-effects index in the stripped office.'
          : !ren.traceRead ? 'Find the missing index page’s carbon intake pad at the office reception bank.'
            : !ren.cabinetOpened ? 'Use the index reference to find the cabinet drawer.'
              : !ren.envelopeRead ? 'Read the release envelope before deciding whether to sign.'
                : 'Decide whether to take the cassette after reading the warning.';
    } else if (ren.stage === 'carrying') next = 'Return to Ren with the HOME cassette, or decide to keep it.';
    else if (ren.stage === 'offered') next = 'Ask Ren what the cassette means before agreeing.';
    else if (ren.sealConsented && !ren.ritualComplete) next = 'Return to Ren for the agreement you made.';
    else if (returned && ren.sealOffered && !refused && !ren.ritualComplete) next = 'Decide whether to accept Ren’s further request.';
    const settled = refused || ren.stage === 'withheld' || (returned && !ren.sealOffered && !ren.sealConsented) || ren.ritualComplete;
    entries.push(entry('ren', 'Ren / HOME', 'Roof and stripped office', {
      state: refused ? 'declined' : settled ? 'resolved' : 'active',
      status: status(ren.ritualComplete ? 'AGREEMENT KEPT' : refused ? 'DECLINED'
        : ren.sealConsented ? 'AGREED' : returned ? 'RETURNED' : ren.stage === 'withheld' ? 'KEPT' : 'OPEN', settled ? 'secondary' : 'amber'),
      summary: ren.ritualComplete ? 'You completed the agreement you made with Ren.'
        : ren.sealConsented ? 'You deliberately agreed to Ren’s further request.'
          : returned ? 'You returned the HOME cassette to Ren.'
            : ren.stage === 'withheld' ? 'You chose to keep the HOME cassette.'
              : refused ? 'You declined Ren’s request.' : 'Ren spoke to you about the HOME cassette.',
      next, location: destination,
      evidence: [ren.indexRead && 'Personal-effects index read.', ren.envelopeRead && 'Release warning read.',
        ren.tapeListened && 'You played the HOME cassette.', returned && 'Cassette returned.'].filter(Boolean),
      outcome: refused ? 'Your answer remains part of this conversation.' : returned ? 'The cassette errand is finished.'
        : ren.stage === 'withheld' ? 'The cassette remains with you.' : null,
    }));
  }

  const door = createAcademicBouncerState(bouncers ?? data.academicBouncers);
  const clues = [...ACADEMIC_BOUNCER_CLUES, ...ACADEMIC_BOUNCER_SPOKEN_CLUES].filter(c => door.clues[c.id]);
  if (door.admitted || clues.length || door.clues.boxOffice) {
    const learned = clues.some(c => c.teachesPhrase);
    entries.push(entry('academic-admission', 'Finish the welcome', 'Third-floor stair', {
      state: door.admitted ? 'resolved' : 'active', status: status(door.admitted ? 'ADMITTED' : learned ? 'CUE LEARNED' : 'LEAD', door.admitted ? 'success' : 'amber'),
      summary: door.admitted ? 'Vera and Hugh have welcomed you into the reception.'
        : 'The attendants are still opening a reception upstairs.',
      next: door.admitted ? null : learned ? `Let Hugh finish “${ACADEMIC_BOUNCER_CUE}” In the pause before Vera replies, say “${ACADEMIC_BOUNCER_PHRASE}”`
        : 'Find out what the attendants are waiting to hear.',
      evidence: clues.map(c => c.title), outcome: door.admitted ? 'The third-floor reception is open to you.' : null,
      location: place('Academic stair loggia', 'space:academic-loggia'),
    }));
  }

  const company = createAcademicSocietyState(society ?? data.academicSociety);
  const knowsLoan = company.topics.emile?.includes('need') || company.topics.lucien?.includes('emile');
  if (knowsLoan || company.consent !== 'unasked') {
    const lent = company.consent === 'lent', declined = company.consent === 'declined';
    const resolved = !['unasked', 'lent'].includes(company.consent);
    const outcomes = { declined: 'You kept your voice.', withdrawn: 'You asked for your voice back.',
      left: 'You went downstairs with your own voice.', expired: 'The borrowed breath ended.' };
    entries.push(entry('borrowed-voice', 'One living breath', 'Third floor', {
      state: declined ? 'declined' : resolved ? 'resolved' : 'active',
      status: status(lent ? 'VOICE LENT' : declined ? 'DECLINED' : resolved ? 'YOUR VOICE AGAIN' : 'YOUR CHOICE', lent ? 'amber' : 'secondary'),
      summary: lent ? 'Emile is speaking with your voice.' : outcomes[company.consent] || 'Emile would like to borrow one living breath.',
      next: lent ? 'Ask Emile or Lucien for your voice back, or go downstairs.'
        : resolved ? null : 'Decide in front of Emile. You can keep your voice.',
      evidence: knowsLoan ? ['Emile’s request was explained in conversation.'] : [],
      outcome: outcomes[company.consent] || null,
      location: place(lent ? 'Emile / academic core corridor' : 'Third-floor company', 'space:academic-core'),
    }));
  }

  const reception = object(data.chunkSurf?.lastReception), invitation = object(reception.windowInvitation);
  if (['carrying', 'declined', 'delivered'].includes(invitation.status)) {
    const delivered = invitation.status === 'delivered', declined = invitation.status === 'declined';
    entries.push(entry('last-reception', 'Room by the others', 'The Last Reception', {
      state: declined ? 'declined' : delivered ? 'resolved' : 'active',
      status: status(declined ? invitation.declinedReason === 'abandoned' ? 'LEFT WITH THEM' : 'DECLINED'
        : delivered ? 'INVITATION GIVEN' : 'MESSAGE TO CARRY', delivered ? 'success' : declined ? 'secondary' : 'amber'),
      summary: delivered ? 'You quietly told the person at the window there is room by the others.'
        : declined ? 'You chose not to carry the invitation.' : 'You agreed to carry a quiet invitation to the person at the window.',
      next: delivered || declined ? null : 'Tell him there is room by the others. He can look again later.',
      evidence: [invitation.settled && 'He turned from the window and joined the company.',
        invitation.acknowledged && 'You returned to the person who asked.'].filter(Boolean),
      outcome: delivered ? invitation.settled ? 'He joined the others for a while.' : 'He heard the invitation; he can take his time.'
        : declined ? 'The offer can be discussed again without explanation.' : null,
      location: place('The Last Reception'),
    }));
  }

  const eyes = normalizeMarbleHead(marble ?? data.marbleHead);
  if (eyes.phase !== 'in-the-water') {
    const restored = eyes.phase === 'returned', declined = eyes.phase === 'declined';
    entries.push(entry('marble-eyes', 'The fountain eyes', 'Park and Academic gallery', {
      state: declined ? 'declined' : restored ? 'resolved' : 'active',
      status: status(declined ? 'LEFT IN THE WATER' : restored ? 'RETURNED' : 'CARRIED', restored ? 'success' : declined ? 'secondary' : 'amber'),
      summary: declined ? 'You understood what was in the fountain and left it there.'
        : restored ? 'You returned the eyes to the damaged gallery bust.' : 'You took the stone eyes from the fountain.',
      next: restored || declined ? null : 'Look for the gallery face with the corresponding empty sockets.',
      evidence: [restored && 'Both eyes are back in their sockets.', flags['key.servicesCore'] && 'You found the Plant Services key.'].filter(Boolean),
      outcome: declined ? 'That decision is settled for this night.' : restored ? 'The damaged face has its eyes again.' : null,
      location: declined ? place('Park fountain') : place('Academic gallery', 'space:academic-gallery'),
    }));
  }

  const called = Object.keys(flags).filter(k => k.startsWith('phone.called.') && flags[k] === true);
  const phoneKey = flags['phone.key.granted'] === true, phoneSheet = flags['phone.sheet.granted'] === true;
  const loopBroken = flags['phone.loop.broken'] === true;
  if (called.length || phoneKey || phoneSheet || loopBroken) {
    entries.push(entry('source-telephone', 'The telephone', 'Source roadside', {
      state: 'resolved', status: status('CALL RECORD', 'secondary'),
      summary: phoneSheet ? 'The telephone delivered a folded music sheet.'
        : phoneKey ? 'The telephone delivered a chapel key.' : loopBroken ? 'You answered the ringing telephone.' : 'You made a telephone call.',
      evidence: [phoneKey && 'Chapel key received.', phoneSheet && 'Music sheet received.',
        loopBroken && 'The ringing loop ended.'].filter(Boolean),
      outcome: 'The call has ended.', location: place('Source telephone box'),
    }));
  }
  return entries;
}
