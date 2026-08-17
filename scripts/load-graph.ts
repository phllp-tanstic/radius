// scripts/load-graph.ts
//
// Loads transformed npm data into HydraDB as real Package/Version nodes
// and DEPENDS_ON edges. Idempotent — safe to re-run (MERGE by id).
//
// Two real constraints confirmed against the live server and driver
// source (see docs/HYDRADB_CYPHER_NOTES.md):
//   - HydraDB rejects explicit/managed transactions outright — only
//     auto-commit session.run() queries are supported.
//   - neo4j-driver >=5.28.3 has an intermittent handshake-negotiation
//     race against HydraDB; pinned to 5.20.0 to avoid it entirely.
//
// DEPENDS_ON scoping: exact historical pins (e.g. "@tanstack/history":
// "1.161.6") reference versions we deliberately did not ingest (outside
// the curated incident window). Per the postmortem, every package in the
// family was bumped together in the same two publish waves, so we connect
// same-wave versions across packages instead of chasing the literal exact
// pin — a disclosed, documented modeling choice, not a silent guess.

import { config } from "dotenv";
config({ path: ".env.local" });

import { type Integer } from "neo4j-driver";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { packageId, versionId } from "../src/lib/ids";

interface TransformedVersion {
  packageName: string;
  ecosystem: "npm";
  semver: string;
  publishTimestamp: string | null;
  compromisedAt: string | null;
  compromisedUntil: string | null;
  dependencies: Array<{ name: string; versionRange: string }>;
  dependencySource: string | null;
  role: "malicious_1" | "malicious_2" | "patched";
}

function dependsOnEdgeId(sourceId: number, targetId: number): number {
  const hash = createHash("sha256").update(`depends_on:${sourceId}:${targetId}`).digest();
  let id = 0;
  for (let i = 0; i < 6; i++) id = id * 256 + hash[i];
  return id;
}

async function main() {
  const versions: TransformedVersion[] = JSON.parse(
    await readFile("data/cache/transformed-versions.json", "utf-8")
  );

  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    // --- 1. Package nodes ---------------------------------------------
    const packageRows = [...new Set(versions.map((v) => v.packageName))].map((name) => ({
      id: toBoltId(packageId("npm", name)),
      name,
      ecosystem: "npm",
      registryUrl: `https://registry.npmjs.org/${name}`,
    }));

    await session.run(
      `UNWIND $rows AS row
       MERGE (p {id: row.id})
       SET p:Package, p.name = row.name, p.ecosystem = row.ecosystem, p.registryUrl = row.registryUrl`,
      { rows: packageRows }
    );
    console.log(`Upserted ${packageRows.length} Package nodes.`);

    // --- 2. Version nodes -----------------------------------------------
    const versionRows = versions.map((v) => ({
      id: toBoltId(versionId("npm", v.packageName, v.semver)),
      packageName: v.packageName,
      ecosystem: "npm",
      semver: v.semver,
      publishTimestamp: v.publishTimestamp ?? "",
      compromisedAt: v.compromisedAt ?? "",
      compromisedUntil: v.compromisedUntil ?? "",
    }));

    await session.run(
      `UNWIND $rows AS row
       MERGE (v {id: row.id})
       SET v:Version, v.packageName = row.packageName, v.ecosystem = row.ecosystem,
           v.semver = row.semver, v.publishTimestamp = row.publishTimestamp,
           v.compromisedAt = row.compromisedAt, v.compromisedUntil = row.compromisedUntil`,
      { rows: versionRows }
    );
    console.log(`Upserted ${versionRows.length} Version nodes.`);

    // --- 3. DEPENDS_ON edges, connected by release wave (see header) ---
    const byPackage = new Map<string, TransformedVersion[]>();
    for (const v of versions) {
      if (!byPackage.has(v.packageName)) byPackage.set(v.packageName, []);
      byPackage.get(v.packageName)!.push(v);
    }

    const edgeRows: Array<{
      id: Integer;
      sourceId: Integer;
      targetId: Integer;
      kind: string;
    }> = [];
    let skippedExternal = 0;

    for (const source of versions) {
      const sourceId = versionId("npm", source.packageName, source.semver);
      const depNames = new Set(source.dependencies.map((d) => d.name));

      for (const depName of depNames) {
        const candidates = byPackage.get(depName);
        if (!candidates) {
          skippedExternal++;
          continue;
        }
        const match = candidates.find((c) => c.role === source.role);
        if (!match) continue;

        const targetId = versionId("npm", match.packageName, match.semver);
        edgeRows.push({
          id: toBoltId(dependsOnEdgeId(sourceId, targetId)),
          sourceId: toBoltId(sourceId),
          targetId: toBoltId(targetId),
          kind: "prod",
        });
      }
    }

    if (edgeRows.length > 0) {
      await session.run(
        `UNWIND $rows AS row
         MATCH (s:Version {id: row.sourceId}), (t:Version {id: row.targetId})
         MERGE (s)-[r:DEPENDS_ON {id: row.id}]->(t)
         SET r.kind = row.kind`,
        { rows: edgeRows }
      );
    }
    console.log(`Upserted ${edgeRows.length} DEPENDS_ON edges (within curated set).`);
    console.log(`Skipped ${skippedExternal} dependency references to packages outside the curated set (documented scoping decision).`);
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Load failed:", err);
  process.exit(1);
});