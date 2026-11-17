import {readFile,writeFile} from 'node:fs/promises';
const root=process.cwd(),dir=`${root}/output/vfd-menu-systems`,dest='/home/seb/.codex/visualizations/2026/11/17/01a1e804-c829-73b1-b399-07d98b859e42';
const [assets,renderer]=await Promise.all([readFile(`${dir}/assets.json`,'utf8'),readFile(`${dir}/renderer.js`,'utf8')]);
for(const [name,file]of [['proof','vfd-grammar-proof'],['menu','vfd-menu-systems']]){
 const template=await readFile(`${dir}/${name}.fragment.html`,'utf8');
 const html=template.replace('__ASSETS__',assets).replace('__RENDERER__',renderer);
 if(Buffer.byteLength(html)>=1000000)throw Error('Visualization exceeds 1 MB');
 await writeFile(`${dest}/${file}.html`,html);
 console.log(`${file}: ${Buffer.byteLength(html)} bytes`);
}
