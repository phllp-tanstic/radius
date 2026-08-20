// scripts/ingest-test.ts
//
// Proof-of-concept: upsert one real package node and verify it persists.
// Confirms our MERGE-by-id write pattern works before we build the real
// ingestion pipeline on top of it.
//
// Constraints below are confirmed directly from HydraDB's source
// (opencypher.rs) and the neo4j-driver package source (packstream-v1.js),
// not inferred from trial and error:
//   - A standalone single-node MERGE is never valid outside UNWIND — the
//     interactive engine's MERGE handler requires an edge pattern, full stop.
//   - MERGE cannot be followed by another clause (e.g. SET) outside UNWIND.
//   - Plain JS numbers are always sent as Bolt Float; node ids must be
//     wrapped with neo4j.int() to arrive as a real integer.

import { config } from "dotenv";
config({ path: ".env.local" });

import neo4j from "neo4j-driver";
import { getSession, closeHydraDriver } from "../src/lib/hydradb";
import { packageId } from "../src/lib/ids";

async function main() {
  const session = getSession();

  const id = packageId("npm", "left-pad");

  try {
    await session.run(
      `UNWIND $rows AS row
       MERGE (n {id: row.id})
       SET n:Package, n.name = row.name, n.ecosystem = row.ecosystem, n.registryUrl = row.registryUrl`,
      {
        rows: [
          {
            id: neo4j.int(id),
            name: "left-pad",
            ecosystem: "npm",
            registryUrl: "https://registry.npmjs.org/left-pad",
          },
        ],
      }
    );

    const result = await session.run(
      `MATCH (p:Package {id: $id}) RETURN p.name AS name, p.ecosystem AS ecosystem`,
      { id: neo4j.int(id) }
    );

    console.log("Upserted and verified package:", result.records[0]?.toObject());
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Ingest test failed:", err);
  process.exit(1);
});