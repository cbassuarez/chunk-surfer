// Shared render/runtime contract for The Lyric. Coordinates are explicitly
// row metres; the prop mesh is recentred only when its vertices are emitted.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const F=(id,kind,x0,x1,z0,z1,height,extra={})=>({id,kind,bounds:{x0,x1,z0,z1},height,...extra});
const furniture=[
  F('pub-snug-back-banquette','banquette',-5.28,-4.60,-31.25,-26.65,1.30,{x:-4.94,z:-28.95,length:4.60,yaw:0}),
  F('pub-snug-return-banquette','banquette',-5.225,-3.175,-26.64,-25.96,1.30,{x:-4.20,z:-26.30,length:2.05,yaw:-Math.PI/2}),
  ...[-30.20,-28.80,-27.40].flatMap((z,i)=>[
    F(`pub-snug-table-${i}`,'table',-4.47,-3.49,z-.48,z+.48,.80,{x:-3.98,z}),
    F(`pub-snug-chair-${i}`,'chair',-3.40,-2.76,z-.32,z+.32,1.14,{x:-3.08,z}),
  ]),
  F('pub-counter','counter',-4.06,-3.02,-24.80,-18.35,1.56,{x:-3.69,z:-21.575,length:6.45}),
  F('pub-backbar','backbar',-5.28,-4.95,-24.90,-18.30,2.72,{x:-5.12,z:-21.60,length:6.60}),
  ...[-23.40,-21.35,-19.30].map((z,i)=>F(`pub-bar-stool-${i}`,'stool',-2.99,-2.41,z-.29,z+.29,.84,{x:-2.70,z})),
  F('pub-snug-stove','stove',-4.40,-3.10,-31.96,-31.04,2.22,{x:-3.75,z:-31.50}),
  F('pub-wc-toilet','toilet',-5.16,-4.27,-17.27,-16.63,.98,{x:-4.60,z:-16.95}),
  F('pub-wc-basin','basin',-4.45,-3.85,-17.99,-17.47,1.07,{x:-4.15,z:-17.72}),
];
export const PUB_INTERIOR_LAYOUT=freeze({
  mesh:'exterior_pub_interior',coordinateSpace:'district-civic-row-metres',
  meshOriginInRow:{x:-2.70,y:0,z:-24},
  worldTransform:{anchorX:-6,anchorZ:109.75,yaw:-Math.PI/2,floorWorldY:.12},
  floorLocalY:0,ceilingLocalY:3.4,bounds:{x0:-5.4,x1:0,z0:-32,z1:-16},
  publicAisle:{x0:-2,x1:-.5,z0:-31.7,z1:-16.3,clearWidth:1.5},
  doorway:{x:-.20,z:-30.75,width:1.95,clear:{x0:-2,x1:.49,z0:-31.725,z1:-29.775}},
  doorways:[
    {x:-.20,z:-30.75,width:1.95,clear:{x0:-2,x1:.49,z0:-31.725,z1:-29.775}},
    {x:-.20,z:-22.75,width:1.95,clear:{x0:-2,x1:.49,z0:-23.725,z1:-21.775}},
  ],
  staffAisle:{x0:-4.95,x1:-4.06,z0:-24.8,z1:-18.35,clearWidth:.89},
  staffReturn:{x0:-4.95,x1:-2,z0:-25.90,z1:-24.90},
  wc:{bounds:{x0:-5.25,x1:-2.70,z0:-18,z1:-16.30},wallThickness:.12,
    doorway:{x:-2.70,z:-17.25,width:1,openingHeight:3.4,leafHeight:2.15,hinge:'right',swing:'room-in'},
    wallOwner:'pub interior mesh; matching collision and standard dynamic door are floorplan-owned'},
  minimumPendantY:2.5,maximumTriangles:12000,maximumAddedMaterials:4,
  floorFinish:{topY:.012,parquetPanelM:.92,parquetBoardM:.23,jointM:.008},
  furniture,
  pendants:[{id:'pub-entry-pendant',x:-1.25,z:-30.3},{id:'pub-snug-pendant',x:-3.80,z:-28.70},{id:'pub-bar-pendant',x:-2.85,z:-20.70}],
  lightAnchors:[
    {id:'pub-entry-light',x:-1.25,y:2.64,z:-30.3,radius:4.2,intensity:.95,color:[1,.68,.35]},
    {id:'pub-snug-light',x:-3.80,y:2.64,z:-28.70,radius:4.1,intensity:1.0,color:[1,.66,.32]},
    {id:'pub-bar-light',x:-2.85,y:2.64,z:-20.70,radius:5.0,intensity:1.05,color:[1,.70,.39]},
    {id:'pub-wc-light',x:-3.80,y:2.98,z:-16.70,radius:2.4,intensity:.75,color:[1,.83,.61]},
  ],
});
export const PUB_LIGHT_ANCHORS=PUB_INTERIOR_LAYOUT.lightAnchors;
// All footprints and vertical extents are in un-recentred district row metres.
// WC walls and the dynamic WC door belong to exterior-pub.js, not furniture.
export const PUB_FURNITURE_COLLIDERS=freeze(furniture.map(f=>({
  id:f.id,kind:'aabb',min:[f.bounds.x0,0,f.bounds.z0],max:[f.bounds.x1,f.height,f.bounds.z1],
})));
