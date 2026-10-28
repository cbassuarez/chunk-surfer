import {textReviewSession as session, TEXT_REVIEW_REASONS} from '../game/local-text-review.js';

// Native DOM text fields deliberately sit above the game canvas: selection,
// double-click, IME, multiline editing and platform clipboard all stay native.
export function installLocalTextReviewUi({document:doc = document, onOpen = () => {}, onClose = () => {}} = {}) {
  if (!session.allowed) return null;
  const el = (tag, text, parent) => {const node = doc.createElement(tag); if(text != null) node.textContent = text; parent?.append(node); return node;};
  const style = el('style', null, doc.head);
  style.textContent = `
    #local-text-review-badge{position:fixed;right:12px;bottom:12px;z-index:2147483000;background:#18202a;color:#e7edf3;border:1px solid #a3bacd;border-radius:5px;padding:8px 12px;font:13px system-ui;pointer-events:none}
    #local-text-review{width:min(760px,calc(100vw - 48px));max-height:calc(100vh - 48px);box-sizing:border-box;background:#101820;color:#edf1f5;border:1px solid #8ca5b6;border-radius:8px;padding:22px;font:15px/1.5 system-ui;z-index:2147483001;color-scheme:dark}
    #local-text-review::backdrop{background:#05090c99} #local-text-review h2{margin:0 0 5px;font-size:20px}
    #local-text-review p{margin:7px 0 14px} #local-text-review .context{font:12px/1.5 monospace;overflow-wrap:anywhere;color:#acbecb}
    #local-text-review label{display:block;margin:14px 0 5px} #local-text-review textarea{display:block;box-sizing:border-box;width:100%;min-height:90px;padding:10px;font:16px/1.5 system-ui;user-select:text}
    #local-text-review select,#local-text-review button{font:14px system-ui;padding:8px 11px} #local-text-review button{cursor:pointer}
    #local-text-review .actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:16px} #local-text-review .notice{color:#efc986;min-height:24px;margin-top:12px}
    #local-text-review .review-item{width:100%;display:block;text-align:left;margin:8px 0;white-space:normal} #local-text-review details{margin-top:8px;color:#a7b8c5} #local-text-review pre{white-space:pre-wrap;max-height:120px;overflow:auto}
  `;
  const hint = 'Text review · F7 edit · Shift+F7 all text · F8 flag';
  const badge = el('div', hint, doc.body);
  badge.id = 'local-text-review-badge'; badge.setAttribute('role','status');
  const modal = el('dialog', null, doc.body); modal.id = 'local-text-review'; modal.dataset.noPointerLock = '';
  let activeTarget = null, fields = new Map(), note = null, reason = null, status = null, open = false, lastStatus = '', visibleAtOpen=[];
  function visibleTargets(){
    const targets=new Map();
    for(const region of [...session.regions()].reverse())if(!targets.has(region.target.id))targets.set(region.target.id,region.target);
    return [...targets.values()];
  }
  function message(text) {lastStatus = text; if(status)status.textContent = text;}
  function button(parent, text, action) {const item = el('button', text, parent); item.type = 'button'; item.addEventListener('click', () => {try{action();}catch(error){message(error.message);}}); return item;}
  function exportFile() {
    const blob = new Blob([session.export()], {type:'application/json'}), url = URL.createObjectURL(blob);
    const link = el('a', null, doc.body); link.href = url; link.download = 'chunk-surfer-text-review.json'; link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0); message('Exported local edits and review flags.');
  }
  function close() {
    if (!open) return;
    open = false; activeTarget = null; fields.clear(); visibleAtOpen=[]; modal.close(); onClose();
  }
  function show() {
    if(open)return;
    visibleAtOpen=visibleTargets();onOpen(); open = true;
    try{modal.showModal();}catch(error){open = false; onClose(); throw error;}
  }
  function header(title, context) {
    modal.replaceChildren(); fields.clear();
    el('h2', title, modal); if(context)el('p', context, modal).className = 'context';
    status = null;
  }
  function save() {
    if(!activeTarget)return;
    session.saveFields(activeTarget, Object.fromEntries([...fields].map(([key, field]) => [key, field.value])));
    message('Applied locally. The authored dialogue and its branching are unchanged.');
  }
  function edit(target) {
    if(!session.enabled || !target?.fields?.length)return;
    activeTarget = target;
    header('Edit text', [target.speaker, target.sceneId, target.nodeId, target.sourceId].filter(Boolean).join(' · '));
    el('p', 'Edit the full string here. Save applies it to this local debug game; Esc closes without applying unsaved changes.', modal);
    const edits = session.snapshot().overrides;
    target.fields.forEach((field,index) => {
      const id = `local-text-field-${index}`, label = el('label', field.label, modal); label.htmlFor = id;
      const input = el('textarea', null, modal); input.id = id; input.value = session.text(field.key,field.original); input.spellcheck = true; fields.set(field.key,input);
      const original = el('details', null, modal); el('summary', 'Original', original); el('pre', field.original, original);
      if(edits[field.key] && edits[field.key].original !== field.original)el('p', 'The underlying line changed. Its older override is inactive; save here to replace it.', modal).className = 'notice';
    });
    const actions = el('div', null, modal); actions.className = 'actions';
    button(actions,'Save locally',save);
    button(actions,'Reset this text',() => {session.resetTarget(target); for(const field of target.fields)fields.get(field.key).value = field.original; message('Original text restored.');});
    button(actions,'Close',close);
    const reasonLabel = el('label', 'Flag for later', modal); reasonLabel.htmlFor = 'local-text-flag-reason';
    reason = el('select', null, modal); reason.id = 'local-text-flag-reason';
    for(const value of TEXT_REVIEW_REASONS){const option = el('option', value[0].toUpperCase()+value.slice(1),reason); option.value = value;}
    const noteLabel = el('label','Note (optional)',modal); noteLabel.htmlFor = 'local-text-flag-note';
    note = el('textarea',null,modal); note.id = 'local-text-flag-note'; note.style.minHeight = '60px';
    const flagActions = el('div',null,modal); flagActions.className = 'actions';
    button(flagActions,'Flag this line',() => {session.flag(target,reason.value,note.value);message(`Flagged to ${reason.value}.`);});
    button(flagActions,'Visible text, edits and flags',desk); button(flagActions,'Export JSON',exportFile);
    status = el('p',session.error || '',modal); status.className = 'notice'; status.setAttribute('role','status');
    show(); fields.values().next().value?.focus();
  }
  function desk() {
    if(!session.enabled)return;
    activeTarget = null; header('Local text review','Debug only · stored outside the game save · no source files changed');
    const data = session.snapshot(), entries = new Map();
    for(const edit of Object.values(data.overrides))if(edit.context)entries.set(edit.context.id,edit.context);
    el('p', `${Object.keys(data.overrides).length} edited strings · ${data.flags.length} flags`,modal);
    const visible = open?visibleAtOpen:visibleTargets();
    el('p','F7 edits the current text. Shift+F7 opens this list. Tab and Enter select a line; Esc returns to the game.',modal);
    if(visible.length){
      el('h3','On screen',modal);
      for(const target of visible)button(modal,`Edit visible: ${target.speaker ? target.speaker+' · ' : ''}${target.fields[0]?.original || target.id}`,()=>edit(target)).className='review-item';
    }
    for(const target of entries.values()) button(modal,`Edit: ${target.fields[0]?.original || target.id}`,() => edit(target)).className = 'review-item';
    for(const flag of data.flags){
      const row = el('div',null,modal);
      button(row,`${flag.reason.toUpperCase()}: ${flag.target.fields[0]?.original || flag.target.id}${flag.note ? ` — ${flag.note}` : ''}`,() => edit(flag.target)).className = 'review-item';
      button(row,'Remove flag',() => {session.removeFlag(flag.id);desk();});
    }
    const actions = el('div',null,modal); actions.className = 'actions';
    button(actions,'Export JSON',exportFile); button(actions,'Reset all edits',() => {session.resetOverrides();desk();}); button(actions,'Close',close);
    status = el('p',session.error || '',modal); status.className = 'notice'; status.setAttribute('role','status'); show();
  }
  modal.addEventListener('cancel',event => {event.preventDefault();close();});
  const unsubscribe = session.subscribe(() => {
    badge.hidden = !session.enabled;
    badge.textContent = session.error || hint;
    if(!session.enabled)close();
  });
  badge.hidden = !session.enabled;
  return {
    open:desk, edit, close,
    get isOpen(){return open;}, get lastStatus(){return lastStatus;},
    key(event) {
      if(open){
        if(event.type === 'keyup')return true;
        if(event.key === 'F7' || event.code === 'F7'){event.preventDefault();event.stopPropagation();}
        else if(event.key === 'Escape'){event.preventDefault();event.stopPropagation();close();}
        else if((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's'){
          event.preventDefault();
          try{save();}catch(error){message(error.message);}
        }
        return true;
      }
      if(!session.enabled)return false;
      if(event.ctrlKey || event.metaKey || event.altKey)return false;
      if(event.key === 'F7' || event.code === 'F7'){
        event.preventDefault();event.stopPropagation();
        if(event.type !== 'keyup' && !event.repeat){
          const target=session.latestPlayerTarget();
          if(event.shiftKey || !target)desk();else edit(target);
        }
        return true;
      }
      if((event.key === 'F8' || event.code === 'F8') && event.type !== 'keyup' && !event.repeat){
        const target = session.latestPlayerTarget();
        if(target){
          event.preventDefault();
          try{session.flag(target);badge.textContent = 'Flagged current text · F7 to review';}
          catch(error){badge.textContent = error.message;}
          return true;
        }
      }
      return false;
    },
    pointer(event) {
      // Opening the editor must never compete with locked first-person look.
      // Once its native dialog is open, all pointer routing remains inside it.
      return open;
    },
    dispose(){close();unsubscribe();badge.remove();modal.remove();style.remove();},
  };
}
