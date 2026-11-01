// Explicit developer staging, followed by the real presentation clock.
// No age, uniform amount, scene time or face intensity is assigned here.
export function createStillnessReview(api){
  const panel=document.createElement('aside');panel.setAttribute('aria-label','Stillness material review');
  panel.style.cssText='position:fixed;top:0;left:0;right:0;z-index:10000;background:#101b22ed;color:#dde7db;padding:8px;font:12px system-ui;display:flex;gap:12px;align-items:center';
  const label=document.createElement('span');label.textContent='DEV · staged location · natural stillness';panel.append(label);
  const output=document.createElement('output');panel.append(output);
  const report=document.createElement('pre');report.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:10001;max-height:160px;overflow:auto;background:#101b22ef;color:#dde7db;font:11px monospace;margin:0;display:none';
  let active=null,busy=false,lastReport=0;const errors=[];
  addEventListener('error',e=>errors.push(e.message));addEventListener('unhandledrejection',e=>errors.push(String(e.reason?.stack||e.reason)));
  for(const type of['click','pointerdown','pointerup','keydown','keyup'])panel.addEventListener(type,e=>e.stopPropagation());
  const post=async(name,blob)=>{const r=await fetch('/__stillness-dread/'+name,{method:'POST',body:blob});if(!r.ok)throw Error(await r.text());};
  function composite(canvas){
    const host=document.getElementById('wrap'),rect=host.getBoundingClientRect();canvas.width=Math.round(rect.width);canvas.height=Math.round(rect.height);
    const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
    const layers=[...host.querySelectorAll('canvas')].filter(c=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return r.width&&r.height&&s.display!=='none'&&s.visibility!=='hidden';}).sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
    for(const c of layers){const r=c.getBoundingClientRect();ctx.globalAlpha=Number(getComputedStyle(c).opacity||1);ctx.drawImage(c,r.left-rect.left,r.top-rect.top,r.width,r.height);}ctx.globalAlpha=1;
  }
  async function start(kind){
    if(busy||active)return;busy=true;errors.length=0;
    try{
      const manifest=await fetch('/__stillness-dread/manifest').then(r=>{if(!r.ok)throw Error('Review provenance unavailable.');return r.json();});
      if(await api.stage(kind)===false)throw Error('The requested review location could not be staged.');
      if(!api.inspect().silentOutput)throw Error('Silent local output is required for this review.');
      const canvas=document.createElement('canvas');composite(canvas);
      const stream=canvas.captureStream(24),mimeType=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
      const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5000000}),chunks=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const r={kind,canvas,stream,recorder,chunks,manifest,start:performance.now(),traces:[],lastSample:0,stills:new Set(),lastMove:false};
      r.ended=new Promise(resolve=>recorder.onstop=resolve);active=r;recorder.start(250);output.textContent='Observing '+kind;
    }catch(e){output.textContent=String(e?.stack||e);}finally{busy=false;document.getElementById('map')?.focus();}
  }
  async function stop(){
    if(!active)return;const r=active;active=null;api.release();r.recorder.stop();await r.ended;r.stream.getTracks().forEach(t=>t.stop());
    const name='stillness-'+r.kind+'-'+Date.now();await post(name+'.webm',new Blob(r.chunks,{type:r.recorder.mimeType}));
    await post(name+'.json',new Blob([JSON.stringify({kind:'actual-game-stillness-material-review',fixture:true,
      disclosure:'Developer location staging; real stillness clock and render afterward. No face intensity/time writes. Ordinary wall includes scripted look changes and an actual movement/release at the end. Video is silent; device output disconnected. Not native-package or unfamiliar-player acceptance.',
      elapsed:(performance.now()-r.start)/1000,case:r.kind,sourceManifest:r.manifest,errors,traces:r.traces},null,2)],{type:'application/json'}));
    panel.dataset.saved=name;output.textContent='Saved '+name;
  }
  for(const[k,text]of[['wall','Observe wall (28s)'],['ii','Observe Source II (14s)'],['iii','Observe Source III (14s)']]){
    const b=document.createElement('button');b.textContent=text;b.onclick=()=>void start(k);panel.append(b);
  }
  const stopButton=document.createElement('button');stopButton.textContent='Stop and save';stopButton.onclick=()=>void stop();panel.append(stopButton);
  const inspect=document.createElement('button');inspect.textContent='Inspect material path';inspect.onclick=()=>{report.style.display=report.style.display==='none'?'block':'none';};panel.append(inspect);
  if(new URLSearchParams(location.search).has('stillnessFieldReview')){
    const probe=document.createElement('button');probe.textContent='Save receiving-surface field';probe.onclick=()=>{
      const c=api.capture('props');if(c)c.toBlob(blob=>void post('stillness-field-probe.png',blob),'image/png');
    };panel.append(probe);
  }
  function tick(){
    const now=performance.now();
    if(report.style.display!=='none'&&now-lastReport>500){
      lastReport=now;
      const s=api.inspect(),p=s.props;
      report.textContent=JSON.stringify({clock:s.controller,driver:p?{ready:p.ready,state:p.state,anchor:p.anchor,shader:p.shader,
        eligible:p.meshes.filter(m=>m.eligible).map(m=>m.name),sample:p.meshes.slice(0,3)}:null},null,2);
    }
    const r=active;if(r){
      const seconds=(now-r.start)/1000;composite(r.canvas);
      if(now-r.lastSample>100){r.lastSample=now;const s=api.inspect();r.traces.push({seconds,...s});output.textContent=r.kind+' · '+seconds.toFixed(1)+'s · '+s.controller.amount.toFixed(2);}
      const mark=(r.kind==='wall'?[.5,8,17,23,23.7,24.4,25.2,25.5]:[1.1,7,12]).find(t=>seconds>=t&&!r.stills.has(t));
      if(mark!==undefined){r.stills.add(mark);void new Promise(resolve=>r.canvas.toBlob(resolve,'image/png')).then(blob=>post('stillness-'+r.kind+'-'+mark+'.png',blob));
        if(mark===(r.kind==='wall'?23:12))for(const stage of['props','scene','mark-alpha']){
          const c=api.capture(stage);if(c)c.toBlob(blob=>void post('stillness-'+r.kind+'-'+stage+'.png',blob),'image/png');
        }
      }
      if(r.kind==='wall'){
        const desiredLook=seconds<23.3?0:seconds<24?.12:seconds<24.8?-.12:0;
        if(r.lastLook!==desiredLook){r.lastLook=desiredLook;api.look?.(desiredLook);}
        if(seconds>25&&!r.lastMove){r.lastMove=true;api.move();setTimeout(()=>api.release(),220);}
      }
      if(seconds>(r.kind==='wall'?28:14))void stop();
    }requestAnimationFrame(tick);
  }
  document.body.append(panel,report);requestAnimationFrame(tick);
}
