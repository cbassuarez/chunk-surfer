// Physical-paper production contracts. These values are authoring/build data,
// not screen layout. Every meaningful paper object resolves through this module
// before it reaches either the baked asset compiler or the runtime reader.

export const PAPER_FORMAT = Object.freeze({
  A4: Object.freeze({ id:'A4', widthMm:210, heightMm:297, canonicalPpi:300, processPpi:600, canonicalPx:[2480,3508] }),
  A5: Object.freeze({ id:'A5', widthMm:148, heightMm:210, canonicalPpi:300, processPpi:600, canonicalPx:[1748,2480] }),
  SMALL_NOTE: Object.freeze({ id:'SMALL_NOTE', widthMm:105, heightMm:148, canonicalPpi:300, processPpi:600, canonicalPx:[1240,1748] }),
});

export const PAPER_LOCALE_UK = Object.freeze({
  language:'en-GB', dateOrder:'DMY', time:'24h', currency:'GBP', distance:'metres',
  terminology:Object.freeze({
    loadingDock:'loading bay', parkingLot:'car park', labor:'labour', authorized:'authorised',
    meters:'metres', center:'centre', storyFloor:'storey', zipCode:'postcode', cellPhone:'mobile',
  }),
});

export const PAPER_STOCK = Object.freeze({
  ELLERY_LETTERHEAD:Object.freeze({ id:'ellery-letterhead-uncoated', tone:'#F2F0E8', roughness:.80, transmission:.075, gsm:100, thicknessMm:.105 }),
  OFFICE_WHITE:Object.freeze({ id:'office-copy-white-80', tone:'#F1F0EA', roughness:.84, transmission:.09, gsm:80, thicknessMm:.095 }),
  RECYCLED:Object.freeze({ id:'cheap-recycled-office', tone:'#E8E4D8', roughness:.89, transmission:.105, gsm:80, thicknessMm:.100 }),
  ARCHIVE:Object.freeze({ id:'archive-cream', tone:'#E8E1CD', roughness:.85, transmission:.07, gsm:100, thicknessMm:.110 }),
});

// Production processes describe how marks got onto the paper. They are never
// speaker identities. The Surfer can later violate this genealogy, but ordinary
// paperwork always follows it.
export const PAPER_PRINT_PROCESS = Object.freeze({
  OFFSET_1C:Object.freeze({ id:'offset-1c', kind:'stationery', label:'one-colour offset stationery' }),
  IMPACT_24_NLQ:Object.freeze({ id:'impact-24-nlq', kind:'impact', pins:24, mode:'near-letter-quality', cpi:10 }),
  IMPACT_24_WORN:Object.freeze({ id:'impact-24-worn', kind:'impact', pins:24, mode:'near-letter-quality', cpi:10, worn:true }),
  IMPACT_9_DRAFT:Object.freeze({ id:'impact-9-draft', kind:'impact', pins:9, mode:'draft', cpi:10 }),
  LASER_MONO:Object.freeze({ id:'laser-mono', kind:'toner' }),
  PHOTOCOPY:Object.freeze({ id:'photocopy-toner', kind:'toner', reproduction:true }),
  BIRO:Object.freeze({ id:'biro', kind:'manual' }),
});

export const PAPER_HANDLING_PROFILE = Object.freeze({
  CLEAN:Object.freeze({ id:'clean', folds:[], cornerBend:null, tear:null, paperclip:null, moisture:null, edgeWear:0 }),
  FILED:Object.freeze({
    id:'filed',
    folds:[Object.freeze({ axis:'horizontal', positionMm:148.5, strength:.30, direction:'mountain' })],
    cornerBend:Object.freeze({ corner:'bottom-right', radiusMm:18, strength:.14 }),
    tear:null,
    paperclip:Object.freeze({ corner:'top-left', strength:.20 }),
    moisture:Object.freeze({ edge:'bottom-left', strength:.08, radiusMm:22 }),
    edgeWear:.08,
  }),
  FIELD_CARRIED:Object.freeze({
    id:'field-carried',
    folds:[
      Object.freeze({ axis:'horizontal', positionMm:99, strength:.46, direction:'mountain' }),
      Object.freeze({ axis:'horizontal', positionMm:198, strength:.34, direction:'valley' }),
    ],
    cornerBend:Object.freeze({ corner:'bottom-right', radiusMm:25, strength:.28 }),
    tear:Object.freeze({ corner:'bottom-right', depthMm:7, spanMm:16 }),
    paperclip:null,
    moisture:Object.freeze({ edge:'bottom-left', strength:.18, radiusMm:30 }),
    edgeWear:.16,
  }),
  TORN_FIELD_NOTE:Object.freeze({
    id:'torn-field-note',
    folds:[Object.freeze({ axis:'horizontal', positionMm:151, strength:.34, direction:'mountain' })],
    cornerBend:Object.freeze({ corner:'top-right', radiusMm:16, strength:.24 }),
    tear:Object.freeze({ corner:'bottom-right', depthMm:15, spanMm:28 }),
    paperclip:null,
    moisture:Object.freeze({ edge:'bottom-left', strength:.28, radiusMm:34 }),
    edgeWear:.28,
  }),
  COPY_WORN:Object.freeze({
    id:'copy-worn',
    folds:[Object.freeze({ axis:'horizontal', positionMm:148.5, strength:.45, direction:'mountain' })],
    cornerBend:Object.freeze({ corner:'bottom-left', radiusMm:22, strength:.24 }),
    tear:Object.freeze({ corner:'bottom-right', depthMm:9, spanMm:18 }),
    paperclip:null,
    moisture:Object.freeze({ edge:'bottom-right', strength:.20, radiusMm:28 }),
    edgeWear:.24,
  }),
});

