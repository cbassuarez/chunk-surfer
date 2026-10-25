// Source remembers the actual arrival court. One rigid transform carries its
// positions, handedness and current shop identities; it does not move the town.
import { CONSERVATORY_PROPS } from './conservatory-props.js';
import { ARRIVAL_COURT } from './arrival-court.js';
import { DISTRICT_BOUNDS, DISTRICT_LOGICAL_ORIGIN, buildExteriorDistrictRows } from './exterior-district.js';
import { EXTERIOR_FOREGROUND, foregroundArrivalGlyphAt } from './exterior-foreground.js';
import { EXTERIOR_ROOFLINE } from './exterior-roofline.js';
import { PLAZA_SHOPFRONTS } from './plaza-shopfronts.js';
import { PROP_BOUNDS } from './generated/prop-geometry.js';
import { GLYPHS } from './floorplan/legend.js';
import { streetPilotFloorAt } from './street-pilot.js';

const freeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.values(value).forEach(freeze);Object.freeze(value);
  }
  return value;
};
const props=new Map(CONSERVATORY_PROPS.map(p=>[p.id,p]));
const districtRows=buildExteriorDistrictRows();
const snap=n=>Math.round(n*2)/2;

export const SOURCE_OUTSKIRTS_TOWN=freeze({
  revision:1,coordinateSpace:'source-road-metres',periodMetres:34.4,
  contextPeriodRows:4,contextPeriodMetres:137.6,
  transform:{acrossOrigin:7.5,alongOrigin:34.4,sourceYawOffset:-Math.PI/2},
  // The large district is context, not an additional explorable game location.
  // It advances through the cumulative loop frame, never relative to the eye.
  contextLastPass:19,initialLastPass:19,
  shops:PLAZA_SHOPFRONTS.map(p=>({...p})),
  packs:[
    '/assets/conservatory-props.glb','/assets/exterior-frontages.glb',
    '/assets/exterior-stationers.glb','/assets/opening-street.glb',
    '/assets/ellery-exterior-roofline.glb','/assets/vegetation.glb',
  ],
});

export function exteriorToOutskirts({x,z,y=0,yaw=0}){
  return {across:7.5-z,along:34.4-x,y,yaw:-yaw-Math.PI/2};
}

// These are the ordinary renderer's actual poses, including its half-metre
// projection and explicit sub-cell corrections. The three coordinate islands
// below are established exterior contracts, rather than a second town plan.
export function canonicalOutskirtsExteriorPose(id){
  const p=props.get(id);
  if(!p)throw new Error(`Unknown canonical exterior prop: ${id}`);
  const district=id.startsWith('district-')||id==='stationers-complete-room';
  const direct=id==='opening-street-frontage';
  const x=snap(p.x)+(p.renderOffsetX||0)-(district?DISTRICT_LOGICAL_ORIGIN.x-DISTRICT_BOUNDS.x0:direct?0:EXTERIOR_FOREGROUND.yardOrigin.x);
  const z=snap(p.y)+(p.renderOffsetZ||0)-(district?DISTRICT_LOGICAL_ORIGIN.y-DISTRICT_BOUNDS.y0:direct?0:EXTERIOR_FOREGROUND.yardOrigin.y);
  const districtX=snap(p.x)-DISTRICT_LOGICAL_ORIGIN.x+DISTRICT_BOUNDS.x0;
  const districtZ=snap(p.y)-DISTRICT_LOGICAL_ORIGIN.y+DISTRICT_BOUNDS.y0;
  const glyph=districtRows[Math.floor(districtZ-DISTRICT_BOUNDS.y0)]?.[Math.floor(districtX-DISTRICT_BOUNDS.x0)];
  const districtFloor=streetPilotFloorAt(districtX,districtZ)??GLYPHS[glyph]?.floor??0;
  const floor=p.floorOverride??(district?districtFloor:foregroundArrivalGlyphAt(x,z)==='g'?.02:0);
  return {x,z,y:floor+(p.elevation||0)+(p.renderOffsetY||0),yaw:p.yaw||0};
}

export function outskirtsTownPlacement(id,extra={}){
  const p=props.get(id),pose=canonicalOutskirtsExteriorPose(id);
  return freeze({canonicalId:id,mesh:p.mesh,...exteriorToOutskirts(pose),
    ...(p.fallbackMesh?{fallbackMesh:p.fallbackMesh}:{}),
    ...(p.scale!==undefined&&p.scale!==1?{scale:p.scale}:{}),
    ...Object.fromEntries(['scaleX','scaleY','scaleZ'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])),
    ...extra});
}

