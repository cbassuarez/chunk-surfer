// The parent verifier stages the optional doorway. All movement below uses the
// ordinary keyboard scheduler and the actual renderer/audio scene.
export async function reviewValleyMusic({
  check, shot, hold, press, sleep, lookWorld, snapshot, waitFor, walkHome, report, entryYaw,
}) {
  const evidence = { trail: [] };
  report.valleyMusic = evidence;
  const settled = (cell, phrase) => waitFor(state => state.music?.cell === cell
    && state.music?.playing && !state.music.held && !state.music.pending
    && (phrase == null || state.music.phrase === phrase), 26000, 'settled local score at ' + cell);
  const walk = async (points) => {
    for (const [x, z, radius] of points) await walkHome({ x, z }, entryYaw, radius);
  };
  async function note(name, state) {
    const row = { name, elapsedMs: Date.now() - startedAt, position: state.realm.frame?.pose ?? null, music: state.music };
    evidence.trail.push(row);
    console.log('VALLEY MUSIC', name, JSON.stringify({
      cell: row.music?.cell, phrase: row.music?.phrase, offset: row.music?.offset,
      distance: row.music?.placement?.distance, lossDb: row.music?.placement?.occlusionDb,
    }));
  }
  const startedAt = Date.now();
  const entry = await settled('threshold');
  const thresholdPhrase = entry.music.phrase;
  const entryId = entry.realm.frame.entryDoorId;
  await note('doorway', entry);
  check('the active buffer has the Benches quantizer and triangular dither',
    entry.music.dsp?.bitDepth === 10 && entry.music.dsp?.effectiveSampleRate === 26000
      && entry.music.dsp?.dither === 'TPDF', entry.music.dsp);
  await shot('valley-music-threshold');

  if (process.env.ROUTE_VERIFY_VALLEY_MUSIC_UPPER === '1') {
    await walk([[0,12],[-8.5,13],[-15,15],[-23,18],[-24,22],[-24,29],[-29,39],[-28,49],[-25,52],[-20,53]]);
    const commons = await settled('commons', 'allemande-open');
    await note('the store plays Allemande', commons);
    await walk([[-13,54],[-13,63],[-20,65],[-27,74],[-32,79],[-25.3,79.2,.4],[-25.2,85],[-32,87],[-43,90]]);
    const fork = await settled('fork', 'courante-open');
    await note('the hay store plays Courante', fork);
    await walk([[-48,95],[-55,94],[-60,100],[-57,109],[-61,108],[-64,107],[-65.41,107.33,.22]]);
    const timber = await settled('timber', 'courante-open');
    await note('Courante at the woodpile', timber);
    const { x, z } = timber.realm.frame.pose;
    await lookWorld(entryYaw + Math.atan2(-66.32 - x, 107.48 - z), -.44);
    await waitFor(state => state.realm.action === 'PICK UP MAUL', 8000, 'physical maul interaction');
    await press('e');
    await waitFor(state => state.realm.frame?.homeState?.activities?.active?.phase === 'held', 8000, 'maul in hand');
    await press('e');
    await waitFor(state => state.realm.frame?.homeState?.activities?.split, 8000, 'the log physically splits');
    const answer = await settled('timber', 'courante-answer');
    check('splitting the log answers the Courante at the same shelter',
      JSON.stringify(timber.music.placement.position) === JSON.stringify(answer.music.placement.position));
    await note('Courante answers the split', answer);
    await shot('valley-music-timber-answer');
    await press('e');
    const stood = await waitFor(state => !state.realm.frame?.homeState?.activities?.active, 8000, 'maul set down');
    if (stood.realm.frame?.homeState?.restLocus === 'maul') {
      await waitFor(state => state.scene === 'source-rest:childhood-valley', 12000, 'optional rest conversation at the maul');
      await press('Escape');
      await waitFor(state => !state.scene, 9000, 'resume exploration after the maul');
    }
    await walk([[-64,107],[-61,108],[-57,109],[-65,116],[-71,119],[-74,127],[-74,129],[-76,129.2],[-78.5,130,.35]]);
    const lookout = await settled('lookout', 'montfermeil-refrain');
    check('the upper trail reaches the distinct Montfermeil recording', lookout.music.placement.object === 'survey marker');
    await note('La Montfermeil at the lookout', lookout);
    await shot('valley-music-montfermeil');
    return;
  }

  await walk([[0, 12, .3]]);
  let lane = await settled('lane');
  check('walking to the lane advances the phrase without a new action',
    lane.music.phrase !== thresholdPhrase, { threshold: thresholdPhrase, lane: lane.music.phrase });
  await note('lane', lane);
  const lanePhrase = lane.music.phrase;
  // Wait through the native source wrap with feet still. Polling for the wrap
  // keeps the test independent of a particular movement's authored duration.
  const lanePose = lane.realm.frame.pose;
  const loopDeadline = Date.now() + 22000;
  let wrapped = false;
  while (Date.now() < loopDeadline && !wrapped) {
    await sleep(260);
    const state = await snapshot();
    wrapped = state.music?.offset < lane.music.offset - .18;
    lane = state;
  }
  check('standing still wraps the same region without walking or advancing the score',
    wrapped && lane.music?.phrase === lanePhrase && lane.music?.playing
      && Math.hypot(lane.realm.frame.pose.x - lanePose.x, lane.realm.frame.pose.z - lanePose.z) < .06, lane.music);
  await note('stationary loop wrapped', lane);

  await walk([[-12, 13], [-23, 18], [-24, 22], [-27.12, 21.48, .27]]);
  await lookWorld(entryYaw, 0);
  const open = await waitFor(state => state.music?.cell === 'stop' && !state.music.pending
    && state.music.placement?.object === 'PostAuto shelter' && state.music.placement?.occlusionDb < 1,
  26000, 'open side of PostAuto shelter');
  await note('open side of shelter', open);
  await shot('valley-music-postauto-clear');
  const openPan = open.music.placement.pan;
  await lookWorld(entryYaw + Math.PI, 0);
  const turned = await waitFor(state => state.music?.placement?.pan * openPan < -.4, 6000, 'stereo bearing flips with the head');
  check('turning in place reverses the bearing around the same world source',
    JSON.stringify(open.music.placement.position) === JSON.stringify(turned.music.placement.position)
      && Math.abs(openPan + turned.music.placement.pan) < .15 && turned.music.phrase === open.music.phrase,
  { before: open.music.placement, after: turned.music.placement });
  await note('looked back at shelter', turned);

  await walk([[-25.7, 21.3, .22], [-25.7, 18.6, .22], [-29.8, 18.6, .22], [-30.4, 21.48, .25]]);
  const blocked = await waitFor(state => state.music?.cell === 'stop' && state.music.placement?.occlusionDb > 7,
    8000, 'real shelter wall enters the acoustic ray');
  check('the same shelter phrase loses direct level and highs through the actual wall',
    blocked.music.phrase === open.music.phrase
      && JSON.stringify(blocked.music.placement.position) === JSON.stringify(open.music.placement.position)
      && blocked.music.placement.gain < open.music.placement.gain * .55
      && blocked.music.placement.lowpassHz < open.music.placement.lowpassHz * .56
      && blocked.music.placement.wet > open.music.placement.wet,
  { clear: open.music.placement, blocked: blocked.music.placement });
  await note('behind the shelter wall', blocked);
  await shot('valley-music-postauto-blocked');

  for (let attempt = 0; attempt < 3 && (await snapshot()).scene !== 'pause'; attempt += 1) {
    await press('Escape');
  }
  const frozen = await waitFor(state => state.scene === 'pause' && state.music?.held
    && state.music.live === 0 && !state.music.playing, 9000, 'pause silences and parks the source');
  await sleep(1800);
  const stillFrozen = await snapshot();
  check('pause parks the transport without accumulating hidden playback',
    stillFrozen.music?.held && stillFrozen.music.offset === frozen.music.offset
      && stillFrozen.music.live === 0, { frozen: frozen.music, after: stillFrozen.music });
  await note('pause parked', stillFrozen);
  await press('Escape');
  const resumed = await settled('stop', blocked.music.phrase);
  const resumeOffset = resumed.music.offset - frozen.music.offset;
  check('resume returns to the parked phrase without catching up to the pause interval',
    resumeOffset >= -.05 && resumeOffset < 1.25, { parked: frozen.music.offset, resumed: resumed.music.offset });
  await note('same phrase resumed', resumed);

  await walk([[-29.8, 18.6, .24], [-25.7, 18.6, .24], [-23, 18], [-12, 13], [0, 12, .3]]);
  const laneAgain = await settled('lane', lanePhrase);
  await note('same lane on return', laneAgain);
  await walk([[0, 1, .22]]);
  const entryAgain = await settled('threshold', thresholdPhrase);
  check('retreat reverses through the same authored score cells', entryAgain.music.phrase === thresholdPhrase);
  await note('threshold on return', entryAgain);
  await lookWorld(entryYaw + Math.PI, 0);
  for (let attempt = 0; attempt < 4 && (await snapshot()).realm.frame?.stage === 'inside'; attempt += 1) {
    await hold('w', 600);
  }
  const returned = await waitFor(state => !state.realm.frame && state.where.source && state.realm.return?.id === entryId
    && !state.music?.playing && state.music?.live === 0, 18000, 'return doorway releases the score owner');
  check('the physical return doorway tears down the valley source', !returned.music.ready && returned.music.live === 0,
    { return: returned.realm.return, music: returned.music });
  await note('returned to Source', returned);
}
