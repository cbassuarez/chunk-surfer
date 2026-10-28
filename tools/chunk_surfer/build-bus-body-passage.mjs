// Literal passage built from the shipped stage-three woman, not a substitute
// frame. A single rest palette carries real posed anatomy and four bounded
// morph channels; the game owns the finite opening clock and interaction.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseGlb,encodeGlb} from './rebuild-tree-crowns.mjs';
import {parseCharacterAsset,sampleCharacterPose} from '../../src/render/character-asset.js';
import {busWomanPassageDescriptor} from '../../src/render/bus-woman-passage-performance.js';
import {OUTSKIRTS_BUS_PASSAGE as C} from '../../src/data/outskirts-bus-passage.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const SHA=b=>crypto.createHash('sha256').update(b).digest('hex');
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]);
const mul=(a,n)=>a.map(v=>v*n),mix=(a,b,t)=>add(a,mul(sub(b,a),t));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/(Math.hypot(...a)||1));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const ID=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
export const BUS_BODY_PASSAGE_MESHES=Object.freeze(['bus_body_passage_left','bus_body_passage_right','bus_body_passage_bag','bus_body_passage_ticket']);
export const BUS_BODY_PASSAGE_TARGETS=Object.freeze(['unfold','paper','paperUnfold','strain']);
export const BUS_BODY_PASSAGE_APERTURE=Object.freeze({minX:-.55,maxX:.55,floor:.50,top:2.60,frontZ:3.0,crossZ:4.1,backZ:4.4});
const H=Object.freeze({clock:4,noticeAt:0,passAt:1,closeAt:.8,exitedAt:null,gazeYaw:-1.5});

