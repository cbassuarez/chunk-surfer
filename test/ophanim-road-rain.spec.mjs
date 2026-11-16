import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame,serializeDriveWeather,restoreDriveWeather,DRIVE_PANE,DRIVE_WIPER,WIPER_TILT_X,WEATHER_GRID} from '../src/game/source-drive/weather.js';
import {makeDriveScene} from '../src/game/source-drive/scene.js';
import {createDrive} from '../src/game/source-drive/drive-state.js';
import {makeOpeningPrologueScene} from '../src/game/opening-prologue-scene.js';
import {OPENING_PROLOGUE} from '../src/data/opening-prologue.js';
import {OPENING_ROAD_BREATHS} from '../src/game/opening-road-rhythm.js';
import {openingPrologueMix} from '../src/audio/opening-prologue-audio.js';
import {uiSetLayoutSize} from '../src/render/ui.js';
import * as scenes from '../src/game/scenes.js';

const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const point=(m,p)=>[0,1,2].map(k=>m[k]*p[0]+m[4+k]*p[1]+m[8+k]*p[2]+m[12+k]);
const wetStep=(s,{hz=120,...opts}={})=>stepDriveWeather(s,{dt:1/hz,timeSec:s.timeSec+1/hz,...opts});

test('a visible approaching cell becomes a hit, adds water there and retains its bead',()=>{
 const s=createDriveWeather({initialWetness:0,rain:1});wetStep(s,{speed:0});
 let cell=-1;
 for(let tick=0;tick<120&&cell<0;tick++){wetStep(s,{speed:0});cell=Array.from(driveWeatherFrame(s).wetness.impactData).findIndex(v=>v<9);}
 assert.ok(cell>=0,'a negative encoded age describes an approaching drop');
 const before=s.grid[cell],impacts=s.impactCount;
 for(let tick=0;tick<20&&s.impactAge[cell]!==0;tick++)wetStep(s,{speed:0});
 assert.equal(s.impactAge[cell],0);assert.ok(s.impactCount>impacts);assert.ok(s.grid[cell]>before+.12);assert.equal(s.beadGrid[cell],1);
 wetStep(s,{rain:0,speed:0});assert.ok(s.beadGrid[cell]>.99,'ending airborne rain does not erase deposited water');
 assert.equal(driveWeatherFrame(s).wetness.beadData[cell],255);
});

test('the visible GLB rubber centreline clears its actual projected contact in both blade arcs',()=>{
 const b=readFileSync(new URL('../public/assets/source-drive/drive.glb',import.meta.url)),g=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
 const rubber=g.meshes.find(m=>m.name==='drive_wiper').primitives.find(p=>g.materials[p.material].name.includes('rubber')),bounds=g.accessors[rubber.attributes.POSITION];
 assert.ok(Math.abs(bounds.min[1]-DRIVE_WIPER.bladeFrom)<1e-6);assert.ok(Math.abs(bounds.max[1]-DRIVE_WIPER.bladeTo)<1e-6);
 assert.ok(Math.abs((bounds.min[0]+bounds.max[0])/2-DRIVE_WIPER.bladeX)<1e-6);
 const drive=createDrive();Object.assign(drive,{x:0,z:0,heading:.3,roadHeight:0});let checked=0;
 for(const phase of[.4,1,1.7,2.4,3.2,4.1,5.2]){
  const s=createDriveWeather({rain:0,initialWetness:1});
  for(let i=0;i<=Math.round(phase/(Math.PI*2)*s.wiperCycleSeconds*120);i++)wetStep(s,{wipers:true,rain:0});
  const pane=driveWeatherFrame(s),scene=makeDriveScene(drive,metrics,{weather:pane,cabOnly:true,roadSampler:()=>({grade:0,heading:.3})}),inverse=driveWeatherFrame(s,{bodyMatrix:scene.body,cabinMount:metrics.cabinBodyMount}).worldToCabin;
  for(const blade of scene.props.filter(p=>/^drive-wiper-/.test(p.id)))for(const along of[.34,.40,.46,.52,.56]){
   const p=point(inverse,point(blade.matrix,[DRIVE_WIPER.bladeX,along,.025]));
   if(p[0]<=DRIVE_PANE.left||p[0]>=DRIVE_PANE.right||p[1]<=DRIVE_PANE.bottomY||p[1]>=DRIVE_PANE.topY)continue;
   const tangent=(p[1]-DRIVE_PANE.bottomY)*Math.cos(WIPER_TILT_X)+(p[2]-DRIVE_PANE.bottomZ)*Math.sin(WIPER_TILT_X);
   const x=Math.floor((p[0]-DRIVE_PANE.left)/(DRIVE_PANE.right-DRIVE_PANE.left)*WEATHER_GRID.width),y=Math.floor(tangent/Math.hypot(.52,.62)*WEATHER_GRID.height);
   // Contact is sampled on 35 x 25 mm cells, not a sub-millimetre fluid mesh.
   // Require a cleared sample within one cell of the actual rubber centre.
   const neighbours=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const a=x+dx,b=y+dy;if(a>=0&&a<WEATHER_GRID.width&&b>=0&&b<WEATHER_GRID.height)neighbours.push(b*WEATHER_GRID.width+a);}
   assert.ok(neighbours.some(j=>s.grid[j]<.1&&s.beadGrid[j]<.1),`${blade.id} phase ${phase} contact ${p} must clear its own sampled pane contact`);checked++;
  }
 }
 assert.ok(checked>25);assert.ok(Math.abs(Math.tan(WIPER_TILT_X)-.62/.52)<1e-12);
});

