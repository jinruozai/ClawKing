"""Compose a final mp4 from replay + per-section TTS, with freeze-frame sync.

Architecture:
  - The replay video plays at native speed.
  - For each script section, compute its "raw window" = time(last+1) - time(first).
  - If TTS duration > raw_window - PREROLL, insert a freeze frame at the END of
    that section so the picture holds while the commentator finishes.
  - Audio is laid down on a timeline; offsets follow the (now extended) video
    timeline exactly. No atempo. Ever.

Pipeline:
  intro card  →  profile card (replay screenshot)  →  replay segments interleaved
  with optional freeze segments  →  outro card (freeze frame of last replay frame)

Inputs (in <work_dir>):
  <id>_replay.webm
  <id>_profile.png            (screenshot taken at turn 1, optional)
  <id>.turns.json
  <id>.md                     (commentary script)
  <id>_segments.json          (TTS manifest produced by tts.py)
  <id>_intro.mp3 / <id>_profile.mp3 / <id>_outro.mp3
  <id>_seg_<first>[-<last>].mp3

Outputs:
  <id>_final.mp4
  <id>_final.srt              (subtitles, one cue per line)
  <id>_timeline.json          (debug: every part's [start, end])
"""
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths

W, H = 1920, 1080
FPS = 30
PREROLL = 0.4               # commentary starts this many seconds AFTER segment begins
FREEZE_TAIL = 0.0           # replay sections play at native speed; no freeze injection
SEC_GAP = 0.0               # extra silence between sections
FONT_FILE = "C\\:/Windows/Fonts/segoeuib.ttf"
FONT_FILE_REG = "C\\:/Windows/Fonts/segoeui.ttf"
# BGM config
BGM_DIR_NAME = "bgm"
BGM_VOLUME = 0.13           # background music gain under voice
BGM_FADE = 0.8              # fade-in / fade-out between phases
# Subtitle style — applied inside a hand-written ASS file with an explicit
# PlayResY=1080 so Fontsize/MarginV are true pixel values. The ffmpeg
# `subtitles=` filter's SRT→ASS conversion ignores PlayResY hints and
# renders everything in its internal 384x288 script space, which scaled up
# made Fontsize=22 look like ~60px and MarginV=40 look like ~170px.
SUB_FONT = "Segoe UI Semibold"
SUB_FONTSIZE = 56
SUB_MARGIN_V = 48       # pixels from bottom
SUB_PRIMARY  = "&H0000B8FF"   # #FFB800 orange-yellow (ASS is BGR with alpha)
SUB_OUTLINE  = "&H00000000"   # black
SUB_OUTLINE_W = 2
SUB_SHADOW_W = 1


@dataclass
class Part:
    name: str
    video_path: Path
    duration: float
    audio: list[tuple[float, Path, str]] = field(default_factory=list)
    # audio: list of (offset_within_part_seconds, mp3_path, spoken_text_for_srt)


def ffprobe_duration(p: Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(p),
    ])
    return float(out.decode().strip() or 0.0)


def run(cmd):
    print("[ffmpeg]", " ".join(str(c) for c in cmd[:8]) + (" ..." if len(cmd) > 8 else ""))
    subprocess.run(cmd, check=True, capture_output=True)


VENC = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", str(FPS),
        "-profile:v", "high", "-preset", "veryfast", "-crf", "20"]


def render_intro_card(mid: int, audio_path: Path, homepage_webm: Path | None,
                       replay_webm: Path | None, tmp: Path) -> Part:
    """Intro background = the first N seconds of homepage clip, unmodified.
    No dark overlay, no title text — just the homepage as-is."""
    dur = ffprobe_duration(audio_path)
    out = tmp / "intro.mp4"

    if homepage_webm and homepage_webm.exists():
        run([
            "ffmpeg", "-y",
            "-ss", "0", "-i", str(homepage_webm),
            "-t", f"{dur:.3f}",
            "-vf",
            f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={FPS}",
            *VENC, "-an",
            str(out),
        ])
    elif replay_webm and replay_webm.exists():
        first_frame = tmp / "intro_bg.png"
        try:
            run([
                "ffmpeg", "-y", "-ss", "0.5", "-i", str(replay_webm),
                "-frames:v", "1", str(first_frame),
            ])
            run([
                "ffmpeg", "-y",
                "-loop", "1", "-t", f"{dur:.3f}", "-i", str(first_frame),
                "-vf",
                f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,fps={FPS}",
                *VENC, "-an",
                str(out),
            ])
        except Exception:
            run([
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=0x0a0a0f:s={W}x{H}:d={dur:.3f}:r={FPS}",
                *VENC, "-an",
                str(out),
            ])
    else:
        run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=0x0a0a0f:s={W}x{H}:d={dur:.3f}:r={FPS}",
            *VENC, "-an",
            str(out),
        ])
    return Part("intro", out, dur, audio=[(0.0, audio_path, "")])


