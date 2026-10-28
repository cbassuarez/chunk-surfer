// Original, bounded replacements for the existing ordinary neighbourhood.
// A window is a masonry aperture, a reveal, a timber sash and an interior bay;
// its sparse practical is behind that construction. No transparency or glow
// card hides a solid wall. All parts use the ordinary opaque prop pipeline.
import {EXTERIOR_NEIGHBOURHOOD as C,EXTERIOR_TRADE_DEEDS,EXTERIOR_FRONTAGE_DRESSING,exteriorDeedWindowLit,exteriorDeedClosedEarly} from '../../src/data/exterior-frontages.js';
const material=(name,rgb,metallicFactor=0,roughnessFactor=.9,extra={})=>({name,pbrMetallicRoughness:{baseColorFactor:[...rgb,1],metallicFactor,roughnessFactor},...extra});
export const NEIGHBOURHOOD_MATERIALS={
  brick:material('ellery red brick',[.25,.095,.052],0,.94),
  terracotta:material('dull terracotta',[.42,.17,.08],0,.86),
  stone:material('chapel stone',[.43,.44,.41],0,.86),
  slate:material('wet slate',[.075,.09,.105],.03,.52),
  black:material('black lacquer',[.025,.028,.03],.15,.28),
  white:material('aged white paint',[.69,.72,.66],.03,.68),
  steel:material('painted steel',[.22,.24,.23],.7,.46),
  wood:material('dark wood',[.16,.095,.052],0,.72),
  green:material('pub green paint',[.075,.18,.12],0,.66),
  brass:material('brass',[.49,.31,.08],.8,.25),
  plaster:material('neighbourhood room plaster',[.22,.19,.145],0,.94),
  curtain:material('neighbourhood curtain',[.27,.24,.17],0,.95),
  litRoom:material('neighbourhood reflected lamplight',[.28,.205,.12],0,.95,{emissiveFactor:[.42,.255,.10]}),
  bulb:material('neighbourhood domestic bulb',[.70,.54,.28],0,.48,{emissiveFactor:[.9,.57,.22]}),
  paper:material('neighbourhood closure paper',[.66,.64,.54],0,.91),
  canvas:material('faded canvas blind',[.24,.235,.17],0,.96),
  stock:material('shop reflected ivory stock',[.62,.58,.44],0,.83,{emissiveFactor:[.055,.045,.027]}),
  shopInterior:material('old shop interior plaster',[.14,.115,.08],0,.94,{emissiveFactor:[.014,.010,.005]}),
};
const midpoint=(a,b)=>a.map((n,k)=>(n+b[k])/2);
export function buildExteriorNeighbourhood(api){
  for(const k of['mesh','addBox','addBeam','addCylinder','addQuad'])if(typeof api[k]!=='function')throw Error(`Neighbourhood needs ${k}`);
  const ids={};for(const[key,m]of Object.entries(NEIGHBOURHOOD_MATERIALS)){let i=api.materials.findIndex(p=>p.name===m.name);if(i<0){i=api.materials.length;api.materials.push(structuredClone(m));}ids[key]=i;}
  const reports=[];
  const owner=(mesh)=>{const m=api.mesh(mesh),r={mesh,parts:[],windows:[],notices:[],prints:[],trades:[],deeds:[],triangles:0};reports.push(r);return{m,r};};
  function context({m,r},prefix='',map=p=>p){
    const box=(id,c,s,key)=>{api.addBox(m,map(c),s,ids[key]);r.parts.push({id:prefix+id,kind:'box',center:map(c),size:s,material:key});r.triangles+=12;};
    const beam=(id,a,b,w,key)=>{api.addBeam(m,map(a),map(b),w,ids[key]);r.parts.push({id:prefix+id,kind:'beam',a:map(a),b:map(b),width:w,material:key});r.triangles+=12;};
    const cylinder=(id,c,radius,height,key,sides=8)=>{api.addCylinder(m,map(c),radius,height,ids[key],sides);r.parts.push({id:prefix+id,kind:'cylinder',center:map(c),radius,height,material:key});r.triangles+=sides*4;};
    const quad=(id,a,b,c,d,key)=>{const points=[a,b,c,d].map(map);api.addQuad(m,...points,ids[key]);r.parts.push({id:prefix+id,kind:'quad',points,material:key});r.triangles+=2;};
    const tri=(id,a,b,c,key)=>{const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a),o=a.map((v,k)=>(v+b[k]+c[k])/3);quad(id+'a',a,ab,o,ca,key);quad(id+'b',b,bc,o,ab,key);quad(id+'c',c,ca,o,bc,key);};
    return{box,beam,cylinder,quad,tri,point:map,id:id=>prefix+id};
  }
  function splitWall(b,{height,width=7.84,depth=.34,openings,material='brick',id='front'}){
    const ys=[...new Set([0,height,...openings.flatMap(o=>[o.y0,o.y1])])].filter(y=>y>=0&&y<=height).sort((a,b)=>a-b);
    for(let j=1;j<ys.length;j++){
      const y0=ys[j-1],y1=ys[j],y=(y0+y1)/2,holes=openings.filter(o=>y>o.y0&&y<o.y1).sort((a,b)=>a.z0-b.z0);let cursor=-width/2;
      for(const[k,o]of [...holes,{z0:width/2,z1:width/2}].entries()){
        if(o.z0>cursor+1e-7)b.box(`${id}-${j}-${k}`,[-depth/2,y,(cursor+o.z0)/2],[depth,y1-y0,o.z0-cursor],material);
        cursor=Math.max(cursor,o.z1);
      }
    }
  }
  function window(b,r,{id,z,y,w=1.25,h=1.55,lit=false,seed=0,casement=false}){
    const back=-C.roomDepth,edge=.055,frame=casement?'steel':'white',aperture={id,z0:z-w/2,z1:z+w/2,y0:y-h/2,y1:y+h/2};
    const origin=b.point([0,0,0]),normal=b.point([1,0,0]).map((v,k)=>v-origin[k]);
    r.windows.push({...aperture,id:b.id(id),center:b.point([0,y,z]),normal,width:w,height:h,lit,backDepth:C.roomDepth,frameDepth:.11,roomLamp:lit?b.point([-.50,y+h*.35,z+w*.27]):null});
    b.box(id+'-room-back',[back-.035,y,z],[.07,h,w],lit?'litRoom':'black');
    for(const side of[-1,1]){
      b.box(id+'-room-return-'+side,[-.41,y,z+side*(w/2+.027)],[.78,h,.054],lit?'litRoom':'plaster');
      b.box(id+'-reveal-'+side,[-.16,y,z+side*(w/2+.027)],[.32,h,.054],'stone');
      b.box(id+'-jamb-'+side,[.035,y,z+side*(w/2-.035)],[.11,h,.075],frame);
    }
    for(const side of[-1,1]){
      b.box(id+'-room-floor-ceiling-'+side,[-.41,y+side*(h/2+.03),z],[.78,.06,w],lit?'litRoom':'plaster');
      b.box(id+'-frame-head-foot-'+side,[.035,y+side*(h/2-.035),z],[.11,.075,w],frame);
    }
    b.box(id+'-sill',[.075,y-h/2-.055,z],[.44,.11,w+.30],'stone');
    b.box(id+'-sill-drip',[.21,y-h/2-.088,z],[.045,.035,w+.19],'black');
    b.box(id+'-lintel',[.025,y+h/2+.11,z],[.34,.16,w+.29],'stone');
    b.box(id+'-mullion',[.055,y,z],[.09,h-.10,.055],frame);
    b.box(id+'-meeting-rail',[.075,y-(casement?-.12:.06),z],[.11,.075,w-.10],frame);
    // Separate upper/lower rails leave genuine four-light voids. Their 55–75mm
    // sections retain area after reduction instead of shimmering hairlines.
    if(casement)for(const offset of[-.42,.42])b.box(id+'-industrial-transom-'+offset,[.055,y+offset,z],[.09,.055,w-.10],'steel');
    const curtainSide=seed%2?1:-1,curtainWidth=w*(lit?.21:.32);
    b.box(id+'-hanging-curtain',[-.28,y+.02,z+curtainSide*(w/2-curtainWidth/2-.07)],[.045,h-.08,curtainWidth],lit?'curtain':'black');
    if(lit){
      b.box(id+'-lamp-stand',[-.55,y-h*.23,z+w*.25],[.08,h*.45,.065],'wood');
      b.box(id+'-lamp-shade',[-.50,y+h*.24,z+w*.25],[.27,.25,.28],'bulb');
      // An opaque ordinary object behind the sash breaks the window into a
      // room silhouette. It is smaller than the aperture and never a person.
      b.box(id+'-room-shelf',[-.49,y-h*.30,z-w*.19],[.26,.09,w*.42],'wood');
      for(let k=0;k<3;k++)b.box(id+'-room-books-'+k,[-.53,y-h*.19,z-w*.30+k*.10],[.14,.22+.035*(k%2),.065],k===1?'curtain':'wood');
    }
    return aperture;
  }
  function tradeWindow(b,r,slot,{closed}){
    const id=closed?'closed-shop-display':'shop-display',z=-.14,y=1.94,w=4.30,h=1.76,lit=!closed&&slot.deed%3!==1;
    const aperture={id,z0:z-w/2,z1:z+w/2,y0:y-h/2,y1:y+h/2};
    r.windows.push({...aperture,id:b.id(id),center:b.point([0,y,z]),normal:[1,0,0],width:w,height:h,lit,backDepth:C.roomDepth,frameDepth:.11,trade:slot.display});
    b.box(id+'-room-back',[-.815,y,z],[.07,h,w],lit?'shopInterior':'black');
    for(const side of[-1,1]){
      b.box(id+'-room-return-'+side,[-.41,y,z+side*(w/2+.027)],[.78,h,.054],'plaster');
      b.box(id+'-reveal-'+side,[-.16,y,z+side*(w/2+.027)],[.32,h,.054],'stone');
      b.box(id+'-jamb-'+side,[.035,y,z+side*(w/2-.035)],[.11,h,.075],slot.paint);
      b.box(id+'-room-floor-ceiling-'+side,[-.41,y+side*(h/2+.03),z],[.78,.06,w],'wood');
      b.box(id+'-frame-head-foot-'+side,[.035,y+side*(h/2-.035),z],[.11,.075,w],slot.paint);
    }
    b.box(id+'-sill',[.075,1.01,z],[.44,.11,w+.30],'stone');
    b.box(id+'-lintel',[.025,2.93,z],[.34,.16,w+.29],'stone');
    b.box(id+'-mullion',[.055,y,z],[.09,h-.10,.065],slot.paint);
    b.box(id+'-meeting-rail',[.075,2.46,z],[.11,.075,w-.10],slot.paint);
    b.box(id+'-room-shelf',[-.49,1.12,z],[.45,.08,w-.30],'wood');
    if(lit)b.box(id+'-lamp-shade',[-.51,2.71,z],[.22,.10,.62],'bulb');
    const stock=lit?'stock':'paper',put=(name,cy,dz,sy,sz,key=stock,x=-.47)=>b.box(`shop-stock-${slot.display}-${name}`,[x,cy,z+dz],[.24,sy,sz],key);
    if(closed){
      // A folded internal blind still leaves a strip of the display observable.
      for(let j=0;j<5;j++)b.box('shop-closed-blind-'+j,[-.22,1.58+j*.244,z],[.035,.23,w-.12],j%3===0?'black':'canvas');
    }else if(slot.display==='books'){
      for(let j=0;j<5;j++)put('volume-'+j,1.49,-1.55+j*.68,.58+(j%2)*.12,.26,j%2?'green':stock);
    }else if(slot.display==='print'){
      for(let j=0;j<4;j++)put('paper-ream-'+j,1.19+j*.075,.95,.065,.74);
      put('press-bed',1.29,-.83,.08,1.02,'steel');
      for(const side of[-1,1])put('press-upright-'+side,1.68,-.83+side*.38,.79,.065,'steel');
      put('press-crown',2.08,-.83,.10,1.04,'steel');put('press-platen',1.55,-.83,.065,.75,'wood');
      put('press-spindle',1.84,-.83,.42,.06,'brass');
      b.beam('shop-stock-print-press-handle',[-.43,1.98,z-1.14],[-.43,1.98,z-.52],.035,'wood');
    }else if(slot.display==='cloth'){
      for(let j=0;j<5;j++){put('folded-length-'+j,1.18+j*.11,-.75,.10,1.55,j%2?'canvas':stock);put('roll-'+j,1.67,.55+j*.23,.98,.19,j%2?'green':'canvas');}
    }else if(slot.display==='bottles'||slot.display==='flowers'){
      for(let j=0;j<5;j++){
        b.cylinder(`shop-stock-${slot.display}-vessel-${j}`,[-.47,1.48,z-1.47+j*.71],.12,.55,j%2?'green':'terracotta',6);
        if(slot.display==='flowers')b.beam(`shop-stock-flowers-stem-${j}`,[-.47,1.7,z-1.47+j*.71],[-.47,2.12,z-1.34+j*.71],.025,'wood');
        else put('bottle-neck-'+j,1.82,-1.47+j*.71,.19,.09,'green');
      }
      b.box('shop-stock-'+slot.display+'-back-shelf',[-.58,2.11,z],[.26,.055,w-.34],'wood');
    }else if(slot.display==='vessels'){
      for(let j=0;j<5;j++){b.cylinder('shop-stock-vessels-cup-'+j,[-.46,1.43,z-1.48+j*.72],.14,.22,stock,6);b.box('shop-stock-vessels-saucer-'+j,[-.46,1.29,z-1.48+j*.72],[.32,.035,.36],stock);}
      put('stepped-plinth',1.18,0,.10,3.8,'wood');
    }else if(slot.display==='clocks'){
      for(let j=0;j<3;j++){put('clock-case-'+j,1.75,-1.2+j*1.20,.87,.72,'wood');put('clock-face-'+j,1.93,-1.2+j*1.20,.39,.45,stock,-.445);b.beam('shop-stock-clocks-hand-'+j,[-.30,1.93,z-1.2+j*1.2],[-.30,2.07,z-1.31+j*1.2],.025,'black');}
    }else if(slot.display==='tools'){
      for(let j=0;j<4;j++){b.beam('shop-stock-tools-shaft-'+j,[-.43,1.28,z-1.4+j*.83],[-.43,2.12,z-1.4+j*.83],.055,'wood');put('tool-head-'+j,2.11,-1.4+j*.83,.13,.39,'steel');}
      put('wooden-bins',1.25,0,.23,3.8,'wood');
    }else if(slot.display==='frames'){
      for(let j=0;j<2;j++)for(const side of[-1,1]){put(`frame-${j}-upright-${side}`,1.89,-.94+j*1.87+side*.46,.96,.09,'wood');put(`frame-${j}-rail-${side}`,1.89+side*.45,-.94+j*1.87,.09,1.01,'wood');}
    }else{
      for(let j=0;j<6;j++)put('wrapped-stock-'+j,1.36+(j%2)*.13,-1.56+j*.61,.30,.44,j%2?'terracotta':stock);
      put('counter',1.15,0,.09,3.85,'wood');
    }
    return aperture;
  }
  function shopOrder(b,r,slot,{closed}){
    const paint=slot.paint,z=-.14;
    b.box('shop-stall-riser',[.045,.50,z],[.17,.88,4.48],paint);
    b.box('shop-riser-repaired-board',[.139,.48,z+.84],[.018,.28,1.08],slot.deed%2?'wood':'green');
    for(const dz of[-2.46,2.21]){b.box('shop-pilaster-'+dz,[.10,1.91,dz],[.22,2.93,.18],paint);b.box('shop-capital-'+dz,[.14,3.025,dz],[.29,.12,.32],'stone');}
    b.box('shop-fascia',[.08,3.40,0],[.22,.64,7.54],paint);
    b.box('shop-fascia-cornice',[.14,3.76,0],[.36,.105,7.69],'stone');
    b.box('shop-fascia-shadow',[.12,3.705,0],[.24,.035,7.65],'black');
    // A closed shop door and a separate narrower stair door retain ordinary
    // trade/household access without suggesting another playable interior.
    for(const[role,dz,width]of[['flat',-3.20,.81],['shop',2.98,.93]]){
      b.box(role+'-closed-door',[-.11,1.48,dz],[.12,2.82,width],paint);
      for(const side of[-1,1])b.box(role+'-door-jamb-'+side,[.035,1.49,dz+side*(width/2+.05)],[.16,2.98,.10],paint);
      b.box(role+'-door-upper-glass',[-.035,2.17,dz],[.025,.76,width-.20],'black');
      b.box(role+'-door-panel',[-.02,.73,dz],[.045,.80,width-.20],paint);
      b.beam(role+'-door-pull',[.08,1.13,dz+.26],[.08,1.40,dz+.26],.035,'brass');
      b.box(role+'-door-step',[.04,.065,dz],[.42,.09,width+.20],'stone');
    }
    const deployed=slot.awning==='deployed'&&!closed;
    b.box('awning-roller-box',[.12,3.015,z],[.25,.18,4.50],paint);
    if(deployed){
      b.quad('awning-canvas-top',[.14,3.10,z-2.25],[.14,3.10,z+2.25],[.97,2.71,z+2.25],[.97,2.71,z-2.25],'canvas');
      b.quad('awning-canvas-under',[.14,3.084,z+2.25],[.14,3.084,z-2.25],[.97,2.694,z-2.25],[.97,2.694,z+2.25],'canvas');
      b.box('awning-front-valance',[.97,2.625,z],[.035,.15,4.50],'canvas');
      for(const side of[-1,1])b.beam('awning-fixing-arm-'+side,[.15,2.78,z+side*2.16],[.96,2.70,z+side*2.16],.045,'steel');
    }else b.box('awning-rolled-canvas',[.145,2.985,z],[.22,.125,4.38],'canvas');
    r.trades.push({deed:slot.deed,display:slot.display,trade:slot.trade,paint:slot.paint,closed,awning:deployed?'deployed':'rolled',awningClearance:deployed?2.55:2.9225});
  }
  for(const row of C.rows){
    const out=owner(row.mesh),{m,r}=out;
    for(let i=0;i<C.count;i++){
      const z=-28+i*8,h=row.heights[i],b=context(out,`deed-${i}-`,p=>[p[0],p[1],p[2]+z]),brick=i%3===1?'terracotta':'brick',closed=exteriorDeedClosedEarly(row.kind,i);
      if(row.openDeed===i){
        const holes=[window(b,r,{id:'passage-bridge-sash',z:0,y:7.60,w:1.25,h:1.36,lit:true,seed:i})];
        // The pre-existing court mouth remains open through its full 6.4m.
        b.box('bridge-back',[-(row.depth+.82)/2,7.6,0],[row.depth-.82,2.2,7.84],brick);
        const bridge=context(out,`deed-${i}-bridge-`,p=>[p[0],p[1]+6.5,p[2]+z]);
        splitWall(bridge,{height:2.2,openings:holes.map(o=>({...o,y0:o.y0-6.5,y1:o.y1-6.5})),material:brick});
        b.box('bridge-string',[.04,6.48,0],[.20,.30,8],'stone');
        for(const side of[-1,1])b.box('passage-party-pier-'+side,[-row.depth+.08,3.2,side*3.89],[.18,6.4,.22],'stone');
        r.deeds.push({deed:i,kind:'open-court',z,height:8.7,windows:1,clearHeight:6.33,closedEarly:false});continue;
      }
      const industrial=row.kind==='workshop'&&h<9,holes=[],floors=industrial?1:Math.max(2,Math.floor((h-1.5)/3.1));
      const trade=EXTERIOR_TRADE_DEEDS[row.kind].find(slot=>slot.deed===i);
      const doorZ=-2.75,doorWidth=industrial?4.8:1.05;
      if(trade)for(const[id,dz,width]of[['flat-door',-3.20,.81],['shop-door',2.98,.93]])holes.push({id,z0:dz-width/2-.06,z1:dz+width/2+.06,y0:.08,y1:2.89});
      else holes.push({id:'door',z0:industrial?-2.4:doorZ-.59,z1:industrial?2.4:doorZ+.59,y0:.08,y1:industrial?3.64:2.89});
      if(industrial){
        for(const[bay,dz]of[-1.55,1.55].entries())holes.push(window(b,r,{id:`industrial-${bay}`,z:dz,y:5.0,w:2.0,h:1.18,lit:exteriorDeedWindowLit(row.kind,i,1,bay),seed:i+bay,casement:true}));
      }else for(let floor=0;floor<floors;floor++){
        if(trade&&floor===0){holes.push(tradeWindow(b,r,trade,{closed}));}
        else if(closed&&floor===0){
          holes.push(window(b,r,{id:'closed-shop-display',z:.75,y:1.98,w:4.35,h:1.85,lit:false,seed:i}));
          // The shop closed for the gathering while its flat above remained
          // lived in. A lowered, folded internal blind carries that distinction.
          for(let j=0;j<7;j++)b.box('shop-closed-blind-'+j,[-.22,1.21+j*.244,.75],[.035,.23,4.19],j%3===0?'black':'wood');
          b.box('shop-stall-riser',[.04,.49,.75],[.16,.86,4.55],'green');
          b.box('shop-plain-fascia',[.05,3.32,0],[.22,.33,7.22],'green');
        }else for(const[bay,dz]of[-.75,2.15].entries())holes.push(window(b,r,{id:`sash-${floor}-${bay}`,z:dz,y:2.05+floor*3.05,lit:exteriorDeedWindowLit(row.kind,i,floor,bay),seed:i+bay}));
      }
      b.box('occupied-back-volume',[-(row.depth+.84)/2,h/2,0],[row.depth-.84,h,7.84],brick);
      splitWall(b,{height:h,openings:holes,material:brick});
      // True party returns and a closed roof preserve the old massing from
      // oblique street/court views; aperture geometry changes only the skin.
      for(const side of[-1,1])b.box('party-return-'+side,[-row.depth/2,h/2,side*3.94],[row.depth,h,.12],brick);
      b.box('rear-wall',[-row.depth+.08,h/2,0],[.16,h,7.84],brick);
      const doorLo=industrial?-2.4:doorZ-.59,doorHi=industrial?2.4:doorZ+.59;
      if(!trade)for(const[index,[a,c]]of [[-3.92,doorLo],[doorHi,3.92]].entries())if(c>a)b.box('plinth-'+index,[.04,.25,(a+c)/2],[.16,.50,c-a],'stone');
      b.box('string-course',[.04,3.45,0],[.18,.16,7.84],'stone');
      b.box('cornice-lower',[.06,h-.57,0],[.20,.12,7.92],'stone');
      b.box('cornice-upper',[.10,h-.39,0],[.28,.18,7.98],'stone');
      if(industrial){
        b.box('shutter-recess',[-.22,1.86,0],[.07,3.48,4.68],'black');
        // Broad folded shutter stock and its alternating raised seams retain
        // weight in motion. No fine grille moire or thin slat alpha texture.
        for(let j=0;j<12;j++)b.box('closed-shutter-leaf-'+j,[-.055,.25+j*.282,0],[.13,.258,4.63],j%3===0?'black':'steel');
        for(const side of[-1,1])b.box('shutter-guide-'+side,[.08,1.9,side*2.49],[.22,3.8,.16],'steel');
        b.box('shutter-box',[.08,3.74,0],[.35,.25,5.14],'steel');
        b.box('shutter-lock',[.055,.43,.36],[.12,.16,.18],'black');
        if(closed){
          const notice=C.notices[0];b.box('early-closure-paper',[.013,1.60,0],[.004,notice.heightM,notice.widthM],'paper');
          r.notices.push({...notice,center:[.017,1.60,z],readerRight:[0,0,-1],up:[0,1,0],deed:i});
          for(const dz of[-.10,.10])b.box('closure-tape-'+dz,[.018,1.60+notice.heightM/2-.015,dz],[.002,.045,.045],'white');
        }
      }else if(trade){
        shopOrder(b,r,trade,{closed});
        if(closed){
          const notice=C.notices[0],center=[-.043,1.52,z+2.98];
          b.box('early-closure-paper',[-.047,1.52,2.98],[.004,notice.heightM,notice.widthM],'paper');
          r.notices.push({...notice,center,readerRight:[0,0,-1],up:[0,1,0],deed:i});
        }
      }else{
        const paint=i%2?'green':'wood';
        b.box('closed-door-leaf',[-.11,1.46,doorZ],[.12,2.74,1.04],paint);
        for(const side of[-1,1])b.box('door-jamb-'+side,[.035,1.49,doorZ+side*.63],[.16,2.98,.14],'white');
        b.box('door-lintel',[.035,2.97,doorZ],[.25,.16,1.50],'stone');
        b.box('door-upper-glass',[-.035,2.14,doorZ],[.025,.77,.73],'black');
        for(const y of[.47,1.04])b.box('door-raised-panel-'+y,[-.02,y,doorZ],[.045,.42,.78],paint);
        b.beam('door-real-pull',[.08,1.10,doorZ+.34],[.08,1.39,doorZ+.34],.035,'brass');
        b.box('door-step',[.06,.065,doorZ],[.42,.09,1.46],'stone');
        if(closed){
          const notice=C.notices[0],center=[-.043,1.52,z+doorZ];
          b.box('early-closure-paper',[-.047,1.52,doorZ],[.004,notice.heightM,notice.widthM],'paper');
          r.notices.push({...notice,center,readerRight:[0,0,-1],up:[0,1,0],deed:i});
          for(const dz of[-.10,.10])b.box('closure-tape-'+dz,[-.042,1.52+notice.heightM/2-.015,doorZ+dz],[.002,.045,.045],'white');
        }
      }
      const rise=industrial?1.1:2.0;
      b.quad('roof-front',[0,h,-4],[-row.depth/2,h+rise,-4],[-row.depth/2,h+rise,4],[0,h,4],'slate');
      b.quad('roof-rear',[-row.depth,h,4],[-row.depth/2,h+rise,4],[-row.depth/2,h+rise,-4],[-row.depth,h,-4],'slate');
      for(const side of[-1,1]){let p=[[0,h,side*4],[-row.depth,h,side*4],[-row.depth/2,h+rise,side*4]];if(side<0)p.reverse();b.tri('solid-gable-'+side,...p,brick);}
      b.box('roof-ridge',[-row.depth/2,h+rise+.035,0],[.15,.10,8],'slate');
      if(i%2===0){b.box('chimney',[-row.depth*.58,h+rise+.75,2.25],[.85,1.5,1.15],'brick');for(const dz of[-.28,.28])b.cylinder('chimney-pot-'+dz,[-row.depth*.58,h+rise+1.7,2.25+dz],.11,.42,'terracotta');}
      b.cylinder('downpipe',[.20,h/2,3.75],.065,h-.35,'steel');
      for(const y of[1,4,7,10].filter(y=>y<h-.5))b.box('pipe-collar-'+y,[.20,y,3.75],[.18,.05,.18],'steel');
      r.deeds.push({deed:i,kind:industrial?'workshop':closed?'closed-shop-with-flat':trade?'shop-with-flat':'house',z,height:h,windows:industrial?2:floors*2-((closed||trade)?1:0),closedEarly:closed});
    }
    // Wall brackets free the existing footway from the former column feet.
    // Their exact lamp centres also author the street-fabric runtime lights.
    const b=context(out,'street-');for(const z of[-25,-9,9,25]){b.box('lamp-wall-plate-'+z,[.15,5.24,z],[.20,.44,.18],'steel');b.beam('lamp-arm-'+z,[.22,5.18,z],[1.10,5.72,z],.075,'steel');b.box('lamp-head-'+z,[1.10,5.80,z],[.46,.16,.28],'bulb');}
  }
  {
    const out=owner(C.court.mesh),{r}=out;
    for(const side of[-1,1]){
      const h=side<0?C.court.leftHeight:C.court.rightHeight,normal=-side;
      // Canonical +X points into the court. Flipping x and z is a proper180°
      // rotation, so face winding and normal orientation stay correct.
      const map=p=>[side*C.court.halfWidth+normal*p[0],p[1],side<0?p[2]:16-p[2]],b=context(out,`court-${side}-`,map),holes=[];
      for(const[index,z]of C.court.windowZ.entries()){
        holes.push(window(b,r,{id:'upper-'+index,z,y:5.1,w:1.22,h:1.40,lit:index===0,seed:index+side}));
        holes.push({id:'closed-door-'+index,z0:z-.575,z1:z+.575,y0:.08,y1:2.755});
        b.box('closed-door-'+index,[-.10,1.42,z],[.10,2.67,1.15],index===2?'white':'wood');
        for(const edge of[-1,1])b.box('door-jamb-'+index+'-'+edge,[.025,1.45,z+edge*.63],[.13,2.9,.11],'stone');
        b.box('door-head-'+index,[.025,2.86,z],[.20,.13,1.44],'stone');
      }
      // splitWall centres its along-wall width at zero; the existing court
      // runs0..16, so offset its input wall and aperture positions together.
      const wall=context(out,`court-${side}-split-`,p=>map([p[0],p[1],p[2]+8]));
      splitWall(wall,{height:h,width:16,depth:.36,openings:holes.map(o=>({...o,z0:o.z0-8,z1:o.z1-8})),material:side<0?'brick':'terracotta'});
      b.box('plinth',[-.015,.30,8],[.13,.60,16],'stone');
      b.box('coping',[-.12,h+.04,8],[.38,.12,16.1],'stone');
      b.cylinder('downpipe',[.10,h/2,15.75],.07,h-.3,'steel');
    }
    const b=context(out,'court-end-');b.box('occupied-end-masonry',[0,4,16.18],[8.9,8,.36],'brick');
    for(const x of[-2.8,0,2.8]){b.box('closed-threshold-'+x,[x,1.9,15.98],[2.2,3.25,.18],'steel');for(let y=.55;y<3.25;y+=.32)b.box('threshold-slat-'+x+'-'+y,[x,y,15.87],[1.95,.07,.08],'black');}
    b.box('end-cornice',[0,7.55,15.96],[8.6,.28,.18],'stone');
    r.deeds.push({kind:'occupied-court',windows:r.windows.length,closedEarly:false});
  }
  for(const placed of EXTERIOR_FRONTAGE_DRESSING){
    const out=owner(placed.mesh),{r}=out;
    for(const slot of placed.shops){
      const z=-28+slot.deed*8;
      r.prints.push({id:`${placed.id}-fascia-${slot.deed}`,lines:[slot.name,slot.trade],
        center:[.194,3.40,z],readerRight:[0,0,-1],up:[0,1,0],widthM:6.95,heightM:.55,
        capHeightM:.21,lineScale:[1,.52],lineCentres:[.32,.77],font:'NimbusRoman-Bold.otf',
        process:'solid painted timber shop fascia',palette:{ground:slot.paint==='green'?[.075,.18,.12]:[.16,.095,.052],ink:[.70,.65,.49]},deed:slot.deed});
    }
    if(placed.workshops.length){
      const b=context(out,'trade-');
      for(const[index,deed]of[0,1,2,5,6].entries()){
        const z=-28+deed*8;
        b.box('workshop-board-'+deed,[.08,4.12,z],[.20,.40,5.60],'steel');
        r.prints.push({id:`${placed.id}-workshop-${deed}`,lines:[placed.workshops[index]],center:[.183,4.12,z],readerRight:[0,0,-1],up:[0,1,0],widthM:5.42,heightM:.29,capHeightM:.19,font:'NimbusSans-Bold.otf',process:'solid painted workshop trade board',palette:{ground:[.22,.24,.23],ink:[.70,.68,.54]},deed});
      }
    }
  }
  return reports;
}
