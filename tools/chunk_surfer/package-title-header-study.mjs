// Losslessly package production pixels for the in-conversation comparison.
// A common upper image plus exact lower strips avoids repeating the metal and
// glass texture twelve times. This changes no captured pixel.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
const root=process.cwd(),output=process.argv[2];
if(!output)throw Error('Pass the literal fragment path.');
const data={};
for(const direction of ['current','wideband','split-register','quiet-carrier']){
 data[direction]={};
 for(const profile of ['empty','saved','filed']){
  const source=await readFile(`${root}/artifacts/title-header-study/live/${direction}-${profile}-header.png`);
  let pipeline=sharp(source);
  if(profile!=='empty')pipeline=pipeline.extract({left:0,top:220,width:680,height:104});
  const buffer=await pipeline.webp({lossless:true,effort:6}).toBuffer();
  data[direction][profile]=`data:image/webp;base64,${buffer.toString('base64')}`;
 }
}
const template=await readFile(output,'utf8');
if(!template.includes('__CAPTURE_DATA__')&&!/const captures = \{[^\n]+\};/.test(template))throw Error('Missing capture data slot.');
const html=template.includes('__CAPTURE_DATA__')?template.replace('__CAPTURE_DATA__',JSON.stringify(data)):template.replace(/const captures = \{[^\n]+\};/,`const captures = ${JSON.stringify(data)};`);
if(Buffer.byteLength(html)>=1000000)throw Error(`Fragment too large: ${Buffer.byteLength(html)} bytes`);
await writeFile(output,html);
console.log(`Packaged ${Buffer.byteLength(html)} bytes; 12 lossless production captures.`);
