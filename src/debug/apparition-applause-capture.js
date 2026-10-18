// Developer evidence only: the game image and its existing program output,
// timestamped from the same browser. No microphone/device capture is requested.
export function createApparitionApplauseCapture({canvas,audioContext,output,snapshot,now=()=>performance.now()}={}){
  if(!canvas?.captureStream||!audioContext||!output||typeof MediaRecorder==='undefined')throw new Error('Capture unavailable');
  const image=document.createElement('canvas');image.width=768;image.height=480;
  const paint=image.getContext('2d'),tap=audioContext.createMediaStreamDestination();
  output.connect(tap);
  const video=image.captureStream(30),stream=new MediaStream([...video.getVideoTracks(),...tap.stream.getAudioTracks()]);
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:900000,audioBitsPerSecond:128000});
  const startedAtMs=now(),startedAudioTime=audioContext.currentTime,chunks=[],frames=[];
  let request=null,stopped=false,lastFrame=0;
  function draw(){
    if(stopped)return;
    const stamp=now(),state=snapshot();
    paint.fillStyle='#090909';paint.fillRect(0,0,image.width,image.height);
    paint.drawImage(canvas,0,0,image.width,image.height-30);
    const text=`${((stamp-startedAtMs)/1000).toFixed(3)}s | ctx ${audioContext.currentTime.toFixed(3)} | ${state.light||'-'} | ${state.card||'-'}`;
    paint.fillStyle='white';paint.font='13px monospace';paint.fillText(text,8,image.height-10);
    if(stamp-lastFrame>=32){frames.push({captureMs:stamp-startedAtMs,nowMs:stamp,audioTime:audioContext.currentTime,...state});lastFrame=stamp;}
    request=requestAnimationFrame(draw);
  }
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.start(500);draw();
  async function stop(){
    if(stopped)return null;stopped=true;cancelAnimationFrame(request);
    const ended=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await ended;
    try{output.disconnect(tap);}catch(_){}
    for(const track of stream.getTracks())track.stop();
    // A codecs list may contain a comma, which is also the data-URL delimiter.
    // Keep the container MIME here; the recorder metadata retains the codecs.
    const blob=new Blob(chunks,{type:recorder.mimeType.split(';')[0]});
    const dataUrl=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
    return{dataUrl,mime:recorder.mimeType,bytes:blob.size,startedAtMs,startedAudioTime,endedAtMs:now(),frames};
  }
  return{stop};
}
