#!/usr/bin/env python3
"""Build the licensed planted-contact bank and finite Source response stems.

Requires Python 3, numpy and ffmpeg. Run from any directory. Inputs are retained
beside this script, so an ordinary build is offline and independent of artifacts/.
Use --fetch only to restore a missing published CC0 preview; hashes are mandatory.
No source is pitch-randomized or time-compressed into an invented walking gait.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import subprocess
import urllib.request
import wave

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
INPUT = HERE / "footstep-sources"
OUTPUT = ROOT / "public/audio/footsteps"
SR = 48000
PROFILES = ("glazed", "erased", "compiled-field", "compiled-path", "compiled-fault")

# Authored primary strikes inspected in each continuous original. Cleaner whole
# contacts replace ambiguous late clicks/releases and very distant/quiet takes.
# This is performance selection, never per-contact normalization. The temporary
# inspection window retains80ms before the primary load and400ms after it;
# align_contact below removes leading room/preparation while retaining20ms of
# headroom before the measured primary-load onset.
def plant_windows(peaks):
    return [(round(max(0, t - .08), 6), round(t + .40, 6)) for t in peaks]

CLEAN_PLANT_PEAKS = {
    "tile_walk": [ .370, 1.375, 4.520, 6.660, 7.735, 8.845, 9.950, 11.100 ],
    "tile_slow": [ 1.750, 7.530, 11.320, 13.965 ],
    "concrete_walk": [ 4.515, 6.850, 9.105, 9.810, 11.915, 15.540, 16.955, 18.430 ],
    "carpet_walk": [ 3.615, 6.150, 8.355, 12.165, 16.800, 18.125, 21.625, 24.645 ],
    "wood_walk": [ 3.330, 4.695, 6.155, 7.545, 10.450, 12.500, 13.920, 16.095 ],
    "linoleum_walk": [ 2.030, 6.285, 7.390, 8.165, 10.125, 11.730, 13.260, 15.710 ],
}
CUTS = {
    "tile_walk": (170503, plant_windows(CLEAN_PLANT_PEAKS["tile_walk"])),
    "tile_slow": (170506, plant_windows(CLEAN_PLANT_PEAKS["tile_slow"])),
    "tile_scuff": (170502, [(3.37, 3.82), (5.03, 5.62), (6.34, 6.88), (8.01, 8.45)]),
    "concrete_walk": (272259, plant_windows(CLEAN_PLANT_PEAKS["concrete_walk"])),
    "carpet_walk": (271925, plant_windows(CLEAN_PLANT_PEAKS["carpet_walk"])),
    "wood_walk": (273375, plant_windows(CLEAN_PLANT_PEAKS["wood_walk"])),
    "linoleum_walk": (272506, plant_windows(CLEAN_PLANT_PEAKS["linoleum_walk"])),
    "wood_trainers_walk": (543685, [(0, .70), (.93, 1.68), (1.80, 2.56)]),
    "gravel_layer": (556002, [(.41, 1.23), (1.52, 2.34), (2.50, 3.33), (3.62, 4.45),
                             (4.68, 5.51), (5.81, 6.72), (6.94, 7.77), (8.06, 8.96)]),
    "grass_layer": (556042, [(1.06, 1.80), (2.40, 3.10), (3.27, 3.97), (4.25, 4.97),
                            (5.25, 6.01), (6.43, 7.13), (7.64, 8.32), (8.52, 9.22)]),
}

NOTE_POOLS = {
    "compiled-field": [503.4, 510.1, 521.8, 529.6],
    "compiled-path": [701.3, 708.9, 720.2, 736.7, 745.9, 758.6],
    "compiled-fault": [641.8, 649.3, 662.7, 674.9, 687.6, 703.1, 710.8, 722.4],
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def db(value):
    return round(20 * math.log10(max(1e-12, float(value))), 5)


def energy(x):
    return math.sqrt(float(np.sum(np.asarray(x, np.float64) ** 2)))


def energy_match(x, target):
    return x * (target / max(1e-12, energy(x)))


def effect(x, filters):
    channels = 1 if x.ndim == 1 else x.shape[1]
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(channels),
         "-i", "-", "-af", filters, "-ar", str(SR), "-ac", str(channels), "-f", "f32le", "-"],
        input=np.asarray(x, dtype="<f4").tobytes(), capture_output=True, check=True)
    y = np.frombuffer(result.stdout, np.float32).copy()
    return y if channels == 1 else y.reshape(-1, channels)


def fade(x, attack=.002, release=.025):
    y = x.copy()
    a, b = min(len(y), round(attack * SR)), min(len(y), round(release * SR))
    if a:
        ramp = np.linspace(0, 1, a)
        y[:a] *= ramp if y.ndim == 1 else ramp[:, None]
    if b:
        ramp = np.linspace(1, 0, b)
        y[-b:] *= ramp if y.ndim == 1 else ramp[:, None]
    return y



def contact_timing(x):
    """A repeatable asset landmark, not a microphone/perception measurement.

    Primary loading onset is the first2ms RMS frame reaching20% of the
    strongest early-load frame. Peak attack is separately reported so an
    aligned threshold cannot hide a late dominant transient.
    """
    mono = np.mean(x, axis=1) if x.ndim == 2 else x
    size = round(.002 * SR)
    count = len(mono) // size
    rms = np.sqrt(np.mean(mono[:count*size].reshape(count, size).astype(np.float64)**2, axis=1))
    early = rms[:max(1, min(len(rms), round(.18 / .002)))]
    peak = max(1e-12, float(np.max(early)))
    active = np.flatnonzero(early >= peak * .20)
    onset = int(active[0]) * .002 if len(active) else 0
    # Whole-clip peak can expose a later unselected impact.
    attack_peak = int(np.argmax(rms)) * .002
    late = rms[min(len(rms)-1, round((onset + .12)/.002)):]
    late_db = db(max(1e-12,float(np.max(late)))/max(1e-12,float(np.max(rms)))) if len(late) else -200
    return {"onsetSeconds": round(onset,6), "peakAttackSeconds": round(attack_peak,6),
            "lateLobeDbAfter120ms": late_db}



def response_timing(x):
    """Measured response landmarks; a diffuse bloom is not a new footfall.

    The first20%-of-maximum RMS crossing defines response onset. Its first
    100ms defines an early attack anchor; the full-file loudest peak remains
    separate because a long diffusion/bow can peak much later.
    """
    values=np.asarray(x,np.float64)
    power=np.mean(values*values,axis=1) if values.ndim == 2 else values*values
    size=round(.002*SR)
    count=len(power)//size
    rms=np.sqrt(np.mean(power[:count*size].reshape(count,size),axis=1))
    peak=max(1e-12,float(np.max(rms)))
    active=np.flatnonzero(rms>=peak*.20)
    onset=int(active[0]) if len(active) else 0
    end=min(len(rms),onset+round(.100/.002)+1)
    early=onset+int(np.argmax(rms[onset:end]))
    return {"onsetSeconds":round(onset*.002,6),
            "responseAttackSeconds":round(early*.002,6),
            "peakAttackSeconds":round(int(np.argmax(rms))*.002,6),
            "responseTimingDefinition":"2ms channel-energy RMS first20%-of-global-peak crossing; early attack is strongest frame within next100ms; full-file peak is reported separately"}

def align_contact(x, bounds):
    timing = contact_timing(x)
    delta = round((timing["onsetSeconds"] - .020) * SR)
    if delta >= 0:
        y = x[delta:]
        edited = [round(bounds[0] + delta / SR,6), bounds[1]]
        pad = 0
    else:
        y = np.pad(x, (-delta, 0))
        edited = list(bounds)
        pad = -delta / SR
    y = fade(y,.003,.035)
    return y, edited, {"primaryContactSeconds": .020,
                       "alignment": "Primary loading onset aligned to20ms using2ms RMS/20%-early-peak landmark; no rate change",
                       "sourceWindowRequested": list(bounds), "leadingPadSeconds": pad,
                       "leadingTrimSeconds": max(0,delta/SR), **contact_timing(y)}

def conv(x, ir, seconds=None):
    length = len(x) + len(ir) - 1
    n = 1 << (length - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(ir, n), n)[:length]
    return y[:round(seconds * SR)] if seconds else y


def fit(x, seconds):
    length = round(seconds * SR)
    return np.pad(x[:length], (0, max(0, length - len(x))))


def diffusion(delay, decay, buildup, seed, seconds=6.15):
    t = np.arange(round(seconds * SR)) / SR
    local = np.maximum(0, t - delay)
    noise = np.random.default_rng(seed).normal(size=len(t)).astype(np.float32)
    noise = effect(noise, "highpass=f=320,lowpass=f=6500")
    envelope = (1 - np.exp(-local / buildup)) * np.exp(-6.9078 * local / decay)
    envelope[t < delay] = 0
    return energy_match(fade(noise * envelope, .002, .10), 1)


def write_wav(path, x):
    x = np.asarray(x, np.float32)
    if x.ndim == 1:
        x = x[:, None]
    assert np.isfinite(x).all(), path
    assert np.max(np.abs(x)) < .98, (path, np.max(np.abs(x)))
    with wave.open(str(path), "wb") as f:
        f.setnchannels(x.shape[1])
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(np.rint(np.clip(x, -.999, .999) * 32767).astype("<i2").tobytes())


def verify(manifest):
    peak = -200
    frames = 0
    for clip_id, c in manifest["clips"].items():
        p = ROOT / "public" / c["url"]
        assert p.is_file() and digest(p) == c["sha256"], clip_id
        with wave.open(str(p), "rb") as f:
            assert f.getframerate() == SR and f.getsampwidth() == 2, clip_id
            n, channels = f.getnframes(), f.getnchannels()
            x = np.frombuffer(f.readframes(n), "<i2").astype(np.float32) / 32767
            assert n > 0 and channels in (1, 2), clip_id
            assert abs(n / SR - c["duration"]) < 1 / SR, clip_id
            assert np.max(np.abs(x)) < .98, clip_id
            assert np.max(np.abs(x[:channels * 48])) < .01, (clip_id, "start discontinuity")
            assert np.max(np.abs(x[-channels * 48:])) < .01, (clip_id, "end discontinuity")
            peak = max(peak, db(np.max(np.abs(x))))
            frames += n * channels
            if c.get("completeContact"):
                measured = contact_timing(x)
                assert abs(measured["onsetSeconds"] - .020) <= .0021, (clip_id, measured)
                assert measured["peakAttackSeconds"] <= .080, (clip_id,"late principal attack",measured)
                assert measured["lateLobeDbAfter120ms"] < -6, (clip_id,"ambiguous late strong lobe",measured)
                assert c["primaryContactSeconds"] == .020
            if c.get("profile","").startswith("compiled-"):
                measured = contact_timing(x)
                assert .020 <= measured["onsetSeconds"] <= .026, (clip_id, measured)
                assert .030 <= measured["peakAttackSeconds"] <= .048, (clip_id, measured)
    for bank in manifest["banks"].values():
        for role in ("walk", "slow", "scuff", "layer"):
            assert all(c in manifest["clips"] for c in bank.get(role, [])), role
    for profile, mapping in manifest["responses"].items():
        assert profile in PROFILES
        for contact, wet in mapping.items():
            assert contact in manifest["clips"]
            if profile.startswith("compiled-"):
                expected = len(NOTE_POOLS[profile])
                assert isinstance(wet, list) and len(wet) == expected
                assert [manifest["clips"][clip_id]["noteIndex"] for clip_id in wet] == list(range(expected))
                assert manifest["profileParameters"][profile]["responseSelection"] == "random-note-no-adjacent-repeat"
            for response in wet if isinstance(wet, list) else [wet]:
                assert manifest["clips"][response]["kind"] == "response"
                assert manifest["clips"][response]["duration"] <= manifest["maxResponseSeconds"]
                c=manifest["clips"][response]
                assert 0<=c["onsetSeconds"]<=c["responseAttackSeconds"]<=c["onsetSeconds"]+.102, (response,"response landmarks")
                if profile.startswith("compiled-"):
                    c = manifest["clips"][response]
                    assert c["voices"] == 1 and c["simultaneousPoolNotes"] == 1
                    assert c["frequencyHz"] == NOTE_POOLS[profile][c["noteIndex"]]
    for bank in ("tarmac", "paving", "setts", "earth", "snow", "water", "ash", "glass"):
        assert manifest["banks"][bank]["walk"], bank
    return {"clipCount": len(manifest["clips"]), "bankCount": len(manifest["banks"]),
            "responseProfiles": list(manifest["responses"]), "samplePeakDbfs": peak,
            "primaryPlantOnsetsSeconds": sorted(set(c["onsetSeconds"] for c in manifest["clips"].values() if c.get("completeContact"))),
            "primaryPlantPeakAttackSeconds": [min(c["peakAttackSeconds"] for c in manifest["clips"].values() if c.get("completeContact")), max(c["peakAttackSeconds"] for c in manifest["clips"].values() if c.get("completeContact"))],
            "compiledAttackPeakSeconds": [min(c["peakAttackSeconds"] for c in manifest["clips"].values() if c.get("profile","").startswith("compiled-")), max(c["peakAttackSeconds"] for c in manifest["clips"].values() if c.get("profile","").startswith("compiled-"))],
            "compiledNotesPerPlant": 1,
            "compiledPoolCounts": {p: len(frequencies) for p, frequencies in NOTE_POOLS.items()},
            "decodedAllClipsBytesFloat32": frames * 4,
            "fileBytes": sum((ROOT / "public" / c["url"]).stat().st_size for c in manifest["clips"].values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Restore missing retained CC0 preview inputs, validating hashes")
    parser.add_argument("--verify", action="store_true", help="Verify existing generated assets without rebuilding")
    parser.add_argument("--refresh-response-timing", action="store_true", help="Refresh response landmark metadata from unchanged existing PCM; no audio rebuild")
    args = parser.parse_args()
    if args.refresh_response_timing:
        manifest=json.loads((OUTPUT / "manifest.json").read_text())
        for clip_id,clip in manifest["clips"].items():
            if clip["kind"] != "response":
                continue
            p=ROOT / "public" / clip["url"]
            before=digest(p)
            with wave.open(str(p),"rb") as f:
                channels=f.getnchannels()
                x=np.frombuffer(f.readframes(f.getnframes()),"<i2").astype(np.float32)/32767
                if channels>1:x=x.reshape(-1,channels)
            clip.update(response_timing(x))
            assert digest(p)==before==clip["sha256"], "Metadata refresh changed PCM"
        manifest.setdefault("contactTiming",{})["responseLandmark"]="Measured2ms-RMS response onset and early100ms attack; long bloom maximum is separate"
        manifest["verification"]=verify(manifest)
        (OUTPUT / "manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
        print(json.dumps(manifest["verification"],indent=2))
        return
    if args.verify:
        print(json.dumps(verify(json.loads((OUTPUT / "manifest.json").read_text())), indent=2))
        return
    source_doc = json.loads((INPUT / "sources.json").read_text())
    sources = source_doc["sources"]
    raw = {}
    for source_id, s in sources.items():
        p = INPUT / s["inputFile"]
        if not p.exists() and args.fetch:
            request = urllib.request.Request(s["previewUrl"], headers={"User-Agent": "ChunkSurfer asset preparation"})
            p.write_bytes(urllib.request.urlopen(request, timeout=60).read())
        if not p.exists():
            raise FileNotFoundError(f"Missing retained CC0 source {p}; use --fetch to restore its hash-checked preview")
        assert digest(p) == s["sha256"], f"Source changed: {p}"
        assert s["license"] == "CC0-1.0", source_id
        decoded = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-f", "f32le", "-ar", str(SR), "-ac", "1", "-"])
        raw[int(source_id)] = np.frombuffer(decoded, np.float32).copy()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1, "sampleRate": SR, "maxResponseSeconds": 6.25,
        "quality": "Published CC0 HQ MP3 previews, decoded/edited to PCM16 WAV at48kHz. No original WAV master acquired; no claim of restored lossless source quality.",
        "sources": sources, "clips": {}, "banks": {}, "responses": {p: {} for p in PROFILES},
        "profileGainDb": {p: 0 for p in PROFILES},
        "responseMix": "Wet/sole ratios are baked into stems. profileGainDb=0; do not apply a second normalization or wet gain.",
        "profileParameters": {},
        "footSide": "Unknown in source recordings; runtime alternation is presentation, not asserted performer left/right metadata.",
        "limitations": ["Source inputs are MP3 previews, not lossless masters.",
                        "Sturmankin wood is a table over carpet/concrete; use structural room/tread layers separately.",
                        "Ordinary shoe families are catalog-consistent, not proven identical physical footwear between creators.",
                        "Outdoor granular sources originally use mountain boots. They are highpassed separate substrate derivatives, never dry player footwear.",
                        "Metal, wet, paper, body, snow, ash and glass layers are authored DSP, not recordings of those floors.",
                        "No running gait is manufactured from a walk. Slow fallbacks reuse walking takes with lower runtime gain metadata.",
                        "Native mixing and critical human listening remain acceptance work."],
    }
    clips_data = {}

    def add(clip_id, x, *, kind="dry", surface=None, gait=None, source_ids=None, bounds=None, gain_db=None, **extra):
        p = OUTPUT / f"{clip_id}.wav"
        x = np.asarray(x, np.float32)
        write_wav(p, x)
        clips_data[clip_id] = x
        manifest["clips"][clip_id] = {
            "url": f"audio/footsteps/{p.name}", "duration": len(x) / SR,
            "channels": 1 if x.ndim == 1 else x.shape[1], "sampleRate": SR,
            "kind": kind, "surface": surface, "gait": gait,
            "sourceIds": [str(i) for i in (source_ids or [])], "sourceWindow": bounds,
            "gainDb": gain_db, "samplePeakDbfs": db(np.max(np.abs(x))),
            "rmsDbfs": db(np.sqrt(np.mean(x * x))), "sha256": digest(p), **extra,
            **(response_timing(x) if kind == "response" else {})}
        return clip_id

    parts = {}
    part_edits = {}
    for name, (source_id, windows) in CUTS.items():
        x = effect(raw[source_id], "highpass=f=65,lowpass=f=14500")
        if name.endswith("_layer"):
            parts[name] = [fade(x[round(a * SR):round(b * SR)], .003, .035) for a, b in windows]
        else:
            aligned = [align_contact(x[round(a*SR):round(b*SR)], (a,b)) for a,b in windows]
            parts[name] = [value[0] for value in aligned]
            part_edits[name] = aligned

    # One gain per family/source span, not per take. Recorded strength differences survive.
    shoe_banks = {}
    tile_peak = max(np.max(np.abs(x)) for n in ("tile_walk", "tile_slow", "tile_scuff") for x in parts[n])
    for name in ("tile_walk", "tile_slow", "tile_scuff", "concrete_walk", "carpet_walk", "wood_walk", "linoleum_walk", "wood_trainers_walk"):
        family, gait = name.rsplit("_", 1)
        source_id, bounds = CUTS[name]
        target = {"carpet": -14, "linoleum": -10, "wood": -9, "concrete": -9}.get(family, -8)
        peak = tile_peak if family == "tile" else max(np.max(np.abs(x)) for x in parts[name])
        gain = 10 ** (target / 20) / max(1e-9, peak)
        ids = []
        for i, (x, (_, window, timing)) in enumerate(zip(parts[name], part_edits[name]), 1):
            ids.append(add(f"shoe_{name}_{i:02}", x * gain, surface=family, gait=gait,
                           source_ids=[source_id], bounds=list(window), gain_db=db(gain),
                           completeContact=gait != "scuff", contactRole="release" if gait == "scuff" else "whole-plant",
                           **timing, actualPerformance="Recorded " + ("scuff" if gait == "scuff" else "walking"),
                           footwear="ordinary sneakers" if source_id != 543685 else "trainers, first three source performances"))
        shoe_banks[name] = ids

    tile = {"walk": shoe_banks["tile_walk"], "slow": shoe_banks["tile_slow"], "scuff": shoe_banks["tile_scuff"], "layer": [],
            "footwearFamily": "SpliceSound male sneakers", "slowUsesWalk": False}
    manifest["banks"]["tile"] = tile
    for surface in ("concrete", "carpet", "wood", "linoleum", "wood_trainers"):
        ids = shoe_banks[f"{surface}_walk"]
        manifest["banks"][surface] = {"walk": ids, "slow": ids, "scuff": [], "layer": [],
            "slowUsesWalk": True, "slowGainDb": -2.5, "footwearFamily": "Nox trainers" if surface == "wood_trainers" else "sturmankin sneakers11",
            "supportTruth": "Large wooden table on carpet over concrete" if surface == "wood" else None}
    for surface in ("source", "void"):
        manifest["banks"][surface] = copy.deepcopy(tile)
    manifest["banks"]["lino"] = copy.deepcopy(manifest["banks"]["linoleum"])
    manifest["banks"]["stone"] = copy.deepcopy(manifest["banks"]["concrete"])
    manifest["banks"]["stone"]["materialQualification"] = "Concrete shoe contact fallback; not a stone-floor recording"

    for surface in ("gravel", "grass"):
        name = f"{surface}_layer"
        source_id, windows = CUTS[name]
        # Remove the boot body's low contact energy; this remains an explicitly sourced derivative.
        selected = [fade(effect(x, "highpass=f=1400,lowpass=f=6500"), .008, .09) for x in parts[name]]
        gain = 10 ** (-19 / 20) / max(np.max(np.abs(x)) for x in selected)
        layers = [add(f"substrate_{surface}_{i:02}", x * gain, kind="layer", surface=surface, gait="contact-texture",
                      source_ids=[source_id], bounds=list(window), gain_db=db(gain),
                      design="Highpassed granular derivative of recorded mountain-boot contact; mixed below independent ordinary-shoe core")
                  for i, (x, window) in enumerate(zip(selected, windows), 1)]
        bank = copy.deepcopy(manifest["banks"]["carpet"])
        bank.update({"layer": layers, "layerGainDb": 0, "materialQualification": "Ordinary sole plus separately identified outdoor substrate derivative"})
        manifest["banks"][surface] = bank

    # Explicit authored substrate responses. They never masquerade as field recordings.
    rng = np.random.default_rng(2910)
    for surface in ("metal", "wet", "paper", "body", "snow", "ash", "glass"):
        layer_ids = []
        reference_ids = tile["walk"] if surface in ("metal", "glass") else manifest["banks"]["carpet"]["walk"]
        reference_energy = sum(energy(clips_data[i]) for i in reference_ids) / len(reference_ids)
        for index in range(6):
            n = round(.66 * SR)
            t = np.arange(n) / SR
            noise = rng.normal(0, 1, n).astype(np.float32)
            if surface == "metal":
                x = np.zeros(n)
                for f, amp, decay in [(173, .5, .24), (281, .3, .30), (431, .19, .19), (614, .12, .25), (963, .06, .12)]:
                    x += amp * np.sin(2 * np.pi * f * t + index * .11) * np.exp(-t / decay)
                x *= (1 - np.exp(-t / .003))
            elif surface in ("paper", "ash", "snow"):
                x = effect(noise, "highpass=f=1200,lowpass=f=7200")
                env = np.exp(-t / .065) + .28 * np.exp(-((t - .13) / .04) ** 2)
                x *= env * (1 - np.exp(-t / .004))
                if surface == "snow":
                    # A bounded synthetic crust/powder release, not a falsely
                    # labelled snow field recording. Grain rate decays after load.
                    modulation = .3 + .7 * np.sin(2 * np.pi * (31 * t - 14 * t * t) + index * .7) ** 2
                    x = effect(x * modulation, "lowpass=f=3400")
                    x += effect(noise, "highpass=f=160,lowpass=f=750") * np.exp(-t/.042) * .10
                elif surface == "ash":
                    x = effect(x, "lowpass=f=4200") * (1 + .22 * np.sin(2*np.pi*47*t + index))
            elif surface == "glass":
                x = effect(noise, "highpass=f=1800,lowpass=f=6800") * np.exp(-t / .013) * .05
                for f, amp, decay in [(683.3, .3, .045), (1109.6, .15, .032), (1852.7, .08, .022)]:
                    x += amp * np.sin(2 * np.pi * f * t) * np.exp(-t / decay) * (1 - np.exp(-t / .001))
            else:
                x = effect(noise, "highpass=f=220,lowpass=f=2300")
                env = (1 - np.exp(-t / .008)) * np.exp(-t / .085)
                env += .30 * np.exp(-((t - .16 - index * .003) / .025) ** 2)
                x *= env
                if surface == "body":
                    phase = 2 * np.pi * (86 * t - 24 * t * t)
                    x += .07 * np.sin(phase) * np.exp(-t / .11)
            x = fade(x, .006, .08)
            ratio = {"metal": .50, "wet": .40, "paper": .38, "body": .30,
                     "snow": .45, "ash": .25, "glass": .17}[surface]
            x = energy_match(x, reference_energy * ratio)
            layer_ids.append(add(f"substrate_{surface}_{index+1:02}", x, kind="layer", surface=surface, gait="contact-texture",
                                 design="Authored bounded DSP contact response; not a floor recording", seed=2910,
                                 layerEnergyRatio=ratio))
        bank = copy.deepcopy(tile if surface in ("metal", "glass") else manifest["banks"]["carpet"])
        bank.update({"layer": layer_ids, "layerGainDb": 0, "materialQualification": "Ordinary shoe contact plus authored substrate response"})
        manifest["banks"][surface] = bank
    manifest["banks"]["dirt"] = copy.deepcopy(manifest["banks"]["grass"])
    manifest["banks"]["dirt"]["materialQualification"] = "Grass granular texture fallback; not a separate soil recording"
    for alias, bank, qualification in [
        ("earth", "dirt", "Ordinary shoe with separate grass-derived granular contact; not a separate soil recording"),
        ("tarmac", "concrete", "Sneaker contact on concrete as close sole fallback; not a separate tarmac recording"),
        ("paving", "stone", "Sneaker contact on concrete as close sole fallback; not a separate paving recording"),
        ("setts", "stone", "Sneaker contact on concrete as close sole fallback; not a separate cobble recording"),
        ("water", "wet", "Ordinary shoe and bounded authored wet contact, not a recorded water footstep"),
    ]:
        manifest["banks"][alias] = copy.deepcopy(manifest["banks"][bank])
        manifest["banks"][alias]["materialQualification"] = qualification

    # Separate, finite returns for the Source core only. Do not bake a walk sequence.
    glass = fade(effect(raw[745014][:round(.55 * SR)], "highpass=f=700,lowpass=f=5600"), .003, .06)
    glass = energy_match(glass, 1)
    bow = effect(raw[711891][round(1.5 * SR):round(4.15 * SR)], "highpass=f=580,lowpass=f=4800")
    trace = np.interp(np.linspace(0, len(bow)-1, round(5 * SR)), np.arange(len(bow)), bow)
    trace = fade(trace, .9, 2.0)
    ir_l, ir_r = diffusion(.08, 4.2, .18, 41), diffusion(.09, 4.2, .20, 71)
    halo_l, halo_r = diffusion(.09, 3.0, .25, 90), diffusion(.09, 3.0, .25, 91)
    source_ids = tile["walk"] + tile["slow"] + tile["scuff"]
    for contact_id in source_ids:
        x = clips_data[contact_id]
        contact_energy = energy(x)
        base = np.stack([conv(x, ir_l, 6.25), conv(x, ir_r, 6.25)], axis=1)
        shifted = effect(base, "asetrate=96000,aresample=48000,atempo=0.5")
        halo = np.stack([conv(shifted[:, 0], halo_l, 6.25), conv(shifted[:, 1], halo_r, 6.25)], axis=1)
        glass_return = np.stack([fit(conv(x, glass), 6.25), fit(conv(x, np.pad(glass, (180, 0))), 6.25)], axis=1)
        wet = energy_match(base, contact_energy * .48) + energy_match(halo, contact_energy * .28) + energy_match(glass_return, contact_energy * .045)
        wet = fade(wet, .003, .20)
        key = add(contact_id + "__glazed", wet, kind="response", source_ids=[745014], responseTo=contact_id,
                  profile="glazed", design="Late-only seeded diffusion plus bounded octave-derived bloom and quiet bottle colour; no measured room or live feedback")
        manifest["responses"]["glazed"][contact_id] = key
        erased = np.zeros((round(5.36 * SR), 2), np.float32)
        tail = energy_match(trace, contact_energy * .16)
        start = round(.32 * SR)
        erased[start:start+len(tail), 0] = tail * .7071
        right = start + 730
        erased[right:right+len(tail), 1] = tail[:len(erased)-right] * .7071
        key = add(contact_id + "__erased", fade(erased, .003, .14), kind="response", source_ids=[711891], responseTo=contact_id,
                  profile="erased", design="Bounded bowed-glass residue; no copied extra footfall or live spectral freeze")
        manifest["responses"]["erased"][contact_id] = key
        for profile, frequencies in NOTE_POOLS.items():
            variants = []
            for note_index, frequency in enumerate(frequencies):
                # One note per accepted plant, drawn at runtime from this small
                # regional pool. The close pitches form a walking sequence,
                # never a simultaneous cluster or autonomous musical clock.
                n = round(1.10 * SR)
                t = np.arange(n) / SR
                decay = .29 + .012 * (note_index % 4)
                attack = 1 - np.exp(-t / .0045)
                partials = [(1.0, 1.0, decay), (2.713, .115, decay * .52), (4.137, .035, decay * .31)]
                modal = sum(amplitude * np.sin(2 * np.pi * frequency * ratio * t) * attack * np.exp(-t / tail)
                            for ratio, amplitude, tail in partials)
                modal = fade(modal, .003, .19)
                # Use the original contact's energy to excite exactly one
                # aligned material resonance. Convolving the whole walking
                # waveform re-excited later heel/toe/release lobes and moved
                # dominant tonal attacks55–225ms after dispatch: successive
                # uniform footfalls could then sound only47ms apart.
                y = fit(np.pad(modal, (round(.020*SR), 0)), 1.10)
                ratio = {"compiled-field": .38, "compiled-path": .40, "compiled-fault": .43}[profile]
                y = energy_match(y, contact_energy * ratio)
                y = fade(y, .003, .19)
                key = add(contact_id + "__" + profile + f"_note{note_index:02}", y, kind="response",
                          source_ids=manifest["clips"][contact_id]["sourceIds"], responseTo=contact_id,
                          profile=profile, voices=1, simultaneousPoolNotes=1, noteIndex=note_index,
                          primaryContactSeconds=.020, **contact_timing(y),
                          excitation="Single aligned material impulse scaled by this contact's total energy; no whole-shoe convolution or late re-excitation",
                          frequencyHz=frequency, poolNoteCount=len(frequencies), wetSoleEnergyRatio=ratio,
                          partials=[{"frequencyRatio": r, "amplitude": a, "decaySeconds": d} for r, a, d in partials],
                          design="One stable microtonal material note per actual contact, chosen from a small regional pool; weak inharmonic partials colour one resonance, no chord, sequencer or pitch-shifted sole")
                variants.append(key)
            manifest["responses"][profile][contact_id] = variants

    manifest["profileParameters"] = {
        "glazed": {"playOn": "plant", "predelayMs": [80, 90], "decaySeconds": 4.2, "finite": True, "bakedWetGain": True},
        "erased": {"playOn": "settle", "predelayMs": 320, "residueSeconds": 5, "finite": True, "bakedWetGain": True,
                   "instruction": "Only eligible last-contact residue on settling/stopping; do not build a residue choir on every plant"},
        **{p: {"playOn": "plant", "frequenciesHz": f, "noteCount": len(f), "notesPerPlant": 1,
               "responseSelection": "random-note-no-adjacent-repeat", "finite": True, "bakedWetGain": True,
               "variationRule": "One random pool note for each accepted plant, excluding the immediately previous pool note; no autonomous sequence",
               "timbre": "One dominant resonance with weak inharmonic partials at2.713/4.137x; not simultaneous pool notes"}
           for p, f in NOTE_POOLS.items()},
    }
    manifest["contactTiming"] = {"primaryContactSeconds": .020,
                                 "landmark": "2ms RMS reaches20% of early primary-load peak; editorial asset anchor, not measured perception",
                                 "selection": "Cleaner whole contact performances replace distinct late strong lobes and large source-level outliers; no individual take leveling",
                                 "compiledExcitation": "One aligned impulse per footfall, finite one-note envelope; entire walking contact is not convolved",
                                 "responseLandmark":"Measured2ms-RMS response onset and early100ms attack; long bloom maximum is separate"}
    manifest["build"] = {"tool": "tools/chunk_surfer/prepare-footstep-audio.py", "inputs": "tools/chunk_surfer/footstep-sources/sources.json",
                         "cuts": {k: {"sourceId": sid, "windows": windows} for k, (sid, windows) in CUTS.items()},
                         "authoredPrimaryStrikes": CLEAN_PLANT_PEAKS, "deterministicSeed": 2910, "normalization": "Common bank/family gain; no individual take leveling, compression or shoe pitch variation"}
    report = verify(manifest)
    manifest["verification"] = report
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    # This directory is owned by this generator. Remove only its old compiled
    # response filenames; never touch retained inputs, other audio, or a new
    # stem named by this build. Avoid shipping the obsolete chord versions.
    active_files = {Path(c["url"]).name for c in manifest["clips"].values()}
    for p in OUTPUT.glob("shoe_tile_*__compiled-*.wav"):
        if p.name not in active_files:
            p.unlink()
    credits = []
    for source_id, source in sources.items():
        credits.append({"id": source_id, "title": source["title"], "author": source["creator"],
                        "url": source["sourceUrl"], "licence": source["license"], "licenceUrl": source["licenseUrl"],
                        "changes": "HQ MP3 preview excerpts; selected complete-contact edits,20ms primary-onset alignment, mono conversion, filtering and shared bank gain; separate finite substrate/Source responses. Shoe pitch and performance time are unchanged."})
    credit_file = ROOT / "src/data/footstep-audio-assets.js"
    credit_file.write_text("// GENERATED by tools/chunk_surfer/prepare-footstep-audio.py; no audio data is bundled here.\n"
                          "export const FOOTSTEP_AUDIO_SOURCES = Object.freeze(\n" + json.dumps(credits, indent=2) + ".map(Object.freeze));\n")
    notice = ["# Footstep and Source footing audio", "",
              "Generated from the retained source manifest by `tools/chunk_surfer/prepare-footstep-audio.py`.", "",
              "All twelve acquired inputs are published Freesound HQ MP3 previews of individually identified CC0-1.0 files. "
              "Original WAV masters were not acquired. Writing PCM WAV derivatives does not restore lossless master quality. "
              "The exact preview bytes, URLs, SHA-256 hashes and author descriptions are retained in "
              "`tools/chunk_surfer/footstep-sources/sources.json`; the input previews are retained beside it for offline rebuilding.", "",
              "## Sources", "", "| ID | Recording | Creator | Licence | Retained preview SHA-256 |", "|---|---|---|---|---|"]
    for source_id, s in sources.items():
        notice.append(f"| {source_id} | [{s['title']}]({s['sourceUrl']}) | {s['creator']} | [CC0-1.0]({s['licenseUrl']}) | `{s['sha256']}` |")
    notice += ["", "## Adaptation and material claims", "",
               "The player core is an ordinary sneaker/low-shoe contact: SpliceSound tile walk/slow/scuff, sturmankin sneakers11 concrete/carpet/wood/linoleum, "
               "and the first three Nox wood trainer contacts as an optional alternate. No boot recording is used as the player's dry sole. "
               "Uploader labels establish broad footwear families, not one proven identical shoe across creators or performer foot side.", "",
               "Cleaner whole contact performances are selected from the continuous originals, downmixed to mono, filtered at65Hz/14.5kHz, and aligned to a20ms editorial primary-load landmark. "
               "Leading preparation/room sound is trimmed, a20ms lead is retained or padded, natural nearby heel/toe and material decay remain, and edges are faded. "
               "Strong ambiguous late clicks/releases and source-level outliers are replaced with cleaner performances rather than normalized individually. "
               "The manifest records adjusted source windows, requested inspection windows, leading trim/pad, measured onset/peak attack and one shared gain per source family. "
               "Strength differences between real takes are preserved; individual recorded steps are not normalized, pitch-randomized or time-compressed. "
               "Only tile has a separate real slow performance. Other slow banks explicitly reuse walk takes with lower gain; no running gait is invented.", "",
               "Nox mountain-boot grass and gravel are highpassed into separate granular substrate derivatives under the independent ordinary-shoe core. "
               "They are not claimed as the same shoe. Metal, wet, paper, body, snow, ash and glass contact layers are bounded authored DSP, not documentary floor recordings. "
               "Tarmac, paving and setts use honestly marked concrete-contact fallbacks. Soil uses the separate grass-derived texture. "
               "The sturmankin wooden support was a large table over carpet/concrete, not an architectural floor.", "",
               "Source uses separate finite response stems excited by a real tile contact, never a prerecorded walk sequence. "
               "Glazed Infinity combines seeded late diffusion, a bounded octave-derived bloom and quiet plucked-bottle colour. "
               "Erased footing uses a bowed-wine-glass residue only after stopping; it is not a live spectral freeze. "
               "Compiled Ground sounds one note per accepted footfall, selected randomly without an adjacent repeat from fixed close microtonal pools: field four notes, path six, fault eight. "
               "The notes appear across successive steps, never as a simultaneous chord. Weak inharmonic partials colour a single material resonance. "
               "Each note is one aligned finite excitation scaled by the source plant's energy, not a convolution of the whole shoe waveform: later release lobes cannot re-trigger its tonal attack. "
               "Every finite response also records its measured channel-energy onset, early100ms attack and full-file loudest peak separately, so a diffuse bloom does not masquerade as a new footfall timing anchor. "
               "There is no independent clock, melody, twelve-tone scale or pitch-shifted sole. The exact frequencies, gains, cuts and processing are in the generated manifest.", "",
               "## Rebuild and verification", "", "```sh", "python3 tools/chunk_surfer/prepare-footstep-audio.py", "python3 tools/chunk_surfer/prepare-footstep-audio.py --verify", "```", "",
               "Python 3, NumPy and FFmpeg are required. Rebuilding is offline with the retained inputs. `--fetch` restores a missing preview and requires its recorded hash. "
               "Verification checks every output hash, duration, PCM format, clip edge, peak, bank reference, finite response limit and one-note pool structure. "
               "The runtime bounds decoded residency and active voices separately. These checks establish asset integrity, not independent listening or native final-mix acceptance.", ""]
    notice_path = ROOT / "third_party/licenses/FOOTSTEP-AUDIO.md"
    notice_path.parent.mkdir(parents=True, exist_ok=True)
    notice_path.write_text("\n".join(notice))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
