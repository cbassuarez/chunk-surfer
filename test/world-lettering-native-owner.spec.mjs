import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ensureWorldLetteringFonts,worldLetteringFontsStatus,WORLD_LETTERING_FONT_FILES} from '../src/render/world-lettering-fonts.js';
test('material readiness survives recreation of a native FontFaceSet wrapper',async()=>{
 let loads=0;const added=[];
 const owner={get fonts(){return{add(face){added.push(face);}};}};
 class Face{constructor(family){this.family=family;}async load(){loads++;return this;}}
 const first=ensureWorldLetteringFonts({ownerDocument:owner,FontFaceClass:Face,assetUrl:p=>p});
 await first;
 assert.equal(worldLetteringFontsStatus(owner).ready,true);
 assert.equal(ensureWorldLetteringFonts({ownerDocument:owner,FontFaceClass:Face}),first);
 assert.equal(loads,WORLD_LETTERING_FONT_FILES.length);assert.equal(added.length,loads);
 assert.equal(worldLetteringFontsStatus({fonts:owner.fonts}).ready,false,'another document must load its own faces');
});
