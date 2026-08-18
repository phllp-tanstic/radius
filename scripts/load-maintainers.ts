// scripts/load-maintainers.ts
//
// Blueprint section 6: Maintainer nodes, MAINTAINS (Maintainer->Package),
// PUBLISHED_BY (Version->Maintainer) edges. All real data.
//
// Write-pattern rules confirmed from HydraDB source: MATCH followed by
// MERGE is not a recognized mutation shape -- edges between two known
// ids use a standalone MERGE with both endpoint ids inline. A plain
// MERGE cannot be followed by SET. Inside UNWIND, every SET value must
// read from the row map -- literal constants must be placed into the
// row object itself, not written inline in the SET clause.

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { getHydraDriver, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { packageId, versionId, maintainerId } from "../src/lib/ids";
import { TANSTACK_INCIDENT, TANSTACK_AFFECTED_PACKAGES } from "../src/data/tanstack-incident";

interface NpmUser {
  name: string;
  trustedPublisher?: { oidcConfigId?: string };
}

interface NpmVersionEntry {
  _npmUser?: NpmUser;
}

interface NpmRegistryDoc {
  name: string;
  versions: Record<string, NpmVersionEntry>;
  maintainers?: Array<{ name: string; email?: string }>;
}

interface TransformedVersion {
  packageName: string;
  semver: string;
  role: "malicious_1" | "malicious_2" | "patched";
  dependencySource: string | null;
}

async function main() {
  const raw = JSON.parse(
    await readFile("data/cache/npm-metadata.json", "utf-8")
  ) as Record<string, NpmRegistryDoc>;
  const versions = JSON.parse(
    await readFile("data/cache/transformed-versions.json", "utf-8")
  ) as TransformedVersion[];

  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const maintainerRows: Array<{ id: ReturnType<typeof toBoltId>; handle: string }> = [];
    const maintainsRows: Array<{ id: ReturnType<typeof toBoltId>; packageName: string }> = [];
    const seenMaintainers = new Set<string>();

    for (const pkg of TANSTACK_AFFECTED_PACKAGES) {
      const doc = raw[pkg.name];
      if (!doc?.maintainers) continue;

      for (const m of doc.maintainers) {
        if (!seenMaintainers.has(m.name)) {
          seenMaintainers.add(m.name);
          maintainerRows.push({ id: toBoltId(maintainerId("npm", m.name)), handle: m.name });
        }
        maintainsRows.push({
          id: toBoltId(maintainerId("npm", m.name)),
          packageName: pkg.name,
        });
      }
    }

    await session.run(
      `UNWIND $rows AS row
       MERGE (m {id: row.id})
       SET m:Maintainer, m.handle = row.handle`,
      { rows: maintainerRows }
    );
    console.log(`Upserted ${maintainerRows.length} Maintainer nodes.`);

    for (const row of maintainsRows) {
      await session.run(
        `MERGE (m {id: $mid})-[r:MAINTAINS]->(p {id: $pid})`,
        { mid: row.id, pid: toBoltId(packageId("npm", row.packageName)) }
      );
    }
    console.log(`Upserted ${maintainsRows.length} MAINTAINS edges.`);

    let publishedByCount = 0;
    const publisherSeen = new Set<string>();

    for (const v of versions) {
      const doc = raw[v.packageName];
      if (!doc) continue;

      const isMalicious = v.role === "malicious_1" || v.role === "malicious_2";
      let npmUser: NpmUser | undefined;
      let oidcConfigId: string | null = null;

      if (isMalicious) {
        npmUser = { name: "GitHub Actions (compromised trusted publisher)" };
        oidcConfigId = TANSTACK_INCIDENT.publishMechanism.match(/oidc:[a-f0-9-]+/)?.[0] ?? null;
      } else {
        const sourceVersion = v.dependencySource ?? v.semver;
        npmUser = doc.versions[sourceVersion]?._npmUser;
      }

      if (!npmUser) continue;
      if (!oidcConfigId) oidcConfigId = npmUser.trustedPublisher?.oidcConfigId ?? null;

      const publisherHandle = npmUser.name;
      const pubId = maintainerId("npm", publisherHandle);

      if (!publisherSeen.has(publisherHandle)) {
        publisherSeen.add(publisherHandle);
        await session.run(
          `UNWIND $rows AS row
           MERGE (m {id: row.id})
           SET m:Maintainer, m.handle = row.handle, m.isPublisherIdentity = row.isPublisherIdentity`,
          { rows: [{ id: toBoltId(pubId), handle: publisherHandle, isPublisherIdentity: true }] }
        );
      }

      const vid = versionId("npm", v.packageName, v.semver);
      await session.run(
        `MERGE (v {id: $vid})-[r:PUBLISHED_BY {oidcConfigId: $oidcConfigId}]->(m {id: $mid})`,
        { vid: toBoltId(vid), mid: toBoltId(pubId), oidcConfigId: oidcConfigId ?? "" }
      );
      publishedByCount++;
    }
    console.log(`Upserted ${publishedByCount} PUBLISHED_BY edges.`);
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Load failed:", err);
  process.exit(1);
});