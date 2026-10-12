// The source space path page.
//
// Two views of the same walk. The diagram at the top is the whole path at once,
// to scale, with its forks — the thing nobody can see from any one file. Below
// it, one card per stage in walking order, down a line coloured by the road it
// is on, so the page reads like the walk does: top to bottom, splitting where
// the road splits.
//
// Every card leads on the same three lines in the same order — where, what
// happens, how you move on — and puts the callouts (no way back, locked until,
// saved here) above them, because those are what a reader scanning the path is
// looking for.

import { cite, escape, globalPanel, ordinal, pageShell, prose } from '../shared.mjs';

const CALLOUT = Object.freeze({
  'no-return': 'No way back',
  'can-return': 'You can go back',
  gate: 'Locked until',
  fork: 'The road forks',
  saves: 'Saved here',
  note: 'Worth knowing',
});

const ROAD_TITLE = Object.freeze({ contact: 'Contact', chapel: 'The chapel', tower: 'The tower' });

const EXTRA_STYLES = `
:root{--sp-shared:#191713;--sp-away:#5b5245;--sp-contact:#9a3412;--sp-tower:#4d6a2a;--sp-chapel:#1c4f6b}
@media (prefers-color-scheme:dark){:root{--sp-shared:#e6e1d6;--sp-away:#a9a294;--sp-contact:#e08a5a;--sp-tower:#a9c27a;--sp-chapel:#7fb6d1}}
.lane-shared{--lane:var(--sp-shared)}.lane-away{--lane:var(--sp-away)}.lane-contact{--lane:var(--sp-contact)}
.lane-tower{--lane:var(--sp-tower)}.lane-chapel{--lane:var(--sp-chapel)}
.sp-figure{margin:0 0 2.6rem}
.sp-figure h3{max-width:74ch}
.sp-scroll{overflow-x:auto;padding:.6rem 0 .2rem;border-bottom:1px solid var(--rule)}
.sp-strip{display:block}
.sp-strip text{font-family:var(--serif);font-size:12px;fill:var(--ink)}
.sp-strip text.small{font-family:var(--mono);font-size:9.5px;fill:var(--dim)}
.sp-strip .seg{stroke:var(--lane);stroke-width:7}
.sp-strip .dot{fill:var(--paper);stroke:var(--lane);stroke-width:2.5}
.sp-strip .joint{fill:none;stroke:var(--lane);stroke-width:2}
.sp-strip .cut{fill:none;stroke:var(--lane);stroke-width:2;stroke-dasharray:5 5}
.sp-strip .fork{stroke:var(--rule-hard);stroke-width:1;stroke-dasharray:2 3}
.sp-strip .end{fill:var(--lane)}
.sp-strip a:hover text{text-decoration:underline}
.sp-caption{font-size:.85rem;color:var(--dim);margin:.55rem 0 0;max-width:74ch}
.sp-legend{display:flex;flex-wrap:wrap;gap:.3rem 1.1rem;margin:.5rem 0 0;font-size:.83rem;color:var(--dim)}
.sp-legend span::before{content:'';display:inline-block;width:1.4rem;height:4px;margin-right:.4rem;vertical-align:middle;background:var(--lane)}
h2.group{max-width:74ch;margin:3.2rem 0 .2rem;padding-top:.7rem;border-top:2px solid var(--ink);font-family:var(--mono);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);font-weight:500}
p.group-blurb{max-width:74ch;margin:0 0 .6rem;color:var(--dim);font-size:.95rem}
section.entry.sp{position:relative;padding:1.8rem 0 2rem 1.7rem;border-top:0;border-left:3px solid var(--lane)}
section.entry.sp::before{content:'';position:absolute;left:-9px;top:2.35rem;width:11px;height:11px;border-radius:50%;background:var(--paper);border:2.5px solid var(--lane)}
section.entry.sp.moment::before{border-radius:1px;transform:rotate(45deg)}
.sp-lane{font-family:var(--mono);font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--lane)}
.sp-callouts{list-style:none;margin:0 0 1.3rem;padding:0;display:grid;gap:.45rem}
.sp-callouts li{padding:.45rem .75rem;background:var(--panel);border-left:3px solid var(--rule-hard);font-size:.93rem}
.sp-callouts li b{display:block;font-family:var(--mono);font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);font-weight:500;margin-bottom:.1rem}
.sp-callouts li.no-return{border-left-color:var(--sp-contact)}.sp-callouts li.no-return b{color:var(--sp-contact)}
.sp-callouts li.gate{border-left-color:var(--sp-tower)}
.sp-callouts li.can-return{border-left-color:var(--sp-chapel)}
.sp-callouts li.fork{border-left-color:var(--ink)}
.sp-next a{text-decoration:none;border-bottom:1px solid currentColor}
.sp-next li{margin:.1rem 0}
.sp-next .when{color:var(--dim)}
.sp-next ul{margin:0;padding-left:1rem}
.sp-cites{display:grid;gap:.25rem;margin:.6rem 0 0}
.sp-cites div{font-size:.85rem;color:var(--dim)}
.bad{color:var(--flag)}
`;

