// Minimal Standard MIDI File reader (format 0/1): notes with absolute ticks,
// tempos and time signatures. Used for the music-box arrangement.
// Minimal SMF reader: note on/off with absolute ticks, tempo, time signature.
import fs from 'node:fs';
export function readMidi(path){
  const b=fs.readFileSync(path);let p=0;const u32=()=>{const v=b.readUInt32BE(p);p+=4;return v;},u16=()=>{const v=b.readUInt16BE(p);p+=2;return v;};
  const vlq=()=>{let v=0,c;do{c=b[p++];v=(v<<7)|(c&127);}while(c&128);return v;};
  if(b.toString('ascii',0,4)!=='MThd')throw Error('not midi');p=8;const format=u16(),ntrks=u16(),division=u16();p=8+6;
  const notes=[],tempos=[],sigs=[];
  for(let t=0;t<ntrks;t++){while(b.toString('ascii',p,p+4)!=='MTrk')p++;p+=4;const len=u32(),end=p+len;let tick=0,status=0;const open=new Map();
    while(p<end){tick+=vlq();let s=b[p];if(s&128){status=s;p++;}else s=status;const type=status>>4;
      if(status===0xff){const mt=b[p++],l=vlq();const data=b.subarray(p,p+l);p+=l;if(mt===0x51)tempos.push({tick,us:(data[0]<<16)|(data[1]<<8)|data[2]});if(mt===0x58)sigs.push({tick,num:data[0],den:2**data[1]});continue;}
      if(status===0xf0||status===0xf7){const l=vlq();p+=l;continue;}
      const d1=b[p++],d2=(type===0xc||type===0xd)?0:b[p++];
      if(type===0x9&&d2>0){open.set(d1+':'+(status&15),{tick,pitch:d1,vel:d2,track:t});}
      else if(type===0x8||(type===0x9&&d2===0)){const k=d1+':'+(status&15),o=open.get(k);if(o){notes.push({...o,dur:tick-o.tick});open.delete(k);}}
    }p=end;}
  notes.sort((a,b)=>a.tick-b.tick||b.pitch-a.pitch);return{format,division,notes,tempos,sigs};
}
