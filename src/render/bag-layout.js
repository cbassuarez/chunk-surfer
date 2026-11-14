//
//  bag-layout.js
//  
//
//  Created by Sebastian Suarez-Solis on 7/12/26.
//

// Responsive field-case geometry. Pure cell-space math only.

import { BAG_TABS_HEIGHT } from './bag-tabs.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function bagPanelBounds({ cols, rows, sectionId = null }) {
  const maxW = Math.max(20, cols - 4);
  const maxH = Math.max(14, rows - (sectionId === 'kit' ? 1 : 3));
  const large = sectionId === 'map' || sectionId === 'journal' || sectionId === 'kit';
  const w = Math.min(large ? 128 : 100, maxW);
  const h = Math.min(large ? 46 : 38, maxH);

  return {
    x: Math.max(0, Math.floor((cols - w) / 2)),
    y: Math.max(1, Math.floor((rows - h) / 2)),
    w,
    h,
  };
}

// `guideRows` reserves a band above the rails for a guided-step callout. It is
// real geometry, not an overlay: a guided moment pushes the case's own content
// up rather than printing on top of it.
export function bagLayout({ body, forceMode = null, guideRows = 0, sectionId = null, compactSkills = false } = {}) {
  const b = body || { x: 0, y: 0, w: 60, h: 22 };
  const compact = forceMode === 'compact' || (forceMode !== 'wide' && (b.w < 68 || b.h < 20));

  const shortMap = sectionId === 'map' && b.h < 30;
  const shortJournal = sectionId === 'journal' && b.h < 16;
  const shortInventory = sectionId === 'kit' && b.h < 26;
  const tabs = { x: b.x, y: b.y, w: b.w, h: compactSkills ? 0 : shortMap || shortInventory ? 2 : shortJournal ? 1.7 : sectionId==='map'?3.6:BAG_TABS_HEIGHT, compact:compactSkills||shortMap||shortJournal||shortInventory };
  const actionRail = { x: b.x, y: b.y + b.h - 1, w: b.w, h: 1 };
  const guideH = Math.max(0, Math.min(Math.floor(b.h / 3), Math.floor(guideRows), Math.floor(b.h - tabs.h - 6)));
  const guide = guideH ? { x: b.x, y: actionRail.y - 1 - guideH, w: b.w, h: guideH } : null;
  const taskRail = { x: b.x, y: actionRail.y - 1 - guideH - (guideH ? 1 : 0), w: b.w, h: 1 };
  const contentY = tabs.y + tabs.h + (shortMap || compactSkills ? .25 : .7);
  const contentH = Math.max(0, taskRail.y - contentY - .7);

  if (compact) {
    // On a shallow display the detail and list share what remains. Fixed
    // minimum heights used to push the list through the guide/action rails.
    const gap = Math.min(1, contentH * .08);
    const detailH = Math.min(clamp(Math.floor(b.h * 0.34), 5, 8), Math.max(0, (contentH - gap) * .58));
    const listY = contentY + detailH + gap;

    return {
      mode: 'compact',
      body: b,
      tabs,
      detail: { x: b.x, y: contentY, w: b.w, h: detailH },
      list: { x: b.x, y: listY, w: b.w, h: Math.max(0, contentY + contentH - listY) },
      dividerX: null,
      guide,
      taskRail,
      actionRail,
    };
  }

  const listW = clamp(Math.floor(b.w * 0.40), 27, 38);
  const dividerX = b.x + listW + 1;

  return {
    mode: 'wide',
    body: b,
    tabs,
    list: { x: b.x, y: contentY, w: listW, h: contentH },
    dividerX,
    detail: {
      x: dividerX + 2,
      y: contentY,
      w: Math.max(20, b.x + b.w - dividerX - 2),
      h: contentH,
    },
    guide,
    taskRail,
    actionRail,
  };
}

