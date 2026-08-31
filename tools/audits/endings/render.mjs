// The endings audit page: nine endings, in plain language.
//
// Everything the game has a technical name for gets said in ordinary words
// here, with the code name kept beside it in small type for anyone who needs to
// go and find it. The chrome, the studio links and the citations are shared with
// every other audit — see ../shared.mjs.

import { cite, escape, globalPanel, ordinal, pageShell, prose, studioLink } from '../shared.mjs';

const seconds = (value) => (Number.isInteger(value) ? `${value}s` : `${Number(value).toFixed(1)}s`);
// Words for things the code only has ids for.
const ARRIVAL_NAMES = {
  agreed: 'You agreed to it',
  defeated: 'You were beaten',
  'timed-out': 'You ran out of time',
  escaped: 'You got out',
  carried: 'You carried somebody out',
};

const EVENT_NAMES = {
  lens: 'the look changes',
  possess: 'the world comes apart',
  circuit: 'lights go out',
  torch: 'your torch',
  shake: 'the ground shakes',
  flash: 'a flash',
  hush: 'the Surfer',
  cue: 'a sound plays',
  vigil: 'the crowd outside',
  say: 'somebody speaks',
};

const HUSH_NAMES = {
  staged: 'standing where you can see him',
  gone: 'not there any more',
  silent: 'silent',
  open: 'the channel is open',
  terminal: 'he finishes it',
  severed: 'cut off from the bells',
};

const COMPANION_NAMES = {
  carried: 'you are carrying him',
  lost: 'he is lost along with you',
};

const OBJECTIVE_NAMES = { walk: 'a walk', carry: 'a carry', escape: 'a run for the exit' };

// The lines inside a piece of writing carry conditions, written as code. Say
// them the way a person would, keeping the exact text in the tooltip.
const CONDITION_WORDS = [
  ['arrival.agreed', 'you agreed to it'],
  ['arrival.defeated', 'you were beaten'],
  ['arrival.timedOut', 'you ran out of time'],
  ['coffee', 'you drank the coffee'],
  ['equipment.complete', 'you still have all your kit'],
  ['takes.full', 'you made every recording'],
  ['takes.contaminated', 'recordings ruined'],
  ['untouched', 'you were never hurt'],
  ['injuries', 'times hurt'],
  ['confession.nothing', 'you told it nothing'],
  ['confession.said.sarah', 'you said Sarah'],
  ['confession.said.named', 'you gave it a name'],
  ['confession.said.nobody', 'you said there was nobody'],
  ['confession.said.denied', 'you denied there was anything'],
  ['confession.said.money', 'you said it was the money'],
  ['confession.said.craft', 'you said it was the work'],
  ['confession.said.procedure', 'you said it was procedure'],
  ['confession.said.superstition', 'you called it superstition'],
  ['confession.spoken', 'you told it something'],
  ['confession.sarah', 'you told it about Sarah'],
  ['confession.said.', 'you said '],
  ['reference.saturated', 'you looked things up constantly'],
  ['source.entered', 'you went into Source'],
  ['source.rescue', 'you got the other recordist out of Source'],
  ['source.traces', 'traces left in Source'],
  ['hush.contacts', 'times the Surfer reached you'],
  ['dock.spent', 'you spent time on the dock'],
  ['door.searched', 'you searched the grey door'],
];

function readTerm(term) {
  const negated = term.startsWith('!');
  let text = (negated ? term.slice(1) : term).replace(/^ending\./, '');
  for (const [code, words] of CONDITION_WORDS) {
    if (text.startsWith(code)) { text = words + text.slice(code.length); break; }
  }
  text = text
    .replace(/>=\s*/g, ' at least ')
    .replace(/<=\s*/g, ' at most ')
    .replace(/==\s*/g, ' is ')
    .replace(/>\s*/g, ' more than ')
    .replace(/<\s*/g, ' fewer than ')
    .replaceAll('.', ' ');
  return `${negated ? 'not: ' : ''}${text}`.replace(/\s+/g, ' ').trim();
}

const readCondition = (expression) => expression
  .split(/\s*&&\s*/).map((clause) => clause.split(/\s*\|\|\s*/).map(readTerm).join(', or '))
  .join(', and ');

