import {WITNESS_DESIGN,WITNESS_BOARDS,WITNESS_COMPONENTS,WITNESS_CONNECTORS,WITNESS_WIRES,
  WITNESS_TRACES,WITNESS_MOUNTS,WITNESS_SWITCHES,WITNESS_SERVICE_STRIP} from '../src/data/witness-assembly.js';
import {ENDING_IDS} from '../src/progression/schema.js';

const u=1/300,front=.232,point=(x,y,depth=0)=>[(x-368)*u,(202.5-y)*u,front-depth*u];
export function witnessModelInternals(g){
  const {box,cylinder,ring,tube,group,label}=g;
  const part=(id,fn)=>group([0,0,0],[0,0,0],`witness-part:${id}`,fn);
  for(const board of WITNESS_BOARDS)part(board.id,()=>{
    box(point(board.x+board.w/2,board.y+board.h/2,board.depth),[board.w*u,board.h*u,2.2*u],'witness-pcb',undefined,1.2*u,'laminated-PCB');
    for(const x of[board.x+5,board.x+board.w-5])for(const y of[board.y+4,board.y+board.h-4]){
      cylinder(point(x,y,board.depth-1.5),2*u,1.2*u,'brass',[Math.PI/2,0,0],16,undefined,'board-mount-eyelet');
      cylinder(point(x,y,board.depth-2.2),.7*u,.4*u,'darkInk',[Math.PI/2,0,0],12,undefined,'board-mount-center');
    }
  });
  for(const [index,points]of WITNESS_TRACES.entries()){
    tube(points.map(([x,y])=>point(x,y,28.5)),.45*u,'witness-copper',`witness-trace:${index+1}`,Math.max(4,points.length*2));
    for(const[x,y]of[points[0],points.at(-1)])ring(point(x,y,28.3),1.3*u,.32*u,'witness-copper',[0,0,0],16,'plated-via');
  }
  for(const c of WITNESS_COMPONENTS)part(c.id,()=>{
    const depth=(WITNESS_DESIGN.boardDepth+c.depth)/2,height=(WITNESS_DESIGN.boardDepth-c.depth)*u;
    if(c.kind==='capacitor'){
      cylinder(point(c.x,c.y,depth),c.w*u*.5,height,'witness-capacitor',[Math.PI/2,0,0],32,undefined,'drawn-capacitor-can');
      ring(point(c.x,c.y,c.depth+.8),c.w*u*.46,.6*u,'steel',[0,0,0],24,'rolled-can-rim');
      box(point(c.x,c.y,c.depth-.12),[c.w*u*.55,.45*u,.4*u],'darkInk',[0,0,.6],0,'capacitor-relief-score');
      box(point(c.x,c.y,c.depth-.13),[c.w*u*.55,.45*u,.4*u],'darkInk',[0,0,-.6],0,'capacitor-relief-score');
      box(point(c.x-c.w*.34,c.y,depth),[1.8*u,c.h*u*.73,height*.78],'witness-cream',undefined,0,'capacitor-polarity-stripe');
    }else if(c.kind==='film'){
      box(point(c.x,c.y,depth),[c.w*u,c.h*u,height],'witness-amber',undefined,1.7*u,'formed-film-capacitor');
      for(const x of[c.x-c.w*.3,c.x+c.w*.3])tube([point(x,c.y,28),point(x,c.y+3,24)],.45*u,'steel',`capacitor-lead:${c.id}`,4);
    }else if(c.kind==='ic'){
      for(let i=0;i<8;i++)for(const side of[-1,1]){
        const x=c.x-c.w*.4+i*c.w*.8/7;
        tube([point(x,c.y+side*c.h*.65,28),point(x,c.y+side*c.h*.52,c.depth+1)],.5*u,'steel',`ic-pin:${c.id}`,3);
      }
      box(point(c.x,c.y,depth),[c.w*u,c.h*u,height],'rubber',undefined,.8*u,'DIP-package');
      cylinder(point(c.x-c.w*.37,c.y,c.depth-.1),1*u,.2*u,'witness-cream',[Math.PI/2,0,0],12,undefined,'package-pin-one');
    }else{
      tube([point(c.x-c.w*.75,c.y,28),point(c.x+c.w*.75,c.y,28)],.45*u,'steel',`resistor-lead:${c.id}`,3);
      cylinder(point(c.x,c.y,c.depth),c.h*u*.5,c.w*u,'witness-cream',[0,0,Math.PI/2],16,undefined,'axial-resistor');
      for(const[offset,mat]of[[-.22,'witness-oxblood'],[-.07,'darkInk'],[.1,'witness-oxblood'],[.27,'brass']]){
        cylinder(point(c.x+c.w*offset,c.y,c.depth),c.h*u*.51,1.6*u,mat,[0,0,Math.PI/2],16,undefined,'resistor-band');
      }
    }
    label(c.id,point(c.x-c.w*.4,c.y+c.h*.5+4,28.2),3.2*u,'witness-ink');
  });
  for(const connector of WITNESS_CONNECTORS)part(connector.id,()=>{
    box(point(connector.x,connector.y,23),[9*u,6*u,9*u],'witness-cream',undefined,.6*u,'keyed-connector');
    for(let i=0;i<connector.pins;i++)cylinder(point(connector.x-2.4+i*2.4,connector.y,17.5),.45*u,3*u,'brass',[Math.PI/2,0,0],12,undefined,`connector-contact:${connector.id}:${i+1}`);
  });
  for(const wire of WITNESS_WIRES)part(wire.id,()=>{
    tube(wire.points.map(([x,y],i)=>point(x,y,i===0||i===wire.points.length-1?16:12)),wire.radius*u,`witness-${wire.color}`,`harness:${wire.from}:${wire.to}`,40);
    // Sleeves clamp the authored run; the conductor still reaches both pins.
    for(const i of[1,wire.points.length-2]){
      const[x,y]=wire.points[i];box(point(x,y,11),[wire.radius*3.3*u,4*u,wire.radius*2.8*u],'rubber',undefined,.5*u,'harness-retainer');
    }
  });
  const strip=WITNESS_SERVICE_STRIP;
  box(point(strip.x+strip.w/2,strip.y+strip.h/2,strip.depth),[strip.w*u,strip.h*u,1.2*u],'graphite',undefined,.8*u,'witness-service-strip');
  label('RETURN SERVICE',point(strip.x+7,strip.y+8,strip.depth-1),4*u,'witness-ink');
  for(const[id,index]of ENDING_IDS.map((id,index)=>[id,index])){
    group(point(strip.x+11+index*18,strip.y+16,strip.depth-1.2),[0,0,0],`witness-ending:${id}`,()=>{
      ring([0,0,0],2.1*u,.55*u,'brass',[0,0,0],16,'earned-service-stamp');
      box([0,0,.2*u],[2*u,.5*u,.3*u],'witness-ink',[0,0,.6],0,'stamp-mark');
    });
  }
  for(const sw of WITNESS_SWITCHES)part(sw.part,()=>{
    box(point(sw.x,sw.y+10,24),[21*u,18*u,9*u],'rubber',undefined,1*u,'switch-housing');
    for(const side of[-1,1])box(point(sw.x+side*12,sw.y+12,27),[4*u,3*u,1.5*u],'brass',undefined,0,'switch-solder-lug');
    group(point(sw.x,sw.y+12,10),[0,0,0],`witness-stem:${sw.id}`,()=>{
      box([0,0,0],[6*u,6*u,26*u],'witness-cream',undefined,.6*u,'visible-switch-plunger');
      // A visible actuator foot below the cap follows real key travel.
      box([0,-12*u,2*u],[12*u,5*u,8*u],'steel',undefined,.6*u,'actuator-foot');
    });
  });
  for(const [x,y]of WITNESS_MOUNTS){
    cylinder(point(x,y,18),7*u,29*u,'brass',[Math.PI/2,0,0],32,undefined,'witness-threaded-insert');
    for(let n=0;n<5;n++)ring(point(x,y,6+n*4),7.1*u,.35*u,'witness-copper',[0,0,0],24,'insert-knurl');
  }
}

