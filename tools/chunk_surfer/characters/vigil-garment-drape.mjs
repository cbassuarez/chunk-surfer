// Build-time outerwear: retain the actual fitted proxy above its waist seam,
// then hang sewn fabric panels from that contour and the anatomical hip line.
// Positions and bone heads/tails are already in the wearer's scaled rest space.
const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=a=>Math.hypot(...a),unit=a=>mul(a,1/(length(a)||1)),mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t),clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n)),smooth=n=>{n=clamp(n);return n*n*(3-2*n);};
function weights(pairs){const map=new Map();for(const[j,w]of pairs)if(w>1e-9)map.set(j,(map.get(j)||0)+w);const out=[...map].sort((a,b)=>b[1]-a[1]).slice(0,4),total=out.reduce((n,p)=>n+p[1],0)||1;for(const p of out)p[1]/=total;while(out.length<4)out.push([0,0]);return out;}
function hull(points){const p=[...new Map(points.map(p=>[p.map(v=>Math.round(v*1e6)).join(','),p])).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);if(p.length<3)return p;const side=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];for(const a of p){while(lower.length>1&&side(lower.at(-2),lower.at(-1),a)<=0)lower.pop();lower.push(a);}for(const a of p.toReversed()){while(upper.length>1&&side(upper.at(-2),upper.at(-1),a)<=0)upper.pop();upper.push(a);}return lower.slice(0,-1).concat(upper.slice(0,-1));}
function bodySection(body,y){if(!body)return[];const result=[],positions=body.positions,triangles=body.indices||body.faces?.flatMap(f=>f.slice(1,-1).flatMap((_,i)=>[f[0],f[i+1],f[i+2]]))||[];const armWeight=i=>{let n=0;for(let s=0;s<4;s++)if(/arm|hand|finger|thumb|index|middle|ring|little/.test(body.bones?.[body.skinIndex[i*4+s]]?.name||''))n+=body.skinWeight[i*4+s];return n;};for(let i=0;i<triangles.length;i+=3){const ids=triangles.slice(i,i+3);if(ids.reduce((n,id)=>n+armWeight(id),0)/3>.2)continue;const p=ids.map(id=>positions.slice(id*3,id*3+3));for(let e=0;e<3;e++){const a=p[e],b=p[(e+1)%3];if((a[1]<y)===(b[1]<y)||Math.abs(a[1]-b[1])<1e-8)continue;const t=(y-a[1])/(b[1]-a[1]);result.push([a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t]);}}return hull(result);}
function radialHit(polygon,center,direction){let best=0;for(let i=0;i<polygon.length;i++){const a=sub(polygon[i],center),b=sub(polygon[(i+1)%polygon.length],center),edge=sub(b,a),den=direction[0]*edge[1]-direction[1]*edge[0];if(Math.abs(den)<1e-9)continue;const distance=(a[0]*edge[1]-a[1]*edge[0])/den,t=(a[0]*direction[1]-a[1]*direction[0])/den;if(distance>=0&&t>=-1e-7&&t<=1+1e-7)best=Math.max(best,distance);}return best;}
function boundaryEdges(indices){const edges=new Map();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const a=indices[i+j],b=indices[i+(j+1)%3],key=a<b?a+':'+b:b+':'+a;let e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});}return[...edges.values()].filter(e=>e.count===1);}
function normals(positions,indices){const out=Array(positions.length).fill(0);for(let i=0;i<indices.length;i+=3){const[a,b,c]=indices.slice(i,i+3),n=cross(sub(positions.slice(b*3,b*3+3),positions.slice(a*3,a*3+3)),sub(positions.slice(c*3,c*3+3),positions.slice(a*3,a*3+3)));for(const v of[a,b,c])for(let k=0;k<3;k++)out[v*3+k]+=n[k];}for(let i=0;i<out.length;i+=3)out.splice(i,3,...unit(out.slice(i,i+3)));return out;}

