import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sourceRestAperturePlan,createSourceRestMediaPresentation} from '../src/platform/source-rest-media.js';
import {sourceRestOwnedFramesValid} from '../src/render/source-rest-apertures.js';
import {createWindowMediaArchitecture,windowArchitectureCueAllowed} from '../src/render/window-media-architecture.js';
import {WINDOW_MEDIA_PROTOCOL,createPaneScoreEnvelope,createWindowMediaClock,createWindowVideoClock,
  scoreTimeAt,validatePaneScoreEnvelope,windowMediaContentId} from '../src/platform/window-composition.js';
const oldWindow=globalThis.window;globalThis.window={__TAURI_INTERNALS__:{}};
const [{createPersonalizedWindowEffects},{createWindowMediaSimulation},{createWindowChoreographyDirector,sourceStudyArchitectureLayout},{sourceRestApertureFrame},{sourceContinuationRenderFrame},{SOURCE_REST_SEATS},{freshSourceContinuation}]=await Promise.all([
  import('../src/platform/personalized-window-effects.js'),import('../src/platform/window-media-simulation.js'),import('../src/platform/window-choreography.js'),import('../src/render/source-rest-aperture-frame.js'),import('../src/render/source-continuation-renderer.js'),import('../src/game/source-rest-seat.js'),import('../src/game/source-continuation.js')]);
if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;

const png=()=>{const b=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(240,16);b.writeUInt32BE(160,20);return'data:image/png;base64,'+b.toString('base64');};
const frames=()=>['rest:source','rest:answer'].map(surfaceId=>({surfaceId,dataUrl:png()}));
const plan=patch=>sourceRestAperturePlan({phase:'wrong-return',...patch});
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
function effectsFixture(){
  const calls=[],events=[],windows=new Map(),listeners=new Map();
  class Surface{static async getByLabel(id){return windows.get(id)||null;}constructor(id){this.id=id;windows.set(id,this);}once(_event,fn){fn();}async hide(){}async show(){}async close(){windows.delete(this.id);}}
  const api={WebviewWindow:Surface,listen:async(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name);},invoke:async(name,value)=>{calls.push([name,value]);return name==='chunk_window_media_place'?{shown:true,origin:{x:0,y:0}}:true;},
    emitTo:async(label,event,payload)=>{events.push({label,event,payload});
      if(event==='window-media-probe')listeners.get('window-media-ready')?.({payload:{protocol:WINDOW_MEDIA_PROTOCOL,label}});
      if(event==='window-media-score')listeners.get('window-media-accepted')?.({payload:{...payload,label,contentId:windowMediaContentId(payload.score.initial)}});
    }};
  const effects=createPersonalizedWindowEffects({runtimeApi:api,documentApi:null,tokenFactory:()=> 'one-native-session',wait:async()=>{}});
  return{effects,calls,events,api};
}
test('owned native images reuse one physical lease and retain at most current/outgoing token pairs',async()=>{
  const f=effectsFixture(),p=plan();f.effects.begin();await f.effects.prepareMedia({count:2});assert.equal(await f.effects.showComposition(p),true);
  const unrelated=f.effects.registerSnapshot(png()),before=f.calls.length,scoreRevisions={...f.effects.debug().mediaRevisions},tokens=[];
  for(let revision=1;revision<=4;revision++){
    assert.equal(await f.effects.updateStudyFrames({cueId:p.cueId,frames:frames(),revision}),true);
    const issued=f.events.filter(v=>v.event==='window-media-owned-frame'&&v.payload.frameRevision===revision);assert.equal(issued.length,2);
    tokens.push(issued.map(v=>v.payload.token));assert.ok(f.effects.debug().sourceStudyFrameCount<=4);
    assert.ok(issued.every(v=>v.payload.sessionToken==='one-native-session'&&v.payload.revision===scoreRevisions[v.label]));
  }
  assert.deepEqual(f.effects.debug().mediaRevisions,scoreRevisions);assert.equal(f.calls.length,before,'streamed content never places, shows or focuses a window');
  assert.ok(tokens[0].every(t=>f.effects.snapshotData(t)===null));assert.ok(tokens[2].every(t=>f.effects.snapshotData(t)===png()));assert.equal(f.effects.snapshotData(unrelated),png());
  f.effects.releaseStudyFrames();assert.equal(f.effects.debug().sourceStudyFrameCount,0);assert.equal(f.effects.snapshotData(unrelated),png());
  await f.effects.end();
});
test('the actual native effects host rejects held, stale, wrong-owner and unbounded image requests',async()=>{
  const f=effectsFixture(),p=plan();f.effects.begin();await f.effects.prepareMedia({count:2});await f.effects.showComposition(p);
  assert.equal(await f.effects.updateStudyFrames({cueId:'retired',frames:frames(),revision:1}),false);
  await f.effects.holdComposition(true);assert.equal(await f.effects.updateStudyFrames({cueId:p.cueId,frames:frames(),revision:1}),false);
  await f.effects.holdComposition(false);assert.equal(await f.effects.updateStudyFrames({cueId:p.cueId,frames:frames(),revision:1}),true);
  assert.equal(await f.effects.updateStudyFrames({cueId:p.cueId,frames:frames(),revision:1}),false);
  assert.equal(await f.effects.updateStudyFrames({cueId:p.cueId,frames:[{surfaceId:'other',dataUrl:png()}],revision:2}),false);
  assert.equal(await f.effects.updateStudyFrames({cueId:p.cueId,frames:[{surfaceId:'rest:source',dataUrl:'file:///private/image.png'}],revision:2}),false);
  await f.effects.hideComposition({releaseSnapshots:false});assert.equal(f.effects.debug().sourceStudyFrameCount,0);await f.effects.end();
});