// ── the diagram ─────────────────────────────────────────────────────────────

function diagram(audit) {
  const { segments, forks, towerCut, contactFrom, ends, total, moment } = audit.strip;
  const PX = 0.58, LEFT = 18, RIGHT = 230;
  const Y = { tower: 62, shared: 150, contact: 238 };
  const W = Math.ceil(LEFT + total * PX + RIGHT), H = 290;
  const x = (value) => (LEFT + value * PX).toFixed(1);
  const title = Object.fromEntries(audit.stages.map((stage) => [stage.id, stage.title]));
  // LABELS GO WHERE THERE IS ROOM. Short stages sit a few pixels apart, so a
  // fixed above/below alternation still collides; each label takes the first
  // height on its row where nothing else is written across the same span.
  const LEVELS = { shared: [-14, 28, -30, 44], tower: [-14, -30, 24], contact: [24, 40] };
  const placed = [];
  // Nothing below the spine may sit on the curve the Contact road drops down.
  for (const level of [28, 44]) placed.push({ row: 'shared', level, a: +x(contactFrom) - 6, b: +x(contactFrom) + 34 });
  const label = (segment, mid) => {
    const width = segment.title.length * 6.4 + 12;
    const a = +x(mid) - width / 2, b = +x(mid) + width / 2;
    const levels = LEVELS[segment.row];
    const level = levels.find((dy) => !placed.some((box) => box.row === segment.row && box.level === dy && box.a < b && a < box.b)) ?? levels.at(-1);
    placed.push({ row: segment.row, level, a, b });
    return level;
  };

  const drawn = segments.map((segment) => {
    const y = Y[segment.row];
    const mid = (segment.x0 + segment.x1) / 2;
    const dy = label(segment, mid);
    const mark = segment.moment
      ? `<circle class="dot" cx="${x(mid)}" cy="${y}" r="6.5"/>`
      : `<line class="seg" x1="${x(segment.x0)}" y1="${y}" x2="${x(segment.x1)}" y2="${y}"/>`;
    return `<a href="#${escape(segment.id)}" class="lane-${escape(segment.lane)}"><title>${escape(title[segment.id])}</title>${mark}
      <text x="${x(mid)}" y="${y + dy}" text-anchor="middle">${escape(segment.title)}</text></a>`;
  }).join('');

  const contactStart = segments.find((segment) => segment.id === 'contact');
  const contactJoint = `<path class="joint lane-contact" d="M${x(contactFrom)} ${Y.shared} C${x(contactFrom + 18)} ${Y.shared}, ${x(contactFrom)} ${Y.contact}, ${x(contactStart.x0 + moment / 2 - 6)} ${Y.contact}"/>`;
  const towerJoint = `<path class="joint lane-tower" d="M${x(towerCut.x0)} ${Y.shared} C${x(towerCut.x0 + 24)} ${Y.shared}, ${x(towerCut.x0)} ${Y.tower}, ${x(towerCut.x0 + 44)} ${Y.tower}"/>
    <line class="cut lane-tower" x1="${x(towerCut.x0 + 44)}" y1="${Y.tower}" x2="${x(towerCut.x1)}" y2="${Y.tower}"/>
    <text class="small" x="${x(towerCut.x0 + 70)}" y="${Y.tower + 16}">the path the bust cuts, beside the tape</text>`;

  const forkMarks = forks.map((fork) => `<line class="fork" x1="${x(fork.x)}" y1="${Y.tower - 40}" x2="${x(fork.x)}" y2="${Y.contact + 44}"/>
    <text class="small" x="${x(fork.x) - 4}" y="${Y.contact + 40}" text-anchor="end">${escape(fork.label)}</text>`).join('');

  const endMarks = ends.map((end) => {
    const y = Y[end.row];
    const href = end.endings.length ? `http://127.0.0.1:${audit.ports.endings}/#${encodeURIComponent(end.endings[0])}` : '#';
    return `<a href="${escape(href)}" class="lane-${escape(end.family)}"><title>${escape(`${ROAD_TITLE[end.family] || end.family}: ${end.endings.join(', ')}`)}</title>
      <path class="end" d="M${x(end.x) * 1 + 4} ${y - 7} l10 7 l-10 7 z"/>
      <text x="${x(end.x) * 1 + 20}" y="${y + 4}">${escape(ROAD_TITLE[end.family] || end.family)} · ${end.endings.length} ${end.endings.length === 1 ? 'ending' : 'endings'}</text></a>`;
  }).join('');

  return `<figure class="sp-figure">
    <h3>The whole walk, to scale</h3>
    <div class="sp-scroll">
      <svg class="sp-strip" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="The source space path as a diagram">
        ${forkMarks}${contactJoint}${towerJoint}${drawn}${endMarks}
      </svg>
    </div>
    <div class="sp-legend">${['shared', 'away', 'contact', 'tower', 'chapel'].map((lane) => `<span class="lane-${lane}">${escape(audit.lanes[lane])}</span>`).join('')}</div>
    <p class="sp-caption">Distances are to scale at ${audit.cell} m a cell. A dot is a moment rather than a distance and is drawn a fixed width.
      Click any part to go to its card; click a road’s end to go to its endings.</p>
  </figure>`;
}

