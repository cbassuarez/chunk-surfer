// Explicit fixture setup, then the production controller, glass and mixer.
// Captures have no audio tracks and local output must be disconnected.
export function createPubPressureReview(api){
  const panel=document.createElement('aside');panel.setAttribute('aria-label','Lyric pressure review');
  panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;padding:9px;background:#17201de8;color:#e8dec8;font:12px system-ui;display:flex;gap:12px;align-items:center';
  const label=document.createElement('span');label.textContent='DEV · settled water fixture · production pressure';panel.append(label);
  const output=document.createElement('output');panel.append(output);
  for(const type of['click','pointerdown','pointerup','keydown','keyup'])panel.addEventListener(type,e=>e.stopPropagation());
  let capture=null,busy=false;const errors=[];
  addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
  const post=async(name,blob)=>{const response=await fetch('/__lyric-pressure/'+name,{method:'POST',body:blob});if(!response.ok)throw Error(await response.text());};
  function draw(canvas){
    const host=document.getElementById('wrap'),box=host.getBoundingClientRect();canvas.width=Math.round(box.width);canvas.height=Math.round(box.height);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    for(const layer of [...host.querySelectorAll('canvas')].filter(c=>getComputedStyle(c).display!=='none').sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0))){
      const b=layer.getBoundingClientRect();if(!b.width||!b.height)continue;ctx.globalAlpha=Number(getComputedStyle(layer).opacity||1);ctx.drawImage(layer,b.left-box.left,b.top-box.top,b.width,b.height);
    }ctx.globalAlpha=1;
  }
  async function start(){
    if(capture||busy)return;busy=true;errors.length=0;
    try{
      const manifest=await fetch('/__lyric-pressure/manifest').then(r=>r.json());
      if(!await api.stage())throw Error('Could not stage the real Lyric table.');
      if(!api.inspect().silentOutput)throw Error('Silent output is required.');
      const canvas=document.createElement('canvas');draw(canvas);const stream=canvas.captureStream(30);
      const mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6000000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const r={canvas,stream,recorder,chunks,manifest,start:performance.now(),traces:[],lastSample:0,stills:new Set(),doneAt:null};
      r.ended=new Promise(resolve=>recorder.onstop=resolve);capture=r;recorder.start(250);output.textContent='Observing';
    }catch(e){output.textContent=String(e?.stack||e);}finally{busy=false;document.getElementById('map')?.focus();}
  }
  async function finish(){
    if(!capture)return;const r=capture;capture=null;r.recorder.stop();await r.ended;r.stream.getTracks().forEach(t=>t.stop());
    const name='lyric-pressure-'+Date.now();await post(name+'.webm',new Blob(r.chunks,{type:r.recorder.mimeType}));
    await post(name+'.json',new Blob([JSON.stringify({fixture:true,earnedProgression:false,
      scope:'Developer stage/served-water flags; actual production eligibility, clock, glass matrices, spatial note dispatch and acquisition. Silent video/output; no listening, human recognition or full-route acceptance.',
      elapsed:(performance.now()-r.start)/1000,sourceManifest:r.manifest,errors,traces:r.traces},null,2)],{type:'application/json'}));
    output.textContent='Saved '+name;
  }
  const button=document.createElement('button');button.textContent='Observe pressure';button.onclick=()=>void start();panel.append(button);
  function tick(){
    const r=capture;if(r){
      const seconds=(performance.now()-r.start)/1000;draw(r.canvas);
      const state=api.inspect();if(performance.now()-r.lastSample>30){r.lastSample=performance.now();r.traces.push({seconds,...state});output.textContent=seconds.toFixed(1)+'s · '+state.pressure.phase;}
      const key=state.pressure.amount>.6?'tremor':state.pressure.audio?.active?'note':seconds<.5?'before':null;
      if(key&&!r.stills.has(key)){r.stills.add(key);r.canvas.toBlob(blob=>void post('lyric-pressure-'+key+'.png',blob),'image/png');}
      // Observe the production clock through completion even when native
      // rendering is slower than wall time. Never advance gameplay to obtain
      // a capture; the bounded timeout remains an explicit failed observation.
      if(state.pressure.consumed&&!state.pressure.active&&!state.pressure.audio?.active)r.doneAt??=seconds;
      if(seconds>=50||(seconds>=7&&r.doneAt!==null&&seconds-r.doneAt>=1))void finish();
    }requestAnimationFrame(tick);
  }
  document.body.append(panel);requestAnimationFrame(tick);
}
