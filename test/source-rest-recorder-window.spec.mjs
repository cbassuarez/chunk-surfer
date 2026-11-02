import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSourceRestRecorderWindow,createSourceRestRecorderEnvelope,createSourceRestRecorderEnvelopeGate,
  sourceRestRecorderEligible,sourceRestRecorderPlacement,SOURCE_REST_RECORDER_LABEL,SOURCE_REST_RECORDER_PROTOCOL} from '../src/platform/source-rest-recorder-window.js';
import {sourceRestInstrumentFrame} from '../src/render/source-rest-instrument.js';

const makeFrame=(patch={})=>({phase:'wrong-return',mode:'seated',seatId:'bench-ii',ownerId:'continuation-1',
  presentation:{stage:2,progress:.27,suppressPeripheral:false,empty:false},musicTime:142,
  machine:{trace:true,face:{counter:'00:23',meter:{db:-55},lamp:{text:'TRACE'}},note:'There is no signal here.'},
  conversationView:{who:'unknown',line:{text:'Listen.'},typed:7,history:[],nodeId:'voice'},...patch});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const geometry=({scale=1,windowScale=scale,work={x:0,y:24,width:2560,height:1390},main={x:60,y:100,width:1280,height:800}}={})=>({
  monitor:{scaleFactor:scale,workArea:{position:{x:work.x*scale,y:work.y*scale},size:{width:work.width*scale,height:work.height*scale}}},
  mainPosition:{x:main.x*scale,y:main.y*scale},mainSize:{width:main.width*windowScale,height:main.height*windowScale},mainScaleFactor:windowScale,
});
const intersection=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
function assertContained(placement){
  assert.equal(placement.ok,true);const {rect,workArea,margin}=placement;
  assert.ok(rect.x>=workArea.x+margin);assert.ok(rect.y>=workArea.y+margin);
  assert.ok(rect.x+rect.width<=workArea.x+workArea.width-margin);assert.ok(rect.y+rect.height<=workArea.y+workArea.height-margin);
  assert.equal(intersection(rect,placement.transcript),0,'lower transcript remains clear');
}

test('placement prefers a full readable free side and has a left-side alternative',()=>{
  const right=sourceRestRecorderPlacement(geometry());assertContained(right);assert.equal(right.kind,'right');
  assert.equal(right.width,880);assert.equal(right.height,540);assert.equal(intersection(right.rect,right.main),0);
  const left=sourceRestRecorderPlacement(geometry({main:{x:1320,y:100,width:1200,height:800}}));
  assertContained(left);assert.equal(left.kind,'left');assert.equal(intersection(left.rect,left.main),0);
});

test('a narrower free side retains readable dimensions without resizing or overlapping the main game',()=>{
  const placement=sourceRestRecorderPlacement(geometry({work:{x:0,y:24,width:2400,height:1200},main:{x:0,y:100,width:1690,height:900}}));
  assertContained(placement);assert.equal(placement.kind,'right');assert.equal(placement.compact,true);
  assert.ok(placement.width>=640);assert.ok(placement.height>=400);assert.equal(intersection(placement.rect,placement.main),0);
});

test('a laptop-sized work area uses a top corner and reserves the lower dialogue instead of centering the face',()=>{
  const placement=sourceRestRecorderPlacement(geometry({work:{x:0,y:24,width:1440,height:836},main:{x:80,y:50,width:1280,height:800}}));
  assertContained(placement);assert.match(placement.kind,/^top-/);assert.equal(placement.rect.y,36);
  assert.ok(placement.rect.y+placement.rect.height<=placement.transcript.y-placement.gap);
});

test('Retina, fractional DPI, and negative monitor origins are converted to logical coordinates once',()=>{
  const base={work:{x:-1920,y:30,width:1920,height:1050},main:{x:-1780,y:70,width:1280,height:900}},
    unit=sourceRestRecorderPlacement(geometry(base));assertContained(unit);
  for(const scale of[1.25,1.5,2,3]){
    const result=sourceRestRecorderPlacement(geometry({...base,scale}));assertContained(result);
    for(const field of['x','y','width','height','kind'])assert.equal(result[field],unit[field],`same logical ${field} at scale ${scale}`);
    assert.deepEqual(result.workArea,unit.workArea);assert.deepEqual(result.main,unit.main);
  }
  const crossing=sourceRestRecorderPlacement(geometry({...base,scale:2,windowScale:1.5}));
  assert.deepEqual(crossing.main,unit.main,'position uses the selected display space, extent uses the reported window scale');
});

