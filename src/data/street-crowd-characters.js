// Anatomical replacements for the two local witnesses and the eighteen
// background vigil occupants. IDs, colliders, routes and dialogue stay with
// their original authored props; this table owns only visible anatomy/dress.
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};

export const STREET_CROWD_CHARACTER_PACK='/assets/street-crowd-characters.glb';
export const STREET_CROWD_PROP_PACK='/assets/street-crowd-props.glb';
export const STREET_CROWD_GARMENTS=freeze({
  raincoat:{hem:.61,hemSpread:1.08,shoulder:.248,waist:.235,hip:.257,collar:'folded',closure:'buttons'},
  duffle:{hem:.73,hemSpread:1.10,shoulder:.265,waist:.253,hip:.275,collar:'hood',closure:'toggles'},
  anorak:{hem:.94,hemSpread:1.02,shoulder:.242,waist:.225,hip:.247,collar:'hood',closure:'zip'},
  'work-jacket':{hem:.94,hemSpread:1.00,shoulder:.274,waist:.247,hip:.260,collar:'folded',closure:'zip'},
  cardigan:{hem:.95,hemSpread:1.02,shoulder:.239,waist:.237,hip:.257,collar:'knit',closure:'buttons'},
});
const design=(id,legacyMesh,source,options)=>freeze({
  id,mesh:id.replaceAll('-','_'),legacyMesh,source,height:source==='male'?1.78:1.70,width:1,depth:1,
  face:source==='male'?'listener':'celeste',wardrobe:'raincoat',headwear:null,accessory:null,
  posture:'standing',stance:'rest',seed:0,lean:0,sideLean:0,headYaw:0,
  skin:[.55,.38,.27],hair:[.10,.075,.055],shirt:[.26,.27,.24],coat:[.09,.11,.12],trouser:[.06,.065,.06],scarf:[.24,.19,.12],
  ...options,
});
const crowd=(suffix,mesh,source,options)=>design('vigil-crowd-'+suffix,mesh,source,options);
const entries=[
  design('district-mews-neighbor','exterior_mews_neighbor','male',{height:1.77,width:.95,depth:1.02,face:'emile',wardrobe:'cardigan',headwear:'flat-cap',seed:.3,lean:.075,headYaw:-.12,stance:'folded',silhouette:'narrow older man in a flat cap, terracotta scarf and open cardigan',skin:[.61,.46,.34],hair:[.50,.48,.42],shirt:[.43,.38,.28],coat:[.18,.22,.17],trouser:[.09,.085,.07],scarf:[.35,.16,.10]}),
  design('district-pub-driver','exterior_pub_driver','male',{height:1.80,width:1.13,depth:1.05,face:'lucien',wardrobe:'work-jacket',headwear:'flat-cap',highVis:true,seed:1.1,lean:-.025,sideLean:-.025,stance:'belt',silhouette:'broad delivery worker in a short reflective work jacket, cap and heavy boots',skin:[.43,.28,.19],hair:[.07,.055,.04],shirt:[.23,.25,.22],coat:[.30,.22,.12],trouser:[.07,.09,.10]}),
  crowd('east-1','vigil_figure_placard_a','female',{height:1.66,width:1.11,depth:1.06,face:'odette',wardrobe:'duffle',headwear:'hood',accessory:'placard',seed:2.1,headYaw:-.08,silhouette:'short broad sign holder, square hood and wide duffle hem',skin:[.25,.12,.075],hair:[.045,.03,.025],coat:[.15,.17,.11],scarf:[.27,.16,.07]}),
  crowd('east-2','vigil_figure_umbrella_a','male',{height:1.78,width:.91,depth:.95,face:'noe',wardrobe:'raincoat',accessory:'umbrella',seed:2.8,lean:.055,headYaw:.11,silhouette:'tall narrow umbrella holder, long straight raincoat',skin:[.60,.44,.32],hair:[.10,.08,.06],coat:[.055,.075,.09]}),
  crowd('east-3','vigil_figure_pamphlets_a','female',{height:1.74,width:.95,depth:1.02,face:'agathe',wardrobe:'anorak',accessory:'pamphlets',seed:3.6,sideLean:.025,silhouette:'long limbed leafleter, cropped anorak and loose paper bag',skin:[.19,.085,.05],hair:[.025,.02,.018],coat:[.11,.16,.17],scarf:[.33,.23,.10]}),
  crowd('east-4','vigil_figure_seated_a','female',{height:1.65,width:1.12,depth:1.05,face:'celeste',wardrobe:'cardigan',headwear:'knit-cap',posture:'seated',seatY:.475,accessory:'blanket',seed:4.4,lean:.055,headYaw:-.15,silhouette:'small seated woman, rounded knit cap and blanket over knees',skin:[.67,.53,.42],hair:[.63,.61,.54],coat:[.19,.22,.25],scarf:[.31,.15,.10]}),
  crowd('west-1','vigil_figure_umbrella_b','female',{height:1.62,width:1.07,depth:1.08,face:'sabine',wardrobe:'anorak',headwear:'hood',accessory:'umbrella',seed:5.2,sideLean:-.04,headYaw:.19,silhouette:'compact umbrella holder in a gathered hooded jacket',skin:[.47,.32,.23],hair:[.18,.12,.075],coat:[.08,.11,.10],scarf:[.22,.21,.17]}),
  crowd('west-2','vigil_figure_flask_a','male',{height:1.69,width:1.13,depth:1.08,face:'emile',wardrobe:'cardigan',accessory:'flask',seed:6.0,lean:.025,silhouette:'short stocky older man, open knit layer and flask',skin:[.61,.45,.33],hair:[.57,.55,.47],coat:[.27,.12,.08],scarf:[.40,.29,.11]}),
  crowd('west-3','vigil_figure_seated_b','male',{height:1.73,width:.95,depth:1.02,face:'listener',wardrobe:'duffle',headwear:'hood',posture:'seated',seatY:.475,accessory:'blanket',seed:6.8,lean:.08,headYaw:.16,silhouette:'thin seated man folded into a high hood and long coat',skin:[.53,.37,.27],hair:[.40,.38,.33],coat:[.22,.22,.18],scarf:[.11,.17,.18]}),
  crowd('verge-1','vigil_figure_placard_b','male',{height:1.82,width:1.03,depth:.98,face:'lucien',wardrobe:'raincoat',accessory:'placard',seed:7.6,lean:-.025,headYaw:.12,silhouette:'tall upright sign holder, broad lapels and long hem',skin:[.52,.34,.23],hair:[.045,.033,.025],coat:[.28,.13,.085]}),
  crowd('verge-2','vigil_figure_umbrella_a','female',{height:1.71,width:.90,depth:.96,face:'odette',wardrobe:'raincoat',headwear:'knit-cap',accessory:'umbrella',seed:8.4,lean:.02,sideLean:.035,headYaw:-.14,silhouette:'slender umbrella holder, knit cap above narrow shoulders',skin:[.35,.20,.135],hair:[.10,.08,.055],coat:[.10,.12,.17],scarf:[.27,.24,.15]}),
  crowd('verge-3','vigil_figure_flask_b','female',{height:1.75,width:1.08,depth:1.06,face:'agathe',wardrobe:'duffle',accessory:'flask',seed:9.2,headYaw:.10,silhouette:'broad shouldered woman in a toggled coat, flask at chest',skin:[.62,.47,.35],hair:[.12,.075,.035],coat:[.12,.115,.075],scarf:[.34,.16,.10]}),
  crowd('verge-4','vigil_figure_pamphlets_b','male',{height:1.68,width:.91,depth:.96,face:'noe',wardrobe:'anorak',headwear:'hood',accessory:'pamphlets',seed:10.0,lean:.045,headYaw:-.18,silhouette:'slight hooded leafleter, short zipped jacket',skin:[.46,.28,.18],hair:[.07,.05,.035],coat:[.075,.10,.14]}),
  crowd('knot-1','vigil_figure_camera_a','male',{height:1.83,width:.93,depth:1,face:'listener',wardrobe:'work-jacket',accessory:'camera',seed:10.8,lean:.04,sideLean:-.025,headYaw:.07,silhouette:'tall camera operator, short field jacket and long legs',skin:[.58,.40,.28],hair:[.13,.09,.055],coat:[.16,.18,.17],trouser:[.08,.11,.13]}),
  crowd('knot-2','vigil_figure_umbrella_b','male',{height:1.69,width:1.14,depth:1.08,face:'emile',wardrobe:'duffle',headwear:'flat-cap',accessory:'umbrella',seed:11.6,lean:.03,headYaw:-.12,silhouette:'stocky umbrella holder, cap and wide toggled coat',skin:[.33,.19,.125],hair:[.10,.09,.075],coat:[.09,.11,.14],scarf:[.28,.23,.11]}),
  crowd('knot-3','vigil_figure_seated_a','female',{height:1.69,width:.96,depth:1.02,face:'sabine',wardrobe:'raincoat',posture:'seated',seatY:.475,accessory:'blanket',seed:12.4,lean:.11,sideLean:.025,headYaw:-.20,silhouette:'lean seated woman, collar up and a narrow blanket',skin:[.42,.27,.18],hair:[.31,.29,.24],coat:[.085,.13,.14],scarf:[.28,.21,.12]}),
  crowd('knot-4','vigil_figure_placard_a','female',{height:1.78,width:.94,depth:.98,face:'celeste',wardrobe:'raincoat',headwear:'knit-cap',accessory:'placard',seed:13.2,sideLean:-.025,headYaw:.16,silhouette:'tall slim sign holder, close cap and below knee coat',skin:[.67,.51,.40],hair:[.24,.14,.065],coat:[.20,.19,.145],scarf:[.11,.17,.14]}),
  crowd('porch-1','vigil_figure_umbrella_a','male',{height:1.72,width:1.02,depth:1.03,face:'lucien',wardrobe:'anorak',headwear:'hood',accessory:'umbrella',seed:14.0,lean:.065,headYaw:.14,silhouette:'hunched umbrella holder, raised hood and padded jacket',skin:[.24,.12,.075],hair:[.045,.025,.02],coat:[.105,.125,.10],scarf:[.30,.20,.12]}),
  crowd('porch-2','vigil_figure_flask_b','male',{height:1.76,width:.97,depth:1.02,face:'noe',wardrobe:'raincoat',headwear:'flat-cap',accessory:'flask',seed:14.8,lean:.04,sideLean:.03,headYaw:-.1,silhouette:'slim capped man, long coat and stacked paper cups',skin:[.57,.39,.27],hair:[.42,.39,.32],coat:[.08,.075,.065],scarf:[.23,.21,.16]}),
  crowd('porch-3','vigil_figure_camera_b','female',{height:1.67,width:1.06,depth:1.02,face:'odette',wardrobe:'work-jacket',headwear:'knit-cap',accessory:'camera',seed:15.6,lean:.025,headYaw:-.11,silhouette:'compact camera operator, knit cap and boxy field jacket',skin:[.31,.17,.105],hair:[.04,.03,.025],coat:[.085,.10,.13],trouser:[.07,.085,.10]}),
];
export const STREET_CROWD_DESIGNS=freeze(Object.fromEntries(entries.map(entry=>[entry.id,entry])));
export const STREET_CROWD_CHARACTER_MESHES=freeze(entries.map(entry=>entry.mesh));
export const STREET_CROWD_IDS=freeze(entries.map(entry=>entry.id));
export const STREET_CROWD_LOCAL_IDS=freeze(entries.filter(entry=>entry.id.startsWith('district-')).map(entry=>entry.id));
export const STREET_CROWD_VIGIL_IDS=freeze(entries.filter(entry=>entry.id.startsWith('vigil-crowd-')).map(entry=>entry.id));
export function streetCrowdDesign(idOrMesh){return STREET_CROWD_DESIGNS[idOrMesh]||entries.find(entry=>entry.mesh===idOrMesh)||entries.find(entry=>entry.id.startsWith('district-')&&entry.legacyMesh===idOrMesh)||null;}
export function streetCrowdGarment(idOrMesh){const entry=streetCrowdDesign(idOrMesh);return entry?{...STREET_CROWD_GARMENTS[entry.wardrobe],...(entry.tailoring||{})}:null;}
