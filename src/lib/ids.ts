// src/lib/ids.ts
//
// HydraDB node ids must be non-negative integers, and MERGE matches on
// id alone. We derive ids deterministically from natural keys so that
// re-running ingestion always assigns the same id to the same real-world
// entity — no separate id-mapping store needed, and re-runs are safe.

import { createHash } from "node:crypto";

function deterministicId(naturalKey: string): number {
  const hash = createHash("sha256").update(naturalKey).digest();
  // First 6 bytes (48 bits) stays safely within Number.MAX_SAFE_INTEGER
  // (2^53 - 1) — ~281 trillion possible values, effectively collision-free
  // at the scale of a curated ingestion slice.
  let id = 0;
  for (let i = 0; i < 6; i++) {
    id = id * 256 + hash[i];
  }
  return id;
}

export function packageId(ecosystem: string, name: string): number {
  return deterministicId(`package:${ecosystem}:${name}`);
}

export function versionId(ecosystem: string, name: string, semver: string): number {
  return deterministicId(`version:${ecosystem}:${name}:${semver}`);
}

export function maintainerId(ecosystem: string, handle: string): number {
  return deterministicId(`maintainer:${ecosystem}:${handle}`);
}

export function serviceId(name: string): number {
  return deterministicId(`service:${name}`);
}

export function lockfileId(repoName: string, commitSha: string): number {
  return deterministicId(`lockfile:${repoName}:${commitSha}`);
}