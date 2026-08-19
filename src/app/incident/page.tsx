// src/app/incident/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface VersionOption {
  packageName: string;
  semver: string;
  compromised: boolean;
}

interface BlastRadiusResult {
  compromisedVersionId: number;
  exposedVersions: Array<{ packageName: string; semver: string; hopsFromCompromise: number }>;
  exposedServices: Array<{ serviceName: string; repoName: string; viaPackageName: string; viaSemver: string }>;
}

interface RemediationResult {
  totalExposedServices: number;
  steps: Array<{ packageName: string; semver: string; servicesCleared: string[] }>;
}

interface TyposquatResult {
  candidates: Array<{ packageName: string; editDistance: number; downloadDisparity: number }>;
}

interface SharedInfraResult {
  sharedMaintainers: Array<{ maintainerHandle: string; otherPackageName: string }>;
  sharedInfra: Array<{ otherPackageName: string; otherSemver: string; publisherHandle: string }>;
}

interface ResolutionWindowResult {
  hits: Array<{ repoName: string; resolvedAt: string }>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

export default function IncidentPage() {
  const [versions, setVersions] = useState<VersionOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blastRadius, setBlastRadius] = useState<BlastRadiusResult | null>(null);
  const [remediation, setRemediation] = useState<RemediationResult | null>(null);
  const [typosquat, setTyposquat] = useState<TyposquatResult | null>(null);
  const [sharedInfra, setSharedInfra] = useState<SharedInfraResult | null>(null);
  const [resolutionWindow, setResolutionWindow] = useState<ResolutionWindowResult | null>(null);

  useEffect(() => {
    fetch("/api/versions-list")
      .then((res) => res.json())
      .then((data) => {
        setVersions(data.versions ?? []);
        const preferred = data.versions?.find(
          (v: VersionOption) => v.packageName === "@tanstack/react-router" && v.compromised
        );
        const fallback = data.versions?.find((v: VersionOption) => v.compromised);
        const initial = preferred ?? fallback;
        if (initial) {
          setSelected(`${initial.packageName}@${initial.semver}`);
        }
      })
      .catch(() => setError("Could not load ingested versions."));
  }, []);

  useEffect(() => {
    if (!selected) return;

    async function runQueries() {
      const [packageName, semver] = selected.split("@").length > 2
        ? [selected.slice(0, selected.lastIndexOf("@")), selected.slice(selected.lastIndexOf("@") + 1)]
        : selected.split("@");

      setLoading(true);
      setError(null);
      setBlastRadius(null);
      setRemediation(null);
      setTyposquat(null);
      setSharedInfra(null);
      setResolutionWindow(null);

      const body = { packageName, semver };

      try {
        const [br, rem, typo, infra, resWindow] = await Promise.all([
          postJson<BlastRadiusResult>("/api/blast-radius", body),
          postJson<RemediationResult>("/api/minimal-remediation", body),
          postJson<TyposquatResult>("/api/typosquat", { packageName }),
          postJson<SharedInfraResult>("/api/shared-infra", body),
          postJson<ResolutionWindowResult>("/api/resolution-window", body),
        ]);
        setBlastRadius(br);
        setRemediation(rem);
        setTyposquat(typo);
        setSharedInfra(infra);
        setResolutionWindow(resWindow);
      } catch (err) {
        setError(err instanceof Error ? err.message : "One or more queries failed.");
      } finally {
        setLoading(false);
      }
    }

    runQueries();
  }, [selected]);

  // Scoped-name-safe: package names contain "@" and "/" -- use a
  // delimiter unlikely to collide instead of naive splitting.
  const compromisedVersions = versions.filter((v) => v.compromised);

