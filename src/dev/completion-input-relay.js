// User-approved test input only. Relative look enters the ordinary controller
// sampler. This module cannot set a pose, location, scene, award, item or clock.
export function createRelativeLookPulse({now=()=>performance.now()}={}){
  let held={turnX:0,lookY:0,until:0};
  return {
    pulse({turnX=0,lookY=0,durationMs=100}={}){
      held={turnX:Math.max(-1,Math.min(1,Number(turnX)||0)),lookY:Math.max(-1,Math.min(1,Number(lookY)||0)),
        until:now()+Math.max(20,Math.min(1000,Number(durationMs)||100))};
    },
    axes(){return now()<held.until?{turnX:held.turnX,lookY:held.lookY}:{turnX:0,lookY:0};},
    clear(){held={turnX:0,lookY:0,until:0};},
  };
}

export function installCompletionInputRelay({onInput=()=>{}}={}){
  const pulse=createRelativeLookPulse(),panel=document.createElement('aside');panel.id='completion-input-relay';
  panel.setAttribute('aria-label','Test-only relative look input relay');
  panel.style.cssText='position:fixed;left:8px;bottom:8px;z-index:2147483002;padding:8px;background:#152015ed;color:#e0e8da;border:1px solid #809171;font:12px/1.4 system-ui;max-width:420px';
  const title=document.createElement('div');title.textContent='TEST INPUT · RELATIVE LOOK · NORMAL CONTROL SAMPLER';panel.append(title);
  const select=document.createElement('select');select.id='completion-look-duration';select.setAttribute('aria-label','Look pulse duration');
  for(const[ms,label]of[[40,'Fine · 40 ms'],[100,'Short · 100 ms'],[300,'Medium · 300 ms'],[600,'Long · 600 ms']]){const o=document.createElement('option');o.value=ms;o.textContent=label;select.append(o);}select.value='100';panel.append(select);
  for(const[id,label,axes]of[['left','Look left',{turnX:-1}],['right','Look right',{turnX:1}],['up','Look up',{lookY:1}],['down','Look down',{lookY:-1}]]){
    const b=document.createElement('button');b.id='completion-look-'+id;b.textContent=label;b.onclick=()=>{
      const input={...axes,durationMs:Number(select.value)};pulse.pulse(input);onInput({kind:'test-relative-look-input',input});
      document.getElementById('map')?.focus?.({preventScroll:true});
    };panel.append(b);
  }
  const clear=()=>pulse.clear();window.addEventListener('blur',clear);document.addEventListener('visibilitychange',clear);
  document.body.append(panel);
  return {axes:()=>pulse.axes(),pulse(input){pulse.pulse(input);onInput({kind:'test-relative-look-input',source:'local-test-api',input});},clear,dispose(){clear();window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);panel.remove();}};
}
