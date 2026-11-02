#!/usr/bin/env python3
"""Remix the prepared Source II performance without a second runtime clock.

Requires NumPy and FFmpeg. Supply Demucs' separately estimated vocals as --voice.
The complement is original - estimated voice, so unity summing reconstructs
the unchanged prepared performance. No EQ is described as source separation.
Models are authoring dependencies and are never bundled in the game.
"""
from pathlib import Path
import argparse, hashlib, json, math, re, subprocess
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SR = 44100


def decode(path):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'])
    audio = np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
    if not np.all(np.isfinite(audio)):
        raise ValueError('Nonfinite source samples: ' + str(path))
    return audio


def encode(path, audio, codec):
    path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-',
                    *codec, str(path)], input=np.asarray(audio, dtype='<f4').tobytes(), check=True)


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def amplitude(audio):
    peak = float(np.max(np.abs(audio)))
    rms = math.sqrt(float(np.mean(np.square(audio, dtype=np.float64))))
    return {'samplePeak': peak, 'samplePeakDbfs': 20 * math.log10(max(peak, 1e-12)),
            'rmsDbfs': 20 * math.log10(max(rms, 1e-12)), 'nonfinite': int(np.count_nonzero(~np.isfinite(audio))),
            'clipped': int(np.count_nonzero(np.abs(audio) >= 1))}


def loudness(path):
    run = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path),
                          '-af', 'loudnorm=I=-23:TP=-1:LRA=7:print_format=json', '-f', 'null', '-'],
                         capture_output=True, text=True, check=True)
    data = json.loads(re.findall(r'\{[^{}]+\}', run.stderr)[-1])
    return {k: float(data['input_' + v]) for k, v in [('integratedLufs', 'i'), ('truePeakDbtp', 'tp'), ('loudnessRangeLu', 'lra')]}


