// src/lib/queries/resolution-window.ts
//
// Blueprint section 7.5: which Lockfiles had a RESOLVED edge to the bad
// version active during [compromised_at, compromised_until]. Uses real
// timestamps already loaded -- no new ingestion needed.

import type { Session } from "neo4j-driver";
import { toBoltId } from "../hydradb";
import { versionId } from "../ids";

export interface ResolutionWindowHit {
  repoName: string;
  resolvedAt: string;
}

export async function getResolutionWindowAudit(
  session: Session,
  packageName: string,
  semver: string
): Promise<ResolutionWindowHit[]> {
  const vid = versionId("npm", packageName, semver);

  const result = await session.run(
    `MATCH (l)-[r:RESOLVED]->(v:Version {id: $vid})
     WHERE r.resolvedAt >= v.compromisedAt AND r.resolvedAt <= v.compromisedUntil
     RETURN l.repoName AS repoName, r.resolvedAt AS resolvedAt`,
    { vid: toBoltId(vid) }
  );

  return result.records.map((record) => ({
    repoName: record.get("repoName") as string,
    resolvedAt: record.get("resolvedAt") as string,
  }));
}