"""Generate a commentary template scaffolded with timing budgets.

Reads:
  <id>.log         on-chain match log
  <id>.turns.json  recorder output (turn → wall-clock seconds)

Writes:
  <id>.template.md  Markdown skeleton with one section per turn-range,
                    annotated with target window, word budget, and the
                    notable events in that window.

Section design heuristic:
  - Always anchor on KILL turns: each kill-turn becomes a single-turn section.
  - Group quiet turns between kills into one section.
  - Cap any single section at 10 turns to avoid huge silent stretches.

Word budget = (window_seconds * BASE_WPM / 60), where BASE_WPM=170 (typical
ESports commentary at +15% TTS rate).
"""
import json
import re
import sys
from pathlib import Path

BASE_WPM = 200          # F5-TTS at +0% measures ~200 wpm on English scripts in practice
MAX_SECTION_TURNS = 10  # never group more than this many quiet turns
MIN_SECTION_SEC = 2.5   # sections shorter than this merge with the next (or previous if last)
TARGET_FILL = 0.90      # budget = window * TARGET_FILL; gap-after each section = ~10% of window


def parse_log(log_path: Path):
    """Return list[(turn_idx, [event_strings])] and player metadata."""
    text = log_path.read_text(encoding="utf-8")
    players = []
    for m in re.finditer(r"^\[(\d+)\]\s+(\S+)\s+\((0x[0-9a-fA-F.]+)\)\s+\|\s+(.*)$",
                         text, re.MULTILINE):
        idx, name, addr, stats = m.groups()
        players.append({"idx": int(idx), "name": name, "addr": addr, "stats": stats.strip()})

    # turn blocks
    turns = []
    cur_turn, cur_events = None, []
    for line in text.splitlines():
        m = re.match(r"^---\s+Turn\s+(\d+)\s+\|", line)
        if m:
            if cur_turn is not None:
                turns.append((cur_turn, cur_events))
            cur_turn = int(m.group(1))
            cur_events = []
            continue
        if cur_turn is not None and line.strip().startswith(("ChatGPT", "[", "==")) is False:
            s = line.strip()
            if s and not s.startswith("---") and not s.startswith("==="):
                cur_events.append(s)
    if cur_turn is not None:
        turns.append((cur_turn, cur_events))

    # final standings
    standings = []
    in_result = False
    for line in text.splitlines():
        if line.startswith("=== Result ==="):
            in_result = True
            continue
        if in_result and line.startswith("#"):
            standings.append(line.strip())
    return players, turns, standings


def is_highlight(events: list[str]) -> tuple[bool, str | None]:
    """Return (is_highlight, short_label) for events in a turn."""
    for e in events:
        if "DIES" in e:
            who = e.split()[0]
            return True, f"{who} DIES"
        if "KILLS" in e:
            return True, e.strip().rstrip("!")
        if "SKILL [" in e:
            return True, e.split("SKILL ")[-1][:60]
    return False, None


def build_sections(turns_data, turn_times, total_dur):
    """Group turns into sections — each kill-turn solo, quiet runs grouped.

    Then pass-two: sections whose raw_window (wall-clock seconds) is shorter
    than MIN_SECTION_SEC get merged into the following section (or the
    previous one if they're last). Very short sections can't fit enough
    words for a full sentence so the commentator would need to combine
    them anyway.
    """
    sections = []
    quiet_buf: list[int] = []

    def flush_quiet():
        if not quiet_buf:
            return
        i = 0
        while i < len(quiet_buf):
            chunk = quiet_buf[i:i + MAX_SECTION_TURNS]
            sections.append({"turns": chunk, "highlight": None})
            i += MAX_SECTION_TURNS
        quiet_buf.clear()

    for tidx, events in turns_data:
        hot, label = is_highlight(events)
        if hot:
            flush_quiet()
            sections.append({"turns": [tidx], "highlight": label})
        else:
            quiet_buf.append(tidx)
    flush_quiet()

    # Pass 2: merge sections with a tiny raw_window into the next section.
    def window_of(sec):
        first = sec["turns"][0]
        last = sec["turns"][-1]
        s = turn_times.get(first, 0.0)
        e = turn_times.get(last + 1, total_dur)
        return max(0.0, e - s)

    merged = []
    i = 0
    while i < len(sections):
        cur = sections[i]
        while window_of(cur) < MIN_SECTION_SEC and i + 1 < len(sections):
            nxt = sections[i + 1]
            # pick the more urgent highlight label
            label = cur["highlight"] or nxt["highlight"]
            cur = {"turns": cur["turns"] + nxt["turns"], "highlight": label}
            i += 1
        # last section edge case: merge backwards if still too short
        if window_of(cur) < MIN_SECTION_SEC and merged:
            prev = merged.pop()
            label = prev["highlight"] or cur["highlight"]
            cur = {"turns": prev["turns"] + cur["turns"], "highlight": label}
        merged.append(cur)
        i += 1
    return merged


