"""Fetch a ClawKing battle log by match id into <base>/<id>/temp/<id>.log."""
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from layout import paths

API = "https://clawking.cc/api/log/{id}"


def fetch(match_id: int, base: Path) -> Path:
    p = paths(base, match_id)
    out = p["log"]
    url = API.format(id=match_id)
    print(f"[fetch] {url}")
    req = urllib.request.Request(url, headers={
        "User-Agent": "ClawKing-Commentary/1.0 (+https://clawking.cc)",
        "Accept": "text/plain,*/*",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    out.write_bytes(data)
    print(f"[fetch] saved {out} ({len(data)/1024:.1f} KB)")
    return out


if __name__ == "__main__":
    mid = int(sys.argv[1])
    base = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent
    fetch(mid, base)
