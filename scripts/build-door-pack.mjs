import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourceDir=path.join(root,'tools/chunk_surfer/assets/doors/polyhaven');
const output=path.join(root,'public/assets/conservatory-doors.glb');
const creditsPath=path.join(root,'public/assets/conservatory-doors.credits.json');
const statsPath=path.join(root,'public/assets/conservatory-doors.stats.json');
const chunks=[],bufferViews=[],accessors=[],images=[],textures=[],materials=[],meshes=[],nodes=[];
let byteLength=0,triangleCount=0;

function pushBytes(bytes,{target=null}={}){
  const pad=(4-(byteLength%4))%4;if(pad){chunks.push(Buffer.alloc(pad));byteLength+=pad;}
  const index=bufferViews.length;bufferViews.push({buffer:0,byteOffset:byteLength,byteLength:bytes.byteLength,...(target?{target}:{})});chunks.push(Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength));byteLength+=bytes.byteLength;return index;
}
function accessor(array,type,componentType,target){
  const view=pushBytes(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),{target});
  const size={SCALAR:1,VEC2:2,VEC3:3}[type],count=array.length/size,entry={bufferView:view,componentType,count,type};
  if(type==='VEC3'){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<array.length;i+=3)for(let k=0;k<3;k++){min[k]=Math.min(min[k],array[i+k]);max[k]=Math.max(max[k],array[i+k]);}
    entry.min=min;entry.max=max;
  }
  accessors.push(entry);return accessors.length-1;
}
function imageTexture(file){
  const bytes=fs.readFileSync(path.join(sourceDir,file)),view=pushBytes(bytes);images.push({bufferView:view,mimeType:'image/jpeg',name:file});textures.push({source:images.length-1,sampler:0});return textures.length-1;
}
const atlas={base:imageTexture('door_atlas_diff.jpg'),normal:imageTexture('door_atlas_nor_gl.jpg'),orm:imageTexture('door_atlas_arm.jpg')};
function material(name,{baseColorFactor=[1,1,1,1],base=null,normal=null,orm=null,metallicFactor=0,roughnessFactor=.7}={}){
  const m={name,pbrMetallicRoughness:{baseColorFactor,metallicFactor,roughnessFactor,...(base==null?{}:{baseColorTexture:{index:base}}),...(orm==null?{}:{metallicRoughnessTexture:{index:orm}})},...(normal==null?{}:{normalTexture:{index:normal,scale:1}})};materials.push(m);return materials.length-1;
}
const MAT={
  oak:material('warm oak veneer',{...atlas,roughnessFactor:.65}),dark:material('dark mahogany oak',{...atlas,roughnessFactor:.62}),green:material('grey green fire steel',{...atlas,metallicFactor:.55,roughnessFactor:.78}),
  glass:material('opaque rough wired glass',{baseColorFactor:[.28,.38,.34,1],roughnessFactor:.86}),rubber:material('rubber seals',{baseColorFactor:[.018,.022,.019,1],roughnessFactor:.94}),
  brass:material('oxidised brass',{baseColorFactor:[.45,.31,.10,1],metallicFactor:.88,roughnessFactor:.44}),iron:material('blackened iron',{baseColorFactor:[.055,.047,.041,1],metallicFactor:.82,roughnessFactor:.72}),
  kick:material('worn kick plate',{baseColorFactor:[.34,.36,.34,1],metallicFactor:.86,roughnessFactor:.57}),stone:material('masonry infill',{baseColorFactor:[.30,.30,.28,1],roughnessFactor:.91}),
  debug:material('god mode door volumes',{baseColorFactor:[.02,.72,.95,1],roughnessFactor:.35}),
};

