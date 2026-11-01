// One physical trajectory shared by the articulated bird and its camera focus.
// It imports no camera or bird records. Positions remain physical metres.
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const direction=yaw=>[Math.sin(yaw),-Math.cos(yaw)];
const FLIGHT_TRANSITION=1.2;
export function openingOvertureBirdFlight(bird,seconds=0){
  const time=Math.max(0,Number(seconds)||0),age=Math.max(0,time-bird.takeoffAt),grounded=time<bird.takeoffAt;
  if(grounded)return{position:[...bird.perch],heading:bird.heading,age:0,grounded:true,bank:0,velocity:[0,0,0]};
  const a=direction(bird.heading),flockHeading=1.03+bird.turn*.05,b=direction(flockHeading),u=clamp(age/FLIGHT_TRANSITION),v=1-u,
    p1=a.map(n=>n*.6),p3=a.map((n,k)=>n*.55+b[k]*4.2),p2=p3.map((n,k)=>n-b[k]*2.4);
  let horizontal,velocity,bank=0;
  if(age<=FLIGHT_TRANSITION){
    horizontal=p1.map((n,k)=>3*v*v*u*n+3*v*u*u*p2[k]+u*u*u*p3[k]);
    velocity=p1.map((n,k)=>(3*v*v*n+6*v*u*(p2[k]-n)+3*u*u*(p3[k]-p2[k]))/FLIGHT_TRANSITION);
    const acceleration=p1.map((n,k)=>(6*v*(p2[k]-2*n)+6*u*(p3[k]-2*p2[k]+n))/(FLIGHT_TRANSITION**2)),speed=Math.hypot(...velocity),yawRate=(velocity[0]*acceleration[1]-velocity[1]*acceleration[0])/Math.max(.1,speed*speed);
    bank=clamp(-Math.atan(speed*yawRate/9.81),-.5,.5)*smooth(age/.18)*smooth((FLIGHT_TRANSITION-age)/.2);
  }else{
    const t=age-FLIGHT_TRANSITION,distance=6*t+.35*(t-1+Math.exp(-t));horizontal=p3.map((n,k)=>n+b[k]*distance);velocity=b.map(n=>n*(6+.35*(1-Math.exp(-t))));
  }
  const extra=Math.max(0,age-FLIGHT_TRANSITION),height=age<=FLIGHT_TRANSITION?1.65*age+.35*age*age:2.484+2.49*extra+.04*extra*extra,vy=age<=FLIGHT_TRANSITION?1.65+.7*age:2.49+.08*extra;
  return{position:[bird.perch[0]+horizontal[0],bird.perch[1]+height,bird.perch[2]+horizontal[1]],heading:Math.atan2(velocity[0],-velocity[1]),age,grounded:false,bank,velocity:[velocity[0],vy,velocity[1]]};
}
