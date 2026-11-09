// Explicit local staging, no automatic playback through physical speakers.
export function installB3Review(api){
  const panel=document.createElement('aside');panel.setAttribute('aria-label','Local B3 review');
  panel.style.cssText='position:fixed;left:8px;top:8px;z-index:10000;max-width:620px;padding:10px;background:#17201ded;color:#e8dec8;font:12px system-ui;display:flex;gap:6px;flex-wrap:wrap';
  const title=document.createElement('strong');title.textContent='DEV · B3 · silent staged review';panel.append(title);
  const status=document.createElement('pre');status.style.cssText='flex-basis:100%;max-height:180px;overflow:auto;white-space:pre-wrap;margin:0';
  for(const type of ['click','pointerdown','pointerup','keydown','keyup'])panel.addEventListener(type,e=>e.stopPropagation());
  const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{await fn();status.textContent=JSON.stringify(api.inspect(),null,2);}catch(e){status.textContent=String(e.stack||e);}};panel.append(b);};
  button('Stage first B3',()=>api.stage(false));button('Roll B3',()=>api.roll());button('Inspect state',()=>{});
  button('Stage sounding console',()=>api.stage(true));button('Open console',()=>api.console());button('Show optical film',()=>api.film());
  button('Close review',()=>panel.remove());panel.append(status);document.body.append(panel);
}
