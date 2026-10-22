// Ordinary Lyric only. Row coordinates match exterior-pub-furnishings; the
// Source memory keeps the original interior and its own cold light treatment.
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const PUB_HOSPITALITY_MESH='pub_warm_interior';
export const PUB_HOSPITALITY_ASSET='assets/pub-hospitality.glb';
export const PUB_HOSPITALITY_LIGHTS=freeze([
  {id:'pub-entry-light',x:-1.25,y:2.57,z:-30.3,radius:3.8,intensity:1.05,color:[1,.74,.48]},
  {id:'pub-snug-light',x:-3.80,y:2.57,z:-28.70,radius:3.8,intensity:1.10,color:[1,.71,.43]},
  {id:'pub-bar-light',x:-2.85,y:2.57,z:-20.70,radius:4.2,intensity:1.15,color:[1,.75,.49],castsShadow:true},
  {id:'pub-wc-light',x:-3.80,y:2.98,z:-16.70,radius:2.4,intensity:1.05,color:[1,.83,.61]},
  {id:'pub-hearth-light',x:-3.75,y:.52,z:-31.15,radius:2.45,intensity:.90,color:[1,.43,.14],penetration:.18},
  {id:'pub-table-lamp-0',x:-4.02,y:1.105,z:-30.06,radius:2.8,intensity:1.12,color:[1,.71,.43],penetration:.20},
  {id:'pub-table-lamp-2',x:-4.02,y:1.105,z:-27.26,radius:2.8,intensity:1.12,color:[1,.71,.43],penetration:.20},
  {id:'pub-counter-lamp',x:-3.58,y:1.455,z:-20.00,radius:3.3,intensity:1.25,color:[1,.75,.49],penetration:.20},
  {id:'pub-window-sconce-west',x:-.52,y:1.90,z:-27.45,radius:4.7,intensity:1.50,color:[1,.75,.48],penetration:.12},
  {id:'pub-window-sconce-east',x:-.52,y:1.90,z:-19.45,radius:4.7,intensity:1.50,color:[1,.75,.48],penetration:.12},
]);
export const PUB_HOSPITALITY_SCONCES=freeze([
  {id:'pub-window-sconce-west',x:-.36,y:1.90,z:-27.45},
  {id:'pub-window-sconce-east',x:-.36,y:1.90,z:-19.45},
]);
export const PUB_HOSPITALITY_DRESSING=freeze([
  {id:'table-0-lamp',kind:'lamp',support:'pub-snug-table-0',x:-4.02,z:-30.06,y:.790,radius:.090,height:.39},
  {id:'table-2-lamp',kind:'lamp',support:'pub-snug-table-2',x:-4.02,z:-27.26,y:.790,radius:.090,height:.39},
  {id:'counter-lamp',kind:'lamp',support:'pub-counter',x:-3.58,z:-20.00,y:1.140,radius:.090,height:.39},
  {id:'table-0-bread',kind:'bread',support:'pub-snug-table-0',x:-4.03,z:-30.40,y:.790,radius:.145,height:.075},
  {id:'table-1-pie',kind:'pie',support:'pub-snug-table-1',x:-4.02,z:-28.86,y:.790,radius:.155,height:.080},
  {id:'table-1-used-plate',kind:'plate',support:'pub-snug-table-1',x:-3.77,z:-28.66,y:.790,radius:.115,height:.018},
  {id:'table-2-mug',kind:'mug',support:'pub-snug-table-2',x:-3.80,z:-27.53,y:.790,radius:.065,height:.112},
  {id:'table-0-mug',kind:'mug',support:'pub-snug-table-0',x:-3.76,z:-30.10,y:.790,radius:.065,height:.112},
  {id:'counter-cloth',kind:'cloth',support:'pub-counter',x:-3.47,z:-23.72,y:1.140,radius:.125,height:.012},
  {id:'counter-mug',kind:'mug',support:'pub-counter',x:-3.49,z:-19.52,y:1.140,radius:.065,height:.112},
]);
export const PUB_HOSPITALITY=freeze({mesh:PUB_HOSPITALITY_MESH,asset:PUB_HOSPITALITY_ASSET,
  coordinateSpace:'district-civic-row-metres',meshOriginInRow:{x:-2.70,y:0,z:-24},
  baseMesh:'exterior_pub_interior',sourceAsset:'public/assets/conservatory-props.glb',
  maximumAddedTriangles:4500,maximumBytes:2300000,lights:PUB_HOSPITALITY_LIGHTS,dressing:PUB_HOSPITALITY_DRESSING,sconces:PUB_HOSPITALITY_SCONCES});