test('unavailable metrics and unreadably small areas decline native placement instead of making an offscreen window',()=>{
  assert.equal(sourceRestRecorderPlacement().ok,false);
  assert.equal(sourceRestRecorderPlacement({...geometry(),mainScaleFactor:0}).ok,false);
  const tiny=sourceRestRecorderPlacement(geometry({work:{x:0,y:24,width:800,height:560},main:{x:0,y:24,width:800,height:560}}));
  assert.equal(tiny.ok,false);assert.equal(tiny.reason,'insufficient-readable-space');
});

test('bounded placement holds across screen sizes, scale factors and partly clipped main windows',()=>{
  let count=0;
  for(const scale of[1,1.25,2,3])for(const [width,height]of[[1280,720],[1440,900],[1920,1080],[2560,1440]])
    for(const offset of[-60,40,280])for(const mainWidth of[960,1280,1600]){
      const result=sourceRestRecorderPlacement(geometry({scale,work:{x:-width,y:24,width,height:height-60},
        main:{x:-width+offset,y:40,width:mainWidth,height:Math.min(900,height-80)}}));
      if(result.ok){assertContained(result);count+=1;}
    }
  assert.ok(count>=30,'representative geometries produce a readable bounded face');
});
function fixture(options={}){
  let frame=makeFrame(),held=false,enabled=true,clock=1000;
  const calls=[],errors=[],surface={publish:async envelope=>{calls.push(['publish',envelope]);return true;},
    show:async()=>calls.push(['show']),hide:async()=>calls.push(['hide']),close:async()=>calls.push(['close'])};
  const faceplate={enabled:true,runId:'run-7',scope:'device',sceneId:'source-rest-recorder',now:8765,
    held:false,nightClock:{value:'01:23',minutes:83},telemetry:{takesEnabled:false,takes:0},
    map:{player:{resolved:false,position:null},spaces:[],contacts:[]}};
  const presenter=createSourceRestRecorderWindow({getFrame:()=>frame,getFaceplateSnapshot:()=>faceplate,
    getHeld:()=>held,getEnabled:()=>enabled,isNative:()=>true,now:()=>clock,
    requestNativePresentation:async()=>{calls.push(['consent']);return true;},
    createNativeSurface:async hooks=>{calls.push(['create',hooks]);return surface;},
    drawContainedFallback:(value,context)=>calls.push(['fallback',value,context]),onError:value=>errors.push(value),...options});
  return{presenter,calls,errors,surface,faceplate,setFrame:value=>{frame=value;},setHeld:value=>{held=value;},
    setEnabled:value=>{enabled=value;},advance:value=>{clock+=value;}};
}

test('idle updates never request consent, create a window, or draw a recorder',async()=>{
  const f=fixture();await f.presenter.update();await f.presenter.update();
  assert.equal(f.presenter.renderFallback(),false);assert.deepEqual(f.calls,[]);assert.equal(f.presenter.state().requested,false);
});

test('only an explicit request opens the fixed passive face and forwards the canonical run data',async()=>{
  const f=fixture();await f.presenter.toggle();
  assert.deepEqual(f.calls.map(call=>call[0]),['consent','create','publish','show']);
  const envelope=f.calls[2][1];assert.equal(envelope.label,SOURCE_REST_RECORDER_LABEL);
  assert.deepEqual(envelope.faceplate,f.faceplate);assert.equal(envelope.frame.musicTime,142);
  assert.equal(envelope.frame.machine.recording,false);assert.equal(envelope.frame.machine.playing,false);
  const rendered=sourceRestInstrumentFrame({...envelope.frame,cols:190,rows:200});
  assert.ok(rendered);assert.ok(rendered.view.buttons.keys.every(key=>key.enabled===false));
  assert.equal(f.presenter.state().visible,true);assert.equal(f.presenter.state().mode,'native');
  await f.presenter.toggle();assert.equal(f.presenter.state().requested,false);assert.equal(f.calls.at(-1)[0],'close');
  await f.presenter.update();assert.equal(f.calls.filter(call=>call[0]==='create').length,1,'a player close does not auto-open next frame');
});

