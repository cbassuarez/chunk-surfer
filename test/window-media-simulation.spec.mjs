import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWindowCompositionPlan} from '../src/platform/window-composition.js';
import {createWindowMediaSimulation} from '../src/platform/window-media-simulation.js';

class Element{
  constructor(tag){
    this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={setProperty:(key,value)=>{this.style[key]=value;}};this.listeners=new Map();this.attributes={};
    this.className='';this.classList={add:(...values)=>{this.className=[...new Set([...this.className.split(' ').filter(Boolean),...values])].join(' ');},remove:(...values)=>{this.className=this.className.split(' ').filter(value=>!values.includes(value)).join(' ');},contains:value=>this.className.split(' ').includes(value),toggle:(value,on)=>{const next=on??!this.classList.contains(value);if(next)this.classList.add(value);else this.classList.remove(value);return next;}};
    if(tag==='video'){this.readyState=0;this.duration=12;this.currentTime=0;this.paused=true;this.playCalls=0;this.pauseCalls=0;this.loadCalls=0;}
  }
  setAttribute(key,value){this.attributes[key]=String(value);}
  removeAttribute(key){delete this.attributes[key];if(key==='src')this.src='';}
  append(child){child.parent=this;this.children.push(child);}
  replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];for(const child of children)this.append(child);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;}
  addEventListener(event,handler){if(!this.listeners.has(event))this.listeners.set(event,new Set());this.listeners.get(event).add(handler);}
  removeEventListener(event,handler){this.listeners.get(event)?.delete(handler);}
  emit(event,values={}){for(const handler of [...this.listeners.get(event)||[]])handler({...values,type:event});}
  querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tagName===tag.toUpperCase()?[child]:[]),...child.querySelectorAll(tag)]);}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:800};}
  play(){this.playCalls++;this.paused=false;return this.playGate||Promise.resolve();}
  pause(){this.pauseCalls++;this.paused=true;}
  load(){this.loadCalls++;}
}

function fixture({effects={},width=1000,height=800}={}){
  let time=1000,index=0;const frames=new Map(),made=[],body=new Element('body');
  const documentApi={body,baseURI:'https://game.test/local/index.html',createElement:tag=>{const node=new Element(tag);node.getBoundingClientRect=()=>({left:0,top:0,width,height});made.push(node);return node;},querySelector:()=>body,defaultView:{}};
  const player=createWindowMediaSimulation({documentApi,effects,now:()=>time,requestFrame:fn=>{const key=++index;frames.set(key,fn);return key;},cancelFrame:key=>frames.delete(key)});
  const step=at=>{time=at;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();};
  const setTime=at=>{time=at;};
  const ready=(video,duration=12)=>{video.duration=duration;video.readyState=2;video.emit('loadedmetadata');video.emit('loadeddata');};
  return {player,documentApi,frames,made,step,setTime,ready,videos:()=>made.filter(node=>node.tagName==='VIDEO'),panes:()=>made.filter(node=>node.classList.contains('window-composition-pane'))};
}
const video=(id='a',extra={})=>({id,content:{kind:'video',assetId:'clouds'},clockMode:'source',entry:{x:.1,y:.2},initial:{x:.5,y:.5},...extra});
const plan=(surfaces=[video()],cues=[],extra={})=>compileWindowCompositionPlan({compositionId:'test:media',sceneId:'test',purpose:'title',epochMs:1000,surfaces,formation:{durationMs:500},score:{durationMs:4000,loop:false,cues},...extra});

test('source playback uses one frame pump, local URLs, crop and decoded authored phase',async()=>{
  const f=fixture(),p=plan([video('a',{phaseOffsetMs:750,crop:{x:.25,y:.1,w:.5,h:.8}})]);
  assert.equal(f.player.show(p),true);const node=f.videos()[0];
  assert.equal(f.frames.size,1);assert.equal(node.autoplay,false);assert.equal(node.muted,true);
  assert.ok(node.children.every(source=>source.src.startsWith('https://game.test/local/window-media/')));
  assert.equal(node.style.width,'200%');assert.equal(node.style.left,'-50%');
  assert.equal(node.style.objectFit,'fill','a crop must not be cropped a second time by CSS cover');
  f.ready(node,12);await Promise.resolve();assert.equal(node.currentTime,.75);assert.equal(node.playbackRate,1);
  f.step(2000);assert.equal(f.frames.size,1);assert.equal(node.currentTime,1.75);
  assert.equal(f.panes()[0].style.pointerEvents,'none');assert.equal(f.panes()[0].listeners.size,0);
});

