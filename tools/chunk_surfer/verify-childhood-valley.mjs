// Starts inside the real optional home doorway. Every position change uses
// ordinary W input through the parent verifier's walkHome and hold helpers.
const homeFlags = [
  'station.home.restored', 'station.home.inspected', 'station.home.departed',
  'station.home.seen', 'station.jumper',
];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const yawDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

const mountainTrail = {
  fork: { route: [[-25.3, 79.2, .4], [-25.2, 85], [-32, 87], [-43, 90]], look: { x: -54, z: 96 }, pitch: .12 },
  timber: { route: [[-48, 95], [-55, 94], [-60, 100], [-57, 109], [-61, 108], [-64, 107]],
    look: { x: -68, z: 107 }, pitch: -.06 },
  lookout: { route: [[-61, 108], [-57, 109], [-65, 116], [-71, 119], [-74, 127], [-74, 129], [-76, 129.2], [-78.5, 130, .35]],
    look: { x: 1.4, z: 73 }, pitch: -.245 },
  saddle: { route: [[-76, 129.2], [-74, 129]], look: { x: -66, z: 134 }, pitch: .01 },
  spring: { route: [[-66, 134], [-56, 128], [-52, 120], [-45, 116], [-47.4, 115.6], [-49.9, 114.6]],
    look: { x: -51.2, z: 114.5 }, pitch: -.23 },
  descent: { route: [[-47.4, 115.6], [-45, 116], [-41, 107], [-43, 98]],
    look: { x: -32, z: 86 }, pitch: -.14 },
  rejoin: [[-43, 90], [-32, 87], [-25.2, 85]],
};

