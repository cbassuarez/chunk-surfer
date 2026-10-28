import test from 'node:test';
import assert from 'node:assert/strict';
import {liveTakePanelRect,recorderPanelRect,recorderControlRegions,recordingOverlayButtons} from '../src/render/recorder-view.js';
import {recorderTransportReadout} from '../src/render/recorder-instrument.js';
import {uiCellMetrics,uiSetScale} from '../src/render/ui.js';

test.afterEach(()=>uiSetScale(1));
test('running take leaves central sightline available; slate and narrow screens preserve readable full face',()=>{
 for(const scale of [1,1.5]){
  uiSetScale(scale);const {cellW,cellH}=uiCellMetrics();
  for(const [width,height] of [[1440,900],[2560,1600]]){
   const size={cols:width/cellW,rows:height/cellH,progress:.7,clearBottom:5};
   const live=liveTakePanelRect(size),expanded=liveTakePanelRect({...size,expanded:true});
   assert.deepEqual(expanded,live,'status changes preserve live chassis dimensions');
   assert.ok(live.x+live.w<size.cols*.52,'world centre remains clear');
   assert.ok(live.y+live.h<=size.rows-6,'speech clearance preserved');
   const inspected=recorderPanelRect(size);
   assert.ok(live.w<inspected.w&&live.h<inspected.h,'opening recorder inspection remains an explicit larger view');
   const hits=recorderControlRegions(live,recordingOverlayButtons({rolling:true}));
   assert.equal(hits.length,3);assert.equal(hits[1].id,'stop');
   for(const h of hits)assert.ok(h.x>=live.x&&h.y>=live.y&&h.x+h.w<=live.x+live.w&&h.y+h.h<=live.y+live.h);
  }
  const narrow={cols:800/cellW,rows:600/cellH,progress:0};
  assert.deepEqual(liveTakePanelRect(narrow),recorderPanelRect(narrow));
 }
});
test('warning and every registered resisted STOP press have literal instrument evidence',()=>{
 assert.equal(recorderTransportReadout({phase:'normal'}),null);
 assert.equal(recorderTransportReadout({phase:'drag'}).label,'BRAKE DRAG');
 assert.equal(recorderTransportReadout({phase:'drag',quietReleased:true}).label,'BRAKE FREE');
 for(let tries=1;tries<8;tries++)assert.deepEqual(recorderTransportReadout({phase:'seized',tries,needs:8}),{label:'STOP HELD',detail:`STOP ${tries}/8`,held:true});
});
