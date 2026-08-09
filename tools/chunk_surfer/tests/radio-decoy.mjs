globalThis.document={title:'chunk surfer',addEventListener(){},hidden:false};
globalThis.window={addEventListener(){}};
globalThis.localStorage={getItem(){return null;},setItem(){},removeItem(){}};

const RADIO=await import('../../../src/game/radio.js');
const REC=await import('../../../src/game/recordist.js');
let pass=true;const ck=(n,ok,x='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`);if(!ok)pass=false;};

RADIO.loadRadioState({schema:2,phase:'dead',dead:true,dropped:null},0);
ck('radio drops at the player position',RADIO.dropRadio(24,38,{roomId:'PLANT ROOM',floorId:'basement',now:1000})&&RADIO.isDropped());
ck('dropped location persists in radio save',RADIO.saveRadioState().dropped?.x===24&&RADIO.saveRadioState().dropped?.y===38);

REC.loadRecState({takes:[]});REC.startListening();REC.startRecording();
const events=RADIO.tickRadio(.016,{now:3500,px:90,py:90,random:()=>.5});
const ev=events.find((entry)=>entry.type==='pulse')?.event;
const heard=REC.recState().lastNoiseAt;
ck('squelch originates at the dropped radio, not the player',ev?.dropped&&heard.x===24&&heard.y===38,JSON.stringify({ev,heard}));
ck('a distant dropped-radio squelch does not spoil the local take',REC.isRecording()&&!REC.recState().spoiled,JSON.stringify(REC.recState()));
ck('the recorder clock remains clean after remote noise',REC.tickRecording(.25)==='running'&&!REC.recState().spoiled);
ck('radio cannot be picked up remotely',!RADIO.pickUpRadio(90,90));
ck('radio can be recovered nearby',RADIO.pickUpRadio(25,38)&&!RADIO.isDropped());
RADIO.tickRadio(.016,{now:4900,px:25,py:38,random:()=>.5});
ck('the same squelch on the belt still spoils a take',REC.recState().spoiled,REC.recState().spoilReason);

if(!pass){console.error('\n❌ RADIO DECOY FAILURES');process.exit(1);}
console.log('\n✅ RADIO DECOY PASSED');
