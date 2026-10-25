// One civic boundary owns the arrival court. All distances are real yard
// metres: the opening, visible construction and individual collision bodies
// share these records rather than a box across the entire gate.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const origin={x:27.5,z:7.5};
export const ARRIVAL_COURT=freeze({
  origin,logicalOrigin:{x:77.5,y:207.5},opening:{z0:5.2,z1:9.8,width:4.6},
  meshes:{boundary:'arrival_civic_boundary',bench:'arrival_civic_bench'},
  plinth:{height:.40,width:.30,copeTop:.49,copeWidth:.43},
  iron:{bottom:.64,top:1.99,barWidth:.036,frameWidth:.055,postWidth:.09,postTop:2.18},
  runs:[
    {id:'gate-north',axis:'z',fixed:27.5,from:1.5,to:4.5,panels:1,trimFrom:.30,trimTo:.02},
    {id:'gate-south',axis:'z',fixed:27.5,from:10.5,to:22,panels:3,trimFrom:.02,trimTo:.30},
    {id:'north-return',axis:'x',fixed:1.5,from:27.5,to:45,panels:5,trimFrom:.30,trimTo:.30},
  ],
  piers:[
    {id:'gate-north',x:27.5,z:4.85,depth:.62,width:.70,height:2.70,gate:true},
    {id:'gate-south',x:27.5,z:10.15,depth:.62,width:.70,height:2.70,gate:true},
    {id:'north-corner',x:27.5,z:1.5,depth:.58,width:.58,height:1.97},
    {id:'north-return-end',x:45,z:1.5,depth:.58,width:.58,height:1.97},
    {id:'south-end',x:27.5,z:22,depth:.58,width:.58,height:1.97},
  ],
  foldedLeaves:[{id:'north',x:27.03,z0:2.85,z1:5.15},{id:'south',x:27.03,z0:9.85,z1:12.15}],
  benches:[
    {id:'opening-street-park-bench-west',x:16.5,z:1.5,yaw:Math.PI/2,faces:'east'},
    {id:'opening-street-park-bench-east',x:21.5,z:1.5,yaw:-Math.PI/2,faces:'west'},
  ],
  bench:{width:2.02,depth:.78,height:1.06,seatHeight:.46,padWidth:2.24,padDepth:.94},
  planting:{laurel:{x:13.75,z:1.25},tree:{x:24,z:1}},
  protected:{drive:{x0:19.75,x1:46,z0:5.4,z1:9.6},window:{x0:25.7,x1:26.65,z0:13,z1:15.5},parkPath:{x0:18,x1:20,z0:0,z1:3}},
  maximumTriangles:16000,
});
export const ARRIVAL_COURT_MESHES=freeze({
  arrival_civic_boundary:{w:18.6,d:21.8,h:3.20,blocks:false},
  arrival_civic_bench:{w:2.24,d:.94,h:1.06,blocks:false},
});
const collider=(id,x,z,width,depth,yaw=0,maxHeight=2.4)=>({
  id:`arrival-court:${id}`,kind:'obb',x:50+x,y:200+z,width:width+.4,depth:depth+.4,yaw,
  minElevation:-.04,maxElevation:maxHeight,spaceId:'loading_bay',bodyMargin:.20,
  physical:{x,z,width,depth},
});
export const ARRIVAL_COURT_COLLIDERS=freeze([
  ...ARRIVAL_COURT.runs.map(r=>collider(r.id,r.axis==='x'?(r.from+r.to)/2:r.fixed,r.axis==='z'?(r.from+r.to)/2:r.fixed,
    r.axis==='x'?r.to-r.from:ARRIVAL_COURT.plinth.copeWidth,r.axis==='z'?r.to-r.from:ARRIVAL_COURT.plinth.copeWidth)),
  ...ARRIVAL_COURT.piers.map(p=>collider(`pier-${p.id}`,p.x,p.z,p.depth+.08,p.width,0,p.height+.50)),
  ...ARRIVAL_COURT.foldedLeaves.map(p=>collider(`open-leaf-${p.id}`,p.x,(p.z0+p.z1)/2,.10,p.z1-p.z0,0,2.12)),
  ...ARRIVAL_COURT.benches.map(p=>collider(`bench-${p.id}`,p.x,p.z,ARRIVAL_COURT.bench.width,ARRIVAL_COURT.bench.depth,p.yaw,1.12)),
]);
