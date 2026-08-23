import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { WORK_ORDER, PAGES } from '../src/data/conservatory-script.js';
import { SOURCE_PAGES, sourcePageDocument } from '../src/data/source-pages.js';
import {
  PAPER_FORMAT, PAPER_LOCALE_UK, PAPER_ISSUER, PAPER_TEMPLATE,
  normalizePhysicalDocument, validateBritishPaperDocument,
} from '../src/data/paper-system.js';
import { PAPER_ATLAS, PAPER_DOCUMENTS, PAPER_AMBIENT_IDS } from '../src/generated/paper-catalog.js';
import { ambientPaperDocumentId, paperAtlasIndex, paperAssetProbe, paperPageCount } from '../src/game/paper-assets.js';

assert.deepEqual(PAPER_FORMAT.A4.canonicalPx,[2480,3508]);
assert.equal(PAPER_FORMAT.A4.widthMm,210);assert.equal(PAPER_FORMAT.A4.heightMm,297);
assert.equal(PAPER_LOCALE_UK.language,'en-GB');assert.equal(PAPER_LOCALE_UK.time,'24h');
assert.equal(PAPER_LOCALE_UK.terminology.loadingDock,'loading bay');
assert.equal(PAPER_ISSUER.ELLERY_WORKS.address.at(-1).includes('West Yorkshire'),true);assert.ok(PAPER_ISSUER.ELLERY_WORKS.seal);assert.ok(PAPER_ISSUER.CONSERVATOIRE.seal);

const production=[WORK_ORDER,...PAGES,...SOURCE_PAGES.map(sourcePageDocument)];
for(const doc of production){
  const physical=normalizePhysicalDocument(doc);assert.equal(physical.format,'A4',`${doc.id} is A4`);
  assert.equal(validateBritishPaperDocument(doc).ok,true,`${doc.id} keeps British paper language`);
  const probe=paperAssetProbe(doc);assert.equal(probe.resolved,true,`${doc.id} has a baked physical edition`);
  assert.ok(paperPageCount(doc)>=1);assert.ok(paperAtlasIndex(doc.id)>=0);
  for(const page of PAPER_DOCUMENTS[doc.id].pages){assert.ok(existsSync(page.path),`${page.path} exists`);assert.ok(statSync(page.path).size>1024,`${page.path} is not an empty placeholder`);assert.ok(page.materialPath&&existsSync(page.materialPath),`${doc.id} has a packed print material map`);}
}
assert.equal(Object.keys(PAPER_DOCUMENTS).length,production.length+1,'the catalog includes every production document plus the real still sheet');
assert.ok(PAPER_DOCUMENTS['source-real-still']);
assert.equal(PAPER_DOCUMENTS['work-order'].pages.length,3,'the authored work-order packet remains three physical sheets');
assert.ok(PAPER_DOCUMENTS['work-order'].processes.includes('biro'),'authored manual marks survive the offline paper process');
assert.equal(paperAtlasIndex('work-order',2),PAPER_DOCUMENTS['work-order'].pages[2].atlasIndex);
assert.equal(PAPER_ATLAS.count,Object.values(PAPER_DOCUMENTS).reduce((n,d)=>n+d.pages.length,0));
assert.ok(existsSync(PAPER_ATLAS.path));assert.ok(statSync(PAPER_ATLAS.path).size>4096);
assert.equal(PAPER_AMBIENT_IDS.length,128);assert.ok(PAPER_DOCUMENTS[ambientPaperDocumentId(4417,3)]);


assert.equal(PAPER_DOCUMENTS['page-1'].issuer,'ellery-works','recordist field logs use the contractor paper system, not conservatoire web-like stationery');
assert.equal(PAPER_DOCUMENTS['page-1'].template,PAPER_TEMPLATE.FIELD_LOG);
assert.equal(PAPER_DOCUMENTS['source-page:take-main-b3-a'].template,PAPER_TEMPLATE.TAKE_SHEET,'underscore source register aliases resolve to real physical templates');
assert.equal(PAPER_DOCUMENTS['source-page:fault-01'].template,PAPER_TEMPLATE.FAULT_REPORT);
assert.equal(PAPER_DOCUMENTS['source-page:method-note'].template,PAPER_TEMPLATE.FREEFORM);
assert.equal(PAPER_DOCUMENTS['foh-overflow-note'].template,PAPER_TEMPLATE.INVENTORY);
assert.equal(PAPER_DOCUMENTS['faculty-reference-requirement'].template,PAPER_TEMPLATE.NOTICE);