// The complete boundary is one render mesh but NOT one collision slab. These
// boxes are in that mesh's canonical local frame; source yaw carries them with
// the mesh and retains the literal4.6m drive opening.
export function outskirtsTownBoundaryCollision(){
  const c=ARRIVAL_COURT,o=c.origin;
  const rect=(x,z,w,d)=>({minX:x-o.x-w/2,maxX:x-o.x+w/2,minZ:z-o.z-d/2,maxZ:z-o.z+d/2});
  return freeze([
    ...c.runs.map(r=>rect(r.axis==='x'?(r.from+r.to)/2:r.fixed,r.axis==='z'?(r.from+r.to)/2:r.fixed,
      r.axis==='x'?r.to-r.from:c.plinth.copeWidth,r.axis==='z'?r.to-r.from:c.plinth.copeWidth)),
    ...c.piers.map(p=>rect(p.x,p.z,p.depth+.08,p.width)),
    ...c.foldedLeaves.map(p=>rect(p.x,(p.z0+p.z1)/2,.10,p.z1-p.z0)),
  ]);
}

const contextIds=[
  'opening-street-municipal-tree','opening-street-park-bench-west','opening-street-park-bench-east',
  'opening-street-park-laurel','opening-street-park-nettles','opening-street-park-weeds',
  'opening-street-park-grass-edge','opening-street-park-leaf-fall','exterior-arrival-planting',
  'exterior-garden-hardscape','exterior-garden-planting',
  'yard-former-stables','yard-rehearsal-annex','yard-baths-plant','yard-covered-stores',
  'opening-street-service-history',
  'district-west-row-a','district-west-row-b','district-east-row-a','district-east-row-b',
  'district-north-row-a','district-north-row-b','district-north-row-c',
  'district-south-row-a','district-south-row-b','district-south-row-c',
  'district-north-court-walls','district-south-court-walls','district-west-court-walls','district-east-court-walls',
  'stationers-complete-room',
];
const benchBody={minX:-ARRIVAL_COURT.bench.width/2,maxX:ARRIVAL_COURT.bench.width/2,
  minZ:-ARRIVAL_COURT.bench.depth/2,maxZ:ARRIVAL_COURT.bench.depth/2};
const contextBodies={
  'opening-street-park-bench-west':[benchBody],
  'opening-street-park-bench-east':[benchBody],
  // The stem stops a body. Its canopy never becomes an invisible broad box.
  'opening-street-municipal-tree':[{minX:-.15,maxX:.15,minZ:-.15,maxZ:.15}],
};

function contextBounds(p){
  const fallback=PROP_BOUNDS[p.mesh]||PROP_BOUNDS[p.fallbackMesh];
  // Optional packs replace original meshes. Conservative local envelopes are
  // explicit for the few entries absent from generated main-pack bounds.
  const envelope={
    opening_street_frontage:{min:[-2,0,-7.5],max:[8,19,84.5]},
    opening_street_service_history:{min:[-12,0,-36],max:[12,10,66]},
    ellery_west_roofline_closure:{min:[-1.1,8,-7.5],max:[6.5,19,85.6]},
    exterior_stationers_room:{min:[-3.5,-.1,-3.6],max:[3.5,3.6,3.6]},
    district_court_walls:{min:[-5.4,0,-.1],max:[5.4,9.5,16.5]},
    opening_park_laurel:{min:[-1.5,-.1,-1.3],max:[1.5,2.1,1.3]},
  }[p.mesh];
  const b=envelope&&fallback?{min:envelope.min.map((v,k)=>Math.min(v,fallback.min[k])),max:envelope.max.map((v,k)=>Math.max(v,fallback.max[k]))}:
    envelope||fallback||{min:[-5,0,-5],max:[5,6,5]};
  const c=Math.cos(p.yaw),s=Math.sin(p.yaw),xs=[],zs=[];
  for(const x of[b.min[0],b.max[0]])for(const z of[b.min[2],b.max[2]]){
    xs.push(p.across+x*(p.scaleX??1)*(p.scale??1)*c+z*(p.scaleZ??1)*(p.scale??1)*s);
    zs.push(p.along+x*(p.scaleX??1)*(p.scale??1)*s-z*(p.scaleZ??1)*(p.scale??1)*c);
  }
  return {across0:Math.min(...xs),across1:Math.max(...xs),along0:Math.min(...zs),along1:Math.max(...zs)};
}

const context=(id,extra={})=>{
  const p=outskirtsTownPlacement(id,extra);
  return freeze({id:`town-${id}`,...p,collision:contextBodies[id]||'none',context:true,
    lastPass:SOURCE_OUTSKIRTS_TOWN.contextLastPass,bounds:contextBounds(p)});
};
const initial=context('opening-street-frontage',{initialOnly:true});
const roofPose=exteriorToOutskirts(EXTERIOR_ROOFLINE.anchor);
const roof={id:'town-ellery-west-roofline-closure',canonicalId:'ellery-west-roofline-closure',
  mesh:'ellery_west_roofline_closure',...roofPose,initialOnly:true,context:true,collision:'none',
  lastPass:SOURCE_OUTSKIRTS_TOWN.initialLastPass};
const set=freeze([
  ...contextIds.map(id=>context(id)),initial,freeze({...roof,bounds:contextBounds(roof)}),
]);

// Pass-local fixed origins. The runtime selects context groups every four
// physical road rows, translates their anchors by row*34.4, then applies the
// same cumulative frame displacement as camera/light/collision presentation.
// initialOnly entries appear once at the first approach and never tile.
export function outskirtsTownSet(){return set;}
