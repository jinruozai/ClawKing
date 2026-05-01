"""End-to-end orchestrator.

Layout (per match):
  commentary/<id>/
    <id>.md              commentary script (Claude writes this)
    <id>_final.mp4       deliverable video
    <id>_social.txt      social-media caption
    temp/                all intermediates + debug artifacts

Shared:
  commentary/bgm/        BGM tracks (menu/battle/climax/victory)
  commentary/ref_clip.wav + ref_text.txt   voice clone reference (F5-TTS)

Standard flow:
  python run.py <id> --steps fetch,record,record_ui,plan   (8-12 min)
  (Claude writes commentary/<id>/<id>.md)
  python run.py <id> --steps tts,compose,validate,social   (~8 min w/ F5-TTS)
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fetch import fetch
from record import record
from record_ui import (record_homepage_intro, record_homepage_outro,
                        record_script_panel)
from plan import main as plan_main
from compose import compose
from validate import validate
from social import build as build_social
from layout import paths, legacy_flat_to_new

BASE = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("match_id", type=int)
    ap.add_argument("--steps", default="fetch,record,record_ui,plan,tts,compose,validate,social")
    ap.add_argument("--base", default=str(BASE),
                    help="Commentary base directory (default: the commentary/ folder)")
    ap.add_argument("--engine", choices=["f5", "edge"], default="f5",
                    help="TTS backend: f5 = F5-TTS voice clone; edge = edge-tts Andrew")
    ap.add_argument("--featured", default="ChatGPT5.4",
                    help="Featured player name (for the Strategy Script panel recording)")
    args = ap.parse_args()

    base = Path(args.base)
    steps = [s.strip() for s in args.steps.split(",") if s.strip()]
    mid = args.match_id

    # Ensure match dir + temp/ exist; migrate any legacy flat files that still
    # sit in base/ for this mid.
    p = paths(base, mid)
    moved = legacy_flat_to_new(base, mid)
    if moved:
        print(f"[run] migrated {moved} legacy file(s) into {p['match_dir']}")

    if "fetch" in steps:
        fetch(mid, base)

    if "record" in steps:
        record(mid, base)

    if "record_ui" in steps:
        print(f"[run] record_ui for match {mid} (featured={args.featured})")
        record_homepage_intro(base, mid)
        record_homepage_outro(base, mid)
        record_script_panel(base, mid, args.featured)

    if "plan" in steps:
        sys.argv = ["plan.py", str(mid), str(base)]
        plan_main()

    if "tts" in steps:
        md = p["md"]
        if not md.exists():
            sys.exit(
                f"missing {md} — write the commentary script first "
                f"(use {p['template']} as the scaffold)."
            )
        if args.engine == "f5":
            from tts_f5 import synth as synth_f5
            ref_clip = base / "ref_clip.wav"
            ref_text_p = base / "ref_text.txt"
            if not ref_clip.exists() or not ref_text_p.exists():
                sys.exit(f"engine=f5 needs {ref_clip.name} + {ref_text_p.name}")
            synth_f5(base, mid, ref_clip, ref_text_p.read_text(encoding="utf-8").strip())
        else:
            from tts import synth as synth_edge
            synth_edge(base, mid)

    if "compose" in steps:
        compose(mid, base)

    if "validate" in steps:
        report = validate(mid, base)
        if not report["pass"]:
            print("[run] QA FAILED — see <id>/temp/<id>_qa.json and <id>/temp/<id>_qa_frames.png")

    if "social" in steps:
        build_social(mid, base)

    # Final hand-off
    if "compose" in steps:
        print()
        print(f"[run] deliverables for match {mid}:")
        for key in ("final_mp4", "social", "md"):
            f = p[key]
            tag = "[OK]" if f.exists() else "[--]"
            print(f"  {tag} {f}")


if __name__ == "__main__":
    main()
