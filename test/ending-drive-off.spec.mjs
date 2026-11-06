import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENDING_DRIVE_OFF as C,createEndingDriveOff,endingDriveOffOwed} from '../src/game/ending-drive-off.js';
import {DRIVE_TEASER_BREAK} from '../src/game/source-drive/teaser-scene.js';
import {openingRoadSurfaceAt} from '../src/game/source-drive/opening-road.js';

const run=(off,{seconds=200,each=()=>{}}={})=>{const seen=[];for(let t=0;t<seconds&&!off.view().done;t+=.05){const v=off.update(.05);if(seen.at(-1)!==v.phase)seen.push(v.phase);each(off.snapshot());}return seen;};
const narrative=name=>JSON.parse(readFileSync(new URL(`../content/narrative/ending.epilogue.${name}.story.json`,import.meta.url),'utf8')).nodes.start.lines;

test('every ending drives off, the terminal ones included',()=>{
  for(const id of['inversion','drugged','surfaced','tower-won','sacrifice','helped','contact-won','contact-lost','tower-lost'])assert.equal(endingDriveOffOwed(id),true,id);
  assert.equal(endingDriveOffOwed('not-an-ending'),false);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.doesNotMatch(main.slice(main.indexOf('openEndingCredits=(summary,options={})=>{'),main.indexOf('// Only a New Run owes the film.')),/sourceRestBlack/,'the bench is not excused');
});

test('left alone it finishes by itself: first person, then third, then black',()=>{
  const off=createEndingDriveOff();
  assert.deepEqual(run(off),['engine','road','release','away','hold','done']);
  assert.equal(off.view().done,true);assert.equal(off.view().cover,1);
  assert.ok(off.view().time<C.engineSeconds+C.roadLimit+C.releaseSeconds+C.awaySeconds+C.holdSeconds+1,'it cannot run on');
});

test('it can never reach the cliff, and nobody steering stays on the road',()=>{
  const off=createEndingDriveOff();let furthest=-Infinity,widest=0;
  run(off,{each:s=>{furthest=Math.max(furthest,s.distance);if(s.phase==='road')widest=Math.max(widest,Math.abs(openingRoadSurfaceAt(off.drive.x,off.drive.z).offset));}});
  assert.ok(furthest<DRIVE_TEASER_BREAK.from-100,`reached d${furthest}`);
  assert.ok(widest<3,`wandered ${widest}m`);
});

test('holding only the throttle cannot end on a guardrail',()=>{
  const off=createEndingDriveOff();let slowest=Infinity,widest=0;
  while(off.view().phase!=='road')off.update(.05);
  off.input('forward');
  while(off.view().phase==='road'){off.update(.05);if(off.view().phase==='road'){slowest=Math.min(slowest,off.drive.speed);widest=Math.max(widest,Math.abs(openingRoadSurfaceAt(off.drive.x,off.drive.z).offset));}}
  assert.ok(slowest>8,`it stalled at ${slowest}`);assert.ok(widest<3,`wandered ${widest}m`);
  assert.ok(off.view().time<60,'and it gets there');
});

test('steering is the player\'s: the assist lets go while a hand is on the wheel',()=>{
  const off=createEndingDriveOff();
  while(off.view().phase!=='road')off.update(.05);
  const before=openingRoadSurfaceAt(off.drive.x,off.drive.z).offset;
  off.input('forward');off.input('right');for(let t=0;t<1.2;t+=.05)off.update(.05);
  assert.ok(openingRoadSurfaceAt(off.drive.x,off.drive.z).offset>before+.5,'the van goes where it is pointed');
});

test('the player really drives: input is live on the road and nowhere else',()=>{
  const off=createEndingDriveOff();
  assert.equal(off.input('forward'),false,'not while the picture is black');
  while(off.view().phase!=='road')off.update(.05);
  assert.equal(off.input('forward'),true);assert.equal(off.view().controlsEnabled,true);
  const start=off.drive.speed;for(let t=0;t<2;t+=.05)off.update(.05);
  assert.ok(off.drive.speed>start,'the throttle does something');
  off.input('forward',false);off.input('brake');for(let t=0;t<2;t+=.05)off.update(.05);
  assert.ok(off.drive.speed<start+3,'so does the brake');
  assert.equal(off.input('honk'),false);
});

test('letting go hands the wheel to the road, and taking it back works',()=>{
  const off=createEndingDriveOff();
  while(off.view().phase!=='road')off.update(.05);
  assert.equal(off.view().carried,false);
  for(let t=0;t<C.handsOffSeconds+.5;t+=.05)off.update(.05);
  assert.equal(off.view().carried,true);
  off.input('left');off.update(.05);assert.equal(off.view().carried,false);
});

