// Optional, candid questions inside the existing listening encounter. This
// voice can discuss construction and observed rules without acquiring an
// author biography, settling Source's ontology or judging the player's words.
const line=(who,text)=>Object.freeze({who,text,voice:false,say:false});
const you=text=>line('you',text),other=text=>line('other',text),
  go=(id,label,next)=>Object.freeze({id,label,next}),
  leave=()=>Object.freeze({id:'rise',label:'Get up.',action:'leave'}),
  node=(lines,choices=[],next=null)=>Object.freeze({lines:Object.freeze(lines),choices:Object.freeze(choices),...(next?{next}:{})});

const groups=Object.freeze([
  {id:'recordings',label:'About the recordings.',prompt:'What about them?',questions:[
    {id:'keep',question:'Why keep a recording after I have heard it?',answer:[
      other('Because the next time you hear it, the first time is already gone.'),
      you('That is a reason to remember it.'),
      other('A recording keeps more than the part you knew to remember. A chair. A breath. Something you did not notice until the second time.'),
      other('It does not keep the room waiting for you. It is still something you can go back to.')
    ]},
    {id:'hush',question:'What does HUSH want with the recordings?',answer:[
      other('I can tell you that a take can be taken. I cannot tell you what it wants from one.'),
      you('That is not much help.'),
      other('No. I would rather leave the want unanswered than make up a reason and send you after it.'),
      other('What is missing is worth noticing. So is what you still have.')
    ]},
    {id:'safe',question:'Does making a recording make me safer?',answer:[
      other('Not here.'),
      you('Even if I am doing what I came to do?'),
      other('The thing coming after you does not have to respect a job.'),
      other('If you stop to listen, choose the place and the time. Do not mistake the instrument being busy for someone keeping watch.')
    ]},
    {id:'radio',question:'Why is the old radio voice gone?',answer:[
      other('The voice you called for is not answering here.'),
      you('But I can still hear something.'),
      other('Yes. Hearing something is not the same as getting through.'),
      other('I would not put an answer in that voice merely because you missed it.')
    ]}
  ]},
  {id:'places',label:'About the buildings.',prompt:'Which part stayed with you?',questions:[
    {id:'ellery',question:'Why do I keep finding Ellery?',answer:[
      other('You recognize it before you know whether it fits.'),
      you('It is not the same building.'),
      other('No. A familiar stair can make you expect the next landing. Then the landing is somewhere else.'),
      other('The recognition is real. It does not make the promise reliable.')
    ]},
    {id:'scale',question:'Why are these things the size of buildings?',answer:[
      other('A joint becomes a passage. Something you could pick up becomes something you have to go around.'),
      you('Is making it large enough?'),
      other('No. It has to give you somewhere to stand, or block a view, or carry something. Otherwise it is only large.'),
      other('Look at what it is being asked to hold.')
    ]},
    {id:'source',question:'Am I meant to read all the source on the walls?',answer:[
      other('You can read what you can reach. You do not owe the wall every line.'),
      you('I keep thinking there is an instruction in it.'),
      other('A word can be part of a place without being an instruction to you.'),
      other('You are allowed to look at the room around it.')
    ]},
    {id:'trust',question:'Which version of a place should I trust?',answer:[
      other('Start with the part beneath your feet.'),
      you('That is a very small answer.'),
      other('It is the one you need before the larger one. A stair should carry you even when it leads somewhere impossible.'),
      other('If it does not, the impossibility has stopped being an interesting excuse.')
    ]}
  ]},
  {id:'rules',label:'About the rules.',prompt:'Ask me plainly.',questions:[
    {id:'answers',question:'Am I answering any of this correctly?',answer:[
      other('There is no correct reply hidden in these questions.'),
      you('The room keeps giving way.'),
      other('Your answer did not make a wrong note. Asking about a door did not break it.'),
      other('You can change what you were going to say. I have not heard it until you have said it.')
    ]},
    {id:'leave',question:'Can I still get up?',answer:[
      other('Now, yes.'),
      you('And if I keep listening?'),
      other('There is a point beyond which your body will not answer you. Do not wait for the room to explain it more beautifully.'),
      other('Getting up now is allowed. You need not finish my sentence first.')
    ]},
    {id:'puzzles',question:'Is every strange thing meant to be a puzzle?',answer:[
      other('No.'),
      you('I keep checking.'),
      other('Some things are there to be found. Some things are just there.'),
      other('You should not have to strip a place bare before you are allowed to leave it.')
    ]},
    {id:'unfinished',question:'What if I leave things unfinished?',answer:[
      other('Then there will be things you did not hear, and doors you did not open.'),
      you('You make that sound permanent.'),
      other('Some choices are. That is different from every missed detail being a failure.'),
      other('Keep hold of what you came to do. You need not make the whole place account for itself tonight.')
    ]}
  ]},
  {id:'making',label:'About how this was made.',prompt:'You need not pretend it was always here.',questions:[
    {id:'maker',question:'Are you the person who made this?',answer:[
      other('I can talk with you about how it is put together. I do not have a name that would settle who is sitting here.'),
      you('That leaves a lot out.'),
      other('Yes. I would rather say where the answer ends.'),
      other('You can still ask about the thing in front of you.')
    ]},
    {id:'rough',question:'What was left unfinished on purpose?',answer:[
      other('An unfinished backing can tell you how something is held up.'),
      you('And the rest of it?'),
      other('A rough edge is not automatically a secret. A mistake does not become deliberate because I find a sentence for it.'),
      other('What matters is whether the thing does what it asks you to believe.')
    ]},
    {id:'beautiful',question:'Why make somewhere beautiful that wants me gone?',answer:[
      other('Would you have stopped in it if it were only hostile?'),
      you('Perhaps not.'),
      other('Then the beauty matters. You are not wrong to want to look.'),
      other('It does not follow that the place is looking after you.')
    ]},
    {id:'feeling',question:'Is this how it was supposed to feel?',answer:[
      other('A light can be placed. A sound can be left just long enough. That is work someone can do.'),
      you('And the feeling?'),
      other('You brought part of that. I cannot tell you that you felt it incorrectly.'),
      other('I can listen when you tell me what happened.')
    ]}
  ]}
]);

