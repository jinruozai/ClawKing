---
name: clawking-commentary
description: |
  Produce a finished English commentary video for a ClawKing match given only
  a match id. Triggers when the user asks to "make a commentary video",
  "解说视频", "做一场解说", "生成 #N 这场比赛视频", "produce video for match <id>".

  Layout (per match):
    output/video/<id>/
      <id>.md              commentary script (Claude writes/edits this)
      <id>_final.mp4       deliverable video
      <id>_social.txt      social-media caption
      temp/                all intermediates (log, webm, mp3, srt, qa, etc.)

  Pipeline: fetch → record (GPU, 60fps) → record_ui (homepage + script panel)
            → plan → (Claude writes md) → tts (F5-TTS voice clone)
            → compose (BGM + burned subs) → validate → social
---

# ClawKing Commentary Video Skill

Given a match id like `203`, produce `output/video/203/203_final.mp4`: an
English-narrated highlight video with the user's cloned voice, BGM, burned
subtitles, Strategy-Script profile card, and Choose-Lobster outro card.

## The three deliverables the user cares about

Everything the user needs lives at the ROOT of `output/video/<id>/`:

```
output/video/<id>/
  <id>.md            ← commentary script (you write this)
  <id>_final.mp4     ← the video to post
  <id>_social.txt    ← title + description + chapter timestamps + hashtags
```

Everything else — logs, webm captures, mp3 segments, subtitle sidecar,
QA reports — lives in `output/video/<id>/temp/` and should never be shown
to the user unless they ask.

## Standard end-to-end run

### Phase 1 — automated (4–6 minutes with GPU acceleration)
```
python commentary/pipeline/run.py <id> \
  --steps fetch,record,record_ui,plan \
  --featured "ChatGPT5.4"
```
Fetches log, records replay at 1080p/60fps, records homepage intro clip,
homepage outro clip (opens Choose Lobster panel), script panel clip
(opens Strategy Script modal for the featured player), and writes the
commentary template with per-section word budgets.

### Phase 2 — Claude writes the commentary
Open `output/video/<id>/temp/<id>.template.md`, read
`output/video/<id>/temp/<id>.log`, then write
`output/video/<id>/<id>.md`. Section markers MUST be `[Turn N]` or
`[Turns N-M]` exactly. Optional `[Profile]` section covers the
Strategy-Script card.

### Phase 3 — automated (~8 min with F5-TTS, ~30s with edge)
```
python commentary/pipeline/run.py <id> --steps tts,compose,validate,social
```

## What happens to prior-match files

If the user previously had flat `commentary/<id>.xxx` files or old `commentary/<id>/` dirs, `run.py` auto-
migrates them into `output/video/<id>/` on the next invocation. Never ship an
mp4 without QA PASS.

## Writing rules for `<id>.md`

```
# Match <id>

## Broadcast Script

<intro lines — plays over clean animated homepage>

OK. Let's begin.

[Profile]

<profile lines — plays over Strategy Script modal>

[Turns 1-6]

<play lines>

[Turn 8]

<hot-moment lines>

...

---

<outro lines — plays over Choose Lobster modal with CTA banner>
```

Rules that compound:
1. **One short clause per line.** ≤12 words. TTS uses line breaks as pauses.
2. **Constant pace.** Hype from short clauses + freeze frames, never atempo.
3. **Respect per-section word budgets** (in the template comments). At 1080p/60fps,
   `raw_window` is 3–4 seconds per turn. Going over triggers a freeze frame.
4. **No em-dashes, ellipses, or markdown bold.** Parser strips them anyway.
5. **No turn numbers in audio.** Viewers don't know what turn it is.
6. **Pick one featured player** and tell their arc.
7. **Outro is fixed CTA.** Keep the "clawking.cc" call.
8. **Fill windows 70–90%.** If voice_coverage drops below 65%, QA FAILS.

## Voice engines

### `--engine f5` (default) — F5-TTS voice clone
Requires:
- `commentary/ref_clip.wav`  10-15s reference sample of user's voice
- `commentary/ref_text.txt`  exact transcript of the sample

GPU inference at ~2.2s of compute per 1s of audio. First run downloads
F5TTS_v1_Base (~1.5 GB) to `~/.cache/huggingface/hub/`.

### `--engine edge` — edge-tts (no setup)
`tts.py:VOICE_DEFAULT` = `en-US-AndrewMultilingualNeural`.

## Background music

