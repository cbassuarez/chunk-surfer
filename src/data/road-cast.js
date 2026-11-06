// What stands at the side of the opening road on the way in. Nothing here is ever
// named, pointed at or waited for: it goes by at driving speed and the night goes
// on. Whatever the building later makes of a flatbed, a bus or a poster is the
// building's business.
//
// Distances are the same d the road uses (-Z forward, the van starts at -600), and
// +lateral is right of the direction of travel. Everything stands beyond the guard
// rail, so nothing here is a collision, and the closing drive passes the same things.
const freeze=Object.freeze;
const rows=list=>freeze(list.map(row=>freeze({lift:0,yaw:0,scale:freeze([1,1,1]),...row})));

// Downscaled from public/assets/institution-posters by the pack builder.
export const ROAD_CAST_BILLS=freeze(['new_works','visiting','students','lyric','tape','loudspeakers']);

// The services. A roadside place that advertises itself for miles and is over in a second.
// The miles don't add up, and nothing says so. Three of the boards say what the man at the
// gate will say later, word for word, and he never mentions them. He could have read them.
// So could whoever is putting words in his mouth.
const THE_HAPPY_RETURN='THE HAPPY RETURN';
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
    freeze({id:'fascia',lines:freeze(['HOT FOOD  TEAS  COFFEE']),size:freeze([1024,160]),font:'NimbusSans-Bold.otf'}),
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
// The real gate lodge, all its parts on one origin, and the real man inside it, stood on
// a verge with a sign over it. Same building, same body, two minutes earlier. Its hatch
// faces back down the road at you.
const KIOSK=freeze({d:-165,lateral:-11.5,yaw:-1.9}),PARKED=freeze({d:-153,lateral:-8.2});
const kioskPart=(id,mesh,extra={})=>({id:`road-kiosk-${id}`,mesh,d:KIOSK.d,lateral:KIOSK.lateral,yaw:KIOSK.yaw,...extra});
const SERVICES=[
  ...signboard('first',-578,-7.2),...signboard('coffee',-510,-7.3),...signboard('hot',-408,-7.4),
  ...signboard('night',-300,-7.2),...signboard('need',-214,-7.4),...signboard('thanks',-128,-7.2),
  kioskPart('lodge','yard_booth'),kioskPart('inside','yard_booth_interior'),kioskPart('lamps','yard_booth_practicals'),
  kioskPart('glass','yard_booth_glazing'),kioskPart('man','yard_booth_guard_idle'),
  // Somebody at the hatch with his back to the road, being served.
  {id:'road-kiosk-customer',mesh:'player_shadow_figure',d:KIOSK.d,lateral:KIOSK.lateral,yaw:KIOSK.yaw+Math.PI,local:[.72,0,2.15]},
  {id:'road-kiosk-sign',mesh:'rc_pole_sign',d:KIOSK.d-3.4,lateral:KIOSK.lateral-2.6,yaw:.42},
  {id:'road-kiosk-sign-glow',mesh:'rc_pole_glow',d:KIOSK.d-3.4,lateral:KIOSK.lateral-2.6,yaw:.42},
  {id:'road-kiosk-sign-letters',mesh:'rc_letters_pole',d:KIOSK.d-3.4,lateral:KIOSK.lateral-2.6,yaw:.42},
  {id:'road-kiosk-bin',mesh:'district_litter_bin',d:KIOSK.d-3.2,lateral:KIOSK.lateral+3.4},
  {id:'road-kiosk-pad',mesh:'rc_kiosk_pad',d:KIOSK.d+1,lateral:KIOSK.lateral-1.4},
  {id:'road-kiosk-fascia',mesh:'rc_kiosk_fascia',d:KIOSK.d,lateral:KIOSK.lateral,yaw:KIOSK.yaw+Math.PI,local:[0,0,1.6]},
  {id:'road-kiosk-fascia-letters',mesh:'rc_letters_fascia',d:KIOSK.d,lateral:KIOSK.lateral,yaw:KIOSK.yaw+Math.PI,local:[0,0,1.6]},
  // A van pulled up beside it, the same van, with nobody's name on it. There are a lot of vans.
  {id:'road-kiosk-van',mesh:'drive_vehicle_body',d:PARKED.d,lateral:PARKED.lateral},
  ...[[-1,-1.3],[1,-1.3],[-1,1.535],[1,1.535]].map(([side,axle],i)=>({id:`road-kiosk-van-tyre-${i}`,mesh:'drive_tyre',d:PARKED.d,lateral:PARKED.lateral,local:[side*.83,.33,axle]})),
];
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
// hoarding. No more than two are ever in range, so the drive's own lamps survive.
export const ROAD_CAST_LAMPS=rows([
  {id:'road-bus-saloon',d:-348,lateral:-7.7,y:2.2,color:[1,.88,.62],intensity:1.5,radius:7,reach:85},
  {id:'road-kiosk-strip',d:-165,lateral:-9.6,y:3.3,color:[.86,1,.82],intensity:7.5,radius:15,reach:95},
  {id:'road-hoarding-first-lamp',d:-548,lateral:-12.5,y:5.05,local:[0,0,.9],yaw:.42,color:[.96,.92,.78],intensity:2.3,radius:9,reach:150},
  {id:'road-hoarding-second-lamp',d:-244,lateral:-13,y:5.05,local:[0,0,.9],yaw:.36,color:[.96,.92,.78],intensity:2.3,radius:9,reach:90},
]);

// Studs down the crown of the road, at the spacing the road's own centre paint uses.
export const ROAD_STUDS=freeze({mesh:'rc_cat_eye',from:-716,to:292,every:18.3,behind:40,ahead:190});

// In the van, up on the dash left of the wheel. Cab space, as `cabPoint` takes it.
export const ROAD_CAB_CUP=freeze({mesh:'ending_van_cup',at:freeze([-.2,1.25,-.66])});