function box(cx,cy,cz,sx,sy,sz,mat){
  const p=[],n=[],uv=[],idx=[];const faces=[
    [[1,0,0],[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]], [[-1,0,0],[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]],
    [[0,1,0],[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]], [[0,-1,0],[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]],
    [[0,0,1],[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]], [[0,0,-1],[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]],
  ];
  for(const [normal,corners] of faces){const base=p.length/3;for(const q of corners){p.push(cx+q[0]*sx/2,cy+q[1]*sy/2,cz+q[2]*sz/2);n.push(...normal);}uv.push(0,0,0,1,1,1,1,0);idx.push(base,base+1,base+2,base,base+2,base+3);}
  return{mat,p,n,uv,idx};
}
function mesh(name,parts){
  const atlasRegion=new Map([[MAT.oak,[0,1/3]],[MAT.dark,[1/3,2/3]],[MAT.green,[2/3,1]]]);
  const byMat=new Map();for(const part of parts){if(!byMat.has(part.mat))byMat.set(part.mat,[]);byMat.get(part.mat).push(part);}
  const primitives=[];let meshTriangles=0;
  for(const[mat,group]of byMat){const p=[],n=[],uv=[],idx=[],region=atlasRegion.get(mat);for(const part of group){const base=p.length/3;p.push(...part.p);n.push(...part.n);if(region){for(let i=0;i<part.uv.length;i+=2)uv.push(region[0]+part.uv[i]*(region[1]-region[0]),part.uv[i+1]);}else uv.push(...part.uv);idx.push(...part.idx.map((i)=>i+base));}
    const indices=new Uint16Array(idx);meshTriangles+=indices.length/3;triangleCount+=indices.length/3;
    primitives.push({attributes:{POSITION:accessor(new Float32Array(p),'VEC3',5126,34962),NORMAL:accessor(new Float32Array(n),'VEC3',5126,34962),TEXCOORD_0:accessor(new Float32Array(uv),'VEC2',5126,34962)},indices:accessor(indices,'SCALAR',5123,34963),material:mat,mode:4});
  }
  meshes.push({name,primitives,extras:{triangles:meshTriangles}});nodes.push({name,mesh:meshes.length-1});return meshTriangles;
}
function frame(name,width,height,mat=MAT.dark,post=.08,depth=.12){mesh(name,[box(-width/2-post/2,height/2,0,post,height,depth,mat),box(width/2+post/2,height/2,0,post,height,depth,mat),box(0,height+post/2,0,width+post*2,post,depth,mat)]);}
frame('door_frame_pair',2.06,2.40,MAT.dark,.10,.15);frame('door_frame_single_steel',1.02,2.16,MAT.green,.07,.11);frame('door_frame_single_oak',1.0,2.20,MAT.oak,.075,.12);frame('door_frame_tower',.94,2.0,MAT.oak,.08,.13);
mesh('door_head_infill',[box(0,2.78,0,1.16,1.16,.16,MAT.stone)]);
mesh('door_head_overpanel',[box(0,2.90,0,2.25,.90,.14,MAT.dark)]);
mesh('door_head_tympanum',[box(0,2.92,0,2.20,.96,.18,MAT.dark),box(0,3.22,-.10,1.1,.10,.10,MAT.iron)]);
mesh('door_head_tower',[box(0,2.68,0,1.12,1.45,.28,MAT.stone)]);
// The goods opening is three metres wide, so it needs a head and a frame of its
// own: door_head_infill is 1.16 across and would have sat over the middle of it
// like a lintel over nothing.
mesh('door_head_goods',[box(0,3.02,0,3.30,.74,.20,MAT.stone),box(0,2.70,-.10,3.20,.14,.24,MAT.iron)]);
mesh('door_head_transom',[box(0,2.90,0,2.18,.88,.09,MAT.glass),box(0,2.90,-.055,.06,.88,.08,MAT.dark),box(0,2.48,-.055,2.18,.07,.08,MAT.dark),box(0,3.32,-.055,2.18,.07,.08,MAT.dark)]);
mesh('door_sealed_scar',[box(-.54,1.7,0,.08,3.4,.06,MAT.dark),box(.54,1.7,0,.08,3.4,.06,MAT.dark),box(0,3.36,0,1.16,.08,.06,MAT.dark),box(0,1.7,.04,1.08,3.32,.12,MAT.stone)]);
mesh('door_debug_aperture',[box(0,1.7,.14,1.06,.025,.025,MAT.debug),box(0,.02,.14,1.06,.025,.025,MAT.debug),box(-.52,.86,.14,.025,1.68,.025,MAT.debug),box(.52,.86,.14,.025,1.68,.025,MAT.debug)]);
mesh('door_debug_hinge',[box(-.5,1.05,-.16,.055,2.10,.055,MAT.debug)]);
mesh('door_debug_swing',[box(0,.025,-.5,1,.025,1,MAT.debug)]);

