import { RADIO_CUES } from './radio-cues.js';

const WALKIE_ART = Object.freeze({
  id: 'walkie',
  mode: 'hero',
  caption: 'Client radio / issued equipment',
  status: 'LIVE',
});

const failingArt = (status = 'CARRIER') => ({
  ...WALKIE_ART,
  caption: 'Client radio / carrier open',
  status,
});

const terminal = (...lines) => ({ art: WALKIE_ART, lines });

export function radioDialogue(cueId, { roomLabel = 'the next room' } = {}) {
  switch (cueId) {
    case RADIO_CUES.INITIAL:
      return initialCheckin();
    case RADIO_CUES.POST_SECOND:
      return postSecondTakeWarning();
    case RADIO_CUES.PRE_THIRD:
      return preThirdBreakdown(roomLabel);
    default:
      return terminal({ who: 'direction', text: 'The radio does not open.' });
  }
}

function initialCheckin() {
  return {
    start: {
      art: WALKIE_ART,
      lines: [
        { who: 'radio', text: '4417-C, go ahead.' },
      ],
      choices: [
        { text: 'Identify yourself.', goto: 'identify' },
        { text: 'Ask about the work order.', goto: 'work' },
        { text: 'Ask who is on the channel.', goto: 'channel' },
      ],
    },
    identify: terminal(
      { who: 'me', text: '4417-C on site. Starting the basement rooms.' },
      { who: 'radio', text: 'Copy. Top of the hour.' },
      { who: 'direction', text: 'A chair moves somewhere behind the voice. Someone laughs at something that is not you.', hold: 2.2 },
    ),
    work: terminal(
      { who: 'me', text: 'Confirming the order. Five room tones, one minute each.' },
      { who: 'radio', text: 'Five rooms. No handling noise. No light on the tape.' },
      { who: 'direction', text: 'The carrier closes cleanly enough to sound rehearsed.', hold: 1.8 },
    ),
    channel: terminal(
      { who: 'me', text: 'Who am I speaking to?' },
      { who: 'radio', text: 'Front desk relay. Do the rooms in whatever order the building gives you.' },
      { who: 'direction', text: 'That should be a joke. It does not land like one.', hold: 2.0 },
    ),
  };
}

function postSecondTakeWarning() {
  return {
    start: {
      art: failingArt('OPEN'),
      lines: [
        { who: 'radio', text: '4417-C, go ahead.' },
      ],
      choices: [
        { text: 'Report the second room.', goto: 'report' },
        { text: 'Ask about the interference.', goto: 'interference' },
        { text: 'Ask if anyone else is transmitting.', goto: 'other' },
      ],
    },
    report: terminal(
      { who: 'me', text: 'Second room is clean. Two on the card.' },
      { who: 'radio', text: 'Copy. Tw— two on—' },
      { who: 'direction', art: failingArt('OPEN'), text: 'The carrier stays open after the word should have ended.', hold: 2.2 },
      { who: 'radio', text: 'Do not tap the set. If it drifts, let it drift.' },
      { who: 'direction', art: failingArt('DEAD'), text: 'The speaker gives one wet pop. The carrier light goes out and does not return.', cue: 'scream', shake: 1.0, shakeMs: 460, hold: 2.8 },
    ),
    interference: terminal(
      { who: 'me', text: 'I am getting another signal under you.' },
      { who: 'radio', text: 'No other channel assigned.' },
      { who: 'direction', art: failingArt('BEAT'), text: 'A dry click answers from inside the radio before the person does.', hold: 2.0 },
      { who: 'radio', text: 'Keep the next room short.' },
      { who: 'direction', art: failingArt('DEAD'), text: 'The last word folds into a low squeal. Then the set is dead in your hand.', cue: 'scream', shake: 1.0, shakeMs: 460, hold: 2.8 },
    ),
    other: terminal(
      { who: 'me', text: 'Is anyone else on this channel?' },
      { who: 'radio', text: 'Negative.' },
      { who: 'direction', art: failingArt('OPEN'), text: 'Behind the negative, a breath arrives too close to the grille.', hold: 2.4 },
      { who: 'radio', text: 'If you hear yourself, stop answering.' },
      { who: 'direction', art: failingArt('DEAD'), text: 'Your own breath answers once. The carrier snaps shut for good.', cue: 'scream', shake: 1.0, shakeMs: 460, hold: 2.8 },
    ),
  };
}

function preThirdBreakdown(roomLabel) {
  const room = String(roomLabel || 'the next room').toUpperCase();
  return {
    start: {
      art: failingArt('CARRIER'),
      lines: [
        { who: 'radio', text: '4417-C, go ahead.' },
        { who: 'direction', text: `You are close enough to ${room} for the room to take the channel.`, hold: 1.8 },
      ],
      choices: [
        { text: 'Answer normally.', goto: 'normal' },
        { text: 'Ask what room they mean.', goto: 'room' },
        { text: 'Stay quiet and listen.', goto: 'listen' },
      ],
    },
    normal: terminal(
      { who: 'me', text: '4417-C. Receiving.' },
      { who: 'radio', text: 'Receiving receiving receiving.' },
      { who: 'direction', art: failingArt('LOOP'), text: 'Your own last word returns three times, each one smaller and wetter than the last.', hold: 2.6 },
      { who: 'radio', text: 'Go ahead.' },
      { who: 'direction', art: failingArt('DEAD'), text: 'The speaker pops once. The carrier drops into a dead click.', cue: 'scream', shake: 1.2, shakeMs: 520, hold: 3.0 },
    ),
    room: terminal(
      { who: 'me', text: 'Which room are you calling from?' },
      { who: 'radio', text: `${room}. ${room}. ${room}.` },
      { who: 'direction', art: failingArt('WRONG ROOM'), text: 'It says the room before you enter it. It says it with your mouth.', hold: 2.8 },
      { who: 'radio', text: 'Go ahead.' },
      { who: 'direction', art: failingArt('DEAD'), text: 'The radio gives one clipped syllable and shuts itself.', cue: 'scream', shake: 1.2, shakeMs: 520, hold: 3.0 },
    ),
    listen: terminal(
      { who: 'direction', art: failingArt('OPEN'), text: 'You do not answer. The open channel keeps working anyway.', hold: 2.4 },
      { who: 'radio', text: 'Go ahead.' },
      { who: 'radio', text: 'Go ahead.' },
      { who: 'direction', art: failingArt('DEAD'), text: 'The second one is not a request. It is a door closing inside the radio.', cue: 'scream', shake: 1.2, shakeMs: 520, hold: 3.0 },
    ),
  };
}
