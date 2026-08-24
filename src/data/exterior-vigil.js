// THE QUIET VIGIL OUTSIDE ELLERY.
//
// Twenty-four people wait for the 06:00 first strike. They are a preservation
// protest, but the verb is WAIT: wet signs, numbered cups, a camera, a rota and
// six people who each know one bounded piece of the night. Nothing here gates
// the opening route. Malcolm's chapel line buys recognition, never access.

const freeze=(value)=>Object.freeze(value);
function deepFreeze(value){
  if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
  for(const child of Object.values(value))deepFreeze(child);
  return Object.freeze(value);
}
const lines=(...entries)=>entries;
const choice=(text,goto,extra={})=>({text,goto,hideWhenAsked:true,...extra});
const leave=(text)=>({text});
const plate=(id,caption,status='VIGIL')=>freeze({id,mode:'hero',caption,status});
const part=(mesh,id)=>freeze({mesh,id});

const FACE_OFFSET=.40,APPROACH_OFFSET=1.90;
const facing=(yaw)=>({x:Math.sin(yaw),y:-Math.cos(yaw)});
export function vigilFacePoint({x,y,yaw}){
  const f=facing(yaw);return{x:+(x+f.x*FACE_OFFSET).toFixed(3),y:+(y+f.y*FACE_OFFSET).toFixed(3)};
}
export function vigilApproachPoint({x,y,yaw}){
  const f=facing(yaw);return{x:+(x+f.x*APPROACH_OFFSET).toFixed(3),y:+(y+f.y*APPROACH_OFFSET).toFixed(3)};
}

export const VIGIL_MIN_CORRIDOR=4;
export const VIGIL_CLEARANCES=deepFreeze([
  {id:'arrival',x0:-2,x1:52,y0:-2,y1:21,note:'road, lodge, gate, dock and Get-In'},
  {id:'park-spine',x0:7,x1:14,y0:20,y1:38,note:'park entrance and basin path'},
  {id:'park-cross',x0:3,x1:16,y0:32,y1:41,note:'park cross path and fountain kerb'},
  {id:'west-door',x0:13,x1:26,y0:47,y1:56,note:'cathedral west apron'},
  {id:'yard-lane',x0:20,x1:26,y0:20,y1:48,note:'north/south yard lane'},
  {id:'south-porch',x0:28,x1:34,y0:55,y1:83,note:'cathedral east-flank lane'},
  {id:'porch-cross',x0:24,x1:34,y0:66,y1:80,note:'south porch cross route'},
]);

// Bodies collide. Linked parts never do; the body's envelope includes the
// accessory at rest and visual action offsets never move either collider.
export const VIGIL_MESHES=deepFreeze({
  vigil_ruth_mallory:{w:.90,d:.76,h:1.74,blocks:true},
  vigil_leila_hart:{w:.86,d:.76,h:1.76,blocks:true},
  vigil_owen_pryce:{w:1.06,d:.98,h:2.00,blocks:true},
  vigil_denise_okafor:{w:.88,d:.76,h:1.72,blocks:true},
  vigil_malcolm_vey:{w:.92,d:.76,h:1.88,blocks:true},
  vigil_kit_renshaw:{w:.96,d:.82,h:1.76,blocks:true},
  vigil_figure_umbrella_a:{w:1.06,d:.98,h:2.02,blocks:true},
  vigil_figure_umbrella_b:{w:1.06,d:.98,h:1.96,blocks:true},
  vigil_figure_placard_a:{w:1.42,d:.76,h:2.32,blocks:true},
  vigil_figure_placard_b:{w:1.42,d:.76,h:2.22,blocks:true},
  vigil_figure_flask_a:{w:.86,d:.76,h:1.74,blocks:true},
  vigil_figure_flask_b:{w:1.42,d:.78,h:1.80,blocks:true},
  vigil_figure_seated_a:{w:.82,d:.90,h:1.36,blocks:true},
  vigil_figure_seated_b:{w:.84,d:.92,h:1.42,blocks:true},
  vigil_figure_pamphlets_a:{w:1.42,d:.78,h:1.76,blocks:true},
  vigil_figure_pamphlets_b:{w:.88,d:.76,h:1.72,blocks:true},
  vigil_figure_camera_a:{w:.96,d:.86,h:1.86,blocks:true},
  vigil_figure_camera_b:{w:.98,d:.88,h:1.80,blocks:true},
});
export const VIGIL_PART_MESHES=deepFreeze({
  vigil_part_ruth_binder:{w:.40,d:.18,h:.46,blocks:false},
  vigil_part_leila_flask:{w:.34,d:.22,h:.38,blocks:false},
  vigil_part_owen_umbrella:{w:.92,d:.92,h:1.92,blocks:false},
  vigil_part_denise_photos:{w:.46,d:.22,h:.42,blocks:false},
  vigil_part_malcolm_map:{w:.58,d:.22,h:.44,blocks:false},
  vigil_part_kit_microphone:{w:.76,d:.72,h:1.68,blocks:false},
  vigil_part_sign_save:{w:1.32,d:.10,h:2.28,blocks:false},
  vigil_part_sign_strike:{w:1.34,d:.10,h:2.28,blocks:false},
  vigil_part_sign_chapel:{w:1.34,d:.10,h:2.28,blocks:false},
  vigil_part_sign_record:{w:1.34,d:.34,h:1.56,blocks:false},
  vigil_part_sign_signed:{w:1.34,d:.34,h:1.56,blocks:false},
  vigil_part_banner:{w:3.80,d:.08,h:1.12,blocks:false},
});

