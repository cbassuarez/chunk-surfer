import * as scenes from './scenes.js';
import {createItemInspection} from './item-inspection.js';
import {drawItemInspectionView} from '../render/item-inspection-view.js';
import {uiSize,uiScrim} from '../render/ui.js';
import {drawMachinePanel} from '../render/presentation.js';

export function makeItemInspectionScene(entry){
 const inspection=createItemInspection(entry);let layout=null;
 const back=()=>scenes.remove(scene);
 const scene={id:'item-inspection',blocksInput:true,blocksWorld:true,freezesBelow:true,allowsLook:false,handlesEscape:true,
  key(e){if(inspection?.key(e))return true;
   if(['Escape','Enter','b','B'].includes(e.key)||['back','confirm','bag'].includes(e.controllerAction))back();return true;},
  pointer(e){if(inspection?.pointer(e))return true;
   if(e.type==='pointerdown'&&(e.originalEvent?.button??e.button??0)===0&&layout){
    const inside=r=>e.cellX>=r.x&&e.cellX<=r.x+r.w&&e.cellY>=r.y&&e.cellY<=r.y+r.h;
    if(inside(layout.back))back();else if(inside(layout.reset))inspection?.reset();
   }return true;},
  view:()=>({inspection:inspection?.view(),layout}),
  exit(){inspection?.dispose();},
  render(){const {cols,rows}=uiSize();const rect={x:3,y:3,w:cols-6,h:rows-6};
   uiScrim(.86);const body=drawMachinePanel(rect.x,rect.y,rect.w,rect.h,{label:'INSPECT',source:'FIELD CASE',meter:false});
   layout=drawItemInspectionView({entry,inspection,rect:body,active:scenes.top()===scene});},
 };
 return scene;
}
