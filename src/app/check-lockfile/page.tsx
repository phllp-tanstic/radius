// src/app/check-lockfile/page.tsx
"use client";

import { useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";

interface Finding {
  packageName: string;
  installedVersion: string;
  compromised: boolean;
  compromisedAt: string | null;
  recommendedVersions: string[];
}

interface CheckResult {
  totalPackagesInLockfile: number;
  packagesCheckedAgainstIncident: number;
  exposedCount: number;
  findings: Finding[];
  scopeNote: string;
}

// A real minimal lockfile (same as test-fixtures/sample-package-lock.json)
// -- lets someone try the feature without needing their own file handy.
// Clearly labeled as a sample, not presented as a real project's data.
const SAMPLE_LOCKFILE = JSON.stringify(
  {
    name: "test-project",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "test-project", version: "1.0.0" },
      "node_modules/@tanstack/react-router": { version: "1.169.5" },
      "node_modules/@tanstack/history": { version: "1.161.13" },
      "node_modules/left-pad": { version: "1.3.0" },
    },
  },
  null,
  2
);

export default function CheckLockfilePage() {
  const [content, setContent] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setContent(reader.result as string);
    reader.readAsText(file);
  }

  async function handleCheck() {
    if (!content.trim()) {
      setError("Paste or upload a package-lock.json first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/check-lockfile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lockfileContent: content }),
      });
      const data: CheckResult & { error?: string } = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Check failed.");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-void text-ink">
      <SiteHeader active="check-lockfile" />

      <section className="mx-auto max-w-[1200px] px-8 py-10">
        <h1 className="text-2xl font-semibold mb-2">Check your lockfile</h1>
        <p className="text-sm text-muted mb-2 max-w-[640px]">
          Upload or paste a real <span className="font-mono text-ink">package-lock.json</span> (npm
          lockfileVersion 2 or 3). Radius checks every resolved package against the real,
          ingested TanStack incident (CVE-2026-45321) -- direct or transitive, since a
          lockfile already contains the full resolved tree.
        </p>
        <p className="text-xs text-muted mb-8">
          This checks exposure to the ingested incident specifically, not a general vulnerability scan.
        </p>

        <div className="flex flex-wrap gap-4 mb-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 border border-hairline text-sm font-semibold rounded-sm hover:border-muted transition-colors"
          >
            Upload package-lock.json
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => setContent(SAMPLE_LOCKFILE)}
            className="px-5 py-2.5 border border-hairline text-sm text-muted rounded-sm hover:border-muted hover:text-ink transition-colors"
          >
            Try a sample lockfile
          </button>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste package-lock.json contents here…"
          rows={10}
          className="w-full bg-panel border border-hairline rounded-sm px-4 py-3 text-xs font-mono text-muted focus:text-ink focus:outline-none focus:border-muted mb-4"
        />

        <button
          onClick={handleCheck}
          disabled={loading}
          className="px-6 py-3 bg-alert text-void font-semibold rounded-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? "Checking…" : "Check exposure"}
        </button>

        {error && (
          <div className="mt-6 border border-alert/40 bg-alert/10 text-alert text-sm px-4 py-3 rounded-sm max-w-[640px]">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-10">
            <div className="grid grid-cols-3 gap-px bg-hairline mb-px max-w-[640px]">
              <div className="bg-panel p-4">
                <div className="font-mono text-2xl">{result.totalPackagesInLockfile}</div>
                <div className="text-xs text-muted mt-1">packages in lockfile</div>
              </div>
              <div className="bg-panel p-4">
                <div className="font-mono text-2xl">{result.packagesCheckedAgainstIncident}</div>
                <div className="text-xs text-muted mt-1">checked vs. incident</div>
              </div>
              <div className="bg-panel p-4">
                <div className={`font-mono text-2xl ${result.exposedCount > 0 ? "text-alert" : "text-clear"}`}>
                  {result.exposedCount}
                </div>
                <div className="text-xs text-muted mt-1">exposed</div>
              </div>
            </div>

            {result.findings.length === 0 ? (
              <p className="text-sm text-muted mt-6">
                None of the packages in this lockfile match anything in the ingested incident data.
              </p>
            ) : (
              <div className="mt-6 space-y-px bg-hairline max-w-[720px]">
                {result.findings.map((f) => (
                  <div key={`${f.packageName}@${f.installedVersion}`} className="bg-panel p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm">
                        {f.packageName}@{f.installedVersion}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-1 rounded-sm ${
                          f.compromised ? "bg-alert/15 text-alert" : "bg-clear/15 text-clear"
                        }`}
                      >
                        {f.compromised ? "COMPROMISED" : "SAFE"}
                      </span>
                    </div>
                    {f.compromised && (
                      <div className="text-xs text-muted mt-2">
                        Compromised at {f.compromisedAt}. Recommended:{" "}
                        <span className="font-mono text-clear">
                          {f.recommendedVersions.join(", ") || "no patched version ingested"}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}