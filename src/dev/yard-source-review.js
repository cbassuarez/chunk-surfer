import {createWorldIntegrationReview} from './world-integration-review.js';

// Reuse the existing zero-audio capture and provenance path. Only this DEV
// review's explicit placement menu changes; ordinary play imports neither UI.
export function installYardSourceReview(api,{stages=[]}={}){
  const tools=createWorldIntegrationReview(api),panel=tools.panel;
  panel.querySelector('strong').textContent='DEV · yard / Source · silent';
  const select=panel.querySelector('select');select.replaceChildren();
  for(const [id,label]of stages){const option=document.createElement('option');option.value=id;option.textContent=label;select.append(option);}
  const resume=document.createElement('button');resume.textContent='Resume encounter';resume.type='button';
  resume.onclick=()=>{api.resume?.();document.getElementById('map')?.focus();};panel.append(resume);
  const face=document.createElement('button');face.textContent='Face Hush';face.type='button';face.onclick=()=>{api.faceHush?.();document.getElementById('map')?.focus();};panel.append(face);
  const route=document.createElement('button');route.textContent='Face corridor';route.type='button';route.onclick=()=>{api.faceRoute?.();document.getElementById('map')?.focus();};panel.append(route);
  const hold=document.createElement('button');hold.textContent='Hold encounter';hold.type='button';hold.onclick=()=>api.pause?.(true);panel.append(hold);
  panel.setAttribute('aria-label','Local yard and Source review');
  return tools;
}