// Execute the actual native surface presenter, with manually completed image
// decodes. This creates neither a native window nor a graphics context.
function nativeFixture(){
  let time=1000;const images=[],elements=new Map(),node=tag=>({tagName:tag,dataset:{},style:{},children:[],
    addEventListener(){},removeAttribute(name){delete this[name];},setAttribute(name,value){this[name]=value;},append(child){this.children.push(child);},
    getContext:()=>null,querySelectorAll:()=>[],pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},load(){}});
  const document={documentElement:node('html'),body:node('body'),getElementById:id=>{if(!elements.has(id))elements.set(id,node(id));return elements.get(id);},createElement:node};
  class Image{constructor(){images.push(this);}set src(v){this._src=v;}get src(){return this._src;}ready(){this.onload?.();}}
  class Clock extends Date{static now(){return time;}}
  const context=vm.createContext({document,Image,Date:Clock,WINDOW_MEDIA_PROTOCOL,createWindowMediaClock,createWindowVideoClock,scoreTimeAt,validatePaneScoreEnvelope,windowMediaContentId,sourceRestOwnedFramesValid,createWindowMediaArchitecture,windowArchitectureCueAllowed,
    mediaManifest:JSON.parse(readFileSync(new URL('../content/media/window-media.media.json',import.meta.url))),WINDOW_SURFACE_LOOK_GLSL:'',getCurrentWindow:()=>({label:'window-media-1'}),emit:async()=>{},listen:async()=>{},addEventListener(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},performance:{now:()=>time},setTimeout,clearTimeout,devicePixelRatio:1,innerWidth:240,innerHeight:160,location:{href:'https://game.test/window-media.html',search:''},URL,URLSearchParams,console});
  const source=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from\s+['"][^'"]+['"](?:\s+with\s+\{[^}]+\})?;\s*/gm,'').replaceAll('import.meta.env.DEV','false').replace('void boot();','');
  vm.runInContext(source+'\nglobalThis.player={acceptEnvelope,acceptOwnedFrame,acceptArchitecture,holdScore,clearMediaScore,loadAssignment,state:()=>({source,assignment,envelope,video,architecture:architecture?.snapshot(),ownedFrameRevision,clock:scoreClock.snapshot(Date.now())})};',context);
  const p=plan(),envelope=createPaneScoreEnvelope(p,'rest:source',{targetLabel:'window-media-1',sessionToken:'native-one',revision:7}),payload=(revision=1)=>({...envelope,frameRevision:revision,token:'snapshot-owned-'+revision,dataUrl:png()});
  return{player:context.player,images,envelope,payload,at:v=>{time=v;}};
}
test('the actual native surface retains its decoded image until replacement and does not reset its score clock',async()=>{
  const f=nativeFixture();await f.player.acceptEnvelope(f.envelope);const initial=f.player.state().clock;
  assert.equal(f.player.acceptOwnedFrame(f.payload()),true);assert.equal(f.player.state().source,null);f.images.at(-1).ready();const first=f.player.state().source;
  f.at(1500);assert.equal(f.player.acceptOwnedFrame(f.payload(2)),true);assert.equal(f.player.state().source,first);f.images.at(-1).ready();assert.notEqual(f.player.state().source,first);
  assert.equal(f.player.state().clock.epochMs,initial.epochMs);assert.equal(f.player.state().envelope.revision,7);assert.equal(f.player.state().assignment.content.kind,'snapshot');
  assert.equal(f.player.acceptOwnedFrame(f.payload(1)),false);assert.equal(f.player.acceptOwnedFrame({...f.payload(3),sessionToken:'retired'}),false);
});
const archPacket=(upload=true)=>({version:1,phase:'wrong-return',meshRevision:'canonical-one',sourceSeconds:10,
  ...(upload?{meshes:[{id:'one-mesh',p:[0,0,0,1,0,0,0,1,0],i:[0,1,2],base:[.5,.4,.3,1]}]}:{}),
  panes:['rest:source','rest:answer'].map(surfaceId=>({surfaceId,camera:{eye:[0,0,3],basis:{right:[1,0,0],up:[0,1,0],forward:[0,0,-1]},projection:{tanHalfFov:.95,aspect:1.5,near:.05,far:300},crop:{x:0,y:0,width:1,height:1}},instances:[{id:'same-object',meshId:'one-mesh',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]}]}))});
