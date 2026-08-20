// src/lib/queries/blast-radius.ts
//
// Blueprint section 7, query 1: given a compromised Version, return every
// Service transitively exposed via RESOLVED -> DEPENDS_ON* paths.
//
// Real constraints confirmed against HydraDB source (opencypher.rs,
// unwind_node_id_field): ANY relationship pattern inside UNWIND (read or
// write) requires an {id: ...} predicate on BOTH endpoints. UNWIND is
// built for batch operations where both sides are already known (like our
// edge loading in load-graph.ts) -- not for "given one known id, discover
// the other side" reads. So this join uses plain per-id MATCH queries in
// a loop instead (the candidate set here is small -- dozens, not
// thousands -- so this is simple and fast enough without batching).

import type { Session } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { toBoltId } from "../hydradb";
import { SSPATHS_FROM_SOURCE } from "./traversal";

export interface ExposedVersion {
  packageName: string;
  semver: string;
  hopsFromCompromise: number;
}

export interface ExposedService {
  serviceName: string;
  repoName: string;
  viaPackageName: string;
  viaSemver: string;
}

export interface BlastRadiusResult {
  compromisedVersionId: number;
  exposedVersions: ExposedVersion[];
  exposedServices: ExposedService[];
}

export async function getBlastRadius(
  session: Session,
  compromisedVersionId: number,
  maxHops: number = 6
): Promise<BlastRadiusResult> {
  const pathResult = await session.run(SSPATHS_FROM_SOURCE, {
    sourceNode: toBoltId(compromisedVersionId),
    maxLen: neo4j.int(maxHops),
  });

  const bestByVersionId = new Map<number, ExposedVersion>();

  for (const record of pathResult.records) {
    const path = record.get("path");
    const dependentNode = path.end;
    const props = dependentNode.properties;
    const id = dependentNode.identity.toNumber();
    const hops = path.length as number;

    const existing = bestByVersionId.get(id);
    if (!existing || hops < existing.hopsFromCompromise) {
      bestByVersionId.set(id, {
        packageName: props.packageName as string,
        semver: props.semver as string,
        hopsFromCompromise: hops,
      });
    }
  }

  const exposedVersions = [...bestByVersionId.values()];
  const exposedVersionIds = [...bestByVersionId.keys()];

  const candidateIds = [compromisedVersionId, ...exposedVersionIds];

  const exposedServices: ExposedService[] = [];

  for (const vid of candidateIds) {
    const result = await session.run(
      `MATCH (s)-[:USES]->(l)-[:RESOLVED]->(v {id: $vid})
       RETURN s.name AS serviceName, l.repoName AS repoName, v.packageName AS viaPackageName, v.semver AS viaSemver`,
      { vid: toBoltId(vid) }
    );

    for (const record of result.records) {
      exposedServices.push({
        serviceName: record.get("serviceName") as string,
        repoName: record.get("repoName") as string,
        viaPackageName: record.get("viaPackageName") as string,
        viaSemver: record.get("viaSemver") as string,
      });
    }
  }

  return { compromisedVersionId, exposedVersions, exposedServices };
}