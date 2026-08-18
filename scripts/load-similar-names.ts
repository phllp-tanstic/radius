// scripts/load-similar-names.ts
//
// Blueprint section 6.2: SIMILAR_NAME (Package->Package), "edit-distance-
// derived, powers typosquat detection." Real Levenshtein distance over
// all 42 real package names -- fully mechanical, no fabricated data.
// Threshold keeps this from becoming a dense/complete graph.

import { config } from "dotenv";
config({ path: ".env.local" });

import neo4j from "neo4j-driver";
import { readFile } from "node:fs/promises";
import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { packageId } from "../src/lib/ids";
import { TANSTACK_AFFECTED_PACKAGES } from "../src/data/tanstack-incident";

const MAX_DISTANCE = 8; // absolute edit distance threshold, tuned for real package name lengths here

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

async function main() {
  const downloadCounts = JSON.parse(
    await readFile("data/cache/download-counts.json", "utf-8")
  ) as Record<string, number>;

  const names = TANSTACK_AFFECTED_PACKAGES.map((p) => p.name);
  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    let edgeCount = 0;

    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const distance = levenshtein(names[i], names[j]);
        if (distance > MAX_DISTANCE) continue;

        const downloadsA = downloadCounts[names[i]] ?? 0;
        const downloadsB = downloadCounts[names[j]] ?? 0;
        const downloadDisparity = Math.abs(downloadsA - downloadsB);

        const aId = toBoltId(packageId("npm", names[i]));
        const bId = toBoltId(packageId("npm", names[j]));

        // SIMILAR_NAME is symmetric -- store both directions so a query
        // starting from either package finds the other directly.
        await session.run(
          `MERGE (a {id: $aId})-[r:SIMILAR_NAME {editDistance: $distance, downloadDisparity: $disparity}]->(b {id: $bId})`,
          { aId, bId, distance: neo4j.int(distance), disparity: neo4j.int(downloadDisparity) }
        );
        await session.run(
          `MERGE (b {id: $bId})-[r:SIMILAR_NAME {editDistance: $distance, downloadDisparity: $disparity}]->(a {id: $aId})`,
          { aId, bId, distance: neo4j.int(distance), disparity: neo4j.int(downloadDisparity) }
        );
        edgeCount += 2;
      }
    }

    console.log(`Upserted ${edgeCount} SIMILAR_NAME edges (max edit distance: ${MAX_DISTANCE}).`);
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Load failed:", err);
  process.exit(1);
});