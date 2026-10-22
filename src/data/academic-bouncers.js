// Admission is a conversational interruption learned around the building. These two
// attendants have mistaken their opening announcement for the reception itself.
// Coordinates are supplied by the separately tested stair-access layout.
export const ACADEMIC_BOUNCER_CUE='When do the guests arrive?';
export const ACADEMIC_BOUNCER_PHRASE='The guests are already here.';
export const ACADEMIC_BOUNCER_TIMING=Object.freeze({windowSeconds:4,maxTick:.1,asideSpeed:1});
export const ACADEMIC_BOUNCER_ACTORS=Object.freeze([
  Object.freeze({id:'academic-bouncer-formal',name:'Vera',sourceLabel:'VERA',designId:'attendant',
    mesh:'academic_population_attendant',source:'female',height:1.68,floor:10,
    voiceSpeaker:'academic-attendant',coordinateSpace:'authored-metres',blocks:false,
    x:12.5,y:277.5,yaw:Math.PI/2,
    asidePath:Object.freeze([Object.freeze({x:12.5,y:277.5}),Object.freeze({x:8.5,y:277.5}),Object.freeze({x:8.5,y:277})])}),
  Object.freeze({id:'academic-bouncer-dry',name:'Hugh',sourceLabel:'HUGH',designId:'listener',
    mesh:'academic_population_listener',source:'male',height:1.81,floor:10,
    voiceSpeaker:'academic-listener',coordinateSpace:'authored-metres',blocks:false,
    x:12.5,y:278.5,yaw:Math.PI/2,
    asidePath:Object.freeze([Object.freeze({x:12.5,y:278.5}),Object.freeze({x:10.5,y:278.5})])}),
]);
const byId=new Map(ACADEMIC_BOUNCER_ACTORS.map(actor=>[actor.id,actor]));
export function academicBouncerLine(role,text,cue='recollect'){
  const actor=byId.get(role.startsWith('academic-')?role:`academic-bouncer-${role}`);
  if(!actor)throw Error(`Unknown academic bouncer: ${role}`);
  return Object.freeze({who:'unknown',actorId:actor.id,voiceSpeaker:actor.voiceSpeaker,
    sourceLabel:actor.sourceLabel,text,performanceCue:cue,responseCue:'attend'});
}
export const ACADEMIC_BOUNCER_EXCHANGE=Object.freeze([
  academicBouncerLine('formal','Private reception. We have not finished opening.','object'),
  academicBouncerLine('dry','We began opening yesterday.','interrupt'),
  academicBouncerLine('formal','A proper welcome takes as long as it takes.','assure'),
  academicBouncerLine('dry',ACADEMIC_BOUNCER_CUE,'offer'),
]);
export const ACADEMIC_BOUNCER_CLOSING=Object.freeze([
  academicBouncerLine('formal','As soon as we have finished opening.','recollect'),
  academicBouncerLine('dry','Then we had better go on waiting.','concede'),
]);
export const ACADEMIC_BOUNCER_RESPONSES=Object.freeze({
  success:Object.freeze([
    academicBouncerLine('formal','Then we are late.','concede'),
    academicBouncerLine('dry','Again. Let them through.','offer'),
  ]),
  early:Object.freeze([
    academicBouncerLine('formal','Over my welcome? Really.','object'),
    academicBouncerLine('dry','You need the pause between us. There is one, occasionally.','assure'),
  ]),
  late:Object.freeze([
    academicBouncerLine('dry','That was the gap. You have missed it.','concede'),
    academicBouncerLine('formal','We shall have to begin the welcome again.','recollect'),
  ]),
  phrase:Object.freeze([
    academicBouncerLine('formal','An invitation does not make the reception ready.','object'),
    academicBouncerLine('dry','The plate on this landing explains the welcome. Or you could ask us to explain it.','recollect'),
  ]),
});
export const ACADEMIC_BOUNCER_OPTIONS=Object.freeze([
  Object.freeze({id:'invitation',text:'I have an invitation.'}),
  Object.freeze({id:'work',text:'I am here to work.'}),
  Object.freeze({id:'guests',text:ACADEMIC_BOUNCER_PHRASE,requiresPhrase:true}),
]);
const clueLine=text=>Object.freeze({who:'you',text,voice:false,sourceLabel:'ADMISSION NOTE'});
const clue=(id,propId,floor,title,text,extra={})=>Object.freeze({id,propId,floor,title,teachesPhrase:true,
  lines:Object.freeze(text.map(clueLine)),...extra});
