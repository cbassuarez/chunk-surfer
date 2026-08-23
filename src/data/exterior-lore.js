// People who still use the streets around Ellery. These are optional, ordinary
// conversations: the city knows the institution by inconvenience, memory, and
// the noises which cross its walls, not by the player's plot.
//
// This is a node tree for the same transcript shell as the gate-lodge scene.
// Exterior locals used to be three-line arrays handed to SPEECH.sayAll(), which
// made them ambient subtitles rather than people the player could converse
// with. Each local now has questions, follow-ups, a return visit, and a clean
// leave choice. The short `first` / `again` excerpts remain as catalogue copy
// for audits and non-runtime consumers; the game presents `tree`.

function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}

const lines=(...entries)=>entries;
const choice=(text,goto,extra={})=>({text,goto,hideWhenAsked:true,...extra});
const leave=(text)=>({text});

const BUS_WOMAN='woman at the shelter';
const MEWS_NEIGHBOR='man under the awning';
const PUB_DRIVER='driver by the pub yard';

export const EXTERIOR_LORE=deepFreeze({
  'yard-bus-waiter':{
    slate:'CLOSED STOP / WEST ROAD',
    speaker:'WOMAN AT THE SHELTER',
    first:lines(
      {who:BUS_WOMAN,text:'If you are waiting for the 48, do not. They took this stop off the board when the demolition fence went up.'},
      {who:'me',text:'I am working in Ellery.'},
      {who:BUS_WOMAN,text:'Tonight? Then mind the old baths side. My daughter learned to swim in there.'},
    ),
    again:lines(
      {who:BUS_WOMAN,text:'Last bus that acknowledged this stop was three weeks ago. The timetable still lights up every night.'},
    ),
    tree:{
      start:{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:BUS_WOMAN,text:'If you are waiting for the 48, do not. They took this stop off the board when the demolition fence went up.'},
          {who:'direction',text:'The timetable case is lit. Every service on it is still printed as running.'},
          {who:'me',prompt:'Tell her why you are here.',text:'I am working in Ellery.'},
          {who:BUS_WOMAN,text:'Tonight? Then mind the old baths side. My daughter learned to swim in there.'},
        ),
        revisitLines:lines({who:BUS_WOMAN,text:'Go on. The bus is not coming and you plainly have questions.'}),
        choices:[
          choice('Ask why the stop was closed.','stop'),
          choice('Ask about the municipal baths.','baths'),
          choice('Ask what she has heard from Ellery.','noise'),
          leave('Leave her to the timetable.'),
        ],
      },
      stop:{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask about the missing bus.',text:'Why close the stop before the building is down?'},
          {who:BUS_WOMAN,text:'They did not close it. They removed the number from the pole and left the electricity on.'},
          {who:BUS_WOMAN,text:'For a week the buses slowed because people waved. Then the drivers learned not to look at us.'},
        ),
        choices:[
          choice('Ask whether anyone complained.','stop-complaint'),
          choice('Ask when a bus last stopped.','stop-last'),
        ],
      },
      'stop-complaint':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask about the complaint.',text:'Did you complain?'},
          {who:BUS_WOMAN,text:'Twice. The first reply said the stop did not exist. The second thanked me for reporting a damaged light at a stop that did not exist.'},
          {who:BUS_WOMAN,text:'That is local government achieving a sort of harmony.'},
        ),
        goto:'start',
      },
      'stop-last':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask when it last stopped.',text:'When did one last stop here?'},
          {who:BUS_WOMAN,text:'Three Thursdays ago. Empty except for the driver. He opened both doors and waited as though somebody had rung the bell.'},
          {who:BUS_WOMAN,text:'Nobody got on. That includes me.'},
        ),
        goto:'start',
      },
      baths:{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask about the baths.',text:'What were the baths like?'},
          {who:BUS_WOMAN,text:'Blue tile, iron changing stalls, and water cold enough to make children honest.'},
          {who:BUS_WOMAN,text:'Ellery bought the pool, roofed half the windows, and called it a rehearsal resource. You could still smell chlorine in the corridor.'},
        ),
        choices:[
          choice('Ask about her daughter.','baths-daughter'),
          choice('Ask how the closure happened.','baths-closure'),
        ],
      },
      'baths-daughter':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask about her daughter.',text:'Did your daughter come back after Ellery took it over?'},
          {who:BUS_WOMAN,text:'Once. She said the deep end was under a floor and somebody had put a piano where the lifeguard chair stood.'},
          {who:BUS_WOMAN,text:'She did not like hearing scales come through the drain grilles. Neither did I, after she mentioned it.'},
        ),
        goto:'start',
      },
      'baths-closure':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask how it closed.',text:'Did they warn anyone before they drained it?'},
          {who:BUS_WOMAN,text:'They posted the notice inside, after the last public session. You had to enter a closed building to learn the building was closed.'},
          {who:BUS_WOMAN,text:'Ellery has always preferred an audience already in the room.'},
        ),
        goto:'start',
      },
      noise:{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask what crosses the wall.',text:'What do you hear from the building at night?'},
          {who:BUS_WOMAN,text:'The tower, mostly. Practice carries in wet weather. One bell at a time, then seven answering too late.'},
          {who:BUS_WOMAN,text:'Tuesday there was a man counting in the loading yard. He reached four. The next voice began again at one.'},
        ),
        choices:[
          choice('Ask whether she saw the second man.','noise-man'),
          choice('Say it was probably a recording.','noise-tape'),
        ],
      },
      'noise-man':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask if she saw him.',text:'Did you see the other man?'},
          {who:BUS_WOMAN,text:'No. I saw one shadow cross the yard each time either voice spoke.'},
          {who:BUS_WOMAN,text:'That is not the same answer, I know.'},
        ),
        goto:'start',
      },
      'noise-tape':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Offer the ordinary answer.',text:'It could have been a recording.'},
          {who:BUS_WOMAN,text:'Of course it could. You are carrying the machine that makes that answer useful.'},
          {who:BUS_WOMAN,text:'Keep it useful.'},
        ),
        goto:'start',
      },
      return:{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines({who:BUS_WOMAN,text:'Still no 48. Still a light for it. How did Ellery become your problem?'}),
        choices:[
          choice('Ask if anyone else went in tonight.','return-worker'),
          choice('Ask why she keeps waiting.','return-wait'),
          leave('Wish her good night.'),
        ],
      },
      'return-worker':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask about tonight.',text:'Has anyone else gone through the gate tonight?'},
          {who:BUS_WOMAN,text:'A man in a clean contractor jacket photographed the padlock before dusk. He never opened it.'},
          {who:BUS_WOMAN,text:'Your guard watched him leave and then checked the glass as if the reflection had stayed.'},
        ),
      },
      'return-wait':{
        speaker:'WOMAN AT THE SHELTER',
        lines:lines(
          {who:'me',prompt:'Ask why she waits.',text:'If the bus does not stop, why wait here?'},
          {who:BUS_WOMAN,text:'My flat is three streets over. Here I can see the baths windows.'},
          {who:BUS_WOMAN,text:'Some habits deserve a light, even after the route is gone.'},
        ),
      },
    },
  },

  'district-mews-neighbor':{
    slate:'WEST MEWS / PARTY WALL',
    speaker:'MEWS NEIGHBOR',
    first:lines(
      {who:MEWS_NEIGHBOR,text:'The music school came second. Those rooms at the back were stables, then laundry, then rehearsal rooms nobody could heat.'},
      {who:'me',text:'You knew the place?'},
      {who:MEWS_NEIGHBOR,text:'Knew the walls. Every Thursday the tower bells shook dust out of my gutter.'},
    ),
    again:lines({who:MEWS_NEIGHBOR,text:'Listen past the traffic. The tower always carried farther in wet weather.'}),
    tree:{
      start:{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:MEWS_NEIGHBOR,text:'The music school came second. Those rooms at the back were stables, then laundry, then rehearsal rooms nobody could heat.'},
          {who:'me',prompt:'Ask how he knows.',text:'You knew the place?'},
          {who:MEWS_NEIGHBOR,text:'Knew the walls. Every Thursday the tower bells shook dust out of my gutter.'},
        ),
        revisitLines:lines({who:MEWS_NEIGHBOR,text:'You have the look of somebody measuring a story against a wall. Ask.'}),
        choices:[
          choice('Ask about the stable range.','stables'),
          choice('Ask about the tower practice.','bells'),
          choice('Ask why Ellery is being demolished.','closure'),
          leave('Let him get out of the rain.'),
        ],
      },
      stables:{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask about the oldest rooms.',text:'Those really were stables?'},
          {who:MEWS_NEIGHBOR,text:'Coach stalls for the municipal school. You can see the blocked hay doors above the service roof if the security lamp catches them.'},
          {who:MEWS_NEIGHBOR,text:'The laundry put drains through the floor. Ellery put acoustic doors over the drains and wondered why every low note travelled.'},
        ),
        choices:[
          choice('Ask where the sound emerged.','stables-sound'),
          choice('Ask who worked in the laundry.','stables-laundry'),
        ],
      },
      'stables-sound':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask where it carried.',text:'Where did the sound come out?'},
          {who:MEWS_NEIGHBOR,text:'My sink. The pub cellar. Once, a disconnected speaking tube in the borough office.'},
          {who:MEWS_NEIGHBOR,text:'The conservatoire called those complaints evidence of exceptional resonance.'},
        ),
        goto:'start',
      },
      'stables-laundry':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask about the laundry.',text:'Who ran the laundry?'},
          {who:MEWS_NEIGHBOR,text:'The baths did. Towels in through the stable yard, clean linen out under the chapel wall.'},
          {who:MEWS_NEIGHBOR,text:'There is a painted blue line under the new tarmac. Follow it and you can read the whole building in the wrong order.'},
        ),
        goto:'start',
      },
      bells:{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask about the bells.',text:'What did they practise on Thursdays?'},
          {who:MEWS_NEIGHBOR,text:'Methods. Eight bells, same order until it was not the same order. You learned the shape without learning the name.'},
          {who:MEWS_NEIGHBOR,text:'Near the end they rang seven and left a gap where the tenor belonged.'},
        ),
        choices:[
          choice('Ask whether the tenor was broken.','bells-tenor'),
          choice('Ask when practice stopped.','bells-stopped'),
        ],
      },
      'bells-tenor':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask about the missing bell.',text:'Was the tenor out of service?'},
          {who:MEWS_NEIGHBOR,text:'That was the notice. But I heard it after the ringers had gone, one stroke around half past one.'},
          {who:MEWS_NEIGHBOR,text:'A bell that size does not ring itself. That is the useful fact. The rest is neighbour talk.'},
        ),
        goto:'start',
      },
      'bells-stopped':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask when it ended.',text:'When did regular practice stop?'},
          {who:MEWS_NEIGHBOR,text:'They stopped calling it practice last winter. They did not stop doing it until April.'},
          {who:MEWS_NEIGHBOR,text:'Words usually leave Ellery a few months before the thing they describe.'},
        ),
        goto:'start',
      },
      closure:{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask why it is coming down.',text:'Why demolish it now?'},
          {who:MEWS_NEIGHBOR,text:'Subsidence is the public answer. Asbestos is the answer for contractors. The council report says the stitched-together buildings cannot be separated safely.'},
          {who:MEWS_NEIGHBOR,text:'That last one I believe. Nobody agrees where one building ends.'},
        ),
        choices:[
          choice('Ask what he wants preserved.','closure-keep'),
          choice('Ask what should go first.','closure-first'),
        ],
      },
      'closure-keep':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask what should remain.',text:'Is there anything worth saving?'},
          {who:MEWS_NEIGHBOR,text:'The foundation stone. Not because it is beautiful. Because the old name is cut deeper than every plaque they bolted over it.'},
          {who:MEWS_NEIGHBOR,text:'Buildings should have to admit what they were first.'},
        ),
        goto:'start',
      },
      'closure-first':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask where demolition should start.',text:'What would you take down first?'},
          {who:MEWS_NEIGHBOR,text:'The enclosed bridges. Make every addition stand apart for a day and show which walls it was borrowing.'},
          {who:MEWS_NEIGHBOR,text:'Then photograph the cracks.'},
        ),
        goto:'start',
      },
      return:{
        speaker:'MEWS NEIGHBOR',
        lines:lines({who:MEWS_NEIGHBOR,text:'Listen past the traffic. The tower always carried farther in wet weather.'}),
        choices:[
          choice('Ask what he hears now.','return-hears'),
          choice('Ask if anyone entered the mews door.','return-door'),
          leave('Thank him.'),
        ],
      },
      'return-hears':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask what is sounding now.',text:'What do you hear now?'},
          {who:MEWS_NEIGHBOR,text:'Rain in the gutter. Your van cooling. Something in Ellery holding one note below both.'},
          {who:MEWS_NEIGHBOR,text:'You brought headphones. Use them before you decide I imagined it.'},
        ),
      },
      'return-door':{
        speaker:'MEWS NEIGHBOR',
        lines:lines(
          {who:'me',prompt:'Ask about the old entrance.',text:'Has anyone used the stable-yard door tonight?'},
          {who:MEWS_NEIGHBOR,text:'No. But the rain stopped striking it for a few seconds, as if somebody stood on the other side.'},
          {who:MEWS_NEIGHBOR,text:'Neighbour talk. Remember the useful fact instead.'},
        ),
      },
    },
  },

  'district-pub-driver':{
    slate:'PUB YARD / SOUTH ROAD',
    speaker:'DELIVERY DRIVER',
    first:lines(
      {who:PUB_DRIVER,text:'You with the white van? The other contractor came Tuesday, photographed the gate, and left the padlock exactly as he found it.'},
      {who:'me',text:'What other contractor?'},
      {who:PUB_DRIVER,text:'Different name on the jacket. Same Ellery paperwork.'},
    ),
    again:lines({who:PUB_DRIVER,text:'He did not unload anything. That is the part I remember.'}),
    tree:{
      start:{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:PUB_DRIVER,text:'You with the white van? The other contractor came Tuesday, photographed the gate, and left the padlock exactly as he found it.'},
          {who:'me',prompt:'Ask about the contractor.',text:'What other contractor?'},
          {who:PUB_DRIVER,text:'Different name on the jacket. Same Ellery paperwork. He asked which part was the conservatoire and I told him all of it, eventually.'},
        ),
        revisitLines:lines({who:PUB_DRIVER,text:'I remembered something. Ask the question you were going to ask anyway.'}),
        choices:[
          choice('Ask what the contractor looked like.','contractor'),
          choice('Ask about his vehicle.','vehicle'),
          choice('Ask what he did at the gate.','gate'),
          leave('Let him finish his break.'),
        ],
      },
      contractor:{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask for a description.',text:'What did he look like?'},
          {who:PUB_DRIVER,text:'Your height. Older or more tired. Clean orange jacket, new boots, no rain on his shoulders though it had been down all afternoon.'},
          {who:PUB_DRIVER,text:'He carried a clipboard with no paper clipped to it.'},
        ),
        choices:[
          choice('Ask for the company name.','contractor-name'),
          choice('Ask whether the guard spoke to him.','contractor-guard'),
        ],
      },
      'contractor-name':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask for the name.',text:'What company was on the jacket?'},
          {who:PUB_DRIVER,text:'White letters. ARDEN, maybe. Or AURAL. Rain had caught the reflective strip and I read the light instead of the word.'},
          {who:PUB_DRIVER,text:'The paperwork had your logo. I am certain of that because he kept it turned outward.'},
        ),
        goto:'start',
      },
      'contractor-guard':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask about the guard.',text:'Did the lodge guard let him in?'},
          {who:PUB_DRIVER,text:'The guard opened the sliding pane. Neither of them spoke. Then both men looked at the same empty part of the yard.'},
          {who:PUB_DRIVER,text:'Your man shut the pane. The other one thanked him.'},
        ),
        goto:'start',
      },
      vehicle:{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask about the vehicle.',text:'What was he driving?'},
          {who:PUB_DRIVER,text:'Nothing. That was odd enough that I checked after he left.'},
          {who:PUB_DRIVER,text:'He walked east. No taxi lamps, no bus due, no car pulling away. Just the reflective strip getting smaller.'},
        ),
        choices:[
          choice('Ask whether cameras cover the road.','vehicle-camera'),
          choice('Ask if he carried equipment.','vehicle-kit'),
        ],
      },
      'vehicle-camera':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask about CCTV.',text:'Does the pub camera cover that road?'},
          {who:PUB_DRIVER,text:'It covers my loading bay and one very expensive bin. Ellery made the landlord angle it away from their gate years ago.'},
          {who:PUB_DRIVER,text:'Student privacy, they said. At half past one on a Tuesday.'},
        ),
        goto:'start',
      },
      'vehicle-kit':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask what he carried.',text:'No recorder case? No tools?'},
          {who:PUB_DRIVER,text:'Clipboard, torch in his left pocket, keys heavy enough to pull the jacket crooked.'},
          {who:PUB_DRIVER,text:'He did not unload anything. That is the part I remember.'},
        ),
        goto:'start',
      },
      gate:{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask what happened at the gate.',text:'What did he photograph?'},
          {who:PUB_DRIVER,text:'Padlock, lodge window, your grey service door. Then he turned around and photographed the road behind himself.'},
          {who:PUB_DRIVER,text:'Last picture was the tower. He held the phone sideways and waited long enough that it was not a picture.'},
        ),
        choices:[
          choice('Ask whether the bells rang.','gate-bells'),
          choice('Ask if the padlock moved.','gate-lock'),
        ],
      },
      'gate-bells':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask what he recorded.',text:'Were the bells ringing?'},
          {who:PUB_DRIVER,text:'Traffic, rain, bottles being tipped into the pub bin. No bell I could hear.'},
          {who:PUB_DRIVER,text:'He lowered the phone exactly when the silence ended.'},
        ),
        goto:'start',
      },
      'gate-lock':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask about the lock.',text:'Did he touch the padlock?'},
          {who:PUB_DRIVER,text:'No. He photographed it shut. When he walked away it swung once against the chain.'},
          {who:PUB_DRIVER,text:'Wind can do that. There was not much wind.'},
        ),
        goto:'start',
      },
      return:{
        speaker:'DELIVERY DRIVER',
        lines:lines({who:PUB_DRIVER,text:'He did not unload anything. That is the part I remember.'}),
        choices:[
          choice('Ask what he remembered.','return-detail'),
          choice('Ask whether to call anyone.','return-call'),
          leave('Tell him to keep the yard clear.'),
        ],
      },
      'return-detail':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask for the new detail.',text:'What else did you remember?'},
          {who:PUB_DRIVER,text:'His keyring. He had a long brass key with a black tag. Your guard has the same tag hanging behind the glass.'},
          {who:PUB_DRIVER,text:'Could be a standard set. Could be why neither man needed to speak.'},
        ),
      },
      'return-call':{
        speaker:'DELIVERY DRIVER',
        lines:lines(
          {who:'me',prompt:'Ask if this should be reported.',text:'Should I call the client before I go in?'},
          {who:PUB_DRIVER,text:'If they sent him, they will tell you yes. If they did not, they will tell you no.'},
          {who:PUB_DRIVER,text:'Ask the guard which answer makes him reach for the radio.'},
        ),
      },
    },
  },
});

export function exteriorLoreLines(id,{revisited=false}={}){
  const entry=EXTERIOR_LORE[String(id||'')];
  return entry?[...(revisited?entry.again:entry.first)]:null;
}

export function exteriorLoreConversation(id,{revisited=false}={}){
  const entry=EXTERIOR_LORE[String(id||'')];
  if(!entry)return null;
  return{
    tree:entry.tree,
    startAt:revisited?'return':'start',
    slate:entry.slate,
    speaker:entry.speaker,
  };
}