// The later seat does not recite the same interview. It knows the same limits,
// but speaks from a place where sound is already changing its material.
const catchReplies=Object.freeze({
  'recordings-keep':[
    other('You can return to the same sound and arrive somewhere else in it.'),
    you('Without changing the recording?'),
    other('Without changing the recording. You are not always listening for the same thing.'),
    other('That is a reason to keep it, even when you cannot keep the room.')
  ],
  'recordings-hush':[
    other('A missing take is something you can find. A reason for wanting it is harder.'),
    you('You do not know.'),
    other('No. I know that being able to take a thing is not the same as understanding it.'),
    other('I would not give that thing a clear purpose on so little evidence.')
  ],
  'recordings-safe':[
    other('Having the recorder running is not a refuge.'),
    you('I am listening when I do it.'),
    other('To one part of the place. That is why the rest of it matters.'),
    other('Leave yourself somewhere to go. A good take is not a reason to stop having a way out.')
  ],
  'recordings-radio':[
    other('Whatever comes through here has not brought the ordinary line back.'),
    you('I keep waiting for a voice I know.'),
    other('You can miss it without deciding that every sound is an answer from it.'),
    other('Sometimes a signal only tells you there is something there to hear.')
  ],
  'places-ellery':[
    other('A remembered place gives you expectations before it gives you directions.'),
    you('I know where the next room ought to be.'),
    other('That is the useful part. It is also the part that can be used against you.'),
    other('Look at the actual opening. You need not give up recognizing it to stop trusting the next step.')
  ],
  'places-scale':[
    other('Here, something made for a hand can become the thing holding a body.'),
    you('I am not sure it was made for that.'),
    other('Neither am I. Its size does not settle whether it can bear the weight.'),
    other('That question has to become part of the construction, or the scale has done no work.')
  ],
  'places-source':[
    other('You can let the print be a surface for a moment.'),
    you('Even if I could understand it?'),
    other('Understanding a line would not make every line a command.'),
    other('Some of what was used to build the place is simply still visible.')
  ],
  'places-trust':[
    other('The support you can use, and the opening you can actually cross.'),
    you('Even when the rest is wrong?'),
    other('Especially then. You need some small thing to remain accountable.'),
    other('Otherwise you cannot tell a place that has changed its rules from one that has merely failed you.')
  ],
  'rules-answers':[
    other('Your words are not notes in this performance.'),
    you('So there is not an answer that keeps it together?'),
    other('No. I would tell you if I were asking for one.'),
    other('We can disagree without calling it damage.')
  ],
  'rules-leave':[
    other('Yes. You can stand while the question is still open.'),
    you('I do not have to wait for an answer?'),
    other('Not for mine. There is a later point at which staying stops being something you can undo.'),
    other('Do not confuse being allowed to listen with being promised you can listen forever.')
  ],
  'rules-puzzles':[
    other('A place would be unbearably small if every mark in it were waiting for your solution.'),
    you('Some of them are waiting for me, though.'),
    other('Yes. That does not make the rest a debt.'),
    other('You can notice something without making it your next task.')
  ],
  'rules-unfinished':[
    other('Something can remain unheard without undoing what you did hear.'),
    you('That does not mean I can always go back.'),
    other('No. I do not want to make that promise.'),
    other('I only mean that an unfinished inventory is not the same thing as an empty night.')
  ],
  'making-maker':[
    other('You can ask about the seams. I cannot give you a name that explains the whole place.'),
    you('Including this conversation?'),
    other('Including this conversation.'),
    other('The answer should not pretend to know more merely because the room is getting quiet.')
  ],
  'making-rough':[
    other('An exposed joint can be deliberate. It still has to join something.'),
    you('And an unfinished room?'),
    other('It has to give you more than an excuse for its empty parts.'),
    other('You are allowed to ask whether it holds together. Being strange does not settle that question.')
  ],
  'making-beautiful':[
    other('Because wanting to remain here should be a real want.'),
    you('Not only the music?'),
    other('The place you hear it in, too. Something worth giving your attention to.'),
    other('Then leaving can cost you something without the place having to call you back.')
  ],
  'making-feeling':[
    other('I would have to hear what you felt before I could answer that.'),
    you('What if it is not what was intended?'),
    other('Then the thing that happened is still the thing that happened.'),
    other('An intention does not get to replace your account of it.')
  ]
});

