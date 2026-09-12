import * as THREE from 'three';

// Instrument axes match the recorder: front +Z, lettering in the XY plane.
// Hardware is authored, with open sockets, guarded shafts and service backs.
export function benchAmplifier(variant,g){
 const {group,box,cylinder,ring,plate,screw,label,jack,roundedRect,holeRect}=g;
 const low=variant==='low-draw',high=variant==='headroom';
 const w=low?.92:high?1.48:1.18,h=low?1.20:high?1.62:1.42,d=low?.32:high?.57:.43;
 const finish=low?'amp-low-draw':high?'amp-headroom':'amp-faceplate';
 const number=low?'2':high?'3':'1';
 group([0,0,0],[0,0,0],`amplifier-${variant}-assembly`,()=>{
  box([0,0,0],[w,h,d],'graphite',undefined,.055,'amplifier-diecast-chassis');
  box([0,0,d/2+.013],[w-.055,h-.055,.034],finish,undefined,.021,'amplifier-front-panel');
  for(const x of[-1,1])for(const y of[-1,1])screw([x*(w/2-.068),y*(h/2-.068),d/2+.034],.018);
  label('AUDIOCORP',[-w/2+.12,h/2-.18,d/2+.033],low?.041:.049,'darkInk');
  if(high)label('AUDIOCORP',[-w/2+.12,h/2-.18,d/2+.035],.049,'ink');
  label(`PA-${number}`,[-w/2+.12,h/2-.31,d/2+.034],.057,high?'ink':'darkInk');
  label(low?'LOW DRAW':high?'HIGH HEADROOM':'REFERENCE',[-w/2+.12,-h/2+.12,d/2+.034],low?.034:.037,high?'ink':'darkInk');
  // Continuous gain scale with a real index, no animated or invented meter.
  const ky=high?-.14:-.08,kr=high?.172:low?.112:.145;
  ring([0,ky,d/2+.039],kr+.028,.009,'steel',[0,0,0],48,'gain-shaft-collar');
  cylinder([0,ky,d/2+.094],kr,.108,'rubber',[Math.PI/2,0,0],48,undefined,'protected-gain-knob');
  cylinder([0,ky,d/2+.150],kr*.82,.008,'graphite',[Math.PI/2,0,0],48,undefined,'gain-knob-inset');
  for(let i=0;i<32;i++){
   const a=i*Math.PI*2/32;box([Math.cos(a)*kr,ky+Math.sin(a)*kr,d/2+.09],[.013,.019,.09],'graphite',[0,0,a],.003,'gain-knob-knurl');
  }
  box([-.026,ky+kr*.49,d/2+.157],[.011,kr*.31,.003],'ink',[0,0,-.28],.001,'gain-index');
  for(let i=0;i<11;i++){
   const a=Math.PI*.2+i/10*Math.PI*1.6;
   box([Math.sin(a)*(kr+.073),ky+Math.cos(a)*(kr+.073),d/2+.035],[.006,.024,.002],high?'ink':'darkInk',[0,0,-a],0,'gain-scale-mark');
  }
  label('GAIN',[-.066,ky+kr+.145,d/2+.035],.040,high?'ink':'darkInk');
  for(const side of[-1,1]){
   // End rails protect the shaft when the amplifier lies face-down.
   box([side*(w/2-.10),0,d/2+.075],[.075,h-.30,.11],'steel',undefined,.017,'raised-protection-rail');
   jack([side*w*.25,h/2+.011,0],high?.078:.062,[-Math.PI/2,0,0]);
   label(side<0?'IN':'OUT',[side*w*.25-.05,h/2-.40,d/2+.036],.034,high?'ink':'darkInk');
  }
  if(high){
   for(const side of[-1,1])for(let i=0;i<8;i++)box([side*(w/2+.036),-.48+i*.137,-.036],[.115,.055,d-.02],'amp-headroom',undefined,.008,'high-headroom-heat-sink-fin');
   box([0,.41,d/2+.035],[.34,.135,.015],'rubber',undefined,.014,'headroom-pad-recess');
   box([-.075,.41,d/2+.052],[.145,.092,.025],'amber',undefined,.010,'headroom-pad-slide');
   label('PAD',[-.047,.535,d/2+.035],.032,'ink');
  }else if(low){
   box([0,.22,d/2+.037],[.18,.075,.020],'rubber',undefined,.009,'low-draw-power-recess');
   box([-.042,.22,d/2+.054],[.079,.049,.022],'olive',undefined,.007,'low-draw-power-slide');
  }else{
   cylinder([.35,.26,d/2+.058],.033,.048,'steel',[Math.PI/2,0,0],24,undefined,'reference-monitor-toggle-collar');
   cylinder([.35,.26,d/2+.099],.013,.045,'graphite',[Math.PI/2,0,0],16,undefined,'reference-monitor-toggle');
  }
  group([0,0,-d/2-.009],[0,Math.PI,0],'amplifier-service-back',()=>{
   box([0,0,0],[w-.09,h-.09,.025],'enamel',undefined,.028,'amplifier-back-cover');
   box([0,-.10,.020],[w-.25,h*.55,.024],finish,undefined,.024,'amplifier-battery-door');
   screw([0,-h*.31,.036],.025);
   label(`PA-${number}`,[-w/2+.16,h/2-.22,.021],.043,'ink');
   label('FIELD CELL',[-w/2+.16,-.06,.035],low?.031:.037,high?'ink':'darkInk');
   for(const x of[-1,1])for(const y of[-1,1])box([x*(w/2-.11),y*(h/2-.11),.035],[.11,.10,.048],'rubber',undefined,.02,'amplifier-protective-foot');
   // Formed spring clip has daylight beneath it, not a painted strap.
   box([0,h*.20,.080],[.17,h*.28,.031],'steel',undefined,.012,'amplifier-belt-clip');
   box([0,h*.33,.047],[.17,.06,.089],'steel',undefined,.012,'amplifier-belt-clip-root');
  });
 });
}

