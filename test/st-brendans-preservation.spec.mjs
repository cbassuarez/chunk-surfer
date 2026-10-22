// Pre-treatment contracts captured 2026-10-22. Digests are deliberately literal:
// new decoration, lighting and sound may improve, but route/encounters may not.
// No ignored artifact file is needed to run these checks from a clean checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
// Independent preservation evidence. Intentionally excludes the new treatment,
// lights and furnishings: those may improve; navigation and encounters may not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import * as C from '../src/data/st-brendans.js';
import { CATHEDRAL_LESSONS, cathedralLessonTree } from '../src/game/cathedral-descent.js';
import { cathedralBellCombatDefinition } from '../src/data/combat-definitions.js';
import { ELLERY_BELLS } from '../src/data/bell-tower.js';
import { createTwoTierBellFrameLayout } from '../src/data/bell-tower-layout.js';
import { CATHEDRAL_DAMAGE_MARKS, CATHEDRAL_ALARM_CEILING } from '../src/game/chunk-surf-state.js';
import { ENDING_CUTSCENES, ENDING_MANIFEST } from '../src/data/endings.js';
import { CATHEDRAL_GROUND_LOGICAL_OFFSET, CATHEDRAL_WEST_EXIT_PLANE_METRES,
  CATHEDRAL_BODY_EXIT_CLEARANCE_METRES } from '../src/game/cathedral-extraction.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = data => createHash('sha256').update(data).digest('hex');
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
const geometryKeys = [
  'CHURCH', 'CHURCH_EXPLORATION_EXIT_DOOR_ID', 'CHURCH_TOWER_ENDING_EXIT_DOOR_ID',
  'CHURCH_BOUNDS', 'CHURCH_HEIGHTS', 'CHURCH_LEVELS', 'CHURCH_UPPER', 'CHURCH_BELFRY',
  'CHURCH_BELFRY_WALLS', 'CHURCH_TURRETS', 'CHURCH_TURRET_WALLS',
  'CATHEDRAL_DESCENT_BLOCKERS', 'CATHEDRAL_DESCENT_ROUTE', 'CATHEDRAL_STAGING',
  'CHURCH_STAIR_ENDPOINTS', 'CHURCH_BUTTRESSES', 'CHURCH_LOFT_RAILS',
  'CHURCH_COLLIDERS', 'CHURCH_SKIN',
];

function preservationContract() {
  const { center, lowerFloorY, upperPivotY } = C.CHURCH_BELFRY;
  const protectedFiles = [
    ...files('public/audio/stop-listening'), ...files('public/audio/chapel-service'),
    'src/audio/stop-listening-gut.js', 'src/data/stop-listening.js', 'src/game/stop-listening.js',
    'tools/chunk_surfer/stop-listening-dsp.mjs', 'tools/chunk_surfer/build-stop-listening-audio.mjs',
    'src/audio/chapel-service.js', 'src/data/chapel-service-score.js',
    'src/data/chapel-service-audio.js', 'src/game/chapel-service.js',
    'tools/chunk_surfer/build-chapel-service-audio.mjs',
  ].sort();
  const protectedHashes = Object.fromEntries(protectedFiles.map(file => [file, hash(fs.readFileSync(path.join(root, file)))]));
  const shell = [];
  for (let y = C.CHURCH_BOUNDS.y0 - 1; y <= C.CHURCH_BOUNDS.y1 + 1; y++) {
    for (let x = C.CHURCH_BOUNDS.x0 - 1; x <= C.CHURCH_BOUNDS.x1 + 1; x++) {
      shell.push([x, y, C.churchRoomAt(x, y), C.churchVolumeAt(x, y),
        C.churchWallAt(x, y), C.churchWallHeight(x, y), C.churchDoorAt(x, y)]);
    }
  }
  return clone({
    geometry: Object.fromEntries(geometryKeys.map(key => [key, C[key]])),
    shell, groundRows: C.churchGroundRows(),
    exitAccess: C.CHURCH.doors.map(door => [door.id, C.churchTowerCarryDoorAccess(door.id)]),
    lessons: CATHEDRAL_LESSONS.map(lesson => ({ ...lesson, tree: cathedralLessonTree(lesson) })),
    combat: [1, 2].map(phase => cathedralBellCombatDefinition({ phase })),
    personalCombat: [1, 2].map(phase => cathedralBellCombatDefinition({ phase, personalOpening: true })),
    bellLayout: createTwoTierBellFrameLayout(ELLERY_BELLS, { centerX: center.x, centerZ: center.y, lowerFloorY, upperPivotY }),
    damage: { marks: CATHEDRAL_DAMAGE_MARKS, alarmCeiling: CATHEDRAL_ALARM_CEILING },
    ending: Object.fromEntries(['tower-won', 'tower-lost'].map(id => [id, {
      cutscene: ENDING_CUTSCENES[id], manifest: ENDING_MANIFEST[id],
    }])),
    extraction: { logicalOffset: CATHEDRAL_GROUND_LOGICAL_OFFSET,
      westPlane: CATHEDRAL_WEST_EXIT_PLANE_METRES, bodyClearance: CATHEDRAL_BODY_EXIT_CLEARANCE_METRES },
    protectedHashes,
  });
}