const conditionChips = (conditions) => conditions.length
  ? `<div class="chips">${conditions.map((condition) => `<span title="${escape(condition)}">${escape(readCondition(condition))}</span>`).join('')}</div>`
  : '<p class="none">Nothing in here changes. Every player hears the same thing.</p>';

function timeline(model, title) {
  if (!model.count) return '';
  const rows = model.steps.map((step) => {
    const detail = [
      step.kind === 'circuit' ? `circuit ${escape(step.value)} ${step.on === false ? 'off' : 'on'}` : '',
      step.kind === 'torch' ? (step.on === false ? 'taken from you' : 'back on') : '',
      (step.kind === 'lens' || step.kind === 'possess' || step.kind === 'cue' || step.kind === 'hush') && step.value
        ? `<code>${escape(step.value)}</code>` : '',
      step.amount != null ? `strength ${escape(step.amount)}` : '',
      step.ms != null ? `${escape(step.ms)}ms` : '',
      step.action ? escape(String(step.action).replaceAll('-', ' ')) : '',
      step.cluster ? `<span class="dim">${escape(step.cluster)}</span>` : '',
      step.who ? `<b>${escape(step.who)}</b>` : '',
      step.text ? `<span class="said">${escape(step.text)}</span>` : '',
    ].filter(Boolean).join(' · ');
    return `<tr><td class="num">${seconds(step.at)}</td><td class="kind">${escape(EVENT_NAMES[step.kind] || step.kind)}</td><td>${detail}</td></tr>`;
  }).join('');
  return `
    <h4>${escape(title)} <span class="count">${model.count} things happen, over ${seconds(model.seconds)}</span></h4>
    <table class="timeline">${rows}</table>`;
}

function conditions(entries, kind, titles) {
  if (!entries.length) {
    return `<p class="none">${kind === 'requires' ? 'Nothing is required.' : 'Nothing takes this ending away.'}</p>`;
  }
  return `<ol class="gate ${kind}">${entries.map((entry) => `
    <li>
      <div class="gate-head">
        <span class="gate-label">${escape(entry.label)}</span>
        ${entry.to
          ? `<span class="tag divert">you get ${escape(titles[entry.to] || entry.to)}</span>`
          : `<span class="tag">${escape(entry.kind)}</span>`}
      </div>
      <p>${prose(entry.detail)}</p>
      ${entry.identifier ? `<p class="ident">called <code>${escape(entry.identifier)}</code> in the code</p>` : ''}
      ${cite(entry.where)}
    </li>`).join('')}</ol>`;
}

function beats(entries) {
  if (!entries.length) return '';
  const rows = entries.map((beat) => {
    const when = beat.trigger === 'time' ? `${(beat.atMs / 1000).toFixed(1)}s in`
      : beat.trigger === 'position' ? `when you reach ${escape(beat.anchor)}`
        : beat.trigger === 'interaction' ? `when you ${escape(String(beat.action).replaceAll('-', ' '))}` : escape(beat.trigger);
    const does = [
      beat.effect ? escape(String(beat.effect).replaceAll('-', ' ')) : '',
      beat.cue ? `plays <code>${escape(beat.cue)}</code>` : '',
      beat.worldLook ? `light becomes <code>${escape(beat.worldLook)}</code>` : '',
      beat.cameraScale ? `camera pulls back ×${escape(beat.cameraScale)}` : '',
      beat.optionalAction ? `you may ${escape(String(beat.optionalAction).replaceAll('-', ' '))}` : '',
    ].filter(Boolean).join(' · ');
    const dialogue = beat.dialogue.map((line) => studioLink(line.documentId, {
      node: line.node || '', line: line.lineId, missing: line.missing, label: line.lineId,
    })).join(' ');
    return `<tr>
      <td class="kind">${escape(String(beat.id).replaceAll('-', ' '))}</td>
      <td class="num">${when}</td>
      <td>${does || '<span class="dim">—</span>'}</td>
      <td>${dialogue || '<span class="dim">—</span>'}</td>
    </tr>`;
  }).join('');
  return `<h4>The scene, beat by beat</h4>
    <table class="beats">
    <thead><tr><th>beat</th><th>when</th><th>what happens</th><th>the line it says</th></tr></thead>
    ${rows}</table>`;
}

