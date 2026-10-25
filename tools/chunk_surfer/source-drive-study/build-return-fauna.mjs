// Small original meshes for the remembered sea. No stock photos or alpha cards.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Scene,Mesh,MeshStandardMaterial,SphereGeometry,BufferGeometry,Float32BufferAttribute,IcosahedronGeometry} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}};
const scene=new Scene(),silver=new MeshStandardMaterial({color:0x4b655e,roughness:.38,metalness:.12}),fin=new MeshStandardMaterial({color:0x263e38,roughness:.56,side:2});
function mesh(name,geometry,material){const m=new Mesh(geometry,material);m.name=name;scene.add(m);return m;}
const body=new SphereGeometry(1,18,12);body.scale(.075,.125,.39);body.translate(0,0,-.025);mesh('source_return_fish_body',body,silver);
const g=new BufferGeometry(),p=[0,0,.29,0,.18,.53,0,.035,.46,0,0,.29,0,.035,.46,0,-.18,.53,0,.08,.02,0,.23,.12,0,.09,.27,0,-.07,.02,0,-.17,.18,0,-.06,.26,-.02,-.015,-.12,-.17,-.06,-.025,-.03,-.035,.10,.02,-.015,-.12,.17,-.06,-.025,.03,-.035,.10];g.setAttribute('position',new Float32BufferAttribute(p,3));g.computeVertexNormals();mesh('source_return_fish_fins',g,fin);
const star=new MeshStandardMaterial({color:0xe2e9e7,emissive:0xdce8ed,emissiveIntensity:1,roughness:1});mesh('source_return_star',new IcosahedronGeometry(1,0),star);
for(const child of scene.children){if(!child.geometry.index)child.geometry.setIndex(Array.from({length:child.geometry.attributes.position.count},(_,i)=>i));child.material.userData={materialFactors:'gltf',studyLocalFinish:true};}
// The game catalog keys by glTF mesh.name, whereas Three normally names only
// the nodes. Keep the exported mesh keys identical to submitted prop names.
const exporter=new GLTFExporter().register(()=>({name:'ChunkSurferMeshNames',writeMesh(mesh,definition){definition.name=mesh.name;}}));
const bytes=Buffer.from(await exporter.parseAsync(scene,{binary:true,onlyVisible:false})),dir='public/assets/source-return';fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/fauna.glb',bytes);fs.writeFileSync(dir+'/credits.json',JSON.stringify({source:'Original project-authored fish body, forked tail/fins and distant star geometry.',build:'node tools/chunk_surfer/source-drive-study/build-return-fauna.mjs',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2)+'\n');console.log(JSON.stringify({bytes:bytes.length}));
