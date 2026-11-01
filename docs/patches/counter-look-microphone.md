# Counter, cabin look, and microphone recovery

This patch targets the source in `src(20261031-183705).zip`, including the
existing VFD consent and dual-trace meter implementations.

## Apply from the repository root

Place `chunk-surfer-counter-look-microphone.patch` at the repository root:

```sh
git apply --check chunk-surfer-counter-look-microphone.patch
git apply chunk-surfer-counter-look-microphone.patch
```

For the macOS application, also run the included configuration migration:

```sh
python3 scripts/repair-microphone-macos.py --apply
```

Rebuild and relaunch the native application using the project's normal build
command. Refreshing the web UI does not update an installed app's Info.plist or
signed entitlements. The migration requires the full checkout with
`src-tauri/tauri.conf.json`; those files were not part of the supplied archive.

The helper is idempotent. Without `--apply`, or with `--check`, it only prints
the proposed changes. If the build uses additional persistent Tauri JSON
overlays, pass each one with `--config path/to/overlay.json` in build order.
The platform `src-tauri/tauri.macos.conf.json` is detected automatically.
JSON5/TOML or temporary `TAURI_CONFIG` overrides produce an actionable error
instead of a guessed edit.

After rebuilding on macOS, verify the actual app bundle:

```sh
python3 scripts/repair-microphone-macos.py --verify-app "/path/to/Chunk Surfer.app"
```

That command checks the built purpose string and signed audio-input entitlement.
An earlier user denial remains controlled by macOS in **System Settings →
Privacy & Security → Microphone**. After changing that setting, relaunch the
app and choose **TRY AGAIN** in its VFD prompt.

## Resulting behavior

### TAKES

The counter remains present before assignment acceptance as faint, unpowered
LCD markings: `TAKES`, the two digit positions, the slash, and the capacity
positions. The dormant footprint uses `88 / 88` at 13% ink opacity so it does
not imply a live count or reveal capacity before activation. The accepted
counter keeps its existing layout and appearance. Activation does not imitate
the animation for completing a take. Existing progression gates are preserved.

### Cabin look

The driving scenes publish a camera owner to the existing input pipeline.
Mouse movement and the controller's right stick move the cabin camera with the
existing sensitivity, inversion, and camera limits. Steering and pedal actions
remain independent. Captured pointer interactions use the center of the view;
a look movement during a press cancels that press rather than activating a
cabin control. Pause, focus loss, cinematic transitions, and disposal hold or
release input through the existing scene lifecycle.

### Microphone

Capture starts synchronously from the explicit VFD choice. Synchronous capture
errors now settle the request rather than leaving it stuck in `asking`.
Permission failures, unavailable devices, and failures after access was granted
produce distinct outcomes. Audio-graph failures release the granted tracks.
Optional device enumeration cannot overwrite a capture result, and a late
enumeration cannot stop a replacement stream.

A missing saved input offers **USE DEFAULT MIC** on the VFD. That explicit
choice saves the default-device preference while preserving channel and
processing preferences. Ordinary denial offers explicit retry or **PLAY
WITHOUT MIC**. No failure silently switches inputs or requests permission again.

`micSnapshot()` includes `failureStage`, `errorName`, and `failedConstraint` for
diagnosis; the player sees action-oriented copy rather than those internals.

The macOS helper merges `NSMicrophoneUsageDescription` into the effective
Info.plist and `com.apple.security.device.audio-input` into the configured
entitlements. It preserves existing purpose wording, other entitlements,
signing configuration, and hardened-runtime settings. It validates all inputs
before writing, confines paths to the checkout, writes files atomically, and
rolls back completed writes if another write fails. Its configuration edits are
separate Git changes; reversing the source patch alone does not undo them.

## Validation and scope

The included regression tests execute the production capture state machine,
VFD interaction and layout, host consent callbacks, LCD renderer, driving
camera owners, and shared input routing. The Python suite covers native
configuration merging, overlays, idempotence, malformed input, and rollback.
All 69 new JavaScript cases, 12 Python cases, and 98 existing consent/meter
regression cases passed against the patched source.
Run the new JavaScript suites with Node's VM module support:

```sh
node --experimental-vm-modules --test test/microphone-startup-regressions.test.mjs test/microphone-recovery-vfd.test.mjs test/room-mic-host-consent.test.mjs test/navigator-dormant-takes.test.mjs test/driving-cabin-look.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 test/microphone-macos-config.test.py
```

Separate Chrome integration checks used the browser's real capture permission
API with a synthetic input: deny, grant and explicitly retry, disconnect a stale
device selection, explicitly recover to the default, and stop the tracks.
Generated-audio checks confirmed the dual-trace meter's continuous measurement,
peak retention through a UI stall, selected-channel RMS, and suspend/resume.

The source archive lacks the full package/build configuration, native project,
and game assets. A complete game build and macOS TCC/signing run were therefore
not performed here. The repaired JavaScript defects are reproduced; the
specific cause of failure in the installed app remains unconfirmed until its
rebuilt bundle and OS permission are checked.

## Native configuration references

- [Tauri: macOS application bundle](https://v2.tauri.app/distribute/macos-application-bundle/)
- [Tauri: configuration files and platform overrides](https://v2.tauri.app/develop/configuration-files/)
- [Tauri: configuration reference](https://v2.tauri.app/reference/config/)
- [WebKit: WKWebView media capture permission discussion](https://bugs.webkit.org/show_bug.cgi?id=229590)