test('metadata-ready buffering can finish a pending decode without every frame replacing its seek',async()=>{
  const f=fixture(),p=plan([video('a',{phaseOffsetMs:750})]);f.player.show(p);
  const node=f.videos()[0],seeks=[];let sourceTime=0,decodingMs=0,decodedFrames=0,finishPlay;
  Object.defineProperty(node,'currentTime',{get:()=>sourceTime,set:value=>{
    sourceTime=value;node.seeking=true;node.readyState=1;decodingMs=0;seeks.push(value);
  }});
  node.playGate=new Promise(resolve=>{finishPlay=resolve;});node.readyState=1;node.seeking=false;
  node.emit('loadedmetadata');
  assert.equal(node.playCalls,1,'play must request buffering after metadata, before HAVE_CURRENT_DATA');
  assert.equal(node.currentTime,.75);assert.equal(node.seeking,true);
  for(let index=1;index<=9;index++){
    decodingMs+=16;f.step(1000+index*16);
  }
  assert.equal(seeks.length,1,'an in-flight seek must retain its decoding work');
  assert.equal(decodingMs,144);assert.equal(node.readyState,1);assert.equal(node.playCalls,1,'keep one pending play request');
  decodingMs+=16;
  if(decodingMs>=160){node.seeking=false;node.readyState=2;decodedFrames++;node.emit('seeked');node.emit('loadeddata');finishPlay();}
  await Promise.resolve();
  assert.equal(decodedFrames,1);assert.equal(node.paused,false);assert.equal(seeks.length,1,'decode completion must not immediately force another phase seek');
  f.step(1180);assert.ok(seeks.length<=2,'later drift correction is bounded, after a frame has been decoded');
  if(node.seeking){const target=node.currentTime;f.step(1200);f.step(1230);assert.equal(node.currentTime,target,'a later correction is also allowed to complete');}
});

test('a late WebM decode failure reloads local MP4 at the same logical phase without stale play ownership',async()=>{
  const f=fixture(),p=plan([video('a',{phaseOffsetMs:750})]);f.player.show(p);
  const node=f.videos()[0],webm=node.children[0].src,mp4=node.children[1].src;
  let finishOld;node.currentSrc=webm;node.playGate=new Promise(resolve=>{finishOld=resolve;});f.ready(node,12);
  const initialLoads=node.loadCalls;f.setTime(1800);
  node.error={code:3,message:'PIPELINE_ERROR_DECODE'};node.emit('error');
  assert.equal(node.src,mp4);assert.equal(node.loadCalls,initialLoads+1);assert.equal(node.dataset.mediaFallbacks,'1');
  assert.equal(node.children.length,0,'the failed source list is retired before selecting the alternate');
  node.currentSrc=mp4;node.currentTime=0;node.playGate=Promise.resolve();f.ready(node,12);await Promise.resolve();
  assert.ok(Math.abs(node.currentTime-1.55)<1e-9,'the fallback joins the current source phase rather than restarting the score');
  assert.equal(node.playbackRate,1);assert.equal(node.paused,false);assert.equal(node.playCalls,2);
  finishOld();await Promise.resolve();assert.equal(node.paused,false,'an old load’s play completion cannot pause its valid replacement');
  assert.equal(f.player.debug().panes[0].mediaFormat,'mp4');assert.equal(f.player.debug().panes[0].mediaFailed,false);
  node.emit('error');node.emit('error');assert.equal(node.loadCalls,initialLoads+1,'each bundled format is attempted at most once');
  assert.equal(node.paused,true);assert.equal(f.player.debug().panes[0].mediaFailed,true);
  f.step(2000);assert.equal(node.playCalls,2,'exhausted formats cannot spin a play/reload loop');
});

test('MP4-first fallback can select WebM while preserving a held reduced-motion still and retiring old errors',async()=>{
  const f=fixture(),p=plan([video('a',{phaseOffsetMs:2200})],[],{reducedMotion:true});f.player.show(p);
  const node=f.videos()[0],webm=node.children[0].src,mp4=node.children[1].src;
  node.currentSrc=mp4;f.ready(node,12);node.emit('seeked');f.player.hold(true);f.player.freeze(true);
  const errorHandler=[...node.listeners.get('error')][0],loads=node.loadCalls;
  node.error={code:3};node.emit('error');assert.equal(node.src,webm);assert.equal(node.loadCalls,loads+1);
  f.step(5000);node.currentSrc=webm;node.currentTime=0;f.ready(node,12);
  assert.ok(Math.abs(node.currentTime-2.2)<1e-9);assert.equal(node.style.visibility,'hidden');node.emit('seeked');
  assert.equal(node.style.visibility,'visible');assert.equal(node.playCalls,0);assert.equal(node.paused,true);
  assert.equal(f.player.debug().held,true);assert.equal(f.player.debug().panes[0].frozen,true);
  const replacement=plan([video('new')],[],{compositionId:'replacement'});f.player.show(replacement);
  const retiredLoads=node.loadCalls;errorHandler();assert.equal(node.loadCalls,retiredLoads,'an old-owner error cannot reload a retired source');
  assert.equal(node.src,'');assert.equal(f.player.active(),true);
});