export function benchFlashlight(variant,g){
 const {group,box,cylinder,ring,tube,plate,screw,label,add,roundedRect,holeRect}=g;
 const flood=variant==='flood',thrower=variant==='throw',r=thrower?.14:flood?.163:.132;
 group([0,0,0],[0,0,0],`flashlight-${variant}-assembly`,()=>{
  cylinder([0,0,0],r,1.16,'flashlight-housing',undefined,48,undefined,'flashlight-main-barrel');
  cylinder([0,-.63,0],r+.018,.12,'flashlight-housing',undefined,48,undefined,'flashlight-threaded-tailcap');
  ring([0,-.568,0],r+.006,.014,'rubber',undefined,48,'flashlight-tail-seal');
  cylinder([0,-.699,0],r*.69,.026,'rubber',undefined,32,undefined,'flashlight-tail-switch');
  for(let i=0;i<24;i++){
   const a=i*Math.PI*2/24;
   box([Math.cos(a)*(r+.004),-.07,Math.sin(a)*(r+.004)],[.017,.60,.012],'graphite',[0,-a,0],.003,'flashlight-longitudinal-grip');
  }
  for(const yy of[-.43,.27])ring([0,yy,0],r+.006,.012,'steel',undefined,48,'flashlight-grip-end-band');
  for(let i=0;i<5;i++)ring([0,-.675+i*.020,0],r+.020,.006,'graphite',undefined,48,'flashlight-tail-knurl');
  box([0,.04,-r-.058],[.084,.62,.028],'steel',undefined,.011,'flashlight-spring-pocket-clip');
  box([0,.31,-r-.024],[.084,.085,.075],'steel',undefined,.012,'flashlight-pocket-clip-root');
  tube([[0,-.22,-r-.06],[0,-.30,-r-.07],[0,-.32,-r-.018]],.014,'steel','flashlight-clip-return',12);
  ring([0,-.62,-r-.033],.044,.009,'steel',[Math.PI/2,0,0],28,'flashlight-lanyard-eye');
  label(`FL-${flood?'3':thrower?'2':'1'}`,[-.052,.34,r+.004],.030,'ink');
  const opticalHead=({radius,depth,front,position,rotation})=>{
   group(position,rotation,'flashlight-optical-head',()=>{
    const profile=[new THREE.Vector2(radius*.19,-depth),new THREE.Vector2(radius*.34,-depth*.79),new THREE.Vector2(radius*.63,-depth*.48),new THREE.Vector2(radius*.87,-depth*.16),new THREE.Vector2(radius,0)];
    // Reverse the meridian so the single-sided normals face the optical
    // cavity, not the hidden outside of the reflector.
    add(new THREE.LatheGeometry(profile.reverse(),64),'flashlight-reflector',undefined,undefined,'flashlight-real-parabolic-reflector');
    cylinder([0,-depth-.013,0],radius*.22,.024,'graphite',undefined,32,undefined,'flashlight-emitter-mount');
    box([0,-depth+.002,0],[radius*.22,.009,radius*.22],'flashlight-emitter',undefined,.003,'flashlight-passive-emitter');
    const rim=new THREE.Shape();rim.absellipse(0,0,radius+.025,radius+.025,0,Math.PI*2,false);
    const hole=new THREE.Path();hole.absellipse(0,0,radius,radius,0,Math.PI*2,true);rim.holes.push(hole);
    plate(rim,.052,[0,.017,0],'steel',[Math.PI/2,0,0],.004,'flashlight-lens-retaining-ring');
    cylinder([0,.013,0],radius,.012,'flashlight-lens',undefined,64,undefined,'flashlight-clear-optical-lens');
   });
  };
  if(flood){
   box([0,.61,0],[.48,.36,.36],'flashlight-housing',undefined,.068,'flood-right-angle-head');
   // Two overlapping wide optics in a rectangular guarded head.
   for(const x of[-.115,.115])opticalHead({radius:.106,depth:.09,position:[x,.61,.205],rotation:[Math.PI/2,0,0]});
   for(const x of[-.265,.265])box([x,.61,.065],[.025,.27,.37],'steel',undefined,.011,'flood-head-wire-guard');
   box([0,.805,0],[.20,.032,.16],'rubber',undefined,.024,'flood-top-switch');
   for(let i=0;i<6;i++)box([0,.495+i*.043,-.198],[.36,.013,.039],'graphite',undefined,.004,'flood-head-cooling-fin');
  }else{
   const hr=thrower?.294:.197,depth=thrower?.31:.16;
   cylinder([0,.57,0],hr,.21,'flashlight-housing',undefined,64,r+.008,'flashlight-flared-head-body');
   const yy=thrower?.87:.745;
   // Lathed hollow rim leaves an actual cavity around the reflector.
   const profile=[new THREE.Vector2(hr+.024,0),new THREE.Vector2(hr+.025,-depth*.8),new THREE.Vector2(hr*.74,-depth-.04),new THREE.Vector2(hr*.65,-depth),new THREE.Vector2(hr-.004,-depth*.74),new THREE.Vector2(hr-.005,0)];
   add(new THREE.LatheGeometry(profile.reverse(),64),'flashlight-housing',[0,yy,0],undefined,'flashlight-open-optical-housing');
   opticalHead({radius:hr-.012,depth,position:[0,yy,0],rotation:[0,0,0]});
   for(let i=0;i<(thrower?5:3);i++)ring([0,.59+i*.044,0],hr+.029,.012,'graphite',undefined,48,'flashlight-head-cooling-ring');
   box([0,.425,r+.013],[.088,.121,.031],'rubber',undefined,.020,'flashlight-side-switch');
  }
 });
}