export function sourceRestQuestionNodes(next,{phase='wrong-return'}={}){
  if(!next)throw Error('Source rest questions need their existing musical return.');
  const nodes={
    'questions-entry':node([
      you(phase==='catch'?'There are things about this place I am still carrying.':'There are things about this place I wanted to ask.'),
      other(phase==='catch'?'You can put one of them here.':'You can. I may not have a useful answer.')
    ],[go('music','Let us keep listening.',next),...groups.map(group=>go(group.id,group.label,`questions-${group.id}`)),leave()])
  };
  for(const group of groups){
    const groupId=`questions-${group.id}`;
    nodes[groupId]=node([other(phase==='catch'?({recordings:'What are you trying to keep?',places:'What did the place ask you to believe?',rules:'Which rule are you worried about?',making:'Ask about the seam you can see.'})[group.id]:group.prompt)],[...group.questions.map(question=>go(question.id,question.question,`question-${group.id}-${question.id}`)),
      go('other','Something else.','questions-entry'),leave()]);
    for(const question of group.questions)nodes[`question-${group.id}-${question.id}`]=node([
      you(question.question),...(phase==='catch'?catchReplies[`${group.id}-${question.id}`]:question.answer)
    ],[],groupId);
  }
  return Object.freeze(nodes);
}
