// scripts/debug-edge.ts
//
// One-off: check whether @tanstack/react-start's malicious_1 version has
// a DEPENDS_ON edge to @tanstack/react-router's malicious_1 version in
// the actually-loaded graph, and inspect react-start's stored dependency
// data to see what happened during load.

import { config } from "dotenv";
config({ path: ".env.local" });

import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { versionId } from "../src/lib/ids";
import { readFile } from "node:fs/promises";

async function main() {
  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  const reactStartId = versionId("npm", "@tanstack/react-start", "1.167.68");
  const reactRouterId = versionId("npm", "@tanstack/react-router", "1.169.5");

  try {
    // Does the edge exist in HydraDB?
    const edgeCheck = await session.run(
      `MATCH (a {id: $a})-[r:DEPENDS_ON]->(b {id: $b}) RETURN r.kind AS kind`,
      { a: toBoltId(reactStartId), b: toBoltId(reactRouterId) }
    );
    console.log(`Edge react-start -> react-router exists in HydraDB: ${edgeCheck.records.length > 0}`);

    // What outgoing DEPENDS_ON edges does react-start actually have?
    const outgoing = await session.run(
      `MATCH (a {id: $a})-[:DEPENDS_ON]->(b) RETURN b.packageName AS name, b.semver AS semver`,
      { a: toBoltId(reactStartId) }
    );
    console.log(`\nreact-start@1.167.68's outgoing DEPENDS_ON edges in HydraDB (${outgoing.records.length}):`);
    outgoing.records.forEach((r) => console.log(`  -> ${r.get("name")}@${r.get("semver")}`));

    // What does our transformed data say react-start's dependencies were?
    const versions = JSON.parse(await readFile("data/cache/transformed-versions.json", "utf-8"));
    const reactStartEntry = versions.find(
      (v: { packageName: string; semver: string }) =>
        v.packageName === "@tanstack/react-start" && v.semver === "1.167.68"
    );
    console.log(`\ntransformed-versions.json entry for react-start@1.167.68:`);
    console.log(JSON.stringify(reactStartEntry, null, 2));
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Debug failed:", err);
  process.exit(1);
});