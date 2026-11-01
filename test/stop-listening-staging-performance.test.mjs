import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stopListeningStagedRooms} from '../src/game/stop-listening.js';

// Exercise the production coordinator and tick with cheap placement doubles.
// The real eligibility rule is retained; only the expensive geometry is faked.
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
function section(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a);
  assert.ok(a>=0&&b>a,`Missing production section ${start}`);
  return source.slice(a,b);
}
const keyAndSync=section('function stopListeningStagingKey(', '\n// On the step that carries him');
const tick=section('function tickStopListening(){','\nfunction readStopListeningSheet()');

function harness(){
  const context={
    FP:{isLoaded:()=>true},planName:'conservatory',usingSpecialSpace:()=>false,
    STOP_LISTENING_PREFIX:'stop-listening:',STOP_LISTENING_BOUNDS:{},
    stopListeningCanPlace:()=>()=>true,
    stopListeningPlacements:room=>[{id:`stop-listening:${room}:ear:0`},{id:`stop-listening:${room}:writing:0`}],
    stopListeningLoosePlacements:placements=>placements,
    state:{},takes:[],busy:new Set(),props:[],calls:{scans:0,refresh:0},
    refreshWorldProps:()=>context.calls.refresh++,performance:{now:()=>1},
    scenes:{blocksInput:()=>false},REC:{isRecording:()=>false},
    stopListeningState:()=>({room:null,arrivalSpoken:false}),recordableRoomAt:()=>null,
    saveStopListening:()=>{},SPEECH:{sayAll:()=>{}},STOP_LISTENING_COPY:{arrival:[]},
  };
  context.stopListeningRooms=()=>stopListeningStagedRooms(context.state,context.takes,{busy:room=>context.busy.has(room)});
  context.PROPS={
    allProps:()=>{context.calls.scans++;return context.props;},
    setLooseProp:(id,prop)=>{context.props=context.props.filter(entry=>entry.id!==id);if(prop)context.props.push(prop);},
  };
  vm.createContext(context);
  vm.runInContext(`let stopListeningStagedKey='';let stopListeningHiddenKinds=new Set();let stopListeningArrivalDueMs=0;\n${keyAndSync}\n${tick}`,context);
  return {
    context,
    tick:()=>vm.runInContext('tickStopListening()',context),
    sync:()=>vm.runInContext('syncStopListeningProps()',context),
    hide:kinds=>vm.runInContext(`stopListeningHiddenKinds=new Set(${JSON.stringify(kinds)})`,context),
    ids:()=>context.props.map(entry=>entry.id),
    steady:()=>{const scans=context.calls.scans;for(let i=0;i<10;i++)vm.runInContext('tickStopListening()',context);assert.equal(context.calls.scans,scans,'unchanged frames do not rescan props');},
  };
}

test('staging follows real room eligibility without scanning unchanged frames',()=>{
  const h=harness(),c=h.context;
  h.tick();h.steady();assert.deepEqual(h.ids(),[]);
  c.takes=['main_b3'];c.busy=new Set(['the_tub','soundnoisemusic']);h.tick();
  assert.deepEqual(h.ids(),['stop-listening:amplifications:ear:0','stop-listening:amplifications:writing:0']);h.steady();
  c.busy=new Set(['soundnoisemusic']);h.tick();
  assert.deepEqual(h.ids(),['stop-listening:the_tub:ear:0','stop-listening:the_tub:writing:0','stop-listening:amplifications:ear:0','stop-listening:amplifications:writing:0']);h.steady();
  c.state={room:'the_tub'};h.tick();
  assert.deepEqual(h.ids(),['stop-listening:the_tub:ear:0','stop-listening:the_tub:writing:0']);h.steady();
  c.state={};c.takes=[];h.tick();assert.deepEqual(h.ids(),[]);h.steady();
});

test('hidden kinds and explicit world rebuild reconcile without repeated scans',()=>{
  const h=harness(),c=h.context;c.state={room:'the_tub'};h.tick();
  h.hide(['ear']);h.tick();assert.deepEqual(h.ids(),['stop-listening:the_tub:writing:0']);h.steady();
  h.hide(['writing','ear']);h.tick();assert.deepEqual(h.ids(),[]);h.steady();
  h.hide([]);h.tick();assert.equal(h.ids().length,2);h.steady();
  // propsInit removes loose props. The building-load path explicitly calls sync
  // afterwards; the presence check must restore them even with the same key.
  c.props=[];h.sync();assert.equal(h.ids().length,2);h.steady();
  const init=source.indexOf('PROPS.propsInit(FP);');
  const syncAfter=source.indexOf('syncStopListeningProps({refresh:false});',init);
  assert.ok(init>=0&&syncAfter>init,'building initialization must explicitly restore staged props');
});