test('architecture transport uploads canonical arrays once and then emits sequenced pose-only packets without native movement',async()=>{
  const f=effectsFixture(),p={...plan(),cueId:'source-rest:architecture:wrong-return'};f.effects.begin();await f.effects.prepareMedia({count:2});await f.effects.showComposition(p);const before=f.calls.length;
  assert.equal(await f.effects.updateStudyArchitecture({cueId:p.cueId,revision:1,packet:archPacket()}),true);
  assert.equal(await f.effects.updateStudyArchitecture({cueId:p.cueId,revision:2,packet:archPacket()}),true);
  const sent=f.events.filter(v=>v.event==='window-media-architecture');assert.equal(sent.length,4);assert.ok(sent.slice(0,2).every(v=>v.payload.packet.meshes?.length===1));assert.ok(sent.slice(2).every(v=>v.payload.packet.meshes===undefined));assert.equal(f.calls.length,before);
  await f.effects.holdComposition(true);assert.equal(await f.effects.updateStudyArchitecture({cueId:p.cueId,revision:3,packet:archPacket(false)}),false);await f.effects.holdComposition(false);
  assert.equal(await f.effects.updateStudyArchitecture({cueId:p.cueId,revision:2,packet:archPacket(false)}),false);assert.equal(await f.effects.updateStudyArchitecture({cueId:'wrong',revision:3,packet:archPacket(false)}),false);await f.effects.end();
});
test('the actual native architecture handler preserves real video across poses and rejects stale owners',async()=>{
  const f=nativeFixture();await f.player.acceptEnvelope({...f.envelope,cueId:'source-rest:architecture:wrong-return'});const owned={...f.envelope,cueId:'source-rest:architecture:wrong-return'},packet=archPacket();packet.panes[0].background={assetId:'cathedral',mediaTime:1};
  const request={...owned,architectureRevision:1,packet};assert.equal(f.player.acceptArchitecture(request),true);const media=f.player.state().video;assert.ok(media);assert.equal(f.player.state().assignment.content.assetId,'cathedral');assert.equal(f.player.state().architecture.active,true);
  const second=archPacket(false);second.panes[0].background={assetId:'cathedral',mediaTime:1.03};assert.equal(f.player.acceptArchitecture({...request,architectureRevision:2,packet:second}),true);assert.equal(f.player.state().video,media,'geometry poses do not restart the movie decoder');assert.equal(f.player.state().architecture.poseUpdates,2);
  f.player.holdScore({...owned,held:true});assert.equal(f.player.acceptArchitecture({...request,architectureRevision:3,packet:second}),false);f.player.holdScore({...owned,held:false});assert.equal(f.player.acceptArchitecture({...request,sessionToken:'old',architectureRevision:3,packet:second}),false);
  f.player.clearMediaScore(owned);assert.equal(f.player.state().architecture,undefined);
});
test('architecture ownership cancels an in-flight owned PNG so its late decoder cannot cover the actual film',async()=>{
  const f=nativeFixture();await f.player.acceptEnvelope(f.envelope);assert.equal(f.player.acceptOwnedFrame(f.payload()),true);const pending=f.images.at(-1),packet=archPacket();packet.panes[0].background={assetId:'cathedral',mediaTime:3};
  assert.equal(f.player.acceptArchitecture({...f.envelope,architectureRevision:1,packet}),true);const film=f.player.state().video;pending.ready();assert.equal(f.player.state().video,film);assert.equal(f.player.state().assignment.content.assetId,'cathedral');assert.equal(f.player.state().architecture.active,true);
});
test('measured layouts straddle real content edges, preserve the string-crossing height and clamp to the current work area',()=>{
  const result=sourceStudyArchitectureLayout({content_rect:{x:200,y:100,width:1000,height:600},work_area:{x:0,y:0,width:1600,height:1000}});
  const left=result.panes[0],right=result.panes[1];assert.equal(left.rect.x,116);assert.equal((left.rect.y+left.rect.height/2-100)/600,.38);assert.equal(right.rect.x,1044);assert.ok(left.crop.x<0);assert.ok(right.crop.x+right.crop.width>1);
  const edge=sourceStudyArchitectureLayout({content_rect:{x:0,y:0,width:1600,height:1000},work_area:{x:0,y:0,width:1600,height:1000}});assert.ok(edge.panes.every(p=>p.rect.x>=0&&p.rect.y>=0&&p.rect.x+p.rect.width<=1600&&p.rect.y+p.rect.height<=1000));
  assert.equal(sourceStudyArchitectureLayout({logical_width:1600,logical_height:1000}),null);
});
test('a PNG completing during pause waits for resume, and a retired decode cannot overwrite a new assignment',async()=>{
  const f=nativeFixture();await f.player.acceptEnvelope(f.envelope);f.player.acceptOwnedFrame(f.payload());const pending=f.images.at(-1);
  f.player.holdScore({...f.envelope,held:true});pending.ready();assert.equal(f.player.state().source,null);
  f.player.holdScore({...f.envelope,held:false});assert.equal(f.player.state().source,pending);
  f.player.acceptOwnedFrame(f.payload(2));const old=f.images.at(-1);f.player.loadAssignment({content:{kind:'procedural',preset:'empty-field'},clockMode:'source'});old.ready();assert.equal(f.player.state().source,null);
  f.player.acceptOwnedFrame(f.payload(3));const retired=f.images.at(-1);f.player.clearMediaScore(f.envelope);retired.ready();assert.equal(f.player.state().source,null);
});
test('the native reduced-motion surface accepts one fixed owned still without autoplay or later animation',async()=>{
  const f=nativeFixture();await f.player.acceptEnvelope({...f.envelope,reducedMotion:true});assert.equal(f.player.acceptOwnedFrame(f.payload()),true);f.images.at(-1).ready();assert.equal(f.player.acceptOwnedFrame(f.payload(2)),false);
  f.player.holdScore({...f.envelope,held:true});assert.equal(f.player.acceptOwnedFrame(f.payload(2)),false);
});