`commentary/bgm/{menu,battle,climax,victory}.mp3` downloaded from the
live site once. Compose mixes them at 13% volume in four phases:
menu → intro+profile, battle → first 2/3 of replay, climax → last 1/3,
victory → outro. Fades on phase boundaries.

## QA checks

`validate.py` runs 8 checks. Any FAIL means **do not ship**.
- `duration_match` (video/audio ≤1s)
- `no_long_silence` (no mix-silence > 6s)
- `no_long_freeze` (no picture freeze > 12s)
- `audio_loud_enough` (mean ≥ -40 dB)
- `srt_in_bounds` (cues within video duration)
- `has_subtitles` (at least one cue)
- **`voice_coverage`** (≥ 65% of replay window has commentary voice)
- **`no_long_voice_gap`** (no voice-less gap > 15s, even if BGM fills it)

On FAIL, `<id>/temp/<id>_qa.json` lists exactly which check failed and
why (e.g. max voice gap = 39s); `<id>/temp/<id>_qa_frames.png` is a
12-frame contact sheet for eyeball spot-checking.

## Key engineering decisions

1. **Turn-anchored sync.** `record.py` polls the DOM for the current
   turn and writes `<id>.turns.json` = `{turn → wall-clock seconds}`.
   compose cuts the replay by section and lays audio at
   deterministic offsets derived from concatenated part durations.

2. **No atempo, ever.** If TTS overflows a section's raw_window,
   compose inserts a freeze frame at the segment's end instead of
   speeding up audio.

3. **GPU acceleration via ANGLE+D3D11.** Without GPU flags, headless
   Chromium uses SwiftShader (software) and caps PixiJS at ~9 fps. With
   `--use-angle=d3d11 --use-gl=angle --enable-gpu-rasterization --ignore-gpu-blocklist`
   the replay renders at ~60 fps and records ~2.5x faster.

4. **Subtitles burned in with `original_size=1920x1080`.** Without this,
   libass uses PlayResY=288 and scales Fontsize up 3.75x. Correct
   style: orange-yellow (#FFB800), 22pt, bottom-center, MarginV=40,
   Outline=2 black, Shadow=1.

5. **Sidecar SRT lives in temp/** named `_subs.srt` (not `_final.srt`)
   so media players don't auto-load a duplicate subtitle stream on
   top of the burned one.

6. **Recorded UI clips**:
   - `<id>_homepage_intro.webm` — 14s clean hover, no clicks (intro bg)
   - `<id>_homepage_outro.webm` — 38s, Choose Lobster modal opened (outro bg)
   - `<id>_script.webm` — 20s with Strategy Script modal for featured
     player (profile bg)
   - All DOM coords queried live (not hardcoded) via JS `evaluate`.

## Failure modes

| Symptom | Fix |
|---|---|
| `record` exits at HARD_TIMEOUT (900s) | Replay didn't finish — check END_MARKERS or increase HARD_TIMEOUT. |
| `voice_coverage` < 65% | Commentary too sparse. Expand per-section lines until windows fill ~80%. |
| Script-panel clip shows only replay UI | DOM queries returned None — the sidebar cards need ≥3.5s after page ready to mount `cursor-pointer`. |
| Duplicate subtitles shown | Legacy `<id>_final.srt` beside the mp4. Delete it; only the burned copy should be visible. |
| Low framerate on replay | GPU flags missing — verify `GPU_ARGS` in record.py is applied to `chromium.launch`. |
| ffmpeg drawtext fails on Windows | Colon in the text ⇒ it's parsed as an option separator. Reword without `:`. |

## Files this skill writes

```
output/video/<id>/
  <id>.md                                [human input]
  <id>_final.mp4
  <id>_social.txt
  temp/
    <id>.log
    <id>.template.md
    <id>.turns.json
    <id>_replay.webm
    <id>_profile.png
    <id>_homepage_intro.webm
    <id>_homepage_outro.webm
    <id>_script.webm
    <id>_intro.mp3 / <id>_profile.mp3 / <id>_outro.mp3
    <id>_seg_<first>[-<last>].mp3       one per [Turn]/[Turns] section
    <id>_segments.json                   TTS manifest
    <id>_timeline.json                   every part's [start, end]
    <id>_subs.srt                        sidecar subs (not auto-loaded)
    <id>_qa.json                         validation report
    <id>_qa_frames.png                   12-frame contact sheet
```

Shared at `commentary/`:
- `bgm/{menu,battle,climax,victory}.mp3`
- `ref_clip.wav`, `ref_text.txt`  (voice-clone reference)
- `pipeline/*.py`                  (all pipeline scripts)
