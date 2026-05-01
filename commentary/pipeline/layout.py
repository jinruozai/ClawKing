"""Canonical path layout for a match.

Every match lives in its own directory under the commentary base:

    commentary/<id>/
        <id>.md              commentary script (Claude writes/edits)
        <id>_final.mp4       the deliverable video
        <id>_social.txt      social-media title + description + chapters + hashtags
        <id>_twitter.txt     short natural X/Twitter post copy
        temp/                all intermediate + debug artifacts
            <id>.log
            <id>.template.md
            <id>.turns.json
            <id>_replay.webm
            <id>_profile.png
            <id>_homepage_intro.webm
            <id>_homepage_outro.webm
            <id>_script.webm
            <id>_intro.mp3 / <id>_profile.mp3 / <id>_outro.mp3
            <id>_seg_<first>[-<last>].mp3
            <id>_segments.json
            <id>_timeline.json
            <id>_subs.srt
            <id>_qa.json
            <id>_qa_frames.png

Modules import `paths()` to look up where a given asset belongs. No other
file in the pipeline hardcodes path construction.
"""
from pathlib import Path


def match_dir(base: Path, mid: int) -> Path:
    """Absolute path to the per-match directory (created if missing)."""
    d = Path(base) / str(mid)
    d.mkdir(parents=True, exist_ok=True)
    (d / "temp").mkdir(exist_ok=True)
    return d


def temp_dir(base: Path, mid: int) -> Path:
    d = match_dir(base, mid) / "temp"
    d.mkdir(exist_ok=True)
    return d


def paths(base: Path, mid: int) -> dict[str, Path]:
    """Returns a dict of named paths for every file this pipeline writes
    or reads. Directories are ensured to exist."""
    d = match_dir(base, mid)
    t = temp_dir(base, mid)
    return {
        "match_dir": d,
        "temp_dir": t,

        # finals (visible to the user)
        "md":        d / f"{mid}.md",
        "final_mp4": d / f"{mid}_final.mp4",
        "social":    d / f"{mid}_social.txt",
        "twitter":   d / f"{mid}_twitter.txt",

        # intermediates (temp)
        "log":             t / f"{mid}.log",
        "template":        t / f"{mid}.template.md",
        "turns":           t / f"{mid}.turns.json",
        "replay":          t / f"{mid}_replay.webm",
        "profile_png":     t / f"{mid}_profile.png",
        "homepage_intro":  t / f"{mid}_homepage_intro.webm",
        "homepage_outro":  t / f"{mid}_homepage_outro.webm",
        "script_webm":     t / f"{mid}_script.webm",
        "intro_mp3":       t / f"{mid}_intro.mp3",
        "profile_mp3":     t / f"{mid}_profile.mp3",
        "outro_mp3":       t / f"{mid}_outro.mp3",
        "segments_json":   t / f"{mid}_segments.json",
        "timeline_json":   t / f"{mid}_timeline.json",
        "subs_srt":        t / f"{mid}_subs.srt",
        "subs_ass":        t / f"{mid}_subs.ass",
        "qa_json":         t / f"{mid}_qa.json",
        "qa_frames":       t / f"{mid}_qa_frames.png",
    }


def legacy_flat_to_new(base: Path, mid: int) -> int:
    """Migrate a match whose files sit flat in `base/` into `base/<id>/{,temp/}`.

    Returns the number of files moved. Safe to run multiple times — files
    already in the right place stay put.
    """
    p = paths(base, mid)
    final_map = {
        f"{mid}.md":         p["md"],
        f"{mid}_final.mp4":  p["final_mp4"],
        f"{mid}_social.txt": p["social"],
        f"{mid}_twitter.txt": p["twitter"],
    }
    temp_names = [
        f"{mid}.log", f"{mid}.template.md", f"{mid}.turns.json",
        f"{mid}_replay.webm", f"{mid}_profile.png",
        f"{mid}_homepage_intro.webm", f"{mid}_homepage_outro.webm",
        f"{mid}_homepage.webm",   # legacy combined clip
        f"{mid}_script.webm",
        f"{mid}_intro.mp3", f"{mid}_profile.mp3", f"{mid}_outro.mp3",
        f"{mid}_segments.json", f"{mid}_timeline.json",
        f"{mid}_subs.srt", f"{mid}_final.srt",
        f"{mid}_qa.json", f"{mid}_qa_frames.png",
    ]
    moved = 0
    for name, dest in final_map.items():
        src = base / name
        if src.exists() and src.is_file():
            if dest.exists(): dest.unlink()
            src.rename(dest)
            moved += 1
    t = p["temp_dir"]
    for name in temp_names:
        src = base / name
        if src.exists() and src.is_file():
            dest = t / name
            if dest.exists(): dest.unlink()
            src.rename(dest)
            moved += 1
    # per-section segment mp3s
    for f in list(base.glob(f"{mid}_seg_*.mp3")):
        dest = t / f.name
        if dest.exists(): dest.unlink()
        f.rename(dest)
        moved += 1
    return moved
