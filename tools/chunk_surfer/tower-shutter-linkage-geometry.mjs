// Existing Y-up winch coordinates. The shutter is five metres north and100mm
// above it; its nine blades retain their authored -0.16rad plan cant.
export const TOWER_SHUTTER_DRIVE=Object.freeze({
  shutterOffset:Object.freeze([0,.1,-5]),slatYaw:-.16,slatCount:9,slatFirstY:.25,slatPitch:.38,
  spindleStation:1.80,stileStation:1.74,drumRadius:.427,drumY:.72,
});

export function towerShutterDriveLayout(){
  const d=TOWER_SHUTTER_DRIVE,c=Math.cos(d.slatYaw),s=Math.sin(d.slatYaw);
  // Apply the blade's baked yaw, then the retained shutter instance's +pi/2.
  const at=(station,y)=>[-station*s,d.shutterOffset[1]+y,d.shutterOffset[2]+station*c];
  const pivot=at(-d.spindleStation,0),barX=-d.drumRadius;
  const barZ=pivot[2]-(barX-pivot[0])*Math.tan(-d.slatYaw);
  const centres=Array.from({length:d.slatCount},(_,i)=>d.shutterOffset[1]+d.slatFirstY+i*d.slatPitch);
  return{at,axis:[-s,0,c],pivot,barX,barZ,centres,
    drumExit:[barX,d.drumY,0],cableEnd:[barX,d.drumY,barZ],
    bellPivot:[barX,.95,barZ],bellOutput:[barX,.95,barZ+.23],
    rodEye:[barX,1.35,barZ],rodBottom:centres[0]+.11,rodTop:centres.at(-1)+.11};
}

export function buildTowerShutterWinch({mesh,MAT,addCylinder,addCylinderX,addBox,addBeam}){
  const m=mesh('tower_winch');
  // Preserve every existing drum, shaft, crank and wooden grip primitive.
  addCylinder(m,[0,.72,0],.42,.34,MAT.steel,18);
  addCylinder(m,[0,.72,0],.10,.70,MAT.brass,12);
  addBeam(m,[0,.72,-.28],[.58,1.18,-.28],.07,MAT.brass);
  addCylinder(m,[.62,1.22,-.28],.09,.22,MAT.wood,12);

  const d=TOWER_SHUTTER_DRIVE,l=towerShutterDriveLayout();
  // A bolted pedestal supports the original vertical capstan shaft.
  addBox(m,[0,.035,0],[.68,.07,.62],MAT.steel);
  addBox(m,[0,.155,0],[.46,.24,.44],MAT.steel);
  addCylinder(m,[0,.32,0],.15,.16,MAT.brass,12);
  for(const x of[-.25,.25])for(const z of[-.22,.22])addCylinder(m,[x,.082,z],.026,.025,MAT.brass,8);
  // The existing inspection calls out a loaded pawl. Show the actual ratchet
  // contact above the wire wraps, supported back to the stationary pedestal.
  const toothPhase=Math.atan2(.16,.44);
  for(let i=0;i<12;i++){
    const a=toothPhase+i*Math.PI/6;
    addBox(m,[Math.cos(a)*.438,.84,Math.sin(a)*.438],[.070,.035,.040],MAT.brass,a);
  }
  addBeam(m,[.20,.22,.18],[.30,.24,.34],.05,MAT.steel);
  addBeam(m,[.30,.24,.34],[.30,.84,.34],.04,MAT.steel);
  addCylinder(m,[.30,.84,.34],.04,.07,MAT.brass,8);
  addBeam(m,[.30,.84,.34],[.44,.84,.16],.045,MAT.brass);

  // One and a half visible turns leave tangentially at the west of the drum.
  // The entire low wire lies outside the existing protected east catwalk.
  let prior;
  for(let i=0;i<=36;i++){
    const t=i/36,a=-Math.PI*2+t*Math.PI*3;
    const p=[Math.cos(a)*d.drumRadius,.59+t*.13,Math.sin(a)*d.drumRadius];
    if(prior)addBeam(m,prior,p,.018,MAT.steel);
    prior=p;
  }
  addBox(m,[.420,.59,0],[.035,.045,.055],MAT.brass);
  addBeam(m,l.drumExit,l.cableEnd,.018,MAT.steel);
  // The in-line sleeve makes a serviceable wire termination visible.
  addBox(m,[l.barX,.72,-.70],[.045,.045,.20],MAT.brass);

  // Side stiles, crossrails and short blade-axis bearings support the existing
  // wooden slats. No slat, shutter instance or interaction is moved or animated.
  for(const end of[-1,1]){
    const p=l.at(end*d.stileStation,0);
    addBox(m,[p[0],.025,p[2]],[.22,.05,.20],MAT.steel);
    addBeam(m,[p[0],.05,p[2]],[p[0],3.62,p[2]],.075,MAT.steel);
    for(const y of l.centres){
      const bearing=l.at(end*d.stileStation,y-d.shutterOffset[1]);
      // Rotate just the newly added X-cylinder chunk onto the real blade axis.
      const group=m.groups.get(MAT.brass),start=group?.positions.length||0;
      addCylinderX(m,[0,0,0],.041,.30,MAT.brass,10);
      const g=m.groups.get(MAT.brass),yaw=Math.atan2(l.axis[2],l.axis[0]),c=Math.cos(yaw),s=Math.sin(yaw);
      for(let i=start;i<g.positions.length;i+=3){
        const x=g.positions[i],z=g.positions[i+2],nx=g.normals[i],nz=g.normals[i+2];
        g.positions[i]=bearing[0]+x*c-z*s;g.positions[i+1]+=y;g.positions[i+2]=bearing[2]+x*s+z*c;
        g.normals[i]=nx*c-nz*s;g.normals[i+2]=nx*s+nz*c;
      }
    }
  }
  for(const y of[.12,3.62]){
    const a=l.at(-d.stileStation,y-d.shutterOffset[1]),b=l.at(d.stileStation,y-d.shutterOffset[1]);
    addBeam(m,a,b,.075,MAT.steel);
  }

  // A short crank on every blade meets one guided tie bar. Pulling the wire
  // turns the lower bell crank, whose output link lifts that common bar.
  addBeam(m,[l.barX,l.rodBottom,l.barZ],[l.barX,l.rodTop,l.barZ],.035,MAT.steel);
  for(const y of l.centres){
    const pivot=l.at(-d.spindleStation,y-d.shutterOffset[1]);
    addBeam(m,pivot,[l.barX,y+.11,l.barZ],.032,MAT.brass);
  }
  const stile=l.at(-d.stileStation,0);
  for(const y of[.65,1.90,3.15])addBeam(m,[stile[0],y,stile[2]],[l.barX,y,l.barZ],.075,MAT.steel);
  addBeam(m,[stile[0],.95,stile[2]],l.bellPivot,.085,MAT.steel);
  addCylinderX(m,l.bellPivot,.052,.14,MAT.brass,12);
  addBeam(m,l.cableEnd,l.bellPivot,.055,MAT.brass);
  addBeam(m,l.bellPivot,l.bellOutput,.055,MAT.brass);
  addBeam(m,l.bellOutput,l.rodEye,.030,MAT.steel);
  addBox(m,l.rodEye,[.075,.09,.075],MAT.brass);
  return m;
}
