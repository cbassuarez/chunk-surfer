// Short, local microphone slates. Room-level monitoring remains analyser-only.
// No speech recognition or network upload; encoded voice stays in IndexedDB.
const DB='chunk-surfer-take-slates';
let storageEpoch=0;
export function clearSlateAudio(){
  storageEpoch++;
  return new Promise(resolve=>{
    if(!globalThis.indexedDB){resolve();return;}
    const request=indexedDB.deleteDatabase(DB);
    request.onsuccess=resolve;request.onerror=resolve;
  });
}
const openStore=()=>new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(new Error('Local audio storage unavailable'));return;}
  const request=indexedDB.open(DB,1);
  request.onupgradeneeded=()=>request.result.createObjectStore('slates');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
export async function storeSlateAudio(key,blob){
  const epoch=storageEpoch;
  const db=await openStore();
  if(epoch!==storageEpoch){db.close();return null;}
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction('slates','readwrite');tx.objectStore('slates').put(blob,key);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
  return key;
}
export async function readSlateAudio(key){
  const db=await openStore();
  try{return await new Promise((resolve,reject)=>{
    const request=db.transaction('slates').objectStore('slates').get(key);
    request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);
  });}finally{db.close();}
}
export function captureSlate(stream){
  const Recorder=globalThis.MediaRecorder;
  if(!Recorder||!stream?.active)return null;
  try{
    const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(type=>Recorder.isTypeSupported(type));
    const recorder=new Recorder(stream,{...(mimeType?{mimeType}:{}),audioBitsPerSecond:24000});
    const chunks=[];let bytes=0,failed=false;
    const result=new Promise(resolve=>{
      recorder.ondataavailable=event=>{
        bytes+=event.data.size;
        if(bytes<=128*1024)chunks.push(event.data);
        else {failed=true;if(recorder.state!=='inactive')recorder.stop();}
      };
      recorder.onerror=()=>{failed=true;resolve(null);};
      recorder.onstop=()=>resolve(!failed&&chunks.length?new Blob(chunks,{type:recorder.mimeType}):null);
    });
    recorder.start(250);
    return {
      get state(){return recorder.state;},
      setPaused(paused){
        if(paused&&recorder.state==='recording')recorder.pause();
        else if(!paused&&recorder.state==='paused')recorder.resume();
      },
      stop(){if(recorder.state!=='inactive')recorder.stop();return result;},
    };
  }catch{return null;}
}

export function makeTakeSlate({room,ordinal,date=new Date()}={}){
  const day=new Date(date).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  return {text:`Ellery. ${room}. Room tone. Take ${ordinal}. ${day}.`,mode:'player',voiceSeconds:0,quietSeconds:0,elapsed:0};
}

export function tickTakeSlate(slate,{dt=0,level=0,threshold=.012}={}){
  const seconds=Math.max(0,Number(dt)||0);
  slate.elapsed+=seconds;
  if(level>=threshold){slate.voiceSeconds+=seconds;slate.quietSeconds=0;}
  else slate.quietSeconds+=seconds;
  return slate.voiceSeconds>=.6&&slate.quietSeconds>=1.1;
}
