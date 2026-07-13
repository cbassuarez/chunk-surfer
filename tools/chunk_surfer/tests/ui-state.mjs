import fs from 'node:fs';
import path from 'node:path';
globalThis.document={body:{classList:{add(){},remove(){}}},querySelector:()=>null};
globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};

const scenes=await import('../../../public/labs/chunk-surfer/src/game/scenes.js');
const {makeWarningScene}=await import('../../../public/labs/chunk-surfer/src/game/warning.js');
const {makeBagScene}=await import('../../../public/labs/chunk-surfer/src/game/bag.js');
const {normalizeEquipment}=await import('../../../public/labs/chunk-surfer/src/game/bag-model.js');
const ROOT=path.resolve(import.meta.dirname,'../../..');
const read=(p)=>fs.readFileSync(path.join(ROOT,p),'utf8');
const main=read('public/labs/chunk-surfer/src/main.js'),warning=read('public/labs/chunk-surfer/src/game/warning.js');
const settings=read('public/labs/chunk-surfer/src/game/settings.js'),minimap=read('public/labs/chunk-surfer/src/render/minimap.js');
const transcript=read('public/labs/chunk-surfer/src/render/transcript.js');
let pass=true;const ck=(n,ok,d='')=>{console.log(`${ok?'PASS':'FAIL'}  ${n}${d?'  '+d:''}`);if(!ok)pass=false;};

let yes=0,no=0;
scenes.push(makeWarningScene({onEnableMic:()=>yes++,onDisableMic:()=>no++}));
scenes.key({key:'Enter',code:'Enter'}); // advisory -> microphone
scenes.key({key:'Enter',code:'Enter'}); // must do nothing
ck('microphone permission cannot be confirmed by Enter/Space spam',scenes.depth()===1&&yes===0&&no===0);
scenes.key({key:'y',code:'KeyY'});
ck('microphone permission accepts an explicit Y',scenes.depth()===0&&yes===1);
scenes.push(makeWarningScene({onEnableMic:()=>yes++,onDisableMic:()=>no++}));
scenes.key({key:'Enter',code:'Enter'});scenes.key({key:'n',code:'KeyN'});
ck('microphone permission accepts an explicit N',scenes.depth()===0&&no===1);
ck('the warning is created by NEW GAME, never unconditionally at boot',
  main.indexOf('function beginNewGameFlow')<main.indexOf('makeWarningScene({',main.indexOf('function beginNewGameFlow'))&&
  !/function bootScenes\([\s\S]*scenes\.push\(makeWarningScene/.test(main));

const job={rooms:[{roomId:'main_b3',label:'studio B3'}],unfiled:[],done:0,total:5};let memory=null;
const bag=makeBagScene({equipment:[{id:'map',label:'location indicator'}],job,onRemember:(v)=>memory=v});
scenes.push(bag);bag.key({key:'Tab',code:'Tab',shiftKey:false});bag.key({key:'b',code:'KeyB'});
const reopened=makeBagScene({equipment:[{id:'map',label:'location indicator'}],job,memory});
ck('bag restores its last section and selection',reopened.debugState().nav.sectionId===memory.sectionId,memory?.sectionId);
ck('the location indicator is a real actionable bag profile',normalizeEquipment({id:'map',label:'location indicator',action(){}}).actions.primary?.id==='activate');
ck('menu tab and bag navigation persist in save state',settings.includes("set('menuTab',tabs[tab].id)")&&main.includes('onRemember:(bagNav)=>saveCommit({bagNav})'));
ck('minimap samples the renderer physical slice and reports target plus nearby HUSH',
  minimap.includes('plan.solid[i]')&&minimap.includes("uiGlyph(mx,my,'H'")&&main.includes('targetLabel:OBJ.targetRoom()')&&main.includes('plan:slice'));
ck('HUSH stays on the location indicator instead of disappearing outside a short radius',
  main.includes('const pst=PRES.isActive()?PRES.presenceState():null'));
ck('machine direction text is italic prose, not slash decoration',
  transcript.includes('uiItalicText')&&!transcript.includes("`${i === 0 ? '// ' : ''}`"));
ck('being taken is a blocking flash, black, then focused transcript scene',
  main.includes("id:'taken-flash',blocksInput:true,blocksWorld:true")&&main.includes("id:'taken-dialogue'")&&main.includes('makeColdOpenScene({'));
ck('another taking is suppressed until the lost item is recovered',
  main.includes('!takenActive && !lostItem && performance.now()>=takenRecoveryUntil'));

if(!pass)process.exit(1);console.log('\n✅ UI STATE PASSED');
