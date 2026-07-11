// Pure regression for the title/service-menu keyboard path. This deliberately
// includes code-only events used by remote keyboards and some browser shells.
const classes=new Set();const focus={count:0};
globalThis.document={body:{classList:{add:(v)=>classes.add(v),remove:(v)=>classes.delete(v)}},querySelector:()=>({setAttribute(){},focus(){focus.count++;}})};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};

const scenes=await import('../../../public/labs/chunk-surfer/src/game/scenes.js');
const {makeTitleScene}=await import('../../../public/labs/chunk-surfer/src/game/title.js');
const {makeSettingsScene}=await import('../../../public/labs/chunk-surfer/src/game/settings.js');
let pass=true;const ck=(name,ok)=>{console.log(`${ok?'PASS':'FAIL'}  ${name}`);if(!ok)pass=false;};

let selected='';
scenes.push(makeTitleScene({onNewGame:()=>selected='new',onContinue:()=>selected='continue',onJustSurf:()=>selected='surf',onSettings:()=>selected='settings'}));
ck('title takes focus when entered',focus.count===1&&classes.has('title-screen'));
scenes.key({key:'Unidentified',code:'KeyS'});scenes.key({key:'Unidentified',code:'Enter'});
ck('code-only keyboard selects and confirms title item',selected==='surf');
ck('leaving title clears its body state',!classes.has('title-screen'));

scenes.push(makeSettingsScene());
scenes.key({key:'Unidentified',code:'KeyS'});scenes.key({key:'Escape',code:'Escape'});
ck('service menu accepts remote-code navigation and Escape',scenes.depth()===0);
if(!pass){console.error('\n❌ MENU INPUT FAILURES');process.exit(1);}console.log('\n✅ MENU INPUT PASSED');
