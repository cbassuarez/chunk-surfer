// Explicit developer controls, installed only by menu-feedback-review-server.
import * as R3 from '../render/r3d.js';
import {getSave,saveCommit} from '../game/save.js';
const panel=document.createElement('aside');panel.setAttribute('aria-label','Menu feedback verification');
panel.style.cssText='position:fixed;z-index:99999;top:4px;left:4px;right:4px;background:#111d19ed;color:#eee;padding:6px;display:flex;gap:6px;flex-wrap:wrap;font:12px monospace';
const status=document.createElement('output'),label=document.createElement('input');label.value='yard';label.setAttribute('aria-label','Evidence label');label.style.width='90px';panel.append(label);document.body.append(panel);
for(const type of ['keydown','keyup','pointerdown','pointerup'])panel.addEventListener(type,event=>event.stopPropagation());
const errors=[],trace=[];let recording=false;
addEventListener('error',event=>errors.push(event.message));addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
function snapshot(){return{time:performance.now(),scene:window.__scenes?.top?.()?.id,feedback:R3.r3dMenuFeedbackStatus(),plate:R3.r3dFrontEndPlate(),position:window.__probe?.pos?.(),pixelMesh:R3.r3dPixelMeshSettings(),errors:[...errors]};}
async function send(name,data){const response=await fetch('/__menu-feedback/'+name,{method:'POST',body:data});if(!response.ok)throw Error(await response.text());}
function button(text,action){const b=document.createElement('button');b.textContent=text;b.onclick=async()=>{try{await action();}catch(error){errors.push(String(error));status.textContent=String(error);}};panel.append(b);return b;}
async function stage(hook){await window.__probe.testRun();window.__probe.tutSkip();if(!await window.__probe.godWarpHook(hook))throw Error('Warp failed: '+hook);window.__probe.returnToTitle();}
button('Prepare yard menu',()=>stage('yard-van'));
button('Prepare indoor menu',()=>stage('basement-corridor'));
button('Toggle reduced motion',()=>{const reduceMotion=!R3.r3dPixelMeshSettings().reduceMotion;saveCommit({settings:{...getSave().settings,shake:reduceMotion?'off':'full'}});window.__chunkSurferPixelMesh.setAccessibility({reduceMotion,reduceFlash:R3.r3dPixelMeshSettings().reduceFlash});});
button('Toggle feedback reference',()=>{window.__probe.frontEndGrade(R3.r3dFrontEndPlate().signal?false:null);});
button('Continue with Enter',()=>{trace.length=0;for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'Enter',code:'Enter',bubbles:true}));});
function composite(){
  const world=R3.r3dCanvas(),canvas=document.createElement('canvas');canvas.width=world.width;canvas.height=world.height;
  const draw=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(world,0,0,canvas.width,canvas.height);for(const layer of document.querySelectorAll('#map>canvas'))if(layer!==world&&layer.style.zIndex==='8')ctx.drawImage(layer,0,0,canvas.width,canvas.height);};draw();return{canvas,draw};
}
button('Save frame',async()=>{const name=label.value.replace(/[^a-z0-9-]/g,'-'),{canvas}=composite();await send(name+'.png',await new Promise(resolve=>canvas.toBlob(resolve,'image/png')));await send(name+'.json',JSON.stringify({disclosure:'Production r3d world + unmodified production UI canvas. No recorded plate or preview renderer.',...snapshot(),trace}));status.textContent='Saved '+name;});
button('Record 8 seconds',async()=>{
  if(recording)return;recording=true;const name=label.value.replace(/[^a-z0-9-]/g,'-'),{canvas,draw}=composite();
  const stream=canvas.captureStream(30),mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(v=>MediaRecorder.isTypeSupported(v));
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2200000}),chunks=[],samples=[];let request;
  recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  const saved=new Promise((resolve,reject)=>{recorder.onerror=reject;recorder.onstop=async()=>{try{await send(name+'.webm',new Blob(chunks,{type:mime}));await send(name+'-recording.json',JSON.stringify({disclosure:'8-second production world + UI capture; video only.',samples,errors}));resolve();}catch(error){reject(error);}};});
  const tick=()=>{draw();samples.push(snapshot());request=requestAnimationFrame(tick);};
  try{recorder.start(500);request=requestAnimationFrame(tick);status.textContent='Recording '+name;await new Promise(resolve=>setTimeout(resolve,8000));recorder.stop();cancelAnimationFrame(request);await saved;status.textContent='Recording saved '+name;}
  finally{recording=false;for(const track of stream.getTracks())track.stop();}
});
button('Hide review controls',()=>{panel.hidden=true;});addEventListener('keydown',event=>{if(event.key==='F6')panel.hidden=!panel.hidden;});
panel.append(status);setInterval(()=>{const s=snapshot();trace.push(s);if(trace.length>512)trace.shift();if(!recording)status.textContent=JSON.stringify(s);},125);
