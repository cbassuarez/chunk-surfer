// ELLERY SQUARE. The block's address: a railed garden opposite Ellery's public
// front, so the building faces a place instead of the backs of a terrace across
// a thirteen-metre street. North Street stays where it is; the square opens
// north of it, and the old north rows that stood here are gone.
//
// Physical metres, +x east, +z south. The square is centred on the public
// front's axis (x 86) and its west edge lines up with Ellery's west face.
import {F,ZONE,MATERIAL} from './floorplan/legend.js';
import {streetCrossingFloorAt} from './street-crossings.js';
import {STREET_PARKING_BAYS} from './exterior-street-fabric.js';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export const ELLERY_SQUARE=freeze({
  id:'ellery-square',name:'Ellery Square',axisX:86,
  bounds:{x0:50,x1:122,z0:-60,z1:-14},
  // The south promenade overlooks the garden and faces Ellery across North
  // Street. It is pedestrian paving, joined to the North Street footway along
  // its whole length, so there is no single door into the square.
  esplanade:{x0:50,x1:122,z0:-22,z1:-14},
  // Park Square's section: three metres of flags along the houses, a five-metre
  // one-way road, two metres of flags along the railings. The garden gave up
  // two metres on three sides for the railing-side pavement.
  garden:{x0:60,x1:112,z0:-50,z1:-22,
    // Gates on both axes, each four metres between stone piers.
    // Every railing run is a whole number of 2m panels: prop collision does
    // not follow a scaled panel, so a cut panel would close its gate.
    gates:{south:{from:84,to:88},north:{from:84,to:88},west:{from:-38,to:-34},east:{from:-38,to:-34}},
    paths:{alongX:{z0:-38,z1:-34},alongZ:{x0:84,x1:88},perimeter:1.5},
    monument:{x:86,z:-36,radius:3.4}},
  roads:{west:{x0:50,x1:58},east:{x0:114,x1:122},north:{z0:-60,z1:-52}},
  // Carriageway glyphs inside the road bands; everything else in a band is
  // pavement. The railing-side pavement is the two-metre ring round the garden.
  carriageway:{x0:53,x1:119,z0:-57},
  railingPavement:{x0:58,x1:114,z0:-52,z1:-22},
  // Three stucco terraces frame the square on one cornice line. Facades sit on
  // the road edges; the side terraces meet the North Street rows' backs.
  terraces:[
    {id:'ellery-square-north',mesh:'ellery_square_north_terrace',x:86,z:-60,yaw:Math.PI/2,deeds:10},
    // Deed 1 is the stationers (exterior-stationers.js): when its pack is
    // loaded the terrace draws the variant with that deed's ground floor cut.
    {id:'ellery-square-west',mesh:'ellery_square_west_terrace',variantMesh:'ellery_square_west_terrace_stationer',x:50,z:-40.45,yaw:0,deeds:5},
    {id:'ellery-square-east',mesh:'ellery_square_side_terrace',x:122,z:-40.45,yaw:Math.PI,deeds:5},
  ],
  // North row c used to run through the square's east road. It now starts at
  // the square's north-east corner and keeps its own shops.
  northRowC:{x:154,z:-14},
  // Logical addresses beyond every existing level, so no save address moves.
  // Ten metres spare to the west, for the stationers behind the west terrace.
  logicalOrigin:{x:10,y:520},
});
const S=ELLERY_SQUARE;
export const squareLogicalAt=(x,z)=>({x:S.logicalOrigin.x+(x-S.bounds.x0),y:S.logicalOrigin.y+(z-S.bounds.z0)});
const inside=(r,x,z)=>x>=r.x0&&x<r.x1&&z>=r.z0&&z<r.z1;

// One glyph per square metre: carriageway 'e', paving 'p', lawn 'g'.
export function ellerySquareGlyphAt(x,z){
  if(!inside(S.bounds,x,z))return' ';
  if(inside(S.esplanade,x,z))return'p';
  const g=S.garden;
  if(!inside(g,x,z)){
    if(inside(S.railingPavement,x,z))return'p';
    const c=S.carriageway;
    return x<c.x0||x>=c.x1||z<c.z0?'p':'e';
  }
  const p=g.paths,edge=Math.min(x-g.x0,g.x1-1-x,z-g.z0,g.z1-1-z);
  if(edge<p.perimeter)return'p';
  if(z>=p.alongX.z0&&z<p.alongX.z1)return'p';
  if(x>=p.alongZ.x0&&x<p.alongZ.x1)return'p';
  if(Math.hypot(x+.5-g.monument.x,z+.5-g.monument.z)<g.monument.radius+1.5)return'p';
  return'g';
}
// True anywhere on the square's own ground: road, paving or lawn.
export const ellerySquareGroundAt=(x,z)=>ellerySquareGlyphAt(Math.floor(x),Math.floor(z))!==' ';
export function buildEllerySquareRows(){
  const rows=[];
  for(let z=S.bounds.z0;z<S.bounds.z1;z++){
    let row='';for(let x=S.bounds.x0;x<S.bounds.x1;x++)row+=ellerySquareGlyphAt(x,z);rows.push(row);
  }
  return rows;
}
const GLYPH_MATERIAL={e:MATERIAL.wetTarmac,p:MATERIAL.wetPaving,g:MATERIAL.wetGrass};
export const ELLERY_SQUARE_LEVEL=freeze({
  id:'ellery_square',replace:true,physicalReplace:true,layer:'ground',space:'exterior_civic_block',renderGroup:'ground',
  origin:{...S.logicalOrigin},physicalOrigin:{x:S.bounds.x0,y:S.bounds.z0},base:0,
  rows:buildEllerySquareRows(),
  profile:(x,y,cell)=>{
    const px=S.bounds.x0+x,pz=S.bounds.z0+y,glyph=ellerySquareGlyphAt(px,pz);
    const drop=glyph==='p'&&!inside(S.garden,px,pz)?streetCrossingFloorAt(px+.25,pz+.25):null;
    return{zone:ZONE.civicCourt,ceil:16,material:GLYPH_MATERIAL[glyph]??cell.material,flags:(cell.flags|F.SKY|F.WALLED),...(drop===null?{}:{floor:drop})};
  },
});

