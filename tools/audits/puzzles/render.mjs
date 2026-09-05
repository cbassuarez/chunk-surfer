// The puzzles audit page.
//
// One card per thing, in two groups, because a puzzle and a microgame fail
// differently and a reader scanning for "what happens if they cannot do this"
// wants them apart. Within each group the order is the order of the night.
//
// Every card leads on the same four lines in the same order — asks, solved,
// fails, way through — so the page can be read down a column rather than card by
// card. The way through is last on purpose: it is the line the page exists for,
// and it is the one that goes red.
//
// Three more lines follow when an entry declares them: LEAVING, INPUTS and
// EXTRA WINDOWS. They are optional because they were added for the heating
// header and the other thirteen have not been walked yet — an absent line means
// nobody has answered the question, which is honest, and a wrong line would not
// be. Leaving is the one that matters most: a microgame that blocks input and
// cannot be escaped is a place a run can end, and the page could not say so
// until this field existed.

import { cite, escape, globalPanel, ordinal, pageShell, prose } from '../shared.mjs';

const GROUPS = [
  {
    id: 'puzzles',
    kind: 'puzzle',
    title: 'Puzzles',
    blurb: 'Things to work out. They wait for you, and the answer is the same however long you take — so the way through one is a hint.',
  },
  {
    id: 'microgames',
    kind: 'microgame',
    title: 'Microgames',
    blurb: 'Things to do, against a clock or a tolerance. Waiting does not help and sometimes hurts — so the way through one is a wider window.',
  },
];

function card(entry) {
  const live = entry.liveError
    ? `<p class="ident bad">Could not be read out of the game: <code>${escape(entry.liveError)}</code></p>`
    : `<table>${entry.live.map((row) => `<tr>
        <td class="key">${escape(row.label)}</td><td>${prose(row.value)}</td>
      </tr>`).join('')}</table>`;

  return `<section class="entry" id="${escape(entry.id)}"
    data-search="${escape(`${entry.id} ${entry.title} ${entry.room} ${entry.asks}`.toLowerCase())}">
    <header class="entry-head">
      <h3>${escape(entry.title)}</h3>
      <p class="dim">${escape(entry.room)}</p>
    </header>
    <table>
      <tr><td class="key">Asks</td><td>${prose(entry.asks)}</td></tr>
      <tr><td class="key">Solved</td><td>${prose(entry.solved)}</td></tr>
      <tr><td class="key">Failing costs</td><td>${prose(entry.fails)}</td></tr>
      <tr><td class="key">Way through</td><td>${entry.assist
        ? prose(entry.assist)
        : '<b class="bad">None declared.</b>'}</td></tr>
      <tr><td class="key">Opens</td><td>${prose(entry.gates)}</td></tr>
      ${entry.abandon ? `<tr><td class="key">Leaving</td><td>${prose(entry.abandon)}</td></tr>` : ''}
      ${entry.inputs ? `<tr><td class="key">Inputs</td><td>${prose(entry.inputs)}</td></tr>` : ''}
      ${entry.windows ? `<tr><td class="key">Extra windows</td><td>${prose(entry.windows)}</td></tr>` : ''}
    </table>
    <h4>Out of the game just now</h4>
    ${live}
    <p class="ident">Called <code>${escape(entry.id)}</code> here · covered by <code>${escape(entry.spec)}</code>${
      entry.covered ? '' : ' <b class="bad">which is not there</b>'}</p>
    ${cite(entry.where)}
  </section>`;
}

export function renderAudit(audit) {
  const { broken, unfinished } = audit.global;
  const groups = GROUPS.map((group) => ({ ...group, entries: audit.puzzles.filter((entry) => entry.kind === group.kind) }));

  const rail = groups.map((group) => `<div class="family"><h5>${escape(group.title)}</h5>${
    group.entries.map((entry, index) => `
      <a class="row" href="#${escape(entry.id)}" data-id="${escape(entry.id)}">
        <span class="ordinal">${ordinal(index)}</span>
        <span class="name">${escape(entry.title)}</span>
        ${entry.assist ? '' : '<span class="dot" title="no declared way through"></span>'}
      </a>`).join('')}</div>`).join('');

  return pageShell({
    id: 'puzzles',
    title: 'Every puzzle and microgame',
    mastTitle: 'Every puzzle and microgame',
    mastNote: `${audit.counts.all} of them, ${audit.counts.gating} gating something`,
    heading: 'Everything that is not a fight and not a walk.',
    deck: 'Fourteen discrete things to work out or to perform, written fourteen different ways across ten directories. '
      + 'What each one asks, what counts as done, what failing costs, and — the reason this page exists — '
      + 'what a player who cannot do it is offered instead.',
    filterPlaceholder: 'find a puzzle…',
    rail,
    roads: `<ul class="roads">${groups.map((group) =>
      `<li><b>${escape(group.title)}.</b> ${escape(group.blurb)}</li>`).join('')}</ul>`,
    statusRows: [
      `Puzzles <b>${audit.counts.puzzles}</b> · microgames <b>${audit.counts.microgames}</b>`,
      `Ways through ${unfinished.length ? `<b class="bad">${unfinished.length} missing</b>` : '<b>one for every gate</b>'}`,
    ],
    global: globalPanel({
      broken,
      unfinished,
      someBroken: 'Some of this no longer matches the code.',
      someUnfinished: 'It all matches the code. These have no declared way through.',
      allWell: 'Every one of them matches the code, and every one that opens something can be got past.',
    }),
    body: groups.map((group) => `<h2 class="group">${escape(group.title)}</h2>${group.entries.map(card).join('')}`).join(''),
  });
}
