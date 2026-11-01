// Explicit DEV-only controls around the actual game, not a replacement radio
// renderer. Buttons stage history; subsequent game input runs normal owners.
export function createRadioContactReview(api) {
  const panel=document.createElement('aside');panel.id='radio-contact-review';
  panel.setAttribute('aria-label','Developer radio review');
  for(const type of ['pointerdown','pointerup','click','keydown','keyup'])panel.addEventListener(type,event=>event.stopPropagation());
  panel.style.cssText='position:fixed;z-index:10000;top:0;left:0;right:0;background:#101710ef;color:#d9dfce;font:12px monospace;padding:5px;display:flex;gap:6px;flex-wrap:wrap;align-items:center';
  const mark=document.createElement('strong');mark.textContent='DEV STAGING · HISTORY UNEARNED';panel.append(mark);
  const report=document.createElement('pre');report.id='radio-review-receipt';report.setAttribute('aria-live','off');
  report.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:10001;background:#080c09ec;color:#cbd5bc;margin:0;padding:5px;font:11px monospace;max-height:92px;overflow:auto;display:none';
  let active=false,expanded=false,last='',busy=false,capture=null;
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='font:inherit;padding:3px 6px';b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();active=true;}catch(e){report.style.display='block';report.textContent=String(e?.stack||e);}finally{busy=false;b.disabled=false;document.getElementById('map')?.focus();}};panel.append(b);return b;};
  for(const[mode,label]of[['stand','Stage B3'],['request','Radio hub'],['initial','Initial call'],['breakdown','Full failure'],['hush','HUSH failure'],['dead','Dead inspection']])button(label,()=>api.stage(mode));
  const toggle=(label,fn)=>{const l=document.createElement('label'),box=document.createElement('input');box.type='checkbox';box.onchange=()=>{fn(box.checked);document.getElementById('map')?.focus();};l.append(box,document.createTextNode(label));panel.append(l);};
  toggle('Skip initial 4-min scare delay (fixture)',api.quiet);toggle('Recording protection',api.recording);toggle('Reduced motion',api.reduceMotion);
  button('Reset discovery (fixture)',api.resetDiscovery);button('Receipts',()=>{expanded=!expanded;report.style.display=expanded?'block':'none';});
  const download=(name,type,body)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([body],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
  const observations=[];
  const captureButton=button('Start output capture',()=>{
    if(capture){capture.recorder.stop();capture=null;captureButton.textContent='Start output capture';return;}
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),host=document.getElementById('wrap'),rect=host.getBoundingClientRect();
    canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);
    const audio=api.captureAudio?.(),stream=new MediaStream([...canvas.captureStream(15).getVideoTracks(),...(audio?.stream.getAudioTracks()||[])]);
    const mimeType=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:2500000}),chunks=[];
    const state={recorder,live:true,last:0,startedAt:performance.now(),startedAudioTime:audio?.clock?.(),clocks:[]};capture=state;
    const draw=now=>{if(!state.live)return;if(now-state.last>=1000/15){state.last=now;ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
      const layers=[...host.querySelectorAll('canvas')].filter(layer=>{const s=getComputedStyle(layer),r=layer.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0&&r.width>0&&r.height>0;}).sort((a,b)=>(parseFloat(getComputedStyle(a).zIndex)||0)-(parseFloat(getComputedStyle(b).zIndex)||0));
      for(const layer of layers){const r=layer.getBoundingClientRect();ctx.globalAlpha=Number(getComputedStyle(layer).opacity||1);ctx.drawImage(layer,r.left-rect.left,r.top-rect.top,r.width,r.height);}ctx.globalAlpha=1;
      ctx.fillStyle='#132014';ctx.fillRect(0,0,canvas.width,22);ctx.fillStyle='#dce2cf';ctx.font='12px monospace';ctx.fillText('DEVELOPER STAGED · ACTUAL GAME OUTPUT · HISTORY UNEARNED',8,15);
      state.clocks.push({wallSeconds:(now-state.startedAt)/1000,audioSeconds:audio?.clock?.()-state.startedAudioTime});
    }requestAnimationFrame(draw);};requestAnimationFrame(draw);
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{state.live=false;stream.getTracks().forEach(track=>track.stop());audio?.dispose?.();observations.push({captureClock:{startedAt:state.startedAt,startedAudioTime:state.startedAudioTime,clocks:state.clocks}});download('radio-game-output.webm',mimeType,new Blob(chunks,{type:mimeType}));};
    recorder.start(250);captureButton.textContent='Stop output capture';
  });
  button('Save receipt',()=>download('radio-game-receipt.json','application/json',JSON.stringify({fixture:true,observations},null,2)));
  document.body.append(panel,report);
  const interval=setInterval(async()=>{if(!active)return;const value=api.inspect();const {radio,settings,layout,world,...small}=value;
    const {radioContact3DDiagnostics}=await import('../render/radio-contact-3d.js');
    const model=radioContact3DDiagnostics();const row={at:performance.now(),...small,
      radio:{phase:radio.phase,transmissions:radio.transmissions},layout,world,model};
    const digest=JSON.stringify({scene:value.scene,radio:value.view,heard:value.heard,modelReady:model.ready,error:model.error});
    if(digest!==last){observations.push(row);last=digest;if(observations.length>2000)observations.shift();}
    if(expanded)report.textContent=JSON.stringify({...small,radio:{phase:radio.phase,transmissions:radio.transmissions},picking:Object.fromEntries(Object.entries(layout?.controls||{}).map(([id,r])=>[id,{x:Math.round(r.center.x/value.viewport.cols*value.uiRect.width),y:Math.round(r.center.y/value.viewport.rows*value.uiRect.height)}])),model:{ready:model.ready,error:model.error,display:model.display}},null,0);
    panel.dataset.ready=String(model.ready);panel.dataset.scene=value.scene||'';
  },250);
  window.addEventListener('pagehide',()=>{clearInterval(interval);if(capture?.recorder.state==='recording')capture.recorder.stop();},{once:true});
  return {panel,report};
}
