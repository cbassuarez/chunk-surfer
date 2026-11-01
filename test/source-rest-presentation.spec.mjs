import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceRestPresentationView} from '../src/game/source-rest-presentation.js';

test('the drifting transcript changes its surface but never its choice identity or action',()=>{
  const choice={text:'Stay here.',goto:'next',contentId:'real-choice'},raw={who:'unknown',line:{text:'Listen.',sourceId:'line'},lineSerial:3,
    history:[{who:'me',text:'Yes.',serial:2}],pending:{kind:'branch',index:0,options:[choice]}};
  const shown=sourceRestPresentationView(raw,.76);
  assert.equal(shown.line.text,'Listen·');assert.equal(shown.history[0].text,'Yes·');
  assert.equal(shown.pending.options[0].text,'Stay here·');
  assert.equal(shown.pending.options[0].goto,'next');assert.equal(shown.pending.options[0].contentId,'real-choice');
  assert.equal(raw.line.text,'Listen.');assert.equal(choice.text,'Stay here.');
  assert.notEqual(shown.line.sourceLabel,'UNKNOWN');
  const plain=sourceRestPresentationView(raw,.9,{effects:false});assert.equal(plain.line,raw.line);assert.equal(plain.restSubtitle,true);
});
