// scripts/cleanup-test-data.ts
//
// One-off: removes the left-pad test node created by ingest-test.ts
// during Phase 0's write-pattern verification. Real ingestion data
// should be the only thing left in the graph.

import { config } from "dotenv";
config({ path: ".env.local" });

import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { packageId } from "../src/lib/ids";

async function main() {
  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const id = toBoltId(packageId("npm", "left-pad"));
    await session.run(`MATCH (p:Package {id: $id}) DETACH DELETE p`, { id });
    console.log("Removed left-pad test node (if it existed).");
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});