export const MARIMBA_LOWER_BAR_COUNT = 17;
export const MARIMBA_ACCIDENTAL_AFTER = Object.freeze([0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14, 15]);
export const MARIMBA_NATURAL_START_X = -1.18;
export const MARIMBA_NATURAL_SPACING = .147;

export function marimbaNaturalX(index) {
  return MARIMBA_NATURAL_START_X + Number(index) * MARIMBA_NATURAL_SPACING;
}

export function marimbaAccidentalX(afterNaturalIndex) {
  const index = Number(afterNaturalIndex);
  return (marimbaNaturalX(index) + marimbaNaturalX(index + 1)) / 2;
}

export function marimbaAccidentalGroups() {
  const groups = [];
  for (const index of MARIMBA_ACCIDENTAL_AFTER) {
    const previous = groups.at(-1);
    if (!previous || index !== previous.at(-1) + 1) groups.push([index]);
    else previous.push(index);
  }
  return groups;
}
