// src/lib/queries/minimal-remediation.ts
//
// Blueprint section 3.1 / 7.2 — the headline differentiator. Given a
// compromised Version, finds the smallest set of Version upgrades that
// clears the most exposed Services.
//
// Real algorithm: greedy set-cover approximation (Blueprint section 14's
// explicit risk mitigation -- "a bounded, approximate solution over the
// already-returned blast-radius subgraph, not a full general graph-cover
// solver"). This is a well-established approximation algorithm for set
// cover, not an invented heuristic.
//
// Candidate patch points per service are EVERY node on that service's
// specific path back to the compromised version (not just its direct
// dependency) -- per Blueprint section 3.1's own example: "if five
// affected services all transitively share one common dependency three
// hops down, patching that one shared node resolves most of the blast
// radius at once." A node several hops up can legitimately clear several
// services in one patch; restricting candidates to only the direct
// dependency would miss exactly the case this feature exists to find.

import type { Session } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { toBoltId } from "../hydradb";
import { SSPATHS_FROM_SOURCE } from "./traversal";

interface PathChain {
  targetVersionId: number;
  packageName: string;
  semver: string;
  nodeIdsToSource: number[]; // [target, ...intermediates..., source], shortest known
  hops: number;
}

export interface RemediationStep {
  packageName: string;
  semver: string; // the compromised version being flagged for patching
  recommendedUpgradeVersions: string[]; // real, ingested non-compromised versions of this package
  servicesCleared: string[];
}

export interface MinimalRemediationResult {
  compromisedVersionId: number;
  totalExposedServices: number;
  steps: RemediationStep[]; // in selection order; applying all steps clears every exposed service
}

export async function getMinimalRemediation(
  session: Session,
  compromisedVersionId: number,
  maxHops: number = 6
): Promise<MinimalRemediationResult> {
  // --- Step 1: real traversal, keeping FULL path chains, not just endpoints ---
  const pathResult = await session.run(SSPATHS_FROM_SOURCE, {
    sourceNode: toBoltId(compromisedVersionId),
    maxLen: neo4j.int(maxHops),
  });

  const bestChainByTarget = new Map<number, PathChain>();

  for (const record of pathResult.records) {
    const path = record.get("path");
    const segments = path.segments as Array<{
      start: { identity: { toNumber: () => number }; properties: Record<string, unknown> };
      end: { identity: { toNumber: () => number }; properties: Record<string, unknown> };
    }>;
    const hops = path.length as number;
    const targetNode = path.end;
    const targetId = targetNode.identity.toNumber();

    const existing = bestChainByTarget.get(targetId);
    if (existing && existing.hops <= hops) continue;

    // segments run source -> ... -> target (SSpaths with relDirection
    // 'incoming' walks from source outward along incoming edges); collect
    // every distinct node id along the chain, target-to-source order.
    const chainIds: number[] = [];
    for (let i = segments.length - 1; i >= 0; i--) {
      chainIds.push(segments[i].end.identity.toNumber());
    }
    chainIds.push(segments[0].start.identity.toNumber()); // the source itself

    bestChainByTarget.set(targetId, {
      targetVersionId: targetId,
      packageName: targetNode.properties.packageName as string,
      semver: targetNode.properties.semver as string,
      nodeIdsToSource: chainIds,
      hops,
    });
  }

  // --- Step 2: which service resolves to which version? -----------------
  const candidateVersionIds = [compromisedVersionId, ...bestChainByTarget.keys()];
  const serviceToChain = new Map<string, number[]>(); // serviceName -> node id chain (incl. source)

  for (const vid of candidateVersionIds) {
    const result = await session.run(
      `MATCH (s)-[:USES]->(l)-[:RESOLVED]->(v {id: $vid})
       RETURN s.name AS serviceName`,
      { vid: toBoltId(vid) }
    );

    for (const record of result.records) {
      const serviceName = record.get("serviceName") as string;
      const chain = vid === compromisedVersionId
        ? [compromisedVersionId]
        : bestChainByTarget.get(vid)!.nodeIdsToSource;
      serviceToChain.set(serviceName, chain);
    }
  }

  // --- Step 3: greedy set cover -------------------------------------------
  const uncovered = new Set(serviceToChain.keys());
  const steps: RemediationStep[] = [];

  // Reverse lookup: node id -> package/semver, for reporting.
  const nodeInfo = new Map<number, { packageName: string; semver: string }>();
  for (const chain of bestChainByTarget.values()) {
    nodeInfo.set(chain.targetVersionId, { packageName: chain.packageName, semver: chain.semver });
  }
  // The compromised source's own info isn't in bestChainByTarget (it's
  // the search origin, not a discovered target) -- fetch it directly.
  const sourceInfoResult = await session.run(
    `MATCH (v {id: $id}) RETURN v.packageName AS packageName, v.semver AS semver`,
    { id: toBoltId(compromisedVersionId) }
  );
  if (sourceInfoResult.records.length > 0) {
    nodeInfo.set(compromisedVersionId, {
      packageName: sourceInfoResult.records[0].get("packageName") as string,
      semver: sourceInfoResult.records[0].get("semver") as string,
    });
  }

  while (uncovered.size > 0) {
    // Coverage count per candidate node, restricted to still-uncovered services.
    const coverage = new Map<number, string[]>();
    for (const [serviceName, chain] of serviceToChain) {
      if (!uncovered.has(serviceName)) continue;
      for (const nodeId of chain) {
        if (!coverage.has(nodeId)) coverage.set(nodeId, []);
        coverage.get(nodeId)!.push(serviceName);
      }
    }

    let bestNodeId: number | null = null;
    let bestCovered: string[] = [];
    for (const [nodeId, covered] of coverage) {
      if (covered.length > bestCovered.length) {
        bestNodeId = nodeId;
        bestCovered = covered;
      }
    }

    if (bestNodeId === null) break; // shouldn't happen, but avoid an infinite loop

    const info = nodeInfo.get(bestNodeId);
    const packageName = info?.packageName ?? "unknown";

    // Real, graph-sourced recommendation -- other ingested versions of
    // this same package with no compromise window, not an invented value.
    const upgradeResult = await session.run(
      `MATCH (v:Version {packageName: $packageName}) WHERE v.compromisedAt = '' RETURN v.semver AS semver`,
      { packageName }
    );

    steps.push({
      packageName,
      semver: info?.semver ?? "unknown",
      recommendedUpgradeVersions: upgradeResult.records.map((r) => r.get("semver") as string),
      servicesCleared: bestCovered,
    });
    for (const s of bestCovered) uncovered.delete(s);
  }

  return {
    compromisedVersionId,
    totalExposedServices: serviceToChain.size,
    steps,
  };
}