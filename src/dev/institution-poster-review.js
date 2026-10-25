// Explicit development fixture controls. Captures this game's production
// raster only; no screen, microphone, other application or HTML UI capture.
import {INSTITUTION_POSTER_CAPTURE_POINTS} from '../data/institution-poster-sites.js';

export function installInstitutionPosterReview({stage,getState}={}){
  document.getElementById('institution-poster-review-tools')?.remove();
  const panel=document.createElement('aside');panel.id='institution-poster-review-tools';
  panel.style.cssText='position:fixed;right:8px;top:8px;z-index:100000;background:#111e;color:#eee;padding:7px;font:12px monospace;border:1px solid #888;max-width:250px';
  const heading=document.createElement('div');heading.textContent='Institution poster review';
  const status=document.createElement('div');status.style.cssText='white-space:pre-wrap;margin-top:6px;max-width:240px';
  let latestSiteId=null,busy=false,disposed=false;
  panel.append(heading);
  const paint=message=>{if(!disposed)status.textContent=message;};
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const make=(label,action)=>{
    const button=document.createElement('button');button.textContent=label;
    button.style.cssText='padding:6px;margin:2px';
    button.onclick=async event=>{
      event.preventDefault();event.stopPropagation();if(busy||disposed)return;
      busy=true;
      try{await action();}catch(error){paint(String(error?.message||error));}
      finally{busy=false;document.getElementById('map')?.focus();}
    };
    panel.append(button);return button;
  };
  const labels={
    'hall-season':'Hall: season programme','hall-winter':'Hall: winter programme',
    'foh-last-night':'Box office: last night','outside-winter-case':'Outside: winter case',
    'foyer-visiting':'Foyer: visiting ensemble','atrium-student-notice':'Atrium: student notice',
    'practice-chamber':'Practice: chamber concert','chapel-recital':'Chapel: recital',
    'lyric-afterwards':'Lyric: promotion',
    'b3-loudspeaker-case':'Recording: loudspeaker orchestra','b3-tape-music':'Recording: tape music',
    'b3-live-electronics':'Recording: live electronics','academic-composers':'Academic: new works',
    'foyer-graphic-score':'Foyer: graphic-score workshop','hall-prepared-piano-case':'Hall: prepared piano',
  };
  for(const point of INSTITUTION_POSTER_CAPTURE_POINTS)make(labels[point.id]||point.id,async()=>{
    if(typeof stage!=='function')throw Error('The review staging callback is unavailable.');
    latestSiteId=null;paint(`Staging ${point.id}…`);await stage(point.id);
    await nextFrame();await nextFrame();latestSiteId=point.id;
    paint(`Staged ${point.id}.\nDevelopment camera fixture; inspect the production view before saving.`);
  });
  async function save(name,body,type){
    const response=await fetch('/__institution-poster-review/'+name,{method:'POST',headers:{'Content-Type':type},body});
    if(!response.ok)throw Error(`Review save failed: ${response.status}`);
    return response.json();
  }
  make('Save frame + state',async()=>{
    if(!latestSiteId)throw Error('Stage a poster view first.');
    const canvas=document.querySelector('canvas.r3d');
    if(!canvas?.width||!canvas?.height)throw Error('The production canvas is unavailable.');
    await nextFrame();
    const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;
    const context=copy.getContext('2d');if(!context)throw Error('The review copy canvas is unavailable.');
    context.drawImage(canvas,0,0);
    const blob=await new Promise(resolve=>copy.toBlob(resolve,'image/png'));
    if(!blob)throw Error('The production frame could not be encoded.');
    const id=`poster-${latestSiteId}-${Date.now()}`;
    const snapshot={siteId:latestSiteId,capturedAt:new Date().toISOString(),
      source:'Production canvas.r3d at its actual backing resolution, including final game rendering; HTML review controls excluded.',
      width:copy.width,height:copy.height,
      qualification:'Developer camera fixture; this is rendered evidence, not an unfamiliar-player discovery trial.',
      fixture:INSTITUTION_POSTER_CAPTURE_POINTS.find(point=>point.id===latestSiteId),
      state:await getState?.()};
    await save(id+'.png',blob,'image/png');
    await save(id+'.json',JSON.stringify(snapshot,null,2),'application/json');
    paint(`Saved ${id}.png\nand matching state.`);
  });
  panel.append(status);document.body.append(panel);
  paint('Development review only. Stage one of the real programme poster sites.');
  function dispose(){disposed=true;panel.remove();removeEventListener('pagehide',dispose);}
  addEventListener('pagehide',dispose,{once:true});return dispose;
}
