// Project-native roof construction. All surfaces enter the ordinary prop/depth
// acquisition, so the game's shared dither treats Ren and the roof alike.
import { buildRoofFormalPromenades } from './roof-formal-promenade.mjs';
import { buildRoofGrotesques } from './roof-grotesques.mjs';
import { buildRoofGardenFlora } from './roof-garden-flora.mjs';
export const ACADEMIC_ROOF_ORNAMENT_CONTRACT=Object.freeze({
  // Structure-local coordinates. The south wall's existing collision occupies
  // z=12.5..13.5; all new standing masonry remains inside that strip.
  southPavilion:Object.freeze({columns:Object.freeze([-7,5]),z:13,shaftRadius:.30,
    footWidth:.84,footDepth:.90,archSpring:2.90,maxHeight:5.65}),
  sideArcades:Object.freeze({x:Object.freeze([-11.5,11.5]),
    columns:Object.freeze([-9,-3,3,9]),shaftRadius:.28,footWidth:.90,
    archSpring:2.90,archCrown:4.01,corniceTop:4.34}),
  northOpening:Object.freeze({x0:3,x1:5,z:-13}),
  glassPaneCount:30,
});

export function buildAcademicRoof({mesh,materials,MAT,addBox,addBeam,addEllipsoid,addCylinder,addQuad}){
  const material=(name,color,{metallic=0,roughness=.8,emissive=null,renRole=null,fireEscapeRole=null,roofRole=null}={})=>{
    const index=materials.length;
    materials.push({name,pbrMetallicRoughness:{baseColorFactor:[...color,1],metallicFactor:metallic,roughnessFactor:roughness},
      ...(emissive?{emissiveFactor:emissive}:{}),...((renRole||fireEscapeRole||roofRole)?{extras:{...(renRole?{renRole}:{}),...(fireEscapeRole?{fireEscapeRole}:{}),...(roofRole?{roofRole}:{})}}:{})});return index;
  };
  const zinc=material('roof weathered zinc',[.24,.31,.32],{metallic:.48,roughness:.63});
  // The roof is a dark, rain-soaked lid around one glass lantern. Its metal
  // cannot use the bright generic steel/bronze ink: that outlined every seam
  // and made the foreground louder than the occupied district beyond it.
  // These are roof-only materials; the accepted escape keeps its own iron.
  const roofZinc=material('roof rain-dark standing-seam zinc',[.090,.120,.130],
    {metallic:.04,roughness:.90,roofRole:'weathered-surface'});
  const roofQuietIron=material('roof charcoal bronze and iron',[.026,.038,.040],
    {metallic:0,roughness:1,fireEscapeRole:'quiet-metal'});
  const roofStone=material('roof rain-dark stone coping',[.155,.175,.170],
    {metallic:0,roughness:.98,roofRole:'weathered-surface'});
  const roofBrick=material('roof weathered chimney brick',[.105,.080,.066],
    {metallic:0,roughness:1,roofRole:'weathered-surface'});
  const roofLead=material('roof dull lead glazing repairs',[.135,.158,.155],
    {metallic:.02,roughness:.94,roofRole:'weathered-surface'});
  // Ornament is weathered institutional wealth: broad stone profiles and
  // dark iron carry the silhouette, with isolated rubbed bronze on the crest.
  // The bronze is not an emitter, nor a second bright rail around the city.
  // Carved limestone keeps its own ordinary acquisition. Treating this whole
  // architectural order as the zinc apron reduced its broad faces to hairline
  // outlines; the low foreground iron retains its existing quiet ink.
  const carvedStone=material('roof carved rain-worn limestone',[.355,.320,.255],
    {metallic:0,roughness:.96});
  const oldBronze=material('roof restrained tarnished gilt bronze',[.235,.165,.070],
    {metallic:.08,roughness:.94});
  const facadeStone=material('north school carved wet limestone',[.245,.240,.215],
    {metallic:0,roughness:.96});
  // The final dither turns emissive micro-geometry into a large glare disk.
  // Let the player's light find this enamel instead of manufacturing a halo.
  const serviceLens=material('north gallery maintained bulkhead lens',[.65,.46,.24],
    {metallic:.08,roughness:.55});
  // A torch aimed at the threshold from the narrow gallery otherwise turns
  // a zinc leaf and white plate into one flat white disc. The dark, abraded
  // enamel holds the leaf silhouette while the narrow metalwork identifies it.
  const gateEnamel=material('north gallery blackened service enamel',[.035,.047,.052],
    {metallic:.12,roughness:.91});
  const gatePlate=material('north gallery tarnished notice plate',[.13,.105,.075],
    {metallic:.16,roughness:.84});
  const facadeBrick=material('rain-soaked north school brick',[.145,.15,.146],
    {metallic:0,roughness:.98});
  const windowNight=material('north school dark glass',[.115,.145,.155],
    {metallic:.16,roughness:.52});
  const windowWarm=material('north practice room occupied glass',[.16,.125,.073],
    {metallic:.04,roughness:.84});
  const courtWindowWarm=material('north school lit rehearsal window',[.25,.19,.105],
    {metallic:.04,roughness:.84,emissive:[.032,.019,.006]});
  const courtPaint=material('north school street worn traffic paint',[.12,.13,.125],
    {metallic:0,roughness:.99});
  const lowerSecurityLens=material('north facade lower security bulkhead lens',[.33,.225,.10],
    {metallic:.04,roughness:.72,emissive:[.075,.043,.012]});
  const cageIron=material('matte black fire escape iron',[.040,.046,.048],
    {metallic:0,roughness:.98});
  const stairIron=material('subdued fire escape iron',[.018,.024,.025],
    {metallic:0,roughness:1,fireEscapeRole:'quiet-metal'});
  const nosing=material('scuffed fire escape nosing',[.13,.095,.052],
    {metallic:0,roughness:.97});
  const flesh=material('Ren living skin',[.35,.25,.23],{roughness:.94});
  const lip=material('Ren tissue margin',[.39,.27,.255],{roughness:.98,renRole:'margin'});
  const edge=material('Ren turned flesh',[.52,.365,.32],{roughness:.98,renRole:'fold'});
  const foldFlesh=material('Ren inner flesh',[.35,.24,.22],{roughness:1,renRole:'fold'});
  const voidMat=material('Ren inward shadow',[.004,.003,.007],{roughness:1});
  const chalk=material('Ren rain-dark shirt',[.27,.31,.30],{roughness:.98});
  const coat=material('Ren old coat',[.19,.22,.245],{roughness:.98});
  const foldCloth=material('Ren turned coat',[.16,.17,.195],{roughness:1,renRole:'fold'});
  const hair=material('Ren dark hair',[.105,.105,.105],{roughness:.98});

  const polyline=(m,points,width,mat)=>{
    for(let i=1;i<points.length;i++)addBeam(m,points[i-1],points[i],width,mat);
  };
  const arc=(m,{x,y,z,rx,ry,from=0,to=Math.PI,width=.07,mat=roofQuietIron,steps=16})=>{
    const points=Array.from({length:steps+1},(_,i)=>{
      const a=from+(to-from)*i/steps;return[x+Math.cos(a)*rx,y+Math.sin(a)*ry,z];
    });
    polyline(m,points,width,mat);
  };
  const lyre=(m,x,y,z,scale,mat=roofQuietIron)=>{
    // One open musical silhouette, with no luminous strings or tiny filigree.
    const p=(px,py)=>[x+px*scale,y+py*scale,z];
    for(const sign of[-1,1])polyline(m,[p(sign*.10,0),p(sign*.28,.09),
      p(sign*.34,.33),p(sign*.26,.62),p(sign*.36,.77)],.065*scale,mat);
    addBeam(m,p(-.30,.58),p(.30,.58),.060*scale,mat);
    addBeam(m,p(-.19,.10),p(.19,.10),.060*scale,mat);
    for(const x of[-.12,0,.12])addBeam(m,p(x,.14),p(x,.56),.025*scale,mat);
  };
  const urn=(m,x,z,scale=1)=>{
    addBox(m,[x,.40,z],[.78*scale,.10,.72*scale],carvedStone);
    addBox(m,[x,.51,z],[.66*scale,.12,.60*scale],carvedStone);
    addCylinder(m,[x,.70,z],.20*scale,.30,carvedStone,12);
    addEllipsoid(m,[x,.99,z],[.33*scale,.28,.33*scale],carvedStone,8,12);
    // An open moulded lip replaces the old solid lid. Planting grows from
    // the bowl itself, rather than sitting on top of a stone finial.
    for(let i=0;i<16;i++){
      const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2;
      const p=(angle,r,y)=>[x+Math.cos(angle)*r*scale,y,z+Math.sin(angle)*r*scale];
      addQuad(m,p(a,.285,1.28),p(b,.285,1.28),p(b,.37,1.28),p(a,.37,1.28),carvedStone);
      addQuad(m,p(a,.34,1.18),p(a,.37,1.28),p(b,.37,1.28),p(b,.34,1.18),carvedStone);
      addQuad(m,p(a,.285,1.28),p(a,.27,1.18),p(b,.27,1.18),p(b,.285,1.28),carvedStone);
      addBeam(m,p(a,.335,1.285),p(b,.335,1.285),.025,oldBronze);
    }
    for(const sign of[-1,1])polyline(m,[[x+sign*.29*scale,1.13,z],
      [x+sign*.43*scale,1.12,z],[x+sign*.43*scale,.87,z],[x+sign*.29*scale,.87,z]],.055,oldBronze);
  };

  {
    const m=mesh('academic_roof_structure');
    // Actual roof slabs terminate around the lantern. The top is +17, matching
    // navigation; zinc seams are raised only a few millimetres.
    for(const[c,size]of[
      [[-8.5,-.12,0],[5,.24,25]], [[7.5,-.12,0],[7,.24,25]],
      [[-1,-.12,-10],[10,.24,5]], [[-1,-.12,9],[10,.24,7]],
    ])addBox(m,c,size,roofZinc);
    // A solid metre-high wall hid the city from the seated glass bays. Keep the
    // physical 1.1 m boundary, but make its visible guard an open bronze rail
    // on a low masonry curb. The fire-escape bridge enters at the NORTH edge.
    for(const[c,size]of[
      [[11.5,0,0],[1,0,27]],
      [[-11.5,0,0],[1,0,27]],
      [[-4.5,0,-13],[15,0,1]], [[8.5,0,-13],[7,0,1]],
      [[0,0,13],[24,0,1]],
    ]){
      const alongX=size[0]>size[2],span=alongX?size[0]:size[2];
      addBox(m,[c[0],.15,c[2]],[size[0],.30,size[2]],roofBrick);
      addBox(m,[c[0],.32,c[2]],[size[0]+.08,.06,size[2]+.08],roofStone);
      for(const h of[.68,1.06])addBox(m,[c[0],h,c[2]],alongX?[span,.07,.075]:[.075,.07,span],roofQuietIron);
      const count=Math.max(2,Math.ceil(span/1.7));
      for(let i=0;i<=count;i++){
        const t=-span/2+span*i/count;
        addBox(m,[c[0]+(alongX?t:0),.70,c[2]+(alongX?0:t)],
          [.075,.77,.075],roofQuietIron);
      }
    }
    // The old terrace has a formal perimeter, rather than a brighter guard.
    // These open lyres occupy only selected panels below the accepted rail;
    // the entire north city-facing guard and bridge opening remain unchanged.
    for(const x of[-8,-4,0,4,8])lyre(m,x,.39,13,.80);
    for(const x of[-11.5,11.5])for(const z of[-6,2,9]){
      const p=(along,h)=>[x,h,z+along];
      for(const sign of[-1,1])polyline(m,[p(sign*.06,.41),p(sign*.22,.48),
        p(sign*.28,.67),p(sign*.20,.88)],.045,roofQuietIron);
      addBeam(m,p(-.20,.88),p(.20,.88),.04,roofQuietIron);
      addBeam(m,p(0,.43),p(0,.91),.035,roofQuietIron);
    }
    // Urns and their moulded stools stand entirely in the outer collision
    // strip. They mark the southern garden end without making invisible
    // obstacles in the promenade or the player's seated north-west view.
    for(const[x,z]of[[-11.5,12.95],[11.5,12.95],[-11.5,7.5],[11.5,7.5]])urn(m,x,z);

    // An open south pavilion gives the roof a civic scale at arrival. Its
    // columns sit inside the existing south boundary; everything bridging
    // the walk is above 2.9 m. A broken pediment and lyre replace the generic
    // industrial silhouette, while the two city-facing lantern bays stay sky.
    const pavilion=ACADEMIC_ROOF_ORNAMENT_CONTRACT.southPavilion;
    for(const x of pavilion.columns){
      const z=pavilion.z;
      for(const[y,w,h,d]of[[.45,.84,.20,.90],[.61,.76,.12,.80],
        [.75,.68,.16,.72],[2.73,.68,.16,.70],[2.89,.82,.16,.84],[3.04,.94,.14,.90]])
        addBox(m,[x,y,z],[w,h,d],carvedStone);
      addCylinder(m,[x,1.72,z],pavilion.shaftRadius,1.98,carvedStone,12);
      for(const dx of[-.18,.18])addBeam(m,[x+dx,.84,z-.25],[x+dx,2.62,z-.25],.035,roofLead);
      // Broad volutes survive reduction as curls on the capital's shoulders.
      for(const sign of[-1,1])arc(m,{x:x+sign*.29,y:2.88,z:z-.32,
        rx:.17,ry:.14,from:0,to:Math.PI*1.65,width:.075,mat:oldBronze,steps:9});
    }
    for(const z of[12.76,13.24]){
      arc(m,{x:-1,y:pavilion.archSpring,z,rx:6,ry:1.44,width:.30,mat:carvedStone,steps:24});
      arc(m,{x:-1,y:pavilion.archSpring+.18,z,rx:6,ry:1.51,width:.13,mat:carvedStone,steps:24});
      // Two emphatic shoulders leave the centre of the pediment broken.
      for(const sign of[-1,1]){
        const edgeX=-1+sign*6,innerX=-1+sign*1.15;
        addBeam(m,[edgeX,4.52,z],[innerX,5.28,z],.32,carvedStone);
        addBeam(m,[edgeX,4.68,z],[innerX,5.44,z],.11,oldBronze);
      }
    }
    // A broad entablature makes this a masonry pavilion instead of a wire
    // outline. Its stepped cornice and deep frieze have full faces in the
    // rain; the arched void remains open above the player's head.
    for(const[y,w,h,d]of[[4.34,12.25,.16,.72],[4.49,12.42,.16,.84],[4.63,12.62,.12,.94]])
      addBox(m,[-1,y,13],[w,h,d],carvedStone);
    for(const x of[-6.6,-5.2,-3.8,-2.4,.4,1.8,3.2,4.6])
      addBox(m,[x,4.22,12.67],[.32,.15,.22],carvedStone);
    for(const x of[-7,-5,-3,-1,1,3,5]){
      const crown=pavilion.archSpring+Math.sqrt(Math.max(0,1-((x+1)/6)**2))*1.44;
      addBeam(m,[x,crown,12.76],[x,crown,13.24],.16,roofQuietIron);
    }
    // The crest is a musical instrument, not a crest invented for a donor.
    // A complete lyric silhouette at this scale can be read from the bridge.
    lyre(m,-1,4.30,12.72,1.55,oldBronze);
    addBox(m,[-1,4.28,12.75],[1.22,.17,.42],carvedStone);
    for(const x of[-7,5]){
      addBox(m,[x,3.71,13],[.50,1.30,.70],carvedStone);
      addBox(m,[x,4.43,13],[.82,.16,.86],carvedStone);
      addEllipsoid(m,[x,4.76,13],[.21,.23,.21],oldBronze,8,12);
    }
    // The same masonry order continues along the two side boundaries. Three
    // open bays on either side frame the district at player scale; their
    // columns stay wholly inside the existing outer metre of collision.
    // There is no roof plane, new walking obstacle or north-facing screen.
    const arcade=ACADEMIC_ROOF_ORNAMENT_CONTRACT.sideArcades;
    for(const x of arcade.x){
      for(const z of arcade.columns){
        for(const[y,w,h,d]of[[.45,.90,.20,.90],[.61,.78,.12,.78],
          [.75,.68,.16,.68],[2.73,.68,.16,.68],[2.89,.82,.16,.82],[3.04,.90,.14,.90]])
          addBox(m,[x,y,z],[w,h,d],carvedStone);
        addCylinder(m,[x,1.74,z],arcade.shaftRadius,1.98,carvedStone,12);
      }
      for(let bay=1;bay<arcade.columns.length;bay++){
        const a=arcade.columns[bay-1],b=arcade.columns[bay],centre=(a+b)/2;
        for(const[raise,width]of[[0,.30],[.16,.12]]){
          const points=Array.from({length:17},(_,i)=>{
            const angle=i/16*Math.PI;
            return[x,arcade.archSpring+raise+Math.sin(angle)*(arcade.archCrown-arcade.archSpring),
              centre+Math.cos(angle)*(b-a)/2];
          });
          polyline(m,points,width,carvedStone);
        }
        // One substantial keystone belongs to each arch, rather than a field
        // of small ornaments that becomes glitter in the shared dither.
        addBox(m,[x,3.99,centre],[.76,.42,.28],carvedStone);
      }
      for(const[y,w,h,d]of[[4.10,.72,.16,18.50],[4.25,.90,.18,18.80]])
        addBox(m,[x,y,0],[w,h,d],carvedStone);
    }
    for(let x=-10.8;x<11;x+=1.15){
      addBox(m,[x,.012,-10.5],[.026,.026,4.9],roofQuietIron);
      addBox(m,[x,.012,10],[.026,.026,5.1],roofQuietIron);
    }
    for(let z=-12;z<=12;z+=1.35){
      addBox(m,[-9,.012,z],[4.1,.026,.026],roofQuietIron);
      addBox(m,[8,.012,z],[6.1,.026,.026],roofQuietIron);
    }
    // Paired low vent stacks create an inhabited service roof without filling
    // the horizon with objects. Their positions keep both sit bays clear.
    for(const[x,z]of[[8.9,8.4],[-8.9,-9.4]]){
      addBox(m,[x,.24,z],[1.12,.48,.92],roofBrick);
      addBox(m,[x,.54,z],[1.32,.12,1.1],roofLead);
      for(let y=.15;y<.48;y+=.09)addBox(m,[x,y,z-.47],[.84,.025,.07],MAT.black);
    }
    // Stone curbs declare the safe, supported glass rectangle.
    for(const x of[-6,4])addBox(m,[x,.055,-1],[.25,.11,13.25],roofStone);
    for(const z of[-7.5,5.5])addBox(m,[-1,.055,z],[10.25,.11,.25],roofStone);
    // Roof marker at the return. The city remains dominant above this low curb.
    addBox(m,[8.3,.035,-9.0],[1.4,.07,1.05],roofStone);
    buildRoofFormalPromenades({m,materials,addQuad});
    buildRoofGrotesques({m,materials,carvedStone,addBox,addBeam,addEllipsoid,addCylinder,addQuad});
    buildRoofGardenFlora({m,materials,addQuad,addBeam,addCylinder});
  }
  {
    const m=mesh('academic_roof_glazing');
    // Pane planes stay just below collision height, with broad iron ribs and
    // a handful of replacement panes. The shader material is dark wired glass.
    for(let ix=0;ix<5;ix++)for(let iz=0;iz<6;iz++){
      const x=-4+ix*2,z=-5.4167+iz*2.1667;
      addBox(m,[x,-.022,z],[1.90,.04,2.0667],MAT.roofGlass);
      // A pale rake on one edge survives VFD reduction as a pane reflection.
      if((ix===1&&iz===1)||(ix===3&&iz===4))
        addBox(m,[x-.83,.004,z],[.035,.009,1.73],roofLead);
    }
    for(let x=-5;x<=5;x+=2)addBox(m,[x,.055,0],[.10,.11,13],roofQuietIron);
    for(let z=-6.5;z<=6.51;z+=13/6)addBox(m,[0,.055,z],[10,.11,.10],roofQuietIron);
    // Two surviving end ribs give the 13 m atrium light a recognisable
    // school roof silhouette. Their uprights stand on the existing stone curbs;
    // the arch and ridge are over two metres above the walkable glass, so the
    // player can cross beneath them and still sit in the open rain. This is
    // the old glazed canopy's iron skeleton, not a new barrier or false floor.
    const frameProfile=[[-5,2.18],[-3.5,2.58],[0,2.76],[3.5,2.58],[5,2.18]];
    for(const z of[-5,5]){
      for(const x of[-5,5])addBeam(m,[x,.12,z],[x,2.18,z],.046,roofQuietIron);
      // The north span is lost above the gallery: its two surviving shoulders
      // mark the end of the light without drawing a bright bar across the
      // sitter's city horizon.
      const segments=z<0?[1,4]:[1,2,3,4];
      for(const i of segments){
        const [ax,ay]=frameProfile[i-1], [bx,by]=frameProfile[i];
        addBeam(m,[ax,ay,z],[bx,by,z],.055,roofQuietIron);
      }
    }
    // The middle bay and ridge have fallen away. This keeps the seated city
    // horizon clear instead of drawing a lit cage across it.
    for(const x of[-5,5])addBeam(m,[x,2.18,-5],[x,2.18,5],.030,roofQuietIron);
    // The surviving SOUTH end retains its foundry work. Mouldings hug the
    // existing curbs and scrolls stay in the shoulders above the old spring;
    // the missing north span, all thirty panes and both sit bays remain open.
    for(const x of[-5,5]){
      for(const[y,w,h,d]of[[.10,.23,.08,.38],[.19,.20,.10,.31],
        [2.10,.19,.12,.25],[2.19,.25,.07,.30]])
        addBox(m,[x,y,5],[w,h,d],roofQuietIron);
      addBox(m,[x,2.23,5],[.17,.045,.22],oldBronze);
      const sign=x<0?-1:1,inner=x-sign*1.35;
      addBeam(m,[x,2.18,5],[inner,2.18,5],.065,roofQuietIron);
      arc(m,{x:x-sign*.48,y:2.34,z:5,rx:.32,ry:.17,
        from:sign<0?-.45:.4,to:sign<0?Math.PI*1.45:Math.PI*1.9,
        width:.045,steps:12});
      addEllipsoid(m,[inner,2.51,5],[.10,.10,.045],oldBronze,8,12);
    }
    lyre(m,0,2.77,5,.85,roofQuietIron);
    addEllipsoid(m,[0,2.79,5],[.11,.075,.065],oldBronze,8,12);
    // Repairs remain safe glazing; no pane is a trap or invisible void.
    addBox(m,[-2,-.004,-1.0833],[1.90,.03,2.0667],roofLead);
    addBox(m,[4,-.004,3.25],[1.90,.03,2.0667],roofLead);
    // Under-glass primary beams read from the gallery as real roof support.
    for(const x of[-5,-1,3,5])addBeam(m,[x,-.31,-6.5],[x,-.31,6.5],.19,roofQuietIron);
  }
  {
    const m=mesh('academic_roof_service_stair');
    // Pivot: physical (94, 0, +10). The gate opens north from the gallery at
    // z=2 onto a small grate, then the bolted fire escape runs WEST beside
    // the school's actual north wall and returns EAST to the roof bridge.
    const run=(a,b,fromH,toH,width,rises,sideSign)=>{
      const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz),ux=dx/length,uz=dz/length;
      const px=-uz*sideSign,pz=ux*sideSign,going=length/rises,rise=(toH-fromH)/rises;
      for(let i=0;i<rises;i++){
        const h=fromH+(i+1)*rise;
        // Three narrow matte bars per tread. Real air remains between them;
        // the depth renderer supplies the street ten metres below, not a slab.
        for(let bar=0;bar<3;bar++){
          const along=(i+(bar+.5)/3)/rises;
          addBox(m,[a[0]+dx*along+px*width/2,h-.025,a[1]+dz*along+pz*width/2],
            [Math.abs(px)*width+Math.abs(ux)*.034,.035,
              Math.abs(pz)*width+Math.abs(uz)*.034],stairIron);
        }
        // Two structural stringers, kept underfoot and nearly black in the
        // game's dither. No bright strip repeats at every tread nose.
        for(const lane of[.08,width-.08]){
          const t=(i+.5)/rises;
          addBox(m,[a[0]+dx*t+px*lane,h-.075,a[1]+dz*t+pz*lane],
            [Math.abs(ux)*going+Math.abs(px)*.045,.07,
              Math.abs(uz)*going+Math.abs(pz)*.045],stairIron);
        }
        if(i%6===5){
          const t=(i+1)/rises;
          addBox(m,[a[0]+dx*t+px*width/2,h+.002,a[1]+dz*t+pz*width/2],
            [Math.abs(ux)*.035+Math.abs(px)*(width-.14),.008,
              Math.abs(uz)*.035+Math.abs(pz)*(width-.14)],nosing);
        }
      }
      // Open fire-escape guards; sparse uprights and two rails, never a cage.
      for(const side of[-.07,width+.07]){
        const aa=[a[0]+px*side,fromH+.95,a[1]+pz*side],bb=[b[0]+px*side,toH+.95,b[1]+pz*side];
        addBeam(m,aa,bb,.045,stairIron);
        addBeam(m,[aa[0],fromH+.45,aa[2]],[bb[0],toH+.45,bb[2]],.034,stairIron);
        for(let j=0;j<=5;j++){
          const t=j/5,x=aa[0]+(bb[0]-aa[0])*t,z=aa[2]+(bb[2]-aa[2])*t;
          const h=fromH+(toH-fromH)*t;
          addBox(m,[x,h+.47,z],[.042,.94,.042],stairIron);
        }
      }
    };
    run([0,-2],[-14,-2],0,3.5,2,18,-1);
    run([-14,-4],[-6,-4],3.5,7,2,18,1);
    const grate=(cx,top,cz,w,d)=>{
      for(const z of[-d/2,d/2])addBox(m,[cx,top-.09,cz+z],[w,.14,.065],stairIron);
      for(const x of[-w/2,w/2])addBox(m,[cx+x,top-.09,cz],[.065,.14,d],stairIron);
      for(let z=-d/2+.16;z<d/2-.05;z+=.34)
        addBox(m,[cx,top-.02,cz+z],[w-.12,.036,.028],stairIron);
      for(let x=-w/2+.22;x<w/2-.05;x+=.9)
        addBox(m,[cx+x,top-.065,cz],[.035,.06,d-.12],stairIron);
    };
    grate(.25,0,0,2.5,4);      // door step: x93..95.5, z -2..2
    grate(-15,3.5,-3,2,6);   // outward turn clears the upper flight's sightline
    grate(-5,7,-3,2,2);      // upper landing
    grate(-5,7,0,2,4);       // bridge to north parapet
    // A solid threshold belongs to the school; the grate starts at once
    // outside it. No second ground-level platform floats beneath the door.
    addBox(m,[0,-.09,1.90],[2.10,.18,.18],zinc);
    // Turn and bridge outer guards. Keep the outward views between posts open.
    const rail=(a,b)=>{
      addBeam(m,[a[0],a[1]+.97,a[2]],[b[0],b[1]+.97,b[2]],.045,stairIron);
      addBeam(m,[a[0],a[1]+.47,a[2]],[b[0],b[1]+.47,b[2]],.032,stairIron);
      const len=Math.hypot(b[0]-a[0],b[2]-a[2]);
      for(let j=0;j<=Math.ceil(len/1.65);j++){
        const t=j/Math.ceil(len/1.65),x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t;
        addBox(m,[x,a[1]+.49,z],[.045,.98,.045],stairIron);
      }
    };
    for(const [a,b] of [
      [[0,0,-2],[1.5,0,-2]], [[1.5,0,-2],[1.5,0,2]],
      [[-16,3.5,-6],[-14,3.5,-6]], [[-16,3.5,-6],[-16,3.5,0]],
      [[-14,3.5,-6],[-14,3.5,-4]],
      [[-14,3.5,0],[-16,3.5,0]],
      [[-6,7,-4],[-4,7,-4]],
      [[-6,7,-2],[-6,7,2]], [[-4,7,-2],[-4,7,2]],
    ])rail(a,b);
    // The projecting turn is a bolted cantilever, not a floating scenic deck.
    // Two dark ties run beneath the grate, leaving the downward view open.
    for(const x of[-15.7,-14.3])
      addBeam(m,[x,1.50,1.82],[x,3.32,-5.80],.075,stairIron);
    // Deep diagonal outriggers and four exposed bolt plates identify a real
    // fire escape fastened to the school rather than a free-floating corridor.
    for(const x of[-13,-9,-5,-1]){
      const lower=3.5*(14+x)/14;
      addBeam(m,[x,lower-.25,1.82],[x,lower-.02,-1.80],.10,stairIron);
      addBox(m,[x,lower-.28,1.84],[.38,.26,.06],zinc);
      for(const bx of[-.12,.12])addBox(m,[x+bx,lower-.27,1.79],[.035,.035,.025],MAT.brass);
    }
    // The only enclosing surface is the school's NORTH masonry. This is a
    // continuous exterior face to true grade, with a human door cut at x=0,
    // y=10..12.3. Big bands survive the dither; tiny court markings did not.
    addBox(m,[-8,-5,1.97],[20,.0+10,.16],facadeBrick); // below sill, grade to gallery
    addBox(m,[-9.55,1.15,1.97],[16.9,2.30,.16],facadeBrick);
    addBox(m,[1.55,1.15,1.97],[.9,2.30,.16],facadeBrick);
    addBox(m,[-8,4.65,1.97],[20,4.70,.16],facadeBrick);
    // Three storey lines, thick enough for the game's dither and spaced at
    // believable school heights. The lintels lead the eye down to the street.
    for(const y of[-9.78,-6.64,-3.36,-.12,2.42,6.75])
      addBox(m,[-8,y,1.84],[20,.18,.31],MAT.stone);
    for(const x of[-17.7,-12.5,-7.3,-2.1,.8])
      addBox(m,[x,-5,1.77],[.32,10,.32],facadeBrick);
    // The escape belongs to an old civic music school. Its wall now carries
    // a readable architectural order all the way to grade: pilaster capitals
    // at storey lines and a deep, layered cornice below the roof. These are
    // attached reliefs against the masonry, never new bars across the drop.
    for(const x of[-17.7,-12.5,-7.3,-2.1,.8]){
      for(const y of[-6.64,-3.36,-.12,2.42]){
        addBox(m,[x,y-.16,1.65],[.62,.16,.29],facadeStone);
        addBox(m,[x,y-.045,1.60],[.84,.09,.39],facadeStone);
        addBox(m,[x,y+.045,1.57],[.92,.075,.43],facadeStone);
      }
      addBox(m,[x,-9.54,1.65],[.65,.48,.36],facadeStone);
      addBox(m,[x,-9.24,1.61],[.75,.12,.42],facadeStone);
    }
    for(const[y,h,depth]of[[6.40,.13,.34],[6.55,.13,.45],[6.70,.16,.58],[6.84,.10,.68]])
      addBox(m,[-8,y,1.80],[20,h,depth],facadeStone);
    for(let x=-17.3;x<1.3;x+=.82)addBox(m,[x,6.34,1.54],[.25,.17,.30],facadeStone);
    const window=(x,y,warm=false)=>{
      // The surrounding matte stone and large glass field retain a silhouette
      // from an oblique downward look, even through the open metalwork.
      addBox(m,[x,y,1.755],[2.35,1.82,.12],MAT.stone);
      addBox(m,[x,y,1.664],[1.88,1.42,.075],warm?courtWindowWarm:windowNight);
      addBox(m,[x,y,1.614],[.055,1.43,.055],cageIron);
      addBox(m,[x,y-.78,1.60],[2.60,.14,.30],MAT.stone);
      // Hood moulding and a projecting keystone form a whole 2.6 m window
      // crown. The broad profile reads through quiet grating at an oblique
      // downward angle; the individual carved beads need not resolve.
      addBox(m,[x,y+.98,1.60],[2.67,.15,.30],facadeStone);
      addBox(m,[x,y+1.09,1.54],[2.83,.08,.38],facadeStone);
      addBox(m,[x,y+.91,1.49],[.25,.42,.28],facadeStone);
      for(const dx of[-1.17,1.17]){
        addBox(m,[x+dx,y+.82,1.60],[.18,.34,.27],facadeStone);
        addBox(m,[x+dx,y-.69,1.57],[.23,.22,.33],facadeStone);
      }
      if(warm)addBox(m,[x,y+.42,1.61],[1.76,.19,.045],gatePlate);
    };
    for(const [row,y] of [[0,-8.25],[1,-5.08],[2,-1.88],[3,1.35],[4,4.70]])
      for(const [col,x] of [[0,-14.8],[1,-9.65],[2,-4.5]])
        window(x,y,row===1&&col===1||row===3&&col===2);
    // Downpipe spans every storey; the lower bulkhead is the one motivated
    // light pool on this elevation (its local light is in conservatory-lights).
    addBeam(m,[-17.2,6.2,1.56],[-17.2,-9.80,1.56],.065,zinc);
    addBox(m,[-9.65,-6.40,1.48],[.58,.18,.20],cageIron);
    addBox(m,[-9.65,-6.50,1.32],[.46,.12,.075],lowerSecurityLens);
    // Grade is actual north street. Broad pavement/kerb and a parked school
    // service car set scale in the downward composition without adding a
    // walkable platform at the stair's height.
    addBox(m,[-8,-9.95,-.35],[20,.10,3.1],MAT.stone); // pavement z -1.9..1.2
    addBox(m,[-8,-9.78,-2.05],[20,.42,.28],MAT.stone); // curb
    addBox(m,[-8,-9.98,-8.0],[20,.035,11.7],courtPaint); // road plane at grade
    for(const x of[-15,-6,3])addBox(m,[x,-9.948,-8],[.12,.012,1.7],MAT.agedWhite);
    addBox(m,[-12,-9.92,-3.1],[1.95,.035,.44],MAT.steel); // drain
    for(let i=0;i<6;i++)addBox(m,[-12.8+i*.31,-9.895,-3.1],[.05,.01,.34],MAT.black);
    // One car and one lamppost are recognizable far below from either guard.
    addBox(m,[-7.2,-9.28,-9.2],[3.75,1.05,1.68],cageIron);
    addBox(m,[-7.2,-8.77,-9.2],[2.38,.42,1.28],zinc);
    for(const x of[-8.52,-5.88])for(const z of[-9.92,-8.48])
      addBox(m,[x,-9.70,z],[.44,.46,.20],MAT.black);
    addBeam(m,[-15.7,-9.85,-4.1],[-15.7,-5.55,-4.1],.075,cageIron);
    addBox(m,[-15.7,-5.51,-4.1],[.62,.12,.30],zinc);
    addBox(m,[-15.7,-5.59,-4.1],[.42,.035,.20],lowerSecurityLens);
    // The roof-height bridge ends in a recognizable capped handoff, without
    // a canopy or opposing wall across the door's open-sky sightline.
    for(const x of[-6.14,-3.86]){
      addBox(m,[x,7.49,1.93],[.15,.98,.15],stairIron);
      addBox(m,[x,8.0,1.93],[.23,.045,.23],MAT.brass);
    }
    addBox(m,[-5,7.012,1.97],[1.9,.024,.08],nosing);
    // Door frame is aligned with the north gallery wall at local z=2.
    for(const x of[-1.08,1.08])addBox(m,[x,1.17,2.0],[.12,2.34,.18],MAT.steel);
    addBox(m,[0,2.35,2.0],[2.28,.15,.18],MAT.steel);
    addBox(m,[0,2.48,1.88],[1.07,.25,.025],gatePlate);
    addBox(m,[0,2.68,1.78],[.66,.12,.19],MAT.steel);
    addBox(m,[0,2.58,1.65],[.45,.13,.04],serviceLens);
    addBox(m,[0,2.50,1.70],[.55,.035,.13],MAT.brass);
  }
  {
    const m=mesh('academic_roof_gate');
    // Only the hinged leaf is dynamic. Its fixed jamb belongs to the stair
    // mesh, so opening the gate never drags the whole doorway into the path.
    addBox(m,[0,1.11,0],[.10,2.14,1.78],gateEnamel);
    for(const z of[-.60,.60])addBox(m,[-.058,1.11,z],[.035,2.05,.07],MAT.steel);
    addBox(m,[-.088,1.11,.86],[.022,2.02,.034],MAT.brass);
    for(const y of[.25,1.94])addBox(m,[-.06,y,0],[.035,.055,1.75],MAT.steel);
    addBox(m,[-.075,1.65,0],[.025,.36,.72],gatePlate);
    for(const z of[-.24,0,.24])addBox(m,[-.092,1.65,z],[.01,.085,.085],MAT.black);
    addBox(m,[-.115,1.02,-.65],[.09,.11,.18],MAT.brass);
  }
  {
    const m=mesh('academic_roof_service_ladder');
    for(const x of[-.36,.36])addBox(m,[x,4.0,.12],[.06,8,.06],MAT.bronze);
    for(let y=.25;y<=7.2;y+=.28)addBox(m,[0,y,.12],[.78,.045,.06],zinc);
    // A broad backing and a half cage make the climb legible at roof distance.
    for(const x of[-.46,.46])addBeam(m,[x,.3,.10],[x,7.65,.10],.045,MAT.steel);
    for(const y of[1.2,2.5,3.8,5.1,6.4,7.4]){
      const radius=.53;
      for(let i=0;i<12;i++){
        const a=i/12*Math.PI,b=(i+1)/12*Math.PI;
        addBeam(m,[Math.cos(a)*radius,y,.10-Math.sin(a)*radius],[Math.cos(b)*radius,y,.10-Math.sin(b)*radius],.038,MAT.steel);
      }
    }
    addBox(m,[0,.69,-.39],[.72,1.38,.045],zinc);
    addBox(m,[.25,.80,-.43],[.10,.12,.035],MAT.brass);
    addBox(m,[0,1.05,-.43],[.38,.18,.025],MAT.agedWhite);
  }
  {
    const m=mesh('academic_roof_seat');
    // The seat is a supported glass panel rather than furniture dumped here.
    addBox(m,[0,.012,0],[1.75,.024,1.35],MAT.roofGlass);
    for(const x of[-.87,.87])addBox(m,[x,.055,0],[.10,.11,1.50],roofQuietIron);
    for(const z of[-.68,.68])addBox(m,[0,.055,z],[1.84,.11,.10],roofQuietIron);
    addBox(m,[0,-.15,0],[1.84,.12,.14],roofQuietIron);
    addBox(m,[.62,.071,-.49],[.28,.018,.18],MAT.brass);
  }

  // Ren has a recognisably ordinary half, including face, sleeve, trouser and
  // worn shoe. Their other half folds *in depth* from cheek to foot. The rent
  // has a different section at each anatomical landmark; no vertical plane or
  // row of circular holes carries the likeness.
  const halfEllipsoid=(m,c,r,mat,lat=12,lon=16)=>{
    const at=(iy,ix)=>{
      const phi=-Math.PI/2+iy/lat*Math.PI,theta=Math.PI/2+ix/lon*Math.PI;
      return[c[0]+Math.cos(phi)*Math.cos(theta)*r[0],c[1]+Math.sin(phi)*r[1],c[2]+Math.cos(phi)*Math.sin(theta)*r[2]];
    };
    for(let y=0;y<lat;y++)for(let x=0;x<lon;x++)addQuad(m,at(y,x),at(y+1,x),at(y+1,x+1),at(y,x+1),mat);
  };
  const wound=(m)=>{
    // x of the inner lip, x of the outer lip, their near depth and the sunken
    // back wall. Each ring twists; the concavity is visible from the profile.
    const landmarks=[
      [1.82,.018,.105,-.105,.06],[1.75,.055,.205,-.130,.105],
      [1.63,-.010,.230,-.158,.155],[1.49,.040,.285,-.170,.135],
      [1.38,-.025,.465,-.205,.195],[1.24,.055,.490,-.190,.210],
      [1.09,-.045,.365,-.176,.195],[.94,.045,.255,-.145,.180],
      [.79,-.035,.270,-.134,.170],[.64,.060,.355,-.135,.200],
      [.47,-.020,.440,-.126,.210],[.31,.055,.305,-.104,.190],
      [.15,.015,.230,-.092,.175],[.045,.035,.135,-.080,.150],
    ];
    // Fair the anatomical landmarks through several short rings. A straight
    // line between every shoulder, waist and hip point made the loss look like
    // a strip of cut cardboard at the game's low viewing angle.
    const s=[];
    for(let i=0;i<landmarks.length-1;i++)for(let j=0;j<4;j++){
      const t=j/4,p0=landmarks[Math.max(0,i-1)],p1=landmarks[i],p2=landmarks[i+1],p3=landmarks[Math.min(landmarks.length-1,i+2)];
      s.push(p1.map((value,k)=>.5*((2*value)+(-p0[k]+p2[k])*t+(2*p0[k]-5*value+4*p2[k]-p3[k])*t*t+(-p0[k]+3*value-3*p2[k]+p3[k])*t*t*t)));
    }
    s.push(landmarks.at(-1));
    // Keep the cheek-side lip forward, but pull the return close to the body.
    // The old 40 cm front/back depth hid all of the openings in profile.
    for(const ring of s)ring[4]*=.26;
    for(let i=0;i<s.length-1;i++){
      const [y,a,b,front,back]=s[i],[yy,aa,bb,ff,bbb]=s[i+1];
      const broken=y<1.59&&y>.25;
      // The back of the rent cannot be one continuous sheet. Leave most of
      // its width absent from shoulder to shin so the city is seen through
      // the missing half, while a narrow recess still hugs living anatomy.
      if(broken){
        const inner=a+.045+(b-a)*.22,innerNext=aa+.045+(bb-aa)*.22;
        const outer=b-.025-(b-a)*.17,outerNext=bb-.025-(bb-aa)*.17;
        addQuad(m,[a+.045,y,back],[aa+.045,yy,bbb],[innerNext,yy,bbb],[inner,y,back],voidMat);
        addQuad(m,[outer,y,back],[outerNext,yy,bbb],[bb-.025,yy,bbb],[b-.025,y,back],voidMat);
      }else addQuad(m,[a+.045,y,back],[aa+.045,yy,bbb],[bb-.025,yy,bbb],[b-.025,y,back],voidMat);
      // The living edge rolls inwards: face, undercut, then dark wall.
      addQuad(m,[a-.050,y,front-.018],[aa-.050,yy,ff-.018],[aa+.020,yy,ff+.020],[a+.020,y,front+.020],lip);
      addQuad(m,[a+.020,y,front+.020],[aa+.020,yy,ff+.020],[aa+.045,yy,bbb],[a+.045,y,back],foldFlesh);
      // Outer fold changes from torn hair/cheek to cloth, hip, and lost leg.
      const cover=(y<1.49&&y>.79)?foldCloth:edge;
      const outerAt=(t,top)=>{
        const bx=top?bb:b,bz=top?bbb:back,fz=top?ff:front;
        return [bx-.025+.110*t,top?yy:y,bz+(fz+.026-bz)*t];
      };
      if(broken){
        // Separated fleshy returns make the lost shoulder, side and leg read
        // as folded-away parts, not a coat hanging from an intact shoulder.
        addQuad(m,outerAt(0,false),outerAt(0,true),outerAt(.35,true),outerAt(.35,false),foldFlesh);
        addQuad(m,outerAt(.68,false),outerAt(.68,true),outerAt(1,true),outerAt(1,false),foldFlesh);
      }else addQuad(m,outerAt(0,false),outerAt(0,true),outerAt(1,true),outerAt(1,false),foldFlesh);
      addQuad(m,[b+.085,y,front+.026],[bb+.085,yy,ff+.026],[bb+.015,yy,ff-.052],[b+.015,y,front-.052],cover);
      // A narrow visible return on the lost side gives the profile a tissue
      // boundary rather than the silhouette of a single hanging cape.
      addQuad(m,[b+.085,y,front+.024],[bb+.085,yy,ff+.024],
        [bb+.079,yy,ff+.001],[b+.079,y,front+.001],lip);
      // Broad helical pleat crosses only part of the void, never a string of
      // pores, sparks, circles or floating atomic fragments.
      if(i===8||i===20||i===36){
        const [endY,endA,endB,endFront]=s[i+3],mid=(a+b)*.5,endMid=(endA+endB)*.5;
        addQuad(m,[b-.030,y,front+.035],[endB-.050,endY,endFront+.025],
          [endMid+.030,endY,endFront+.080],[mid+.015,y,front+.100],lip);
      }
    }
    // The lost shoulder and arm are still legible as anatomy, but curl back
    // inside the same wound before a hand could form.
    const arm=[[.22,1.50,-.05],[.41,1.40,.015],[.46,1.23,.045],[.33,1.05,.090],[.18,.95,.125]];
    for(let i=0;i<arm.length-1;i++){
      const [x,y,z]=arm[i],[xx,yy,zz]=arm[i+1];
      addBeam(m,[x,y,z],[xx,yy,zz],.105,i<2?foldCloth:edge);
    }
  };
  const ren=(name,ritual=false)=>{
    const m=mesh(name);
    // A stooping, peer-aged student rather than a front-facing dress form.
    halfEllipsoid(m,[-.005,1.205,.035],[.265,.365,.155],coat);
    halfEllipsoid(m,[-.002,1.24,-.016],[.205,.285,.149],chalk);
    halfEllipsoid(m,[-.005,.875,.045],[.215,.190,.150],MAT.denim);
    addEllipsoid(m,[-.145,.515,.055],[.096,.385,.112],MAT.denim,12,16);
    addEllipsoid(m,[-.145,.077,-.085],[.103,.073,.195],MAT.black,8,12);
    addBox(m,[-.135,.084,-.230],[.16,.035,.066],MAT.denim);
    const shoulder=[-.244,1.425,.030];
    const elbow=ritual?[-.35,1.235,-.18]:[-.325,1.116,.060];
    const wrist=ritual?[-.175,1.275,-.67]:[-.31,.934,-.030];
    addBeam(m,shoulder,elbow,.145,coat);addEllipsoid(m,elbow,[.075,.080,.077],coat,8,10);
    addBeam(m,elbow,wrist,.090,coat);
    addEllipsoid(m,[wrist[0],wrist[1]-.026,wrist[2]],[.060,.088,.048],flesh,10,12);
    if(ritual)for(let i=0;i<4;i++)addBeam(m,[wrist[0]-.045+i*.026,wrist[1]+.035,wrist[2]-.015],[wrist[0]-.045+i*.026,wrist[1]+.12,wrist[2]-.025],.020,flesh);
    halfEllipsoid(m,[-.010,1.647,.005],[.145,.185,.138],flesh,18,22);
    halfEllipsoid(m,[-.011,1.759,.033],[.153,.086,.147],hair,12,18);
    addEllipsoid(m,[-.091,1.678,-.135],[.053,.025,.016],hair,8,12);
    addEllipsoid(m,[-.088,1.673,-.149],[.012,.009,.006],MAT.ivory,8,12);
    addBeam(m,[-.140,1.706,-.136],[-.045,1.695,-.135],.015,hair);
    addBeam(m,[-.037,1.675,-.129],[-.014,1.605,-.179],.032,flesh);
    addBeam(m,[-.108,1.557,-.134],[-.018,1.560,-.155],.012,hair);
    addEllipsoid(m,[-.123,1.621,-.115],[.025,.051,.026],flesh,8,10);
    addBeam(m,[-.152,1.612,-.133],[-.082,1.590,-.147],.019,flesh);
    addBeam(m,[-.148,1.770,-.055],[-.075,1.737,-.136],.028,hair);
    // A few legible garment facts carry age and everyday life at field range.
    addBeam(m,[-.151,1.531,-.112],[-.035,1.425,-.131],.032,coat);
    addBeam(m,[-.035,1.425,-.131],[-.174,1.295,-.140],.022,coat);
    addBeam(m,[-.238,1.427,-.079],[-.185,1.323,-.144],.023,chalk);
    addBeam(m,[-.205,1.378,-.112],[-.149,1.009,-.109],.017,MAT.cloth);
    addBox(m,[-.380,.942,-.024],[.115,.070,.024],MAT.cloth);
    addBox(m,[-.380,.945,-.043],[.075,.041,.008],MAT.paper);
    wound(m);
  };
  ren('academic_roof_ren');ren('academic_roof_ren_ritual',true);
  {
    const m=mesh('academic_roof_seal_imprint');
    addEllipsoid(m,[0,.22,0],[.13,.14,.014],voidMat,10,16);
    for(let i=0;i<4;i++)addBeam(m,[-.10+i*.062,.28,-.005],[-.11+i*.069,.46-i*.014,-.006],.036,voidMat);
    addBeam(m,[-.10,.19,-.005],[-.18,.28,-.006],.045,voidMat);
    for(let i=0;i<5;i++){
      const y=.11+i*.045;
      addBeam(m,[-.10,y,-.017],[.10,y+.017,-.017],.012,edge);
    }
  }
  {
    const m=mesh('academic_roof_cassette');
    addBox(m,[0,.012,0],[.12,.024,.078],MAT.cloth);
    addBox(m,[0,.026,0],[.10,.004,.056],MAT.paper);
    for(const x of[-.028,.028])addCylinder(m,[x,.030,0],.014,.005,MAT.black,10);
    addBox(m,[0,.031,.022],[.075,.004,.012],MAT.agedWhite);
  }
}
