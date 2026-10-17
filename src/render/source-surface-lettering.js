// Source material data: RGB retains the original opaque coloured-ink raster;
// A is authored glyph coverage, not transparency. No narrative copy is edited.
import { WORLD_LETTERING_FONT_KEY, ensureWorldLetteringFonts, worldLetteringFontsStatus } from './world-lettering-fonts.js';
import { fitWorldLetteringLine } from './world-lettering-layout.js';

export const SOURCE_SURFACE_LETTERING = Object.freeze({ width:2048,height:2048,bands:8,bandHeight:256,rows:11,pitch:22,margin:4,maxFont:20,
  palette:Object.freeze(['#08ef43','#06bfff','#eff3df','#ff3028']) });
const copyOf = line => String(line?.text ?? line);

/** Reproduce the existing eight-band ordering and fallback/cycling exactly.
 * Its 11-row material budget is distinct from the full Source card corpus. */
export function sourceSurfaceLetteringRows(lines = []) {
  const spec=SOURCE_SURFACE_LETTERING, input=Array.isArray(lines)?lines:[];
  const exact=input.map(copyOf).filter(Boolean), grouped=new Map(), rows=[];
  for(const line of input){
    const layer=Math.max(1,Math.min(8,Number(line?.sourceLayer)||1));
    if(!grouped.has(layer))grouped.set(layer,[]);
    grouped.get(layer).push(copyOf(line));
  }
  for(let layer=1;layer<=spec.bands;layer++){
    const entries=grouped.get(layer)||exact;
    for(let row=0;row<spec.rows;row++)rows.push({layer,row,text:entries.length?entries[row%entries.length]:'',
      colour:spec.palette[(layer+row)%spec.palette.length],x:spec.margin,y:(layer-1)*spec.bandHeight+row*spec.pitch+spec.margin});
  }
  return rows;
}

export function sourceSurfaceLetteringKey(lines = []) {
  let h=2166136261;
  const text=JSON.stringify([WORLD_LETTERING_FONT_KEY,SOURCE_SURFACE_LETTERING,sourceSurfaceLetteringRows(lines)]);
  for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);
  return `source-surface-pinned-v1:${(h>>>0).toString(16)}`;
}

/** Paint identical geometry into opaque colour and transparent white ink.
 * The one-pixel interior allowance retains raster antialiasing inside a row. */
export function paintSourceSurfaceLettering(colour,mask,lines = []) {
  const spec=SOURCE_SURFACE_LETTERING, inset=1, reports=[];
  colour.save();mask.save();
  try{
    colour.clearRect(0,0,spec.width,spec.height);colour.fillStyle='#000';colour.fillRect(0,0,spec.width,spec.height);
    mask.clearRect(0,0,spec.width,spec.height);mask.fillStyle='#fff';
    colour.globalAlpha=mask.globalAlpha=1;colour.shadowBlur=mask.shadowBlur=0;
    for(const row of sourceSurfaceLetteringRows(lines)){
      const fit=fitWorldLetteringLine(colour,row.text,{width:spec.width-spec.margin*2-inset*2,height:spec.pitch-inset*2,maxFont:spec.maxFont,role:'mono'});
      if(!fit.fits)throw new Error(`Source material row does not fit: layer ${row.layer}, row ${row.row}`);
      const x=row.x+inset+fit.left,y=row.y+inset+fit.ascent;
      mask.font=fit.font;mask.fontKerning='none';mask.textAlign='left';mask.textBaseline='alphabetic';
      colour.fillStyle=row.colour;colour.fillText(fit.text,x,y);mask.fillText(fit.text,x,y);
      reports.push({...row,...fit,drawX:x,baseline:y,top:row.y+inset,bottom:row.y+inset+fit.ascent+fit.descent});
    }
  }finally{colour.restore();mask.restore();}
  return reports;
}

