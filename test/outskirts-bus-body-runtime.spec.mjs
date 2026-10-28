// Isolated production movement/action fixtures; no GPU or earned-game claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CELL} from '../src/data/floorplan/legend.js';
import {SOURCE_PRE_TAPE} from '../src/data/source-level.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../src/data/outskirts-bus-passage.js';
import {buildPreTapeGodPreset} from '../src/game/chunk-surf-god.js';
import {createSourceSpaceRuntime} from '../src/game/source-space-runtime.js';
import {BUS_BODY_CORRIDOR,busBodyCorridorCentre} from '../src/game/bus-body-corridor.js';

function fixture(){
 const b=buildPreTapeGodPreset(SOURCE_PRE_TAPE.stillLength),f={r:createSourceSpaceRuntime({initialState:b.state}),events:[],p:b.position,grid:{...b.position}};f.r.setPlayerPosition(f.p);f.bus=f.r.outskirtsPiece('r7-bus');
 f.at=(x,z,origin=f.bus)=>({x:(origin.x+x*Math.cos(origin.yaw)+z*Math.sin(origin.yaw))/CELL-.5,y:(origin.z-x*Math.sin(origin.yaw)+z*Math.cos(origin.yaw))/CELL-.5});
 f.t=()=>f.r.state().outskirtsExperience.busTransit;
 f.tick=(dt=.25,yaw=0,suspended=false)=>{f.r.tickOutskirtsCharacters(dt,{viewYaw:yaw,suspended});const s=f.r.outskirtsStreetFrame({viewYaw:yaw});f.events.push(...s.events);return s;};
 f.pose=(x,z,dt=.25)=>{f.p=f.at(x,z);f.r.setPlayerPosition(f.p);f.tick(dt);};
 f.step=to=>{const from=f.p,m=f.r.geometry.canStep(from.x,from.y,to.x,to.y);assert.ok(m.ok,m.why);f.p={...(m.redirect||to)};f.r.setPlayerPosition(f.p);const result=f.r.onStep(from,f.p);f.tick();return{move:m,result};};
 f.action=action=>f.r.outskirtsPerformAction({action,pass:7});
 f.ready=()=>{f.pose(.75,4);assert.equal(f.action('bus-exit-try').changed,true);f.pose(0,2.5,0);for(let i=0;i<7;i++)f.tick();assert.equal(f.action('bus-woman-open').changed,true);for(let i=0;i<12;i++)f.tick();assert.equal(f.r.outskirtsBusPassageFrame().bodyOpening.ready,true);};
 f.reload=()=>{const s=JSON.parse(JSON.stringify(f.r.state()));f.r=createSourceSpaceRuntime({initialState:s});f.r.setPlayerPosition(f.p);return s;};
 return f;
}

test('front trap waits for a clear body/exit look or mid-aisle commitment, closes physically and retains four ordered cuts',()=>{
 const f=fixture();f.pose(0,-3);assert.equal(f.t().trapAt,null);
 f.pose(0,-2.5);assert.equal(f.t().trapAt,null);
 f.pose(0,-2);const eye={x:(f.p.x+.5)*CELL,z:(f.p.y+.5)*CELL},entry=f.at(-1.245,-3.15);
 const yaw=Math.atan2((entry.x+.5)*CELL-eye.x,-((entry.y+.5)*CELL-eye.z));
 f.tick(.25,yaw);assert.ok(Number.isFinite(f.t().trapAt));
 const trap=f.t().trapAt;for(let i=0;i<12;i++)f.tick();
 const frame=f.r.outskirtsBusPassageFrame();assert.equal(frame.entryAngle,0);assert.deepEqual(frame.lighting.power.strips,[0,0,0,0]);assert.equal(frame.lighting.power.rear,.72);
 const before=f.events.filter(e=>e.cue==='bus-strip').map(e=>e.variant);assert.deepEqual(before,[0,1,2,3]);
 f.reload();f.tick();assert.equal(f.t().trapAt,trap);assert.equal(f.events.filter(e=>e.cue==='bus-strip').length,4);
 const rushed=fixture();rushed.pose(0,-1);assert.ok(Number.isFinite(rushed.t().trapAt),'rush misses the front trap');
});

test('rear E genuinely fails, separate woman OPEN waits for discovery, and neither action moves the body',()=>{
 const f=fixture();f.pose(.75,4);assert.equal(f.r.outskirtsBusPassageFrame().exitAngle,0);
 const before={...f.p};assert.equal(f.action('bus-exit-try').changed,true);assert.deepEqual(f.p,before);
 assert.equal(f.r.outskirtsBusPassageFrame().attempt.kind,'exit');
 f.pose(0,2.5,0);assert.equal(f.action('bus-woman-open').handled,false);
 for(let i=0;i<7;i++)f.tick();const p={...f.p};assert.equal(f.action('bus-woman-open').changed,true);assert.deepEqual(f.p,p);
 f.tick();assert.equal(f.r.outskirtsBusPassageFrame().bodyOpening.progress,0);
 for(let i=0;i<11;i++)f.tick();assert.equal(f.r.outskirtsBusPassageFrame().bodyOpening.ready,true);assert.equal(f.r.outskirtsBusPassageFrame().exitAngle,0);
 const closed=f.r.geometry.canStep(f.at(.75,4).x,f.at(.75,4).y,f.at(1.25,4).x,f.at(1.25,4).y);assert.equal(closed.ok,false,'rear leaf becomes an exterior shortcut');
 const early=fixture();early.pose(0,2.5);assert.equal(early.action('bus-woman-open').handled,false,'woman opens before discovering the rear door');
});

