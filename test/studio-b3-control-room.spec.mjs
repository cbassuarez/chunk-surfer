import test from 'node:test';
import assert from 'node:assert/strict';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';

FP.compile(conservatory.levels, {width:conservatory.width,height:conservatory.height,
  widenCorridors:conservatory.widenCorridors,connectors:conservatory.connectors,
  edgePortals:conservatory.edgePortals,doors:conservatory.doors});
const keys=new Set(['master']);
const inside=(x,y)=>x>=10&&x<=78&&y>=10&&y<=49;
function reachable(from,to){
  const todo=[from], seen=new Set([from.join(',')]);
  for(let i=0;i<todo.length;i++){
    const [x,y]=todo[i];if(x===to[0]&&y===to[1])return true;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy,k=`${nx},${ny}`;
      if(inside(nx,ny)&&!seen.has(k)&&FP.canStep(x,y,nx,ny,{keys}).ok){seen.add(k);todo.push([nx,ny]);}
    }
  }
  return false;
}

test('B3 live room and its control booth communicate only via the B2 service door',()=>{
  FP.setDoorOpen('b2-corridor',true);
  FP.setDoorOpen('b3-b2-service',false);
  assert.equal(reachable([30,41],[20,20]),true,'south B3 entry reaches live room');
  assert.equal(reachable([30,41],[44,20]),false,'closed B2 service leaf isolates control booth');
  FP.setDoorOpen('b3-b2-service',true);
  assert.equal(reachable([56,24],[44,20]),true,'B2 service leaf opens into the booth');
  assert.equal(reachable([30,41],[44,20]),true,'booth is reachable through B2 from the corridor');
  assert.equal(FP.isSolid(36,27),true,'the pier between the two observation panes remains solid');
  assert.equal(FP.isSolid(36,35),true,'west partition is solid beyond the south observation pane');
  assert.equal(FP.isSolid(42,36),true,'south partition has no B3 door');
});

test('studio glazing is a two-sided rendered aperture, never a passage',()=>{
  for(let y=16;y<26;y++)for(let x=36;x<38;x++){
    assert.equal(FP.isSolid(x,y),false);
    assert.ok(Math.abs(FP.floorAt(x,y)+2.95)<1e-5);
    assert.ok(Math.abs(FP.ceilAt(x,y)+.95)<1e-5);
    assert.deepEqual(FP.canStep(x-1,y,x,y,{keys}),{ok:false,why:'wall'});
    assert.deepEqual(FP.canStep(x+1,y,x,y,{keys}),{ok:false,why:'wall'});
  }
  for(const observer of [[30,20],[42,20]]){
    const slice=FP.physicalRenderPlanFor(...observer),p=FP.logicalToPhysical(36,20);
    const i=(Math.round(p.z)-slice.originY)*slice.w+Math.round(p.x)-slice.originX;
    assert.equal(slice.solid[i],0,'aperture survives each side render slice');
    assert.ok(Math.abs(slice.floor[i]+2.95)<1e-5);
    assert.ok(Math.abs(slice.ceil[i]+.95)<1e-5);
  }
  assert.deepEqual(FP.physicalSpanData().overlaps,[]);
});

test('the live room and booth retain their authored studio equipment',async()=>{
  const PROPS=await import('../src/game/props.js');
  const {CONSERVATORY_PROPS}=await import('../src/data/conservatory-props.js');
  const placed=new Map(PROPS.propsInit(FP).map(p=>[p.id,p]));
  const expected=['b3-control-console','b3-chair','b3-patchbay','b3-rack-1','b3-speaker-1',
    'b3-session-boom-1','b3-session-boom-2','b3-session-folded-mic','b3-session-snake',
    'b3-session-case','b3-music-stand','light-b3-work-casing','light-b3-control-casing'];
  for(const id of expected)assert.ok(placed.has(id),`${id} must survive production placement`);
  assert.ok(!CONSERVATORY_PROPS.some(p=>/^b3-/.test(p.id)&&p.mesh==='school_desk'),'school desks are replaced');
  assert.equal(placed.get('b3-control-console').mesh,'b3_mixing_console');
  assert.equal(placed.get('light-b3-work-casing').lightCircuit,'sp01');
  assert.equal(placed.get('light-b3-control-casing').lightCircuit,'sp01');
  for(let x=50;x>=40;x--)assert.ok(PROPS.propCanOccupy(x,24),`B2 to booth clearance at ${x},24`);
});

test('the B3 speaker can be inspected but never played or learned as an instrument',async()=>{
  const P=await import('../src/game/props.js');
  P.propsInit(FP);
  const original=P.savePropState();
  try{
    const speaker=P.propById('b3-speaker-1');
    assert.ok(speaker);
    assert.equal(speaker.sampleFamily?.length||0,0);
    P.loadPropState({auditioned:['b3-speaker-1']}); // an old save may contain the prior playable prop
    assert.equal(P.auditionProp('b3-speaker-1'),null);
    assert.ok(!P.learnedPlayable().some(prop=>prop.id==='b3-speaker-1'));
    assert.equal(P.inspectProp('b3-speaker-1'),'A nearfield monitor with its cone pushed in and pulled back out.');
  }finally{P.loadPropState(original);}
});

test('studio finds sit on their supports and can only be reached from the booth',async()=>{
  const P=await import('../src/game/props.js');
  P.propsInit(FP);
  const draw=new Map(P.renderInstances({inscriptions:false}).map(p=>[p.id,p]));
  const tin=P.propById('b3-spare-cell-tin'),card=P.propById('b3-session-card');
  assert.ok(tin&&card,'both authored finds survive placement');
  assert.equal(tin.action,'take-b3-spare-cell');
  assert.equal(tin.interaction,'action');
  assert.equal(tin.blocks,false);assert.equal(card.blocks,false);
  const desk=draw.get('b3-control-console');
  const tinDraw=draw.get(tin.id),cardDraw=draw.get(card.id);
  assert.ok(Math.abs(tinDraw.y-(desk.y+.18))<1e-6,'tin sits on the console shelf');
  assert.ok(Math.abs(tinDraw.x-desk.x)<.33&&Math.abs(tinDraw.z-desk.z)<.9,'tin is supported by the shelf');
  assert.ok(Math.abs(cardDraw.y-(desk.y+.91))<1e-6,'card lies on the physical console');
  assert.ok(Math.abs(cardDraw.x-desk.x)<.4&&Math.abs(cardDraw.z-desk.z)<1,'card is over the desk top');
  for(const [prop,x,y,pitch] of [[tin,43,19,-1],[card,43,22,-.7]]){
    assert.ok(!FP.isSolid(x,y)&&P.propCanOccupy(x,y),'a body can stand at the test approach');
    const mx=(x+.5)*.5,mz=(y+.5)*.5,yaw=Math.atan2(prop.interactionX-mx,-(prop.interactionY-mz));
    assert.equal(P.pickProp(x,y,1,3.2,{yaw,pitch})?.id,prop.id,'looking directly at the find selects it');
  }
  const x=34,y=22,mx=(x+.5)*.5,mz=(y+.5)*.5,yaw=Math.atan2(card.interactionX-mx,-(card.interactionY-mz));
  assert.notEqual(P.pickProp(x,y,1,3.2,{yaw,pitch:0})?.id,card.id,'the live-room player cannot reach through the control window');
});
