// Continuous cabin field takes. PB remains the one physical tape/history/head.
// Only the host's cabin bus is captured: no microphone permission, catalogue
// reconstruction, automatic guest, separate context or synthetic replacement.
const DB='chunk-surfer-source-drive-audio',STORE='field-takes';
let storageEpoch=0;
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clone=value=>JSON.parse(JSON.stringify(value));
const problem=(code,message)=>Object.assign(new Error(message),{code});
export const SOURCE_DRIVE_CAPTURE_KIND='continuous-cabin';
export function sourceDriveAudioKey(runId,takeId,captureId=''){if(!runId||!takeId)throw problem('FIELD_ID_REQUIRED','A field take needs its existing run and physical tape IDs.');return`source-drive:${String(runId)}:${String(takeId)}${captureId?':'+String(captureId):''}`;}

const openStore=()=>new Promise((resolve,reject)=>{
 if(!globalThis.indexedDB){reject(problem('FIELD_STORAGE_UNAVAILABLE','Local field-audio storage is unavailable.'));return;}
 const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||problem('FIELD_STORAGE_UNAVAILABLE','Could not open local field-audio storage.'));
});
export async function storeSourceDriveAudio(ref,blob){
 if(!ref?.key||!blob?.size)throw problem('FIELD_EMPTY_MEDIA','No captured cabin audio was supplied.');
 const epoch=storageEpoch,db=await openStore();
 try{if(epoch!==storageEpoch)throw problem('FIELD_RUN_CLEARED','This recording belongs to a cleared run.');await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({ref:clone(ref),blob},ref.key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 return ref.key;
}
export async function readSourceDriveAudioEntry(key){
 if(!key)return null;const db=await openStore();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE),request=tx.objectStore(STORE).get(String(key));request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}finally{db.close();}
}
export async function readSourceDriveAudio(ref){return(await readSourceDriveAudioEntry(typeof ref==='string'?ref:ref?.key))?.blob||null;}
export function clearSourceDriveAudio(){
 storageEpoch++;return new Promise(resolve=>{if(!globalThis.indexedDB){resolve(false);return;}const request=indexedDB.deleteDatabase(DB);request.onsuccess=()=>resolve(true);request.onerror=()=>resolve(false);request.onblocked=()=>resolve(false);});
}
export const sourceDriveAudioStore=Object.freeze({put:storeSourceDriveAudio,get:readSourceDriveAudioEntry});
export async function sourceDriveBlobDigest(blob){
 if(!globalThis.crypto?.subtle)throw problem('FIELD_INTEGRITY_UNAVAILABLE','The local audio integrity check is unavailable.');
 const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export function normalizeSourceDriveMedia(value){
 if(!value||value.kind!==SOURCE_DRIVE_CAPTURE_KIND||typeof value.key!=='string'||!value.key||value.key.length>512)return null;
 const base={schema:1,kind:SOURCE_DRIVE_CAPTURE_KIND,key:value.key,runId:String(value.runId||''),takeId:String(value.takeId||''),captureId:String(value.captureId||'')};
 if(value.pending)return{...base,pending:true,durable:false};
 const durationSeconds=finite(value.durationSeconds,-1),frames=finite(value.frames,-1),sampleRate=finite(value.sampleRate,-1),channels=finite(value.channels,-1);
 if(!value.durable||durationSeconds<=0||frames<=0||sampleRate<8000||sampleRate>384000||channels<1||channels>8||!/^[a-f0-9]{64}$/.test(value.sha256||''))return null;
 return{...base,durable:true,mime:String(value.mime||''),bytes:Math.max(0,finite(value.bytes)),durationSeconds,frames:Math.round(frames),sampleRate,channels:Math.round(channels),sha256:value.sha256};
}
export async function decodeSourceDriveMedia(context,value,{read=readSourceDriveAudio}={}){
 const ref=normalizeSourceDriveMedia(value);if(!ref||ref.pending)throw problem('FIELD_MEDIA_UNAVAILABLE','This field take has no stored audio.');
 const blob=await read(ref);if(!blob?.size)throw problem('FIELD_MEDIA_MISSING','The locally recorded field audio is missing. It cannot be reconstructed.');
 if(await sourceDriveBlobDigest(blob)!==ref.sha256)throw problem('FIELD_MEDIA_CORRUPT','The stored field audio failed its integrity check.');
 const buffer=await context.decodeAudioData(await blob.arrayBuffer());
 if(Math.abs(buffer.duration-ref.durationSeconds)>Math.max(.003,2/Math.min(buffer.sampleRate,ref.sampleRate)))throw problem('FIELD_MEDIA_DURATION','The stored field audio duration does not match the physical tape.');
 return{ref,blob,buffer};
}

// Only a host-supplied finite tape capacity can cause trimming. The existing
// game's physical tape has no capacity limit; it is not invented by this adapter.
export function sourceDriveWav(buffer,frames=buffer.length){
 const count=Math.max(1,Math.min(buffer.length,Math.floor(frames))),channels=buffer.numberOfChannels,bytes=new ArrayBuffer(44+count*channels*4),view=new DataView(bytes),text=(at,value)=>{for(let i=0;i<value.length;i++)view.setUint8(at+i,value.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);text(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*4,true);view.setUint16(32,channels*4,true);view.setUint16(34,32,true);text(36,'data');view.setUint32(40,count*channels*4,true);
 const samples=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));for(let i=0;i<count;i++)for(let c=0;c<channels;c++)view.setFloat32(44+(i*channels+c)*4,samples[c][i],true);
 return new Blob([bytes],{type:'audio/wav'});
}

