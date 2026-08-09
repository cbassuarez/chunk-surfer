// THE CITY ELLERY BELONGS TO.
//
// This is the single authored contract for the opening exterior: the building's
// accumulated massing, the walkable perimeter, the ordinary buildings opposite
// it, and the small amount of life still moving at 21:38.  Geometry generation,
// the floorplan and deterministic tests all consume this file; dates and roof
// heights must not be re-invented in those consumers.

const freeze = (value) => Object.freeze(value);

export const ELLERY_LINEAGE = freeze([
  freeze({ year:1888, id:'school', name:'Ellery Municipal School of Music', material:'red-brick', identity:'sandstone bands, domestic gables and tall sash windows' }),
  freeze({ year:1908, id:'chapel', name:'Ellery Collegiate Chapel', material:'chapel-stone', identity:'Gothic stone, a bell tower and the principal civic entrance' }),
  freeze({ year:1912, id:'baths', name:'Ellery Municipal Baths', material:'glazed-brick', identity:'arched windows, roof lanterns and later steel repairs' }),
  freeze({ year:1936, id:'hall', name:'Ellery Concert Hall', material:'dark-brick', identity:'a fly tower withdrawn behind low foyer and backstage ranges' }),
  freeze({ year:1967, id:'academic', name:'Practice and Academic Wing', material:'brick-concrete', identity:'modular teaching rooms and enclosed links grafted onto the old work' }),
  freeze({ year:1986, id:'service', name:'Loading and Plant Works', material:'painted-steel', identity:'the grey door, dock canopy, ducts and expedient service construction' }),
  freeze({ year:2026, id:'closure', name:'Closure and Demolition', material:'patched', identity:'blocked openings, survey paint, party-wall scars and incomplete clearance' }),
]);

// World metres along the west elevation.  These values also author the WALLED
// yard cells beside it, so a mesh can never disagree with the ray-marched top
// edge again.
export const ELLERY_MASSING = freeze([
  freeze({ id:'service', year:1986, y0:0,  y1:12, height:8.6,  foreground:6.4 }),
  freeze({ id:'academic',year:1967, y0:12, y1:30, height:13.8, foreground:8.6 }),
  freeze({ id:'hall',    year:1936, y0:30, y1:52, height:17.6, foreground:8.4, setback:13.0 }),
  freeze({ id:'school',  year:1888, y0:52, y1:72, height:10.8, foreground:9.2 }),
  freeze({ id:'baths',   year:1912, y0:72, y1:93, height:9.6,  foreground:8.2 }),
]);

export function elleryMassingAt(worldY) {
  const y=Number(worldY)||0;
  return ELLERY_MASSING.find((band)=>y>=band.y0&&y<band.y1)||ELLERY_MASSING.at(-1);
}

// The existing building occupies physical x 50..128, z 0..92; its service yard
// occupies x 0..49 over the same depth.  The perimeter is a fourteen-metre
// street ring around that complete block.  Opposite lots are deliberately deep
// enough to hold real buildings rather than facade cards.
export const DISTRICT_BOUNDS = freeze({ x0:-48, x1:178, y0:-38, y1:138 });
export const ELLERY_BLOCK = freeze({ x0:0, x1:128, y0:0, y1:92 });
export const DISTRICT_STREETS = freeze([
  freeze({ id:'west-street',  axis:'vertical',   x0:-14,x1:-1, y0:-14,y1:106 }),
  freeze({ id:'east-street',  axis:'vertical',   x0:129,x1:142,y0:-14,y1:106 }),
  freeze({ id:'north-street', axis:'horizontal', x0:-14,x1:142,y0:-14,y1:-1 }),
  freeze({ id:'south-street', axis:'horizontal', x0:-14,x1:142,y0:93,y1:106 }),
]);

// Short, believable penetrations into the surrounding urban grain. They stop
// at occupied thresholds rather than offering fake interiors, but each gives a
// different corner somewhere to go besides around the ring.
export const DISTRICT_COURTS = freeze([
  freeze({id:'west-mews-court',axis:'horizontal',x0:-30,x1:-15,y0:20,y1:28,kind:'court'}),
  freeze({id:'north-borough-passage',axis:'vertical',x0:74,x1:82,y0:-28,y1:-15,kind:'court'}),
  freeze({id:'east-workshop-court',axis:'horizontal',x0:143,x1:163,y0:12,y1:20,kind:'court'}),
  freeze({id:'south-pub-yard',axis:'vertical',x0:82,x1:90,y0:107,y1:123,kind:'court'}),
]);
const DISTRICT_ROUTES=freeze([...DISTRICT_STREETS,...DISTRICT_COURTS]);

