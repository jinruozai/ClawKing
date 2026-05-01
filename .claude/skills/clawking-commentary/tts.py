"""Generate TTS segments from a commentary markdown.

Input markdown layout (the parser is strict about it):

    ## Broadcast Script
    <intro lines (one clause per line)>
    ---OR---
    [Turns 1-6]
    <play lines for that section>
    [Turn 7]
    <play lines>
    ...
    ---
    <outro lines>

The intro is everything between "## Broadcast Script" and the first
[Turn ...] / [Turns ...] marker. The outro is everything after the
horizontal rule (---).

Outputs:
    <id>_intro.mp3
    <id>_seg_<first>-<last>.mp3   (one per [Turns X-Y] block)
    <id>_seg_<n>.mp3              (alias for [Turn N])
    <id>_outro.mp3
    <id>_segments.json            list of {turns: [first,last], path}
"""
import asyncio
import json
import re
import sys
from pathlib import Path

import edge_tts

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths

VOICE_DEFAULT = "en-US-AndrewMultilingualNeural"
SECTION_RE = re.compile(r"^\[Turns?\s+(\d+)(?:[-–](\d+))?\]")
PROFILE_RE = re.compile(r"^\[Profile\]\s*$")


def clean_line(s: str) -> str:
    s = re.sub(r"<!--.*?-->", "", s)
    s = re.sub(r"\*+", "", s)
    s = s.replace("—", ".").replace("–", ".").replace("…", ".")
    return s.strip()


def parse_md(md: str):
    """Return dict with intro/profile/sections/outro."""
    intro: list[str] = []
    profile: list[str] = []
    outro: list[str] = []
    sections: list[tuple[int, int, list[str]]] = []

    state = "pre"          # pre -> intro -> profile? -> sections -> outro
    cur_section = None
    cur_lines: list[str] = []

    def flush_section():
        nonlocal cur_section, cur_lines
        if cur_section is not None:
            sections.append((cur_section[0], cur_section[1], list(cur_lines)))
        cur_section, cur_lines = None, []

    for raw in md.splitlines():
        s = raw.rstrip()
        stripped = s.strip()

        if stripped.startswith("## Broadcast Script"):
            state = "intro"
            continue
        if state == "pre":
            continue
        if stripped.startswith("#") and not stripped.startswith("##"):
            continue
        if stripped == "---":
            flush_section()
            state = "outro"
            continue

        if PROFILE_RE.match(stripped):
            state = "profile"
            continue

        m = SECTION_RE.match(stripped)
        if m:
            flush_section()
            first = int(m.group(1))
            last = int(m.group(2)) if m.group(2) else first
            cur_section = (first, last)
            state = "sections"
            continue

        c = clean_line(stripped)
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

    flush_section()
    return {"intro": intro, "profile": profile, "sections": sections, "outro": outro}


async def _synth(text: str, voice: str, rate: str, out: Path):
    if not text.strip():
        out.write_bytes(b"")  # placeholder; compose treats empty as silence
        print(f"[tts] {out.name}: EMPTY")
        return
    print(f"[tts] {out.name}: {len(text.split()):3d} words @ {rate}")
    comm = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await comm.save(str(out))


async def synth_all(base: Path, mid: int,
                    voice: str = VOICE_DEFAULT,
                    rate: str = "+0%"):
    """Render every section at one constant rate. Pace comes from the
    script (line breaks → pauses) and from compose-stage freeze frames,
    never from atempo."""
    pp = paths(base, mid)
    parsed = parse_md(pp["md"].read_text(encoding="utf-8"))
    intro, profile, sections, outro = (parsed["intro"], parsed["profile"],
                                        parsed["sections"], parsed["outro"])

    intro_p   = pp["intro_mp3"]
    profile_p = pp["profile_mp3"]
    outro_p   = pp["outro_mp3"]

    tasks = [
        _synth("\n".join(intro), voice, rate, intro_p),
        _synth("\n".join(profile), voice, rate, profile_p),
        _synth("\n".join(outro), voice, rate, outro_p),
    ]
    seg_paths = []
    temp = pp["temp_dir"]
    for first, last, lines in sections:
        seg_p = temp / (f"{mid}_seg_{first}.mp3" if first == last
                         else f"{mid}_seg_{first}-{last}.mp3")
        seg_paths.append({
            "first": first, "last": last,
            "path": seg_p.name,
            "words": sum(len(l.split()) for l in lines),
            "lines": lines,
        })
        tasks.append(_synth("\n".join(lines), voice, rate, seg_p))

    await asyncio.gather(*tasks)

    manifest = {
        "intro":   {"path": intro_p.name,   "lines": intro},
        "profile": {"path": profile_p.name, "lines": profile},
        "outro":   {"path": outro_p.name,   "lines": outro},
        "segments": seg_paths,
    }
    manifest_p = pp["segments_json"]
    manifest_p.write_text(json.dumps(manifest, indent=2, ensure_ascii=False),
                          encoding="utf-8")
    print(f"[tts] manifest -> {manifest_p.name} "
          f"({len(seg_paths)} segments, profile={'yes' if profile else 'no'})")
    return manifest


def synth(base: Path, mid: int, **kw):
    return asyncio.run(synth_all(base, mid, **kw))


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(__file__).resolve().parent.parent
    synth(base, mid)
