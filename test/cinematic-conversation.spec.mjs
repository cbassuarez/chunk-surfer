import test from 'node:test';
import assert from 'node:assert/strict';
import {cinematicTextRows,cinematicConversationLayout} from '../src/render/cinematic-conversation.js';
import {makeColdOpenScene} from '../src/game/coldopen.js';
import {OPENING_PROLOGUE} from '../src/data/opening-prologue.js';
import {uiSetLayoutSize} from '../src/render/ui.js';
import * as scenes from '../src/game/scenes.js';
import {setActiveInputDevice,setControllerBinding,resetControllerSettings} from '../src/game/bindings.js';

test.afterEach(()=>{scenes.clear();uiSetLayoutSize(null);resetControllerSettings();setActiveInputDevice('keyboard');});
const normalize=s=>s.replace(/\s+/g,' ').trim();

test('utterance dimensions and word positions are stable while the actual voice/text count advances',()=>{
  const text='The road   continues. The seam is under your thumb. A longer sentence keeps its first and final words.';
  const whole=cinematicConversationLayout({line:{text},who:'unknown',typed:text.length},{cols:110,rows:32,prompt:'SPACE CONTINUE'});
  for(const typed of [0,1,6,23,text.length]){
    const p=cinematicConversationLayout({line:{text},who:'unknown',typed},{cols:110,rows:32,prompt:'SPACE CONTINUE'});
    assert.deepEqual([p.x,p.y,p.width,p.height],[whole.x,whole.y,whole.width,whole.height]);
    assert.deepEqual(p.bodyRows.map(row=>row.fullText),whole.bodyRows.map(row=>row.fullText));
    assert.equal(normalize(p.bodyRows.map(row=>row.text).join(' ')),normalize(text.slice(0,typed)));
  }
  const token='x'.repeat(71),wrapped=cinematicTextRows(token,17);
  assert.equal(wrapped.map(row=>row.fullText).join(''),token);
  assert.ok(wrapped.every(row=>row.fullText.length<=17));
});

test('nine real questions retain every selected word at normal,125percent and150percent UI size',()=>{
  const options=OPENING_PROLOGUE.nodes.file.choices;
  for(const [pixelsWide,pixelsHigh] of [[1280,800],[1024,640],[800,600]])for(const textScale of [1,1.25,1.5])for(let index=0;index<options.length;index++){
    const cols=Math.floor(pixelsWide/(8.45*textScale)),rows=Math.floor(pixelsHigh/(20*textScale));
    const p=cinematicConversationLayout({history:[{who:'unknown',text:'There is more on the file. You can ask, or leave it there.'}],pending:{kind:'branch',index,options}},{cols,rows,prompt:'SELECT · ENTER REPLY · Q REVIEW'});
    assert.equal(p.selectedChoiceComplete,true,`${pixelsWide} / ${textScale} / ${index}`);
    const chosen=p.choices.rows.filter(row=>row.kind==='choice'&&row.selected);
    assert.equal(normalize(chosen.map(row=>row.bodyText).join(' ')),normalize(options[index].text));
    assert.ok(p.choices.rows.every(row=>row.kind!=='choice'||row.bodyText.length<=p.contentWidth-row.gutterWidth));
    assert.ok((p.y+p.height)*p.scale<=rows-1);
    assert.ok(p.height*p.scale<rows*.76,'a choice bank never creates a full-height mask');
  }
});

test('only the complete current question accompanies choices; old history does not consume the picture',()=>{
  const history=[{who:'unknown',text:'Earlier words that should leave the image.'},{who:'unknown',text:'The actual question?'}];
  const p=cinematicConversationLayout({history,line:{text:'Duplicate question'},typed:3,pending:{kind:'branch',index:0,options:[{text:'Answer.'}]}},{cols:120,rows:40});
  assert.equal(p.bodyRows.map(row=>row.fullText).join(' '),'The actual question?');
  assert.ok(p.bodyRows.every(row=>row.text===row.fullText));
});

test('stage-owned placement and unavailable/automatic/card states expose truthful controls',()=>{
  const common={line:{text:'Keep your hands there.'},who:'unknown',typed:5,pending:{kind:'branch',index:0,options:[{text:'No.'}]}};
  const top=cinematicConversationLayout({...common,captionPlacement:'top'},{cols:120,rows:40});
  const bottom=cinematicConversationLayout(common,{cols:120,rows:40});
  assert.equal(top.y,2);assert.ok(bottom.y>top.y);
  assert.equal(cinematicConversationLayout({...common,captionHidden:true}).empty,true);
  assert.equal(cinematicConversationLayout({...common,captionReady:false}).choices.rows.length,0);
  uiSetLayoutSize({cols:120,rows:40});
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',ambient:false,voiceEnabled:false,
    opening:{start:{lines:[{who:'me',say:false,text:'An already chosen answer.'}]}},presentationView:v=>({...v,captionAutomatic:true})});
  scenes.push(scene);
  assert.equal(scene.cinematicPresentationLayout().promptRows.length,0,'automatic player echo has no second Continue requirement');
});

