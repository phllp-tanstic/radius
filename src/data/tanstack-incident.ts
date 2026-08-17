// src/data/tanstack-incident.ts
//
// Real historical compromise data, sourced directly from:
//   - GitHub Security Advisory GHSA-g7cv-rxg3-hmpx
//   - TanStack's official postmortem (tanstack.com/blog/npm-supply-chain-compromise-postmortem)
//   - CVE-2026-45321, CVSS 9.6 (Critical)
//
// On 2026-05-11 between 19:20–19:26 UTC, 84 malicious versions across these
// 42 real @tanstack/* npm packages were published via a compromised CI
// pipeline (pull_request_target Pwn Request + GitHub Actions cache
// poisoning + OIDC token extraction from runner memory). This is the real
// incident Blueprint section 2 and section 8 reference — not a fabricated
// scenario. Used here as the seed for Radius's compromise simulation
// (Blueprint section 8) and, later, the demo's "mark this version
// compromised" moment (Blueprint section 12).

export interface TanStackAffectedPackage {
  name: string; // real npm package name, e.g. "@tanstack/react-router"
  affectedVersions: [string, string]; // the two malicious versions published
  patchedVersion: string; // first clean follow-up release
}

export const TANSTACK_INCIDENT = {
  cve: "CVE-2026-45321",
  ghsa: "GHSA-g7cv-rxg3-hmpx",
  cvssScore: 9.6,
  compromisedAt: "2026-05-11T19:20:39Z", // first malicious publish wave
  compromisedUntil: "2026-05-11T21:03:00Z", // final batch deprecation completed
  publishMechanism: "GitHub Actions OIDC trusted publisher (oidc:db7d6f54-05d5-412b-8a10-e7a8398b303e)",
} as const;