const RUTH='Ruth Mallory',LEILA='Leila Hart',OWEN='Owen Pryce';
const DENISE='Denise Okafor',MALCOLM='Malcolm Vey',KIT='Kit Renshaw';
export const VIGIL_LINKED_CHAPELS_FLAG='vigil.linkedChapels';

export const VIGIL_VOICES=deepFreeze({
  'vigil-ruth-mallory':{
    id:'vigil-ruth-mallory',name:RUTH,role:'rota holder',label:'the woman with the folder',knownLabel:RUTH,
    slate:'CATHEDRAL FORECOURT / THE FOLDER',speaker:'THE WOMAN WITH THE FOLDER',
    art:plate('vigilRuth','Rain on the rota'),detailArt:plate('vigilRuthNotice','The corrected notice','06:00 THURSDAY'),
    mesh:'vigil_ruth_mallory',parts:[part('vigil_part_ruth_binder','binder')],cluster:'forecourt-east',
    actionSet:['binder-page','weight-shift'],place:freeze({x:28,y:52,yaw:.15}),voice:freeze({pitch:.96,rate:1.02,grain:'level'}),
    tree:{
      start:{speaker:'THE WOMAN WITH THE FOLDER',art:plate('vigilRuth','Rain on the rota'),lines:lines(
        {who:'THE WOMAN WITH THE FOLDER',text:'Mind the gap by the west doors. We promised the fire officer four metres and he brought a tape.'},
        {who:'direction',text:'R. MALLORY is written on the folder spine. The rota has gone soft where her thumb keeps the rain off.'},
        {who:'me',prompt:'Ask about the people waiting.',text:'Are you all staying until morning?'},
        {who:RUTH,text:'That is the idea. Some have the first bus to catch. The rest have work, which is why the cups are numbered.'},
      ),choices:[choice('Ask about the demolition time.','schedule'),choice('Ask what the rota is for.','rota'),leave('Let her get back to the list.')]},
      schedule:{speaker:RUTH,art:plate('vigilRuthNotice','The corrected notice','06:00 THURSDAY'),lines:lines(
        {who:'me',prompt:'Ask which notice is current.',text:'The gate notice still says fourteen days.'},
        {who:RUTH,text:'It has said fourteen days since March. The contractor sheet says first strike, 06:00 Thursday, 1967 wing.'},
        {who:RUTH,text:'I rang the number at the bottom. A man confirmed it, asked where I got the number, and hung up.'},
      ),goto:'start'},
      rota:{speaker:RUTH,art:plate('vigilRuth','Rain on the rota'),lines:lines(
        {who:'me',prompt:'Ask what the numbers mean.',text:'Why number the cups?'},
        {who:RUTH,text:'So I know who has gone home without making them announce it. At quarter past, I cross out anyone who misses the check.'},
        {who:RUTH,text:'Nothing dramatic happens. A coat disappears, a flask gets lighter, and the list tells me whether I should ring somebody.'},
      ),goto:'start'},
      revisit:{speaker:RUTH,art:plate('vigilRuth','Rain on the rota'),lines:lines(
        {who:RUTH,text:'Not yet. Same rain, same names. Keep the service lane clear if you go round again.'}),
        choices:[choice('Ask about the demolition time.','schedule'),choice('Ask about the numbered cups.','rota'),leave('Leave the list alone.')]},
      return:{speaker:RUTH,art:plate('vigilRuthNotice','The corrected notice','06:00 THURSDAY'),lines:lines(
        {who:RUTH,text:'You are back. Keep right of the banner; somebody has put a chair behind you.'}),
        choices:[choice('Ask whether the time changed.','after'),leave('Say goodnight.')]},
      after:{speaker:RUTH,art:plate('vigilRuthNotice','The corrected notice','06:00 THURSDAY'),lines:lines(
        {who:'me',prompt:'Ask whether the work is still scheduled.',text:'Still six?'},
        {who:RUTH,text:'Still six. Vans through this lane at five forty, horn at five fifty-five. That is the last call I had.'},
        {who:RUTH,text:'If you leave before then, use the road gate. They will chain the service side first.'},
      )},
    },
  },
  'vigil-leila-hart':{
    id:'vigil-leila-hart',name:LEILA,role:'former percussion student',label:'the woman watching the west windows',knownLabel:LEILA,
    slate:'YARD / FACING THE PRACTICE WING',speaker:'THE WOMAN AT THE WINDOW',
    art:plate('vigilLeila','Flask beneath the taped window'),detailArt:plate('vigilLeilaWindow','Third window, second floor','PRACTICE WING'),
    mesh:'vigil_leila_hart',parts:[part('vigil_part_leila_flask','flask')],cluster:'west-elevation',
    actionSet:['flask-check','window-look'],place:freeze({x:40,y:43,yaw:1.40}),voice:freeze({pitch:1.06,rate:1.05,grain:'close'}),
    tree:{
      start:{speaker:'THE WOMAN AT THE WINDOW',art:plate('vigilLeilaWindow','Third window, second floor','PRACTICE WING'),lines:lines(
        {who:'THE WOMAN AT THE WINDOW',text:'Third window along, second floor. The black tape is mine. They charged me for taking it down.'},
        {who:'direction',text:'LEILA is written around the flask lid in fading marker.'},
        {who:'me',prompt:'Ask about the room.',text:'What was in there?'},
        {who:LEILA,text:'Practice room P-3. Marimba if you booked early, snare drum if you did not, and a click coming back through the partition.'},
      ),choices:[choice('Ask about the returning click.','rooms'),choice('Ask why she came tonight.','tonight'),leave('Leave her with the window.')]},
      rooms:{speaker:LEILA,art:plate('vigilLeilaWindow','Third window, second floor','PRACTICE WING'),lines:lines(
        {who:'me',prompt:'Ask how late it came back.',text:'How far behind was it?'},
        {who:LEILA,text:'Not enough to count cleanly. Enough to pull the stick out of your hand if you listened to it.'},
        {who:LEILA,text:'Maintenance packed the grille twice. After that I practised with one earplug and stopped booking evenings.'},
      ),goto:'start'},
      tonight:{speaker:LEILA,art:plate('vigilLeila','Flask beneath the taped window'),lines:lines(
        {who:'me',prompt:'Ask why she kept the timetable.',text:'Why come back for the demolition?'},
        {who:LEILA,text:'Ruth emailed the old students. I deleted it, then found the timetable still saved on my phone.'},
        {who:LEILA,text:'I wanted to see whether the tape was there. It is. I have not worked out whether that helps.'},
      ),goto:'start'},
      revisit:{speaker:LEILA,art:plate('vigilLeila','Flask beneath the taped window'),lines:lines(
        {who:LEILA,text:'Still there. The tape catches the yard light when the rain changes.'}),
        choices:[choice('Ask about the returning click.','rooms'),choice('Ask why she kept the timetable.','tonight'),leave('Look up at the window.')]},
      return:{speaker:LEILA,art:plate('vigilLeilaWindow','Third window, second floor','PRACTICE WING'),lines:lines(
        {who:LEILA,text:'You were in there long enough for the light behind P-3 to go out twice.'}),
        choices:[choice('Tell her what the room did.','confirm'),leave('Say nothing about the room.')]},
      confirm:{speaker:LEILA,art:plate('vigilLeilaWindow','Third window, second floor','PRACTICE WING'),lines:lines(
        {who:'me',prompt:'Describe it without naming a cause.',text:'The return is still there.'},
        {who:LEILA,text:'Then the packing did not hold. That is useful, even if it is not an answer.'},
        {who:LEILA,text:'Write down which room before you sleep. Morning moves things around.'},
        {who:'direction',text:'She rubs the rain from the flask lid with her thumb.'},
        {who:LEILA,text:'The booking sheet called it P-3, even after the brass number came off.'},
      )},
    },
  },
  'vigil-owen-pryce':{
    id:'vigil-owen-pryce',name:OWEN,role:'former cathedral custodian',label:'the old man by the south porch',knownLabel:OWEN,
    slate:"ST BRENDAN'S / SOUTH PORCH",speaker:'THE MAN WITH THE OLD KEYS',
    art:plate('vigilOwen','Umbrella below the porch light'),detailArt:plate('vigilOwenKeys','Keys without the porch key','ST BRENDAN’S'),
    mesh:'vigil_owen_pryce',parts:[part('vigil_part_owen_umbrella','umbrella')],cluster:'south-porch',
    actionSet:['umbrella-settle','key-check'],place:freeze({x:35.6,y:65,yaw:-1.45}),voice:freeze({pitch:.88,rate:.94,grain:'dry'}),
    tree:{
      start:{speaker:'THE MAN WITH THE OLD KEYS',art:plate('vigilOwenKeys','Keys without the porch key','ST BRENDAN’S'),lines:lines(
        {who:'THE MAN WITH THE OLD KEYS',text:'That lock was changed after I left. Same escutcheon, new barrel. They did not bother changing the paint around it.'},
        {who:'direction',text:'An old label reads O. PRYCE / SOUTH PORCH. The ring no longer carries the key it names.'},
        {who:'me',prompt:'Ask about the missing key.',text:'What happened to the porch key?'},
        {who:OWEN,text:'Returned with the rest. The diocese signed for twelve keys and sent me a receipt for eleven.'},
      ),choices:[choice('Ask about the bells.','bells'),choice('Ask about the outside handle.','shut'),leave('Let him watch the lock.')]},
      bells:{speaker:OWEN,art:plate('vigilOwen','Umbrella below the porch light','SIX BELLS'),lines:lines(
        {who:'me',prompt:'Ask how many bells remain.',text:'How many bells are up there now?'},
        {who:OWEN,text:'Six now. Eight before 1964. Two went for scrap and the inventory kept copying the old number.'},
        {who:OWEN,text:'The tenor is heavy for the frame. You feel the tower take the stroke before the note reaches the yard.'},
      ),goto:'start'},
      shut:{speaker:OWEN,art:plate('vigilOwenKeys','Keys without the porch key','ST BRENDAN’S'),lines:lines(
        {who:'me',prompt:'Ask why the west door cannot be entered.',text:'Why is there no handle outside?'},
        {who:OWEN,text:'The pull was removed during the alarm work and never put back. The fixing holes are still under the paint.'},
        {who:OWEN,text:'From the nave you can leave. From the forecourt you need somebody already inside. That passed inspection somehow.'},
      ),goto:'start'},
      revisit:{speaker:OWEN,art:plate('vigilOwenKeys','Keys without the porch key','ST BRENDAN’S'),lines:lines(
        {who:OWEN,text:'No change. New barrel, old rain running down it.'}),
        choices:[choice('Ask about the bells.','bells'),choice('Ask about the outside handle.','shut'),leave('Let him watch the lock.')]},
      return:{speaker:OWEN,art:plate('vigilOwen','Umbrella below the porch light','SIX BELLS'),lines:lines(
        {who:OWEN,text:'The tower moved while you were gone. Only a little. The water changed direction on the lead.'}),
        choices:[choice('Ask what the tenor counted.','tenor'),leave('Leave him with the tower.')]},
      tenor:{speaker:OWEN,art:plate('vigilOwen','Umbrella below the porch light','THE TENOR'),lines:lines(
        {who:'me',prompt:'Ask what the tenor was used for.',text:'What did you ring the tenor for?'},
        {who:OWEN,text:'Deaths, mostly. One stroke for each year, then the tenor once more after the pause.'},
        {who:OWEN,text:'You listened from the street and counted. If you knew the family, the number was enough.'},
        {who:'direction',text:'He lets the old key ring settle against his coat.'},
        {who:OWEN,text:'The pause mattered.'},
      )},
    },
  },
  'vigil-denise-okafor':{
    id:'vigil-denise-okafor',name:DENISE,role:'archive volunteer',label:'the woman at the park railing',knownLabel:DENISE,
    slate:'PARK EDGE / PHOTOGRAPH SLEEVES',speaker:'THE WOMAN WITH THE PHOTOGRAPHS',
    art:plate('vigilDenise','Photographs in plastic sleeves'),detailArt:plate('vigilDeniseArchive','The catalogue stops at 1986','BOROUGH ARCHIVE'),
    mesh:'vigil_denise_okafor',parts:[part('vigil_part_denise_photos','photos')],cluster:'park-railing',
    actionSet:['photos-sort','weight-shift'],place:freeze({x:17.6,y:27,yaw:1.50}),voice:freeze({pitch:1,rate:1,grain:'level'}),
    tree:{
      start:{speaker:'THE WOMAN WITH THE PHOTOGRAPHS',art:plate('vigilDenise','Photographs in plastic sleeves'),lines:lines(
        {who:'THE WOMAN WITH THE PHOTOGRAPHS',text:'Hold that corner, would you? The sleeve is waterproof. The hole I punched in it is not.'},
        {who:'direction',text:'The catalogue card beneath her hand reads OKAFOR, D. / LAUNDRY SITE.'},
        {who:'me',prompt:'Ask about the photograph.',text:'Is that this park?'},
        {who:DENISE,text:'Laundry yard, 1912. Same boundary wall. The grass came in 1974 and the caption changed to municipal open space.'},
      ),choices:[choice('Ask where the archive stops.','archive'),choice('Ask what is marked for salvage.','after'),leave('Release the sleeve.')]},
      archive:{speaker:DENISE,art:plate('vigilDeniseArchive','The catalogue stops at 1986','BOROUGH ARCHIVE'),lines:lines(
        {who:'me',prompt:'Ask about the missing years.',text:'What have you got from inside Ellery?'},
        {who:DENISE,text:'Baths opening, chapel dedication, four class photographs, a fire drill. Then the run stops in 1986.'},
        {who:DENISE,text:'After that I have two press photographs and the planning PDF. If somebody used the rooms, they kept the camera away.'},
      ),goto:'start'},
      after:{speaker:DENISE,art:plate('vigilDenise','Photographs in plastic sleeves'),lines:lines(
        {who:'me',prompt:'Ask what the contractor will keep.',text:'What is marked for salvage?'},
        {who:DENISE,text:'The foundation stone. The mosaic is photograph only. Nothing lists the practice-room doors.'},
        {who:DENISE,text:'I asked for one hour inside with a camera. The answer arrived after the contractor fence did.'},
      ),goto:'start'},
      revisit:{speaker:DENISE,art:plate('vigilDenise','Photographs in plastic sleeves'),lines:lines(
        {who:DENISE,text:'The rain is getting under the labels now. Pick one before I put them away.'}),
        choices:[choice('Ask where the archive stops.','archive'),choice('Ask what is marked for salvage.','after'),leave('Release the sleeve.')]},
      return:{speaker:DENISE,art:plate('vigilDeniseArchive','The catalogue stops at 1986','BOROUGH ARCHIVE'),lines:lines(
        {who:DENISE,text:'You had equipment inside. Did you write the room names down, or only the take numbers?'}),
        choices:[choice('Tell her what the recorder kept.','record'),leave('Put the sleeve back.')]},
      record:{speaker:DENISE,art:plate('vigilDeniseArchive','The catalogue stops at 1986','BOROUGH ARCHIVE'),lines:lines(
        {who:'me',prompt:'Say what is on the tape.',text:'Room names, start times, and whatever came through the walls.'},
        {who:DENISE,text:'Good. Put the names on the case before you hand it over. Take numbers mean nothing once the sheet is separated.'},
        {who:DENISE,text:'Make two copies. One for the client, one somewhere the client does not tidy.'},
        {who:'direction',text:'She turns the sleeve over and presses water from the punched corner.'},
        {who:DENISE,text:'Keep the case label with both.'},
      )},
    },
  },
  'vigil-malcolm-vey':{
    id:'vigil-malcolm-vey',name:MALCOLM,role:'campaign regular',label:'the man with the folded map',knownLabel:MALCOLM,
    slate:'FORECOURT / THE FOLDED MAP',speaker:'THE MAN WITH THE MAP',
    art:plate('vigilMalcolm','A map folded against the rain'),detailArt:plate('vigilMalcolmLine','Two chapel marks and a pencil line','1:2500'),
    mesh:'vigil_malcolm_vey',parts:[part('vigil_part_malcolm_map','map')],cluster:'forecourt-west',
    actionSet:['map-fold','weight-shift'],place:freeze({x:2.22,y:52.53,yaw:1.35}),voice:freeze({pitch:1.02,rate:1.12,grain:'pressed'}),
    tree:{
      start:{speaker:'THE MAN WITH THE MAP',art:plate('vigilMalcolm','A map folded against the rain'),lines:lines(
        {who:'THE MAN WITH THE MAP',text:'Hold the lamp there. Not on the plastic—the pencil goes silver when you put it straight on.'},
        {who:'direction',text:'M. VEY is printed beneath an old library stamp. Two chapel plans have been taped over the street map.'},
        {who:'me',prompt:'Ask what he measured.',text:'What are the two circles?'},
        {who:MALCOLM,text:'Ellery chapel and St Brendan’s crossing. Different plans, different scales. I copied the centres before the archive shut.'},
      ),choices:[choice('Notice where the line passes.','line'),choice('Ask why he drew it.','theory'),leave('Give the map back.')]},
      line:{speaker:MALCOLM,art:plate('vigilMalcolmLine','Two chapel marks and a pencil line','1:2500'),lines:lines(
        {who:'me',prompt:'Point out the alignment.',text:'That runs through both chapels.'},
        {who:MALCOLM,text:'Centre to centre, within what I can do with photocopies. There is no duct or right of way on either plan.'},
        {who:MALCOLM,text:'It may be nothing. But if you stand in one of them tonight, listen for the other before the machinery arrives.'},
      ),set:[VIGIL_LINKED_CHAPELS_FLAG],goto:'start'},
      theory:{speaker:MALCOLM,art:plate('vigilMalcolm','A map folded against the rain'),lines:lines(
        {who:'me',prompt:'Ask where the idea came from.',text:'Why draw the line in the first place?'},
        {who:MALCOLM,text:'A neighbour said the drain covers answer the tenor. I tried the bearings and found this.'},
        {who:MALCOLM,text:'The neighbour may be wrong. My centres may be wrong. The line is still straighter than I expected.'},
        {who:'me',text:'And that is enough to stand here all night?'},
        {who:MALCOLM,text:'It is enough to keep the map dry until six.'},
      ),goto:'start'},
      revisit:{speaker:MALCOLM,art:plate('vigilMalcolm','A map folded against the rain'),lines:lines(
        {who:MALCOLM,text:'Same line. I checked after you left; the tape has not improved it.'}),
        choices:[choice('Look at the chapel alignment.','line'),choice('Ask where the idea came from.','theory'),leave('Fold the map closed.')]},
      return:{speaker:MALCOLM,art:plate('vigilMalcolmLine','Two chapel marks and a pencil line','1:2500'),lines:lines(
        {who:MALCOLM,text:'You came back by the long side of the line. I watched which door opened.'}),
        choices:[choice('Ask what he expects at six.','six'),leave('Give the map back.')]},
      six:{speaker:MALCOLM,art:plate('vigilMalcolmLine','Two chapel marks and a pencil line','1:2500'),lines:lines(
        {who:'me',prompt:'Ask what the first strike changes.',text:'What happens to your line at six?'},
        {who:MALCOLM,text:'One centre disappears. After that nobody can repeat the measurement, including me.'},
        {who:MALCOLM,text:'If anything answers the first strike, everybody here will hear it. That is as far as I can take the claim.'},
      )},
    },
  },
  'vigil-kit-renshaw':{
    id:'vigil-kit-renshaw',name:KIT,role:'field recordist',label:'the person tending the shotgun mic',knownLabel:KIT,
    slate:'EAST FLANK / FIELD RECORDING',speaker:'THE PERSON AT THE MICROPHONE',
    art:plate('vigilKit','Rain-dark microphone and cable'),detailArt:plate('vigilKitMeter','Gain log after plant shutdown','22:30'),
    mesh:'vigil_kit_renshaw',parts:[part('vigil_part_kit_microphone','microphone')],cluster:'east-flank',
    actionSet:['camera-check','weight-shift'],place:freeze({x:25.6,y:58,yaw:-1.30}),voice:freeze({pitch:1.04,rate:1.08,grain:'close'}),
    tree:{
      start:{speaker:'THE PERSON AT THE MICROPHONE',art:plate('vigilKit','Rain-dark microphone and cable'),lines:lines(
        {who:'THE PERSON AT THE MICROPHONE',text:'Mind the cable. The black one is mine; the orange one belongs to somebody who left before dinner.'},
        {who:'direction',text:'KIT is written on the recorder strip. Rain has lifted the K at one corner.'},
        {who:'me',prompt:'Ask what the microphone is aimed at.',text:'What are you taking off the wall?'},
        {who:KIT,text:'Low end, mostly. Traffic, plant, wind loading. I am trying to leave enough headroom for the first machine.'},
      ),choices:[choice('Ask to see the gain log.','log'),choice('Ask what would make the take useful.','theory'),leave('Step clear of the microphone.')]},
      log:{speaker:KIT,art:plate('vigilKitMeter','Gain log after plant shutdown','22:30'),lines:lines(
        {who:'me',prompt:'Ask what changed at shutdown.',text:'What happened when the plant stopped?'},
        {who:KIT,text:'Plant drops at twenty-two thirty. The floor loses eleven dB. One narrow band stays where it was.'},
        {who:KIT,text:'Could be road loading, the river wall, or a pump on another supply. I do not have enough baselines.'},
        {who:'me',text:'Does it move?'},
        {who:KIT,text:'About half a semitone in forty minutes, then back. Slow enough that temperature is still in the argument.'},
      ),goto:'start'},
      theory:{speaker:KIT,art:plate('vigilKit','Rain-dark microphone and cable'),lines:lines(
        {who:'me',prompt:'Ask what would make the recording useful.',text:'What would count as a clean result?'},
        {who:KIT,text:'A before-and-after. Plant off, road quiet, rain noted, microphone unmoved. Then I can compare Thursday.'},
        {who:KIT,text:'At the moment it is one wet night and a line on a screen. Interesting is not the same as identified.'},
      ),goto:'start'},
      revisit:{speaker:KIT,art:plate('vigilKit','Rain-dark microphone and cable'),lines:lines(
        {who:KIT,text:'Cable is still live. Come round the back if you want the meter again.'}),
        choices:[choice('Ask what changed with the plant.','log'),choice('Ask what would make the take useful.','theory'),leave('Step clear of the microphone.')]},
      return:{speaker:KIT,art:plate('vigilKitMeter','Gain log after plant shutdown','22:30'),lines:lines(
        {who:KIT,text:'You had the field side. Did your low cut stay in, or did you take it flat?'}),
        choices:[choice('Give the recording conditions.','honest'),leave('Keep the tape to yourself.')]},
      honest:{speaker:KIT,art:plate('vigilKitMeter','Gain log after plant shutdown','22:30'),lines:lines(
        {who:'me',prompt:'Describe the movement without naming it.',text:'Flat. The floor moved under it, but the recorder stayed level.'},
        {who:KIT,text:'Then note the suspension and the room before anything else. “Moved” will be the first word everybody argues with.'},
        {who:KIT,text:'I can compare the times if you give me the slate later. Keep your original.'},
      )},
    },
  },
});

