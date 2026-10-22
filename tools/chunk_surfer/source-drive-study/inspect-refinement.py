"""Inspect the isolated driving study's saved evidence, without running the game.

Uses actual FFmpeg decoding, packet timestamps, native input/frame receipts and
several aligned waveform windows. None of these is a human acceptance test.
Run: python3 tools/chunk_surfer/source-drive-study/inspect-refinement.py --prefix verified
"""
import argparse
import hashlib
import json
import math
import subprocess
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
BASE = ROOT / "artifacts/source-drive-study/refinement/native"
FFPROBE = "/opt/homebrew/bin/ffprobe"
FFMPEG = "/opt/homebrew/bin/ffmpeg"
parser = argparse.ArgumentParser()
parser.add_argument("--prefix", default="final")
args = parser.parse_args()
prefix = args.prefix
consumed = {}


def record_file(path):
    data = path.read_bytes()
    consumed[str(path.relative_to(ROOT))] = {
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
    return data


def load(name):
    return json.loads(record_file(BASE / name))


def command(argv):
    result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError(f"{argv[0]} failed: {result.stderr.decode(errors='replace')}")
    return result.stdout, result.stderr.decode(errors="replace")


def probe(path, extra):
    stdout, stderr = command([FFPROBE, "-v", "error", *extra, "-of", "json", str(path)])
    return json.loads(stdout), stderr


def stats(values):
    values = sorted(float(v) for v in values if math.isfinite(float(v)))
    if not values:
        return None
    def p(fraction):
        return values[max(0, min(len(values) - 1, math.ceil(len(values) * fraction) - 1))]
    return {"count": len(values), "min": values[0], "mean": sum(values)/len(values),
            "p50": p(.5), "p95": p(.95), "p99": p(.99), "max": values[-1]}


def inspect_media(name):
    path = BASE / name
    record_file(path)
    info, info_error = probe(path, ["-show_streams", "-show_format"])
    packets, packet_error = probe(path, ["-show_packets", "-show_entries",
        "packet=stream_index,pts_time,dts_time,duration_time,size"])
    frames, frame_error = probe(path, ["-show_frames", "-show_entries",
        "frame=media_type,stream_index,best_effort_timestamp_time,pkt_duration_time,nb_samples"])
    streams = []
    for stream in info["streams"]:
        index = stream["index"]
        rows = [p for p in packets.get("packets", []) if p["stream_index"] == index]
        pts = [float(p["pts_time"]) for p in rows if "pts_time" in p]
        gaps = [b-a for a, b in zip(pts, pts[1:])]
        decoded = [f for f in frames.get("frames", []) if f["stream_index"] == index]
        duration = sum(float(p.get("duration_time", 0)) for p in rows)
        tail = rows[-1] if rows else {}
        sample_count = sum(int(f.get("nb_samples", 0)) for f in decoded)
        rate = int(stream.get("sample_rate", 0))
        streams.append({"index": index, "type": stream["codec_type"],
            "codec": stream["codec_name"], "width": stream.get("width"),
            "height": stream.get("height"), "sampleRate": rate or None,
            "channels": stream.get("channels"), "packetCount": len(rows),
            "decodedFrameCount": len(decoded), "decodedSamplesPerChannel": sample_count or None,
            "decodedSeconds": sample_count/rate if rate else None,
            "firstPtsSeconds": pts[0] if pts else None,
            "lastPtsSeconds": pts[-1] if pts else None,
            "lastPacketEndSeconds": float(tail.get("pts_time", 0))+float(tail.get("duration_time", 0)),
            "sumReportedPacketDurationSeconds": duration,
            "packetIntervalSeconds": stats(gaps),
            "packetIntervalHistogramMs": dict(sorted(Counter(str(round(x*1000)) for x in gaps).items(), key=lambda p: int(p[0]))),
            "nonIncreasingPtsIntervals": sum(x <= 0 for x in gaps)})
    # Decode both media types through FFmpeg as well as ffprobe's frame reader.
    _, decode_error = command([FFMPEG, "-v", "error", "-i", str(path), "-f", "null", "-"])
    return {"file": str(path.relative_to(ROOT)), "streams": streams,
        "containerDurationSeconds": info["format"].get("duration"),
        "decodeErrors": [e for e in [info_error, packet_error, frame_error, decode_error] if e],
        "notes": ["Browser WebM may omit container duration; decoded sample count and packet endpoints are reported separately.",
                  "Packet timestamp jitter is not by itself proof of lost audio samples. Video packet cadence is distinct from the renderer RAF cadence."]}


def mono8k(name):
    data, _ = command([FFMPEG, "-v", "error", "-i", str(BASE/name), "-map", "0:a:0",
        "-ac", "1", "-ar", "8000", "-f", "f32le", "-c:a", "pcm_f32le", "pipe:1"])
    return np.frombuffer(data, dtype="<f4").astype(np.float64)


def waveform_comparison(movie_name, take_name, expected_offset):
    heard, tape = mono8k(movie_name), mono8k(take_name)
    usable = min(len(tape), len(heard))/8000
    windows = sorted(set(round(usable*f, 2) for f in [.16, .38, .63, .88]))
    aligned = []
    centre_lag = round(-expected_offset*8000)
    for second in windows:
        start = round(second*8000)
        x = tape[start:start+8000]
        xx = float(np.dot(x, x))
        best = None
        for lag in range(centre_lag-2000, centre_lag+2001):
            y = heard[start+lag:start+lag+len(x)] if start+lag >= 0 else np.array([])
            if len(y) != len(x) or not xx:
                continue
            yy = float(np.dot(y, y))
            if not yy:
                continue
            xy = float(np.dot(x, y))
            correlation = xy/math.sqrt(xx*yy)
            if best is None or correlation > best["normalizedDotCorrelation"]:
                best = {"tapeWindowStartSeconds": second, "windowSeconds": len(x)/8000,
                    "lagSamples": lag, "lagSeconds": lag/8000,
                    "normalizedDotCorrelation": correlation, "monitorToTapeGain": xy/xx,
                    "tapeRms": math.sqrt(xx/len(x)), "monitorRms": math.sqrt(yy/len(y))}
        aligned.append(best)
    return {"method": "Both actual files decoded to mono 8 kHz PCM; four separated one-second windows, each searched within ±0.25 s of the state-derived offset. Correlation is a normalized dot product, not a listening score.",
        "expectedMonitorMinusTapeOffsetSeconds": -expected_offset,
        "lagConvention": "monitor sample index = tape sample index + lagSamples",
        "windows": aligned, "monitorDecodedSecondsAt8k": len(heard)/8000,
        "tapeDecodedSecondsAt8k": len(tape)/8000,
        "claim": "Shared captured signal and expected approximately 0.5 monitor/master gain are technically supported where correlation is high. Intelligibility, spatial realism and perceptual recognition are not established."}


movie = load(f"{prefix}-driving.json")
driver_names = ([f"{prefix}-driving-inputs.json"] if (BASE/f"{prefix}-driving-inputs.json").exists()
                else [f"{prefix}-first-leg.json", f"{prefix}-second-leg.json"])
drivers = [load(name) for name in driver_names]
state = load(f"{prefix}-driving-state.json")
session = load(f"{prefix}-driving-session.json")
restore_name = (f"{prefix}-restored-state.json" if (BASE/f"{prefix}-restored-state.json").exists()
                else f"{prefix}-restored-paused.json")
restored = load(restore_name)
resumed_name = f"{prefix}-restored-resumed.json"
resumed = load(resumed_name) if (BASE/resumed_name).exists() else None
original_state = load("final-driving-state.json")
original_restore = load("final-restored-state.json")
original_extra = original_restore["events"][len(original_state["events"]):]
names = [f"{prefix}-driving.webm", f"{prefix}-raw-take.webm", f"{prefix}-reloaded-take.webm"]
media = {name: inspect_media(name) for name in names}
audio_stream = lambda name: next(s for s in media[name]["streams"] if s["type"] == "audio")
take = state["takes"][0]
waveform = waveform_comparison(names[0], names[1], movie["initial"]["programTime"]-take["startedAt"])
before = {r["path"]: r["sha256"] for r in session["sourceBefore"]}
after = {r["path"]: r["sha256"] for r in session["sourceAfter"]}
drift = [p for p in sorted(set(before)|set(after)) if before.get(p) != after.get(p)]
selected_frames = [f for f in movie["frames"] if movie["start"] <= f["wall"] <= movie["end"]]
timing = {"frames": len(selected_frames), "deltaMs": stats(f["deltaMs"] for f in selected_frames),
    "submissionMs": stats(f["submissionMs"] for f in selected_frames),
    "scope": "Observed requestAnimationFrame intervals and CPU submission during this one recording, not GPU timing, capture-overhead isolation, target-device performance or human smoothness acceptance."}
physical = [e for e in state["events"] if e["type"] == "physical-road-joint"]
broadcast = next(e for e in state["events"] if e["type"] == "broadcast-joint-fingerprint")
audio_events = state["audio"]["events"]
projection = next(e for e in audio_events if e["type"] == "broadcast-joint-fingerprint")
physical_audio = [e for e in audio_events if e["type"] == "physical-single-joint"]
broadcast_audio = [e for e in audio_events if e["type"] == "broadcast-single-joint"]
relative_physical = [e["t"]-physical[0]["t"] for e in physical] if physical else []
relative_projected = [p["when"] for p in projection["pattern"]]
pattern_errors = [a-b for a,b in zip(relative_physical, relative_projected)]
driver_keys = [(e["type"], e["key"]) for driver in drivers for e in driver["keyEvents"]]
capture_keys = [(e["kind"], e["key"]) for e in movie["inputs"] if e["kind"] in ["keydown", "keyup"]]
balance = Counter()
for kind,key in capture_keys:
    balance[key] += 1 if kind == "keydown" else -1
commands = session["commands"]
capture_start = next(i for i,c in enumerate(commands) if c["op"] == "record" and c.get("name") == f"{prefix}-driving")
capture_stop = next(i for i in range(capture_start+1,len(commands)) if commands[i]["op"] == "stop")
mutation_commands = [c for c in commands[capture_start+1:capture_stop] if c["op"] in ["fixture","restore","debug","lighting","reload"]]
original_failure = {"stateFile": "final-restored-state.json", "addedEvents": original_extra,
    "diagnosis": "Restoring the already-passed bridge appended six physical-joint events at zero speed. The sealed original take was unaffected; checkpoint event continuity failed.",
    "preserved": True}
extra = restored["events"][len(state["events"]):]
resumed_extra = resumed["events"][len(state["events"]):] if resumed else None
restore_no_phantom_joints = not any(e["type"] == "physical-road-joint" for e in extra)
resumed_no_phantom_joints = resumed_extra is not None and not any(e["type"] == "physical-road-joint" for e in resumed_extra)
raw_sha = consumed[str((BASE/names[1]).relative_to(ROOT))]["sha256"]
reloaded_sha = consumed[str((BASE/names[2]).relative_to(ROOT))]["sha256"]
exact_bytes_equal = (BASE/names[1]).read_bytes() == (BASE/names[2]).read_bytes()
declared_fixture = next((c["value"] for c in commands if c["op"] == "fixture"), None)
checks = {
    "mediaDecodeWithoutErrors": not any(m["decodeErrors"] for m in media.values()),
    "packetTimestampsStrictlyIncrease": all(s["nonIncreasingPtsIntervals"] == 0 for m in media.values() for s in m["streams"]),
    "sourceHashesStableDuringSelectedSession": not drift,
    "noBrowserOrStudyErrors": not session["errors"] and not state["errors"],
    "noDiagnosticMutationCommandDuringCapture": not mutation_commands,
    "driverKeysMatchCapturePrefix": driver_keys == capture_keys[:len(driver_keys)],
    "captureKeyDownUpCountsBalance": not any(balance.values()),
    "recordedSixPhysicalAxleEvents": len(physical) == len(physical_audio) == 6 and len({(e["axle"],e["jointDistance"]) for e in physical}) == 6,
    "broadcastSchedulesSixProjectedHits": len(broadcast_audio) == len(relative_projected) == 6,
    "rawAndReloadedAudioByteIdentical": exact_bytes_equal and raw_sha == reloaded_sha,
    "tapeDurationMatchesDecodedSamples": abs(take["duration"]-audio_stream(names[1])["decodedSeconds"]) <= 1/audio_stream(names[1])["sampleRate"],
    "allWaveformWindowsCorrelate": all(w and w["normalizedDotCorrelation"] > .98 for w in waveform["windows"]),
    "waveformLagStableAcrossWindows": len({w["lagSamples"] for w in waveform["windows"] if w}) == 1,
    "restoredCheckpointHasNoAdditionalJointEvents": restore_no_phantom_joints,
    "resumedCheckpointHasNoAdditionalJointEvents": resumed_no_phantom_joints,
    "checkpointEventPrefixPreserved": restored["events"][:len(state["events"])] == state["events"] and (resumed is None or resumed["events"][:len(state["events"])] == state["events"]),
}
report = {"kind": "source-drive-refinement-native-technical-inspection", "schema": 1,
    "selectedPrefix": prefix, "verifiedTechnicalChecksPassed": all(checks.values()), "checks": checks,
    "capture": {"wallEnvelopeSeconds": (movie["end"]-movie["start"])/1000,
        "wallEnvelopeIncludesStopAndSerialization": True, "media": media, "timingRecomputedFromRawFrames": timing,
        "timingReceiptMatchesRecalculation": all(abs(timing[k][p]-movie["timing"][k][p]) < 1e-6 for k in ["deltaMs","submissionMs"] for p in ["p50","p95","p99","max"]),
        "renderer": state["renderer"], "adapter": state["adapter"], "renderCostSnapshot": state.get("propCost"),
        "scope": "World canvas plus monitored cabin bus; DOM HUD is outside the recorded canvas. Final acquisition formulas are shared, using an isolated adapter for cabin projection, lighting routing/headlamps, mirrors/readout, range, pattern scale and edge gain. No production renderer source was written by the adapter."},
    "route": {"declaredFixture": declared_fixture, "captureInitialDistanceM": -movie["initial"]["z"],
        "captureFinalDistanceM": -movie["final"]["z"], "furthestDistanceM": state["furthest"],
        "chapterArrivalReached": state["arrived"],
        "driverLegs": [{"receipt": name, "configuration": d["configuration"], "reason": d["reason"],
            "controllerError": d["controllerError"], "summary": d["summary"]} for name,d in zip(driver_names,drivers)],
        "driverKeysExercised": sorted({k for kind,k in driver_keys if kind == "keydown"}),
        "driverEventCount": len(driver_keys), "captureKeyboardEventCount": len(capture_keys),
        "limits": "Technical road-preview feedback supplies ordinary keys; this is not an unbriefed player. A stop at the controller waypoint is not arrival at the recording destination. The sampled lane errors do not measure player attention."},
    "bridge": {"broadcastProgrammeTime": broadcast["t"], "firstPhysicalProgrammeTime": physical[0]["t"] if physical else None,
        "programmeLeadSeconds": physical[0]["t"]-broadcast["t"] if physical else None,
        "broadcastAudioTime": projection["audioTime"], "firstPhysicalAudioTime": physical_audio[0]["audioTime"] if physical_audio else None,
        "audioClockLeadSeconds": physical_audio[0]["audioTime"]-projection["audioTime"] if physical_audio else None,
        "physicalEvents": physical, "projection": projection, "physicalRelativeProgrammeTimes": relative_physical,
        "physicalMinusProjectedOffsetsSeconds": pattern_errors,
        "maximumAbsoluteTimingDifferenceSeconds": max(map(abs,pattern_errors)) if pattern_errors else None,
        "claim": "The recorded event journals contain three road joints crossed by both axles, following a six-hit service recording projected at its trigger speed. They are two clocks, not an exact future prediction. Recognizing the contradiction by ear remains a human test."},
    "savedAudio": {"take": take, "rawSha256": raw_sha, "reloadedSha256": reloaded_sha,
        "byteIdenticalAfterReload": exact_bytes_equal, "waveformComparison": waveform,
        "loadedPerformanceAssets": state["audio"]["loaded"],
        "scope": "Synthetic mechanical and carrier proxies only. No finished actor performances, physical microphone measurement or untreated driving/broadcast reference recordings are demonstrated."},
    "checkpointContinuity": {"selectedState": restore_name, "addedEvents": extra,
        "noAdditionalJointEvents": restore_no_phantom_joints, "restoredPaused": restored["paused"],
        "restoredStopped": abs(restored["speed"]) < 1e-8, "radioStatePreserved": restored["radioOn"] == state["radioOn"],
        "stationPreserved": restored["station"] == state["station"], "resumedState": resumed_name if resumed else None,
        "resumedAddedEvents": resumed_extra, "resumedNoAdditionalJointEvents": resumed_no_phantom_joints,
        "originalFailure": original_failure},
    "sourceProvenance": {"session": f"{prefix}-driving-session.json", "sourceFileCount": len(before),
        "driftDuringSession": drift, "before": before, "after": after,
        "scope": "Entry/exit hashes support stability of these listed study/renderer sources during this session. This is not a freeze of the entire production game or proof of current disk identity after subsequent repairs."},
    "limits": [
        "Automated keyboard feedback is technical control evidence, not fresh-player comprehension, dread, comfort or handling acceptance.",
        "An explicit study fixture or study-native distance-zero start is not continuous play from production Source, its branch commitments, equipment inventory, save system or final exit handoff.",
        "RAF timing and CPU submission during one recording do not isolate capture overhead, measure GPU cost or establish target-machine performance. Encoded video packet cadence must be considered separately.",
        "The shared final acquisition path is adapted in request-scoped query modules; the full lighting/projection/mirror treatment has not been integrated into production Source.",
        "No finished voices or untreated physical radio/cabin/road reference takes are present. Audio waveform correlation supports routing only, not mix quality or authenticity.",
        "No fresh-player, independent sound-design or narrative-continuity review has been performed. These remain pending.",
        "Byte-identical sealed audio after a controlled reload does not prove recovery from process death during an unsealed recording or cross-machine save transport.",
    ], "inputFiles": consumed}
(BASE/"inspection.json").write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps({"selectedPrefix": prefix, "verifiedTechnicalChecksPassed": report["verifiedTechnicalChecksPassed"],
    "checks": checks, "timing": timing, "bridgeLeadSeconds": report["bridge"]["programmeLeadSeconds"],
    "waveform": waveform["windows"], "rawSha256": raw_sha},indent=2))
