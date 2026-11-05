// SHEET 1 OF THE WORK ORDER: WHERE EVERYTHING IS, IN PAGE MILLIMETRES.
//
// Seb picked BC2 (2026-11-04): the works order typed as a checklist, at the
// scale of a delivery schedule. The bake prints the form from these numbers
// (scripts/build-paper-assets.mjs) and his live ink lands on it from the same
// numbers (src/game/work-order-ink.js), so a tick can never miss its box.
// A4: 210 x 297, origin top-left.
const freeze=Object.freeze;
const MONO_EM=.3528*.6; // Nimbus Mono advance, mm per point
export const WORK_ORDER_SHEET_PAGE=0;
export const WORK_ORDER_ROOMS=freeze([
  freeze({roomId:'main_b3',name:'STUDIO B3'}),
  freeze({roomId:'the_tub',name:'THE NATATORIUM'}),
  freeze({roomId:'amplifications',name:'THE CONCERT HALL'}),
  freeze({roomId:'soundnoisemusic',name:'THE PRACTICE WING'}),
  freeze({roomId:'lux_nova',name:'THE CHAPEL'}),
]);
export const WORK_ORDER_SHIFTS=freeze([
  freeze({id:'story',name:'STORY',sub:'easier'}),
  freeze({id:'contract',name:'CONTRACT',sub:'recommended'}),
  freeze({id:'night',name:'NIGHT SHIFT',sub:'hard'}),
  freeze({id:'dead-air',name:'DEAD AIR',sub:'very hard'}),
]);
export const WORK_ORDER_CASSETTE_SLOTS=14; // Story's twelve, and the B3 store's two

const SHIFT_PT=14,ROOM_PT=15,shiftCw=SHIFT_PT*MONO_EM,roomCw=ROOM_PT*MONO_EM;
const SHIFT_TOP=62,ROOM_TOP=94,BAND=25.5,ROOM_FIRST=ROOM_TOP+4;
const STRIP_HEAD=ROOM_FIRST+5*BAND+7,STRIP_Y=STRIP_HEAD+5.4,PITCH=176/WORK_ORDER_CASSETTE_SLOTS,BOX_W=11,BOX_H=7.4;

export const WORK_ORDER_SHEET=freeze({
  type:freeze({shiftPt:SHIFT_PT,roomPt:ROOM_PT,headPt:10.4,smallPt:9.4}),
  shiftHeading:freeze({x:17,y:SHIFT_TOP}),
  shifts:freeze(WORK_ORDER_SHIFTS.map((shift,i)=>{const col=i%2,row=Math.floor(i/2),x=17+col*88,y=SHIFT_TOP+9+row*9.5;
    return freeze({...shift,x,y,countX:x+57,subX:x+5*shiftCw,subY:y+4,tick:freeze({x:x+1.1*shiftCw,y:y-4.8,size:5})});})),
  roomHeading:freeze({x:17,y:ROOM_TOP}),
  rooms:freeze(WORK_ORDER_ROOMS.map((room,i)=>{const top=ROOM_FIRST+i*BAND;
    return freeze({...room,index:i,top,bottom:top+BAND,baseline:top+10,
      tick:freeze({x:17+1.1*roomCw,y:top+4.6,size:5.6}),
      strike:freeze({x0:17+6*roomCw,x1:17+(9+room.name.length)*roomCw,y:top+8.4}),
      rules:freeze([top+17.6,top+23.6]),notes:freeze({x0:42,x1:193,top:top+13.8})});})),
  roomsBottom:ROOM_FIRST+5*BAND,
  stripHeading:freeze({x:17,y:STRIP_HEAD}),
  issued:freeze({labelX:150,lineX0:168,lineX1:193,y:STRIP_HEAD,writeX:171}),
  cassettes:freeze(Array.from({length:WORK_ORDER_CASSETTE_SLOTS},(_,i)=>freeze({n:i+1,x:17+i*PITCH+(PITCH-BOX_W)/2,y:STRIP_Y,w:BOX_W,h:BOX_H}))),
  conditions:freeze({x:17,y:STRIP_Y+BOX_H+14}),
  received:freeze({y:275,lineX0:66,lineX1:140,timeLabelX:146,timeX0:158,timeX1:193,signatureX:72,timeWriteX:161}),
});

/** Where the k-th note in a room's band goes. Fixed by k alone: ink that is
 * already on the sheet never moves when another note arrives. Two on the
 * rules, two more beside them, then two small ones beside the room name. */
export function workOrderNoteSlot(room,k){
  const {x0,x1,top}=room.notes,mid=(x0+x1)/2,i=Math.max(0,Math.floor(k))%6;
  if(i<2)return{x:x0,y:top+i*6,h:2.8};
  if(i<4)return{x:mid+1,y:top+(i-2)*6,h:2.8};
  return{x:120,y:room.top+1.4+(i-4)*4.8,h:2.5};
}
