"""Record supporting UI clips: animated homepage + live AI-script modal.

Outputs (after internal trim):
  <id>_homepage.webm    ~14s of rendered English homepage with lobster interaction
  <id>_script.webm      ~14s of replay page with featured player's script modal open
"""
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths

W, H = 1920, 1080
HOMEPAGE_INTRO_SECONDS = 14    # clean hover-only (no modal opens during this window)
HOMEPAGE_OUTRO_SECONDS = 38    # Choose Lobster modal opened ~2s in, then holds
SCRIPT_SECONDS = 20            # covers typical profile audio (~15-20s)
# GPU-accel flags — lift headless Chromium from SwiftShader (~9 FPS) to ~60 FPS.
GPU_ARGS = [
    "--use-angle=d3d11",
    "--use-gl=angle",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
]

HOMEPAGE_URL = "https://clawking.cc/"
REPLAY_URL = "https://clawking.cc/?replay={id}"

# The site respects `navigator.language`, which Playwright controls via
# context `locale='en-US'`. No localStorage injection needed.


def _trim(src: Path, skip_seconds: float, keep_seconds: float, dest: Path):
    """Cut [skip_seconds, skip_seconds + keep_seconds] from src into dest."""
    subprocess.run([
        "ffmpeg", "-y",
        "-ss", f"{skip_seconds:.2f}", "-i", str(src),
        "-t", f"{keep_seconds:.2f}",
        "-c:v", "libvpx-vp9", "-b:v", "2M", "-an",
        str(dest),
    ], check=True, capture_output=True)


def _finalize_trim(workdir: Path, target: Path, skip: float, keep: float) -> Path:
    raw = list(workdir.glob("*.webm"))
    if not raw:
        raise RuntimeError(f"no video produced in {workdir}")
    if target.exists(): target.unlink()
    _trim(raw[0], skip, keep, target)
    shutil.rmtree(workdir, ignore_errors=True)
    return target


def _wait_for_text(page, texts: list[str], timeout_s: float = 15) -> float:
    """Return seconds waited until any of `texts` appeared in document.body.innerText."""
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        try:
            body = page.evaluate("() => document.body.innerText || ''")
        except Exception:
            body = ""
        if any(t in body for t in texts):
            return time.time() - t0
        page.wait_for_timeout(400)
    return time.time() - t0


def _hover_hero(page, seconds: float, do_attack_click_at: float | None = None):
    """Move the mouse in a loop over the hero lobster for `seconds`. Clicks the
    hero once at the given relative time to trigger the attack animation."""
    path = [(1080, 720), (1280, 560), (1460, 400), (1620, 480),
            (1520, 620), (1320, 700), (1180, 560), (1380, 480),
            (1550, 560), (1350, 640), (1220, 520), (1420, 440)]
    t0 = time.time()
    page.mouse.move(*path[0], steps=20)
    i = 1
    clicked = False
    while time.time() - t0 < seconds:
        page.mouse.move(*path[i % len(path)], steps=28)
        page.wait_for_timeout(400)
        rel = time.time() - t0
        if do_attack_click_at is not None and not clicked and rel > do_attack_click_at:
            try:
                page.mouse.down(); page.wait_for_timeout(160); page.mouse.up()
            except Exception:
                pass
            clicked = True
        i += 1


