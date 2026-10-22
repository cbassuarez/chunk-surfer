// Declared main-game placements; ordinary controls and the shared audio/tape
// thereafter. This is a bounded rendering/operation check, never a player test.
import{filmEvolution}from'./evolution-film.mjs';
import{join}from'node:path';import{writeFile}from'node:fs/promises';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function inspectEvolution({page,report,out,check}){
 const evidence=report.evolution={scope:'Actual main-game scene, declared placements, ordinary controls, shared recorder and final acquisition; no unbriefed-player or complete-chapter claim.',views:[],inputs:[]};
 async function fixture({name,distance,furthest=distance,time=38,yaw=0,pitch=-.10,station='service',radioOn=true,headingOffset=0,lateral=-1.35,weatherOverride=null}){
  await page.evaluate(async q=>{const cp=__probe.sourceDrive.checkpoint(),D=await import('/src/game/source-drive/drive-state.js'),W=await import('/src/game/source-drive/weather.js'),R=await import('/src/game/source-drive/road.js'),E=await import('/src/game/source-drive/evolution.js');
   const p=R.worldAt(q.distance,q.lateral),r=R.roadAt(q.distance);cp.drive=D.createDrive();Object.assign(cp.drive,{x:p.x,z:p.z,heading:r.heading+q.headingOffset,roadHeight:r.height,roadOffset:q.lateral,furthest:q.furthest,programTime:q.time,phase:q.furthest<288?0:q.furthest<516?1:q.furthest<768?2:q.furthest<1056?3:4,brakeHold:true,brakeAmount:1,station:q.station,radioOn:q.radioOn});
   cp.weather=W.createDriveWeather({initialWetness:.5});const weather=E.driveEvolutionFrame(cp.drive).weather;for(let i=0;i<180;i++)W.stepDriveWeather(cp.weather,{dt:1/120,timeSec:q.time,...weather,wipers:true});cp.weather.timeSec=q.time;
   if(q.weatherOverride){Object.assign(cp.weather,q.weatherOverride);if(q.weatherOverride.zeroFilm)cp.weather.grid.fill(0);}
   cp.settings={headlights:true,wipers:true};cp.look={yaw:q.yaw,pitch:q.pitch};cp.started=true;cp.status='active';await __probe.sourceDrive.fixture(cp);
  },{distance,furthest,time,yaw,pitch,station,radioOn,headingOffset,lateral,weatherOverride});
  await page.waitForFunction(()=>__probe.sourceDrive.state()?.initialized,{timeout:60000});await wait(120);
  const metadata=await page.evaluate(()=>({state:__probe.sourceDrive.state(),frame:__probe.sourceDrive.frame(),shader:__chunkSurferPixelMesh.status(),sound:__probe.sourceDrive.sound()}));
  evidence.views.push({name,fixture:{distance,furthest,time,yaw,pitch,station,radioOn,headingOffset,lateral,weatherOverride},metadata});return metadata;
 }
 async function liveShot(q){await fixture(q);await page.keyboard.press('Enter');await wait(400);await page.screenshot({path:join(out,q.name+'.png')});return page.evaluate(()=>({state:__probe.sourceDrive.state(),frame:__probe.sourceDrive.frame(),shader:__chunkSurferPixelMesh.status(),sound:__probe.sourceDrive.sound()}));}
 const weather=await liveShot({name:'weather-road',distance:360,time:35,pitch:.03});
 check('storm is submitted at the actual elevated road with running wind, clouds, glass and blades',weather.frame.weather.rain>.5&&weather.frame.weather.cloud>.7&&weather.frame.weather.wind[0]>1&&weather.frame.weather.wiperMoving&&weather.shader.shaderReady&&!weather.shader.lastGlError,{height:weather.state.state.roadHeight,weather:weather.frame.weather});
 await liveShot({name:'cabin-dashboard',distance:360,time:35,pitch:-.30});
 await liveShot({name:'cabin-passenger',distance:360,time:35,yaw:-1.4,pitch:-.45});
 await liveShot({name:'cabin-door',distance:360,time:35,yaw:1.4,pitch:-.45});
 const wave=await liveShot({name:'held-wave',distance:650,time:42,yaw:-.35,pitch:.16});
 check('held ocean uses the actual deformed water, foam and spray meshes',wave.frame.assetMeshes.includes('cut_wave_surface')&&wave.frame.assetMeshes.includes('cut_wave_foam')&&wave.frame.assetMeshes.includes('cut_wave_spindrift'),wave.frame.cut.landscape.wave);
 const thorax=await liveShot({name:'ribcage-ahead',distance:800,time:70,pitch:.12});
 check('the driven carriageway passes through real bilateral bone, sternum and tissue',thorax.frame.assetMeshes.includes('cut_thoracic_bone')&&thorax.frame.assetMeshes.includes('cut_sternum')&&thorax.frame.assetMeshes.includes('cut_intercostal_sheet'),{chambers:thorax.frame.cut.landscape.thoraxChambers,props:thorax.frame.propCount});
 if(process.env.SOURCE_DRIVE_CONTINUITY_FILM){
  const first=await liveShot({name:'first-strakes',distance:605,time:24,pitch:.06});
  const link=await liveShot({name:'water-to-bone',distance:715,time:29,pitch:.08});
  check('approach carries actual water, bone strakes and torn transition sheets before the first vault',first.frame.assetMeshes.includes('cut_wave_strakes')&&link.frame.assetMeshes.includes('cut_littoral_rib')&&link.frame.assetMeshes.includes('cut_littoral_water')&&link.frame.assetMeshes.includes('cut_littoral_tissue'),{first:first.frame.cut.landscape,link:link.frame.cut.landscape});
  const physical=link.sound.exterior;
  check('the visible landscape has actual positioned sources and the same numeric load on the cabin bus',link.frame.cut.nearest.some(x=>x.kind==='water')&&link.frame.cut.nearest.some(x=>x.kind==='anatomy')&&physical&&Math.abs(physical.pressure-link.frame.evolution.load.value)<.02,{nearest:link.frame.cut.nearest,exterior:physical});
 }
 await liveShot({name:'after-image',distance:1050,time:103,pitch:.02});
 const returning=await liveShot({name:'returning-thorax',distance:700,furthest:920,time:105,yaw:0,pitch:.1,headingOffset:Math.PI});
 await page.keyboard.down('w');await wait(1300);await page.keyboard.up('w');await page.keyboard.down(' ');await wait(800);await page.keyboard.up(' ');
 const returned=await page.evaluate(()=>({state:__probe.sourceDrive.state().state,frame:__probe.sourceDrive.frame()}));
 check('turning around and driving back does not restore ordinary water or anatomy',returned.state.furthest===920&&returned.frame.evolution.ribcage===1&&returned.frame.evolution.wave===1&&returned.state.journey.returnMetres>0,{furthest:returned.state.furthest,position:-returned.state.z,returnMetres:returned.state.journey.returnMetres,evolution:returned.frame.evolution});
 const heldBefore=await page.evaluate(()=>({state:__probe.sourceDrive.state().state,frame:__probe.sourceDrive.frame()}));await wait(2200);const heldAfter=await page.evaluate(()=>({state:__probe.sourceDrive.state().state,frame:__probe.sourceDrive.frame()}));
 check('declining to continue retains the exact chosen stop while storm and programme clocks run',heldBefore.state.x===heldAfter.state.x&&heldBefore.state.z===heldAfter.state.z&&heldAfter.state.programTime>heldBefore.state.programTime+1&&!heldAfter.state.arrived&&!heldAfter.state.finished,{driftM:Math.hypot(heldAfter.state.x-heldBefore.state.x,heldAfter.state.z-heldBefore.state.z),programmeSeconds:heldAfter.state.programTime-heldBefore.state.programTime});
 // All stations join the same current clock, via the actual hand/control owner.
 await fixture({name:'radio-operation',distance:850,time:2,pitch:-.28});await page.keyboard.press('Enter');
 const stationRows=[];for(const [key,id]of[['1','service'],['2','company'],['3','music']]){await page.keyboard.press(key);await page.waitForFunction(id=>__probe.sourceDrive.state().state.station===id,{timeout:6000},id);await wait(650);stationRows.push(await page.evaluate(()=>({station:__probe.sourceDrive.state().state.station,frame:__probe.sourceDrive.frame().radio,sound:__probe.sourceDrive.sound()})));}
 check('all three actual presets select distinct running programmes with decoded scratch voices',stationRows.every((r,i)=>r.station===['service','company','music'][i]&&r.frame.audible)&&stationRows.every(r=>r.sound.temporaryVoiceClips===9),stationRows.map(r=>({station:r.station,frame:r.frame,sound:r.sound})));
 await page.keyboard.press('o');await page.waitForFunction(()=>__probe.sourceDrive.state().state.radioOn===false,{timeout:6000});await wait(250);const off=await page.evaluate(()=>({frame:__probe.sourceDrive.frame().radio,sound:__probe.sourceDrive.sound()}));check('radio OFF removes current captions while cabin weather continues',!off.frame.audible&&!off.frame.caption&&off.sound.weather?.rain>0,off);
 check('expanded world keeps the final acquisition healthy',await page.evaluate(()=>{const x=__chunkSurferPixelMesh.status();return x.shaderReady&&!x.lastGlError&&!x.lastError&&x.settings.debugSource==='final';}),await page.evaluate(()=>__chunkSurferPixelMesh.status()));
 evidence.stationRows=stationRows;evidence.off=off;
 if(process.env.SOURCE_DRIVE_EVOLUTION_FILM)await filmEvolution({page,out,fixture,check,evidence});
 await writeFile(join(out,'evolution-views.json'),JSON.stringify(evidence,null,2));
}
