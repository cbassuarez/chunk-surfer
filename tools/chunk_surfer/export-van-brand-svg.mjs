import {writeFile,mkdir} from 'node:fs/promises';
import {VAN_BRAND_ART,VAN_BRAND_PIGMENTS,VAN_BRAND_VIEWBOX,VAN_BRAND_COPY} from '../../src/data/van-brand-art.js';
const loop=points=>'M'+points.map(p=>p.map(v=>v.toFixed(2)).join(',')).join('L')+'Z';
const shapes=[...VAN_BRAND_ART].sort((a,b)=>(a.layer||0)-(b.layer||0)).map(s=>`<path id="${s.id}" fill="${VAN_BRAND_PIGMENTS[s.pigment]}" fill-rule="evenodd" d="${loop(s.outer)}${(s.holes||[]).map(loop).join('')}"/>`).join('\n');
await mkdir('assets/van-brand',{recursive:true});
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VAN_BRAND_VIEWBOX.join(' ')}" role="img" aria-label="${VAN_BRAND_COPY}"><title>${VAN_BRAND_COPY}</title>${shapes}</svg>\n`;
await writeFile('assets/van-brand/albion-location-sound.svg',svg);
// Keep existing external art-review links valid without retaining obsolete paint.
await writeFile('assets/van-brand/field-recording.svg',svg);
console.log('Original filled-pigment mark exported to assets/van-brand/albion-location-sound.svg');
