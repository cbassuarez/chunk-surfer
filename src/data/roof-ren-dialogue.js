// Authored roof conversation. The missing half is visible in the world; the
// transcript never needs a monster portrait or a separate illustration.
const line = (who, text) => ({ who, text });
const r = text => line('ren', text);
const d = text => line('direction', text);
const you = text => line('you', text);
const end = () => ({ speaker: 'REN', lines: [] });
const c = (id, text, goto, roofRenAction = null) => ({
  id: `roof-ren.${id}`, sourceId: `roof-ren.${id}`, text, goto,
  ...(roofRenAction ? { roofRenAction } : {}),
});
const node = (lines, choices, goto) => ({ speaker: 'REN', lines, ...(choices ? { choices } : {}), ...(goto ? { goto } : {}) });
const leave = c('leave', 'I need to go.', 'done');

function resumeAt(s, checks) {
  if (!checks.trustIntact) return 'closed';
  if (s.locks.sealRefused) return 'declined';
  if (!s.history.concern) return 'personal';
  if (!s.history.boundary) return 'boundary';
  if (!checks.noticeRead || !checks.heardSpirits) return 'grounded';
  if (!s.history.spirits) return 'witness';
  if (!s.history.city) return 'demolition';
  if (!s.history.uncertainty) return 'displaced';
  if (!checks.contraryAccountHeard) return 'dissent-where';
  if (!s.history.dissent) return 'dissent';
  if (!s.history.motives) return 'why-you';
  if (!checks.guarantorTraceRead) return 'guarantor-where';
  if (!s.history.previous) return 'precedent';
  if (!s.sealOffered) return 'plea';
  if (!s.history.terms) return 'terms';
  if (!s.history.cost) return 'cost';
  if (!s.history.freedom) return 'freedom';
  return 'consent';
}