// ── the cards ───────────────────────────────────────────────────────────────

function nextList(stage, audit) {
  const titles = Object.fromEntries(audit.stages.map((entry) => [entry.id, entry.title]));
  return `<div class="sp-next"><ul>${stage.next.map((next) => {
    if (next.to.startsWith('ending:')) {
      const family = next.to.slice('ending:'.length);
      return `<li>${escape(ROAD_TITLE[family] || family)} endings <span class="when">— ${escape(next.when)}</span></li>`;
    }
    const kind = next.back ? ' (back)' : next.branch ? ' (a branch)' : '';
    return `<li><a href="#${escape(next.to)}">${escape(titles[next.to] || next.to)}</a>${escape(kind)} <span class="when">— ${escape(next.when)}</span></li>`;
  }).join('')}</ul></div>`;
}

function card(stage, index, audit) {
  const callouts = stage.callouts.length
    ? `<ul class="sp-callouts">${stage.callouts.map((callout) => `<li class="${escape(callout.kind)}"><b>${escape(CALLOUT[callout.kind] || callout.kind)}</b>${prose(callout.text)}</li>`).join('')}</ul>`
    : '';
  const endings = stage.endings.length
    ? `<tr><td class="key">Endings on this road</td><td>${stage.endings.map((ending) => `<a class="doc" href="http://127.0.0.1:${audit.ports.endings}/#${encodeURIComponent(ending.id)}">${escape(ending.id)}</a>`).join(' · ')}</td></tr>`
    : '';
  const puzzles = stage.puzzleLinks.length
    ? `<tr><td class="key">Puzzles here</td><td>${stage.puzzleLinks.map((puzzle) => `<a class="doc" href="http://127.0.0.1:${audit.ports.puzzles}/#${encodeURIComponent(puzzle.id)}">${escape(puzzle.title)}</a>`).join(' · ')}</td></tr>`
    : '';
  const notes = stage.notes.length
    ? `<tr><td class="key">The recorder says</td><td>${stage.notes.map((note) => `<span class="said">“${escape(note.text)}”</span>`).join('<br>')}</td></tr>`
    : '';
  const live = stage.measureError
    ? `<p class="ident bad">Could not be read out of the game: <code>${escape(stage.measureError)}</code></p>`
    : stage.rows.length
      ? `<h4>Out of the game just now</h4><table>${stage.rows.map((row) => `<tr><td class="key">${escape(row.label)}</td><td>${prose(row.value)}</td></tr>`).join('')}</table>`
      : '';
  const codeNames = [
    `phase ${stage.phases.map((phase) => `<code>${escape(phase)}</code>`).join(', ')}`,
    `finale stage ${stage.finale.map((value) => `<code>${escape(value)}</code>`).join(', ')}`,
    ...(stage.checkpoints.length ? [`saved as ${stage.checkpoints.map((id) => `<code>${escape(id)}</code>`).join(', ')}`] : []),
  ].join(' · ');
  const jumps = stage.jumps.length
    ? stage.jumps.map((jump) => `<code>${escape(jump.call)}</code>${jump.present ? '' : ' <b class="bad">no longer there</b>'}`).join(' · ')
    : '<span class="dim">no shortcut yet</span>';
  const specs = stage.specs.map((spec) => `<code>${escape(spec.path)}</code>${spec.present ? '' : ' <b class="bad">which is not there</b>'}`).join(' · ');
  const search = `${stage.id} ${stage.title} ${stage.where} ${stage.happens} ${stage.section}`.toLowerCase();

  return `<section class="entry sp lane-${escape(stage.lane)}${stage.length > 0 ? '' : ' moment'}" id="${escape(stage.id)}" data-search="${escape(search)}">
    <header class="entry-head">
      <span class="ordinal">${ordinal(index)} · <span class="sp-lane">${escape(audit.lanes[stage.lane])}</span></span>
      <h2>${escape(stage.title)}</h2>
      <p class="ids">${stage.length > 0 ? `${escape(stage.rows.find((row) => row.label === 'Length')?.value || '')} · ` : 'A moment, not a distance · '}called <code>${escape(stage.id)}</code> here</p>
    </header>
    ${callouts}
    <table>
      <tr><td class="key">Where</td><td>${prose(stage.where)}</td></tr>
      <tr><td class="key">What happens</td><td>${prose(stage.happens)}</td></tr>
      <tr><td class="key">How you move on</td><td>${prose(stage.moveOn)}</td></tr>
      <tr><td class="key">Goes on to</td><td>${nextList(stage, audit)}</td></tr>
      ${endings}${puzzles}${notes}
    </table>
    ${live}
    <p class="ident">In the code: ${codeNames}</p>
    <p class="ident">Jump straight here: ${jumps}</p>
    <p class="ident">Tested by ${specs}</p>
    <div class="sp-cites">${stage.cites.map((entry) => `<div>${escape(entry.label)}: ${cite(entry.where)}</div>`).join('')}</div>
  </section>`;
}