export function extendOuterwear(mesh,bones,design,{body,thickness=.0025}={}){
 const pelvis=bones.find(b=>b.name==='pelvis');if(!pelvis)throw Error('Outerwear needs the target pelvis');
 const waist=pelvis.head[1]+.055,cut=Math.max(design.hem,waist),hip=pelvis.head[1]-.070*design.height/1.7,positions=[],skinIndex=[],skinWeight=[],uv=[],sourceVertexIndices=[],indices=[],vertexCache=new Map(),edgeCache=new Map();
 const read=id=>({position:mesh.positions.slice(id*3,id*3+3),weights:Array.from({length:4},(_,s)=>[mesh.skinIndex[id*4+s],mesh.skinWeight[id*4+s]]),uv:mesh.uv?.slice(id*2,id*2+2)||[0,0],source:mesh.sourceVertexIndices?.[id]??id,key:'v'+id});
 const write=v=>{const key=v.position.map(n=>Math.round(n*1e7)).join(',');if(vertexCache.has(key))return vertexCache.get(key);const id=positions.length/3,w=weights(v.weights);positions.push(...v.position);skinIndex.push(...w.map(p=>p[0]));skinWeight.push(...w.map(p=>p[1]));uv.push(...v.uv);sourceVertexIndices.push(v.source);vertexCache.set(key,id);return id;};
 const armWeight=v=>v.weights.reduce((n,[j,w])=>n+(/^(upperarm|forearm|hand|thumb|index|middle|ring|little)/.test(bones[j]?.name||'')?w:0),0);
 const crossing=(a,b)=>{const key=[a.key,b.key].sort().join(':');if(edgeCache.has(key))return edgeCache.get(key);const t=(cut-a.position[1])/(b.position[1]-a.position[1]),v={position:mix(a.position,b.position,t),weights:[...a.weights.map(([j,w])=>[j,w*(1-t)]),...b.weights.map(([j,w])=>[j,w*t])],uv:mix(a.uv,b.uv,t),source:-1,key};v.position[1]=cut;edgeCache.set(key,v);return v;};
 for(let i=0;i<mesh.indices.length;i+=3){const triangle=mesh.indices.slice(i,i+3).map(read);let polygon=[];
  // Sleeves can extend below the waist in the anatomical rest pose. Their
  // native cuffs must never be mistaken for the suit's trouser section.
  if(triangle.some(v=>armWeight(v)>.25))polygon=triangle;
  else for(let j=0;j<3;j++){const a=triangle[j],b=triangle[(j+1)%3],insideA=a.position[1]>=cut-1e-8,insideB=b.position[1]>=cut-1e-8;if(insideA)polygon.push(a);if(insideA!==insideB)polygon.push(crossing(a,b));}
  if(polygon.length<3)continue;const ids=polygon.map(write);for(let j=1;j<ids.length-1;j++)if(new Set([ids[0],ids[j],ids[j+1]]).size===3)indices.push(ids[0],ids[j],ids[j+1]);
 }
 const cutEdges=boundaryEdges(indices).filter(e=>Math.abs(positions[e.a*3+1]-cut)<1e-6&&Math.abs(positions[e.b*3+1]-cut)<1e-6),outgoing=new Map();for(const e of cutEdges){if(!outgoing.has(e.a))outgoing.set(e.a,[]);outgoing.get(e.a).push(e.b);}
 const loops=[],used=new Set();for(const first of cutEdges){if(used.has(first.a+':'+first.b))continue;const loop=[first.a];let a=first.a,b=first.b;for(let guard=0;guard<=cutEdges.length;guard++){const key=a+':'+b;if(used.has(key))break;used.add(key);loop.push(b);if(b===loop[0])break;const next=(outgoing.get(b)||[]).find(c=>!used.has(b+':'+c));if(next===undefined)break;a=b;b=next;}if(loop.at(-1)===loop[0]&&loop.length>=5)loops.push(loop.slice(0,-1));}
 const area=loop=>Math.abs(loop.reduce((sum,id,i)=>{const next=loop[(i+1)%loop.length];return sum+positions[id*3]*positions[next*3+2]-positions[next*3]*positions[id*3+2];},0)/2);
 loops.sort((a,b)=>area(b)-area(a));const rim=loops[0];
 if(cut-design.hem>1e-5&&!rim)throw Error(`No closed torso waist contour in ${mesh.name||'proxy'} at ${cut.toFixed(3)} m (${cutEdges.length} cut edges)`);
 let panelRows=0;
 if(rim&&cut-design.hem>1e-5){
  const x=rim.map(id=>positions[id*3]),z=rim.map(id=>positions[id*3+2]),center=[(Math.min(...x)+Math.max(...x))/2,(Math.min(...z)+Math.max(...z))/2],section=bodySection(body,hip),hipCenter=section.length?[(Math.min(...section.map(p=>p[0]))+Math.max(...section.map(p=>p[0])))/2,(Math.min(...section.map(p=>p[1]))+Math.max(...section.map(p=>p[1])))/2]:center,hipEase=design.hem<.88?.020:.012,flare=clamp(design.hemSpread??1,.98,1.06)-1,pelvisIndex=bones.indexOf(pelvis),steps=Math.max(2,Math.ceil((cut-design.hem)/.016)),heights=Array.from({length:steps},(_,i)=>cut-(cut-design.hem)*(i+1)/steps);
  let previous=rim;
  for(const y of heights){const ring=[],hipBlend=smooth((cut-y)/Math.max(.015,cut-hip)),free=clamp((hip-y)/Math.max(.025,hip-design.hem)),c=mix(center,hipCenter,hipBlend);
   for(let i=0;i<rim.length;i++){const id=rim[i],p=[positions[id*3],positions[id*3+2]],delta=sub(p,center),radius=length(delta),direction=unit(delta),fitted=radialHit(section,hipCenter,direction),hipRadius=fitted?Math.max(fitted+hipEase,radius*.97):radius,baseRadius=radius+(hipRadius-radius)*hipBlend,angle=Math.atan2(direction[1],direction[0]),fold=.0035*free*free*Math.sin(angle*11+.35*(cut-y)),r=baseRadius*(1+flare*free)+fold,w=weights(Array.from({length:4},(_,s)=>[skinIndex[id*4+s],skinWeight[id*4+s]*(1-hipBlend)]).concat([[pelvisIndex,hipBlend]])),at=positions.length/3;
    // The current actor performance rotates every torso bone together. Below
    // the hips, inverse-rotate only the hanging displacement so those fall
    // lines become world-vertical again when that posture is applied.
    const dy=Math.min(0,y-hip),lean=design.lean||0,side=design.sideLean||0,gravity=[Math.sin(side)*dy,(Math.cos(side)*Math.cos(lean)-1)*dy,Math.cos(side)*Math.sin(lean)*dy];
    positions.push(c[0]+direction[0]*r+gravity[0],y+gravity[1],c[1]+direction[1]*r+gravity[2]);skinIndex.push(...w.map(p=>p[0]));skinWeight.push(...w.map(p=>p[1]));uv.push(i/rim.length,(cut-y)*4);sourceVertexIndices.push(-1);ring.push(at);
   }
   for(let i=0;i<rim.length;i++){const next=(i+1)%rim.length;indices.push(previous[next],previous[i],ring[i],previous[next],ring[i],ring[next]);}previous=ring;panelRows++;
  }
 }
 // A thin inward lining preserves every original outer silhouette and gives
 // the neckline, cuffs, front opening and new hem an actual sewn return edge.
 const outerCount=positions.length/3,outerNormals=normals(positions,indices),outerIndices=indices.slice(),edges=boundaryEdges(outerIndices);
 for(let id=0;id<outerCount;id++){const p=positions.slice(id*3,id*3+3),n=outerNormals.slice(id*3,id*3+3);positions.push(...sub(p,mul(n,thickness)));skinIndex.push(...skinIndex.slice(id*4,id*4+4));skinWeight.push(...skinWeight.slice(id*4,id*4+4));uv.push(...uv.slice(id*2,id*2+2));sourceVertexIndices.push(sourceVertexIndices[id]);}
 for(let i=0;i<outerIndices.length;i+=3)indices.push(outerIndices[i]+outerCount,outerIndices[i+2]+outerCount,outerIndices[i+1]+outerCount);
 for(const{a,b}of edges)indices.push(b,a,a+outerCount,b,a+outerCount,b+outerCount);
 return{...mesh,name:'fitted continuous draped outerwear',positions,normals:normals(positions,indices),indices,skinIndex,skinWeight,uv,sourceVertexIndices,faces:Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3)),bones,drape:{waistY:waist,cutY:cut,hipY:hip,hemY:design.hem,waistLoops:loops.length,rimVertices:rim?.length||0,panelRows,thickness,outerVertices:outerCount}};
}
