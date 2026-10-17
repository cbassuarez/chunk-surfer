# Applause source credits

All retained source recordings are **CC BY 4.0**: <https://creativecommons.org/licenses/by/4.0/>. Retain these credits with the shipped audio and editable session. No creator endorses this game.

- **Anechoic Handclaps** (2026), Kyung Yun Lee, Shih-Yu Lai, Eloi Moliner, Nils Meyer-Kahlen. <https://doi.org/10.5281/zenodo.22892926>. Twenty-four original unchanged 8-channel natural-clap events from participants 01, 05, 09 and 13 retained: six distinct takes (01–06) per performer. Audition copies select channel 0, peak-scale to -12 dBFS, and convert to mono 16-bit PCM.
- **A dataset of measured spatial room impulse responses for the transition between coupled rooms**, v1.2 (2021), Thomas McKenzie, Sebastian J. Schlecht, Ville Pulkki. <https://doi.org/10.5281/zenodo.4636068>. Original unchanged 25-channel meeting-room measurement at trajectory coordinate 30 cm, source in meeting room with continuous line of sight.
- **Hoffmann Lime Kiln** (2017), Jack Smith, Juan García, Hashim Riaz, Pau Rosell; Audiolab, University of York / www.openairlib.net. <https://www.openair.hosted.york.ac.uk/?page_id=518>. Original unchanged 4-channel B-format measurement, position 2.

Any runtime derivatives must add their own change notice (channel selection/decoding, resampling, envelope edits, convolution, layering, normalization and trimming as actually applied). The originals here remain unchanged. The scientific releases already include calibration/segmentation or measurement deconvolution and windowing: they are not untouched continuous microphone recordings.

Machine signal inspection is complete. The user auditioned the four isolated source claps on 2026-10-17 and reported clicks / an overly synthetic presentation, requesting a short tail, slight reverberation and placement. This establishes source-only formative feedback. Model listening remains unavailable; IR listening, final cue approval and fresh-player validation are not claimed. See provenance.json for exact source member names, SHA-256 hashes, acquisition checks and limitations.

## Runtime derivative changes

Twenty-four distinct natural claps from four performers were selected on original channel 0, resampled to 48 kHz, tapered only over their final 3 ms, peak-scaled to -12 dBFS and stored as mono 24-bit PCM. No attack blur, pitch shift, time stretching or generated hand sound. The measured omnidirectional W responses retain their file-start timing, are cut to 0.52 s (meeting) and 0.88 s (kiln), end-tapered over 40 ms, and normalized to unit discrete energy. Ordinary uses the meeting response. Treatment combines 0.83 meeting + 0.30 kiln. These are imported acoustic references, not a measurement of the game room or evidence of a concert hall. Each condition uses the same 24 hand events (six per person), with its own timing and one constant level-match gain; no limiter or dynamic normalization. See manifest.json and the render report for hashes and exact gains.

## V1 listening rejection

The user auditioned the placed v1 cue and reported “sounds more like popcorn”. This composition failed applause recognition and is retained as rejected evidence, not an approved production cue. Fresh-player testing remains pending.
