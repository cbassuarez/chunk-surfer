// The navigator has two separate display technologies in one metal housing.
// The map occupies smoked VFD glass; takes and exposure occupy a reflective
// LCD below it, after the VFD cover and its clipping scope have unwound.
export function navigatorDisplayLayout(aperture,{telemetry=false}={}){
  // The supplied aperture is the standard shell opening. Its lower margin is
  // reassigned to metal and a second cutout; the external HUD budget stays fixed.
  const lcdH=aperture.h>=14?4.15:3.15;
  const lcd=telemetry?{x:aperture.x+.15,y:aperture.y+aperture.h+1.2-lcdH,
    w:Math.max(1,aperture.w-.3),h:lcdH}:null;
  const mapAperture={...aperture,h:Math.max(1,telemetry?lcd.y-aperture.y-.7:aperture.h)};
  const panel={x:mapAperture.x+.65,y:mapAperture.y+.55,w:Math.max(1,mapAperture.w-1.3),h:Math.max(1,mapAperture.h-1.1)};
  const viewport={x:panel.x,y:panel.y+1.2,w:panel.w,h:Math.max(1,panel.h-3)};
  const footer={x:panel.x,y:viewport.y+viewport.h+.25,w:panel.w,h:1};
  return{aperture:mapAperture,panel,viewport,footer,lcd};
}
