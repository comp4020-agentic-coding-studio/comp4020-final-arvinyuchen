// Starts Spots: Astro's own Node server (dist/server/entry.mjs), with two
// things it doesn't do on its own.
//
// - Compression. The group's page is a few hundred KB of HTML (and a live
//   refresh fetches it again), the map's script about a megabyte, so text
//   goes out gzipped or brotli'd when the browser takes it. Never the live
//   stream (/api/events): compressing it would hold its events back.
// - A week's cache for pictures. Astro marks its own hashed files in
//   /_astro immutable for a year; the illustrations and photos in public/
//   keep their names when redrawn, so they're cached a week, not forever.
//
// HOST and PORT as Astro's server reads them (fly.toml sets PORT=8080).
import http from "node:http";
import compression from "compression";

process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { handler } = await import("./dist/server/entry.mjs");

const compress = compression({
  filter: (req, res) => !String(res.getHeader("content-type") ?? "").startsWith("text/event-stream") && compression.filter(req, res),
});
const PICTURES = /^\/(places|kinds|images)\//;

const server = http.createServer((req, res) => {
  if (PICTURES.test(req.url ?? "")) res.setHeader("Cache-Control", "public, max-age=604800");
  compress(req, res, () => handler(req, res));
});
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
server.listen(port, host, () => console.log(`Spots on http://${host}:${port}`));
