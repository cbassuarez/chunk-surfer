import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CREDITS} from '../src/data/credits.js';
import {vfdGlyph,vfdGlyphMissing} from '../src/render/vfd-font.js';
import {measureElectronicText} from '../src/render/electronic-text.js';
import {creditSignalLayout,creditRecordLayout,wrapCreditSignalText} from '../src/render/credit-signal.js';

const viewports=[{width:1280,height:720},{width:960,height:720},{width:960,height:540},{width:640,height:640},{width:320,height:920}];
const dimensions=({width,height},scale=1)=>({cols:width/8.45,rows:height/20,cellW:8.45*scale,cellH:20*scale});
const opening=[
  '...might not the glory of the machines consist',
  'in their being without this same boasted gift',
  'of language?','',"'Silence,' it has been said by one writer,",
  "'is a virtue which renders us agreeable","to our fellow-creatures.'",
];
const closing=['There is no security against the ultimate','development of mechanical consciousness,','in the fact of machines possessing little','consciousness now.'];
const attribution=['SAMUEL BUTLER · EREWHON','THE BOOK OF THE MACHINES'];
const fixtures=[
  {label:'A GAME BY',lines:['Sebastian Suarez-Solis','2026']},
  {label:'SOUND DESIGN',lines:['Sebastian Suarez-Solis','Paul Yorke']},
  {kind:'quote',lines:opening,attribution},
  {kind:'quote',lines:closing,attribution},
];
const compactText=text=>String(text).replace(/\s+/gu,'');

test('real creator, sound and Butler cards wrap without losing copy at 1280, 960, 640 and 320 pixels',()=>{
  for(const viewport of viewports)for(const fixture of fixtures){
    const size=dimensions(viewport),layout=creditSignalLayout({...size,...fixture});
    assert.equal(layout.fits,true,`${viewport.width}px ${fixture.label||'Butler'} needs ${layout.requiredHeight}px`);
    assert.equal(compactText(layout.bodyLines.join('')),compactText(fixture.lines.join('').toUpperCase()));
    assert.equal(compactText(layout.attributionLines.join('')),compactText((fixture.attribution||[]).join('').toUpperCase()));
    for(const run of layout.runs){
      const width=measureElectronicText(run.text,{fontSize:run.fontPx,cellWidth:run.fontPx*.66});
      assert(run.x>=layout.x-.01&&run.x+width<=layout.x+layout.bodyWidth+.01,`${run.text} escaped the reading width`);
      assert(run.y>=0&&run.y+run.fontPx<=layout.height,`${run.text} escaped the viewport`);
    }
  }
});

test('small or enlarged viewports report insufficient capacity instead of truncating a contributor',()=>{
  const line=CREDITS.flatMap(s=>s.lines).reduce((longest,text)=>text.length>longest.length?text:longest,'');
  const layout=creditSignalLayout({cols:320/8.45,rows:240/20,kind:'body',label:'SOURCE ATTRIBUTION',lines:[line],scale:1.5});
  assert.equal(layout.fits,false);
  assert.equal(compactText(layout.bodyLines.join('')),compactText(line.toUpperCase()));
  assert(layout.maxBodyLines>=1);
});

