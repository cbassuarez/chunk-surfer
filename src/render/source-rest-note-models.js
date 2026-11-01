// Solid, open architectural modules. The note score assembles them into
// interlocking courts; none is a particle, wire hoop or playable support.
const box=(a,b,c,d,e,f)=>({p:[a,c,e,b,c,e,b,c,f,a,c,f,a,d,e,b,d,e,b,d,f,a,d,f],i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]});
const join=items=>{const p=[],i=[];for(const g of items){const at=p.length/3;p.push(...g.p);i.push(...g.i.map(n=>n+at));}return{p,i};};
function vault({radius=1.04,width=.28,depth=.48,pier=1.24,steps=14}={}){
  const parts=[box(-depth/2,depth/2,0,pier,-radius-width,-radius),box(-depth/2,depth/2,0,pier,radius,radius+width)];
  for(let k=0;k<steps;k++){
    const a=k*Math.PI/steps+.007,b=(k+1)*Math.PI/steps-.007,p=[];
    for(const x of[-depth/2,depth/2])for(const[r,t]of[[radius,a],[radius+width,a],[radius+width,b],[radius,b]])p.push(x,pier+Math.sin(t)*r,Math.cos(t)*r);
    parts.push({p,i:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]});
  }
  return join(parts);
}
function stair(turn=false){
  const parts=[];
  for(let n=0;n<7;n++){
    const x=1.42-n*.42,y=.18+n*.27;
    parts.push(box(x-.22,x+.22,y-.16,y,-.58,.58));
    for(const z of[-.54,.54])parts.push(box(x-.14,x+.14,Math.max(0,y-.44),y-.16,z-.045,z+.045));
  }
  parts.push(box(-1.54,-.98,1.64,1.84,-.74,.74));
  if(turn)for(let n=0;n<5;n++){
    const z=.72+n*.40,y=1.84+n*.22;
    parts.push(box(-1.50,-.42,y-.15,y,z-.22,z+.22));
    parts.push(box(-1.49,-1.41,y,y+.52,z-.035,z+.035));
  }
  else parts.push(vault({radius:.45,width:.13,depth:.24,pier:.72,steps:9}));
  return join(parts);
}
const landing=join([box(-.94,.94,0,.22,-1.24,1.24),box(-.72,.72,-.18,0,-.99,.99),
  box(-.48,.48,-.66,-.18,-.70,.70),box(-.22,.22,-1.1,-.66,-.43,.43),
  ...[-1,1].flatMap(s=>[box(-.9,-.79,.22,.80,s*1.16-.045,s*1.16+.045),box(.79,.9,.22,.80,s*1.16-.045,s*1.16+.045)])]);
const window=join([vault({radius:.63,width:.20,depth:.42,pier:1.42}),
  box(-.40,.40,0,.18,-.98,.98),box(-.15,.15,.18,2.02,-.038,.038),box(-.20,.20,1.1,1.17,-.67,.67),
  box(-.33,.33,2.24,2.39,-1.02,1.02)]);
const bridge=join([box(0,6.30,0,.18,-.64,.64),box(.18,6.12,.18,.22,-.61,.61),
  ...[-1,1].flatMap(s=>[box(0,6.30,-.16,0,s*.54-.06,s*.54+.06),box(.30,.48,.22,.82,s*.57-.035,s*.57+.035),box(5.82,6,.22,.82,s*.57-.035,s*.57+.035)])]);
// A dominant inhabited opening, rather than another repeated little bay.
// Deep voussoirs, stepped abutments and ledges remain broad in the actual
// dither pass; the opening itself is genuinely empty geometry.
const oculus=join([vault({radius:2.20,width:.64,depth:1.35,pier:1.15,steps:24}),
  ...[-1,1].flatMap(s=>[
    box(-.88,.88,-.32,.16,s*2.95-.60,s*2.95+.60),
    box(-.64,.64,.16,1.34,s*2.95-.43,s*2.95+.43),
    box(-.54,.54,1.34,2.18,s*2.95-.32,s*2.95+.32),
    box(-1.10,1.10,1.10,1.32,s*2.90-.86,s*2.90+.86),
    box(-.92,.92,2.12,2.30,s*2.95-.59,s*2.95+.59),
    box(-.38,.38,2.30,2.98,s*2.95-.21,s*2.95+.21)]),
  box(-.92,.92,-.32,-.08,-2.74,2.74)]);
function grandReturn(){
  const parts=[];
  for(let n=0;n<12;n++){
    const x=3.15-n*.42,y=.18+n*.245;
    parts.push(box(x-.23,x+.23,y-.19,y,-.68,.68));
    for(const z of[-.62,.62]){
      parts.push(box(x-.15,x+.15,Math.max(0,y-.53),y-.19,z-.07,z+.07));
      if(n%2===0)parts.push(box(x-.055,x+.055,y,y+.57,z-.045,z+.045));
    }
  }
  parts.push(box(-2.10,-1.44,2.78,3.0,-.90,.90));
  for(let n=0;n<9;n++){
    const z=.80+n*.42,y=3.0+n*.245;
    parts.push(box(-2.10,-.75,y-.19,y,z-.23,z+.23));
    for(const x of[-2.04,-.81])if(n%2===0)parts.push(box(x-.045,x+.045,y,y+.57,z-.055,z+.055));
  }
  parts.push(box(-2.32,-.54,4.77,4.96,3.94,4.52));
  return join(parts);
}
const key={p:[-.18,0,-.17,.18,0,-.17,.11,.58,-.10,-.11,.58,-.10,-.18,0,.17,.18,0,.17,.11,.58,.10,-.11,.58,.10],i:[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]};
const model=(g,material,base,extra={})=>({...g,material,base:[...base,1],...extra});
export function sourceRestNoteGeometryLibrary(){return{
  'rest-note-vault':model(vault(),'linen',[.78,.73,.61]),
  'rest-note-stair':model(stair(),'linen',[.65,.69,.64]),
  'rest-note-return':model(stair(true),'wood',[.65,.46,.28]),
  'rest-note-window':model(window,'linen',[.77,.68,.49]),
  'rest-note-landing':model(landing,'linen',[.68,.66,.58]),
  'rest-note-bridge':model(bridge,'wood',[.60,.44,.27]),
  'rest-note-oculus':model(oculus,'linen',[.72,.73,.63]),
  'rest-note-grand-return':model(grandReturn(),'linen',[.71,.65,.48]),
  'rest-note-keystone':model(key,'worn-metal',[.62,.46,.25],{emissive:[.085,.055,.018]}),
};}
