// src/lib/lockfile-parser.ts
//
// Parses a real npm package-lock.json (lockfileVersion 2 or 3 -- the
// flat "packages" format used by npm 7+). This format is self-contained:
// every installed package, direct or transitive, at its exact resolved
// version, in one flat map. No network calls needed to know what a
// project actually depends on.
//
// Scope: v1 (nested "dependencies" tree, npm <7) is not supported --
// explicit, honest error rather than silently parsing it wrong.

export interface LockfileEntry {
  name: string;
  version: string;
}

interface NpmLockfilePackageEntry {
  version?: string;
}

interface NpmLockfile {
  lockfileVersion?: number;
  packages?: Record<string, NpmLockfilePackageEntry>;
}

export function parseLockfile(content: string): LockfileEntry[] {
  let data: NpmLockfile;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("Could not parse file as JSON. Is this a valid package-lock.json?");
  }

  if (data.lockfileVersion !== 2 && data.lockfileVersion !== 3) {
    throw new Error(
      `Unsupported lockfileVersion: ${data.lockfileVersion ?? "missing"}. ` +
      `Radius currently supports npm lockfileVersion 2 or 3 (npm 7+). ` +
      `Regenerate your lockfile with a modern npm version and try again.`
    );
  }

  if (!data.packages) {
    throw new Error("No 'packages' field found -- is this a valid npm package-lock.json?");
  }

  const entries: LockfileEntry[] = [];
  for (const [key, value] of Object.entries(data.packages)) {
    if (key === "") continue; // root project entry, not a dependency
    if (!value.version) continue;

    const marker = "node_modules/";
    const lastIdx = key.lastIndexOf(marker);
    if (lastIdx === -1) continue;

    const name = key.slice(lastIdx + marker.length);
    entries.push({ name, version: value.version });
  }

  return entries;
}