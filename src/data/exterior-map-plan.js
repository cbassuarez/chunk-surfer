// THE AUTHORED STREET PLAN. The survey used to be traced from collision: the
// walkable raster, Ellery's outline cell by cell and one rectangle per deed,
// which drew holes, jags and stair-stepped angles nobody sees in the street.
// This is the plan a surveyor would draw: clean ground shapes, whole building
// masses, the square. Routing and sight still use the captured cells.
//
// Physical metres; map y is world z.
import {DISTRICT_STREETS,DISTRICT_COURTS,YARD_SERVICE_RANGES,ELLERY_BLOCK} from './exterior-district.js';
import {ELLERY_SQUARE} from './ellery-square.js';
import {EXTERIOR_FOREGROUND} from './exterior-foreground.js';
import {ELLERY_PUBLIC_FRONT} from './ellery-public-front.js';
import {GLASS_COURT} from './glass-court.js';
import {EXTERIOR_NEIGHBOURHOOD} from './exterior-frontages.js';
import {CONSERVATORY_PROPS} from './conservatory-props.js';
import {CHURCH} from './st-brendans.js';
import {EXTERIOR_PUB} from './exterior-pub.js';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const rect=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const ring=(cx,cy,r,n=20)=>Array.from({length:n},(_,i)=>({x:cx+Math.cos(i/n*Math.PI*2)*r,y:cy+Math.sin(i/n*Math.PI*2)*r}));
// An eight-sided basin with flats on the cardinals, like the fountain's kerb.
const octagon=(cx,cy,flat)=>Array.from({length:8},(_,i)=>{const a=(i+.5)/8*Math.PI*2,r=flat/Math.cos(Math.PI/8);return{x:cx+Math.cos(a)*r,y:cy+Math.sin(a)*r};});
const pose=(x,z,yaw)=>{const c=Math.cos(yaw),s=Math.sin(yaw);return p=>({x:x+p.x*c-p.y*s,y:z+p.x*s+p.y*c});};

// A terrace in its own frame: facade on local x=0, back at -depth, deeds
// along local z. That is the same frame every row mesh is built in.
function terrace(id,role,x,z,yaw,{depth,length}){
  return{id,role,points:rect(-depth,-length/2,0,length/2).map(pose(x,z,yaw))};
}
const ROW_DEPTH={district_terrace_frontage:5.4,ellery_square_west_terrace_stationer:5.4,district_passage_frontage:5.4,district_civic_frontage:5.4,district_workshop_frontage:6.8};
// Ellery itself stands on x 50..128 of its block; the yard is the rest.
const ELLERY_X0=50;
const districtPose=p=>({x:p.x-48+(Number(p.renderOffsetX)||0),z:p.y-338+(Number(p.renderOffsetZ)||0),yaw:p.yaw||0});

