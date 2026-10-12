import * as scenes from './scenes.js';
import { makeColdOpenScene } from './coldopen.js';
import { SOURCE_CONTACT_ACTION, SOURCE_CONTACT_CANCEL_CHOICE, sourceContactChoice } from './source-contact.js';

// Same embodied, branching presenter as the guard and finale. There is no
// separate quiz panel, answer scoring, or forced catch/restart presentation.
export function makeSourceContactScene({
  encounter, onResolve = () => {}, onChoice = () => {}, onLine, onBody = () => {}, audio, getAudio, cue, fx, replay,
} = {}) {
  let resolution = null;
  let closed = false;
  function metadata(choice) {
    return {
      action: choice.sourceContactAction,
      terminal: choice.terminal === true,
      nodeId: choice.nodeId,
      combat: choice.sourceContactAction === SOURCE_CONTACT_ACTION.COMBAT,
    };
  }
  function finish() {
    if (closed) return;
    closed = true;
    const choice = resolution || sourceContactChoice(encounter, SOURCE_CONTACT_CANCEL_CHOICE);
    if (choice) onResolve(choice.id, metadata(choice));
  }
  const scene = makeColdOpenScene({
    id: 'source-contact:' + (encounter?.id || 'approach'),
    opening: encounter?.nodes,
    startAt: encounter?.startAt || 'approach',
    slate: '', ambient: false, lensPreset: 'battle',
    blocksWorld: false, allowsLook: true, suppressesHud: true, worldUnderlay: true,
    transcriptBackground: 'rgba(2,4,5,.94)',
    audio, getAudio, cue, fx, replay,
    // The HUSH answers with its body. A line that names a cue hands it to the
    // renderer as the line is spoken (hush-pose.js).
    onLine(line) {
      if (line?.body) onBody(line.body, line);
      onLine?.(line);
    },
    onChoice(choice) {
      const authored = sourceContactChoice(encounter, choice.id);
      if (!authored) return;
      encounter.markChoice?.(authored.id);
      if (authored.terminal) resolution = authored;
      onChoice(authored.id, metadata(authored));
    },
    onDone: finish,
  });
  const key = scene.key;
  scene.key = (event) => {
    if (scenes.top() !== scene) return true;
    if (event.key !== 'Escape') return key(event);
    // Once deliberately committed, Escape cannot turn a fight into a retreat.
    if (resolution?.sourceContactAction === SOURCE_CONTACT_ACTION.COMBAT) return true;
    if (!closed) {
      resolution = sourceContactChoice(encounter, SOURCE_CONTACT_CANCEL_CHOICE);
      if (resolution) onChoice(resolution.id, metadata(resolution));
      scenes.remove(scene);
      finish();
    }
    return true;
  };
  scene.sourcePressureLive = false;
  scene.sourceContactDialogue = true;
  return scene;
}
