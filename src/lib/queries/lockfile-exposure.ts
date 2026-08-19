// src/lib/queries/lockfile-exposure.ts
//
// New capability (not in original Blueprint MVP -- added deliberately,
// see chat). Given a real uploaded lockfile's resolved entries, checks
// real exposure to the ingested TanStack incident.
//
// HydraDB is the source of truth for "is this compromised" -- we query
// the real compromisedAt property already on Version nodes rather than
// re-deciding the answer against a separate static list. The name-match
// filter below only narrows which lockfile entries are even worth
// querying (mechanical, not a maliciousness determination).

import type { Session } from "neo4j-driver";
import type { LockfileEntry } from "../lockfile-parser";

export interface LockfileExposureFinding {
  packageName: string;
  installedVersion: string;
  compromised: boolean;
  compromisedAt: string | null;
  recommendedVersions: string[];
}

export async function checkLockfileExposure(
  session: Session,
  entries: LockfileEntry[],
  curatedPackageNames: Set<string>
): Promise<LockfileExposureFinding[]> {
  const relevant = entries.filter((e) => curatedPackageNames.has(e.name));
  const findings: LockfileExposureFinding[] = [];

  for (const entry of relevant) {
    const result = await session.run(
      `MATCH (v:Version {packageName: $name, semver: $version}) RETURN v.compromisedAt AS compromisedAt`,
      { name: entry.name, version: entry.version }
    );

    if (result.records.length === 0) continue; // this exact version isn't in our ingested data -- not assessable

    const compromisedAt = result.records[0].get("compromisedAt") as string;
    const isCompromised = compromisedAt !== "";

    let recommendedVersions: string[] = [];
    if (isCompromised) {
      const patched = await session.run(
        `MATCH (v:Version {packageName: $name}) WHERE v.compromisedAt = '' RETURN v.semver AS semver`,
        { name: entry.name }
      );
      recommendedVersions = patched.records.map((r) => r.get("semver") as string);
    }

    findings.push({
      packageName: entry.name,
      installedVersion: entry.version,
      compromised: isCompromised,
      compromisedAt: isCompromised ? compromisedAt : null,
      recommendedVersions,
    });
  }

  return findings;
}