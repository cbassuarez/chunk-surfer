// Late in either bench conversation he starts to get it: the other has sat
// through this part before, and knows something of what comes after it. He
// gets one question about the world outside the music.
//
// One, because this beat spends the silent room the final exchange already
// waits through before its musical cue (about 60s in II, 70s in III). Measured
// with a second answer: the black falls mid-answer in both benches, and in II
// the last exchange starts after the Chaconne's major passage (559s > 550s).
//
// Only his own people and places: personal, earthly concerns.
//
// Rules for these lines (docs/story-doctrine.md, docs/plans/last-minutes.md):
// nothing here may say whether he lives, dies, drives off or stays; the other
// gets no name or nature; Sarah's name appears only if the player gave it at
// the natatorium, and what becomes of her is not the other's to give.
const line=(who,text)=>Object.freeze({who,text,voice:false,say:false});
const you=text=>line('you',text),other=text=>line('other',text);
const go=(id,label,next)=>Object.freeze({id,label,next});
// Everything here sits inside the locked final movement of both benches.
const locked=(lines,{choices=[],next}={})=>Object.freeze({lines:Object.freeze(lines),choices:Object.freeze(choices),
  ...(next?{next}:{}),lockExit:true});

// Each bench arrives at the same understanding from its own music.
const LEADS=Object.freeze({
  'wrong-return':[
    you('You have sat here before.'),
    other('Yes.'),
    you('Not for the music. For this part.'),
    other('For this part.'),
    you('Then you know what happens out there. Afterwards.'),
    other('Some of it.')
  ],
  catch:[
    you('You are not new to this.'),
    other('No.'),
    you('Other people have sat where I am.'),
    other('Some have.'),
    you('And you know what became of what they left.'),
    other('Some of it.')
  ]
});

// The future does not change with the bench he chose, so neither do the answers.
const QUESTIONS=Object.freeze([
  {id:'lyle',label:()=>'What happens to Lyle?',answer:()=>[
    other('He has a full life. A long one, and most of it good.'),
    other('He moves twice, and stays the second time. Someone loves him for years, and he lets them.'),
    other('He wears the green jumper until it is more darn than jumper.'),
    you('Does he think about me?'),
    other('Sometimes. Not often enough to hurt him.'),
    you('Good.')
  ]},
  {id:'sarah',label:named=>named?'What happens to Sarah?':'What happens to her?',answer:()=>[
    other('I am not going to tell you that.'),
    you('You know, though.'),
    other('I know. It is hers. She has not said I could.'),
    you('I only want to know she is all right.'),
    other('Then want it for her. You do not need to have it as well.')
  ]},
  {id:'ellery',label:()=>'What happens to Ellery?',answer:()=>[
    other('It comes down. You knew that much.'),
    other('Then flats. A man on the fourth floor teaches piano in his front room for thirty years.'),
    other('Then offices. Then a building with no windows that hums all night, full of other people’s photographs.'),
    other('Then a park, for a long while. There is a dip in the grass where the hall was. Children roll down it.'),
    other('Then houses again, and after those, things you would not have words for.'),
    other('Two hundred years on, someone digging a drain finds an organ stop in the clay. It still says Vox Humana.'),
    you('The human voice.'),
    other('They keep it on a windowsill.')
  ]},
  {id:'rain',label:()=>'Does the rain stop?',answer:()=>[
    other('A little before six.'),
    other('The gutters run for an hour after. Then a blackbird starts up on the lodge roof.'),
    other('The light comes up grey over the yard. It is an ordinary morning.'),
    you('Is it a good one?'),
    other('As they go. Yes.')
  ]},
  {id:'listen',label:()=>'Nothing. I would rather listen.',answer:()=>[
    other('So would I.')
  ]}
]);
export const SOURCE_REST_EARTHLY_QUESTION_IDS=Object.freeze(QUESTIONS.map(q=>q.id));

/** The lead-in, the one-question choice and its answers, rejoining `next`. */
export function sourceRestEarthlyNodes(phase,{next,sarahNamed=false}={}){
  if(!LEADS[phase])throw Error(`No bench conversation for ${phase}.`);
  if(!next)throw Error('The earthly question needs the bench’s own last exchange to return to.');
  const named=!!sarahNamed,nodes={
    earthly:locked(LEADS[phase],{next:'earthly-choice'}),
    'earthly-choice':locked([other('There is time for one thing.')],
      {choices:QUESTIONS.map(q=>go(q.id,q.label(named),`earthly-${q.id}`))})
  };
  // The scene delivers a reply exactly as it was chosen: each answer opens
  // with his own question, word for word.
  for(const q of QUESTIONS)nodes[`earthly-${q.id}`]=locked([you(q.label(named)),...q.answer()],{next});
  return Object.freeze(nodes);
}
