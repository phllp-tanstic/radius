// scripts/test-blast-radius.ts
//
// Verifies the real blast-radius query against real data. Includes a raw
// debug query with explicit generous pathCount/resultLimit to rule out
// an implicit default cap on total returned paths.

import { config } from "dotenv";
config({ path: ".env.local" });

import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { versionId } from "../src/lib/ids";
import { getBlastRadius } from "../src/lib/queries/blast-radius";

async function main() {
  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  const compromisedId = versionId("npm", "@tanstack/react-router", "1.169.5");

  try {
    const raw = await session.run(
      `CALL algo.SSpaths({sourceNode: $sourceNode, relTypes: ['DEPENDS_ON'], relDirection: 'incoming', maxLen: 6, pathCount: 50, resultLimit: 500})
       YIELD path
       RETURN path`,
      { sourceNode: toBoltId(compromisedId) }
    );
    console.log(`RAW result count with explicit pathCount/resultLimit: ${raw.records.length}`);
    raw.records.forEach((r) => {
      const p = r.get("path");
      console.log(`  ${p.end.properties.packageName}@${p.end.properties.semver} (${p.length} hops)`);
    });

    console.log("\n--- via getBlastRadius() (default params) ---");
    const result = await getBlastRadius(session, compromisedId, 6);
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n${result.exposedVersions.length} exposed versions, ${result.exposedServices.length} exposed services.`);
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Blast radius test failed:", err);
  process.exit(1);
});