function parse(file){const b=fs.readFileSync(path.join(ROOT,'public/assets',file));return{bytes:b,raw:parseGlb(b),asset:parseCharacterAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength))};}
function posed(entry,asset,mode){
  const pose=sampleCharacterPose(asset,entry,busWomanPassageDescriptor(mode,4,{stretch:7,passage:H}));
  return entry.primitives.map(p=>{
    const vertices=[];
    for(let v=0;v<p.vertexCount;v++){
      const rest=Array.from(p.positions.subarray(v*3,v*3+3));
      for(let t=0;t<p.targets.length;t++)for(let k=0;k<3;k++)rest[k]+=p.targets[t].positions[v*3+k]*pose.morphs[t];
      const position=[0,0,0],normal=[0,0,0];
      for(let slot=0;slot<4;slot++){
        const at=v*4+slot,w=p.weights[at];if(!w)continue;const j=p.joints[at]*16;
        for(let k=0;k<3;k++){
          position[k]+=w*(pose.bones[j+k]*rest[0]+pose.bones[j+4+k]*rest[1]+pose.bones[j+8+k]*rest[2]+pose.bones[j+12+k]);
          normal[k]+=w*(pose.bones[j+k]*p.normals[v*3]+pose.bones[j+4+k]*p.normals[v*3+1]+pose.bones[j+8+k]*p.normals[v*3+2]);
        }
      }
      vertices.push({p:position,n:unit(normal)});
    }
    return{vertices,indices:p.indices,material:p.material};
  });
}
function closed(p){const c=Math.cos(C.woman.yaw),s=Math.sin(C.woman.yaw);return[C.woman.x+p[0]*c+p[2]*s,C.woman.y+p[1],C.woman.z-p[0]*s+p[2]*c];}
function closedNormal(n){const c=Math.cos(C.woman.yaw),s=Math.sin(C.woman.yaw);return[n[0]*c+n[2]*s,n[1],-n[0]*s+n[2]*c];}
// Broad, irregular human halves peel against the saloon sides. Their sampled
// source surface remains recognisable, stretched through its actual cloth,
// skin and divided skull; no rectangular jamb replaces the person.
function opened(p,side){
  const across=clamp((.90*Math.abs(p[0])+.0465*smooth(Math.abs(p[0])/.53))/.465),height=clamp((p[1]-.008)/1.72);
  return[side*(.605+.465*across),.50+height*2.17,
    clamp(3.65+p[2]*.76+.105*Math.sin(height*Math.PI*1.70)+side*.028,3.025,4.26)];
}
function openNormal(p,n,side){
  const e=.00001,a=opened(p,side),t0=Math.abs(n[1])<.8?unit(cross(n,[0,1,0])):unit(cross(n,[1,0,0])),t1=cross(n,t0);
  const u=sub(opened(add(p,mul(t0,e)),side),a),v=sub(opened(add(p,mul(t1,e)),side),a),out=unit(cross(u,v));
  return Math.hypot(...out)>.5?out:closedNormal(n);
}
function strain(p,side){const w=smooth((p[1]-.25)/.9);return[side*.003*w*Math.sin(p[1]*9+p[2]*7),.006*w*Math.sin(p[1]*11+side),.008*w*Math.sin(p[1]*13+p[0]*9)];}
function interpolate(a,b,t){return{p:mix(a.p,b.p,t),n:unit(mix(a.n,b.n,t)),paper:mix(a.paper,b.paper,t),paperN:unit(mix(a.paperN,b.paperN,t))};}
function clip(poly,side){const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ia=side*a.p[0]>=-1e-8,ib=side*b.p[0]>=-1e-8;if(ia)out.push(a);if(ia!==ib)out.push(interpolate(a,b,a.p[0]/(a.p[0]-b.p[0])));}return out;}
function newMesh(name){return{name,groups:new Map(),extras:{source:'shipped stage-three woman',targetNames:BUS_BODY_PASSAGE_TARGETS,coordinateSpace:'bus-local metres; instance at bus ground matrix'}};}
function group(mesh,mat){if(!mesh.groups.has(mat))mesh.groups.set(mat,{vertices:[],indices:[],map:new Map()});return mesh.groups.get(mat);}
function vertex(g,v){const key=[...v.p,...v.n,...v.paper,...v.paperN].map(n=>Math.round(n*1e7)).join(',');let i=g.map.get(key);if(i==null){i=g.vertices.length;g.vertices.push(v);g.map.set(key,i);}return i;}
function triangle(mesh,mat,a,b,c){const g=group(mesh,mat),n=cross(sub(b.p,a.p),sub(c.p,a.p));if(Math.hypot(...n)<1e-11)return;g.indices.push(vertex(g,a),vertex(g,b),vertex(g,c));}
function makeV(p,n=[1,0,0],paper=p,paperN=n){return{p:[...p],n:[...n],paper:[...paper],paperN:[...paperN]};}
function quad(mesh,mat,a,b,c,d){triangle(mesh,mat,a,b,c);triangle(mesh,mat,a,c,d);}
function cutLoops(segments){
  const key=p=>[p[1],p[2]].map(x=>Math.round(x*1e5)).join(','),links=new Map(),edges=[];
  for(const[a,b]of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;const id=edges.length;edges.push({a,b,ka,kb,used:false});for(const k of[ka,kb]){if(!links.has(k))links.set(k,[]);links.get(k).push(id);}}
  const loops=[];for(let seed=0;seed<edges.length;seed++){if(edges[seed].used)continue;const first=edges[seed],points=[first.a,first.b];first.used=true;let end=first.kb;
    for(let guard=0;guard<edges.length;guard++){if(end===first.ka)break;const id=links.get(end)?.find(i=>!edges[i].used);if(id==null)break;const edge=edges[id];edge.used=true;const p=edge.ka===end?edge.b:edge.a;points.push(p);end=edge.ka===end?edge.kb:edge.ka;}
    if(end===first.ka&&points.length>=4){points.pop();loops.push(points);}
  }return loops;
}
function cap(mesh,loop,side,materials){
  // Concentric tissue returns are attached to the actual saw-line. Their
  // uneven thickness survives grazing views instead of a flat red polygon.
  const cy=loop.reduce((n,p)=>n+p[1],0)/loop.length,cz=loop.reduce((n,p)=>n+p[2],0)/loop.length;
  const at=(p,k)=>{const inward=[side*k*.025,cy+(p[1]-cy)*(1-k*.07),cz+(p[2]-cz)*(1-k*.07)];inward[0]+=side*.002*Math.sin(p[1]*71+p[2]*43);return inward;};
  const rings=[loop.map(p=>[0,p[1],p[2]]),loop.map(p=>at(p,.35)),loop.map(p=>at(p,1))];
  const normal=[-side,0,0];
  for(let r=0;r<2;r++)for(let i=0;i<loop.length;i++){
    const j=(i+1)%loop.length,mat=r===0?materials.fat:materials.muscle;
    const p=[rings[r][i],rings[r][j],rings[r+1][j],rings[r+1][i]].map(v=>makeV(v,normal));quad(mesh,mat,...(side>0?p.reverse():p));
  }
  const centre=[side*.027,cy,cz],mat=cy>1.43?materials.brain:materials.muscle;
  for(let i=0;i<loop.length;i++){
    const j=(i+1)%loop.length,a=makeV(centre,normal),b=makeV(rings[2][i],normal),c=makeV(rings[2][j],normal);
    triangle(mesh,mat,...(side>0?[a,c,b]:[a,b,c]));
  }
}
function reliefTube(mesh,points,radius,mat,side){
  const n=6,rings=[];for(let i=0;i<points.length;i++){
    const tangent=unit(sub(points[Math.min(points.length-1,i+1)],points[Math.max(0,i-1)])),u=unit(cross(tangent,[1,0,0])),v=cross(tangent,u);
    rings.push(Array.from({length:n},(_,j)=>{const a=j/n*Math.PI*2,norm=add(mul(u,Math.cos(a)),mul(v,Math.sin(a)));return makeV(add(points[i],mul(norm,radius)),norm);}));
  }for(let i=0;i<rings.length-1;i++)for(let j=0;j<n;j++)quad(mesh,mat,rings[i][j],rings[i][(j+1)%n],rings[i+1][(j+1)%n],rings[i+1][j]);
}
function bounds(meshes){const out={};for(const m of meshes){const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity],openLow=[Infinity,Infinity,Infinity],openHigh=[-Infinity,-Infinity,-Infinity];let v=0,t=0;for(const g of m.groups.values()){v+=g.vertices.length;t+=g.indices.length/3;for(const a of g.vertices)for(const p of[a.p,a.paper]){const c=closed(p),o=opened(p,m.side);for(let k=0;k<3;k++){low[k]=Math.min(low[k],c[k]);high[k]=Math.max(high[k],c[k]);openLow[k]=Math.min(openLow[k],o[k]);openHigh[k]=Math.max(openHigh[k],o[k]);}}}out[m.name]={vertices:v,triangles:t,primitives:m.groups.size,closedBounds:{min:low,max:high},openBounds:{min:openLow,max:openHigh},side:m.side,extras:m.extras};}return out;}

