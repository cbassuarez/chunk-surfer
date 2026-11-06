// THE CASCADE, IN HIS OWN WORDS. docs/plans/last-minutes.md, section 1a.
//
// The same ordinary things, and more and more riding on them. He goes from noticing to
// knowing, because self-criticism fails before anything he could notice. Rule 1 applies
// to every line here: none of them may say what the thing is, and none may say what it
// isn't. "That's dust" is him, and he is unreliable. Each line plays once a run.
//
// `from` is lastMinutesFrame().meaning. Rungs can't be skipped into: only the highest
// one reached so far plays, so someone who never looks up simply misses the moon.

export const MEANING_SIGNS=Object.freeze({
  moon:Object.freeze([
    {from:.06,text:'Good moon.'},
    {from:.3,text:'That moon\'s got bigger.'},
    {from:.52,text:'It\'s gone red. That\'s dust. That\'s just what dust does.'},
    {from:.72,text:'It hasn\'t moved all night.'},
    {from:.9,text:'It knows I\'m out here.'},
  ]),
  bag:Object.freeze([
    {from:0,text:'Carrier bag.'},
    {from:.28,text:'Same bag.'},
    {from:.46,text:'It stops when I stop.'},
    {from:.64,text:'There\'s no wind in here.'},
    {from:.82,text:'I know who that is.'},
  ]),
});
export function meaningRung(rows,meaning){
  let found=null;
  for(let k=0;k<rows.length;k++)if(meaning>=rows[k].from)found=k;
  return found;
}

// The everyday things he looks at, by what they're made of, with what they turn into.
// Matched only by prop id, so a line can't land on the wrong thing. Added after the
// prop's own text. `meaning` thresholds as above.
const line=(from,text)=>Object.freeze({from,text});
const FAMILIES=Object.freeze({
  lamp:Object.freeze([line(.42,'It\'s only a lamp. It\'s been on all night, for nobody.'),line(.7,'Somebody left that on for me.')]),
  drain:Object.freeze([line(.42,'You can hear it going down a long way.'),line(.7,'All the water in the building is going to the same place.')]),
  chair:Object.freeze([line(.42,'Kept for someone.'),line(.7,'They\'ll want that back. They said they\'d wait.')]),
  coat:Object.freeze([line(.42,'Somebody meant to come back for this.'),line(.7,'It\'s still got the shape of them in it.')]),
  clock:Object.freeze([line(.42,'That can\'t be right.'),line(.7,'It isn\'t telling the time. It\'s telling me.')]),
  window:Object.freeze([line(.42,'You can\'t see out. Only the room, and me in it.'),line(.7,'There\'s more light behind it than there should be.')]),
  stairs:Object.freeze([line(.42,'People have gone up these for a hundred years.'),line(.7,'Only ever one way, in the end.')]),
  pipe:Object.freeze([line(.42,'There\'s water in there. It\'s all right. It knows where it\'s going.'),line(.7,'Listen to it. It\'s nearly words.')]),
  paper:Object.freeze([line(.42,'Somebody took trouble over this.'),line(.7,'It\'s addressed to me. It always was.')]),
  instrument:Object.freeze([line(.42,'It wouldn\'t take much.'),line(.7,'It\'s still holding the last note. You only have to know how to ask.')]),
});
// Prop id prefix to family. The first match wins.
const FAMILY_BY_PROP=Object.freeze([
  [/lamp|light|lantern|sconce/,'lamp'],[/drain|sluice|gully|plughole/,'drain'],[/chair|seat|stool|bench/,'chair'],
  [/coat|jacket|hanger|uniform|robe/,'coat'],[/clock|timetable/,'clock'],[/window|glaz/,'window'],[/stair|ladder/,'stairs'],
  [/pipe|valve|radiator|header|boiler/,'pipe'],[/notice|poster|memo|letter|sheet|score|page/,'paper'],[/marimba|piano|harp|metronome|organ|violin|cello/,'instrument'],
]);
export function meaningFamilyFor(propId=''){
  const id=String(propId).toLowerCase();
  for(const[match,family]of FAMILY_BY_PROP)if(match.test(id))return family;
  return null;
}
// The line owed for this prop now, or null. `seen` is whatever the caller has said
// already: a family says each of its lines once in a run.
export function meaningLineFor(propId,meaning,seen=()=>false){
  const family=meaningFamilyFor(propId);if(!family)return null;
  const rows=FAMILIES[family];
  for(let k=rows.length-1;k>=0;k--){
    if(meaning<rows[k].from)continue;
    const key=`meaning.${family}.${k}`;
    if(seen(key))continue;
    return{key,text:rows[k].text};
  }
  return null;
}
