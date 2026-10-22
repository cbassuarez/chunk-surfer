// St Brendan's remains the same church, route and collision. Only its dedicated
// rendered meshes are replaced. Other tower/chapel copies keep their originals.
export const ST_BRENDANS_TREATMENT_PACK='/assets/st-brendans-treatment.glb';
export const ST_BRENDANS_TREATMENT_VERSION='stripped-weight-1';
// The preserved church skin alone is39,204triangles. This budget includes it,
// every individual casting and both mutually exclusive screen damage states.
export const ST_BRENDANS_TREATMENT_BUDGET=Object.freeze({bytes:3500000,triangles:90000});
export const ST_BRENDANS_INSTANCE_MESH=Object.freeze({
  'brendan-church':'brendan_church_treated',
  ...Object.fromEntries(['n','s'].flatMap(side=>[1,2,3].map(i=>[`brendan-pew-${side}-${i}`,'brendan_pew']))),
  ...Object.fromEntries(['n','s'].flatMap(side=>[1,2].map(i=>[`brendan-choir-stall-${side}-${i}`,'brendan_choir_stall']))),
  'brendan-altar':'brendan_altar','brendan-font':'brendan_font',
  'brendan-side-monument':'brendan_monument','brendan-sacristy-tomb':'brendan_tomb',
  'brendan-pulpitum':'brendan_pulpitum',
  'brendan-pulpitum-north':'brendan_pulpitum_broken',
  'brendan-pulpitum-south':'brendan_pulpitum_broken',
});
export function stBrendansTreatmentMesh(instance){
  const named=ST_BRENDANS_INSTANCE_MESH[instance?.id];if(named)return named;
  if(/^brendan-(?:bell|wheel|clapper|stay|slider)-[1-8]$/.test(instance?.id||'')||/^brendan-fallen-(?:bell|wheel)$/.test(instance?.id||'')||/^brendan-lesson-(?:wheel|clapper)$/.test(instance?.id||'')){
    return /^tower_(bell|wheel|clapper|stay|slider)_0[1-8]$/.test(instance?.mesh||'')?instance.mesh.replace('tower_','brendan_'):instance.mesh;
  }
  return instance?.mesh;
}
// Authored church-local metres. Stone splays project into the existing room;
// the closed pane remains against the existing solid sector wall, not a new
// navigable opening. Normals face the room; lighting may sit just inside it.
export const ST_BRENDANS_EMBRASURES=Object.freeze([
  ...[-1.16,0,1.16].map((dx,i)=>Object.freeze({id:`east-${i}`,x:16.5+dx,z:84.96,y:4.5,width:.74,height:3.7,normal:Object.freeze([0,0,-1]),depth:.46})),
  Object.freeze({id:'west',x:16.5,z:56.04,y:5.75,width:1.7,height:2.85,normal:Object.freeze([0,0,1]),depth:.44}),
  Object.freeze({id:'side-chapel',x:9.04,z:79.4,y:3.35,width:.95,height:2.15,normal:Object.freeze([1,0,0]),depth:.40}),
]);
export const ST_BRENDANS_TREATMENT_MESH_NAMES=Object.freeze([
  ...new Set(Object.values(ST_BRENDANS_INSTANCE_MESH)),
  ...Array.from({length:8},(_,i)=>['bell','wheel','clapper','stay','slider'].map(part=>`brendan_${part}_0${i+1}`)).flat(),
]);
