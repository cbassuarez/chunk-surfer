// Bounded game-owner fixtures followed by ordinary keyboard/mouse controls.
// Called only by the task's disposable-profile production inspection harness.
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function inspectStopping({page,report,out,check}){
 const state=()=>page.evaluate(()=>__probe.sourceDrive.state());
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const waitHeld=()=>page.waitForFunction(()=>__probe.sourceDrive.state()?.state.brakeHold===true,{timeout:15000});
 const fixture=async(distance,lateral=-1.35,{headingOffset=0,lookYaw=0}={})=>{
  await page.evaluate(async({distance,lateral,headingOffset,lookYaw})=>{
   const cp=__probe.sourceDrive.checkpoint(),{worldAt}=await import('/src/game/source-drive/road.js'),{createDrive}=await import('/src/game/source-drive/drive-state.js'),a=worldAt(distance,lateral);
   cp.drive={...createDrive(),x:a.x,z:a.z,furthest:Math.max(distance,0),roadHeight:a.height,roadOffset:lateral,heading:a.heading+headingOffset,programTime:100,phase:distance>768?3:0,brakeHold:false};
   cp.status='active';cp.started=true;cp.look={yaw:lookYaw,pitch:-.06};await __probe.sourceDrive.fixture(cp);
  },{distance,lateral,headingOffset,lookYaw});
  await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:30000});
  report.fixtures.push({kind:'stopping/boundary technical placement',distance,lateral,headingOffset,lookYaw});
  await page.keyboard.press('Enter');
 };
 const brake=async()=>{await page.keyboard.down(' ');try{await waitHeld();}finally{await page.keyboard.up(' ');}return state();};
 report.stopping={scope:'Declared positions, real game session/physics/render/tape, ordinary controls after each placement. No player test or uninterrupted chapter claim.',holds:[],boundaries:[]};
 // A graded stretch exposes the drift that the almost-level pull-in hid.
 await fixture(358);await page.keyboard.down('w');await wait(1300);await page.keyboard.up('w');await brake();
 const before=await state(),beforeRefs=await page.evaluate(()=>__probe.sourceDrive.checkpoint().tape.takeRefs.length);await page.keyboard.press('o');await page.mouse.move(550,350);await page.mouse.down();await page.mouse.move(645,330,{steps:12});await page.mouse.up();
 await page.keyboard.press('r');await page.waitForFunction(()=>__probe.sourceDrive.state()?.tape.recording,{timeout:15000});
 await page.waitForFunction(t=>__probe.sourceDrive.state()?.state.programTime>=t+30,{timeout:90000},before.state.programTime);
 await page.keyboard.press('r');await page.waitForFunction(n=>{const cp=__probe.sourceDrive.checkpoint();return !__probe.sourceDrive.state()?.tape.recording&&cp.tape.takeRefs.length>n&&cp.tape.takeRefs.at(-1)?.durable;},{timeout:15000},beforeRefs);
 const held=await state(),cp=await page.evaluate(()=>__probe.sourceDrive.checkpoint());
 const drift=Math.hypot(held.state.x-before.state.x,held.state.z-before.state.z);
 report.stopping.holds.push({before,after:held,driftM:drift,checkpoint:cp});
 check('Space stop holds its exact slope position while look, radio and recording remain live for30s',held.state.brakeHold&&drift<.001&&held.state.programTime-before.state.programTime>=30&&held.look.yaw>before.look.yaw+.1&&cp.tape.takeRefs.at(-1)?.durable&&cp.tape.takeRefs.at(-1)?.durationSeconds>=29,{driftM:drift,seconds:held.state.programTime-before.state.programTime,look:held.look,take:cp.tape.takeRefs.at(-1)});
 await page.screenshot({path:join(out,'slope-held.png')});
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__probe?.sourceDrive?.resumeSaved&&['lens-calibration','title','opening-credits'].includes(window.__scenes?.top?.()?.id),{timeout:60000});await page.evaluate(()=>__probe.sourceDrive.resumeSaved());await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:30000});
 const restored=await state();report.stopping.holdReload=restored;
 check('reload retains brake support and the chosen exact stopped position',restored.paused&&restored.state.brakeHold&&restored.state.x===held.state.x&&restored.state.z===held.state.z,{before:{x:held.state.x,z:held.state.z},after:{x:restored.state.x,z:restored.state.z},held:restored.state.brakeHold});
 await page.keyboard.press('Enter');await page.keyboard.down('w');await wait(3000);await page.keyboard.up('w');const forward=await state();
 check('forward pedal releases slope brake hold deliberately',!forward.state.brakeHold&&Math.hypot(forward.state.x-restored.state.x,forward.state.z-restored.state.z)>1,{held:forward.state.brakeHold,distanceM:Math.hypot(forward.state.x-restored.state.x,forward.state.z-restored.state.z)});
 const parked=await brake();await page.keyboard.down('s');await wait(3200);await page.keyboard.up('s');const reversed=await state();
 check('reverse pedal releases slope brake hold after the existing gear change',!reversed.state.brakeHold&&reversed.state.speed<-.3&&Math.hypot(reversed.state.x-parked.state.x,reversed.state.z-parked.state.z)>1,{speed:reversed.state.speed,held:reversed.state.brakeHold});
 // Chosen positions in the broad bay: no common target or parked-exit latch.
 for(const [distance,lateral]of[[840,-4.4],[866,-4.4],[880,-1.35]]){
  await fixture(distance,lateral,{lookYaw:.48});await brake();const a=await state();
  await page.waitForFunction(t=>__probe.sourceDrive.state()?.state.programTime>=t+3,{timeout:15000},a.state.programTime);
  const b=await state();check(`chosen ${distance}m stop stays in place without granting or forcing dismount`,b.state.brakeHold&&!b.parked&&Math.hypot(a.state.x-b.state.x,a.state.z-b.state.z)<.001,{distance,lateral,programmeAdvanced:b.state.programTime-a.state.programTime,arrived:b.parked});
  report.stopping.holds.push({distance,lateral,before:a,after:b});await page.screenshot({path:join(out,`bay-${distance}.png`)});
 }
 // Actual collision tests approach the visible end/edge surfaces from inside.
 // Their placements stay separate from the approach film and human acceptance.
 for(const trial of[
  {name:'departure-end',distance:-16,lateral:-1.35,headingOffset:0,key:'s',seconds:8},
  {name:'service-end',distance:1212,lateral:3.0,headingOffset:0,key:'w',seconds:8},
  {name:'left-bay-backing',distance:858,lateral:-2.8,headingOffset:-Math.PI/2,key:'w',seconds:5},
  {name:'right-road-edge',distance:1080,lateral:.5,headingOffset:Math.PI/2,key:'w',seconds:5}
 ]){
  await fixture(trial.distance,trial.lateral,{headingOffset:trial.headingOffset,lookYaw:0});await page.keyboard.down(trial.key);await wait(trial.seconds*1000);await page.keyboard.up(trial.key);
  const after=await state(),contacts=after.state.events.filter(e=>e.type==='vehicle-contact');
  const inside=await page.evaluate(async()=>{const{containsDrivePose}=await import('/src/game/source-drive/route-boundaries.js');return containsDrivePose(__probe.sourceDrive.state().state);});
  report.stopping.boundaries.push({trial,after,contacts,inside});
  check(`${trial.name} is stopped by a visible boundary and stays inside its perimeter`,contacts.some(c=>String(c.id).startsWith('route-'))&&inside,{position:{x:after.state.x,z:after.state.z},lastContact:contacts.at(-1),speed:after.state.speed,inside});
  await page.screenshot({path:join(out,trial.name+'.png')});
 }
 check('stopping and boundary fixtures keep the final shader healthy',await page.evaluate(()=>{const s=__chunkSurferPixelMesh.status();return s.shaderReady&&!s.lastGlError&&!s.lastError;}),await page.evaluate(()=>__chunkSurferPixelMesh.status()));
 await writeFile(join(out,'stopping-summary.json'),JSON.stringify(report.stopping,null,2));
}
