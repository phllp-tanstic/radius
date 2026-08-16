// src/lib/types.ts
//
// TypeScript representations of the Radius graph model (Blueprint §6).
// These mirror node/edge shapes as they exist in HydraDB, used across
// ingestion, query, and API layers for consistent typing.

export type Ecosystem = "npm" | "PyPI";

export interface Package {
  name: string;
  ecosystem: Ecosystem;
  registryUrl: string;
}

export interface Version {
  packageName: string;
  ecosystem: Ecosystem;
  semver: string;
  publishTimestamp: string; // ISO 8601
  publishOrigin: string | null; // CI signature / publish origin, if known
  compromisedAt: string | null; // ISO 8601, nullable — set during simulation
  compromisedUntil: string | null; // ISO 8601, nullable
}

export interface Maintainer {
  handle: string;
  publishIpRanges: string[];
  ciProvider: string | null;
}

export interface Service {
  name: string; // synthetic — represents "our systems" for the demo
}

export interface Lockfile {
  repoName: string;
  commitSha: string;
  resolvedAt: string; // ISO 8601
}

// --- Edge payloads -----------------------------------------------------
// HydraDB relationships are typed and can carry properties; these mirror
// the edge types in Blueprint §6.2.

export type DependencyKind = "prod" | "dev" | "peer";

export interface DependsOnEdge {
  kind: DependencyKind;
}

export interface ResolvedEdge {
  resolvedAt: string; // ISO 8601 — required for compromise-window queries
}