"""Record the ClawKing replay video for a match id and emit turn timestamps.

Outputs (in <out_dir>):
  <id>_replay.webm
  <id>.turns.json   {"duration": float, "turns": {turn_index: t_seconds, ...}}

End-of-match detection (whichever fires first):
  1. Result-panel keyword seen and held END_HOLD seconds
  2. Turn counter has not advanced for END_IDLE seconds (after at least turn 5)
  3. HARD_TIMEOUT seconds elapsed
"""
import json
import re
import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths

URL_TMPL = "https://clawking.cc/?replay={id}"
W, H = 1920, 1080
# Force Chromium to use hardware GPU via ANGLE+D3D11 — WITHOUT these flags
# headless mode falls back to SwiftShader (software) which caps PixiJS at
# ~9 FPS on a 1080p canvas. With these the replay renders at ~60 FPS.
GPU_ARGS = [
    "--use-angle=d3d11",
    "--use-gl=angle",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
]
HARD_TIMEOUT = 900           # 1080p replays can run 8-15 min
END_HOLD = 4.0
END_IDLE = 45.0              # at 1080p each turn takes 10-15s, so wait long for the last turn
TAIL_AFTER_LAST_TURN = 4.0   # seconds of footage to keep after the final turn timestamp
END_MARKERS = [
    "第1名", "第 1 名", "Champion", "Winner", "Match Over",
    "结算", "Final Standings", "MATCH END",
    "再来一局", "Play Again", "Replay finished",
]


def force_english_ui(ctx):
    """Make recordings deterministic for English-language promo videos."""
    ctx.add_init_script(
        "localStorage.setItem('claw-arena-lang', 'en');"
    )


def record(match_id: int, base: Path) -> tuple[Path, Path]:
    pp = paths(base, match_id)
    temp = pp["temp_dir"]
    workdir = temp / f"_rec_{match_id}"
    if workdir.exists(): shutil.rmtree(workdir)
    workdir.mkdir()

    target_webm = pp["replay"]
    target_json = pp["turns"]
    target_profile = pp["profile_png"]
    for p in (target_webm, target_json, target_profile):
        if p.exists(): p.unlink()

    turns: dict[int, float] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=GPU_ARGS)
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            locale="en-US",
            record_video_dir=str(workdir),
            record_video_size={"width": W, "height": H},
        )
        force_english_ui(ctx)
        page = ctx.new_page()
        page.goto(URL_TMPL.format(id=match_id), wait_until="domcontentloaded")
        print(f"[record] match {match_id} loaded, polling DOM...")

        t0 = time.time()
        last_turn = -1
        last_turn_change = t0
        end_seen_at = None
        stop_reason = "timeout"
        profile_taken = False

        while time.time() - t0 < HARD_TIMEOUT:
            page.wait_for_timeout(800)
            try:
                text = page.evaluate("() => document.body.innerText")
            except Exception:
                continue

            now = time.time() - t0
            m = re.search(r"(?:回合|Turn)\s*(\d+)", text)
            cur = int(m.group(1)) if m else -1
            if cur != last_turn and cur >= 0:
                turns[cur] = now
                print(f"[record] t={now:6.1f}s turn={cur}")
                last_turn = cur
                last_turn_change = time.time()
                # snapshot the player-info sidebar at turn 1 (everyone's stats are in the side panel)
                if not profile_taken and cur >= 1:
                    try:
                        page.screenshot(path=str(target_profile), full_page=False)
                        profile_taken = True
                        print(f"[record] saved profile screenshot")
                    except Exception as e:
                        print(f"[record] profile snapshot failed: {e}")

            if any(k in text for k in END_MARKERS):
                if end_seen_at is None:
                    end_seen_at = time.time()
                    print(f"[record] end-marker seen, holding {END_HOLD}s")
                elif time.time() - end_seen_at > END_HOLD:
                    stop_reason = "end-marker"
                    break
            elif last_turn >= 5 and time.time() - last_turn_change > END_IDLE:
                stop_reason = "idle"
                print(f"[record] turn unchanged for {END_IDLE}s, stopping")
                break

        total = time.time() - t0
        last_turn_t = turns.get(last_turn, total)
        gameplay_end = min(total, last_turn_t + TAIL_AFTER_LAST_TURN)
        print(f"[record] reason={stop_reason} elapsed={total:.1f}s gameplay_end={gameplay_end:.1f}s")

        page.close()
        ctx.close()
        browser.close()

    videos = list(workdir.glob("*.webm"))
    if not videos:
        raise RuntimeError("no video produced")
    videos[0].rename(target_webm)
    shutil.rmtree(workdir, ignore_errors=True)

    target_json.write_text(json.dumps({
        "duration": gameplay_end,
        "turns": {str(k): round(v, 3) for k, v in sorted(turns.items())},
        "stop_reason": stop_reason,
    }, indent=2), encoding="utf-8")

    print(f"[record] saved {target_webm.name} ({target_webm.stat().st_size/1024/1024:.2f} MB)")
    print(f"[record] saved {target_json.name} ({len(turns)} turns)")
    return target_webm, target_json


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent
    record(mid, base)