export const PAPER_ISSUER = Object.freeze({
  ELLERY_WORKS:Object.freeze({
    id:'ellery-works', mark:'W. ELLERY / WORKS', descriptor:'ACOUSTIC RECORDING · TECHNICAL SERVICES',
    department:'', address:['Calder Works, Bradford Road','Brighouse, West Yorkshire  HD6 4AA'], telephone:'01484 214 417', fax:'01484 214 418',
    stationeryInk:'#263A4B', stock:PAPER_STOCK.ELLERY_LETTERHEAD.id, external:true, seal:'trade', formPrefix:'W.E./',
  }),
  CONSERVATOIRE:Object.freeze({
    id:'ellery-conservatoire', mark:'ELLERY CONSERVATOIRE OF MUSIC', descriptor:'WEST YORKSHIRE',
    department:'GENERAL OFFICE', address:['Collegiate Buildings, Calder Street','Brighouse, West Yorkshire  HD6 1QJ'], telephone:'01484 221 906', fax:'01484 221 907',
    stationeryInk:'#272621', stock:PAPER_STOCK.OFFICE_WHITE.id, external:false, seal:'academic', formPrefix:'E.C.M.',
  }),
  FACILITIES:Object.freeze({
    id:'facilities', mark:'ELLERY CONSERVATOIRE OF MUSIC', descriptor:'WEST YORKSHIRE',
    department:'BUILDINGS DEPARTMENT', address:['Collegiate Buildings, Calder Street','Brighouse, West Yorkshire  HD6 1QJ'], telephone:'01484 221 906', fax:'01484 221 907',
    stationeryInk:'#272621', stock:PAPER_STOCK.OFFICE_WHITE.id, external:false, seal:'academic', formPrefix:'E.C.M./B',
  }),
  UNBRANDED:Object.freeze({
    id:'unbranded', mark:'', descriptor:'', department:'', address:[], telephone:'',
    stationeryInk:'#2C2C2A', stock:PAPER_STOCK.OFFICE_WHITE.id, external:false,
  }),
});

export const PAPER_TEMPLATE = Object.freeze({
  WORKS_ORDER:'works-order', TAKE_SHEET:'take-sheet', CONTAMINATION_LOG:'contamination-log',
  EQUIPMENT_RETURN:'equipment-return', FAULT_REPORT:'fault-report', ACCESS_LOG:'access-log',
  TIME_SHEET:'time-sheet', MEMO:'memo', LETTER:'letter', FIELD_LOG:'field-log', FREEFORM:'freeform',
  INVENTORY:'inventory', TECHNICAL_REPORT:'technical-report', MONITORING_LOG:'monitoring-log', NOTICE:'notice',
});

export const PAPER_REPRODUCTION = Object.freeze({
  ORIGINAL_CLEAN:Object.freeze({ id:'original-clean', generations:0, copy:false }),
  ORIGINAL_HANDLED:Object.freeze({ id:'original-handled', generations:0, copy:false, handled:true }),
  COPY_G1:Object.freeze({ id:'copy-g1', generations:1, copy:true }),
  COPY_G2:Object.freeze({ id:'copy-g2', generations:2, copy:true }),
  COPY_G4:Object.freeze({ id:'copy-g4', generations:4, copy:true }),
  COPY_G8:Object.freeze({ id:'copy-g8', generations:8, copy:true }),
});

