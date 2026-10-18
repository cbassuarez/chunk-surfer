// Material-space finish for runtime physical print. No opacity/coverage edits,
// synthetic illumination, moving grain, or damage to the literal inscription.
// Tiny structure is omitted when it cannot be represented at its real scale.
const PROFILES=Object.freeze({
 paper:{rough:.90,inkRough:.77,metal:0,colour:.018,structureM:.0012,heightM:.000006,reliefM:.000003,grain:[1,3]},
 'painted-metal':{rough:.49,inkRough:.74,metal:0,colour:.009,structureM:.0010,heightM:.0000015,reliefM:.000008,grain:[8,1]},
 'satin-metal':{rough:.58,inkRough:.85,metal:.70,colour:.012,structureM:.0013,heightM:.000002,reliefM:.000007,grain:[8,1]},
});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
function seedNumber(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function lattice(x,y,seed){let h=Math.imul(x|0,374761393)^Math.imul(y|0,668265263)^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295*2-1;}
function field(x,y,seed,period=null){const at=(a,b)=>lattice(period?(a%period[0]+period[0])%period[0]:a,period?(b%period[1]+period[1])%period[1]:b,seed);const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,u=a*a*(3-2*a),v=b*b*(3-2*b);return(1-v)*((1-u)*at(ix,iy)+u*at(ix+1,iy))+v*((1-u)*at(ix,iy+1)+u*at(ix+1,iy+1));}
export function physicalPrintFinish(bitmap,{profile='paper',widthM,heightM,seed='physical-print',repeat=false}={}){
 const spec=PROFILES[profile];if(!spec)throw new RangeError('Unknown runtime print finish '+profile);
 const {width,height}=bitmap;
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||bitmap.pixels?.length!==width*height*4)throw new RangeError('Physical print needs a complete RGBA bitmap');
 if(!(widthM>0&&heightM>0&&Number.isFinite(widthM)&&Number.isFinite(heightM)))throw new RangeError('Physical print finish needs dimensions in metres');
 const pixels=new Uint8Array(bitmap.pixels),normal=new Uint8Array(pixels.length),orm=new Uint8Array(pixels.length),heights=new Float32Array(width*height),s=seedNumber(seed),dx=widthM/width,dy=heightM/height;
 const resolved=spec.structureM>=2*Math.max(dx,dy),broadM=.19,broadPeriod=repeat?[Math.max(1,Math.round(widthM/broadM)),Math.max(1,Math.round(heightM/broadM))]:null,grainPeriod=repeat?[Math.max(1,Math.round(widthM/(spec.structureM*spec.grain[0]))),Math.max(1,Math.round(heightM/(spec.structureM*spec.grain[1])))]:null;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=y*width+x,at=i*4,a=pixels[at+3]/255,px=(x+.5)*dx,py=(y+.5)*dy;
  const broad=field(broadPeriod?(x+.5)/width*broadPeriod[0]:px/broadM,broadPeriod?(y+.5)/height*broadPeriod[1]:py/broadM,s,broadPeriod),grain=resolved?field(grainPeriod?(x+.5)/width*grainPeriod[0]:px/(spec.structureM*spec.grain[0]),grainPeriod?(y+.5)/height*grainPeriod[1]:py/(spec.structureM*spec.grain[1]),s^123319,grainPeriod):0;
  // Tonal stock variation belongs to the material, not its word-sized edge.
  // Opaque pigment cores retain exact RGB and every coverage byte survives.
  const gain=1+(broad*spec.colour+grain*.006)*(1-a);
  for(let k=0;k<3;k++)pixels[at+k]=Math.round(clamp(pixels[at+k]*gain,0,255));
  const rough=clamp(spec.rough+broad*.018+grain*.018,.08,1);
  orm[at]=255;orm[at+1]=Math.round((rough*(1-a)+spec.inkRough*a)*255);orm[at+2]=Math.round(spec.metal*(1-a)*255);orm[at+3]=255;
  heights[i]=grain*spec.heightM+a*spec.reliefM;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const left=repeat?(x+width-1)%width:Math.max(0,x-1),right=repeat?(x+1)%width:Math.min(width-1,x+1),top=repeat?(y+height-1)%height:Math.max(0,y-1),bottom=repeat?(y+1)%height:Math.min(height-1,y+1),i=(y*width+x)*4;
  const gx=(heights[y*width+right]-heights[y*width+left])/((repeat?2:right-left)*dx),gy=(heights[bottom*width+x]-heights[top*width+x])/((repeat?2:bottom-top)*dy),len=Math.hypot(gx,gy,1);
  normal[i]=Math.round((-gx/len*.5+.5)*255);normal[i+1]=Math.round((-gy/len*.5+.5)*255);normal[i+2]=Math.round((1/len*.5+.5)*255);normal[i+3]=255;
 }
 return{...bitmap,pixels,normalPixels:normal,ormPixels:orm,finish:{version:1,profile,localSpecular:true},finishEvidence:{widthM,heightM,repeat,stationary:true,pigmentCoverage:'unchanged',physicalStructureM:spec.structureM,structureResolved:resolved,stockRoughness:spec.rough,pigmentRoughness:spec.inkRough,baseMetallic:spec.metal,reliefM:spec.reliefM,noPerimeterDamage:true}};
}