export function witnessReplacementPlate(g){
  const {plate,roundedRect,holeRect,box,label,tube}=g;
  // Protective service sleeve lies behind the separate replacement faceplate.
  box([0,0,-.047],[2.48,1.35,.014],'witness-sleeve',undefined,.028,'protective-service-sleeve');
  box([0,0,-.033],[2.36,1.25,.003],'graphite',undefined,.015,'acid-free-support-card');
  const face=roundedRect(712*u,370*u,.022);
  face.holes.push(holeRect(0,(202.5-195.5)*u,666*u,239*u,.013));
  for(const sw of WITNESS_SWITCHES)face.holes.push(holeRect((sw.x-368)*u,(202.5-sw.y)*u,91*u,35*u,.01));
  plate(face,.025,[0,0,0],'witness-polymer',undefined,.006,'replacement-clear-faceplate');
  label('WITNESS EDITION',[-.94,.54,.016],.035,'witness-ink');
  label('SERVICE DEMONSTRATOR',[-.94,-.535,.016],.021,'witness-ink');
  label('FIT AT VAN',[-.25,0,-.022],.052,'witness-ink');
  for(const y of[-.645,.645])tube([[-1.20,y,-.045],[0,y,-.045],[1.20,y,-.045]],.004,'witness-cream','heat-sealed-sleeve-edge',6);
}