const SOURCE_TEMPLATE_BY_REGISTER=Object.freeze({
  take_sheet:PAPER_TEMPLATE.TAKE_SHEET,
  contamination_log:PAPER_TEMPLATE.CONTAMINATION_LOG,
  equipment_return:PAPER_TEMPLATE.EQUIPMENT_RETURN,
  fault_ticket:PAPER_TEMPLATE.FAULT_REPORT,
  access_sheet:PAPER_TEMPLATE.ACCESS_LOG,
  time_sheet:PAPER_TEMPLATE.TIME_SHEET,
  loose_note:PAPER_TEMPLATE.FREEFORM,
});
const PAPER_TEMPLATE_IDS=new Set(Object.values(PAPER_TEMPLATE));
function normalizeTemplateId(value){
  if(!value)return null;
  const raw=String(value);
  if(PAPER_TEMPLATE_IDS.has(raw))return raw;
  return SOURCE_TEMPLATE_BY_REGISTER[raw]||null;
}

export function paperTemplateForDocument(doc={}){
  const explicit=normalizeTemplateId(doc.paper?.template);
  if(explicit)return explicit;
  if(doc.sourceRegister)return SOURCE_TEMPLATE_BY_REGISTER[doc.sourceRegister]||PAPER_TEMPLATE.FREEFORM;
  const id=String(doc.id||'').toLowerCase(), title=String(doc.title||'').toLowerCase();
  if(id==='work-order'||id==='work-order-carbon'||title.includes('work order'))return PAPER_TEMPLATE.WORKS_ORDER;
  if(id.startsWith('page-')||title.startsWith('log'))return PAPER_TEMPLATE.FIELD_LOG;
  if(id==='foh-overflow-note')return PAPER_TEMPLATE.INVENTORY;
  if(id==='pre-roll-analysis')return PAPER_TEMPLATE.TECHNICAL_REPORT;
  if(id==='student-monitoring-notes')return PAPER_TEMPLATE.MONITORING_LOG;
  if(id==='faculty-reference-requirement')return PAPER_TEMPLATE.NOTICE;
  if(title.includes('fault'))return PAPER_TEMPLATE.FAULT_REPORT;
  return PAPER_TEMPLATE.MEMO;
}

export function paperIssuerForDocument(doc={}){
  if(doc.paper?.issuer&&Object.values(PAPER_ISSUER).some((v)=>v.id===doc.paper.issuer))return doc.paper.issuer;
  if(doc.sourcePageId)return PAPER_ISSUER.ELLERY_WORKS.id;
  const id=String(doc.id||'').toLowerCase();
  if(id.startsWith('page-'))return PAPER_ISSUER.ELLERY_WORKS.id;
  const byline=String(doc.byline||'').toLowerCase();
  if(byline.includes('facilit')||byline.includes('front of house'))return PAPER_ISSUER.FACILITIES.id;
  if(doc.id==='work-order'||byline.includes('contractor')||byline.includes('site copy'))return PAPER_ISSUER.ELLERY_WORKS.id;
  return PAPER_ISSUER.CONSERVATOIRE.id;
}

export function reproductionForDocument(doc={}){
  if(doc.paper?.reproduction)return doc.paper.reproduction;
  const sourceStage=Math.max(0,Math.min(4,Math.floor(Number(doc.sourceStage)||0)));
  if(doc.sourcePageId){
    return [PAPER_REPRODUCTION.ORIGINAL_HANDLED.id,PAPER_REPRODUCTION.COPY_G1.id,PAPER_REPRODUCTION.COPY_G2.id,PAPER_REPRODUCTION.COPY_G4.id,PAPER_REPRODUCTION.COPY_G8.id][sourceStage];
  }
  const d=Math.max(0,Math.min(1,Number(doc.decay)||0));
  if(d>.72)return PAPER_REPRODUCTION.COPY_G8.id;
  if(d>.5)return PAPER_REPRODUCTION.COPY_G4.id;
  if(d>.25)return PAPER_REPRODUCTION.COPY_G2.id;
  if(d>.08)return PAPER_REPRODUCTION.COPY_G1.id;
  return d>0?PAPER_REPRODUCTION.ORIGINAL_HANDLED.id:PAPER_REPRODUCTION.ORIGINAL_CLEAN.id;
}

export function paperEntryProcessForDocument(doc={}, physicalHint={}){
  const explicit=doc.paper?.entryProcess;
  if(explicit&&Object.values(PAPER_PRINT_PROCESS).some((v)=>v.id===explicit))return explicit;
  const reproduction=physicalHint.reproduction||reproductionForDocument(doc);
  if(String(reproduction).startsWith('copy-'))return PAPER_PRINT_PROCESS.PHOTOCOPY.id;
  const template=physicalHint.template||paperTemplateForDocument(doc);
  if([PAPER_TEMPLATE.NOTICE,PAPER_TEMPLATE.LETTER,PAPER_TEMPLATE.TECHNICAL_REPORT].includes(template))return PAPER_PRINT_PROCESS.LASER_MONO.id;
  if(doc.sourceStage>=3)return PAPER_PRINT_PROCESS.IMPACT_24_WORN.id;
  return PAPER_PRINT_PROCESS.IMPACT_24_NLQ.id;
}

