// Fabrication is a material contract, not a global distress amount. Distances
// are metres; ranges are authored condition bounds, not measured fictional age.
// Kept serializable so the atlas baker and the carrier builder share one source.
const PROFILES={
 'enamel':{substrate:'metal support with fired vitreous-enamel face',coating:'screen-fired dielectric lettering',roughness:.32,inkRoughness:.44,fieldM:.16,variation:.024,roughnessVariation:.055,microReliefM:.000006,deposit:.055,edgeLoss:.10,sequence:['fired face remains largely intact','sheltered ledge accumulates a thin deposit','isolated actual perimeter impact exposes dull support'],limits:['support alloy is not established; exposed support is neutral, never invented iron rust']},
 'painted-card':{substrate:'uncoated card',coating:'opaque volunteer brush paint',roughness:.87,inkRoughness:.79,fieldM:.13,variation:.045,roughnessVariation:.065,microReliefM:.000015,deposit:.045,edgeLoss:.045,sequence:['fibrous stock is painted with overlapping broad-nib strokes','open stock changes tone in broad irregular handling areas','exposed physical edge is lightly abraded'],limits:['no torn perimeter or invented water tide without geometry/evidence']},
 'painted-cloth':{substrate:'woven banner cloth',coating:'absorbed opaque brush paint',roughness:.91,inkRoughness:.85,fieldM:.21,variation:.04,roughnessVariation:.06,microReliefM:.000018,deposit:.025,edgeLoss:0,sequence:['warp and weft remain under a pigment film','brush loading varies within solid strokes','broad exposed folds retain slightly more dust'],limits:['atlas cannot supply cloth silhouette, sag or torn fibres']},
 'paper-print':{substrate:'paper stock',coating:'absorbed print or pen ink',roughness:.88,inkRoughness:.82,fieldM:.095,variation:.027,roughnessVariation:.035,microReliefM:.000004,deposit:.025,edgeLoss:0,sequence:['paper fibre direction survives printing','gentle stock tone varies across the sheet','actual handled lower region has restrained contact polishing'],limits:['no added foxing, water damage or yellow vignette without a supported cause']},
 'wood-ink':{substrate:'original sampled finished wood',coating:'thin inventory ink',roughness:.73,inkRoughness:.82,fieldM:.035,variation:.015,roughnessVariation:.03,microReliefM:.000002,deposit:0,edgeLoss:0,sequence:['sampled original finish is retained','thin applied ink follows the original normal'],limits:['all original stock channels outside pigment are immutable']},
 'gilt-enamel':{substrate:'dark enamel or painted board',coating:'solid gold-coloured leaf or metallic house lettering',roughness:.38,inkRoughness:.48,inkMetallic:.9,fieldM:.16,variation:.018,roughnessVariation:.065,microReliefM:.000004,deposit:.035,edgeLoss:.018,sequence:['dark face remains continuous','solid gilt varies gently in burnish direction','sheltered surround holds neutral deposits'],limits:['gilt is preserved solid; no orange iron corrosion, green archaeological copper crust or missing character cores']},
 'brass-plate':{substrate:'copper-alloy plate or key tag',coating:'die-stamped or engraved dark legend',roughness:.48,inkRoughness:.76,metallic:.78,fieldM:.035,variation:.055,roughnessVariation:.12,microReliefM:.000003,deposit:.035,edgeLoss:0,sequence:['copper alloy darkens unevenly in recesses','handled high regions become smoother','die impression retains dark nonmetallic fill'],limits:['no iron rust or new deep loss; alloy and lacquer composition remain unspecified']},
 'cut-mineral':{substrate:'existing mineral inscription face',coating:'dark inset cut lettering',roughness:.84,inkRoughness:.89,fieldM:.23,variation:.035,roughnessVariation:.05,microReliefM:.00001,deposit:.045,edgeLoss:0,sequence:['mineral face stays largely intact','thin sheltered deposits vary at the assembly scale','existing cut depth is retained'],limits:['no invented stone species, gypsum crust, leak, missing corner or geometry crack']},
 'ceramic-mosaic':{substrate:'small ceramic tesserae and mineral joints',coating:'fired solid ceramic lettering',roughness:.46,inkRoughness:.49,fieldM:.17,variation:.025,roughnessVariation:.065,microReliefM:.000005,deposit:.03,edgeLoss:0,sequence:['fired tesserae have discrete restrained finish differences','thin joints remain more matte than ceramic','required letter bodies remain solid'],limits:['a material-only tile pattern does not establish broken tessera depth or silhouette']},
 'mineral-stencil':{substrate:'concrete or blockwork repair finish',coating:'bridged opaque maintenance paint',roughness:.89,inkRoughness:.77,fieldM:.12,variation:.035,roughnessVariation:.06,microReliefM:.000012,deposit:.04,edgeLoss:0,sequence:['porous original face supports a solid paint layer','spray/brush load varies without deleting stencil cores','recess deposit is independent of pigment'],limits:['word patch perimeter is never treated as a physical object edge']},
 'rope-stencil':{substrate:'woven rope mat',coating:'opaque paint on raised fibres',roughness:.94,inkRoughness:.86,fieldM:.08,variation:.035,roughnessVariation:.055,microReliefM:.000025,deposit:.04,edgeLoss:0,sequence:['warp and weft orient the fibre texture','paint covers raised fibres without erasing character cores','contact polishes a broad actual walking region'],limits:['no procedural tear or replacement of host silhouette']},
 'apparatus-stencil':{substrate:'original equipment finish',coating:'maintenance stencil paint',roughness:.62,inkRoughness:.74,fieldM:.045,variation:.018,roughnessVariation:.055,microReliefM:.000004,deposit:.025,edgeLoss:0,sequence:['original apparatus finish remains outside pigment','thin dielectric stencil sits over that finish','accessible contact may smooth the finish'],limits:['no artificial weathered rectangle around an applied equipment legend']},
 'transport-print':{substrate:'painted transport board or glazed paper destination',coating:'opaque transport sign print',roughness:.45,inkRoughness:.49,fieldM:.14,variation:.024,roughnessVariation:.055,microReliefM:.000005,deposit:.04,edgeLoss:.04,sequence:['printed stock is continuous','broad exposure changes gloss more than colour','only a genuine carrier edge can lose coating'],limits:['no ungrounded leak or severe outdoor corrosion']},
 'opal-glass':{substrate:'opal telephone glass',coating:'black fired or screen-printed legend',roughness:.24,inkRoughness:.42,fieldM:.08,variation:.008,roughnessVariation:.03,microReliefM:.000002,deposit:.012,edgeLoss:0,sequence:['glass remains continuous behind solid opaque ink','sheltered deposit is restrained','existing illumination stays authored separately'],limits:['no metal response, fabricated glass breakage or extra emission']},
 'apparatus-print':{substrate:'enamel apparatus face',coating:'telephone or equipment print',roughness:.43,inkRoughness:.5,fieldM:.055,variation:.018,roughnessVariation:.045,microReliefM:.000003,deposit:.025,edgeLoss:0,sequence:['hard dielectric finish supports solid legends','accessible contact changes roughness','sheltered residue remains distinct from applied ink'],limits:['no arbitrary rusty border at instruction-card bounds']},
};
export const LETTERING_FINISH_PROFILES=Object.freeze(Object.fromEntries(Object.entries(PROFILES).map(([key,value])=>[key,Object.freeze({...value})])));

