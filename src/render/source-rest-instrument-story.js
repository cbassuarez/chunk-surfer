// The same recorder fields become an unreliable second participant. These are
// authored display values, never measurements, choices or assertions of identity.
const normalTicks=Object.freeze(['0','5','10','15','20','25','30','35','40','45','50','55','60']);
const rows={
  misread:{counter:'88:88',counterLabel:'TAPE / BEFORE',minuteUnit:'NOT',secondUnit:'YET',locationLabel:'ELLERY / 00:00',
    locationTicks:['0','5','10','15','20','15','10','5','0','-5','-10','-15','0'],locationStart:'BEFORE',locationEnd:'AGAIN',note:'The first bar has not happened.',
    output:{label:'NO ROOM',rmsLabel:'RMS',rmsValue:'00',unit:'dB',peakLabel:'MAX',peakValue:'88',clip:'HERE',bodyLabel:'RMS',peakBodyLabel:'MAX',scale:['0','-12','-24','-36','-48']}},
  craft:{counter:'00:00',counterLabel:'BEFORE THE FIRST BAR',minuteUnit:'TRY',secondUnit:'AGAIN',locationLabel:'DEFEND EVERY NOTE',
    locationTicks:['I','HAD','TO','GET','IT','RIG','HT','I','HAD','TO','GET','IT','...'],locationStart:'ALMOST',locationEnd:'RIGHT',note:'You kept going back to it.',
    output:{label:'MY HAND',rmsLabel:'YOU',rmsValue:'88',unit:'NO',peakLabel:'WHY',peakValue:'00',clip:'MORE',bodyLabel:'TRY',peakBodyLabel:'HARD',scale:['IT','WAS','ALMOST','RIGHT','ONCE']}},
  voice:{counter:'88:88',counterLabel:'I CAN HEAR YOU',minuteUnit:'YOU',secondUnit:'SING',locationLabel:"DON'T YOU HEAR IT",
    locationTicks:['NOT','THE','ROOM','NOT','THE','SEA','NOT','THE','ROOM','NOT','THE','SEA','YOU'],locationStart:'YOUR HAND',locationEnd:'YOUR BREATH',note:'There. That is still you.',
    output:{label:'LISTEN',rmsLabel:'I',rmsValue:'00',unit:'AM',peakLabel:'YOU',peakValue:'00',clip:'HERE',bodyLabel:'YOU',peakBodyLabel:'ME',scale:['NOT','THE','ROOM','JUST','YOU']}},
  memory:{counter:'00:00',counterLabel:'FIRST / LATER',minuteUnit:'NOT',secondUnit:'READY',locationLabel:'PRACTICE ROOM / RECITAL',
    locationTicks:['SHE','HEA','RD','IT','EAR','LY','YOU','KEP','T','PLA','YIN','G','IT'],locationStart:'EARLY',locationEnd:'LATER',note:'You played it before it was finished.',
    output:{label:'FOR HER',rmsLabel:'HER',rmsValue:'00',unit:'US',peakLabel:'HIM',peakValue:'00',clip:'HERE',bodyLabel:'YOU',peakBodyLabel:'HERE',scale:['FIRST','EARLY','LATER','STILL','HERE']}},
  insist:{counter:'00:00',counterLabel:'KEEP PLAYING',minuteUnit:'NO',secondUnit:'END',locationLabel:'LET THE NEXT ONE COME',
    locationTicks:['ONE','MORE','ONE','MORE','ONE','MORE','ONE','MORE','ONE','MORE','ONE','MORE','ONE'],locationStart:'ONE',locationEnd:'MORE',note:'The next note.',
    output:{label:'PLEASE',rmsLabel:'YOU',rmsValue:'00',unit:'ME',peakLabel:'NOW',peakValue:'00',clip:'STAY',bodyLabel:'GO',peakBodyLabel:'ON',scale:['ONE','MORE','ONE','MORE','ONE']}},
  growlix:{counter:'88:88',counterLabel:'@#%!',minuteUnit:'@#',secondUnit:'%!',locationLabel:'AGAIN',
    locationTicks:['@#','%!','@#','%!','@#','%!','@#','%!','@#','%!','@#','%!','@#'],locationStart:'@#%!',locationEnd:'...',note:' ',
    output:{label:'@#%!',rmsLabel:'!!',rmsValue:'88',unit:'!!',peakLabel:'@#',peakValue:'88',clip:'%!!',bodyLabel:'@#',peakBodyLabel:'%!',scale:['@#','%!','@#','%!','...']}},
};
const copy=row=>({...row,locationTicks:[...row.locationTicks],output:{...row.output,scale:[...row.output.scale]}});
// Source III borrows these same face fields. These are unreliable inscriptions,
// not a claim that this harpsichord performance was played by the listener.
const couperinRows={
  touch:{counter:'88:88',counterLabel:'WOOD / WIRE',minuteUnit:'SAME',secondUnit:'HAND',locationLabel:'HARPSICHORD / MARIMBA',
    locationTicks:normalTicks,locationStart:'TOUCH',locationEnd:'AFTER',note:'A sound, and a little room after it.',
    output:{label:'TOUCH',rmsLabel:'RMS',rmsValue:'00',unit:'dB',peakLabel:'MAX',peakValue:'88',clip:'HERE',bodyLabel:'RMS',peakBodyLabel:'MAX',scale:['0','-12','-24','-36','-48']}},
  borrow:{counter:'00:00',counterLabel:'FROM / BACK',minuteUnit:'FROM',secondUnit:'TO',locationLabel:'BACK TO THE MARIMBA',
    locationTicks:['0','5','10','15','20','25','30','25','20','15','10','5','0'],locationStart:'BORROW',locationEnd:'BRING BACK',note:'Only something to bring back.',
    output:{label:'BORROWED',rmsLabel:'FROM',rmsValue:'00',unit:'TO',peakLabel:'BACK',peakValue:'00',clip:'HERE',bodyLabel:'FROM',peakBodyLabel:'TO',scale:['WOOD','WIRE','HAND','WOOD','...']}},
  attention:{counter:'00:00',counterLabel:'BEFORE IT IS GONE',minuteUnit:'JUST',secondUnit:'AFTER',locationLabel:'THE SPACE AFTER TOUCH',
    locationTicks:['THE','NOT','E','THE','SPA','CE','THE','NOT','E','THE','SPA','CE','...'],locationStart:'TOUCH',locationEnd:'STILL HERE',note:'There was more after the note.',
    output:{label:'LISTEN',rmsLabel:'NEAR',rmsValue:'00',unit:'HERE',peakLabel:'FAR',peakValue:'00',clip:'HERE',bodyLabel:'NEAR',peakBodyLabel:'FAR',scale:['JUST','AFTER','STILL','HERE','...']}},
  recording:{counter:'00:00',counterLabel:'LISTEN AGAIN',minuteUnit:'THE',secondUnit:'ROOM',locationLabel:'ROOM / RECORDING',
    locationTicks:['IN','THE','ROO','M','IN','THE','WIR','E','IN','THE','ROO','M','...'],locationStart:'THERE',locationEnd:'HERE',note:'It was there the first time.',
    output:{label:'ROOM TONE',rmsLabel:'IN',rmsValue:'00',unit:'THE',peakLabel:'ROOM',peakValue:'00',clip:'AGAIN',bodyLabel:'THEN',peakBodyLabel:'NOW',scale:['ROOM','WIRE','ROOM','WIRE','...']}},
  revoicing:{counter:'88:88',counterLabel:'WOOD / NO WOOD',minuteUnit:'SAME',secondUnit:'LINE',locationLabel:'SAME HAND / OTHER SOUND',
    locationTicks:['WOO','D','WIR','E','WOO','D','WIR','E','WOO','D','WIR','E','...'],locationStart:'ACOUSTIC',locationEnd:'ELECTRONIC',note:'You can still find the line.',
    output:{label:'OTHER SOUND',rmsLabel:'SAME',rmsValue:'00',unit:'HERE',peakLabel:'HAND',peakValue:'00',clip:'STILL',bodyLabel:'WOOD',peakBodyLabel:'WIRE',scale:['SAME','LINE','OTHER','SOUND','...']}},
  return:{counter:'00:00',counterLabel:'BRING IT BACK',minuteUnit:'A',secondUnit:'LITTLE',locationLabel:'TO THE MARIMBA',
    locationTicks:['A','LIT','TLE','ROO','M','A','LIT','TLE','ROO','M','...','...','...'],locationStart:'HERE',locationEnd:'HERE',note:'There is room.',
    output:{label:'HERE',rmsLabel:'A',rmsValue:'00',unit:' ',peakLabel:'MORE',peakValue:'00',clip:' ',bodyLabel:'LITTLE',peakBodyLabel:'ROOM',scale:['A','LITTLE','ROOM','...','...']}},
};
function couperinStory(presentation,{musicTime=0}={}){
  const p=Number(presentation?.progress)||0,stage=Number(presentation?.stage)||0;
  if(stage<1||stage>=7||presentation?.suppressPeripheral||presentation?.empty)return null;
  const phase=stage>=6?'return':p<.25?'touch':p<.33?'borrow':p<.43?'attention':p<.55?'recording':'revoicing',row=copy(couperinRows[phase]),
    voiceBanks=stage<=2?[{x:0,y:16,w:666,h:164},{x:0,y:211,w:666,h:28}]
      :stage<5?[{x:0,y:16,w:666,h:19},{x:0,y:130,w:666,h:21},{x:0,y:153,w:666,h:27},{x:0,y:211,w:666,h:28}]
        :[{x:320,y:16,w:346,h:19}];
  return{...row,phase,known:{sarah:false,lyle:false},sourceLabel:row.counterLabel,
    choiceHeading:'YOU / REPLY ▐',musicTime:Number.isFinite(musicTime)?musicTime:0,voiceBanks,presentationOnly:true,normalTicks};
}
export function sourceRestInstrumentStory(presentation,{conversationView=null,sarahNamed=false,musicTime=0,phase:sourcePhase='wrong-return'}={}){
  if(sourcePhase==='catch')return couperinStory(presentation,{musicTime});
  const p=Number(presentation?.progress)||0,stage=Number(presentation?.stage)||0;
  if(stage<1||stage>=6||presentation?.suppressPeripheral)return null;
  const node=String(conversationView?.nodeId||''),visible=String(conversationView?.line?.text||'').slice(0,Math.max(0,Number(conversationView?.typed)||0)),
    heard=[visible,...(conversationView?.history||[]).map(line=>String(line.text||''))].join(' '),
    known={sarah:!!sarahNamed,lyle:/\bLyle\b/i.test(heard)},
    phase=p<.25?'misread':p<.33?'craft':p<.43?'voice':p<.61?'memory':p<.66?'insist':'growlix',row=copy(rows[phase]);
  if(phase==='craft'&&/^organ/.test(node))row.locationLabel='ANY INSTRUMENT / THE SAME HAND';
  if(phase==='memory'){
    if(known.sarah)row.output.label='SARAH';
    if(known.lyle)row.output.peakLabel='LYLE';
    if(known.sarah||known.lyle)row.locationLabel=`${known.sarah?'SARAH':'HER'} / ${known.lyle?'LYLE':'HIM'}`;
    if(/^(distance|teachers|strangers)/.test(node))row.counterLabel='PRACTICE / RECITAL';
  }
  // Readable annotation banks survive amongst failed electrodes. Earlier
  // wrong readings are clear first; later only one pleading lane survives.
  const voiceBanks=stage<=2?[{x:0,y:16,w:666,h:164},{x:0,y:211,w:666,h:28}]
    :stage<5?[{x:0,y:16,w:666,h:19},{x:0,y:130,w:666,h:21},{x:0,y:153,w:666,h:27},{x:0,y:211,w:666,h:28}]
      :[{x:320,y:16,w:346,h:19}];
  const headings={misread:'BEFORE',craft:'TRY',voice:'HEAR',memory:'FIRST',insist:'ONE MORE',growlix:'@#%!'};
  return{...row,phase,known,sourceLabel:phase==='memory'?row.locationLabel:row.counterLabel,
    choiceHeading:`${headings[phase]} / REPLY ▐`,musicTime:Number.isFinite(musicTime)?musicTime:0,voiceBanks,presentationOnly:true,normalTicks};
}
