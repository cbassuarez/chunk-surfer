// The first B3 failure is evidence, rather than a test of microphone discipline.
// The host performs each physical action; these trees never grant take credit,
// summon a presence, or consent to Contact.
export const B3_INVESTIGATION_FLAGS = Object.freeze({
  failures:'b3.investigation.failures', refused:'b3.investigation.refused',
  accepted:'b3.investigation.accepted',
});

export function b3FailurePatch(flags={}) {
  const count=Math.max(0,Math.floor(Number(flags[B3_INVESTIGATION_FLAGS.failures])||0));
  return {[B3_INVESTIGATION_FLAGS.failures]:Math.min(2,count+1)};
}

export function buildB3FailureDialogue(flags={}) {
  const repeated=Number(flags[B3_INVESTIGATION_FLAGS.failures])>=2;
  return {
    start:{speaker:'YOU',lines:repeated?[
      'Same phrase. Same speakers. A second length of tape, and exactly the same fault.',
      'It is not going to stop because I refuse to look at it.',
    ]:[
      'That is on the tape. Not outside. The studio speakers.',
      'A room cannot give me room tone while somebody is feeding music into it. I need to find the feed.',
    ],choices:[
      {id:'investigate',text:'check the studio feed',goto:'investigate',b3Action:'investigate',set:[B3_INVESTIGATION_FLAGS.accepted]},
      {id:'retry',text:'try another take first',goto:'retry',b3Action:'retry',
        disabled:repeated,disabledReason:repeated?'You already tried a second take.':null,
        set:repeated?[]:[B3_INVESTIGATION_FLAGS.refused]},
    ]},
    investigate:{speaker:'YOU',lines:[
      'Follow the sound through the glass. Check the desk, then the return feeding those speakers. One fault at a time.',
    ]},
    retry:{speaker:'YOU',lines:[
      'One more. If it comes back, I go in and find out why.',
    ]},
  };
}

// Four small desk states let physical tests remain in one conversation. They
// reflect actions the host has actually performed, and keep the return trace
// unavailable until both the disconnected mains and closed fader were tested.
export function buildB3ConsoleInvestigation(snapshot={}) {
  const initialPower=!!snapshot.powerTried,initialFader=!!snapshot.faderTried;
  const key=(p,f)=>`desk${p?1:0}${f?1:0}`;
  const nodes={};
  const options=(p,f)=>[
    {id:'unplug',text:p?'check the disconnected rack supply':'unplug the rack power unit',goto:`unplug${f?1:0}`,b3Action:'power'},
    {id:'fader',text:f?'check channel three at zero':'bring channel three all the way down',goto:`fader${p?1:0}`,b3Action:'fader'},
    {id:'meters',text:'compare the source and speaker meters',goto:`meters${p?1:0}${f?1:0}`},
    {id:'trace',text:'follow the separate monitor return',goto:'traced',b3Action:'trace',
      disabled:!p||!f,disabledReason:!p||!f?'Rule out the mains and channel fader first.':null},
    ...(snapshot.returnTraced?[{id:'disconnect',text:'unpatch the monitor return',goto:'silent',b3Action:'disconnect'}]:[]),
    {id:'leave',text:'take my hands off the desk',b3Action:'leave'},
  ];
  for(const p of [false,true])for(const f of [false,true]){
    nodes[key(p,f)]={speaker:'YOU',lines:[p&&f
      ?'No mains. Channel three closed. The source meter is still moving, and the speakers have not stopped.'
      :'The music is in the live room. This desk is feeding it. Find which part of the desk.'],choices:options(p,f)};
    nodes[`meters${p?1:0}${f?1:0}`]={speaker:'YOU',lines:[
      f?'Channel output is down. The source meter carries on with the phrase. Two different points in the circuit.'
        :'The source meter catches each attack before the output meter follows it. Lowering the output will tell me which path the speakers use.',
      'A monitor return can listen before the fader. A closed channel does not necessarily close that return.',
    ],choices:options(p,f)};
  }
  for(const f of [false,true])nodes[`unplug${f?1:0}`]={speaker:'YOU',lines:[
    "The rack supply’s mains plug comes free. The low-voltage lead still runs to the desk. The music continues without a break.",
    'No. Do not put it back to make this easier to explain.',
  ],choices:options(true,f)};
  for(const p of [false,true])nodes[`fader${p?1:0}`]={speaker:'YOU',lines:[
    'Channel three reaches the bottom. Its output drops. The tune thins, but the speakers keep playing.',
    'There is a feed around the fader. Pulling the rest down will only repeat the same test.',
  ],choices:options(p,true)};
  nodes.traced={speaker:'YOU',lines:[
    'There. A separate monitor return, taken before the channel fader. The source meter is showing that feed.',
    'The mains cannot account for it. But this return still has a physical connection to the speakers.',
  ],choices:[
    {id:'disconnect',text:'unpatch the monitor return',goto:'silent',b3Action:'disconnect'},
    {id:'leave',text:'leave the return connected for now',b3Action:'leave'},
  ]};
  nodes.silent={speaker:'YOU',lines:[
    'The return comes free. The speakers stop in the middle of the phrase.',
    'Leave it out. Go back to position. A fresh B3 take, from the beginning.',
  ]};
  nodes.start={...nodes[key(initialPower,initialFader)]};
  if(snapshot.returnTraced)nodes.start={...nodes.traced};
  return nodes;
}

export const B3_REMAINING_ROOMS_DIALOGUE={
  start:{speaker:'YOU',lines:[
    'B3 is recorded. Four rooms left on the work order: the natatorium, the practice rooms, the concert hall, and the chapel.',
    'The first three can be taken as I reach them. The chapel may take some time; I need to leave room for it in the shift.',
    'Mark the next room. Keep the chapel on the list.',
  ]},
};