// Garden furniture is the park's own finished stock: its trees, benches and
// lamp columns. Only the railings, gate piers and monument are new.
const P=(id,mesh,x,z,yaw=0,extra={})=>freeze({id,mesh,...squareLogicalAt(x,z),yaw,scale:1,interactive:false,structural:true,blocks:false,renderGroups:['ground'],...extra});
function railings(){
  const g=S.garden,out=[],unit=2;
  const run=(side,from,to,place)=>{
    if(Math.abs((to-from)/unit-Math.round((to-from)/unit))>1e-6)throw Error(`Ellery Square ${side} railing run is not whole panels`);
    for(let a=from;a<to-1e-6;a+=unit)out.push(place(`${side}-${Math.round(a*10)}`,a+unit/2));
  };
  const horizontal=(side,z,gate)=>{for(const[a,b]of[[g.x0,gate.from],[gate.to,g.x1]])run(side,a,b,(id,c)=>P(`ellery-square-railing-${id}`,'ellery_square_railing',c,z,0,{blocks:true}));};
  const vertical=(side,x,gate)=>{for(const[a,b]of[[g.z0,gate.from],[gate.to,g.z1]])run(side,a,b,(id,c)=>P(`ellery-square-railing-${id}`,'ellery_square_railing',x,c,Math.PI/2,{blocks:true}));};
  horizontal('south',g.z1,g.gates.south);horizontal('north',g.z0,g.gates.north);
  vertical('west',g.x0,g.gates.west);vertical('east',g.x1,g.gates.east);
  for(const[side,gate]of Object.entries(g.gates))for(const at of[gate.from,gate.to]){
    const[x,z]=side==='south'?[at,g.z1]:side==='north'?[at,g.z0]:side==='west'?[g.x0,at]:[g.x1,at];
    out.push(P(`ellery-square-gate-pier-${side}-${at}`,'ellery_square_gate_pier',x,z,0,{blocks:true}));
  }
  // Corner piers close the diagonal where two runs meet.
  for(const[x,z]of[[g.x0,g.z0],[g.x1,g.z0],[g.x0,g.z1],[g.x1,g.z1]])out.push(P(`ellery-square-corner-pier-${x}-${z}`,'ellery_square_gate_pier',x,z,0,{blocks:true}));
  return out;
}
const TREES=['opening_street_tree_small','opening_street_tree_small_b','opening_street_tree_small_c'];
export const ELLERY_SQUARE_PROPS=freeze([
  ...S.terraces.map(t=>P(t.id,t.variantMesh||t.mesh,t.x,t.z,t.yaw,t.variantMesh?{fallbackMesh:t.mesh}:{})),
  ...railings(),
  P('ellery-square-monument','ellery_square_monument',S.garden.monument.x,S.garden.monument.z,0,{blocks:true}),
  // Two trees to each lawn quarter, set back from every path.
  ...[[65,-47],[77,-45],[65,-29],[77,-26],[95,-45],[107,-47],[95,-26],[107,-29]].map(([x,z],i)=>
    P(`ellery-square-tree-${i}`,TREES[i%3],x,z,i*.83,{scale:1.15+(i%3)*.08})),
  // Benches face the monument from the four paths, and Ellery from the esplanade.
  ...[[80,-36,Math.PI/2],[92,-36,-Math.PI/2],[86,-43,0],[86,-29,Math.PI]].map(([x,z,yaw],i)=>
    P(`ellery-square-bench-${i}`,'district_bench',x,z,yaw)),
  ...[60,72,100,112].map((x,i)=>P(`ellery-square-esplanade-bench-${i}`,'district_bench',x,-21.2,Math.PI)),
  ...[[58,-14.6],[74,-14.6],[98,-14.6],[114,-14.6],[83.4,-22.6],[88.6,-22.6],[83.4,-50.35],[88.6,-50.35]].map(([x,z],i)=>
    P(`ellery-square-lamp-${i}`,'yard_lamp_column',x,z,Math.PI,{blocks:true})),
  // Cars park in bays along the railings, 200 mm off the kerb, leaving the
  // one-way road three metres. Bollards close each road where it meets the
  // esplanade; the esplanade is for people.
  ...STREET_PARKING_BAYS.filter(bay=>bay.page==='square').map(bay=>
    P(bay.id,'city_parked_car',bay.x,bay.z,bay.yaw,{blocks:true})),
  ...[55.25,116.25].map((x,i)=>P(`ellery-square-road-end-bollards-${i}`,'district_bollard_row',x,-21.7,0,{blocks:true})),
  // Against the railing, within 275 mm of it, beside the north gate's lamp.
  P('ellery-square-litter-bin','district_litter_bin',80.5,-50.4,0,{blocks:true}),
]);
export const ELLERY_SQUARE_MESHES=freeze({
  ellery_square_north_terrace:{w:5.8,d:80,h:16,blocks:false},
  ellery_square_side_terrace:{w:5.8,d:40,h:16,blocks:false},
  ellery_square_west_terrace:{w:5.8,d:40,h:16,blocks:false},
  ellery_square_railing:{w:2,d:.14,h:1.3,blocks:true},
  ellery_square_gate_pier:{w:.6,d:.6,h:1.9,blocks:true},
  ellery_square_monument:{w:2.6,d:2.6,h:5.2,blocks:true},
});