export const EXTERIOR_LOTS = freeze([
  freeze({id:'north-terraces-west',side:'north',use:'terraces-over-shops',era:1888,height:11.2,roof:'pitched',occupied:true,from:-42,to:18}),
  freeze({id:'north-borough-office',side:'north',use:'former-borough-offices',era:1908,height:15.1,roof:'pitched',occupied:true,from:18,to:78}),
  freeze({id:'north-terraces-east',side:'north',use:'terraces-and-corner-shop',era:1912,height:12.4,roof:'pitched',occupied:true,from:78,to:170}),
  freeze({id:'south-pub-row',side:'south',use:'corner-pub-and-flats',era:1888,height:12.6,roof:'pitched',occupied:true,from:-42,to:28}),
  freeze({id:'south-library-row',side:'south',use:'former-library-and-houses',era:1908,height:14.2,roof:'pitched',occupied:true,from:28,to:98}),
  freeze({id:'south-workshops',side:'south',use:'joiners-and-garages',era:1936,height:8.8,roof:'sawtooth',occupied:true,from:98,to:170}),
  freeze({id:'west-residential',side:'west',use:'terraces-and-late-shop',era:1888,height:11.8,roof:'pitched',occupied:true,from:-30,to:48}),
  freeze({id:'west-mews',side:'west',use:'mews-workshops',era:1912,height:8.6,roof:'pitched',occupied:true,from:48,to:132}),
  freeze({id:'east-housing',side:'east',use:'council-flats-and-garages',era:1967,height:15.8,roof:'flat',occupied:true,from:-30,to:52}),
  freeze({id:'east-rail-arches',side:'east',use:'railway-arches-and-workrooms',era:1936,height:9.4,roof:'vaulted',occupied:true,from:52,to:132}),
]);

export const EXTERIOR_AMBIENT_NODES = freeze([
  freeze({id:'late-bus',mesh:'ambient_late_bus',kind:'vehicle',route:'north',period:46,phase:.08,from:{x:-34,z:-7},to:{x:126,z:-7}}),
  freeze({id:'north-night-car',mesh:'city_parked_car',kind:'vehicle',route:'north',period:38,phase:.44,from:{x:130,z:-10},to:{x:-38,z:-10}}),
  freeze({id:'south-night-car',mesh:'city_parked_car',kind:'vehicle',route:'south',period:43,phase:.72,from:{x:-32,z:98},to:{x:124,z:98}}),
  freeze({id:'west-night-car',mesh:'city_parked_car',kind:'vehicle',route:'west',period:35,phase:.25,from:{x:-8,z:-8},to:{x:-8,z:101}}),
  freeze({id:'cyclist',mesh:'ambient_cyclist',route:'south',period:31,from:{x:118,z:99},to:{x:-28,z:99}}),
  freeze({id:'dog-walker',mesh:'ambient_dog_walker',route:'west',period:58,from:{x:-4,z:88},to:{x:-4,z:8}}),
]);

export const EXTERIOR_INSPECTABLES = freeze([
  freeze({id:'exterior-foundation-stone',physical:{x:67,y:-1},label:'the foundation stone',text:'ELLERY MUNICIPAL SCHOOL OF MUSIC · OPENED 1888. The older name is cut deeper than the current one.'}),
  freeze({id:'exterior-chapel-plaque',physical:{x:103,y:93},label:'the chapel plaque',text:'ELLERY COLLEGIATE CHAPEL · 1908. The tower came after the school and has spent a century pretending otherwise.'}),
  freeze({id:'exterior-baths-mosaic',physical:{x:129,y:77},label:'the baths mosaic',text:'MUNICIPAL BATHS · 1912. Blue tesserae survive under the paint. The pool was public before it belonged to the conservatoire.'}),
  freeze({id:'exterior-hall-stone',physical:{x:129,y:34},label:'the hall dedication',text:'CONCERT HALL · 1936. The fly tower is eight metres behind this low range, where a stage tower belongs.'}),
]);

