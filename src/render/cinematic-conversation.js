// A shared, opt-in cinematic conversation preset. The conversation and world
// remain owned by their scene; this module only measures and draws words.
import {uiDraw} from './ui.js';
import {drawVfdText} from './presentation.js';
import {transcriptRole,layoutTranscriptChoices,fitTranscriptChoices} from './transcript.js';
import {registerReviewRegion} from '../game/local-text-review.js';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const INK={incoming:'#eee7d9',player:'#e8a24a',direction:'#bcc8d2',system:'#bcc8d2',quiet:'#b1b0a4'};

// Wrap the complete authored utterance once. Source positions, rather than a
// second typing clock or wrapping the growing substring, determine the reveal.
export function cinematicTextRows(value,width,typed=Infinity){
  const text=String(value??''),limit=Math.max(1,Math.floor(width)),rows=[];
  let letters=[],positions=[];
  const flush=()=>{if(letters.length){const fullText=letters.join('');rows.push({fullText,text:fullText.slice(0,positions.filter(at=>at<typed).length)});letters=[];positions=[];}};
  for(const match of text.matchAll(/\S+/g)){
    let word=match[0],at=match.index;
    if(letters.length&&letters.length+1+word.length>limit)flush();
    if(letters.length){letters.push(' ');positions.push(at-1);}
    while(word.length){
      const room=limit-letters.length,take=Math.min(room,word.length);
      letters.push(...word.slice(0,take));positions.push(...Array.from({length:take},(_,i)=>at+i));
      word=word.slice(take);at+=take;if(word.length)flush();
    }
  }
  flush();return rows;
}

function currentEntry(view){
  if(view.pending)return view.history?.at(-1)||(!view.typing?view.line:null)||null;
  return view.line||null;
}

export function cinematicConversationLayout(view={}, {cols=120,rows=40,page=0,selectedOffset=0,prompt='',review=false,reviewPage=0}={}){
  const scale=clamp(Number(view.captionScale)||1.15,.8,2),localCols=cols/scale,localRows=rows/scale;
  const maximumWidth=clamp(Number(view.captionWidth)||88,20,88);
  const width=Math.max(8,Math.min(maximumWidth,Math.floor(localCols-6))),contentWidth=Math.max(4,width-4);
  const placement=view.captionPlacement==='top'?'top':'bottom';
  const available=Math.max(4,Math.floor(localRows-5)),preferred=Math.max(4,Math.min(available,Math.floor(localRows*.60)));
  const x=Math.max(0,(localCols-width)/2),empty={empty:true,scale,x,y:0,width,height:0,bodyRows:[],choices:{rows:[],height:0},selectedIndex:null,placement};
  if(view.captionHidden)return empty;
  const promptRows=cinematicTextRows(prompt,contentWidth),footerRows=promptRows.length;
  if(review){
    const history=Array.isArray(view.captionHistory)?view.captionHistory:view.history||[];
    const all=history.flatMap(entry=>[...cinematicTextRows(entry.text,contentWidth).map(row=>({...row,who:entry.who,reviewTarget:entry.reviewTarget})),{text:'',fullText:'',who:'direction'}]);
    if(all.at(-1)?.fullText==='')all.pop();
    const capacity=Math.max(1,preferred-footerRows-3),pages=Math.max(1,Math.ceil(all.length/capacity)),bodyPage=clamp(Math.floor(reviewPage)||0,0,pages-1);
    const bodyRows=all.slice(bodyPage*capacity,(bodyPage+1)*capacity),height=Math.max(4,bodyRows.length+footerRows+3);
    return {...empty,empty:false,review:true,contentWidth,bodyRows,bodyPage,bodyPages:pages,height,promptRows,choices:{rows:[],height:0},y:placement==='top'?2:Math.max(2,localRows-height-3)};
  }
  const entry=currentEntry(view),fullText=String(entry?.text||''),who=entry?.who||view.who||'direction';
  const typed=view.pending?Infinity:Math.max(0,Number(view.typed)||0);
  const allBody=cinematicTextRows(fullText,contentWidth,typed).map(row=>({...row,who,reviewTarget:entry?.reviewTarget}));
  const options=view.captionReady===false?[]:view.pending?.options||[];
  const choiceView={...view,pending:options.length?{...view.pending,options}:null};
  const rawChoices=layoutTranscriptChoices(choiceView,contentWidth,{lane:{x:0,w:contentWidth,align:'left'},label:'YOUR REPLY'});
  const selectedRows=rawChoices.rows.filter(row=>row.kind==='choice'&&row.selected).length;
  // Grow only far enough to retain the whole selected reply and question. At
  // smaller viewports the shared fitter pages a reply rather than shrinking it.
  const choiceMinimum=options.length?selectedRows+1:0;
  const desired=Math.max(preferred,Math.min(available,allBody.length+choiceMinimum+footerRows+4));
  const bodyCapacity=Math.max(1,desired-choiceMinimum-footerRows-4);
  const bodyPages=Math.max(1,Math.ceil(allBody.length/bodyCapacity)),bodyPage=clamp(Math.floor(page)||0,0,bodyPages-1);
  const bodyRows=allBody.slice(bodyPage*bodyCapacity,(bodyPage+1)*bodyCapacity);
  const choiceCapacity=Math.max(1,desired-bodyRows.length-footerRows-4);
  const choices=fitTranscriptChoices(rawChoices,choiceCapacity,{selectedOffset});
  const choiceRows=choices.rows.length,choiceGap=choiceRows?1:0;
  const height=Math.max(3,bodyRows.length+choiceGap+choiceRows+footerRows+2);
  if(!allBody.length&&!choiceRows&&!footerRows)return empty;
  const selectedVisible=choices.rows.filter(row=>row.kind==='choice'&&row.selected).length;
  return {...empty,empty:false,contentWidth,bodyRows,bodyPage,bodyPages,promptRows,choices,choiceY:1+bodyRows.length+choiceGap,height,
    selectedIndex:options.length?view.pending.index:null,selectedChoiceComplete:selectedVisible===selectedRows,
    y:placement==='top'?2:Math.max(2,localRows-height-3)};
}

