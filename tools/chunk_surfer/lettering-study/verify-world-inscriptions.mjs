import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {NodeIO} from '@gltf-transform/core';
import {WORLD_INSCRIPTIONS} from '../../../src/data/world-inscriptions.js';
import {inscriptionSurfaceTriangles} from '../lettering/world-inscription-substrates.mjs';
import {printedFaceGeometry} from '../lettering/face-geometry.mjs';
const directory=path.resolve(process.argv[2]||'public/assets'),out=path.resolve(process.argv[3]||'artifacts/lettering-study/world-inscription-asset-proof.json');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fail=message=>{throw new Error(message);};
const io=new NodeIO(),props=await io.read(path.join(directory,'conservatory-props.glb')),
 acquisitions=await io.read('public/assets/conservatory-acquisitions.glb');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'conservatory-props.lettering.json'))),entries=new Map(manifest.entries.map(e=>[e.id,e]));
const meshes=new Map([...props.getRoot().listMeshes(),...acquisitions.getRoot().listMeshes()].map(m=>[m.getName(),m]));
function supportingDepth(triangles,x,y){
 let best=-Infinity;
 for(const triangle of triangles){
  const [a,b,c]=triangle.projected,det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  if(Math.abs(det)<1e-15)continue;
  const wa=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det,
   wb=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det,wc=1-wa-wb;
  if(Math.min(wa,wb,wc)<-1e-6)continue;
  const depth=wa*a[2]+wb*b[2]+wc*c[2];if(depth<=.003)best=Math.max(best,depth);
 }
 return best;
}
const proofs=[];
for(const job of WORLD_INSCRIPTIONS){
 const entry=entries.get(job.id),mesh=meshes.get(job.mesh),host=meshes.get(job.hostMesh);
 if(!entry||!mesh||!host)fail(`${job.id}: missing actual entry/overlay/host in built assets`);
 if(entry.copy!==job.copy)fail(`${job.id}: baked copy differs`);
 const expected=printedFaceGeometry(job),primitive=mesh.listPrimitives();
 if(primitive.length!==1)fail(`${job.id}: overlay must have one physical print primitive`);
 const p=primitive[0].getAttribute('POSITION'),n=primitive[0].getAttribute('NORMAL'),indices=primitive[0].getIndices();
 if(p.getCount()!==4||indices.getCount()!==6)fail(`${job.id}: overlay duplicated host geometry`);
 let maximumPositionError=0,maximumNormalError=0;
 for(let i=0;i<4;i++)for(let k=0;k<3;k++){
  maximumPositionError=Math.max(maximumPositionError,Math.abs(p.getElement(i,[])[k]-expected.positions[i*3+k]));
  maximumNormalError=Math.max(maximumNormalError,Math.abs(n.getElement(i,[])[k]-expected.normals[i*3+k]));
 }
 if(maximumPositionError>1e-6||maximumNormalError>1e-6)fail(`${job.id}: baked reader geometry does not match measured host-local face`);
 const material=primitive[0].getMaterial(),printed=material.getExtras().printedSurface;
 if(material.getAlphaMode()!=='OPAQUE'||printed?.coverage!=='baseColorAlpha')fail(`${job.id}: print contract lost`);
 const triangles=inscriptionSurfaceTriangles(host,job),depths=[];
 for(const u of[-.49,-.25,0,.25,.49])for(const v of[-.49,-.25,0,.25,.49])depths.push(supportingDepth(triangles,u*job.widthM,v*job.heightM));
 if(depths.some(d=>!Number.isFinite(d)||d>5e-5||d<-.004))fail(`${job.id}: unsupported/penetrating real face samples ${Math.min(...depths)}..${Math.max(...depths)}`);
 const glyphs=entry.metrics.glyphs.filter(g=>g.character).map(g=>g.character).join('');
 if(glyphs!==job.lines.join('').replace(/\s/gu,''))fail(`${job.id}: glyph raster lost a codepoint`);
 proofs.push({id:job.id,hostMesh:job.hostMesh,copy:entry.copy,capHeightM:entry.metrics.capHeightM,
  maximumPositionError,maximumNormalError,supportedSamples:25,minimumSeparationM:-Math.max(...depths),
  maximumSeparationM:-Math.min(...depths),stockSampled:!!entry.substrate});
}
const python=process.env.CHUNK_SURFER_LETTERING_PYTHON||'/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const stockOut=out.replace(/\.json$/,'-stock.json'),contactOut=out.replace(/\.json$/,'-stock.png');
const run=spawnSync(python,['tools/chunk_surfer/lettering-study/verify-inscription-stock.py',directory,stockOut,contactOut],{encoding:'utf8'});
if(run.status!==0)fail(run.stderr||run.stdout||String(run.error));
const report={date:new Date().toISOString(),assetDirectory:directory,packSha256:sha(fs.readFileSync(path.join(directory,'conservatory-props.glb'))),
 manifestSha256:sha(fs.readFileSync('src/data/world-inscriptions.js')),surfaces:proofs.length,overlayTriangles:proofs.length*2,
 supportSamples:proofs.length*25,stockProof:stockOut,stockContact:contactOut,
 limits:['Raw geometry/texel checks do not establish human reading or final camera/light acceptance.','Tiny rear/underside asset codes retain incidental physical scale, rather than becoming foreground clues.'],proofs};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,surfaces:proofs.length,supportSamples:report.supportSamples,stockProof:stockOut}));
