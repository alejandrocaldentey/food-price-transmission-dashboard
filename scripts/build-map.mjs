// Pre-projects Europe into SVG paths once, so the browser ships paths, not a geometry library.
// Input: Natural Earth 1:50m via world-atlas. Output: lib/europe-map.json.
//   node scripts/build-map.mjs /path/to/country_codes.csv
import { readFileSync, writeFileSync } from "node:fs";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const W = 560, H = 600;
const codes = Object.fromEntries(
  readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => {
    const [m49, iso3] = l.split(",");
    return [String(Number(m49)), iso3];
  }),
);
const topo = JSON.parse(readFileSync("node_modules/world-atlas/countries-50m.json", "utf8"));
const world = feature(topo, topo.objects.countries);
const frame = {
  type: "Feature",
  geometry: { type: "MultiPoint", coordinates: [[-10.5, 35], [34.5, 34.5], [-10.5, 70.5], [34.5, 70.5], [12, 34]] },
};
const projection = geoAzimuthalEqualArea().rotate([-10, -52]).fitExtent([[8, 8], [W - 8, H - 8]], frame);
projection.clipExtent([[0, 0], [W, H]]);
const path = geoPath(projection);
const out = [];
for (const f of world.features) {
  const d = path(f);
  if (!d) continue;
  const id = String(Number(f.id));
  const [cx, cy] = path.centroid(f);
  out.push({ id, iso3: codes[id] ?? null, name: f.properties.name, d: d.replace(/(\d+\.\d)\d+/g, "$1"), cx: Math.round(cx), cy: Math.round(cy) });
}
writeFileSync("lib/europe-map.json", JSON.stringify({ width: W, height: H, features: out }));
console.log(`${out.length} features, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