class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.listeners=new Map();this.style={setProperty:(k,v)=>{this.style[k]=v;}};this.classes=new Set();this.classList={add:(...v)=>v.forEach(x=>this.classes.add(x)),remove:(...v)=>v.forEach(x=>this.classes.delete(x)),contains:v=>this.classes.has(v),toggle:(v,on)=>{if(on)this.classes.add(v);else this.classes.delete(v);}};}
  set className(value){this.classes=new Set(value.split(' ').filter(Boolean));}get className(){return[...this.classes].join(' ');}
  setAttribute(k,v){this[k]=v;}removeAttribute(k){delete this[k];}append(child){child.parent=this;this.children.push(child);}replaceChildren(...rows){for(const child of this.children)child.parent=null;this.children=[];rows.forEach(row=>this.append(row));}remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(fn);}removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}fire(k){for(const fn of [...this.listeners.get(k)||[]])fn();}getBoundingClientRect(){return{left:0,top:0,width:1000,height:800};}
  pause(){this.paused=true;}play(){this.paused=false;return Promise.resolve();}load(){}querySelectorAll(){return[];}
}
test('real production frames and composer reach the actual director/simulator when native windows are disabled and unintroduced',async()=>{
  const notes={duration:716.4,notes:[{id:'real-note',onset:159.8,duration:1,midi:67,velocity:.8,confidence:1}]};
  for(const seat of SOURCE_REST_SEATS.filter(seat=>seat.phase==='catch')){
    const body=new Element('body'),documentApi={body,baseURI:'https://game.test/',createElement:tag=>new Element(tag),querySelector:()=>body},
      director=createWindowChoreographyDirector({documentApi,getEnabled:()=>false,getCompositionContext:()=>({introduced:false,reduceDread:false}),waitFn:async()=>{}}),
      state={...freshSourceContinuation(),...seat,...seat.approach,status:'active',sourceRestView:{seatId:seat.id,mode:'seated',progress:1,degradation:.3,musicTime:160,musicSignal:.4,look:seat.view}},
      world=sourceContinuationRenderFrame(state,{noteScore:notes}),traces=[],presenter=createSourceRestMediaPresentation({director,getFrame:()=>sourceRestApertureFrame(world,state,{viewport:{width:1000,height:800,tanHalfFov:.95}}),onTrace:t=>traces.push(t)});
    presenter.update({owner:'production-'+seat.phase,phase:seat.phase,rest:{mode:'seated',narrativeProgress:.3},music:{playing:true,currentTime:160,duration:843}});await presenter.whenIdle();
    assert.equal(presenter.snapshot().delivered,true,JSON.stringify({snapshot:presenter.snapshot(),traces}));assert.equal(presenter.snapshot().presented,true);assert.equal(director.debug().composition.purpose,'source-study');assert.equal(director.debug().transaction.native,false);
    await presenter.stop();
  }
});
test('simulated panes receive the same PNGs without replacement, placement, or late decode resurrection',()=>{
  let time=1000;const made=[],body=new Element('body'),documentApi={body,baseURI:'https://game.test/',createElement:tag=>{const n=new Element(tag);made.push(n);return n;},querySelector:()=>body},player=createWindowMediaSimulation({documentApi,now:()=>time,requestFrame:()=>1,cancelFrame(){}}),p=plan();
  player.show(p);const positions=player.debug().panes.map(v=>v.rendered),owner=p.cueId;
  assert.equal(player.updateStudyFrames({cueId:owner,frames:frames(),revision:1}),true);const imgs=made.filter(n=>n.tagName==='IMG');assert.equal(imgs.length,2);
  assert.ok(player.debug().panes.every(v=>v.assignment.content.kind==='procedural'),'old contents survive the pending PNG decode');
  player.hold(true);imgs.forEach(v=>v.fire('load'));assert.ok(player.debug().panes.every(v=>v.assignment.content.kind==='procedural'));
  time=50000;player.hold(false);assert.ok(player.debug().panes.every(v=>v.assignment.content.kind==='snapshot'));assert.deepEqual(player.debug().panes.map(v=>v.rendered),positions);
  assert.equal(player.updateStudyFrames({cueId:owner,frames:frames(),revision:1}),false);assert.equal(player.updateStudyFrames({cueId:'retired',frames:frames(),revision:2}),false);
  player.updateStudyFrames({cueId:owner,frames:frames(),revision:2});const pending=made.filter(n=>n.tagName==='IMG').slice(-2);player.hide();pending.forEach(v=>v.fire('load'));assert.equal(player.debug().active,false);
});

