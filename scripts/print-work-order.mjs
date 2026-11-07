// Print the W. Ellery works order for the handwriting handoff.
//
// Two PDFs, four A4 pages each:
//   work-order-print-clean.pdf     the printed form only (paper stock +
//                                  preprinted stationery), for printing,
//                                  marking up and rescanning. The baked
//                                  "(signature illegible)" is left out so the
//                                  real signature can go in by hand.
//   work-order-print-game-look.pdf the same pages with the in-game handling
//                                  wear and reproduction defects, as a look
//                                  reference.
//
// The live biro layer (src/game/work-order-ink.js) is never baked: the
// printed form is blank for him to write on.
//
// Run:  node scripts/print-work-order.mjs
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const OUT=resolve(ROOT,'output','handwriting-handoff');
mkdirSync(OUT,{recursive:true});

const PAGES=['work-order-ffc40254-0.svg','work-order-ffc40254-1.svg','work-order-ffc40254-2.svg','work-order-ffc40254-3.svg'];
const chromePath='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WIDTH=2480,HEIGHT=3508; // A4 at 300 dpi

const font=(file,weight)=>`@font-face{font-family:'Nimbus Mono PS';src:url('${ROOT}/assets/fonts/${file}') format('opentype');font-weight:${weight};font-style:normal;}`;
const fonts=[
  font('NimbusMonoPS-Regular.otf','400'),
  font('NimbusMonoPS-Bold.otf','700'),
  font('NimbusRoman-Regular.otf','400'),
  font('NimbusRoman-Bold.otf','700'),
].join('\n');

// Strip one <g id="…">…</g> group, counting nested <g>.
function stripGroup(svg,id){
  const open=svg.indexOf(`<g id="${id}"`);
  if(open<0)return svg;
  let depth=0,end=open;
  for(let i=open;i<svg.length;i++){
    if(svg.startsWith('<g',i))depth++;
    else if(svg.startsWith('</g>',i)){depth--;if(depth===0){end=i+4;break;}}
  }
  return svg.slice(0,open)+svg.slice(end);
}
// The clean print keeps a real signature line, not a printed illegible one.
function stripSignaturePlaceholder(svg){
  return svg.replace(/<text[^>]*>\(signature illegible\)<\/text>/,'');
}

const CLEAN=['process-manual','process-handling','reproduction-defects'];

function htmlFor(svg,clean){
  let source=svg;
  if(clean){for(const id of CLEAN)source=stripGroup(source,id);source=stripSignaturePlaceholder(source);}
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${fonts}
    html,body{margin:0;padding:0;background:#ffffff;}
    svg{display:block;width:${WIDTH}px;height:${HEIGHT}px;}
  </style></head><body>${source}</body></html>`;
}

const files=[];
for(const [i,file] of PAGES.entries()){
  const svg=readFileSync(resolve(ROOT,'.paper-build',file),'utf8');
  for(const [name,clean] of [['clean',true],['game',false]]){
    const html=htmlFor(svg,clean);
    const base=resolve(OUT,`work-order-${name}-${i}`);
    writeFileSync(`${base}.html`,html);
    const result=spawnSync(chromePath,[
      '--headless=new','--disable-gpu','--hide-scrollbars','--no-pdf-header-footer',
      '--no-first-run','--user-data-dir=/tmp/chunk-surfer-work-order-print',
      `--window-size=${WIDTH},${HEIGHT}`,'--force-device-scale-factor=1',
      '--virtual-time-budget=8000',`--screenshot=${base}.png`,`file://${base}.html`,
    ],{encoding:'utf8'});
    if(result.status!==0)throw Error(`chrome render failed for ${base}: ${result.stderr}`);
    files.push({name,page:i,png:`${base}.png`});
  }
}
writeFileSync(resolve(OUT,'pages.json'),JSON.stringify({files},null,2));
console.log('Rendered',files.length,'pages to',OUT);
