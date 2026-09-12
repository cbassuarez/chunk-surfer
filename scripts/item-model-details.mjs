// Physical reference, not product branding. These are original inspection
// meshes. The game-world assets and their authored placements are preserved.
// Recorder: Tascam DR-100MKIII https://www.tascam.eu/en/dr-100mkiii.html
// Radio: Motorola GP380 https://www.motorolasolutions.com/en_xu/products/two-way-radios-licensed/analog-business-radios/discontinued/gp380.html
// Badge: https://www.orau.org/health-physics-museum/collection/dosimeters/film/ornl-1950s.html
// Wrench: https://www.stanleytools.com/product/87-367/6-adjustable-wrench
// Coffee and radio silhouette: the game's existing story-art photographs.
import * as THREE from 'three';
import {SVGLoader} from 'three/addons/loaders/SVGLoader.js';
const circle=(x,y,r)=>{const h=new THREE.Path();h.absarc(x,y,r,0,Math.PI*2,true);return h;};
function outline(points,holes=[]){const s=new THREE.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();s.holes.push(...holes);return s;}

export async function buildDetailedItems(model){
 await model('map',({box,cyl,ring,cable,plate,group,add,root})=>{
  // AUDIOCORP SI–1 Survey Indicator. Original portable survey hardware: a
  // broad optical well, protected lower controls and a complete service back.
  // Its unpowered reticle is not a fabricated floor plan or enemy reading.
  root.setExtras({name:'AUDIOCORP SI–1 Survey Indicator',function:'Building plan / bearing',authorship:'Original project geometry'});
  const mark=(node,name)=>{node.setName(name);return node;};
  mark(box([0,0,-.012],[1.98,1.43,.43],'rubber',undefined,.11),'impact-bumper');
  mark(box([0,0,.022],[1.88,1.34,.42],'edge',undefined,.075),'die-cast-body');
  mark(box([0,0,-.214],[1.75,1.23,.048],'dark',undefined,.054),'rear-case-seam');
  const aperture=new THREE.Path();aperture.moveTo(-.79,-.10);aperture.lineTo(-.79,.48);aperture.lineTo(.79,.48);aperture.lineTo(.79,-.10);aperture.closePath();
  const face=outline([[-.91,-.59],[-.84,-.66],[.84,-.66],[.91,-.59],[.91,.59],[.84,.66],[-.84,.66],[-.91,.59]],[aperture]);
  mark(plate(face,.035,[0,0,.253],'steel',undefined,.007),'machined-faceplate-with-aperture');
  mark(box([0,.19,.225],[1.65,.66,.020],'rubber',undefined,.025),'recessed-display-throat');
  mark(box([0,.19,.237],[1.54,.53,.008],'glass',undefined,.015),'smoked-display-glass');
  // A printed registration graticule remains passive until the actual map
  // surface supplies readings. Fine, interrupted traces leave real darkness.
  for(let i=-3;i<=3;i++)mark(box([i*.18,.19,.242],[.002,.45,.001],'green',undefined,0),`reticle-vertical-${i+3}`);
  for(let i=-1;i<=1;i++)mark(box([0,.19+i*.145,.242],[1.38,.002,.001],'green',undefined,0),`reticle-horizontal-${i+1}`);
  // Two glass-edge returns, not a bright outline around the whole aperture.
  mark(box([-.015,.451,.245],[1.43,.009,.002],'edge',undefined,.003),'glass-upper-return');
  mark(box([.752,.19,.245],[.006,.46,.002],'edge',undefined,.002),'glass-side-return');
  // Recessed slotted fasteners: dark countersink, steel dome, narrow slot.
  const fastener=(x,y,z,back=false)=>{
   group([x,y,z],[0,back?Math.PI:0,0],()=>{
    cyl([0,0,0],.036,.009,'dark');cyl([0,0,.007],.029,.013,'steel');
    box([0,0,.015],[.041,.007,.002],'dark',[0,0,.46+x*.2],.002);
   });
  };
  for(const x of[-.85,.85])for(const y of[-.59,.59])fastener(x,y,.278);
  // Three momentary selectors sit behind the lower rubber rail; each cap has
  // a separate bezel, shadow gap, formed shoulder and opaque printed legend.
  for(const[x,color,id]of[[-.61,'blue','floor'],[-.22,'amber','mark'],[.17,'ivory','return']]){
   mark(box([x,-.38,.267],[.315,.226,.012],'dark',undefined,.022),`${id}-socket`);
   mark(box([x,-.385,.286],[.273,.186,.029],'edge',undefined,.016),`${id}-bezel`);
   mark(box([x,-.371,.31],[.246,.151,.043],color,undefined,.019),`${id}-cap`);
   box([x,-.306,.334],[.202,.006,.002],'ivory',undefined,.002);
  }
  mark(cyl([.625,-.385,.282],.155,.018,'dark',undefined,40),'range-recess');
  mark(cyl([.625,-.385,.325],.127,.083,'rubber',undefined,40),'range-knob');
  cyl([.625,-.385,.37],.093,.012,'edge',undefined,40);
  for(let i=0;i<28;i++){const a=i/28*Math.PI*2;box([.625+Math.cos(a)*.125,-.385+Math.sin(a)*.125,.334],[.010,.018,.045],'dark',[0,0,a],.002);}
  mark(box([.625,-.319,.380],[.009,.042,.003],'ivory',undefined,.002),'range-pointer');
  for(let i=0;i<7;i++){const a=-1.10+i*.37;box([.625+Math.sin(a)*.172,-.385+Math.cos(a)*.172,.282],[.008,.021,.002],'dark',[0,0,-a],0);}
  // Fine original rounded-stroke engineering lettering: actual continuous
  // geometry on the face, not a bitmap label, font dependency or fake glyphs.
  const glyphs={
   A:[[[0,0],[.3,1],[.6,0]],[[.13,.4],[.47,.4]]],
   C:[[[.6,.85],[.46,1],[.14,1],[0,.84],[0,.16],[.14,0],[.46,0],[.6,.15]]],
   D:[[[0,0],[0,1],[.36,1],[.6,.78],[.6,.22],[.36,0],[0,0]]],
   E:[[[.6,1],[0,1],[0,0],[.6,0]],[[0,.5],[.46,.5]]],
   F:[[[0,0],[0,1],[.6,1]],[[0,.5],[.46,.5]]],
   I:[[[.3,0],[.3,1]]],
   K:[[[0,0],[0,1]],[[.6,1],[0,.47],[.6,0]]],
   L:[[[0,1],[0,0],[.6,0]]],
   M:[[[0,0],[0,1],[.3,.45],[.6,1],[.6,0]]],
   N:[[[0,0],[0,1],[.6,0],[.6,1]]],
   O:[[[.14,0],[0,.16],[0,.84],[.14,1],[.46,1],[.6,.84],[.6,.16],[.46,0],[.14,0]]],
   P:[[[0,0],[0,1],[.45,1],[.6,.85],[.6,.64],[.45,.5],[0,.5]]],
   R:[[[0,0],[0,1],[.45,1],[.6,.85],[.6,.64],[.45,.5],[0,.5]],[[.29,.5],[.6,0]]],
   S:[[[.6,.85],[.45,1],[.15,1],[0,.85],[0,.65],[.15,.5],[.45,.5],[.6,.35],[.6,.15],[.45,0],[.15,0],[0,.15]]],
   T:[[[0,1],[.6,1]],[[.3,1],[.3,0]]],
   U:[[[0,1],[0,.17],[.15,0],[.45,0],[.6,.17],[.6,1]]],
   V:[[[0,1],[.3,0],[.6,1]]],
   Y:[[[0,1],[.3,.5],[.6,1]],[[.3,.5],[.3,0]]],
   1:[[[.05,.8],[.3,1],[.3,0]],[[.06,0],[.54,0]]],
   '-':[[[.07,.5],[.53,.5]]],
  };
  const legend=(value,x,y,z,size=.033,material='dark')=>{
   [...value].forEach((char,i)=>{for(const path of glyphs[char]||[]){
    const points=path.map(([xx,yy])=>new THREE.Vector2(x+(i*.86+xx)*size,y+yy*size));
    const geometry=SVGLoader.pointsToStroke(points,SVGLoader.getStrokeStyle(size*.075,'#000','round','round'),3);
    if(geometry)mark(add(geometry,material,[0,0,z]),`legend-${value}`);
   }});
  };
  legend('AUDIOCORP',-.74,.552,.282,.044);
  legend('SI-1',.53,.552,.282,.037);
  legend('SURVEY INDICATOR',-.76,-.212,.282,.032);
  legend('FLOOR',-.68,-.391,.334,.033);legend('MARK',-.274,-.391,.334,.033);
  legend('RETURN',.086,-.390,.334,.031);legend('RANGE',.558,-.591,.282,.031);
  // Separate side transducer grille and a protected cable receptacle identify
  // a survey instrument, not a second recorder or miniature handheld radio.
  group([-.947,.18,.012],[0,-Math.PI/2,0],()=>{
   box([0,0,0],[.25,.37,.025],'rubber',undefined,.019);
   for(let i=0;i<5;i++)box([0,-.12+i*.06,.016],[.19,.022,.009],'dark',undefined,.007);
  });
  group([.947,.24,.007],[0,Math.PI/2,0],()=>{
   cyl([0,0,0],.081,.025,'edge');cyl([0,0,.015],.055,.014,'dark');ring([0,0,.025],.057,.008,'steel');
  });
  // Service cover, two quarter-turn retainers, feet and a working strap bail.
  mark(box([0,-.08,-.247],[1.39,.79,.035],'shell',undefined,.035),'battery-service-cover');
  for(const x of[-.57,.57])fastener(x,-.08,-.274,true);
  for(const x of[-.76,.76])for(const y of[-.49,.49])box([x,y,-.281],[.19,.13,.055],'rubber',undefined,.032);
  for(const x of[-.73,.73]){
   box([x,.722,-.03],[.14,.072,.20],'edge',undefined,.023);
   ring([x,.728,-.03],.06,.012,'steel',[0,Math.PI/2,0]);
  }
  mark(cable([[-.73,.75,-.05],[-.65,.98,-.08],[-.26,1.05,-.08],[.29,1.01,-.08],[.65,.93,-.08],[.73,.75,-.05]],.035,'cloth'),'woven-carry-strap');
 });

 await model('coffee',({lathe,ring,cyl,add})=>{
  // Tapered paper wall with an actual open interior and folded base. The coffee
  // sits below the rolled lip, as in booth.coffee.form, instead of a dark lid.
  lathe([[.255,-.52],[.268,-.52],[.284,-.47],[.403,.47],[.414,.50],[.400,.515],[.385,.49],[.267,-.46],[.255,-.47],[.255,-.52]],[0,0,0],'paper');
  ring([0,.496,0],.402,.020,'ivory',[Math.PI/2,0,0]);
  ring([0,-.49,0],.268,.010,'ivory',[Math.PI/2,0,0]);
  cyl([0,-.49,0],.26,.014,'paper',[0,0,0],64);
  cyl([0,.386,0],.38,.007,'coffee',[0,0,0],64);
  ring([0,.390,0],.374,.004,'wood',[Math.PI/2,0,0]);
  // Narrow folded seam; its changing radius follows the taper.
  const seam=new THREE.Shape();seam.moveTo(-.006,-.45);seam.lineTo(.006,-.45);seam.lineTo(.008,.46);seam.lineTo(-.008,.46);seam.closePath();
  const g=new THREE.ShapeGeometry(seam);const p=g.getAttribute('position');for(let i=0;i<p.count;i++)p.setZ(i,.283+(p.getY(i)+.47)/.94*.119+.002);g.computeVertexNormals();add(g,'ivory',[0,0,0],[0,1.12,0]);
 });

 await model('radio',({box,cyl,ring,cable,screw,plate,group})=>{
  // Moulded shoulders taper toward the battery; the antenna and two top
  // controls are distinct silhouettes, not a single rectangular extrusion.
  plate([[-.34,-.70],[-.39,-.56],[-.40,.50],[-.32,.66],[.27,.66],[.36,.50],[.38,-.56],[.31,-.70]],.36,[0,0,0],'rubber',undefined,.045);
  plate([[-.29,-.62],[-.31,.46],[-.24,.56],[.22,.56],[.29,.44],[.30,-.62]],.035,[0,0,.22],'edge',undefined,.018);
  box([0,.34,.252],[.51,.24,.036],'dark',undefined,.02);
  box([0,.34,.276],[.43,.16,.015],'green',undefined,.008);
  // Neutral etched LCD segments, deliberately no invented frequency.
  for(let i=0;i<5;i++)box([-.17+i*.075,.36,.287],[.047,.018,.005],'dark',undefined,0);
  for(let i=0;i<3;i++)box([-.16+i*.03,.30,.287],[.016,.016+i*.008,.005],'dark',undefined,0);
  for(const x of[-.17,0,.17])box([x,.145,.26],[.12,.07,.038],x<0?'green':x>0?'red':'dark',undefined,.025);
  for(let row=0;row<4;row++)for(let col=0;col<3;col++){
   const x=-.18+col*.18,y=.012-row*.125;
   box([x,y,.262],[.14,.092,.034],'rubber',undefined,.024);
   box([x,y+.012,.284],[.019,.022,.006],'ivory',undefined,.004);
  }
  // Lower speaker slots and the side push-to-talk control.
  box([0,-.54,.255],[.48,.16,.025],'dark',undefined,.018);
  for(let i=0;i<4;i++)box([0,-.49-i*.033,.272],[.39-i*.015,.014,.011],'rubber',undefined,.005);
  box([-.414,.22,.015],[.047,.29,.19],'dark',[0,0,-.04],.022);
  for(const y of[-.03,-.16])box([-.412,y,.012],[.048,.073,.12],'edge',undefined,.015);
  cyl([-.21,.73,0],.078,.19,'rubber',[0,0,0],24,.09);
  cyl([-.21,1.17,0],.039,.72,'dark',[0,0,-.018],24,.055);
  ring([-.21,.82,0],.058,.011,'edge',[Math.PI/2,0,0]);
  for(const [x,r]of[[.02,.06],[.23,.079]]){
   cyl([x,.731,.025],r,.17,'dark',[0,0,0],24);
   for(let i=0;i<14;i++){const a=i/14*Math.PI*2;box([x+Math.cos(a)*r,.73,.025+Math.sin(a)*r],[.012,.10,.012],'edge',[0,-a,0],.003);}
   box([x,.821,.025],[.01,.01,.057],'ivory');
  }
  // Battery seam, contacts, belt clip, and accessory cover remain complete
  // when the player turns the object over.
  box([0,-.07,-.23],[.66,1.10,.14],'dark',undefined,.04);
  box([0,.20,-.325],[.19,.67,.045],'edge',[.045,0,0],.025);
  box([0,-.13,-.30],[.23,.08,.09],'rubber',undefined,.02);
  for(const x of[-.15,0,.15])box([x,-.54,-.309],[.059,.09,.01],'brass',undefined,.008);
  box([.399,.08,0],[.035,.35,.22],'dark',undefined,.018);
  for(const y of[-.49,.51])screw([.29,y,.26],.019);
  cable([[.33,-.55,-.12],[.49,-.76,-.15],[.21,-.90,-.11],[-.10,-.79,-.12]],.012);
 });

 await model('recorder',({box,cyl,ring,cable,screw,plate,group,ball})=>{
  group([-.40,0,0],[0,0,-.07],()=>{
   // Handheld stereo recorder: tall body, paired condenser capsules, recessed
   // LCD, transport, jog wheel and two XLR sockets in the bottom end.
   box([0,0,0],[.85,1.55,.35],'rubber',undefined,.065);
   box([0,.05,.192],[.77,1.41,.035],'steel',undefined,.028);
   box([0,.05,.22],[.69,1.32,.026],'dark',undefined,.03);
   for(const x of[-.255,.255]){
    cyl([x,.87,0],.115,.28,'edge',[0,0,0],32);
    cyl([x,.87,0],.105,.24,'dark',[0,0,0],32);
    for(let i=0;i<8;i++)ring([x,.77+i*.028,0],.113,.009,'steel',[Math.PI/2,0,0]);
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2;box([x+Math.cos(a)*.116,.865,Math.sin(a)*.116],[.009,.23,.009],'steel',[0,-a,0],.003);}
    cyl([x,1.015,0],.098,.014,'steel',[0,0,0],32);
   }
   box([0,.35,.25],[.60,.35,.03],'rubber',undefined,.016);
   box([0,.35,.27],[.52,.275,.015],'green',undefined,.008);
   for(let row=0;row<2;row++)for(let i=0;i<12;i++)box([-.21+i*.038,.30+row*.035,.281],[.025,.019,.004],'dark',undefined,0);
   // Two quiet indicator holes and a pair of transport switches below LCD.
   for(const x of[-.29,.29])cyl([x,.57,.26],.018,.007,'glass');
   for(const [x,m]of[[-.22,'edge'],[0,'red'],[.22,'edge']]){
    cyl([x,.07,.269],.073,.05,m,[Math.PI/2,0,0],28);
    if(x===0)cyl([x,.07,.30],.022,.007,'ivory');
    else box([x,.07,.30],[.026,.026,.007],'ivory',undefined,0);
   }
   ring([.07,-.27,.28],.20,.035,'edge');cyl([.07,-.27,.277],.161,.03,'rubber');cyl([.07,-.27,.300],.075,.026,'steel');
   for(let i=0;i<32;i++){const a=i/32*Math.PI*2;box([.07+Math.cos(a)*.20,-.27+Math.sin(a)*.20,.301],[.012,.021,.015],'dark',[0,0,a],.002);}
   for(const y of[-.18,-.37])box([-.23,y,.27],[.13,.07,.025],'edge',undefined,.012);
   box([0,-.60,.254],[.54,.09,.02],'rubber',undefined,.012);
   for(let i=0;i<11;i++)box([-.225+i*.044,-.60,.27],[.017,.04,.01],'edge',undefined,.004);
   for(const x of[-.32,.32])for(const y of[-.67,.65])screw([x,y,.248],.018);
   // XLR recesses face down and slightly forward, showing a real socket cup.
   for(const x of[-.235,.235])group([x,-.81,0],[-Math.PI/2,0,0],()=>{
    cyl([0,0,0],.155,.11,'edge');cyl([0,0,.060],.127,.013,'rubber');ring([0,0,.07],.132,.015,'steel');
    for(const [px,py]of[[-.05,.02],[.05,.02],[0,-.055]])cyl([px,py,.078],.022,.026,'brass');
   });
   box([0,0,-.204],[.70,1.30,.034],'edge',undefined,.03);
   box([0,-.20,-.23],[.57,.65,.02],'rubber',undefined,.022);
   for(let i=0;i<5;i++)box([0,-.30+i*.04,-.245],[.23,.012,.008],'edge');
   box([.44,.27,0],[.055,.38,.22],'edge',undefined,.012);
   cyl([.456,.33,.07],.063,.03,'rubber',[0,0,Math.PI/2],24);
  });
  // Closed-back monitoring headphones, laid beside the recorder. Oval pads,
  // separate yokes and an open padded band identify them at thumbnail size.
  group([.72,-.22,-.02],[0,.15,.20],()=>{
   cable([[-.36,-.01,0],[-.39,.34,0],[-.23,.60,0],[.06,.65,0],[.33,.44,0],[.38,.03,0]],.040,'steel');
   cable([[-.35,.27,.014],[-.22,.56,.014],[.04,.61,.014],[.29,.43,.014]],.066,'rubber');
   for(const [x,a]of[[-.36,-.12],[.37,.12]])group([x,-.07,.02],[0,-a*2,a],()=>{
    box([0,.0,0],[.25,.43,.16],'edge',undefined,.10);
    box([0,.0,.10],[.24,.40,.12],'rubber',undefined,.095);
    box([0,.0,.17],[.13,.25,.015],'dark',undefined,.05);
    for(const y of[-.13,.13])cyl([0,y,-.10],.018,.04,'steel');
    cable([[-.13,.18,-.035],[-.17,0,-.035],[-.12,-.19,-.035]],.017,'steel');
   });
  });
  cable([[.39,-.33,.05],[.49,-.71,.08],[.13,-.96,.13],[-.33,-1.0,.11],[-.70,-.77,.1]],.016,'rubber');
 });

 function keys(g,single){const {ring,plate,box,group}=g;
  // Two turns of spring steel, open at different angles, form a split ring.
  ring([0,.43,0],.245,.019,'steel',[0,0,.1],Math.PI*1.96);
  ring([0,.43,.031],.245,.019,'steel',[0,0,-.1],Math.PI*1.96);
  for(let i=0;i<(single?1:3);i++)group([-.06+i*.055,.20,.045+i*.041],[0,i*.13-.12,(i-1)*.30+(single?.08:0)],()=>{
   const bow=outline([[-.14,.10],[-.18,.21],[-.13,.36],[.13,.36],[.18,.21],[.14,.10],[.055,.04],[.055,-.08],[-.055,-.08],[-.055,.04]],[circle(0,.255,.065)]);
   plate(bow,.033,[0,0,0],i%2?'brass':'steel',undefined,.008);
   const cuts=[.08,.052,.102,.037,.08];
   const points=[[-.055,.035],[.09,.035],[.09,-.12]];
   for(let k=0;k<5;k++){const y=-.12-k*.082;points.push([cuts[(k+i)%5],y],[cuts[(k+i)%5],y-.027],[.02,y-.057]);}
   points.push([.02,-.58],[-.055,-.54]);
   plate(points,.032,[0,0,0],i%2?'brass':'steel',undefined,.003);
   // Longitudinal milling on both faces, not decorative teeth on a stick.
   for(const z of[-.02,.02])box([-.027,-.27,z],[.012,.49,.005],'edge',undefined,.003);
   for(const x of[-.09,.09])box([x,.21,.024],[.014,.095,.004],'edge');
  });
  group([single?-.19:.22,.12,-.03],[0,.13,single?-.35:.34],()=>{
   const tag=outline([[-.13,-.32],[.13,-.32],[.13,.04],[.06,.12],[-.06,.12],[-.13,.04]],[circle(0,.052,.025)]);
   plate(tag,.032,[0,0,0],'ivory',undefined,.01);
   // Preserve the cabinet's two-notch C-17 and three-notch master tag code.
   for(let i=0;i<(single?2:3);i++)box([-.06+i*.05,-.13,.024],[.02,.095,.006],'edge',undefined,.002);
  });
 }
 await model('keyring',g=>keys(g,false));await model('chapel-key',g=>keys(g,true));

 await model('plant-spanner',({plate,box,cyl,ring,group})=>{
  group([0,0,0],[0,0,-.48],()=>{
   // One forged body and fixed jaw, with an actual crescent opening. A small
   // six-inch wrench: narrow waist, broad jaw stock and drilled hanging hole.
   const body=outline([[-.13,-.94],[-.20,-.86],[-.18,-.62],[-.10,.22],[-.31,.37],[-.43,.61],[-.42,.85],[-.31,1.02],[-.235,1.03],[-.235,.64],[.16,.50],[.23,.32],[.12,.22],[.09,-.65],[.065,-.87],[-.015,-.95]],
    [circle(-.064,-.78,.058)]);
   plate(body,.11,[0,0,0],'steel',undefined,.014);
   // Enamel inset leaves the forged perimeter visible.
   plate([[-.12,-.60],[-.058,.14],[.035,.13],[.035,-.64],[-.018,-.69],[-.08,-.68]],.013,[0,0,.068],'blue',undefined,.009);
   plate([[-.12,-.60],[-.058,.14],[.035,.13],[.035,-.64],[-.018,-.69],[-.08,-.68]],.013,[0,0,-.068],'blue',undefined,.009);
   // Sliding jaw: rack stem terminates below the worm. Parallel gripping
   // faces leave a clear gap set near the heating-header gland size.
   plate([[-.03,.52],[.08,.51],[.20,.64],[.27,.89],[.25,.98],[.17,1.01],[.04,.94],[.02,.64],[-.08,.57]],.12,[0,0,.005],'edge',undefined,.011);
   plate([[.04,.66],[.055,.94],[.17,1.00],[.16,.69]],.014,[0,0,.076],'steel',undefined,.005);
   box([.035,.35,.076],[.235,.145,.035],'dark',[0,0,.16],.022);
   cyl([.035,.35,.105],.066,.19,'steel',[0,0,Math.PI/2],24);
   for(let i=0;i<8;i++)ring([-.047+i*.024,.35,.105],.067,.006,'dark',[0,Math.PI/2,0]);
   for(let i=0;i<7;i++)box([-.07+i*.033,.535+i*.008,.075],[.007,i%2?.026:.045,.006],'edge',[0,0,.16],0);
  });
 });

 await model('badge',({plate,box,cyl,ring,group})=>{
  // Passive film holder: narrow stamped case, side-loaded film packet,
  // three circular filter wells and a sprung alligator clip.
  const frame=outline([[-.22,-.49],[-.27,-.42],[-.27,.37],[-.20,.47],[.20,.47],[.27,.37],[.27,-.42],[.22,-.49]]);
  plate(frame,.12,[0,0,0],'badge',undefined,.024);
  box([0,0,.074],[.44,.80,.023],'edge',undefined,.027);
  box([0,.22,.09],[.37,.25,.013],'paper',undefined,.012);
  for(let i=0;i<6;i++)box([-.14+i*.05,.22+.015*(i%2),.101],[.025,.019,.004],'edge',[0,0,.2-i*.06],0);
  for(const [x,y,m,r]of[[-.10,-.09,'brass',.065],[.10,-.09,'steel',.065],[0,-.285,'dark',.076]]){
   cyl([x,y,.098],r+.015,.019,'dark',undefined,28);cyl([x,y,.112],r,.016,m,undefined,28);ring([x,y,.122],r,.006,'steel');
  }
  for(const x of[-.258,.258])box([x,-.025,0],[.012,.61,.038],'dark',undefined,.004);
  box([0,-.07,-.075],[.43,.67,.022],'dark',undefined,.017);
  group([0,.51,-.016],[.12,0,0],()=>{
   plate([[-.069,-.12],[.069,-.12],[.065,.24],[.036,.30],[-.036,.30],[-.065,.24]],.018,[0,0,0],'steel',undefined,.009);
   plate([[-.055,-.12],[.055,-.12],[.048,.24],[-.048,.24]],.018,[0,0,-.067],'edge',[-.12,0,0],.006);
   cyl([0,.02,-.034],.044,.145,'steel',[0,0,Math.PI/2],20);
   for(let i=0;i<5;i++)ring([-.055+i*.027,.02,-.034],.041,.006,'edge',[0,Math.PI/2,0]);
   for(let i=0;i<3;i++)box([-.039+i*.039,-.095,-.030],[.012,.021,.05],'steel');
  });
  for(const y of[-.39,.37])cyl([0,y,.098],.019,.01,'steel',undefined,20);
 });
}