function textRow(row,x,y,width,{alpha=1,center=false,scale=1}={}){
  const role=transcriptRole(row.who),kind=role.kind==='player'||role.kind==='internal'?'player':role.kind;
  const color=INK[kind]||INK.incoming,dx=center?x+(width-row.fullText.length)/2:x;
  // The same VFD glyphs as the shared family; a restrained shear distinguishes
  // narration without introducing an unrelated browser typeface.
  if(kind==='direction')uiDraw(({ctx,cellH,dpr})=>{const baseline=y*cellH*dpr;ctx.transform(1,0,-.10,1,.10*baseline,0);drawVfdText(dx,y,row.text,{scale:1,color,alpha});});
  else drawVfdText(dx,y,row.text,{scale:1,color,alpha});
  if(row.reviewTarget&&row.text.trim())registerReviewRegion(row.reviewTarget,{x:dx*scale,y:y*scale,w:row.text.length*scale,h:scale,active:true});
}

export function drawCinematicConversation(layout){
  if(!layout||layout.empty)return;
  const {x,y,width,height,contentWidth,scale}=layout;
  uiDraw(({ctx,cellW,cellH,dpr})=>{
    ctx.scale(scale,scale);
    const px=x*cellW*dpr,py=y*cellH*dpr,pw=width*cellW*dpr,ph=height*cellH*dpr;
    const wash=ctx.createLinearGradient(px,py,px+pw,py);
    // Busy acquired light may pass behind speech, but must not compete with
    // the available replies. Feather the padding, not the text/number gutter.
    const opacity=layout.review?.80:layout.choices.rows.length?.76:.70,edge=Math.min(.14,2/width),ink=`rgba(0,0,0,${opacity})`;
    wash.addColorStop(0,'rgba(0,0,0,0)');wash.addColorStop(edge,ink);wash.addColorStop(1-edge,ink);wash.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=wash;ctx.fillRect(px,py,pw,ph);
    let cy=y+1;
    for(const row of layout.bodyRows)textRow(row,x+2,cy++,contentWidth,{center:!layout.review,scale});
    if(layout.choices.rows.length){
      cy=y+layout.choiceY;
      for(const row of layout.choices.rows){
        if(row.kind==='label')drawVfdText(x+2,cy,row.text,{scale:.78,color:INK.quiet});
        else{
          const color=row.selected?INK.player:row.disabled?INK.quiet:INK.incoming;
          const gutter=row.gutterWidth||5;
          if(row.firstLine){
            drawVfdText(x+2,cy,`${row.selected?'▸':' '} ${row.choiceIndex+1}`,{scale:1,color,alpha:row.disabled ? .55 : 1});
            if(row.archiveSignal)drawVfdText(x+2+gutter-2,cy,'◆',{scale:1,color:INK.direction});
          }
          drawVfdText(x+2+gutter,cy,row.bodyText??row.text,{scale:1,color,alpha:row.disabled ? .55 : row.spent ? .74 : 1});
          if(row.reviewTarget)registerReviewRegion(row.reviewTarget,{x:(x+2)*scale,y:cy*scale,w:contentWidth*scale,h:scale,selected:row.selected});
        }
        cy++;
      }
    }
    cy=y+height-(layout.promptRows?.length||0)-1;
    for(const row of layout.promptRows||[])drawVfdText(x+2,cy++,row.text,{scale:.78,color:INK.quiet});
  });
}
