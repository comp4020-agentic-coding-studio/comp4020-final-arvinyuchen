// MapLibre runs its tile work in a web worker it loads from a file next to
// its own module. Bundling folds the module into the page script, so that
// file never ships. This copies the worker (and the shared code it imports)
// into public/, where src/scripts/map.ts points MapLibre at it. Runs before
// every build, so the worker always matches the installed MapLibre.
import { copyFileSync, mkdirSync } from "node:fs";

const from = "node_modules/maplibre-gl/dist";
const to = "public/vendor/maplibre";
mkdirSync(to, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) copyFileSync(`${from}/${file}`, `${to}/${file}`);
