import test from 'node:test';import assert from 'node:assert/strict';
import {SOURCE_EARTHFALL_ELLERY_ASIDE as C} from '../src/data/source-earthfall-ellery-aside.js';
import {EARTHFALL_CHASE as G,EARTHFALL_CHASE_ARCHITECTURE as ARCH,earthfallChaseWorldPoint,earthfallChaseLocalPoint,earthfallChaseFactors} from '../src/data/source-earthfall-chase.js';
import {freshSourceEarthfallElleryAside as fresh,normalizeSourceEarthfallElleryAside as normalize,stepSourceEarthfallElleryAside as step,sourceEarthfallElleryAsideFrame as frame,sourceElleryAsideCanStand as stand,sourceElleryAsideFooting as footing,transformAsidePoint} from '../src/game/source-earthfall-ellery-aside.js';
import {sourceEarthfallElleryAsideRenderFrame as render} from '../src/render/source-earthfall-ellery-aside.js';
import {SOURCE_ELLERY_ASIDE_ASSET as ASSET} from '../src/data/generated/source-earthfall-ellery-aside.js';
const advance=(s,seconds,input={})=>{const events=[];for(let t=0;t<seconds-1e-8;t+=1/60){const r=step(s,{dt:Math.min(1/60,seconds-t),...input});s=r.state;events.push(...r.events);}return{state:s,events};};
const quiet=()=>advance(fresh({runId:'loop-proof'}),13).state;
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('six-second ordinary gag is retained but neither recognition nor quiet exploration hides a destruction timer',()=>{
 const first=advance(fresh(),7.5);assert.equal(first.events.filter(e=>e.type==='threshold-gag-release').length,1);const boo=first.events.find(e=>e.type==='threshold-gag-boo');assert.ok(boo&&Math.abs(boo.at-6.6)<.02);
 const q=advance(first.state,55).state;assert.equal(q.chase.phase,'quiet');assert.equal(q.elapsed,0);assert.equal(q.status,'active');assert.equal(q.chase.compression,0);assert.ok(q.clock>62);assert.equal(frame(q).gag.shadow,null);
});
test('the ordinary grey exit must open and be crossed, completes once without chase or penalty',()=>{
 let s={...quiet(),x:58.2,z:10.25,yaw:-Math.PI/2};assert.equal(frame(s).focus.id,'quiet-exit');s=step(s,{dt:0,interact:true}).state;
 const r=advance(s,2,{forward:1});assert.equal(r.state.status,'completed');assert.equal(r.state.exitKind,'quiet');assert.equal(r.state.elapsed,0);assert.equal(r.state.chase.catches,0);assert.equal(r.state.chase.injuryApplied,false);assert.equal(r.events.filter(e=>e.type==='aside-complete').length,1);assert.ok(r.state.x<=G.quietExit.x);assert.equal(frame(r.state).blackoutAlpha,1);
});
test('both genuine branches and rejoin have continuous body-sized support through the copied room construction',()=>{
 const south=[{x:65,z:12},{x:64.75,z:14.5},{x:64.75,z:20},{x:65,z:22}],east=[{x:65,z:13.25},{x:70,z:13.25},{x:76.5,z:13.25},{x:78,z:18},{x:78,z:20.25},{x:70,z:20.25},{x:68,z:20.25},{x:65,z:22}];
 for(const compression of[0,.5,.98])for(const route of[south,east]){let s=quiet();s.chase.phase='chase';s.chase.compression=compression;for(let i=1;i<route.length;i++){const a=route[i-1],b=route[i],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.07);for(let j=0;j<=n;j++){const p={x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n},w=earthfallChaseWorldPoint(p,s.chase);assert.ok(stand(w.x,w.z,s),`unsupported/blocked ${JSON.stringify(p)} at compression${compression}`);assert.ok(footing(w.x,w.z,0,s));}}}
 const meshes=new Set(ASSET.panels.map(p=>p.mesh));assert.ok(ARCH.every(p=>meshes.has(p.mesh)),'all copied architecture comes from the actual original room pack');
});
test('actual transformed overhead source bounds and structural door openings preserve pre-collapse bodily clearance',()=>{
 const sourceBounds=new Map([...ASSET.panels,...ASSET.props].filter(p=>p.bounds).map(p=>[p.mesh,p.bounds]));let lowest=Infinity,narrowest=Infinity,shortest=Infinity;
 const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
 for(let i=0;i<=100;i++){
  const s=fresh();s.gag.complete=true;s.chase.phase='chase';s.chase.compression=i/100;const r=render(s),q=earthfallChaseFactors(r.chase);
  near(q.y,1);assert.ok(q.xz>=.72-1e-8,'ordinary chase compression retains the actual body-sized door widths');
  for(const p of r.props.filter(p=>p.asideRole==='inverted-room'||p.asideRole==='inverted-furnishing')){
   const b=sourceBounds.get(p.mesh);assert.ok(b,`missing original source bounds for ${p.mesh}`);
   for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])lowest=Math.min(lowest,transformAsidePoint(p.matrix,[x,y,z])[1]);
  }
  for(const d of r.doors){const p=r.props.find(p=>p.asideRole==='door-frame'&&p.doorId===d.id),w=d.assembly.opening.width,h=d.assembly.opening.height;
   narrowest=Math.min(narrowest,distance(transformAsidePoint(p.matrix,[-w/2,0,0]),transformAsidePoint(p.matrix,[w/2,0,0])));
   shortest=Math.min(shortest,distance(transformAsidePoint(p.matrix,[0,0,0]),transformAsidePoint(p.matrix,[0,h,0])));
  }
 }
 assert.ok(lowest>=2.25-1e-8,`original transformed walls/ceiling/furniture reach ${lowest}m; interior half-size alone is insufficient`);
 assert.ok(narrowest>=.72-1e-8,`narrowest structural opening ${narrowest}m`);assert.ok(shortest>=2.2-1e-8,`shortest structural opening ${shortest}m`);
 assert.ok(shortest>=2.18+.015&&narrowest>=.68+.035,'structural openings retain the canonical HUSH dimensions plus a finite margin');
});
test('only player noise arms the real local hunter, seals the quiet door and starts gradual compression',()=>{
 const q=quiet(),r=step(q,{dt:.1,playerNoise:true}),s=r.state;assert.equal(s.chase.phase,'chase');assert.equal(r.events.filter(e=>e.type==='chase-start').length,1);assert.ok(frame(s).localHush);assert.equal(s.elapsed,0);assert.ok(s.chase.compression>0&&s.chase.compression<.01);assert.equal(s.chase.quietDoorTarget,0);
 const p=earthfallChaseWorldPoint({x:56.5,z:10.25},s.chase);assert.equal(stand(p.x,p.z,s),false);assert.equal(step(s,{dt:.1,playerNoise:true}).events.some(e=>e.type==='chase-start'),false);
});
test('an early noise is ignored but one brief genuine pulse after the boo latches through its tail exactly once',()=>{
 let early=fresh();early=step(early,{dt:1/60,playerNoise:true}).state;early=advance(early,9).state;assert.equal(early.chase.phase,'quiet');assert.equal(early.chase.noiseLatched,false);assert.equal(early.chase.elapsed,0);
 let s=advance(fresh(),6.65).state;const pulse=step(s,{dt:1/60,playerNoise:true});assert.equal(pulse.state.chase.noiseLatched,true);assert.equal(pulse.events.filter(e=>e.type==='chase-start').length,0,'the human delivery finishes before its consequence');
 const tail=advance(pulse.state,2);assert.equal(tail.state.chase.phase,'chase');assert.equal(tail.events.filter(e=>e.type==='chase-start').length,1);assert.equal(advance(tail.state,1).events.filter(e=>e.type==='chase-start').length,0);
});
test('noise at the closing exit never strands a half-crossed body in its leaf',()=>{
 let s=quiet();s.x=57.1;s.z=10.25;s.yaw=Math.PI/2;s.chase.quietDoor=1;s.chase.quietDoorTarget=1;
 s=advance(s,1,{forward:1,playerNoise:true}).state;assert.ok(earthfallChaseLocalPoint(s,s.chase).x>57.6);assert.equal(s.status,'active');assert.equal(s.chase.phase,'chase');assert.equal(s.chase.quietDoorTarget,0);
});
test('catch waits for real presentation; a persisted host receipt resolves once, worsens space and resumes the same chase',()=>{
 let s=quiet();s=step(s,{dt:.05,playerNoise:true}).state;const p=earthfallChaseLocalPoint(s,s.chase);s.chase.hushX=p.x+.25;s.chase.hushZ=p.z;s.chase.grace=0;
 s=step(s,{dt:.05}).state;assert.equal(s.chase.phase,'contact');const id=s.chase.contactEventId;assert.ok(id);const hold=advance(s,1).state;assert.equal(hold.chase.phase,'contact');assert.ok(hold.chase.contactElapsed>.9);assert.equal(hold.chase.catches,0);
 const saved=normalize({...hold,chase:{...hold.chase,injuryApplied:true,presentedEventId:id}}),resolved=step(saved,{dt:1/60}).state;assert.equal(resolved.chase.phase,'chase');assert.equal(resolved.chase.catches,1);assert.equal(resolved.chase.injuryApplied,true);assert.equal(resolved.chase.presentedEventId,'');assert.ok(resolved.clock>=hold.clock);assert.ok(resolved.chase.grace>2);assert.equal(step(resolved,{dt:1/60}).state.chase.catches,1);
 const later=advance(resolved,2).state;assert.ok(later.chase.compression>resolved.chase.compression);assert.equal(later.status,'active');
});
test('a saved contact beyond45seconds keeps advancing and an acknowledged later catch resumes once without another injury state',()=>{
 const s=quiet(),id='long-contact:third-catch';Object.assign(s.chase,{phase:'contact',elapsed:20,compression:.4,catches:2,contactElapsed:45.75,contactEventId:id,injuryApplied:true,hushX:65.5,hushZ:11.65,heading:-Math.PI/2});Object.assign(s,earthfallChaseWorldPoint({x:65.15,z:11.65},s.chase));
 const restored=normalize(JSON.parse(JSON.stringify(s)));near(restored.chase.contactElapsed,45.75);assert.equal(restored.chase.phase,'contact');
 const pending=step(restored,{dt:.1}).state;assert.ok(pending.chase.contactElapsed>45.84,'an interrupted or poorly framed contact may not stick at a normalization cap');assert.equal(pending.chase.catches,2);assert.equal(pending.chase.injuryApplied,true);
 const acknowledged=normalize({...pending,chase:{...pending.chase,presentedEventId:id,injuryApplied:true}}),result=step(acknowledged,{dt:1/60}),resolved=result.state;
 assert.equal(resolved.chase.phase,'chase');assert.equal(resolved.chase.catches,3);assert.equal(resolved.chase.contactElapsed,0);assert.equal(resolved.chase.presentedEventId,'');assert.equal(resolved.chase.injuryApplied,true);assert.equal(result.events.filter(e=>e.type==='caught'&&e.eventId===id).length,1);
 const replay=step(normalize(JSON.parse(JSON.stringify(resolved))),{dt:1/60,contactPresented:true});assert.equal(replay.state.chase.catches,3);assert.equal(replay.events.some(e=>e.type==='caught'),false);assert.equal(replay.state.chase.injuryApplied,true);
 const continuing=advance(replay.state,1).state;assert.equal(continuing.status,'active');assert.equal(continuing.chase.phase,'chase');assert.ok(continuing.chase.compression>resolved.chase.compression);assert.equal(continuing.chase.injuryApplied,true);assert.equal(continuing.chase.catches,3);
});
test('navigation cache, phase, compression and catch receipt survive reload; pause/focus/protection freeze them',()=>{
 let s=advance(step(quiet(),{dt:.1,playerNoise:true}).state,2).state;assert.ok(s.chase.path.length);const saved=normalize(JSON.parse(JSON.stringify(s)));assert.deepEqual(saved.chase.path,s.chase.path);near(saved.chase.pathClock,s.chase.pathClock);
 for(const guard of[{paused:true},{protected:true},{focused:false},{assetsReady:false}])assert.deepEqual(step(saved,{dt:.2,forward:1,...guard}).state,saved);
 assert.deepEqual(step(s,{dt:.1,side:1}),step(saved,{dt:.1,side:1}));
});
test('opposing room turns and descends above a stable body, then the same timed implosion converges finitely',()=>{
 for(const compression of[0,.2,.5,.8,1]){const s=quiet();s.chase.phase='chase';s.chase.compression=compression;const a=render(s),b=render({...s,yaw:2,pitch:-1}),inverse=a.props.filter(p=>p.asideRole==='inverted-room');assert.ok(inverse.length>=5);assert.deepEqual(a.props.map(p=>p.matrix),b.props.map(p=>p.matrix));assert.deepEqual(a.authoredCamera.eye,frame(s).eye);assert.ok(inverse.every(p=>p.matrix.every(Number.isFinite)));assert.equal(a.authoredCamera.yaw,s.yaw);}
 let s=quiet(),events=[];for(let i=0;i<6000&&s.status==='active';i++){const r=step(s,{dt:1/60,playerNoise:true,contactPresented:s.chase.phase==='contact'&&s.chase.contactElapsed>.7});s=r.state;events.push(...r.events);}
 assert.equal(s.status,'completed');assert.equal(s.exitKind,'collapse');assert.equal(s.elapsed,C.duration);assert.equal(events.filter(e=>e.type==='collapse-start').length,1);assert.equal(events.filter(e=>e.type==='aside-complete').length,1);assert.ok(s.chase.catches>0);assert.ok(earthfallChaseFactors(s.chase).xz>0&&earthfallChaseFactors(s.chase).xz<.04);assert.equal(render(s).props.length,0);
});
test('damaged version2/3 saves retain their old destruction clock and never replay the new loop',()=>{
 for(const version of[2,3]){const s=normalize({...fresh(),version,id:`source-earthfall:ellery-aside-v${version}`,elapsed:3.7,gag:undefined,chase:undefined});assert.equal(s.chase.phase,'legacy');assert.equal(frame(s).chaseEnabled,false);const next=step(s,{dt:.1}).state;assert.ok(next.elapsed>3.7);assert.equal(next.chase.catches,0);}
});
