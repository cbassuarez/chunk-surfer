// Source and edit definitions only. The playable service's timing and spatial
// rules live in the audio runtime; this bank adds no dialogue, answer or gate.
export const CHAPEL_SERVICE_AUDIO_DIR = 'audio/chapel-service';
export const CHAPEL_SERVICE_AUDIO_MANIFEST = `${CHAPEL_SERVICE_AUDIO_DIR}/manifest.json`;

const source = (id, title, author, licence, licenceUrl, url, download, audioSHA, note) =>
  Object.freeze({ id, title, author, licence, licenceUrl, url, download, audioSHA, note });

export const CHAPEL_SERVICE_AUDIO_SOURCES = Object.freeze([
  source('cormi-communion', 'De_Communione.wav', 'cormi', 'CC0 1.0',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    'https://freesound.org/people/cormi/sounds/121883/',
    'https://cdn.freesound.org/previews/121/121883_1267745-hq.mp3',
    '853ba2dc14f26e9a64e74724c6e9b0737496c004d38767dd09d0209fd36cb3e1',
    'Human Latin recitation, uploaded 2011; not represented as a historical recording or a live Mass. Traditional text identified by the author as Rituale Romanum, edition 1847.'),
  source('cormi-pater-noster', 'Pater_Noster.wav', 'cormi', 'CC0 1.0',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    'https://freesound.org/people/cormi/sounds/113654/',
    'https://cdn.freesound.org/previews/113/113654_1267745-hq.mp3',
    '9746a38a7bbe267153b2bb40d3bf00696d7539f4fa50966760007d3427a023d1',
    'Human Latin recitation, uploaded 2011, from the same speaker as De_Communione. Traditional prayer, not a copyrighted modern English translation.'),
  source('erh-amen', 'amen.wav', 'ERH', 'CC BY 4.0',
    'https://creativecommons.org/licenses/by/4.0/',
    'https://freesound.org/people/ERH/sounds/29933/',
    'https://cdn.freesound.org/previews/29/29933_215874-hq.mp3',
    '87bfac2c74019cc3d6481057ad78a896e916b0d24e2f8ab31160f28cd7babc5e',
    'The recorder identifies a priest and congregation saying Amen. One coherent field recording with its own room tail, not individually separable singers.'),
  source('communion-room-tone', "1800's Church Silent Prayer During Communion", 'composingatnight', 'CC0 1.0',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    'https://freesound.org/people/composingatnight/sounds/697580/',
    'https://cdn.freesound.org/previews/697/697580_5557765-hq.mp3',
    '36e95259757245830b68985ef1d270d92738ffdf3d11fab1eb3aaf901148327e',
    'Contemporary recording of occupied church room tone during silent prayer; the 1800s description concerns the building, not the recording date. Individual breath/pew events are not claimed.'),
  source('owlstorm-cloth', 'Blanket Movement 2', 'OwlStorm / Ashe Kirk', 'CC0 1.0',
    'https://creativecommons.org/publicdomain/zero/1.0/',
    'https://freesound.org/people/OwlStorm/sounds/320138/',
    'https://cdn.freesound.org/previews/320/320138_140737-hq.mp3',
    'f8cd975c25318e5c0cf4a96c8c1ee39e1f71ab5a5935fbf6436b129e406c9fa3',
    'Real down-duvet cloth movement, stereo Zoom H4n recording. Adapted as restrained clothing foley; not claimed to be a recorded vestment.'),
  source('tbhicba-wood-bench', 'Bench Creak 2.wav', 'tbhicba', 'CC BY 3.0',
    'https://creativecommons.org/licenses/by/3.0/',
    'https://freesound.org/people/tbhicba/sounds/148335/',
    'https://cdn.freesound.org/previews/148/148335_1379881-hq.mp3',
    '8600c348a070a712f3f91492d1cd7dd6178ebd2026655287038d0438215ffb28',
    'Actual old wooden bench creak, adapted as subdued pew foley; not a recording made inside this chapel.'),
]);

const clip = (id, role, source, from, to, gain, rmsDb, text = null, notes = null) =>
  Object.freeze({ id, file: `${id}.mp3`, role, source, cutAt: Object.freeze({ from, to }), gain, rmsDb, text, notes });

export const CHAPEL_SERVICE_AUDIO_CLIPS = Object.freeze([
  clip('priest-pater-address', 'priest', 'cormi-pater-noster', 0, 15.3, .85, -24,
    'Pater noster, qui es in coelis, sanctificetur nomen tuum; adveniat regnum tuum; fiat voluntas tua, sicut in coelo et in terra.'),
  clip('priest-pater-bread', 'priest', 'cormi-pater-noster', 15.3, 26.4, .85, -24,
    'Panem nostrum quotidianum da nobis hodie, et dimitte nobis debita nostra, sicut et nos dimittimus debitoribus nostris.'),
  clip('priest-pater-deliverance', 'priest', 'cormi-pater-noster', 26.4, 34.160748, .85, -24,
    'Et ne nos inducas in tentationem; sed libera nos a malo. Amen.'),
  clip('priest-communion-invitation', 'priest', 'cormi-communion', 0, 16.1, .85, -24,
    'Ecce Agnus Dei, ecce qui tollit peccata mundi. Domine, non sum dignus ut intres sub tectum meum, sed tantum dic verbo, et sanabitur anima mea.'),
  clip('priest-communion-blessing', 'priest', 'cormi-communion', 16.1, 24.409048, .85, -24,
    'Corpus Domini nostri Jesu Christi custodiat animam tuam in vitam aeternam. Amen.'),
  clip('response-amen', 'response', 'erh-amen', 0, 5.694694, .65, -25, 'Amen.',
    'Play as one existing congregation, with the full original decay. Do not multiply or pitch-clone it into fabricated performers.'),
  clip('movement-cloth', 'movement', 'owlstorm-cloth', 0, 2.048435, .16, -32, null,
    'A single restrained fabric adjustment; its natural envelope is retained.'),
  clip('movement-pew', 'movement', 'tbhicba-wood-bench', 0, 1.900958, .16, -32, null,
    'A single old-wood load/creak, not an impact or a scare accent.'),
  clip('room-a', 'room', 'communion-room-tone', 0, 8.2, .18, -37, null,
    'First occupied-silence section. Runtime should crossfade at the actual file boundary rather than hard-loop an encoder tail.'),
  clip('room-b', 'room', 'communion-room-tone', 8.2, 16.874667, .18, -37, null,
    'Second consecutive section of the same quiet congregation. No synthetic breath or added choir.'),
]);
