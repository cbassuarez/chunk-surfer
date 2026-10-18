// Paint follows the actual 32-sided CylinderGeometry surface. An ideal circle
// sits inside that polygon between vertices, so even a 0.1mm "decal offset"
// cannot save a circle-based label from cutting through the real housing.
const freeze=object=>Object.freeze(object);
export const FIELD_WRAPPED_PRINT=freeze({
 torch:freeze({centerY:-.062,widthM:.032,heightM:.007,surface:freeze({centerY:-.015,heightM:.158,radiusBottomM:.023,radiusTopM:.023,segments:32,offsetM:.0001})}),
 coffee:freeze({centerY:.030,widthM:.043,heightM:.013,surface:freeze({centerY:-.011,heightM:.125,radiusBottomM:.027,radiusTopM:.038,segments:32,offsetM:.0001})}),
});
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const unit=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);

// Clip a material-space polygon by one exact linear facet boundary. Adjacent
// facets share identical UV intersections, preserving the literal glyphs.
function clip(polygon,evaluate){
 const out=[];
 for(let i=0;i<polygon.length;i++){
  const a=polygon[i],b=polygon[(i+1)%polygon.length],fa=evaluate(a),fb=evaluate(b),insideA=fa>=-1e-14,insideB=fb>=-1e-14;
  if(insideA)out.push(a);
  if(insideA!==insideB){const t=fa/(fa-fb);out.push(a.map((v,k)=>v+(b[k]-v)*t));}
 }
 // A boundary through an existing corner must not create zero-area triangles.
 return out.filter((p,i)=>i===0||Math.hypot(...sub(p,out[i-1]))>1e-12).filter((p,i,a)=>i!==a.length-1||a.length===1||Math.hypot(...sub(p,a[0]))>1e-12);
}

export function facetedWrappedPrintGeometry({centerY,widthM,heightM,surface}){
 const {centerY:bodyY,heightM:bodyH,radiusBottomM:bottom,radiusTopM:top,segments=32,offsetM=.0001}=surface||{};
 if(![centerY,widthM,heightM,bodyY,bodyH,bottom,top,offsetM].every(Number.isFinite)||!(widthM>0&&heightM>0&&bodyH>0&&bottom>0&&top>0)||!Number.isInteger(segments)||segments<8||!(offsetM>0&&offsetM<=.00025))throw new RangeError('Wrapped paint needs a finite real polygonal housing and a 0..0.25mm contact offset');
 const slope=(top-bottom)/bodyH,delta=2*Math.PI/segments,c=Math.cos(delta/2),sin=Math.sin(delta/2),planeLength=Math.hypot(1,slope*c);
 // Keep the nominal print height in physical generator arclength as well.
 const verticalHeight=heightM/Math.hypot(1,slope),yAt=v=>centerY+(.5-v)*verticalHeight;
 const radiusAt=y=>bottom+(y-(bodyY-bodyH/2))*slope;
 if(yAt(0)>bodyY+bodyH/2+1e-12||yAt(1)<bodyY-bodyH/2-1e-12)throw new RangeError('Wrapped lettering leaves its actual housing');
 const outerRadiusAt=v=>radiusAt(yAt(v))+offsetM*planeLength/c;
 const facetLengthAt=v=>2*outerRadiusAt(v)*sin,minLength=Math.min(facetLengthAt(0),facetLengthAt(1));
 if(widthM>=minLength*segments*.8)throw new RangeError('Wrapped lettering must remain on a bounded visible housing band');
 const first=Math.floor(-widthM/2/minLength)-1,last=Math.ceil(widthM/2/minLength)+1;
 const positions=[],normals=[],uvs=[],indices=[],facets=[];
 for(let sector=first;sector<=last;sector++){
  let polygon=[[0,0],[0,1],[1,1],[1,0]];
  polygon=clip(polygon,([u,v])=>widthM*(u-.5)-sector*facetLengthAt(v));
  polygon=clip(polygon,([u,v])=>(sector+1)*facetLengthAt(v)-widthM*(u-.5));
  if(polygon.length<3)continue;
  const a=sector*delta,b=(sector+1)*delta,va=[Math.sin(a),Math.cos(a)],vb=[Math.sin(b),Math.cos(b)],base=positions.length/3;
  for(const [u,v]of polygon){
   const r=outerRadiusAt(v),t=clamp((widthM*(u-.5)-sector*facetLengthAt(v))/facetLengthAt(v),0,1);
   positions.push(r*(va[0]*(1-t)+vb[0]*t),yAt(v),r*(va[1]*(1-t)+vb[1]*t));
   // Match the housing's smooth CylinderGeometry normals exactly at vertices
   // and by its own facet interpolation between them, rather than adding a
   // second independently shaded label silhouette.
   normals.push(...unit([va[0]*(1-t)+vb[0]*t,-slope,va[1]*(1-t)+vb[1]*t]));
   uvs.push(u,1-v);
  }
  const start=indices.length;
  for(let i=1;i<polygon.length-1;i++){
   const ids=[base,base+i,base+i+1],p=ids.map(id=>positions.slice(id*3,id*3+3));
   if(Math.hypot(...cross(sub(p[1],p[0]),sub(p[2],p[0])))>1e-16)indices.push(...ids);
  }
  facets.push({sector,firstVertex:base,vertexCount:polygon.length,firstIndex:start,indexCount:indices.length-start});
 }
 return{positions,normals,uvs,indices,facets,contact:{kind:'paint on actual polygonal housing',segments,offsetM,bodyY,bodyH,radiusBottomM:bottom,radiusTopM:top,
  widthArcM:widthM,heightArcM:heightM,centerY,normalFrame:'existing smooth housing normals; positions follow its planar facets',axes:'U right, V up; front +Z'}};
}

export function torchGripRingYs(){
 const label=FIELD_WRAPPED_PRINT.torch,low=label.centerY-label.heightM/2,high=label.centerY+label.heightM/2,ys=[];
 for(let y=-.078;y<.040;y+=.008)if(y+.0008<low||y-.0008>high)ys.push(y);
 return ys;
}
