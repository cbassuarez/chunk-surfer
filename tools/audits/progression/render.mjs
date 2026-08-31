// The progression audit page: what the player earns, spends, buys and fights
// with, in plain language.
//
// Four sections rather than one long list, because the four things answer to
// each other: pins are what achievements are not (a currency), skills are what
// pins buy, and weapons are what skills change.

import { cite, escape, globalPanel, ordinal, pageShell, prose } from '../shared.mjs';

const CATEGORY_NAMES = {
  work: 'The job',
  disclosures: 'What the building told you',
  method: 'How you worked',
  returns: 'Returns filed',
  craft: 'Craft',
};

const COUNTER_NAMES = {
  broadcast: 'a broadcast',
  conceal: 'a feint',
  overload: 'an overload',
  loop: 'a loop',
  silence: 'silence',
};

// The exact condition an achievement tests, as written. Arrow functions read
// tolerably once the wrapper is gone; anything longer is left alone rather than
// mangled.
function condition(source) {
  const body = String(source || '')
    .replace(/^\(?\s*\{?\s*([\w\s,:]*)\s*\}?\s*\)?\s*=>\s*/, '')
    .trim();
  return body && body.length < 220 ? body : String(source || '');
}

function achievementSection(audit) {
  const byCategory = new Map();
  for (const entry of audit.achievements) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
    byCategory.get(entry.category).push(entry);
  }
  const groups = [...byCategory.entries()].map(([category, entries]) => `
    <h4>${escape(CATEGORY_NAMES[category] || category)} <span class="count">${entries.length}</span></h4>
    <table>
      ${entries.map((entry) => `<tr>
        <td class="key">${escape(entry.name)}<br>
          <span class="dim">${entry.hidden ? 'hidden until earned' : 'shown from the start'}</span></td>
        <td>
          <p>${prose(entry.description)}</p>
          <p class="ident">Awarded on ${entry.events.map((event) => `<code>${escape(event)}</code>`).join(', ')}
            when <code>${escape(condition(entry.condition))}</code></p>
          <p class="ident">Called <code>${escape(entry.id)}</code> in the code</p>
          ${cite(entry.where)}
        </td>
      </tr>`).join('')}
    </table>`).join('');

  return `
  <section class="entry" id="achievements" data-search="achievements ${escape(audit.achievements.map((a) => `${a.name} ${a.description}`).join(' ').toLowerCase())}">
    <header class="entry-head">
      <span class="ordinal">01</span>
      <h2>Achievements</h2>
      <p class="ids">${audit.achievements.length} of them · ${audit.achievements.filter((a) => a.hidden).length} hidden</p>
      <p class="summary">What the game notices. Each one listens for a particular thing happening and then
        asks a question about the run — the question is printed under every row, because it is the only
        complete answer to what actually awards it.</p>
    </header>
    <div class="block">${groups}</div>
  </section>`;
}

function pinSection(audit) {
  return `
  <section class="entry" id="pins" data-search="pins calibration ${escape(audit.pins.map((p) => `${p.title} ${p.detail}`).join(' ').toLowerCase())}">
    <header class="entry-head">
      <span class="ordinal">02</span>
      <h2>Spare leads</h2>
      <p class="ids">${audit.limits.pinCeiling} in the world · a run can carry ${audit.limits.maxPins}</p>
      <p class="summary">Short patch cables, and every one of them is somebody else's. One end of each is captive in
        the recorder; these are the free ends. ${audit.limits.pinCeiling > audit.limits.maxPins
        ? `There are more in the building than a run can carry, so a player has to choose which ${audit.limits.maxPins} to go and get — and, because a lead can be pulled back out, choose again later.`
        : 'Every lead in the building fits in a run.'}</p>
    </header>
    <div class="block">
      <h3>Where they come from</h3>
      <ol class="gate">
        ${audit.pins.map((pin) => `<li>
          <div class="gate-head">
            <span class="gate-label">${escape(pin.title)}</span>
            <span class="tag">${escape(pin.kind)}</span>
          </div>
          ${pin.detail ? `<p>${prose(pin.detail)}</p>` : ''}
          <p class="ident">Recorded as <code>${escape(pin.id)}</code></p>
          ${cite(pin.where)}
        </li>`).join('')}
      </ol>
    </div>
  </section>`;
}

