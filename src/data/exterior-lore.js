// People who still use the streets around Ellery. These are optional, ordinary
// conversations: the city knows the institution by inconvenience, memory, and
// the noises which cross its walls, not by the player's plot.

const freezeLines=(lines)=>Object.freeze(lines.map((line)=>Object.freeze(line)));

export const EXTERIOR_LORE=Object.freeze({
  'yard-bus-waiter':Object.freeze({
    first:freezeLines([
      {who:'woman at the shelter',text:'If you are waiting for the 48, do not. They took this stop off the board when the demolition fence went up.'},
      {who:'you',text:'I am working in Ellery.'},
      {who:'woman at the shelter',text:'Tonight? Then mind the old baths side. My daughter learned to swim in there. They drained it before they told the public it was closing.'},
    ]),
    again:freezeLines([{who:'woman at the shelter',text:'Last bus that acknowledged this stop was three weeks ago. The timetable still lights up every night.'}]),
  }),
  'district-mews-neighbor':Object.freeze({
    first:freezeLines([
      {who:'man under the awning',text:'The music school came second. Those rooms at the back were stables, then laundry, then rehearsal rooms nobody could heat.'},
      {who:'you',text:'You knew the place?'},
      {who:'man under the awning',text:'Knew the walls. Every Thursday the tower bells shook dust out of my gutter. They stopped calling it practice before they stopped doing it.'},
    ]),
    again:freezeLines([{who:'man under the awning',text:'Listen past the traffic. The tower always carried farther in wet weather.'}]),
  }),
  'district-pub-driver':Object.freeze({
    first:freezeLines([
      {who:'driver by the pub yard',text:'You with the white van? The other contractor came Tuesday, photographed the gate, and left the padlock exactly as he found it.'},
      {who:'you',text:'What other contractor?'},
      {who:'driver by the pub yard',text:'Different name on the jacket. Same Ellery paperwork. He asked which part was the conservatoire and I told him all of it, eventually.'},
    ]),
    again:freezeLines([{who:'driver by the pub yard',text:'He did not unload anything. That is the part I remember.'}]),
  }),
});

export function exteriorLoreLines(id,{revisited=false}={}){
  const entry=EXTERIOR_LORE[String(id||'')];
  return entry?[...(revisited?entry.again:entry.first)]:null;
}