function laterConversation(s, checks) {
  const groundedNext = !checks.noticeRead || !checks.heardSpirits ? 'grounded' : 'witness';
  const dissentNext = checks.contraryAccountHeard ? 'dissent' : 'dissent-where';
  const guarantorNext = checks.guarantorTraceRead ? 'precedent' : 'guarantor-where';
  return {
    personal: node([
      d('Ren keeps one finger on the cassette spool, as if feeling for a pulse.'),
      r('She was never cross about the music. Just the dinner getting cold.'),
      r('I used to hear that as an interruption. Imagine making an interruption the thing you spend the rest of your life wanting.'),
    ], [
      c('mother', 'Did you ever go home?', 'home'),
      c('stay-with-memory', 'We can sit here a minute. You do not have to explain it.', 'home-quiet'),
      c('exploit-memory', 'That voice could be worth something on a recording.', 'closed-extraction', 'transaction'),
      c('dismiss-memory', 'All of that for someone telling you to eat?', 'closed-cruel', 'cruelty'),
      leave,
    ]),
    home: node([
      r('Not that evening.'),
      d('The answer comes before you have finished the question.'),
      r('I do not know whether she waited, or went to bed, or came looking. It is a very small amount not to know. There is room for everything in it.'),
    ], [c('home-boundary', 'You knew I might find that warning.', 'boundary', 'concern'), leave]),
    'home-quiet': node([
      d('For a while there is only the air moving over the roof.'),
      r('Thank you. People usually want the part that explains the face.'),
    ], [c('quiet-boundary', 'There is still the warning on the envelope.', 'boundary', 'concern'), leave]),
    boundary: node([
      r('I wrote it. Twice. I knew exactly how to ask for what I wanted, and exactly why somebody ought to refuse.'),
      r('They kept it from me. Everybody obeyed. I have spent years being grateful and furious with them.'),
      r('I let you carry a decision I could not make twice without changing my mind. You can be angry about that.'),
    ], [
      c('boundary-clear', 'Why did you sign twice? Tell me what happened when you heard it.', 'warning-truth'),
      c('boundary-honest', 'I wanted to help. That does not make what you did fair. Tell me the part you left out.', 'warning-truth'),
      c('boundary-flattery', 'You can ask me for anything.', 'too-easy'),
      leave,
    ]),
    'too-easy': node([
      r('No. Please do not say that up here.'),
      d('The open side of Ren contracts, like a hand closing behind a curtain.'),
      r('There are things listening for an answer that careless. Give me a smaller one.'),
    ], [c('boundary-corrected', 'Then tell me what happened when you heard the tape.', 'warning-truth'), leave]),
    'warning-truth': node([
      r('The first time, I heard her call and answered. A student heard me from the stair. Another heard me inside a locked practice room. I was here, on this glass.'),
      d('The missing side of Ren bends toward the dark pane. For an instant, the pane seems to bend toward them.'),
      r('I signed the first refusal that night. A year later I still wanted her voice, so I signed again. That is the part I was afraid I would forget.'),
      r('I do not know what would have followed my answer into those rooms. I want the tape anyway. Both facts belong to me.'),
    ], [
      c('warning-hold-boundary', 'I can care about you and still need the whole cost before any other request.', groundedNext, 'boundary'),
      c('warning-dismiss', 'The refusals do not matter. I will do whatever you ask next.', 'closed-warning', 'warning-dismissed'),
      leave,
    ]),
    grounded: node([
      r('There is another question. I am not asking it yet.'),
      ...(!checks.noticeRead ? [r('Read the demolition notice downstairs. The date, the hour. Know what is actually coming; do not take it from me.')] : []),
      ...(!checks.heardSpirits ? [r('One accepted take opened this roof. Go inside and make another in a different room. Listen to what is there when the recording stops. I will not make their lives into a story you only heard from me.')] : []),
      r('Then come back if you still want to talk. The key was a thank-you. It was not an advance.'),
    ], [c('grounded-leave', 'I will decide after I have seen for myself.', 'done'), c('grounded-no-promise', 'I am not promising to come back.', 'no-promise')]),
    'no-promise': node([r('Good. Keep that part of yourself.')], null, 'done'),
    witness: node([
      r('The gate let you through on one take. Now you have listened in more than one room.'),
      r('I call what remains here people. You may not be ready to call them that. They still know where their rooms ought to be.'),
    ], [
      c('witness-human', 'They still have somewhere that belongs to them.', 'witness-habit'),
      c('witness-skeptic', 'I heard something. I cannot promise I understand what it was.', 'witness-careful'),
      c('witness-specimen', 'They would make extraordinary material.', 'closed-extraction', 'transaction'),
      leave,
    ]),
    'witness-habit': node([
      r('One of them still waits until the piano next door finishes before they begin. Nobody has needed to tell them to for forty years.'),
      r('I cannot prove to you what they are. I can tell you this is the only place where that pause has a meaning.'),
    ], [c('witness-habit-next', 'What happens to them if the rooms go?', 'demolition', 'spirits'), leave]),
    'witness-careful': node([
      r('Neither can I. Do not let me become the expert just because I am dead.'),
      r('They still keep the habits of people who expected to come back to their rooms.'),
    ], [c('witness-careful-next', 'Then what happens if those rooms are gone?', 'demolition', 'spirits'), leave]),
    demolition: node([
      r('Six in the morning. A machine takes the first bite, and the room somebody has been finding for forty years is open to the weather.'),
      r('The company sees an empty school. I see people about to lose the only address that still knows them.'),
    ], [
      c('city-consequence', 'What happens to the city if they have nowhere to go?', 'displaced', 'city'),
      c('demolition-denial', 'Perhaps losing the building would free them.', 'freedom-unknown', 'city'),
      leave,
    ]),
    'freedom-unknown': node([
      r('Perhaps. I want that to be true so badly that you should not trust me to tell you it is.'),
      r('I have seen one of us try to leave through a room that had been knocked down. I heard them from every drain on that street for a week.'),
    ], [c('freedom-city', 'And the people who live beyond that street?', 'displaced')]),
    displaced: node([
      r('I do not know what happens to all of us. Anyone who tells you they know is selling something.'),
      r('Some might end. Some might get out. Into stairwells, bedrooms, the buses people take home. There are children in the flats across the road.'),
      r('I am frightened for us. I am frightened of us. Both are true.'),
    ], [
      c('uncertainty-stay', 'Then saving the place buys time. It does not solve what happened here.', dissentNext, 'uncertainty'),
      c('uncertainty-demand', 'You are asking me to act without knowing what I would prevent.', dissentNext, 'uncertainty'),
      c('uncertainty-easy', 'Tell me what to do and I will fix it.', 'not-a-hero'),
      leave,
    ]),
    'not-a-hero': node([
      r('Please do not make yourself into the person who can fix everybody. This place loves that person.'),
      r('I can ask for time. I cannot promise you a cure.'),
    ], [c('uncertainty-corrected', 'Then be honest about what another century would buy.', dissentNext, 'uncertainty'), leave]),
    'dissent-where': node([
      r('There is a loose score on a chair in the cleared room, through the breach. It has an answer I cannot give on anyone else\'s behalf.'),
      r('You have heard me. Go hear the person who disagrees with me. Then come back if you still want to.'),
    ], [c('dissent-seek', 'I will find the score and listen for myself.', 'done'), leave]),
    dissent: node([
      you('The person in the cleared room would risk leaving, even if they might end. You kept saying they would lose their home.'),
      r('I did. It was easier to say that than to say some of us want these walls opened.'),
      r('I do not know whether the seal holds them here, or whether they are already unable to leave. I cannot count their fear as consent to stay.'),
    ], [
      c('dissent-account', 'Then you cannot call another century a rescue for every spirit.', 'dissent-admission'),
      c('dissent-dismiss', 'One frightened voice does not matter beside the rest.', 'closed-dissent', 'dissent-dismissed'),
      leave,
    ]),
    'dissent-admission': node([
      r('No. The school can be a home and a trap. I would be choosing time over their chance at an exit.'),
      r('If I ask you to make that choice too, you should know I benefit from it.'),
    ], [c('dissent-ask-ren', 'Tell me what you stand to keep.', 'why-you', 'dissent'), leave]),
    'why-you': node([
      r('Before you ask: yes, I want to keep my home. I want the stairs where I knew who was coming by the way they took them. I want that stupid draught under the practice-room door.'),
      r('I am not outside this. I do not get to sound noble about it.'),
    ], [
      c('motives-question', 'Why can you not save it yourself?', 'ren-cannot'),
      c('motives-suspicion', 'Is that why you wanted the cassette back? To make me care?', 'ren-admission'),
      leave,
    ]),
    'ren-cannot': node([
      r('Because a dead person cannot promise a living future. This is all the future I have.'),
      d('Ren lifts their intact hand. The other side follows a moment late and folds back into the body.'),
      r('It needs somebody the world still expects to go home.'),
    ], [c('ren-cannot-admission', 'And the cassette? Why ask me for that before this?', 'ren-admission'), leave]),
    'ren-admission': node([
      r('I wanted the cassette. That part is true. I also knew that if you saw me wanting something small, you might stay for the large thing.'),
      r('I am sorry. I can be lonely and calculating at the same time. You should know both before you answer.'),
    ], [
      c('admission-accountable', 'I can care about you and still ask who has paid for this before.', guarantorNext, 'motives'),
      c('admission-excuse', 'You were lonely. I would rather not hear what else you used me for.', 'closed-account', 'avoid-accountability'),
      leave,
    ]),
    'guarantor-where': node([
      r('In the chamber room, there is a dated slip under the piano bench. The last guarantor wrote it herself. I kept it because she asked me to.'),
      r('Read what she agreed to. Read what it cost her after she had already said yes. Do not take my summary.'),
    ], [c('guarantor-seek', 'I will read her account before you ask me to be the next.', 'done'), leave]),
    precedent: node([
      r('How else do you think music schools stay alive? It is not the money. There is none.'),
      d('Ren tries to smile. The intact half manages it.'),
      r('Every hundred years, someone agrees to be the reason the place is still here. The first one was a student. The next was the woman who cleaned the practice rooms. Names that ended up on no donor wall.'),
      r('You read her slip. She knew the gate would not open. She did not know how long an ordinary missed day could stay with her. I was there when the photograph arrived.'),
      r('One century is ending. I can make the next seal. I cannot be the person inside it.'),
    ], [
      c('previous-accountability', 'Those people deserve to be remembered. What did they know when they agreed?', 'previous-consent'),
      c('previous-question', 'Did they agree, knowing what it meant?', 'previous-consent'),
      c('previous-price', 'What would another hundred years actually be worth?', 'previous-worth'),
      leave,
    ]),
    'previous-worth': node([
      r('There is no number I can put against your life outside. I wish I could offer you something that made the exchange fair.'),
      r('You are right to ask what the place gives back. Before that, ask me what happened to the last people who paid.'),
    ], [c('previous-worth-consent', 'What did the other guarantors know when they agreed?', 'previous-consent'), leave]),
    'previous-consent': node([
      r('The cleaner did. I knew her. She used to sit here and call us all useless little sods.'),
      r('The first one, I only know from the building. That is not a source I would call impartial.'),
      r('I will not pretend the old seals were fair to make a new one easier to ask for.'),
    ], [c('previous-terms', 'Then start again. Ask me plainly, and tell me the whole cost.', 'plea', 'previous'), leave]),
    plea: node([
      r('Please help me keep this place standing.'),
      d('Ren says it without the little smile, without looking past you at the city.'),
      r('For the people inside it who still call it home. For the people outside it who have no idea what could arrive in their homes. I heard the person in the cleared room too. I cannot promise this is mercy for them.'),
      r('For me. I want to stay. I want us to have somewhere to stay.'),
      r('A century. I can hold demolition away for another hundred years, if a living person lets me put the seal on them.'),
    ], [
      c('seal-hear-terms', 'Explain the seal. Every part, before I answer.', 'terms', 'offer-seal'),
      c('seal-time', 'I need time. Do not mistake that for yes.', 'wait', 'offer-seal'),
      leave,
    ]),
    wait: node([r('I will not. The roof is here. I am here. You can still leave.')], null, 'done'),
    terms: node([
      r('I put my hand against your sternum. The missing part of me passes through you and closes round the school.'),
      r('Your living name becomes its guarantor. For a hundred years this place cannot be demolished, sold out from under itself, or made empty by force.'),
      r('The ordinary world will find ordinary reasons. A title that cannot be cleared. A foundation the survey missed. Someone refusing a signature. The protection is real. The reasons will be real too.'),
      r('It does not repair the school. It does not feed anybody. People will still have to keep it alive. It only refuses the final destruction.'),
    ], [c('terms-cost', 'What happens to me?', 'cost', 'terms'), leave]),
    cost: node([
      r('You stay. In this building. In these grounds. The seal keeps your body alive, and the years outside keep going.'),
      r('You can walk, eat, sleep, teach if anyone will listen. You can sit on this glass and watch the city. You cannot go home. Not for a visit. Not for a funeral.'),
      r('The people you know will get older. The seal will not let you follow them out. At the end of the century it releases you. I do not know what the years it held back will do then.'),
      r('I cannot reverse it once it closes. I cannot make that smaller by calling it a gift.'),
    ], [
      c('cost-freedom', 'If I say no, what happens right now?', 'freedom', 'cost'),
      c('cost-read-back', 'I lose my life outside for a hundred years, and you cannot undo it.', 'cost-confirm', 'cost'),
      leave,
    ]),
    'cost-confirm': node([r('Yes. That is what I am asking. There is no kinder version hidden in the wording.')], [c('cost-right-to-no', 'Then tell me I can refuse.', 'freedom'), leave]),
    freedom: node([
      r('If you say no, I take my hand away. You keep the service key. You keep the choice to leave the roof and this building.'),
      r('I will not follow you with the voices of people you did not save. They are not a debt I am allowed to put in your pocket.'),
      r('I am pleading because I want you to say yes. That is exactly why you need a way to say no.'),
    ], [c('freedom-consent', 'I understand. Let me choose.', 'consent', 'freedom'), leave]),
    consent: node([
      d('Ren holds out their intact hand, palm upwards. There is still space between you.'),
      r('No oath by accident. No signature borrowed from the envelope. This has to be a new answer.'),
      r('Will you let me seal you to this place, willingly, for one hundred years?'),
    ], [
      c('consent-explicit', 'Yes. I choose to stay for one hundred years. Put the seal on me.', 'ritual', 'consent-seal'),
      c('consent-time', 'Not yet. I am still deciding.', 'wait'),
      c('consent-refuse', 'No. I will not do this. Do not ask me again.', 'declined', 'refuse-seal'),
      c('consent-repeat', 'Tell me the cost once more.', 'cost'),
    ]),
    ritual: node([
      d('You put your hand in Ren\'s. Their skin is warm. The warmth makes you hesitate more than cold would have.'),
      r('I have you. I will not let go before it is done.'),
      d('Ren places your hand flat against your chest, then covers it with their own. The absent half of their body turns inward.'),
      d('For a moment you can see the city through both of you. Every lit window holds absolutely still.'),
    ], null, 'done'),
    declined: node([
      d('Ren draws their hand back. The city starts moving again in the glass.'),
      r('All right. I will not ask again.'),
      r('Thank you for bringing her voice back. That was its own thing. I will keep it that way.'),
    ], null, 'done'),
    closed: node([
      r('The key is yours. We are square.'),
      d('Ren turns the cassette over in their hand. There was another question. They are keeping it.'),
    ], null, 'done'),
    'closed-warning': node([
      r('No. The person who signed those refusals was me. You do not get to set them aside for me.'),
      r('Keep the key. I will not ask you to carry another part of my life.'),
    ], null, 'done'),
    'closed-account': node([
      r('I used your kindness. If you would rather not hear that, I cannot ask you for the rest of your life.'),
      d('Ren closes their intact hand around the cassette. They leave the seat beside them open.'),
    ], null, 'done'),
    'closed-dissent': node([
      r('It was their voice. You heard it. I will not ask you to take away a century of it while you call it nothing.'),
      r('Keep the key. You have already earned that.'),
    ], null, 'done'),
    'closed-extraction': node([
      r('No. I think I have given you enough to take away.'),
      d('Ren pockets the cassette. The movement is ordinary and final.'),
    ], null, 'done'),
    'closed-cruel': node([
      r('Yes. All of that.'),
      d('Ren moves a little farther along the glass. They leave your key where you can reach it.'),
    ], null, 'done'),
    done: end(),
  };
}

