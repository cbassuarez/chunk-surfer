// The optional Source memory keeps The Lyric's furniture and people, then lets
// the room repeat faster than its order book. Progress is always a chosen act.
import {PUB_INTERIOR_LAYOUT} from './exterior-pub-furnishings.js';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const task=(id,label,x,z,y,text,extra={})=>({id,label,x,z,y,text,...extra});
export const SOURCE_PUB=freeze({
  id:'source-pub',encounterId:'source-pub-v1',version:2,unlockFlag:'pub.help.sourceUnlocked',
  floor:.132,eyeHeight:1.62,walkSpeed:2.35,barrelSpeed:1.30,bodyRadius:.19,layerDrop:7.2,fallDuration:1.35,itemFallDuration:1.1,
  spawn:{x:1.25,z:1.25,yaw:Math.PI/2,pitch:-.04},
  room:{length:16,depth:5.4,renderAnchor:{x:40,z:56},source: 'exterior_pub_interior'},
  rounds:[
    {orders:2,stretch:1,copies:1,layer:0,title:'TWO WATERS',tableZ:-30.2,
      collect:'Two waters. The same table as before. You know the way.',
      serve:'Both glasses are full. Neither person reaches for one.',
      returned:'Thank you, love. There is another barrel at the far end. Would you bring it over?',tasks:[
        task('collect','TAKE THE TWO WATERS',10.1,2.90,1.26,'Two waters. The same table as before. You know the way.',{carry:'waters'}),
        task('serve','SERVE THE TWO WATERS',1.8,3.49,.92,'Just there, love. They can help themselves.',{carry:'empty-tray',caption:'Both glasses are full. Nobody has taken their coat off.'}),
        task('return','RETURN THE TRAY',11.4,2.90,1.26,'Thank you, love. There is another barrel at the far end. Would you bring it over?',{carry:null}),
      ]},
    {orders:2,stretch:1.9,copies:2,layer:0,title:'ONE BARREL',tableZ:-30.2,tasks:[
      task('barrel','TAKE A BARREL FROM THE STACK',14.3,1.65,.72,'The one on the floor will do. I cannot reach the top ones either.',{carry:'barrel'}),
      task('rack','ROLL THE BARREL TO THE FAR TABLE',1.8,1.65,.72,'Lovely. Thank you for making room. Bring it back to the bar when you have your breath, love.',{carry:'barrel'}),
      task('tap','BRING THE BARREL TO IONA',10.1,2.90,1.26,'There we are. You have saved me a journey.',{carry:null}),
      task('collect','TAKE TWO MORE WATERS',10.1,2.90,1.26,'Take these back while you are going that way.',{carry:'waters'}),
      task('serve','PUT THE WATERS ON THE TABLE',1.8,3.49,.92,'That is fine. Leave them on the dry part.',{carry:'empty-tray',caption:'The glasses stand on the table. The table has no finished edge.'}),
      task('return','RETURN THE EMPTY TRAY',11.4,2.90,1.26,'You are very good. Nobody has ordered anything yet.',{carry:null}),
    ]},
    {orders:0,stretch:2.8,copies:3,layer:0,title:'NO ORDERS',tableZ:-30.2,
      collect:'No drinks for the other table. Take them while they are still cold.',
      serve:'You set down nothing. Nine glasses touch the table.',
      returned:'That is all of them. There are fewer than none left.',tasks:[
        task('collect','TAKE THE EMPTY ORDER',10.1,2.90,1.26,'No drinks for the other table. Take them while they are still cold.',{carry:'empty-tray'}),
        task('serve','SET DOWN THE EMPTY ORDER',1.8,3.49,.92,'Oh, the floor has gone through again. There is another room underneath. Mind the tray.',{carry:null,dropItem:'tray',toLayer:1}),
        task('descend','FOLLOW THE TRAY THROUGH THE OPEN FLOOR',1.8,1.10,.35,'There is a dry place to land. I will keep your place at the bar.',{descend:true,toLayer:1}),
        task('recover','PICK UP THE FALLEN TRAY',1.8,1.25,.14,'There it is. No harm done. You need not apologise to a tray.',{recover:'tray',carry:'empty-tray',toLayer:1}),
        task('return','BRING THE TRAY BACK TO IONA',11.4,2.90,1.26,'Thank you. I have put the empties downstairs. Could you fetch the next barrel?',{carry:null}),
      ]},
    {orders:-9,stretch:3.8,copies:4,layer:1,title:'MINUS NINE',tableZ:-30.2,
      collect:'Collect the drinks before they were poured. Do not let the tray get lighter.',
      serve:'Every face turns toward the place where you were standing.',
      returned:'There. Everyone has what they did not ask for.',tasks:[
        task('barrel','TAKE THE LOWEST BARREL',14.3,1.65,.72,'One of the low ones, love. There is no ladder tall enough for those.',{carry:'barrel'}),
        task('rack','ROLL THE BARREL TO THE FAR END',1.8,1.65,.72,'Just by that gap. It used to be a wall.',{carry:'barrel'}),
        task('lower','LOWER THE BARREL THROUGH THE GAP',1.8,1.10,.35,'That is the cellar below the cellar. It will be all right down there.',{carry:null,dropItem:'barrel',toLayer:2}),
        task('descend','FOLLOW THE BARREL INTO THE LOWER LYRIC',1.8,1.10,.35,'You go carefully. I have only just swept.',{descend:true,toLayer:2}),
        task('recover','TAKE THE BARREL FROM THE LOWER FLOOR',1.8,1.25,.72,'There you are. I wondered where you had got to.',{recover:'barrel',carry:'barrel',toLayer:2}),
        task('tap','BRING THE BARREL BACK TO THE BAR',10.1,2.90,1.26,'Perfect. There is always somebody who comes back with it.',{carry:null}),
        task('collect','TAKE MINUS NINE',10.1,2.90,1.26,'Collect the drinks before they were poured. It saves washing up.',{carry:'empty-tray'}),
        task('serve','SERVE THE UNPOURED DRINKS',1.8,3.49,.92,'That is their usual table. Just there.',{carry:'empty-tray',caption:'Nine places are laid. The chairs face rooms that have not been built.'}),
        task('return','RETURN THE TRAY',11.4,2.90,1.26,'There. Everyone has what they did not ask for. Just one more little thing.',{carry:null}),
      ]},
    {orders:0,stretch:4.8,copies:5,layer:2,title:'THE LAST ONE',tableZ:-30.2,tasks:[
      task('barrel','TAKE THE LAST BARREL AT FLOOR LEVEL',14.3,1.65,.72,'There is one more at the back. Leave the rest. They can stay where they are.',{carry:'barrel'}),
      task('tap','SET THE BARREL BESIDE IONA',10.1,2.90,1.26,'That will see us through. Come and take your hands off it.',{carry:null}),
      task('collect','TAKE ONE CLEAN GLASS',10.1,2.90,1.26,'A clean glass for the table by the door. Nobody is waiting. I would like it to be ready.',{carry:'waters'}),
      task('serve','LEAVE THE GLASS AT THE EMPTY PLACE',1.8,3.49,.92,'Thank you. It is nice to have a place ready.',{carry:'empty-tray',caption:'The glass touches finished wood. For a moment the table has all four sides.'}),
      task('return','RETURN THE TRAY TO IONA',11.4,2.90,1.26,'Thank you. That was kind of you. Your coat is dry now. The door is just where you left it.',{carry:null}),
    ]},
  ],
  openings:[{stage:2,afterTask:1,layer:0,toLayer:1,x:1.8,z:1.25,radius:.80},{stage:3,afterTask:1,layer:1,toLayer:2,x:1.8,z:1.25,radius:.80}],
  barrelStacks:[{id:'rear-stack',x:14.6,z:1.85,columns:5,levels:18},{id:'far-stack',x:3.8,z:4.6,columns:3,levels:13},{id:'bar-stack',x:9.2,z:4.8,columns:4,levels:16}],
  furniture:PUB_INTERIOR_LAYOUT.furniture,
});
export const sourcePubRound=stage=>SOURCE_PUB.rounds[Math.max(0,Math.min(SOURCE_PUB.rounds.length-1,Math.trunc(Number(stage)||0)))];
export const sourcePubTask=state=>state?.stage>=SOURCE_PUB.rounds.length?null:sourcePubRound(state?.stage).tasks[state?.task||0];
export const sourcePubStretch=state=>sourcePubRound(state?.stage).stretch;
export function sourcePubFallProgress(fall){
  const progress=fall?Math.max(0,Math.min(1,fall.elapsed/fall.duration)):0;
  const crossing=Math.max(0,Math.min(1,progress/.28)),descent=Math.max(0,Math.min(1,(progress-.22)/.78));
  return{progress,crossing:crossing*crossing*(3-2*crossing),descent:descent*descent};
}
export function sourcePubFloorHeight(state){const f=state?.fall;return SOURCE_PUB.floor-SOURCE_PUB.layerDrop*(f?f.fromLayer+(f.toLayer-f.fromLayer)*sourcePubFallProgress(f).descent:Number(state?.layer)||0);}
export const sourcePubFloorHoles=state=>SOURCE_PUB.openings.filter(o=>state.stage>o.stage||state.stage===o.stage&&state.task>=o.afterTask).map(o=>({...o,x:o.x*sourcePubStretch(state)}));
export function sourcePubPoint(row,state={stage:0}){
  return{x:(row.z+32)*sourcePubStretch(state),z:-row.x};
}
export function sourcePubStations(state){
  const stretch=sourcePubStretch(state),t=sourcePubTask(state),fallen=t?.recover&&state.fallenItem;
  const service=t?[{...t,x:fallen?fallen.x:t.x*stretch,z:fallen?fallen.z:t.z}]:[];
  return[...service,{id:'exit',label:state?.stage>=SOURCE_PUB.rounds.length?'LEAVE THE LYRIC':'LEAVE THE BAR',x:1.25*stretch,z:.20,y:1.28}];
}
