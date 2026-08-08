// Saved positions belong to a floorplan revision, not just a pair of numbers.
// Keep the policy pure so every retired stair/corridor cell can be regression
// tested without booting the browser runtime.

const DIRECTIONS=Object.freeze([[0,-1],[1,0],[0,1],[-1,0]]);

const facingFor=(floorplan,point,savedFacing)=>{
  const facing=((Math.round(Number(savedFacing)||0)%4)+4)%4;
  const [dx,dy]=DIRECTIONS[facing];
  if(!floorplan.isSolid(point.x+dx,point.y+dy))return facing;
  const replacement=DIRECTIONS.findIndex(([ox,oy])=>!floorplan.isSolid(point.x+ox,point.y+oy));
  return replacement>=0?replacement:facing;
};

export function migrateFloorplanPosition(floorplan,data,saved){
  const revision=Math.max(0,Math.floor(Number(saved?.layoutRevision)||0));
  const targetRevision=Math.max(0,Math.floor(Number(data?.layoutRevision)||0));
  const sx=Number(saved?.px),sy=Number(saved?.py);
  if(!Number.isFinite(sx)||!Number.isFinite(sy))return null;
  const finish=(point,extra)=>({...point,facing:facingFor(floorplan,point,saved?.facing),...extra});
  if(revision>=targetRevision)return finish({x:sx,y:sy},{migrated:false});

  const authored={x:floorplan.toAuthoredCoord(sx),y:floorplan.toAuthoredCoord(sy)};
  const migration=(data.positionMigrations||[]).find(({bounds})=>
    authored.x>=bounds.x0&&authored.x<=bounds.x1&&authored.y>=bounds.y0&&authored.y<=bounds.y1);
  if(migration){
    const anchor=floorplan.toRuntimePoint(migration.to);
    const safe=floorplan.isSolid(anchor.x,anchor.y)
      ?floorplan.nearestWalkable(anchor.x,anchor.y,{floor:migration.floor,radius:24})
      :anchor;
    if(safe)return finish(safe,{migrated:true,migration:migration.id});
  }
  if(!floorplan.isSolid(sx,sy))return finish({x:sx,y:sy},{migrated:false});
  const floorHint=authored.y>=240?10:authored.y>=44&&authored.y<100?4.8:0;
  const safe=floorplan.nearestWalkable(sx,sy,{floor:floorHint,radius:48});
  return safe?finish(safe,{migrated:true,migration:'nearest-same-floor'}):null;
}
