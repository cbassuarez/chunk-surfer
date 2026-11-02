// Both optical openings share the existing B3/control-room partition. The
// south pane gives the console operator a real view of the live-room mouth.
// Neither opening changes the wall's body collision or the B2-only entrance.
export const B3_WINDOW = Object.freeze({
  planeX:18.5, partitionX:18, bottom:-2.95, top:-.95, floor:-4,
  panes:Object.freeze([
    Object.freeze({id:'b3-control-window',z0:8,z1:13,frame:'b3_window_surround'}),
    Object.freeze({id:'b3-control-south-window',z0:14,z1:17,frame:'b3_window_south_surround'}),
  ]),
});

export function b3WindowPaneAt(z){
  return B3_WINDOW.panes.find(pane=>z>=pane.z0&&z<=pane.z1)||null;
}

export function b3WindowCrossing(from,to){
  if(!from?.every?.(Number.isFinite)||!to?.every?.(Number.isFinite))return null;
  const dx=to[0]-from[0];if(Math.abs(dx)<1e-8)return null;
  const t=(B3_WINDOW.planeX-from[0])/dx;if(t<=0||t>=1)return null;
  const point=from.map((n,k)=>n+(to[k]-n)*t),pane=b3WindowPaneAt(point[2]);
  if(!pane||point[1]<B3_WINDOW.bottom||point[1]>B3_WINDOW.top)return null;
  return{paneId:pane.id,point,t};
}

export function b3WindowLevel(pane){
  return{id:pane.id,replace:true,collisionOnly:true,
    layer:'basement',space:'basement',renderGroup:'basement',
    origin:{x:B3_WINDOW.partitionX,y:pane.z0},
    physicalOrigin:{x:B3_WINDOW.partitionX,y:pane.z0},base:0,
    rows:Array.from({length:pane.z1-pane.z0},()=>'=')};
}
