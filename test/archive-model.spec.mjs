import test from 'node:test';
import assert from 'node:assert/strict';
import {ACHIEVEMENT_DEFS} from '../src/progression/achievement-defs.js';
import {achievementEntries,achievementCompletion} from '../src/progression/achievements.js';
import {archivePercent,archiveFilteredEntries,archiveAchievementCopy,archiveContentLayout} from '../src/game/archive-model.js';
import {achievementIconKnown,achievementIconGeometry,achievementIconSvg,ACHIEVEMENT_ICON_IDS} from '../src/render/achievement-icons.js';

test('the displayed percentage cannot reach100until every known achievement is unlocked',()=>{
 const complete={achievements:Object.fromEntries(ACHIEVEMENT_DEFS.map(d=>[d.id,{unlockedAt:1}]))};
 assert.equal(archivePercent(achievementCompletion({achievements:{unknown:{unlockedAt:1}}})),'0%');
 assert.equal(archivePercent(achievementCompletion(complete)),'100%');
 delete complete.achievements[ACHIEVEMENT_DEFS.at(-1).id];
 assert.notEqual(archivePercent(achievementCompletion(complete)),'100%');
 assert.equal(archivePercent({completed:9999,total:10000,complete:false}),'99.9%');
 assert.equal(archivePercent({completed:0,total:0,complete:true}),'0%');
});

test('category and status filters use actual definitions and preserve catalogue ordering',()=>{
 const meta={achievements:{[ACHIEVEMENT_DEFS[0].id]:{unlockedAt:1}}},entries=achievementEntries(meta);
 assert.equal(archiveFilteredEntries(entries,{filter:'unlocked'}).length,1);
 assert.equal(archiveFilteredEntries(entries,{filter:'locked'}).length,entries.length-1);
 assert.ok(archiveFilteredEntries(entries,{category:'work'}).every(e=>e.category==='work'));
 assert.deepEqual(archiveFilteredEntries(entries),entries);
});

test('unfound secret names, emblems, requirements and progress remain concealed until explicit reveal',()=>{
 const entry={id:'secret',name:'Do not leak me',description:'The exact answer',hint:'Try a familiar instrument.',hidden:true,icon:'secret-art',scope:'single-run',progress:{current:1,target:2}};
 const before=JSON.stringify(entry),sealed=archiveAchievementCopy(entry),hint=archiveAchievementCopy(entry,{hint:true}),revealed=archiveAchievementCopy(entry,{reveal:true});
 assert.equal(sealed.name,'UNDISCOVERED ACHIEVEMENT');assert.equal(sealed.icon,'unknown');assert.equal(sealed.progress,null);
 assert.equal(hint.description,entry.hint);assert.equal(hint.name,sealed.name);assert.equal(hint.hintVisible,true);
 assert.equal(revealed.name,entry.name);assert.equal(revealed.description,entry.description);assert.equal(revealed.icon,entry.icon);
 assert.equal(JSON.stringify(entry),before);
});

test('compact inspection gives the selected requirement its own pane; wide archive retains list and detail',()=>{
 const small={x:3,y:4,w:58,h:13},wide={x:3,y:4,w:100,h:30};
 const list=archiveContentLayout(small),detail=archiveContentLayout(small,{detail:true}),large=archiveContentLayout(wide);
 assert.equal(list.compact,true);assert.equal(list.detail,false);assert.equal(detail.detail,true);assert.ok(detail.contentH>list.contentH);
 assert.equal(detail.detailW,small.w);assert.equal(large.compact,false);assert.ok(large.detailX>large.divider);assert.ok(large.detailW>=30);
 for(const l of[list,detail,large])assert.ok(l.capacity>=1&&l.contentH>=1);
});

test('every shipping achievement owns a distinct original vector emblem and valid platform SVG',()=>{
 const fingerprints=new Set();
 for(const def of ACHIEVEMENT_DEFS){
  const id=def.icon||def.id;assert.ok(achievementIconKnown(id),`${def.id}: ${id}`);
  const shapes=achievementIconGeometry(id);assert.ok(shapes.length);fingerprints.add(JSON.stringify(shapes));
  const svg=achievementIconSvg(id,{size:256,unlocked:true});assert.match(svg,/viewBox="0 0 64 64"/);assert.match(svg,/width="256"/);
  assert.doesNotMatch(svg,/<image|<text|https?:\/\/(?!www.w3.org)/);
 }
 assert.equal(fingerprints.size,ACHIEVEMENT_DEFS.length);assert.equal(ACHIEVEMENT_ICON_IDS.length,ACHIEVEMENT_DEFS.length);
 assert.equal(achievementIconSvg('ACH_HUSH_MET',{concealed:true}),achievementIconSvg('ACH_NAME_SARAH',{concealed:true}));
 for(const id of['constructor','__proto__','toString','hasOwnProperty']){
  assert.equal(achievementIconKnown(id),false);assert.doesNotThrow(()=>achievementIconSvg(id));
 }
});
