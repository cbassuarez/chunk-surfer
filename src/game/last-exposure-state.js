// Only already-rendered images and already-committed consequences cross this
// boundary. These records never rewind a run or apply a punishment.
const point=value=>Number.isFinite(value?.x)&&Number.isFinite(value?.y)
  ?{x:value.x,y:value.y}:null;
const items=new Set(['recorder','torch','map','radio']);
export function normalizeHushRecovery(value,runId=''){
  if(!value||value.runId!==runId||!String(value.eventId||''))return null;
  const at=point(value.lostAt),lostItem=items.has(value.lostItem)?value.lostItem:null;
  if(lostItem&&!at)return null;
  return {schema:1,runId,eventId:String(value.eventId),kind:value.kind==='recoverable-defeat'?'recoverable-defeat':'taken',
    roomId:String(value.roomId||''),sourceRoomId:String(value.sourceRoomId||''),
    minutes:Math.max(0,Math.min(14,Math.floor(Number(value.minutes)||0))),
    lostItem,lostAt:at,lostGuess:point(value.lostGuess),guessLabel:String(value.guessLabel||''),pending:!!value.pending,
    injured:value.injured===true,recordingSpoiled:value.recordingSpoiled===true};
}
export function normalizeEndingExposure(value,{summaryId='',endingId=''}={}){
  if(!value||value.summaryId!==summaryId||value.endingId!==endingId)return null;
  const data=String(value.data||'');
  if(data.length>240000||!/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(data))return null;
  return {schema:1,summaryId,endingId,data};
}
export function captureExposureFrame(source,{documentApi=globalThis.document,width=1024,maxBytes=230000}={}){
  if(!source?.width||!source?.height||!documentApi?.createElement)return null;
  try{
    const canvas=documentApi.createElement('canvas');
    const scale=Math.min(1,width/source.width,576/source.height);
    canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)return null;
    ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,canvas.width,canvas.height);
    // Final dither is already in the source pixels. This copy is never run
    // back through the scene acquisition or quantizer.
    let data=canvas.toDataURL('image/webp',.88);
    if(data.length>maxBytes)data=canvas.toDataURL('image/jpeg',.76);
    return data.length<=maxBytes?{canvas,data}:null;
  }catch{return null;}
}
