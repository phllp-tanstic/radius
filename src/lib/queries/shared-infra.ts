// src/lib/queries/shared-infra.ts
//
// Blueprint section 7.4: shared-maintainer / shared-infra detection.
// Real graph traversal over MAINTAINS (human co-maintainers) and
// PUBLISHED_BY (CI/publish identity) -- see scripts/load-maintainers.ts
// for why this replaces a literal SHARES_INFRA edge for our dataset.

import type { Session } from "neo4j-driver";
import { toBoltId } from "../hydradb";
import { packageId, versionId } from "../ids";

export interface SharedMaintainerResult {
  maintainerHandle: string;
  otherPackageName: string;
}

export interface SharedInfraResult {
  otherPackageName: string;
  otherSemver: string;
  publisherHandle: string;
}

export async function getSharedMaintainers(
  session: Session,
  packageName: string
): Promise<SharedMaintainerResult[]> {
  const pid = packageId("npm", packageName);

  const result = await session.run(
    `MATCH (target:Package {id: $pid})<-[:MAINTAINS]-(m:Maintainer)-[:MAINTAINS]->(other:Package)
     WHERE other.id <> $pid
     RETURN DISTINCT m.handle AS maintainerHandle, other.name AS otherPackageName`,
    { pid: toBoltId(pid) }
  );

  return result.records.map((record) => ({
    maintainerHandle: record.get("maintainerHandle") as string,
    otherPackageName: record.get("otherPackageName") as string,
  }));
}

export async function getSharedInfra(
  session: Session,
  packageName: string,
  semver: string
): Promise<SharedInfraResult[]> {
  const vid = versionId("npm", packageName, semver);

  const result = await session.run(
    `MATCH (target:Version {id: $vid})-[:PUBLISHED_BY]->(pub:Maintainer)<-[:PUBLISHED_BY]-(other:Version)
     WHERE other.id <> $vid
     RETURN DISTINCT other.packageName AS otherPackageName, other.semver AS otherSemver, pub.handle AS publisherHandle`,
    { vid: toBoltId(vid) }
  );

  return result.records.map((record) => ({
    otherPackageName: record.get("otherPackageName") as string,
    otherSemver: record.get("otherSemver") as string,
    publisherHandle: record.get("publisherHandle") as string,
  }));
}