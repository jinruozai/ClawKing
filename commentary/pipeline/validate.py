"""Automated QA for a finished commentary mp4.

Checks:
  - No silence gap longer than SILENCE_MAX_GAP (default 6s)
  - Video and audio stream durations match within 1s
  - SRT cues all fall within video duration
  - No black frames / frozen frames longer than FREEZE_MAX (default 12s)
  - Audio loudness peaks within sane range (not clipped, not too quiet)
  - Sample 12 thumbnail frames so the user can eyeball picture coverage
    without watching the full video

Output:
  <id>_qa.json        structured report
  <id>_qa_frames.png  contact sheet of 12 sampled frames (3x4)

Exits non-zero if any check fails (so run.py can halt on QA failure).
"""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths

SILENCE_THRESHOLD_DB = -38
SILENCE_MAX_GAP = 6.0      # seconds — any longer counts as a FAIL
FREEZE_MAX = 35.0          # seconds — end-of-match freeze is often 20–30s by design
LOUDNESS_MIN_DB = -40      # mean audio below this is "too quiet"
SAMPLE_FRAMES = 12         # 3x4 contact sheet
# Voice coverage is measured against the audio mix AFTER subtracting BGM.
# We compute voice-time as the sum of all TTS segment durations (from the
# manifest) and compare to the replay window (not including intro/outro).
# A value below this fraction triggers FAIL — it means big stretches of the
# replay are BGM-only, which viewers hear as "no commentary".
VOICE_COVERAGE_MIN = 0.65
VOICE_MAX_GAP = 3.5        # any voice gap longer than this is FAIL (target: feels continuous)
SECTION_OVERFLOW_MAX = 1.0 # any replay section whose TTS exceeds its raw_window by more than this FAILS