export const TANSTACK_AFFECTED_PACKAGES: TanStackAffectedPackage[] = [
  { name: "@tanstack/arktype-adapter", affectedVersions: ["1.166.12", "1.166.15"], patchedVersion: "1.166.16" },
  { name: "@tanstack/eslint-plugin-router", affectedVersions: ["1.161.9", "1.161.12"], patchedVersion: "1.161.13" },
  { name: "@tanstack/eslint-plugin-start", affectedVersions: ["0.0.4", "0.0.7"], patchedVersion: "0.0.8" },
  { name: "@tanstack/history", affectedVersions: ["1.161.9", "1.161.12"], patchedVersion: "1.161.13" },
  { name: "@tanstack/nitro-v2-vite-plugin", affectedVersions: ["1.154.12", "1.154.15"], patchedVersion: "1.154.16" },
  { name: "@tanstack/react-router", affectedVersions: ["1.169.5", "1.169.8"], patchedVersion: "1.169.9" },
  { name: "@tanstack/react-router-devtools", affectedVersions: ["1.166.16", "1.166.19"], patchedVersion: "1.166.20" },
  { name: "@tanstack/react-router-ssr-query", affectedVersions: ["1.166.15", "1.166.18"], patchedVersion: "1.166.19" },
  { name: "@tanstack/react-start", affectedVersions: ["1.167.68", "1.167.71"], patchedVersion: "1.167.72" },
  { name: "@tanstack/react-start-client", affectedVersions: ["1.166.51", "1.166.54"], patchedVersion: "1.166.55" },
  { name: "@tanstack/react-start-rsc", affectedVersions: ["0.0.47", "0.0.50"], patchedVersion: "0.0.51" },
  { name: "@tanstack/react-start-server", affectedVersions: ["1.166.55", "1.166.58"], patchedVersion: "1.166.59" },
  { name: "@tanstack/router-cli", affectedVersions: ["1.166.46", "1.166.49"], patchedVersion: "1.166.50" },
  { name: "@tanstack/router-core", affectedVersions: ["1.169.5", "1.169.8"], patchedVersion: "1.169.9" },
  { name: "@tanstack/router-devtools", affectedVersions: ["1.166.16", "1.166.19"], patchedVersion: "1.166.20" },
  { name: "@tanstack/router-devtools-core", affectedVersions: ["1.167.6", "1.167.9"], patchedVersion: "1.167.10" },
  { name: "@tanstack/router-generator", affectedVersions: ["1.166.45", "1.166.48"], patchedVersion: "1.166.49" },
  { name: "@tanstack/router-plugin", affectedVersions: ["1.167.38", "1.167.41"], patchedVersion: "1.167.42" },
  { name: "@tanstack/router-ssr-query-core", affectedVersions: ["1.168.3", "1.168.6"], patchedVersion: "1.168.7" },
  { name: "@tanstack/router-utils", affectedVersions: ["1.161.11", "1.161.14"], patchedVersion: "1.161.15" },
  { name: "@tanstack/router-vite-plugin", affectedVersions: ["1.166.53", "1.166.56"], patchedVersion: "1.166.57" },
  { name: "@tanstack/solid-router", affectedVersions: ["1.169.5", "1.169.8"], patchedVersion: "1.169.9" },
  { name: "@tanstack/solid-router-devtools", affectedVersions: ["1.166.16", "1.166.19"], patchedVersion: "1.166.20" },
  { name: "@tanstack/solid-router-ssr-query", affectedVersions: ["1.166.15", "1.166.18"], patchedVersion: "1.166.19" },
  { name: "@tanstack/solid-start", affectedVersions: ["1.167.65", "1.167.68"], patchedVersion: "1.167.69" },
  { name: "@tanstack/solid-start-client", affectedVersions: ["1.166.50", "1.166.53"], patchedVersion: "1.166.54" },
  { name: "@tanstack/solid-start-server", affectedVersions: ["1.166.54", "1.166.57"], patchedVersion: "1.166.58" },
  { name: "@tanstack/start-client-core", affectedVersions: ["1.168.5", "1.168.8"], patchedVersion: "1.168.9" },
  { name: "@tanstack/start-fn-stubs", affectedVersions: ["1.161.9", "1.161.12"], patchedVersion: "1.161.13" },
  { name: "@tanstack/start-plugin-core", affectedVersions: ["1.169.23", "1.169.26"], patchedVersion: "1.169.27" },
  { name: "@tanstack/start-server-core", affectedVersions: ["1.167.33", "1.167.36"], patchedVersion: "1.167.37" },
  { name: "@tanstack/start-static-server-functions", affectedVersions: ["1.166.44", "1.166.47"], patchedVersion: "1.166.48" },
  { name: "@tanstack/start-storage-context", affectedVersions: ["1.166.38", "1.166.41"], patchedVersion: "1.166.42" },
  { name: "@tanstack/valibot-adapter", affectedVersions: ["1.166.12", "1.166.15"], patchedVersion: "1.166.16" },
  { name: "@tanstack/virtual-file-routes", affectedVersions: ["1.161.10", "1.161.13"], patchedVersion: "1.161.14" },
  { name: "@tanstack/vue-router", affectedVersions: ["1.169.5", "1.169.8"], patchedVersion: "1.169.9" },
  { name: "@tanstack/vue-router-devtools", affectedVersions: ["1.166.16", "1.166.19"], patchedVersion: "1.166.20" },
  { name: "@tanstack/vue-router-ssr-query", affectedVersions: ["1.166.15", "1.166.18"], patchedVersion: "1.166.19" },
  { name: "@tanstack/vue-start", affectedVersions: ["1.167.61", "1.167.64"], patchedVersion: "1.167.65" },
  { name: "@tanstack/vue-start-client", affectedVersions: ["1.166.46", "1.166.49"], patchedVersion: "1.166.50" },
  { name: "@tanstack/vue-start-server", affectedVersions: ["1.166.50", "1.166.53"], patchedVersion: "1.166.54" },
  { name: "@tanstack/zod-adapter", affectedVersions: ["1.166.12", "1.166.15"], patchedVersion: "1.166.16" },
];