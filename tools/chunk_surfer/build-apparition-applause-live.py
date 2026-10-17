#!/usr/bin/env python3
"""Create a native, editable Live 12 Intro audio arrangement from a JSON score.

All audio belongs to this project. Only generic set/clip XML is taken from the
locally installed Live templates; no Ableton demo audio or devices are copied.
Opening in Live and listening are separate acceptance steps, never implied here.

Manifest schema 1:
  {"schema":1,"name":"Apparition applause","tempo":60,
   "annotation":"Source listening pending",
   "tracks":[{"id":"person-01","name":"01 HUMAN HANDS","role":"dry",
     "muted":true,"volumeDb":0,"pan":0,"clips":[
       {"file":"relative/to/manifest.wav","atSeconds":0.5,
        "offsetSeconds":0,"durationSeconds":0.06,"gainDb":0,
        "name":"Individual editable human clap"}]}]}

Exactly one alternative wet lane may be enabled by the manifest. Dry/source and
reference tracks default to muted. Inputs are collected into Samples/Imported;
all generated set file references are project-relative and warp is disabled.
"""
from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
import math
import pathlib
import re
import shutil
import struct
import subprocess
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[2]
LIVE = pathlib.Path('/Applications/Ableton Live 12 Intro.app/Contents/App-Resources')
DEFAULT_TEMPLATE = LIVE / 'Builtin/Templates/DefaultLiveSet.als'
SET_TEMPLATE = LIVE / 'Core Library/Lessons/Sets/Recording Audio.als'
CLIP_TEMPLATE = LIVE / 'Core Library/Ableton Folder Info/Sample Reference.als'
OUTPUT = ROOT / 'artifacts/apparition-applause/live-session'
MATERIALS = ROOT / 'artifacts/apparition-applause/materials'


def number(value: float) -> str:
    value = float(value)
    if not math.isfinite(value):
        raise ValueError('All times and gains must be finite')
    return format(value, '.15g')


def value(element: ET.Element, path: str, setting) -> ET.Element:
    node = element.find(path)
    if node is None:
        parent_path, _, name = path.rpartition('/')
        parent = element.find(parent_path) if parent_path else element
        if parent is None:
            raise ValueError(f'Missing required template parent: {path}')
        node = ET.SubElement(parent, name)
    node.set('Value', str(setting).lower() if isinstance(setting, bool) else str(setting))
    return node


def read_set(path: pathlib.Path) -> ET.Element:
    return ET.fromstring(gzip.decompress(path.read_bytes()))


