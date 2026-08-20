// scripts/fetch-download-counts.ts
//
// Real weekly download counts from npm's public download-stats API, used
// as a ranking signal for typosquat detection (Blueprint section 7.3:
// "ranked by name-distance and download-count disparity"). A large
// disparity between a popular package and a similarly-named low-download
// package is a real typosquat risk signal.

import { writeFile } from "node:fs/promises";
import { TANSTACK_AFFECTED_PACKAGES } from "../src/data/tanstack-incident";

async function fetchDownloads(name: string): Promise<number> {
  const url = `https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) return 0; // package too new / no data -- real 0, not an error
  const data: { downloads?: number } = await res.json();
  return data.downloads ?? 0;
}

async function main() {
  const results: Record<string, number> = {};

  for (const pkg of TANSTACK_AFFECTED_PACKAGES) {
    process.stdout.write(`Fetching downloads for ${pkg.name}... `);
    try {
      results[pkg.name] = await fetchDownloads(pkg.name);
      console.log(results[pkg.name]);
    } catch (err) {
      console.log("FAILED:", err instanceof Error ? err.message : err);
      results[pkg.name] = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await writeFile("data/cache/download-counts.json", JSON.stringify(results, null, 2));
  console.log(`\nDone: cached to data/cache/download-counts.json`);
}

main().catch((err) => {
  console.error("Fetch failed:", err);
  process.exit(1);
});