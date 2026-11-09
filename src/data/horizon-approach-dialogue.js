import {HORIZON_APPROACH as C,horizonDaisyWord} from './horizon-approach.js';

const occupantOf=id=>C.occupants.includes(id)?id:'daisy';
const voices=Object.freeze({sarah:'sarah',lyle:'lyle',daisy:null,ant:null});
const names=Object.freeze({sarah:'SARAH',lyle:'LYLE',daisy:'',ant:''});
const person=(id,text)=>({who:voices[id]||'you',text,...(!voices[id]?{voice:false,say:false}:{})});
const you=text=>({who:'you',text,voice:false,say:false});

export function horizonApproachTruth(occupant,{lyleBox=null,reducedDread=false}={}){
  const id=occupantOf(occupant),line=text=>person(id,text);
  if(id==='sarah')return[
    line('The boundary was mine.'),
    line(reducedDread?'You could leave that part to me.':'I never said you could.'),
  ];
  if(id==='lyle')return[
    line(lyleBox==='broken'?'The spring gives out in the seventh bar.':lyleBox==='whole'?'You brought the one from the cab.':'The part that would not play.'),
    line('It never worked. That was all right.'),
    line('I can finish it.'),
  ];
  if(id==='ant')return[you('It gets across.')];
  return[you('Twenty-one petals.')];
}
export function horizonApproachPetalLine(plucked){
  const count=Math.max(0,Math.min(C.daisy.petals,Math.floor(Number(plucked)||0)));
  return count?you(horizonDaisyWord(count)):null;
}
export function horizonApproachReturnLines(occupant,{defeats=1,reducedDread=false}={}){
  const id=occupantOf(occupant),again=Math.max(1,Math.floor(Number(defeats)||1)),line=text=>person(id,text);
  const first={sarah:'You are back. That does not reopen the other way.',lyle:'Here again. We can start from where it stopped.',daisy:'The petals do not grow back.',ant:'It is on the other side now.'};
  const later={sarah:reducedDread?'I am still here. The other way is still closed.':'Again. You knew the other way was closed.',lyle:'Once more, then. The damage stays.',daisy:'The same bare stem. The same way out.',ant:'It does not cross back for me.'};
  return[
    line(again===1?first[id]:later[id]),
    line(again===1?'Two attempts remain. A third defeat is final.':'One attempt remains. A third defeat is final.'),
  ];
}

export function horizonApproachOfferLines(occupant,{defeats=0}={}){
  const id=occupantOf(occupant),line=text=>person(id,text),again=Math.max(0,Math.floor(Number(defeats)||0)),silent=!voices[id];
  if(again)return[
    line(silent?'The tower is my only way now.':'The tower is the only way now.'),
    line(again===1?'Two attempts remain. A third defeat is final.':'One attempt remains. A third defeat is final.'),
  ];
  const way={sarah:'Beside me, towards the tower. Any other way leads to the chapel.',lyle:'Past the box, towards the tower. Any other way leads to the chapel.',daisy:'Past the stem, towards the tower. Any other way leads to the chapel.',ant:'Across, towards the tower. Any other way leads to the chapel.'};
  return[
    line(way[id]),
    line("It's easier as long as you don't lose."),
    you('And if I lose?'),
    line(silent?'I come back here, with no choice but to continue. The chapel way will be closed.':'You come back here, with no choice but to continue. The chapel way will be closed.'),
    line('The first two defeats bring you back. The third is final.'),
  ];
}

// A question is optional; a route is physical. This tree never commits a route.
export function horizonApproachProposition(occupant,{lyleBox=null,defeats=0,reducedDread=false}={}){
  const id=occupantOf(occupant),line=text=>person(id,text),speaker=names[id],again=Math.max(0,Math.floor(Number(defeats)||0)),
    identity={sarah:'You know who I am.',lyle:'It is me. You know the tune.',daisy:'I know this counting.',ant:'I was there to see it.'},
    history={sarah:'I could say no. You could let that be enough.',lyle:lyleBox==='broken'?'You gave me the broken box. I can finish the part that would not play.':'You gave me the box. It does not have to do everything by itself.',daisy:'The last petal said loves me.',ant:'I stopped. It got across.'},
    route={sarah:'The tower is that way. The bells are beyond it.',lyle:'There is another way to the tower. You can hear the bells from there.',daisy:'Beyond the stem, the tower. I can go that way.',ant:'Across, then towards the tower. There is a way.'};
  return{
    start:{speaker,lines:again?horizonApproachReturnLines(id,{defeats:again,reducedDread}):[line(id==='sarah'?'There is another way.':id==='lyle'?'You can go another way.':'There is another way.')],goto:again?'decision':'questions'},
    questions:{speaker,lines:[],choices:[
      {text:'Who is there?',goto:'identity',hideWhenAsked:true},
      {text:'What happened?',goto:'history',hideWhenAsked:true},
      {text:'Where does it go?',goto:'route',hideWhenAsked:true},
      {text:'What does it cost?',goto:'consequence',hideWhenAsked:true},
      {text:'That is enough.',goto:'decision'},
    ]},
    identity:{speaker,lines:[you('Who is there?'),line(identity[id])],goto:'questions'},
    history:{speaker,lines:[you('What happened?'),line(history[id])],goto:'questions'},
    route:{speaker,lines:[you('Where does it go?'),line(route[id])],goto:'questions'},
    consequence:{speaker,lines:[
      you('What does it cost?'),
      line('The tower becomes the only way. The chapel will not open again.'),
      line("It's easier as long as you don't lose."),
      you('And if I lose?'),
      line(id==='sarah'||id==='lyle'?"You come back here, with no choice but to continue.":'I come back here, with no choice but to continue.'),
      line('The first two defeats bring you back. The third is final.'),
    ],goto:'questions'},
    decision:{speaker,lines:again?[
      line('The chapel way is closed. The tower way is still there.'),
    ]:[
      line('Towards the tower, you take this way. Walk on elsewhere, and it is the chapel.'),
      line('There is time to decide.'),
    ],goto:'done'},
    done:{speaker,lines:[]},
  };
}