function section(ending, index, titles) {
  const arrivals = ending.arrivals.map((entry) => `
    <tr>
      <td class="key">${escape(ARRIVAL_NAMES[entry.arrival] || entry.arrival)}</td>
      <td>
        <p>${prose(entry.how)}</p>
        ${entry.passage ? `<p class="passage">A short scene plays first: ${studioLink(entry.passage)}</p>` : ''}
        ${cite(entry.where)}
      </td>
    </tr>`).join('');

  const pace = ending.objective?.pace
    ? ` · ${Math.round((1 / ending.objective.pace) * 100 - 100)}% slower than walking`
    : '';
  const objective = ending.objective ? `
    <h4>What you do first <span class="count">${escape(OBJECTIVE_NAMES[ending.objective.kind] || ending.objective.kind)}${ending.objective.label ? ` to the ${escape(ending.objective.label)}` : ''}${pace}</span></h4>
    ${timeline(ending.objective.timeline, 'While you are still walking')}`
    : '<h4>What you do first <span class="count">nothing — the ending starts talking straight away</span></h4>';

  return `
  <section class="entry" id="${escape(ending.id)}" data-search="${escape(`${ending.id} ${ending.title} ${ending.family.title} ${ending.summary}`.toLowerCase())}">
    <header class="entry-head">
      <span class="ordinal">${ordinal(index)}</span>
      <h2>${escape(ending.title)}</h2>
      <p class="ids">${escape(ending.family.title)} · called <code>${escape(ending.id)}</code> in the code</p>
      <p class="summary">${prose(ending.summary)}</p>
    </header>

    ${ending.findings.length ? `<div class="findings"><h4>Not finished</h4><ul>${ending.findings.map((text) => `<li>${prose(text)}</li>`).join('')}</ul></div>` : ''}

    <div class="block">
      <h3>How you get here</h3>
      <p class="lede">Every way the game can hand a player this ending.</p>
      <table class="arrivals">${arrivals}</table>
    </div>

    <div class="block two">
      <div>
        <h3>What you need</h3>
        ${conditions(ending.requires, 'requires', titles)}
      </div>
      <div>
        <h3>What stops it</h3>
        ${conditions(ending.blocks, 'blocks', titles)}
      </div>
    </div>

    <div class="block">
      <h3>The writing</h3>
      <p class="lede">Everything this ending says. Each one opens in the studio, ready to edit.</p>
      <table class="docs">
        <tr>
          <td class="key">The ending itself</td>
          <td>
            ${studioLink(ending.tree.id, { node: ending.tree.entry, missing: ending.tree.missing })}
            <span class="count">${ending.tree.lines} lines${ending.tree.choices ? `, ${ending.tree.choices} things you can say back` : ''}${ending.tree.nodes > 1 ? `, in ${ending.tree.nodes} parts` : ''}</span>
            <p class="ident">Lines only some players hear, and what decides them:</p>
            ${conditionChips(ending.tree.conditions || [])}
          </td>
        </tr>
        ${ending.passages.map((entry) => `<tr>
          <td class="key">Plays first<br><span class="dim">if ${escape((ARRIVAL_NAMES[entry.arrival] || entry.arrival).toLowerCase())}</span></td>
          <td>${studioLink(entry.document.id, { node: entry.document.entry, missing: entry.document.missing })}
            <span class="count">${entry.document.lines} lines</span></td>
        </tr>`).join('')}
        ${ending.codas.map((entry) => `<tr>
          <td class="key">The last page${entry.when ? `<br><span class="dim">if you ${escape(entry.when)}</span>` : ''}</td>
          <td>${studioLink(entry.document.id, { node: entry.document.entry, missing: entry.document.missing })}
            <span class="count">${entry.document.lines} lines</span></td>
        </tr>`).join('')}
      </table>
      ${beats(ending.beats)}
    </div>

    <div class="block">
      <h3>How it plays</h3>
      <table class="facts">
        <tr><td class="key">Last thing you see</td><td class="said">${escape(ending.image)}<span class="dim"> · held ${((ending.cutscene?.finalHold?.ms || 0) / 1000).toFixed(1)}s</span></td></tr>
        <tr><td class="key">The Surfer</td><td>${escape(HUSH_NAMES[ending.hush] || ending.hush)}</td></tr>
        <tr><td class="key">The other recordist</td><td>${ending.companion ? escape(COMPANION_NAMES[ending.companion] || ending.companion) : '<span class="dim">not in this one</span>'}</td></tr>
        <tr><td class="key">Camera</td><td>${escape(String(ending.cutscene?.camera?.treatment || '—').replaceAll('-', ' '))} <span class="dim">· ${ending.cutscene?.camera?.allowsLook ? 'you can still look around' : 'you cannot look around'}</span></td></tr>
        <tr><td class="key">If motion is reduced</td><td>${escape(String(ending.cutscene?.reducedMotion?.treatment || '—').replaceAll('-', ' '))}</td></tr>
        <tr><td class="key">Music</td><td>${ending.audio.placeholder
          ? '<span class="tag owed">not written yet</span> <span class="dim">still using the opening title theme</span>'
          : `<code>${escape(ending.audio.bed)}</code>`}</td></tr>
        ${ending.audio.todo.length ? `<tr><td class="key">Sound still to make</td><td>${ending.audio.todo.map((entry) => `<p><b>${escape(entry.kind === 'bed' ? 'Music' : 'One sound')}</b>, ${escape(entry.seconds)} seconds<br><span class="said">${escape(entry.note)}</span></p>`).join('')}</td></tr>` : ''}
      </table>
      ${objective}
      ${timeline(ending.environment, 'While the ending is talking')}
    </div>

    <div class="block">
      <h3>What happens after</h3>
      <table class="facts">
        <tr><td class="key">Filed away</td><td>${ending.archive ? `${escape(ending.archive.title)} <span class="dim">— written by ${escape(ending.archive.filedBy)}, and read in the archive on a later run</span>` : '<span class="tag owed">nothing written yet</span>'}</td></tr>
        <tr><td class="key">Unlocks</td><td>${ending.unlock ? Object.entries(ending.unlock).map(([key, value]) => `${escape(String(key).replace(/([A-Z])/g, ' $1').toLowerCase())}: <code>${escape(value)}</code>`).join(' · ') : '<span class="dim">nothing</span>'}</td></tr>
        <tr><td class="key">Told to try next</td><td class="said">${escape(ending.hint || '—')}</td></tr>
      </table>
    </div>
  </section>`;
}

