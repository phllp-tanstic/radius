// scripts/load-services.ts
//
// Synthetic "our services" layer (Blueprint section 6/8) — fictional
// company services wired via real Lockfile/RESOLVED/USES edges onto the
// real Version nodes already loaded from the TanStack incident. This is
// the deliberately-synthetic half of the graph (the Blueprint explicitly
// calls for this, since Radius needs a concrete "our systems" story), in
// contrast to the Package/Version/DEPENDS_ON data, which is entirely real.

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFile } from "node:fs/promises";
import { type Integer } from "neo4j-driver";
import { getSession, closeHydraDriver, toBoltId } from "../src/lib/hydradb";
import { versionId, serviceId, lockfileId, edgeId } from "../src/lib/ids";

interface TransformedVersion {
  packageName: string;
  semver: string;
  role: "malicious_1" | "malicious_2" | "patched";
}

interface ServiceDef {
  serviceName: string;
  repoName: string;
  commitSha: string;
  resolvedAt: string;
  packageName: string;
  role: "malicious_1" | "malicious_2" | "patched";
}

const SERVICES: ServiceDef[] = [
  { serviceName: "checkout-web", repoName: "radius-demo/checkout-web", commitSha: "a3f1c9e", resolvedAt: "2026-05-11T19:45:00Z", packageName: "@tanstack/react-router", role: "malicious_1" },
  { serviceName: "admin-dashboard", repoName: "radius-demo/admin-dashboard", commitSha: "b7d2e04", resolvedAt: "2026-05-11T20:10:00Z", packageName: "@tanstack/react-router", role: "malicious_2" },
  { serviceName: "docs-portal", repoName: "radius-demo/docs-portal", commitSha: "c9a8f31", resolvedAt: "2026-05-11T19:50:00Z", packageName: "@tanstack/react-start", role: "malicious_1" },
  { serviceName: "internal-crm", repoName: "radius-demo/internal-crm", commitSha: "d4e5b62", resolvedAt: "2026-05-11T20:02:00Z", packageName: "@tanstack/vue-router", role: "malicious_1" },
  { serviceName: "marketing-site", repoName: "radius-demo/marketing-site", commitSha: "e1f6c73", resolvedAt: "2026-05-12T09:00:00Z", packageName: "@tanstack/react-router", role: "patched" },
  { serviceName: "partner-portal", repoName: "radius-demo/partner-portal", commitSha: "f2a7d84", resolvedAt: "2026-05-12T10:30:00Z", packageName: "@tanstack/solid-start", role: "patched" },
];

async function main() {
  const versions: TransformedVersion[] = JSON.parse(
    await readFile("data/cache/transformed-versions.json", "utf-8")
  );

  const session = getSession();

  try {
    // --- Service nodes ---
    const serviceRows = SERVICES.map((s) => ({
      id: toBoltId(serviceId(s.serviceName)),
      name: s.serviceName,
    }));
    await session.run(
      `UNWIND $rows AS row
       MERGE (s {id: row.id})
       SET s:Service, s.name = row.name`,
      { rows: serviceRows }
    );
    console.log(`Upserted ${serviceRows.length} Service nodes.`);

    // --- Lockfile nodes ---
    const lockfileRows = SERVICES.map((s) => ({
      id: toBoltId(lockfileId(s.repoName, s.commitSha)),
      repoName: s.repoName,
      commitSha: s.commitSha,
      resolvedAt: s.resolvedAt,
    }));
    await session.run(
      `UNWIND $rows AS row
       MERGE (l {id: row.id})
       SET l:Lockfile, l.repoName = row.repoName, l.commitSha = row.commitSha, l.resolvedAt = row.resolvedAt`,
      { rows: lockfileRows }
    );
    console.log(`Upserted ${lockfileRows.length} Lockfile nodes.`);

    // --- USES edges: Service -> Lockfile ---
    const usesRows = SERVICES.map((s) => {
      const sId = serviceId(s.serviceName);
      const lId = lockfileId(s.repoName, s.commitSha);
      return {
        id: toBoltId(edgeId("uses", sId, lId)),
        sourceId: toBoltId(sId),
        targetId: toBoltId(lId),
      };
    });
    await session.run(
      `UNWIND $rows AS row
       MATCH (s:Service {id: row.sourceId}), (l:Lockfile {id: row.targetId})
       MERGE (s)-[r:USES {id: row.id}]->(l)`,
      { rows: usesRows }
    );
    console.log(`Upserted ${usesRows.length} USES edges.`);

    // --- RESOLVED edges: Lockfile -> Version ---
    const resolvedRows: Array<{ id: Integer; sourceId: Integer; targetId: Integer; resolvedAt: string }> = [];
    const missing: string[] = [];

    for (const s of SERVICES) {
      const version = versions.find((v) => v.packageName === s.packageName && v.role === s.role);
      if (!version) {
        missing.push(`${s.serviceName} -> ${s.packageName}@${s.role}`);
        continue;
      }
      const lId = lockfileId(s.repoName, s.commitSha);
      const vId = versionId("npm", version.packageName, version.semver);
      resolvedRows.push({
        id: toBoltId(edgeId("resolved", lId, vId)),
        sourceId: toBoltId(lId),
        targetId: toBoltId(vId),
        resolvedAt: s.resolvedAt,
      });
    }

    if (resolvedRows.length > 0) {
      await session.run(
        `UNWIND $rows AS row
         MATCH (l:Lockfile {id: row.sourceId}), (v:Version {id: row.targetId})
         MERGE (l)-[r:RESOLVED {id: row.id}]->(v)
         SET r.resolvedAt = row.resolvedAt`,
        { rows: resolvedRows }
      );
    }
    console.log(`Upserted ${resolvedRows.length} RESOLVED edges.`);
    if (missing.length > 0) {
      console.log("Missing target versions (check SERVICES config):", missing);
    }
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Load failed:", err);
  process.exit(1);
});