test('the real default arrival lattice walks to physical release-bar contact and saves its reachable stance',()=>{
 const f=fixture(),desired=f.at(.445,4),from={x:f.grid.x+Math.round(desired.x-f.grid.x),y:f.grid.y+Math.round(desired.y-f.grid.y)};
 f.p=from;f.r.setPlayerPosition(from);f.tick();
 const to={x:from.x,y:from.y-1},move=f.r.geometry.canStep(from.x,from.y,to.x,to.y);
 assert.equal(move.via,'bus-rear-contact');assert.ok(move.redirect);
 const distance=Math.hypot(move.redirect.x-from.x,move.redirect.y-from.y)*CELL;
 assert.ok(distance>.035&&distance<.5,'contact replaces the ordinary partial walk with an E warp');
 f.step(to);const contact={...f.p};assert.equal(f.action('bus-exit-try').changed,true,'default grid cannot physically reach its rear release bar');
 f.reload();assert.deepEqual(f.p,contact);assert.equal(f.r.geometry.canStep(contact.x,contact.y,contact.x,contact.y).ok,true,'restored contact stance is inside visible hardware');
});

test('only an accepted ordinary aperture step enters the saved pocket and retreat returns to the woman front',()=>{
 const f=fixture();f.ready();f.pose(0,4,0);
 const target=f.at(0,4.5),query=f.r.geometry.canStep(f.p.x,f.p.y,target.x,target.y);assert.equal(query.via,'bus-body-enter');assert.equal(f.t().interior,null,'pure collision query enters the corridor');
 const moved=f.step(target);assert.equal(moved.result.event,'bus-body-enter');assert.equal(f.r.busInteriorFrame().active,true);assert.equal(f.r.outskirtsStreetFrame().pass,7);
 const original=f.r.busInteriorFrame(),snapshot=f.reload();assert.equal(f.r.busInteriorFrame().along,original.along);assert.deepEqual(f.t().interior,snapshot.outskirtsExperience.busTransit.interior);
 const back=f.at(0,-.15,original.origin);assert.equal(f.step(back).result.event,'bus-body-return');assert.equal(f.r.busInteriorFrame(),null);assert.equal(f.t().exited,false);
});

test('72m ordinary half-metre grid follows both bends, saves and leaves beyond the bus without changing chapter commitments',()=>{
 const f=fixture();f.ready();f.pose(0,4,0);const commitment=JSON.stringify(f.r.state().finale);f.step(f.at(0,4.5));
 const origin=f.r.busInteriorFrame().origin,start={...f.p},at=(i,j)=>({x:start.x+i,y:start.y-j});
 // World +X is local +Z for this bus. Search in actual logical coordinates,
 // retaining the same half-metre lattice and ordinary orthogonal guards.
 const endZ=BUS_BODY_CORRIDOR.length+.35,goal=f.at(Math.round(busBodyCorridorCentre(72).x/.5)*.5,endZ,origin);
 const key=p=>`${Math.round((p.x-start.x)*1e6)},${Math.round((p.y-start.y)*1e6)}`,q=[start],parents=new Map([[key(start),null]]),points=new Map([[key(start),start]]);
 for(let n=0;n<q.length&&!parents.has(key(goal));n++){const p=q[n];for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const next={x:p.x+dx,y:p.y+dy},id=key(next);if(parents.has(id)||Math.hypot(next.x-start.x,next.y-start.y)>150)continue;
   const move=f.r.geometry.canStep(p.x,p.y,next.x,next.y);if(!move.ok)continue;if(move.redirect&&move.via!=='bus-body-exit')continue;parents.set(id,key(p));points.set(id,next);q.push(next);}}
 assert.ok(parents.has(key(goal)),'body corridor has no continuous half-metre path');const path=[];for(let id=key(goal);parents.get(id)!=null;id=parents.get(id))path.push(points.get(id));
 let distance=0;for(const next of path.reverse()){const previous=f.p;f.step(next);distance+=Math.hypot(next.x-previous.x,next.y-previous.y)*CELL;if(distance>35&&distance<36)f.reload();}
 assert.ok(distance>=72);assert.equal(f.r.busInteriorFrame(),null);assert.equal(f.t().exited,true);assert.ok(Number.isFinite(f.t().crossedAt));assert.equal(JSON.stringify(f.r.state().finale),commitment);
 const exterior=f.r.outskirtsBusPassageFrame().local;assert.ok(exterior.x>2&&exterior.z>3.5);
});

test('main reports the actual pre-redirect source step and useful-hand activity defers OPEN',()=>{
 const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.match(source,/chunkSurfRuntime\.onStep\(stepFrom,/);assert.doesNotMatch(source,/chunkSurfRuntime\.onStep\(\{x:px-sx,y:py-sy\}/);
 const f=fixture();f.pose(.75,4);f.action('bus-exit-try');for(let i=0;i<7;i++)f.tick();f.pose(0,2.5);
 f.r.setOutskirtsWorldState({ticketReturned:true});f.r.outskirtsPerformAction({action:'ticket',pass:7});
 assert.equal(f.action('bus-woman-open').handled,false,'active receipt is overwritten by body opening');
});
