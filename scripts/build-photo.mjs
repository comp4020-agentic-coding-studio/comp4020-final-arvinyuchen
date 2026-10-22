// Builds the photo of Canberra the home page and the invite open on
// (src/components/CityPhoto.astro): Linda Xu's view from Mount Ainslie on
// Unsplash (https://unsplash.com/photos/cityscape-during-daytime-QkcWZlBHykg,
// credited in the footer), from the original download, 4734 x 3136:
//
//   node scripts/build-photo.mjs ~/Downloads/linda-xu-QkcWZlBHykg-unsplash.jpg
//
// Three widths, each as AVIF and as JPEG for browsers without it. The
// widest is 3000: a phone shows the photo filling its screen's height, so
// a 375-point-wide phone shows it about 1200 points wide, at 2 or 3 pixels
// a point. (4000 would be sharper still, at near a megabyte.) The outputs
// are committed; the original isn't.
import sharp from "sharp";

const original = process.argv[2];
if (!original) throw new Error("Give the path of the original photo.");

for (const width of [1000, 2000, 3000]) {
  const out = `public/images/canberra-from-ainslie-${width}`;
  const photo = sharp(original).resize(width);
  await photo.clone().avif({ quality: 55 }).toFile(`${out}.avif`);
  await photo.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(`${out}.jpg`);
  console.log(`wrote ${out}.avif and .jpg`);
}

// And for a phone held upright, which shows a third of the photo's width
// at most: its middle three fifths, in two widths, so a phone fetches half
// as much for the same picture (CityPhoto.astro's `tall`).
const { width: full, height } = await sharp(original).metadata();
for (const width of [900, 1800]) {
  const out = `public/images/canberra-from-ainslie-tall-${width}`;
  const side = Math.round(full * 0.2);
  const photo = sharp(original).extract({ left: side, top: 0, width: full - 2 * side, height }).resize(width);
  await photo.clone().avif({ quality: 55 }).toFile(`${out}.avif`);
  await photo.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(`${out}.jpg`);
  console.log(`wrote ${out}.avif and .jpg`);
}
