#!/usr/bin/env node
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { WORK_ORDER, PAGES } from '../src/data/conservatory-script.js';
import { SOURCE_PAGES, sourcePageDocument } from '../src/data/source-pages.js';
import {
  PAPER_FORMAT, PAPER_ISSUER, PAPER_REPRODUCTION, PAPER_STOCK, PAPER_TEMPLATE, PAPER_PRINT_PROCESS,
  normalizePhysicalDocument, validateBritishPaperDocument, paperHandlingVector,
} from '../src/data/paper-system.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=path.join(ROOT,'assets/paper');
const INSPECT=path.join(OUT,'inspect');
const MATERIAL=path.join(OUT,'material');
const TMP=path.join(ROOT,'.paper-build');
const TILES=path.join(TMP,'tiles');
const HASHES=path.join(TMP,'hashes');
const GENERATED=path.join(ROOT,'src/generated/paper-catalog.js');
const INSPECT_W=2048, INSPECT_H=2896;
const MATERIAL_W=1024, MATERIAL_H=1448;
const WORLD_TILE_W=128, WORLD_TILE_H=181, ATLAS_COLS=16;
const COMPILER_VERSION='paper-v1.5.0-paper3d-print-history';
const RASTERIZER_VERSION='paper-raster-v1.4-impact-readable';
const PT_MM=25.4/72;

// VENDORED, NOT LOOKED UP.
//
// These were four family NAMES resolved through fc-match at build time, and the
// fingerprint below was supposed to make a substitution invalidate every
// affected page. It could not: fc-match ALWAYS returns something, so a machine
// without Nimbus Roman silently baked Times and hashed it as a perfectly valid
// fingerprint. Two builds of the same sheet on two machines differed and the
// catalog called both of them fine.
//
// So the faces are committed under assets/fonts and resolved by PATH. The
// fingerprint is now the hash of the file that will actually be drawn with, and
// a missing face fails the build instead of quietly becoming Helvetica.
//
// `condensed` is gone rather than vendored: TeXGyreHerosCondensed has no call
// sites at all, and an unused font entry is a substitution waiting to be blamed
// for something it did not do. `sans` stays — six forms set their machine-entry
// fields in it (`valueKind:'sans'`), and retiring it would have silently
// restyled six documents to make a font table tidier.
const FONT_DIR=path.join(ROOT,'assets/fonts');
const FONT_MANIFEST=JSON.parse(readFileSync(path.join(FONT_DIR,'manifest.json'),'utf8'));
const FONT=Object.freeze(Object.fromEntries(
  Object.entries(FONT_MANIFEST.families).map(([kind,entry])=>[kind,entry.name])));

function sha(value){return createHash('sha256').update(value instanceof Uint8Array?value:String(value)).digest('hex');}
export function fontFacePath(kind,{weight=400,italic=false}={}){
  const family=FONT_MANIFEST.families[kind];
  if(!family)throw new Error(`paper: no vendored family for "${kind}"`);
  const face=weight>=650?(italic?'boldItalic':'bold'):(italic?'italic':'regular');
  const entry=family.faces[face]||family.faces.regular;
  const file=path.join(FONT_DIR,entry.file);
  if(!existsSync(file))throw new Error(`paper: vendored face missing: ${entry.file} (run git lfs / re-fetch assets/fonts)`);
  return file;
}
function fontFingerprint(kind){
  const family=FONT_MANIFEST.families[kind];
  // Every face of the family, so italicising a document also invalidates it.
  return sha(Object.values(family.faces).map((f)=>{
    const file=path.join(FONT_DIR,f.file);
    if(!existsSync(file))throw new Error(`paper: vendored face missing: ${f.file}`);
    const actual=sha(readFileSync(file));
    if(actual!==f.sha256)throw new Error(`paper: ${f.file} does not match assets/fonts/manifest.json`);
    return `${f.file}:${actual}`;
  }).join('|'));
}
const FONT_FINGERPRINT=Object.freeze(Object.fromEntries(Object.keys(FONT_MANIFEST.families).map((k)=>[k,fontFingerprint(k)])));
// THE TYPE SCALE, AND THE GRID THAT FOLLOWS FROM IT.
//
// Body and heading are the two sizes anybody actually chooses; everything else
// is a fixed relationship to the body so a form's internal hierarchy survives a
// resize instead of being re-typed by hand nine times.
//
// RULE PITCH IS DERIVED, NOT DECLARED. It used to be a `spacing` typed into
// ruledArea and a `leading` typed into renderParagraphs, two numbers that had to
// agree and nothing made them: eight of the nine templates disagreed, and the
// works order ran rules at 6.00mm against text at 5.35mm — a full line out after
// ten. There is now one number, computed here, and no way to type a second.
const TYPE=Object.freeze({
  body:12,
  heading:16,
  get label(){return this.body*0.87;},     // small caps under the body
  get fieldValue(){return this.body*1.01;}, // machine entry, a hair above it
  get areaLabel(){return this.body*0.84;},
  // Ruled stationery is set about one and a half ems apart.
  get pitch(){return this.body*PT_MM*1.5;},
});

