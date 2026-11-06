// What stands at the side of the opening road on the way in. Nothing here is ever
// named, pointed at or waited for: it goes by at driving speed and the night goes
// on. Whatever the building later makes of a flatbed, a bus or a poster is the
// building's business.
//
// Distances are the same d the road uses (-Z forward, the van starts at -600), and
// +lateral is right of the direction of travel. Everything stands beyond the guard rail,
// so none of it is a collision, except the stand, which has a way in. The closing drive
// passes the same things.
const freeze=Object.freeze;
const rows=list=>freeze(list.map(row=>freeze({lift:0,yaw:0,scale:freeze([1,1,1]),...row})));

// Downscaled from public/assets/institution-posters by the pack builder.
export const ROAD_CAST_BILLS=freeze(['new_works','visiting','students','lyric','tape','loudspeakers']);

// The services. A roadside place that advertises itself for miles and is over in a second.
// The miles don't add up, and nothing says so. Three of the boards say what the man at the
// gate will say later, word for word, and he never mentions them. He could have read them.
// So could whoever is putting words in his mouth.
const THE_HAPPY_RETURN='THE HAPPY RETURN';
// The pull-in, and the one place the road's left edge moves. Slip lane, forecourt, slip lane.
export const ROAD_SERVICES=freeze({from:-240,fullFrom:-196,fullTo:-134,to:-96,extra:13});
const quintic=x=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(10+t*(-15+6*t));};
export function roadServicesWiden(d){
  const{from,fullFrom,fullTo,to,extra}=ROAD_SERVICES;
  if(d<=from||d>=to)return 0;
  return extra*quintic((d-from)/(fullFrom-from))*(1-quintic((d-fullTo)/(to-fullTo)));
}
export const ROAD_CAST_BOARD_COPY=freeze({
  boards:freeze([
    freeze({id:'first',lines:freeze([THE_HAPPY_RETURN,'HOT FOOD  TEAS']),foot:'CLEAN TOILETS  3 MILES',font:'NimbusRoman-Bold.otf'}),
    freeze({id:'coffee',lines:freeze(['THERE\'S COFFEE','IF YOU WANT IT']),foot:`${THE_HAPPY_RETURN}  2 MILES`}),
    freeze({id:'hot',lines:freeze(['IT\'S NOT GOOD','BUT IT\'S HOT']),foot:`${THE_HAPPY_RETURN}  1 MILE`,inverse:true}),
    freeze({id:'night',lines:freeze(['IT\'S A LONG NIGHT','YOU HAVE AHEAD']),foot:`${THE_HAPPY_RETURN}  HALF A MILE`}),
    freeze({id:'need',lines:freeze(['YOU LOOK LIKE','YOU NEED IT']),foot:'PULL IN HERE',inverse:true}),
    freeze({id:'thanks',lines:freeze(['THANK YOU','MANY HAPPY RETURNS']),font:'NimbusRoman-Bold.otf'}),
  ]),
  // Lit from inside. The letters are a separate cut-out in front of the glowing panel.
  lit:freeze([
    freeze({id:'pole',lines:freeze(['THE HAPPY','RETURN'])}),
    freeze({id:'roof',lines:freeze([THE_HAPPY_RETURN]),size:freeze([1024,180])}),
    freeze({id:'menu',lines:freeze(['TEA','COFFEE','BACON ROLL','CHIPS']),size:freeze([320,512]),font:'NimbusSans-Bold.otf'}),
  ]),
});

const hoarding=(id,d,lateral,yaw,bills)=>[
  {id,mesh:'rc_hoarding',d,lateral,yaw},
  ...bills.map((art,i)=>({id:`${id}-bill-${i}`,mesh:`rc_bill_${art}`,d,lateral,yaw,lift:1.24+(i===1?.02:0),
    local:[(i-1)*2.06,0,.012+i*.004]})),
];

