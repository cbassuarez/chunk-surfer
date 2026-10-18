// Vector ink on the actual polygonal field-kit housings. The approved 736/300
// unit DA-1000 width corresponds to the carried 274mm chassis. Only the paint
// standoff uses this physical scale; model geometry and placement are retained.
import {createHash} from 'node:crypto';
export const FIELD_KIT_METRES_PER_UNIT=.274/(736/300);
const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-p[1]*q[0];},0))*.5;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function clip(poly,evaluate){
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],fa=evaluate(a),fb=evaluate(b),ia=fa>=-1e-13,ib=fb>=-1e-13;
  if(ia)out.push(a);
  if(ia!==ib){const t=fa/(fa-fb);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
 }
 return out.filter((p,i)=>i===0||Math.hypot(p[0]-out[i-1][0],p[1]-out[i-1][1])>1e-12)
  .filter((p,i,a)=>i!==a.length-1||a.length===1||Math.hypot(p[0]-a[0][0],p[1]-a[0][1])>1e-12);
}
export function conformVectorLettering({positions,indices,origin=[0,0,0],surface,metresPerUnit=FIELD_KIT_METRES_PER_UNIT}){
 const {centerY,heightM:height,radiusTopM:top,radiusBottomM:bottom,segments,hostName,offsetPhysicalM=.0001}=surface||{};
 if(![centerY,height,top,bottom,segments,metresPerUnit,offsetPhysicalM].every(Number.isFinite)||!(height>0&&top>0&&bottom>0&&metresPerUnit>0&&offsetPhysicalM>0&&offsetPhysicalM<=.00025)||!Number.isInteger(segments)||segments<8)throw new RangeError('Vector paint needs an actual polygonal cylindrical/frustum host');
 const slope=(top-bottom)/height,delta=2*Math.PI/segments,c=Math.cos(delta/2),s=Math.sin(delta/2),den=Math.hypot(1,slope*c),offset=offsetPhysicalM/metresPerUnit;
 const radius=y=>bottom+(y-(centerY-height/2))*slope,outer=y=>radius(y)+offset*den/c,L=y=>2*outer(y)*s;
 const source=Array.from(positions),ix=indices?Array.from(indices):Array.from({length:source.length/3},(_,i)=>i);
 const output={positions:[],normals:[],indices:[],materialPositions:[]};let beforeArea=0,afterArea=0;
 for(let at=0;at<ix.length;at+=3){
  const triangle=ix.slice(at,at+3).map(id=>[source[id*3]+origin[0],source[id*3+1]+origin[1]]),a=area(triangle);if(a<1e-18)continue;
  for(const p of triangle)if(p[1]<centerY-height/2-1e-9||p[1]>centerY+height/2+1e-9)throw new RangeError('Vector inscription leaves its physical housing');
  beforeArea+=a;
  const minL=Math.min(...triangle.map(p=>L(p[1]))),maxX=Math.max(...triangle.map(p=>Math.abs(p[0]))),bound=Math.ceil(maxX/minL)+1;
  for(let sector=-bound;sector<=bound;sector++){
   let polygon=clip(triangle,p=>p[0]-sector*L(p[1]));polygon=clip(polygon,p=>(sector+1)*L(p[1])-p[0]);
   if(polygon.length<3||area(polygon)<1e-18)continue;
   afterArea+=area(polygon);
   const signed=polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-p[1]*q[0];},0);if(signed<0)polygon.reverse();
   const base=output.positions.length/3,theta=sector*delta,next=(sector+1)*delta,va=[Math.sin(theta),Math.cos(theta)],vb=[Math.sin(next),Math.cos(next)];
   for(const [x,y]of polygon){
    const t=Math.max(0,Math.min(1,(x-sector*L(y))/L(y))),r=outer(y);
    output.positions.push(r*(va[0]*(1-t)+vb[0]*t)-origin[0],y-origin[1],r*(va[1]*(1-t)+vb[1]*t)-origin[2]);
    output.normals.push(...unit([va[0]*(1-t)+vb[0]*t,-slope,va[1]*(1-t)+vb[1]*t]));output.materialPositions.push(x-origin[0],y-origin[1]);
   }
   for(let i=1;i<polygon.length-1;i++)output.indices.push(base,base+i,base+i+1);
  }
 }
 if(Math.abs(beforeArea-afterArea)>Math.max(1e-12,beforeArea*1e-8))throw new Error('Conforming a glyph changed its literal vector stroke area');
 output.contact={version:1,kind:'vector ink on actual polygonal host',hostName,centerY,heightM:height,radiusTopM:top,radiusBottomM:bottom,segments,
  offsetPhysicalM,offsetModelUnits:offset,metresPerModelUnit:metresPerUnit,physicalScaleBasis:'274mm carried recorder / (736/300) asset-unit approved recorder width',
  sourcePositionSha256:sha(Buffer.from(new Float32Array(source).buffer)),sourceVectorArea:beforeArea,conformedVectorArea:afterArea,
  glyphPolicy:'Exact original vector triangles, clipped only at real host-facet boundaries; physical width retains polygonal arclength.',
  finishPolicy:'Existing non-emissive dielectric ink and roughness preserved; submillimetre finish noise is unresolved at this lettering scale and is averaged into roughness.'};
 return output;
}