  return (
    <main className="min-h-screen bg-void text-ink">
      <header className="border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-8 py-6 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">RADIUS</Link>
          <nav className="flex gap-6 text-sm text-muted">
            <Link href="/incident" className="text-ink">Incident</Link>
            <Link href="/check-lockfile" className="hover:text-ink transition-colors">Check lockfile</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-8 py-10">
        <h1 className="text-2xl font-semibold mb-2">Trace an incident</h1>
        <p className="text-sm text-muted mb-6">
          Select a compromised version from the real ingested TanStack incident (CVE-2026-45321).
        </p>

        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-panel border border-hairline rounded-sm px-4 py-3 text-sm font-mono w-full max-w-[560px]"
        >
          <option value="" disabled>Select a compromised version…</option>
          {compromisedVersions.map((v) => (
            <option key={`${v.packageName}@${v.semver}`} value={`${v.packageName}@${v.semver}`}>
              {v.packageName}@{v.semver}
            </option>
          ))}
        </select>

        {error && (
          <div className="mt-6 border border-alert/40 bg-alert/10 text-alert text-sm px-4 py-3 rounded-sm">
            {error}
          </div>
        )}

        {loading && <div className="mt-8 text-sm text-muted font-mono">Running real graph queries…</div>}

        {!loading && blastRadius && (
          <div className="mt-10 grid gap-px bg-hairline">
            {/* Blast radius + remediation, side by side */}
            <div className="grid md:grid-cols-2 gap-px bg-hairline">
              <div className="bg-panel p-6">
                <h2 className="text-xs font-mono text-muted tracking-wide mb-4">
                  BLAST RADIUS — {blastRadius.exposedVersions.length} exposed versions, {blastRadius.exposedServices.length} services
                </h2>
                <ul className="space-y-2 mb-4">
                  {blastRadius.exposedServices.map((s) => (
                    <li key={s.serviceName} className="text-sm">
                      <span className="text-alert font-semibold">{s.serviceName}</span>
                      <span className="text-muted"> — via {s.viaPackageName}@{s.viaSemver}</span>
                    </li>
                  ))}
                  {blastRadius.exposedServices.length === 0 && (
                    <li className="text-sm text-muted">No services exposed for this version.</li>
                  )}
                </ul>
                <div className="border-t border-hairline pt-3 mt-3">
                  <p className="text-xs text-muted mb-2">Exposed versions:</p>
                  <ul className="space-y-1 font-mono text-xs text-muted">
                    {blastRadius.exposedVersions.map((v) => (
                      <li key={`${v.packageName}@${v.semver}`}>
                        {v.packageName}@{v.semver} ({v.hopsFromCompromise} hop{v.hopsFromCompromise === 1 ? "" : "s"})
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="bg-panel p-6">
                <h2 className="text-xs font-mono text-muted tracking-wide mb-4">
                  MINIMAL REMEDIATION — {remediation?.steps.length ?? 0} patch{remediation?.steps.length === 1 ? "" : "es"}
                </h2>
                {remediation?.steps.map((step, i) => (
                  <div key={i} className="mb-4 pb-4 border-b border-hairline last:border-0 last:pb-0 last:mb-0">
                    <div className="font-mono text-sm text-clear font-semibold">
                      Patch {step.packageName}@{step.semver}
                    </div>
                    <div className="text-xs text-muted mt-1">
                      Clears: {step.servicesCleared.join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Secondary risk panels */}
            <div className="grid md:grid-cols-3 gap-px bg-hairline">
              <div className="bg-panel p-6">
                <h2 className="text-xs font-mono text-muted tracking-wide mb-4">TYPOSQUAT RISK</h2>
                <ul className="space-y-2">
                  {typosquat?.candidates.slice(0, 5).map((c) => (
                    <li key={c.packageName} className="text-xs font-mono">
                      <span className="text-ink">{c.packageName}</span>
                      <span className="text-muted"> (dist {c.editDistance})</span>
                    </li>
                  ))}
                  {(!typosquat || typosquat.candidates.length === 0) && (
                    <li className="text-xs text-muted">No similarly-named packages found.</li>
                  )}
                </ul>
              </div>

              <div className="bg-panel p-6">
                <h2 className="text-xs font-mono text-muted tracking-wide mb-4">
                  SHARED INFRA — {sharedInfra?.sharedInfra.length ?? 0} versions
                </h2>
                <p className="text-xs text-muted mb-2">
                  Published via the same CI identity as this compromise.
                </p>
                <div className="text-xs font-mono text-alert">
                  {sharedInfra?.sharedInfra.length ?? 0} other versions share this publish identity
                </div>
              </div>

              <div className="bg-panel p-6">
                <h2 className="text-xs font-mono text-muted tracking-wide mb-4">RESOLUTION WINDOW</h2>
                <ul className="space-y-2">
                  {resolutionWindow?.hits.map((h) => (
                    <li key={h.repoName} className="text-xs">
                      <span className="text-alert font-mono">{h.repoName}</span>
                      <span className="text-muted"> resolved {h.resolvedAt}</span>
                    </li>
                  ))}
                  {(!resolutionWindow || resolutionWindow.hits.length === 0) && (
                    <li className="text-xs text-muted">No lockfiles resolved during the compromise window.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}