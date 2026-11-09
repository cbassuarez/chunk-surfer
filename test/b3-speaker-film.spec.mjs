import test from 'node:test';
import assert from 'node:assert/strict';
import {b3SpeakerFilmFrame,createB3SpeakerFilm} from '../src/game/b3-speaker-film.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import {b3WindowCrossing} from '../src/data/studio-b3-window.js';
FP.compile(conservatory.levels,{width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
 connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors});
test('film camera remains in supported control-room space with the body exclusively beyond the glass',()=>{
  for(let t=0;t<12.5;t+=.05){
    const f=b3SpeakerFilmFrame(t),e=f.camera.eye;
    const floor=FP.logicalAtPhysical(e[0]/.5,e[2]/.5,{group:'basement',floor:-4});
    assert.ok(floor&&!FP.isSolid(floor.x,floor.y),`supported camera ${t}`);
    assert.ok(e[1]>floor.floor&&e[1]<floor.ceil);
    if(f.body){
      const p=FP.logicalToPhysical(f.body.x,f.body.y);assert.ok(p.x*.5<18.5);
      if(t>4.6&&t<10)assert.ok(b3WindowCrossing(e,[(p.x+.5)*.5,-2.55,(p.z+.5)*.5]),`visible through real pane ${t}`);
    }
  }
});
test('visit turns and leaves along the same side; no body persists after end',()=>{
  const a=b3SpeakerFilmFrame(3),b=b3SpeakerFilmFrame(6.8),c=b3SpeakerFilmFrame(11);
  assert.ok(a.body.y>b.body.y);assert.ok(c.body.y>b.body.y);assert.equal(c.body.heading,Math.PI);
  assert.equal(b3SpeakerFilmFrame(12.5).body,null);assert.equal(b3SpeakerFilmFrame(12.5).done,true);
});
test('pause holds the film and fresh skip/normal ending restore once without any actor authority',()=>{
  let paused=true,done=0,exit=0,steps=0;
  const film=createB3SpeakerFilm({getHeld:()=>paused,onDone:()=>done++,onExit:()=>exit++,onFootstep:()=>steps++});
  film.update(90);assert.equal(film.view().elapsed,0);paused=false;
  for(let i=0;i<35;i++)film.update(.1);assert.ok(steps>0);
  film.keyup({code:'Escape'});assert.equal(done,0,'a carried release cannot skip');
  film.key({code:'Escape'});film.keyup({code:'Escape'});assert.equal(done,1);
  film.update(90);assert.equal(done,1);film.exit();assert.equal(exit,1);
});

test('production pressure compositor admits only the optical film actor through cinematic suppression',async()=>{
  const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
  const {createPressurePerformance}=await import('../src/game/pressure-performance.js');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const start=main.indexOf('function pressureRenderFrame('),end=main.indexOf('\nfunction tickPressurePerformance',start);
  const performance=createPressurePerformance();
  performance.tick(.1,{primary:{id:'real',role:'live-pressure',x:1,y:1},secondary:{id:'b3-optical-visit',role:'b3-optical-visit',x:31,y:33}});
  const ctx=vm.createContext({pressurePerformance:performance,hushRunActive:false,scenes:{top:()=>null}});
  vm.runInContext(main.slice(start,end),ctx);
  const frame=ctx.pressureRenderFrame({suppressActors:true,b3Cinematic:true});
  assert.equal(frame.primary,null);assert.equal(frame.secondary.id,'b3-optical-visit');assert.equal(frame.allowed,true);
  assert.equal(frame.secondary.performance.role,'b3-optical-visit');
  const unrelated=ctx.pressureRenderFrame({suppressActors:true});assert.equal(unrelated.secondary,null);
  performance.reset();assert.equal(ctx.pressureRenderFrame(null).secondary,null,'return cannot retain an optical body');
});