export function paperHandlingForDocument(doc={}, physicalHint={}){
  if(doc.paper?.handling&&Object.keys(doc.paper.handling).length)return Object.freeze({...doc.paper.handling});
  const template=physicalHint.template||paperTemplateForDocument(doc);
  const reproduction=physicalHint.reproduction||reproductionForDocument(doc);
  if(template===PAPER_TEMPLATE.FREEFORM)return PAPER_HANDLING_PROFILE.TORN_FIELD_NOTE;
  if(String(reproduction).startsWith('copy-')&&(reproduction==='copy-g4'||reproduction==='copy-g8'))return PAPER_HANDLING_PROFILE.COPY_WORN;
  if([PAPER_TEMPLATE.FIELD_LOG,PAPER_TEMPLATE.TAKE_SHEET,PAPER_TEMPLATE.CONTAMINATION_LOG].includes(template))return PAPER_HANDLING_PROFILE.FIELD_CARRIED;
  if([PAPER_TEMPLATE.WORKS_ORDER,PAPER_TEMPLATE.FAULT_REPORT,PAPER_TEMPLATE.ACCESS_LOG,PAPER_TEMPLATE.TIME_SHEET,PAPER_TEMPLATE.EQUIPMENT_RETURN,PAPER_TEMPLATE.INVENTORY].includes(template))return PAPER_HANDLING_PROFILE.FILED;
  return PAPER_HANDLING_PROFILE.CLEAN;
}

export function paperHandlingVector(handling={}){
  const fold=(Array.isArray(handling?.folds)?handling.folds:[]).find((f)=>f?.axis==='horizontal')||null;
  const foldY=fold?Math.max(0,Math.min(1,(Number(fold.positionMm)||0)/297)):-1;
  const foldStrength=fold?Math.max(0,Math.min(1,Number(fold.strength)||0)):0;
  const cornerStrength=Math.max(0,Math.min(1,Number(handling?.cornerBend?.strength)||0));
  const tearDepth=Math.max(0,Math.min(1,(Number(handling?.tear?.depthMm)||0)/210));
  return Object.freeze([foldY,foldStrength,cornerStrength,tearDepth]);
}

export function normalizePhysicalDocument(doc={}){
  const template=paperTemplateForDocument(doc),reproduction=reproductionForDocument(doc);
  const handling=paperHandlingForDocument(doc,{template,reproduction});
  return Object.freeze({
    id:String(doc.id||doc.title||'document'),
    title:String(doc.title||'DOCUMENT'), byline:String(doc.byline||''),
    body:Array.isArray(doc.body)?doc.body:Array.isArray(doc.pages)?doc.pages:[],
    format:doc.paper?.format||PAPER_FORMAT.A4.id,
    locale:PAPER_LOCALE_UK.language,
    issuer:paperIssuerForDocument(doc), template,
    stationeryProcess:PAPER_PRINT_PROCESS.OFFSET_1C.id,
    entryProcess:paperEntryProcessForDocument(doc,{template,reproduction}),
    reproduction,
    handling,
    handlingVector:paperHandlingVector(handling),
    sourcePageId:doc.sourcePageId||null,
  });
}

const AMERICAN_PAPER_TERMS=[
  [/\bparking lot\b/i,'car park'],[/\bloading dock\b/i,'loading bay'],[/\blabor\b/i,'labour'],
  [/\bauthorized\b/i,'authorised'],[/\bzip code\b/i,'postcode'],[/\bmeters\b/i,'metres'],[/\bcenter\b/i,'centre'],
];

export function paperText(doc={}){
  const chunks=[doc.title,doc.byline];
  const walk=(entry)=>{
    if(typeof entry==='string')chunks.push(entry);
    else if(entry&&typeof entry==='object'){
      if(entry.raw!=null)chunks.push(entry.raw);
      if(entry.text!=null)chunks.push(entry.text);
      if(Array.isArray(entry))entry.forEach(walk);
    }
  };
  (Array.isArray(doc.body)?doc.body:[]).forEach(walk);
  (Array.isArray(doc.pages)?doc.pages:[]).forEach(walk);
  return chunks.filter(Boolean).map(String).join('\n');
}

export function validateBritishPaperDocument(doc={}){
  const errors=[];const text=paperText(doc);
  for(const [pattern,replacement] of AMERICAN_PAPER_TERMS){if(pattern.test(text))errors.push(`American paper term ${pattern} (prefer ${replacement})`);}
  if(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text)){
    // Numeric dates are legal, but ambiguous date strings should be rare in authored paperwork.
  }
  return {ok:errors.length===0,errors};
}