function ground(){
  const out=[],S=ELLERY_SQUARE,g=S.garden,park=EXTERIOR_FOREGROUND.garden;
  // The yard and the forecourt are paved; streets and courts sit over them.
  out.push({id:'yard',role:'paving',points:rect(-1,ELLERY_BLOCK.y0,ELLERY_X0,ELLERY_BLOCK.y1+1)});
  const f=ELLERY_PUBLIC_FRONT.forecourt;out.push({id:'ellery-forecourt',role:'paving',points:rect(f.x0,f.z0,f.x1,f.z1)});
  for(const s of DISTRICT_STREETS)out.push({id:s.id,role:'street',points:rect(s.x0,s.y0,s.x1+1,s.y1+1)});
  out.push({id:'ellery-square-esplanade',role:'paving',points:rect(S.esplanade.x0,S.esplanade.z0,S.esplanade.x1,S.esplanade.z1)});
  out.push({id:'ellery-square-roads',role:'street',points:rect(S.bounds.x0,S.bounds.z0,S.bounds.x1,S.esplanade.z0)});
  out.push({id:'ellery-square-garden',role:'garden',points:rect(g.x0,g.z0,g.x1,g.z1)});
  out.push({id:'ellery-square-path-x',role:'path',points:rect(g.x0,g.paths.alongX.z0,g.x1,g.paths.alongX.z1)});
  out.push({id:'ellery-square-path-z',role:'path',points:rect(g.paths.alongZ.x0,g.z0,g.paths.alongZ.x1,g.z1)});
  out.push({id:'ellery-square-monument',role:'monument',points:ring(g.monument.x,g.monument.z,1.6)});
  // Ellery's open court: two outdoor courts either side of the glass link.
  for(const c of GLASS_COURT.outdoorCourts)out.push({id:`ellery-court-${c.id}`,role:'paving',points:rect(c.x0,c.z0,c.x1,c.z1)});
  const glass=GLASS_COURT.bounds;out.push({id:'ellery-greenhouse',role:'greenhouse',points:rect(glass.x0,glass.z0,glass.x1,glass.z1)});
  out.push({id:'yard-park',role:'garden',points:rect(park.bounds.x0,park.bounds.z0,park.bounds.x1,park.bounds.z1)});
  for(const p of[park.paths.spine,park.paths.cross])out.push({id:'yard-park-path',role:'path',points:rect(p.x0,p.z0,p.x1,p.z1)});
  // The park fountain: stone kerb, then the water it rasterises as.
  const fountain=park.fountain;
  out.push({id:'yard-park-fountain',role:'fountain',points:octagon(fountain.x,fountain.z,3.3)});
  out.push({id:'yard-park-fountain-water',role:'water',points:octagon(fountain.x,fountain.z,2.85)});
  return out;
}
function buildings(){
  const out=[];
  for(const p of CONSERVATORY_PROPS){
    const depth=ROW_DEPTH[p.mesh]??ROW_DEPTH[p.fallbackMesh];
    if(!depth||!/^district-(?:west|east|north|south)-row-[a-z]$/.test(p.id))continue;
    const at=districtPose(p);out.push(terrace(p.id,'frontage',at.x,at.z,at.yaw,{depth,length:64}));
  }
  for(const t of ELLERY_SQUARE.terraces){
    const row=EXTERIOR_NEIGHBOURHOOD.rows.find(r=>r.mesh===t.mesh);
    out.push(terrace(t.id,'square',t.x,t.z,t.yaw,{depth:row.depth,length:t.deeds*EXTERIOR_NEIGHBOURHOOD.deedWidth}));
  }
  for(const r of YARD_SERVICE_RANGES){
    const pub=r.id===EXTERIOR_PUB.building?.id;
    out.push({id:r.id,role:pub?'pub':'outbuilding',points:rect(r.physical.x-r.w/2,r.physical.y-r.d/2,r.physical.x+r.w/2,r.physical.y+r.d/2)});
  }
  for(const room of CHURCH.rooms)out.push({id:`church:${room.id}`,role:'church',points:rect(room.x0,room.y0,room.x1+1,room.y1+1)});
  return out;
}
// Only edges no neighbouring building shares are inked, so a terrace or the
// church's cruciform reads as one mass.
function outline(shapes){
  const round=v=>Math.round(v*1000)/1000+0,key=(a,b)=>[`${round(a.x)},${round(a.y)}`,`${round(b.x)},${round(b.y)}`].sort().join('|');
  const sides=shapes.flatMap(s=>s.points.map((a,i)=>[a,s.points[(i+1)%s.points.length]])),count=new Map();
  for(const[a,b]of sides)count.set(key(a,b),(count.get(key(a,b))||0)+1);
  return sides.filter(([a,b])=>count.get(key(a,b))===1);
}
// Ellery is the plan's centre: one mass with its open court and greenhouse
// cut out of it, so the glass link shows between the two courts.
const COURT=GLASS_COURT.outdoorCourts.reduce((a,c)=>({x0:Math.min(a.x0,c.x0),x1:Math.max(a.x1,c.x1),z0:Math.min(a.z0,c.z0),z1:Math.max(a.z1,c.z1)}),{x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity});
const ELLERY={id:'ellery',role:'institution',
  points:rect(ELLERY_X0,ELLERY_BLOCK.y0,ELLERY_BLOCK.x1,ELLERY_BLOCK.y1),
  holes:[rect(COURT.x0,COURT.z0,COURT.x1,COURT.z1)]};
const BUILDINGS=buildings();
export const EXTERIOR_MAP_PLAN=freeze({
  version:1,
  ground:ground(),
  // Courts are drawn over the rows so a passage mouth reads as a way through.
  courts:DISTRICT_COURTS.map(c=>({id:c.id,role:'street',points:rect(c.x0,c.y0,c.x1+1,c.y1+1)})),
  buildings:BUILDINGS,
  edges:outline(BUILDINGS),
  ellery:{...ELLERY,edges:[ELLERY.points,...ELLERY.holes].flatMap(r=>r.map((a,i)=>[a,r[(i+1)%r.length]]))},
  labels:[
    {text:'ELLERY SQUARE',x:ELLERY_SQUARE.axisX,y:-43,size:'place'},
    {text:'NORTH STREET',x:20,y:-7.5,size:'street'},
    {text:'WEST STREET',x:-7.5,y:56,size:'street',vertical:true},
    {text:'EAST STREET',x:135.5,y:56,size:'street',vertical:true},
    {text:'CHAPEL STREET',x:40,y:99.5,size:'street'},
    {text:'ELLERY',x:96,y:56,size:'place'},
  ],
});
