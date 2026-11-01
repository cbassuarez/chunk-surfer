#!/usr/bin/env python3
"""Merge microphone requirements into the project's existing macOS config.

Run from repo root: python3 scripts/repair-microphone-macos.py --apply
Default/--check reports required changes without writing. The source-only
archive does not contain src-tauri, so this migration resolves the real files
in the checkout where it is run instead of replacing an assumed configuration.

References:
https://v2.tauri.app/distribute/macos-application-bundle/
https://developer.apple.com/documentation/bundleresources/requesting-authorization-for-media-capture-on-macos
"""
import argparse
import copy
import difflib
import json
import os
from pathlib import Path
import plistlib
import stat
import subprocess
import sys
import tempfile
from xml.parsers.expat import ExpatError

DESCRIPTION_KEY = 'NSMicrophoneUsageDescription'
AUDIO_INPUT_KEY = 'com.apple.security.device.audio-input'
DESCRIPTION = ('Chunk Surfer uses your microphone, only when you allow it, '
               'to measure room sound and record takes you choose to make.')


class ConfigurationError(ValueError):
    pass


def read_json(path):
    try:
        result = json.loads(path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as error:
        raise ConfigurationError(f'Cannot read JSON configuration {path}: {error}') from error
    if not isinstance(result, dict):
        raise ConfigurationError(f'Expected a JSON object in {path}')
    return result


def merge(base, overlay):
    """RFC 7396, the same merge behavior used by Tauri config overlays."""
    if not isinstance(overlay, dict):
        return copy.deepcopy(overlay)
    result = copy.deepcopy(base) if isinstance(base, dict) else {}
    for key, value in overlay.items():
        if value is None:
            result.pop(key, None)
        else:
            result[key] = merge(result.get(key), value)
    return result


def object_at(value, key, inherited=None):
    result = value.get(key)
    if result is None:
        # An explicit null deletes the entire inherited object under RFC 7396.
        # Replacing it with {} would resurrect inherited signing/hardening
        # settings. Keep deletions explicit before adding the microphone key.
        result = {name: None for name in inherited} if key in value and isinstance(inherited, dict) else {}
        value[key] = result
    if not isinstance(result, dict):
        raise ConfigurationError(f'Expected an object at {key}, found {type(result).__name__}')
    return result


def local_path(root, base, value):
    if not isinstance(value, str) or not value.strip():
        raise ConfigurationError('Expected a nonempty local configuration path')
    candidate = (base / value).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ConfigurationError(f'Configuration path leaves this repository: {value}') from error
    return candidate


def read_plist(path):
    before = path.read_bytes() if path.exists() else None
    try:
        data = plistlib.loads(before) if before is not None else {}
    except (ValueError, plistlib.InvalidFileException, ExpatError) as error:
        raise ConfigurationError(f'Cannot parse plist {path}: {error}') from error
    if not isinstance(data, dict):
        raise ConfigurationError(f'Expected a plist dictionary in {path}')
    return before, data


def plist_bytes(path, key, value, *, preserve_description=False):
    before, data = read_plist(path)
    existing = data.get(key)
    if preserve_description and isinstance(existing, str) and existing.strip():
        return before, before
    if not preserve_description and existing is True:
        return before, before
    data[key] = value
    fmt = plistlib.FMT_BINARY if before and before.startswith(b'bplist00') else plistlib.FMT_XML
    return before, plistlib.dumps(data, fmt=fmt, sort_keys=False)


def build_plan(root, extra_configs=()):
    root = Path(root).resolve()
    native = root / 'src-tauri'
    primary = native / 'tauri.conf.json'
    if not primary.is_file():
        raise ConfigurationError('Run this in the full repository containing src-tauri/tauri.conf.json; '
                                 'the src-only archive cannot configure a native bundle.')
    # Do not invent a partial parser or silently ignore a higher-priority file.
    for filename in ('tauri.conf.json5', 'Tauri.toml', 'tauri.macos.conf.json5', 'Tauri.macos.toml'):
        if (native / filename).exists():
            raise ConfigurationError(f'{filename} is present. This migration requires JSON configuration; '
                                     'merge the microphone keys into that configuration explicitly.')
    if os.environ.get('TAURI_CONFIG'):
        raise ConfigurationError('TAURI_CONFIG is set. Run the migration without that temporary override '
                                 'and pass each persistent build overlay with --config.')
    paths = [primary]
    platform = native / 'tauri.macos.conf.json'
    if platform.exists():
        paths.append(platform)
    for filename in extra_configs:
        path = local_path(root, root, filename)
        if path not in paths:
            paths.append(path)
    configs = [(path, read_json(path)) for path in paths]
    effective = {}
    for _, config in configs:
        effective = merge(effective, config)
    bundle = effective.get('bundle') or {}
    if not isinstance(bundle, dict):
        raise ConfigurationError('bundle and bundle.macOS must be JSON objects')
    mac = bundle.get('macOS') or {}
    if not isinstance(mac, dict):
        raise ConfigurationError('bundle and bundle.macOS must be JSON objects')
    changes = []
    info = local_path(root, native, mac.get('infoPlist') or 'Info.plist')
    # Tauri merges the conventional plist before the configured custom plist.
    # Resolve that chain first: adding a generic key to a custom plist must not
    # override an existing authored purpose supplied by the conventional file.
    info_paths = {info}
    standard_info = local_path(root, native, 'Info.plist')
    if standard_info.exists():
        info_paths.add(standard_info)
    chain = ([standard_info] if standard_info.exists() and standard_info != info else []) + [info]
    purpose, authored = None, None
    for path in chain:
        _, data = read_plist(path)
        if DESCRIPTION_KEY in data:
            purpose = data[DESCRIPTION_KEY]
            if isinstance(purpose, str) and purpose.strip():
                authored = purpose
    if not (isinstance(purpose, str) and purpose.strip()) or not info.exists():
        before, after = plist_bytes(info, DESCRIPTION_KEY, authored or DESCRIPTION, preserve_description=True)
        if before != after:
            changes.append((info, before, after))

    configured_entitlements = mac.get('entitlements')
    entitlements = local_path(root, native, configured_entitlements or 'Entitlements.plist')
    if entitlements in info_paths:
        raise ConfigurationError('Info.plist and entitlements must be different files')
    before, after = plist_bytes(entitlements, AUDIO_INPUT_KEY, True)
    if before != after:
        changes.append((entitlements, before, after))
    if not configured_entitlements:
        # The last persistent overlay wins. Adding one field here preserves
        # the app identifier, signing identity, hardened runtime and other keys.
        target, config = configs[-1]
        prior = {}
        for _, previous in configs[:-1]:
            prior = merge(prior, previous)
        prior_bundle = prior.get('bundle') if isinstance(prior.get('bundle'), dict) else {}
        target_bundle = object_at(config, 'bundle', prior_bundle)
        object_at(target_bundle, 'macOS', prior_bundle.get('macOS'))['entitlements'] = './Entitlements.plist'
        before = target.read_bytes()
        after = (json.dumps(config, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
        changes.append((target, before, after))
    return changes


def atomic_write(path, data, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def apply_plan(changes):
    # Validate every input before changing any output. An editor changing a
    # file between planning and applying must never have its content replaced.
    for path, before, _ in changes:
        current = path.read_bytes() if path.exists() else None
        if current != before:
            raise ConfigurationError(f'File changed during migration: {path}')
    completed = []
    try:
        for path, before, after in changes:
            mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
            atomic_write(path, after, mode)
            completed.append((path, before, mode))
    except BaseException:
        for path, before, mode in reversed(completed):
            if before is None:
                path.unlink(missing_ok=True)
            else:
                atomic_write(path, before, mode)
        raise


def preview(changes, root):
    for path, before, after in changes:
        name = str(path.relative_to(root))
        if (before or b'').startswith(b'bplist00'):
            print(f'{name}: update microphone key, preserving binary plist format and existing values')
            continue
        print(''.join(difflib.unified_diff((before or b'').decode('utf-8-sig').splitlines(True),
                                          after.decode('utf-8').splitlines(True),
                                          fromfile=name, tofile=name)), end='')


def verify_app(app):
    app = Path(app).resolve()
    info_path = app / 'Contents/Info.plist'
    info = plistlib.loads(info_path.read_bytes())
    purpose = info.get(DESCRIPTION_KEY)
    if not isinstance(purpose, str) or not purpose.strip():
        raise ConfigurationError('Built app is missing NSMicrophoneUsageDescription')
    result = subprocess.run(['codesign', '--display', '--entitlements', ':-', str(app)],
                            capture_output=True, check=False)
    # codesign versions have used either stream for the XML payload.
    payload = result.stdout if b'<plist' in result.stdout else result.stderr
    start = payload.find(b'<?xml')
    if start < 0:
        start = payload.find(b'<plist')
    end = payload.find(b'</plist>', start)
    if result.returncode or start < 0 or end < 0:
        raise ConfigurationError('Could not read the built app\'s signed entitlements')
    entitlements = plistlib.loads(payload[start:end + len(b'</plist>')])
    if entitlements.get(AUDIO_INPUT_KEY) is not True:
        raise ConfigurationError('Built app signature is missing the audio-input entitlement')
    print('Built app has its microphone purpose string and signed audio-input entitlement.')
    print('macOS still controls the user\'s microphone grant in System Settings > Privacy & Security > Microphone.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    operation = parser.add_mutually_exclusive_group()
    operation.add_argument('--apply', action='store_true', help='apply the planned repo-local changes')
    operation.add_argument('--check', action='store_true', help='show required changes; exit 1 if any are needed')
    operation.add_argument('--verify-app', type=Path, help='inspect an already built .app on macOS')
    parser.add_argument('--config', action='append', default=[], help='additional persistent Tauri JSON overlay, in build order')
    args = parser.parse_args(argv)
    try:
        if args.verify_app:
            verify_app(args.verify_app)
            return 0
        root = Path.cwd().resolve()
        changes = build_plan(root, args.config)
        if not changes:
            print('Microphone description and audio-input entitlement are already configured.')
            return 0
        preview(changes, root)
        if not args.apply:
            print('No files changed. Run with --apply to merge these microphone requirements.')
            return 1
        apply_plan(changes)
        print(f'Updated {len(changes)} file(s). Rebuild the macOS app to include the permission metadata.')
        return 0
    except (ConfigurationError, OSError, ValueError) as error:
        print(f'Microphone configuration: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