test('measurement works before rendering, is copied, and uses the real conversation selection',()=>{
  uiSetLayoutSize({cols:95,rows:27});let chosen=null;
  const options=OPENING_PROLOGUE.nodes.file.choices.map((choice,index)=>({text:choice.text,goto:`answer${index}`}));
  const opening={start:{lines:[],choices:options},...Object.fromEntries(options.map((_,i)=>[`answer${i}`,{lines:[{text:`Answer${i}`,voice:false}]}]))};
  const scene=makeColdOpenScene({opening,presentation:'cinematic',cinematicPreset:'scene',ambient:false,voiceEnabled:false,onChoice:choice=>{chosen=choice;}});scenes.push(scene);
  const first=scene.cinematicPresentationLayout(),before=scene.view();
  assert.equal(first.selectedIndex,0);assert.ok(first.bounds.h<27);
  first.bodyRows.push({text:'Mutation'});first.choices.rows.length=0;
  assert.ok(scene.cinematicPresentationLayout().choices.rows.length);
  assert.equal(scene.view().lineSerial,before.lineSerial);
  scene.key({key:'9'});assert.equal(chosen.goto,'answer8');assert.equal(scene.view().nodeId,'answer8');
});

test('long utterances page from their beginning before Continue can advance the existing conversation',()=>{
  uiSetLayoutSize({cols:62,rows:20});
  const text=Array.from({length:145},(_,i)=>`word${i}`).join(' ');
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',ambient:false,voiceEnabled:false,
    opening:{start:{lines:[{text,voice:false},{text:'Next actual utterance.',voice:false}]}}});scenes.push(scene);scenes.update(500);
  let all=[],p=scene.cinematicPresentationLayout();assert.ok(p.bodyPages>1);
  for(let page=0;page<p.bodyPages;page++){
    p=scene.cinematicPresentationLayout();assert.equal(p.bodyPage,page);all.push(...p.bodyRows.map(row=>row.fullText));
    assert.equal(scene.view().line.text,text);scene.key({key:'Enter'});
  }
  assert.equal(normalize(all.join(' ')),text);assert.equal(scene.view().line.text,'Next actual utterance.');
});

test('review holds the same live utterance, pages only completed log and cannot mutate/choose story',()=>{
  uiSetLayoutSize({cols:90,rows:25});const transitions=[];
  const history=Array.from({length:42},(_,i)=>({who:i%2?'me':'unknown',text:`Completed turn${i}.`}));
  const snapshot=JSON.stringify(history);
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',cinematicReview:true,ambient:false,voiceEnabled:false,
    onCinematicReviewChange:active=>transitions.push(active),presentationView:v=>({...v,captionHistory:history}),
    opening:{start:{lines:[{text:'An unfinished current sentence that must resume at the same letter.',voice:false}]}}});
  scenes.push(scene);scenes.update(.1);const before=scene.view();
  scene.key({key:'q',code:'KeyQ',controllerAction:'confirm'});assert.equal(scene.cinematicReviewActive(),false,'a different controller action cannot inherit a synthetic Q');
  scene.key({key:'q'});assert.equal(scene.cinematicReviewActive(),true);assert.equal(scene.view().reviewActive,true);
  scenes.update(90);scene.key({key:'Enter'});assert.equal(scene.view().typed,before.typed);assert.equal(scene.view().nodeId,before.nodeId);
  assert.ok(scene.cinematicPresentationLayout().bodyRows.some(row=>row.fullText.includes('turn0')));
  scene.key({key:'PageDown'});assert.equal(scene.cinematicPresentationLayout().bodyPage,1);
  scene.key({key:'Escape'});assert.equal(scene.cinematicReviewActive(),false);scenes.update(.1);
  assert.ok(scene.view().typed>before.typed);assert.equal(JSON.stringify(history),snapshot);assert.deepEqual(transitions,[true,false]);
});

test('closing review cannot release a separate global presentation hold',()=>{
  uiSetLayoutSize({cols:90,rows:25});
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',cinematicReview:true,ambient:false,voiceEnabled:false,
    presentationView:v=>({...v,captionHistory:[{text:'A completed turn.',who:'unknown'}]}),opening:{start:{lines:[{text:'Still being said.',voice:false}]}}});
  scenes.push(scene);scenes.update(.1);scene.key({controllerAction:'tabPrev'});scene.presentationPause();
  const before=scene.view();scene.key({controllerAction:'back'});assert.equal(scene.view().presentationPaused,true);
  scenes.update(30);assert.equal(scene.view().typed,before.typed);scene.presentationResume();scenes.update(.2);assert.ok(scene.view().typed>before.typed);
});

test('legacy cinematic and Source callers do not opt into review or the new preset',()=>{
  const scene=makeColdOpenScene({presentation:'cinematic',ambient:false,voiceEnabled:false,opening:{start:{lines:[{text:'Legacy.',voice:false}]}}});
  scenes.push(scene);assert.equal(scene.cinematicPresentationLayout(),null);scene.key({key:'q'});assert.equal(scene.cinematicReviewActive(),false);
});

