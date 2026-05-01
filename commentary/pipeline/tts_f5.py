"""F5-TTS backend — voice-cloned commentary synthesis.

Interface-compatible with tts.py (edge-tts): given a commentary markdown,
produce the same set of mp3s and the same segments.json manifest, but using
F5-TTS with a user-provided reference voice.

Required files (beside the commentary markdown):
  commentary/ref_clip.wav    10–15s reference sample of the target voice
  commentary/ref_text.txt    exact transcript of ref_clip.wav

Model + reference are loaded once; inference is serialized (one section
at a time) because F5-TTS is GPU-heavy.

Exports synth(md_path, out_dir, mid, ref_clip=..., ref_text=...) like tts.py.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

# Make sure ffmpeg is reachable for pydub / torchaudio resampling.
_FFMPEG = r"C:\Users\time_\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1-full_build\bin"
if Path(_FFMPEG).exists():
    os.environ["PATH"] += os.pathsep + _FFMPEG

import soundfile as sf  # noqa: E402
import subprocess       # noqa: E402

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths  # noqa: E402

SECTION_RE = re.compile(r"^\[Turns?\s+(\d+)(?:[-–](\d+))?\]")
PROFILE_RE = re.compile(r"^\[Profile\]\s*$")


def clean_line(s: str) -> str:
    s = re.sub(r"<!--.*?-->", "", s)
    s = re.sub(r"\*+", "", s)
    s = s.replace("—", ".").replace("–", ".").replace("…", ".")
    return s.strip()


def parse_md(md: str):
    intro, profile, outro = [], [], []
    sections: list[tuple[int, int, list[str]]] = []
    state = "pre"
    cur_section = None
    cur_lines: list[str] = []

    def flush():
        nonlocal cur_section, cur_lines
        if cur_section is not None:
            sections.append((cur_section[0], cur_section[1], list(cur_lines)))
        cur_section, cur_lines = None, []

    for raw in md.splitlines():
        s = raw.strip()
        if s.startswith("## Broadcast Script"):
            state = "intro"
            continue
        if state == "pre":
            continue
        if s.startswith("#") and not s.startswith("##"):
            continue
        if s == "---":
            flush()
            state = "outro"
            continue
        if PROFILE_RE.match(s):
            state = "profile"
            continue
        m = SECTION_RE.match(s)
        if m:
            flush()
            first = int(m.group(1))
            last = int(m.group(2)) if m.group(2) else first
            cur_section = (first, last)
            state = "sections"
            continue
        c = clean_line(s)
        if not c:
            continue
        if state == "intro":
            intro.append(c)
        elif state == "profile":
            profile.append(c)
        elif state == "sections":
            cur_lines.append(c)
        elif state == "outro":
            outro.append(c)
    flush()
    return {"intro": intro, "profile": profile, "sections": sections, "outro": outro}


def wav_to_mp3(wav_path: Path, mp3_path: Path):
    subprocess.run([
        "ffmpeg", "-y", "-i", str(wav_path),
        "-ar", "24000", "-ac", "1", "-b:a", "128k",
        str(mp3_path),
    ], check=True, capture_output=True)
    wav_path.unlink(missing_ok=True)


def synth_all(base: Path, mid: int,
              ref_clip: Path, ref_text: str,
              model: str = "F5TTS_v1_Base",
              nfe_step: int = 32, cfg_strength: float = 2.0, speed: float = 1.0,
              seed: int = 42):
    from f5_tts.api import F5TTS   # import inside to avoid loading torch when skipped

    pp = paths(base, mid)
    md_path = pp["md"]
    parsed = parse_md(md_path.read_text(encoding="utf-8"))
    intro, profile, sections, outro = (
        parsed["intro"], parsed["profile"], parsed["sections"], parsed["outro"])

    print(f"[f5] loading {model} ...")
    t0 = time.time()
    tts = F5TTS(model=model)
    print(f"[f5] loaded in {time.time()-t0:.1f}s")

    ref_text_str = ref_text.strip()

    def run_one(text: str, out_mp3: Path, label: str):
        if not text.strip():
            out_mp3.write_bytes(b"")
            print(f"[f5] {label}: EMPTY")
            return
        t0 = time.time()
        wav, sr, _ = tts.infer(
            ref_file=str(ref_clip),
            ref_text=ref_text_str,
            gen_text=text,
            speed=speed,
            nfe_step=nfe_step,
            cfg_strength=cfg_strength,
            seed=seed,
            remove_silence=True,
        )
        tmp_wav = out_mp3.with_suffix(".wav")
        sf.write(str(tmp_wav), wav, sr)
        wav_to_mp3(tmp_wav, out_mp3)
        print(f"[f5] {label}: {len(text.split())} words -> "
              f"{len(wav)/sr:.1f}s audio in {time.time()-t0:.1f}s")

    intro_p   = pp["intro_mp3"]
    profile_p = pp["profile_mp3"]
    outro_p   = pp["outro_mp3"]
    temp = pp["temp_dir"]

    # F5-TTS is GPU-bound and NOT thread-safe — serialize.
    run_one("\n".join(intro), intro_p, "intro")
    run_one("\n".join(profile), profile_p, "profile")

    seg_entries = []
    for first, last, lines in sections:
        seg_p = temp / (f"{mid}_seg_{first}.mp3" if first == last
                         else f"{mid}_seg_{first}-{last}.mp3")
        run_one("\n".join(lines), seg_p,
                f"seg_{first}" if first == last else f"seg_{first}-{last}")
        seg_entries.append({
            "first": first, "last": last,
            "path": seg_p.name,
            "words": sum(len(l.split()) for l in lines),
            "lines": lines,
        })

    run_one("\n".join(outro), outro_p, "outro")

    manifest = {
        "engine": "f5-tts",
        "intro":   {"path": intro_p.name,   "lines": intro},
        "profile": {"path": profile_p.name, "lines": profile},
        "outro":   {"path": outro_p.name,   "lines": outro},
        "segments": seg_entries,
    }
    manifest_p = pp["segments_json"]
    manifest_p.write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                          encoding="utf-8")
    print(f"[f5] manifest -> {manifest_p.name} ({len(seg_entries)} segments)")
    return manifest


def synth(base: Path, mid: int, ref_clip: Path, ref_text: str, **kw):
    return synth_all(base, mid, ref_clip, ref_text, **kw)


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(__file__).resolve().parent.parent
    ref_clip = base / "ref_clip.wav"
    ref_text = (base / "ref_text.txt").read_text(encoding="utf-8").strip()
    if not ref_clip.exists():
        sys.exit(f"missing {ref_clip}")
    synth(base, mid, ref_clip, ref_text)
