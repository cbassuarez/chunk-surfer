const inside=(p,r)=>p.x>=r.x&&p.y>=r.y&&p.x<=r.x+r.w&&p.y<=r.y+r.h;

// Deterministic harness coordinates before the 3D view is ready. Live pointer
// input waits for the model and uses its projected surface bounds instead.
export function roofWordLockLayout(width,height){
  return{width,height,w:width,h:height,x:0,y:0,
    wheels:Array.from({length:6},(_,i)=>({x:width*(.18+i*.075),y:height*.44,w:width*.06,h:height*.14,index:i})),
    handle:{x:width*.73,y:height*.32,w:width*.13,h:height*.36},
    close:{x:12,y:height-42,w:110,h:32}};
}
export function roofWordLockHit(layout,p){
  if(inside(p,layout.close))return{kind:'close'};
  if(inside(p,layout.handle))return{kind:'handle'};
  for(const r of layout.wheels){
    if(!inside(p,{...r,y:r.y-30,h:r.h+60}))continue;
    if(p.y<r.y)return{kind:'turn',index:r.index,delta:1};
    if(p.y>r.y+r.h)return{kind:'turn',index:r.index,delta:-1};
    return{kind:'wheel',index:r.index};
  }
  return null;
}
