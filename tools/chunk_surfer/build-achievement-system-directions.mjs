import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd();
const fragment='/Users/seb/.codex/visualizations/2026/10/11/01a12cd1-32aa-7a51-b6dd-3215a4669338/achievement-system-directions.html';
const dir=path.join(root,'artifacts/achievement-system-directions');
let html=await readFile(fragment,'utf8');
for(const[id,file]of [['achievement-material-code','achievement-material-core.iife.js'],['achievement-embedded-assets','material-assets.json'],['achievement-content','content.json'],['achievement-icon-assets','icons/masks-64-data.json'],['achievement-composition','composition.js']]){
 const content=(await readFile(path.join(dir,file),'utf8')).replace(/<\/script/gi,'<\\/script');
 const re=new RegExp('(<script\\b[^>]*id="'+id+'"[^>]*>)[\\s\\S]*?(<\\/script>)');
 if(!re.test(html))throw Error('Missing literal script slot '+id);
 html=html.replace(re,(_,start,end)=>start+content+end);
}
if(Buffer.byteLength(html)>=1000000)throw Error('Fragment too large');
if(/<\/?(?:html|head|body)(?:\s|>)/i.test(html))throw Error('Not a fragment');
await writeFile(fragment,html);
console.log(JSON.stringify({fragment,bytes:(await stat(fragment)).size,illustrativeOnly:true}));
