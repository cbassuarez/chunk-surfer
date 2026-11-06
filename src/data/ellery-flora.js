// A FEW MORE THINGS GROWING IN THE SEAMS. Ruled 2026-11-05: daisies only outside by Ellery
// and on the road in the drive, and not as the only flora, and not excessive, and not at
// random. So these are placed by hand, one at a time, beside what already grows there
// (yard-park.js, opening-street.js), the same way and for the same reason: growth belongs
// against a boundary. Nothing here means anything. He walks past them. Never indoors and
// never in Source.
//
// Coordinates are authored logical metres, the same as the rest of the yard. On the road,
// `d` and `lateral` are the road's own, and the verge runs from 3.25m to about 4.6m out.
const freeze=Object.freeze;

const footprint=(w,d,h)=>freeze({w,d,h,blocks:false});
export const ELLERY_FLORA_MESHES=freeze({
  vegetation_daisy_drift:footprint(1.3,1.0,.26),vegetation_daisy_drift_petals:footprint(1.3,1.0,.26),vegetation_daisy_drift_eyes:footprint(1.3,1.0,.26),
  vegetation_dandelions:footprint(.9,.8,.24),vegetation_dandelions_heads:footprint(.9,.8,.24),
  vegetation_clover_mat:footprint(1.2,1.0,.12),vegetation_clover_mat_flowers:footprint(1.2,1.0,.12),
});
// A plant's leaves, and whichever parts of it flower. Only the flowers get any light.
export const FLORA_PARTS=freeze({
  vegetation_daisy_drift:freeze([freeze({mesh:'vegetation_daisy_drift_petals',emissive:freeze([1,.98,.92,1.05])}),freeze({mesh:'vegetation_daisy_drift_eyes',emissive:freeze([1,.68,.06,1])})]),
  vegetation_dandelions:freeze([freeze({mesh:'vegetation_dandelions_heads',emissive:freeze([1,.68,.05,.9])})]),
  vegetation_clover_mat:freeze([freeze({mesh:'vegetation_clover_mat_flowers',emissive:freeze([.9,.72,.8,.6])})]),
});
const plant=(id,mesh,x,y,yaw=0,scale=1,extra={})=>freeze({id,mesh,x,y,yaw,scale,interactive:false,structural:true,blocks:false,...extra});
const flora=(id,mesh,x,y,yaw=0,scale=1)=>[plant(id,mesh,x,y,yaw,scale),...(FLORA_PARTS[mesh]||[]).map((part,k)=>plant(`${id}-flower-${k}`,part.mesh,x,y,yaw,scale,{emissive:part.emissive}))];
// One entry per plant here; a plant is several props by the time the world sees it.
export const ELLERY_FLORA_PLANTS=freeze([
  // The lawn edge in front of the frontage, where he gets out of the van.
  flora('flora-street-daisies-east','vegetation_daisy_drift',67.4,201.5,.3,.95),
  flora('flora-street-clover','vegetation_clover_mat',70.2,201.2,-.6),
  flora('flora-street-dandelions','vegetation_dandelions',61.8,201.3,.9),
  // The park: the seams of its lawn quarters, off the paths.
  flora('flora-park-daisies-nw','vegetation_daisy_drift',55.7,228.9,1.1),
  flora('flora-park-clover-ne','vegetation_clover_mat',65.3,226.4,.4,1.1),
  flora('flora-park-dandelions-w','vegetation_dandelions',52.9,234.7,-.3),
  flora('flora-park-dandelions-sw','vegetation_dandelions',57.3,246.7,2.1,.9),
  flora('flora-park-daisies-se','vegetation_daisy_drift',66.3,244.3,-1.2,1.05),
  // Along the foot of the lodge-side hedge.
  flora('flora-hedge-clover','vegetation_clover_mat',77.4,217.3,1.4,.9),
  flora('flora-hedge-dandelions','vegetation_dandelions',77.9,222.7,.2),
]);
export const ELLERY_FLORA_PROPS=freeze(ELLERY_FLORA_PLANTS.flat());

// On the drive in. Near the tree clusters and the bends, because that is where a verge
// goes uncut, and never evenly. Existing meshes do as much of it as the new ones. The van
// starts at -600, so nothing before that would ever be seen. Yaws stay small: the heads lean
// towards the road they're seen from (render/flora-models.js).
const verge=(id,mesh,d,lateral,yaw=0,scale=1)=>freeze({id,mesh,d,lateral,yaw,scale});
export const ROAD_FLORA_PLANTS=freeze([
  verge('road-flora-grass-1','vegetation_grass_edge',-591,-4.05,0,.8),
  verge('road-flora-daisies-1','vegetation_daisy_drift',-573,-4.0,.35),
  verge('road-flora-clover-1','vegetation_clover_mat',-562,-3.95,.5),
  verge('road-flora-weeds-1','vegetation_weed_cluster',-546,4.2,-.5,.7),
  verge('road-flora-dandelions-1','vegetation_dandelions',-528,4.0,.2),
  verge('road-flora-grass-2','vegetation_grass_edge',-521,4.15,.1,.85),
  verge('road-flora-daisies-2','vegetation_daisy_drift',-466,3.9,-.4,.95),
  verge('road-flora-weeds-2','vegetation_weed_cluster',-407,-4.25,.8,.75),
  verge('road-flora-daisies-3','vegetation_daisy_drift',-398,-3.85,.2),
  verge('road-flora-dandelions-2','vegetation_dandelions',-338,4.05,-.3),
  verge('road-flora-grass-3','vegetation_grass_edge',-283,-4.1,-.1,.8),
  verge('road-flora-clover-2','vegetation_clover_mat',-207,-4.0,.6),
  verge('road-flora-weeds-3','vegetation_weed_cluster',-152,4.3,-.3,.7),
  verge('road-flora-daisies-4','vegetation_daisy_drift',-101,4.0,.45,.9),
  verge('road-flora-dandelions-3','vegetation_dandelions',-61,-4.05,.3),
]);
export const ROAD_FLORA=freeze(ROAD_FLORA_PLANTS.flatMap(row=>[row,...(FLORA_PARTS[row.mesh]||[]).map((part,k)=>freeze({...row,id:`${row.id}-flower-${k}`,mesh:part.mesh,emissive:part.emissive}))]));
