"""Turn a square illustration into a Spots place picture: on one paper,
padded to 3:2, 900x600 webp, quality 80.

  (used by scripts/build-starter-places.py)
"""
import statistics, subprocess, sys, tempfile
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter, ImageStat

def paper(img):
    w, h = img.size
    px = [img.getpixel((x, y)) for x in range(0, w, 7) for y in (0, 1, h - 2, h - 1)]
    px += [img.getpixel((x, y)) for y in range(0, h, 7) for x in (0, 1, w - 2, w - 1)]
    return tuple(int(statistics.median(c[i] for c in px)) for i in range(3))

PAPER = (242, 238, 232)

# The paper: an empty corner of a DishArt drawn on paper, mirrored into a
# sheet so it has no seams.
PAPER_FROM = Path.home() / "Documents/Works/toque/ios/Toque/Resources/Assets.xcassets/Dishes/dish-coffee-iced.imageset/coffee-iced.heic"
_sheet = None

def sheet():
    global _sheet
    if _sheet is None:
        tmp = Path(tempfile.mkdtemp()) / "paper.png"
        subprocess.run(["sips", "-s", "format", "png", str(PAPER_FROM), "--out", str(tmp)], check=True, capture_output=True)
        patch = Image.open(tmp).convert("RGB").resize((600, 600)).crop((0, 450, 150, 600))
        # (toned to the paper most of the drawings are on)
        mean = ImageStat.Stat(patch).mean
        patch = Image.merge("RGB", [band.point(lambda v, k=PAPER[i] / mean[i]: min(255, round(v * k))) for i, band in enumerate(patch.split())])
        tile = Image.new("RGB", (300, 300))
        tile.paste(patch, (0, 0))
        tile.paste(patch.transpose(Image.FLIP_LEFT_RIGHT), (150, 0))
        tile.paste(patch.transpose(Image.FLIP_TOP_BOTTOM), (0, 150))
        tile.paste(patch.transpose(Image.ROTATE_180), (150, 150))
        _sheet = Image.new("RGB", (900, 600))
        for x in range(0, 900, 300):
            for y in range(0, 600, 300):
                _sheet.paste(tile, (x, y))
    return _sheet

def make(src, out):
    src = Path(src)
    if src.suffix.lower() == ".heic":
        tmp = Path(tempfile.mkdtemp()) / (src.stem + ".png")
        subprocess.run(["sips", "-s", "format", "png", str(src), "--out", str(tmp)], check=True, capture_output=True)
        src = tmp
    img = Image.open(src).convert("RGB").resize((600, 600), Image.LANCZOS)
    # Every picture goes onto the same paper, whatever it was drawn on: its
    # own paper lifted to white, then multiplied with the sheet, as ink on
    # paper, so a page of cards is one paper and no square shows.
    own = paper(img)
    img = Image.merge("RGB", [band.point(lambda v, k=255 / own[i]: min(255, round(v * k))) for i, band in enumerate(img.split())])
    white = Image.new("RGB", (900, 600), "white")
    white.paste(img, (150, 0))
    # (and its edges faded into the sheet, where its paper wasn't even)
    edge = Image.new("L", (900, 600), 0)
    edge.paste(255, (150 + 48, 48, 750 - 48, 600 - 48))
    canvas = Image.composite(ImageChops.multiply(white, sheet()), sheet(), edge.filter(ImageFilter.GaussianBlur(28)))
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "WEBP", quality=80)
    return paper(img)

if __name__ == "__main__":
    print(make(sys.argv[1], sys.argv[2]))