def render_profile_card(mid: int, audio_path: Path, script_webm: Path | None,
                         profile_png: Path | None, tmp: Path) -> Part | None:
    if not audio_path.exists() or audio_path.stat().st_size == 0:
        return None
    dur = ffprobe_duration(audio_path)
    if dur < 0.1:
        return None
    out = tmp / "profile.mp4"
    # No banner — the script modal itself is the visual identity of this section.
    if script_webm and script_webm.exists():
        src_dur = ffprobe_duration(script_webm)
        if src_dur >= dur:
            inputs = ["-ss", "0", "-i", str(script_webm)]
        else:
            inputs = ["-stream_loop", "-1", "-i", str(script_webm)]
        run([
            "ffmpeg", "-y",
            *inputs,
            "-t", f"{dur:.3f}",
            "-vf",
            f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={FPS}",
            *VENC, "-an",
            str(out),
        ])
    elif profile_png and profile_png.exists():
        run([
            "ffmpeg", "-y",
            "-loop", "1", "-t", f"{dur:.3f}", "-i", str(profile_png),
            "-vf",
            f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"fps={FPS}",
            *VENC, "-an",
            str(out),
        ])
    else:
        run([
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=0x111118:s={W}x{H}:d={dur:.3f}:r={FPS}",
            *VENC, "-an",
            str(out),
        ])
    return Part("profile", out, dur, audio=[(0.0, audio_path, "")])


def cut_replay_segment(replay_webm: Path, t_start: float, t_end: float,
                        out_path: Path):
    """Cut [t_start, t_end) from replay, re-encode to consistent codec."""
    duration = max(0.05, t_end - t_start)
    run([
        "ffmpeg", "-y",
        "-ss", f"{t_start:.3f}", "-i", str(replay_webm),
        "-t", f"{duration:.3f}",
        "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
               f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,fps={FPS}",
        *VENC, "-an",
        str(out_path),
    ])


def make_freeze_clip(source_clip: Path, freeze_dur: float, out_path: Path):
    """Generate a still video by holding the last frame of source_clip for freeze_dur."""
    # extract last frame
    last = out_path.with_suffix(".png")
    run([
        "ffmpeg", "-y",
        "-sseof", "-0.1", "-i", str(source_clip),
        "-frames:v", "1",
        str(last),
    ])
    run([
        "ffmpeg", "-y",
        "-loop", "1", "-t", f"{freeze_dur:.3f}", "-i", str(last),
        "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
               f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,fps={FPS}",
        *VENC, "-an",
        str(out_path),
    ])
    last.unlink(missing_ok=True)


def make_outro_card(replay_webm: Path, outro_audio: Path, replay_dur: float,
                    homepage_webm: Path | None, intro_used_dur: float,
                    tmp: Path) -> Part:
    """Outro card. Prefer animated homepage (offset past what intro consumed)
    over a static last-frame freeze."""
    dur = ffprobe_duration(outro_audio)
    out = tmp / "outro.mp4"
    cta = "Build your own lobster at clawking.cc"
    # Place the CTA banner at the TOP of the outro so it doesn't fight with
    # the subtitles which live at the bottom.
    cta_overlay = (
        f"drawbox=y=0:color=black@0.7:width=iw:height=150:t=fill,"
        f"drawtext=fontfile='{FONT_FILE}':text='{cta}':fontcolor=white:fontsize=68:"
        f"x=(w-text_w)/2:y=42"
    )

    if homepage_webm and homepage_webm.exists():
        src_dur = ffprobe_duration(homepage_webm)
        start = min(max(0.0, intro_used_dur), max(0.0, src_dur - 2.0))
        avail = src_dur - start
        if avail >= dur:
            inputs = ["-ss", f"{start:.3f}", "-i", str(homepage_webm)]
        else:
            inputs = ["-stream_loop", "-1", "-ss", f"{start:.3f}", "-i", str(homepage_webm)]
        run([
            "ffmpeg", "-y",
            *inputs,
            "-t", f"{dur:.3f}",
            "-vf",
            f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"{cta_overlay},"
            f"fps={FPS}",
            *VENC, "-an",
            str(out),
        ])
    else:
        last = tmp / "outro_last.png"
        seek = max(0.0, replay_dur - 0.3)
        run([
            "ffmpeg", "-y",
            "-ss", f"{seek:.3f}", "-i", str(replay_webm),
            "-frames:v", "1", str(last),
        ])
        run([
            "ffmpeg", "-y",
            "-loop", "1", "-t", f"{dur:.3f}", "-i", str(last),
            "-vf",
            f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
            f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:color=black,"
            f"{cta_overlay},"
            f"fps={FPS}",
            *VENC, "-an",
            str(out),
        ])
    return Part("outro", out, dur, audio=[(0.0, outro_audio, "")])