// These receipts existed when the programme only pointed elsewhere. Keeping
// them separate prevents an old inspection from granting newly authored words.
export const ACADEMIC_BOUNCER_LEGACY_CLUE_IDS=Object.freeze(['boxOffice']);
// Only these two occupied branches lack an existing inspectable paper/plate.
// The main adapter stages the reused boards; they do not change circulation.
export const ACADEMIC_BOUNCER_CLUE_PROPS=Object.freeze([
  Object.freeze({id:'academic-admission-lower-circle',mesh:'notice_board',rx:9,ry:148,
    floor:4,elevation:.35,yaw:-Math.PI/2,renderOffsetX:.17,interactive:true,blocks:false,
    label:'reception running order on the circle rail',interactionPriority:2}),
  Object.freeze({id:'academic-admission-upper-circle',mesh:'notice_board',rx:9,ry:232,
    floor:7.5,elevation:.35,yaw:-Math.PI/2,renderOffsetX:.17,interactive:true,blocks:false,
    label:'reception cue card on the upper circle rail',interactionPriority:2}),
]);
export const ACADEMIC_BOUNCER_CLUES=Object.freeze([
  clue('practice','practice-desk-stack-1',4.8,'A note caught in the old teaching desk',[
    'The two attendants on the third-floor stair are still opening a reception that has already begun.',
    `Wait until Hugh asks, “${ACADEMIC_BOUNCER_CUE}” Let him finish. In the pause before Vera answers, say: “${ACADEMIC_BOUNCER_PHRASE}”`,
    'Not over either voice. They only listen when neither has the floor.',
  ]),
  clue('bathroom','amenity-public-mirror-soap',0,'Small writing beside the public washbasin mirror',[
    `UPSTAIRS: they are still welcoming nobody. Hugh asks, “${ACADEMIC_BOUNCER_CUE}”`,
    `Let that question finish. Before Vera answers, tell them: “${ACADEMIC_BOUNCER_PHRASE}”`,
    'A second hand has added: THERE IS A PAUSE. USE IT.',
  ],{enableInteraction:true}),
  clue('boxOfficeInstructions','box-office-program-stack',0,'A reception running order on the top programme',[
    'THIRD FLOOR / PRIVATE RECEPTION. Tickets will not help; the welcome is still waiting for its answer.',
    `HUGH: “${ACADEMIC_BOUNCER_CUE}” [LET THE QUESTION FINISH. BOTH PAUSE.] VISITOR: “${ACADEMIC_BOUNCER_PHRASE}”`,
    'Speak in that pause, before Vera replies. The practice desk and public mirror carry copies; one copy is enough.',
  ]),
  clue('basementLanding','landing-b3-landing',-4,'A reception instruction beside the dance-wing plate',[
    'UPSTAIRS RECEPTION / LATE ARRIVALS. The dance timetable has been squeezed below an instruction for the third-floor stair.',
    `Let Hugh finish asking “${ACADEMIC_BOUNCER_CUE}” In the pause, before Vera answers, say “${ACADEMIC_BOUNCER_PHRASE}” Do not talk over them.`,
  ]),
  clue('danceNotice','b2-notice',-4,'A pencilled stage direction on the studio timetable',[
    'RECEPTION: the two attendants upstairs have lost the end of their opening announcement.',
    `Hugh asks “${ACADEMIC_BOUNCER_CUE}” Let him finish; take the pause before Vera with “${ACADEMIC_BOUNCER_PHRASE}”`,
  ]),
  clue('propStore','store-rail-a',-4.35,'A small reception label tied to the costume rail',[
    'The label is for the attendants at the third-floor reception, rather than for either coat.',
    `HUGH: “${ACADEMIC_BOUNCER_CUE}” Let him finish. [PAUSE, BEFORE VERA.] VISITOR: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ]),
  clue('poolSteps','pool-access-handrail',-2,'Chalk at the foot of the pool stair',[
    'Someone has written the third-floor reception cue beside the last handrail bracket, below the old waterline.',
    `Let Hugh finish “${ACADEMIC_BOUNCER_CUE}” Then, in the pause before Vera answers: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ],{enableInteraction:true}),
  clue('hallStage','hall-stand-0',-2.16,'The back of a reception running-order sheet',[
    'Behind the orchestral part is a running order for the third-floor reception. Someone has circled the silence, not a note.',
    `Hugh: “${ACADEMIC_BOUNCER_CUE}” Let the question finish. [PAUSE BEFORE VERA.] You: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ]),
  clue('lowerCircle','academic-admission-lower-circle',4,'A reception running order on the circle rail',[
    'THIRD-FLOOR RECEPTION. The welcome has a missing entrance.',
    `After Hugh asks “${ACADEMIC_BOUNCER_CUE}”, let him finish. In the pause before Vera answers, enter with “${ACADEMIC_BOUNCER_PHRASE}”`,
  ]),
  clue('upperCircle','academic-admission-upper-circle',7.5,'A cue card on the upper circle rail',[
    'THIRD-FLOOR RECEPTION / VISITOR CUE. A thick pencil bracket surrounds the gap between the attendants.',
    `HUGH: “${ACADEMIC_BOUNCER_CUE}” [LET HIM FINISH. PAUSE, BEFORE VERA.] VISITOR: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ]),
  clue('chapelBoard','chapel-hymn-board',4.8,'A small reception slip below the hymn numbers',[
    'A reception slip has been pinned below the hymn numbers. It concerns the two attendants on the third-floor stair.',
    `When Hugh asks “${ACADEMIC_BOUNCER_CUE}”, let him finish. Answer in the pause before Vera: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ],{needsAuthoredInteraction:true}),
  clue('ringingBoard','tower-peal-board',8.6,'A reception instruction tucked below the peal inscription',[
    'Below the old peal inscription is a separate reception instruction: WAIT FOR THE OTHER SPEAKER TO FINISH.',
    `At the third-floor stair Hugh asks “${ACADEMIC_BOUNCER_CUE}” In the pause before Vera answers, say “${ACADEMIC_BOUNCER_PHRASE}”`,
  ],{needsAuthoredInteraction:true}),
  clue('organExit','tower-sign-organ-exit',8.6,'A reception direction on the organ-loft exit plate',[
    'Below the downward arrow: THIRD-FLOOR RECEPTION. The two attendants upstairs require an answer, not a ticket.',
    `Let Hugh finish asking “${ACADEMIC_BOUNCER_CUE}” Use the pause before Vera answers: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ],{needsAuthoredInteraction:true}),
  clue('bellChamber','tower-sign-belfry',13.2,'A reception instruction below the belfry access sign',[
    'The authorised-access sign has a smaller instruction for the third-floor reception. It is not a bell-ringing command.',
    `Let Hugh finish the question “${ACADEMIC_BOUNCER_CUE}” In the pause before Vera answers, say “${ACADEMIC_BOUNCER_PHRASE}”`,
  ],{needsAuthoredInteraction:true}),
  clue('academicLanding','landing-academic-floor-landing',10,'A reception cue on the public stair plate',[
    'Beside VOCAL STUDIES: RECEPTION / COMPLETE THE WELCOME. The plate faces the public stair, before the attendants.',
    `HUGH: “${ACADEMIC_BOUNCER_CUE}” [LET HIM FINISH. BOTH PAUSE.] YOU: “${ACADEMIC_BOUNCER_PHRASE}”`,
    'Say it in the pause before Vera answers. You need no ticket and no other copy of these instructions.',
  ],{needsAuthoredInteraction:true}),
  clue('roofBell','roof-school-bell',17,'A reception instruction on the old school bell bracket',[
    'The bell bracket carries the same reception cue as the stair. From up here it reads like an instruction for the way back down.',
    `Let Hugh finish “${ACADEMIC_BOUNCER_CUE}” In the pause before Vera answers: “${ACADEMIC_BOUNCER_PHRASE}”`,
  ],{presentsViaAction:true}),
]);