test('impacts, beads and future sweeps survive checkpoints and agree across frame rates',()=>{
 const states=[30,60,120].map(hz=>{const s=createDriveWeather({rain:.98,wettingScale:9});for(let i=0;i<3*hz;i++)wetStep(s,{hz,wipers:true,speed:13});return s;});
 for(const s of states.slice(1))for(const key of['rainPhase','impactAge','grid','beadGrid'])assert.deepEqual(s[key],states[0][key]);
 const s=states[0],restored=restoreDriveWeather(serializeDriveWeather(s)),saved=serializeDriveWeather(s);
 stepDriveWeather(s,{dt:10,paused:true,timeSec:99});assert.equal(serializeDriveWeather(s),saved);
 for(let i=0;i<360;i++){wetStep(s,{wipers:false,speed:0});wetStep(restored,{wipers:false,speed:0});}
 assert.equal(serializeDriveWeather(s),serializeDriveWeather(restored));assert.equal(s.wiperMoving,false);assert.ok(s.impactCount>states[1].impactCount,'rain keeps striking the stopped van');
 const old=JSON.parse(saved);for(const k of['rainPhase','impactAge','beadGrid','impactCount','impactRate'])delete old[k];
 const migrated=restoreDriveWeather(old);assert.deepEqual(migrated.grid,old.grid);wetStep(migrated);assert.equal(migrated.impactAge.length,48*32);
 const bad=JSON.parse(saved);bad.impactAge[0]=NaN;assert.throws(()=>restoreDriveWeather(bad),/rain checkpoint/);
});

function host(){
 scenes.clear();
 let elapsed=0,shown=true,ready=true,paused=false;const calls={typing:0};
 const driver={start(){},update(dt){if(!paused)elapsed+=dt;},setPaused(p){paused=p;},snapshot:()=>({timeSec:elapsed,driveState:{heading:0}}),
  frame:()=>({scene:{eye:[0,1.65,0],props:[],lamps:[]},look:{yaw:0,pitch:-.035}})};
 const scene=makeOpeningPrologueScene({drive:driver,driveMetrics:{},getReady:()=>ready,getPresentationReady:()=>true,onDriveFrame:()=>shown,audio:{startTyping(){calls.typing++;},stopTyping(){}},getAudio:()=>null});
 scenes.push(scene);return{scene,calls,setShown:v=>shown=v,setReady:v=>ready=v};
}
const advance=(s,t)=>{for(let i=0;i<Math.round(t*20);i++)s.update(.05);};