test('application hold suspends cues, media phase, geometry and queued event delays without catch-up',async()=>{
  const f=fixture(),p=plan([video('a')],[
    {atMs:700,operations:[{type:'hide',targets:['a']}]},
    {event:'release',operations:[{type:'ripple',targets:['a'],intervalMs:100,operation:{type:'seek',seekMs:3000,targets:['a']}}]},
  ]);
  f.player.show(p);const node=f.videos()[0];f.ready(node);await Promise.resolve();
  f.step(1200);const position=f.player.debug().panes[0].position;
  f.player.hold(true);f.player.trigger(p,'release',{effectiveAtMs:1400});f.step(6200);
  assert.equal(f.player.debug().pendingEvents,1);
  assert.equal(node.paused,true);assert.equal(f.player.debug().held,true);assert.deepEqual(f.player.debug().panes[0].position,position);
  assert.equal(f.player.debug().panes[0].visible,true);assert.equal(f.player.debug().panes[0].mediaTimeSeconds,.2);
  f.player.hold(false);f.step(6390);assert.ok(f.player.debug().panes[0].mediaTimeSeconds<1);
  f.step(6400);assert.equal(f.player.debug().panes[0].mediaTimeSeconds,3,'future event retains its remaining logical lead after resume');
  f.step(6700);assert.equal(f.player.debug().panes[0].visible,false,'timed cue occurs after the held interval is removed');
});

test('scheduled freeze changes source transport independently of continuing score and resumes its retained phase',()=>{
  const f=fixture(),p=plan([video('a')],[
    {atMs:400,operations:[{type:'freeze',targets:['a']}]},
    {atMs:800,operations:[{type:'geometry',targets:['a'],geometry:{x:.8,y:.2},durationMs:200}]},
    {atMs:1200,operations:[{type:'resume',targets:['a']}]},
  ]);
  f.player.show(p);f.ready(f.videos()[0]);f.step(2000);
  assert.equal(f.player.debug().panes[0].mediaTimeSeconds,.4);assert.equal(f.player.debug().panes[0].position.anchorX,.8);
  f.step(2500);assert.ok(Math.abs(f.player.debug().panes[0].mediaTimeSeconds-.7)<1e-9);
  f.player.freeze(true);f.step(3000);assert.ok(Math.abs(f.player.debug().panes[0].mediaTimeSeconds-.7)<1e-9);
  f.player.freeze(false);f.step(3300);assert.equal(f.player.debug().panes[0].mediaTimeSeconds,1);
});

test('reduced motion decodes the fixed selected phase instead of showing an unrelated poster or autoplaying',async()=>{
  const f=fixture(),p=plan([video('a',{phaseOffsetMs:2200,crop:{x:.1,y:0,w:.5,h:1}})],[],{reducedMotion:true});
  f.player.show(p);const node=f.videos()[0];assert.ok(node);assert.equal(node.poster,undefined);
  f.ready(node,12);await Promise.resolve();assert.ok(Math.abs(node.currentTime-2.2)<1e-9);assert.equal(node.playCalls,0);
  assert.equal(node.style.visibility,'hidden','the unrelated initial frame is hidden during the authored seek');node.emit('seeked');assert.equal(node.style.visibility,'visible');
  f.step(3200);assert.ok(Math.abs(node.currentTime-2.2)<1e-9);assert.ok(Math.abs(f.player.debug().panes[0].mediaTimeSeconds-2.2)<1e-9);
});

test('replacement retires old decodes and late play promises; hide removes source URLs and RAF ownership',async()=>{
  const f=fixture(),first=plan(),second=plan([video('b',{content:{kind:'video',assetId:'eclipse'}})],[],{compositionId:'next'});
  f.player.show(first);const old=f.videos()[0],oldReady=[...old.listeners.get('loadeddata')][0],oldFrame=[...f.frames.values()][0];
  let finish;old.playGate=new Promise(resolve=>{finish=resolve;});f.ready(old);
  f.player.show(second);const current=f.videos()[1];oldReady();oldFrame();
  assert.equal(old.playCalls,1);assert.equal(old.paused,true);assert.equal(old.children.length,0);assert.equal(f.frames.size,1);
  finish();await Promise.resolve();assert.equal(old.paused,true);assert.equal(current.playCalls,0);
  f.ready(current);await Promise.resolve();f.player.hide();const count=current.playCalls;current.emit('loadeddata');f.step(5000);
  assert.equal(current.playCalls,count);assert.equal(current.paused,true);assert.equal(current.children.length,0);assert.equal(current.src,'');
  assert.equal(f.frames.size,0);assert.equal(f.player.active(),false);assert.equal(f.player.trigger(first,'anything'),false);
});

