// Ordinary retained records, independent of Odette's availability or account.
// These receipts never contribute to combat, Contact or ending thresholds.
export const STUDENT_STRIKE_DOCUMENT_IDS=Object.freeze({
  ellery:'student-strike-ellery-recovery',tower:'student-strike-tower-recovery',
});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

export const STUDENT_STRIKE_DOCUMENTS=freeze([
  {
    id:STUDENT_STRIKE_DOCUMENT_IDS.ellery,hosted:'student-strike-ellery-record',
    at:{x:12.2,y:245.1},decay:0,pickupNoiseLabel:'a retained carbon lifted from the floor',
    title:'RECOVERY / EXTERNAL REGISTER',byline:'ELLERY · INTERNAL RETAINED COPY',
    body:[
      {raw:'SITE       ELLERY / THIRD-FLOOR CHAMBER ROOM'},
      {raw:'SUBJECT    THE SURFER'},
      {raw:'RECOVERY   BODY REMOVED FROM THIS ROOM'},
      '',
      'The recovery has been entered on the internal incident sheet. The external register is to retain MISSING. Do not circulate an amended entry without the Director’s authorisation.',
      '',
      {raw:'MEDICAL FINDING: NOT ATTACHED'},
      {rule:true},
      {raw:'ATTACHED: COPY OF STUDENTS’ NOTICE'},
      'Acknowledge that his body was recovered here. Until that acknowledgment is made, we will not rehearse or perform. We will not play over what happened.',
      '',
      {raw:'RECEIVED BY THE OFFICE / NO REPLY FILED'},
    ],
    printLines:[
      'ELLERY / INTERNAL RETAINED COPY','RECOVERY / EXTERNAL REGISTER','',
      'SITE: THIRD-FLOOR CHAMBER ROOM','SUBJECT: THE SURFER','BODY REMOVED FROM THIS ROOM','',
      'Internal incident sheet: RECOVERED.','External register: retain MISSING.',
      'Do not circulate an amended entry','without the Director’s authorisation.','',
      'MEDICAL FINDING: NOT ATTACHED','',
      'ATTACHED: STUDENTS’ NOTICE','Acknowledge that his body was','recovered here. Until then, we will','not rehearse or perform. We will','not play over what happened.','',
      'RECEIVED / NO REPLY FILED',
    ],
  },
  {
    id:STUDENT_STRIKE_DOCUMENT_IDS.tower,hosted:'student-strike-tower-record',
    at:{x:31.5,y:162.5},decay:0,pickupNoiseLabel:'a transfer receipt lifted from the bench',
    title:'RECOVERY TRANSFER / TOWER',byline:'ELLERY · SITE HANDOVER COPY',
    body:[
      {raw:'SITE       TOWER / RINGING ROOM'},
      {raw:'SUBJECTS   STUDENTS / IDENTIFICATIONS RETAINED'},
      '',
      'Transfer receipts confirm the removal of students’ bodies from the ringing room. This sheet is filed with the later Ellery recoveries, separately from the earlier recovery of the Surfer.',
      '',
      'The names have been checked against the student register. Attendance entries and participation in the refusal to rehearse are not medical findings.',
      '',
      {raw:'CAUSE OF DEATH: NOT ENTERED ON THIS COPY'},
      {raw:'REHEARSAL STATUS: SUSPENDED'},
      '',
      'Keep this copy with the room handover. Do not substitute the public missing-person register for the transfer receipts.',
    ],
    printLines:[
      'ELLERY / SITE HANDOVER COPY','RECOVERY TRANSFER / TOWER','',
      'SITE: TOWER / RINGING ROOM','SUBJECTS: STUDENTS','IDENTIFICATIONS RETAINED','',
      'Students’ bodies removed from','the ringing room. Filed with the','later Ellery recoveries, separately','from the Surfer’s earlier recovery.','',
      'Names checked against the register.','Refusal to rehearse is not','a medical finding.','',
      'CAUSE OF DEATH: NOT ENTERED','REHEARSAL STATUS: SUSPENDED','',
      'Keep with the room handover.','Do not substitute the public','missing-person register.',
    ],
  },
]);

export const STUDENT_STRIKE_RECORD_MESHES=freeze({
  student_strike_ellery_record:{w:.21,d:.297,h:.006,blocks:false},
  student_strike_tower_record:{w:.21,d:.297,h:.006,blocks:false},
});
export const STUDENT_STRIKE_RECORD_PROPS=freeze([
  {id:'student-strike-ellery-record',mesh:'student_strike_ellery_record',x:12.2,y:245.1,yaw:.16,
    floorOverride:10,elevation:.012,renderOffsetX:.2,renderOffsetZ:.1,renderGroups:['academic'],blocks:false,
    label:'Retained recovery record',inspectAt:{x:12.2,y:245.1},interactionHeight:.003,
    inspect:{first:'A retained carbon. RECOVERY / EXTERNAL REGISTER. The chamber room is named at the top.',again:'The retained carbon still names this room.'}},
  {id:'student-strike-tower-record',mesh:'student_strike_tower_record',x:31.5,y:162.5,yaw:-.14,
    on:'tower-ringing-bench-east',floorOverride:8.6,renderGroups:['tower'],blocks:false,
    label:'Tower recovery transfer',inspectAt:{x:31.5,y:162.5},interactionHeight:.003,
    inspect:{first:'A transfer receipt on the ringing bench. The room handover has been folded around it.',again:'The receipt belongs with this room’s handover.'}},
]);

export function deriveStudentStrikeEvidence(ledger={},options={}){
  const known=options.documentsKnown;
  const crossRun=Array.isArray(known)?known:known instanceof Set?[...known]
    :known&&typeof known==='object'?Object.keys(known).filter(id=>known[id]):[];
  const documents=new Set([...(Array.isArray(ledger?.documentsRead)?ledger.documentsRead:[]),...crossRun]);
  const elleryRecovery=documents.has(STUDENT_STRIKE_DOCUMENT_IDS.ellery);
  const towerRecovery=documents.has(STUDENT_STRIKE_DOCUMENT_IDS.tower);
  const account=options.studentStrikeWatched===true;
  return Object.freeze({elleryRecovery,towerRecovery,account,
    concealment:elleryRecovery||account,strikeDemand:elleryRecovery||account,
    laterRecoveries:towerRecovery||account,known:elleryRecovery||towerRecovery||account,
    records:Object.freeze(STUDENT_STRIKE_DOCUMENTS.filter(d=>documents.has(d.id)).map(d=>d.id))});
}

// Preserve source attribution when the operator brings knowledge elsewhere.
export function studentStrikeEvidenceOpening(evidence={}){
  if(evidence.elleryRecovery)return 'I read the retained copy upstairs. They recovered the Surfer’s body here and kept the public register marked missing.';
  if(evidence.towerRecovery)return 'I read a transfer receipt in the Tower. Students’ bodies were recovered there and in Ellery, after the Surfer.';
  if(evidence.account)return 'Odette says they recovered the Surfer’s body here, then left his file marked missing. The students refused to rehearse.';
  return null;
}
