function cue(theme, movementId, attackId, gamePrompt, { responseSeconds = 2.45, ringing = true } = {}) {
  return Object.freeze({ theme, movementId, attackId, gamePrompt, responseSeconds, ringing });
}

const chapel = cue('chapel', 'room', 'chapel:walls', 'CLICK THE DESKTOP ARCH', { responseSeconds: 2.15 });
const tower = cue('tower', 'bell-borne', 'cathedral:clapper', 'CLICK THE CLAPPER STOP');
const peal = cue('tower', 'surfer-return', 'cathedral:full-peal', 'CLICK THE PEAL STOP');
const wrongReturn = cue('source-ii', 'call-site', 'source:stack', 'CLICK THE CHARGED SEAM');
const theCatch = cue('source-iii', 'borrowed-body', 'source:wear', 'CLICK THE CATCH PLATE');
export const SOURCE_FINAL_DESKTOP_PARRY_CUE = cue('source-final', 'final-clause', 'source:final-loop', 'CLICK THE RETURN SEAM', { ringing: false });

export function desktopParryCueFor(battleId, sourceChapter = null) {
  switch (battleId) {
    case 'chapel': return chapel;
    case 'cathedral-bell-return': return tower;
    case 'cathedral-surfer-final': return peal;
    case 'source-final':
      if (sourceChapter === 'II') return wrongReturn;
      if (sourceChapter === 'III') return theCatch;
      return null;
    default: return null;
  }
}
