// Extract the retained guard's exact hierarchical bind contract. No Blender,
// geometry export, texture write or other actor is changed by this operation.
import fs from 'node:fs';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {Matrix4,Quaternion,Vector3} from 'three';
import {parseCharacterAsset} from '../../../src/render/character-asset.js';
const root=fileURLToPath(new URL('../../../',import.meta.url)),source='public/assets/outskirts-characters.glb',bytes=fs.readFileSync(root+source),asset=parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),entry=asset.entries.find(e=>e.name==='outskirts_fold_guard');
const mh=root+'tools/chunk_surfer/character-sources/makehuman/',verts=[],groups=new Map();let group='';
for(const row of fs.readFileSync(mh+'base.obj','utf8').split('\n')){const a=row.trim().split(/\s+/);if(a[0]==='v')verts.push(a.slice(1,4).map(Number));else if(a[0]==='g')group=a[1];else if(a[0]==='f'){if(!groups.has(group))groups.set(group,new Set());for(const s of a.slice(1))groups.get(group).add(+s.split('/')[0]-1);}}
for(const[age,weight]of[['old',.52],['young',.48]])for(const prefix of['caucasian-male-','universal-male-']){
  const suffix=prefix.startsWith('universal')?'-averagemuscle-averageweight':'',text=zlib.gunzipSync(fs.readFileSync(mh+prefix+age+suffix+'.target.gz')).toString();
  for(const row of text.split('\n')){const a=row.trim().split(/\s+/);if(a.length===4&&/^\d+$/.test(a[0]))for(let k=0;k<3;k++)verts[+a[0]][k]+=+a[k+1]*weight;}
}
const ids=[...groups.get('body')],low=Math.min(...ids.map(i=>verts[i][1])),high=Math.max(...ids.map(i=>verts[i][1])),scale=1.82/(high-low);
const joint=name=>{const g=[...groups.get(name)],v=[0,0,0];for(const i of g)for(let k=0;k<3;k++)v[k]+=verts[i][k]/g.length;return[v[0]*scale,(v[1]-low)*scale,-v[2]*scale];};
const tails={pelvis:'joint-spine-4',spine_lower:'joint-spine-3',spine_mid:'joint-spine-2',spine_upper:'joint-spine-1',chest:'joint-neck',neck:'joint-head',head:'joint-head-2'};
for(const[side,m]of[['L','r'],['R','l']]){
  for(const[name,target]of[['clavicle','shoulder'],['upperarm','elbow'],['forearm','hand'],['hand','hand-3'],['thigh','knee'],['shin','ankle'],['foot','foot-1'],['toe','foot-2']])tails[name+'_'+side]='joint-'+m+'-'+target;
  for(const[i,name]of['thumb','index','middle','ring','little'].entries())tails[name+'_'+side]=`joint-${m}-finger-${i+1}-4`;
}
const skinSet=new Set(entry.skin.joints),round=a=>Array.from(a,v=>Math.abs(v)<1e-12?0:+v.toFixed(10)),bones=entry.skin.joints.map((index,k)=>{
  const node=asset.nodes[index],matrix=new Matrix4().fromArray(entry.skin.inverseBind[k]).invert(),head=new Vector3(),rotation=new Quaternion(),size=new Vector3();matrix.decompose(head,rotation,size);
  const tail=tails[node.name]?joint(tails[node.name]):head.clone().add(new Vector3(0,.06,0).applyQuaternion(rotation)).toArray();
  return{name:node.name,parent:skinSet.has(node.parent)?asset.nodes[node.parent].name:null,head:round(head.toArray()),tail:round(tail),worldRotation:round(rotation.toArray()),localTranslation:round(node.translation),localRotation:round(node.rotation),localScale:round(node.scale)};
});
const sha=crypto.createHash('sha256').update(bytes).digest('hex'),out=`// Generated from the approved MakeHuman guard GLB; regenerate with\n// node tools/chunk_surfer/characters/build-booth-guard-rig.mjs\n// Hierarchical local frames are retained. These are not flat absolute joints.\nexport const BOOTH_GUARD_ASSET=Object.freeze(${JSON.stringify({path:source,sha256:sha,mesh:entry.name,joints:bones.length})});\nexport const BOOTH_GUARD_RIG=Object.freeze(${JSON.stringify(bones,null,2)}.map(b=>Object.freeze(b)));\n\n// Booth-local metres. The ordinary interaction is at +Z, facing the street.\nexport const BOOTH_GUARD_STAGE=Object.freeze({\n  origin:Object.freeze([-.38,.20,.28]), yaw:Math.PI,\n  counterTop:1.55, counterRear:.62, windowPlane:1.30,\n  opening:Object.freeze({x0:-.865,x1:-.07,y0:1.55,y1:1.71}),\n  ledger:Object.freeze([-.50,1.607,.84]),\n  brace:Object.freeze([-.25,1.607,.82]),\n  key:Object.freeze([-.72,1.626,.98]),\n  cup:Object.freeze([-.54,1.608,.98]),\n});\n`;
fs.writeFileSync(root+'src/data/booth-guard-rig.js',out);console.log(JSON.stringify({source,sha256:sha,bones:bones.length,bytes:Buffer.byteLength(out)},null,2));
