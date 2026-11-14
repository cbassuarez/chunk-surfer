// Three explicitly retained originals. Ownership stays in save.items; inspection
// and world removal project that same fact rather than making another ledger.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const direction=text=>({who:'direction',text});
const thought=text=>({who:'you',text});

export const RETAINED_BELONGINGS=freeze({
  'b3-session-card':{
    id:'b3-session-card',label:'B3 SESSION CARD',role:'evidence',propId:'b3-session-card',mesh:'b3_session_card',
    heldModelId:'b3-session-card',location:'STUDIO B3 / CONSOLE',keepLabel:'KEEP THE CARD',
    description:'A session card: one, voice; two, room; three carefully crossed out while its fader remains set.',
    lines:[direction('A session card on the console. One: voice. Two: room. Three has been carefully crossed out, but its fader is still set.'),
      direction('In the margin, two chairs and fine lines to the glass.')],
    consequence:'The card leaves the console. The crossed-out channel and its physical fader remain as they were.',
    inspectionActions:[
      {id:'read-channels',label:'READ THE CHANNEL LIST',lines:[direction('One: voice. Two: room. Three has been carefully crossed out.'),thought('The crossing-out is on the card. Its fader was still set when I picked it up.')]},
      {id:'read-margin',label:'LOOK AT THE MARGIN',lines:[direction('Two chairs and fine lines to the glass. The sketch is on the same card as the channel list.')]},
    ],
  },
  'vale-guarantor-slip':{
    id:'vale-guarantor-slip',label:"M. VALE'S GUARANTOR SLIP",role:'evidence',propId:'academic-roof-guarantor-trace',mesh:'loose_note',
    heldModelId:'vale-guarantor-slip',location:'CHAMBER ROOM / UNDER THE PIANO BENCH',keepLabel:'KEEP THE SLIP',
    description:'A folded maintenance slip. M. Vale signed for a hundred years; the later entries record what consent cost her.',
    lines:[direction('A narrow maintenance slip is folded beneath the chamber piano bench. It was kept under the seat rather than filed with the school accounts.'),
      direction('The dates are separated by decades. The handwriting belongs to the same person throughout.')],
    consequence:'The folded slip leaves the bench. Having read it remains evidence even if its physical custody later changes.',
    inspectionActions:[
      {id:'year-zero',label:'READ YEAR 0 / THE SIGNATURE',lines:[direction('SEAL, YEAR 0. M. VALE, CLEANER. I have been told that I will stay inside the grounds for one hundred years. I am signing while I can still walk away.')]},
      {id:'year-twelve',label:'READ YEAR 12 / THE WEDDING',lines:[direction('YEAR 12. My daughter married on Saturday. Ren brought the photograph on Monday. I knew I would miss the day. I did not know how much of it would fit in one picture.')]},
      {id:'year-sixty-one',label:'READ YEAR 61 / THE LEAK',lines:[direction('YEAR 61. The chamber roof leaked again. I changed the bucket before class. The seal kept the crews from taking the room. It never mended it for us.')]},
    ],
  },
  'lyle-music-box':{
    id:'lyle-music-box',label:"LYLE'S MUSIC BOX",role:'keepsake',propId:'coastal-broken-music-box',mesh:'music-box',
    heldModelId:'music-box',location:'COAST / THE BOX ON THE BANK',keepLabel:'TAKE IT BACK',
    description:'The damaged, closed music box Lyle gave you before his big piano break. It was already yours.',
    lines:[direction('The music box is broken now. It is still the one Lyle gave you.'),
      thought('Lyle gave me this before his big break. So I’d have something to remember him by.')],
    consequence:'The music box leaves its coastal resting place. The damp note remains a separate object; taking the box earns no recording receipt.',
    inspectionActions:[
      {id:'handle-box',label:'TURN IT IN YOUR HANDS',kind:'physical-inspection',inspectionId:'music-box',
        lines:[direction('The case stays closed. The oval winding key belongs to the same small object as the cream shell and dark rear plate.')]},
      {id:'remember-gift',label:'REMEMBER THE GIFT',lines:[thought('Lyle gave me this before his big break. So I’d have something to remember him by.'),
        direction('His note read: For the part that wouldn’t play. — L.')]},
    ],
  },
});

export function retainedBelongingDefinition(id){
  return typeof id==='string'&&Object.hasOwn(RETAINED_BELONGINGS,id)?RETAINED_BELONGINGS[id]:null;
}
export function retainedBelongingForProp(propId){
  return Object.values(RETAINED_BELONGINGS).find(item=>item.propId===propId)||null;
}
export function ownsRetainedBelonging(save,id){
  return !!retainedBelongingDefinition(id)&&Array.isArray(save?.items)&&save.items.includes(id);
}
export function takeRetainedBelonging(save,id){
  if(!retainedBelongingDefinition(id))return{save,changed:false,reason:'unknown-belonging'};
  if(ownsRetainedBelonging(save,id))return{save,changed:false,reason:'already-owned'};
  const base=save&&typeof save==='object'&&!Array.isArray(save)?save:{};
  return{save:{...base,items:[...(Array.isArray(base.items)?base.items:[]),id]},changed:true,reason:null};
}
export function retainedBelongingPrompt(id,{owned=false}={}){
  const item=retainedBelongingDefinition(id);if(!item)return null;
  return{itemId:id,propId:item.propId,title:item.label,owned,
    lines:structuredClone(owned?[thought('Already in my case.')]:item.lines),
    choices:owned?[{id:'done',label:'CLOSE',intent:{type:'close-retained-belonging',itemId:id}}]:[
      {id:'keep',label:item.keepLabel,intent:{type:'keep-retained-belonging',itemId:id}},
      {id:'leave',label:'LEAVE IT HERE',intent:{type:'leave-retained-belonging',itemId:id}},
    ]};
}
export function retainedBelongingInspection(id){
  const item=retainedBelongingDefinition(id);if(!item)return null;
  return{itemId:id,title:item.label,lines:[direction(item.description)],actions:structuredClone(item.inspectionActions)};
}