export async function reviewChildhoodValley({
  page, check, shot, hold, lookWorld, snapshot, waitFor, walkHome, reloadContinue, report,
  entryYaw, samplePerformance,
}) {
  const before = await snapshot();
  const entry = before.realm.frame;
  check('the optional valley starts at the real home entrance',
    entry?.home?.eligible && entry.stage === 'inside' && Math.hypot(entry.pose.x, entry.pose.z - 1) < 2,
    { entryDoorId: entry?.entryDoorId, pose: entry?.pose });

  const progression = state => ({
    sourcePhase: state.source.phase,
    fieldReturns: state.station?.fieldReturns ?? null,
    homeDiscovered: !!state.station?.homeDiscovered,
    homeResolved: !!state.station?.homeResolved,
    homeFlags: Object.fromEntries(homeFlags.map(flag => [flag, !!state.flags[flag]])),
    canonicalFifth: !!state.flags['memory.field.fifth'],
    takes: state.takes,
  });
  const initial = progression(before);
  const evidence = { entryDoorId: entry.entryDoorId, initial, stops: [] };
  report.childhoodValley = evidence;

  function checkNoRecognition(state, label) {
    const frame = state.realm.frame;
    check(label, frame?.entryDoorId === entry.entryDoorId && frame.stage === 'inside'
      && !frame.atWindow && !frame.windowReached && !frame.homeState?.recognized
      && same(progression(state), initial), {
      pose: frame?.pose, atWindow: frame?.atWindow, windowReached: frame?.windowReached,
      recognized: frame?.homeState?.recognized, progression: progression(state),
    });
  }

  async function follow(points) {
    for (const [x, z, radius] of points) await walkHome({ x, z }, entryYaw, radius);
  }

  async function observe(name, target, pitch = 0) {
    const { pose } = (await snapshot()).realm.frame;
    const yaw = Math.atan2(target.x - pose.x, target.z - pose.z);
    await lookWorld(entryYaw + yaw, pitch);
    await waitFor(state => {
      const look = state.realm.frame?.pose;
      return look && Math.abs(yawDifference(look.yaw, yaw)) < .08 && Math.abs(look.pitch - pitch) < .08;
    }, 5000, `valley camera settles at ${name}`);
    const state = await shot(`valley-${name}`);
    checkNoRecognition(state, `ordinary exploration reaches ${name} without window recognition`);
    evidence.stops.push({ name, pose: state.realm.frame.pose, target });
    return state;
  }

  async function checkContinue(state, landmark) {
    const savedPose = state.realm.frame.pose;
    await reloadContinue();
    const restored = await snapshot();
    const restoredPose = restored.realm.frame?.pose;
    check(`Continue restores the ${landmark} floor, position and gaze`,
      restoredPose && Math.hypot(restoredPose.x - savedPose.x, restoredPose.z - savedPose.z) < .06
        && Math.abs(restoredPose.floorY - savedPose.floorY) < .03
        && Math.abs(yawDifference(restoredPose.yaw, savedPose.yaw)) < .12
        && Math.abs(restoredPose.pitch - savedPose.pitch) < .08,
      { savedPose, restoredPose });
    checkNoRecognition(restored, `reloading the ${landmark} leaves the optional visit unresolved`);
  }

  async function checkBedroomPane() {
    const { variant, window } = (await snapshot()).realm.frame;
    const collision = await page.evaluate(async ({ variant, window }) => {
      const { stationRealmFloor, stationRealmCanOccupy } = await import('/src/game/station-realms.js');
      const points = [
        ['front', window.z - .55],
        ['pane', window.z],
        ['bedroom', window.z + .6],
      ];
      return points.map(([name, z]) => {
        const floor = stationRealmFloor(variant, window.x, z);
        return { name, z, floor, occupiable: stationRealmCanOccupy(variant, window.x, z, floor ?? 0) };
      });
    }, { variant, window });
    const [front, pane, bedroom] = collision;
    check('the original bedroom pane still stops the body on supported ground',
      collision.every(point => Number.isFinite(point.floor))
        && front.occupiable && !pane.occupiable && !bedroom.occupiable,
      collision);
    evidence.bedroomCollision = collision;
  }

  async function walkMountain(valleyOverlook) {
    evidence.mountain = {};
    const visit = async (name, stop) => {
      await follow(stop.route);
      const frame = await observe(name, stop.look, stop.pitch);
      return frame.realm.frame.pose;
    };

    const fork = await visit('mountain-fork', mountainTrail.fork);
    const timber = await visit('mountain-timber-pocket', mountainTrail.timber);
    const lookout = await visit('mountain-lookout', mountainTrail.lookout);
    check('the mountain ascent gains real support elevation above the valley',
      lookout.floorY - valleyOverlook.floorY > 3 && lookout.floorY - fork.floorY > 2,
      { valley: valleyOverlook.floorY, fork: fork.floorY, timber: timber.floorY, lookout: lookout.floorY });
    await samplePerformance('mountain-lookout');
    await observe('mountain-survey-seat', { x: -79.65, z: 132.65 }, -.22);
    await follow(mountainTrail.saddle.route);
    const saddleFrame = await observe('mountain-saddle', mountainTrail.saddle.look, mountainTrail.saddle.pitch);
    const saddle = saddleFrame.realm.frame.pose;
    await checkContinue(saddleFrame, 'mountain saddle');
    const spring = await visit('mountain-springhead', mountainTrail.spring);
    const descent = await visit('mountain-alternate-descent', mountainTrail.descent);
    check('the alternate mountain trail descends on physical support',
      saddle.floorY - descent.floorY > 2 && Math.hypot(saddle.x - descent.x, saddle.z - descent.z) > 5,
      { saddle, descent });
    await follow(mountainTrail.rejoin);
    await checkBedroomPane();
    Object.assign(evidence.mountain, { fork, timber, lookout, saddle, spring, descent });
  }

  await follow([[0, 12], [-12, 13], [-23, 18], [-24, 22]]);
  await observe('west-shelter', { x: -28, z: 21.8 });
  await samplePerformance('valley-west-shelter');
  await follow([[-27.12, 21.48, .35]]);
  await observe('bus-timetable', { x: -28.44, z: 21.37 }, -.10);
  if(process.env.ROUTE_VERIFY_VALLEY_DETAIL==='1'){
    report.scope='Focused bus timetable capture using ordinary walking in the real valley. The optional entry is staged.';
    return;
  }
  await follow([[-24, 21.5]]);

  await follow([[-24, 29], [-29, 39], [-28, 49], [-25, 52], [-20, 53]]);
  await observe('rear-commons', { x: -17, z: 59 });
  if(process.env.ROUTE_VERIFY_MOUNTAIN_TRAIL === '1')await observe('commons-firewood-sled', { x: -14.7, z: 55.4 }, -.20);

  await follow([[-13, 54], [-13, 63], [-20, 65], [-27, 74], [-32, 79]]);
  const overlook = await observe('upper-overlook', { x: 1.5, z: 74 }, -.12);
  check('the overlook is raised above the commons on physical ground',
    overlook.realm.frame.pose.floorY - evidence.stops.find(stop => stop.name === 'rear-commons').pose.floorY > 3,
    { floorY: overlook.realm.frame.pose.floorY });
  await samplePerformance('valley-upper-overlook');
  if (process.env.ROUTE_VERIFY_MOUNTAIN_TRAIL === '1') {
    await walkMountain(overlook.realm.frame.pose);
  } else {
    await checkContinue(overlook, 'overlook');
    await follow([[-25.5, 79.2, .4], [-25.2, 85]]);
  }
  await follow([[-15, 91], [0, 92]]);
  await observe('behind-the-house', { x: 1.5, z: 75 }, -.08);
  if(process.env.ROUTE_VERIFY_MOUNTAIN_TRAIL === '1')await observe('kitchen-plot', { x: -4.6, z: 87.6 }, -.18);

  await follow([[13, 87], [23, 76], [22.8, 59], [21, 46]]);
  await observe('east-pump', { x: 18.6, z: 46.3 }, -.24);
  await observe('wash-house', { x: 25.5, z: 52 }, -.08);
  if(process.env.ROUTE_VERIFY_MOUNTAIN_TRAIL === '1')await observe('wash-line', { x: 19.1, z: 50.02 }, -.08);

  await follow([[23, 34], [15, 22], [1, 17], [0, 2.5]]);
  const atDoor = await observe('return-door', { x: 0, z: -.1 });
  const returnPose = atDoor.realm.frame.returnPose;
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await snapshot()).realm.frame?.stage !== 'inside') break;
    await hold('w', 700);
  }
  const returned = await waitFor(state => !state.realm.frame && state.where.source
    && state.realm.return?.id === entry.entryDoorId, 18000, 'ordinary walking crosses the valley return doorway');
  check('physical retreat returns through the original home doorway without a pane visit',
    returned.realm.return.home && returned.realm.return.reason === 'retreat'
      && !returned.realm.return.windowReached
      && Math.hypot(returned.pos.x - returnPose.x, returned.pos.y - returnPose.y) < .6,
    { return: returned.realm.return, position: returned.pos });
  check('returning without the window grants no jumper, recognition or progression',
    same(progression(returned), initial), { before: initial, after: progression(returned) });
  evidence.return = returned.realm.return;
  return returned;
}

