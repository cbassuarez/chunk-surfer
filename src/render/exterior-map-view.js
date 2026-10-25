// The SI–1's street sheet: the same phosphor, fixed instrument window and
// selection controls, with public building masses rather than interior rooms.
import {uiDraw,uiCellMetrics} from './ui.js';
import {drawElectronicText,measureElectronicText} from './electronic-text.js';
import {selectedMapSpace} from '../game/map-navigation.js';
import {mapQuarterRotation} from '../game/map-axonometric.js';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function exteriorMapProjection({bounds,viewport,nav={},aspect=.5}){
  const cx=(bounds.minX+bounds.maxX)/2,cy=(bounds.minY+bounds.maxY)/2,angle=mapQuarterRotation(nav.rotation)*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  const raw=p=>({x:(p.x-cx)*c-(p.y-cy)*s,y:(p.x-cx)*s+(p.y-cy)*c});
  const corners=[{x:bounds.minX,y:bounds.minY},{x:bounds.maxX,y:bounds.minY},{x:bounds.maxX,y:bounds.maxY},{x:bounds.minX,y:bounds.maxY}].map(raw);
  const width=Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),height=Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y));
  const scale=Math.min((viewport.w-2)/Math.max(1,width),(viewport.h-1)/Math.max(1,height*aspect))*clamp(Number(nav.zoom)||1,.7,2.5);
  return{point(p){const q=raw(p);return{x:viewport.x+viewport.w/2+q.x*scale+(Number(nav.panX)||0),y:viewport.y+viewport.h/2+q.y*scale*aspect+(Number(nav.panY)||0)};},scale,rotation:mapQuarterRotation(nav.rotation)};
}
function ink(ctx,{cellW,cellH,dpr},viewport){
  const point=p=>({x:p.x*cellW*dpr,y:p.y*cellH*dpr});
  const path=(points,close=false)=>{ctx.beginPath();points.forEach((p,i)=>{const q=point(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});if(close)ctx.closePath();};
  return{
    polygon(points,role='frontage',local=false){
      if(!points.length)return;path(points,true);
      ctx.fillStyle=role==='pub'?'#45563d':role==='church'?'#354a36':role==='institution'?'#293c2d':'#2c3d2e';ctx.fill();
      if(role!=='church'&&role!=='institution'){ctx.strokeStyle=local?'#829379':'#899b80';ctx.lineWidth=(local?.7:.8)*dpr;ctx.stroke();}
    },
    line(points,color='#a0b294',width=.7,dash=[]){if(points.length<2)return;path(points);ctx.strokeStyle=color;ctx.lineWidth=width*dpr;ctx.setLineDash(dash.map(n=>n*dpr));ctx.stroke();ctx.setLineDash([]);},
    text(value,p,{color='#bfcbb0',size=11,align='left',alpha=1}={}){const q=point(p);ctx.save();ctx.globalAlpha*=alpha;drawElectronicText(ctx,value,q.x,q.y,{fontSize:size*dpr,color,mode:'lcd',align,baseline:'middle',dpr});ctx.restore();},
    clip(){ctx.beginPath();ctx.rect(viewport.x*cellW*dpr,viewport.y*cellH*dpr,viewport.w*cellW*dpr,viewport.h*cellH*dpr);ctx.clip();},
    diamond(p,color='#d1bc7b',r=3){const q=point(p);ctx.beginPath();ctx.moveTo(q.x,q.y-r*dpr);ctx.lineTo(q.x+r*dpr,q.y);ctx.lineTo(q.x,q.y+r*dpr);ctx.lineTo(q.x-r*dpr,q.y);ctx.closePath();ctx.fillStyle=color;ctx.fill();},
  };
}
// Shared local ink called by FN–12; points already use its heading-up/aspect
// transform. It does not fit, rotate, mutate or re-author the supplied model.
export function drawExteriorMapCommand(command){
  uiDraw(metrics=>{const{ctx}=metrics;ctx.save();const pen=ink(ctx,metrics,command.viewport);pen.clip();
    ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    if(command.kind==='district-footprint')pen.polygon(command.points,command.role,true);
    else if(command.kind==='district-boundary')pen.line(command.points,'#a8b59a',.75);
    else if(command.kind==='district-landmark'){
      pen.diamond(command.point,'#a8bca0',2);
      if(command.showLabel)pen.text(command.label,{x:command.point.x+.55,y:command.point.y-.45},{size:9,alpha:.8});
    }
    ctx.restore();
  });
}
export function drawExteriorMap({model,nav={},viewport}={}){
  if(model.policy?.showMap===false)return{hits:[],projectedPoints:{},geometryAvailable:true,floors:['district']};
  const metrics=uiCellMetrics(),projection=exteriorMapProjection({bounds:model.floors[0].bounds,viewport,nav,aspect:metrics.cellW/metrics.cellH});
  const selected=selectedMapSpace(nav,model),points=Object.fromEntries((model.spaces||[]).map(s=>[s.id,projection.point(s.position)]));
  const inside=p=>p.x>=viewport.x&&p.x<=viewport.x+viewport.w&&p.y>=viewport.y&&p.y<=viewport.y+viewport.h;
  const hits=(model.spaces||[]).filter(s=>s.selectable!==false&&inside(points[s.id])).map(s=>({id:`bag:space:${s.id}`,kind:'map-space',action:'select-space',payload:{spaceId:s.id},x:points[s.id].x-1.2,y:points[s.id].y-.65,w:2.4,h:1.3,point:points[s.id],enabled:true}));
  uiDraw(m=>{const{ctx,cellW,cellH,dpr}=m;ctx.save();const pen=ink(ctx,m,viewport);pen.clip();
    ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
    if(model.policy?.showMapTopology!==false){
      // Only clear captured ground is painted: lawns/courts, streets and the
      // occupied building masses stay perceptually distinct on a small sheet.
      ctx.fillStyle='#8fa7804a';
      for(const run of model.floors[0].runs){
        const corners=[{x:run.x0,y:run.y},{x:run.x1+1,y:run.y},{x:run.x1+1,y:run.y+1},{x:run.x0,y:run.y+1}].map(projection.point);
        ctx.beginPath();corners.forEach((p,i)=>i?ctx.lineTo(p.x*cellW*dpr,p.y*cellH*dpr):ctx.moveTo(p.x*cellW*dpr,p.y*cellH*dpr));ctx.closePath();ctx.fill();
      }
      for(const footprint of model.district?.footprints||[])pen.polygon(footprint.points.map(projection.point),footprint.role);
      for(const edge of model.district?.institutionEdges||[])pen.line(edge.map(projection.point),'#a8b59a',.75);
      for(const label of model.district?.streetLabels||[])pen.text(label.label,projection.point(label.position),{size:10,align:'center',color:'#bdcba9',alpha:.86});
      const ellery=projection.point({x:89,y:44});pen.text('ELLERY',ellery,{size:13,align:'center',color:'#c5ceb5'});
      pen.text('INTERIOR PLAN AT ENTRY',{x:ellery.x,y:ellery.y+1},{size:9,align:'center',color:'#aebc9d'});
    }
    if(model.policy?.showRoute&&model.route?.points?.length>1)pen.line(model.route.points.map(projection.point),'#cbbb87',1.2,[4,3]);
    const occupied=[];
    for(const space of model.spaces||[]){
      const p=points[space.id];if(!inside(p))continue;
      const active=selected?.id===space.id||space.waypoint,color=active?'#e0c580':'#b0c2a5';pen.diamond(p,color,active?4:2.5);
      if(model.policy?.showRoom===false)continue;
      const value=String(space.shortLabel||space.label),size=11,width=measureElectronicText(value,{fontSize:size*dpr})/(cellW*dpr),height=16/cellH;
      let label={x:clamp(p.x+.65,viewport.x+.3,viewport.x+viewport.w-width-.3),y:p.y-.6};
      for(const shift of[0,-1,1,-2,2]){const y=p.y-.6+shift*height;if(y<viewport.y+.4||y>viewport.y+viewport.h-.4)continue;if(occupied.some(r=>label.x<r.x+r.w+.4&&label.x+width+.4>r.x&&Math.abs(y-r.y)<height))continue;label.y=y;break;}
      occupied.push({...label,w:width});pen.line([p,{x:label.x-.1,y:label.y}],color,.5);pen.text(value,label,{size,color});
    }
    if(model.policy?.showWaypoint!==false&&model.waypoint?.position&&!model.spaces.some(s=>s.waypoint)){
      const raw=projection.point(model.waypoint.position),p={x:clamp(raw.x,viewport.x+.6,viewport.x+viewport.w-.6),y:clamp(raw.y,viewport.y+.6,viewport.y+viewport.h-.6)};
      pen.diamond(p,'#ecd090',4);pen.text('TARGET',{x:p.x+.6,y:p.y-.65},{size:10,color:'#ecd090'});
    }
    if(model.player?.resolved&&model.policy?.showExactPlayer!==false){
      const raw=projection.point(model.player.position),p={x:clamp(raw.x,viewport.x+.4,viewport.x+viewport.w-.4),y:clamp(raw.y,viewport.y+.4,viewport.y+viewport.h-.4)};
      const angle=(model.player.heading||0)+projection.rotation*Math.PI/2,dx=Math.sin(angle),dy=-Math.cos(angle),r=.85;
      const arrow=[{x:p.x+dx*r,y:p.y+dy*r*cellW/cellH},{x:p.x-dx*r*.7+dy*r*.6,y:p.y+(-dy*r*.7-dx*r*.6)*cellW/cellH},{x:p.x-dx*r*.7-dy*r*.6,y:p.y+(-dy*r*.7+dx*r*.6)*cellW/cellH}];
      pen.polygon(arrow,'institution');pen.line([...arrow,arrow[0]],'#e8e8ba',1.2);
    }
    const north=projection.point({x:0,y:0}),up=projection.point({x:0,y:-10}),len=Math.hypot(up.x-north.x,(up.y-north.y)*cellH/cellW)||1;
    const n={x:viewport.x+viewport.w-2,y:viewport.y+1.5};pen.line([n,{x:n.x+(up.x-north.x)/len*1.1,y:n.y+(up.y-north.y)/len*1.1}],'#c8d1b2',1);pen.text('N',{x:n.x,y:n.y+.8},{align:'center',size:9});
    ctx.restore();
  });
  return{hits,projectedPoints:points,geometryAvailable:true,projection,floors:['district']};
}