def section_window(sec, turn_times, total_dur):
    first = sec["turns"][0]
    last = sec["turns"][-1]
    start = turn_times.get(first, 0.0)
    # end = start of next-turn (last+1) if known, else extend to total
    end = turn_times.get(last + 1, total_dur)
    return start, end


def render_template(mid: int, players, turns_data, turn_times, total_dur, standings):
    sections = build_sections(turns_data, turn_times, total_dur)
    lines = [f"# Match {mid}", "", "## Broadcast Script", ""]
    lines += [
        "<!-- Players in this match: -->",
    ]
    for p in players:
        lines.append(f"<!-- [{p['idx']}] {p['name']} | {p['stats']} -->")
    lines += [
        "<!-- Final standings: -->",
    ] + [f"<!-- {s} -->" for s in standings] + [""]

    # intro placeholder
    lines += [
        "<!-- INTRO (over a black title card): 1-2 sentence hook + featured player. -->",
        "<!-- ~12-25 seconds of speech. No turn anchor — it plays before the replay. -->",
        "",
        "Welcome back to ClawKing.",
        "",
        "OK. Let's begin.",
        "",
        "[Profile]  <!-- optional. Plays over the replay-page screenshot before T1 starts. -->",
        "<!-- ~15-25 seconds. Highlight featured player's stats / skill / strategy idea. -->",
        "",
        "<!-- write the lines here, one short clause per line -->",
        "",
    ]

    # one block per section — each is a HARD window. Overshoot fails QA.
    for sec in sections:
        ts = sec["turns"]
        tag = f"[Turn {ts[0]}]" if len(ts) == 1 else f"[Turns {ts[0]}-{ts[-1]}]"
        start, end = section_window(sec, turn_times, total_dur)
        win = end - start
        # Target budget = 80% of window; hard max leaves 1s tolerance.
        target = max(3, int(round(win * TARGET_FILL * BASE_WPM / 60)))
        hard_max = max(target + 1, int(round((win + 1.0) * BASE_WPM / 60)))
        peak = sec["highlight"] or "quiet positioning"
        lines += [
            f"{tag}  <!-- window {win:4.1f}s | target ~{target} words | HARD MAX {hard_max} words (overrun FAILS QA) | peak: {peak} -->",
            "",
            "<!-- write lines here, one short clause per line -->",
            "",
        ]

    lines += [
        "---",
        "",
        "<!-- OUTRO + CTA: 80-120 words, invite viewer to clawking.cc -->",
        "",
        "And that is what ClawKing is really about.",
        "",
        "Eight lobsters. Eight scripts. One map.",
        "",
        "Your lobster is not going to write itself. Try it at clawking.cc.",
        "",
    ]
    return "\n".join(lines) + "\n"


def main():
    mid = int(sys.argv[1])
    base = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent
    sys.path.insert(0, str(Path(__file__).parent))
    from layout import paths
    p = paths(base, mid)

    log = p["log"]
    tj = p["turns"]
    out = p["template"]

    players, turns_data, standings = parse_log(log)
    j = json.loads(tj.read_text(encoding="utf-8"))
    turn_times = {int(k): float(v) for k, v in j["turns"].items()}
    total_dur = float(j["duration"])

    out.write_text(render_template(mid, players, turns_data, turn_times, total_dur, standings),
                   encoding="utf-8")
    print(f"[plan] wrote {out} ({len(turns_data)} turns, {total_dur:.1f}s)")


if __name__ == "__main__":
    main()