export function buildRoofRenDialogue(s, checks) {
  const later = laterConversation(s, checks);
  if (s.ritualComplete) return { start: node([r('The city looks the same. You have time to notice when it changes.')], null, 'done'), done: end() };
  if (s.sealConsented) return { ...later, start: later.ritual };
  if (s.stage === 'returned') return {
    ...later,
    start: node([r(s.locks.sealRefused ? 'You can still sit here.' : 'You came back.')], [c('resume', 'Stay and talk.', resumeAt(s, checks)), leave]),
  };
  if (s.stage === 'carrying') return {
    ...later,
    start: node([
      d('Ren looks at your pocket before they look at your face.'),
      r('You found it.'),
      r('Before you give it to me: did you listen?'),
    ], [
      ...(s.tapeListened ? [
        c('return-honest', 'I did. I am sorry. I heard her asking you to come home.', 'returned-honest'),
        c('return-lie', 'No. I kept it sealed.', 'returned-lie'),
      ] : [c('return-sealed', 'No. It was yours to hear.', 'returned-sealed')]),
      c('withhold', 'The envelope said to keep it from you. I am not handing it over.', 'withheld', 'withhold-memory'),
      leave,
    ]),
    'returned-sealed': node([
      d('You hold the little speaker between you. Ren waits until you lift your thumb, then presses play.'),
    ], null, 'memory-shared'),
    'returned-honest': node([
      r('Thank you for telling me. I asked you not to. I also sent you somewhere frightening with no proper explanation.'),
      r('If I hear it again, will you stay beside me until it ends?'),
      d('You hold the little speaker between you. Ren presses play.'),
    ], null, 'memory-shared'),
    'memory-shared': node([
      line('mother on tape', 'Ren. Come and eat. You can be brilliant after dinner.'),
      d('A spoon taps a saucepan. Behind it, a chair scrapes. There is no final message. Someone expected another ordinary evening.'),
      { who: 'direction', roofRenVisual: 'memory-fold', text: 'Ren answers her before they seem to mean to. Their missing side draws a dark crease across the glass between you. You can hear the answer from their intact mouth. The tape itself has not changed.' },
      r('That is why I signed it. And I still wanted to hear her.'),
    ], [c('memory-complete', 'Leave the cassette with Ren.', 'reward', s.tapeListened ? 'admit-listening' : 'return-memory')]),
    'returned-lie': node([
      d('The tape is stopped halfway through the message. Ren sees the exposed spool.'),
      r('You could have told me.'),
      r('I still want to hear her. You can tell me the truth before you give it over.'),
    ], [
      c('lie-correct', 'I listened. I am sorry. Can we hear it together?', 'returned-honest'),
      c('lie-complete', 'I kept it sealed. Leave the cassette with Ren anyway.', 'lie-consequence', 'lie-listening'),
      leave,
    ]),
    'lie-consequence': node([
      r('Keep the key. You did what I asked for, mostly. I will not ask you for anything else.'),
    ], null, 'done'),
    reward: node([
      d('Ren slides a small brass service key across the glass. Its teeth have been filed by hand.'),
      r('The office people called this a service access. It opens the short way between the gallery loggia and this roof. You need not make the climb every time.'),
      r('It is yours whether we ever speak again.'),
    ], [c('reward-stay', 'Sit beside Ren for a while.', 'personal'), c('reward-leave', 'Thank you. I need to go.', 'done')]),
    withheld: node([
      d('Ren watches your hand close over the cassette.'),
      r('I did write that warning. You are allowed to believe me from a different day.'),
      r('I still want it. I will not take it from you.'),
    ], null, 'done'),
  };
  if (s.stage === 'withheld') return {
    start: node([r('I still want to hear her. That is all I can tell you without making it into a case.')], [
      c('withheld-reconsider', 'I will let you have it. But I have questions.', 'done', 'reconsider-memory'),
      c('withheld-keep', 'I am keeping it for now.', 'done'),
    ]), done: end(),
  };
  if (s.stage === 'accepted' && s.warningRespected) return {
      start: s.warningDiscussed ? node([
        r('I know why you left it. I still want to hear her, and I still remember what I signed.'),
        r('You do not owe me another answer tonight.'),
      ], [
        c('left-stay', 'I am leaving it where you asked.', 'left-stays'),
        c('left-change', 'I may change my mind later.', 'left-maybe'),
        leave,
      ]) : node([
        d('Ren sees that you have come back without the cassette.'),
        r('You found it. Did you leave it because of what I wrote?'),
      ], [
        c('left-tell', 'I found it. You signed twice to keep it there.', 'left-truth', 'tell-left-warning'),
        c('left-reconsider', 'I may go back. I wanted you to know what the envelope says.', 'left-maybe', 'tell-left-warning'),
        leave,
      ]),
      'left-truth': node([
        r('I did sign twice. Thank you for taking that person seriously.'),
        r('I still want the cassette. That should bother you as much as it bothers me. I will not send you back as if the paper were nothing.'),
      ], [
        c('left-stay', 'I am leaving it where you asked.', 'left-stays'),
        c('left-change', 'I may change my mind later.', 'left-maybe'),
        leave,
      ]),
      'left-stays': node([r('You can sit here anyway. I meant that before I asked you for anything.')], null, 'done'),
      'left-maybe': node([
        r('Drawer seventeen will still be there. The index and the warning too.'),
        r('If you sign for it, bring it to me. I will answer for asking you to do that.'),
      ], null, 'done'),
      done: end(),
  };
  if (s.stage === 'accepted') return {
    start: node([
      r('The stripped office, off the gallery loggia. A personal-effects index on the desk; the cabinet belongs to it.'),
      r('My things were filed under R. The room number matters more than the year. Look at what the missing page left behind.'),
      r('Please do not play it. Bring it up here. I want to hear it with the sky over me.'),
    ], [leave]), done: end(),
  };
  return {
    start: node([
      d('Someone about your age sits with their shoes resting on the atrium glass. The right half of them folds inward past where a body ought to end.'),
      r(s.stage === 'refused' ? 'I have not stopped wanting it.' : 'Careful of that pane. It is sound. It just remembers being broken.'),
      r('I am Ren.'),
    ], [c('ask-person', 'What are you doing up here?', 'request', 'meet'), c('sit-first', 'Sit on the supported edge beside them.', 'request', 'meet'), leave]),
    request: node([
      r('Waiting for a person with pockets. The school kept my things in the stripped office. There is a cassette there, in an envelope.'),
      r('I would like it back. Not for the school. Not because it will save anyone. I want something that is mine.'),
      d('A fold runs from the missing cheek to the missing foot. For a moment the same strip of skin seems to repeat all the way down.'),
    ], [c('ask-want', 'What is on it?', 'want', 'ask-want'), c('ask-risk', 'Why has nobody given it back to you?', 'warning', 'ask-warning'), leave]),
    want: node([
      r('My mother calling me in for dinner.'),
      d('Ren says it flatly, daring you to find it too small.'),
      r('I used a practice cassette. She called through the open door. I left the machine running. I do not remember her voice properly anymore.'),
    ], [c('want-risk', 'Why has nobody given it back?', 'warning', 'ask-warning'), leave]),
    warning: node([
      r('The tape is my mother calling me in for dinner. I am asking for it because I can no longer hear her voice without it.'),
      r('There is a note. You will see it. It says I asked them not to give it to me.'),
      r('That was me too. I am not going to tell you the note is a forgery. I want you to disobey it.'),
      r('The last time I heard her, somebody heard my answer from a room I was not in. I do not know how much of that answer was mine.'),
      r('The release needs a living signature. That should bother you. Read it before you decide.'),
      r('If you do bring it back, do not listen. Let one part of me stay private.'),
    ], [
      c('accept-memory', 'I will look. I will decide what I can hand over when I have read it.', 'accepted', 'accept-memory'),
      c('refuse-memory', 'No. I do not want to overrule the person who wrote that note.', 'refused', 'refuse-memory'),
      leave,
    ]),
    accepted: node([
      r('That is fair. Stripped office, off the gallery loggia. The index on the desk will tell you which drawer.'),
      r('R. The room number matters more than the year. A missing page still leaves something behind.'),
      d('Ren looks down through the glass. Far below, somebody ought to be walking between classes.'),
    ], null, 'done'),
    refused: node([r('You may be right.'), r('You can sit here anyway. I do not own the view.')], null, 'done'),
    done: end(),
  };
}