def record_homepage_intro(base: Path, match_id: int) -> Path:
    """Clean homepage clip — hover-only over the hero lobster, NO button clicks.
    Used as intro background; must never open a modal."""
    pp = paths(base, match_id)
    workdir = pp["temp_dir"] / f"_rec_home_intro_{match_id}"
    if workdir.exists(): shutil.rmtree(workdir)
    workdir.mkdir()
    target = pp["homepage_intro"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=GPU_ARGS)
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            locale="en-US",
            record_video_dir=str(workdir),
            record_video_size={"width": W, "height": H},
        )
        page = ctx.new_page()
        t_nav = time.time()
        page.goto(HOMEPAGE_URL, wait_until="domcontentloaded")

        _wait_for_text(page, ["ClawKing", "CLAW", "0.001"], 20)
        skip_seconds = time.time() - t_nav + 0.3
        print(f"[homepage_intro] rendered after {skip_seconds:.1f}s")
        page.wait_for_timeout(800)

        # Exactly HOMEPAGE_INTRO_SECONDS of hover; one gentle attack-click halfway
        # through to show the lobster in attack pose (still stays on the homepage).
        _hover_hero(page, HOMEPAGE_INTRO_SECONDS, do_attack_click_at=HOMEPAGE_INTRO_SECONDS / 2)

        page.close(); ctx.close(); browser.close()

    return _finalize_trim(workdir, target, skip_seconds, HOMEPAGE_INTRO_SECONDS)


# CHOOSE LOBSTER button on 1080p homepage (from DOM probe).
CHOOSE_LOBSTER_XY = (1143, 706)


def record_homepage_outro(base: Path, match_id: int) -> Path:
    """Homepage clip that opens the Choose Lobster modal a couple seconds in and
    holds it. Used as outro background."""
    pp = paths(base, match_id)
    workdir = pp["temp_dir"] / f"_rec_home_outro_{match_id}"
    if workdir.exists(): shutil.rmtree(workdir)
    workdir.mkdir()
    target = pp["homepage_outro"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=GPU_ARGS)
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            locale="en-US",
            record_video_dir=str(workdir),
            record_video_size={"width": W, "height": H},
        )
        page = ctx.new_page()
        t_nav = time.time()
        page.goto(HOMEPAGE_URL, wait_until="domcontentloaded")
        _wait_for_text(page, ["ClawKing", "CLAW", "0.001"], 20)
        skip_seconds = time.time() - t_nav + 0.3
        print(f"[homepage_outro] rendered after {skip_seconds:.1f}s")
        page.wait_for_timeout(800)

        t0 = time.time()
        # 0–2s: brief hero hover so the shot starts "alive"
        page.mouse.move(1380, 560, steps=20)
        page.wait_for_timeout(1200)

        # Click CHOOSE LOBSTER → opens the NFT selection modal
        try:
            btn = page.locator('button:has-text("CHOOSE LOBSTER")').first
            if btn.count() > 0:
                btn.click(timeout=3000, force=True)
                print("[homepage_outro] clicked CHOOSE LOBSTER via selector")
            else:
                page.mouse.click(*CHOOSE_LOBSTER_XY)
                print("[homepage_outro] clicked CHOOSE LOBSTER via coords")
        except Exception as e:
            print(f"[homepage_outro] click failed: {e}")
            try:
                page.mouse.click(*CHOOSE_LOBSTER_XY)
            except Exception:
                pass

        # Hold with gentle mouse wander over the modal area until we've captured
        # HOMEPAGE_OUTRO_SECONDS of material.
        modal_path = [(960, 540), (820, 480), (1100, 520), (960, 600),
                      (880, 580), (1040, 440), (960, 540)]
        i = 0
        while time.time() - t0 < HOMEPAGE_OUTRO_SECONDS:
            page.mouse.move(*modal_path[i % len(modal_path)], steps=30)
            page.wait_for_timeout(900)
            i += 1

        page.close(); ctx.close(); browser.close()

    return _finalize_trim(workdir, target, skip_seconds, HOMEPAGE_OUTRO_SECONDS)