export function letteringFinishProfile(job){
 const process=String(job.process||'').toLowerCase(),category=job.category||'institution';
 let profile=process.includes('gilt')?'gilt-enamel':
  /brass|master-key tag|foundry commemorative|die-stamped/.test(process)?'brass-plate':
  /mosaic/.test(process)?'ceramic-mosaic':
  /cut civic/.test(process)?'cut-mineral':
  /opal.*glass/.test(process)?'opal-glass':
  /woven rope|rope mat/.test(process)?'rope-stencil':
  /cloth/.test(process)?'painted-cloth':
  /inventory ink stamp on original wood/.test(process)?'wood-ink':
  /blockwork|concrete/.test(process)?'mineral-stencil':
  /paper|ledger|receipt|biro|pen |pen$|typed|letterpress|removal-tag|card/.test(process)?'paper-print':
  /maintenance|service-panel|returns-tray/.test(process)||category==='maintenance'?'apparatus-stencil':
  /telephone|equipment|machine-stamped/.test(process)||category==='phone'?'apparatus-print':
  category==='personal'?'painted-card':category==='vehicle'?'transport-print':category==='record'?'paper-print':'enamel';
 // Personal paint on a card remains a coating. An instruction card is paper.
 if(category==='personal'&&!/cloth/.test(process))profile='painted-card';
 if(job.finish?.profile)profile=job.finish.profile;
 const defaults=PROFILES[profile];if(!defaults)throw new TypeError(`Unknown lettering finish ${profile} on ${job.id}`);
 const input=job.finishSupport||{},support={kind:input.kind||'applied-lettering',edgeWear:input.edgeWear===true||job.edgeWear===true,contact:input.contact||'none',exposure:input.exposure||'interior'};
 if(!['carrier','applied-lettering'].includes(support.kind)||!['none','lower','handled'].includes(support.contact)||!['interior','exterior','sheltered'].includes(support.exposure))throw new TypeError(`Invalid finish support on ${job.id}`);
 // An applied text patch is not a small independently weathered rectangle.
 if(support.kind!=='carrier')support.edgeWear=false;
 const impressed=/engraved|die-stamped|machine-stamped|stamped master-key/.test(process),cut=profile==='cut-mineral';
 const relief=cut?-Math.min(.0008,Math.max(.00035,Math.abs(job.reliefM??.0006))):impressed?-.00012:job.reliefM??.000007;
 return {...defaults,...job.finish,version:1,profile,support,fabricationReliefM:relief,
  fabricationReliefAssumption:cut?'Negative 0.35–0.8 mm cut-face normal relief; conservative authoring assumption, not measured or silhouette geometry':impressed?'Negative 0.12 mm impressed legend normal relief; conservative authoring assumption, not measured depth':'Authored thin applied pigment relief; not missing substrate',
  coverageInvariant:'identical pigment bytes; finish never changes glyph coverage',source:'tools/chunk_surfer/lettering/finish-profiles.mjs',basis:'NPS Preservation Brief 25; CCI metal/wood guidance; project condition study; authored conservative material inference'};
}