export function buildRoofRenOfficeDialogue(s, propId) {
  if (!['accepted', 'carrying'].includes(s.stage)) return {
    start: node([d('A personal-effects ledger and a cabinet survived the clearance. Most of the pages have been taken with the people.')], null, 'done'), done: end(),
  };
  if (propId === 'academic-roof-effects-index') return {
    start: node([
      d('PERSONAL EFFECTS. Room, name, release. The page for R has been neatly torn out.'),
      d('Someone has crossed out the instruction to forward unclaimed items. Beneath it: KEEP ON PREMISES.'),
    ], [c('office-index', 'Find the line where R ought to be.', 'index', 'office-index'), leave]),
    index: node([
      d('The pages run by room, not by name. The missing sheet sat between the practice-room entries.'),
      d('Its carbon intake pad is gone too. The reception filing bank stands across the stripped office, under the emergency lamp.'),
      you('If the pad survived, it will have kept the pressure of the missing line.'),
    ], null, 'done'), done: end(),
  };
  if (propId === 'academic-roof-pressure-pad') {
    if (!s.indexRead) return {
      start: node([
        d('An old carbon intake pad has been filed under RECEPTION. There are thousands of impressions. You need to know which missing page to look for.'),
        you('Start with the personal-effects index on the desk.'),
      ], null, 'done'), done: end(),
    };
    return {
      start: node([
        d(s.traceRead
          ? 'The pad still holds R. / 17 in the shallow black pressure marks.'
          : 'The pad has a shallow depression beneath the top sheet. The fixed lamp only catches it from this side of the bank.'),
      ], [c('office-trace', s.traceRead ? 'Read the recovered line again.' : 'Lift the pad into the low light and read the impressed line.', 'trace', 'office-trace'), leave]),
      trace: node([
        d('R. / 17. CASSETTE — HOME. DO NOT DISPOSE. Beneath that, a line driven hard enough to bruise the paper.'),
        d('NOT TO BE RELEASED TO R. AT THEIR OWN REQUEST.'),
        you('Seventeen is the drawer. The year was the thing keeping me from seeing it.'),
      ], null, 'done'), done: end(),
    };
  }
  if (propId === 'academic-stripped-office-cabinet') {
    if (s.stage === 'carrying') return {
      start: node([
        d('Drawer seventeen is empty except for the release envelope. Your signature is still there. The cassette is in your pocket.'),
        you('I have made the decision this room was keeping for somebody else.'),
      ], null, 'done'), done: end(),
    };
    if (!s.indexRead || !s.traceRead) return {
      start: node([
        d('The cabinet has a shallow drawer for every practice room. Names have been removed from the card slots.'),
        d('Several drawers are sealed. Guessing would mean breaking into everybody else\'s things.'),
        you('The index is on the desk. Its missing page left a carbon pad in the reception bank.'),
      ], null, 'done'), done: end(),
    };
    return {
      start: node([
        d(s.cabinetOpened ? 'Drawer seventeen remains open.' : 'Drawer seventeen has been pushed past its stop. The little brass catch is accessible through the empty card slot.'),
      ], [c('office-cabinet', s.cabinetOpened ? 'Read the envelope again.' : 'Depress the catch and pull the drawer out level.', 'envelope', 'office-cabinet'), leave]),
      envelope: node([
        d('A small cassette sits inside a thick cream envelope. The handwriting on the front is the same cramped hand that damaged the ledger.'),
        d('You asked us to keep this from you. If you ask for it again, remember that you asked us twice. When you heard it last, you answered from more than one room.'),
        d('The release slip underneath is ordinary school stationery: "Received by a living person, for hand delivery. The recipient assumes responsibility for this release."'),
      ], [c('office-envelope', 'Read every line of the release before touching the cassette.', 'release', 'office-envelope'), leave]),
      release: node([
        d('No fine print. No occult diagram. A space for your signature. R. has signed the refusal beneath it twice, in two different years.'),
        you('They told me this would be here. That makes it more honest. It does not make it all right.'),
      ], [
        c('office-take', 'Sign for hand delivery and take the cassette.', 'taken', 'office-take'),
        c('office-leave-warning', 'Leave it. The warning is reason enough.', 'left', 'office-leave-warning'),
      ]),
      left: node([
        d('You close the envelope without signing. The drawer stays open.'),
        you('Ren asked. Ren also refused, twice. I should tell them which answer I honoured.'),
      ], null, 'done'),
      taken: node([
        d('You sign. The cassette lifts from the envelope without resistance. It is warmer than the room.'),
        d('There is handwriting on the label: HOME. Neither a date nor a surname.'),
      ], [c('office-keep-private', 'Put it away without playing it.', 'done'), c('office-listen', 'Listen to the message despite Ren\'s request.', 'heard', 'listen-memory')]),
      heard: memoryPlayback(), done: end(),
    };
  }
  return {
    start: node([
      d(s.stage === 'carrying' ? 'The HOME cassette is in your pocket. There is only one short message on it.' : 'The cassette stays inside its release envelope until somebody signs for it.'),
    ], s.stage === 'carrying' ? [c('pocket-listen', 'Play the cassette.', 'heard', 'listen-memory'), leave] : [leave]),
    heard: memoryPlayback(), done: end(),
  };
}

