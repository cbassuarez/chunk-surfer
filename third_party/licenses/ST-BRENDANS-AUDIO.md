# St Brendan's physical-material sound bank

All five sources are CC0 1.0: <https://creativecommons.org/publicdomain/zero/1.0/>.
The preserved Freesound source pages explicitly identify that dedication. These
are high-quality MP3 previews, not the original uncompressed uploads. Source and
page hashes are in `artifacts/st-brendans/audio-build.json`; the source metadata
and exact excerpt ranges live in `src/data/st-brendans-audio.js`.

| Source | Creator | Primary source | Adaptation |
| --- | --- | --- | --- |
| Wood Creak Single V7 | Rudmer_Rotteveel | <https://freesound.org/people/Rudmer_Rotteveel/sounds/506662/> | A wooden floorboard creak used as loaded frame timber. Not recorded in a tower. |
| ROPE_GOES_TIGHT.WAV | dansotak | <https://freesound.org/people/dansotak/sounds/137711/> | Excerpts of real rope tension, used when the existing apparatus swings. |
| Metallic creak.wav | Crinkem | <https://freesound.org/people/Crinkem/sounds/481786/> | A door latch recorded on Sony PCM-A10, adapted as a short iron/bearing contact. |
| Window Wind.aif | vuzz | <https://freesound.org/people/vuzz/sounds/9097/> | Cold windy night through a small window opening, located at belfry louvres. |
| rockfall2a.wav | AlanCat | <https://freesound.org/people/AlanCat/sounds/389303/> | Rocks falling down a cliff, Olympus LS-14; source author removed background noise in Audacity. First short cascade adapted for existing stone breaks/debris. |

Processing: mono, 48 kHz, 112 kbps MP3; excerpts, conservative levelling, edge
fades, high/low-pass. No pitch/time changes, reversal, bitcrush, synthesized
mechanism or baked room tail. Runtime room responses are deterministic
procedural approximations and must not be described as measured responses.

The existing tonal bell bank is unchanged. See
`public/assets/audio/bell-tower/credits.json`: Joseph SARDIN and Axeline T., CC0,
BigSoundBank/LaSonotheque. It is explicitly a clock-hammer-derived prototype,
pitch-scaled to the eight notes, not eight independently recorded full-circle
English bells. We preserve that limitation rather than misrepresent it.

Rejected: florianreichelt's CC0 “Soft Wind” was fetched during research but its
recording method was less specific. It is not in the shipped bank; the window
recording gives the aperture sound a documented physical origin.
The iwanPlays “Bricks/Stones/Rocks/Gravel Falling” composite was also fetched but
not shipped; the single original AlanCat field recording has clearer provenance.

No voices, choir, Mass, music, screams, extra bell alarms or semantic gameplay
noise events are introduced by this bank. Source-bank and in-game author
listening, and unfamiliar-player validation, remain pending until performed.
