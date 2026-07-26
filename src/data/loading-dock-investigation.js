// Loading-dock investigations are small thought spaces, not plaques. Each one
// begins with a thing the recordist can actually see, then lets the player pick
// the hand or thought that follows. Details accumulate across visits through
// ordinary story flags; no counter or reward tells the player they are doing it.

const done = () => ({ speaker:'', lines:[] });
const back = (lines) => ({ speaker:'', lines, goto:'hub' });
const theory = (lines, choices) => ({
  speaker:'',
  lines,
  choices:[
    ...choices.map((choice) => ({ ...choice, goto:'hub' })),
    { text:'leave the question open', goto:'hub' },
  ],
});
const leave = { text:'leave it alone', goto:'done' };

const PRE = Object.freeze({
  'dock-desk-1': ({ revisited }) => ({
    start:{speaker:'THE SIGNING DESK',lines:[
      {who:'direction',text:revisited
        ? 'The little desk is still pretending it belongs in a loading dock.'
        : 'A child-sized school desk has been dragged against the wall and promoted to dispatch.'},
      {who:'you',text:'All right. What were you in the middle of.'},
    ],goto:'hub'},
    hub:{speaker:'THE SIGNING DESK',lines:[],choices:[
      {text:'run a thumb over the clean rectangle',goto:'paper',set:['dock.clue.desk.paper'],if:'!dock.clue.desk.paper'},
      {text:'look in the wire basket',goto:'basket',set:['dock.clue.desk.basket'],if:'!dock.clue.desk.basket'},
      {text:'try the drawer',goto:'drawer',set:['dock.clue.desk.drawer'],if:'!dock.clue.desk.drawer'},
      leave,
    ]},
    paper:theory([
      {who:'direction',text:'Dust everywhere except one clipboard-shaped patch. Whoever lifted it did so recently enough to leave the room two colours.'},
      {who:'you',text:'Took the paper. Left the desk. So—'},
    ],[
      {text:'they meant to come back',set:['dock.theory.desk.return']},
      {text:'they left it for the next person',set:['dock.theory.desk.handover']},
    ]),
    basket:back([
      {who:'direction',text:'Cable ties, a dead marker, two boiled sweets fused to their wrappers.'},
      {who:'you',text:'That is a night shift drawer if ever I saw one.'},
      {who:'direction',text:'One tie has been cut cleanly. The thing it held is gone.'},
    ]),
    drawer:back([
      {who:'direction',text:'The drawer catches, then gives. Empty, except for a pencil worn flat on one side.'},
      {who:'you',text:'Somebody sat here long enough to make a pencil choose a side.'},
    ]),
    done:done(),
  }),

  'dock-work-order-clipboard': ({ revisited }) => ({
    start:{speaker:'THE CLIPBOARD',lines:[
      {who:'direction',text:revisited
        ? 'The same pages. The same last line waiting at the bottom.'
        : 'Two sets of paper share one clip: your job on top, somebody else’s leaving underneath.'},
      {who:'you',text:'Mine says what to keep. Theirs says what to take away.'},
    ],goto:'hub'},
    hub:{speaker:'THE CLIPBOARD',lines:[],choices:[
      {text:'follow the crossed-out items',goto:'list',set:['dock.clue.workorder.list'],if:'!dock.clue.workorder.list'},
      {text:'look at the handwriting',goto:'hand',set:['dock.clue.workorder.hand'],if:'!dock.clue.workorder.hand'},
      {text:'read the last line again',goto:'last',set:['dock.clue.workorder.last'],if:'!dock.clue.workorder.last'},
      leave,
    ]},
    list:back([
      {who:'direction',text:'Crates. Lamps. Cable. Small things first, each crossed through in a quick dark stroke.'},
      {who:'direction',text:'The strokes stop halfway down. Not messily. Simply stop.'},
      {who:'you',text:'Tea break, fire alarm, end of shift. Pick a boring reason.'},
    ]),
    hand:back([
      {who:'direction',text:'The first half leans forward. By the last few lines the letters stand upright and press hard into the sheet.'},
      {who:'you',text:'Same hand. Less hurry. More frightened.'},
      {who:'you',text:'No. More careful. Those are not the same thing.'},
    ]),
    last:theory([
      {who:'direction',text:'CHANDELIER — FRAME AND LOCK. No tick. No initials. Nothing written beneath it.'},
      {who:'direction',text:'The page has been dented there by a pencil that never made a mark.'},
      {who:'you',text:'The hand reached this line and stopped.'},
    ],[
      {text:'something interrupted the work',set:['dock.theory.workorder.interrupted']},
      {text:'the chandelier stopped it',set:['dock.theory.workorder.refused']},
    ]),
    done:done(),
  }),

  'dock-crew-board': ({ revisited }) => ({
    start:{speaker:'THE ROUTE BOARD',lines:[
      {who:'direction',text:revisited
        ? 'Three place names remain. The people do not.'
        : 'Magnets make a route down the board: DOCK. WEST STAIR. B3. Beside them, a row has been wiped almost clean.'},
    ],goto:'hub'},
    hub:{speaker:'THE ROUTE BOARD',lines:[],choices:[
      {text:'trace the route with a finger',goto:'route',set:['dock.clue.board.route'],if:'!dock.clue.board.route'},
      {text:'tilt the board into the light',goto:'names',set:['dock.clue.board.names'],if:'!dock.clue.board.names'},
      {text:'move the loose magnet',goto:'magnet',set:['dock.clue.board.magnet'],if:'!dock.clue.board.magnet'},
      leave,
    ]},
    route:back([
      {who:'direction',text:'Dock to stair to B3. Inward, downward. It is not a way out.'},
      {who:'you',text:'It is a handover. You walk the next person to the room that matters.'},
      {who:'you',text:'Then you come back up. Presumably.'},
    ]),
    names:theory([
      {who:'direction',text:'The eraser left pale ghosts: four names, maybe five. One was rubbed until the board went dull.'},
      {who:'direction',text:'Your reflection occupies the empty row.'},
      {who:'you',text:'Why take the names and leave the route.'},
    ],[
      {text:'someone was protecting the crew',set:['dock.theory.board.protect']},
      {text:'someone was erasing who came back',set:['dock.theory.board.erase']},
    ]),
    magnet:back([
      {who:'direction',text:'The loose magnet is warm from your hand. Under it: RETURN.'},
      {who:'you',text:'There you are.'},
      {who:'direction',text:'There is no matching magnet for OUT.'},
    ]),
    done:done(),
  }),

  'acq-maintenance-searchlight-dock': ({ revisited }) => ({
    start:{speaker:'THE DEAD LAMP',lines:[
      {who:'direction',text:revisited
        ? 'The little work lamp remains exactly as dead as you left it.'
        : 'A work lamp squats on the floor with its back hanging open.'},
      {who:'you',text:'You look useful. That is usually when the trouble starts.'},
    ],goto:'hub'},
    hub:{speaker:'THE DEAD LAMP',lines:[],choices:[
      {text:'flick the switch',goto:'switch',set:['dock.clue.lamp.switch'],if:'!dock.clue.lamp.switch'},
      {text:'put a finger in the empty battery bay',goto:'bay',set:['dock.clue.lamp.empty'],if:'!dock.clue.lamp.empty'},
      {text:'aim it at the chandelier',goto:'aim',set:['dock.clue.lamp.aim'],if:'!dock.clue.lamp.aim'},
      leave,
    ]},
    switch:back([
      {who:'direction',text:'Click. A good, ordinary click. Nothing follows it.'},
      {who:'you',text:'Thank you. One honest thing in the room.'},
    ]),
    bay:theory([
      {who:'direction',text:'Cold contacts. Dust in the corners. The battery has been gone long enough for the empty space to have its own dirt.'},
      {who:'you',text:'Not flat. Not broken. Made unable.'},
    ],[
      {text:'ordinary storage',set:['dock.theory.lamp.storage']},
      {text:'somebody needed it to stay dark',set:['dock.theory.lamp.dark']},
    ]),
    aim:back([
      {who:'direction',text:'The dead glass takes in the chandelier and gives you a tiny curved room.'},
      {who:'direction',text:'For a moment there is room in that reflection for someone to stand behind the frame.'},
      {who:'you',text:'Enough.'},
    ]),
    done:done(),
  }),

  'dock-hand-truck': ({ revisited }) => ({
    start:{speaker:'THE HAND TRUCK',lines:[
      {who:'direction',text:revisited
        ? 'The cart is still strapped upright, waiting to be useful.'
        : 'A hand truck has been tied to the wall as if it might wander off.'},
    ],goto:'hub'},
    hub:{speaker:'THE HAND TRUCK',lines:[],choices:[
      {text:'pull the strap',goto:'strap',set:['dock.clue.truck.strap'],if:'!dock.clue.truck.strap'},
      {text:'rub at the chalk on the foot',goto:'chalk',set:['dock.clue.truck.chalk'],if:'!dock.clue.truck.chalk'},
      {text:'turn one wheel',goto:'wheel',set:['dock.clue.truck.wheel'],if:'!dock.clue.truck.wheel'},
      leave,
    ]},
    strap:theory([
      {who:'direction',text:'Tight. Properly buckled, tail tucked away. Nobody dropped this and ran.'},
      {who:'you',text:'Somebody stopped work and still put their hands in order.'},
    ],[
      {text:'the shift simply ended',set:['dock.theory.truck.shift']},
      {text:'they secured it before refusing the job',set:['dock.theory.truck.refusal']},
    ]),
    chalk:back([
      {who:'direction',text:'FRAME FIRST. The words blur under your thumb but do not come off.'},
      {who:'you',text:'Frame first. Then the thing inside it. Or keep the frame between you and the thing.'},
    ]),
    wheel:back([
      {who:'direction',text:'The wheel rolls half a turn and settles with the same crack in the rubber facing up.'},
      {who:'you',text:'Never carried the load. It was parked before the job began.'},
    ]),
    done:done(),
  }),

  'dock-freight-crates': ({ revisited }) => ({
    start:{speaker:'THE CRATES',lines:[
      {who:'direction',text:revisited
        ? 'The stacked crates keep their neat little absences.'
        : 'Three empty freight crates nest together, all corners and old tape.'},
      {who:'you',text:'Everything gets a box. Even things nobody intends to keep.'},
    ],goto:'hub'},
    hub:{speaker:'THE CRATES',lines:[],choices:[
      {text:'read the old labels',goto:'labels',set:['dock.clue.crates.labels'],if:'!dock.clue.crates.labels'},
      {text:'lift the packing cloth',goto:'cloth',set:['dock.clue.crates.cloth'],if:'!dock.clue.crates.cloth'},
      {text:'look for the chandelier box',goto:'missing',set:['dock.clue.crates.missing'],if:'!dock.clue.crates.missing'},
      leave,
    ]},
    labels:back([
      {who:'direction',text:'GLASS. CABLE. LENSES. Each word appears on several generations of tape.'},
      {who:'you',text:'This room has packed itself up more than once.'},
    ]),
    cloth:back([
      {who:'direction',text:'The cloth smells of rain and hot dust. Something round left a clean bowl in it.'},
      {who:'you',text:'A lamp, probably.'},
      {who:'direction',text:'Too large for the work lamp. Too small for the chandelier.'},
    ]),
    missing:theory([
      {who:'direction',text:'No long case. No padded crate. Nothing here could take the chandelier without breaking it down.'},
      {who:'you',text:'So the frame is the box.'},
      {who:'you',text:'Then why lock the box from the outside.'},
    ],[
      {text:'to keep the glass safe',set:['dock.theory.crates.protect']},
      {text:'to keep something in',set:['dock.theory.crates.contain']},
    ]),
    done:done(),
  }),

  'dock-road-case': ({ revisited, auditioned }) => ({
    start:{speaker:'THE OPEN CASE',lines:[
      {who:'direction',text:revisited
        ? 'The open case waits with the patience of an empty mouth.'
        : 'A black road case lies open near the wall. The foam inside was cut around a recorder almost the size of yours.'},
      {who:'you',text:auditioned?'I know your voice now. Short. Dry. Close.':'Previous recordist, then. Or somebody with the same expensive habits.'},
    ],goto:'hub'},
    hub:{speaker:'THE OPEN CASE',lines:[],choices:[
      {text:'fit your hand into the empty shape',goto:'foam',set:['dock.clue.case.foam'],if:'!dock.clue.case.foam'},
      {text:'look for a name',goto:'name',set:['dock.clue.case.name'],if:'!dock.clue.case.name'},
      {text:'snap the latch once',goto:'sound',set:['dock.clue.case.sound'],dockAction:'audition',if:'!dock.clue.case.sound'},
      leave,
    ]},
    foam:back([
      {who:'direction',text:'Your recorder would fit if you worried the corners. The missing one was broader, older, carried by both hands.'},
      {who:'you',text:'He put it down here and took the machine with him.'},
      {who:'you',text:'Or the machine went and left the case.'},
    ]),
    name:theory([
      {who:'direction',text:'No name. One strip of peeled tape and, under the handle, four tally marks cut with a key.'},
      {who:'direction',text:'There is space for a fifth.'},
      {who:'you',text:'Four of something.'},
    ],[
      {text:'four rooms recorded',set:['dock.theory.case.rooms']},
      {text:'four returns to this dock',set:['dock.theory.case.returns']},
    ]),
    sound:back([
      {who:'direction',text:'The latch cracks shut. The case answers with one small metal cough.'},
      {who:'you',text:'There. Now I know where that sound lives.'},
    ]),
    done:done(),
  }),

  'dock-cable-reel': ({ revisited, auditioned }) => ({
    start:{speaker:'THE EMPTY REEL',lines:[
      {who:'direction',text:revisited
        ? 'The reel has not grown a cable while your back was turned.'
        : 'A cable reel stands by the salvage rack. No cable. Just the wheel and a handle polished by hands.'},
      {who:'you',text:auditioned?'Hollow thing. You carry a sound better than a cable.':'Empty, but not abandoned. Somebody wound it clean.'},
    ],goto:'hub'},
    hub:{speaker:'THE EMPTY REEL',lines:[],choices:[
      {text:'turn the handle slowly',goto:'sound',set:['dock.clue.reel.sound'],dockAction:'audition',if:'!dock.clue.reel.sound'},
      {text:'look down the empty centre',goto:'centre',set:['dock.clue.reel.centre'],if:'!dock.clue.reel.centre'},
      {text:'check the loose cable end',goto:'end',set:['dock.clue.reel.end'],if:'!dock.clue.reel.end'},
      leave,
    ]},
    sound:back([
      {who:'direction',text:'One click under your palm. Then the empty wheel rings longer than it ought to.'},
      {who:'you',text:'Easy. It is a big hollow thing in a bigger hollow thing.'},
    ]),
    centre:back([
      {who:'direction',text:'Through the hub you can see the chandelier, reduced to a bright little cage.'},
      {who:'direction',text:'As you move, the bars slide across it like a shutter.'},
    ]),
    end:theory([
      {who:'direction',text:'There is no loose end. The drum is clean.'},
      {who:'direction',text:'The room offers several coils. None reach it.'},
      {who:'you',text:'So where is the cable that fed the chandelier.'},
    ],[
      {text:'it was removed with the rest',set:['dock.theory.reel.removed']},
      {text:'the chandelier was never connected here',set:['dock.theory.reel.never']},
    ]),
    done:done(),
  }),

  'dock-shutter-bar': ({ revisited, auditioned }) => ({
    start:{speaker:'THE SHUTTER',lines:[
      {who:'direction',text:revisited
        ? 'The long steel bar waits in its clips along the shutter.'
        : 'A steel bar runs shoulder-high along the loading shutter. The whole wall seems to be holding its breath through it.'},
      {who:'you',text:auditioned?'I felt that one in my teeth.':'That will travel.'},
    ],goto:'hub'},
    hub:{speaker:'THE SHUTTER',lines:[],choices:[
      {text:'knock it with one knuckle',goto:'sound',set:['dock.clue.shutter.sound'],dockAction:'audition',if:'!dock.clue.shutter.sound'},
      {text:'put an ear to the steel',goto:'ear',set:['dock.clue.shutter.ear'],if:'!dock.clue.shutter.ear'},
      {text:'look through the bottom gap',goto:'gap',set:['dock.clue.shutter.gap'],if:'!dock.clue.shutter.gap'},
      leave,
    ]},
    sound:back([
      {who:'direction',text:'The knock runs away through the shutter and returns from somewhere above you.'},
      {who:'you',text:'That is the roof coming back. Has to be.'},
      {who:'direction',text:'The chandelier trembles once.'},
    ]),
    ear:theory([
      {who:'direction',text:'Cold paint against your cheek. Beyond it: rain, a road far off, and something ticking too slowly to be water.'},
      {who:'direction',text:'The ticking stops when you name it.'},
    ],[
      {text:'building settling',set:['dock.theory.shutter.building']},
      {text:'something listening',set:['dock.theory.shutter.listening']},
    ]),
    gap:back([
      {who:'direction',text:'A black line of yard. One weed laid flat by the weather. No feet on the other side.'},
      {who:'you',text:'Good. Obviously.'},
    ]),
    done:done(),
  }),

  'dock-chandelier-frame': ({ revisited }) => ({
    start:{speaker:'THE CHANDELIER',lines:[
      {who:'direction',text:revisited
        ? 'The chandelier waits inside its frame, too low for a ceiling and too carefully held for rubbish.'
        : 'A chandelier hangs at eye level inside a wheeled cage. Each arm is wrapped. Every wheel is locked.'},
      {who:'you',text:'You are the only thing in here being treated like it might wake up.'},
    ],goto:'hub'},
    hub:{speaker:'THE CHANDELIER',lines:[],choices:[
      {text:'test the locks',goto:'locks',set:['dock.clue.chandelier.locks'],if:'!dock.clue.chandelier.locks'},
      {text:'follow the wire',goto:'wire',set:['dock.clue.chandelier.wire'],if:'!dock.clue.chandelier.wire'},
      {text:'read the tag',goto:'tag',set:['dock.clue.chandelier.tag'],if:'!dock.clue.chandelier.tag'},
      {text:'compare it with the unfinished list',goto:'list',set:['dock.clue.chandelier.list'],if:'dock.clue.workorder.last && !dock.clue.chandelier.list'},
      {text:'look at it through the dead lamp',goto:'reflection',set:['dock.clue.chandelier.reflection'],if:'dock.clue.lamp.aim && !dock.clue.chandelier.reflection'},
      leave,
    ]},
    locks:back([
      {who:'direction',text:'You lean your weight into the frame. Rubber complains against concrete. The wheels do not turn.'},
      {who:'you',text:'Not parked. Fixed.'},
      {who:'direction',text:'The locks face outward, where a person could reach them. Nothing inside could.'},
    ]),
    wire:theory([
      {who:'direction',text:'A cloth-wrapped lead runs down the stem and ends above the floor, neatly cut and tied back.'},
      {who:'you',text:'No plug. No hidden run. Nothing reaches a wall.'},
    ],[
      {text:'someone made it safe for transport',set:['dock.theory.chandelier.safe']},
      {text:'someone made sure it could not light',set:['dock.theory.chandelier.dark']},
    ]),
    tag:back([
      {who:'direction',text:'FRAME AND LOCK. Beneath it, in softer pencil: DO NOT HANG.'},
      {who:'you',text:'Nobody was going to put you back up.'},
      {who:'direction',text:'The tag is dated for tomorrow.'},
    ]),
    list:back([
      {who:'direction',text:'The words match: CHANDELIER — FRAME AND LOCK.'},
      {who:'you',text:'This is where their job stopped.'},
      {who:'you',text:'And where mine starts. That is cheerful.'},
    ]),
    reflection:back([
      {who:'direction',text:'In the dead lamp’s curved glass, the frame closes into a little room behind you.'},
      {who:'direction',text:'Empty.'},
      {who:'you',text:'Stop checking.'},
    ]),
    done:done(),
  }),
});

