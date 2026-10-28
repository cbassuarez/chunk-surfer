// A local development overlay, never a story save or an authoring mutation.
export const LOCAL_TEXT_REVIEW_BUILD = typeof __LOCAL_TEXT_REVIEW__ !== 'undefined' && __LOCAL_TEXT_REVIEW__ === true;
export const TEXT_REVIEW_STORAGE_KEY = 'chunk-surfer.local-text-review.v1';
export const TEXT_REVIEW_REASONS = Object.freeze(['change', 'remove', 'rearrange', 'tune']);

export function localTextReviewLocation(location = {}) {
  const host = String(location.hostname || '').toLowerCase();
  return ['http:', 'https:', 'tauri:'].includes(location.protocol)
    && ['localhost', '127.0.0.1', '::1', '[::1]', 'tauri.localhost'].includes(host);
}
function hashText(text) {
  let hash = 2166136261;
  for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}
export function reviewKey({sceneId = '', nodeId = '', sourceId = '', collection = 'lines', index, field = 'text'} = {}, original = '') {
  return JSON.stringify([sceneId, nodeId, collection, sourceId || (Number.isInteger(index) ? index : `text:${hashText(original)}`), field]);
}
export const reviewTarget = target => target;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function plainTarget(target) {
  if (!target || typeof target.id !== 'string' || !Array.isArray(target.fields) || !target.fields.length) throw Error('This text has no review identity.');
  const fields = target.fields.map(field => {
    if (typeof field?.key !== 'string' || typeof field.original !== 'string') throw Error('This text has no original field.');
    return {key: field.key, label: String(field.label || 'Text'), original: field.original};
  });
  return {id:target.id, sceneId:String(target.sceneId || ''), nodeId:String(target.nodeId || ''),
    sourceId:String(target.sourceId || ''), speaker:String(target.speaker || ''), fields};
}

export function createLocalTextReview({buildAllowed = false, local = false, storage = null, storageKey = TEXT_REVIEW_STORAGE_KEY, now = () => new Date().toISOString()} = {}) {
  const allowed = buildAllowed === true && local === true;
  let enabled = false, revision = 0, error = '', regions = [];
  let data = {version:1, overrides:{}, flags:[]};
  const listeners = new Set();
  if (allowed) {
    try {
      const saved = storage?.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.version !== 1 || !parsed.overrides || typeof parsed.overrides !== 'object' || Array.isArray(parsed.overrides) || !Array.isArray(parsed.flags)) throw Error('Unsupported local text review file.');
        const overrides = {};
        for (const [key, value] of Object.entries(parsed.overrides)) {
          if (typeof value?.original !== 'string' || typeof value.text !== 'string') throw Error(`Invalid local text edit: ${key}`);
          overrides[key] = {...value, context:value.context ? plainTarget(value.context) : null};
        }
        // No parsed setting can enable the mode or change its build gate.
        const flags = parsed.flags.map(flag => {
          if (typeof flag?.id !== 'string' || !TEXT_REVIEW_REASONS.includes(flag.reason)) throw Error('Invalid local text flag.');
          return {...flag, note:String(flag.note || ''), target:plainTarget(flag.target)};
        });
        data = {version:1, overrides, flags};
      }
    } catch (problem) { error = `Local text review could not be loaded: ${problem.message}`; }
  }
  const publish = () => { revision++; for (const listener of listeners) listener(); };
  function commit(next) {
    if (!allowed || !enabled) throw Error('Local text review is off.');
    try {
      if (!storage) throw Error('Local storage is unavailable. Export changes before closing this session.');
      storage.setItem(storageKey, JSON.stringify(next));
    } catch (problem) { error = `Text was not saved: ${problem.message}`; publish(); throw Error(error); }
    data = next; error = ''; publish();
  }
  const session = {
    get allowed() { return allowed; }, get enabled() { return enabled; }, get revision() { return revision; }, get error() { return error; },
    setEnabled(next) { enabled = allowed && next === true; regions = []; publish(); return enabled; },
    text(key, original) {
      const value = String(original ?? '');
      const edit = allowed && enabled && own(data.overrides, key) ? data.overrides[key] : null;
      return edit?.original === value ? edit.text : value;
    },
    saveFields(target, values) {
      const context = plainTarget(target), overrides = {...data.overrides};
      for (const field of context.fields) {
        if (!own(values, field.key)) continue;
        if (typeof values[field.key] !== 'string' || values[field.key].length > 65536) throw Error('Text must contain at most 65,536 characters.');
        if (values[field.key] === field.original) delete overrides[field.key];
        else overrides[field.key] = {original:field.original, text:values[field.key], context, updatedAt:now()};
      }
      commit({...data, overrides});
    },
    resetTarget(target) {
      const overrides = {...data.overrides};
      for (const field of plainTarget(target).fields) delete overrides[field.key];
      commit({...data, overrides});
    },
    flag(target, reason = 'change', note = '') {
      if (!TEXT_REVIEW_REASONS.includes(reason)) throw Error('Unknown text review reason.');
      const context = plainTarget(target), id = `${context.id}:${reason}`;
      const flag = {id, target:context, reason, note:String(note).slice(0,65536), updatedAt:now()};
      commit({...data, flags:[...data.flags.filter(item => item.id !== id), flag]});
      return flag;
    },
    removeFlag(id) { commit({...data, flags:data.flags.filter(flag => flag.id !== id)}); },
    resetOverrides() { commit({...data, overrides:{}}); },
    snapshot() { return JSON.parse(JSON.stringify({...data, enabled, allowed, revision, error})); },
    export() { return JSON.stringify({format:'chunk-surfer-local-text-review', ...data}, null, 2); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    beginFrame() { regions = []; },
    register(target, rect) {
      if (!allowed || !enabled || !target?.fields?.length) return;
      if (!['x','y','w','h'].every(key => Number.isFinite(rect?.[key])) || rect.w <= 0 || rect.h <= 0) return;
      regions.push({target, ...rect});
    },
    regions() { return regions.map(region => ({...region})); },
    hit(x, y) { return [...regions].reverse().find(region => x >= region.x && y >= region.y && x < region.x + region.w && y < region.y + region.h)?.target || null; },
    latestPlayerTarget() {
      const latest = [...regions].reverse(), player = region => ['you','me','player','recordist'].includes(String(region.target.speaker).toLowerCase());
      return (latest.find(region => region.selected) || latest.find(region => region.active && player(region))
        || latest.find(region => region.active) || latest.find(player) || latest[0])?.target || null;
    },
  };
  return session;
}

export let textReviewSession = createLocalTextReview();
export function configureLocalTextReview({storage, location = globalThis.location} = {}) {
  textReviewSession = createLocalTextReview({buildAllowed:LOCAL_TEXT_REVIEW_BUILD, local:localTextReviewLocation(location), storage});
  return textReviewSession;
}
export const setTextReviewEnabled = enabled => textReviewSession.setEnabled(enabled);
export const reviewText = (key, original) => textReviewSession.text(key, original);
export const registerReviewRegion = (target, rect) => textReviewSession.register(target, rect);
export const beginReviewFrame = () => textReviewSession.beginFrame();
