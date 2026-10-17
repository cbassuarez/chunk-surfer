// Structural and optical gates on saved actual-GPU proof, not a reading test.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
const path=process.argv[2]||'artifacts/lettering-production/gilt/current-shape/report.json';
const report=JSON.parse(readFileSync(path));
const rows=report.cases.filter(c=>c.mode===3&&c.polarity==='light-on-dark'&&(c.light||'torch')==='torch'&&!c.grazingDeg).map(c=>{
 const glyphs=c.glyphProofs||[],parts=glyphs.flatMap(g=>g.retainedParts),counters=glyphs.flatMap(g=>g.counters);
 return{id:c.id,distance:c.distance,mesh:c.mesh,glyphs:glyphs.length,
  missingProjectedGlyphs:glyphs.filter(g=>g.selectedPigmentPixels===0).map(g=>({character:g.character,line:g.line})),
  lowRetentionGlyphs:glyphs.filter(g=>g.selectedRetention<.95).map(g=>({character:g.character,line:g.line,retention:g.selectedRetention})),
  splitOrLostStrokeComponents:parts.filter(p=>p.sourceArea>=3&&(p.parts!==1||p.largestRetainedFraction<.9)),
  counterCorePixels:counters.reduce((n,c)=>n+c.coreArea,0),incorrectCounterInkPixels:counters.reduce((n,c)=>n+c.incorrectInkPixels,0),
  strongInkLightFraction:c.groups.strongAA.vfdLightFraction,bareStockLightFraction:c.groups.bareCore.vfdLightFraction,flatStockLightFraction:c.groups.bareFlatStock?.vfdLightFraction,nearInkStockLightFraction:c.groups.falseOutlineStock.vfdLightFraction,
  cameraValidation:c.cameraValidation,geometryRayToCentre:c.geometryRayToCentre,glError:c.glError};
});
const required=rows.filter(c=>c.distance<=3),allRequiredIds=['gilt-peal','gilt-hall'];
const checks={sourcesUnchanged:report.sourcesUnchanged===true,allGlClean:report.cases.every(c=>c.glError===0),
 bothActualEncounters:allRequiredIds.every(id=>required.some(c=>c.id===id)),
 actualCameraClear:required.every(c=>c.cameraValidation&&Object.entries(c.cameraValidation).filter(([key])=>key!=='logical').every(([,value])=>value===true)&&c.geometryRayToCentre?.clear),
 namedGlyphsPresent:required.every(c=>c.glyphs>10&&c.missingProjectedGlyphs.length===0),
 selectedGlyphInkRetained:required.every(c=>c.lowRetentionGlyphs.length===0),
 projectedStrokeTopologyRetained:required.every(c=>c.splitOrLostStrokeComponents.length===0),
 enclosedCounterStockPreserved:required.every(c=>c.counterCorePixels>0&&c.incorrectCounterInkPixels===0),
 strongInkCoherent:required.every(c=>c.strongInkLightFraction>=.98),
 darkStockCoherent:required.every(c=>c.flatStockLightFraction<=.005&&c.nearInkStockLightFraction<=.005)};
const result={scope:'Actual-room 3 m aimed-torch structural/material gates. Flat stock requires actual depthEdge≤.003, the printed footprint continuity region; true geometry silhouettes remain preserved and are reported separately. The 4 m rows are reported independently. These gates do not replace native visual inspection, unbriefed reading or motion evidence.',sourceReport:path,checks,rows};
writeFileSync(join(dirname(path),'gilt-solid-regression.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
assert.ok(Object.values(checks).every(Boolean),'Actual gilt structural/material gates failed; see gilt-solid-regression.json');
