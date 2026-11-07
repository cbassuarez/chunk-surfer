import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOpeningPrologueScene} from '../src/game/opening-prologue-scene.js';

// A drive host whose picture is a fixed eye; the scene owns the beats.
function fakeDrive(eye=[-8,1.6,-600]){
  const calls={start:0,update:0,frame:0,dispose:0};
  const snapshot=()=>({phase:'free-drive',driveState:{heading:0,z:600}});
  const frame=()=>({scene:{eye:[...eye]},look:{},weather:{},driveState:{heading:0}});
  const drive={start(){calls.start++;},update(){calls.update++;},frame(){calls.frame++;return frame();},snapshot,dispose(){calls.dispose++;}};
  return{drive,calls};
}
function host({drive=null,metrics=null,driveLive=()=>true}={}){
  const calls={beats:[],frames:0,omen:[],done:0};
  const scene=makeOpeningPrologueScene({
    getReady:()=>true,getPresentationReady:()=>true,
    toWorldView:f=>f,setOmen:value=>calls.omen.push(value),
    drive,driveMetrics:metrics==null?()=>null:()=>metrics,driveLive,
    onDriveFrame:frame=>{calls.frames++;calls.lastFrame=frame;},
    onBeat:beat=>calls.beats.push(beat),
    onDone:()=>calls.done++,
    onStart:()=>{},onUnavailable:()=>{},setMusic:()=>{},setOmen2:null,
    audio:{},getAudio:()=>null,reducedMotion:true,
  });
  return{scene,calls};
}
// Get the film running: loading → awaiting-frame → film (a drive first beat
// needs no pictured world frames).
function startFilm(h){
  for(let k=0;k<8&&h.scene.view().phase!=='film';k++)h.scene.update(1/30);
  assert.equal(h.scene.view().phase,'film');
}

test('the drive first beat owns the picture without any world frames',()=>{
  const f=fakeDrive(),h=host({drive:f.drive,metrics:{eye:[0,1.6,-2]}});
  startFilm(h);
  h.scene.update(1/30);
  const view=h.scene.view();
  assert.equal(view.beat,'drive');assert.equal(h.calls.beats[0],'drive');
  assert.equal(f.calls.start,1);assert.ok(f.calls.update>0);assert.equal(h.calls.frames>0,true);
  assert.equal(h.calls.lastFrame.cinematicLook,true);
  assert.equal(h.scene.worldPresentation,'hidden');
  h.scene.exit();
});

test('woken carries the omen through the windshield, and inner returns to the pure omen',()=>{
  const eye=[-8,1.6,-600],f=fakeDrive(eye),h=host({drive:f.drive,metrics:{eye}});
  startFilm(h);
  h.scene.seekStage('woken');h.scene.update(1/30);
  const view=h.scene.view();
  assert.equal(view.beat,'drive-omen');assert.equal(h.scene.worldPresentation,'hidden');
  const omen=h.calls.omen.at(-1);
  assert.ok(omen.horizon?.active,'the wheels ride the drive frame');
  assert.ok(omen.props.some(p=>p.id==='omen:dome'),'the shut sky dome surrounds the cab');
  const centre=omen.horizon.centre;
  // Ahead of the cab and above the road: the hole sits out the windshield.
  assert.ok(centre[2]<eye[2]-60&&centre[1]>eye[1]+20,`centre ${centre} over the road ahead of ${eye}`);
  h.scene.seekStage('inner');h.scene.update(1/30);
  assert.equal(h.scene.view().beat,'omen');assert.equal(h.scene.worldPresentation,'visible');
  assert.deepEqual(h.calls.beats,['drive','drive-omen','omen']);
  h.scene.exit();
});

test('margin and gone are drive beats; everything else stays omen, and a lost drive degrades to omen',()=>{
  const f=fakeDrive(),h=host({drive:f.drive,metrics:{eye:[0,1.6,-2]}});
  startFilm(h);
  for(const stage of['inner','middle','whole','ellery','school','boy','notice','roll']){
    h.scene.seekStage(stage);h.scene.update(1/30);assert.equal(h.scene.view().beat,'omen',stage);
  }
  h.scene.seekStage('woken');h.scene.update(1/30);assert.equal(h.scene.view().beat,'drive-omen','woken');
  for(const stage of['margin','gone']){
    h.scene.seekStage(stage);h.scene.update(1/30);assert.equal(h.scene.view().beat,'drive',stage);
  }
  h.scene.exit();
  const fallback=host({drive:f.drive,metrics:{eye:[0,1.6,-2]},driveLive:()=>false});
  // A pure-omen prologue still waits for real pictured world frames.
  fallback.scene.worldView();fallback.scene.worldView();
  startFilm(fallback);
  fallback.scene.seekStage('dark');fallback.scene.update(1/30);
  assert.equal(fallback.scene.view().beat,'omen','without a live drive the prologue keeps the pure omen');
  assert.equal(fallback.calls.beats.length,0);
  fallback.scene.exit();
});

test('the beat veil covers the picture switch and decays',()=>{
  const f=fakeDrive(),h=host({drive:f.drive,metrics:{eye:[0,1.6,-2]}});
  startFilm(h);
  h.scene.seekStage('woken');h.scene.update(1/60);
  assert.ok(h.scene.view().beatVeil>0,'the switch carries a veil');
  for(let k=0;k<30;k++)h.scene.update(1/60);
  assert.equal(h.scene.view().beatVeil,0,'the veil clears');
  h.scene.exit();
});
