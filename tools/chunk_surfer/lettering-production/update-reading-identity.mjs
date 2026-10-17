// Annotate later production deltas without relabelling historical captured
// images or their renderer/source hashes. Does not display a view or response.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {buildLetteringEncounter} from '../../../artifacts/lettering-study/encounters.js';
const root='artifacts/lettering-production',manifestFile=`${root}/reading-trials.json`,qaFile=`${root}/evidence/production-reading-protocol-qa.json`;
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),fileSha=file=>sha(fs.readFileSync(file));
const manifest=JSON.parse(fs.readFileSync(manifestFile)),qa=JSON.parse(fs.readFileSync(qaFile));
const deltaFile=`${root}/paper-proxy-removal.json`,delta=JSON.parse(fs.readFileSync(deltaFile)),currentPack=fileSha('public/assets/conservatory-props.glb');
assert.equal(delta.afterPackSha256,currentPack);assert.equal(delta.all89PrintFacesUnchanged,true);
assert.equal(delta.other473MeshDefinitionsUnchanged,true);assert.equal(delta.entireBinaryPayloadUnchanged,true);
assert.equal(fileSha(`${root}/evidence/capture-index.json`),manifest.captureIndexSha256,'The original captured index must remain historical and immutable');
const ordinaryScenes=['dock','vigil'].map(id=>({id,sourceRoomLighting:!!buildLetteringEncounter(id).sourceRoomLighting}));
assert.ok(ordinaryScenes.every(scene=>scene.sourceRoomLighting===false));
for(const trial of manifest.trials){
 assert.equal(fileSha(path.resolve(root,trial.image)),trial.imageSha256,'Frozen trial image bytes changed');
 assert.equal(trial.sourceCapture.frame.evidence.packSha256,delta.beforePackSha256,'Do not relabel captured pack identity');
}
const note={updatedAt:new Date().toISOString(),frozenImagePackSha256:delta.beforePackSha256,currentProductionPackSha256:currentPack,
 originalCaptureAndRendererHashesRetained:true,frozenImageBytesUnchanged:true,recaptured:false,
 laterGeometryChange:{mesh:delta.mesh,removedBoxes:delta.removedBoxes,removedTriangles:delta.removedTriangles,
  unaffectedMeshDefinitions:473,all89PrintFacesUnchanged:true,entireBinaryAndImagePayloadUnchanged:true,
  proof:deltaFile,proofSha256:fileSha(deltaFile)},
 laterSourceOnlyGrainGuard:{file:'src/render/props3d.js',currentSha256:fileSha('src/render/props3d.js'),
  currentAcquisitionShaderSha256:fileSha('src/render/pixel-mesh/shader.js'),
  predicate:'The changed grain derivation is gated by uSourceRoomLighting > 0.5; printed surfaces now retain neutral grain.',
  trialSceneConstruction:ordinaryScenes,
  method:'Pure-CPU current buildLetteringEncounter construction and the inspector configuration gate; no new GPU capture or pixel-equivalence measurement is claimed by this annotation.',
  conclusion:'Neither frozen ordinary trial enters the changed Source-room grain branch.'},
 interpretation:'These remain the original 0dcd captures with their original image, pack and renderer identities. Later page-only geometry and Source-room grain fixes do not relabel those historical frames. Fresh-reader responses and accuracy remain untested.'};
manifest.productionIdentityNote=note;
for(const trial of manifest.trials)trial.sourceCapture.subsequentProductionIdentity=note;
fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
qa.postQaIdentityAnnotation={updatedAt:note.updatedAt,previousQaManifestSha256:qa.sourceHashes[manifestFile],currentManifestSha256:fileSha(manifestFile),
 protocolHtmlJsUnchanged:[`${root}/reading-test.html`,`${root}/reading-test.js`].every(file=>fileSha(file)===qa.sourceHashes[file]),
 imageBytesUnchanged:true,change:'Metadata-only subsequent-production annotation; original captured identities retained.',
 viewsShownAgain:0,answersEntered:0,responsesSubmitted:0,humanReadingResults:'pending fresh reader'};
assert.equal(qa.postQaIdentityAnnotation.protocolHtmlJsUnchanged,true);
fs.writeFileSync(qaFile,JSON.stringify(qa,null,2)+'\n');
const out=`${root}/evidence/production-reading-identity-note.json`;fs.writeFileSync(out,JSON.stringify(note,null,2)+'\n');
console.log(JSON.stringify({manifest:manifestFile,identityNote:out,manifestSha256:fileSha(manifestFile),frozenImagePack:delta.beforePackSha256,currentProductionPack:currentPack,
 ordinaryScenes,viewsShownAgain:0,answersEntered:0,responsesSubmitted:0}));
