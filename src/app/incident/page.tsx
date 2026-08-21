// src/app/incident/page.tsx
"use client";

import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import PropagationAnimation from "@/components/PropagationAnimation";

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
  steps: Array<{
    packageName: string;
    semver: string;
    recommendedUpgradeVersions: string[];
    servicesCleared: string[];
  }>;
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

interface SummaryResult {
  summary: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request to ${url} failed (${res.status})`);
  }
  return res.json();
}

/**
 * Splits a "name@semver" selection back into its parts. Scoped packages
 * contain their own "@", so the split has to happen at the last one.
 */
function splitSelection(selection: string): [packageName: string, semver: string] {
  if (!selection) return ["", ""];
  const at = selection.lastIndexOf("@");
  if (at <= 0) return [selection, ""];
  return [selection.slice(0, at), selection.slice(at + 1)];
}

// Version selected on first load. Chosen because its blast radius spans
// more than one hop, which the shallower alternatives do not.
const DEFAULT_PACKAGE_NAME = "@tanstack/history";
const DEFAULT_SEMVER = "1.161.9";

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

  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    fetch("/api/versions-list")
      .then((res) => res.json())
      .then((data) => {
        setVersions(data.versions ?? []);
        // Default to a version whose blast radius actually spans multiple
        // hops -- @tanstack/history@1.161.9 exposes 10 versions across two
        // hop levels and reaches 2 services, so the landing view shows real
        // transitive traversal rather than direct dependents only.
        const preferred = data.versions?.find(
          (v: VersionOption) =>
            v.packageName === DEFAULT_PACKAGE_NAME &&
            v.semver === DEFAULT_SEMVER &&
            v.compromised
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
      const [packageName, semver] = splitSelection(selected);

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

      // Summary is best-effort and separate -- a missing/invalid OpenAI
      // key shouldn't block the core (real, required) query results above.
      setSummary(null);
      setSummaryLoading(true);
      try {
        const s = await postJson<SummaryResult>("/api/incident-summary", body);
        setSummary(s);
      } catch {
        setSummary(null); // silently omit the panel rather than surface a secondary error
      } finally {
        setSummaryLoading(false);
      }
    }

    runQueries();
  }, [selected]);

  const compromisedVersions = versions.filter((v) => v.compromised);

  const [selectedPackageName, selectedSemver] = splitSelection(selected);

  return (
    <main className="min-h-screen bg-void text-ink">
      <SiteHeader active="incident" />

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
          <div className="mt-10 space-y-px bg-hairline">
            {/* Propagation animation -- full width, built on the same real data */}
            <PropagationAnimation
              compromisedPackageName={selectedPackageName}
              compromisedSemver={selectedSemver}
              exposedVersions={blastRadius.exposedVersions}
              exposedServices={blastRadius.exposedServices}
            />

            {(summaryLoading || summary) && (
              <div className="bg-panel p-6">
                <h2 className="text-xs font-mono text-muted tracking-wide mb-4">AI INCIDENT SUMMARY</h2>
                {summaryLoading ? (
                  <p className="text-sm text-muted font-mono">Generating…</p>
                ) : (
                  <p className="text-sm text-ink leading-relaxed">{summary?.summary}</p>
                )}
              </div>
            )}

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
                    <div className="font-mono text-sm">
                      <span className="text-alert">{step.packageName}@{step.semver}</span>
                      <span className="text-muted"> → </span>
                      <span className="text-clear font-semibold">
                        {step.recommendedUpgradeVersions.join(", ") || "no patched version ingested"}
                      </span>
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