// Developer fixture opens the valley. Site choice comes from the live roll,
// and ordinary keyboard input does the activities and answers the conversation.
export async function reviewValleyActivities({
  check, shot, hold, press, sleep, lookWorld, snapshot, waitFor, walkHome, reloadContinue, report, entryYaw, page,
}) {
  const initial = await waitFor(state => state.realm.frame?.homeState?.restLocus, 20000, 'one actual visit draw');
  const chosen = initial.realm.frame.homeState.restLocus;
  check('one of the three sites is assigned at entry', ['bench', 'maul', 'angel'].includes(chosen), chosen);
  report.valleyActivities = { chosen, ordinary: [] };
  const restScene = 'source-rest:childhood-valley';
  const active = state => state.realm.frame?.homeState?.activities?.active;
  async function go(points) {
    for (const [x,z,radius] of points) await walkHome({x,z},entryYaw,radius);
  }
  async function aim(x,z,pitch=0) {
    const pose=(await snapshot()).realm.frame.pose;
    await lookWorld(entryYaw+Math.atan2(x-pose.x,z-pose.z),pitch);
    await sleep(200);
  }
  async function dismissIfChosen(site) {
    if(chosen===site){
      await waitFor(s=>s.scene===restScene,12000,site+' conversation');
      await shot('valley-'+site+'-conversation');
      await press('Escape');
      await waitFor(s=>!s.scene,9000,'standing after '+site);
    }else{
      await sleep(1000);
      check(site+' remains an ordinary activity',(await snapshot()).scene!==restScene);
      report.valleyActivities.ordinary.push(site);
    }
  }
  async function angel(){
    await go([[-10,14,.29]]);
    await aim(-13,15,0);
    await waitFor(s=>s.realm.action==='MAKE SNOW ANGEL',7000,'angel action');
    await press('e');
    await waitFor(s=>active(s)?.kind==='angel',6000,'lying in the snow');
    await waitFor(s=>!!s.realm.frame?.homeState?.activities?.imprint,12000,'snow angel imprint');
    await waitFor(s=>!active(s),8000,'player gets out of the snow');
  }
  async function maul({split=true}={}){
    await aim(-66.32,107.48,-.44);
    await waitFor(s=>s.realm.action==='PICK UP MAUL',7000,'maul action');
    await press('e');
    await waitFor(s=>active(s)?.phase==='held',8000,'maul reaches hands');
    await shot('valley-held-maul');
    if(split&&!(await snapshot()).realm.frame.homeState.activities.split){
      await press('e');
      await waitFor(s=>s.realm.frame?.homeState?.activities?.split&&active(s)?.phase==='held',10000,'wood splits once');
    }
    if((await snapshot()).realm.frame.homeState.activities.split)await press('e');
    else await press('Escape');
    await waitFor(s=>!active(s),8000,'maul set down');
  }
  async function sit() {
    await aim(-78.095,132.58,-.22);
    await waitFor(s=>s.realm.action==='SIT ON THE BENCH',7000,'bench action');
    await press('e');
    await waitFor(s=>s.scene==='childhood-valley-rest'||s.scene===restScene,6000,'seat takes control');
    if(chosen!=='bench'){
      await sleep(1200);
      await shot('valley-ordinary-seat');
      await press('Escape');
      await waitFor(s=>!s.scene,8000,'ordinary seat stands');
    }
  }
  await go([[0,12],[-8.5,13],[-10,14]]);
  await angel();
  await dismissIfChosen('angel');
  await aim(-10,14,-.82);
  await shot('valley-snow-angel-imprint');
  await go([[-15,15],[-23,18],[-24,22],[-27.12,21.48,.35]]);
  await aim(-28.43,21.30,.20);
  await shot('valley-tannenried');
  await go([[-24,21.5],[-24,29],[-29,39],[-28,49],[-25,52],[-20,53],[-13,54],[-13,63],[-20,65],[-27,74],[-32,79]]);
  await go(mountainTrail.fork.route);
  await go(mountainTrail.timber.route);
  await go([[-65.41,107.33,.22]]);
  await maul({split:chosen!=='maul'});
  await dismissIfChosen('maul');
  if(chosen==='maul'){await maul();await dismissIfChosen('maul');}
  await aim(-66.32,107.48,-.70);
  await shot('valley-split-log');
  await go(mountainTrail.lookout.route);
  await go([[-78.1,131.63,.25]]);
  await sit();
  await dismissIfChosen('bench');
  await reloadContinue();
  let state=await snapshot();
  check('Continue retains the one site and both ordinary world changes',
    state.realm.frame?.homeState?.restLocus===chosen
      &&state.realm.frame?.homeState?.activities?.split
      &&!!state.realm.frame?.homeState?.activities?.imprint);
  if(chosen==='bench')await sit();
  else if(chosen==='maul'){
    await go([...mountainTrail.lookout.route.slice(3,-1).reverse(),[-65,116],[-57,109],[-61,108],[-64,107],[-65.41,107.33,.22]]);
    await maul();
  }else{
    await go([...mountainTrail.saddle.route,...mountainTrail.spring.route.slice(0,4),...mountainTrail.descent.route.slice(2),
      ...mountainTrail.rejoin,[-25.3,79.2],[-32,79],[-27,74],[-20,65],[-13,63],[-13,54],[-20,53],[-25,52],[-28,49],[-29,39],[-24,29],[-24,22],[-23,18],[-15,15],[-10,14]]);
    await angel();
  }
  await waitFor(s=>s.scene===restScene,12000,'winning conversation reopened');
  async function choose(suffix){
    for(let i=0;i<95;i++){
      const view=await page.evaluate(()=>window.__scenes.top()?.view?.());
      if(view?.pending?.kind==='branch'){
        const target=view.pending.options.findIndex(item=>item.contentId?.endsWith(':'+suffix));
        if(target<0)throw Error('Missing authored choice '+suffix+' in '+JSON.stringify(view.pending));
        let index=view.pending.index||0;
        while(index!==target){await press('ArrowDown');index=(index+1)%view.pending.options.length;}
        await press('Enter');return;
      }
      await press('Enter');
    }
    throw Error('Choice never rendered: '+suffix);
  }
  await choose('stay');
  await choose('remain');
  state=await waitFor(s=>s.ending?.restSite==='childhood-valley',12000,'durable fatal ending commitment');
  check('committing saves the actual winning fatal site',state.ending.restLocus===chosen,state.ending);
  await shot('valley-fatal-commit');
  state=await waitFor(s=>['ending-drive-off','credits'].includes(s.scene),35000,'the normal ending handoff');
  if(state.scene==='ending-drive-off'){
    await page.waitForFunction(()=>{
      const scene=window.__scenes.top();
      const view=scene?.view?.();
      return scene?.id==='credits'||(scene?.id==='ending-drive-off'&&view?.ready&&view?.presented);
    },{timeout:60000});
    await shot('valley-ending-coda');
    await hold('e',3600);
  }
  await waitFor(s=>s.scene==='credits',20000,'the actual ending credits');
  check('the local fatal ending reaches the real credits',true);
  await shot('valley-fatal-ending');
}