test('complete release-record tokens, source spelling and URI bytes survive ROM-measured wrapping',()=>{
  const uris=CREDITS.flatMap(s=>s.lines).filter(line=>/^https?:\/\//u.test(line));
  assert(uris.length>90,'exercise the real dense attribution record');
  for(const viewport of viewports){
    const size=dimensions(viewport),layout=creditRecordLayout({...size,heading:'SOURCE ATTRIBUTION'});
    for(const uri of uris){
      const fragments=wrapCreditSignalText(uri,layout.bodyWidth,layout.bodyFontPx,{uppercase:false});
      assert.equal(fragments.join(''),uri,'case-sensitive URI or escape sequence changed');
      for(const text of fragments)assert(measureElectronicText(text,{fontSize:layout.bodyFontPx,cellWidth:layout.bodyFontPx*.66})<=layout.bodyWidth+.01);
    }
    const mixed='François Couperin — L’Art de toucher le clavecin — David Joseph Stith (CC0 1.0)';
    const result=creditRecordLayout({...size,heading:'Source III — Harpsichord and Revoicing',lines:[mixed]});
    assert.equal(compactText(result.bodyLines.join('')),compactText(mixed));
  }
});

test('all canonical credited names and quotations have actual ROM coverage including their diacritics',()=>{
  const text=[...CREDITS.flatMap(s=>[s.heading,...s.lines]),...opening,...closing,...attribution].join('\n');
  const missing=[...new Set([...text].filter(char=>!/[\s]/u.test(char)&&vfdGlyphMissing(char)))];
  assert.deepEqual(missing,[]);
  for(const[marked,bare]of[['ö','o'],['á','a'],['ç','c']])assert.notDeepEqual(vfdGlyph(marked),vfdGlyph(bare),`${marked} silently lost its name's diacritic`);
});

// Exercise the production renderer's host calls without a browser or GPU.
// The character painter is observed at its public boundary; this verifies
// geometry/opacity/ownership, not the emitted pixels or native perception.
function paintHarness({dpr=1,reduced=false}={}){
  const fills=[],glyphs=[],size={cols:1280/8.45,rows:720/20},metrics={cellW:8.45,cellH:20,dpr};
  const ctx={canvas:{width:1280*dpr,height:720*dpr},globalAlpha:1,fillStyle:'#fff',globalCompositeOperation:'source-over',
    fillRect(x,y,w,h){fills.push({x,y,w,h,alpha:this.globalAlpha,color:this.fillStyle,composite:this.globalCompositeOperation});},
    fillText(){},
  };
  const context={uiSize:()=>size,uiCellMetrics:()=>metrics,uiDraw:draw=>draw({ctx,...metrics,...size}),
    drawElectronicText:(_ctx,text,x,y,options)=>glyphs.push({text,x,y,options:{...options}}),measureElectronicText,
    hardwareMotionReduced:()=>reduced,assetUrl:path=>path,
  };
  const source=readFileSync(new URL('../src/render/credit-signal.js',import.meta.url),'utf8')
    .replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
  vm.createContext(context);vm.runInContext(source+'\nglobalThis.api={renderCreditSignal,renderCreditSignalGround};',context);
  return{...context.api,ctx,fills,glyphs,reset(){fills.length=0;glyphs.length=0;}};
}

test('the reading ground replaces a bright remembered world at full opacity',()=>{
  const h=paintHarness();h.ctx.globalAlpha=.07;h.renderCreditSignal({...fixtures[0],background:true});
  assert.deepEqual(h.fills[0],{x:0,y:0,w:1280,h:720,alpha:1,color:'rgb(3,6,8)',composite:'source-over'});
});

test('a zero-alpha sibling credit group cannot wipe the visible card',()=>{
  const h=paintHarness();h.renderCreditSignal({...fixtures[1],alpha:0,attributionAlpha:0,background:false,readingPlane:true});
  assert.equal(h.fills.length,0);assert.equal(h.glyphs.length,0);
});

test('credited text holds have identical positions, light and glyph parameters across elapsed times',()=>{
  const h=paintHarness();h.renderCreditSignal({...fixtures[1],time:2,transition:0});const first=structuredClone(h.glyphs);h.reset();
  h.renderCreditSignal({...fixtures[1],time:12,transition:0});assert.deepEqual(h.glyphs,first);
  for(const glyph of h.glyphs){assert.equal(glyph.options.mode,'vfd');assert.equal(glyph.options.alpha,1);assert.equal(glyph.options.maxWidth,undefined,'never squeeze a name to fit');}
});

test('quiet Source and reduced motion remove the remnant without changing the credited text',()=>{
  const ordinary=paintHarness();ordinary.renderCreditSignal({...fixtures[1],transition:1});const glyphs=structuredClone(ordinary.glyphs);assert(ordinary.fills.length>1);
  for(const h of[paintHarness(),paintHarness({reduced:true})]){h.renderCreditSignal({...fixtures[1],transition:1,quiet:true});assert.equal(h.fills.length,1);assert.deepEqual(h.glyphs,glyphs);}
  const reduced=paintHarness({reduced:true});reduced.renderCreditSignal({...fixtures[1],transition:1});assert.equal(reduced.fills.length,1);
});

test('HiDPI changes sampling while preserving logical credit size and position',()=>{
  const a=paintHarness(),b=paintHarness({dpr:2});a.renderCreditSignal(fixtures[0]);b.renderCreditSignal(fixtures[0]);
  assert.equal(a.glyphs.length,b.glyphs.length);
  for(let i=0;i<a.glyphs.length;i++){
    assert.equal(a.glyphs[i].text,b.glyphs[i].text);assert(Math.abs(a.glyphs[i].x-b.glyphs[i].x/2)<=.5);assert(Math.abs(a.glyphs[i].y-b.glyphs[i].y/2)<=.5);
    assert.equal(a.glyphs[i].options.fontSize,b.glyphs[i].options.fontSize/2);
  }
});
