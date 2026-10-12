import { CHURCH_BELFRY } from '../data/st-brendans.js';

// Safe apparatus in the three service bays uses the duel's actual command
// vocabulary. Practice costs no composure, battery or part of the commitment.
const lesson = (value) => Object.freeze({...value,...CHURCH_BELFRY.serviceBays.find((bay)=>bay.id===value.id).center});
export const CATHEDRAL_LESSONS = Object.freeze([
  lesson({id:'clapper',label:'THE RESTING CLAPPER',mesh:'tower_clapper_08',
    tell:'The clapper draws back and returns short of a chalk line. When it comes at you, adding another sound only feeds the blow.',
    prompt:'CLAPPER / OVERLOAD',correct:'HOLD',choices:['HOLD','MONITOR','EXPOSE'],
    answer:'HOLD. Let the blow pass without giving it a return. In the crossing, the same OVERLOAD tell calls for SELF / HOLD.'}),
  lesson({id:'wheel',label:'THE WHEEL RETURN',mesh:'tower_wheel_03',
    tell:'An old monitor lead crosses the turning wheel. A clear note comes back before anything strikes.',
    prompt:'CLEAR NOTE / BROADCAST',correct:'MONITOR',choices:['MONITOR','EXPOSE','HOLD'],
    answer:'RECORDER / MONITOR catches a BROADCAST and keeps a take. PLAYBACK sends that take back. When output starts feeding itself, RIG / INVERT breaks the LOOP; the basic recorder can also MONITOR that loop and keep its return.'}),
  lesson({id:'louvre',label:'THE LOUVRE SHADOW',mesh:'tower_louvres',
    tell:'The strike disappears behind a louvre. The dark gap tells you where to look before it tells you when to move.',
    prompt:'HIDDEN STRIKE / CONCEAL',correct:'EXPOSE',choices:['EXPOSE','MONITOR','HOLD'],
    answer:'TORCH / EXPOSE reveals CONCEAL before it lands. The same four tells return downstairs: BROADCAST, OVERLOAD, CONCEAL, LOOP. You have already met their machinery.'}),
]);

export function cathedralLessonAt(here, radius=1.2){
  return here?.level==='belfry'?CATHEDRAL_LESSONS.find((lesson)=>Math.hypot(here.x-lesson.x,here.y-lesson.y)<=radius)||null:null;
}

export function cathedralLessonTree(lesson){
  return {
    start:{speaker:lesson.label,lines:[{who:'direction',text:lesson.tell}],goto:'choose'},
    choose:{speaker:lesson.prompt,lines:[{who:'you',text:'Try it here. No weight on the line.'}],
      choices:[...lesson.choices.map((action)=>({text:action,goto:action===lesson.correct?'learned':'again',
        cathedralLesson:lesson.id,correct:action===lesson.correct})),{text:'LEAVE IT',goto:'leave'}]},
    learned:{lines:[{who:'direction',text:lesson.answer}]},
    again:{lines:[{who:'direction',text:'The apparatus stays still. Nothing spent. Read what it is doing and try another response.'}],goto:'choose'},
    leave:{lines:[]},
  };
}