const crowd=(id,mesh,x,y,yaw,cluster,actionSet,note,parts=[])=>freeze({
  id:`vigil-crowd-${id}`,mesh,x,y,yaw,cluster,actionSet:freeze(actionSet),note,parts:freeze(parts),occupantCount:1,
});
export const VIGIL_CROWD=freeze([
  crowd('east-1','vigil_figure_placard_a',27.90,53.44,3.05,'forecourt-east',['placard-lower','weight-shift'],'SAVE ELLERY',[part('vigil_part_sign_save','sign')]),
  crowd('east-2','vigil_figure_umbrella_a',29.80,51.40,3.00,'forecourt-east',['umbrella-settle'],'umbrella at the edge of the group'),
  crowd('east-3','vigil_figure_pamphlets_a',30.60,53.60,2.75,'forecourt-east',['page-turn'],'OUR ROOMS / OUR RECORD',[part('vigil_part_sign_record','leaning-sign')]),
  crowd('east-4','vigil_figure_seated_a',27.37,54.95,3.17,'forecourt-east',['chair-settle'],'folding chair against the wall'),
  crowd('west-1','vigil_figure_umbrella_b',1.73,54.30,3.05,'forecourt-west',['umbrella-settle'],'umbrella up since eight'),
  crowd('west-2','vigil_figure_flask_a',3.40,54.80,3.12,'forecourt-west',['cup-handoff'],'pouring for whoever is nearest'),
  crowd('west-3','vigil_figure_seated_b',7.40,53.80,2.95,'forecourt-west',['chair-settle'],'second folding chair'),
  crowd('verge-1','vigil_figure_placard_b',17.60,24.40,1.55,'park-railing',['placard-lower'],'NO FIRST STRIKE / 06:00',[part('vigil_part_sign_strike','sign')]),
  crowd('verge-2','vigil_figure_umbrella_a',17.60,29.80,1.45,'park-railing',['umbrella-settle'],'facing the building'),
  crowd('verge-3','vigil_figure_flask_b',17.60,42.20,1.50,'park-railing',['cup-handoff'],'the second flask'),
  crowd('verge-4','vigil_figure_pamphlets_b',17.60,44.80,1.55,'park-railing',['page-turn'],'photocopies under a coat'),
  crowd('knot-1','vigil_figure_camera_a',38.20,40.60,1.50,'west-elevation',['camera-check'],'tripod facing the practice wing'),
  crowd('knot-2','vigil_figure_umbrella_b',41.40,45.80,1.35,'west-elevation',['umbrella-settle'],'umbrella held for somebody else'),
  crowd('knot-3','vigil_figure_seated_a',43.80,41.60,1.60,'west-elevation',['chair-settle'],'chair and blanket'),
  crowd('knot-4','vigil_figure_placard_a',36.40,45.80,1.45,'west-elevation',['placard-lower'],'SAVE THE 1908 CHAPEL',[part('vigil_part_sign_chapel','sign')]),
  crowd('porch-1','vigil_figure_umbrella_a',37.40,62.60,-1.50,'south-porch',['umbrella-settle'],'watching the porch'),
  crowd('porch-2','vigil_figure_flask_b',38.80,66.60,-1.40,'south-porch',['cup-handoff'],'WHO SIGNED THIS OFF?',[part('vigil_part_sign_signed','leaning-sign')]),
  crowd('porch-3','vigil_figure_camera_b',40.60,63.80,-1.55,'south-porch',['camera-check'],'camera on the locked door'),
]);
export const VIGIL_STATIC_PARTS=deepFreeze([
  {id:'vigil-part-railing-banner',mesh:'vigil_part_banner',x:17.52,y:34.6,yaw:Math.PI/2,cluster:'park-railing',label:'KEEP ELLERY STANDING'},
]);

