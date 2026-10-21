// Builds public/og.png, the picture on a Spots link in a chat (og:image).
// Chat apps want a raster at 1200x630, so the card is drawn here as SVG and
// rasterised once with sharp; run it again only if the brand changes:
//   node scripts/build-og-image.mjs
import sharp from "sharp";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fff8ef"/>
  <rect y="430" width="1200" height="200" fill="#fbeedd"/>
  <g transform="translate(140 150) scale(9)">
    <circle cx="16" cy="14" r="9" fill="#e8573a"/>
    <circle cx="16" cy="14" r="3.5" fill="#fff8ef"/>
    <path d="M16 31 9 20h14z" fill="#e8573a"/>
  </g>
  <text x="470" y="290" font-family="Nunito, Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="150" font-weight="800" fill="#241c15">Spots</text>
  <text x="474" y="370" font-family="Nunito, Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="46" font-weight="600" fill="#6b5a4b">Places to go, picked together</text>
  <text x="140" y="545" font-family="Nunito, Avenir Next, Helvetica Neue, Arial, sans-serif" font-size="40" font-weight="600" fill="#241c15">Join with a link and your name. No app, no sign-up.</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("public/og.png");
console.log("wrote public/og.png");