test('silence waits for presentation, pauses exactly and cannot leak deferred captions on resume',()=>{
 const h=host();h.setReady(false);advance(h.scene,10);assert.equal(h.scene.view().phase,'loading');
 h.setReady(true);h.setShown(false);advance(h.scene,2);assert.equal(h.scene.view().phase,'awaiting-frame');
 h.setShown(true);advance(h.scene,.1);const first=h.scene.view();assert.equal(first.roadBreath.id,'arrive');assert.equal(first.typed,0);assert.equal(h.calls.typing,0);
 advance(h.scene,1);h.scene.pause();const held=h.scene.view();advance(h.scene,4);assert.deepEqual(h.scene.view().roadBreath,held.roadBreath);assert.equal(h.scene.view().drive.timeSec,held.drive.timeSec);
 h.scene.resume();advance(h.scene,.1);assert.equal(h.scene.view().typed,0);assert.equal(h.calls.typing,0);
 h.setShown(false);advance(h.scene,.1);const failed=h.scene.view();advance(h.scene,2);assert.equal(h.scene.view().roadBreath.elapsed,failed.roadBreath.elapsed);
 h.setShown(true);advance(h.scene,6);assert.equal(h.scene.view().roadBreath,null);assert.ok(h.scene.view().typed>0);assert.equal(h.calls.typing,1);
 h.scene.exit();
});

test('a complete real route disperses six silences without timing out a choice or altering the authored lines',()=>{
 uiSetLayoutSize({cols:160,rows:50});const h=host(),seen=new Set(),choices={there:'driving',look:'interval-refuse',job:'job-money',ellery:'school',notice:'hearing',margin:'margin-road',fate:'f-enough'};
 try{
  for(let tick=0;tick<14000&&h.scene.view().nodeId!=='card';tick++){
   h.scene.update(.05);const v=h.scene.view();if(v.roadBreath){seen.add(v.roadBreath.id);const serial=v.lineSerial;h.scene.key({key:'Enter'});assert.equal(h.scene.view().lineSerial,serial);continue;}
   if(tick%4)continue;
   if(v.pending){const i=v.pending.kind==='say'?0:v.pending.options.findIndex(o=>o.goto===choices[v.nodeId]);assert.ok(i>=0,`route ${v.nodeId}`);h.scene.key({key:String(i+1)});}else h.scene.key({key:'Enter'});
  }
  assert.equal(h.scene.view().nodeId,'card');assert.deepEqual([...seen],OPENING_ROAD_BREATHS.map(b=>b.id));assert.deepEqual(h.scene.view().roadBreathsCompleted,[...seen]);
  for(const b of OPENING_ROAD_BREATHS)assert.ok(Object.values(OPENING_PROLOGUE.nodes).some(n=>n.lines.some(l=>l.sourceId===b.sourceId)));
 }finally{h.scene.exit();uiSetLayoutSize(null);}
});

test('the existing review and held skip remain available during a dispersed silence',()=>{
 uiSetLayoutSize({cols:160,rows:50});const h=host();try{
  for(let i=0;i<400&&h.scene.view().roadBreath?.id!=='fatigue';i++){h.scene.update(.05);h.scene.key({key:'Enter'});}
  assert.equal(h.scene.view().roadBreath?.id,'fatigue');h.scene.key({key:'q'});assert.equal(h.scene.view().reviewActive,true);
  const elapsed=h.scene.view().roadBreath.elapsed;advance(h.scene,3);assert.equal(h.scene.view().roadBreath.elapsed,elapsed);
  h.scene.key({key:'Escape'});assert.equal(h.scene.view().reviewActive,false);advance(h.scene,.1);assert.equal(h.scene.view().typed,0);
  h.scene.key({key:'e',code:'KeyE'});advance(h.scene,1.2);assert.equal(h.scene.view().finished,true);
 }finally{h.scene.exit();uiSetLayoutSize(null);}
});

test('dispersed silence restores the actual cab in the existing audio mix',()=>{
 const v={elapsed:50,openedAt:10,stageMusic:.7},ordinary=openingPrologueMix(v),breath=openingPrologueMix({...v,roadBreathing:true});
 assert.equal(breath.cab,1);assert.ok(breath.cab>ordinary.cab);assert.ok(breath.music<ordinary.music);assert.equal(breath.radio,ordinary.radio);
});
