// Diagnostic placement AFTER the full ordinary route and recorder stop.
// Identical unchanged West bay and authored default in both frozen conditions.
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const p=window.__probe;
const instruments={recorderState:window.__roofAudioRecorder?.state||null,videoDrawEnabled:!!window.__roofDrawVideo,shaderClockEnabled:!!window.__roofShaderClock?.enabled,glassBindingOverrideEnabled:!!window.__roofGlassBindingAblation?.enabled};
if(instruments.recorderState==='recording'||instruments.videoDrawEnabled||instruments.shaderClockEnabled||instruments.glassBindingOverrideEnabled)throw Error('Performance sample is not ordinary renderer with recorder OFF');
function pressE(){for(const type of ['keydown','keyup'])window.dispatchEvent(new KeyboardEvent(type,{key:'e',code:'KeyE',bubbles:true,cancelable:true}));}
p.warpCell(200,289);p.lookAtWorld(0,0);await wait(700);pressE();await wait(2000);
if(window.__scenes.top()?.id!=='academic-roof-sit')throw Error('Performance West seat fixture failed');
const pose={pos:p.pos(),look:p.lookAngles(),eye:p.sourceShoreView()?.eye,sceneView:window.__scenes.top()?.view?.(),lighting:p.r3dLighting(),display:window.__chunkSurferPixelMesh.status(),viewport:[innerWidth,innerHeight]};
p.performanceReset?.();
const values=await new Promise(resolve=>{const start=performance.now();let last=start;const a=[];function frame(t){a.push(t-last);last=t;if(t-start>=5000)resolve(a);else requestAnimationFrame(frame);}requestAnimationFrame(frame);});
const positive=values.slice(1).filter(n=>n>0).sort((a,b)=>a-b);
const result={method:'Recorder OFF, post-route diagnostic actual E West seat, settle2s, measure rAF5s; identical unchanged roof pose in both frozen conditions; host contention remains a limitation',instruments,pose,raw:values,omittedInitial:values[0],omittedNonpositive:values.slice(1).filter(n=>n<=0),samples:positive.length,median:positive[Math.floor(positive.length*.5)],p95:positive[Math.floor(positive.length*.95)],p99:positive[Math.floor(positive.length*.99)],over50ms:positive.filter(n=>n>50).length,gamePerformance:p.performance?.()};
pressE();await wait(1000);return result;