/** Keep all three colour channels exactly; replace only A with mask coverage. */
export function sourceSurfaceInkRGBA(colour,mask,{width=SOURCE_SURFACE_LETTERING.width,flipY=false}={}) {
  if(!colour||!mask||colour.length!==mask.length||colour.length%4)throw new RangeError('Source colour and ink masks need matching RGBA data');
  const pixels=new Uint8Array(colour);
  for(let i=3;i<pixels.length;i+=4)pixels[i]=mask[i];
  if(flipY){
    const stride=width*4,height=pixels.length/stride;
    if(!(width>0&&Number.isInteger(height)))throw new RangeError('Source raster row width does not match its byte length');
    const row=new Uint8Array(stride);
    for(let y=0;y<Math.floor(height/2);y++){
      const a=y*stride,b=(height-1-y)*stride;
      row.set(pixels.subarray(a,a+stride));pixels.copyWithin(a,b,b+stride);pixels.set(row,b);
    }
  }
  return pixels;
}

export function sourceSurfaceLetteringPixels(lines = [],{ownerDocument=globalThis.document,flipY=false}={}) {
  if(!worldLetteringFontsStatus(ownerDocument).ready)throw new Error('Source material fonts must load before baking');
  const spec=SOURCE_SURFACE_LETTERING, colour=ownerDocument.createElement('canvas'),mask=ownerDocument.createElement('canvas');
  colour.width=mask.width=spec.width;colour.height=mask.height=spec.height;
  const c=colour.getContext('2d',{alpha:false,willReadFrequently:true}),m=mask.getContext('2d',{willReadFrequently:true});
  const rows=paintSourceSurfaceLettering(c,m,lines),rgb=c.getImageData(0,0,spec.width,spec.height).data,ink=m.getImageData(0,0,spec.width,spec.height).data;
  return {width:spec.width,height:spec.height,pixels:sourceSurfaceInkRGBA(rgb,ink,{width:spec.width,flipY}),rows,
    rowOrigin:flipY?'bottom-left':'top-left',key:sourceSurfaceLetteringKey(lines),fontKey:WORLD_LETTERING_FONT_KEY};
}

/** Synchronous request facade for renderer APIs. A pending first request paints
 * nothing; once fonts load, only the newest snapshot is baked and invalidated.
 * A renderer/context disposal cancels all late writes through dispose(). */
export function createSourceSurfaceLetteringBaker({onReady,onError=()=>{},ownerDocument=globalThis.document,assetUrl,
  fontsReady=()=>worldLetteringFontsStatus(ownerDocument).ready,
  loadFonts=()=>ensureWorldLetteringFonts({ownerDocument,...(assetUrl?{assetUrl}:{})}),
  rasterize=lines=>sourceSurfaceLetteringPixels(lines,{ownerDocument,flipY:true})}={}) {
  if(typeof onReady!=='function')throw new TypeError('Source material baker requires its renderer upload callback');
  let latest=null,pending=null,disposed=false,completedKey='',error='',bakes=0;
  const bake=()=>{
    if(disposed||!latest||completedKey===latest.key)return;
    const request=latest,bitmap=rasterize(request.lines);onReady(bitmap);completedKey=request.key;error='';bakes++;
  };
  const fail=cause=>{error=String(cause?.message||cause);onError(cause);};
  return {
    request(lines=[]){
      if(disposed)return false;
      const snapshot=(Array.isArray(lines)?lines:[]).map(line=>({text:copyOf(line),sourceLayer:line?.sourceLayer}));
      latest={lines:snapshot,key:sourceSurfaceLetteringKey(snapshot)};
      if(fontsReady()){try{bake();return true;}catch(cause){fail(cause);return false;}}
      if(!pending)pending=Promise.resolve().then(loadFonts).then(()=>{if(!disposed)bake();}).catch(fail).finally(()=>{pending=null;});
      return false;
    },
    whenReady:()=>pending||Promise.resolve(),
    status:()=>({ready:!disposed&&!!completedKey&&!error,pending:!!pending,key:completedKey,requestedKey:latest?.key||'',bakes,error}),
    dispose(){disposed=true;latest=null;},
  };
}
