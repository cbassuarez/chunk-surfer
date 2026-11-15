import {createStudyRenderer} from './renderer.mjs';
import {SPEC,STAGES,maneuverAt,samples,wheelContact,verifyMotion,presentationTime} from './motion.mjs';
const $=id=>document.getElementById(id),D=SPEC.duration,FR=24;
let player,t=.9,playing=false,epoch=0,raf=0,lastFrame=-1,maxContactError=0,comparison=null;
const outputs=Object.fromEntries(['loader','dock','inspect'].map(id=>[id,$(id).getContext('2d')]));
const points=[{t:.08,label:'Take up reverse'},{t:.6,label:'Reverse and align'},{t:1.1,label:'Braking load'},{t:1.87,label:'Settled · gear change'},{t:2.95,label:'Forward departure'}];
const fmt=(x,n=2)=>Number(x).toFixed(n),deg=x=>x*180/Math.PI;
const sceneOptions=()=>({size:256,reduceFlash:true});
function resolve(elapsed,presentation){
 const name=$('scenario').value;
 if(name==='performance')return{time:presentation==='dock'?Math.min(elapsed,SPEC.depart-1/SPEC.hz):elapsed,visible:true,stage:'Authored performance'};
 const settings={presentation,readyAt:name==='early'?.9:name==='ready'?2.4:null,lateJoin:name==='late'?1.1:0,
  reduced:name==='reduced',hidden:name==='hidden'&&elapsed>=.6&&elapsed<1.7};
 return presentationTime(elapsed,settings);
}
function blit(name,pose,time,visible=true){
 const ctx=outputs[name],size=name==='loader'?128:256;
 ctx.clearRect(0,0,size,size);
 if(!visible)return;
 player.renderAt(time,{...sceneOptions(),size,pose,reducedMotion:$('scenario').value==='reduced'});
 ctx.drawImage(player.canvas,0,0,size,size);
 maxContactError=Math.max(maxContactError,...player.contacts().map(p=>Math.abs(p.error)));
}
function render(){
 const loader=resolve(t,'loader'),dock=resolve(t,'dock');
 const p=maneuverAt(loader.time),d=maneuverAt(dock.time,{presentation:'dock'});
 blit('loader',p,loader.time,loader.visible);blit('dock',d,dock.time,dock.visible);
 blit('inspect',p,loader.time,loader.visible);
 if($('contacts').checked&&loader.visible){
  const ctx=outputs.inspect;ctx.save();ctx.strokeStyle='#6cfff2';ctx.lineWidth=1;
  // Project the measured tyre contact positions with the renderer's camera.
  for(const point of player.projectContacts()){ctx.beginPath();ctx.arc(point.x*256,point.y*256,3,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
 }
 $('time').textContent=`${fmt(t,3)} s · frame ${Math.round(t*FR)}`;
 $('timeline').value=t;
 $('stage').textContent=`${p.phase} · loader: ${loader.stage} · Dock: ${dock.stage}${t>=SPEC.depart?' · parked icon retained':''}`;
 $('loader-state').textContent=loader.visible?loader.stage:'Game revealed / presentation hidden';
 $('distance').textContent=`${fmt(p.travel)} m`;$('speed').textContent=`${fmt(p.speed)} m/s`;
 $('pitch').textContent=`${fmt(deg(p.body.pitch))}°`;$('contact').textContent=`${fmt(maxContactError*1000,4)} mm`;
 drawGraphs(p);
}
function drawGraphs(p){
 const ctx=$('graphs').getContext('2d'),w=1040,h=210;
 ctx.clearRect(0,0,w,h);ctx.fillStyle='#10191c';ctx.fillRect(0,0,w,h);
 ctx.font='11px system-ui';ctx.fillStyle='#aebbb9';ctx.fillText('GROUND PATH · metres',20,22);
 ctx.fillText('TIME · signed speed / body pitch / wheel turns',382,22);
 const scale=28,tx=150,tz=153;
 const project=q=>({x:tx+q.x*scale,y:tz+q.z*scale});
 ctx.strokeStyle='#293c42';ctx.lineWidth=1;
 for(let x=-2;x<=3;x++){ctx.beginPath();ctx.moveTo(tx+x*scale,38);ctx.lineTo(tx+x*scale,190);ctx.stroke();}
 for(let z=-4;z<=1;z++){ctx.beginPath();ctx.moveTo(28,tz+z*scale);ctx.lineTo(334,tz+z*scale);ctx.stroke();}
 for(let k=-1;k<4;k++){
  ctx.beginPath();samples.forEach((s,i)=>{const q=project(k<0?{x:s.rearX,z:s.rearZ}:wheelContact(s,s.wheels[k]));i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});
  ctx.strokeStyle=k<0?'#dfbd80':k<2?'#8bafb8':'#57747d';ctx.lineWidth=k<0?2:1;ctx.stroke();
 }
 for(const wheel of p.wheels){const q=project(wheelContact(p,wheel));ctx.save();ctx.translate(q.x,q.y);ctx.rotate(-p.yaw-wheel.steer);ctx.fillStyle='#9eede0';ctx.fillRect(-2,-5,4,10);ctx.restore();}
 const centre=project(p);ctx.strokeStyle='#e9e4d9';ctx.lineWidth=1;ctx.save();ctx.translate(centre.x,centre.y);ctx.rotate(-p.yaw);ctx.strokeRect(-SPEC.track/2*scale,-2.409*scale,SPEC.track*scale,4.818*scale);ctx.restore();
 const x0=382,x1=1018,width=x1-x0,mid=111,ys=22;
 ctx.strokeStyle='#45585e';ctx.beginPath();ctx.moveTo(x0,mid);ctx.lineTo(x1,mid);ctx.stroke();
 for(const stage of STAGES){const x=x0+stage.at/D*width;ctx.strokeStyle='#293c42';ctx.beginPath();ctx.moveTo(x,38);ctx.lineTo(x,178);ctx.stroke();}
 const series=[{color:'#dfbd80',f:s=>s.speed,label:'speed (m/s)'},{color:'#8fe1cd',f:s=>deg(s.body.pitch),label:'pitch (°)'},{color:'#91a8d4',f:s=>s.wheels[2].spin/(2*Math.PI),label:'rear turns'}];
 for(const item of series){ctx.beginPath();samples.forEach((s,i)=>{const x=x0+s.t/D*width,y=mid-item.f(s)*ys;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle=item.color;ctx.lineWidth=1.7;ctx.stroke();}
 const x=x0+Math.min(D,p.t)/D*width;ctx.strokeStyle='#f6f3e9';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,35);ctx.lineTo(x,177);ctx.stroke();
 ctx.fillStyle='#aebbb9';ctx.fillText('−Z · forward ↑',20,198);ctx.fillText('rear axle gold · tyres blue · current wheels green',143,198);
 series.forEach((item,i)=>{ctx.fillStyle=item.color;ctx.fillText(item.label,x0+i*180,198);});
}
function stop(){playing=false;cancelAnimationFrame(raf);$('play').textContent='Play';}
function seek(time){stop();t=Math.max(0,Math.min(Number($('timeline').max),time));render();}
function play(){
 if(playing){stop();return;}
 const duration=Number($('timeline').max);if(t>=duration)t=0;
 playing=true;$('play').textContent='Pause';epoch=performance.now()-t/Number($('rate').value)*1000;lastFrame=-1;
 const frame=now=>{
  if(!playing)return;
  if(document.hidden){raf=requestAnimationFrame(frame);return;}
  const elapsed=(now-epoch)/1000*Number($('rate').value),quantized=Math.floor(elapsed*FR);
  if(elapsed>=duration){t=duration;render();stop();return;}
  if(quantized!==lastFrame){lastFrame=quantized;t=Math.min(duration,quantized/FR);render();}
  raf=requestAnimationFrame(frame);
 };raf=requestAnimationFrame(frame);
}
function row(name,value){const tr=document.createElement('tr');const th=document.createElement('th'),td=document.createElement('td');th.textContent=name;td.textContent=value;tr.append(th,td);$('checks').append(tr);}
async function appearance(){
 $('before').src='./appearance-baseline.png';
 player.renderAt(3.4,{size:128,reducedMotion:true,reduceFlash:true,pose:maneuverAt(3.4,{baseline:true})});
 $('after').src=player.image();
 await Promise.all([$ ('before').decode(),$('after').decode()]);
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d',{willReadFrequently:true});
 ctx.drawImage($('before'),0,0);const a=ctx.getImageData(0,0,128,128).data;ctx.clearRect(0,0,128,128);
 ctx.drawImage($('after'),0,0);const b=ctx.getImageData(0,0,128,128).data;
 let changed=0,maximum=0,total=0;for(let i=0;i<a.length;i+=4){let different=false;for(let k=0;k<4;k++){const delta=Math.abs(a[i+k]-b[i+k]);total+=delta;maximum=Math.max(maximum,delta);if(delta>1)different=true;}if(different)changed++;}
 comparison={changed,maximum,mean:total/a.length,total:128*128};
 $('appearance').textContent=`Same size, neutral transform, lighting and weather/acquisition clock: ${changed} / 16,384 pixels differ by more than 1 channel level; mean channel difference ${fmt(comparison.mean,4)} / 255. Camera and acquisition setup preserved. This control isolates appearance; the critical frames above show the authored lamp and body changes.`;
 render();
}
function saveSheet(){
 const c=document.createElement('canvas');c.width=1040;c.height=760;const ctx=c.getContext('2d');
 ctx.fillStyle='#080e10';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#ebe9de';ctx.font='26px system-ui';ctx.fillText('ALBION Transit · motion review',28,44);
 ctx.font='14px system-ui';ctx.fillStyle='#aebbb9';ctx.fillText('Original geometry / rear camera / materials / lights / rain / game acquisition. Review only.',28,76);
 ctx.fillText('Loader 160 px display · 128 px source. Dock below is browser simulation; macOS is unverified.',28,100);
 points.forEach((point,i)=>{ctx.drawImage(point.image,28+i*204,130,160,160);ctx.fillStyle='#dfbd80';ctx.fillText(`${fmt(point.t)} s · ${point.label}`,28+i*204,312);});
 ctx.drawImage($('graphs'),0,338,1040,210);
 if($('before').complete&&$('before').naturalWidth){ctx.drawImage($('before'),32,570,128,128);ctx.drawImage($('after'),190,570,128,128);ctx.fillStyle='#aebbb9';ctx.fillText('Original / neutral candidate',32,726);}
 ctx.fillStyle='#d8c7a2';ctx.font='14px ui-monospace';
 const checks=verifyMotion();ctx.fillText(`Wheel path / roll residual: ${(checks.rollingError*1000).toExponential(2)} mm per 480 Hz step`,360,594);
 ctx.fillText(`Measured pivot contact height error: ${fmt(maxContactError*1000,4)} mm`,360,624);
 ctx.fillText(`Neutral appearance: ${comparison?comparison.changed+' pixels differ >1 level':'not yet compared'}`,360,654);
 ctx.fillText('No package / native Dock motion changed pending review.',360,696);
 let panel=$('export-panel');
 if(!panel){panel=document.createElement('section');panel.id='export-panel';panel.className='evidence';document.querySelector('main').append(panel);}
 panel.replaceChildren();
 const image=new Image();image.id='review-sheet';image.alt='ALBION maneuver review sheet';image.style.width='100%';image.src=c.toDataURL('image/png');
 const a=document.createElement('a');a.download='albion-maneuver-review.png';a.href=image.src;a.textContent='Download review sheet PNG';panel.append(a,image);
 panel.scrollIntoView({block:'start'});
}
try{
 player=await createStudyRenderer();
 for(const point of points){
  player.renderAt(point.t,{size:128,reduceFlash:true,pose:maneuverAt(point.t)});
  const figure=document.createElement('figure'),img=new Image(),caption=document.createElement('figcaption');img.src=player.image();img.alt=`${point.label} at ${point.t} seconds`;await img.decode();point.image=img;
  caption.textContent=`${fmt(point.t)} s · ${point.label}`;figure.append(img,caption);$('frames').append(figure);
 }
 for(const stage of STAGES){const button=document.createElement('button');button.textContent=`${fmt(stage.at)} ${stage.name}`;button.onclick=()=>seek(stage.at);$('checkpoints').append(button);}
 const check=verifyMotion();
 for(let i=0;i<samples.length;i+=4){const p=samples[i];player.renderAt(p.t,{size:64,reducedMotion:true,reduceFlash:true,pose:maneuverAt(p.t)});maxContactError=Math.max(maxContactError,...player.contacts().map(point=>Math.abs(point.error)));}
 row('Wheelbase / radius',`${fmt(SPEC.wheelbase,3)} m / ${fmt(SPEC.radius)} m`);
 row('Reverse travel',`${fmt(check.reverseDistance,4)} m`);
 row('World path vs wheel roll',`${(check.rollingError*1000).toExponential(2)} mm max / 480 Hz step`);
 row('Wheel lateral residual',`${fmt(check.wheelLateralError*1000,4)} mm max / step`);
 row('Wheel contact height',`${fmt(maxContactError*1000,4)} mm max (actual model pivots)`);
 row('Peak steer / body pitch',`${fmt(deg(check.maxSteer),1)}° / ${fmt(deg(check.maxPitch),2)}°`);
 row('Physical rain / acquisition',`${player.weather().rain?'Rain':'Original weather'} · original game shader`);
 $('play').onclick=play;$('restart').onclick=()=>seek(0);$('back').onclick=()=>seek(t-1/FR);$('next').onclick=()=>seek(t+1/FR);$('save').onclick=saveSheet;
 $('timeline').oninput=event=>seek(Number(event.target.value));$('contacts').onchange=render;
 $('scenario').onchange=()=>{$('timeline').max=$('scenario').value==='performance'?'3.4':'5';seek(0);};
 $('rate').onchange=()=>{if(playing){stop();play();}};
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&playing){t=Math.min(Number($('timeline').max),(performance.now()-epoch)/1000*Number($('rate').value));render();}});
 for(const id of ['play','restart','back','next','save'])$(id).disabled=false;
 $('status').textContent='Ready · shared production motion and acquisition · packaged playback linked below · native Mac acceptance pending.';
 render();await appearance();
 window.__albionReview={ready:true,checks:check,contactError:maxContactError,comparison,fit:player.fit,source:'tools/app-icon/transit.glb',duration:D};
}catch(error){$('status').classList.add('error');$('status').textContent=`Preview failed: ${error.message}`;console.error(error);}