def record_script_panel(base: Path, match_id: int, featured_name: str) -> Path:
    pp = paths(base, match_id)
    workdir = pp["temp_dir"] / f"_rec_script_{match_id}"
    if workdir.exists(): shutil.rmtree(workdir)
    workdir.mkdir()
    target = pp["script_webm"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=GPU_ARGS)
        ctx = browser.new_context(
            viewport={"width": W, "height": H},
            locale="en-US",
            record_video_dir=str(workdir),
            record_video_size={"width": W, "height": H},
        )
        page = ctx.new_page()
        t_nav = time.time()
        page.goto(REPLAY_URL.format(id=match_id), wait_until="domcontentloaded")

        # Wait until replay UI shows (turn counter or player names).
        ready_wait = _wait_for_text(page, ["Turn", "回合", featured_name], 30)
        # The sidebar player cards render a beat after the turn counter; give
        # them time to mount their `cursor-pointer` state.
        page.wait_for_timeout(3500)

        # Query DOM for real positions of the featured-player card AND the
        # STRATEGY SCRIPT button. Text-based locators are flaky when the same
        # text appears in many places; geometric clicks are reliable.
        positions = page.evaluate(
            """name => {
                let card = null;
                // Player cards have rounded-lg + cursor-pointer class signatures
                for (const c of document.querySelectorAll('[class*=rounded-lg][class*=cursor-pointer]')) {
                    if (c.textContent.includes(name)) { card = c; break; }
                }
                let btn = null;
                const TARGETS = ['STRATEGY SCRIPT','策略脚本','Strategy Script','AI Script'];
                for (const b of document.querySelectorAll('button')) {
                    const t = b.innerText.trim();
                    if (TARGETS.includes(t)) { btn = b; break; }
                }
                const pos = el => {
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return [Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)];
                };
                return { card: pos(card), btn: pos(btn) };
            }""",
            featured_name,
        )
        print(f"[script] positions: {positions}")

        if positions.get("card"):
            cx, cy = positions["card"]
            page.mouse.click(cx, cy)
            print(f"[script] clicked card at ({cx},{cy})")
        else:
            page.mouse.click(120, 149)
            print("[script] card not found in DOM; clicked sidebar fallback (120,149)")
        page.wait_for_timeout(900)

        if positions.get("btn"):
            bx, by = positions["btn"]
            page.mouse.click(bx, by)
            print(f"[script] clicked STRATEGY SCRIPT at ({bx},{by})")
        else:
            page.mouse.click(1761, 1040)
            print("[script] button not found in DOM; clicked fallback (1761,1040)")
        page.wait_for_timeout(1800)  # modal fade-in

        # Verify modal actually opened — the "Strategy Script" text appears
        # twice when the modal is up (once in the button, once in the header).
        body = page.evaluate("() => document.body.innerText || ''")
        modal_open = (body.count("Strategy Script") >= 2
                      or body.count("策略脚本") >= 2
                      or "SLOTS" in body or "RULES" in body)
        print(f"[script] modal_open={modal_open}")
        if not modal_open:
            # Retry once — sometimes the first click doesn't register while the
            # replay is still initializing.
            page.wait_for_timeout(800)
            if positions.get("btn"):
                page.mouse.click(*positions["btn"])
                print("[script] retrying STRATEGY SCRIPT click")
                page.wait_for_timeout(1500)
                body = page.evaluate("() => document.body.innerText || ''")
                modal_open = ("SLOTS" in body or "RULES" in body)
                print(f"[script] retry modal_open={modal_open}")

        skip_seconds = time.time() - t_nav
        page.wait_for_timeout(SCRIPT_SECONDS * 1000)

        page.close()
        ctx.close()
        browser.close()

    return _finalize_trim(workdir, target, skip_seconds, SCRIPT_SECONDS)


if __name__ == "__main__":
    mid = int(sys.argv[1])
    featured = sys.argv[2] if len(sys.argv) > 2 else "ChatGPT5.4"
    base = Path(__file__).resolve().parent.parent
    print(f"[record_ui] homepage intro clip")
    p = record_homepage_intro(base, mid)
    print(f"  -> {p.name} ({p.stat().st_size/1024/1024:.1f} MB)")
    print(f"[record_ui] homepage outro clip (Choose Lobster)")
    p = record_homepage_outro(base, mid)
    print(f"  -> {p.name} ({p.stat().st_size/1024/1024:.1f} MB)")
    print(f"[record_ui] script panel ({featured})")
    p = record_script_panel(base, mid, featured)
    print(f"  -> {p.name} ({p.stat().st_size/1024/1024:.1f} MB)")
