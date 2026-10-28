// Native key-window truth can arrive before WebKit's DOM focus. Visibility
// always wins, including an occluded WebView inside a still-key native window.
export function sourceDesktopInputActive(presentation = null, documentApi = globalThis.document) {
  if (documentApi?.hidden || documentApi?.visibilityState === 'hidden') return false;
  const confirmed = presentation?.hasFocus?.();
  if (typeof confirmed === 'boolean') return confirmed;
  return typeof documentApi?.hasFocus !== 'function' || documentApi.hasFocus();
}

// "Presented" is emitted only after the passive view has had its own paint
// opportunity. A newer snapshot or retired surface invalidates queued work.
export function createSourceDesktopPaintWitness({
  afterPaint = () => new Promise(resolve => {
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>requestAnimationFrame(resolve));
    else queueMicrotask(resolve);
  }),
  emit = async () => {},
} = {}) {
  let current=null,generation=0,closed=false,acknowledged='';
  const key=value=>`${String(value?.token||'')}:${Number(value?.revision)}`;
  return {
    stage(value){
      if(closed||!value?.token||!Number.isInteger(value.revision))return false;
      if(key(value)!==key(current)){current={token:value.token,revision:value.revision};generation++;}
      return true;
    },
    async present(value){
      if(closed||key(value)!==key(current)||acknowledged===key(value))return false;
      const owner=generation;
      await afterPaint();
      if(closed||owner!==generation||key(value)!==key(current)||acknowledged===key(value))return false;
      acknowledged=key(value);
      await emit({token:value.token,revision:value.revision});
      return true;
    },
    close(){closed=true;current=null;generation++;},
  };
}
