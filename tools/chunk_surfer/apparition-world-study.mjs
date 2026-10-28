// Visible, disclosed current-world fixtures. No direct browser automation.
export function installApparitionWorldStudy({probe,prepare,audio,scene}){
 const panel=document.createElement('aside');panel.dataset.noPointerLock='';
 panel.style.cssText='position:fixed;right:8px;top:8px;z-index:100010;padding:8px;background:#0c1416ee;color:#dddcc6;font:12px monospace;max-width:320px';
 const status=document.createElement('output');status.style.cssText='display:block;white-space:pre-wrap;margin-top:8px';let kind='none',recording=false;
 const button=(label,action)=>{const b=document.createElement('button');b.textContent=label;b.style.cssText='padding:6px;margin:2px';b.onclick=async event=>{event.stopPropagation();try{await action();}catch(error){status.textContent=String(error);}document.getElementById('map')?.focus();};panel.append(b);};
 button('World: Dream Figure',async()=>{await prepare();const p=probe();if(!await p.godWarpGetIn())throw Error('Get-in authored camera unavailable');p.tutSkip();p.setFlag('combat.trained',false);p.setTorch(true);p.dreamFigureFreeze(true);const result=p.dreamFigureStart();kind='dream';status.textContent=JSON.stringify(result,null,1);});
 button('Release dream approach',()=>{probe().dreamFigureFreeze(false);status.textContent='Actual approach released. Torch decides contact outcome.';});
 button('World: Hall shadows',async()=>{await prepare();const p=probe();if(!await p.godWarpHook('concert-hall'))throw Error('Hall authored camera unavailable');p.tutSkip();p.setPower('sp02',true);p.setPower('sp03',true);p.apparitionEffects('full');p.setReduceDread(false);p.setTorch(false);p.apparitionCaptureLight(null);p.apparitionReset('apparition-battle-study');kind='hall';status.textContent='Hall world staged. Aim after the practical submits its bodies.';});
 button('Aim at submitted body',()=>{const p=probe(),d=p.apparitions(),at=Math.max(0,d.bodies?.findIndex(body=>body.index===1)??0);const yaw=Number(d.bearings?.[at]),pitch=Number(d.pitches?.[at]);if(!Number.isFinite(yaw))throw Error('No submitted body yet');p.apparitionCaptureLight(p.apparitionGate()?.submitted?.lightId||null);p.lookAtWorld(yaw,Number.isFinite(pitch)?pitch:-.05);status.textContent='Current body, current world camera. Practical pinned for inspection.';});
 button('Save world receipt',async()=>{const p=probe(),name='app-world-'+kind+'-'+Date.now()+'.json';const body={kind,qualification:'Developer-staged current world, production geometry/lighting/input thereafter; not earned chapter arrival.',dream:p.dreamFigure(),gate:p.apparitionGate(),apparitions:p.apparitions(),props:p.props(),light:p.light()};const r=await fetch('/__apparition-study/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body,null,2)});if(!r.ok)throw Error('Receipt '+r.status);status.textContent='Saved '+name;});
 button('Record 16s + release dream',async()=>{
  if(recording)return;const a=typeof audio==='function'?audio():null;if(!a?.ctx||!a.output)throw Error('World audio is not ready; stage the world again.');recording=true;await a.ctx.resume();
  const map=document.getElementById('map'),copy=document.createElement('canvas');copy.width=960;copy.height=Math.round(map.clientHeight/map.clientWidth*960);const ctx=copy.getContext('2d');
  const stream=copy.captureStream(15),sink=a.ctx.createMediaStreamDestination();a.output.connect(sink);for(const t of sink.stream.getAudioTracks())stream.addTrack(t);
  const chunks=[],frames=[],started=performance.now(),name='app-world-approach-'+Date.now();let raf;
  const tick=()=>{ctx.fillStyle='#000';ctx.fillRect(0,0,copy.width,copy.height);const box=map.getBoundingClientRect();
   for(const c of [...map.querySelectorAll('canvas')].filter(c=>c.width&&c.height&&getComputedStyle(c).display!=='none').sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0))){const b=c.getBoundingClientRect();try{ctx.drawImage(c,(b.left-box.left)/box.width*copy.width,(b.top-box.top)/box.height*copy.height,b.width/box.width*copy.width,b.height/box.height*copy.height);}catch{}}
   if(!frames.length||performance.now()-started-frames.at(-1).at>100)frames.push({at:performance.now()-started,scene:scene(),dream:probe().dreamFigure()});raf=requestAnimationFrame(tick);
  };
  const rec=new MediaRecorder(stream,{mimeType:'video/webm',videoBitsPerSecond:1800000});rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  rec.onstop=async()=>{cancelAnimationFrame(raf);a.output.disconnect(sink);stream.getTracks().forEach(t=>t.stop());recording=false;
   await fetch('/__apparition-study/'+name+'.webm',{method:'POST',body:new Blob(chunks,{type:'video/webm'})});await fetch('/__apparition-study/'+name+'.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qualification:'Declared current-world starting fixture; real scene time/geometry/final dither/mixed audio thereafter. Canvas capture overhead included, not native or earned arrival proof.',seconds:(performance.now()-started)/1000,frames},null,2)});status.textContent='Saved '+name;
  };rec.start(1000);tick();probe().dreamFigureFreeze(false);setTimeout(()=>rec.stop(),16000);status.textContent='Recording actual approach and handoff…';
 });
 button('Measure 16s without capture',()=>{
  if(recording)throw Error('Wait for the current capture');recording=true;
  const started=performance.now(),frames=[],name='app-world-control-'+Date.now();let raf;
  const tick=()=>{const at=performance.now()-started;if(!frames.length||at-frames.at(-1).at>=100)frames.push({at,scene:scene(),dream:probe().dreamFigure()});raf=requestAnimationFrame(tick);};
  tick();probe().dreamFigureFreeze(false);status.textContent='Measuring without canvas/audio capture…';
  setTimeout(async()=>{cancelAnimationFrame(raf);recording=false;await fetch('/__apparition-study/'+name+'.json',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({qualification:'Declared current-world start; same sampled state without canvas/audio capture. Later shared desktop load may differ; not a native timing proof.',seconds:(performance.now()-started)/1000,frames},null,2)});status.textContent='Saved '+name;},16000);
 });
 button('Hide world controls · F9',()=>{panel.hidden=true;});
 window.addEventListener('keydown',e=>{if(e.key==='F9'){e.preventDefault();panel.hidden=!panel.hidden;}});
 panel.append(status);document.body.append(panel);status.textContent='Actual-world fixtures · local study save may change.';
}
