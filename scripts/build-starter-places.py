"""Builds src/data/starter-places.json and its pictures from the candidate
lists researched for Spots' starter places (kept outside the repo, next to
it, in spots-candidates/): Toque's open venues, each with the editorial
article that backs its reason, and the activities, outdoors and culture
places found in local guides.

  python3 -I scripts/build-starter-places.py <spots-candidates dir> <activity art dir>

Each place keeps its source and coordinates as researched; this only checks
them (in the ACT or just over the border, a reason, a link), drops repeats
of a place already in src/lib/catalogue.ts or in the lists, gives it a key
and its picture: a Toque DishArt for food and drink (scripts/starter_art.py
puts it on paper, 900x600), the activity's own illustration otherwise.
"""
import glob, json, math, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import starter_art  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
CAND = Path(sys.argv[1])
DO_ART = Path(sys.argv[2])
DISHES = Path.home() / "Documents/Works/toque/ios/Toque/Resources/Assets.xcassets/Dishes"
KINDS = {"food", "coffee", "drinks", "outdoors", "culture", "fun"}

slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and").replace("'", "")).strip("-")
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower().replace("&", "and")).strip()

def km(a, b):
    dy = (a["lat"] - b["lat"]) * 111.32
    dx = (a["lon"] - b["lon"]) * 111.32 * math.cos(math.radians(a["lat"]))
    return math.hypot(dx, dy)

catalogue = (REPO / "src/lib/catalogue.ts").read_text()
taken_keys = set(re.findall(r'key: "([^"]+)"', catalogue))
chosen = [{"name": n, "lat": float(la), "lon": float(lo)} for la, lo, n in re.findall(r'lat: (-?[\d.]+),\s*lon: (-?[\d.]+),\s*name: "([^"]*)"', catalogue)]

def candidates():
    for e in json.load(open(CAND / "build/food-dish.json")):
        yield {**e, "art": f"dish/{e['dish']}"}
    for name in ("outdoors-x10", "culture-x10", "fun-x10"):
        if not (CAND / f"{name}.json").exists():
            continue
        for e in json.load(open(CAND / f"{name}.json")):
            yield {**e, "art": f"do/{slug(e['covers'])}"}

out, dropped = [], []
for e in candidates():
    why = (e.get("why") or "").strip()
    bad = (
        "kind" if e.get("kind") not in KINDS
        else "where" if not (isinstance(e.get("lat"), (int, float)) and -36 < e["lat"] < -34.9 and 148.7 < e["lon"] < 149.6)
        else "reason" if not why or len(why) > 170
        else "source" if not str(e.get("source", "")).startswith("http")
        else "repeat" if any(norm(e["name"]) == norm(o["name"]) and km(e, o) < 0.4 for o in chosen + out)
        else None
    )
    if bad:
        dropped.append((e["name"], bad))
        continue
    key = slug(e["name"])
    if key in taken_keys:
        key = f"{key}-{slug(e['area'])}"
    while key in taken_keys:
        key += "-2"
    taken_keys.add(key)
    out.append({
        "key": key, "lat": round(e["lat"], 6), "lon": round(e["lon"], 6), "name": e["name"].strip(),
        "kind": e["kind"], "area": e["area"].strip(), "blurb": why, "source": e["source"], "art": e["art"],
    })

# The pictures: each one once, however many places share it.
for art in sorted({p["art"] for p in out}):
    group, name = art.split("/")
    target = REPO / "public/places" / f"{art}.webp"
    if group == "dish":
        src = [p for p in glob.glob(str(DISHES / f"dish-{name}.imageset/*")) if p.endswith((".heic", ".png")) and "night" not in p][0]
    else:
        src = str(DO_ART / f"{name}.png")
    starter_art.make(src, target)

(REPO / "src/data/starter-places.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"{len(out)} places, {len({p['art'] for p in out})} pictures; dropped {len(dropped)}: {dropped}")
