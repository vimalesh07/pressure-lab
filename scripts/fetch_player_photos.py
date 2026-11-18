"""Fetch freely licensed player photos from Wikimedia Commons (via Wikidata) for the leaderboard players.

    py scripts/fetch_player_photos.py            # top 10 batters, bowlers and all-rounders (default)
    py scripts/fetch_player_photos.py --all      # every player in players.json

For each player: search Wikidata for the name, keep only entities whose occupation is cricketer (Q12299841),
take the image (P18), download a 320 px thumbnail into public/players/<playerId>.jpg and record the licence,
author and source page in public/data/player_photos.json (shown as a credit in the dashboard).
Players without a match or without an image are simply skipped (the UI falls back to initials).
Only Commons files with a free licence (CC BY / CC BY-SA / CC0 / public domain / GODL-India) are kept.
"""
from __future__ import annotations

import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
OUT_DIR = ROOT / "public" / "players"
OUT_JSON = DATA / "player_photos.json"
UA = "PressureLabDashboard/1.0 (cricket analytics dashboard; photo credits shown on page)"
CRICKETER = "Q12299841"
# Commons files checked by eye and rejected (another player is as prominent, so a crop could show the wrong person)
REJECT = {"Jermaine Blackwood batting and Cameron Green bowling at Perth Stadium, First Test Australia versus West Indies, 2 December 2022 04.jpg"}
FREE = re.compile(r"^(cc[- ]by|cc[- ]by[- ]sa|cc0|public domain|pd|godl)", re.I)  # GODL-India: open, attribution


def get(url: str) -> dict:
    """GET JSON politely: 1 request/second, back off and retry on HTTP 429 (rate limit)."""
    for attempt in range(5):
        time.sleep(1.0)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 10 * (attempt + 1)
            print(f"    rate limited, waiting {wait}s")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def download(url: str) -> bytes:
    for attempt in range(5):
        time.sleep(2.0)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 4:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 20 * (attempt + 1)
            print(f"    image rate limited, waiting {wait}s")
            time.sleep(wait)
    raise RuntimeError("unreachable")


def wikidata_candidates(name: str) -> list[str]:
    q = urllib.parse.urlencode({"action": "wbsearchentities", "search": name, "language": "en", "type": "item",
                                "limit": 7, "format": "json"})
    res = get(f"https://www.wikidata.org/w/api.php?{q}")
    return [h["id"] for h in res.get("search", [])]


def entity_image(qid: str) -> str | None:
    res = get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")
    ent = res["entities"][qid]
    claims = ent.get("claims", {})
    occ = {c["mainsnak"].get("datavalue", {}).get("value", {}).get("id") for c in claims.get("P106", [])}
    if CRICKETER not in occ:
        return None
    imgs = claims.get("P18", [])
    return imgs[0]["mainsnak"]["datavalue"]["value"] if imgs else None


def commons_info(filename: str) -> dict | None:
    q = urllib.parse.urlencode({"action": "query", "titles": f"File:{filename}", "prop": "imageinfo",
                                "iiprop": "url|extmetadata", "iiurlwidth": 330, "format": "json"})
    res = get(f"https://commons.wikimedia.org/w/api.php?{q}")
    page = next(iter(res["query"]["pages"].values()))
    ii = (page.get("imageinfo") or [None])[0]
    if not ii:
        return None
    meta = ii.get("extmetadata", {})
    lic = meta.get("LicenseShortName", {}).get("value", "")
    if not FREE.match(lic.strip()):
        return None
    artist = re.sub(r"<[^>]+>", "", html.unescape(meta.get("Artist", {}).get("value", ""))).strip() or "Unknown author"
    return {"thumb": ii.get("thumburl") or ii["url"], "page": ii["descriptionurl"], "license": lic,
            "licenseUrl": meta.get("LicenseUrl", {}).get("value", ""), "artist": artist[:120]}


def name_variants(name: str) -> list[str]:
    parts = name.split()
    out = [name]
    if len(parts) > 2:
        out.append(" ".join(parts[-2:]))  # "Namboori Tilak Varma" -> "Tilak Varma"
    return out


def wanted_players(all_players: bool) -> list[tuple[str, str]]:
    players = json.loads((DATA / "players.json").read_text(encoding="utf-8"))
    if all_players:
        return [(p["id"], p["name"]) for p in players]
    ids: dict[str, str] = {}
    for f in ["leaderboard_batters.json", "leaderboard_bowlers.json"]:
        lb = json.loads((DATA / f).read_text(encoding="utf-8"))
        v = next(v for v in lb["views"] if v["format"] == v["season"] == v["phase"] == "All")
        for r in v["rows"]:
            ids[r["playerId"]] = r["name"]
    ev = json.loads((DATA / "evidence.json").read_text(encoding="utf-8"))
    for p in ev["players"].values():
        ids[p["playerId"]] = p["name"]
    return list(ids.items())


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    photos = json.loads(OUT_JSON.read_text(encoding="utf-8")) if OUT_JSON.exists() else {}
    todo = wanted_players("--all" in sys.argv)
    found = 0
    for pid, name in todo:
        if pid in photos and (OUT_DIR / photos[pid]["file"]).exists():
            found += 1
            continue
        hit = None
        try:
            for variant in name_variants(name):
                for qid in wikidata_candidates(f"{variant}"):
                    img = entity_image(qid)
                    time.sleep(0.2)
                    if img and img not in REJECT:
                        info = commons_info(img)
                        if info:
                            hit = (qid, img, info)
                            break
                if hit:
                    break
        except Exception as e:  # network hiccup: skip this player, keep going
            print(f"  ! {name}: {e}")
            continue
        if not hit:
            print(f"  - {name}: no free Commons photo found")
            continue
        qid, img, info = hit
        fn = f"{pid}.jpg"
        try:
            (OUT_DIR / fn).write_bytes(download(info["thumb"]))
        except Exception as e:
            print(f"  ! {name}: download failed ({e}); run again later")
            continue
        photos[pid] = {"file": fn, "name": name, "wikidata": qid, "commonsFile": img, "source": info["page"],
                       "license": info["license"], "licenseUrl": info["licenseUrl"], "artist": info["artist"]}
        found += 1
        print(f"  + {name}: {img} ({info['license']}, {info['artist'][:40]})")
        time.sleep(0.3)
    OUT_JSON.write_text(json.dumps(photos, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{found}/{len(todo)} players have a photo -> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