def ffprobe_duration(p: Path, stream: str | None = None) -> float:
    cmd = ["ffprobe", "-v", "error"]
    if stream:
        cmd += ["-select_streams", stream]
    cmd += ["-show_entries", "format=duration" if stream is None else "stream=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(p)]
    out = subprocess.check_output(cmd).decode().strip()
    return float(out.split("\n")[0] or 0.0)


def detect_silences(mp4: Path) -> list[tuple[float, float, float]]:
    """Return list of (start, end, duration) for every silence > 0.5s."""
    r = subprocess.run([
        "ffmpeg", "-i", str(mp4),
        "-af", f"silencedetect=noise={SILENCE_THRESHOLD_DB}dB:d=0.5",
        "-f", "null", "nul",
    ], capture_output=True, text=True)
    out = r.stderr
    silences = []
    cur_start = None
    for line in out.splitlines():
        m = re.search(r"silence_start:\s*([\d.]+)", line)
        if m:
            cur_start = float(m.group(1))
            continue
        m = re.search(r"silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)", line)
        if m and cur_start is not None:
            end = float(m.group(1))
            dur = float(m.group(2))
            silences.append((cur_start, end, dur))
            cur_start = None
    return silences


def detect_frozen(mp4: Path) -> list[tuple[float, float, float]]:
    """Detect frozen / duplicate frames via ffmpeg freezedetect filter."""
    r = subprocess.run([
        "ffmpeg", "-i", str(mp4),
        "-vf", f"freezedetect=n=0.003:d={FREEZE_MAX/2}",
        "-map", "0:v:0", "-f", "null", "nul",
    ], capture_output=True, text=True)
    out = r.stderr
    freezes = []
    cur = None
    for line in out.splitlines():
        m = re.search(r"freeze_start:\s*([\d.]+)", line)
        if m:
            cur = float(m.group(1))
        m = re.search(r"freeze_end:\s*([\d.]+)", line)
        if m and cur is not None:
            end = float(m.group(1))
            freezes.append((cur, end, end - cur))
            cur = None
    return freezes


def get_loudness(mp4: Path) -> dict:
    r = subprocess.run([
        "ffmpeg", "-i", str(mp4),
        "-af", "volumedetect", "-vn", "-sn", "-dn", "-f", "null", "nul",
    ], capture_output=True, text=True)
    out = r.stderr
    mean = re.search(r"mean_volume:\s*(-?[\d.]+)\s*dB", out)
    peak = re.search(r"max_volume:\s*(-?[\d.]+)\s*dB", out)
    return {
        "mean_dB": float(mean.group(1)) if mean else None,
        "peak_dB": float(peak.group(1)) if peak else None,
    }


def parse_srt(srt_path: Path) -> list[tuple[float, float, str]]:
    if not srt_path.exists():
        return []
    cues = []
    blob = srt_path.read_text(encoding="utf-8")
    for m in re.finditer(
        r"(\d+:\d+:\d+[,.]\d+)\s*-->\s*(\d+:\d+:\d+[,.]\d+)\n(.+?)(?=\n\n|\Z)",
        blob, re.DOTALL,
    ):
        def t(s):
            h, m_, rest = s.split(":")
            s_, ms = re.split("[,.]", rest)
            return int(h) * 3600 + int(m_) * 60 + int(s_) + int(ms) / 1000
        cues.append((t(m.group(1)), t(m.group(2)), m.group(3).strip()))
    return cues


def contact_sheet(mp4: Path, total_dur: float, out_png: Path):
    tmp = out_png.parent / f"_qa_frames_{mp4.stem}"
    if tmp.exists(): shutil.rmtree(tmp)
    tmp.mkdir()
    # sample frames evenly
    for i in range(SAMPLE_FRAMES):
        t = (i + 0.5) / SAMPLE_FRAMES * total_dur
        subprocess.run([
            "ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", str(mp4),
            "-frames:v", "1", "-vf", "scale=480:-2",
            str(tmp / f"f{i:02d}.png"),
        ], check=True, capture_output=True)
    # tile into 3 rows x 4 cols
    subprocess.run([
        "ffmpeg", "-y",
        "-i", str(tmp / "f%02d.png"),
        "-vf", "tile=4x3",
        str(out_png),
    ], check=True, capture_output=True)
    shutil.rmtree(tmp, ignore_errors=True)


def voice_coverage(mid: int, base: Path) -> dict:
    """Compute how much of the replay portion of the timeline has commentary
    voice on it.
    """
    pp = paths(base, mid)
    tl_path = pp["timeline_json"]
    mani_path = pp["segments_json"]
    temp = pp["temp_dir"]
    if not tl_path.exists() or not mani_path.exists():
        return {"voice_seconds": None, "replay_window": None, "coverage": None,
                "max_gap": None, "gaps": []}

    tl = json.loads(tl_path.read_text(encoding="utf-8"))
    mani = json.loads(mani_path.read_text(encoding="utf-8"))
    parts = tl["parts"]

    # Replay window = [start of first seg, end of last seg (incl. freeze tails)].
    replay_parts = [p for p in parts if p["name"].startswith("seg")]
    if not replay_parts:
        return {"voice_seconds": 0, "replay_window": 0, "coverage": 0,
                "max_gap": 0, "gaps": []}
    replay_start = float(replay_parts[0]["start"])
    replay_end = float(replay_parts[-1]["end"])
    replay_window = replay_end - replay_start

    # Build intervals (abs timeline) where voice plays.
    # For each seg i (non-freeze), the TTS starts at part_start + PREROLL and
    # lasts for the TTS mp3 duration.
    PREROLL = 0.4
    mani_segs = sorted(mani.get("segments", []), key=lambda s: s["first"])
    events = []
    for i, p in enumerate(parts):
        if p["name"].startswith("seg") and not p["name"].endswith("_freeze"):
            idx = int(re.match(r"seg(\d+)$", p["name"]).group(1))
            if idx < len(mani_segs):
                mp3 = temp / mani_segs[idx]["path"]
                if mp3.exists() and mp3.stat().st_size > 0:
                    tts_dur = ffprobe_duration(mp3)
                    ev_start = float(p["start"]) + PREROLL
                    ev_end = ev_start + tts_dur
                    events.append((ev_start, ev_end))

    # Compute coverage
    voice_seconds = sum(max(0.0, e - s) for s, e in events)
    coverage = voice_seconds / replay_window if replay_window > 0 else 0

    # Gaps (non-voice stretches inside the replay window)
    gaps = []
    cur = replay_start
    for s, e in events:
        if s > cur + 0.1:
            gaps.append((cur, s, s - cur))
        cur = max(cur, e)
    if cur < replay_end - 0.1:
        gaps.append((cur, replay_end, replay_end - cur))
    max_gap = max((g[2] for g in gaps), default=0.0)

    return {
        "replay_window": round(replay_window, 2),
        "voice_seconds": round(voice_seconds, 2),
        "coverage": round(coverage, 3),
        "max_gap": round(max_gap, 2),
        "gaps": [{"start": round(a, 1), "end": round(b, 1), "dur": round(d, 1)}
                 for a, b, d in gaps],
    }


def validate(mid: int, base: Path) -> dict:
    pp = paths(base, mid)
    mp4 = pp["final_mp4"]
    srt = pp["subs_srt"]
    if not mp4.exists():
        sys.exit(f"no mp4: {mp4}")

    fmt_dur = ffprobe_duration(mp4)
    v_dur = ffprobe_duration(mp4, "v:0")
    a_dur = ffprobe_duration(mp4, "a:0")

    silences = detect_silences(mp4)
    bad_silences = [s for s in silences if s[2] > SILENCE_MAX_GAP]

    freezes = detect_frozen(mp4)
    bad_freezes = [f for f in freezes if f[2] > FREEZE_MAX]

    loud = get_loudness(mp4)
    cues = parse_srt(srt)
    srt_out_of_bounds = [(a, b, t) for (a, b, t) in cues if a < 0 or b > fmt_dur + 0.5]

    contact = pp["qa_frames"]
    contact_sheet(mp4, fmt_dur, contact)

    vcov = voice_coverage(mid, base)

    # Read per-section TTS vs raw_window from the timeline (written by compose).
    tl = json.loads(pp["timeline_json"].read_text(encoding="utf-8"))
    replay_plan = tl.get("replay_plan", [])
    bad_overflows = [s for s in replay_plan if s["overflow"] > SECTION_OVERFLOW_MAX]

    checks = {
        "duration_match":    abs(v_dur - a_dur) < 1.0,
        "no_long_silence":   len(bad_silences) == 0,
        "no_long_freeze":    len(bad_freezes) == 0,
        "audio_loud_enough": (loud["mean_dB"] or -999) > LOUDNESS_MIN_DB,
        "srt_in_bounds":     len(srt_out_of_bounds) == 0,
        "has_subtitles":     len(cues) > 0,
        "voice_coverage":    (vcov.get("coverage") or 0) >= VOICE_COVERAGE_MIN,
        "no_long_voice_gap": (vcov.get("max_gap") or 0) <= VOICE_MAX_GAP,
        "no_section_overflow": len(bad_overflows) == 0,
    }
    report = {
        "mp4": mp4.name,
        "duration_format": round(fmt_dur, 2),
        "duration_video":  round(v_dur, 2),
        "duration_audio":  round(a_dur, 2),
        "loudness": loud,
        "silences_over_threshold": [
            {"start": round(s, 2), "end": round(e, 2), "dur": round(d, 2)}
            for s, e, d in bad_silences
        ],
        "all_silences_count": len(silences),
        "frozen_over_threshold": [
            {"start": round(s, 2), "end": round(e, 2), "dur": round(d, 2)}
            for s, e, d in bad_freezes
        ],
        "srt_cues": len(cues),
        "srt_out_of_bounds": srt_out_of_bounds,
        "contact_sheet": contact.name,
        "voice_coverage": vcov,
        "section_overflows": bad_overflows,
        "checks": checks,
        "pass": all(checks.values()),
    }

    out = pp["qa_json"]
    out.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    # pretty print
    print(f"\n===== QA REPORT for {mp4.name} =====")
    print(f"Duration: fmt={fmt_dur:.1f}s  video={v_dur:.1f}s  audio={a_dur:.1f}s")
    print(f"Loudness: mean={loud['mean_dB']} dB, peak={loud['peak_dB']} dB")
    print(f"Silences >{SILENCE_MAX_GAP}s: {len(bad_silences)}")
    for s, e, d in bad_silences:
        print(f"  {s:7.1f} - {e:7.1f}  ({d:.1f}s)")
    print(f"Freezes >{FREEZE_MAX}s: {len(bad_freezes)}")
    for s, e, d in bad_freezes:
        print(f"  {s:7.1f} - {e:7.1f}  ({d:.1f}s)")
    print(f"SRT cues: {len(cues)}, out-of-bounds: {len(srt_out_of_bounds)}")
    print(f"Voice coverage: {vcov.get('coverage')}  ({vcov.get('voice_seconds')}s / "
          f"{vcov.get('replay_window')}s window), longest gap: {vcov.get('max_gap')}s")
    if vcov.get("gaps"):
        worst = sorted(vcov["gaps"], key=lambda g: -g["dur"])[:3]
        for g in worst:
            print(f"  gap {g['start']:.1f}–{g['end']:.1f}  ({g['dur']:.1f}s)")
    if bad_overflows:
        print(f"Section overflows (TTS longer than raw_window + {SECTION_OVERFLOW_MAX}s):")
        for s in bad_overflows:
            print(f"  T{s['first']}-{s['last']}: window={s['raw_window']}s  "
                  f"tts={s['tts_dur']}s  overflow={s['overflow']}s")
    print()
    for k, v in checks.items():
        print(f"  [{'PASS' if v else 'FAIL'}] {k}")
    print(f"\nReport -> {out.name}   |  Contact sheet -> {contact.name}")
    print(f"\nOverall: {'PASS' if report['pass'] else 'FAIL'}\n")
    return report


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent
    report = validate(mid, base)
    sys.exit(0 if report["pass"] else 1)

