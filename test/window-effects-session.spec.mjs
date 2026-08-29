import assert from 'node:assert/strict';
import { createPersonalizedWindowEffects,FIREBALL_SURFACE_LABELS } from '../src/platform/personalized-window-effects.js';

const calls=[];const webviews=new Map();
class Surface{static async getByLabel(label){return webviews.get(label)||null;}constructor(label){this.label=label;webviews.set(label,this);}once(_e,cb){cb();}async hide(){}async close(){webviews.delete(this.label);}}
const effects=createPersonalizedWindowEffects({runtimeApi:{WebviewWindow:Surface,invoke:async(command,payload)=>{calls.push([command,payload]);if(command==='chunk_fireball_cast_prewarm'){for(const label of FIREBALL_SURFACE_LABELS)if(!webviews.has(label))new Surface(label);return 4;}return true;}},tokenFactory:(()=>{let i=0;return()=>`fireball-session-${++i}`;})(),documentApi:null});
const first=effects.begin({intensity:'hostile'}),second=effects.begin({intensity:'hostile'});
assert.notEqual(first,second);assert.equal(await effects.end(first),false,'stale cleanup cannot end a newer session');
await effects.prepareFireballs();assert.equal(webviews.size,4);
await effects.emergencyRestore({notify:false});assert.equal(effects.active(),false);assert.equal(webviews.size,0);
assert.ok(calls.some(([command])=>command==='chunk_fireball_cast_hide_all'));
const fullscreen=effects.begin({intensity:'hostile',fullscreen:true});await effects.prepareFireballs();await effects.end(fullscreen);
assert.equal(calls.some(([command])=>command.includes('window_choreography')),false);
console.log('fireball surface session tests passed');
