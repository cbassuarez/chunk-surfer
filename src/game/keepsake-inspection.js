// Handling reveals the object the player actually owns. These descriptive
// actions do not alter quest checks, play a synthetic take, or grant a move.
import {parseRecordingCassetteId} from './carry-items.js';

const direction=text=>({who:'direction',text});
const thought=text=>({who:'you',text});
const facet=(id,label,lines,yaw=0,pitch=0)=>({id,label,lines,view:{yaw,pitch},enabled:true});
const room=value=>String(value||'unnamed room').replace(/[_-]/g,' ');

export function keepsakeInspectionActions(id,item={}){
  if(id==='ren-home-cassette')return [
    facet('label','Read HOME',[
      direction('HOME is written on the spine of the cracked clear case. The name of a place, with no address.'),
      thought('Ren asked for this. That does not tell me whether giving it back will help.'),
    ]),
    facet('warning','Unfold the warning',[
      direction('YOU ASKED US TO KEEP THIS FROM YOU. The note was folded around the case, not hidden from its recipient.'),
      thought('The refusal came from Ren. I signed to take it out anyway. I should hear their answer before I decide what that means.'),
    ],Math.PI,.10),
    facet('custody','Check the release',[
      direction('Released under a signed warning, for hand delivery. Keeping it in the case does not complete that promise.'),
      thought('I can open the cassette to hear it. Listening and returning it are separate choices.'),
    ],-.45,-.12),
  ];
  if(id==='marble-eyes')return [
    facet('front','Examine the irises',[
      direction('Two separate marble eyes. A pale diagonal vein crosses one iris; a chip sits above it. The other eye is nicked low on the opposite edge.'),
      thought('A pair, but not interchangeable. The blind bust is where I can test the fit.'),
    ]),
    facet('breaks','Turn to the breaks',[
      direction('Cold mineral backs, broken away from the portrait. Water remains in the uneven edges; these are pieces of a face, not polished marbles.'),
      thought('Holding them will not tell me whose face they belong to. Putting them against the stone might.'),
    ],Math.PI,.15),
  ];
  const n=parseRecordingCassetteId(id);
  if(n==null)return [];
  const content=item.content||null,history=Array.isArray(item.history)?item.history:[];
  const label=!content?'Blank. No room has been written against this number.'
    :content.kind==='tutorial'?'LVL. The level check occupies this cassette; the first room take can go over it.'
    :`${room(content.roomId)}. ${String(content.outcome||'recorded').toUpperCase()}. This is the ledger entry for the recording currently on this physical cassette.`;
  return [
    facet('label','Read the label',[
      direction(`Cassette ${n}. ${label}`),
      ...(item.missing?[thought('The number is still on the sheet. The cassette is missing; I cannot handle it until I recover it.')]:[]),
    ]),
    facet('history','Read the recording history',history.length
      ?history.map(take=>direction(take.kind==='tutorial'?'Level check.':`${room(take.roomId)} — ${take.outcome||'recorded'}${take.over?' · recorded over an earlier entry':''}.`))
      :[direction('No earlier take is recorded against this number. Blank stock is useful because it lets another recording survive.')],Math.PI,.08),
    facet('stock','Check the stock',[
      direction(item.source==='b3-store'?'One of the two sealed blanks found in B3. Its number follows the issued stock.':'Issued recording stock. Its number stays the same when its contents change.'),
      thought('Putting a cassette within reach does not record over it. The recorder is still where I choose what to hear or replace.'),
    ],-.4,-.1),
  ];
}
