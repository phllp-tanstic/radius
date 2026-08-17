// scripts/fetch-npm-metadata.ts
//
// Pulls real package metadata from the public npm registry for the 42
// TanStack-incident packages (Blueprint section 8's "curated slice").
// Caches the raw response to disk so we don't hammer the registry on
// every ingestion run, and so the ingestion step itself works from a
// stable, inspectable snapshot rather than a live network call each time.

import { writeFile, mkdir } from "node:fs/promises";
import { TANSTACK_AFFECTED_PACKAGES } from "../src/data/tanstack-incident";

interface NpmVersionEntry {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface NpmRegistryDoc {
  name: string;
  versions: Record<string, NpmVersionEntry>;
  time: Record<string, string>;
  maintainers?: Array<{ name: string; email?: string }>;
  repository?: { url?: string } | string;
}

async function fetchPackage(name: string): Promise<NpmRegistryDoc> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`npm registry returned ${res.status} for ${name}`);
  }
  return res.json();
}

async function main() {
  const results: Record<string, NpmRegistryDoc> = {};

  for (const pkg of TANSTACK_AFFECTED_PACKAGES) {
    process.stdout.write(`Fetching ${pkg.name}... `);
    try {
      results[pkg.name] = await fetchPackage(pkg.name);
      console.log("ok");
    } catch (err) {
      console.log("FAILED:", err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  await mkdir("data/cache", { recursive: true });
  await writeFile("data/cache/npm-metadata.json", JSON.stringify(results, null, 2));

  const succeeded = Object.keys(results).length;
  console.log(`\nDone: ${succeeded}/${TANSTACK_AFFECTED_PACKAGES.length} packages cached to data/cache/npm-metadata.json`);
}

main().catch((err) => {
  console.error("Fetch failed:", err);
  process.exit(1);
});