// scripts/debug-path-shape.ts
//
// One-off: inspect the real shape of a Path object returned by
// algo.SSpaths, so we stop guessing about .segments/.start/.properties.

import { config } from "dotenv";
config({ path: ".env.local" });

import util from "node:util";
import neo4j from "neo4j-driver";
import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { versionId } from "../src/lib/ids";

async function main() {
  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  const compromisedId = versionId("npm", "@tanstack/react-router", "1.169.5");

  try {
    const result = await session.run(
      `CALL algo.SSpaths({sourceNode: $sourceNode, relTypes: ['DEPENDS_ON'], relDirection: 'incoming', maxLen: $maxLen})
       YIELD path
       RETURN path`,
      { sourceNode: toBoltId(compromisedId), maxLen: neo4j.int(6) }
    );

    console.log(`Got ${result.records.length} records.\n`);

    if (result.records.length > 0) {
      const path = result.records[0].get("path");
      console.log(util.inspect(path, { depth: 6, colors: false }));
    }
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Debug failed:", err);
  process.exit(1);
});