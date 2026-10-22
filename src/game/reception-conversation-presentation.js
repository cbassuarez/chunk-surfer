// Local choices use the ordinary thought presenter. Selection is tentative:
// only its onDone caller commits after the reply, never onChoice/onCancel.
export function createReceptionConversationPresentation(conversation) {
  const spoken = lines => (lines || []).map(line => typeof line === 'string'
    ? { who:'unknown', text:line } : { ...line });
  const choices = Array.isArray(conversation.choices) ? conversation.choices : [];
  let selected = null;
  const nodes = { start:{speaker:conversation.speaker, lines:spoken(conversation.lines)} };
  if (choices.length) {
    nodes.start.choices = choices.map((choice, index) => {
      const target = `reply-${index}`;
      nodes[target] = {speaker:conversation.speaker, lines:spoken(choice.lines)};
      return {text:choice.text, goto:target, receptionChoice:choice.id};
    });
  }
  return {
    nodes,
    select(choice) {
      if (choices.some(entry => entry.id === choice?.receptionChoice)) selected = choice.receptionChoice;
    },
    choiceId:() => selected,
  };
}
