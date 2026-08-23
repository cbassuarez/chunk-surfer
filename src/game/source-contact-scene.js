import * as scenes from './scenes.js';
import { uiScrim, uiSize, uiText, uiWrap } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { promptLine } from './bindings.js';

export function makeSourceContactScene({ encounter, onResolve = () => {} } = {}) {
  let lineIndex = 0;
  let choiceIndex = 0;
  let choosing = false;
  let resolved = false;
  const lines = Array.isArray(encounter?.lines) ? encounter.lines : [];
  const choices = Array.isArray(encounter?.choices) ? encounter.choices : [];

  function advance() {
    if (lineIndex < lines.length - 1) { lineIndex += 1; return; }
    choosing = true;
  }

  function choose() {
    if (resolved || !choices.length) return;
    resolved = true;
    const choice = choices[Math.max(0, Math.min(choiceIndex, choices.length - 1))];
    onResolve(choice.id, { aligned: choice.aligns === true, insightId: encounter?.insightId || null });
    scenes.pop();
  }

  return {
    id: `source-contact:${encounter?.id || 'unknown'}`,
    blocksInput: true,
    blocksWorld: false,
    allowsLook: true,
    suppressesHud: true,
    sourcePressureLive: true,
    lookProfile: 'rupture',
    key(event) {
      if (choosing) {
        if (event.key === 'ArrowUp' || event.key === 'w') choiceIndex = (choiceIndex - 1 + choices.length) % choices.length;
        else if (event.key === 'ArrowDown' || event.key === 's') choiceIndex = (choiceIndex + 1) % choices.length;
        else if (event.key === 'Enter' || event.key === ' ' || event.key === 'z') choose();
        return true;
      }
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'z') advance();
      return true;
    },
    render() {
      const { cols, rows } = uiSize();
      uiScrim(0.62);
      const width = Math.min(82, cols - 4);
      const height = Math.min(rows - 4, Math.max(17, 11 + choices.length * 2));
      const x = Math.floor((cols - width) / 2), y = Math.floor((rows - height) / 2);
      const panel = drawMachinePanel(x, y, width, height, {
        label: 'SOURCE / CONTACT',
        source: encounter?.speaker || 'UNATTRIBUTED',
        meter: true,
        footer: choosing
          ? promptLine([{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'COMMIT' }])
          : promptLine([{ action: 'continue', label: 'CONTINUE' }]),
      });
      const current = lines[Math.min(lineIndex, Math.max(0, lines.length - 1))];
      const wrapped = uiWrap(current?.text || '', Math.max(18, panel.w - 2));
      wrapped.slice(0, 5).forEach((line, index) => uiText(panel.x + 1, panel.y + 1 + index, line, current?.who === 'surfer' ? 'ui-amber' : 'ui-primary'));
      if (!choosing) return;
      const choiceY = panel.y + 7;
      choices.forEach((choice, index) => {
        const selected = index === choiceIndex;
        uiText(panel.x + 1, choiceY + index * 2, `${selected ? '>' : ' '} ${choice.text}`.slice(0, panel.w - 2), selected ? 'ui-amber' : 'ui-secondary');
      });
    },
  };
}
