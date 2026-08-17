// scripts/transform-npm-data.ts
//
// Transforms cached npm registry data into Package/Version/DEPENDS_ON
// shapes, scoped to the incident-relevant versions per package.
//
// IMPORTANT, verified directly against the live npm registry: the exact
// malicious and patched tarballs from GHSA-g7cv-rxg3-hmpx are no longer
// retrievable — npm's security team force-removed them server-side
// (confirmed: no time.unpublished record, direct per-version URL 404s),
// which goes further than a standard unpublish. The version numbers, the
// compromise window, and the CVE are all real, verified facts we keep
// exactly as documented. The dependency EDGES for those specific missing
// tarballs no longer exist publicly, so we substitute the nearest still-
// available real version's actual dependency structure, and record which
// real version we borrowed from (dependencySource) so it's disclosed and
// auditable rather than silently fabricated.

import { readFile, writeFile } from "node:fs/promises";
import { TANSTACK_AFFECTED_PACKAGES } from "../src/data/tanstack-incident";

interface NpmVersionEntry {
  dependencies?: Record<string, string>;
}

interface NpmRegistryDoc {
  name: string;
  versions: Record<string, NpmVersionEntry>;
  time: Record<string, string>;
}

interface TransformedVersion {
  packageName: string;
  ecosystem: "npm";
  semver: string;
  publishTimestamp: string | null;
  compromisedAt: string | null;
  compromisedUntil: string | null;
  dependencies: Array<{ name: string; versionRange: string }>;
  dependencySource: string | null; // set only when borrowed from a nearby real version
  role: "malicious_1" | "malicious_2" | "patched";
}

function parseSemver(v: string): [number, number, number] {
  const [core] = v.split("-"); // ignore prerelease suffixes for distance purposes
  const [major, minor, patch] = core.split(".").map((n) => parseInt(n, 10) || 0);
  return [major, minor, patch];
}

function semverDistance(a: string, b: string): number {
  const [am, an, ap] = parseSemver(a);
  const [bm, bn, bp] = parseSemver(b);
  return Math.abs(am - bm) * 1_000_000 + Math.abs(an - bn) * 1_000 + Math.abs(ap - bp);
}

function findNearestAvailableVersion(
  target: string,
  available: string[]
): string | null {
  if (available.length === 0) return null;
  return available.reduce((closest, candidate) =>
    semverDistance(candidate, target) < semverDistance(closest, target) ? candidate : closest
  );
}

async function main() {
  const raw = JSON.parse(
    await readFile("data/cache/npm-metadata.json", "utf-8")
  ) as Record<string, NpmRegistryDoc>;

  const versions: TransformedVersion[] = [];
  const borrowedFrom: string[] = [];
  const totallyMissing: string[] = [];

  for (const pkg of TANSTACK_AFFECTED_PACKAGES) {
    const doc = raw[pkg.name];
    if (!doc) {
      console.warn(`No registry data cached for ${pkg.name}`);
      continue;
    }

    const availableVersions = Object.keys(doc.versions);
    const versionsToIngest = [...pkg.affectedVersions, pkg.patchedVersion];

    for (const semver of versionsToIngest) {
      const isMalicious = (pkg.affectedVersions as string[]).includes(semver);
      let versionData = doc.versions[semver];
      let dependencySource: string | null = null;

      if (!versionData) {
        const nearest = findNearestAvailableVersion(semver, availableVersions);
        if (!nearest) {
          totallyMissing.push(`${pkg.name}@${semver}`);
          continue;
        }
        versionData = doc.versions[nearest];
        dependencySource = nearest;
        borrowedFrom.push(`${pkg.name}@${semver} -> dependencies from ${nearest}`);
      }

      versions.push({
        packageName: pkg.name,
        ecosystem: "npm",
        semver,
        publishTimestamp: doc.time[semver] ?? null,
        compromisedAt: isMalicious ? "2026-05-11T19:20:39Z" : null,
        compromisedUntil: isMalicious ? "2026-05-11T21:03:00Z" : null,
        dependencies: Object.entries(versionData.dependencies ?? {}).map(
          ([name, versionRange]) => ({ name, versionRange })
        ),
        dependencySource,
        role: semver === pkg.affectedVersions[0] ? "malicious_1"
          : semver === pkg.affectedVersions[1] ? "malicious_2"
          : "patched",
      });
    }
  }

  await writeFile(
    "data/cache/transformed-versions.json",
    JSON.stringify(versions, null, 2)
  );

  console.log(`Transformed ${versions.length} versions from ${TANSTACK_AFFECTED_PACKAGES.length} packages.`);
  console.log(`${borrowedFrom.length} used a nearest-available dependency substitute (disclosed).`);
  if (totallyMissing.length > 0) {
    console.log(`\n${totallyMissing.length} version(s) had NO available data at all (package has zero cached versions):`);
    totallyMissing.forEach((v) => console.log(`  - ${v}`));
  }

  console.log("\nSample (first entry):");
  console.log(JSON.stringify(versions[0], null, 2));

  console.log("\nFirst 5 substitutions made:");
  borrowedFrom.slice(0, 5).forEach((line) => console.log(`  - ${line}`));
}

main().catch((err) => {
  console.error("Transform failed:", err);
  process.exit(1);
});