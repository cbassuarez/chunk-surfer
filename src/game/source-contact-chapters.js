// The three complete Contact battles belong to three visited Sources. This
// ledger is independent of combat's movements, dialogue count and tape custody.
export const SOURCE_CONTACT_CHAPTERS = Object.freeze(['I', 'II', 'III']);
export const sourceContactChapter = value => SOURCE_CONTACT_CHAPTERS.includes(value) ? value : null;
export function sourceContactChapterWins(value, { victories = 0, terminalWin = false } = {}) {
  if (Array.isArray(value)) return SOURCE_CONTACT_CHAPTERS.filter(id => value.includes(id));
  const count = terminalWin ? 3 : Math.max(0, Math.min(3, Math.floor(Number(victories) || 0)));
  // Before chapters were tracked, separate wins happened at the first Source.
  // Retain every earned win, assigning ordered chapters without inventing more.
  return SOURCE_CONTACT_CHAPTERS.slice(0, count);
}
export function sourceContactChapterWon(value, chapter = 'I') {
  return sourceContactChapterWins(value?.chapterWins, { victories: value?.victories }).includes(chapter);
}
