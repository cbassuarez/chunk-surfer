#!/usr/bin/env python3
"""Build an editable, unwarped source arrangement; never launches Live.

Requires the source bank builder first. Uses only generic XML structure from
installed Live12 templates via this project's existing set writer. This is an
authoring fixture, not a render of the moving listener or black-pocket entry.
"""
import importlib.util
import json
import math
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = ROOT / 'artifacts/source-demolition'
MATERIALS = HERE / 'materials'


def main():
    spec = importlib.util.spec_from_file_location('project_live_writer',
        ROOT / 'tools/chunk_surfer/build-apparition-applause-live.py')
    writer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(writer)
    # Avoid inheriting any old encounter's media or credit locations.
    writer.MATERIALS = MATERIALS
    manifest = json.loads((ROOT / 'public/audio/source-demolition/manifest.json').read_text())
    gains = {c['id']: c['gain'] for c in manifest['clips']}
    cue_plan = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
        "import {SOURCE_DEMOLITION_CUES as cues} from './src/data/source-demolition.js'; process.stdout.write(JSON.stringify(cues));"], cwd=ROOT))
    cues = {cue['type']: cue for cue in cue_plan}
    commit = 0
    wood = HERE / 'sources/wood-audioninja/source-preview.mp3'
    wood_pcm = HERE / 'sources/wood-audioninja/preview-decoded-unedited.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wood),
        '-c:a', 'pcm_s24le', str(wood_pcm)], check=True)
    # The send is the corresponding interval of the ongoing material source.
    # This study omits moving HRTF and the runtime consumption/protection gates.
    residual = MATERIALS / 'residual-band-authoring.wav'
    offset = 0
    duration = next(c['duration'] for c in manifest['clips'] if c['id'] == 'failure-body')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(offset), '-i',
        str(MATERIALS / 'failure-body.wav'), '-t', str(duration), '-af',
        f'highpass=f=1050,lowpass=f=5400,afade=t=in:d=0.18,afade=t=out:st={duration-.22}:d=0.22',
        '-c:a', 'pcm_s24le', str(residual)], check=True)
    (MATERIALS / 'CREDITS.md').write_text((ROOT / 'third_party/licenses/SOURCE-DEMOLITION-AUDIO.md').read_text())
    support = []
    for name, offset, duration in [('a', 0, .85), ('b', .85, .75)]:
        cut = MATERIALS / f'controlled-support-{name}-authoring.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-threads', '1', '-y', '-ss', str(offset),
            '-i', str(MATERIALS / 'restraint.wav'), '-t', str(duration), '-af',
            f'afade=t=in:d=0.008,afade=t=out:st={duration-.22}:d=0.22', '-c:a', 'pcm_s24le', str(cut)], check=True)
        support.append(cut)
    tracks = []
    def lane(name, id_, file, at, gain, role='physical-material', offset=0, duration=None, muted=False):
        clip = {'file': str(file.relative_to(HERE)), 'atSeconds': at,
            'offsetSeconds': offset, 'gainDb': 20 * math.log10(gain), 'name': name}
        if duration is not None: clip['durationSeconds'] = duration
        tracks.append({'id': id_, 'name': name, 'role': role, 'muted': muted,
            'annotation': 'Unwarped source. No 3D placement, recording gate or black-pocket drain in this authoring set.',
            'clips': [clip]})
    lane('01 SUPPORT A — recorded0–.85s', 'support-a', support[0], commit, gains['restraint'] * .62)
    lane('02 SUPPORT B — recorded.85–1.6s', 'support-b', support[1], commit + cues['infill']['at'], gains['restraint'] * cues['infill']['gain'] * 1.1)
    lane(f"03 ONE DOWNWARD BODY — commit +{cues['release']['at']:g}", 'release', MATERIALS / 'failure-body.wav', commit + cues['release']['at'], gains['failure-body'] * cues['release']['gain'])
    lane('04 RESIDUAL SEND — same running source', 'residual', residual, commit + cues['release']['at'], gains['failure-body'] * cues['release']['gain'] * .20 * cues['release']['gain'], 'derived-material-residual')
    lane('05 OULU ORIGINAL AUDIO — MUTED', 'oulu-reference', HERE / 'sources/oulu/original-audio.wav', 0, 1, 'source-reference', muted=True)
    lane('06 WOOD PREVIEW DECODE — MUTED', 'wood-reference', wood_pcm, 0, 1, 'source-reference', muted=True)
    stone_pcm = HERE / 'sources/stone-field/preview-decoded-unedited-by-project.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(HERE / 'sources/stone-field/source-preview.mp3'),
        '-c:a', 'pcm_s24le', str(stone_pcm)], check=True)
    lane('07 STONE FIELD PREVIEW — MUTED', 'stone-reference', stone_pcm, 0, 1, 'source-reference', muted=True)
    score = {'schema': 1, 'name': 'Source Demolition - Editable Material Study', 'tempo': 60,
        'masterGainDb': -6, 'annotation':
        'AUTHORING FIXTURE. Oct23 controlled timing revision: disjoint recorded support0–.85s at strain and.85–1.6s at infill1s; held gap; '
        'main body and same-source residual begin at actual aperture release3.15s. Course/roof are continuations, not separate hits. '
        'Commit at0s represents the actual outward capsule exit from the Source get-in. '
        'Actual game mixes fixed world anchors and a moving material residual, then drains on real black-pocket entry. '
        'This set has no runtime HRTF, procedural reflection model, protection gates or consumption envelope. '
        'Support segments are adjacent in the raw source, independently event-driven, with short edge fades and no repeated raw interval. '
        'Original upload and two preview references muted. No pitch/warp. Author listening and opening in Live pending.',
        'authoredTimingRevision': '2026-10-23 disjoint support0–.85 / .85–1.6; held load; body3.15',
        'supportSourceIntervals': [{'event': 'strain', 'fromSeconds': 0, 'toSeconds': .85}, {'event': 'infill', 'fromSeconds': .85, 'toSeconds': 1.6}],
        'continuationEvents': [{ 'type': kind, 'atSeconds': cues[kind]['at'], 'newAudioSource': False } for kind in ['course', 'roof']],
        'tracks': tracks}
    (HERE / 'live-score.json').write_text(json.dumps(score, indent=2) + '\n')
    output, report = writer.build(score, HERE, HERE / 'live-session')
    (HERE / 'live-session' / 'README.md').write_text(
        '# Source demolition authoring arrangement\n\n'
        'Oct23 controlled timing: two disjoint chronological cuts of the same recorded support run at strain (raw0–.85s) and infill (raw.85–1.6s). A held gap precedes the one main body at3.15s. '
        'Course and roof do not add independent hits. Short source-edge fades introduce no shared raw interval or replayed tail. '
        'Editable unwarped source cuts and three muted source references. Commit at0s represents the actual Source doorway exit. '
        'This is not the game mix: use actual encounter output to assess placement, attenuation, reflections and the '
        'black-pocket tail. The residual lane is the corresponding simultaneous interval of the one playing failure body.\n\n'
        'Generated from generic installed Live12 XML templates. No Ableton audio, plugin or preset is copied. '
        'All inputs are collected under Samples/Imported; original credits are beside the set. '
        'The application has not been opened and no perceptual listening approval is claimed.\n')
    print(json.dumps({'session': str(output.relative_to(ROOT)), 'tracks': len(report['tracks']),
        'clips': sum(len(t['clips']) for t in report['tracks']), 'media': len(report['media']),
        'structureVerified': report['structureVerified'], 'openedInLive': False, 'listened': False}, indent=2))


if __name__ == '__main__':
    main()