export function benchFaceplate(finish,g){
 const {group,plate,cylinder,label,roundedRect,holeRect}=g,unit=1/300;
 const p=(x,y,z=0)=>[(x-368)*unit,(202.5-y)*unit,z];
 group([0,0,0],[0,0,0],`replacement-faceplate-${finish}`,()=>{
  const face=roundedRect(712*unit,370*unit,.022);
  face.holes.push(holeRect(0,(202.5-195.5)*unit,666*unit,239*unit,.013));
  for(const x of[459.5,558.5,657.5])face.holes.push(holeRect((x-368)*unit,(202.5-350.5)*unit,91*unit,35*unit,.010));
  for(const x of[25,711])for(const y of[28,372]){
   const hole=new THREE.Path();hole.absellipse((x-368)*unit,(202.5-y)*unit,.013,.013,0,Math.PI*2,true);face.holes.push(hole);
  }
  plate(face,.032,[0,0,0],`faceplate-${finish}`,undefined,.006,'replacement-faceplate-with-eight-real-apertures');
  const ink=finish==='black'?'ink':'darkInk';
  label('AUDIOCORP',p(35,49,.022),14*unit,ink);
  label('DA-1000',p(329,49,.022),11*unit,ink);
  label('FIELD RECORDER',p(586,49,.022),9.5*unit,ink);
  label('RECORD / MONITOR',p(35,350,.022),8.7*unit,ink);
  label('VACUUM FLUORESCENT',p(35,366,.022),8.7*unit,ink);
  group([0,0,-.022],[0,Math.PI,0],'replacement-faceplate-service-reverse',()=>{
   label('DA-1000 SERVICE PART',[-1.08,.49,0],.027,ink);
   label('FIT WITH POWER OFF',[-1.08,-.54,0],.023,ink);
  });
 });
}