const before = {
  "geometry": "419e4e7c5228dc7f8a78ec9964330155bfeee3121d7b6bb1bf7c989b521142a0",
  "shell": "26393bc955913d8ae043b01b52c3a4e6ecbb61aee6aa1f106766b2052b6d1ef0",
  "groundRows": "ab9f6a9760e112d83643f17c59f974254e3bf7cd29c7258207575909ac6d6441",
  "exitAccess": "de8008b87c825bf7240035cd26a92c995ad11a1fb89e7a32ca9b1d91037ac31b",
  "lessons": "a1ea81aa0d78a343b737a0c0ed3e8b60fa934fcca32017cecc55a89dedaadf8f",
  "combat": "2b9710f68ddff0142802f18dbbb5259caf6a83c65649c7f350e3461f7fea9e66",
  "personalCombat": "86b793e3f14ee2270b8190f6a38b44d84adb14f45ef41fe3baa10a2a69c9a563",
  "bellLayout": "fafb1eb7e77eeba4a04d7e252d036a11db379ca8787d9fa9205fe285b37cce33",
  "damage": "9c85d160b4a2cedc61b69701c5ed633956e96496cf84bc7a21690845df908d33",
  "ending": "543816d9bd80231a9afe055ab4856cade1cec583a2cb15266e8e09521d95fe45",
  "extraction": "ddb2a9460a5a5d96c38eb601eeacb02854cfd8cad7a29f31ab74bb3ece216a7d"
};
const protectedHashes = {
  "public/audio/chapel-service/manifest.json": "4a4a66c5c0967cd1d8b8955e36f1215b4f5dc7579b159e9709f7efbed75b9030",
  "public/audio/chapel-service/movement-cloth.mp3": "66c4802c30ee7d3e63e35a1e7bb9b6ca5be93d722d8e92af8b400c3d39961fbd",
  "public/audio/chapel-service/movement-pew.mp3": "dea3b875239d22b23bcc1abec210f449ac86fb20ff8e08cc5229846b95d85c5c",
  "public/audio/chapel-service/priest-communion-blessing.mp3": "6b738fa38ba3d8a8106264cfaa7676108cdf4fb2221347315767a3d4846dcb72",
  "public/audio/chapel-service/priest-communion-invitation.mp3": "936ca9f082cde48a3c92fbd5ad1c260995c65cb09ca5b81a9abbc29be8819f4a",
  "public/audio/chapel-service/priest-pater-address.mp3": "67a36b47e3ff2c64262de1b4e281870cc77da4d1b2f83f2434d435d934db8dd4",
  "public/audio/chapel-service/priest-pater-bread.mp3": "0e293415d6a22b58e7df6ce29749e7e6cc5b2f60067f1911c69ef13fb614f279",
  "public/audio/chapel-service/priest-pater-deliverance.mp3": "a4dd51eddb209fcb2704c9502260bf1c62e086d2a839c1cab2614d1f3c8a5135",
  "public/audio/chapel-service/response-amen.mp3": "9bf4effe38ffc9e8d19392f0d89c68e113d4ea4c9256e341d9db5ba2756264d4",
  "public/audio/chapel-service/room-a.mp3": "faf1bf13c80c4cf99ef0ecd631d0f1134d0cd4c021a587e1926db5e9a3cdefda",
  "public/audio/chapel-service/room-b.mp3": "684dc7902bb08640b0f912cebb15970dd0e2a7e83073a8edf0c747a1f6f5bfab",
  "public/audio/stop-listening/bed-a.mp3": "e5dcc7faa13e9a083e09b32b126fe61d0f3a8c0e41f02d7ce71e7e967b3007f3",
  "public/audio/stop-listening/bed-b.mp3": "d451430d1ea940109efd9543a0e65d5709a9643f046c747041e39c1069bdc3e8",
  "public/audio/stop-listening/borygmi-bubbling1-01.mp3": "dda267a7bb93e634890e3b6a5904d1db470378142747648b73db7d2fed96b4cf",
  "public/audio/stop-listening/borygmi-bubbling1-02.mp3": "2e39864a7d7d0a0b7d24f80b56e040d877e1a9d7edf36df3f96216c61aefb627",
  "public/audio/stop-listening/borygmi-groaning1-01.mp3": "aace96b2f1644da41fab86ac953c022658954c275fc34effcb42311561006b4b",
  "public/audio/stop-listening/borygmi-gurgle1-01.mp3": "a982a40530531c81de983dc885e3fcb7a516da6f4e72e2bccf0d5b792173be90",
  "public/audio/stop-listening/borygmi-gurgles2-01.mp3": "667feaa30573d7188082ad5da1b2cda3240981227f04a11fcdcf4b47e17a7741",
  "public/audio/stop-listening/borygmi-gurgles2-02.mp3": "80062910ec494ffe3d1e2b963c58cc9eea6b3d0c0793b69eaf542228f608e784",
  "public/audio/stop-listening/borygmi-gurgles2-03.mp3": "6ae6a3a94b8bba53dee2af9128f3e1f727ea48acbac72aa76b56e1701af7424d",
  "public/audio/stop-listening/borygmi-gurgles2-04.mp3": "4cfa96186a3c121e5f4f9d8609dd1845ee7ef49078dd3513d650116ff801b528",
  "public/audio/stop-listening/borygmi-gurgles2-05.mp3": "bc0041b4b3803c59f6ecd88100224930ecca599b808c96881248735c28de37d9",
  "public/audio/stop-listening/borygmi-gurgles2-06.mp3": "55dfd518723b068e2a787b7bf527aa8f301ff5c03370161efae7d6fa09b125f2",
  "public/audio/stop-listening/borygmi-gurgles2-07.mp3": "d8fe626b2de4d152175ebe90e13cc4bd12bc4f9f94f28e6fcece7f32db74a346",
  "public/audio/stop-listening/borygmi-gurgles2-08.mp3": "7c35ecbd2160275a87a785de116ca222dded5396f16d9da0e25c6878b65f4430",
  "public/audio/stop-listening/borygmi-gurgles3-01.mp3": "0854986010e848f3f14a1e927daf57feb042a0ce3a663eeffe0f812da98f24fe",
  "public/audio/stop-listening/borygmi-gurgles3-02.mp3": "155a8f9ee42e1e6cc457dd4f74938bc62172286dafb128f3e59d919db8ede231",
  "public/audio/stop-listening/borygmi-gurgles3-03.mp3": "d5cd0f6860780e6da14f1b335997a2676885c92cf9245b82dd5292baf31affcd",
  "public/audio/stop-listening/borygmi-gurgles3-04.mp3": "950f0f3b3926044d445b71e37d65d1201512dd97ae7e27e52410e357ca89ccba",
  "public/audio/stop-listening/borygmi-gurgles3-05.mp3": "1873f965f814c95f7ad477fe214f59213971eb3f961d3f909a692d0e324f12e2",
  "public/audio/stop-listening/borygmi-gurgles3-06.mp3": "fe2cd8fdff5630c18621e4786cd08eb3cc1e0ad2f5c8caca35dfc9156133e6c1",
  "public/audio/stop-listening/borygmi-gurgles3-07.mp3": "9f4ca488ed1043da20625ccfeb083577dcc7b1086f994c1f9338dc54a30aa463",
  "public/audio/stop-listening/borygmi-gurgles3-08.mp3": "874b8277104fcc3fb1c909c342150ff9efb4c2898d76f4fc552e03b77921087c",
  "public/audio/stop-listening/borygmi-gurgles3-09.mp3": "4b799ecb09c5ae5fa854a4fcb775bd0347ec56173918b289368b856d729a6439",
  "public/audio/stop-listening/borygmi-gurgles3-10.mp3": "66ed5e00cafe1cd2b40076d5fae98946f193235af6da8b55f9f7222f5d9c658b",
  "public/audio/stop-listening/borygmi-percolating1-01.mp3": "4c81a7d85f80524d994a3fec45ef8e838c0ece3f47890e20d5a6e1007145cd1d",
  "public/audio/stop-listening/cabled-mess-wet-sponge-01.mp3": "bcd21271ad663dfb54dc3c747780b59a11d59a8b664c11070012bd5b39a214e3",
  "public/audio/stop-listening/cabled-mess-wet-sponge-02.mp3": "e8e6237f86d13980c5c9b7369dd31e6bdcbf70f8a9107ae35f9be88b51ff2926",
  "public/audio/stop-listening/cabled-mess-wet-sponge-03.mp3": "7ee0feccef0f650e664ae3b2ac9cd5c853211139b4418c0e364660bf67c27208",
  "public/audio/stop-listening/cabled-mess-wet-sponge-04.mp3": "b2dd67edeca60a103a4042aa6b032164cd0234a1e5810bbe6e9a1964a98f29f4",
  "public/audio/stop-listening/cabled-mess-wet-sponge-05.mp3": "bfe8e31db026e69dcb55bce41e0e13fcb8a728deb6e112b480e190bf2983cf48",
  "public/audio/stop-listening/christo13-squishing-01.mp3": "2582924371e12b334813f38cfbb35151b1a4c5842c9ee49aa3b5ecf6b69bee15",
  "public/audio/stop-listening/christo13-squishing-02.mp3": "cde6bc600f9346ad9c4236a84d2a3fbded396e086e9bcc6a1690a31ca53ec844",
  "public/audio/stop-listening/christo13-squishing-03.mp3": "1b43240935b6808bc3db5fd9d1b446b856ecbe4941c8c5d25583d8238aa75cec",
  "public/audio/stop-listening/christo13-squishing-04.mp3": "74764eba6cd612a42282b12c54eedf365413427ba04143d44c638225bc85b3bf",
  "public/audio/stop-listening/christo13-squishing-05.mp3": "f04b1a5af95d69a0a298fb9d35542cdb655a4c42fbf7de52a7a88b95a4033a93",
  "public/audio/stop-listening/christo13-squishing-06.mp3": "0ad870cbe0845f4796e71a98a4c3cb80f14a40c53241fba334ab638b77ab1a61",
  "public/audio/stop-listening/editor-adp-gooey-squish-01.mp3": "746312a50df58170ff98086dcf445fe4cf47a404d0da9431e74a55e21faf3595",
  "public/audio/stop-listening/manifest.json": "e97cbc55299b080c32ab704b254210e9ae1b93b8e6fd486bbf6a28d78fba0fa5",
  "public/audio/stop-listening/starlite-tummy-grumble-01.mp3": "110c12d54e839fd97a39a4016e0c236105e251f3fb98552fe90106671c68e743",
  "public/audio/stop-listening/starlite-tummy-grumble-02.mp3": "b36bd72654ff2287494adffe348a5534996b02d287183e872f20d8b3f8f08541",
  "public/audio/stop-listening/starlite-tummy-grumble-03.mp3": "32c165bcf8c5e0aed66b4b49f139f293f7a7fa5d8c92128461e488443490b3a6",
  "public/audio/stop-listening/starlite-tummy-grumble-04.mp3": "dc88bad330cffb65a10884fa6561182db55c54cf34c7ded81d411272004dd2c6",
  "public/audio/stop-listening/starlite-tummy-grumble-05.mp3": "dfff066915a7782926cbd65a9e4c931d9faad265aae7b24c6a63988bd67dce4d",
  "public/audio/stop-listening/starlite-tummy-grumble-06.mp3": "1ea90966a758ada18d5b1db1325273d35743fd0d19490ecda7b8394fddb61f50",
  "public/audio/stop-listening/starlite-tummy-grumble-07.mp3": "53ceccce0b34f8fd27d60c4deab90a72949bb9d4a3e4f510294bfe4d8100e06c",
  "public/audio/stop-listening/starlite-tummy-grumble-08.mp3": "73174a799bbfdadf086a596070546bd7731142da29c2ff03ddea616074080128",
  "public/audio/stop-listening/stephan-slime-smacking-01.mp3": "e615616d890b178bc3b700914b1a3d0151aa424b327aec2e0dd633d7228bbb35",
  "public/audio/stop-listening/stephan-slime-smacking-02.mp3": "611ca244a87bb6193c863f3373908b99a50c8d23636173d06cf77ffbb8151e4b",
  "public/audio/stop-listening/stephan-slime-smacking-03.mp3": "0d33b4517809f4d79a4eb4429bbe7b26c0b8719b297993a82c39b2b1c3ee45cd",
  "src/audio/chapel-service.js": "eb9d9c70289e3c6a425fa212eb464bcb7d7f302c60727ca1567bda87190b4550",
  "src/audio/stop-listening-gut.js": "c9d59409dff07a1d8f2f12fb63e94f7f5b6968cf506a0a27d333be1ad65d29a4",
  "src/data/chapel-service-audio.js": "3a1501837baacb2f459757bcc0432b9fc5a404e27132ebbedf98b8fb417ab39b",
  "src/data/chapel-service-score.js": "0e7dec5d1ef57af3ed38ecdf92a1efdf2e3ba1c76f782bb1fcaed31c2e282bd6",
  "src/data/stop-listening.js": "44f246406f662a6bb0f40b0299b74c2523f17961e5d195d66d60a3982b4eebb9",
  "src/game/chapel-service.js": "55336685f8b4ebdc8176b00dce4629c19420ff1ae5a2b409f4dbd5def3ecdef5",
  "src/game/stop-listening.js": "2ef8f56d4bb37cfb43c9a8d38724969ebfeb96ab4934f8e1d8238f5a5a012d51",
  "tools/chunk_surfer/build-chapel-service-audio.mjs": "33bbb1a9982799dbd6e00d1de3c72e2e1d2815932b5aa6ee55e20b4e68c4ea33",
  "tools/chunk_surfer/build-stop-listening-audio.mjs": "22b4b0174eb684ba326f1cf5f8dd26aba2cd3f0566dfcc02053754ac49458291",
  "tools/chunk_surfer/stop-listening-dsp.mjs": "39942148c66b2904a8fcd9205db8e6a8dbeb9fd0dc15749b6cdd5ba924cc9417"
};
const after = preservationContract();
const digest = value => hash(JSON.stringify(value));
test("St Brendan's preserves the long descent, stair mouths, clear route and physical contact", () => {
  assert.equal(digest(after.geometry), before.geometry, "geometry differs from the pre-treatment contract");
  assert.equal(digest(after.shell), before.shell, "shell differs from the pre-treatment contract");
  assert.equal(digest(after.groundRows), before.groundRows, "groundRows differs from the pre-treatment contract");
});