def mix(source, voice, voice_gain_db=3):
    if source.shape != voice.shape:
        raise ValueError('Stem samples/channels differ; do not hide a timing mismatch by stretching or padding.')
    residual = source - voice
    programme = residual + voice * (10 ** (voice_gain_db / 20))
    peak = float(np.max(np.abs(programme)))
    trim = min(1, .95 / max(peak, 1e-12))
    return residual, programme * trim, trim


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'public/audio/source-rest/seb-bach-chaconne-105.mp3')
    parser.add_argument('--voice', type=Path, default=ROOT / 'artifacts/source-rest-voice/separation/htdemucs/seb-bach-chaconne-105/vocals.wav')
    parser.add_argument('--settings', type=Path, default=ROOT / 'tools/chunk_surfer/source-rest-voice-mix.json')
    parser.add_argument('--voice-gain-db', type=float, help='Override the editable settings file for this render.')
    parser.add_argument('--speech-windows', type=Path, help='Optional reviewed speech intervals JSON; all model vocals retained if omitted.')
    parser.add_argument('--stems-dir', type=Path, default=ROOT / 'artifacts/source-rest-voice/stems')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/source-rest-voice/seb-bach-chaconne-105-voice-mix.mp3')
    parser.add_argument('--manifest', type=Path, default=ROOT / 'artifacts/source-rest-voice/voice-mix.json')
    parser.add_argument('--model-file', type=Path, default=Path('/private/tmp/chunk-surfer-voice-separation-20261101/torch/hub/checkpoints/955717e8-8726e21a.th'))
    parser.add_argument('--review-start', type=float, default=0)
    parser.add_argument('--review-seconds', type=float, default=24)
    args = parser.parse_args()
    settings = json.loads(args.settings.read_text())
    if args.voice_gain_db is None:
        args.voice_gain_db = float(settings['voiceGainDb'])
    if not math.isfinite(args.voice_gain_db):
        raise ValueError('Voice gain must be a finite number.')
    if args.output.resolve() in [args.source.resolve(), args.voice.resolve()]:
        raise ValueError('The original performance and separated estimate must remain untouched.')
    source, voice = decode(args.source), decode(args.voice)
    intervals = None
    if args.speech_windows:
        intervals = json.loads(args.speech_windows.read_text())['windows']
        if not intervals:
            raise ValueError('No speech windows were established; do not silently ship an unchanged voice remix.')
        envelope = np.zeros(len(voice), dtype=np.float32)
        for span in intervals:
            first, last = max(0, round(span['start'] * SR)), min(len(voice), round(span['end'] * SR))
            if last <= first:
                continue
            fade = min(round(.08 * SR), (last - first) // 2)
            shape = np.ones(last - first, dtype=np.float32)
            shape[:fade] = np.linspace(0, 1, fade) ** 2 * (3 - 2 * np.linspace(0, 1, fade))
            shape[-fade:] = shape[:fade][::-1]
            envelope[first:last] = np.maximum(envelope[first:last], shape)
        voice *= envelope[:, None]
    residual, programme, trim = mix(source, voice, args.voice_gain_db)
    args.stems_dir.mkdir(parents=True, exist_ok=True)
    voice_path, residual_path = args.stems_dir / 'voice.flac', args.stems_dir / 'marimba-residual.flac'
    flac = ['-codec:a', 'flac', '-sample_fmt', 's32', '-bits_per_raw_sample', '24']
    encode(voice_path, voice, flac)
    encode(residual_path, residual, flac)
    encode(args.output, programme, ['-codec:a', 'libmp3lame', '-b:a', '256k'])
    decoded_mix = decode(args.output)
    if decoded_mix.shape != source.shape:
        raise ValueError('The programme does not retain the prepared recording sample duration.')
    roundtrip = decode(voice_path) + decode(residual_path)
    null_peak = float(np.max(np.abs(roundtrip - source)))
    review_start = max(0, min(len(source), round(args.review_start * SR)))
    review_end = min(len(source), review_start + round(args.review_seconds * SR))
    for name, data in [('original', source), ('voice-final-gain', voice * (10 ** (args.voice_gain_db / 20))), ('marimba-residual', residual), ('remix', programme)]:
        encode(args.stems_dir.parent / 'review' / (name + '.wav'), data[review_start:review_end], ['-codec:a', 'pcm_s24le'])
    model = {'name': 'Demucs 4.0.1 / htdemucs', 'checkpoint': '955717e8-8726e21a.th',
             'checkpointSha256': digest(args.model_file) if args.model_file.is_file() else None,
             'source': 'https://github.com/facebookresearch/demucs', 'license': 'MIT (official project LICENSE)',
             'weights': 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/955717e8-8726e21a.th',
             'command': 'python -m demucs.separate -n htdemucs --device cpu --shifts 0 --two-stems vocals --float32 --jobs 1 --segment 7'}
    report = {'version': 1, 'runtimeAdoption': 'PENDING_TARGETED_VOICE_REVIEW',
              'status': 'PROVISIONAL_SOURCE_ESTIMATE_NOT_DEPLOYED',
              'preparedSource': args.source.relative_to(ROOT).as_posix(), 'preparedSourceSha256': digest(args.source),
              'authorship': 'User-supplied performance; existing prepared105 recording retained unchanged.',
              'output': args.output.relative_to(ROOT).as_posix(), 'outputSha256': digest(args.output),
              'sampleRate': SR, 'channels': 2, 'decodedFrames': len(source), 'durationSeconds': len(source) / SR,
              'voiceGainDb': args.voice_gain_db, 'programmeTrimDb': 20 * math.log10(trim),
              'mixSettings': args.settings.relative_to(ROOT).as_posix(), 'mixSettingsSha256': digest(args.settings),
              'separation': model, 'speechWindows': intervals, 'method': 'Estimated human-voice source; residual = prepared original - estimate; no EQ-only isolation claim.',
              'stems': {name: {'path': str(path.relative_to(ROOT)), 'sha256': digest(path)} for name, path in [('voice', voice_path), ('marimbaResidual', residual_path)]},
              'measurements': {'original': amplitude(source), 'estimatedVoice': amplitude(voice), 'residual': amplitude(residual),
                               'programmeFloat': amplitude(programme), 'programmeDecoded': amplitude(decoded_mix),
                               'unityStemNullPeak': null_peak, 'originalLoudness': loudness(args.source), 'programmeLoudness': loudness(args.output)},
              'review': {'startSeconds': review_start / SR, 'durationSeconds': (review_end - review_start) / SR,
                         'gain': 'Original/remix at their actual programme levels; voice-only uses the final relative voice gain.',
                         'listening': 'PENDING', 'nativePlayback': 'PENDING', 'playerValidation': 'PENDING'},
              'uncertainties': ['The separator estimates a voice source; marimba/room bleed and speech remaining in the residual require authoring listening.',
                                'No clean independently recorded voice master exists for a source-to-source separation metric.',
                                'Single-stream programme preserves transport/score timestamps; numeric checks do not prove perceived quality.']}
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['output', 'durationSeconds', 'voiceGainDb', 'programmeTrimDb', 'measurements', 'review']}, indent=2))


if __name__ == '__main__':
    main()