test('review and Continue labels follow actual remapped controller actions',()=>{
  uiSetLayoutSize({cols:120,rows:40});setControllerBinding('confirm','north');setControllerBinding('tabPrev','west');
  setActiveInputDevice('controller',{viable:true,controllerFamily:'xbox'});
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',cinematicReview:true,ambient:false,voiceEnabled:false,
    presentationView:v=>({...v,captionHistory:[{text:'Completed.',who:'unknown'}]}),opening:{start:{lines:[{text:'Still being said.',voice:false}]}}});
  scenes.push(scene);
  const prompt=scene.cinematicPresentationLayout().promptRows.map(row=>row.fullText).join(' ');
  assert.match(prompt,/\[Y\] REVEAL/);assert.match(prompt,/\[X\] REVIEW/);
  scene.key({controllerAction:'tabPrev'});assert.equal(scene.cinematicReviewActive(),true);
  assert.match(scene.cinematicPresentationLayout().promptRows.map(row=>row.fullText).join(' '),/\[X\] RETURN/);
});

test('normalized controller left/right reads every long-utterance page without advancing the story',()=>{
  uiSetLayoutSize({cols:62,rows:20});setActiveInputDevice('controller',{viable:true,controllerFamily:'xbox'});
  const text=Array.from({length:145},(_,i)=>`word${i}`).join(' ');
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',ambient:false,voiceEnabled:false,
    opening:{start:{lines:[{text,voice:false},{text:'Next.',voice:false}]}}});scenes.push(scene);scenes.update(500);
  const first=scene.cinematicPresentationLayout(),serial=scene.view().lineSerial;
  assert.ok(first.bodyPages>1);
  const prompt=first.promptRows.map(row=>row.fullText).join(' ');
  assert.match(prompt,/\[LEFT STICK \/ D-PAD\] READ PAGE/);assert.doesNotMatch(prompt,/PGUP|PGDN|RB|R1/);
  scene.key({key:'ArrowRight',controller:true});assert.equal(scene.cinematicPresentationLayout().bodyPage,1);
  scene.key({key:'ArrowLeft',controller:true});assert.equal(scene.cinematicPresentationLayout().bodyPage,0);
  scene.key({key:'PageDown'});assert.equal(scene.cinematicPresentationLayout().bodyPage,1);
  scene.key({key:'PageUp'});assert.equal(scene.cinematicPresentationLayout().bodyPage,0);
  const words=[];
  for(let page=0;page<first.bodyPages;page++){
    const p=scene.cinematicPresentationLayout();words.push(...p.bodyRows.map(row=>row.fullText));
    assert.equal(p.bodyPage,page);assert.equal(scene.view().lineSerial,serial);
    scene.key({key:'ArrowRight',controller:true});
  }
  assert.equal(normalize(words.join(' ')),text);assert.equal(scene.view().lineSerial,serial);
});

test('controller left/right reads an oversized selected reply while the skip shoulder remains unclaimed',()=>{
  uiSetLayoutSize({cols:62,rows:20});setActiveInputDevice('controller',{viable:true,controllerFamily:'xbox'});
  const text=Array.from({length:90},(_,i)=>`answer${i}`).join(' ');let choices=0;
  const scene=makeColdOpenScene({presentation:'cinematic',cinematicPreset:'scene',ambient:false,voiceEnabled:false,onChoice:()=>choices++,
    opening:{start:{lines:[],choices:[{text,goto:'answer'}]},answer:{lines:[{text:'Answered.',voice:false}]}}});scenes.push(scene);
  let p=scene.cinematicPresentationLayout();assert.equal(p.choices.selectedScroll,true);assert.ok(p.choices.selectedMaxOffset>0);
  assert.match(p.promptRows.map(row=>row.fullText).join(' '),/\[LEFT STICK \/ D-PAD\] READ PAGE/);
  scene.key({key:'ArrowRight',controller:true});assert.equal(scene.cinematicPresentationLayout().choices.selectedOffset,1);
  scene.key({key:'ArrowLeft',controller:true});assert.equal(scene.cinematicPresentationLayout().choices.selectedOffset,0);
  scene.key({key:'e',controllerAction:'tabNext'});assert.equal(scene.cinematicPresentationLayout().choices.selectedOffset,0);
  scene.key({key:'PageDown'});assert.equal(scene.cinematicPresentationLayout().choices.selectedOffset,1);
  scene.key({key:'PageUp'});assert.equal(scene.cinematicPresentationLayout().choices.selectedOffset,0);
  const seen=new Set();
  for(let offset=0;offset<=p.choices.selectedMaxOffset;offset++){
    p=scene.cinematicPresentationLayout();assert.equal(p.choices.selectedOffset,offset);
    for(const row of p.choices.rows.filter(row=>row.kind==='choice'))for(const word of row.bodyText.split(' '))seen.add(word);
    scene.key({key:'ArrowRight',controller:true});
  }
  assert.deepEqual([...seen],text.split(' '));assert.equal(choices,0);assert.equal(scene.view().nodeId,'start');
});