// A spoken alternative to every written source. The adapter offers this as an
// optional explanation, outside the timed attempt, and commits only on the
// completed conversation. No clue is earned by merely opening or cancelling it.
export const ACADEMIC_BOUNCER_SPOKEN_CLUES=Object.freeze([
  Object.freeze({id:'hughAdvice',sourceId:'hugh-admission-advice',teachesPhrase:true,
    actorId:'academic-bouncer-dry',title:'Ask the attendants how to finish the welcome',
    lines:Object.freeze([
      academicBouncerLine('dry',`If you want to put us out of our misery: let me finish asking “${ACADEMIC_BOUNCER_CUE}” Then, in the pause before Vera answers, say “${ACADEMIC_BOUNCER_PHRASE}”`,'offer'),
      Object.freeze({...academicBouncerLine('formal','You could simply tell them.','object'),toActorId:'academic-bouncer-dry'}),
      Object.freeze({...academicBouncerLine('dry','I just did. Please leave me the pause.','concede'),toActorId:'academic-bouncer-formal'}),
    ])}),
]);
export const ACADEMIC_BOUNCER_CLUE_RECEIPT_IDS=Object.freeze([
  ...ACADEMIC_BOUNCER_LEGACY_CLUE_IDS,...ACADEMIC_BOUNCER_CLUES.map(entry=>entry.id),
  ...ACADEMIC_BOUNCER_SPOKEN_CLUES.map(entry=>entry.id),
]);