test('the world goes with distance, and reversing does not bring it back',()=>{
  const off=createEndingDriveOff();let gone=0;
  run(off,{each:s=>{assert.ok(s.gone+1e-9>=gone,'it never returns');gone=s.gone;}});
  assert.equal(gone,1);
  const back=createEndingDriveOff();
  while(back.view().reach<C.goneFrom+120)back.update(.05);
  const then=back.view().gone;assert.ok(then>0);
  back.input('reverse');back.input('brake');for(let t=0;t<4;t+=.05){back.input('reverse');back.update(.05);}
  assert.ok(back.view().gone>=then);
});

test('dawdling cannot hold it open',()=>{
  const off=createEndingDriveOff();
  while(off.view().phase!=='road')off.update(.05);
  // Sitting on the brake with a hand on the wheel never lets the road end by distance.
  for(let t=0;t<C.roadLimit+1;t+=.05){off.input('brake');off.update(.05);}
  assert.notEqual(off.view().phase,'road');
  assert.equal(off.view().gone,1);
});

test('the camera leaves only after the road, and reduced motion cuts',()=>{
  const off=createEndingDriveOff();const seen=[];
  run(off,{each:s=>seen.push([s.phase,s.dolly])});
  assert.equal(seen.filter(([p,d])=>p==='road'&&d>0).length,0);
  assert.ok(seen.some(([p,d])=>p==='release'&&d>0&&d<1),'a real move');
  const reduced=createEndingDriveOff({reducedMotion:true});const steps=new Set();
  run(reduced,{each:s=>steps.add(s.dolly)});
  assert.deepEqual([...steps].sort(),[0,1]);
});

test('holding to skip goes to black, and a tap does not',()=>{
  const off=createEndingDriveOff();
  while(off.view().phase!=='road')off.update(.05);
  off.update(.5,{skipHeld:true});off.update(.05,{skipHeld:false});
  assert.equal(off.view().skipping,false);
  for(let t=0;t<C.skipSeconds+.1;t+=.05)off.update(.05,{skipHeld:true});
  assert.equal(off.view().skipping,true);
  for(let t=0;t<C.skipCoverSeconds+.2;t+=.05)off.update(.05);
  assert.equal(off.view().done,true);assert.equal(off.view().cover,1);
});

test('pausing stops everything',()=>{
  const off=createEndingDriveOff();
  while(off.view().phase!=='road')off.update(.05);
  const before=off.snapshot();off.update(5,{held:true});
  assert.equal(off.snapshot().time,before.time);assert.equal(off.snapshot().distance,before.distance);
});

test('the clean codas hand over to the van, and keep what they had',()=>{
  const last=name=>narrative(name).at(-1).text,all=name=>narrative(name).map(row=>row.text).join('\n');
  assert.match(last('out'),/The van is where you left it/);
  assert.match(all('out'),/a ruled column with one name in it/);
  assert.equal(narrative('drugged').filter(row=>/you drive home into the light\.$/.test(row.text)).length,2);
  assert.match(all('surfaced'),/Nobody in it\./);assert.match(last('surfaced'),/you find the two of you have started walking/);
  const tower=narrative('tower-won');
  assert.ok(tower.findIndex(row=>/one vehicle, white/.test(row.text))<tower.findIndex(row=>/^Later, somebody adds/.test(row.text)));
  assert.match(tower.at(-1).text,/RECORDING RETAINED/,'the recording beat stays last');
});

test('the warning covers every reading and shuts none',async()=>{
  const {TOWER_WARNING}=await import('../src/data/tower-warning.js');
  assert.deepEqual(TOWER_WARNING.lines.map(row=>row.text),["There is no job. Don't take it.",'Whatever they told you, it is not an empty building.',"You can still get out. Take it, and you'll stop trying."]);
  assert.ok(!TOWER_WARNING.lines.some(row=>/won't make it/i.test(row.text)),'a voice may doubt the clean run, not close it');
});

test('wiring: wrapped at the one door to the credits, with the original untouched',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/const realOpenEndingCredits=openEndingCredits;\nopenEndingCredits=/);
  assert.match(main,/endingDriveOffOwed\(summary\?\.endingId\)/);
  const original=main.slice(main.indexOf('function openEndingCredits('),main.indexOf('\nasync function revealFieldReturn('));
  assert.ok(original.length>200&&!/DriveOff|driveOff/.test(original),'the real function does not know about it');
  assert.ok(!/saveCommit/.test(main.slice(main.indexOf('function beginEndingDriveOff('),main.indexOf('const realOpenEndingCredits=openEndingCredits;'))),'it saves nothing');
});
