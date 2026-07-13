import fs from 'node:fs';

// Pure regression for the title/service-menu keyboard path. This deliberately
// includes code-only events used by remote keyboards and some browser shells.
const classes=new Set();const focus={count:0};
globalThis.document={body:{classList:{add:(v)=>classes.add(v),remove:(v)=>classes.delete(v)}},querySelector:()=>({setAttribute(){},focus(){focus.count++;}})};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};

const scenes=await import('../../../public/labs/chunk-surfer/src/game/scenes.js');
const {makeTitleScene}=await import('../../../public/labs/chunk-surfer/src/game/title.js');
const {makeSettingsScene}=await import('../../../public/labs/chunk-surfer/src/game/settings.js');
const {makeWorldTitleScene}=await import('../../../public/labs/chunk-surfer/src/game/coldopen.js');
const {makeBagScene}=await import('../../../public/labs/chunk-surfer/src/game/bag.js');
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

let titleDone=false;
scenes.push(makeWorldTitleScene({duration:12,onDone:()=>titleDone=true,audio:{fadeSoundtrack(){},stopTyping(){}}}));
scenes.key({key:' ',code:'Space'});
ck('post-prologue title cannot be skipped by input',scenes.depth()===1&&!titleDone);
scenes.update(12.1);
ck('post-prologue title completes on its authored clock',scenes.depth()===0&&titleDone);

let dropped=0;
scenes.push(makeBagScene({equipment:[{id:'radio',label:'radio',action:()=>dropped++}],job:{rooms:[],unfiled:[],done:0,total:5}}));
scenes.key({key:'Enter',code:'Enter'});
ck('radio drop requires confirmation',dropped===0);
scenes.key({key:'Enter',code:'Enter'});
ck('bag gear rows expose the confirmed radio drop action',dropped===1);
scenes.pop();

const main=fs.readFileSync(new URL('../../../public/labs/chunk-surfer/src/main.js',import.meta.url),'utf8');
const count=(needle)=>(main.match(new RegExp(`function ${needle}\\(`,'g'))||[]).length;
ck('refactor retains the story and recorder authorities',
  ['fireCue','think','converse','recordAction','roll','stopTake'].every((name)=>count(name)===1));
ck('modal overlays block held movement without freezing world simulation',
  /function step\(dx,dy\)\{[\s\S]{0,320}if\(scenes\.blocksInput\(\)\) return;/.test(main));
ck('non-modal scenes may decline a key without swallowing movement',
  main.includes('if(scenes.depth()>0 && scenes.key(e)){'));
ck('held movement has one frame-driven clock',
  main.includes('function tickHeldMovement(now)')&&main.includes('tickHeldMovement(nowLoopMs)')&&!main.includes('function startMoveTimer()'));
ck('rendered movement interpolates between collision cells',
  main.includes('function beginRenderStep(')&&main.includes('function renderedPlayerPoint(')&&main.includes('px:rendered.x, py:rendered.z'));
ck('native key repeat cannot inject extra movement steps',
  main.includes('if(!e.repeat&&!alreadyHeld)'));
ck('movement accepts code-only keyboard events',
  main.includes("KeyW:'w'")&&main.includes('const moveKey=movementKey(e)'));
if(!pass){console.error('\n❌ MENU INPUT FAILURES');process.exit(1);}console.log('\n✅ MENU INPUT PASSED');
