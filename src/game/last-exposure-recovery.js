import {uiDraw,uiSize,uiText,uiWrap} from '../render/ui.js';
import {drawVfdText} from '../render/presentation.js';
import {createHitRegions} from '../render/hit-regions.js';

const smooth=value=>{const u=Math.max(0,Math.min(1,value));return u*u*(3-2*u);};
const name=value=>typeof value==='string'?value.replace(/[_-]+/g,' ').trim():'';
const keyName=e=>{
  const key=e.code||e.key||'';
  return ({' ':'Space',Enter:'Enter',NumpadEnter:'Enter',Return:'Enter',KeyZ:'Enter',z:'Enter',Z:'Enter',
    KeyW:'ArrowUp',w:'ArrowUp',W:'ArrowUp',KeyS:'ArrowDown',s:'ArrowDown',S:'ArrowDown'})[key]||key;
};

export function recoveryCopy({kind='taken',roomName='',minutes,lostItem,injured=false,recordingSpoiled=false}={}){
  const room=name(roomName),item=name(lostItem);
  const lines=[room?`You woke in ${room}.`:'You are still alive.'];
  if(injured)lines.push("You're injured.");
  if(recordingSpoiled)lines.push('Your recording was spoiled.');
  if(Number.isFinite(minutes)&&minutes>0)lines.push(minutes===1?'One minute is gone.':`${Math.trunc(minutes)} minutes are gone.`);
  if(item)lines.push(`Your ${item} is missing.`);
  return {title:kind==='recoverable-defeat'?'YOU LOST THE FIGHT':'YOU WERE TAKEN',
    body:lines.join(' '),continuation:'Continue in this room. Your injuries and lost time remain.'};
}

export function recoverySceneLayout({cols=80,rows=30,title='',body='',itemCount=3}={}){
  cols=Math.max(20,cols);rows=Math.max(16,rows);
  const x=Math.max(2,Math.floor(cols*.10)),w=Math.max(16,cols-x*2);
  const compact=rows<24||cols<40,gap=compact?1:2;
  const scale=!compact&&w>=title.length*3?3:!compact&&w>=title.length*2?2:1;
  const titleLines=uiWrap(title,Math.floor(w/scale)),bodyLines=uiWrap(body,Math.min(60,w));
  let menuStep=2;
  const contentHeight=()=>titleLines.length*scale+gap+bodyLines.length+gap+(itemCount-1)*menuStep+1;
  if(contentHeight()>rows-2)menuStep=1;
  const titleY=Math.max(0,Math.min(Math.floor(rows*.22),rows-contentHeight()-1));
  const bodyY=titleY+titleLines.length*scale+gap,menuY=bodyY+bodyLines.length+gap;
  return{cols,rows,x,w,title,scale,titleY,titleLines,bodyY,bodyLines,menuY,menuStep,compact};
}

