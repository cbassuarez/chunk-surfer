import { rehydrateBattle, rehydrateTree } from './runtime-content.js';

const modules = import.meta.glob([
  '/content/narrative/ending.*.story.json',
  // One document now, not seven. The glob keeps the wildcard so a future
  // chapel variant does not need an engine edit to be found.
  '/content/narrative/battle.chapel.story.json',
  '/content/narrative/battle.chapel.*.story.json',
], { eager: true, import: 'default' });
const documents = new Map(Object.values(modules).map((document) => [document.id, document]));

export function runtimeEndingTree(id, context = {}) {
  const document = documents.get(id);
  if (!document) throw new Error(`Missing authored ending document: ${id}`);
  return rehydrateTree(document, context);
}

export function runtimeChapelBattle(id) {
  const document = documents.get(id);
  if (!document) throw new Error(`Missing authored chapel document: ${id}`);
  return rehydrateBattle(document);
}
