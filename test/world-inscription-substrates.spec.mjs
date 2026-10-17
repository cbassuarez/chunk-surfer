import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {WORLD_INSCRIPTIONS} from '../src/data/world-inscriptions.js';
import {prepareWorldInscriptionSubstrates} from '../tools/chunk_surfer/lettering/world-inscription-substrates.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chunk-lettering-stock-'));
try{
 const jobs=await prepareWorldInscriptionSubstrates(WORLD_INSCRIPTIONS,{root:process.cwd(),outputDir:dir});
 const sampled=jobs.filter(job=>job.substrate),reports=new Map();
 assert.equal(sampled.length,17);
 for(const job of sampled){
  const stock=job.substrate,report=JSON.parse(fs.readFileSync(stock.projectionReport));
  assert.equal(report.mesh,job.hostMesh);assert.equal(report.missingTexels,0);
  assert.ok(report.minimumSeparationM>0&&report.maximumSeparationM<.004,
   `${job.id}: pigment must stay outside and physically supported by its real host`);
  for(const role of ['albedoPath','normalPath','ormPath'])assert.ok(fs.statSync(stock[role]).size>50,`${job.id}: ${role} exists`);
  assert.equal(stock.roughnessFactor,1);assert.equal(stock.metallicFactor,1);
  assert.match(stock.sourceAssetSha256,/^[0-9a-f]{64}$/);
  reports.set(stock.projectionReport,report);
 }
 assert.equal(reports.size,5,'shared chair/panel source geometry should reuse its projected stock, while painted copy remains per instance');
 const python=process.env.CHUNK_SURFER_LETTERING_PYTHON||'/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
 const code=`from PIL import Image
import numpy as np,json,sys,subprocess
from pathlib import Path
p=Path(sys.argv[1]);image=np.array([[[255,0,0],[0,255,0]],[[0,0,255],[255,255,255]]],dtype=np.uint8)
Image.fromarray(image,'RGB').save(p/'source.png')
Image.new('RGB',(2,2),(255,128,64)).save(p/'orm.png')
points=[[-.5,-.5,-.0006],[.5,-.5,-.0006],[.5,.5,-.0006],[-.5,.5,-.0006]];uv=[[0,1],[1,1],[1,0],[0,0]]
tri=[]
for ids in [[0,1,2],[0,2,3]]:tri.append(dict(primitiveIndex=0,points=[points[i] for i in ids],projected=[points[i] for i in ids],uv=[uv[i] for i in ids],normals=[[0,0,1]]*3))
data=dict(id='known-colors',sourceAsset='known fixture',sourceAssetSha256='fixture',mesh='fixture',width=2,height=2,widthM=1,heightM=1,orientation=dict(center=[0,0,0],readerRight=[1,0,0],up=[0,1,0]),triangles=tri,materials=[dict(name='known',albedo=str(p/'source.png'),normal=None,orm=str(p/'orm.png'),occlusion=None,baseColorFactor=[.5,.25,.75,1],roughnessFactor=.5,metallicFactor=.25,normalScale=1,occlusionStrength=1)])
(p/'input.json').write_text(json.dumps(data));subprocess.run([sys.executable,'tools/chunk_surfer/lettering/sample-host-substrate.py',str(p/'input.json'),str(p/'fixture')],check=True,stdout=subprocess.DEVNULL)
actual=np.asarray(Image.open(p/'fixture-albedo.png')).astype(int);expected=np.array([[[188,0,0],[0,137,0]],[[0,0,225],[188,137,225]]]);assert np.max(np.abs(actual-expected))<=1,(actual,expected)
actual=np.asarray(Image.open(p/'fixture-orm.png'));assert np.all(actual==[255,64,16]),actual
actual=np.asarray(Image.open(p/'fixture-normal.png'));assert np.all(actual==[128,128,255]),actual
Image.new('RGB',(2,2),(255,128,128)).save(p/'normal.png');data['materials'][0]['normal']=str(p/'normal.png')
turned=[[0,0],[0,1],[1,1],[1,0]]
for triangle,ids in zip(data['triangles'],[[0,1,2],[0,2,3]]):triangle['uv']=[turned[i] for i in ids]
(p/'input.json').write_text(json.dumps(data));subprocess.run([sys.executable,'tools/chunk_surfer/lettering/sample-host-substrate.py',str(p/'input.json'),str(p/'fixture')],check=True,stdout=subprocess.DEVNULL)
actual=np.asarray(Image.open(p/'fixture-normal.png')).astype(int);assert np.max(np.abs(actual-[128,0,128]))<=1,actual
print('Independent UV row orientation, linear factor composition, neutral/rotated normal and exact PBR factor fixtures pass')`;
 const check=spawnSync(python,['-c',code,dir],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr||check.stdout);
 console.log(check.stdout.trim());
 console.log('17 actual imported stock reprojections: zero missing texels/penetrations; original albedo, normal, roughness and metallic preserved');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
