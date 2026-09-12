// Cuelume's mechanical palette, rendered on the game's existing menu bus.
// Global/SFX gain is applied by that bus, once. These levels gate playback and
// cancel active voices at mute; pause deliberately leaves menu controls audible.
import { createControlCueEngine } from './control-cue-engine.js';

export const UI_CUE = Object.freeze({
  MOVE:'tick', PRESS:'press', RELEASE:'release', CONFIRM:'toggle', BACK:'back',
  DENIED:'refuse', ON:'latch', OFF:'unlatch', FIT:'fit', REMOVE:'remove',
  PATCH:'patch', UNPATCH:'unpatch', PAGE:'page',
});
export const UI_CUE_GAIN = .55;
const clamp01=value=>Math.max(0,Math.min(1,Number(value)||0));
let engine=null,context=null,destination=null,getQuiet=()=>false;
let globalLevel=1,sfxLevel=1,enabled=true,focused=true;

export function configureUiCues(options={}){
  getQuiet=options.getQuiet||getQuiet;
  if(context===options.context&&destination===options.destination&&engine)return engine;
  engine?.dispose();context=options.context;destination=options.destination;
  engine=context&&destination?createControlCueEngine({context,destination,gain:UI_CUE_GAIN}):null;
  return engine;
}
const audible=()=>enabled&&focused&&globalLevel>0&&sfxLevel>0;
function gate(){if(!audible())engine?.cancel();}
export function setUiCueGlobalLevel(value){globalLevel=clamp01(value);gate();return globalLevel;}
export function setUiCueSfxLevel(value){sfxLevel=clamp01(value);gate();return sfxLevel;}
export function setUiCueEnabled(value){enabled=!!value;gate();return enabled;}
export function setUiCueFocused(value){focused=!!value;gate();return focused;}
export function cancelUiCueScope(scope='',{pendingOnly=true}={}){return engine?.cancel(scope,{pendingOnly})||0;}
export function uiCueLevels(){return {global:globalLevel,sfx:sfxLevel,enabled,focused,effective:audible()?globalLevel*sfxLevel*UI_CUE_GAIN:0};}
export function uiCueSnapshot(){return {...uiCueLevels(),...engine?.snapshot(),connected:!!engine};}
export function uiCue(name,options={}){
  if(!audible()||!engine)return false;
  try{return engine.play(name,{...options,quiet:options.quiet??!!getQuiet()});}catch(_){return false;}
}
