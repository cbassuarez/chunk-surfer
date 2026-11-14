import {mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';

// Records presentation only: no microphone, transport controls or state staging.
export async function startRouteFilm(page){
 return page.evaluate(()=>{
  if(window.__routeVerificationFilm)throw Error('A route film already owns this page');
  const wrap=document.querySelector('#wrap');if(!wrap)throw Error('The game stage is unavailable');
  const mime='video/webm;codecs=vp8,opus';if(!globalThis.MediaRecorder?.isTypeSupported(mime))throw Error('VP8/Opus recording is unavailable');
  const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(innerWidth));canvas.height=Math.max(2,Math.round(innerHeight));
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx||!canvas.captureStream)throw Error('Canvas composition is unavailable');
  const q={canvas,ctx,stream:null,tap:null,recorder:null,parts:[],layers:new Map(),frames:0,raf:0,closed:false,error:null,at:performance.now(),next:0};
  q.next=q.at;q.cleanup=()=>{if(q.closed)return;q.closed=true;cancelAnimationFrame(q.raf);try{if(q.recorder&&q.recorder.state!=='inactive')q.recorder.stop();}catch{}try{q.tap?.dispose?.();}catch{}for(const track of q.stream?.getTracks()||[])try{if(track.readyState!=='ended')track.stop();}catch{}};
  window.__routeVerificationFilm=q;
  try{
   q.stream=canvas.captureStream(24);let audioReason=null;
   try{q.tap=window.__probe?.stationFieldCaptureAudio?.()||null;}catch(error){audioReason=String(error.message||error);}
   const audio=q.tap?.stream?.getAudioTracks().filter(t=>t.readyState==='live')||[];for(const track of audio)q.stream.addTrack(track);
   q.metadata={width:canvas.width,height:canvas.height,fps:24,mime,audioTracks:audio.length,audioSource:audio.length?'Game post-master outGain via stationFieldCaptureAudio':null,audioFallback:audio.length?null:audioReason||'Video only: game output tap unavailable',microphone:false,domOutsideCanvasCaptured:false};
   function layers(){return[...wrap.querySelectorAll('canvas')].map((layer,order)=>{
    const rect=layer.getBoundingClientRect(),style=getComputedStyle(layer),stack=[];let opacity=1;
    for(let el=layer;el;el=el.parentElement){const s=getComputedStyle(el);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'){opacity=0;break;}opacity*=Number(s.opacity)||0;if(s.zIndex!=='auto')stack.unshift(Number(s.zIndex)||0);if(el===wrap)break;}
    return{layer,rect,style,stack,opacity,order};
   }).filter(v=>v.opacity>0&&v.layer.width&&v.layer.height&&v.rect.width>0&&v.rect.height>0&&v.rect.right>0&&v.rect.bottom>0&&v.rect.left<innerWidth&&v.rect.top<innerHeight).sort((a,b)=>{for(let n=0;n<Math.max(a.stack.length,b.stack.length);n++){const d=(a.stack[n]||0)-(b.stack[n]||0);if(d)return d;}return a.order-b.order;});}
   function draw(now){if(q.closed)return;try{
    if(now>=q.next){q.next=Math.max(q.next+1000/24,now-1000/24);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.filter='none';ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);
     for(const v of layers()){ctx.globalAlpha=v.opacity;ctx.globalCompositeOperation=v.style.mixBlendMode==='plus-lighter'?'lighter':v.style.mixBlendMode==='normal'?'source-over':v.style.mixBlendMode||'source-over';ctx.filter=v.style.filter||'none';ctx.drawImage(v.layer,v.rect.left,v.rect.top,v.rect.width,v.rect.height);q.layers.set(v.layer,{id:v.layer.id||null,className:String(v.layer.className||''),z:v.style.zIndex,width:v.layer.width,height:v.layer.height});}q.frames++;
    }q.raf=requestAnimationFrame(draw);
   }catch(error){q.error=String(error.message||error);q.cleanup();}}
   q.recorder=new MediaRecorder(q.stream,{mimeType:mime,videoBitsPerSecond:2800000,audioBitsPerSecond:128000});
   q.done=new Promise(resolve=>{q.recorder.onstop=resolve;});q.recorder.ondataavailable=e=>{if(e.data.size)q.parts.push(e.data);};
   q.recorder.onerror=e=>{q.error=String(e.error?.message||'Route MediaRecorder failed');q.cleanup();};
   draw(q.at);if(q.error)throw Error(q.error);q.recorder.start(500);return{...q.metadata,layers:[...q.layers.values()]};
  }catch(error){q.cleanup();if(window.__routeVerificationFilm===q)delete window.__routeVerificationFilm;throw error;}
 });
}
export async function stopRouteFilm(page,file){
 const result=await page.evaluate(async()=>{
  const q=window.__routeVerificationFilm;if(!q)throw Error('No route film owns this page');let timeout;
  try{
   if(q.recorder.state!=='inactive')q.recorder.stop();
   await Promise.race([q.done,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Route recorder did not stop')),10000);})]);
   if(q.error)throw Error(q.error);
   const blob=new Blob(q.parts,{type:q.recorder.mimeType}),data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(Error('Route film read failed'));r.readAsDataURL(blob);});
   return{...q.metadata,mime:q.recorder.mimeType,bytes:blob.size,seconds:(performance.now()-q.at)/1000,compositeFrames:q.frames,layers:[...q.layers.values()],data};
  }finally{clearTimeout(timeout);q.cleanup();if(window.__routeVerificationFilm===q)delete window.__routeVerificationFilm;}
 });
 const marker=';base64,',at=result.data.indexOf(marker);if(at<0)throw Error('Route film has no binary payload');
 const bytes=Buffer.from(result.data.slice(at+marker.length),'base64');if(bytes.length!==result.bytes||bytes.subarray(0,4).toString('hex')!=='1a45dfa3')throw Error('Route film failed its EBML/length check');
 const target=resolve(file);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);delete result.data;
 return{...result,file:target,sha256:createHash('sha256').update(bytes).digest('hex'),ebml:true};
}
