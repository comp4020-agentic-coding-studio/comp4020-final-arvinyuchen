// Builds public/og.jpg, the picture on a Spots link in a chat (og:image).
// Chat apps want a raster at 1200x630, so the card is the invite's own
// photo of Canberra (Linda Xu on Unsplash, credited in the footer) with the
// invite's shade and white lettering drawn over it as SVG, rasterised once
// with sharp; run it again only if the brand changes:
//   node scripts/build-og-image.mjs
import sharp from "sharp";

const FONT = "SF Pro Display, Helvetica Neue, Arial, sans-serif";
const over = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgb(4,38,52)" stop-opacity="0.72"/>
      <stop offset="0.55" stop-color="rgb(4,38,52)" stop-opacity="0.3"/>
      <stop offset="1" stop-color="rgb(4,38,52)" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <g transform="translate(96 92) scale(3.2)">
    <circle cx="16" cy="14" r="9" fill="#ffffff"/>
    <circle cx="16" cy="14" r="3.5" fill="#0b6e88"/>
    <path d="M16 31 9 20h14z" fill="#ffffff"/>
  </g>
  <text x="210" y="168" font-family="${FONT}" font-size="64" font-weight="800" fill="#ffffff">Spots</text>
  <text x="100" y="300" font-family="${FONT}" font-size="92" font-weight="800" letter-spacing="-2" fill="#ffffff">Places to go,</text>
  <text x="100" y="400" font-family="${FONT}" font-size="92" font-weight="800" letter-spacing="-2" fill="#ffffff">picked together</text>
  <text x="100" y="560" font-family="${FONT}" font-size="38" font-weight="600" fill="#ffffff">Join with a link and your name. No app, no sign-up.</text>
</svg>`;

await sharp("public/images/canberra-from-ainslie-2000.jpg")
  .resize(1200, 630, { fit: "cover", position: "top" })
  .composite([{ input: Buffer.from(over) }])
  // A photo, so a JPEG: a few hundred KB at most, which every chat app takes.
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile("public/og.jpg");
console.log("wrote public/og.jpg");