export const VIGIL_CLUSTERS=deepFreeze({
  'forecourt-east':{x:28.8,y:52.8,radius:8,tags:['rota','sign','cups']},
  'forecourt-west':{x:4.6,y:53.6,radius:8,tags:['map','cups']},
  'park-railing':{x:18.4,y:31.5,radius:15,tags:['sign','notice','cups']},
  'west-elevation':{x:39.8,y:43.2,radius:10,tags:['window','camera','sign']},
  'south-porch':{x:37.4,y:64.2,radius:9,tags:['camera','porch','cups']},
  'east-flank':{x:26.2,y:58.5,radius:8,tags:['camera','cable']},
});

const observation=(id,text,clusters,tags=[])=>freeze({id,text,clusters:freeze(clusters),tags:freeze(tags)});
export const VIGIL_OBSERVATIONS=freeze([
  observation('vigil.observation.ink','The rain has taken the ink at the edges. Six o’clock is still legible.',['forecourt-east','park-railing'],['sign','notice']),
  observation('vigil.observation.cups','Every cup goes back to the same flask.',['forecourt-east','forecourt-west','south-porch'],['cups']),
  observation('vigil.observation.road','Nobody is watching the road.',['forecourt-east','park-railing','west-elevation']),
  observation('vigil.observation.tally','The red tally light makes the shut porch look occupied.',['south-porch'],['camera','porch']),
  observation('vigil.observation.date','The date has been corrected in three different hands.',['forecourt-east','park-railing'],['notice','sign']),
  observation('vigil.observation.lane','They have left the machines a way in.',['forecourt-east','park-railing','west-elevation']),
]);