export class SourceDriveRecording {
 constructor({context,cabinBus,playbackDestination,runId,tape,storage=sourceDriveAudioStore,MediaRecorder:Recorder=globalThis.MediaRecorder,onChange=null}={}){
  if(!context?.createMediaStreamDestination||!cabinBus?.connect||!tape?.tapeTransport||!tape?.beginContinuousFieldTake||!tape?.sealContinuousFieldTake)throw problem('FIELD_HOST_REQUIRED','Continuous field recording needs the existing audio context, cabin bus and physical tape adapter.');
  if(!runId)throw problem('FIELD_RUN_REQUIRED','A field recording must belong to the active run.');
  this.context=context;this.cabinBus=cabinBus;this.playbackDestination=playbackDestination;this.runId=String(runId);this.tape=tape;this.storage=storage;this.storageEpoch=storageEpoch;this.Recorder=Recorder;this.onChange=onChange;
  this.sink=context.createMediaStreamDestination();cabinBus.connect(this.sink);this.active=null;this.refs=new Map();this.paused=false;this.disposed=false;this.lastError=null;this.queue=Promise.resolve();this.cueWait=null;
  this.contextChanged=()=>this.updateCapturePause();context.addEventListener?.('statechange',this.contextChanged);
 }
 operation(fn){const work=this.queue.catch(()=>{}).then(()=>{if(this.disposed||this.closing)throw problem('FIELD_DISPOSED','This cabin recording session has closed.');return fn();});this.queue=work;return work.catch(error=>{this.lastError={code:error.code||'FIELD_ERROR',message:error.message};this.changed();throw error;});}
 changed(){this.onChange?.(this.status());}
 elapsed(){const c=this.active;if(!c)return 0;if(c.decodedDuration!=null)return c.decodedDuration;if(c.stoppedElapsed!=null)return c.stoppedElapsed;return Math.min(c.capacitySeconds,Math.max(0,(c.pausedAt??this.context.currentTime)-c.startedAt-c.pausedSeconds));}
 updateCapturePause(){const c=this.active;if(!c||c.stopped)return;const paused=this.paused||this.context.state!=='running';if(paused&&c.pausedAt==null){c.pausedAt=this.context.currentTime;if(c.recorder.state==='recording')c.recorder.pause();}else if(!paused&&c.pausedAt!=null){c.pausedSeconds+=Math.max(0,this.context.currentTime-c.pausedAt);c.pausedAt=null;if(c.recorder.state==='paused')c.recorder.resume();}}
 setPaused(value){this.paused=!!value;this.updateCapturePause();this.tape.setContinuousPlaybackPaused?.(this.paused);this.changed();}
 async prepareAppend(){
  if(this.tape.isPlaying?.())throw problem('FIELD_DECK_BUSY','Stop playback before recording.');
  if(this.tape.hasOpenTake?.())throw problem('FIELD_DECK_BUSY','Another take is still open.');
  if(this.tape.prepareContinuousAppend)await this.tape.prepareContinuousAppend();
  else if(this.tape.cueTapeEnd?.()){this.tape.setContinuousPlaybackPaused?.(this.paused);this.cueWait={};await new Promise((resolve,reject)=>Object.assign(this.cueWait,{resolve,reject}));this.cueWait=null;}
  const t=this.tape.tapeTransport();if(Math.abs(t.headSeconds-t.endSeconds)>.051)throw problem('FIELD_TAPE_NOT_CUED','The tape must finish cueing to its end before a new field take.');return t;
 }
 record(metadata={}){return this.operation(async()=>{
  if(this.active)throw problem('FIELD_ALREADY_RECORDING','Seal the current field take first.');
  if(!this.Recorder)throw problem('FIELD_CAPTURE_UNAVAILABLE','Continuous cabin recording is unavailable on this device. No take has been invented.');
  this.stopPlayback();const transport=await this.prepareAppend(),capacity=Number.isFinite(transport.capacitySeconds)?Math.max(0,transport.capacitySeconds-transport.endSeconds):Infinity;
  if(this.closing||this.disposed)throw problem('FIELD_DISPOSED','This cabin recording session has closed.');
  if(capacity<=0)throw problem('FIELD_TAPE_FULL','There is no blank tape remaining.');
  const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus','audio/webm'].find(type=>this.Recorder.isTypeSupported?.(type));
  const recorder=new this.Recorder(this.sink.stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:192000}),chunks=[];
  const c={recorder,chunks,startedAt:this.context.currentTime,pausedAt:null,pausedSeconds:0,capacitySeconds:capacity,stopped:false,reason:null,media:null,decodedDuration:null};
  c.result=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||mime||'audio/webm'}));recorder.onerror=e=>reject(problem('FIELD_CAPTURE_FAILED',e.error?.message||'Cabin audio capture failed.'));});c.result.catch(()=>{});
  const take=this.tape.beginContinuousFieldTake({runId:this.runId,place:'Source · recorded journey',metadata:clone(metadata)});if(!take)throw problem('FIELD_DECK_BUSY','The existing tape could not start this field take.');
  c.takeId=take.id;c.startSeconds=take.startSeconds;c.captureId=take.continuous.captureId;c.key=take.continuous.key;
  try{recorder.start(250);}catch(error){this.tape.cancelContinuousFieldTake?.(take.id,{runId:this.runId,captureId:c.captureId});throw error;}
  this.active=c;this.lastError=null;this.updateCapturePause();this.changed();return this.status();
 });}
 tick(){
  if(this.disposed)return this.status();const result=this.tape.tickPlayback?.(),transport=this.tape.tapeTransport();if(this.cueWait&&(result==='cued'||!this.tape.isPlaying?.()&&Math.abs(transport.headSeconds-transport.endSeconds)<.051))this.cueWait.resolve();
  const c=this.active;if(c&&!c.stopped){this.updateCapturePause();this.tape.advanceContinuousFieldTake(c.takeId,this.elapsed(),{runId:this.runId,captureId:c.captureId});if(this.elapsed()>=c.capacitySeconds&&!c.capacityStopQueued){c.capacityStopQueued=true;this.seal({reason:'capacity'}).catch(()=>{});}}
  return this.status();
 }
 seal(options={}){return this.operation(()=>this.sealNow(options));}
 unavailableCapture(c,error){this.tape.interruptContinuousFieldTake?.(c.takeId,{key:c.key,runId:this.runId,captureId:c.captureId,elapsedSeconds:c.stoppedElapsed||0,reason:'capture-unavailable'});this.active=null;this.changed();throw error;}
 async sealNow({reason='stop'}={}){
  const c=this.active;if(!c)return null;
  if(!c.stopped){c.stoppedElapsed=this.elapsed();this.tape.advanceContinuousFieldTake(c.takeId,c.stoppedElapsed,{runId:this.runId,captureId:c.captureId});c.reason=reason;c.stopped=true;if(c.recorder.state!=='inactive')c.recorder.stop();try{c.blob=await c.result;}catch(error){if(c.chunks.length)c.blob=new Blob(c.chunks,{type:c.recorder.mimeType});else return this.unavailableCapture(c,error);}}
  if(!c.media){
   if(!c.blob?.size)return this.unavailableCapture(c,problem('FIELD_EMPTY_MEDIA','The field take contains no captured samples. This attempt is marked unavailable.'));
   let buffer;try{buffer=await this.context.decodeAudioData(await c.blob.arrayBuffer());}catch(error){return this.unavailableCapture(c,problem('FIELD_CAPTURE_DECODE_FAILED','The captured field audio could not be decoded. This attempt is marked unavailable.'));}const frames=Math.min(buffer.length,Math.floor(c.capacitySeconds*buffer.sampleRate));
   if(frames<1)return this.unavailableCapture(c,problem('FIELD_EMPTY_MEDIA','The field take contains no captured samples. This attempt is marked unavailable.'));
   if(frames<buffer.length){c.blob=sourceDriveWav(buffer,frames);buffer=await this.context.decodeAudioData(await c.blob.arrayBuffer());}
   c.decodedDuration=buffer.length/buffer.sampleRate;
   c.media={schema:1,kind:SOURCE_DRIVE_CAPTURE_KIND,key:c.key,runId:this.runId,takeId:c.takeId,captureId:c.captureId,durable:true,mime:c.blob.type,bytes:c.blob.size,durationSeconds:c.decodedDuration,frames:buffer.length,sampleRate:buffer.sampleRate,channels:buffer.numberOfChannels,sha256:await sourceDriveBlobDigest(c.blob)};
  }
  // Storage is the commit boundary. On quota/write failure the actual blob and
  // open physical take remain retryable; no checkpoint claims durable audio.
  if(this.storage===sourceDriveAudioStore&&this.storageEpoch!==storageEpoch)throw problem('FIELD_RUN_CLEARED','This field capture belongs to a cleared run.');
  const stored=await this.storage.put(c.media,c.blob);if(!stored)throw problem('FIELD_STORAGE_FAILED','The captured cabin audio could not be stored locally.');
  const sealed=this.tape.sealContinuousFieldTake(c.takeId,{durationSeconds:c.media.durationSeconds,media:c.media,reason:c.reason});if(!sealed)throw problem('FIELD_TAPE_COMMIT_FAILED','The audio was stored, but its physical tape entry could not be sealed.');
  this.refs.set(c.media.key,clone(c.media));this.lastTakeId=c.takeId;this.active=null;this.lastError=null;this.changed();return clone(c.media);
 }
 play({takeId,destination=this.playbackDestination}={}){return this.operation(async()=>{await this.sealNow({reason:'playback'});if(this.closing||this.disposed)throw problem('FIELD_DISPOSED','This cabin recording session has closed.');const id=takeId||this.lastTakeId;if(!id)throw problem('FIELD_NO_TAKE','There is no recorded field take to play.');this.stopPlayback();const playing=this.tape.playTake(id,{continuousOutput:destination});if(!playing){const error=this.tape.playbackError?.();throw problem(error?.code||'FIELD_NO_TAKE',error?.message||'That physical tape take is unavailable.');}this.tape.setContinuousPlaybackPaused?.(this.paused);this.changed();return this.status();});}
 stopPlayback(){if(this.cueWait){this.cueWait.reject(problem('FIELD_CUE_CANCELLED','Tape cueing was stopped.'));this.cueWait=null;}this.tape.stopPlayback?.();}
 status(){const p=this.tape.playbackSnapshot?.(),transport=this.tape.tapeTransport();return{recording:!!this.active&&!this.active.stopped,playing:!!this.tape.isPlaying?.(),cuing:!!this.cueWait,paused:this.paused,elapsedSeconds:this.elapsed(),positionSeconds:p?.elapsedSec||0,headSeconds:transport.headSeconds,endSeconds:transport.endSeconds,tapeEndSeconds:transport.endSeconds,playbackTapeSeconds:p?.tapeSeconds??transport.headSeconds,lastTakeId:this.lastTakeId||null,takeRefs:[...this.refs.values()].map(clone),persistenceError:this.lastError?{...this.lastError}:null};}
 checkpoint(){const c=this.active;return{schema:1,kind:'source-drive-field-audio',runId:this.runId,takeRefs:[...this.refs.values()].map(clone),pending:c?{takeId:c.takeId,key:c.key,startSeconds:c.startSeconds,elapsedSeconds:this.elapsed(),state:c.stopped?'pending-storage':this.paused?'paused':'recording',durable:false}:null};}
 hydrate(checkpoint={}){return this.operation(async()=>{
  if(this.active)throw problem('FIELD_ACTIVE_RESTORE','Seal the active field take before restoring a checkpoint.');if(checkpoint.runId&&checkpoint.runId!==this.runId)throw problem('FIELD_WRONG_RUN','This audio checkpoint belongs to another run.');
  const result={recovered:[],missing:[],interrupted:null};this.refs.clear();
  for(const value of checkpoint.takeRefs||[]){const ref=normalizeSourceDriveMedia(value);if(!ref||ref.pending||ref.runId!==this.runId)continue;const entry=await this.storage.get(ref.key);if(entry?.blob?.size&&await sourceDriveBlobDigest(entry.blob)===ref.sha256){this.refs.set(ref.key,ref);this.lastTakeId=ref.takeId;result.recovered.push(ref.takeId);}else result.missing.push(ref.takeId);}
  const pending=checkpoint.pending;if(pending?.takeId){const entry=await this.storage.get(pending.key);const ref=normalizeSourceDriveMedia(entry?.ref);if(ref?.durable&&ref.runId===this.runId&&ref.key===pending.key&&entry.blob?.size&&await sourceDriveBlobDigest(entry.blob)===ref.sha256){const recovered=this.tape.sealContinuousFieldTake(pending.takeId,{durationSeconds:ref.durationSeconds,media:ref,reason:'recovered-storage'});if(recovered){this.refs.set(ref.key,ref);this.lastTakeId=ref.takeId;result.recovered.push(ref.takeId);}}else{this.tape.interruptContinuousFieldTake?.(pending.takeId,{key:pending.key,runId:this.runId,elapsedSeconds:pending.elapsedSeconds,reason:'interrupted-before-storage'});result.interrupted={takeId:pending.takeId,audioAvailable:false,elapsedSeconds:Math.max(0,finite(pending.elapsedSeconds))};}}
  this.changed();return result;
 });}
 dispose(){
  if(this.disposePromise)return this.disposePromise;if(this.disposed)return Promise.resolve();
  this.closing=true;this.stopPlayback();this.setPaused(true);
  const work=this.queue.catch(()=>{}).then(async()=>{try{await this.sealNow({reason:'session-close'});}catch(error){this.disposePromise=null;throw error;}this.context.removeEventListener?.('statechange',this.contextChanged);this.cabinBus.disconnect(this.sink);this.disposed=true;});this.queue=work;this.disposePromise=work;return work;
 }
}
