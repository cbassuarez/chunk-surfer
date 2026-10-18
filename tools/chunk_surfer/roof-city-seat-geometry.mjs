// A real low-backed stone seat in the last east arcade bay. Local +Z is the
// sitter's forward direction: its prop yaw=-PI/2 faces outward to the east.
// The lowered eye remains above the 1.03m back when the player looks behind.
export const ROOF_CITY_SEAT_GEOMETRY=Object.freeze({
  mesh:'academic_roof_city_seat',width:1.92,depth:.90,height:1.04,
  seatTop:.43,backTop:1.03,forward:'+Z',blocks:true,
});

export function buildRoofCitySeatGeometry({mesh,materials,carvedStone,oldBronze,
  addBox,addBeam,addEllipsoid,addCylinder,addQuad}){
  const make=(name,rgb)=>{
    const index=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor:0,roughnessFactor:.96}});
    return index;
  };
  const stone=carvedStone??make('roof city seat worn limestone',[.355,.320,.255]);
  const bronze=oldBronze??stone;
  const m=mesh(ROOF_CITY_SEAT_GEOMETRY.mesh);
  addBox(m,[0,.055,.055],[1.86,.11,.76],stone);
  for(const x of[-.65,.65]){
    addBox(m,[x,.23,.07],[.25,.36,.59],stone);
    addBox(m,[x,.10,.07],[.34,.09,.65],stone);
    addBox(m,[x,.345,.07],[.34,.09,.65],stone);
  }
  for(const[y,w,h,d,z]of[[.34,1.80,.06,.62,.10],[.385,1.90,.05,.68,.10],
    [.4225,1.84,.015,.64,.10]])addBox(m,[0,y,z],[w,h,d],stone);
  addBox(m,[0,.72,-.245],[1.82,.52,.16],stone);
  addBox(m,[0,.99,-.235],[1.90,.08,.20],stone);
  addBox(m,[0,.475,-.245],[1.86,.09,.20],stone);
  for(const x of[-.79,.79]){
    addBox(m,[x,.57,.095],[.17,.31,.57],stone);
    addEllipsoid(m,[x,.71,.08],[.145,.105,.32],stone,6,10);
    addEllipsoid(m,[x,.68,.355],[.12,.105,.075],stone,6,10);
  }
  // Three broad scalloped panels are shallow carving, kept below the back's
  // silhouette so the city and its real light retain the seated foreground.
  for(const x of[-.51,0,.51]){
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI,b=(i+1)/6*Math.PI;
      addBeam(m,[x+Math.cos(a)*.20,.73+Math.sin(a)*.15,-.145],
        [x+Math.cos(b)*.20,.73+Math.sin(b)*.15,-.145],.035,stone);
    }
    addBox(m,[x,.615,-.146],[.32,.025,.025],stone);
  }
  for(const x of[-.66,.66])addBox(m,[x,.917,-.132],[.13,.025,.018],bronze);
  return m;
}