export const VIGIL_OVERHEARDS=deepFreeze([
  {id:'vigil.overheard.thursday',cluster:'forecourt-east',text:'Thursday, not Friday. The new sheet says Thursday.'},
  {id:'vigil.overheard.cups',cluster:'forecourt-west',text:'Who has the paper cups? Not the lids, the cups.'},
  {id:'vigil.overheard.battery',cluster:'south-porch',text:'No, leave it rolling. I have the spare battery.'},
  {id:'vigil.overheard.sign',cluster:'park-railing',text:'Put that one against the rail before the cardboard goes.'},
]);

const insert=(at,who,text)=>freeze({at,who,text});
export const VIGIL_ENDING_INSERTS=deepFreeze({
  drugged:[insert(6,'direction','Through the windscreen: nine coats, one folded chair, the banner still tied to the railing.')],
  surfaced:[insert(22,'direction','The people at the gate make room. A chair opens; a dry coat appears from somewhere behind it.')],
  'tower-won':[insert(9,'direction','At the west doors, three people come under the weight when you tell them where to put their hands.')],
});
export const VIGIL_ENDING_ACTIONS=deepFreeze({
  drugged:[{at:5.5,action:'fold-chair',cluster:'forecourt-east'}],
  surfaced:[{at:21.5,action:'open-chair',cluster:'forecourt-east'},{at:22,action:'offer-coat',cluster:'forecourt-east'}],
  'tower-won':[{at:8.5,action:'take-weight',cluster:'forecourt-east'}],
});
export const VIGIL_ENDING_OMISSIONS=freeze(['sacrifice','helped','inversion','contact-won','contact-lost','tower-lost']);

