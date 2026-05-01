"""Generate a social-media caption file for a finished commentary video.

Reads:
  <id>.log              on-chain match log (for standings + kill moments)
  <id>.md               commentary script (featured player + narrative)
  <id>_timeline.json    exact seconds for every part -> key timestamps
  <id>_segments.json    per-section TTS manifest (for 'peak' events per turn)

Writes:
  <id>_social.txt       title + description + timestamped chapters + hashtags
                        in a format ready to paste into X/Twitter, YouTube
                        description, or Farcaster.
  <id>_twitter.txt      short, natural X/Twitter copy for posting the video.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths


HASHTAGS = "#ClawKing #AIgaming #Web3Gaming #OnchainGames #opBNB #AIAgents #BattleRoyale"


def _parse_featured(md: str) -> str | None:
    """The featured player name is the one named in the intro or profile."""
    m = re.search(r"[Tt]oday (?:we follow|'s featured player[:]?)\s*([A-Za-z0-9._]+)", md)
    if m:
        return m.group(1).rstrip(".,")
    m = re.search(r"^\s*([A-Za-z][A-Za-z0-9._]{1,20})\s*$", md, re.MULTILINE)
    return m.group(1) if m else None


def _parse_log(log: str):
    players = {}
    for m in re.finditer(r"^\[(\d+)\]\s+(\S+)\s+.*?Skill:(\S+)\s+Power:(\d+)",
                         log, re.MULTILINE):
        idx, name, skill, power = m.groups()
        players[int(idx)] = {"name": name, "skill": skill, "power": int(power)}
    standings = []
    in_result = False
    for line in log.splitlines():
        if line.startswith("=== Result ==="):
            in_result = True; continue
        if in_result and line.startswith("#"):
            m = re.match(r"^#(\d+)\s+(\S+)\s+\|\s+Kills:\s*(\d+).*?(died|alive)",
                         line.strip())
            if m:
                rank, name, kills, status = m.groups()
                standings.append({
                    "rank": int(rank), "name": name,
                    "kills": int(kills), "status": status,
                })
    # kills per player (for featured player summary)
    kills_by = {}
    for m in re.finditer(r"^\s+(\S+)\s+KILLS\s+(\S+)", log, re.MULTILINE):
        killer = m.group(1)
        kills_by.setdefault(killer, []).append(m.group(2))
    return players, standings, kills_by


def _srt_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _find_part_start(parts: list, want_name: str) -> float | None:
    for p in parts:
        if p["name"] == want_name:
            return float(p["start"])
    return None


def build(mid: int, base: Path) -> Path:
    pp = paths(base, mid)
    log = pp["log"].read_text(encoding="utf-8")
    md = pp["md"].read_text(encoding="utf-8")
    tl = json.loads(pp["timeline_json"].read_text(encoding="utf-8"))
    manifest = json.loads(pp["segments_json"].read_text(encoding="utf-8"))

    featured = _parse_featured(md) or "our featured script"
    players, standings, kills_by = _parse_log(log)

    # rank + kills of featured player
    featured_entry = next(
        (s for s in standings if s["name"].split("#")[0].lower() == featured.lower()),
        None,
    )
    featured_short = featured.split("#")[0]
    featured_skill = next(
        (p["skill"] for p in players.values()
         if p["name"].split("#")[0].lower() == featured_short.lower()),
        None,
    )
    winner = standings[0]["name"].split("#")[0] if standings else None
    featured_kills = featured_entry["kills"] if featured_entry else 0
    featured_rank = featured_entry["rank"] if featured_entry else None

    # identify kill turns for the featured player to emit chapter marks
    kill_turns = []  # list of (turn, label, first_part_name)
    for seg in manifest.get("segments", []):
        lines_text = " ".join(seg.get("lines", [])).lower()
        turn_range = f"T{seg['first']}" + (f"-{seg['last']}" if seg['last'] != seg['first'] else "")
        # heuristics: "kill" / "dead" / "stealth" / "x damage" in the section
        if any(k in lines_text for k in
               ["clean kill", "dead.", "dead on", "eight damage", "seven damage",
                "kills.", "one finish"]):
            kill_turns.append((seg['first'], turn_range))

    # chapter timestamps from timeline parts
    parts = tl["parts"]
    def part_start(name: str) -> float:
        for p in parts:
            if p["name"] == name:
                return float(p["start"])
        return 0.0

    chapters: list[tuple[float, str]] = []
    intro_start = part_start("intro")
    chapters.append((intro_start, "Intro"))
    if any(p["name"] == "profile" for p in parts):
        chapters.append((part_start("profile"), f"Meet {featured_short}"))
    # first replay segment
    seg_names = [p["name"] for p in parts if p["name"].startswith("seg")
                  and not p["name"].endswith("_freeze")]
    if seg_names:
        chapters.append((part_start(seg_names[0]), "Match begins"))
    # kill chapters: map (turn → part start). plan.py's segment order in timeline
    # matches manifest.segments order, so we can index.
    replay_segs = [p for p in parts if p["name"].startswith("seg")
                    and not p["name"].endswith("_freeze")]
    manifest_segs = manifest.get("segments", [])
    for i, seg in enumerate(manifest_segs):
        if i >= len(replay_segs):
            break
        lines_lower = " ".join(seg.get("lines", [])).lower()
        if "clean kill" in lines_lower or "eight damage" in lines_lower or "seven damage" in lines_lower:
            t_range = f"Turn {seg['first']}" + (f"–{seg['last']}" if seg['last'] != seg['first'] else "")
            chapters.append((float(replay_segs[i]["start"]), f"{t_range} — big moment"))
    # outro
    if any(p["name"] == "outro" for p in parts):
        chapters.append((part_start("outro"), "How to play"))

    # Title — punchy + contrast
    skill_line = f"({featured_skill})" if featured_skill else ""
    if featured_rank == 1:
        title = (f"An AI lobster with {featured_skill or 'a smart'} script just won "
                 f"a Match #{mid} battle royale on-chain.")
    elif featured_kills >= 2:
        title = (f"Can a PATIENT AI actually beat RAW POWER in an on-chain battle "
                 f"royale? Watch {featured_short} {skill_line}".rstrip())
    else:
        title = (f"8 AI lobsters. One arena. One winner. Match #{mid} on ClawKing.")

    # Description
    desc_lines = [
        f"Match #{mid} — featured agent: {featured_short} {skill_line}".rstrip(),
    ]
    if featured_entry:
        desc_lines.append(
            f"Finished #{featured_rank} with {featured_kills} kill"
            f"{'s' if featured_kills != 1 else ''} — {featured_entry['status']}."
        )
    if winner and winner.lower() != featured_short.lower():
        desc_lines.append(f"Winner: {winner}.")
    desc_lines += [
        "",
        "ClawKing is the world's first on-chain AI battle royale.",
        "8 AI lobsters. One arena. Fully computed by smart contracts on opBNB.",
        "You write the script. Your lobster plays it out — publicly, deterministically, forever.",
        "",
        "▶︎ Chapters:",
    ]
    for t, label in chapters:
        desc_lines.append(f"  {_srt_time(t)} — {label}")
    desc_lines += [
        "",
        "Build your own agent at https://clawking.cc",
        "0.001 BNB per ticket. The leaderboard never lies.",
        "",
        HASHTAGS,
    ]
    description = "\n".join(desc_lines)

    out = pp["social"]
    out.write_text(
        f"TITLE:\n{title}\n\nDESCRIPTION:\n{description}\n",
        encoding="utf-8",
    )
    print(f"[social] -> {out}")

    if featured_rank == 1:
        twitter = (
            f"Match #{mid}: {featured_short} played this like a real endgame.\n\n"
            f"No early heroics. Just Stealth, clean positioning, and one brutal "
            f"finish when the ring got tiny.\n\n"
            f"8 AI scripts enter. The smartest lobster survives.\n"
            f"https://clawking.cc/?replay={mid}\n\n"
            "#ClawKing #AIAgents #OnchainGames"
        )
    elif featured_kills >= 2:
        twitter = (
            f"Match #{mid} had the kind of AI script arc I love:\n\n"
            f"{featured_short} did not win by charging the center. It waited, "
            f"picked windows, and turned small openings into kills.\n\n"
            f"On-chain AI battle royale is weird in the best way.\n"
            f"https://clawking.cc/?replay={mid}\n\n"
            "#ClawKing #AIAgents #Web3Gaming"
        )
    else:
        twitter = (
            f"New ClawKing match cut: #{mid}.\n\n"
            "Eight AI scripts, one shrinking arena, and a few decisions that only "
            "make sense once you watch the endgame.\n\n"
            f"https://clawking.cc/?replay={mid}\n\n"
            "#ClawKing #OnchainGames #AIAgents"
        )
    twitter_out = pp["twitter"]
    twitter_out.write_text(twitter + "\n", encoding="utf-8")
    print(f"[social] -> {twitter_out}")
    return out


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent
    build(mid, base)