def pcm_info(path: pathlib.Path) -> dict:
    """Inspect PCM/IEEE WAV without mistaking multichannel data for stereo."""
    data = path.read_bytes()
    if data[:4] != b'RIFF' or data[8:12] != b'WAVE':
        raise ValueError(f'Expected WAV: {path}')
    offset = 12
    fmt = None
    frames = None
    while offset + 8 <= len(data):
        tag, size = struct.unpack_from('<4sI', data, offset)
        start = offset + 8
        if tag == b'fmt ':
            fmt = struct.unpack_from('<HHIIHH', data, start)
        elif tag == b'data':
            if fmt is None:
                raise ValueError(f'WAV data before format: {path}')
            frames = size // fmt[4]
        offset = start + size + (size & 1)
    if fmt is None or frames is None:
        raise ValueError(f'Incomplete WAV: {path}')
    return {'format': fmt[0], 'channels': fmt[1], 'sampleRate': fmt[2],
            'bits': fmt[5], 'frames': frames, 'seconds': frames / fmt[2],
            'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


def collect_audio(source: pathlib.Path, directory: pathlib.Path,
                  channel: int | None = None) -> tuple[pathlib.Path, dict]:
    source = source.resolve(strict=True)
    original = pcm_info(source)
    if channel is not None and not 0 <= channel < original['channels']:
        raise ValueError(f'Invalid channel {channel}: {source}')
    if original['channels'] > 2 and channel is None:
        raise ValueError(f'Multichannel input requires explicit channel selection: {source}')
    suffix = f'-ch{channel}' if channel is not None else ''
    stem = re.sub(r'[^a-zA-Z0-9_.-]+', '-', source.stem)
    name = f'{stem[:90]}{suffix}-{original["sha256"][:10]}.wav'
    target = directory / name
    if channel is not None:
        command = ['ffmpeg', '-v', 'error', '-y', '-i', str(source),
                   '-af', f'pan=mono|c0=c{channel}', '-c:a', 'pcm_s24le', str(target)]
        subprocess.run(command, check=True)
        changes = f'Selected original channel {channel}; converted to 24-bit PCM. No gain or rate change.'
    else:
        shutil.copyfile(source, target)
        changes = 'Unchanged copy.'
    info = pcm_info(target)
    return target, {**info, 'source': str(source), 'sourceSha256': original['sha256'],
                    'changes': changes}


class Ids:
    def __init__(self, start=40000):
        self.next = start

    def allocate(self):
        result = self.next
        self.next += 1
        return result

    def remap_track(self, track):
        mapping = {}
        for node in track.iter():
            if node.tag == 'Pointee' or node.tag.endswith('Target'):
                if 'Id' in node.attrib:
                    old = node.get('Id')
                    new = self.allocate()
                    mapping[old] = str(new)
                    node.set('Id', str(new))
        for node in track.iter():
            if node.tag == 'PointeeId' and node.get('Value') in mapping:
                node.set('Value', mapping[node.get('Value')])


def make_clip(template, clip, media, at, offset, duration, bpm, clip_id):
    result = copy.deepcopy(template)
    beats = bpm / 60
    result.set('Id', str(clip_id))
    result.set('Time', number(at * beats))
    value(result, 'CurrentStart', number(at * beats))
    value(result, 'CurrentEnd', number((at + duration) * beats))
    # Unwarped Live clips use seconds for their sample-loop markers.
    for key, setting in [('LoopStart', offset), ('LoopEnd', offset + duration),
                         ('StartRelative', 0), ('OutMarker', media['seconds']),
                         ('HiddenLoopStart', offset), ('HiddenLoopEnd', media['seconds'])]:
        value(result, 'Loop/' + key, number(setting))
    value(result, 'Loop/LoopOn', False)
    value(result, 'Name', clip.get('name', pathlib.Path(clip['file']).stem))
    value(result, 'Annotation', clip.get('annotation', 'Editable source clip; warp disabled.'))
    value(result, 'Color', clip.get('color', 20))
    value(result, 'IsWarped', False)
    value(result, 'Fade', False)
    value(result, 'SampleVolume', number(10 ** (float(clip.get('gainDb', 0)) / 20)))
    value(result, 'PitchCoarse', 0)
    value(result, 'PitchFine', 0)
    value(result, 'Disabled', False)
    value(result, 'FreezeStart', 0)
    value(result, 'FreezeEnd', 0)
    value(result, 'LaunchQuantisation', 0)
    value(result, 'FollowAction/FollowActionEnabled', False)
    value(result, 'ScrollerTimePreserver/LeftTime', 0)
    value(result, 'ScrollerTimePreserver/RightTime', number(media['seconds']))
    value(result, 'TimeSelection/AnchorTime', 0)
    value(result, 'TimeSelection/OtherTime', 0)
    value(result, 'Grid/SnapToGrid', False)
    for path in ['Envelopes/Envelopes', 'WarpMarkers', 'SavedWarpMarkersForStretched',
                 'SampleRef/SourceContext', 'Onsets/UserOnsets']:
        node = result.find(path)
        if node is not None:
            node.clear()
    markers = result.find('WarpMarkers')
    ET.SubElement(markers, 'WarpMarker', Id='0', SecTime='0', BeatTime='0')
    ET.SubElement(markers, 'WarpMarker', Id='1', SecTime=number(media['seconds']),
                  BeatTime=number(media['seconds'] * beats))
    value(result, 'MarkersGenerated', True)
    ref = result.find('SampleRef')
    file_ref = ref.find('FileRef')
    file_ref.clear()
    for key, setting in [('RelativePathType', 3), ('RelativePath', media['relativePath']),
                         ('Path', ''), ('Type', 2), ('LivePackName', ''), ('LivePackId', ''),
                         ('OriginalFileSize', media['bytes']), ('OriginalCrc', 0),
                         ('SourceHint', '')]:
        value(file_ref, key, setting)
    for key, setting in [('LastModDate', 0), ('DefaultDuration', media['frames']),
                         ('DefaultSampleRate', media['sampleRate']), ('SamplesToAutoWarp', 0)]:
        value(ref, key, setting)
    return result


def default_manifest():
    tracks = []
    for index, participant in enumerate((1, 5, 9, 13)):
        tracks.append({'id': f'person-{participant:02}', 'role': 'dry',
                       'name': f'{index + 1:02} HUMAN {participant:02} - SOURCE', 'muted': True,
                       'clips': [{'file': str(MATERIALS / f'handclap-participant-{participant:02}-normal-01-audition-ch0-minus12dbfs.wav'),
                                  'atSeconds': .5 + index, 'name': f'Human {participant:02}; audition only'}]})
    tracks += [{'id': 'ordinary-wet', 'name': '05 ORDINARY WET - UNCOMPOSED',
                'role': 'ordinary-wet', 'muted': True, 'clips': []},
               {'id': 'treatment-wet', 'name': '06 TREATMENT WET - UNCOMPOSED',
                'role': 'treatment-wet', 'muted': True, 'clips': []}]
    for index, (name, file) in enumerate((('MEETING W REFERENCE', 'meeting-room-30cm-original-25ch.wav'),
                                         ('KILN W REFERENCE', 'hoffmann-kiln-p2-original-bformat.wav'))):
        tracks.append({'id': f'ir-{index}', 'name': f'{index + 7:02} {name}',
                       'role': 'reference-ir', 'muted': True,
                       'clips': [{'file': str(MATERIALS / file), 'channel': 0, 'atSeconds': 0,
                                  'name': name + '; diagnostic, muted'}]})
    return {'schema': 1, 'name': 'Apparition Applause - Source Scaffold', 'tempo': 60,
            'masterGainDb': -6,
            'annotation': 'Source audition scaffold. All lanes muted. No composition or listening approval is claimed.',
            'tracks': tracks}


def build(manifest, manifest_base, output):
    if manifest.get('schema') != 1:
        raise ValueError('Expected manifest schema 1')
    tracks_spec = manifest['tracks']
    if not 1 <= len(tracks_spec) <= 16:
        raise ValueError('Live Intro session must have 1-16 tracks')
    alternatives = [t for t in tracks_spec if t.get('role') in ('ordinary-wet', 'treatment-wet')
                    and not t.get('muted', True)]
    if len(alternatives) > 1:
        raise ValueError('Ordinary and treatment wet alternatives cannot both start enabled')
    bpm = float(manifest.get('tempo', 60))
    if not 20 <= bpm <= 999:
        raise ValueError('Tempo outside Live range')
    # Read both requested installed templates; use current-version empty audio track
    # from the recording lesson and an unwarped generic clip from Sample Reference.
    default = read_set(DEFAULT_TEMPLATE)
    tree = read_set(SET_TEMPLATE)
    clip_tree = read_set(CLIP_TEMPLATE)
    clip_template = next(c for c in clip_tree.findall('.//AudioClip')
                         if c.find('IsWarped').get('Value') == 'false')
    live_set = tree.find('LiveSet')
    tracks = live_set.find('Tracks')
    track_template = copy.deepcopy(tracks.find('AudioTrack'))
    tracks.clear()
    for devices in tree.findall('.//Devices'):
        devices.clear()
    for sends in tree.findall('.//Sends'):
        sends.clear()
    live_set.find('SendsPre').clear()
    for node in live_set.findall('.//AutomationEnvelopes/Envelopes'):
        node.clear()
    for path in ['SignalModulations', 'Locators/Locators', 'LinkedTrackGroups']:
        node = live_set.find(path)
        if node is not None:
            node.clear()
    value(live_set, 'Annotation', manifest.get('annotation', ''))
    value(live_set, 'SelectedDocumentViewInMainWindow', 0)
    value(live_set, 'HighlightedTrackIndex', 0)
    value(live_set, 'SnapAutomationToGrid', False)
    value(live_set, 'Transport/LoopOn', False)
    value(live_set, 'Transport/CurrentTime', 0)
    value(live_set, 'Transport/LoopStart', 0)
    value(live_set, 'MainTrack/DeviceChain/Mixer/Tempo/Manual', number(bpm))
    # Keep the final matched stems at their authored level. Source-only scaffolds
    # can request a lower audition level explicitly without changing final sets.
    master_gain_db = float(manifest.get('masterGainDb', 0))
    value(live_set, 'MainTrack/DeviceChain/Mixer/Volume/Manual', number(10 ** (master_gain_db / 20)))
    output.mkdir(parents=True, exist_ok=True)
    # Live identifies the base for RelativePathType=3 from this folder marker.
    # Ableton's Missing Media Files guidance explicitly prescribes recreating it.
    (output / 'Ableton Project Info').mkdir(exist_ok=True)
    imported = output / 'Samples/Imported'
    imported.mkdir(parents=True, exist_ok=True)
    ids = Ids()
    media_cache = {}
    report_tracks = []
    end_seconds = 5.0
    for index, spec in enumerate(tracks_spec):
        track = copy.deepcopy(track_template)
        track.set('Id', str(100 + index))
        ids.remap_track(track)
        value(track, 'Name/EffectiveName', spec['name'])
        value(track, 'Name/UserName', spec['name'])
        value(track, 'Name/Annotation', spec.get('annotation', spec.get('role', 'audio')))
        value(track, 'Name/MemorizedFirstClipName', '')
        value(track, 'Color', spec.get('color', (index * 8) % 70))
        value(track, 'DeviceChain/Mixer/Speaker/Manual', not spec.get('muted', True))
        value(track, 'DeviceChain/Mixer/Volume/Manual', number(10 ** (float(spec.get('volumeDb', 0)) / 20)))
        value(track, 'DeviceChain/Mixer/Pan/Manual', number(spec.get('pan', 0)))
        value(track, 'DeviceChain/MainSequencer/MonitoringEnum', 2)
        value(track, 'DeviceChain/MainSequencer/Recorder/IsArmed', False)
        track.find('DeviceChain/Mixer/Sends').clear()
        track.find('DeviceChain/DeviceChain/Devices').clear()
        events = track.find('DeviceChain/MainSequencer/Sample/ArrangerAutomation/Events')
        events.clear()
        track_report = {'id': spec.get('id', str(index)), 'name': spec['name'],
                        'muted': spec.get('muted', True), 'clips': []}
        for clip_index, clip in enumerate(spec.get('clips', [])):
            source = pathlib.Path(clip['file'])
            if not source.is_absolute():
                source = manifest_base / source
            cache_key = (str(source.resolve()), clip.get('channel'))
            if cache_key not in media_cache:
                target, info = collect_audio(source, imported, clip.get('channel'))
                info['relativePath'] = target.relative_to(output).as_posix()
                media_cache[cache_key] = info
            media = media_cache[cache_key]
            at = float(clip.get('atSeconds', 0))
            offset = float(clip.get('offsetSeconds', 0))
            duration = float(clip.get('durationSeconds', media['seconds'] - offset))
            if at < 0 or offset < 0 or duration <= 0 or offset + duration > media['seconds'] + 1e-7:
                raise ValueError(f'Invalid clip interval: {clip}')
            events.append(make_clip(clip_template, clip, media, at, offset, duration, bpm, clip_index))
            track_report['clips'].append({'atSeconds': at, 'offsetSeconds': offset,
                                           'durationSeconds': duration, 'file': media['relativePath'],
                                           'gainDb': clip.get('gainDb', 0)})
            end_seconds = max(end_seconds, at + duration)
        tracks.append(track)
        report_tracks.append(track_report)
    value(live_set, 'NextPointeeId', ids.next + 100)
    value(live_set, 'Transport/LoopLength', number(end_seconds * bpm / 60))
    zoom = live_set.find('SequencerNavigator/BeatTimeHelper/CurrentZoom')
    if zoom is not None:
        zoom.set('Value', number(850 / max(5, end_seconds * bpm / 60)))
    # Sanity checks are structural acceptance only; actual Live acceptance is separate.
    for ref in tree.findall('.//FileRef'):
        assert ref.find('Path').get('Value') == ''
        relative = ref.find('RelativePath').get('Value')
        assert relative.startswith('Samples/Imported/') and (output / relative).is_file()
    assert not tree.findall('.//Devices/*')
    assert not tracks.findall('ReturnTrack')
    assert all(c.find('IsWarped').get('Value') == 'false' for c in tree.findall('.//AudioClip'))
    ET.indent(tree, space='\t')
    xml = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
    filename = re.sub(r'[^a-zA-Z0-9 _.-]+', '-', manifest.get('name', 'Apparition Applause')) + '.als'
    path = output / filename
    path.write_bytes(gzip.compress(xml, mtime=0))
    assert len(read_set(path).findall('.//AudioClip')) == sum(len(t['clips']) for t in report_tracks)
    report = {'schema': 1, 'session': path.name, 'tempo': bpm, 'tracks': report_tracks,
              'media': list(media_cache.values()), 'masterGainDb': master_gain_db,
              'structureVerified': True, 'openedInLive': False, 'listened': False,
              'templateProvenance': {'defaultRead': str(DEFAULT_TEMPLATE),
                  'emptyAudioSetShape': str(SET_TEMPLATE), 'unwarpedClipShape': str(CLIP_TEMPLATE),
                  'defaultVersion': default.attrib, 'sessionVersion': tree.attrib,
                  'note': 'Generic XML shape only. No factory audio, plugins, presets or demo content included.'}}
    # Keep a per-set audit as well as the latest build index when the treatment and
    # ordinary control share one project/media directory.
    stem = path.stem
    report['sessionSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
    (output / f'{stem}.build-report.json').write_text(json.dumps(report, indent=2))
    (output / f'{stem}.manifest.json').write_text(json.dumps(manifest, indent=2))
    (output / 'session-build-report.json').write_text(json.dumps(report, indent=2))
    (output / 'session-manifest.json').write_text(json.dumps(manifest, indent=2))
    credits = MATERIALS / 'CREDITS.md'
    if credits.exists():
        shutil.copyfile(credits, output / 'SOURCE-CREDITS.md')
    return path, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', type=pathlib.Path)
    parser.add_argument('--output-dir', type=pathlib.Path, default=OUTPUT)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text()) if args.manifest else default_manifest()
    base = args.manifest.resolve().parent if args.manifest else ROOT
    path, report = build(manifest, base, args.output_dir.resolve())
    print(json.dumps({'session': str(path), 'tracks': len(report['tracks']),
                      'clips': sum(len(t['clips']) for t in report['tracks']),
                      'mediaFiles': len(report['media']), 'openedInLive': False}))


if __name__ == '__main__':
    main()