test("all eight bells retain the same mounted positions and existing contact sweeps", () => {
  assert.equal(digest(after.bellLayout), before.bellLayout, "bellLayout differs from the pre-treatment contract");
});

test("the three safe apparatus lessons retain their choices, outcomes, text and physical stations", () => {
  assert.equal(digest(after.lessons), before.lessons, "lessons differs from the pre-treatment contract");
});

test("both cathedral fight phases, optional opening reference and damage/alarm contract stay unchanged", () => {
  assert.equal(digest(after.combat), before.combat, "combat differs from the pre-treatment contract");
  assert.equal(digest(after.personalCombat), before.personalCombat, "personalCombat differs from the pre-treatment contract");
  assert.equal(digest(after.damage), before.damage, "damage differs from the pre-treatment contract");
});

test("won/lost encounters and west-door body extraction retain existing states and route", () => {
  assert.equal(digest(after.ending), before.ending, "ending differs from the pre-treatment contract");
  assert.equal(digest(after.extraction), before.extraction, "extraction differs from the pre-treatment contract");
  assert.equal(digest(after.exitAccess), before.exitAccess, "exitAccess differs from the pre-treatment contract");
});

test('Ear gurgles and chapel service retain all original source, built clip, score and runtime bytes', () => {
  assert.equal(Object.keys(protectedHashes).length, 70);
  assert.deepEqual(after.protectedHashes, protectedHashes);
});
