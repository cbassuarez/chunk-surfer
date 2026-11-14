import { HOME_MOUNTAIN_SITES } from '../data/childhood-valley-trail.js';

export const HOME_VALLEY_REST_SITE = 'childhood-valley';
export const HOME_VALLEY_REST_LOCI = Object.freeze(['bench', 'maul', 'angel']);
const plank = HOME_MOUNTAIN_SITES.find(site => site.id === 'upper-lookout')
  .pieces.find(piece => piece.id === 'lookout-seat-plank');
const seat = { x: (plank.x0 + plank.x1) / 2, y: plank.y1, z: plank.z0 - .07 };
export const HOME_VALLEY_REST_FOCUS = Object.freeze({
  id: 'lookout-seat-plank', kind: 'rest', label: 'SIT ON THE BENCH',
});
export const HOME_VALLEY_REST_END_SECONDS = 10.8;

export function chooseHomeValleyRestLocus(current, random = Math.random) {
  return HOME_VALLEY_REST_LOCI.includes(current) ? current
    : HOME_VALLEY_REST_LOCI[Math.min(HOME_VALLEY_REST_LOCI.length - 1, Math.floor(random() * HOME_VALLEY_REST_LOCI.length))];
}

const unit = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = unit(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));

export function homeValleyRestFocus(realm) {
  if (!realm?.home?.eligible || realm.stage !== 'inside' || realm.atWindow
    || realm.homeState?.recognized) return null;
  const { x, z, floorY, yaw, pitch } = realm.pose;
  const dx = seat.x - x, dz = seat.z - z;
  if (z > plank.z0 - .19 || Math.hypot(dx, dz) > 1.65 || Math.abs(floorY - seat.y) > 1.15
    || Math.abs(wrap(Math.atan2(dx, dz) - yaw)) > .95 || Math.abs(pitch) > 1.02) return null;
  return HOME_VALLEY_REST_FOCUS;
}

export function homeValleyRestFrame(realm, locus, settle, elapsed = 0, reducedMotion = false, view={}) {
  const amount = smooth(settle);
  const frost = smooth((elapsed - 2.8) / 4.4);
  const darkness = smooth((elapsed - 5.1) / 4.0);
  const weakening = reducedMotion ? 0 : smooth((elapsed - 2.2) / 5.0);
  const isBench = locus === 'bench';
  const eyeHeight = isBench ? 1.27 : locus === 'angel' ? .78 : 1.11;
  const lookingPitch = realm.pose.pitch + (view.pitchOffset || 0) * amount;
  return {
    locus, settle: amount, commit: unit(elapsed / HOME_VALLEY_REST_END_SECONDS), frost, darkness,
    pose: {
      ...realm.pose,
      x: mix(realm.pose.x, isBench ? seat.x : realm.pose.x, amount),
      z: mix(realm.pose.z, isBench ? seat.z : realm.pose.z, amount),
      floorY: mix(realm.pose.floorY, isBench ? seat.y - .52 : realm.pose.floorY, amount),
      yaw: wrap(realm.pose.yaw + (view.yawOffset || 0) * amount),
      pitch: Math.max(-1.4, Math.min(1.4, mix(lookingPitch, -.4, weakening * .58))),
    },
    eyeHeight: mix(realm.eyeHeight, eyeHeight - weakening * .24, amount),
  };
}

const line = (who, text) => ({ who, text });
const other = text => line('other', text);
const you = text => line('you', text);
const go = (id, label, next) => ({ id, label, next });
const leave = { id: 'rise', label: 'Get up.', action: 'leave' };
const offer = go('stay', 'What if I stayed here?', 'warning');

export const HOME_VALLEY_REST_STORY = {
  id: 'childhood-valley-rest', phase: 'childhood-valley', entry: 'arrival',
  nodes: {
    arrival: {
      lines: [
        other('Brush the snow off that end. It is drier underneath.'),
        you('Were you waiting for me?'),
        other('I was sitting here. Then you came up.'),
        other('You can stop here a while.'),
      ],
      choices: [
        go('house', 'Can you see the house from here?', 'house'),
        go('bench', 'I have sat here before.', 'bench'),
        go('finish', 'I have not finished what I came for.', 'finish'),
        offer, leave,
      ],
    },
    house: {
      lines: [
        other('I can see its roof. I cannot see into the room.'),
        you('Then how do I know it is the one?'),
        other('You knew before you sat down. You are allowed to leave it at that.'),
      ],
      choices: [go('more', 'I wanted one more look.', 'finish'), offer, leave],
    },
    bench: {
      lines: [
        other('Keep your coat clear of that join. It catches.'),
        you('So did the other one.'),
        other('You caught your coat on something. You remember it because you had to stop.'),
      ],
      choices: [go('finish', 'I meant to keep going.', 'finish'), offer, leave],
    },
    finish: {
      lines: [
        other('What was the last thing you meant to do?'),
        you('I was going to find out what was left.'),
        other('There will always be something left. The road is still there if you want it.'),
      ],
      choices: [offer, leave],
    },
    warning: {
      lines: [
        other('It will get harder to feel your feet. Then you will stop noticing the cold.'),
        you('And in the morning?'),
        other('If you stay, you will die here. You can get up now.'),
      ],
      choices: [
        leave,
        { id: 'remain', label: 'Stay here and die. End this run.', action: 'commit' },
      ],
    },
  },
};

export function homeValleyRestStory(locus) {
  if (locus === 'bench') return HOME_VALLEY_REST_STORY;
  const atMaul = locus === 'maul';
  const arrival = HOME_VALLEY_REST_STORY.nodes.arrival;
  return { ...HOME_VALLEY_REST_STORY, nodes: { ...HOME_VALLEY_REST_STORY.nodes,
    arrival: {
      lines: [
        other(atMaul ? 'Leave it there. The wood will keep.' : 'Get up slowly. It comes off the back of your coat in sheets.'),
        you(atMaul ? 'There is more to split.' : 'It used to look bigger.'),
        other(atMaul ? 'Somebody can split it tomorrow.' : 'You used to be smaller.'),
        other('You can stop here a while.'),
      ],
      choices: arrival.choices.filter(choice => choice.id !== 'bench'),
    },
  } };
}
