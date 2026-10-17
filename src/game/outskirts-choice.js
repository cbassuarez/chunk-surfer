// Runtime narrative choices retain authored IDs as sourceId. Keep physical
// actions keyed to those IDs so a visible choice also moves the road prop.
export function outskirtsChoiceId(choice) {
  return String(choice?.sourceId || choice?.id || '');
}

export function outskirtsPhysicalAction(choice) {
  const id = outskirtsChoiceId(choice);
  if (id === 'outskirts.lodge.knock') return 'knock';
  if (/^outskirts\.(?:lodge|lodge-again)\.phone(?:-again|-first)?$/.test(id)) return 'phone';
  if (id === 'outskirts.ledger.sign') return 'sign';
  if (id === 'outskirts.postbox.post') return 'post';
  if (id === 'outskirts.woman.give') return 'ticket';
  return null;
}
