import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDriveWeather,stepDriveWeather,driveWeatherFrame,serializeDriveWeather,restoreDriveWeather,WEATHER_GRID} from '../src/game/source-drive/weather.js';
import {r3dSourceVoidPhysicalShader} from '../src/render/r3d.js';

const mean=a=>a.reduce((n,v)=>n+v,0)/a.length;
function advance(state,seconds,{wipers=false,...profile}={}){for(let i=0;i<seconds*120;i++)stepDriveWeather(state,{dt:1/120,timeSec:state.timeSec+1/120,wipers,...profile});return state;}

test('old rain-only checkpoints restore with no invented snow or changed liquid and blade history',()=>{
 const old=createDriveWeather();advance(old,2,{wipers:true});delete old.fog;delete old.snow;delete old.whiteout;delete old.snowGrid;
 const restored=restoreDriveWeather(old);
 assert.deepEqual(restored.grid,old.grid);assert.equal(restored.timeSec,old.timeSec);assert.equal(restored.wiperPhase,old.wiperPhase);
 assert.equal(restored.fog,0);assert.equal(restored.snow,0);assert.equal(restored.whiteout,0);assert.ok(restored.snowGrid.every(v=>v===0));
 assert.ok(driveWeatherFrame(restored).wetness.snowData.every(v=>v===0));
});

test('a held van gathers physical snow and its actual wipers clear arcs without clearing sheltered glass',()=>{
 const exposed=createDriveWeather({initialWetness:0}),wiped=createDriveWeather({initialWetness:0}),sheltered=createDriveWeather({initialWetness:0});
 const profile={rain:.12,snow:1,fog:.8,whiteout:1,wind:[6,-2],speed:0};
 advance(exposed,28,profile);advance(wiped,28,{...profile,wipers:true});advance(sheltered,28,{...profile,shelter:1});
 assert.ok(mean(exposed.snowGrid)>.65,'snow still lands when the vehicle is stopped');
 assert.ok(mean(sheltered.snowGrid)<mean(exposed.snowGrid)*.22,'physical overhead shelter blocks deposition');
 const cleared=wiped.snowGrid.filter((n,i)=>n<.12&&exposed.snowGrid[i]>.5);
 assert.ok(cleared.length>100,'actual blade paths provide clear patches');
 assert.ok(wiped.snowGrid.some(n=>n>.60),'blades cannot clear the unswept pane corners');
 assert.ok(wiped.snowGrid.filter(n=>n>.5).length>WEATHER_GRID.width,'an arc rather than a full-screen reset');
});

test('snow, fog and exact material reservoirs resume at the same clock; a pause cannot advance or change them',()=>{
 const state=createDriveWeather({rain:.16,snow:.9,fog:.8,whiteout:.75});advance(state,9,{wipers:true,wind:[7,-1]});
 const restored=restoreDriveWeather(serializeDriveWeather(state));assert.deepEqual(restored,state);
 const before=serializeDriveWeather(restored);stepDriveWeather(restored,{dt:10,timeSec:99,paused:true,snow:0,fog:0,whiteout:0,wind:[-7,7]});
 assert.equal(serializeDriveWeather(restored),before);
 advance(state,4,{wipers:true,wind:[7,-1]});advance(restored,4,{wipers:true,wind:[7,-1]});assert.deepEqual(restored,state);
 const f=driveWeatherFrame(state);assert.equal(f.fog,.8);assert.equal(f.snow,.9);assert.equal(f.whiteout,.75);assert.equal(f.timeSec,state.timeSec);
 assert.deepEqual(f.wetness.snowData,Uint8Array.from(state.snowGrid,n=>Math.round(n*255)));
});

test('departing snow melts gradually instead of erasing accumulated material when a section changes',()=>{
 const state=createDriveWeather({initialSnow:.8});advance(state,1,{snow:0,rain:.5});
 assert.ok(mean(state.snowGrid)>.79&&mean(state.snowGrid)<.8);
 const wetBefore=mean(state.grid);advance(state,20,{snow:0,rain:.5});
 assert.ok(mean(state.snowGrid)>.65&&mean(state.snowGrid)<.7);assert.ok(mean(state.grid)>wetBefore);
 const dry=createDriveWeather({rain:0,initialWetness:0,initialSnow:.8});advance(dry,1,{rain:0,snow:0});assert.ok(mean(dry.grid)>.002,'melting snow returns water to the physical pane');
});

test('snow checkpoint validation rejects a truncated or non-finite pane map',()=>{
 const state=createDriveWeather();state.snowGrid.pop();assert.throws(()=>restoreDriveWeather(state),/snow checkpoint/);
 state.snowGrid=Array(WEATHER_GRID.width*WEATHER_GRID.height).fill(0);state.snowGrid[0]=NaN;assert.throws(()=>restoreDriveWeather(state),/snow checkpoint/);
});

test('the actual weather texture uploads liquid and snow in distinct channels, including checkpoint owner replacement',()=>{
 const source=readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8'),begin=source.indexOf('export function driveStudyWeatherTarget('),end=source.indexOf('\nexport function setDriveStudyCanvas(',begin),fn=source.slice(begin,end).replace('export ','');
 const calls=[],gl={isContextLost:()=>false,getParameter:()=>105,ACTIVE_TEXTURE:1,TEXTURE0:100,TEXTURE_2D:2,UNPACK_ALIGNMENT:3,RG8:4,RG:5,UNSIGNED_BYTE:6,TEXTURE_MIN_FILTER:7,TEXTURE_MAG_FILTER:8,LINEAR:9,TEXTURE_WRAP_S:10,TEXTURE_WRAP_T:11,CLAMP_TO_EDGE:12,createTexture:()=>({texture:true}),bindTexture(){},pixelStorei(){},texParameteri(){},texImage2D(...args){calls.push(['image',args[2],args[6],Array.from(args.at(-1))]);},texSubImage2D(...args){calls.push(['sub',args[6],Array.from(args.at(-1))]);}};
 const run=new Function('gl',`let driveStudyFrame,driveWetTexture=null,driveWetUploadUnit=null,driveWetRevision=-1,driveWetOwner=null,driveWetSize='';${fn};return wet=>{driveStudyFrame={weather:{wetness:wet}};return driveStudyWeatherTarget();};`)(gl);
 const data=new Uint8Array([10,20]),snowData=new Uint8Array([30,40]),wet={width:2,height:1,data,snowData,revision:1,owner:{}};
 assert.ok(run(wet));assert.deepEqual(calls,[['image',gl.RG8,gl.RG,[10,30,20,40]]]);run(wet);assert.equal(calls.length,1);
 run({...wet,snowData:new Uint8Array([50,60]),owner:{}});assert.deepEqual(calls[1],['sub',gl.RG,[10,50,20,60]]);
});

test('fog and snow are depth-clipped world volumes before final acquisition and physical pane accumulation',()=>{
 const shader=r3dSourceVoidPhysicalShader();
 assert.match(shader,/for\(int i=0;i<12;i\+\+\)/);assert.match(shader,/\(b\*b-a\*a\)\*lengthM/);
 assert.match(shader,/p\.xz\*\.095-drift\*2\.1/);assert.match(shader,/driveFogShadow\(p\)/);
 assert.match(shader,/driveSnow\(eye\+wd\*\(outside\+\.025\),wd,end-outside-\.025\)/);
 assert.match(shader,/along>=end/);assert.match(shader,/paneDeposit=texture\(uDriveWetness,paneUv\)\.rg/);
 assert.match(shader,/if\(throughPane&&surfaceT>paneT\+\.012\)/);
});
