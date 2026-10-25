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
const milestone = (id, label, done = false) => ({ id, label, state: done ? 'done' : 'current' });
const record = (id, label, text) => ({ id, label, text });
const closure = (label, text) => ({ label, text });
function represent(value, fields = {}) {
  const result = { nature: 'lead', commitment: 'none', stage: { id: 'open', label: 'Open' },
    nextLabel: null, milestones: [], records: [], closure: null, followUp: null,
    trackable: false, hasOpenCommitment: false, trackingKey: value.id, ...value, ...fields };
  // A later request has its own purpose and tracking identity. It never
  // overwrites the original agreement's commitment, state or closure.
  if (result.followUp) {
    result.next = result.followUp.next;
    result.nextLabel = result.followUp.nextLabel;
    result.stage = result.followUp.stage;
    result.location = result.followUp.location || result.location;
  }
  return result;
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
    const mapRoom = marked || rooms.find(r => !r.recorded && typeof r.roomId === 'string' && r.roomId.trim());
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
        : marked ? `Continue the work in ${marked.label || marked.roomId}.` : 'Review the remaining rooms in the work order.'),
      evidence: rooms.filter(r => r.recorded).map(r => `${r.label || r.roomId}: recorded.`),
      outcome: complete ? 'Every room on the work order has a recorded take.' : null,
      location: guidanceLabel ? guidanceLocation : mapRoom ? place(mapRoom.label || mapRoom.roomId, null, mapRoom.roomId) : null,
    }));
  }

  const bar = pub?.phase && pub?.favors ? pub : pubQuestState(pub ?? flags);
  if (bar.offered || bar.accepted || bar.declined) {
    const knownFavors = [bar.favors?.opener, bar.favors?.orderbook].filter(f => f?.offered || f?.accepted || f?.declined || f?.returned);
    const favor = knownFavors.find(f => !f.returned) || knownFavors.at(-1);
    const declined = !bar.accepted && bar.declined;
    let next = null;
    // Live derived state can be ahead of the serialized flags.
    if (!bar.complete && !declined && bar.accepted) next = {
      accepted: 'Pick up Iona’s tray with two waters from the public counter.',
      'carrying-waters': 'Take the two waters to Mavis and Ed near the entrance.',
      'served-waters': 'Collect the empty glasses from Bert and Farah at the dominoes table.',
      'carrying-empties': 'Return the tray and empty glasses to Iona.',
    }[bar.phase] || 'Return to Iona at The Lyric.';
    if (!bar.accepted && !declined) next = 'Decide whether to give Iona a hand. You have not promised to help.';
    if (favor?.returned) next = null;
    else if (favor?.accepted) next = favor.carried ? `Return Iona’s ${favor.id === 'opener' ? 'bottle opener' : 'order book'} to her at The Lyric.`
      : favor.id === 'opener' ? 'Find Iona’s bottle opener in the conservatory staff kitchen.'
        : 'Find The Lyric’s order book in the front-of-house box office.';
    else if (favor) next = favor.declined ? null : 'Decide whether to take on Iona’s request. You have not promised another errand.';
    const evidence = [];
    if (bar.watersServed) evidence.push('The waters were served.');
    if (bar.emptiesCollected) evidence.push('The empty glasses were collected.');
    if (bar.complete) evidence.push('The tray was returned to Iona.');
    for (const f of [bar.favors?.opener, bar.favors?.orderbook]) if (f?.returned)
      evidence.push(`${f.id === 'opener' ? 'Bottle opener' : 'Order book'} returned.`);
    const serviceMilestones = [];
    if (bar.accepted) {
      serviceMilestones.push(milestone('tray', 'Take the two waters from the public counter.', bar.trayTaken));
      if (bar.trayTaken) serviceMilestones.push(milestone('waters', 'Serve Mavis and Ed by the entrance: bus badge and work jacket.', bar.watersServed));
      if (bar.watersServed) serviceMilestones.push(milestone('empties', 'Collect Bert and Farah’s empty glasses from the domino table.', bar.emptiesCollected));
      if (bar.emptiesCollected) serviceMilestones.push(milestone('return-tray', 'Return the tray and glasses to Iona.', bar.complete));
    }
    const serviceRecords = [record('service-request', 'Iona’s request', bar.detailsKnown
      ? 'Iona cannot get away from the bar. She asked for waters taken out, empty glasses collected and the tray returned.'
      : 'Iona asked for a hand with waters and empty glasses; you have not heard the full arrangement.')];
    if (bar.historicalDeclined && bar.accepted) serviceRecords.push(record('service-declined', 'An earlier answer', 'You first declined, then agreed to help.'));
    if (bar.accepted) serviceRecords.push(record('service-agreement', 'A turn round the tables', 'You agreed to take the waters, clear the empty glasses and return the tray.'));
    if (bar.declined) serviceRecords.push(record('service-declined', 'No promise made', 'You declined to help with the service. Iona left the choice open.'));
    if (bar.complete) serviceRecords.push(record('service-returned', 'Tray returned', 'You returned the tray and empty glasses. The service you agreed to give is finished.'));
    for (const f of knownFavors) {
      const name = f.id === 'opener' ? 'Bottle opener' : 'Order book';
      const recognition = f.id === 'opener'
        ? 'Flat steel, LYRIC stamped beside the hole. Lent to the staff kitchen for a leaving do.'
        : 'Brown cover, red cloth spine. Lent to the box office; Iona’s father’s old supplier numbers are in the back.';
      serviceRecords.push(record(`${f.id}-request`, name, recognition));
      if (f.historicalDeclined && f.accepted) serviceRecords.push(record(`${f.id}-declined`, 'An earlier answer', `You declined the ${f.id === 'opener' ? 'bottle opener' : 'order book'} favor before agreeing to it.`));
      if (f.returned) serviceRecords.push(record(`${f.id}-returned`, `${name} returned`, 'You gave it back to Iona at The Lyric.'));
      else if (f.accepted) serviceRecords.push(record(`${f.id}-agreement`, 'Another promise', `You agreed to bring back the ${f.id === 'opener' ? 'bottle opener' : 'order book'}.`));
      else if (f.declined) serviceRecords.push(record(`${f.id}-declined`, 'No further promise', `You declined to fetch the ${f.id === 'opener' ? 'bottle opener' : 'order book'}.`));
    }
    const favorName = favor?.id === 'opener' ? 'Iona’s bottle opener' : 'The Lyric’s order book';
    const followUp = favor ? { id: favor.id, label: favorName,
      commitment: favor.returned ? 'fulfilled' : favor.accepted ? 'accepted' : favor.declined ? 'declined' : 'none',
      stage: { id: `${favor.id}:${favor.phase}`, label: favor.returned ? 'Returned' : favor.carried ? 'Bring it back to Iona' : favor.accepted ? 'Find the borrowed item' : favor.declined ? 'Declined' : 'Your choice' },
      nextLabel: favor.returned || favor.declined ? null : favor.accepted ? 'NEXT' : 'CHOICE', next,
      outcome: favor.returned ? 'You returned the borrowed item to Iona.'
        : favor.declined ? 'You did not agree to another errand. You can ask Iona again.' : null,
      milestones: favor.accepted ? [milestone(`${favor.id}:find`, favor.id === 'opener'
        ? 'Find the flat steel opener marked LYRIC in the staff kitchen.' : 'Find the brown order book with red cloth spine in the box office.', favor.carried || favor.returned),
        ...(favor.carried || favor.returned ? [milestone(`${favor.id}:return`, 'Return it to Iona at The Lyric.', favor.returned)] : [])] : [],
      location: favor.accepted && !favor.carried ? favor.id === 'orderbook'
        ? place('Box office', 'space:box-office') : place('Staff kitchen') : place('The Lyric', 'outside:lyric'),
    } : null;
    entries.push(represent(entry('lyric', 'A hand at The Lyric', 'The Lyric', {
      state: declined ? 'declined' : bar.complete ? 'resolved' : 'active',
      status: status(declined ? 'DECLINED' : bar.complete ? 'HELP GIVEN' : bar.accepted ? 'IN PROGRESS' : 'REQUEST HEARD', declined ? 'secondary' : bar.complete ? 'success' : 'amber'),
      summary: declined ? 'You declined Iona’s offer to help at the bar.'
        : bar.complete ? 'You helped Iona serve the waters and clear the glasses.'
          : bar.accepted ? 'You agreed to help Iona, who cannot get away from the bar.' : 'Iona asked for a hand. You have not agreed to the service.',
      next, evidence, outcome: declined ? 'No promise made.' : bar.complete ? 'The help you agreed to give is finished.' : null,
      location: place('The Lyric', 'outside:lyric'),
    }), { nature: bar.accepted ? 'undertaking' : 'lead', commitment: declined ? 'declined' : bar.complete ? 'fulfilled' : bar.accepted ? 'accepted' : 'none',
      stage: { id: `service:${bar.phase}`, label: bar.complete ? 'Service finished' : declined ? 'Declined' : bar.accepted ? 'A turn round the tables' : 'Your choice' },
      nextLabel: bar.accepted && !bar.complete ? 'NEXT' : !bar.accepted && !declined ? 'CHOICE' : null,
      milestones: serviceMilestones, records: serviceRecords,
      closure: bar.complete ? closure('Service fulfilled', 'The waters were served, the empty glasses collected and the tray returned to Iona.')
        : declined ? closure('Declined', 'You made no promise to help with the service.') : null,
      followUp, trackingKey: `quest:lyric:${favor?.id || 'service'}`,
      hasOpenCommitment: bar.accepted && !bar.complete || !!favor?.accepted && !favor.returned,
      trackable: bar.accepted && !bar.complete || !bar.accepted && !declined || !!favor && !favor.declined && !favor.returned,
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
      summary: declined ? 'You left the shapes in the fountain.'
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
  return entries.map(value => {
    if (value.id === 'quest:lyric') return value;
    if (value.id === 'quest:work-order') {
      const fulfilled = value.state === 'resolved';
      const unfinished = rooms.find(r => !r.recorded);
      return represent(value, { nature: 'undertaking', commitment: fulfilled ? 'fulfilled' : 'assigned',
        stage: { id: guidance?.id || (fulfilled ? 'recordings:finished' : 'recordings:work'),
          label: fulfilled ? 'Recordings finished' : guidance?.required === true ? 'Required route remains'
            : rooms.length ? `${rooms.filter(r => r.recorded).length} / ${rooms.length} recorded` : 'Work issued' },
        nextLabel: value.next ? guidance?.required === false ? 'OPTIONAL' : 'NEXT' : null,
        milestones: rooms.filter(r => r.recorded || r === unfinished).map(r => milestone(r.roomId, r.label || r.roomId, r.recorded)),
        records: rooms.filter(r => r.recorded).map(r => record(`take:${r.roomId}`, r.label || r.roomId, 'A room-tone take is on the recorder.')),
        closure: fulfilled ? closure('Work recorded', value.outcome) : null,
        hasOpenCommitment: !fulfilled, trackable: !fulfilled && !!value.next,
      });
    }
    if (value.id === 'quest:ren') {
      const returned = ren.stage === 'returned', declined = ren.stage === 'refused', withdrawn = ren.stage === 'withheld';
      const investigated = ren.warningRespected === true;
      const fulfilled = returned || investigated;
      const promised = ['accepted', 'carrying'].includes(ren.stage) && !investigated;
      const records = [];
      if (ren.stage !== 'new') records.push(record('memory-request', 'Ren’s request', promised || fulfilled || withdrawn || declined
        ? 'Ren wants the HOME cassette back. You were asked to read the release warning before deciding what to hand over.'
        : 'Ren asked about a cassette among their things in the stripped office.'));
      if (ren.indexRead) records.push(record('effects-index', 'The office index', 'You found the personal-effects index; the missing R page points through its carbon trace to a drawer.'));
      if (ren.envelopeRead) records.push(record('release-warning', 'Ren’s own refusal', 'The release envelope contains Ren’s earlier refusal. Returning the cassette remains a deliberate decision.'));
      if (ren.tapeListened) records.push(record('private-tape', 'The HOME cassette', 'You played the private cassette.'));
      if (investigated) records.push(record('left-warning', 'Left in the drawer', 'After reading the warning, you left the cassette where it was.'));
      if (returned) records.push(record('memory-returned', 'Cassette returned', ren.tapeHonesty === 'admitted'
        ? 'You returned the cassette and admitted listening.' : ren.tapeHonesty === 'lied'
          ? 'You returned the cassette and said you had kept it sealed.' : 'You returned the cassette without listening on your own.'));
      if (withdrawn) records.push(record('memory-kept', 'Cassette kept', 'You chose to keep the cassette instead of handing it to Ren.'));
      if (declined) records.push(record('memory-declined', 'Request declined', 'You chose not to overrule the person who wrote the warning.'));
      const sealKnown = ren.sealOffered || ren.sealConsented || ren.locks.sealRefused || ren.ritualComplete;
      const followUp = sealKnown ? { id: 'seal', label: 'Ren’s further request',
        commitment: ren.ritualComplete ? 'fulfilled' : ren.locks.sealRefused ? 'declined' : ren.sealConsented ? 'consented' : 'none',
        stage: { id: ren.ritualComplete ? 'seal:completed' : ren.locks.sealRefused ? 'seal:declined' : ren.sealConsented ? 'seal:agreed' : 'seal:offered',
          label: ren.ritualComplete ? 'Agreement kept' : ren.locks.sealRefused ? 'Further request declined' : ren.sealConsented ? 'Your explicit agreement' : 'Your choice' },
        nextLabel: ren.ritualComplete || ren.locks.sealRefused ? null : ren.sealConsented ? 'NEXT' : 'CHOICE',
        next: ren.ritualComplete || ren.locks.sealRefused ? null : ren.sealConsented ? 'Return to Ren for the agreement you made.' : 'Decide whether to accept Ren’s further request.',
        outcome: ren.ritualComplete ? 'You completed the further agreement.' : ren.locks.sealRefused ? 'Ren promised not to ask you again.' : null,
        location: place('Roof / Ren', 'space:academic-roof'),
      } : null;
      const parentNext = investigated ? value.next : fulfilled || withdrawn || declined ? null : value.next;
      return represent(value, { nature: ren.stage === 'offered' || ren.stage === 'new' ? 'lead' : 'undertaking',
        commitment: declined ? 'declined' : withdrawn ? 'withdrawn' : fulfilled ? 'fulfilled' : promised ? 'accepted' : 'none',
        state: declined ? 'declined' : fulfilled || withdrawn ? 'resolved' : 'active',
        status: status(returned ? 'CASSETTE RETURNED' : investigated ? 'WARNING RESPECTED' : declined ? 'DECLINED' : withdrawn ? 'KEPT' : 'OPEN', fulfilled || declined || withdrawn ? 'secondary' : 'amber'),
        summary: returned ? 'You returned Ren’s HOME cassette.' : investigated ? 'You investigated the cassette, read the warning and left it in the drawer.'
          : withdrawn ? 'You chose to keep the HOME cassette.' : declined ? 'You declined to retrieve the cassette.'
            : promised ? 'You agreed to investigate the cassette and read its warning before deciding what to hand over.' : 'Ren asked about a cassette in the stripped office.',
        next: parentNext, nextLabel: parentNext ? investigated ? 'OPTIONAL' : ren.envelopeRead || ren.stage === 'offered' ? 'CHOICE' : 'NEXT' : null,
        stage: { id: `memory:${ren.stage}`, label: returned ? 'Cassette returned' : investigated ? 'Warning respected' : withdrawn ? 'Cassette kept' : declined ? 'Declined' : ren.stage === 'accepted' ? 'Read before deciding' : 'HOME cassette' },
        milestones: [ren.indexRead && milestone('index', 'Read the personal-effects index.', true),
          ren.traceRead && milestone('trace', 'Follow the missing page’s carbon trace.', true),
          ren.envelopeRead && milestone('warning', 'Read the release warning.', true),
          promised && !ren.envelopeRead && milestone('investigate', 'Investigate the office and read before deciding.'),
          ren.stage === 'carrying' && milestone('decide', 'Decide whether to return or keep the cassette.'),
          returned && milestone('return', 'Return the cassette to Ren.', true)].filter(Boolean),
        records, closure: returned ? closure('Cassette errand fulfilled', 'You returned the HOME cassette. Any further request is a separate decision.')
          : investigated ? closure('Investigation fulfilled', 'You read the warning and chose to leave the cassette. You promised to look before deciding, not to overrule the warning.')
            : withdrawn ? closure('You kept the cassette', 'You withdrew from handing it over.') : declined ? closure('Declined', 'You did not promise to retrieve it.') : null,
        followUp, trackingKey: `quest:ren:${sealKnown ? 'seal' : 'memory'}`,
        hasOpenCommitment: promised || !!followUp && followUp.commitment === 'consented',
        trackable: promised || !!parentNext || !!followUp?.next,
      });
    }
    if (value.id === 'quest:academic-admission') {
      const admitted = door.admitted;
      return represent(value, { nature: admitted ? 'record' : 'lead', commitment: 'none',
        stage: { id: admitted ? 'admission:earned' : clues.length ? 'admission:learned' : 'admission:lead', label: admitted ? 'Admitted' : 'An answer and its pause' },
        nextLabel: admitted ? null : 'OPTIONAL', trackable: !admitted,
        milestones: admitted ? [milestone('welcome', 'Complete the attendants’ welcome.', true)] : [],
        records: clues.map(c => record(c.id, c.title, 'This source explained the reception’s welcome.')),
        closure: admitted ? closure('Welcome completed', 'You were admitted. You made no promise to remain upstairs.') : null,
      });
    }
    if (value.id === 'quest:borrowed-voice') {
      const lent = company.consent === 'lent', explained = company.consent === 'unasked';
      return represent(value, { nature: explained ? 'lead' : 'record',
        commitment: lent ? 'consented' : company.consent === 'declined' ? 'declined' : 'none',
        stage: { id: `voice:${company.consent}`, label: lent ? 'Revocable permission' : explained ? 'Your choice' : 'Your own voice' },
        nextLabel: explained || lent ? 'CHOICE' : null, trackable: explained,
        records: [record('voice-boundary', 'One breath is permission, not a promise', lent || company.topics.emile?.includes('need')
          ? 'Emile may use the breath you lend. You can withdraw through him or Lucien, leave the floor, or let it end. You do not owe the room a performance.'
          : 'Emile wants a living breath. Permission to use it is not a promise to stay upstairs.'),
          ...(value.outcome ? [record(`voice:${company.consent}`, 'Your decision', value.outcome)] : [])],
        closure: value.outcome ? closure('Your voice is your own', value.outcome) : null,
      });
    }
    if (value.id === 'quest:last-reception') {
      const delivered = invitation.status === 'delivered', abandoned = invitation.status === 'declined' && invitation.declinedReason === 'abandoned';
      const carrying = invitation.status === 'carrying';
      return represent(value, { nature: 'undertaking', commitment: delivered ? 'fulfilled' : carrying ? 'accepted' : abandoned ? 'withdrawn' : 'declined',
        stage: { id: `invitation:${invitation.status}`, label: delivered ? 'Invitation delivered' : carrying ? 'A quiet message' : abandoned ? 'Message left with them' : 'Declined' },
        nextLabel: carrying ? 'NEXT' : null, trackable: carrying, hasOpenCommitment: carrying,
        milestones: carrying || delivered ? [milestone('invitation', 'Quietly invite the person at the window to join the others.', delivered)] : [],
        records: [record('why-quiet', 'A quiet invitation', 'The person who asked will not call across the room: everyone would listen for news and look at the living visitor. You were asked only to pass on an invitation; he need not accept it.'),
          ...(delivered ? [record('message-delivered', 'Message delivered', 'You told him there is room by the others. He can look again later.')] : []),
          ...(invitation.settled ? [record('joined-company', 'He joined the company', 'He turned from the window for a while.')] : []),
          ...(invitation.acknowledged ? [record('thanks', 'You spoke again', 'You returned to the person who asked.')] : [])],
        closure: delivered ? closure('Promise fulfilled', 'The message has been delivered. His decision and any return conversation are not further work you owe.')
          : !carrying ? closure(abandoned ? 'Promise withdrawn' : 'Declined', value.outcome) : null,
      });
    }
    if (value.id === 'quest:marble-eyes') {
      const carried = eyes.phase === 'carried';
      return represent(value, { nature: carried ? 'lead' : 'record', commitment: eyes.phase === 'declined' ? 'declined' : 'none',
        stage: { id: `eyes:${eyes.phase}`, label: carried ? 'A possible fit' : eyes.phase === 'returned' ? 'Eyes returned' : 'Left in the water' },
        nextLabel: carried ? 'CHOICE' : null, trackable: carried,
        records: [record(`eyes:${eyes.phase}`, 'Your decision', value.summary)],
        closure: carried ? null : closure('Decision recorded', value.outcome),
      });
    }
    return represent(value, { nature: 'record', commitment: 'none', stage: { id: 'telephone:record', label: 'Call record' },
      records: value.evidence.map((line, index) => record(`telephone:${index}`, 'Received', line)),
      closure: closure('Call ended', 'This records what the telephone left behind. It is not a promise to make another call.'),
      trackingKey: 'quest:source-telephone', trackable: false,
    });
  });
}