export function renderAudit(audit) {
  const titles = Object.fromEntries(audit.endings.map((ending) => [ending.id, ending.title]));
  const unfinished = audit.global.findings;
  const broken = [...audit.global.contract, ...audit.global.gates];
  const rail = audit.families.map((family) => {
    const rows = audit.endings.filter((ending) => ending.family.id === family.id).map((ending) => `
      <a class="row" href="#${escape(ending.id)}" data-id="${escape(ending.id)}">
        <span class="ordinal">${ordinal(audit.endings.indexOf(ending))}</span>
        <span class="name">${escape(ending.title)}</span>
        ${ending.findings.length ? '<span class="dot" title="something here is not finished"></span>' : ''}
      </a>`).join('');
    return `<div class="family"><h5>${escape(family.title)}</h5>${rows}</div>`;
  }).join('');

  return pageShell({
    id: 'endings',
    title: 'Every ending',
    mastTitle: 'Every ending',
    mastNote: `${audit.endings.length} of them, and how to reach each one`,
    heading: 'Every way this game can end.',
    deck: `All ${audit.endings.length} endings: how a player gets each one, what they need, what takes it away, `
      + 'and every line it says — each one a click from the studio. Read from the game just now.',
    filterPlaceholder: 'find an ending…',
    rail,
    roads: `<ul class="roads">${audit.families.map((family) =>
      `<li><b>${escape(family.title)}.</b> ${escape(family.reached)}</li>`).join('')}</ul>`,
    statusRows: [
      `Descriptions ${broken.length ? `<b class="bad">${broken.length} wrong</b>` : '<b>all match the code</b>'}`,
      `Not finished ${unfinished.length ? `<b class="bad">${unfinished.length}</b>` : '<b>nothing</b>'}`,
    ],
    global: globalPanel({
      broken,
      unfinished,
      someBroken: 'Some of the descriptions below no longer match the code.',
      someUnfinished: 'The descriptions all match the code. These parts are not finished yet.',
      allWell: 'Everything matches the code, and nothing is outstanding.',
    }),
    body: audit.endings.map((ending, index) => section(ending, index, titles)).join(''),
  });
}
