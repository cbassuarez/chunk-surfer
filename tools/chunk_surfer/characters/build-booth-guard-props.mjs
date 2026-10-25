// Narrow lodge-workplace repair. Copy the current packed materials and details,
// turn the work towards the real public approach, add three hand-sized objects.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {prune} from '@gltf-transform/functions';
const root=fileURLToPath(new URL('../../../',import.meta.url)),source='public/assets/conservatory-props.glb',out=root+'public/assets/booth-guard-props.glb',io=new NodeIO(),d=await io.read(root+source),r=d.getRoot(),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['yard_booth_interior','yard_booth_glazing','yard_booth_practicals','yard_booth_handoff'],kept=r.listMeshes().filter(m=>names.includes(m.getName())),materials=new Map(r.listMaterials().map(m=>[m.getName(),m]));
if(kept.length!==names.length)throw Error('Missing source lodge mesh');
const originalMaterialEvidence=Object.fromEntries(kept.map(m=>[m.getName(),m.listPrimitives().map(p=>({name:p.getMaterial().getName(),baseColor:p.getMaterial().getBaseColorFactor(),roughness:p.getMaterial().getRoughnessFactor(),metallic:p.getMaterial().getMetallicFactor(),emissive:p.getMaterial().getEmissiveFactor()}))]));
for(const n of r.listNodes())n.dispose();for(const s of r.listScenes())s.dispose();for(const m of r.listMeshes())if(!kept.includes(m))m.dispose();
const scene=d.createScene('The existing gate lodge, work towards the public window'),buffer=r.listBuffers()[0]||d.createBuffer();
for(const m of kept){
  // The old handoff has paper plus a floating vertical pen and rectangular
  // key. Paper remains; real held accessories below replace the brass group.
  if(m.getName()==='yard_booth_handoff')for(const p of m.listPrimitives())if(p.getMaterial().getName()==='brass'){m.removePrimitive(p);p.dispose();}
  for(const p of m.listPrimitives()){
    for(const name of['POSITION','NORMAL']){const a=p.getAttribute(name).clone(),array=a.getArray().slice();for(let i=2;i<array.length;i+=3)array[i]*=-1;
      if(name==='POSITION'&&m.getName()==='yard_booth_glazing')for(let i=0;i<array.length;i+=3){const[x,y,z]=array.slice(i,i+3),material=p.getMaterial().getName();
        // Park both existing sliding panes in a visibly overlapping stack on
        // the right. The guard's head must be seen through real open air at
        // an ordinary 1.62m eye; the old 16cm letterbox hid cap and face.
        const paneCorner=(Math.abs(y-1.71)<1e-4||Math.abs(y-2.11)<1e-4)&&z>1.2774&&z<1.3226;
        if(material==='wired roof glass'&&paneCorner&&x>-1.12&&x<-.06){const left=x<-.60;array[i]+=left?1.43:.90;array[i+2]+=left?0:.055;}
        // The retained raised rain streaks must stop above the hand/key slot,
        // as in the original workplace repair, even with the panes parked.
        else if(material==='wired roof glass'&&x>-1.12&&x<-.06&&z>1.25&&y<1.715)array[i+1]=1.715;
        // Retain the entire rail, resting on the existing counter/sill lip.
        if(material==='painted steel')array[i+1]-=.135;
      }
      if(name==='POSITION'&&m.getName()==='yard_booth_interior')for(let i=0;i<array.length;i+=3){const[x,y,z]=array.slice(i,i+3),material=p.getMaterial().getName();
        // Leave a real standing recess: the old full carcass and 68cm top
        // intersected the approved human's abdomen at the actual window.
        if(material==='worn wood'&&y>1.40&&y<1.56&&z>.48&&z<1.18&&x> -1.32&&x<.42)array[i+2]=.62+(z-.49)/.68*.55;
        if(material==='dark wood'&&y>.82&&y<1.42&&z>.51&&z<1.01&&x> -1.25&&x<.35)array[i+2]=.88+(z-.52)/.48*.12;
      }a.setArray(array);p.setAttribute(name,a);}
    const a=p.getIndices().clone(),array=a.getArray().slice();for(let i=0;i<array.length;i+=3)[array[i+1],array[i+2]]=[array[i+2],array[i+1]];a.setArray(array);p.setIndices(a);
  }
  m.setExtras({...m.getExtras(),boothWorkplaceRevision:'public-window-work-v1',sourceMesh:m.getName(),publicFace:'+Z',preservation:'Source materials and UVs retained; Z reflection with corrected normals/winding; counter rear trimmed to .62m and front panel to .88m for a real standing recess; existing sliding panes parked to the right and rail lowered to the sill for a real head sightline.'});
  scene.addChild(d.createNode(m.getName()).setMesh(m));
}
const accessor=(array,type,integer=false)=>d.createAccessor().setType(type).setArray(integer?new Uint32Array(array):new Float32Array(array)).setBuffer(buffer);
const built=[];
function mesh(name){const m=d.createMesh(name),groups=new Map();
  const quad=(points,material)=>{points=points.filter((p,i)=>!points.slice(0,i).some(q=>Math.hypot(...p.map((v,k)=>v-q[k]))<1e-12));if(points.length<3)throw Error('Collapsed held-object face');let g=groups.get(material);if(!g){g={positions:[],normals:[],uvs:[],indices:[]};groups.set(material,g);}const a=points[1].map((v,k)=>v-points[0][k]),b=points[2].map((v,k)=>v-points[0][k]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],l=Math.hypot(...n),base=g.positions.length/3;if(l<1e-12)throw Error('Degenerate held-object face');for(const p of points){g.positions.push(...p);g.normals.push(...n.map(v=>v/l));g.uvs.push(p[0]*8,p[1]*8);}g.indices.push(base,base+1,base+2);if(points.length===4)g.indices.push(base,base+2,base+3);};
  const box=(c,s,mat)=>{const p=Array.from({length:8},(_,i)=>c.map((v,k)=>v+((i&(1<<k))?1:-1)*s[k]/2));for(const f of[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]])quad(f.map(i=>p[i]),mat);};
  const lathe=(profile,mat,{cx=0,cz=0,segments=24}={})=>{for(let j=0;j<profile.length-1;j++)for(let k=0;k<segments;k++){const a=2*Math.PI*k/segments,b=2*Math.PI*(k+1)/segments,[r0,y0]=profile[j],[r1,y1]=profile[j+1];quad([[cx+r0*Math.cos(a),y0,cz+r0*Math.sin(a)],[cx+r1*Math.cos(a),y1,cz+r1*Math.sin(a)],[cx+r1*Math.cos(b),y1,cz+r1*Math.sin(b)],[cx+r0*Math.cos(b),y0,cz+r0*Math.sin(b)]],mat);}};
  const ring=(c,rx,rz,width,thickness,mat)=>{for(let k=0;k<32;k++){const a=2*Math.PI*k/32,b=2*Math.PI*(k+1)/32,point=(t,inner,y)=>[c[0]+(rx-inner*width)*Math.cos(t),c[1]+y,c[2]+(rz-inner*width)*Math.sin(t)];quad([point(a,0,thickness/2),point(b,0,thickness/2),point(b,1,thickness/2),point(a,1,thickness/2)],mat);quad([point(a,1,-thickness/2),point(b,1,-thickness/2),point(b,0,-thickness/2),point(a,0,-thickness/2)],mat);quad([point(a,0,-thickness/2),point(b,0,-thickness/2),point(b,0,thickness/2),point(a,0,thickness/2)],mat);quad([point(a,1,thickness/2),point(b,1,thickness/2),point(b,1,-thickness/2),point(a,1,-thickness/2)],mat);}};
  const finish=()=>{for(const[material,g]of groups)m.addPrimitive(d.createPrimitive().setAttribute('POSITION',accessor(g.positions,'VEC3')).setAttribute('NORMAL',accessor(g.normals,'VEC3')).setAttribute('TEXCOORD_0',accessor(g.uvs,'VEC2')).setIndices(accessor(g.indices,'SCALAR',true)).setMaterial(materials.get(material)));scene.addChild(d.createNode(name).setMesh(m));built.push({name,triangles:[...groups.values()].reduce((n,g)=>n+g.indices.length/3,0)});};
  return{quad,box,lathe,ring,finish};
}
{
  const g=mesh('booth_guard_pen');g.lathe([[.001,-.047],[.003,-.034],[.0045,-.018],[.0045,.077],[.0035,.086],[.001,.090]],'black lacquer',{segments:16});g.lathe([[.001,-.047],[.003,-.034],[.0035,-.030]],'brass',{segments:16});g.box([.0048,.052,0],[.0015,.035,.004],'painted steel');g.finish();
}
{
  const g=mesh('booth_guard_key');g.ring([0,0,0],.018,.025,.005,.004,'brass');g.box([0,0,-.056],[.005,.004,.066],'brass');for(const[z,w]of[[-.071,.014],[-.082,.009],[-.089,.018]])g.box([w/2,0,z],[w,.004,.006],'brass');g.finish();
}
{
  const g=mesh('booth_guard_cup');g.lathe([[0,-.058],[.036,-.058],[.043,-.050],[.046,.046],[.046,.052],[.042,.055],[.039,.050],[.038,-.044],[0,-.044]],'ivory',{cx:-.066,segments:32});g.lathe([[0,.027],[.038,.027]],'dark wood',{cx:-.066,segments:32});
  // A true open handle instead of a solid torus/card. Grip point is its outer
  // edge; the cup centre stays beside the hand, never through the palm.
  for(let j=0;j<20;j++){const a=-Math.PI*.5+j*Math.PI/20,b=-Math.PI*.5+(j+1)*Math.PI/20;const c=t=>[-.020+.025*Math.cos(t),-.001+.036*Math.sin(t),0];const p=c(a),q=c(b),delta=q.map((v,k)=>v-p[k]),l=Math.hypot(delta[0],delta[1]),n=[-delta[1]/l*.004,delta[0]/l*.004,0];g.quad([[p[0]+n[0],p[1]+n[1],-.005],[q[0]+n[0],q[1]+n[1],-.005],[q[0]-n[0],q[1]-n[1],-.005],[p[0]-n[0],p[1]-n[1],-.005]],'ivory');g.quad([[p[0]-n[0],p[1]-n[1],.005],[q[0]-n[0],q[1]-n[1],.005],[q[0]+n[0],q[1]+n[1],.005],[p[0]+n[0],p[1]+n[1],.005]],'ivory');for(const sign of[-1,1])g.quad([[p[0]+n[0]*sign,p[1]+n[1]*sign,-.005],[p[0]+n[0]*sign,p[1]+n[1]*sign,.005],[q[0]+n[0]*sign,q[1]+n[1]*sign,.005],[q[0]+n[0]*sign,q[1]+n[1]*sign,-.005]],'ivory');}g.finish();
}
await d.transform(prune({keepAttributes:true}));const bytes=Buffer.from(await io.writeBinary(d));if(bytes.length>3_000_000)throw Error('Lodge work pack exceeds its bounded budget');fs.writeFileSync(out,bytes);
const stats={revision:'public-window-work-v1',source,sourceSHA256:sha(fs.readFileSync(root+source)),sha256:sha(bytes),bytes:bytes.length,meshes:r.listMeshes().map(m=>({name:m.getName(),triangles:m.listPrimitives().reduce((n,p)=>n+p.getIndices().getCount()/3,0),primitives:m.listPrimitives().length})),originalMaterialEvidence,publicFace:'+Z',windowPassThrough:{x:[-.865,-.07],y:[1.57,2.075],z:1.30},paneParking:{centres:[[.55,1.91,1.30],[.60,1.91,1.355]],railCentreY:1.535,retainedTopology:true},newAccessories:built,pending:['Native final dither and actual animated ledger/handoff inspection']};
fs.writeFileSync(out.replace('.glb','.stats.json'),JSON.stringify(stats,null,2)+'\n');fs.writeFileSync(out.replace('.glb','.credits.json'),JSON.stringify({author:'Chunk Surfer project',sourceMeshes:names,materials:'Exact existing project material records, UVs and maps copied from the current packed gate lodge.',newGeometry:'Original hand-sized pen, cut brass key and thick-walled tea cup. No external media.',sha256:stats.sha256},null,2)+'\n');console.log(JSON.stringify(stats,null,2));