function slug(id){return `${String(id).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,64)}-${sha(id).slice(0,8)}`;}
function esc(s=''){return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function seeded(seed){let s=parseInt(sha(seed).slice(0,8),16)>>>0;return()=>{s+=0x6d2b79f5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
function issuerById(id){return Object.values(PAPER_ISSUER).find((x)=>x.id===id)||PAPER_ISSUER.UNBRANDED;}
function reproById(id){return Object.values(PAPER_REPRODUCTION).find((x)=>x.id===id)||PAPER_REPRODUCTION.ORIGINAL_CLEAN;}
function stockById(id){return Object.values(PAPER_STOCK).find((x)=>x.id===id)||PAPER_STOCK.OFFICE_WHITE;}
function fontFamily(kind='serif'){
  const family=FONT[kind];
  if(!family)throw new Error(`paper: unknown font kind "${kind}" — the vendored families are ${Object.keys(FONT).join(', ')}`);
  // The generic keeps the SVG valid for any other viewer; the rasteriser never
  // reaches it, because it resolves the family name straight to a vendored file.
  return `'${family.replaceAll("'",'')}',${kind==='mono'?'monospace':'serif'}`;
}
function processAttr(process){return process?` data-process="${esc(process)}"`:'';}
function text(x,y,value,{size=TYPE.body,weight=400,color='#252525',tracking=0,kind='serif',opacity=1,anchor='start',italic=false,rotate=0,process=null}={}){
  const tx=Number(x).toFixed(3),ty=Number(y).toFixed(3),transform=rotate?` transform="rotate(${Number(rotate).toFixed(3)} ${tx} ${ty})"`:'';
  return `<text x="${tx}" y="${ty}"${transform}${processAttr(process)} font-family="${fontFamily(kind)}" font-size="${(size*PT_MM).toFixed(4)}" font-weight="${weight}"${italic?' font-style="italic"':''} letter-spacing="${(tracking*PT_MM).toFixed(4)}" fill="${color}" fill-opacity="${opacity.toFixed(3)}" text-anchor="${anchor}">${esc(value)}</text>`;
}
function line(x1,y1,x2,y2,{color='#494846',opacity=.42,width=.24,dash='',process='preprinted-stationery'}={}){return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"${processAttr(process)} stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`;}
function box(x,y,w,h,{stroke='#454441',opacity=.5,width=.28,fill='none',fillOpacity=1,rx=0,process='preprinted-stationery'}={}){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"${processAttr(process)} fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-opacity="${opacity}" stroke-width="${width}"/>`;}
function label(x,y,value,{color='#403E39',size=TYPE.label,anchor='start'}={}){return text(x,y,String(value).toUpperCase(),{size,weight:600,color,tracking:.08,anchor,kind:'serif',process:'preprinted-stationery'});}
function fieldValue(x,y,value,{kind='mono',size=TYPE.fieldValue,color='#232321',anchor='start',weight=400,process=null}={}){return text(x,y,value,{size,kind,color,anchor,weight,process});}
function heading(x,y,value,{size=TYPE.heading,anchor='start',color='#2C2A26'}={}){return text(x,y,value,{size,weight:700,kind:'serif',tracking:.025,anchor,color,process:'preprinted-stationery'});}

function approxChars(widthMm,sizePt,kind='sans'){
  const em=kind==='mono'?.60:kind==='serif'?.50:.52;
  return Math.max(8,Math.floor(widthMm/(sizePt*PT_MM*em)));
}
function wrapWords(value,widthMm,sizePt=8.2,kind='sans'){
  const max=approxChars(widthMm,sizePt,kind),words=String(value??'').trim().split(/\s+/).filter(Boolean);
  if(!words.length)return [''];
  const out=[];let row='';
  for(const word of words){const next=row?`${row} ${word}`:word;if(row&&next.length>max){out.push(row);row=word;}else row=next;}
  if(row)out.push(row);return out;
}
function parseField(value=''){
  const raw=String(value).trim();
  const m=raw.match(/^([A-Z][A-Z0-9 /._?-]{0,26}?)(?:\:\s*|\s{2,})(\S.*)$/);
  return m?{label:m[1].trim(),value:m[2].trim()}:null;
}
function logicalEntries(doc){
  const out=[];
  for(const entry of Array.isArray(doc.body)?doc.body:[]){
    if(entry===''){out.push({kind:'blank'});continue;}
    if(typeof entry==='string'){out.push({kind:'paragraph',text:entry});continue;}
    if(entry?.rule){out.push({kind:'rule'});continue;}
    if(entry?.raw!=null){const raw=String(entry.raw);const f=parseField(raw);out.push(f?{kind:'field',...f,raw,cls:entry.cls||''}:{kind:'raw',text:raw,cls:entry.cls||''});continue;}
    if(entry?.text!=null)out.push({kind:'paragraph',text:String(entry.text)});
  }
  return out;
}
function pageCapacity(template,doc){
  if(doc?.paper?.pageCapacity)return Number(doc.paper.pageCapacity)||34;
  if(doc?.id==='work-order')return 12;
  if(template===PAPER_TEMPLATE.FIELD_LOG)return 34;
  return 34;
}
function entryCost(entry){
  if(entry.kind==='blank')return .65;if(entry.kind==='rule')return .75;if(entry.kind==='paragraph')return 1.65;if(entry.kind==='field')return .9;return 1.05;
}
function paginate(doc,physical){
  const all=logicalEntries(doc),pages=[[]];let used=0,capacity=pageCapacity(physical.template,doc);
  for(const entry of all){const c=entryCost(entry);if(pages.at(-1).length&&used+c>capacity){pages.push([]);used=0;}pages.at(-1).push(entry);used+=c;}
  return pages.length?pages:[[]];
}
function takeFields(entries,names=null){
  const map=new Map(),rest=[];
  for(const entry of entries){
    if(entry.kind==='field'&&(!names||names.includes(entry.label.toUpperCase()))&&!map.has(entry.label.toUpperCase()))map.set(entry.label.toUpperCase(),entry.value);
    else rest.push(entry);
  }
  return {map,rest};
}
function firstValue(map,...keys){for(const k of keys){if(map.has(k))return map.get(k);}return '';}
function extractTime(title=''){return String(title).match(/(?:—|-)\s*([^—]+)$/)?.[1]?.trim()||'';}
function extractSheet(byline='',fallback=1){return String(byline).match(/(?:sheet\s*)?(\d+)/i)?.[1]||String(fallback);}
function workReference(doc){return String(doc.title||'').match(/\b(\d{3,5}-[A-Z])\b/i)?.[1]||String(doc.id||'').match(/\b(\d{3,5}-[A-Z])\b/i)?.[1]||'4417-C';}

function paperStockSvg(stock,rng,{copy=false,generations=0}={}){
  const base=copy?(generations>=4?'#E8E7E2':'#ECEBE6'):stock.tone;
  const seed=Math.floor(rng()*9999)+1;
  const edge=.010+(copy?Math.min(.018,generations*.0028):0);
  const fibers=[];
  for(let i=0;i<26;i++){
    const y=(rng()*297).toFixed(2),x0=(-10+rng()*30).toFixed(2),x1=(190+rng()*35).toFixed(2);
    fibers.push(`<path d="M ${x0} ${y} C 55 ${(Number(y)+(rng()-.5)*.8).toFixed(2)}, 155 ${(Number(y)+(rng()-.5)*.8).toFixed(2)}, ${x1} ${(Number(y)+(rng()-.5)*.45).toFixed(2)}" stroke="#6D685F" stroke-opacity="${(.004+rng()*.006).toFixed(4)}" stroke-width="${(.035+rng()*.05).toFixed(3)}" fill="none"/>`);
  }
  // Do not fake paper tooth with large translucent blobs. The restricted
  // production rasterizer adds calibrated sub-visible stock variation after
  // vector composition; the SVG fallback retains only fine fibres/noise.
  return `<defs><linearGradient id="edgeTone" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#5B574F" stop-opacity="${edge.toFixed(3)}"/><stop offset=".08" stop-color="#FFFFFF" stop-opacity="0"/><stop offset=".90" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="1" stop-color="#4E4B45" stop-opacity="${(edge*1.25).toFixed(3)}"/></linearGradient><filter id="stockGrain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.045 0.11" numOctaves="2" seed="${seed}"/><feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.33  0 0 0 0 0.29  0 0 0 .010 0"/></filter></defs><rect width="210" height="297" fill="${base}"/><rect width="210" height="297" filter="url(#stockGrain)" opacity=".40"/>${fibers.join('')}<rect width="210" height="297" fill="url(#edgeTone)"/>`;
}
function reproductionDefectsSvg(rng,repro){
  if(!repro.copy)return '';
  const g=repro.generations||1,out=[];
  // One stable copier-family defect, plus sparse generation accumulation. Early
  // copies remain boring; this is reproduction provenance, not a horror filter.
  const streakX=(28+rng()*154).toFixed(2);
  out.push(`<rect x="${streakX}" y="0" width="${(.08+g*.015).toFixed(3)}" height="297" fill="#222" fill-opacity="${(.004+g*.0015).toFixed(3)}"/>`);
  const count=Math.min(36,3+g*4);
  for(let i=0;i<count;i++)out.push(`<circle cx="${(2+rng()*206).toFixed(2)}" cy="${(2+rng()*293).toFixed(2)}" r="${(.035+rng()*.11).toFixed(3)}" fill="#242424" fill-opacity="${(.006+g*.0015+rng()*.008).toFixed(3)}"/>`);
  if(g>=4)out.push(`<rect x="0" y="0" width="210" height="297" fill="#333" fill-opacity="${Math.min(.022,.0035*g).toFixed(3)}"/>`);
  return out.join('');
}
function authoredMarksSvg(doc,pageIndex){
  const marks=(doc?.paper?.marks||[]).filter((mark)=>Math.max(0,Math.floor(Number(mark?.page)||0))===pageIndex),out=[];
  for(const mark of marks){
    const x=clamp(Number(mark.x)||0,0,1)*210,y=clamp(Number(mark.y)||0,0,1)*297,alpha=clamp(Number(mark.alpha)??.5,0,1);
    if(mark.type==='underline'){
      const w=clamp(Number(mark.w)||.2,.01,1)*210;
      out.push(`<path d="M ${x.toFixed(2)} ${y.toFixed(2)} q ${(w*.46).toFixed(2)} .42 ${w.toFixed(2)} .10" fill="none" stroke="#1F3958" stroke-opacity="${alpha.toFixed(3)}" stroke-width=".40" stroke-linecap="round"/>`);
    }else if(mark.type==='note'&&mark.text){
      const rotate=clamp(Number(mark.rotate)||0,-18,18);
      out.push(text(x,y,mark.text,{size:10.2,kind:'serif',italic:true,color:'#1F3958',opacity:alpha,rotate,process:'biro'}));
    }
  }
  return out.join('');
}
function handlingMarksSvg(handling={}){
  let out='';
  for(const fold of Array.isArray(handling?.folds)?handling.folds:[]){
    if(fold?.axis!=='horizontal')continue;
    const y=clamp(Number(fold.positionMm)||0,1,296),strength=clamp(Number(fold.strength)||0,0,1),dir=fold.direction==='valley'?-1:1;
    // A handled fold is a band of compressed/abraded stock, not a single SVG
    // hairline. Dark/light registration also lets the material map create a
    // causal crease under grazing light.
    out+=`<rect x="3" y="${(y-.62).toFixed(2)}" width="204" height="1.35" data-process="handling" fill="#6A645A" fill-opacity="${(.012+.026*strength).toFixed(3)}"/>`;
    out+=line(2.5,y-.24*dir,207.5,y-.24*dir,{color:'#5D574D',opacity:.045+.115*strength,width:.20,process:'handling'});
    out+=line(2.5,y+.17*dir,207.5,y+.17*dir,{color:'#FFFFFF',opacity:.070+.155*strength,width:.22,process:'handling'});
    out+=line(6,y+.58*dir,204,y+.58*dir,{color:'#81796C',opacity:.020+.045*strength,width:.12,process:'handling'});
  }
  if(handling?.paperclip){
    const op=.075+.14*clamp(Number(handling.paperclip.strength)||0,0,1);
    out+=line(17.8,5.3,17.8,20.6,{color:'#5F594F',opacity:op,width:.20,process:'handling'});
    out+=line(20.1,6.4,20.1,18.8,{color:'#FFFFFF',opacity:op*.62,width:.22,process:'handling'});
    out+=line(22.0,7.2,22.0,17.7,{color:'#777066',opacity:op*.42,width:.13,process:'handling'});
  }
  const moisture=handling?.moisture;
  if(moisture){
    const strength=clamp(Number(moisture.strength)||0,0,1),r=clamp(Number(moisture.radiusMm)||28,10,55);
    const right=String(moisture.edge||'').includes('right'),cx=right?194:16,cy=278;
    // Low-saturation tide rings and a broad absorbed patch. These are visible
    // in blank paper but remain quieter than the print itself.
    out+=`<circle cx="${cx}" cy="${cy}" r="${r}" data-process="handling" fill="#8A806B" fill-opacity="${(.012+.050*strength).toFixed(3)}" stroke="#766B57" stroke-opacity="${(.045+.105*strength).toFixed(3)}" stroke-width=".34"/>`;
    out+=`<circle cx="${cx+(right?-3:3)}" cy="${cy-4}" r="${(r*.74).toFixed(2)}" data-process="handling" fill="none" stroke="#8B8068" stroke-opacity="${(.025+.075*strength).toFixed(3)}" stroke-width=".22"/>`;
    out+=`<circle cx="${cx+(right?-6:6)}" cy="${cy-7}" r="${(r*.43).toFixed(2)}" data-process="handling" fill="none" stroke="#A39A87" stroke-opacity="${(.020+.055*strength).toFixed(3)}" stroke-width=".16"/>`;
  }
  const wear=clamp(Number(handling?.edgeWear)||0,0,1);
  if(wear>0){
    for(let i=0;i<7;i++){
      const yy=38+i*31.4,dx=(i%3)*.55;
      out+=line(1.2+dx,yy,4.2+dx,yy+.45,{color:'#6B6458',opacity:.018+.075*wear,width:.17,process:'handling'});
      out+=line(205.8-dx,yy+8,208.4-dx,yy+7.5,{color:'#FFFFFF',opacity:.020+.060*wear,width:.16,process:'handling'});
    }
  }
  if(handling?.tear){
    const d=clamp(Number(handling.tear.depthMm)||0,0,40);
    for(let i=0;i<6;i++){
      const y=286-i*2.7,x=210-d*(i/5)*.72;
      out+=line(x,y,Math.min(209.5,x+2.4+i*.45),y-1.2,{color:i%2?'#FFFFFF':'#756E62',opacity:.055+.018*i,width:.13,process:'handling'});
    }
  }
  return out;
}
function issuerSealSvg(issuer,{copy=false,repro=null}={}){
  if(!issuer?.seal)return '';
  const faded=copy?Math.min(.16,.015*(repro?.generations||1)):0,ink=copy?'#2E2E2D':issuer.stationeryInk;
  const op=(.78-faded).toFixed(3),hair=(.54-faded).toFixed(3),process=' data-process="preprinted-stationery"';
  if(issuer.seal==='trade'){
    return `<g id="ellery-works-seal"${process}>
      <circle cx="24" cy="12.8" r="7.2" fill="none" stroke="${ink}" stroke-opacity="${op}" stroke-width=".34"/>
      <circle cx="24" cy="12.8" r="6.2" fill="none" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".19"/>
      ${text(24,13.8,'WE',{size:8.6,weight:700,kind:'serif',anchor:'middle',color:ink,opacity:.88-faded,process:'preprinted-stationery'})}
      ${text(24,18.0,'WORKS',{size:4.2,weight:600,kind:'serif',anchor:'middle',color:ink,opacity:.58-faded,process:'preprinted-stationery'})}
    </g>`;
  }
  return `<g id="conservatoire-seal"${process}>
    <circle cx="24" cy="13.2" r="8.1" fill="none" stroke="${ink}" stroke-opacity="${op}" stroke-width=".34"/>
    <circle cx="24" cy="13.2" r="6.9" fill="none" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".20"/>
    <line x1="20.4" y1="16.6" x2="20.4" y2="10.5" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".24"/>
    <line x1="27.6" y1="16.6" x2="27.6" y2="10.5" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".24"/>
    <line x1="20.4" y1="10.5" x2="22.1" y2="8.9" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".24"/>
    <line x1="27.6" y1="10.5" x2="25.9" y2="8.9" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".24"/>
    <line x1="22.1" y1="8.9" x2="25.9" y2="8.9" stroke="${ink}" stroke-opacity="${hair}" stroke-width=".24"/>
    ${text(24,13.9,'ECM',{size:6.4,weight:700,kind:'serif',anchor:'middle',color:ink,opacity:.84-faded,process:'preprinted-stationery'})}
    ${text(24,18.1,'1896',{size:4.7,kind:'serif',anchor:'middle',color:ink,opacity:.60-faded,process:'preprinted-stationery'})}
  </g>`;
}
function headerSvg(issuer,{compact=false,copy=false,repro=null,showAddress=false}={}){
  if(!issuer.mark)return '';
  const faded=copy?Math.min(.16,.015*(repro?.generations||1)):0,ink=copy?'#2E2E2D':issuer.stationeryInk;
  let out='';
  if(issuer.id==='ellery-works'){
    out+=issuerSealSvg(issuer,{copy,repro});
    out+=text(compact?17:34,11.8,issuer.mark,{size:compact?13.0:16.2,weight:700,kind:'serif',tracking:.03,color:ink,opacity:.96-faded,process:'preprinted-stationery'});
    if(!compact&&issuer.descriptor)out+=text(34,17.0,issuer.descriptor,{size:8.4,weight:600,kind:'serif',tracking:.12,color:ink,opacity:.78-faded,process:'preprinted-stationery'});
    if(!compact&&issuer.address?.length){
      out+=text(193,10.0,issuer.address[0],{size:7.5,kind:'serif',color:ink,opacity:.73-faded,anchor:'end',process:'preprinted-stationery'});
      out+=text(193,14.0,issuer.address[1]||'',{size:7.5,kind:'serif',color:ink,opacity:.73-faded,anchor:'end',process:'preprinted-stationery'});
      out+=text(193,18.0,`Telephone ${issuer.telephone}${issuer.fax?`   Fax ${issuer.fax}`:''}`,{size:7.1,kind:'serif',color:ink,opacity:.68-faded,anchor:'end',process:'preprinted-stationery'});
    }
    out+=line(17,compact?18.2:23.0,193,compact?18.2:23.0,{color:ink,opacity:.42-faded*.3,width:.26});
  }else{
    out+=issuerSealSvg(issuer,{copy,repro});
    out+=text(36.5,9.8,issuer.mark,{size:13.8,weight:700,kind:'serif',tracking:.015,color:ink,opacity:.96-faded,process:'preprinted-stationery'});
    if(issuer.descriptor)out+=text(36.5,14.2,issuer.descriptor,{size:7.4,weight:600,kind:'serif',tracking:.13,color:ink,opacity:.70-faded,process:'preprinted-stationery'});
    if(issuer.address?.length){
      out+=text(36.5,18.1,issuer.address.join(' · '),{size:6.9,kind:'serif',color:ink,opacity:.67-faded,process:'preprinted-stationery'});
      out+=text(36.5,21.8,`Telephone ${issuer.telephone}${issuer.fax?`   Fax ${issuer.fax}`:''}`,{size:6.7,kind:'serif',color:ink,opacity:.64-faded,process:'preprinted-stationery'});
    }
    if(issuer.department)out+=text(17,27.0,issuer.department,{size:9.2,weight:700,kind:'serif',tracking:.08,color:ink,opacity:.86-faded,process:'preprinted-stationery'});
    const formCode=`${issuer.formPrefix||'E.C.M.'}/98`;
    out+=text(193,27.0,`FORM ${formCode}   REV. 4/98`,{size:6.3,kind:'serif',color:ink,opacity:.58-faded,anchor:'end',process:'preprinted-stationery'});
    out+=line(17,30.1,193,30.1,{color:ink,opacity:.40-faded*.25,width:.24});
  }
  return out;
}
function documentFooter(issuer,pageIndex,total,{ref='',copy=false,repro=null}={}){
  const faded=copy?Math.min(.16,.015*(repro?.generations||1)):0,color='#56534E';
  let left='FILE COPY';
  if(issuer.id==='ellery-works')left=ref?`W. ELLERY / WORKS · JOB ${ref}`:'W. ELLERY / WORKS · WEST YORKSHIRE';
  else if(issuer.department)left=`ELLERY CONSERVATOIRE OF MUSIC · ${issuer.department}`;
  return `${line(17,282.0,193,282.0,{color,opacity:.24-faded*.2,width:.18})}${text(17,286.4,left,{size:6.7,kind:'serif',color,opacity:.54-faded,process:'preprinted-stationery'})}${text(193,286.4,`SHEET ${pageIndex+1} OF ${total}`,{size:6.7,kind:'serif',color,opacity:.54-faded,anchor:'end',process:'preprinted-stationery'})}`;
}
function renderParagraphs(entries,{x=20,width=170,size=TYPE.body,kind='serif',color='#242321',indent=0,
  grid=null,y=58,bottom=270,blankLines=1}={}){
  // ON THE RULES, OR ON NOTHING.
  //
  // When a `grid` is handed in — which is every ruled template — the first line
  // sits on the first rule and EVERY vertical advance is a whole number of
  // pitches. That last part matters as much as the pitch itself: a paragraph gap
  // of 2.7mm on a 6.35mm grid puts the rest of the page permanently between the
  // lines, which is most of what made these sheets look wrong even where the
  // leading happened to match.
  const pitch=grid?grid.pitch:5.25;
  const stop=grid?grid.bottom:bottom;
  let out='',cy=grid?grid.first:y;
  const step=(n=1)=>{cy+=pitch*n;};
  for(const entry of entries){
    if(cy>stop)break;
    if(entry.kind==='blank'){step(blankLines);continue;}
    if(entry.kind==='rule'){out+=line(x,cy,width+x,cy,{opacity:.28,width:.20});step();continue;}
    if(entry.kind==='field'){
      out+=label(x,cy,entry.label);out+=fieldValue(x+37,cy,entry.value,{size:TYPE.fieldValue});step();continue;
    }
    const raw=entry.text??entry.raw??'';
    const lines=wrapWords(raw,width-indent,size,kind);
    for(const row of lines){if(cy>stop)break;out+=text(x+indent,cy,row,{size,kind,color,opacity:.94});step();}
    if(entry.kind==='paragraph')step();
  }
  return {svg:out,y:cy};
}
function ruledArea(x,y,w,h,{labelText='',leftGutter=0}={}){
  // Traditional ruled stationery: open field, no shaded HTML-table header and
  // no enclosing UI rectangle. The form printer supplies only hairlines and a
  // modest small-cap legend.
  //
  // Returns its GRID as well as its ink, because the body that goes into this
  // area has to sit on these rules and the only way to guarantee that is to
  // hand it the same numbers rather than let it invent its own.
  const spacing=TYPE.pitch;
  let out='';
  let start=y;
  if(labelText){
    out+=label(x,y+4.8,labelText,{size:TYPE.areaLabel});
    out+=line(x,y+7.0,x+w,y+7.0,{color:'#4F4B44',opacity:.42,width:.24});
    out+=line(x,y+7.72,x+w,y+7.72,{color:'#6B665D',opacity:.17,width:.14});
    start=y+7.72+spacing;
  }else{
    out+=line(x,y,x+w,y,{color:'#5B574F',opacity:.30,width:.18});
    start=y+spacing;
  }
  const bottom=y+h-1;
  for(let yy=start;yy<bottom;yy+=spacing)out+=line(x+(leftGutter||0),yy,x+w,yy,{color:'#716C63',opacity:.18,width:.15});
  if(leftGutter)out+=line(x+leftGutter,y+(labelText?7.72:0),x+leftGutter,y+h,{color:'#716C63',opacity:.20,width:.16});
  return {svg:out,grid:{first:start,pitch:spacing,bottom}};
}
function fieldRow(x,y,w,labelText,value,{labelW=32,h=8,valueKind='mono',shade=true}={}){
  // Preprinted office forms usually leave machine-entry space rather than
  // turning each datum into a spreadsheet cell. Labels and baselines are
  // stationery; the value inherits the later office-printer process.
  const baseline=y+Math.min(h-2.0,5.9),valueX=x+labelW;
  let out=label(x,baseline,labelText,{size:TYPE.label});
  out+=line(valueX,baseline+1.35,x+w,baseline+1.35,{color:'#5E5A52',opacity:.31,width:.17});
  const lines=wrapWords(value,w-labelW-2.2,11.2,valueKind).slice(0,Math.max(1,Math.floor(h/4.2)));
  lines.forEach((row,i)=>{out+=fieldValue(valueX+1.4,baseline+i*4.35,row,{size:TYPE.fieldValue,kind:valueKind});});
  return out;
}
function templateWorkOrder(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,ref=workReference(doc);let out=headerSvg(issuer,{copy,repro,showAddress:pageIndex===0});
  const titleY=pageIndex===0?31.5:28.5;
  out+=heading(17,titleY,pageIndex===0?'WORKS ORDER':'WORKS ORDER — CONTINUATION',{size:13.4});
  out+=text(193,titleY,`Works Ref.  ${ref}`,{size:9.0,kind:'serif',anchor:'end',weight:600,process:'preprinted-stationery'});
  const {map,rest}=takeFields(entries,['SITE','ADDRESS','WINDOW','DELIVER','AUTHORISED','RETURNED']);
  let y=44;
  if(pageIndex===0){
    for(const k of ['SITE','ADDRESS','WINDOW','DELIVER']){const v=firstValue(map,k);if(v){out+=fieldRow(17,y,176,k,v,{labelW:28,h:8});y+=8;}}
    for(const k of ['AUTHORISED','RETURNED']){const v=firstValue(map,k);if(v){out+=fieldRow(17,y,176,k,v,{labelW:28,h:8});y+=8;}}
    y+=4;
  }else y=43;
  const boxY=y,boxH=274-y;
  const area=ruledArea(17,boxY,176,boxH,{labelText:pageIndex===0?'SCOPE / INSTRUCTIONS':'CONTINUED INSTRUCTIONS'});out+=area.svg;
  // TYPED, NOT TYPESET. The instructions came off the same machine as the field
  // values above them; a works order is not a book. Six of the other forms
  // already set their body in mono and this one was the odd one out.
  const body=renderParagraphs(rest,{x:21,width:168,kind:'mono',grid:area.grid});out+=body.svg;
  out+=documentFooter(issuer,pageIndex,totalPages,{ref,copy,repro});return out;
}
function templateFieldLog(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,ref=workReference(doc),sheet=extractSheet(doc.byline,pageIndex+1),timeValue=extractTime(doc.title);let out=headerSvg(issuer,{compact:false,copy,repro});
  out+=heading(17,34.2,'FIELD RECORDING LOG',{size:13.6});
  out+=text(193,34.2,`Form ${issuer.formPrefix||'W.E./'}FR-17`,{size:7.4,kind:'serif',anchor:'end',opacity:.62,process:'preprinted-stationery'});
  out+=line(17,37.0,193,37.0,{opacity:.38,width:.22});
  // Deliberately not a four-cell table: these are fixed typewriter stations on
  // a preprinted form, with ordinary whitespace doing the grouping.
  out+=label(17,43.1,'JOB REF.',{size:9.0});out+=fieldValue(40,43.1,ref,{size:11.4});
  out+=label(88,43.1,'SHEET',{size:9.0});out+=fieldValue(105,43.1,sheet,{size:11.4});
  out+=label(126,43.1,'TIME',{size:9.0});out+=fieldValue(142,43.1,timeValue,{size:11.4});
  out+=line(39,44.5,78,44.5,{opacity:.25,width:.16});out+=line(104,44.5,120,44.5,{opacity:.25,width:.16});out+=line(141,44.5,193,44.5,{opacity:.25,width:.16});
  out+=label(17,50.9,'SITE',{size:9.0});out+=fieldValue(40,50.9,'Ellery Conservatoire',{size:11.4,kind:'serif'});out+=line(39,52.3,193,52.3,{opacity:.25,width:.16});
  const {map,rest}=takeFields(entries,['RIG','REF']);let y=60;
  if(map.has('RIG')){out+=fieldRow(17,y,176,'RIG',map.get('RIG'),{labelW:22,h:9});y+=10;}
  if(map.has('REF')){out+=fieldRow(17,y,176,'REF',map.get('REF'),{labelW:22,h:9});y+=10;}
  y+=3;const h=271-y;const area=ruledArea(17,y,176,h,{labelText:'FIELD NOTES',leftGutter:17});out+=area.svg;
  const body=renderParagraphs(rest,{x:38,width:151,kind:'mono',grid:area.grid});out+=body.svg;
  out+=text(17,278,'Continued over  YES / NO',{size:7.5,kind:'serif',opacity:.64,process:'preprinted-stationery'});
  out+=documentFooter(issuer,pageIndex,totalPages,{ref,copy,repro});return out;
}
function templateTakeSheet(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,ref=workReference(doc),{map,rest}=takeFields(entries);let out=headerSvg(issuer,{copy,repro});
  out+=heading(17,32.4,'ROOM TONE / TAKE SHEET',{size:12.0});out+=text(193,30,`JOB ${ref}`,{size:6.4,kind:'mono',anchor:'end',opacity:.72});
  const room=firstValue(map,'ROOM','SITE')||'______________________________';
  out+=fieldRow(17,37,176,'ROOM',room,{labelW:28,h:10});
  const start=firstValue(map,'START')||'',end=firstValue(map,'END')||'',take=firstValue(map,'TAKE')||'',status=firstValue(map,'RETAKE','STATUS')||'';
  out+=fieldRow(17,47,43,'TAKE',take,{labelW:18,h:9});out+=fieldRow(60,47,44,'START',start,{labelW:19,h:9});out+=fieldRow(104,47,44,'END',end,{labelW:17,h:9});out+=fieldRow(148,47,45,'RETAKE',status,{labelW:22,h:9});
  const noise=firstValue(map,'NOISE','NOISE FLOOR','SOURCE')||'';out+=fieldRow(17,56,176,'NOISE / CONDITION',noise,{labelW:38,h:12,valueKind:'sans'});
  const area=ruledArea(17,72,176,192,{labelText:'REMARKS / CONTAMINATION'});out+=area.svg;
  const remaining=[...rest];for(const [k,v] of map){if(!['ROOM','SITE','START','END','TAKE','RETAKE','STATUS','NOISE','NOISE FLOOR','SOURCE'].includes(k))remaining.unshift({kind:'field',label:k,value:v});}
  out+=renderParagraphs(remaining,{x:21,width:168,kind:'mono',grid:area.grid}).svg;
  out+=label(19,272,'ENGINEER');out+=line(45,272,91,272,{opacity:.38});out+=label(108,272,'INITIALS');out+=line(135,272,164,272,{opacity:.38});
  out+=documentFooter(issuer,pageIndex,totalPages,{ref,copy,repro});return out;
}
function templateContamination(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,{map,rest}=takeFields(entries);let out=headerSvg(issuer,{copy,repro});out+=heading(17,32.4,'RECORDING CONTAMINATION LOG',{size:11.8});
  let y=38;for(const k of ['SOURCE','LEVEL','CAUSE','ACTION','STATUS']){if(map.has(k)){out+=fieldRow(17,y,176,k,map.get(k),{labelW:31,h:k==='CAUSE'||k==='ACTION'?12:9,valueKind:'sans'});y+=k==='CAUSE'||k==='ACTION'?12:9;}}
  y+=4;const area=ruledArea(17,y,176,266-y,{labelText:'OBSERVATIONS'});out+=area.svg;out+=renderParagraphs(rest,{x:21,width:168,kind:'mono',grid:area.grid}).svg;out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function templateFault(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,{map,rest}=takeFields(entries);let out=headerSvg(issuer,{copy,repro});out+=heading(17,32.4,'FAULT / REMEDIAL WORKS REPORT',{size:11.8});let y=39;
  for(const k of ['FAULT','CAUSE','ACTION','RESULT','STATUS']){const v=map.get(k)||'';out+=fieldRow(17,y,176,k,v,{labelW:29,h:k==='FAULT'||k==='ACTION'||k==='RESULT'?17:11,valueKind:'sans'});y+=k==='FAULT'||k==='ACTION'||k==='RESULT'?17:11;}
  y+=5;const area=ruledArea(17,y,176,265-y,{labelText:'ADDITIONAL NOTES'});out+=area.svg;out+=renderParagraphs(rest,{x:21,width:168,kind:'mono',grid:area.grid}).svg;out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function templateAccess(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,{map,rest}=takeFields(entries);let out=headerSvg(issuer,{copy,repro});out+=heading(17,32.4,'SITE ACCESS / MOVEMENT SHEET',{size:11.8});
  let y=39;for(const k of ['ENTRY','EXIT','RETURN','TIME','DATE','DISTANCE','STATUS','FROM','TO']){if(map.has(k)){out+=fieldRow(17,y,176,k,map.get(k),{labelW:28,h:9,valueKind:'sans'});y+=9;}}
  y+=5;const area=ruledArea(17,y,176,266-y,{labelText:'ROUTE / ACCESS NOTES'});out+=area.svg;out+=renderParagraphs(rest,{x:21,width:168,kind:'mono',grid:area.grid}).svg;out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function templateTime(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx,{map,rest}=takeFields(entries);let out=headerSvg(issuer,{copy,repro});out+=heading(17,32.4,'SITE ATTENDANCE / TIME SHEET',{size:11.8});
  out+=fieldRow(17,38,58,'START',firstValue(map,'START','OUT'),{labelW:22,h:10});out+=fieldRow(75,38,58,'END',firstValue(map,'END','EXPECTED END','RETURN'),{labelW:22,h:10});out+=fieldRow(133,38,60,'HOURS',firstValue(map,'HOURS'),{labelW:24,h:10});
  let y=53;for(const k of ['ON SITE','MILEAGE','DELAY','ADDITIONAL LABOUR','RECEIPTS','NOTE','STATUS'])if(map.has(k)){out+=fieldRow(17,y,176,k,map.get(k),{labelW:38,h:10,valueKind:'sans'});y+=10;}
  y+=5;const area=ruledArea(17,y,176,265-y,{labelText:'NOTES / ADDITIONAL WORKS'});out+=area.svg;out+=renderParagraphs(rest,{x:21,width:168,kind:'mono',grid:area.grid}).svg;out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function templateEquipment(doc,entries,ctx,{inventory=false}={}){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx;let out=headerSvg(issuer,{copy,repro});out+=heading(17,32.4,inventory?'MOVEMENT / INVENTORY SHEET':'EQUIPMENT ISSUE / RETURN',{size:11.8});
  const rows=[],rest=[];for(const e of entries){
    if(inventory&&e.kind==='field'){
      if(e.label==='RETURN BY'){rest.push(e);continue;}
      rows.push({kind:'inventory-row',ref:e.label,item:e.value});continue;
    }
    if(e.kind==='field'&&(/^ITEM\s*\d+/i.test(e.label)||['STATUS','RETURN BY'].includes(e.label))){rows.push(e);continue;}
    if(e.kind==='raw'&&inventory){const m=String(e.text).match(/^(\S+)\s{2,}(.+)$/);if(m){rows.push({kind:'inventory-row',ref:m[1],item:m[2]});continue;}}
    rest.push(e);
  }
  let y=39;out+=label(17,y+5.2,'REF',{size:8.8});out+=label(49,y+5.2,inventory?'DESCRIPTION / LOCATION':'ITEM / STATUS',{size:8.8});out+=line(17,y+7.1,193,y+7.1,{opacity:.38,width:.20});y+=9;
  for(const row of rows.slice(0,10)){
    out+=line(17,y+7.0,193,y+7.0,{opacity:.17,width:.14});
    if(row.kind==='inventory-row'){out+=fieldValue(19,y+5.8,row.ref,{size:7.0});out+=text(49,y+5.8,row.item,{size:7.4,kind:'mono'});}
    else{out+=label(19,y+5.8,row.label,{size:5.8});out+=text(49,y+5.8,row.value,{size:7.6,kind:'mono'});}
    y+=9;
  }
  y+=5;const area=ruledArea(17,y,176,265-y,{labelText:'NOTES / RETURN'});out+=area.svg;out+=renderParagraphs(rest,{x:21,width:168,kind:'serif',grid:area.grid}).svg;out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function templateMemo(doc,entries,ctx,{notice=false,technical=false,monitoring=false}={}){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx;let out=headerSvg(issuer,{copy,repro,showAddress:false});
  const formTitle=notice?'INTERNAL NOTICE':technical?'TECHNICAL NOTE':monitoring?'MONITORING LOG':'MEMORANDUM';
  out+=heading(17,32.4,formTitle,{size:11.6});
  let y=37;
  if(notice){out+=label(17,y+6,'SUBJECT',{size:9.0});out+=fieldValue(45,y+6,String(doc.title||''),{size:11.3,kind:'serif'});out+=line(44,y+7.4,193,y+7.4,{opacity:.28,width:.17});y+=14;}
  else{
    out+=fieldRow(17,y,176,'SUBJECT',String(doc.title||''),{labelW:27,h:9,valueKind:'sans'});y+=9;
    out+=fieldRow(17,y,176,monitoring?'BOOK / OFFICE':'FROM',String(doc.byline||''),{labelW:27,h:9,valueKind:'sans'});y+=9;
    if(!technical){out+=fieldRow(17,y,86,'DATE','________________',{labelW:23,h:9});out+=fieldRow(103,y,90,'FILE REF',String(doc.id||'').toUpperCase(),{labelW:27,h:9});y+=9;}
  }
  y+=6;
  const {map,rest}=takeFields(entries);
  if(technical||monitoring){for(const [k,v] of map){out+=fieldRow(17,y,176,k,v,{labelW:34,h:9,valueKind:'mono'});y+=9;}}
  const other=technical||monitoring?rest:entries;
  const area=ruledArea(17,y,176,266-y,{labelText:notice?'NOTICE':'NOTES'});out+=area.svg;
  out+=renderParagraphs(other,{x:21,width:168,kind:'mono',grid:area.grid}).svg;
  out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function templateFreeform(doc,entries,ctx){
  const {issuer,pageIndex,totalPages,copy,repro}=ctx;let out=headerSvg(issuer,{compact:true,copy,repro});
  out+=heading(17,27.6,'FIELD NOTE',{size:10.8});out+=text(193,25.5,String(doc.id||'').replace(/^source-page:/,'').toUpperCase(),{size:5.6,kind:'mono',anchor:'end',opacity:.46});
  const area=ruledArea(17,31,176,239,{leftGutter:12});out+=area.svg;
  out+=renderParagraphs(entries,{x:33,width:155,kind:'mono',grid:area.grid}).svg;
  out+=documentFooter(issuer,pageIndex,totalPages,{copy,repro});return out;
}
function renderTemplate(doc,physical,entries,ctx){
  switch(physical.template){
    case PAPER_TEMPLATE.WORKS_ORDER:return templateWorkOrder(doc,entries,ctx);
    case PAPER_TEMPLATE.FIELD_LOG:return templateFieldLog(doc,entries,ctx);
    case PAPER_TEMPLATE.TAKE_SHEET:return templateTakeSheet(doc,entries,ctx);
    case PAPER_TEMPLATE.CONTAMINATION_LOG:return templateContamination(doc,entries,ctx);
    case PAPER_TEMPLATE.EQUIPMENT_RETURN:return templateEquipment(doc,entries,ctx);
    case PAPER_TEMPLATE.INVENTORY:return templateEquipment(doc,entries,ctx,{inventory:true});
    case PAPER_TEMPLATE.FAULT_REPORT:return templateFault(doc,entries,ctx);
    case PAPER_TEMPLATE.ACCESS_LOG:return templateAccess(doc,entries,ctx);
    case PAPER_TEMPLATE.TIME_SHEET:return templateTime(doc,entries,ctx);
    case PAPER_TEMPLATE.NOTICE:return templateMemo(doc,entries,ctx,{notice:true});
    case PAPER_TEMPLATE.TECHNICAL_REPORT:return templateMemo(doc,entries,ctx,{technical:true});
    case PAPER_TEMPLATE.MONITORING_LOG:return templateMemo(doc,entries,ctx,{monitoring:true});
    case PAPER_TEMPLATE.FREEFORM:return templateFreeform(doc,entries,ctx);
    case PAPER_TEMPLATE.LETTER:
    case PAPER_TEMPLATE.MEMO:
    default:return templateMemo(doc,entries,ctx);
  }
}
function pageSvg(doc,physical,pageEntries,pageIndex,totalPages){
  const issuer=issuerById(physical.issuer),repro=reproById(physical.reproduction),copy=repro.copy,stock=stockById(issuer.stock),rng=seeded(`${doc.id}:${pageIndex}:${physical.reproduction}:paper-v1.4`);
  const skew=copy?(rng()-.5)*Math.min(1.0,.14+(repro.generations||1)*.09):0;
  const ctx={issuer,repro,copy,pageIndex,totalPages};
  let content=renderTemplate(doc,physical,pageEntries,ctx),marks=authoredMarksSvg(doc,pageIndex),handling=handlingMarksSvg(physical.handling);
  const processStationery=copy?PAPER_PRINT_PROCESS.PHOTOCOPY.id:physical.stationeryProcess;
  const processContent=copy?PAPER_PRINT_PROCESS.PHOTOCOPY.id:physical.entryProcess;
  if(copy)content=content.replaceAll('data-process="preprinted-stationery"','data-process="photocopy-toner"');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="2480" height="3508" viewBox="0 0 210 297" data-format="A4" data-physical-width-mm="210" data-physical-height-mm="297" data-process-ppi="600" data-canonical-ppi="300" data-entry-process="${esc(processContent)}"><g id="paper-stock">${paperStockSvg(stock,rng,{copy,generations:repro.generations||0})}</g><g id="process-content" data-process="${esc(processContent)}" transform="rotate(${skew.toFixed(3)} 105 148.5)">${content}</g><g id="process-manual" data-process="biro">${marks}</g><g id="process-handling" data-process="handling">${handling}</g><g id="reproduction-defects" data-process="${esc(processStationery)}">${reproductionDefectsSvg(rng,repro)}</g></svg>`;
}
function collectDocuments(){
  const docs=[WORK_ORDER,...PAGES];
  for(const source of SOURCE_PAGES){const doc=sourcePageDocument(source);docs.push({...doc,sourceRegister:source.register});}
  docs.push({
    id:'source-real-still',title:'ELLERY FIELD RECORDING · TAKE SHEET',byline:'W. ELLERY / WORKS',decay:0,
    body:[{raw:'SITE: ELLERY CONSERVATOIRE'},{raw:'ROOM: ______________________________'},{raw:'TAKE: ______'},{raw:'START: ______'},{raw:'END: ______'},{rule:true},{raw:'STATUS: ______________________________'}],
    paper:{issuer:'ellery-works',template:'take-sheet',reproduction:'original-handled'},
  });
  return docs;
}
function commandExists(cmd){return spawnSync('bash',['-lc',`command -v ${cmd}`],{stdio:'ignore'}).status===0;}
// The interpreter that has Pillow. A repo-local .paper-venv is preferred over
// the system python so building paper never installs into anybody's global
// environment and `rm -rf .paper-venv` undoes the whole dependency.
const PAPER_PYTHON=process.env.PAPER_PYTHON
  ||(existsSync(path.join(ROOT,'.paper-venv/bin/python'))?path.join(ROOT,'.paper-venv/bin/python'):'python3');
function pythonPaperRasterAvailable(){return spawnSync(PAPER_PYTHON,['-c','import PIL'],{stdio:'ignore'}).status===0&&existsSync(path.join(ROOT,'scripts/paper/rasterize_svg.py'));}
function rasterCommand(){if(process.env.PAPER_RASTERIZER)return process.env.PAPER_RASTERIZER;if(commandExists('magick'))return 'magick';if(commandExists('convert'))return 'convert';throw new Error('Paper rasterization requires ImageMagick (`magick` or `convert`). Runtime assets are committed, so normal game builds do not need it.');}
function runProcess(cmd,args,{maxOutput=1024*1024*8}={}){
  return new Promise((resolve,reject)=>{const child=spawn(cmd,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',(d)=>{if(stdout.length<maxOutput)stdout+=d;});child.stderr.on('data',(d)=>{if(stderr.length<maxOutput)stderr+=d;});
    child.on('error',reject);child.on('close',(code)=>code===0?resolve({stdout,stderr}):reject(new Error(`${cmd} failed (${code}): ${stderr||stdout}`)));
  });
}
async function runPool(items,limit,worker){let cursor=0;const count=Math.max(1,Math.min(limit,items.length||1));await Promise.all(Array.from({length:count},async()=>{while(true){const index=cursor++;if(index>=items.length)return;await worker(items[index],index);}}));}
async function runRaster(cmd,svgPath,outPath){
  if(pythonPaperRasterAvailable()){
    await runProcess(PAPER_PYTHON,[path.join(ROOT,'scripts/paper/rasterize_svg.py'),svgPath,outPath,String(INSPECT_W),String(INSPECT_H)]);return;
  }
  if(commandExists('inkscape')){
    const tmp=`${outPath}.tmp-${process.pid}.png`;
    await runProcess('inkscape',[svgPath,'--export-type=png',`--export-filename=${tmp}`,`--export-width=${INSPECT_W}`,`--export-height=${INSPECT_H}`]);
    const args=cmd==='magick'||cmd.endsWith('magick')?['convert',tmp,'-quality','90','-strip',outPath]:[tmp,'-quality','90','-strip',outPath];
    try{await runProcess(cmd,args);}finally{try{unlinkSync(tmp);}catch{}}return;
  }
  const args=cmd==='magick'||cmd.endsWith('magick')?['convert',svgPath,'-background','white','-alpha','remove','-colorspace','sRGB','-quality','90','-strip',outPath]:[svgPath,'-background','white','-alpha','remove','-colorspace','sRGB','-quality','90','-strip',outPath];
  await runProcess(cmd,args);
}
// TILES AND ATLAS THROUGH SHARP.
//
// These were the last two ImageMagick calls in the pipeline, and they were
// enough to make `magick` a hard requirement for a build whose pages Pillow had
// already rendered — so a machine with the good rasteriser still could not
// finish. sharp is already a dependency of this repo, does Lanczos resampling
// and compositing natively, and removes the system dependency entirely.
async function runTile(_cmd,input,output){
  await sharp(input).resize(WORLD_TILE_W,WORLD_TILE_H,{fit:'fill',kernel:'lanczos3'})
    .webp({quality:90}).toFile(output);
}
async function runAtlas(_cmd,files,atlasPath,rows){
  const composites=await Promise.all(files.map(async(file,index)=>({
    input:await sharp(file).resize(WORLD_TILE_W,WORLD_TILE_H,{fit:'fill',kernel:'lanczos3'}).png().toBuffer(),
    left:(index%ATLAS_COLS)*WORLD_TILE_W,
    top:Math.floor(index/ATLAS_COLS)*WORLD_TILE_H,
  })));
  await sharp({create:{
    width:ATLAS_COLS*WORLD_TILE_W,height:Math.max(1,rows)*WORLD_TILE_H,
    channels:3,background:'#ECEBE6',
  }}).composite(composites).webp({quality:90}).toFile(atlasPath);
}

await mkdir(INSPECT,{recursive:true});await mkdir(MATERIAL,{recursive:true});await mkdir(TMP,{recursive:true});await mkdir(TILES,{recursive:true});await mkdir(HASHES,{recursive:true});await mkdir(path.dirname(GENERATED),{recursive:true});
let previousCatalog=null;
try{previousCatalog=JSON.parse(await readFile(path.join(OUT,'catalog.json'),'utf8'));}catch{}
const vectorOnly=process.env.PAPER_VECTOR_ONLY==='1',skipAtlas=process.env.PAPER_SKIP_ATLAS==='1',
  // Only the fallback path needs an external rasteriser now; Pillow renders both
  // tiers itself and sharp does the tiles, so asking for ImageMagick up front
  // failed builds that had everything they actually needed.
  raster=(vectorOnly||pythonPaperRasterAvailable())?null:rasterCommand(),documents={},atlasDocs=[],rasterJobs=[];let pageTotal=0;
if(!vectorOnly&&!pythonPaperRasterAvailable())console.warn('[paper] Pillow rasterizer unavailable: existing committed material maps may be used, but changed sheets require python3 + Pillow.');
for(const sourceDoc of collectDocuments()){
  const physical=normalizePhysicalDocument(sourceDoc),validation=validateBritishPaperDocument(sourceDoc);
  if(!validation.ok)console.warn(`[paper] ${sourceDoc.id}: ${validation.errors.join('; ')}`);
  const pages=paginate(sourceDoc,physical),safe=slug(sourceDoc.id),pageRecords=[];
  for(let i=0;i<pages.length;i++){
    const svg=pageSvg(sourceDoc,physical,pages[i],i,pages.length),vectorHash=sha(`${COMPILER_VERSION}:${RASTERIZER_VERSION}:${JSON.stringify(FONT_FINGERPRINT)}:${svg}`),svgPath=path.join(TMP,`${safe}-${i}.svg`),fileName=`${safe}-${i}.webp`,outPath=path.join(INSPECT,fileName),materialName=`${safe}-${i}-material.webp`,materialPath=path.join(MATERIAL,materialName),hashPath=path.join(HASHES,`${fileName}.sha256`);
    await writeFile(svgPath,svg,'utf8');let rebuild=!existsSync(outPath)||!existsSync(materialPath);
    if(!rebuild){
      const prior=previousCatalog?.documents?.[sourceDoc.id]?.pages?.[i]?.vectorHash;
      rebuild=prior!==vectorHash;
      // The sidecar makes an interrupted regeneration resumable even before
      // the catalog has been atomically replaced at the end of the build.
      if(rebuild)try{rebuild=(await readFile(hashPath,'utf8')).trim()!==vectorHash;}catch{}
    }
    if(rebuild&&!vectorOnly)rasterJobs.push({svgPath,outPath,materialPath,hashPath,vectorHash});
    pageRecords.push({path:`assets/paper/inspect/${fileName}`,materialPath:`assets/paper/material/${materialName}`,vectorHash});pageTotal++;
  }
  const reproduction=reproById(physical.reproduction),issuer=issuerById(physical.issuer);
  documents[sourceDoc.id]={id:sourceDoc.id,format:physical.format,locale:physical.locale,issuer:physical.issuer,stock:issuer.stock,template:physical.template,reproduction:physical.reproduction,stationeryProcess:physical.stationeryProcess,entryProcess:physical.entryProcess,handling:physical.handling,handlingVector:physical.handlingVector,processes:reproduction.copy?[PAPER_PRINT_PROCESS.PHOTOCOPY.id]:[physical.stationeryProcess,physical.entryProcess,...((sourceDoc.paper?.marks||[]).length?[PAPER_PRINT_PROCESS.BIRO.id]:[])],semanticHash:sha([sourceDoc.title,sourceDoc.byline,JSON.stringify(sourceDoc.body||[])].join('\n')),pages:pageRecords};
  atlasDocs.push(sourceDoc.id);
}
if(vectorOnly){console.log(`[paper] vector-only ${Object.keys(documents).length} documents / ${pageTotal} sheets`);process.exit(0);}
const jobs=Math.max(1,Math.min(8,Math.floor(Number(process.env.PAPER_JOBS)||4)));
if(rasterJobs.length){
  if(pythonPaperRasterAvailable()){
    console.log(`[paper] rasterising ${rasterJobs.length} changed sheets (memory-bounded hermetic Pillow batches)`);
    const chunkSize=2,batches=[];
    for(let offset=0;offset<rasterJobs.length;offset+=chunkSize){
      const chunk=rasterJobs.slice(offset,offset+chunkSize),manifestPath=path.join(TMP,`raster-jobs-${offset}.json`);
      await writeFile(manifestPath,JSON.stringify(chunk.map((job)=>({input:job.svgPath,output:job.outPath,materialOutput:job.materialPath,width:INSPECT_W,height:INSPECT_H,materialWidth:MATERIAL_W,materialHeight:MATERIAL_H}))));
      batches.push({chunk,manifestPath});
    }
    let completedBatches=0;
    await runPool(batches,2,async({chunk,manifestPath})=>{
      await runProcess(PAPER_PYTHON,[path.join(ROOT,'scripts/paper/rasterize_svg.py'),'--batch',manifestPath],{maxOutput:1024*1024*2});
      for(const job of chunk)await writeFile(job.hashPath,`${job.vectorHash}\n`,'utf8');
      completedBatches++;console.log(`[paper] raster batch ${completedBatches}/${batches.length} (${Math.min(completedBatches*chunkSize,rasterJobs.length)}/${rasterJobs.length} sheets)`);
    });
  }else{
    console.log(`[paper] rasterising ${rasterJobs.length} changed sheets (${jobs} workers)`);
    await runPool(rasterJobs,jobs,async(job)=>{await runRaster(raster,job.svgPath,job.outPath);await writeFile(job.hashPath,`${job.vectorHash}\n`,'utf8');});
  }
}
const atlasEntries=[];for(const id of atlasDocs){const record=documents[id];record.pages.forEach((page,pageIndex)=>atlasEntries.push({id,pageIndex,tile:path.join(TILES,`${slug(id)}-${pageIndex}.webp`),page}));}
const atlasRows=Math.ceil(atlasEntries.length/ATLAS_COLS),atlasPath=path.join(OUT,'world-atlas.webp');
const priorAtlas=previousCatalog?.atlas;
const atlasNeedsRebuild=!skipAtlas&&(!existsSync(atlasPath)||rasterJobs.length>0||priorAtlas?.columns!==ATLAS_COLS||priorAtlas?.rows!==atlasRows||priorAtlas?.count!==atlasEntries.length);
if(atlasNeedsRebuild){
  // Tiles are an ephemeral build product. If any page changed, rebuild the
  // complete low-resolution atlas from the canonical inspect sheets; if no
  // page changed, the shipped atlas is already content-addressed by the same
  // vector hashes and can be retained without regenerating temporary tiles.
  console.log(`[paper] building ${atlasEntries.length} world tiles`);
  if(pythonPaperRasterAvailable()&&existsSync(path.join(ROOT,'scripts/paper/build_atlas.py'))){
    const manifestPath=path.join(TMP,'atlas-manifest.json');
    await writeFile(manifestPath,JSON.stringify({columns:ATLAS_COLS,rows:atlasRows,tile:[WORLD_TILE_W,WORLD_TILE_H],files:atlasEntries.map((entry)=>path.join(ROOT,entry.page.path)),output:atlasPath}));
    await runProcess(PAPER_PYTHON,[path.join(ROOT,'scripts/paper/build_atlas.py'),manifestPath]);
  }else{
    await runPool(atlasEntries,Math.min(8,jobs*2),async(entry)=>{await runTile(raster,path.join(ROOT,entry.page.path),entry.tile);});
    await runAtlas(raster,atlasEntries.map((entry)=>entry.tile),atlasPath,atlasRows);
  }
}
atlasEntries.forEach((entry,index)=>{documents[entry.id].pages[entry.pageIndex].atlasIndex=index;});for(const record of Object.values(documents))record.atlasIndex=record.pages[0]?.atlasIndex??-1;
const ambient=atlasDocs.filter((id)=>id.startsWith('source-page:')).slice(0,128);
const atlasHandling=atlasEntries.map((entry)=>documents[entry.id]?.handlingVector||[-1,0,0,0]);
// The type scale and the ONE grid pitch, published so a spec can assert them
// rather than re-derive them from the templates it is meant to be checking.
const TYPOGRAPHY=Object.freeze({
  bodyPt:TYPE.body,headingPt:TYPE.heading,labelPt:TYPE.label,fieldValuePt:TYPE.fieldValue,
  rulePitchMm:TYPE.pitch,families:Object.fromEntries(Object.entries(FONT).map(([k,v])=>[k,v])),
});
const catalog=`// GENERATED by scripts/build-paper-assets.mjs. Do not hand edit.\nexport const PAPER_COMPILER_VERSION=${JSON.stringify(COMPILER_VERSION)};\nexport const PAPER_TYPOGRAPHY=Object.freeze(${JSON.stringify(TYPOGRAPHY,null,2)});\nexport const PAPER_FONT_FINGERPRINT=Object.freeze(${JSON.stringify(FONT_FINGERPRINT,null,2)});\nexport const PAPER_ATLAS=Object.freeze(${JSON.stringify({path:'assets/paper/world-atlas.webp',columns:ATLAS_COLS,rows:atlasRows,tile:[WORLD_TILE_W,WORLD_TILE_H],count:atlasEntries.length},null,2)});\nexport const PAPER_DOCUMENTS=Object.freeze(${JSON.stringify(documents,null,2)});\nexport const PAPER_ATLAS_HANDLING=Object.freeze(${JSON.stringify(atlasHandling)});\nexport const PAPER_AMBIENT_IDS=Object.freeze(${JSON.stringify(ambient,null,2)});\n`;
await writeFile(GENERATED,catalog,'utf8');await writeFile(path.join(OUT,'catalog.json'),JSON.stringify({compiler:COMPILER_VERSION,typography:TYPOGRAPHY,fontFingerprint:FONT_FINGERPRINT,atlas:{columns:ATLAS_COLS,rows:atlasRows,count:atlasEntries.length},documents},null,2));console.log(`[paper] ${Object.keys(documents).length} documents / ${pageTotal} sheets / atlas ${ATLAS_COLS}x${atlasRows}`);
