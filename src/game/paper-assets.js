// Runtime side of the offline paper-production pipeline.
//
// Meaningful documents are resolved to immutable, pre-rasterised assets. This
// module does not shape text and it never invents physical damage. The only
// runtime variability is which texture tier is resident.

import { assetUrl } from '../platform/paths.js';
import { PAPER_ATLAS, PAPER_DOCUMENTS, PAPER_AMBIENT_IDS } from '../generated/paper-catalog.js';

const imageCache=new Map();

export function paperRecord(docOrId){
  const id=typeof docOrId==='string'?docOrId:docOrId?.id;
  return id?PAPER_DOCUMENTS[id]||null:null;
}

export function paperPageCount(docOrId){return Math.max(1,paperRecord(docOrId)?.pages?.length||1);}

export function paperPageAsset(docOrId,pageIndex=0){
  const record=paperRecord(docOrId);if(!record)return null;
  const page=Math.max(0,Math.min(record.pages.length-1,Math.floor(Number(pageIndex)||0)));
  const item=record.pages[page];
  return item?{...item,url:assetUrl(item.path),materialUrl:item.materialPath?assetUrl(item.materialPath):null,page,total:record.pages.length,record}:null;
}

export function paperAtlas(){return {...PAPER_ATLAS,url:assetUrl(PAPER_ATLAS.path)};}
export function paperAtlasIndex(docOrId,pageIndex=0){
  const record=paperRecord(docOrId);if(!record)return -1;
  const page=Math.max(0,Math.min((record.pages?.length||1)-1,Math.floor(Number(pageIndex)||0)));
  return record.pages?.[page]?.atlasIndex??record.atlasIndex??-1;
}

function hash32(value=''){let h=2166136261>>>0;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
export function ambientPaperDocumentId(seed=0,index=0){
  if(!PAPER_AMBIENT_IDS.length)return null;
  const at=(hash32(`${seed}:${index}`)%PAPER_AMBIENT_IDS.length)>>>0;
  return PAPER_AMBIENT_IDS[at]||null;
}

function loadImage(url){
  const key=String(url?.href||url||'');if(!key||typeof Image==='undefined')return Promise.resolve(null);
  const cached=imageCache.get(key);if(cached?.promise)return cached.promise;
  const entry={image:null,ready:false,error:null,promise:null};
  entry.promise=new Promise((resolve)=>{const image=new Image();entry.image=image;image.decoding='async';image.onload=()=>{entry.ready=true;resolve(image);};image.onerror=(error)=>{entry.error=error||new Error(`paper image ${key}`);resolve(null);};image.src=key;});
  imageCache.set(key,entry);return entry.promise;
}

export function preloadPaperDocument(docOrId){
  const record=paperRecord(docOrId);if(!record)return Promise.resolve([]);
  return Promise.all(record.pages.flatMap((page)=>[loadImage(assetUrl(page.path)),...(page.materialPath?[loadImage(assetUrl(page.materialPath))]:[])]));
}

export function paperImageState(docOrId,pageIndex=0){
  const asset=paperPageAsset(docOrId,pageIndex);if(!asset)return {asset:null,image:null,ready:false,error:null};
  const key=String(asset.url?.href||asset.url||'');const cached=imageCache.get(key);
  if(!cached){loadImage(asset.url);return {asset,image:null,ready:false,error:null};}
  return {asset,image:cached.image,ready:cached.ready,error:cached.error};
}


export function paperMaterialState(docOrId,pageIndex=0){
  const asset=paperPageAsset(docOrId,pageIndex);if(!asset?.materialUrl)return {asset,image:null,ready:false,error:null};
  const key=String(asset.materialUrl?.href||asset.materialUrl||'');const cached=imageCache.get(key);
  if(!cached){loadImage(asset.materialUrl);return {asset,image:null,ready:false,error:null};}
  return {asset,image:cached.image,ready:cached.ready,error:cached.error};
}

export function drawBakedPaper(ctx,docOrId,pageIndex,rect){
  const state=paperImageState(docOrId,pageIndex);if(!state.ready||!state.image)return false;
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(state.image,rect.x,rect.y,rect.w,rect.h);ctx.restore();return true;
}

export function paperAssetProbe(docOrId){
  const record=paperRecord(docOrId);if(!record)return {resolved:false,id:typeof docOrId==='string'?docOrId:docOrId?.id||null};
  return {resolved:true,id:record.id,pages:record.pages.length,format:record.format,issuer:record.issuer,template:record.template,reproduction:record.reproduction,stationeryProcess:record.stationeryProcess,entryProcess:record.entryProcess,handling:record.handling,handlingVector:record.handlingVector,semanticHash:record.semanticHash,atlasIndex:record.atlasIndex};
}