export function buildBusBodyPassage(){
  const altered=parse('outskirts-bus-woman-wrong-origin.glb'),canonical=parse('bus-woman-character.glb');
  const body=altered.asset.entries.find(e=>e.name==='outskirts_bus_woman_wrong_origin_3'),bag=canonical.asset.entries.find(e=>e.name==='bus_woman_bag'),ticket=canonical.asset.entries.find(e=>e.name==='bus_woman_ticket');
  const ordinary=posed(body,altered.asset,'wait'),paper=posed(body,altered.asset,'ticket-wait'),materials=structuredClone(altered.raw.json.materials);
  const fat=materials.push({name:'body passage attached subcutaneous margin',pbrMetallicRoughness:{baseColorFactor:[.39,.23,.12,1],roughnessFactor:.58,metallicFactor:0},extras:{tissueSurface:{preservePigment:true,localSpecular:true}}})-1;
  const brain=materials.push({name:'body passage divided cortical folds',pbrMetallicRoughness:{baseColorFactor:[.27,.105,.085,1],roughnessFactor:.42,metallicFactor:0},extras:{tissueSurface:{preservePigment:true,localSpecular:true}}})-1;
  const flesh={fat,brain,muscle:13,bone:15},left=newMesh(BUS_BODY_PASSAGE_MESHES[0]),right=newMesh(BUS_BODY_PASSAGE_MESHES[1]);left.side=-1;right.side=1;
  const cuts=[];let sourceTriangles=0;
  for(let ip=0;ip<ordinary.length;ip++){
    const p=ordinary[ip],q=paper[ip];for(let i=0;i<p.indices.length;i+=3){
      const poly=Array.from(p.indices.subarray(i,i+3),v=>({...p.vertices[v],paper:q.vertices[v].p,paperN:q.vertices[v].n}));sourceTriangles++;
      const crossings=[];for(let j=0;j<3;j++){const a=poly[j],b=poly[(j+1)%3];if(a.p[0]*b.p[0]<0)crossings.push(interpolate(a,b,a.p[0]/(a.p[0]-b.p[0])).p);}
      if(crossings.length===2)cuts.push(crossings);
      for(const m of[left,right]){const clipped=clip(poly,m.side);for(let k=1;k<clipped.length-1;k++)triangle(m,p.material,clipped[0],clipped[k],clipped[k+1]);}
    }
  }
  const loops=cutLoops(cuts);for(const m of[left,right])for(const loop of loops)cap(m,loop,m.side,flesh);
  // Short connected ridges grow from the actual medial tissue: rib ends and
  // cortical convolutions, never floating ropes across the useful aperture.
  for(const m of[left,right]){
    for(let k=0;k<8;k++){
      const y=.84+k*.055,pts=Array.from({length:8},(_,j)=>[m.side*(.026+.003*Math.sin(j*.7+k)),y+.011*Math.sin(j*.38+k),-.085+j*.023]);
      reliefTube(m,pts,.0038,flesh.bone,m.side);
    }
    for(let k=0;k<7;k++){
      const pts=Array.from({length:14},(_,j)=>[m.side*(.028+.003*Math.sin(j*.8+k)),1.49+k*.020+.006*Math.sin(j*.9+k),-.10+j*.014]);
      reliefTube(m,pts,.0030,flesh.brain,m.side);
    }
  }
  const meshes=[left,right];
  for(const[entry,name]of[[bag,BUS_BODY_PASSAGE_MESHES[2]],[ticket,BUS_BODY_PASSAGE_MESHES[3]]]){
    const a=posed(entry,canonical.asset,'ticket-wait'),b=posed(entry,canonical.asset,'wait'),m=newMesh(name);m.side=name.endsWith('bag')?-1:1;m.extras.attachment=name.endsWith('bag')?'bag':'paper';
    for(let ip=0;ip<a.length;ip++){const p=a[ip],q=b[ip];for(let i=0;i<p.indices.length;i+=3){const vertices=Array.from(p.indices.subarray(i,i+3),v=>({p:q.vertices[v].p,n:q.vertices[v].n,paper:p.vertices[v].p,paperN:p.vertices[v].n}));triangle(m,p.material,...vertices);}}meshes.push(m);
  }
  const statsMeshes=bounds(meshes),json={asset:{version:'2.0',generator:'Chunk Surfer original body-passage tissue build'},scene:0,scenes:[{nodes:[0,2,3,4,5]}],nodes:[{name:'bus_body_passage_root',children:[1]},{name:'bus_body_passage_rest'}],skins:[{joints:[1],inverseBindMatrices:0}],meshes:[],materials,bufferViews:[],accessors:[],buffers:[]},chunks=[];let offset=0;
  const access=(values,width,type=5126,kind=null)=>{
    const Ctor=type===5126?Float32Array:type===5123?Uint16Array:Uint32Array,a=new Ctor(values),bytes=Buffer.from(a.buffer),pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}
    const view=json.bufferViews.length;json.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length});chunks.push(bytes);offset+=bytes.length;
    const item={bufferView:view,componentType:type,count:values.length/width,type:kind||({1:'SCALAR',2:'VEC2',3:'VEC3',4:'VEC4',16:'MAT4'})[width]};
    if(type===5126&&width===3){item.min=[0,1,2].map(k=>Math.min(...values.filter((_,i)=>i%3===k)));item.max=[0,1,2].map(k=>Math.max(...values.filter((_,i)=>i%3===k)));}
    const index=json.accessors.length;json.accessors.push(item);return index;
  };
  access(ID,16);
  for(const m of meshes){const primitives=[];for(const[mat,g]of m.groups){
    const p=[],n=[],j=[],w=[],dp=[],dn=[],pp=[],pn=[],cp=[],cn=[],sp=[],sn=[];
    for(const a of g.vertices){
      const b=closed(a.p),bn=closedNormal(a.n),o=opened(a.p,m.side),on=openNormal(a.p,a.n,m.side),pb=closed(a.paper),pbn=closedNormal(a.paperN),po=opened(a.paper,m.side),pon=openNormal(a.paper,a.paperN,m.side);
      p.push(...b);n.push(...bn);j.push(0,0,0,0);w.push(1,0,0,0);dp.push(...sub(o,b));dn.push(...sub(on,bn));pp.push(...sub(pb,b));pn.push(...sub(pbn,bn));cp.push(...sub(sub(po,o),sub(pb,b)));cn.push(...sub(sub(pon,on),sub(pbn,bn)));sp.push(...strain(a.p,m.side));sn.push(0,0,0);
    }
    primitives.push({attributes:{POSITION:access(p,3),NORMAL:access(n,3),JOINTS_0:access(j,4,5123),WEIGHTS_0:access(w,4)},indices:access(g.indices,1,g.vertices.length>65535?5125:5123),material:mat,mode:4,
      targets:[{POSITION:access(dp,3),NORMAL:access(dn,3)},{POSITION:access(pp,3),NORMAL:access(pn,3)},{POSITION:access(cp,3),NORMAL:access(cn,3)},{POSITION:access(sp,3)}]});
  }
    const mesh=json.meshes.length;json.meshes.push({name:m.name,primitives,weights:[0,0,0,0],extras:m.extras});json.nodes.push({name:m.name,mesh,skin:0,weights:[0,0,0,0]});
  }
  json.buffers=[{byteLength:offset}];const bytes=encodeGlb(json,Buffer.concat(chunks));
  const stats={version:1,sha256:SHA(bytes),bytes:bytes.length,totalVertices:Object.values(statsMeshes).reduce((s,m)=>s+m.vertices,0),totalTriangles:Object.values(statsMeshes).reduce((s,m)=>s+m.triangles,0),meshes:statsMeshes,materials:materials.length,morphTargets:BUS_BODY_PASSAGE_TARGETS,aperture:BUS_BODY_PASSAGE_APERTURE,sourceTriangles,medialCutSegments:cuts.length,closedCutLoops:loops.length,sourceAssets:{body:SHA(altered.bytes),ordinary:SHA(canonical.bytes)},handoff:{mode:'wait or ticket-wait',seconds:4,passage:H,instance:'bus matrix at ground'},contractSha256:SHA(fs.readFileSync(path.join(ROOT,'src/data/outskirts-bus-passage.js')))};
  return{bytes,stats,credits:{version:1,title:'The woman opens',author:'Chunk Surfer original procedural anatomical parting',source:'Existing shipped Wrong origin stage-three woman and canonical bag/paper, sampled through actual character pose pipeline',sourceAssetSha256:stats.sourceAssets,license:'project source and preserved source-material provenance',notes:'Physical split/caps/morphs; no raster cutout, replacement toy frame, or image-generated anatomy. Runtime controls opening and crossing; asset alone establishes neither horror nor playable transition.'}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=buildBusBodyPassage(),file=path.join(ROOT,'public/assets/bus-body-passage.glb');fs.writeFileSync(file,result.bytes);fs.writeFileSync(file.replace('.glb','.stats.json'),JSON.stringify(result.stats,null,2)+'\n');fs.writeFileSync(file.replace('.glb','.credits.json'),JSON.stringify(result.credits,null,2)+'\n');console.log(JSON.stringify(result.stats,null,2));
}
