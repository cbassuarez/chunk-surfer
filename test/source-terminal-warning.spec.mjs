import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NTFSCLONE_WARNING, renderSectorAggregateFrame, renderSectorErrorFrame, sectorTerminalRows } from '../src/render/sector-error.js';
import { SOURCE_WARNING_FORM_STEPS, SOURCE_WARNING_PRE_FRAMES, sourceWarningFrames } from '../src/render/source-warning.js';
import { createPaneScoreEnvelope, sectorErrorCompositionPlan, sourceWarningCompositionPlan } from '../src/platform/window-composition.js';
import { createPersonalizedWindowEffects } from '../src/platform/personalized-window-effects.js';

function context() {
  const drawn=[],fills=[],copies=[];
  return {
    drawn,fills,copies,canvas:{},font:'15px monospace',
    save(){},restore(){},
    measureText(text){return{width:String(text).length*parseFloat(this.font)*.6};},
    fillText(text,x,y){drawn.push({text,x,y,width:this.measureText(text).width});},
    fillRect(...args){fills.push(args);},drawImage(...args){copies.push(args);},
  };
}

test('stderr wraps and advances whole terminal rows instead of clipping or resetting a random disk',()=>{
  const a=sectorTerminalRows({columns:43,rows:12,scroll:3,seed:4417});
  const fractional=sectorTerminalRows({columns:43,rows:12,scroll:3.9,seed:4417});
  const b=sectorTerminalRows({columns:43,rows:12,scroll:4,seed:4417});
  assert.deepEqual(a,fractional,'terminal scrolling has no fractional glyph position');
  assert.deepEqual(a.rows.slice(2),b.rows.slice(0,-2),'the same disk advances one wrapped warning');
  assert.deepEqual(a.cursor,{column:0,row:11});
  assert.ok(a.rows.every((row)=>row.length<=44));
  assert.ok(a.rows.some((row)=>row.endsWith('lost data.')));
});

test('a full ntfsclone warning fits the source texture and normal panes at their real dimensions',()=>{
  for(const width of [320,512,640]){
    const ctx=context();
    renderSectorErrorFrame(ctx,{width,height:320,tear:0});
    assert.ok(ctx.drawn.length>1);
    for(const line of ctx.drawn){
      assert.ok(line.x+line.width<=width,`the warning ending must fit at ${width}px`);
      assert.match(line.text,/lost data\.$/);
    }
    assert.equal(ctx.copies.length,0);
  }
  assert.equal(NTFSCLONE_WARNING(29498915328),"WARNING: Can't read sector at 29498915328, lost data.");
});

test('terminal windows bypass dither, avoid flashing, and retain a slow mode',()=>{
  const tokens=['snapshot-a','snapshot-b','snapshot-c'];
  const normal=sectorErrorCompositionPlan({phaseTokens:tokens});
  const reduced=sectorErrorCompositionPlan({phaseTokens:tokens,reducedMotion:true,flashMode:'off'});
  assert.ok(normal.surfaces.every((surface)=>surface.shader==='terminal'));
  assert.equal(normal.fault.intensity,0);
  assert.ok(reduced.score.durationMs>normal.score.durationMs);
  const shader=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
  assert.match(shader,/if\(terminal==1\).*texture\(image,crop.xy\+uv\*crop.zw\)/);
});

const stepTokens=()=>Array.from({length:8},(_,m)=>SOURCE_WARNING_FORM_STEPS.map((_,step)=>`snapshot-warning-${m}-${step}`));
test('a scored terminal sends every referenced image, not its initial image for every token',()=>{
  const messageTokens=stepTokens();
  const plan=sourceWarningCompositionPlan({preTokens:['snapshot-a','snapshot-b'],messageTokens});
  const frames=Object.fromEntries(['snapshot-a','snapshot-b',...messageTokens.flat(),'snapshot-unrelated'].map((token)=>[token,`data:image/png;base64,${token}`]));
  const envelope=createPaneScoreEnvelope(plan,'source-warning:0',{targetLabel:'window-media-1',sessionToken:'session-test',revision:1,snapshotFrames:frames});
  assert.equal(envelope.snapshotFrames['snapshot-a'],frames['snapshot-a']);
  assert.equal(envelope.snapshotFrames['snapshot-b'],frames['snapshot-b']);
  for(const step of [0,1,2]){
    assert.equal(envelope.snapshotFrames[`snapshot-warning-0-${step}`],frames[`snapshot-warning-0-${step}`],'the name does not gather step by step');
    assert.equal(envelope.snapshotFrames[`snapshot-warning-4-${step}`],frames[`snapshot-warning-4-${step}`],'the warning does not gather step by step');
    assert.equal(envelope.snapshotFrames[`snapshot-warning-1-${step}`],undefined,'no other pane identity fragment is transmitted');
  }
  assert.equal(envelope.snapshotFrames['snapshot-unrelated'],undefined);
});

