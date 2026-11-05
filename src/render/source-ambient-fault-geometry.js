// Fixed, flat shards of the same Source fault vocabulary as Earthfall. Each
// cluster is authored in world metres and batched by ink; none is collision,
// a billboard, a moving particle, or an interactive standing rift.
import {SOURCE_RIFT} from '../game/source-rift.js';

export const SOURCE_AMBIENT_FAULT_COLORS=Object.freeze({
  silver:Object.freeze([.84,.88,.94]),black:Object.freeze([.0002,.0003,.0006]),
  magenta:SOURCE_RIFT.ink[0],cyan:SOURCE_RIFT.ink[1],violet:SOURCE_RIFT.ink[2],lime:SOURCE_RIFT.ink[3],
});
const PALETTE=Object.keys(SOURCE_AMBIENT_FAULT_COLORS);
const outline=[
  [[-.60,-.08],[.48,-.31],[.30,.27]],
  [[-.59,-.07],[.34,-.39],[.53,.04],[-.21,.22]],
  [[-.57,-.11],[.42,-.37],[.49,-.04],[.08,.045],[.31,.29],[-.30,.19]],
  [[-.58,-.025],[.46,-.14],[.29,.17],[-.13,.055]],
];
function hash(index,seed){let h=Math.imul(index+137,0x45d9f3b)^Math.imul(seed+59,0x27d4eb2d);h=Math.imul(h^(h>>>16),0x45d9f3b);return((h^(h>>>16))>>>0)/4294967296;}

/** Generate bounded world-space palette batches, preserving each sheet's
 * vertex/index range for inspection. Sites supply fixed centre, spread and
 * density; changing camera, time or reduced-motion state never moves them. */
export function sourceAmbientFaultGeometry({sites=[],palettePrefix='ambient-fault'}={}){
  const groups=Object.fromEntries(PALETTE.map(p=>[p,{p:[],i:[],sheetRanges:[]}]))
  for(const site of sites)for(let n=0;n<site.count;n++){
    const seed=Number(site.seed)||1, h=s=>hash(n,seed*17+s), shape=outline[Math.floor(h(1)*outline.length)],
      x=site.x+(h(2)-.5)*(site.spreadX||0),y=site.y+(h(3)-.5)*(site.spreadY||0),z=site.z+(h(4)-.5)*(site.spreadZ||0),
      size=(site.size||5)*(.45+h(5)*.9),width=size*(.10+h(6)*.62),yaw=h(7)*Math.PI*2,
      pitch=(h(8)-.5)*2.3,roll=(h(9)-.5)*Math.PI*2,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll),
      u=[cy*cp,sp,sy*cp],v=[-sy*cr+sp*cy*sr,-cp*sr,cy*cr+sp*sy*sr],
      pick=h(10),palette=pick<.22?'silver':pick<.36?'black':PALETTE[2+Math.min(3,Math.floor(h(11)*4))],g=groups[palette],base=g.p.length/3,indexStart=g.i.length;
    for(const [a,b] of shape)g.p.push(x+u[0]*a*size+v[0]*b*width,y+u[1]*a*size+v[1]*b*width,z+u[2]*a*size+v[2]*b*width);
    for(let i=1;i<shape.length-1;i++)g.i.push(base,base+i,base+i+1);
    g.sheetRanges.push({id:`${site.id}-${n}`,vertexStart:base,vertexCount:shape.length,indexStart,indexCount:g.i.length-indexStart});
  }
  return PALETTE.filter(p=>groups[p].i.length).map(palette=>{
    const color=SOURCE_AMBIENT_FAULT_COLORS[palette];
    return {id:`${palettePrefix}-${palette}`,name:`${palettePrefix}-${palette}`,kind:'ambient-fault',palette,material:'source-error',
      materialRole:palette==='black'||palette==='silver'?'quiet-metal':'source-chunk-error',base:[...color,1],
      emissive:palette==='black'||palette==='silver'?[0,0,0]:color.map(c=>c*.46),roughness:1,...groups[palette]};
  });
}
