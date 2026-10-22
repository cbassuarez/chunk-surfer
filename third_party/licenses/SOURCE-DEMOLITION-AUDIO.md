# Source demolition material

Three sources, all CC0 1.0:
<https://creativecommons.org/publicdomain/zero/1.0/>.

| Source | Creator | Original source | Actual material |
| --- | --- | --- | --- |
| Urheilutalo Oulu 20221216 | Estormiz | <https://commons.wikimedia.org/wiki/File:Urheilutalo_Oulu_20221216.webm> | Original documentary video, own work, 16 December 2022. Its original stereo48kHzOpus sound is retained. Inspected frames show excavator restraint, panel peeling and falling debris while the curved roof frame remains standing. It does not document global frame collapse. |
| wood-impacts-breaking-stretching.wav | audioninja001 | <https://freesound.org/people/audioninja001/sounds/455073/> | Recorder identifies ZoomH5 and SennheiserMKE600. Licensed HQMP3 preview, discrete timber takes with digital gaps; processing history unspecified. The original uncompressed upload requires login and is not held. |
| rockfall2a.wav | AlanCat | <https://freesound.org/people/AlanCat/sounds/389303/> | Olympus LS-14 field recording of rocks cascading down a cliff; uploader removed background noise in Audacity. Licensed HQMP3 preview. A later isolated contact at4.9–6.9s is adapted as local masonry/debris, rather than presenting a timber crack as stone. It is not evidence of large-scale building fracture. |

Hashes, exact source offsets and source-page identities are generated into
`public/audio/source-demolition/manifest.json`. The new builder writes editable
24-bitPCM cuts under `artifacts/source-demolition/materials/`. Existing tower,
chapel, Ear and other Source banks are untouched.

Current first-shore adaptation: mono48kHz; source cuts; peak-constrained
levelling; edge fades;55Hzhigh-pass and9.5kHzlow-pass;112kbpsMP3. One continuous
Oulu23.35–28.85s panel-fall/settling passage supplies the body. Its recorded
low body receives a2.5dB shelf at165Hz and gentle1.7:1 RMS compression
(threshold.04,8msattack,160msrelease,knee2.5) before levelling. This is disclosed
dynamic treatment, not an unprocessed recording or manufactured sub-bass.
Original chronology and pitch remain. The runtime splits a filtered send from
that already-playing passage into the advancing front; it never restarts a
shifted Oulu tail as a second performance. Timber remains a smaller local
restraint/joint detail, and stone supplies its own contact.
Short facade reflections are procedural and unmeasured;
the authored travel-delay model does not measure the original camera delay.

The Oulu original is a lossy uploader video, not a microphonePCM master. The
existing project window-media manifest already identifies this exact original
file, SHA256 `b5187ee659ab82e7db905a154ec3b0de03a2ee686faa3cc527ddf41325666261`;
its shipped window derivatives were intentionally silent.

Research rejected onteca's “building collapse” recordings as physical-scale
evidence: their uploader describes slowed USB cables/computer screws and added
reverb. Cognito perceptu's genuine demolition recording remains an unused
candidate with a dense machinery background. St Brendan's edited rockfall and
floorboard cues are not reused automatically. Material review selected a new
4.9–6.9s contact from the rockfall source; the tower's0–2.95s cut and shipped
bank remain unchanged. This author-cleaned field source is expressly separated
from the unedited Oulu upload and unavailable microphone masters.

No author-listening, unfamiliar-player acceptance, measured room response,
complete structural-collapse recording or invented microphone master is claimed.

The encounter is now directly after the Source get-in on the first shore.
The former late-Outskirts arrangement has been removed from the playable
scope; its source/manifest/protocol evidence is archived in
`artifacts/source-demolition/late-audio-v1/`. Later captures of that old site
are historical evidence, not validation of this first-shore treatment.