test('gated or unavailable native presentation has a contained fallback only after the player asks',async()=>{
  for(const options of[{getEnabled:()=>false},{isNative:()=>false},{requestNativePresentation:async()=>false}]){
    const f=fixture(options);await f.presenter.update();assert.equal(f.presenter.renderFallback(),false);
    await f.presenter.toggle();assert.equal(f.presenter.state().mode,'contained');assert.equal(f.calls.some(call=>call[0]==='create'),false);
    assert.equal(f.presenter.renderFallback(),true);assert.equal(f.calls.at(-1)[0],'fallback');
    await f.presenter.close();assert.equal(f.presenter.renderFallback(),false);
  }
});

test('pause or loss of presentation focus hides immediately, resumes the same owner, and never changes music time',async()=>{
  const f=fixture();await f.presenter.toggle();f.setHeld(true);await f.presenter.update();
  assert.equal(f.presenter.state().visible,false);assert.equal(f.calls.at(-1)[0],'hide');
  assert.equal(f.calls.filter(call=>call[0]==='publish').length,1);
  f.setHeld(false);f.setFrame(makeFrame({musicTime:142}));await f.presenter.update();
  assert.equal(f.presenter.state().visible,true);assert.equal(f.calls.filter(call=>call[0]==='create').length,1);
  assert.equal(f.calls.filter(call=>call[0]==='publish').at(-1)[1].frame.musicTime,142);
  assert.equal(f.calls.some(call=>/focus|play|record|seek/.test(call[0])),false);
});

test('stand, phase change, black, credits, suppression, owner exit and disabled policy retire the requested face',async()=>{
  const boundaries=[{mode:'standing'},{mode:'idle'},{phase:'catch'},{black:true},{credits:true},
    {presentation:{stage:6,progress:.8,suppressPeripheral:true}},
    {conversationView:{restBlack:true}},{ownerId:'continuation-2'}];
  for(const patch of boundaries){
    const f=fixture();await f.presenter.toggle();f.setFrame(makeFrame(patch));await f.presenter.update();
    assert.equal(f.presenter.state().requested,false,JSON.stringify(patch));assert.equal(f.calls.at(-1)[0],'close');
  }
  const f=fixture();await f.presenter.toggle();f.setEnabled(false);await f.presenter.update();
  assert.equal(f.presenter.state().reason,'policy-disabled');assert.equal(f.presenter.state().requested,false);
});

test('closing during delayed consent or native creation never leaves a late surface visible',async()=>{
  const consent=deferred(),f=fixture({requestNativePresentation:()=>consent.promise});
  const opening=f.presenter.toggle();await f.presenter.close('stand');consent.resolve(true);await opening;
  assert.equal(f.calls.some(call=>call[0]==='create'),false);
  const creation=deferred(),g=fixture({createNativeSurface:()=>creation.promise});
  const next=g.presenter.toggle();await Promise.resolve();await g.presenter.close('exit');creation.resolve(g.surface);await next;
  assert.deepEqual(g.calls.map(call=>call[0]),['consent','close']);assert.equal(g.presenter.state().visible,false);
});

test('an in-flight update cannot re-show a window hidden by pause or after exit',async()=>{
  const f=fixture();await f.presenter.toggle();
  const paint=deferred();f.surface.publish=async envelope=>{f.calls.push(['pending-publish',envelope]);return paint.promise;};
  f.advance(150);const updating=f.presenter.update();f.setHeld(true);await f.presenter.update();
  assert.equal(f.calls.at(-1)[0],'hide');paint.resolve(true);await updating;assert.equal(f.presenter.state().visible,false);
  assert.equal(f.calls.filter(call=>call[0]==='show').length,1);
  f.setHeld(false);const paint2=deferred();f.surface.publish=()=>paint2.promise;
  const updating2=f.presenter.update();await f.presenter.close('black');paint2.resolve(true);await updating2;
  assert.equal(f.presenter.state().requested,false);assert.equal(f.calls.filter(call=>call[0]==='show').length,1);
});