export function vigilEndingInserts(endingId){return VIGIL_ENDING_INSERTS[String(endingId||'')]||null;}
export function vigilVoice(id){return VIGIL_VOICES[String(id||'')]||null;}
export function vigilConversation(id,{phase='first',revisited=false}={}){
  const entry=vigilVoice(id);if(!entry)return null;
  const requested=revisited&&phase==='first'?'immediate-revisit':phase;
  const startAt=requested==='returned'?'return':requested==='immediate-revisit'?'revisit':'start';
  return{tree:entry.tree,startAt,phase:requested,slate:entry.slate,speaker:entry.speaker,art:entry.art};
}
export function vigilObservation(id){return VIGIL_OBSERVATIONS.find((entry)=>entry.id===String(id||''))||null;}
export function vigilMoment(id){return vigilObservation(id);}

export function vigilFigures(){
  return[
    ...Object.values(VIGIL_VOICES).map((voice)=>({
      id:voice.id,mesh:voice.mesh,x:voice.place.x,y:voice.place.y,yaw:voice.place.yaw,
      cluster:voice.cluster,actionSet:voice.actionSet,parts:voice.parts,occupantCount:1,
      talkable:true,label:voice.label,knownLabel:voice.knownLabel,voiceId:voice.id,
      facePoint:vigilFacePoint(voice.place),approach:vigilApproachPoint(voice.place),
    })),
    ...VIGIL_CROWD.map((figure)=>({
      ...figure,talkable:false,label:null,knownLabel:null,voiceId:null,
      facePoint:vigilFacePoint(figure),approach:vigilApproachPoint(figure),
    })),
  ];
}

export function vigilParts(){
  const linked=vigilFigures().flatMap((figure)=>(figure.parts||[]).map((entry)=>({
    id:`vigil-part-${figure.id.replace(/^vigil-/,'')}-${entry.id}`,mesh:entry.mesh,
    actorId:figure.id,cluster:figure.cluster,x:figure.x,y:figure.y,yaw:figure.yaw,
  })));
  return[...linked,...VIGIL_STATIC_PARTS];
}

export const VIGIL=freeze({
  voices:VIGIL_VOICES,crowd:VIGIL_CROWD,observations:VIGIL_OBSERVATIONS,
  meshes:VIGIL_MESHES,partMeshes:VIGIL_PART_MESHES,clearances:VIGIL_CLEARANCES,
  clusters:VIGIL_CLUSTERS,flag:VIGIL_LINKED_CHAPELS_FLAG,
});