function leaf(name,w,h,d,mat,parts=[]){mesh(name,[box(w/2,h/2,0,w,h,d,mat),...parts]);}
leaf('door_leaf_service',1,2.10,.045,MAT.green,[box(.50,.19,-.035,.92,.26,.025,MAT.kick),box(.79,1.03,-.055,.30,.045,.035,MAT.iron)]);
leaf('door_leaf_practice',.95,2.15,.065,MAT.oak,[box(.475,.22,-.05,.87,.28,.025,MAT.kick),box(.475,1.58,-.05,.24,.36,.025,MAT.glass),box(.84,1.08,-.06,.13,.04,.04,MAT.brass),box(.025,1.075,0,.035,2.05,.08,MAT.rubber)]);
leaf('door_leaf_staff',.95,2.15,.05,MAT.oak,[box(.475,1.55,-.042,.76,.86,.028,MAT.glass),box(.84,1.05,-.055,.13,.04,.04,MAT.brass)]);
leaf('door_leaf_pool',1.05,2.15,.05,MAT.green,[box(.525,1.55,-.042,.30,.86,.028,MAT.glass),box(.525,.20,-.043,.97,.26,.026,MAT.kick)]);
leaf('door_leaf_public',.88,2.35,.055,MAT.dark,[box(.44,1.49,-.047,.68,1.30,.025,MAT.glass),box(.44,.20,-.047,.80,.27,.025,MAT.brass),box(.76,1.08,-.06,.14,.04,.04,MAT.brass)]);
leaf('door_leaf_hall',1.02,2.35,.08,MAT.dark,[box(.51,.20,-.058,.94,.28,.028,MAT.kick),box(.90,1.08,-.07,.14,.04,.05,MAT.brass),box(.025,1.175,0,.035,2.25,.10,MAT.rubber)]);
leaf('door_leaf_chapel',.98,2.40,.075,MAT.dark,[box(.49,.56,-.057,.76,.76,.025,MAT.dark),box(.49,1.55,-.057,.76,.80,.025,MAT.dark),box(.86,1.12,-.07,.16,.045,.045,MAT.iron)]);
leaf('door_leaf_tower',.90,1.95,.055,MAT.oak,[box(.45,.48,-.05,.82,.045,.035,MAT.iron),box(.45,1.00,-.05,.82,.045,.035,MAT.iron),box(.45,1.52,-.05,.82,.045,.035,MAT.iron),box(.78,.96,-.06,.14,.06,.045,MAT.iron)]);
// THE GOODS DOORS. A metre and a half of steel per leaf, ribbed, with a kick
// plate the height of a pallet truck and a drop bolt at the foot of each. They
// are barred from the inside and stay that way: there is no lorry, and the man
// on foot uses the personnel door beside them.
leaf('door_leaf_bay_goods',1.48,3.05,.07,MAT.green,[
  box(.74,.30,-.055,1.40,.42,.030,MAT.kick),
  box(.74,1.02,-.052,1.36,.055,.028,MAT.iron),
  box(.74,1.72,-.052,1.36,.055,.028,MAT.iron),
  box(.74,2.42,-.052,1.36,.055,.028,MAT.iron),
  box(1.34,1.44,-.075,.16,.30,.055,MAT.iron),          // the handle
  box(.10,.16,-.06,.09,.32,.09,MAT.iron),              // drop bolt, shot
]);
frame('door_frame_goods',3.00,3.05,MAT.iron,.13,.22);

const sceneNodes=nodes.map((_,index)=>index),json={asset:{version:'2.0',generator:'Chunk Surfer modular door builder'},scene:0,scenes:[{nodes:sceneNodes}],nodes,meshes,materials,textures,images,samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],accessors,bufferViews,buffers:[{byteLength}]};
const jsonBytes=Buffer.from(JSON.stringify(json)),jsonPad=(4-jsonBytes.length%4)%4,jsonChunk=Buffer.concat([jsonBytes,Buffer.alloc(jsonPad,0x20)]),bin=Buffer.concat(chunks),binPad=(4-bin.length%4)%4,binChunk=Buffer.concat([bin,Buffer.alloc(binPad)]);
const total=12+8+jsonChunk.length+8+binChunk.length,glb=Buffer.alloc(total);glb.writeUInt32LE(0x46546c67,0);glb.writeUInt32LE(2,4);glb.writeUInt32LE(total,8);let at=12;glb.writeUInt32LE(jsonChunk.length,at);glb.writeUInt32LE(0x4e4f534a,at+4);jsonChunk.copy(glb,at+8);at+=8+jsonChunk.length;glb.writeUInt32LE(binChunk.length,at);glb.writeUInt32LE(0x004e4942,at+4);binChunk.copy(glb,at+8);
fs.writeFileSync(output,glb);
const sha256=crypto.createHash('sha256').update(glb).digest('hex');
fs.writeFileSync(statsPath,JSON.stringify({file:path.basename(output),bytes:glb.length,sha256,meshes:meshes.length,triangles:triangleCount,maxLeafTriangles:Math.max(...meshes.filter((m)=>m.name.startsWith('door_leaf_')).map((m)=>m.extras.triangles)),textureAtlas:'1536x512 diffuse + normal + ARM'},null,2)+'\n');
fs.writeFileSync(creditsPath,JSON.stringify({schema:1,file:path.basename(output),sha256,geometry:{license:'Project-authored',description:'Modular frames, pivoted leaves, heads, hardware and sealed-frame scar generated in-house.'},textures:{license:'CC0',source:'Poly Haven',assets:[{id:'oak_veneer_01',url:'https://polyhaven.com/a/oak_veneer_01'},{id:'dark_wood',url:'https://polyhaven.com/a/dark_wood'},{id:'green_metal_rust',url:'https://polyhaven.com/a/green_metal_rust'}],licenseUrl:'https://polyhaven.com/license',modifications:'Diffuse, OpenGL normal and ARM maps downsampled from 1K to 512px, packed into one 1536x512 door atlas set, and embedded in the GLB. Wired glass, rubber, brass, iron, kick plate and masonry are project-authored flat PBR materials.'}},null,2)+'\n');
console.log(`wrote ${path.relative(root,output)} ${(glb.length/1024).toFixed(1)} KiB, ${meshes.length} meshes, ${triangleCount} triangles`);