// This screen acknowledges an already committed loss. It owns no punishment,
// save or relocation: Continue yields to the existing authored recovery, while
// Restart and Title call the host's existing run handlers after deliberate input.
export function makeRecoveryScene({kind='taken',roomName='',minutes,lostItem,injured=false,recordingSpoiled=false,sourceRoomName='',snapshot=null,
  onContinue=null,onRestart=null,onTitle=null,heldKeys=[]}={}){
  const copy=recoveryCopy({kind,roomName,minutes,lostItem,injured,recordingSpoiled});
  const hits=createHitRegions(),down=new Set(heldKeys.map(key=>keyName({code:key})));
  let stage='recovery',selected=0,elapsed=0,finished=false,closed=false,press=null,epoch=0;
  const normalItems=[
    {id:'continue',label:'CONTINUE',callback:onContinue},
    {id:'restart',label:'RESTART FROM BEGINNING',callback:onRestart},
    {id:'title',label:'QUIT TO TITLE',callback:onTitle},
  ];
  const confirmItems=[{id:'cancel',label:'CANCEL'},{id:'confirm-restart',label:'RESTART FROM BEGINNING',callback:onRestart}];
  const items=()=>stage==='confirm-restart'?confirmItems:normalItems;
  function layout(){
    const size=uiSize(),cols=Math.max(20,size.cols||80),rows=Math.max(16,size.rows||30);
    const title=stage==='confirm-restart'?'RESTART FROM BEGINNING?':copy.title;
    const body=stage==='confirm-restart'?'Your current game progress will be lost. Unlocked content stays.':copy.body;
    return recoverySceneLayout({cols,rows,title,body,itemCount:items().length});
  }
  function regions(){
    const l=layout();hits.reset();
    items().forEach((item,index)=>hits.add({id:item.id,label:item.label,selected:index===selected,
      x:l.x,y:l.menuY+index*l.menuStep-.15,w:Math.min(l.w,Math.max(item.label.length+4,28)),h:l.menuStep===1?.95:1.5,
      data:{index},disabled:item.id!=='cancel'&&item.id!=='restart'&&typeof item.callback!=='function',
      onHover:()=>{if(!finished&&!closed)selected=index;}}));
    return l;
  }
  function select(index){if(!finished&&!closed)selected=(index+items().length)%items().length;}
  function activate(){
    if(finished||closed)return;
    const item=items()[selected];if(!item)return;
    if(item.id==='restart'){
      stage='confirm-restart';selected=0;press=null;epoch++;return;
    }
    if(item.id==='cancel'){
      stage='recovery';selected=1;press=null;epoch++;return;
    }
    if(typeof item.callback!=='function')return;
    finished=true;press=null;epoch++;
    item.callback();
  }
  const scene={
    id:'last-exposure-recovery',kind:'recovery-menu',blocksInput:true,blocksWorld:true,suppressesHud:true,
    allowsLook:false,worldPresentation:'visible',lookProfile:'calm',localEscape:true,
    enter(params={}){
      for(const key of params.heldKeys||[])down.add(keyName({code:key}));
      try{globalThis.document?.exitPointerLock?.();}catch(_){}
    },
    exit(){closed=true;press=null;epoch++;},
    update(dt){if(!closed&&Number.isFinite(dt)&&dt>0)elapsed+=dt;},
    key(e={}){
      e.preventDefault?.();if(finished||closed)return true;
      const k=keyName(e);
      if(e.repeat||down.has(k)){if(k)down.add(k);return true;}
      if(k)down.add(k);
      if(k==='ArrowUp')select(selected-1);
      else if(k==='ArrowDown')select(selected+1);
      else if(k==='Enter'||k==='Space')activate();
      else if(k==='Escape'||k==='Backspace'){
        if(stage==='confirm-restart'){stage='recovery';selected=1;press=null;epoch++;}
        // Back never silently quits or starts a run.
      }
      return true;
    },
    keyup(e={}){down.delete(keyName(e));return true;},
    pointer(e={}){
      if(finished||closed)return true;
      regions();
      if(e.type==='pointermove'){hits.handle(e,{click:false,press:false});return true;}
      if(e.type==='pointercancel'||e.type==='lostpointercapture'){press=null;return true;}
      const hit=hits.hit(e.cellX,e.cellY);
      if(e.type==='pointerdown'){
        if(e.button!=null&&e.button!==0)return true;
        if(press)return true;
        if(hit&&!hit.disabled){selected=hit.data.index;press={id:hit.id,pointerId:e.pointerId,epoch};}
      }else if(e.type==='pointerup'){
        const prior=press;press=null;
        if(prior&&prior.epoch===epoch&&prior.pointerId===e.pointerId&&hit?.id===prior.id&&!hit.disabled)activate();
      }
      return true;
    },
    view(){
      regions();return{kind,title:stage==='confirm-restart'?'RESTART FROM BEGINNING?':copy.title,
        body:stage==='confirm-restart'?'Your current game progress will be lost. Unlocked content stays.':copy.body,
        explanation:stage==='recovery'?copy.continuation:'',stage,selected:items()[selected]?.id,
        items:items().map(i=>({id:i.id,label:i.label})),hitRegions:hits.view(),
        elapsed,fade:smooth(elapsed),snapshotAlpha:1-smooth(elapsed),finished,closed,sourceRoomName:name(sourceRoomName),
        facts:{roomName:name(roomName),...(Number.isFinite(minutes)?{minutes}:{}),...(name(lostItem)?{lostItem:name(lostItem)}:{})}};
    },
    render(){
      const l=regions(),v=scene.view();
      uiDraw(({ctx})=>{
        const w=ctx.canvas.width,h=ctx.canvas.height;
        const sw=snapshot?.naturalWidth||snapshot?.width||0,sh=snapshot?.naturalHeight||snapshot?.height||0;
        ctx.save();ctx.imageSmoothingEnabled=false;
        if(sw>0&&sh>0&&elapsed<1){const fit=Math.max(w/sw,h/sh);ctx.globalAlpha=1-smooth(elapsed);ctx.drawImage(snapshot,(w-sw*fit)/2,(h-sh*fit)/2,sw*fit,sh*fit);ctx.globalAlpha=1;}
        const dim=ctx.createLinearGradient(0,0,w,0);
        const cover=.96-smooth(elapsed)*.25;
        dim.addColorStop(0,`rgba(0,0,0,${cover})`);dim.addColorStop(1,`rgba(0,0,0,${Math.max(.38,cover-.24)})`);
        ctx.fillStyle=dim;ctx.fillRect(0,0,w,h);ctx.restore();
      });
      l.titleLines.forEach((line,index)=>drawVfdText(l.x,l.titleY+index*l.scale,line,{scale:l.scale,role:'ui-primary',alpha:1,max:l.w}));
      l.bodyLines.forEach((line,index)=>uiText(l.x,l.bodyY+index,line,'ui-secondary'));
      items().forEach((item,index)=>{
        const y=l.menuY+index*l.menuStep,on=index===selected;
        const label=l.w<item.label.length+2?(item.id==='restart'||item.id==='confirm-restart'?'RESTART':item.label):item.label;
        uiText(l.x,y,(on?'> ':'  ')+label,on?'ui-primary':'ui-secondary',on?1:.75);
      });
      const note=stage==='confirm-restart'?'Cancel to keep playing.':copy.continuation;
      const noteY=l.menuY+items().length*l.menuStep+1;
      if(noteY<l.rows-1)uiWrap(note,l.w).forEach((line,index)=>{if(noteY+index<l.rows-1)uiText(l.x,noteY+index,line,'ui-secondary');});
    },
  };
  return scene;
}