export const YARD_SERVICE_RANGES = freeze([
  freeze({id:'yard-former-stables',physical:{x:36,y:18},w:12,d:8,height:7.4,year:1888,use:'former stables and caretaker store'}),
  freeze({id:'yard-rehearsal-annex',physical:{x:39,y:34},w:14,d:10,height:8.8,year:1912,use:'former rehearsal annex'}),
  freeze({id:'yard-baths-plant',physical:{x:39,y:55},w:13,d:12,height:7.2,year:1936,use:'baths plant and laundry'}),
  freeze({id:'yard-covered-stores',physical:{x:40,y:77},w:12,d:13,height:6.4,year:1986,use:'covered stores'}),
]);

export const DISTRICT_LOGICAL_ORIGIN = freeze({x:0,y:300});
export function districtLogicalAt(physicalX,physicalY){
  return{
    x:DISTRICT_LOGICAL_ORIGIN.x+(Number(physicalX)-DISTRICT_BOUNDS.x0),
    y:DISTRICT_LOGICAL_ORIGIN.y+(Number(physicalY)-DISTRICT_BOUNDS.y0),
  };
}

function within(value,min,max){return value>=min&&value<=max;}
export function exteriorStreetAt(x,y){
  return DISTRICT_ROUTES.find((street)=>within(x,street.x0,street.x1)&&within(y,street.y0,street.y1))||null;
}

function streetGlyph(street,x,y){
  if(street.axis==='horizontal'){
    const edge=Math.min(y-street.y0,street.y1-y);
    if(edge<=1)return'p';
    if(edge===2||edge===3)return's';
    return'e';
  }
  const edge=Math.min(x-street.x0,street.x1-x);
  if(edge<=1)return'p';
  if(edge===2||edge===3)return's';
  return'e';
}

export function buildExteriorDistrictRows(){
  const rows=[];
  for(let y=DISTRICT_BOUNDS.y0;y<=DISTRICT_BOUNDS.y1;y++){
    let row='';
    for(let x=DISTRICT_BOUNDS.x0;x<=DISTRICT_BOUNDS.x1;x++){
      const streets=DISTRICT_ROUTES.filter((street)=>within(x,street.x0,street.x1)&&within(y,street.y0,street.y1));
      if(!streets.length){row+=' ';continue;}
      const glyphs=streets.map((street)=>streetGlyph(street,x,y));
      row+=glyphs.includes('e')?'e':glyphs.includes('s')?'s':'p';
    }
    rows.push(row.replace(/ +$/,''));
  }
  return rows;
}

export function districtFacadeHeightAt(x,y){
  const street=exteriorStreetAt(x,y);
  if(!street)return 12;
  if(street.kind==='court')return 8.6;
  if(street.id==='east-street')return y<52?15.8:9.4;
  if(street.id==='west-street')return y<48?11.8:8.6;
  if(street.id==='north-street')return x<18?11.2:x<78?15.1:12.4;
  return x<28?12.6:x<98?14.2:8.8;
}

// A small filtered-rain mix follows the construction around the listener.  The
// base rain bed never changes; these are quiet resonant surfaces laid under it.
export function exteriorRainMaterialMixAt(x,z){
  const px=Number(x)||0,pz=Number(z)||0;
  if(px>=50&&px<=129&&pz>=0&&pz<=93){
    if(pz>67)return{slate:.78,glass:.20,foliage:.08,steel:.24};
    if(pz>27&&pz<55)return{slate:.18,glass:.16,foliage:.04,steel:.72};
    return{slate:.34,glass:.12,foliage:.06,steel:.58};
  }
  if(px<0)return{slate:.52,glass:.66,foliage:.38,steel:.12};
  if(px>128)return{slate:.20,glass:.28,foliage:.10,steel:.58};
  return{slate:.48,glass:.42,foliage:.18,steel:.20};
}

export const EXTERIOR_DISTRICT = freeze({
  bounds:DISTRICT_BOUNDS,
  block:ELLERY_BLOCK,
  streets:DISTRICT_STREETS,
  courts:DISTRICT_COURTS,
  lots:EXTERIOR_LOTS,
  ambientNodes:EXTERIOR_AMBIENT_NODES,
  inspectables:EXTERIOR_INSPECTABLES,
  serviceRanges:YARD_SERVICE_RANGES,
});