const signboard=(id,d,lateral,yaw=.5)=>[
  {id:`road-board-${id}`,mesh:'rc_signboard',d,lateral,yaw},
  {id:`road-board-${id}-face`,mesh:`rc_board_${id}`,d,lateral,yaw},
];
// The stand. A place you could really pull into: the road's left edge widens through a
// slip lane into a forecourt and back, and the rail goes round the outside of all of it.
// It glows, it is the only thing out here that does, and somebody is being served.
const STAND=freeze({d:-165,lateral:-13.4,yaw:1.2}),PARKED=freeze({d:-147,lateral:-9.6}),SIGN=freeze({d:-179,lateral:-15.4,yaw:.42});
const standPart=(id,mesh,extra={})=>({id:`road-stand-${id}`,mesh,d:STAND.d,lateral:STAND.lateral,yaw:STAND.yaw,...extra});
const signPart=(id,mesh)=>({id:`road-stand-sign${id}`,mesh,d:SIGN.d,lateral:SIGN.lateral,yaw:SIGN.yaw});
export const ROAD_SERVICES_GROUND=freeze({d:-165,lateral:-9.5});
const SERVICES=[
  ...signboard('first',-578,-7.2),...signboard('coffee',-510,-7.3),...signboard('hot',-408,-7.4),
  ...signboard('night',-300,-7.2),...signboard('need',-254,-7.4),...signboard('thanks',-84,-7.2),
  {id:'road-services-ground',mesh:'rc_services_ground',d:ROAD_SERVICES_GROUND.d,lateral:ROAD_SERVICES_GROUND.lateral,worldAligned:true},
  standPart('building','rc_stand'),standPart('roof-letters','rc_letters_roof'),standPart('menu-letters','rc_letters_menu'),
  // The man behind the counter is the man at the gate. Nothing else here is.
  standPart('man','yard_booth_guard_idle',{local:[-1.45,0,.3]}),
  // Somebody at the window, being served. They'll have a flask filled and go and stand
  // somewhere in the rain for the rest of the night.
  standPart('customer','vigil_figure_flask_a',{local:[1.2,.08,2.65]}),
  standPart('bin','district_litter_bin',{local:[3.95,.08,1.5]}),
  signPart('','rc_pole_sign'),signPart('-glow','rc_pole_glow'),signPart('-letters','rc_letters_pole'),
  // A van pulled up on the forecourt, the same van, with nobody's name on it. There are a lot of vans.
  {id:'road-stand-van',mesh:'drive_vehicle_body',d:PARKED.d,lateral:PARKED.lateral},
  ...[[-1,-1.3],[1,-1.3],[-1,1.535],[1,1.535]].map(([side,axle],i)=>({id:`road-stand-van-tyre-${i}`,mesh:'drive_tyre',d:PARKED.d,lateral:PARKED.lateral,local:[side*.83,.33,axle]})),
];
// What a van can hit once it has pulled in. Nothing else on this road is in reach of one.
export const ROAD_CAST_SOLIDS=freeze([
  {id:'road-stand-solid',d:STAND.d,lateral:STAND.lateral,yaw:STAND.yaw,local:[0,0,.18],halfX:3.4,halfZ:1.95},
  {id:'road-stand-customer-solid',d:STAND.d,lateral:STAND.lateral,yaw:STAND.yaw,local:[1.2,0,2.65],halfX:.34,halfZ:.26},
  {id:'road-stand-bin-solid',d:STAND.d,lateral:STAND.lateral,yaw:STAND.yaw,local:[3.95,0,1.5],halfX:.33,halfZ:.33},
  {id:'road-stand-sign-solid',d:SIGN.d,lateral:SIGN.lateral,yaw:SIGN.yaw,halfX:.14,halfZ:.14},
  {id:'road-stand-van-solid',d:PARKED.d,lateral:PARKED.lateral,local:[0,0,.137],halfX:1,halfZ:2.42},
].map(freeze));
export const ROAD_CAST=rows([
  ...SERVICES,
  ...hoarding('road-hoarding-first',-548,-12.5,.42,['new_works','visiting','students']),
  // A flatbed pulled in with its lamps on, and nobody with it.
  {id:'road-flatbed',mesh:'rc_flatbed',d:-462,lateral:-7.6,yaw:.03},
  {id:'road-flatbed-lamps',mesh:'rc_flatbed_lamps',d:-462,lateral:-7.6,yaw:.03},
  {id:'road-flatbed-sheet',mesh:'rc_tarp',d:-462,lateral:-7.6,yaw:.03},
  // The late bus, stopped at a shelter out here where nobody could want one.
  {id:'road-bus-shelter',mesh:'outskirts_shelter',d:-356,lateral:-11.6,yaw:0},
  {id:'road-bus',mesh:'outskirts_bus',d:-348,lateral:-7.7,yaw:0},
  {id:'road-bus-window',mesh:'outskirts_bus_woman',d:-348,lateral:-7.7,yaw:Math.PI/2,local:[-1.1,.82,.62]},
  ...hoarding('road-hoarding-second',-244,-13,.36,['lyric','tape','loudspeakers']),
]);

// Practicals only near their owner: a bus with its saloon lit, one lamp on each
// hoarding, the stand's window. No more than two are ever in range, so the drive's own
// lamps survive.
export const ROAD_CAST_LAMPS=rows([
  {id:'road-bus-saloon',d:-348,lateral:-7.7,y:2.2,color:[1,.88,.62],intensity:1.5,radius:7,reach:85},
  {id:'road-stand-window',d:-165,lateral:-10.4,y:2.7,color:[.88,1,.84],intensity:3,radius:14,reach:95},
  {id:'road-hoarding-first-lamp',d:-548,lateral:-12.5,y:5.05,local:[0,0,.9],yaw:.42,color:[.96,.92,.78],intensity:2.3,radius:9,reach:150},
  {id:'road-hoarding-second-lamp',d:-244,lateral:-13,y:5.05,local:[0,0,.9],yaw:.36,color:[.96,.92,.78],intensity:2.3,radius:9,reach:90},
]);

// Studs down the crown of the road, at the spacing the road's own centre paint uses.
export const ROAD_STUDS=freeze({mesh:'rc_cat_eye',from:-716,to:292,every:18.3,behind:40,ahead:190});

// In the van, up on the dash left of the wheel. Cab space, as `cabPoint` takes it.
export const ROAD_CAB_CUP=freeze({mesh:'ending_van_cup',at:freeze([-.2,1.25,-.66])});