test('bounded updates coalesce, retain live data, and explicit window close is lease checked',async()=>{
  const f=fixture();await f.presenter.toggle();const hooks=f.calls.find(call=>call[0]==='create')[1];
  await f.presenter.update();assert.equal(f.calls.filter(call=>call[0]==='publish').length,1);
  f.advance(101);f.setFrame(makeFrame({musicTime:143}));await f.presenter.update();
  assert.equal(f.calls.filter(call=>call[0]==='publish').length,2);
  assert.equal(f.calls.filter(call=>call[0]==='publish').at(-1)[1].frame.musicTime,143);
  hooks.onClose('unrelated-lease');assert.equal(f.presenter.state().requested,true);
  hooks.onClose(f.presenter.state().sessionToken);await Promise.resolve();assert.equal(f.presenter.state().requested,false);
});

test('a newly requested lease does not wait for or inherit an obsolete paint operation',async()=>{
  const oldPaint=deferred(),calls=[];
  const first={publish:()=>oldPaint.promise,show:async()=>calls.push('old-show'),hide:async()=>{},close:async()=>calls.push('old-close')},
    second={publish:async()=>{calls.push('new-paint');return true;},show:async()=>calls.push('new-show'),hide:async()=>{},close:async()=>{}};
  let count=0;const f=fixture({createNativeSurface:async()=>++count===1?first:second});
  const opening=f.presenter.toggle();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  await f.presenter.close('player');await f.presenter.toggle();
  assert.equal(f.presenter.state().visible,true);assert.ok(calls.includes('new-paint'));assert.ok(calls.includes('new-show'));
  oldPaint.resolve(true);await opening;assert.equal(calls.includes('old-show'),false);assert.equal(f.presenter.state().requested,true);
});

test('policy withdrawal during consent cannot create a late native face',async()=>{
  const consent=deferred(),f=fixture({requestNativePresentation:()=>consent.promise});
  const opening=f.presenter.toggle();f.setEnabled(false);consent.resolve(true);await opening;
  assert.equal(f.presenter.state().reason,'policy-disabled');assert.equal(f.calls.some(call=>call[0]==='create'),false);
});

test('a rejected first paint never shows an empty window and remains an explicitly raised fallback',async()=>{
  const f=fixture();f.surface.publish=async()=>false;await f.presenter.toggle();
  assert.equal(f.presenter.state().mode,'contained');assert.equal(f.calls.some(call=>call[0]==='show'),false);
  assert.equal(f.errors.length,1);assert.equal(f.presenter.renderFallback(),true);
});

test('native errors use the explicit contained fallback; disposal and held requests remain closed',async()=>{
  const f=fixture({createNativeSurface:async()=>{throw new Error('create failed');}});await f.presenter.toggle();
  assert.equal(f.presenter.state().mode,'contained');assert.equal(f.errors.length,1);assert.equal(f.presenter.renderFallback(),true);
  await f.presenter.dispose();await f.presenter.toggle();assert.equal(f.presenter.state().requested,false);
  const g=fixture();g.setHeld(true);await g.presenter.toggle();assert.equal(g.presenter.state().reason,'held');assert.deepEqual(g.calls,[]);
});

