// Task-owned publicity pack. It extends the ordinary prop catalogue, without
// regenerating the conservatory's large shared asset or lettering atlas.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Document,NodeIO} from '@gltf-transform/core';
import {BoxGeometry,Matrix4,Vector3,Quaternion} from 'three';
import {INSTITUTION_POSTER_DESIGNS} from '../../src/data/institution-posters.js';
import {letteringFinishProfile} from './lettering/finish-profiles.mjs';

const root=new URL('../../',import.meta.url),out=new URL('public/assets/institution-posters/',root);
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inputs=['src/data/institution-posters.js','tools/chunk_surfer/build-institution-posters.mjs','tools/chunk_surfer/build-institution-posters.py','tools/chunk_surfer/lettering/rasterize.py','tools/chunk_surfer/lettering/finish.py','tools/chunk_surfer/lettering/finish-profiles.mjs'];
const inputHashes=Object.fromEntries(inputs.map(p=>[p,hash(fs.readFileSync(new URL(p,root)))]));
fs.mkdirSync(out,{recursive:true});
const finish=letteringFinishProfile({category:'record',process:'lithographic print on paper',finishSupport:{kind:'carrier',edgeWear:false,contact:'none'}});
const input=new URL('build-input.json',out);
fs.writeFileSync(input,JSON.stringify({designs:INSTITUTION_POSTER_DESIGNS,finish},null,2)+'\n');
const bundled='/Users/seb/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';
const python=process.env.CHUNK_SURFER_LETTERING_PYTHON||(fs.existsSync(bundled)?bundled:'python3');
const baked=spawnSync(python,[new URL('build-institution-posters.py',import.meta.url).pathname,input.pathname,out.pathname],{encoding:'utf8',maxBuffer:4e6});
if(baked.status!==0)throw Error(`Poster print bake failed: ${baked.stderr||baked.stdout||baked.error}`);
const artwork=JSON.parse(fs.readFileSync(new URL('artwork.json',out),'utf8'));
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Ellery institutional printed posters');
const makeMaterial=(name,base,roughness=.88,metallic=0)=>doc.createMaterial(name).setBaseColorFactor(base).setRoughnessFactor(roughness).setMetallicFactor(metallic).setExtras({materialFactors:'gltf'});
const back=makeMaterial('uncoated poster paper edge',[.64,.60,.49,1]);
const tape=makeMaterial('restrained opaque paper tape',[.63,.57,.40,1],.9);
const casePaint=makeMaterial('programme case green painted metal',[.032,.068,.047,1],.57,.12);
const caseBack=makeMaterial('programme case pale backing',[.55,.55,.46,1],.85);
const caseSteel=makeMaterial('programme case dulled hinge and lock',[.28,.29,.27,1],.33,.75);
const texture=(name,role)=>doc.createTexture(`${name} ${role}`).setImage(new Uint8Array(fs.readFileSync(new URL(`${name}-${role}.png`,out)))).setMimeType('image/png');
const attr=(arr,type,index=false)=>doc.createAccessor().setBuffer(buffer).setType(type).setArray(index?new Uint32Array(arr):new Float32Array(arr));
function primitive(g,material){return doc.createPrimitive().setAttribute('POSITION',attr(g.positions,'VEC3')).setAttribute('NORMAL',attr(g.normals,'VEC3')).setAttribute('TEXCOORD_0',attr(g.uvs,'VEC2')).setIndices(attr(g.indices,'SCALAR',true)).setMaterial(material);}
function box(at,size,mat,angle=0){
 const g=new BoxGeometry(...size);g.applyMatrix4(new Matrix4().compose(new Vector3(...at),new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle),new Vector3(1,1,1)));
 const p=primitive({positions:g.attributes.position.array,normals:g.attributes.normal.array,uvs:g.attributes.uv.array,indices:g.index.array},mat);g.dispose();return p;
}
function paperFace({widthM:w,heightM:h,paperSegments=[16,12]},curved=false,reverse=false){
 const positions=[],normals=[],uvs=[],indices=[],nx=curved?paperSegments[0]:1,ny=curved?paperSegments[1]:1;
 // Upper fixings retain the sheet against the wall. The bottom free edge
 // curls out by 8 mm, with a quieter 1 mm broad paper bow. This is actual
 // silhouette/normal geometry rather than a creased-lighting image.
 const z=(u,v)=>curved?.0002+.008*v**5*(.4+.6*Math.sin(Math.PI*u))+.001*Math.sin(Math.PI*u)*Math.sin(Math.PI*v):.0002;
 for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
  const u=i/nx,v=j/ny,eps=1e-4,du=(z(Math.min(1,u+eps),v)-z(Math.max(0,u-eps),v))/(Math.min(1,u+eps)-Math.max(0,u-eps)),dv=(z(u,Math.min(1,v+eps))-z(u,Math.max(0,v-eps)))/(Math.min(1,v+eps)-Math.max(0,v-eps));
  const n=new Vector3(-du/w,dv/h,1).normalize().multiplyScalar(reverse?-1:1);
  positions.push((u-.5)*w,(.5-v)*h,z(u,v)-(reverse?.00018:0));normals.push(n.x,n.y,n.z);uvs.push(u,v);
 }
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(...(reverse?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
 return{positions,normals,uvs,indices};
}
for(const design of INSTITUTION_POSTER_DESIGNS){
 const ink=doc.createMaterial(`${design.title} / absorbed lithographic inks`).setBaseColorFactor([1,1,1,1]).setMetallicFactor(1).setRoughnessFactor(1).setAlphaMode('OPAQUE')
  .setBaseColorTexture(texture(design.id,'albedo')).setNormalTexture(texture(design.id,'normal')).setMetallicRoughnessTexture(texture(design.id,'orm'))
  .setExtras({materialFactors:'gltf',printedSurface:{version:1,coverage:'baseColorAlpha',polarity:['visiting','lyric','live_electronics'].includes(design.id)?'light-on-dark':'dark-on-light',process:'lithographic institutional publicity on paper',emission:'none'},letteringFinish:{version:1,profile:'paper-print',localSpecular:true}});
 for(const info of[ink.getBaseColorTextureInfo(),ink.getNormalTextureInfo(),ink.getMetallicRoughnessTextureInfo()])info.setWrapS(33071).setWrapT(33071);
 for(const curved of[false,true]){
  const name=curved?design.tapedMesh:design.flatMesh,m=doc.createMesh(name),front=paperFace(design,curved),rear=paperFace(design,curved,true);
  m.addPrimitive(primitive(front,ink)).addPrimitive(primitive(rear,back));
  if(curved)for(const side of[-1,1])m.addPrimitive(box([side*design.widthM*.32,design.heightM*.49,.0011],[.055,.026,.0012],tape,side*.09));
  m.setExtras({institutionPoster:design.id,carrier:curved?'two paper tape fixings; free lower curl':'flat paper in existing holder',frontNormal:[0,0,1],widthM:design.widthM,heightM:design.heightM,bounds:{min:[-design.widthM/2,-design.heightM/2,-.0001],max:[design.widthM/2,design.heightM/2+.01,curved?.009:.0003]},print:'ordinary prop pigment-coverage and physical print finish',noEmission:true});
  scene.addChild(doc.createNode(name).setMesh(m));
 }
}
// A lockable exterior programme carrier, retained as its own catalogue mesh so
// the same printed sheet can be changed without rebuilding the fitting. Clear
// glazing is witnessed at the real edge/lips; no opaque tint hides the artwork.
{
 const m=doc.createMesh('institution_poster_case');
 m.addPrimitive(box([0,0,.008],[.69,.95,.016],casePaint));
 m.addPrimitive(box([0,0,.020],[.625,.885,.008],caseBack));
 for(const side of[-1,1]){
  m.addPrimitive(box([side*.329,0,.032],[.032,.95,.042],casePaint));
  m.addPrimitive(box([0,side*.459,.032],[.625,.032,.042],casePaint));
  m.addPrimitive(box([side*.312,0,.045],[.005,.884,.006],caseSteel));
  m.addPrimitive(box([0,side*.442,.045],[.62,.005,.006],caseSteel));
  m.addPrimitive(box([-.345,side*.30,.031],[.011,.045,.021],caseSteel));
 }
 m.addPrimitive(box([.332,-.05,.055],[.012,.025,.006],caseSteel));
 m.setExtras({institutionPosterHolder:true,frontNormal:[0,0,1],apertureM:[.62,.88],paperCenter:[0,0,.027],outerM:[.69,.95],bounds:{min:[-.351,-.475,0],max:[.351,.475,.058]},noPrintedGlassOverlay:true});
 scene.addChild(doc.createNode(m.getName()).setMesh(m));
}
const bytes=Buffer.from(await new NodeIO().writeBinary(doc));
const file=new URL('public/assets/institution-posters.glb',root);fs.writeFileSync(file,bytes);
const triangles=doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((a,p)=>a+p.getIndices().getCount()/3,0),0);
for(const[p,sha]of Object.entries(inputHashes))if(hash(fs.readFileSync(new URL(p,root)))!==sha)throw Error(`Poster input changed during build: ${p}; rebuild the task-owned pack`);
const estimatedMipmappedTextureBytes=Math.round(artwork.designs.reduce((n,d)=>n+4*d.pixels[0]*d.pixels[1]+8*d.materialPixels[0]*d.materialPixels[1],0)*4/3);
const stats={version:1,bytes:bytes.length,sha256:hash(bytes),triangles,estimatedMipmappedTextureBytes,meshes:doc.getRoot().listMeshes().map(m=>m.getName()),artwork:artwork.designs.map(d=>({id:d.id,title:d.title,kind:d.kind,pixels:d.pixels,materialPixels:d.materialPixels,widthM:d.widthM,heightM:d.heightM,coverage:d.coverage,coverageSha256:d.coverageSha256})),inputHashes,fontHashes:artwork.fonts,shader:'opaque ordinary prop pass, pigment coverage independent of opacity',sharedAtlasModified:false};
if(bytes.length>20e6||triangles>10000||estimatedMipmappedTextureBytes>80*1024*1024)throw Error('Institution publicity budget exceeded');
fs.writeFileSync(new URL('public/assets/institution-posters.stats.json',root),JSON.stringify(stats,null,2)+'\n');
fs.writeFileSync(new URL('public/assets/institution-posters.credits.json',root),JSON.stringify({license:'Original project compositions, fictional institutional copy and geometry',fonts:'URW Base35; pinned vendored fonts with existing font embedding exception; assets/fonts/LICENSE.urw-base35.txt',source:inputs.slice(0,3),realPerformers:false,calendarDatesInvented:false},null,2)+'\n');
console.log(JSON.stringify({bytes:bytes.length,triangles,designs:INSTITUTION_POSTER_DESIGNS.length,meshes:stats.meshes.length}));