def srt_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int((t - int(t)) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(srt_path: Path, cues: list[tuple[float, float, str]]):
    out = []
    for i, (start, end, text) in enumerate(cues, 1):
        out.append(f"{i}\n{srt_time(start)} --> {srt_time(end)}\n{text}\n")
    srt_path.write_text("\n".join(out), encoding="utf-8")


def _ass_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    cs = int(round((t - int(t)) * 100))
    if cs == 100: cs, s = 0, s + 1
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def write_ass(ass_path: Path, cues: list[tuple[float, float, str]]):
    """Write an ASS subtitle file with explicit 1920x1080 play resolution so
    that libass renders Fontsize/MarginV as real pixels."""
    header = (
        "[Script Info]\n"
        "ScriptType: v4.00+\n"
        f"PlayResX: {W}\n"
        f"PlayResY: {H}\n"
        "WrapStyle: 2\n"
        "ScaledBorderAndShadow: yes\n"
        "\n"
        "[V4+ Styles]\n"
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
        "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
        "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
        "Alignment, MarginL, MarginR, MarginV, Encoding\n"
        f"Style: Default,{SUB_FONT},{SUB_FONTSIZE},"
        f"{SUB_PRIMARY},&H000000FF,{SUB_OUTLINE},&H00000000,"
        f"-1,0,0,0,100,100,0,0,1,{SUB_OUTLINE_W},{SUB_SHADOW_W},"
        f"2,20,20,{SUB_MARGIN_V},1\n"
        "\n"
        "[Events]\n"
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, "
        "Effect, Text\n"
    )
    lines = [header]
    for start, end, text in cues:
        # ASS text: replace literal line breaks with \\N, escape braces
        safe = text.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")
        safe = safe.replace("\n", r"\N")
        lines.append(
            f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Default,,0,0,0,,{safe}"
        )
    ass_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def split_lines_for_srt(audio_dur: float, lines: list[str], offset: float
                        ) -> list[tuple[float, float, str]]:
    """Distribute one audio segment's duration across its lines proportional
    to character count. Returns absolute SRT cues."""
    if not lines:
        return []
    weights = [max(1, len(l)) for l in lines]
    total = sum(weights)
    cues = []
    cur = offset
    for w, line in zip(weights, lines):
        d = audio_dur * w / total
        cues.append((cur, cur + d, line))
        cur += d
    return cues


def concat_video(parts: list[Path], out: Path, tmp: Path):
    cat = tmp / "concat.txt"
    cat.write_text("".join(f"file '{p.name}'\n" for p in parts), encoding="utf-8")
    if out.exists(): out.unlink()
    run([
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(cat),
        "-c", "copy",
        str(out),
    ])


def mix_audio(audio_events: list[tuple[float, Path]], total_dur: float,
              out: Path, tmp: Path):
    """audio_events: list of (absolute_start_seconds, mp3_path)."""
    inputs = []
    filters = []
    mix_labels = []
    for idx, (start, path) in enumerate(audio_events):
        inputs += ["-i", str(path)]
        delay_ms = int(round(start * 1000))
        filters.append(f"[{idx}:a]adelay={delay_ms}|{delay_ms},aresample=44100[a{idx}]")
        mix_labels.append(f"[a{idx}]")
    filters.append(
        f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:dropout_transition=0:normalize=0,"
        f"apad=whole_dur={total_dur:.3f}[outa]"
    )
    run([
        "ffmpeg", "-y",
        *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[outa]",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-t", f"{total_dur:.3f}",
        str(out),
    ])


def mux(video: Path, audio: Path, out: Path):
    if out.exists(): out.unlink()
    run([
        "ffmpeg", "-y",
        "-i", str(video), "-i", str(audio),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "copy",
        "-shortest",
        str(out),
    ])


def build_bgm_track(phases: list[tuple[str, float]], total_dur: float,
                    out: Path, tmp: Path, bgm_dir: Path):
    """Build a single BGM audio track spanning [0, total_dur].

    phases: list of (bgm_name, phase_end_seconds). Each phase loops its bgm
    file up to phase_end, with a short cross-fade at the boundaries.
    """
    inputs = []
    filters = []
    labels = []
    prev_end = 0.0
    for i, (name, end) in enumerate(phases):
        phase_dur = max(0.1, end - prev_end)
        src = bgm_dir / f"{name}.mp3"
        if not src.exists():
            raise FileNotFoundError(src)
        inputs += ["-stream_loop", "-1", "-i", str(src)]
        fade_in  = BGM_FADE if i == 0 else 0.35
        fade_out = BGM_FADE if i == len(phases) - 1 else 0.35
        filters.append(
            f"[{i}:a]atrim=0:{phase_dur:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:st=0:d={fade_in:.2f},"
            f"afade=t=out:st={max(0.0, phase_dur - fade_out):.3f}:d={fade_out:.2f},"
            f"volume={BGM_VOLUME:.3f}[bgm{i}]"
        )
        labels.append(f"[bgm{i}]")
        prev_end = end
    filters.append(
        f"{''.join(labels)}concat=n={len(phases)}:v=0:a=1,"
        f"apad=whole_dur={total_dur:.3f}[out]"
    )
    run([
        "ffmpeg", "-y", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", "[out]",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-t", f"{total_dur:.3f}",
        str(out),
    ])


def mix_voice_bgm(voice: Path, bgm: Path, total_dur: float, out: Path):
    run([
        "ffmpeg", "-y",
        "-i", str(voice), "-i", str(bgm),
        "-filter_complex",
        f"[0:a][1:a]amix=inputs=2:dropout_transition=0:normalize=0,"
        f"apad=whole_dur={total_dur:.3f}[out]",
        "-map", "[out]",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-t", f"{total_dur:.3f}",
        str(out),
    ])


def mux_with_burned_subs(video: Path, audio: Path, ass_path: Path, out: Path):
    """Mux while burning an ASS subtitle file (with embedded PlayResY=1080)."""
    esc = str(ass_path).replace("\\", "/").replace(":", r"\:")
    run([
        "ffmpeg", "-y",
        "-i", str(video), "-i", str(audio),
        "-vf", f"ass='{esc}'",
        "-map", "0:v:0?", "-map", "1:a:0",
        *VENC, "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(out),
    ])


def compose(mid: int, base: Path) -> Path:
    pp = paths(base, mid)
    intro_a        = pp["intro_mp3"]
    profile_a      = pp["profile_mp3"]
    outro_a        = pp["outro_mp3"]
    replay         = pp["replay"]
    homepage_intro = pp["homepage_intro"]
    homepage_outro = pp["homepage_outro"]
    script_webm    = pp["script_webm"]
    profile_png    = pp["profile_png"]
    final          = pp["final_mp4"]
    final_srt      = pp["subs_srt"]
    final_ass      = pp["subs_ass"]
    timeline_json  = pp["timeline_json"]
    # Legacy `<mid>_final.srt` beside the mp4 would auto-load in players —
    # purge it if it somehow still exists.
    for legacy in (pp["match_dir"] / f"{mid}_final.srt",
                   base / f"{mid}_final.srt"):
        if legacy.exists(): legacy.unlink()

    for p in (intro_a, outro_a, replay, pp["turns"], pp["segments_json"]):
        if not p.exists():
            raise FileNotFoundError(p)

    turns_blob = json.loads(pp["turns"].read_text(encoding="utf-8"))
    manifest = json.loads(pp["segments_json"].read_text(encoding="utf-8"))
    turn_t = {int(k): float(v) for k, v in turns_blob["turns"].items()}
    replay_dur = float(turns_blob["duration"])

    # Section mp3s live in temp/.
    temp = pp["temp_dir"]

    tmp = temp / f"_compose_{mid}"
    if tmp.exists(): shutil.rmtree(tmp)
    tmp.mkdir()

    # ----- 1. Render intro / profile / outro cards -----
    parts: list[Part] = []
    intro_bg = homepage_intro if homepage_intro.exists() else (
        homepage_legacy if homepage_legacy.exists() else None
    )
    intro_part = render_intro_card(mid, intro_a, intro_bg, replay, tmp)
    parts.append(intro_part)
    profile_part = render_profile_card(
        mid, profile_a,
        script_webm if script_webm.exists() else None,
        profile_png if profile_png.exists() else None,
        tmp,
    )
    if profile_part:
        parts.append(profile_part)

    # ----- 2. Build per-section replay clips with freeze tails as needed -----
    segs = sorted(manifest["segments"], key=lambda s: s["first"])
    plan = []
    for i, seg in enumerate(segs):
        first, last = seg["first"], seg["last"]
        src_start = turn_t.get(first, 0.0)
        if (last + 1) in turn_t:
            src_end = turn_t[last + 1]
        elif i + 1 < len(segs) and segs[i + 1]["first"] in turn_t:
            src_end = turn_t[segs[i + 1]["first"]]
        else:
            src_end = replay_dur
        # always include a tiny tail so the section ends on a visible frame
        src_end = min(replay_dur, max(src_end, src_start + 0.5))

        tts_path = temp / seg["path"]
        tts_dur = ffprobe_duration(tts_path) if tts_path.exists() and tts_path.stat().st_size > 0 else 0.0

        raw_window = src_end - src_start
        # commentary starts PREROLL into the segment; needs to finish before next segment begins.
        usable = raw_window - PREROLL
        # No more freeze padding: replay plays at native speed. Overflow is
        # recorded so validate.py can FAIL the run if the writer overshot.
        freeze_extra = 0.0
        overflow = max(0.0, tts_dur - usable) if tts_dur > 0 else 0.0
        plan.append({
            "first": first, "last": last,
            "src_start": src_start, "src_end": src_end,
            "raw_window": raw_window, "tts_dur": tts_dur,
            "freeze_extra": freeze_extra,
            "overflow": overflow,
            "tts_path": tts_path,
            "lines": seg.get("lines", []),
        })
        flag = "  OK" if overflow == 0 else f"  OVERFLOW +{overflow:.1f}s"
        print(f"[compose] T{first}-{last}: src={raw_window:5.1f}s tts={tts_dur:5.1f}s{flag}")

    # produce video clips (and freeze clips) for each section
    last_seg_clip = None
    for i, p in enumerate(plan):
        clip = tmp / f"seg_{i:02d}.mp4"
        cut_replay_segment(replay, p["src_start"], p["src_end"], clip)
        parts.append(Part(
            name=f"seg{i}",
            video_path=clip,
            duration=ffprobe_duration(clip),
            audio=[(PREROLL, p["tts_path"], " ".join(p["lines"]))] if p["tts_dur"] > 0 else [],
        ))
        if p["freeze_extra"] > 0:
            freeze_clip = tmp / f"seg_{i:02d}_freeze.mp4"
            make_freeze_clip(clip, p["freeze_extra"], freeze_clip)
            parts.append(Part(
                name=f"seg{i}_freeze",
                video_path=freeze_clip,
                duration=ffprobe_duration(freeze_clip),
            ))

    # outro
    outro_bg = homepage_outro if homepage_outro.exists() else (
        homepage_legacy if homepage_legacy.exists() else None
    )
    # The outro clip already opens the Choose Lobster modal near t=0, so use
    # offset 0 (no need to skip past the intro portion anymore).
    parts.append(make_outro_card(
        replay, outro_a, replay_dur,
        outro_bg,
        intro_used_dur=0.0,
        tmp=tmp,
    ))

    # ----- 3. Concat video + lay down audio events -----
    concat_path = tmp / "fullvideo.mp4"
    concat_video([p.video_path for p in parts], concat_path, tmp)
    full_dur = ffprobe_duration(concat_path)

    # collect audio events with absolute offsets (using the part durations we just concatenated)
    audio_events = []
    srt_cues = []
    cursor = 0.0
    timeline_dump = []
    for p in parts:
        # per-part audio (intro/profile/section/outro all carry their own audio entry)
        for off, audio_path, text in p.audio:
            event_t = cursor + off
            audio_events.append((event_t, audio_path))
            audio_dur = ffprobe_duration(audio_path)
            # subtitles: split by lines
            if text.strip():
                # we used " ".join(lines) earlier, so split on multiple spaces? no — better:
                # for sections we have the raw lines list available below
                pass
        timeline_dump.append({
            "name": p.name, "start": round(cursor, 3),
            "end": round(cursor + p.duration, 3), "duration": round(p.duration, 3),
        })
        cursor += p.duration

    # build SRT cues — iterate parts again and use their .audio + section lines
    cursor = 0.0
    intro_lines  = manifest.get("intro",   {}).get("lines", []) or []
    profile_lines = manifest.get("profile", {}).get("lines", []) or []
    outro_lines  = manifest.get("outro",   {}).get("lines", []) or []
    seg_lines_by_name = {f"seg{i}": p["lines"] for i, p in enumerate(plan)}

    for p in parts:
        if p.audio:
            off, audio_path, _ = p.audio[0]
            audio_dur = ffprobe_duration(audio_path)
            cue_base = cursor + off
            if p.name == "intro":
                lines = intro_lines
            elif p.name == "profile":
                lines = profile_lines
            elif p.name == "outro":
                lines = outro_lines
            else:
                lines = seg_lines_by_name.get(p.name, [])
            srt_cues.extend(split_lines_for_srt(audio_dur, lines, cue_base))
        cursor += p.duration

    # ----- 4. Build voice track (TTS only) -----
    voice_path = tmp / "voice.m4a"
    mix_audio(audio_events, full_dur, voice_path, tmp)

    # ----- 5. Build BGM track phases -----
    # Compute phase boundaries based on part cursor positions.
    # Phase 1 = intro + profile (menu.mp3)
    # Phase 2 = all replay segments (battle.mp3 for first 2/3, climax.mp3 for last 1/3)
    # Phase 3 = outro (victory.mp3)
    t_after_profile = sum(p.duration for p in parts if p.name in ("intro", "profile"))
    t_before_outro = sum(p.duration for p in parts if p.name != "outro")
    replay_span = t_before_outro - t_after_profile
    climax_start = t_after_profile + replay_span * 2 / 3
    phases = [
        ("menu",    t_after_profile),
        ("battle",  climax_start),
        ("climax",  t_before_outro),
        ("victory", full_dur),
    ]
    bgm_path = tmp / "bgm.m4a"
    # BGMs are shared across all matches — stored at the commentary base
    bgm_dir = base / BGM_DIR_NAME
    if bgm_dir.exists():
        build_bgm_track(phases, full_dur, bgm_path, tmp, bgm_dir)
    else:
        bgm_path = None
        print(f"[compose] WARN no {bgm_dir} — skipping BGM layer")

    # ----- 6. Mix voice + bgm -----
    final_audio = tmp / "final_audio.m4a"
    if bgm_path and bgm_path.exists():
        mix_voice_bgm(voice_path, bgm_path, full_dur, final_audio)
    else:
        shutil.copy(voice_path, final_audio)

    # ----- 7. Write SRT + ASS, then mux (burn ASS in) -----
    write_srt(final_srt, srt_cues)
    write_ass(final_ass, srt_cues)
    mux_with_burned_subs(concat_path, final_audio, final_ass, final)

    # also emit per-section raw_window / tts_dur / overflow so validate.py
    # can enforce the "TTS must fit replay section" constraint.
    replay_plan = [
        {"first": pl["first"], "last": pl["last"],
         "raw_window": round(pl["raw_window"], 2),
         "tts_dur": round(pl["tts_dur"], 2),
         "overflow": round(pl["overflow"], 2)}
        for pl in plan
    ]
    timeline_json.write_text(
        json.dumps({"total_dur": full_dur, "parts": timeline_dump,
                    "bgm_phases": phases, "replay_plan": replay_plan},
                   indent=2),
        encoding="utf-8",
    )

    shutil.rmtree(tmp, ignore_errors=True)
    print(f"[compose] -> {final.name} ({final.stat().st_size/1024/1024:.2f} MB, {full_dur:.1f}s)")
    print(f"[compose] -> {final_srt.name}, {timeline_json.name}")
    return final


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent
    compose(mid, base)