export function buildRoofRenEvidenceDialogue(s, propId) {
  if (propId === 'academic-roof-contrary-account') return {
    start: node([
      d('A loose score is caught beneath the leg of a chair in the cleared room. One margin is dark with repeated pencil marks: LEAVE THE DOOR OPEN.'),
      d(s.contraryAccountHeard ? 'The chair has not moved back. The pencilled words are still here.' : 'The marked stave runs toward the breach instead of the music.'),
    ], [c('contrary-listen', 'Read the marked stave and wait by the chair.', 'account'), leave]),
    account: node([
      d('The pencil has pressed through three pages. The answer comes from the empty chair, close enough to seem spoken beside your ear.'),
      line('unknown', 'I was leaving when it happened. They call this my home because I have been here since. I was going somewhere else.'),
      line('unknown', 'The walls might come down and I might end. I know. I still want the choice to try the door. Tell Ren I said so.'),
      d('The loose edge of the score lifts toward the breach, then settles. You cannot tell whether the person who spoke can follow it.'),
    ], [c('contrary-remember', 'Remember their wish and the risk they named.', 'done', 'evidence-contrary')]),
    done: end(),
  };
  if (propId === 'academic-roof-guarantor-trace') return {
    start: node([
      d('A narrow maintenance slip is folded beneath the chamber piano bench. It was kept under the seat rather than filed with the school accounts.'),
      d(s.guarantorTraceRead ? 'The same three entries remain legible, including the ones after the signature.' : 'The dates are separated by decades. The handwriting belongs to the same person throughout.'),
    ], [c('guarantor-read', 'Unfold the slip and read all three entries.', 'trace'), leave]),
    trace: node([
      d('SEAL, YEAR 0. M. VALE, CLEANER. I have been told that I will stay inside the grounds for one hundred years. I am signing while I can still walk away.'),
      d('YEAR 12. My daughter married on Saturday. Ren brought the photograph on Monday. I knew I would miss the day. I did not know how much of it would fit in one picture.'),
      d('YEAR 61. The chamber roof leaked again. I changed the bucket before class. The seal kept the crews from taking the room. It never mended it for us.'),
      d('There is no donor wall, no promise that she was happy, and no correction over her signature.'),
    ], [c('guarantor-remember', 'Keep her consent and what followed it together.', 'done', 'evidence-guarantor')]),
    done: end(),
  };
  return null;
}

function memoryPlayback() {
  return node([
    line('mother on tape', 'Ren. Come and eat. You can be brilliant after dinner.'),
    d('A spoon taps a saucepan. A chair scrapes. Behind it, Ren starts the same four bars again, makes the same mistake, laughs once.'),
    d('The message ends there. You have listened to somebody being expected home.'),
    you('Now I have to tell them I heard it.'),
  ], null, 'done');
}