// Select the production native director branch while replacing desktop calls.
test('the shared director requires the current aperture owner and keeps permission, hold and one lease intact',async()=>{
  const delivered=[],commands=[],holds=[];let reducedDread=false;
  const effects={ensure:()=>true,sessionToken:()=> 'host',prepareMedia:async()=>true,showComposition:async()=>true,holdComposition:async v=>holds.push(v),hideComposition:async()=>true,hidePanes:async()=>true,updateStudyFrames:async v=>{delivered.push(v);return true;},releaseStudyFrames(){}};
  const director=createWindowChoreographyDirector({effects,documentApi:null,runtimeApi:{invoke:async(name,value)=>{commands.push([name,value]);return name==='chunk_window_metrics'?{native_fullscreen:false}:true;}},waitFn:async()=>{},getCompositionContext:()=>({introduced:true,flashMode:'full',reduceDread:reducedDread})});
  assert.ok(await director.beginStudy(plan(),{key:'one'}));const before=commands.length;
  assert.equal(await director.updateStudyFrames({key:'other',frames:frames(),revision:1}),false);assert.equal(await director.updateStudyFrames({key:'one',frames:frames(),revision:1}),true);
  assert.equal(await director.updateStudyFrames({key:'one',frames:frames(),revision:1}),false);director.holdComposition(true);await flush();assert.equal(await director.updateStudyFrames({key:'one',frames:frames(),revision:2}),false);
  director.holdComposition(false);reducedDread=true;assert.equal(await director.updateStudyFrames({key:'one',frames:frames(),revision:2}),false);reducedDread=false;assert.equal(await director.updateStudyFrames({key:'one',frames:frames(),revision:2}),true);
  assert.equal(delivered.length,2);assert.equal(commands.length,before,'image delivery acquires no extra desktop transaction or placement');assert.equal(await director.endStudy('one'),true);
});
