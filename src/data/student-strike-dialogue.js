// The film is an optional account offered by Odette, not a voice-loan or
// Contact contract. The host launches it only after this conversation ends.
export const STUDENT_STRIKE_WATCHED_FLAG='academic.strike.watched';
export const ODETTE_STRIKE_TOPICS=Object.freeze(['students','strike-authority','strike-preservation']);

const player=text=>({who:'me',voiceSpeaker:'me',sourceLabel:'YOU',text,say:false});
const choice=(id,text,spokenText,goto,extra={})=>({text,spokenText,goto,
  studentStrikeChoice:id,...extra});

/** `line` supplies the ordinary named-character metadata without a circular
 * dependency on academic-society. Full spoken answers live in their own lines,
 * independently editable from the short choices. `say:false` means the branch
 * already authorized speaking; there is no second confirmation picker. */
export function odetteStrikeDialogue({studentStrikeWatched=false,studentStrikeAvailable=true,line}={}){
  if(typeof line!=='function')throw Error('Odette strike dialogue needs the ordinary named-character line builder.');
  const node=(lines,extra={})=>({speaker:'ODETTE MARCHAL',lines,...extra});
  const say=text=>line('odette',text,{toPlayer:true,performanceCue:'recollect',responseCue:'attend'});
  const spoken=(text,next)=>node([player(text)],next?{goto:next}:{});
  const topic=choice('students','what happened to the students?',
    'What happened to the students here?','students',{societyTopic:'odette:students'});
  const available=studentStrikeAvailable!==false;
  const menuChoices=[topic];
  if(studentStrikeWatched)menuChoices.push(choice(available?'watch':'rewatch-unavailable','hear your account again',
    'Tell me what happened again.','strike-rewatch',{
      ...(available?{studentStrike:'watch'}:{}),societyTopic:'odette:students'}));
  const nodes={
    students:spoken(topic.spokenText,studentStrikeWatched?'strike-questions':available?'strike-offer':'strike-unavailable'),
    'strike-offer':node([say("The register made it sound as if they'd gone. I can tell you what I remember.")],{choices:[
      choice('watch','Tell me.','Tell me what happened.','strike-watch',{studentStrike:'watch'}),
      choice('defer','Another time.','Not now. Another time.','strike-defer'),
    ]}),
    'strike-watch':spoken('Tell me what happened.','strike-film'),
    'strike-rewatch':spoken('Tell me what happened again.',available?'strike-film':'strike-unavailable'),
    // Empty and terminal deliberately: ordinary onDone closes its leases
    // before the host acquires the cinematic owner. It is not a hidden auto.
    'strike-film':node([]),
    'strike-defer':node([player('Not now. Another time.'),say('Of course.')]),
    'strike-questions':node([],{choices:[
      choice('authority','Did you see all of it?','Did you see all of that yourself?',
        'strike-authority',{societyTopic:'odette:strike-authority'}),
      choice('preservation','And saving the school?',
        'What would saving the school mean for the people still here?',
        'strike-preservation',{societyTopic:'odette:strike-preservation'}),
      choice('leave','Enough for now.',"That's enough for now. Thank you.",'strike-leave'),
    ]}),
    'strike-authority':node([
      player('Did you see all of that yourself?'),
      say('Not all of it. I knew who was still upstairs. I did not see every recovery.'),
      say('I know where they were found. I cannot tell you why they died.'),
    ],{goto:'strike-questions'}),
    'strike-preservation':node([
      player('What would saving the school mean for the people still here?'),
      say('Keeping the rooms is one thing. Asking them to begin again is another. They had already said no.'),
      say('I cannot promise that bringing it down would let them leave.'),
    ],{goto:'strike-questions'}),
    'strike-leave':node([player("That's enough for now. Thank you."),
      line('odette','Keep your coat. You still feel the cold.',{toPlayer:true,performanceCue:'assure'})]),
    'strike-unavailable':node([line('odette','Let the machine finish. Then ask me.',{toPlayer:true,performanceCue:'assure'})],{choices:[
      {text:'ask something else',goto:'start'},
      {text:'continue along the floor',goto:'leave'},
    ]}),
  };
  if(!available){
    // Do not leave an actionable watch branch in this conversation snapshot.
    // Stopping a transport does not mutate it into permission to start later:
    // the visitor must make a new choice in a new conversation.
    delete nodes['strike-offer'];delete nodes['strike-watch'];delete nodes['strike-film'];delete nodes['strike-defer'];
  }
  return{menuChoices,nodes};
}

/** Pure selection query. The host must call only from successful onDone,
 * never from onChoice or onCancel. Selecting or highlighting an option alone
 * must not acquire a camera, commit a watched flag or affect Contact. */
export function odetteStrikeWatchRequested(actorId,choices=[]){
  return actorId==='odette'&&Array.isArray(choices)
    &&choices.some(c=>c?.studentStrike==='watch'&&c?.studentStrikeChoice==='watch');
}