// One spatial contract for the inventory's drawing, hit regions and navigation.
// The recorder's fitted components stay in the backpack; the four reachable
// positions are physical gear slots, never an implication of body armour.
export function bagInventorySpatialLayout(region = {x:0,y:0,w:100,h:20}) {
  const r={...region,w:Math.max(1,region.w||1),h:Math.max(1,region.h||1)},gap=r.w>=80?1.5:1;
  const shallow=r.h<13,equipmentColumns=shallow?2:1,equipmentRows=4/equipmentColumns;
  const equippedW=shallow?clamp(r.w*.24,18,23):clamp(r.w*.155,10,18),embodimentW=clamp(r.w*(shallow?.25:.29),16,35);
  const equipment={x:r.x,y:r.y,w:equippedW,h:r.h};
  const embodiment={x:r.x+equippedW+gap,y:r.y,w:embodimentW,h:r.h};
  const rightX=embodiment.x+embodiment.w+gap,rightW=Math.max(1,r.x+r.w-rightX);
  const splitGap=.65;
  let detailH=Math.min(r.h-3.5,Math.max(4.3,r.h*.43));
  if(r.h>=15.4)detailH=Math.min(detailH,r.h-8.4-splitGap);
  detailH=Math.max(1,detailH);
  const detail={x:rightX,y:r.y,w:rightW,h:detailH};
  const grid={x:rightX,y:r.y+detailH+splitGap,w:rightW,h:Math.max(0,r.h-detailH-splitGap)};
  const head=Math.min(1.5,r.h*.1),slotGap=.3,slotH=Math.max(.4,(r.h-head-slotGap*(equipmentRows-1))/equipmentRows),slotW=(equipment.w-slotGap*(equipmentColumns-1))/equipmentColumns;
  const slots=Array.from({length:4},(_,index)=>({index,x:equipment.x+(index%equipmentColumns)*(slotW+slotGap),y:equipment.y+head+Math.floor(index/equipmentColumns)*(slotH+slotGap),w:slotW,h:slotH}));
  const lower={x:embodiment.x+1,y:embodiment.y+embodiment.h-1.4,w:Math.max(1,embodiment.w-2),h:1.15};
  const preview={x:embodiment.x+.6,y:embodiment.y+2,w:Math.max(1,embodiment.w-1.2),h:Math.max(.5,embodiment.h-4.2)};
  return {region:r,equipment,equipmentColumns,equipmentRows,ready:equipment,embodiment,preview,lower,slots,detail,grid,list:grid};
}

export function bagInventoryGridLayout(rect, count = 0, selectedIndex = 0, scrollOffset = 0) {
  const columns=clamp(Math.floor((rect.w+.6)/10.6),2,6),gap=.6,headerH=rect.h>=2.6?1.25:0,footerH=Math.min(.8,Math.max(0,rect.h));
  const cellH=rect.h>=11.3?3.6:rect.h>=8.1?3.2:2.8,verticalGap=.3;
  const rows=rect.h>=2.6?Math.max(1,Math.floor((Math.max(0,rect.h-headerH-footerH)+verticalGap)/(cellH+verticalGap))):0;
  const capacity=columns*rows,total=Math.max(0,Math.floor(count)),selected=clamp(Math.floor(selectedIndex)||0,0,Math.max(0,total-1));
  const totalRows=Math.ceil(total/columns),maxRow=Math.max(0,totalRows-rows);
  let row=clamp(Math.floor((Number(scrollOffset)||0)/columns),0,maxRow),selectedRow=Math.floor(selected/columns);
  if(selectedRow<row)row=selectedRow;
  if(rows&&selectedRow>=row+rows)row=selectedRow-rows+1;
  const offset=clamp(row,0,maxRow)*columns,cellW=Math.max(.5,(rect.w-gap*(columns-1))/columns);
  const availableH=Math.max(.5,rect.h-headerH-footerH),drawH=Math.min(cellH,Math.max(.5,(availableH-verticalGap*(rows-1))/rows));
  const cells=Array.from({length:capacity},(_,at)=>({index:offset+at,column:at%columns,row:Math.floor(at/columns),
    x:rect.x+(at%columns)*(cellW+gap),y:rect.y+headerH+Math.floor(at/columns)*(drawH+verticalGap),w:cellW,h:drawH}));
  return {columns,rows,capacity,offset,totalRows,firstRow:row,headerH,footerH,cellW,cellH:drawH,cells,
    previous:{x:rect.x,y:rect.y+rect.h-footerH,w:Math.min(9,rect.w/2),h:footerH},
    next:{x:rect.x+Math.max(0,rect.w-9),y:rect.y+rect.h-footerH,w:Math.min(9,rect.w/2),h:footerH}};
}

export function bagInventoryMoveIndex(index, count, columns, dx = 0, dy = 0) {
  const total=Math.max(0,Math.floor(count)),cols=Math.max(1,Math.floor(columns));
  if(!total)return -1;
  const at=clamp(Math.floor(index)||0,0,total-1),row=Math.floor(at/cols),column=at%cols;
  if(dy)return clamp(at+Math.sign(dy)*cols*Math.max(1,Math.floor(Math.abs(dy))),0,total-1);
  const nextColumn=clamp(column+Math.sign(dx),0,cols-1);
  return Math.min(total-1,row*cols+nextColumn);
}

export function bagInventoryStackLayout(rect,stack){
  if(!stack||stack.memberCount<2)return null;
  const x=rect.x+1,y=rect.y+2.25,w=Math.max(1,rect.w-2),buttonW=Math.min(5,w*.18);
  return {x,y,w,h:.9,previous:{x,y,w:buttonW,h:.9},next:{x:x+w-buttonW,y,w:buttonW,h:.9},
    label:{x:x+buttonW+.2,y,w:Math.max(1,w-buttonW*2-.4),h:.9}};
}