function skillSection(audit) {
  const branches = audit.skills.map((branch) => `
    <h4>${escape(branch.title)} <span class="count">${branch.rungs.length} sockets${branch.rungs.some((r) => r.requiresRig) ? ' · these sockets are on the bent rig' : ''}</span></h4>
    <table>
      ${branch.rungs.map((rung) => `<tr>
        <td class="key">${escape(rung.label)}<br>
          <span class="dim">${rung.depth === 1 ? 'one lead' : `${rung.depth} leads with the run above it`}</span></td>
        <td>
          <p>${prose(rung.detail)}</p>
          <div class="gate-head">
            <span class="tag">${escape(rung.requires ? 'in series' : 'patched direct')}</span>
            ${rung.special ? '<span class="tag owed">a special</span>' : ''}
            ${rung.grants ? `<span class="tag">gives you <b>${escape(rung.grants)}</b></span>` : ''}
            ${rung.requiresLabel ? `<span class="tag">after ${escape(rung.requiresLabel)}</span>` : ''}
          </div>
          ${cite(rung.where)}
        </td>
      </tr>`).join('')}
    </table>`).join('');

  return `
  <section class="entry" id="skills" data-search="skills techniques tree ${escape(audit.skills.flatMap((b) => b.rungs.map((r) => `${r.label} ${r.detail}`)).join(' ').toLowerCase())}">
    <header class="entry-head">
      <span class="ordinal">03</span>
      <h2>The patchbay</h2>
      <p class="ids">${audit.skills.reduce((n, b) => n + b.rungs.length, 0)} sockets · a run can carry ${audit.limits.maxTechniques} leads</p>
      <p class="summary">The back of the recorder. Each run of sockets is in series — the signal passes through the
        shallow one to reach the deep one, which is why you cannot start at the bottom — except where a socket has no
        prerequisite and takes a lead direct. The skills tab draws it as a grid, one column per run, so the order
        below is the order on screen.</p>
    </header>
    <div class="block">${branches}</div>
  </section>`;
}

function weaponSection(audit) {
  const tools = audit.weapons.map((tool) => `
    <h4>${escape(tool.title)} <span class="count">${tool.moves.length} move${tool.moves.length === 1 ? '' : 's'}</span></h4>
    <p class="lede">${prose(tool.note)} ${cite(tool.where)}</p>
    <table>
      ${tool.moves.map((move) => `<tr>
        <td class="key">${escape(move.label)}<br>
          <span class="dim">${move.regular ? 'a regular' : move.charge ? `${move.charge} charge` : 'free'}</span></td>
        <td>
          <p>${escape(move.detail)}</p>
          <div class="gate-head">
            ${move.counters.length ? `<span class="tag">answers ${move.counters.map((kind) => escape(COUNTER_NAMES[kind] || kind)).join(', ')}</span>` : ''}
            ${(() => {
              // A rung and the move it grants often share a name, and "bought
              // with WHITEOUT" under WHITEOUT says nothing.
              const buys = move.boughtWith.filter((label) => label !== move.label);
              if (move.boughtWith.length && !buys.length) return '<span class="tag">bought on its own branch</span>';
              return buys.length ? `<span class="tag">bought with ${buys.map(escape).join(', ')}</span>` : '';
            })()}
          </div>
          ${cite(move.where)}
        </td>
      </tr>`).join('')}
    </table>`).join('');

  return `
  <section class="entry" id="weapons" data-search="weapons tools moves ${escape(audit.weapons.flatMap((t) => t.moves.map((m) => `${m.label} ${m.detail}`)).join(' ').toLowerCase())}">
    <header class="entry-head">
      <span class="ordinal">04</span>
      <h2>Weapons</h2>
      <p class="ids">${audit.weapons.length} tools · ${audit.weapons.reduce((n, t) => n + t.moves.length, 0)} moves · ${audit.limits.baseCharge} charge to start</p>
      <p class="summary">Every move in the kit, with the game's own words for it — this is the line the player
        reads on the tile. Read with a full bag and the whole tree bought, which is not a run anybody plays;
        it is the only way to see all of it at once. Damage is a band, and where a hit lands inside it is
        earned per beat, so these numbers move.</p>
    </header>
    <div class="block">${tools}</div>
  </section>`;
}

export function renderAudit(audit) {
  const { broken, findings } = audit.global;
  const rail = `<div class="family"><h5>Sections</h5>${audit.sections.map((section, index) => `
    <a class="row" href="#${escape(section.id)}" data-id="${escape(section.id)}">
      <span class="ordinal">${ordinal(index)}</span>
      <span class="name">${escape(section.title)}</span>
      ${findings.some((f) => audit[section.id]?.some?.((entry) => entry.id === f.id))
        ? '<span class="dot" title="something here is not finished"></span>' : ''}
    </a>`).join('')}</div>`;

  return pageShell({
    id: 'progression',
    title: 'What the player earns',
    mastTitle: 'What the player earns',
    mastNote: 'achievements, pins, skills and weapons',
    heading: 'What the player earns, spends, and fights with.',
    deck: 'Four things that answer to each other: what the game notices, the one currency it pays in, '
      + 'what that currency buys, and what those purchases change. Read from the game just now.',
    filterPlaceholder: 'find a section…',
    rail,
    roads: `<ul class="roads">${audit.sections.map((section) =>
      `<li><b>${escape(section.title)}.</b> ${escape(section.blurb)}</li>`).join('')}</ul>`,
    statusRows: [
      `Descriptions ${broken.length ? `<b class="bad">${broken.length} wrong</b>` : '<b>all match the code</b>'}`,
      `Not finished ${findings.length ? `<b class="bad">${findings.length}</b>` : '<b>nothing</b>'}`,
    ],
    global: globalPanel({
      broken,
      unfinished: findings,
      someBroken: 'Some of this no longer matches the code.',
      someUnfinished: 'It all matches the code. These parts are not finished yet.',
      allWell: 'Everything matches the code, and nothing is outstanding.',
    }),
    body: [achievementSection(audit), pinSection(audit), skillSection(audit), weaponSection(audit)].join(''),
  });
}