const AFTER = Object.freeze({
  'acq-maintenance-searchlight-dock': ({ revisited }) => ({
    start:{speaker:'THE DEAD LAMP',lines:[
      {who:'direction',text:revisited?'The work lamp is still dead. It is beginning to feel stubborn about it.':'You crouch beside the work lamp because it is the only light in the room that behaved.'},
    ],goto:'hub'},
    hub:{speaker:'THE DEAD LAMP',lines:[],choices:[
      {text:'flick the switch again',goto:'switch',set:['dock.aftermath.lamp.switch'],if:'!dock.aftermath.lamp.switch'},
      {text:'check the empty space',goto:'empty',set:['dock.aftermath.lamp.empty'],if:'!dock.aftermath.lamp.empty'},
      {text:'look for the figure in its glass',goto:'glass',set:['dock.aftermath.lamp.glass'],if:'!dock.aftermath.lamp.glass'},
      leave,
    ]},
    switch:back([{who:'direction',text:'Click. Nothing.'},{who:'you',text:'Good.'},{who:'you',text:'Why is that good.'}]),
    empty:back([{who:'direction',text:'The battery space is empty. It was empty before. Your fingertip comes away grey with the same old dust.'},{who:'you',text:'One light had no power. The other had no excuse.'}]),
    glass:theory([
      {who:'direction',text:'Only your eye, bent wide in the curved glass.'},
      {who:'you',text:'I saw it here first. Or I saw enough to become afraid of the rest.'},
    ],[
      {text:'I saw a person',set:['dock.theory.after.lamp.person']},
      {text:'I saw a shape and supplied the person',set:['dock.theory.after.lamp.shape']},
    ]),
    done:done(),
  }),

  'dock-road-case': ({ revisited, auditioned }) => ({
    start:{speaker:'THE OPEN CASE',lines:[
      {who:'direction',text:revisited?'The case has not returned to where you remember it.':'The road case sits a little farther from the wall. Not much. Enough that you have to choose whether you know.'},
      {who:'you',text:auditioned?'The latch came from across the room. This stayed here. I watched it stay here.':'I never touched this one. I do not get to pretend I know where it was.'},
    ],goto:'hub'},
    hub:{speaker:'THE OPEN CASE',lines:[],choices:[
      {text:'check the latch',goto:'latch',set:['dock.aftermath.case.latch'],if:'!dock.aftermath.case.latch'},
      {text:'look at the four tally marks',goto:'tallies',set:['dock.aftermath.case.tallies'],if:'!dock.aftermath.case.tallies'},
      {text:'put it back against the wall',goto:'move',set:['dock.aftermath.case.move'],if:'!dock.aftermath.case.move'},
      leave,
    ]},
    latch:theory(auditioned?[
      {who:'direction',text:'Closed now. The bright edge sits under your thumb exactly where it did before.'},
      {who:'you',text:'One sound. Two places.'},
    ]:[
      {who:'direction',text:'Closed now. You cannot remember whether it was open.'},
      {who:'you',text:'That is what I get for not touching things the first time.'},
    ],auditioned?[
      {text:'the sound moved',set:['dock.theory.after.case.moved']},
      {text:'fear moved it for me',set:['dock.theory.after.case.fear']},
    ]:[
      {text:'it was probably closed',set:['dock.theory.after.case.closed']},
      {text:'I cannot recover the fact now',set:['dock.theory.after.case.unknown']},
    ]),
    tallies:back([{who:'direction',text:'Four cuts under the handle. Space for a fifth.'},{who:'you',text:'He came back here four times.'},{who:'direction',text:'Or something wanted the next person to think he did.'}]),
    move:back([{who:'direction',text:'You slide it back. It leaves a clean track through fresh dust.'},{who:'you',text:'Fresh.'},{who:'you',text:'Do not say that like it helps.'}]),
    done:done(),
  }),

  'dock-cable-reel': ({ revisited, auditioned }) => ({
    start:{speaker:'THE EMPTY REEL',lines:[
      {who:'direction',text:revisited?'The handle rests one tooth past certainty.':'The reel handle is not where you left it. Or it is precisely where you left it and the room has moved around the memory.'},
      {who:'you',text:auditioned?'I heard you behind the desk. You were in front of me.':'I did not turn you. I am nearly sure I did not turn you.'},
    ],goto:'hub'},
    hub:{speaker:'THE EMPTY REEL',lines:[],choices:[
      {text:'mark the tooth with a pencil',goto:'mark',set:['dock.aftermath.reel.mark'],if:'!dock.aftermath.reel.mark'},
      {text:'hold the handle still',goto:'hold',set:['dock.aftermath.reel.hold'],if:'!dock.aftermath.reel.hold'},
      {text:'look through the centre again',goto:'centre',set:['dock.aftermath.reel.centre'],if:'!dock.aftermath.reel.centre'},
      leave,
    ]},
    mark:theory([
      {who:'direction',text:'A pencil line across metal and frame. Crude. Undeniable.'},
      {who:'you',text:'There. Move now.'},
      {who:'direction',text:'It does not.'},
    ],[
      {text:'the mark is proof',set:['dock.theory.after.reel.proof']},
      {text:'the mark is an invitation',set:['dock.theory.after.reel.invite']},
    ]),
    hold:back([{who:'direction',text:'Your palm cups the handle. The wheel is cold and still.'},{who:'direction',text:'Behind the dispatch desk, something gives one soft click.'},{who:'you',text:'No.'}]),
    centre:back([{who:'direction',text:'Through the hub: broken bulbs, black arms, no figure.'},{who:'you',text:'I liked it better when this was a trick of perspective.'}]),
    done:done(),
  }),

  'dock-shutter-bar': ({ revisited, auditioned }) => ({
    start:{speaker:'THE SHUTTER',lines:[
      {who:'direction',text:revisited?'The steel is quiet now. Too thoroughly quiet.':'The shutter bar hums so faintly you feel it before you hear it.'},
      {who:'you',text:auditioned?'My knock came back from above the chandelier. There is no steel between here and there.':'I never knocked this. Whatever is in it belongs to the room.'},
    ],goto:'hub'},
    hub:{speaker:'THE SHUTTER',lines:[],choices:[
      {text:'stop the hum with your hand',goto:'hand',set:['dock.aftermath.shutter.hand'],if:'!dock.aftermath.shutter.hand'},
      {text:'listen at the bottom gap',goto:'gap',set:['dock.aftermath.shutter.gap'],if:'!dock.aftermath.shutter.gap'},
      {text:'knock once more',goto:'sound',set:['dock.aftermath.shutter.sound'],dockAction:'audition',if:'!dock.aftermath.shutter.sound'},
      leave,
    ]},
    hand:back([{who:'direction',text:'The hum stops under your palm.'},{who:'direction',text:'Something in the chandelier frame stops at the same instant.'},{who:'you',text:'I am not doing call and response with a room.'}]),
    gap:back([{who:'direction',text:'Rain. The far road. The weed still pressed flat.'},{who:'you',text:'Outside is exactly where I left it.'},{who:'direction',text:'You do not open the shutter to make sure.'}]),
    sound:theory([
      {who:'direction',text:'Your knuckle lands. The bar takes the sound away.'},
      {who:'direction',text:'It does not return.'},
      {who:'you',text:'Worse.'},
    ],[
      {text:'silence means nothing answered',set:['dock.theory.after.shutter.empty']},
      {text:'silence is the answer',set:['dock.theory.after.shutter.answer']},
    ]),
    done:done(),
  }),

  'dock-chandelier-frame': ({ revisited }) => ({
    start:{speaker:'THE BROKEN CHANDELIER',lines:[
      {who:'direction',text:revisited?'The frame still holds the shape of what happened.':'The bulbs are black mouths now. Glass lies inside the cage in a neat bright weather.'},
      {who:'you',text:'Start with what stayed put.'},
    ],goto:'hub'},
    hub:{speaker:'THE BROKEN CHANDELIER',lines:[],choices:[
      {text:'test every wheel lock',goto:'locks',set:['dock.aftermath.chandelier.locks'],if:'!dock.aftermath.chandelier.locks'},
      {text:'find the cut wire',goto:'wire',set:['dock.aftermath.chandelier.wire'],if:'!dock.aftermath.chandelier.wire'},
      {text:'look where the figure stood',goto:'figure',set:['dock.aftermath.chandelier.figure'],if:'!dock.aftermath.chandelier.figure'},
      {text:'touch one dead bulb',goto:'bulb',set:['dock.aftermath.chandelier.bulb'],if:'!dock.aftermath.chandelier.bulb'},
      leave,
    ]},
    locks:back([{who:'direction',text:'One, two, three, four. Locked. You shove until the cage complains and your shoulder hurts.'},{who:'you',text:'It never moved.'},{who:'you',text:'Neither did I, for a while.'}]),
    wire:back([{who:'direction',text:'Still tied back. Still ending in open air.'},{who:'you',text:'No wire. No battery. No somebody at a switch.'},{who:'direction',text:'The simple explanations leave in that order.'}]),
    figure:theory([
      {who:'direction',text:'Behind the frame: bare wall, two scuffs, your own shadow.'},
      {who:'you',text:'One of us was here.'},
    ],[
      {text:'the figure was here',set:['dock.theory.after.chandelier.figure']},
      {text:'only I can be proven',set:['dock.theory.after.chandelier.self']},
    ]),
    bulb:back([{who:'direction',text:'The glass is warm.'},{who:'you',text:'Of course it is. It just—'},{who:'you',text:'No. It was dark long enough. It should be cold.'}]),
    done:done(),
  }),
});

export const DOCK_INVESTIGATION_PROP_IDS = Object.freeze(Object.keys(PRE));

export function loadingDockInvestigation(propId, context = {}) {
  const aftermath = !!context.aftermath;
  const factory = aftermath && AFTER[propId] ? AFTER[propId] : PRE[propId];
  return factory ? factory({
    revisited:!!context.revisited,
    auditioned:!!context.auditioned,
  }) : null;
}
