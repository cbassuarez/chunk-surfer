// Shape acceptance over saved actual-GPU evidence, independent of shader code.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
const path=process.argv[2]||'artifacts/lettering-production/solid-paint-diagnosis/candidate3-operator/report.json';
const bytes=readFileSync(path),r=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
const results=r.cases.map(c=>{
 const core=c.groups.fullCore,counters=c.groups.enclosedCounters,strong=c.groups.strongAA;
 const checks={
  actualProduction:c.evidence.asset==='production'&&c.evidence.kind==='encounter',
  nativeMinimum:c.evidence.acquisition.sceneWidth===960&&c.evidence.acquisition.sceneHeight===600,
  gpuClean:c.glError===0&&c.evidence.glError===0,
  noOpaqueInteriorHoles:core.count===0||core.vfdLightFraction===0&&core.finalLightFraction===0,
  counterShapeRetained:counters.count>0&&counters.vfdLightFraction===1&&counters.finalLightFraction===1,
  sourceStrokeContinuity:c.strokeComponents.length>0&&c.strokeComponents.every(s=>s.darkParts===1),
  strongPigmentNotPerforated:strong.count>0&&strong.vfdLightFraction<=.005&&strong.finalLightFraction<=.005,
 };
 return{id:c.id,distance:c.distance,checks,corePixels:core.count,coreLightPixels:Math.round(core.count*(core.vfdLightFraction||0)),counterPixels:counters.count,
  sourceStrokeComponents:c.strokeComponents.length,disconnectedComponents:c.strokeComponents.filter(s=>s.darkParts!==1).length,
  strongPigmentPixels:strong.count,strongPigmentLightPixels:Math.round(strong.count*strong.vfdLightFraction)};
});
const checks={capturedFreezeUnchanged:r.sourcesUnchanged===true,noPageErrors:r.errors.length===0,fourActualEncounters:results.length===4,
 thickInteriorWitness:results.filter(c=>c.corePixels>=100).length>=2,allShapeChecks:results.every(c=>Object.values(c.checks).every(Boolean))};
const result={date:new Date().toISOString(),capture:path,captureSha256:sha(bytes),assertionToolSha256:sha(readFileSync(new URL(import.meta.url))),
 mode:r.mode,checks,accepted:Object.values(checks).every(Boolean),results,
 scope:'Controlled static shape regression on actual production signs at960x600,3m and1.5m with aimed real torch. A source stroke is the authored coverage>=0.5 connected component; counter cores come from enclosed stock components. Opaque interior is fullcoverage with all8neighbors fullcoverage. It is not a fresh-reader or real-time-performance claim.',
 thresholds:{opaqueInteriorLightPixels:0,counterStockLightFraction:1,renderedPartsPerSourceStroke:1,maximumStrongPigmentLightFraction:.005,
 rationale:'The rejected operator can pass aggregate whole-plate darkness while severing letter strokes and inverting bare counter stock. Require the actual material mask topology and thick interiors to survive; tolerate at most0.5% bright strong-AA perimeter samples rather than accepting averaged hollow letters.'}};
writeFileSync(join(dirname(path),'solid-paint-regression.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));assert.ok(result.accepted,'Saved GPU lettering fails the solid-paint shape regression');
