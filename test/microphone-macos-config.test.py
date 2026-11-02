"""Run: python3 test/microphone-macos-config.test.py"""
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/repair-microphone-macos.py'
spec = importlib.util.spec_from_file_location('microphone_macos_config', SCRIPT)
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class MicrophoneMacosConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.native = self.root / 'src-tauri'
        self.native.mkdir()
        self.env = patch.dict(os.environ, {'TAURI_CONFIG': ''})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.base = {'identifier': 'com.cbassuarez.chunksurfer', 'productName': 'Chunk Surfer',
                     'build': {'beforeBuildCommand': 'npm run build'},
                     'bundle': {'targets': ['app', 'dmg'], 'resources': ['../assets'],
                                'macOS': {'hardenedRuntime': True, 'signingIdentity': 'Existing identity'}}}
        self.write_json('tauri.conf.json', self.base)

    def write_json(self, filename, data):
        path = self.native / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + '\n')
        return path

    def write_plist(self, filename, data, fmt=plistlib.FMT_XML):
        path = self.native / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(plistlib.dumps(data, fmt=fmt, sort_keys=False))
        return path

    def read_plist(self, filename):
        return plistlib.loads((self.native / filename).read_bytes())

    def files(self):
        return {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}

    def test_minimum_configuration_adds_only_microphone_requirements_and_is_idempotent(self):
        initial = self.files()
        plan = repair.build_plan(self.root)
        self.assertEqual(self.files(), initial, 'Planning is read-only')
        self.assertEqual(len(plan), 3)
        repair.apply_plan(plan)
        self.assertEqual(self.read_plist('Info.plist'), {repair.DESCRIPTION_KEY: repair.DESCRIPTION})
        self.assertEqual(self.read_plist('Entitlements.plist'), {repair.AUDIO_INPUT_KEY: True})
        expected = json.loads(json.dumps(self.base))
        expected['bundle']['macOS']['entitlements'] = './Entitlements.plist'
        self.assertEqual(json.loads((self.native / 'tauri.conf.json').read_text()), expected)
        self.assertEqual(repair.build_plan(self.root), [])

    def test_existing_purpose_entitlements_signing_and_hardening_are_preserved(self):
        self.base['bundle']['macOS']['entitlements'] = 'security/App.entitlements'
        config = self.write_json('tauri.conf.json', self.base)
        info = self.write_plist('Info.plist', {repair.DESCRIPTION_KEY: 'Existing purpose',
                                             'NSHighResolutionCapable': True})
        self.write_plist('security/App.entitlements', {'com.apple.security.cs.allow-jit': True,
                         'com.apple.security.app-sandbox': False, 'custom-array': ['one', 'two']})
        saved_config, saved_info = config.read_bytes(), info.read_bytes()
        plan = repair.build_plan(self.root)
        self.assertEqual(len(plan), 1)
        repair.apply_plan(plan)
        self.assertEqual(config.read_bytes(), saved_config)
        self.assertEqual(info.read_bytes(), saved_info)
        self.assertEqual(self.read_plist('security/App.entitlements'), {
            'com.apple.security.cs.allow-jit': True, 'com.apple.security.app-sandbox': False,
            'custom-array': ['one', 'two'], repair.AUDIO_INPUT_KEY: True})

    def test_macos_overlay_paths_win_and_binary_plist_format_survives(self):
        self.base['bundle']['macOS'].update({'entitlements': 'Base.plist', 'infoPlist': 'BaseInfo.plist'})
        self.write_json('tauri.conf.json', self.base)
        overlay = self.write_json('tauri.macos.conf.json', {'bundle': {'macOS': {
            'entitlements': 'native/Actual.plist', 'infoPlist': 'native/ActualInfo.plist'}}})
        ignored = self.write_plist('Base.plist', {'keep': 'base'})
        ignored_info = self.write_plist('BaseInfo.plist', {'keep': 'base info'})
        self.write_plist('native/Actual.plist', {repair.AUDIO_INPUT_KEY: False, 'keep': [3, 5]}, plistlib.FMT_BINARY)
        self.write_plist('native/ActualInfo.plist', {repair.DESCRIPTION_KEY: '', 'keep': b'bytes'}, plistlib.FMT_BINARY)
        saved = {p: p.read_bytes() for p in [ignored, ignored_info, overlay]}
        repair.apply_plan(repair.build_plan(self.root))
        for p, contents in saved.items():
            self.assertEqual(p.read_bytes(), contents)
        self.assertEqual(self.read_plist('native/Actual.plist'), {repair.AUDIO_INPUT_KEY: True, 'keep': [3, 5]})
        self.assertTrue((self.native / 'native/Actual.plist').read_bytes().startswith(b'bplist00'))
        self.assertTrue((self.native / 'native/ActualInfo.plist').read_bytes().startswith(b'bplist00'))
        self.assertEqual(self.read_plist('native/ActualInfo.plist')['keep'], b'bytes')

    def test_custom_plist_does_not_override_an_inherited_authored_microphone_purpose(self):
        self.base['bundle']['macOS'].update({'infoPlist': 'Extra.plist', 'entitlements': 'Entitlements.plist'})
        self.write_json('tauri.conf.json', self.base)
        info = self.write_plist('Info.plist', {repair.DESCRIPTION_KEY: 'My existing tailored explanation'})
        extra = self.write_plist('Extra.plist', {'NSHighResolutionCapable': True})
        self.write_plist('Entitlements.plist', {repair.AUDIO_INPUT_KEY: True})
        original = self.files()
        self.assertEqual(repair.build_plan(self.root), [])
        self.assertEqual(self.files(), original)
        # A blank override must be repaired using the existing authored text.
        self.write_plist('Extra.plist', {repair.DESCRIPTION_KEY: '', 'NSHighResolutionCapable': True})
        saved_info = info.read_bytes()
        repair.apply_plan(repair.build_plan(self.root))
        self.assertEqual(info.read_bytes(), saved_info)
        self.assertEqual(plistlib.loads(extra.read_bytes()), {
            repair.DESCRIPTION_KEY: 'My existing tailored explanation', 'NSHighResolutionCapable': True})

    def test_overlay_null_is_repaired_in_the_winning_overlay_only(self):
        self.base['bundle']['macOS']['entitlements'] = 'Old.plist'
        base = self.write_json('tauri.conf.json', self.base)
        saved = base.read_bytes()
        self.write_json('tauri.macos.conf.json', {'bundle': {'macOS': {'entitlements': None}}, 'plugins': {'keep': {}}})
        repair.apply_plan(repair.build_plan(self.root))
        self.assertEqual(base.read_bytes(), saved)
        actual = json.loads((self.native / 'tauri.macos.conf.json').read_text())
        self.assertEqual(actual, {'bundle': {'macOS': {'entitlements': './Entitlements.plist'}}, 'plugins': {'keep': {}}})

    def test_explicit_build_overlay_is_merged_last(self):
        self.write_json('tauri.macos.conf.json', {'bundle': {'macOS': {'infoPlist': 'platform.plist'}}})
        overlay = self.write_json('tauri.release.conf.json', {'bundle': {'macOS': {'infoPlist': 'ReleaseInfo.plist'}},
                                                            'build': {'beforeBuildCommand': 'npm run release'}})
        repair.apply_plan(repair.build_plan(self.root, ['src-tauri/tauri.release.conf.json']))
        self.assertTrue((self.native / 'ReleaseInfo.plist').exists())
        self.assertFalse((self.native / 'platform.plist').exists())
        actual = json.loads(overlay.read_text())
        self.assertEqual(actual['build']['beforeBuildCommand'], 'npm run release')
        self.assertEqual(actual['bundle']['macOS']['entitlements'], './Entitlements.plist')

    def test_null_ancestors_do_not_resurrect_deleted_signing_or_hardening_settings(self):
        self.base['bundle']['macOS'].update({'hardenedRuntime': False, 'entitlements': 'Old.plist'})
        self.write_json('tauri.conf.json', self.base)
        for overlay in [{'bundle': {'macOS': None}}, {'bundle': None}]:
            with self.subTest(overlay=overlay):
                platform = self.write_json('tauri.macos.conf.json', overlay)
                before = repair.merge(self.base, overlay)
                expected = json.loads(json.dumps(before))
                expected.setdefault('bundle', {}).setdefault('macOS', {})['entitlements'] = './Entitlements.plist'
                repair.apply_plan(repair.build_plan(self.root))
                after = repair.merge(self.base, json.loads(platform.read_text()))
                self.assertEqual(after, expected)
                self.assertNotIn('hardenedRuntime', after['bundle']['macOS'])
                self.assertNotIn('signingIdentity', after['bundle']['macOS'])

    def test_invalid_inputs_never_partially_write_other_files(self):
        (self.native / 'Entitlements.plist').write_bytes(b'<plist><dict><key>broken')
        before = self.files()
        with self.assertRaises(repair.ConfigurationError):
            repair.build_plan(self.root)
        self.assertEqual(self.files(), before)

    def test_external_paths_and_unknown_configuration_formats_are_not_overwritten(self):
        self.base['bundle']['macOS']['entitlements'] = '../../outside-entitlements.plist'
        self.write_json('tauri.conf.json', self.base)
        before = self.files()
        with self.assertRaises(repair.ConfigurationError):
            repair.build_plan(self.root)
        self.assertEqual(self.files(), before)
        self.base['bundle']['macOS'].pop('entitlements')
        self.write_json('tauri.conf.json', self.base)
        (self.native / 'Tauri.macos.toml').write_text('[bundle.macos]\nhardened-runtime = true\n')
        before = self.files()
        with self.assertRaises(repair.ConfigurationError):
            repair.build_plan(self.root)
        self.assertEqual(self.files(), before)

    def test_an_edit_after_planning_aborts_before_any_write(self):
        plan = repair.build_plan(self.root)
        self.write_json('tauri.conf.json', {**self.base, 'productName': 'Edited in parallel'})
        before = self.files()
        with self.assertRaises(repair.ConfigurationError):
            repair.apply_plan(plan)
        self.assertEqual(self.files(), before)

    def test_a_write_failure_rolls_back_completed_writes(self):
        plan = repair.build_plan(self.root)
        before = self.files()
        original = repair.atomic_write
        calls = 0

        def fail_second(*args):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError('Test write failure')
            return original(*args)

        with patch.object(repair, 'atomic_write', fail_second):
            with self.assertRaises(OSError):
                repair.apply_plan(plan)
        self.assertEqual(self.files(), before)

    def test_built_app_verification_checks_signed_entitlement_not_only_source(self):
        app = self.root / 'Chunk Surfer.app'
        (app / 'Contents').mkdir(parents=True)
        (app / 'Contents/Info.plist').write_bytes(plistlib.dumps({repair.DESCRIPTION_KEY: 'Purpose'}))
        result = type('Result', (), {'returncode': 0, 'stdout': plistlib.dumps({repair.AUDIO_INPUT_KEY: True}),
                                     'stderr': b'Executable=...\n'})()
        with patch.object(repair.subprocess, 'run', return_value=result) as invoke:
            repair.verify_app(app)
            self.assertEqual(invoke.call_args.args[0][-1], str(app.resolve()))
        result.stdout = plistlib.dumps({'unrelated': True})
        with patch.object(repair.subprocess, 'run', return_value=result):
            with self.assertRaises(repair.ConfigurationError):
                repair.verify_app(app)


if __name__ == '__main__':
    unittest.main(verbosity=2)
