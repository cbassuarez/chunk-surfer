// Fitted only to Ellery's public/staff boundary. Source's copied furniture and
// the ordinary shared desk remain unchanged.
const freeze=o=>{Object.values(o).forEach(v=>v&&typeof v==='object'&&freeze(v));return Object.freeze(o);};
export const BOX_OFFICE_HATCH=freeze({
  id:'box-office',pack:'/assets/box-office.glb',mesh:'box_office_clerking_hatch',
  anchor:{x:91.5,y:0,z:10},yaw:Math.PI/2,
  aperture:{x0:91,x1:92,z0:8.5,z1:11.5,sill:.86,head:2.45},
  publicLedge:{height:.86,x0:90.60,x1:91.08,z0:8.47,z1:11.53},
  officeShelf:{height:.76,x0:91.96,x1:92.33,z0:8.57,z1:11.43},
  // A fixed glazed/grilled view, never a second entrance or a way to use keys.
  bodyPassage:false,publicTarget:{x:90.5,y:10,height:1.25},
});
export const BOX_OFFICE_DESK=freeze({mesh:'box_office_clerks_desk',anchor:{x:93.5,y:0,z:9},
  width:1.12,depth:.58,worktop:.76,underside:.715,
  kneeWell:{x0:-.43,x1:.20,z0:-.18,z1:.29,y0:.04,y1:.67},
});
export const BOX_OFFICE_MESHES=freeze({
  box_office_clerking_hatch:{w:3.12,d:1.48,h:2.52,blocks:false},
  box_office_clerks_desk:{w:1.12,d:.58,h:.76,blocks:true},
  box_office_returns_tray:{w:.25,d:.21,h:.052,blocks:false},
});
export const BOX_OFFICE_SURFACES=freeze({box_office_clerking_hatch:.86,box_office_clerks_desk:.76,box_office_returns_tray:.012});
// Exact compiled bounds also live in the pack receipt; these contact bounds
// are deliberately independent of the much larger shared conservatory pack.
export const BOX_OFFICE_BOUNDS=freeze({
  box_office_clerking_hatch:{min:[-1.56,.5547311447208798,-.84],max:[1.56,2.52,.90]},
  box_office_clerks_desk:{min:[-.56,.02,-.29],max:[.56,.76,.309]},
  box_office_returns_tray:{min:[-.125,0,-.105],max:[.125,.052,.105]},
});
