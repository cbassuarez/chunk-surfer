export const STORY_WAYFINDING_CAPTURE_PRESETS=Object.freeze([
  {id:'arrival-van',file:'story-01-arrival-van.png',at:[62,204.8],facing:1,state:'arrival-van',hintMode:'full'},
  {id:'arrival-bench',file:'story-02-arrival-bench.png',at:[55,205],facing:3,state:'arrival-bench',hintMode:'full'},
  {id:'arrival-lodge',file:'story-03-arrival-lodge.png',at:[77,212],facing:3,state:'arrival-lodge',hintMode:'full'},
  {id:'booth-window-conversation',file:'story-04-booth-window-conversation.png',at:[77,212],facing:3,state:'booth-conversation',hintMode:'full'},
  {id:'page-6',file:'story-05-page-6.png',at:[138,29],facing:0,state:'page-6',hintMode:'full'},
  {id:'rekey-ledger',file:'story-06-rekey-ledger.png',at:[92.25,13.8],facing:0,state:'rekey-ledger',hintMode:'full'},
  {id:'key-cabinet',file:'story-07-key-cabinet.png',at:[94.8,9.45],facing:1,state:'key-cabinet',hintMode:'full'},
  {id:'chapel-screen',file:'story-08-chapel-screen.png',at:[92.5,69],facing:0,state:'chapel-screen',hintMode:'full'},
  {id:'tenor-full',file:'story-09-tenor-full.png',state:'tenor',hintMode:'full'},
  {id:'tenor-reduced',file:'story-10-tenor-reduced.png',state:'tenor',hintMode:'reduced',stallMs:20_500},
  {id:'tenor-off',file:'story-11-tenor-off.png',state:'tenor',hintMode:'off'},
  {id:'tower-descent',file:'story-12-tower-descent.png',state:'tower-descent',hintMode:'full'},
  {id:'fifth-take',file:'story-13-fifth-take.png',at:[92.5,69],facing:0,state:'fifth-take',hintMode:'full'},
  {id:'ending-surfaced-exit',file:'story-14-ending-surfaced-exit.png',at:[83,7],facing:3,state:'ending-surfaced',hintMode:'full'},
  {id:'ending-chapel-commitment',file:'story-15-ending-chapel-commitment.png',at:[92.5,70],facing:0,state:'ending-stay',hintMode:'full'},
  {id:'ending-grey-door',file:'story-16-ending-grey-door.png',at:[56,8],facing:3,state:'ending-grey-door',hintMode:'full'},
  {id:'ending-rescue-exit',file:'story-17-ending-rescue-exit.png',at:[83,7],facing:3,state:'ending-rescue',hintMode:'full'},
]);

export function storyWayfindingCapturePreset(id){return STORY_WAYFINDING_CAPTURE_PRESETS.find((entry)=>entry.id===id)||null;}