test('async snapshots cannot write into a retired composition; text, terminal images and procedural panes remain usable',async()=>{
  let resolveImage;const f=fixture({effects:{snapshotData:()=>new Promise(resolve=>{resolveImage=resolve;})}});
  const first=plan([{id:'photo',content:{kind:'snapshot',token:'snapshot-final'},shader:'terminal'}]);
  f.player.show(first);const old=f.made.find(node=>node.tagName==='IMG');
  const next=plan([{id:'words',content:{kind:'text',text:'retained'}},{id:'field',content:{kind:'procedural',preset:'empty-field'},draggable:true}],[],{compositionId:'text'});
  f.player.show(next);resolveImage('data:image/png;base64,old');await Promise.resolve();
  assert.notEqual(old.src,'data:image/png;base64,old');assert.equal(f.player.active(),true);
  assert.ok(f.made.some(node=>node.textContent==='retained'));assert.ok(f.made.some(node=>node.className==='window-composition-procedural preset-empty-field'));
  assert.equal(f.panes().at(-1).style.pointerEvents,'auto');assert.ok(f.panes().at(-1).listeners.has('pointerdown'));
});

test('future hold is applied at its authored timestamp even when the next rendered frame arrives late',()=>{
  const f=fixture(),p=plan();f.player.show(p);f.ready(f.videos()[0]);
  f.player.hold(true,{effectiveAtMs:1500});f.step(2000);
  assert.equal(f.player.debug().panes[0].mediaTimeSeconds,.5);assert.equal(f.player.debug().logicalTimeMs,1500);
  f.player.hold(false,{effectiveAtMs:2400});f.step(2600);
  assert.ok(Math.abs(f.player.debug().panes[0].mediaTimeSeconds-.7)<1e-9);
});

test('logical dissolves and movement stop during hold and snap reports a forced resolved position',()=>{
  const f=fixture(),p=plan([video('a',{target:{anchorX:.9,anchorY:.1,offsetX:20,offsetY:-5}})],[
    {atMs:100,operations:[{type:'assign',assignments:{a:{content:{kind:'video',assetId:'eclipse'},clockMode:'source'}},transition:'dissolve',durationMs:300}]},
  ]);
  f.player.show(p);f.step(1200);const pane=f.panes()[0],incoming=f.videos()[1];
  assert.ok(pane.classList.contains('transition-dissolve'));const opacity=incoming.style.opacity;
  f.player.hold(true);f.step(3000);assert.equal(incoming.style.opacity,opacity);
  f.player.hold(false);f.step(3300);assert.equal(pane.classList.contains('transition-dissolve'),false);
  assert.equal(f.player.snap(p,{coherent:true}),true);assert.equal(pane.style.left,'calc(90% + 20px)');assert.equal(pane.classList.contains('coherent'),true);
});

test('Source-study fallback stays peripheral and inside 320px and 640px hosts',()=>{
  for(const width of [320,640]){
    const f=fixture({width,height:480});
    const p=plan([video('left',{width:220,height:160,entry:{x:.08,y:.1},initial:{x:.08,y:.1}}),video('right',{width:220,height:160,entry:{x:.92,y:.9},initial:{x:.92,y:.9}})],[],{purpose:'source-study'});
    f.player.show(p);f.step(1600);const [left,right]=f.player.debug().panes.map(pane=>pane.rendered);
    for(const pane of [left,right]){
      assert.ok(Math.abs(pane.width-Math.min(220,width*.28))<1e-9);assert.ok(Math.abs(pane.height/pane.width-160/220)<1e-9);
      assert.ok(pane.x-pane.width/2>=8-1e-9);assert.ok(pane.x+pane.width/2<=width-8+1e-9);
      assert.ok(pane.y-pane.height/2>=8-1e-9);assert.ok(pane.y+pane.height/2<=480-8+1e-9);
    }
    assert.ok(left.x+left.width/2<width*.4);assert.ok(right.x-right.width/2>width*.6,'the central playable view remains clear');
  }
});