test('the authored warning has no puzzle gate and can run without canvas, media, or identity',()=>{
  for(const options of [{},{reducedMotion:true},{flashMode:'off'}]){
    const plan=sourceWarningCompositionPlan(options);
    assert.equal(plan.purpose,'source-warning');
    assert.equal(plan.completion.mode,'nonblocking');
    assert.equal(plan.constraints.length,0);
    assert.ok(plan.surfaces.every((surface)=>!surface.draggable));
    assert.ok(plan.surfaces.some((surface)=>surface.content.text==='WATCH OUT'));
    assert.equal(plan.score.loop,false);
    assert.ok(plan.score.cues.some((cue)=>cue.operations.some((op)=>op.type==='hide')));
  }
  assert.deepEqual(sourceWarningFrames({documentApi:null}),{pre:[],messages:[]});
});

const fakeDocument=(captured=[])=>({createElement(){const ctx=context();captured.push(ctx);return{getContext:()=>ctx,toDataURL:()=>`data:image/png;base64,opaque-${captured.length}`};}});
// A letter-shaped stand-in for the rasterised text: a block in the middle.
const blockMask=(seen)=>(message)=>{seen.push(message);return (x,y)=>x>180&&x<460&&y>120&&y<320;};
test('only explicit permission can render the supplied name; artifacts contain no literal name',()=>{
  const seen=[];
  const hidden=sourceWarningFrames({operatorName:'ALAN',permitted:false,documentApi:fakeDocument(),mask:blockMask(seen)});
  assert.equal(hidden.messages.length,8);
  assert.ok(!seen.some((message)=>/A\s*L\s*A\s*N|^A$|^N$/.test(message)),'the name was shaped without permission');
  seen.length=0;
  const allowed=sourceWarningFrames({operatorName:'ALAN',permitted:true,documentApi:fakeDocument(),mask:blockMask(seen)});
  assert.equal(allowed.messages.length,8);
  // The mask is asked once per formation step, so take one ask per message.
  const perMessage=seen.filter((_,index)=>index%SOURCE_WARNING_FORM_STEPS.length===0);
  assert.equal(perMessage.slice(0,4).join('').replace(/\s/g,''),'ALAN');
  assert.ok(!JSON.stringify(allowed).includes('ALAN'));
  seen.length=0;
  sourceWarningFrames({operatorName:'/Users/private-name',permitted:true,documentApi:fakeDocument(),mask:blockMask(seen)});
  assert.equal(seen[0],'S I G N A L','paths and account handles are rejected');
});

test('the warning never leaves the failing terminal: its letters are the terminal\'s own cells turned to bits',()=>{
  const captured=[];
  const frames=sourceWarningFrames({operatorName:'ALAN',permitted:true,documentApi:fakeDocument(captured),mask:blockMask([])});
  assert.equal(frames.pre.length,SOURCE_WARNING_PRE_FRAMES);
  assert.ok(frames.messages.every((steps)=>steps.length===SOURCE_WARNING_FORM_STEPS.length));
  assert.ok(frames.pre.length+frames.messages.flat().length<=32,'the warning evicts its own frames from the 32-snapshot bank');
  for(const ctx of captured){
    const texts=ctx.drawn.map((entry)=>entry.text);
    assert.ok(texts.some((text)=>/lost data\.$/.test(text)),'a warning frame stopped being the ntfsclone terminal');
    assert.ok(!texts.some((text)=>/ntfsclone \/ stderr/.test(text)),'the clean stderr card is back');
  }
  const gentle=sourceWarningFrames({operatorName:'ALAN',permitted:true,documentApi:fakeDocument(),mask:blockMask([]),flashMode:'off'});
  assert.ok(gentle.messages.every((steps)=>steps.length===1),'gentle modes still animate the gathering');
  const draw=(form)=>{const ctx=context();const stats=renderSectorAggregateFrame(ctx,{message:'X',form,seed:4417,scroll:12,mask:(x,y)=>x>180&&x<460&&y>120&&y<320});return{ctx,stats};};
  const early=draw(.35),formed=draw(1);
  assert.ok(formed.stats.cells>early.stats.cells,'more of the message has not arrived by the formed frame');
  assert.ok(early.stats.migrating>0,'nothing is still crossing into the letters');
  assert.equal(formed.stats.migrating,0);
  const bits=formed.ctx.drawn.filter((entry)=>entry.text.length===1).map((entry)=>entry.text);
  assert.ok(bits.length>=formed.stats.cells&&bits.every((text)=>text==='0'||text==='1'),'the letters are made of something other than ones and zeroes');
});

test('each pane gathers its message in steps, cannot quite hold it, and gentle modes cut once',()=>{
  const messageTokens=stepTokens();
  const plan=sourceWarningCompositionPlan({preTokens:['snapshot-a','snapshot-b'],messageTokens});
  const at=(id)=>plan.score.cues.find((cue)=>cue.id===id)?.atMs;
  const forming=[0,1,2].map((step)=>at(`source-address-0-form-${step}`));
  assert.ok(forming.every(Number.isFinite)&&forming[0]<forming[1]&&forming[1]<forming[2],'the name does not gather in order');
  assert.ok(plan.score.cues.some((cue)=>/^source-address-0-slip-\d+$/.test(cue.id)),'the held name never slips');
  assert.ok(Number.isFinite(at('source-release-0'))&&at('source-release-0')<at('source-warning-0-form-0'),'the name is not let go before the warning gathers');
  const gentle=sourceWarningCompositionPlan({preTokens:['snapshot-a'],messageTokens,flashMode:'off'});
  assert.ok(gentle.score.cues.some((cue)=>cue.id==='source-address-0'));
  assert.ok(!gentle.score.cues.some((cue)=>/-slip-|-form-/.test(cue.id)),'gentle modes flicker the message');
});

