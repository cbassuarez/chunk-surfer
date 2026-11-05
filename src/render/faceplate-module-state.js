// One supplied run snapshot and one reserved instrument territory per UI frame.
// This module owns no clock, save, world, actor or input source.
import {fieldDeckLayout} from './hud-layout.js';
const finite=(value,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const position=value=>value&&Number.isFinite(value.x)&&Number.isFinite(value.y)?{x:value.x,y:value.y}:null;
const noRunScene=/^(?:title|world-title(?:-|$)|boot(?:-|$)|archive(?:-|$)|history(?:-|$)|transfer-room(?:-|$)|return-report|return-index|credits|eula|warning|beta-notice|opening(?:-|$)|student-strike|standing-tear|first-strike|ending(?:-|$))/;
const nonCurrentScopes=new Set(['historical','title','archive','cinematic','none']);

// Current root surfaces which can own the shared device territory. Physical
// knobs/lettering nested in a panel are not additional owners. Mixed presenters
// such as coldopen declare faceplate explicitly; future or external presenters
// can use the same boolean metadata without inventing another id convention.
export const CURRENT_RUN_FACEPLATE_IDS=Object.freeze([
  'bag','field-map','pause','god-menu','settings','controller-settings','difficulty-select',
  'recorder','payphone','b3-console','tower-tenor-performance','academic-bouncers','item-inspection',
  'setup-field-case','setup-level-hold','hush-run','progression-lab','hush-audio-lab','map-lab','bag-lab',
]);
export const CURRENT_RUN_FACEPLATE_PREFIXES=Object.freeze([
  'thought:','dialogue:','battle:','radio:','doc:','object-detail:','achievement-notice:','story-art-preview:',
]);
const currentFaceplateIds=new Set(CURRENT_RUN_FACEPLATE_IDS);
export function faceplateUsesCurrentRunModules(scene){
  if(!scene||typeof scene!=='object')return false;
  const id=String(scene.id||'');
  if(noRunScene.test(id)||nonCurrentScopes.has(scene.scope))return false;
  if(typeof scene.faceplate==='boolean')return scene.faceplate;
  return currentFaceplateIds.has(id)||CURRENT_RUN_FACEPLATE_PREFIXES.some(prefix=>id.startsWith(prefix));
}
let serial=0,current=null;

export function faceplateModulesEligible(context={}){
  return context.enabled===true&&typeof context.runId==='string'&&context.runId.trim().length>0
    &&!nonCurrentScopes.has(context.scope)&&!noRunScene.test(String(context.sceneId||''));
}
export function faceplateModuleLayout({cols=80,rows=45}={}){
  const size={cols:Math.max(20,Math.floor(finite(cols,80))),rows:Math.max(8,Math.floor(finite(rows,45)))};
  if(size.cols<40||size.rows<24)return{mode:'none',physicalSize:size,contentSize:{...size},territory:null};
  const navigator=fieldDeckLayout(size).navigator,contentCols=Math.floor(navigator.x-2);
  if(contentCols>=40&&size.rows>=24)return{mode:'side',physicalSize:size,contentSize:{cols:contentCols,rows:size.rows},
    navigator:{...navigator},territory:{x:contentCols+1,y:0,w:size.cols-contentCols-1,h:size.rows}};
  const height=Math.min(7.2,Math.max(0,size.rows-12)),top=size.rows-height;
  const mapWidth=Math.min(14,Math.max(8,size.cols*.34));
  return{mode:'bottom',physicalSize:size,contentSize:{cols:size.cols,rows:Math.max(8,Math.floor(top-.6))},
    territory:{x:0,y:top,w:size.cols,h:height},
    map:{x:1,y:top+.55,w:mapWidth-1.5,h:Math.max(1,height-1.1)},
    lcd:{x:mapWidth+1,y:top+2.7,w:Math.max(1,size.cols-mapWidth-2),h:Math.min(3.45,Math.max(1,height-3.25))},
    clockHousing:{x:0,y:top-.3,w:size.cols,h:height},
    identity:{x:mapWidth+1,y:top+.55,w:Math.max(1,size.cols-mapWidth-11.5),h:1}};
}
export function faceplateMapSnapshot(model){
  if(!model||typeof model!=='object'||!model.player)return null;
  const player={...model.player,position:position(model.player.position)};
  const visual=model.hush?.active===true&&model.hush.visible===true&&position(model.hush.position);
  // Unseen point telemetry cannot become a radar trail when a menu borrows the
  // navigator. Regions/bearings and words remain the existing evidence policy.
  const contacts=(model.contacts||[]).map(contact=>({...contact,observation:contact.observation
    ?{...contact.observation,position:null}:contact.observation}));
  const hush=model.hush?{...model.hush,position:visual?position(model.hush.position):null}:null;
  return{...model,player,contacts,hush};
}
export function beginFaceplateModuleState(context,size){
  const layout=faceplateModuleLayout(size),enabled=faceplateModulesEligible(context)&&layout.mode!=='none';
  const clock=typeof context?.nightClock?.value==='string'&&/^(?:(?:[01]\d|2[0-3]):[0-5]\d|  :  )$/.test(context.nightClock.value)
    ?{...context.nightClock}:null;
  current={serial:++serial,enabled,painted:false,layout,error:null,context:enabled?{
    ...context,nightClock:clock,map:faceplateMapSnapshot(context.map),now:finite(context.now),held:context.held===true,
    telemetry:{...(context.telemetry||{}),takesEnabled:context.telemetry?.takesEnabled===true,
      paused:context.held===true,nightClock:clock},
  }:null};
  return current;
}
export const currentFaceplateModuleState=()=>current;
export const faceplateModuleFrameOwnsNavigator=()=>current?.enabled===true;
export function claimFaceplateModulePaint(){
  if(!current?.enabled||current.painted)return null;
  current.painted=true;return current;
}
export function faceplateModuleStatus(){return current?{serial:current.serial,enabled:current.enabled,painted:current.painted,
  mode:current.layout.mode,contentSize:{...current.layout.contentSize},physicalSize:{...current.layout.physicalSize},
  runId:current.context?.runId||null,held:current.context?.held||false,clock:current.context?.nightClock||null,
  locationResolved:current.context?.map?.player?.resolved===true,error:current.error}:null;}