test('envelopes reject stale/foreign owners, contain no callbacks, and preserve intentional display fields',()=>{
  const frame=makeFrame();frame.onRecord=()=>assert.fail();frame.machine.onPlay=()=>assert.fail();frame.machine.circular=frame.machine;
  frame.machine.recording=true;const original=frame.machine.face.counter;
  const envelope=createSourceRestRecorderEnvelope({sessionToken:'lease-1',revision:1,frame,held:true,faceplate:{scope:'historical',held:false}});
  assert.equal(envelope.frame.onRecord,undefined);assert.equal(envelope.frame.machine.onPlay,undefined);
  assert.equal(envelope.frame.machine.circular,undefined);assert.equal(envelope.frame.machine.recording,false);
  assert.equal(frame.machine.recording,true);assert.equal(envelope.frame.machine.face.counter,original);
  assert.equal(envelope.faceplate.scope,'historical');assert.equal(envelope.faceplate.held,true);
  const gate=createSourceRestRecorderEnvelopeGate();assert.equal(gate.accept(envelope),envelope);
  assert.equal(gate.accept(envelope),null);assert.equal(gate.accept({...envelope,revision:2,sessionToken:'other'}),null);
  assert.equal(gate.accept({...envelope,revision:2,protocol:99}),null);
  assert.equal(gate.accept({...envelope,revision:2,owner:'wrong'}),null);
  assert.equal(gate.accept({...envelope,revision:2})?.revision,2);
  gate.reset();assert.ok(gate.accept({...envelope,sessionToken:'lease-2'}));
  assert.equal(sourceRestRecorderEligible(makeFrame({phase:'source-i'})),false);
});

test('surface and packaging reuse the existing face and supplied modules without audio/input authority',()=>{
  const root=new URL('../',import.meta.url),surface=readFileSync(new URL('src/source-rest-recorder-surface.js',root),'utf8'),
    owner=readFileSync(new URL('src/platform/source-rest-recorder-window.js',root),'utf8'),
    vite=readFileSync(new URL('vite.config.js',root),'utf8'),cap=JSON.parse(readFileSync(new URL('src-tauri/capabilities/source-rest-recorder.json',root),'utf8'));
  assert.match(surface,/drawSourceRestInstrument/);assert.match(surface,/drawRecorderFace/);
  assert.match(surface,/beginFaceplateModuleFrame\(envelope\.faceplate/);assert.match(surface,/endFaceplateModuleFrame\(\)/);
  assert.doesNotMatch(surface,/requestAnimationFrame|AudioContext|new Audio\b|getUserMedia|recordAction|saveNow|REC\./);
  assert.match(owner,/focus:false,focusable:false/);assert.match(owner,/alwaysOnTop:false/);assert.doesNotMatch(owner,/\.setFocus\(/);
  assert.match(vite,/sourceRestRecorder:.*source-rest-recorder\.html/);
  assert.deepEqual(cap.windows,['main','source-rest-recorder']);
  assert.equal(cap.permissions.some(value=>/focus|fs:|http:|shell:|microphone/.test(value)),false);
  assert.equal(SOURCE_REST_RECORDER_PROTOCOL,1);
});

test('the recorder waits for both bundled font weights and font-set readiness before ready or first paint',async()=>{
  const source=readFileSync(new URL('../src/source-rest-recorder-surface.js',import.meta.url),'utf8'),
    a=source.indexOf('async function waitForHardwareFonts(){'),b=source.indexOf('\nasync function start(){',a);
  assert.ok(a>=0&&b>a);const regular=deferred(),bold=deferred(),fontSet=deferred(),requests=[];
  const fonts={load:query=>{requests.push(query);return query.startsWith('400')?regular.promise:bold.promise;},ready:fontSet.promise},
    wait=Function('document',source.slice(a,b)+';return waitForHardwareFonts;')({fonts});
  let finished=false;const loading=wait().then(()=>{finished=true;});
  assert.deepEqual(requests,['400 14px "Hardware Sans"','700 14px "Hardware Sans"']);
  regular.resolve([{}]);await Promise.resolve();assert.equal(finished,false);
  bold.resolve([{}]);await Promise.resolve();await Promise.resolve();assert.equal(finished,false,'both font files alone do not bypass document.fonts.ready');
  fontSet.resolve(fonts);await loading;assert.equal(finished,true);
  const missing=Function('document',source.slice(a,b)+';return waitForHardwareFonts;')({fonts:{load:async()=>[],ready:Promise.resolve()}});
  await assert.rejects(missing(),/recorder-hardware-font-unavailable/);
  const start=source.slice(b);assert.ok(start.indexOf('await waitForHardwareFonts()')<start.indexOf('fontsReady=true;await ready()'));
  assert.match(source,/const ready=\(\)=>fontsReady&&!disposed/);assert.match(source,/if\(!fontsReady\|\|!envelope/);
  assert.match(source,/envelope=next;if\(!fontsReady\)return false/);
});