test('retired native panes erase transient snapshots and GPU image contents',()=>{
  const native=readFileSync(new URL('../src/window-media-surface.js',import.meta.url),'utf8');
  const effects=readFileSync(new URL('../src/platform/personalized-window-effects.js',import.meta.url),'utf8');
  assert.match(effects,/window-media-clear/);
  assert.match(native,/function clearMediaScore[\s\S]*?currentRevision[\s\S]*?envelope=null[\s\S]*?texImage2D/);
  assert.match(native,/snapshotFrames\?\.\[content.token\]/);
});

test('Source identity snapshots are transient and do not evict the terminal phase bank',async()=>{
  const effects=createPersonalizedWindowEffects({documentApi:null});
  const terminals=Array.from({length:10},(_,index)=>effects.registerSnapshot(`data:image/png;base64,terminal-${index}`));
  const identity=Array.from({length:8},(_,index)=>effects.registerSnapshot(`data:image/png;base64,synthetic-name-${index}`));
  assert.ok(terminals.every((token)=>effects.snapshotData(token)),'the old twelve-frame cap lost terminal scroll images');
  effects.releaseSnapshots(identity);
  assert.ok(identity.every((token)=>effects.snapshotData(token)===null));
  assert.ok(terminals.every((token)=>effects.snapshotData(token)),'targeted erasure keeps non-personal terminal images available');
  await effects.hideComposition();
  assert.ok(terminals.every((token)=>effects.snapshotData(token)===null),'new Source entry must rebake after a full clear');
});

test('a damaged terminal overfills, smears its churning offsets, and tears rows, lines and pixels',()=>{
  const draw=(tear,scroll=12)=>{const ctx=context();renderSectorErrorFrame(ctx,{width:640,height:432,scroll,seed:4417,tear,columns:43,fontPx:23,referencePalette:true});return ctx;};
  const clean=draw(0),damaged=draw(.38);
  const lowest=(ctx)=>Math.max(...ctx.drawn.map((line)=>line.y));
  assert.ok(lowest(damaged)>lowest(clean),'the damaged terminal stops short of the pane edge instead of running past it');
  assert.ok(damaged.drawn.length>clean.drawn.length*1.6,'no ghost of earlier writes under the churning rows');
  const strips=damaged.copies.filter((args)=>args[1]===0&&args[3]===640&&args[4]<=3);
  const pixels=damaged.copies.filter((args)=>args[3]===1&&args[4]===1);
  assert.ok(strips.length>=3,'no scanline shear');
  assert.ok(pixels.length>=16,'no pixelated block');
  assert.ok(damaged.copies.length-strips.length-pixels.length>=3,'fewer than three block tears');
  const head=(ctx)=>ctx.drawn.filter((line)=>line.x>=0&&line.y<60).map((line)=>line.text).join('|');
  assert.ok(head(draw(.38,12)).includes('29498915'),'the first reads do not stay at the head');
  assert.equal(draw(.38,12).drawn.find((line)=>line.text==='0;10mm')?.x,draw(.38,30).drawn.find((line)=>line.text==='0;10mm')?.x,
    'the stale fragments move with the scroll instead of staying put');
});

test('the terminal floods at a failing clone’s pace, and slows right down when motion is reduced',()=>{
  const tokens=Array.from({length:20},(_,index)=>`snapshot-${index}`);
  const paneGap=(plan)=>{
    const times=plan.score.cues.filter((cue)=>/^sector-scroll-\d+-0$/.test(cue.id)).map((cue)=>cue.atMs).sort((a,b)=>a-b);
    return Math.min(...times.slice(1).map((time,index)=>time-times[index]));
  };
  assert.ok(paneGap(sectorErrorCompositionPlan({phaseTokens:tokens}))<=80,'the sector screen scrolls at a reading pace');
  assert.ok(paneGap(sectorErrorCompositionPlan({phaseTokens:tokens,reducedMotion:true}))>=900,'reduced motion floods the screen');
  const prints=(plan)=>plan.score.cues.filter((cue)=>/^source-print-\d+-0$/.test(cue.id)&&cue.atMs<3200).length;
  assert.ok(prints(sourceWarningCompositionPlan({phaseTokens:tokens.slice(0,20)}))>=40,'the Source warning terminals print a few lines and stop');
  assert.ok(prints(sourceWarningCompositionPlan({phaseTokens:tokens.slice(0,20),flashMode:'off'}))<=4,'the gentle warning floods anyway');
});
