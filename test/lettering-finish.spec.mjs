import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {bakeLetteringAtlases,letteringFinishProfile,LETTERING_FINISH_PROFILES} from '../tools/chunk_surfer/lettering/physical-lettering.mjs';

const classifications=[
 ['vitreous-enamel screen print','institution','enamel'],
 ['volunteer brush paint on tensioned cloth','personal','painted-cloth'],
 ['volunteer broad-nib paint on card','personal','painted-card'],
 ['transport timetable letterpress on paper','vehicle','paper-print'],
 ['gilt house lettering on dark enamel','institution','gilt-enamel'],
 ['oxidised die-stamped brass key tag','record','brass-plate'],
 ['cut civic inscription on mineral face','institution','cut-mineral'],
 ['ceramic mosaic inscription','institution','ceramic-mosaic'],
 ['bridged maintenance stencil on concrete','maintenance','mineral-stencil'],
 ['bridged paint stencil on woven rope mat','maintenance','rope-stencil'],
 ['old inventory ink stamp on original wood','record','wood-ink'],
 ['black screen print on opal telephone glass','phone','opal-glass'],
 ['telephone apparatus printed enamel and paper','phone','paper-print'],
];
for(const [process,category,expected] of classifications){
 const finish=letteringFinishProfile({id:process,process,category});assert.equal(finish.profile,expected);assert.equal(finish.support.edgeWear,false);
}
for(const [profile,value] of Object.entries(LETTERING_FINISH_PROFILES)){
 assert.ok(value.fieldM>0&&value.fieldM<1,profile);assert.ok(value.roughness>=0&&value.roughness<=1);assert.ok(value.microReliefM>=0&&value.microReliefM<=.00003);
}
assert.equal(letteringFinishProfile({id:'word',edgeWear:true,finishSupport:{kind:'applied-lettering'}}).support.edgeWear,false,'Word overlay falsely acquires a distressed perimeter');
assert.throws(()=>letteringFinishProfile({id:'bad',finish:{profile:'invented'}}),/Unknown lettering finish/);
assert.ok(letteringFinishProfile({id:'stone',process:'cut civic inscription on mineral face'}).fabricationReliefM<0,'Cut mineral reads as raised paint');
assert.ok(letteringFinishProfile({id:'stamp',process:'oxidised die-stamped brass key tag'}).fabricationReliefM<0,'Die-stamped brass reads as raised paint');
assert.ok(letteringFinishProfile({id:'engraved',process:'engraved equipment legend'}).fabricationReliefM<0,'Engraved equipment reads as raised paint');
assert.ok(letteringFinishProfile({id:'ink',process:'old inventory ink stamp on original wood'}).fabricationReliefM>0,'Thin inventory ink is mistaken for a die impression');

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-finish-regression-'));
const base={id:'normal-view',copy:'STUDIO WING / KEEP CLEAR',widthM:1.8,heightM:.35,capHeightM:.11,category:'institution',process:'vitreous-enamel screen print',palette:{ground:[.70,.68,.55],ink:[.012,.014,.011]}};
const crop=async(bake,role)=>{const e=bake.entries.get(base.id),p=bake.pages[e.page],decoded=await sharp(p[role]).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const left=Math.round(e.uvRect[0]*p.width),top=Math.round(e.uvRect[1]*p.height),width=Math.round((e.uvRect[2]-e.uvRect[0])*p.width),height=Math.round((e.uvRect[3]-e.uvRect[1])*p.height),alpha=Buffer.alloc(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)alpha[y*width+x]=decoded.data[((top+y)*p.width+left+x)*4+3];return alpha;};
try{
 const quiet=await bakeLetteringAtlases([{...base,finish:{variation:0,roughnessVariation:0,deposit:0,edgeLoss:0,microReliefM:0}}],{outputDir:path.join(dir,'quiet')});
 const conditioned=await bakeLetteringAtlases([{...base,finishSupport:{kind:'carrier',edgeWear:true,contact:'lower',exposure:'exterior'}}],{outputDir:path.join(dir,'condition')});
 assert.deepEqual(await crop(quiet,'albedo'),await crop(conditioned,'albedo'),'Condition changes approved solid pigment coverage');
 assert.equal(quiet.entries.get(base.id).metrics.coverageSha256,conditioned.entries.get(base.id).metrics.coverageSha256);
 assert.deepEqual(quiet.entries.get(base.id).metrics.glyphs,conditioned.entries.get(base.id).metrics.glyphs,'Condition changes exact glyph layout');
 assert.ok(conditioned.entries.get(base.id).finishEvidence.conditionRanges.deposit[1]>0);
 assert.ok(conditioned.entries.get(base.id).finishEvidence.conditionRanges.contact[1]>0);
 assert.ok(!conditioned.entries.get(base.id).finishEvidence.bakedLighting);
 const steel=LETTERING_FINISH_PROFILES.enamel;assert.equal(steel.metallic,undefined,'Dielectric enamel inherits substrate metallicity');
 const structureJobs=[
  {id:'cloth-fine',widthM:.08,heightM:.04,rasterWidthPx:256,rasterHeightPx:128,category:'personal',process:'volunteer brush paint on tensioned cloth'},
  {id:'cloth-coarse',widthM:.8,heightM:.4,rasterWidthPx:256,rasterHeightPx:128,category:'personal',process:'volunteer brush paint on tensioned cloth'},
  {id:'mosaic-fine',widthM:.16,heightM:.08,rasterWidthPx:256,rasterHeightPx:128,category:'institution',process:'ceramic mosaic inscription'},
  {id:'mosaic-coarse',widthM:1.6,heightM:.8,rasterWidthPx:128,rasterHeightPx:64,category:'institution',process:'ceramic mosaic inscription'},
  {id:'cut-face',widthM:1,heightM:.3,category:'institution',process:'cut civic inscription on mineral face'},
  {id:'die-stamp',widthM:.1,heightM:.03,category:'record',process:'oxidised die-stamped brass key tag'},
 ];
 const manufactured=await bakeLetteringAtlases(structureJobs.map(j=>({...j,copy:'E',capHeightM:j.heightM*.45,palette:base.palette})),{outputDir:path.join(dir,'manufactured')});
 for(const [fine,coarse,pitch]of [['cloth-fine','cloth-coarse',.0028],['mosaic-fine','mosaic-coarse',.016]]){
  assert.equal(manufactured.entries.get(fine).finishEvidence.structure.actualPitchM,pitch);assert.equal(manufactured.entries.get(coarse).finishEvidence.structure.actualPitchM,pitch,'Manufacture enlarges to match low texture resolution');
  assert.equal(manufactured.entries.get(fine).finishEvidence.structure.resolved,true);assert.equal(manufactured.entries.get(coarse).finishEvidence.structure.resolved,false);
 }
 for(const id of ['cut-face','die-stamp'])assert.ok(manufactured.entries.get(id).reliefM<0&&manufactured.entries.get(id).finishEvidence.physicalScalesM.inkRelief<0,'Negative fabrication relief lost before atlas output');
 console.log('lettering finish specs passed (process families, no false overlay edge, immutable solid coverage/layout, metre-scaled condition, no baked light)');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