export function renderAudit(audit) {
  const { broken, unfinished } = audit.global;
  const indexOf = new Map(audit.stages.map((stage, index) => [stage.id, index]));
  const rail = audit.sections.map((section) => `<div class="family"><h5>${escape(section.title)}</h5>${
    audit.stages.filter((stage) => stage.section === section.id).map((stage) => `
      <a class="row" href="#${escape(stage.id)}" data-id="${escape(stage.id)}">
        <span class="ordinal">${ordinal(indexOf.get(stage.id))}</span>
        <span class="name">${escape(stage.title)}</span>
        ${stage.problems.length ? '<span class="dot" title="this stage no longer matches the code"></span>' : ''}
      </a>`).join('')}</div>`).join('');

  const body = audit.sections.map((section) => {
    const stages = audit.stages.filter((stage) => stage.section === section.id);
    return `<h2 class="group">${escape(section.title)}</h2><p class="group-blurb">${escape(section.blurb)}</p>${
      stages.map((stage) => card(stage, indexOf.get(stage.id), audit)).join('')}`;
  }).join('');

  return pageShell({
    id: 'source-path',
    title: 'The source space path',
    mastTitle: 'The source space path',
    mastNote: `${audit.counts.stages} stages, ${audit.counts.forks} forks, ${audit.counts.roads} roads`,
    heading: 'The walk through source space, start to finish.',
    deck: 'Every stage from the long hall to the three doors out: where it is, what happens there, what moves you on, '
      + 'and where the road forks. Read from the game just now, and every stage is a click from the code that runs it.',
    filterPlaceholder: 'find a stage…',
    rail,
    roads: `${diagram(audit)}<ul class="roads">${audit.roads.map((road) =>
      `<li><b>${escape(road.title)}.</b> ${escape(road.reached)} <a href="#${escape(road.stage || '')}">${road.endings.length} ${road.endings.length === 1 ? 'ending' : 'endings'}</a></li>`).join('')}</ul>`,
    statusRows: [
      `Stages <b>${audit.counts.stages}</b> · endings reached <b>${audit.counts.endings}</b>`,
      `Matches the code ${broken.length ? `<b class="bad">${broken.length} wrong</b>` : '<b>yes</b>'}`,
      `Shortcuts missing ${unfinished.length ? `<b class="bad">${unfinished.length}</b>` : '<b>none</b>'}`,
    ],
    global: globalPanel({
      broken,
      unfinished,
      someBroken: 'Some of the path no longer matches the code.',
      someUnfinished: 'The whole path matches the code. These are not finished.',
      allWell: 'The whole path matches the code, every phase and recorder note is on it, and nothing is outstanding.',
    }),
    extraStyles: EXTRA_STYLES,
    body,
  });
}
