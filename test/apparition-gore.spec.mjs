import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {APPARITION_GORE} from '../src/render/apparition-gore.js';

const props=fs.readFileSync(new URL('../src/render/props3d.js',import.meta.url),'utf8');

test('all three apparition states keep their own treatment; the torch glint only recolours specks variant 11 already keeps',()=>{
 // Variant 11: the original discard and colour come first, unchanged.
 assert.match(props,/\}else if\(vPortrait==11\)\{\s*if\(grain>\.022\+\.095\*edge\+\.13\*ground\)discard;\s*apparitionColor=vec3\(\.15,\.18,\.19\)\*\( \.66\+\.34\*edge\+\.18\*ground \);/);
 // ...and the glint can only mix colour into a speck that survived it.
 assert.match(props,/if\(nearGore>0\.0\)\{\s*vec4 glint=apparitionGlint\(.*\);\s*apparitionColor=mix\(apparitionColor,glint\.rgb,glint\.a\);\s*\}/);
 assert.equal((props.match(/apparitionGlint\(/g)||[]).length,1);
 // Variants 10 and 12 untouched; nothing moves an apparition's vertices for gore.
 assert.match(props,/if\(vPortrait==10\)\{\s*\/\/ The broad cast shadow supplies the rim;[^]*?apparitionColor=vec3\(\.009,\.012,\.015\)\+vEmissive\.rgb\*charge;/);
 assert.match(props,/\}else\{\s*if\(grain>\.008\+\.019\*edge\+\.025\*ground\)discard;\s*apparitionColor=vec3\(\.105,\.116,\.125\);/);
 assert.doesNotMatch(props,/goreLip|aPortrait>10\.5&&aPortrait<11\.5/);
});

test('the glint is reachable: well along at the nearest distance the emergency crowd allows',()=>{
 // Measured in the hall with verify-flesh-reveal-live.mjs: the crowd backs
 // off to 2.94-3.15m (MIN_APPROACH is 2.2m).
 const near=d=>{const t=Math.min(1,Math.max(0,(d-APPARITION_GORE.fullM)/(APPARITION_GORE.startM-APPARITION_GORE.fullM)));return 1-t*t*(3-2*t);};
 assert.ok(near(3.15)>.85,`only ${near(3.15)} at the crowd's closest`);
 assert.equal(near(APPARITION_GORE.startM),0);
});
