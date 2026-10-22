// Promoted from the verified Source drive study; game lifecycle is source-drive-session.js.
// Isolated, finite ordinary approach. No production floorplan/save dependency.
import {ALIGNMENT,HEIGHT_PROFILE,ROUTE,ROUTE_DRAIN_RANGES} from './route-layout.js';
import {roadTreatmentAt} from './route-treatment.js';
export const ROAD=Object.freeze({halfWidth:ROUTE.halfWidth,shoulderWidth:ROUTE.shoulderWidth,edgeBlend:.3});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease=(a,b,v)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*t*(10+t*(-15+6*t));};
function slope(rows,i,key){if(i===0||i===rows.length-1)return 0;const a=rows[i-1],b=rows[i],c=rows[i+1],m0=(b[key]-a[key])/(b.d-a.d),m1=(c[key]-b[key])/(c.d-b.d);return m0*m1<=0?0:(c[key]-a[key])/(c.d-a.d);}
function profile(d,key){const rows=key==='h'?HEIGHT_PROFILE:ALIGNMENT;let i=0;while(i<rows.length-2&&d>rows[i+1].d)i++;const a=rows[i],b=rows[i+1],span=b.d-a.d,t=clamp((d-a.d)/span,0,1),delta=b[key]-a[key],m0=slope(rows,i,key)*span,m1=slope(rows,i+1,key)*span,c3=10*delta-6*m0-4*m1,c4=-15*delta+8*m0+7*m1,c5=6*delta-3*m0-3*m1;return{value:a[key]+m0*t+c3*t**3+c4*t**4+c5*t**5,derivative:(m0+3*c3*t*t+4*c4*t**3+5*c5*t**4)/span,second:(6*c3*t+12*c4*t*t+20*c5*t**3)/(span*span)};}
export function roadAt(distance=0){const d=Number.isFinite(distance)?distance:0,x=profile(d,'x'),height=profile(d,'h'),horizontalScale=Math.hypot(1,x.derivative),treatment=roadTreatmentAt(d),bay=ROUTE.pullIn,apron=ROUTE.arrival,departure=ROUTE.departure,departureWidth=departure.extraWidth*(1-ease(departure.fullEnd,departure.end,d)),pullIn=ease(bay.start,bay.fullStart,d)*(1-ease(bay.fullEnd,bay.end,d)),arrival=ease(apron.start,apron.stopStart,d),leftWidth=treatment.halfWidth+departureWidth+bay.extraWidth*pullIn+apron.extraLeftWidth*arrival,rightWidth=treatment.halfWidth+departureWidth+apron.extraRightWidth*arrival;return{distance:d,x:x.value,z:-d,heading:Math.atan(x.derivative),curvature:x.second/Math.pow(1+x.derivative*x.derivative,1.5),height:height.value,grade:height.derivative/horizontalScale,halfWidth:treatment.halfWidth,shoulderWidth:treatment.shoulderWidth,leftWidth,rightWidth,leftShoulderWidth:treatment.shoulderWidth,rightShoulderWidth:treatment.shoulderWidth,pullIn,arrival,departureWidth,treatment,derivativeX:x.derivative,secondDerivativeX:x.second,longitudinalScale:Math.hypot(1,x.derivative,height.derivative)};}
// Route-local coordinates. Body/scene world offsets are deliberately external.
export function worldAt(distance=0,lateral=0,heightOffset=0){const road=roadAt(distance),c=Math.cos(road.heading),s=Math.sin(road.heading);return{...road,lateral,x:road.x+lateral*c,z:road.z+lateral*s,y:road.height+heightOffset,pitch:Math.atan(road.grade)};}
export function roadSurfaceAt(x,z){
 // Closest-point projection preserves surface offsets on real bends, including
 // the widened pull-in. Merely evaluating roadAt(-z) would skew distant verges.
 let d=-z;for(let i=0;i<3;i++){const r=roadAt(d),g=(r.x-x)*r.derivativeX+(d+z),dg=1+r.derivativeX*r.derivativeX+(r.x-x)*r.secondDerivativeX;d-=clamp(g/Math.max(.2,dg),-16,16);}
 const road=roadAt(d),offset=(x-road.x)*Math.cos(road.heading)+(z+road.distance)*Math.sin(road.heading),abs=Math.abs(offset),edge=offset<0?road.leftWidth:road.rightWidth;
 const shoulder=smooth(edge-.08,edge+Math.min(ROAD.edgeBlend,road.shoulderWidth*.7),abs),grass=smooth(edge+road.shoulderWidth-.08,edge+road.shoulderWidth+.25,abs),snow=road.treatment.snowCover,grip=((.68*(1-shoulder)+.43*shoulder)*(1-grass)+.3*grass)*(1-.34*snow),rolling=.014+shoulder*.035+grass*.04+snow*.016;
 let drainage=0;for(const channel of ROUTE_DRAIN_RANGES){const along=ease(channel.start,channel.start+1,d)*(1-ease(channel.end-1,channel.end,d)),lateral=channel.adaptiveEdge?-(road.leftWidth+.12):channel.lateral,away=Math.abs(offset-lateral);drainage=Math.min(drainage,-.20*along*(1-ease(.18,.35,away)));}
 const roughness=drainage+shoulder*(.008*Math.sin(d*2.7)+.004*Math.sin(d*6.1+x*.8))+grass*.009*Math.sin(d*1.3+x*.6),crown=-Math.min(abs,road.halfWidth)*(.012-.008*road.treatment.expanse);
 return{...road,offset,drainage,snowCover:snow,kind:grass>.5?'verge':shoulder>.5?'shoulder':'asphalt',grip,rolling,roughness,height:road.height+crown+roughness};
}