assert.equal(PAPER_DOCUMENTS['page-1'].entryProcess,'impact-24-nlq');
assert.equal(PAPER_DOCUMENTS['page-1'].stationeryProcess,'offset-1c');
assert.ok(Array.isArray(PAPER_DOCUMENTS['page-1'].handlingVector));
assert.ok(PAPER_DOCUMENTS['page-1'].handling.moisture,'field-carried sheets have causal moisture history');
assert.ok(PAPER_DOCUMENTS['page-1'].handling.tear,'field-carried sheets carry a small real edge tear');
assert.ok(PAPER_DOCUMENTS['source-page:method-note'].handling.tear,'freeform Source notes can carry causal torn-edge handling');
const compiler=readFileSync('scripts/build-paper-assets.mjs','utf8');
const paperSystemSource=readFileSync('src/data/paper-system.js','utf8');
assert.match(compiler,/FIELD RECORDING LOG/);assert.match(compiler,/ROOM TONE \/ TAKE SHEET/);assert.match(compiler,/FAULT \/ REMEDIAL WORKS REPORT/);assert.match(compiler,/SITE ACCESS \/ MOVEMENT SHEET/);assert.match(compiler,/SITE ATTENDANCE \/ TIME SHEET/);
assert.match(compiler,/paper-v1\.5\.0-paper3d-print-history/);assert.match(compiler,/conservatoire-seal|issuerSealSvg/);assert.match(compiler,/data-process=\"preprinted-stationery\"/);assert.match(paperSystemSource,/impact-24-nlq/);
assert.ok(existsSync('scripts/paper/rasterize_svg.py'),'hermetic paper rasterizer exists');

assert.doesNotMatch(compiler,/function fieldRow[\s\S]{0,500}box\(/,'ordinary form fields are open stationery lines, not HTML/Excel cells');
assert.match(compiler,/JOB REF\./,'field log uses fixed typewriter stations instead of a four-cell header table');
assert.match(compiler,/moisture|tide rings/i,'handling pipeline includes causal moisture marks');
const rasterizer=readFileSync('scripts/paper/rasterize_svg.py','utf8');
assert.match(rasterizer,/impact-9-draft/);assert.match(rasterizer,/pin grid|discrete strikes/i);assert.match(rasterizer,/handling=alpha_from/,'handling contributes to the packed material map');

const reader=readFileSync('src/game/document.js','utf8');
assert.doesNotMatch(reader,/fillText\(|Courier New|function erode\(|drawTracked\(/,'inspect paper must not shape live document glyphs');
assert.match(reader,/drawPhysicalPage/);assert.match(reader,/paper3dRender/,'inspect reader uses the dedicated WebGL paper mesh');assert.match(reader,/STRIPS=36/,'safe Canvas strip fallback remains available');assert.match(reader,/shadowBlur/);assert.match(reader,/PAPER ASSET NOT BUILT/,'missing dev assets are explicit rather than silently becoming browser typography');
const physical=readFileSync('src/render/paper.js','utf8');
assert.doesNotMatch(physical,/autoStamps|autoStains|autoFolds|autoDamage/,'paper history is never page-number-driven decoration');
const sourceRuntime=readFileSync('src/game/source-space-runtime.js','utf8');
assert.doesNotMatch(sourceRuntime,/function pageTextInstances\(/,'Source paper no longer carries live text decals');
assert.match(sourceRuntime,/paperIndex:\s*paperAtlasIndex\(paperDocumentIdForSheet\(i\)\)/);
assert.match(sourceRuntime,/paperAtlasIndex\('source-real-still'\)/);
const props=readFileSync('src/render/props3d.js','utf8');
assert.match(props,/aPaperIndex/);assert.match(props,/aPaperHandling/);assert.match(props,/uPaperAtlas/);assert.match(props,/uPaperAtlasGrid/);
assert.match(props,/flat out int vPaperIndex/,'paper index is exported by the prop vertex shader');
assert.match(props,/flat in int vPaperIndex/,'paper index is received by the prop fragment shader');
assert.match(props,/gl\.isProgram\(program\)/,'prop rendering refuses to query uniforms from a failed or stale WebGL program');
assert.match(props,/uniformCache\.clear\(\)/,'renderer re-init invalidates program-local uniform locations');
assert.match(props,/name\.startsWith\('loose_note'\)/,'all loose-note meshes, including page 6, receive physical paper art');
const r3d=readFileSync('src/render/r3d.js','utf8');assert.match(r3d,/loadPaperAtlas/);
const main=readFileSync('src/main.js','utf8');assert.match(main,/function worldPaperIndex/);assert.match(main,/loose-page:/);

console.log(`paper system specs passed (${production.length} authored documents, ${Object.keys(PAPER_DOCUMENTS).length} physical editions)`);
