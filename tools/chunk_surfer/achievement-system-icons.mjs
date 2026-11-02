#!/usr/bin/env node
/** Prototype-only original solid service emblems. SVG masters stay outside the
 * inline comparison; only transparent PNG masks are embedded in the visual. */
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {ACHIEVEMENT_DEFS} from '../../src/progression/achievement-defs.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'artifacts/achievement-system-directions/icons');
await mkdir(out,{recursive:true});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const R=(x,y,w,h,r=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const P=d=>`<path d="${d}"/>`;
const E=(cx,cy,rx,ry=rx)=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`;
const L=(d,w=4)=>`<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fonts={0:['111','101','101','101','111'],1:['010','110','010','010','111'],3:['111','001','111','001','111'],4:['101','101','111','001','001'],7:['111','001','010','010','010'],C:['111','100','100','100','111'],S:['111','100','111','001','111'],A:['010','101','111','101','101'],R:['110','101','110','101','101'],H:['101','101','111','101','101']};
function matrix(text,x,y,cell=2){return [...text].map((ch,n)=>(fonts[ch]||fonts.C).map((row,j)=>[...row].map((v,i)=>v==='1'?R(x+(n*4+i)*cell,y+j*cell,cell,cell):'').join('')).join('')).join('');}
const sheet=P('M13 7H41L51 17V57H13Z');
const sheetCut=P('M39 7V20H51L47 16H43V11Z');
const tape=R(7,17,50,35,4);
const tapeCut=E(21,30,7)+E(43,30,7)+P('M16 42H48L51 49H13Z');
const reelHubs=E(21,30,2.5)+E(43,30,2.5);
const radio=R(13,20,38,36,4)+P('M18 23L21 9 24 8 24 23Z')+L('M23 10L44 5',4);
const radioCut=R(19,27,26,10,1)+R(19,43,14,3)+R(19,49,14,3)+E(42,47,5);
const torch=P('M23 25H41V55H23Z M20 17H44V27H20Z');
const torchCut=R(27,33,10,3)+R(27,40,10,3);
const tower=P('M17 56V21L14 21 32 6 50 21H47V56Z');
const towerCut=R(23,25,18,16,6)+R(27,46,10,12,4);
const bell=P('M24 36C29 32 26 25 32 25C38 25 35 32 40 36V39H24Z')+E(32,42,3);
const maps={};
function icon(id,positive,negative,meaning){maps[id]={positive,negative,meaning};}

icon('ACH_WORK_ORDER',sheet, sheetCut+matrix('4417C',13,28,2)+R(19,45,26,3),
  'Folded Ellery contract with a punched 4417C job identifier and acceptance line.');
icon('ACH_FIRST_TAKE',tape+E(32,8,4),tapeCut,
  'An intact cassette with one recording lamp: first accepted clean minute.');
maps.ACH_FIRST_TAKE.restore=reelHubs;
icon('ACH_HUSH_MET',P('M23 12C29 5 42 9 43 18C53 15 59 23 52 31C61 35 56 46 46 43C48 56 33 60 28 48C22 59 10 53 16 42C5 41 4 30 16 27C8 17 13 8 23 12Z')+L('M18 38C7 41 7 54 3 55M45 28C57 22 59 13 60 10',3),P('M25 20C38 14 45 31 36 41C42 28 34 24 25 20Z')+E(24,34,3,5),
  'Dense HUSH pressure mass with resisting tendrils and an asymmetric compressed void; no human mask.');
icon('ACH_PLAYBACK',tape+P('M46 8L56 12 47 16Z'),tapeCut+E(43,28,3)+P('M39 32H47V37H39Z'),
  'A playback cassette whose second reel contains an absent figure, not a generic play-button badge.');
maps.ACH_PLAYBACK.restore=E(21,30,2.5)+E(43,28,2.5)+P('M40 32H46V37H40Z');
icon('ACH_CHAPEL_KEY',E(23,20,14)+P('M31 28L55 48 48 56 41 49 44 46 39 42 35 46 29 39 33 35 25 28Z'),E(23,20,6)+R(21,7,4,4),
  'Heavy institutional chapel key with an asymmetric multi-bit ward and punched key head.');
icon('ACH_FIVE_ROOMS',P('M6 15H58V56H6Z M10 8H54V15H10Z'),R(12,22,10,10)+R(27,22,10,10)+R(42,22,10,10)+R(20,38,10,10)+R(35,38,10,10),
  'A section through five recording rooms under the same institutional roof.');
icon('ACH_NAME_SARAH',R(7,20,50,31,3)+L('M16 20V12H48V20',4),matrix('SARAH',13,28,2)+R(19,43,26,2),
  'A physical personal-name plate punched SARAH; gives the name a human object rather than a speech bubble.');
icon('ACH_COFFEE',P('M12 24H43V45C43 59 12 59 12 45Z')+E(45,35,12,10)+L('M19 17C10 9 24 10 20 4M31 17C23 9 35 10 32 4',3),E(46,35,6,5)+P('M21 32H34L28 44Z'),
  'The guard’s institutional enamel mug, its negative triangular service mark, handle and rising heat.');
icon('ACH_DO_NOT_DISTURB',radio+P('M6 8L11 5 58 53 53 58Z'),radioCut,
  'A worried portable check-in crossed by a physical do-not-disturb stroke.');
icon('ACH_RADIO_SILENCE',radio,radioCut+P('M9 16L15 10 56 51 50 57Z'),
  'A portable radio with one continuous cut through every use path; absence rather than a ringing alert.');
icon('ACH_CATALOGUE',P('M8 18H56V56H8Z M18 8H46V20H18Z'),R(22,12,20,6)+[0,1].flatMap(y=>[0,1,2,3].map(x=>R(13+x*11,26+y*14,6,8))).join(''),
  'Service inspection case with eight physical inspection compartments and a handle.');
icon('ACH_LIGHT_OFF',torch+P('M22 12L16 4H48L42 12Z'),torchCut+P('M13 16L18 11 52 51 47 56Z'),
  'A switched-off field torch with its beam materially interrupted before the figure can arrive.');
icon('ACH_RELEASE_RECORD',sheet+E(43,45,13),sheetCut+R(20,26,22,3)+R(20,33,14,3)+E(43,45,7)+P('M41 41H45V49H41Z'),
  'Release docket with a large punched archival seal and entry rules.');
icon('ACH_ALL_PLAYBACK',R(6,9,40,30,3)+R(12,17,40,30,3)+R(18,25,40,30,3),R(10,13,30,3)+R(16,21,30,3)+E(30,37,6)+E(47,37,6)+P('M25 46H52L54 51H23Z'),
  'Three separately recorded playback cassettes filed in one layered log.');
icon('ACH_END_SACRIFICE',P('M6 8H23V56H6Z M41 8H58V56H41Z M21 8H43V15H21Z')+P('M25 53L25 29 28 25 28 19C28 13 36 13 36 19V25L39 29V53Z'),P('M28 35H36V38H28Z')+R(29,46,2,10)+R(33,46,2,10),
  'A recordist becomes the load-bearing living seal between two walls of the school.');
icon('ACH_CENTURY_STAY',P('M9 6H55V18H9Z M13 48H51V56H13Z M17 18H47L42 29 47 48H17L22 29Z'),P('M24 21H40L35 29 40 43H24L29 29Z')+matrix('100',21,7,2),
  'An architectural hourglass/keystone held between cornice and foundation: a century of voluntary support.');
icon('ACH_END_HELPED',P('M4 41L13 34 24 40H41L48 36 59 40 54 48 42 55H23Z')+P('M19 12H40V27C40 36 19 36 19 27Z')+E(42,21,8,7),E(43,21,3,3)+R(25,19,9,3)+P('M10 42L13 39 20 45 17 48Z'),
  'The guard’s warm mug above an offered supporting hand; help stays specific to this return.');
icon('ACH_END_INVERSION',P('M11 7H52V57H43V16H20V57H11Z')+P('M23 20L49 30 38 57 21 50Z'),P('M28 28L42 33 35 49 28 46Z'),
  'A solid exit frame containing a second door turned against its own frame: inversion without generic arrows.');
icon('ACH_END_DRUGGED',P('M8 20L39 9 49 38C54 51 24 61 19 48Z')+E(46,18,9,8)+P('M43 48C48 52 52 56 47 60C42 61 39 57 43 48Z'),E(46,18,4,3)+P('M21 24L36 19 40 30 25 35Z'),
  'The service mug tipped and losing a heavy final drop: cold, bitter, gone.');
icon('ACH_END_SURFACED',R(7,19,50,35,3)+P('M13 10H48V19H13Z'),E(21,32,7)+E(43,32,7)+R(13,43,16,3)+R(35,43,16,3)+R(18,13,25,3),
  'Two independent recording heads and two signature lines in one broken-rig cassette: The Second Signature.');
icon('ACH_END_CONTACT-WON',P('M8 51L18 24H26L30 39H34L38 24H46L56 51Z')+L('M13 17Q32 1 51 17M21 22Q32 13 43 22',4),P('M15 46H49V50H15Z'),
  'An open signal channel bridging the Source fault; the physical gap remains visible.');
icon('ACH_END_CONTACT-LOST',P('M6 54L16 28H25L29 42 22 54Z M58 54L48 28H39L35 42 42 54Z')+L('M13 17Q23 9 28 10M36 10Q42 9 51 17M21 22L26 20M38 20L43 22',4),P('M30 5L36 8 30 25 25 22Z'),
  'The same fault-side channel broken into disconnected banks and fragmented carrier arcs.');
icon('ACH_END_TOWER-WON',tower+P('M5 54H59V59H5Z'),towerCut,
  'Recognizable bell tower with a traversable lower door and intact bell aperture.');
maps['ACH_END_TOWER-WON'].restore=bell;
icon('ACH_END_TOWER-LOST',tower+P('M5 54H59V59H5Z'),towerCut+P('M31 8H35L30 22 36 31 29 44 34 56H30L24 43 31 31 25 23Z'),
  'The matching tower fractured through its load path; a fallen bell occupies the exit.');
maps['ACH_END_TOWER-LOST'].restore=P('M21 48C26 44 23 37 30 37C37 37 34 44 39 48V51H21Z')+E(30,54,3);
icon('ACH_ALL_ENDINGS',P('M5 13H18V9H24V13H39V9H45V13H59V57H5Z'),[0,1,2].flatMap(y=>[0,1,2].map(x=>R(10+x*16,20+y*11,10,6,1))).join(''),
  'Nine physical return-file slots in one records drawer; every current ending accounted for.');
icon('ACH_UNINJURED',P('M11 35C10 30 15 26 19 31L24 36V17C24 11 31 11 31 17V8C31 2 38 2 38 8V14C38 8 45 8 45 14V22C45 16 52 16 52 22V39C52 51 44 58 35 58H26L13 42Z'),R(31,20,3,17)+R(38,24,3,13)+R(45,28,3,10),
  'An anatomically ordered open recordist hand with broad palm and clear finger web cuts.');
icon('ACH_SECOND_TRACK',tape+P('M12 8H49V12H12Z M13 56H50V60H13Z'),tapeCut+R(27,17,10,5)+R(27,45,10,7),
  'Two discrete transport tracks around the same causal cassette; no generic repeat icon.');
maps.ACH_SECOND_TRACK.restore=reelHubs;
icon('ACH_UNBROKEN',L('M32 32C9 4 0 47 21 47C34 47 30 17 44 17C64 17 55 60 32 32',11),L('M32 32C9 4 0 47 21 47C34 47 30 17 44 17C64 17 55 60 32 32',3),
  'A continuous closed loop of real tape ribbon, with one uninterrupted centre cut.');
icon('ACH_FIRST_PASS',P('M6 13L14 8 22 13V33L14 39 6 33Z M24 13L32 8 40 13V33L32 39 24 33Z M42 13L50 8 58 13V33L50 39 42 33Z')+P('M6 47H45V41L59 50 45 59V53H6Z'),R(10,20,8,4)+R(28,20,8,4)+R(46,20,8,4),
  'Three signal adversaries above one unbroken first-pass traverse: three distinct clean victories.');
icon('ACH_DEAD_AIR',R(6,14,52,38,3)+P('M13 6H51V14H13Z'),R(12,22,40,22,2),
  'A dead monitoring aperture whose only surviving carrier is a flat, broken trace.');
maps.ACH_DEAD_AIR.restore=L('M14 33H25L28 29 32 37 36 33H49',3);
icon('ACH_ONE_TORCH',torch+P('M21 12L13 3H51L43 12Z'),torchCut+R(30,3,4,9),
  'One enduring torch and one beam, with no building feed or battery-replacement symbol.');
icon('ACH_BUILDING_ALIVE',P('M5 22L32 5 59 22H55V57H9V22Z'),R(16,27,8,10)+R(28,27,8,10)+R(40,27,8,10)+R(16,43,8,10)+R(40,43,8,10)+P('M30 42H34V57H30Z')+R(21,20,22,3),
  'Ellery’s recognizable roof and five live distribution apertures.');
icon('ACH_FIELD_NOTES',P('M7 15H16V54H46V60H7Z M17 8H43L55 20V53H17Z'),P('M41 8V22H55L49 18H45V12Z')+R(24,29,22,3)+R(24,36,22,3)+R(24,43,15,3),
  'A folded field docket over a second filed sheet: the paper trail as handled material.');
icon('ACH_FIELD_LEADS',R(7,7,22,22,2)+R(35,7,22,22,2)+R(7,35,22,22,2)+R(35,35,22,22,2),P('M13 23C13 13 24 13 24 13C24 23 19 25 13 23Z')+R(40,12,12,12)+P('M12 46L18 40 24 46V53H12Z')+P('M39 42H53V46H39Z M40 49H52V52H40Z'),
  'Four literal optional leads: garden leaf, gallery frame, tower roof, and city seat.');
icon('ACH_OFF_AIR',radio+P('M31 15L37 5 43 15Z'),radioCut+matrix('13',25,26,2),
  'Portable receiver with its hidden channel thirteen cut directly into the tuning window.');
// Preserve the big display for the channel numerals, instead of erasing them.
maps.ACH_OFF_AIR.negative=R(19,43,14,3)+R(19,49,14,3)+E(42,47,5)+matrix('13',25,26,2);
icon('ACH_CALL_YOURSELF',P('M10 10L18 6 24 18 19 22C18 31 24 39 32 42L37 39 48 47 44 55C21 56 5 29 10 10Z')+P('M48 10L55 17 46 27 41 24C34 24 29 28 27 33L28 38 19 44 13 37C12 21 29 7 48 10Z'),P('M20 20L24 23 21 28 17 25Z')+P('M35 39L39 42 36 46 32 43Z'),
  'Two distinct telephone handsets make a closed impossible circuit back to the van.');
icon('ACH_HIDDEN_EXCHANGES',R(7,10,27,36,4)+P('M13 11V5H17V11Z')+P('M42 18L49 13 57 24 52 29C54 40 49 50 38 55L32 47 39 39 44 42C48 35 47 30 42 27Z')+L('M20 46V55H30',4),R(13,18,15,8)+R(13,33,9,3)+E(27,36,3),
  'Portable radio and hanging handset joined by one private cable: both hidden exchanges.');
icon('ACH_COMPLETE_ARCHIVE',R(5,12,54,44,4)+P('M11 6H53V12H11Z')+P('M21 56L25 62 32 58 39 62 43 56Z'),E(20,29,8)+E(44,29,8)+P('M14 43H50L53 51H11Z')+R(28,21,8,16),
  'A master cassette in its fitted archival case, with a physical sealed ribbon instead of a generic trophy.');
maps.ACH_COMPLETE_ARCHIVE.restore=E(20,29,3)+E(44,29,3);
icon('_CONCEALED',P('M13 9H51V55H13Z'),R(19,18,26,4)+R(19,28,26,4)+R(19,38,26,4),
  'Anonymous sealed-entry cover: neither requirement nor discovered subject is revealed.');

function sourceSvg(shape,size=256){return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64"><defs><mask id="shape" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64"><rect width="64" height="64" fill="black"/><g fill="white" color="white">${shape.positive}</g><g fill="black" color="black">${shape.negative}</g><g fill="white" color="white">${shape.restore||''}</g></mask></defs><rect width="64" height="64" fill="white" mask="url(#shape)"/></svg>`;}
const missing=ACHIEVEMENT_DEFS.filter(def=>!maps[def.id]);
if(missing.length)throw Error(`Missing ${missing.map(x=>x.id)}`);
const manifest=[];const data={};
for(const def of [...ACHIEVEMENT_DEFS,{id:'_CONCEALED',name:'Sealed Entry',hidden:true,description:'Shared anonymous cover.'}]){
 const shape=maps[def.id],slug=def.id.toLowerCase().replaceAll('_','-');
 const svg=sourceSvg(shape);
 await writeFile(path.join(out,`${slug}.svg`),svg);
 const outputs={};
 for(const size of [64,256]){
  const image=await sharp(Buffer.from(svg)).resize(size,size).png({palette:true,effort:10}).toBuffer();
  const file=`${slug}-${size}.png`;await writeFile(path.join(out,file),image);
  outputs[size]={file,bytes:image.length,sha256:createHash('sha256').update(image).digest('hex')};
  if(size===64)data[def.id]=`data:image/png;base64,${image.toString('base64')}`;
 }
 manifest.push({id:def.id,name:def.name,description:def.description,hidden:def.hidden,meaning:shape.meaning,source:`${slug}.svg`,outputs});
}
await writeFile(path.join(out,'masks-64-data.json'),JSON.stringify(data));
await writeFile(path.join(out,'manifest.json'),JSON.stringify({schema:1,catalogCount:ACHIEVEMENT_DEFS.length,originalArtwork:true,shippingAssetsChanged:false,
 design:'Solid service silhouettes with negative-space structural cuts; white RGB/transparent alpha masks for ink, metal, or luminous tinting.',
 hiddenPolicy:'Concealed UI entries use _CONCEALED until unlocked or explicitly revealed. This manifest intentionally contains spoiler-bearing semantic mappings.',
 compromises:['64px cannot retain actual micro-lettering; 4417C and SARAH are bespoke 3×5 two-pixel stencils.','Warmth, gilt, glow, print bleed and locked-state treatment belong to the selected component system, not these neutral masks.','The catalogue remains 38 IDs; naming and unlock requirements have not changed.','These are production-scale candidate masters, pending visual-system selection and human recognition review.'],
 items:manifest},null,2));
const cards=manifest.map(row=>`<article><div class="samples"><img src="${row.outputs[64].file}" width="64" height="64" alt="${esc(row.meaning)}"><img class="small" src="${row.outputs[64].file}" width="32" height="32" alt=""></div><strong>${esc(row.name)}</strong><code>${esc(row.id)}</code><p>${esc(row.meaning)}</p></article>`).join('');
await writeFile(path.join(out,'gallery.html'),`<!doctype html><meta charset="utf-8"><title>Solid service emblems — 1:1 candidate family</title><style>*{box-sizing:border-box}body{margin:0;padding:40px;background:#101311;color:#e1dfd1;font:14px Arial,sans-serif}h1{font-size:26px;font-weight:500}header{max-width:800px;margin:0 0 32px}header p{line-height:1.6;color:#9da59b}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(225px,1fr));gap:12px}article{padding:22px;border:1px solid #333c33;background:#171d18;min-height:245px}.samples{height:82px;display:flex;align-items:center;gap:26px}.small{opacity:.75}strong{display:block;font-size:15px;line-height:1.4;max-width:230px}code{display:block;font-size:10px;margin-top:6px;color:#8da080}p{font-size:12px;line-height:1.45;color:#aeb6a9}</style><header><h1>Solid service emblems</h1><p>38 original achievement candidates and one anonymous sealed-entry cover. Each card shows a 64px production-scale master and a 32px stress view. White transparent masks inherit each component system’s ink, metal, or signal treatment. Names and achievement IDs remain unchanged. This is a spoiler-bearing art review; concealed entries in the game would use the shared sealed-entry cover.</p></header><div class="grid">${cards}</div>`);
// CPU-rasterized contact sheet: native 64px icons, no browser/GPU needed.
const cellW=208,cellH=134,cols=6,rows=Math.ceil(manifest.length/cols);
const overlays=[];
for(let n=0;n<manifest.length;n++){
 const row=manifest[n],x=(n%cols)*cellW,y=Math.floor(n/cols)*cellH;
 overlays.push({input:await readFile(path.join(out,row.outputs[64].file)),left:x+16,top:y+12});
 const label=`<svg width="${cellW}" height="45"><text x="16" y="15" fill="#d9dfce" font-family="sans-serif" font-size="12">${esc(row.name.length>27?row.name.slice(0,25)+'…':row.name)}</text><text x="16" y="32" fill="#8e9c83" font-family="monospace" font-size="8">${esc(row.id)}</text></svg>`;
 overlays.push({input:Buffer.from(label),left:x,top:y+82});
}
await sharp({create:{width:cols*cellW,height:rows*cellH,channels:4,background:'#172018'}}).composite(overlays).png().toFile(path.join(out,'gallery.png'));
const json=await readFile(path.join(out,'masks-64-data.json'));
console.log(JSON.stringify({out,catalogCount:ACHIEVEMENT_DEFS.length,maskCount:manifest.length,embeddedDataBytes:json.length,total64Bytes:manifest.reduce((s,x)=>s+x.outputs[64].bytes,0),total256Bytes:manifest.reduce((s,x)=>s+x.outputs[256].bytes,0)}));
