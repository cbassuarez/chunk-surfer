// Original foundry crest for the surviving south lantern rib. Large open
// scrolls and folded metal leaves carry its pattern through the shared dither.
// It crowns the already supported rib; it is not a new cage over the glass.
export const ROOF_PALATIAL_IRONWORK=Object.freeze({
  owner:'academic_roof_structure',z:5,minY:2.75,maxY:4.28,halfWidth:3.82,
  maximumTriangles:4500,northSpan:'unchanged and missing',
});

export function buildRoofPalatialIronwork({m,roofQuietIron,oldBronze,addBeam,addQuad}){
  let triangles=0;
  const z=ROOF_PALATIAL_IRONWORK.z;
  const beam=(a,b,w,mat=roofQuietIron)=>{addBeam(m,a,b,w,mat);triangles+=12;};
  const strip=(points,w,mat=roofQuietIron)=>{
    for(let i=1;i<points.length;i++)beam(points[i-1],points[i],w,mat);
  };
  const curve=(fn,steps,w,mat=roofQuietIron)=>strip(Array.from({length:steps+1},(_,i)=>fn(i/steps)),w,mat);
  const leaf=(base,tip,width,mat=roofQuietIron)=>{
    const dx=tip[0]-base[0],dy=tip[1]-base[1],length=Math.hypot(dx,dy),nx=-dy/length*width/2,ny=dx/length*width/2;
    const left=[base[0]+dx*.43+nx,base[1]+dy*.43+ny,z-.012];
    const right=[base[0]+dx*.43-nx,base[1]+dy*.43-ny,z-.012];
    const ridge=[base[0]+dx*.47,base[1]+dy*.47,z-.065];
    // Folded returns have surface normals and thickness, not a transparent
    // sprite. Reverse faces retain the foundry silhouette from the garden.
    for(const points of[[base,left,tip,ridge],[base,ridge,tip,right]]){
      addQuad(m,...points,mat);addQuad(m,...points.toReversed(),mat);triangles+=4;
    }
  };
  // The foot meets the existing ridge at y2.76. An open oval surrounds its
  // surviving lyre, whose strings remain the only fine detail in this crest.
  for(const radius of[1,.82])curve(t=>{
    const a=t*Math.PI*2;return[Math.sin(a)*.55*radius,3.38+Math.cos(a)*.59*radius,z];
  },24,.050);
  beam([0,2.765,z],[0,2.91,z],.075);
  for(const sign of[-1,1]){
    // A heavy rising S and its curled return form each half of the crest.
    curve(t=>{
      const a=t*Math.PI*1.78,r=.52*(1-.70*t);
      return[sign*(1.08+Math.sin(a)*r),3.35+Math.cos(a)*r,z];
    },22,.058);
    strip([[sign*.27,2.89,z],[sign*.62,3.08,z],[sign*.93,3.24,z]],.062);
    // Long counter-curves terminate in broad leaves, giving a six-metre
    // silhouette rather than filling the sky with miniature repeated curls.
    curve(t=>[sign*(.68+t*2.60),2.91+Math.sin(t*Math.PI)*.41,z],22,.054);
    curve(t=>{
      const a=t*Math.PI*1.6,r=.34*(1-.68*t);
      return[sign*(2.70+Math.sin(a)*r),3.03+Math.cos(a)*r,z];
    },16,.050);
    for(const[bx,by,tx,ty,w]of[
      [.90,3.25,1.24,3.73,.24],[1.48,3.26,1.79,3.62,.23],
      [2.03,3.22,2.33,3.49,.22],[2.66,3.14,3.10,3.45,.25],
      [3.20,2.94,3.72,3.17,.28],
    ])leaf([sign*bx,by,z],[sign*tx,ty,z],w);
    // The isolated rubbed bronze is broad and inset into the iron foliage;
    // no emitter or bright strip runs across the city horizon.
    leaf([sign*.28,3.88,z],[sign*.40,4.13,z],.16,oldBronze);
  }
  leaf([0,3.93,z],[0,4.23,z],.26,oldBronze);
  if(triangles>ROOF_PALATIAL_IRONWORK.maximumTriangles)throw Error('Roof iron crest exceeded its reviewed geometry budget');
  return{triangles,newMeshes:0,newMaterials:0};
}
