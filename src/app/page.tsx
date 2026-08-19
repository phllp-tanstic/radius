// src/app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Stats {
  packages: number;
  versions: number;
  services: number;
  maintainers: number;
}

function BlastRadiusGraphic() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const dots = svg.querySelectorAll<SVGCircleElement>("[data-dot]");
    const rings = svg.querySelectorAll<SVGCircleElement>("[data-ring]");

    let frame = 0;
    let raf: number;

    function animate() {
      frame += 1;
      const t = (frame % 240) / 240; // 0 -> 1 loop

      rings.forEach((ring, i) => {
        const delay = i * 0.18;
        const local = ((t - delay) % 1 + 1) % 1;
        const scale = 0.15 + local * 1.05;
        const opacity = local < 0.08 ? local / 0.08 : Math.max(0, 1 - local);
        ring.setAttribute("r", String(20 * scale));
        ring.setAttribute("opacity", String(opacity * 0.55));
      });

      dots.forEach((dot, i) => {
        const dotDelay = 0.1 + i * 0.09;
        const local = ((t - dotDelay) % 1 + 1) % 1;
        const lit = local < 0.55;
        dot.setAttribute("fill", lit ? "var(--color-alert)" : "var(--color-hairline)");
        dot.setAttribute("opacity", lit ? "1" : "0.5");
      });

      raf = requestAnimationFrame(animate);
    }

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Source node + concentric dots at increasing radius, roughly evenly spaced.
  const dotPositions: Array<[number, number]> = [
    [70, -40], [95, 10], [80, 60], [30, 85], [-25, 80],
    [-70, 45], [-90, -5], [-65, -55], [-15, -85], [40, -75],
    [120, -70], [140, 30], [-40, 130], [-140, 10], [-110, -90],
  ];

  return (
    <svg
      ref={svgRef}
      viewBox="-200 -200 400 400"
      className="w-full h-full"
      role="img"
      aria-label="Animated diagram of a compromise propagating through a dependency graph"
    >
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} data-ring cx="0" cy="0" r="20" fill="none" stroke="var(--color-alert)" strokeWidth="1.5" />
      ))}
      {dotPositions.map(([x, y], i) => (
        <circle key={i} data-dot cx={x} cy={y} r="4" fill="var(--color-hairline)" />
      ))}
      <circle cx="0" cy="0" r="8" fill="var(--color-alert)" />
      <circle cx="0" cy="0" r="8" fill="none" stroke="var(--color-alert)" strokeWidth="1" opacity="0.6">
        <animate attributeName="r" values="8;13;8" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => setStats(null));
  }, []);

  return (
    <main className="min-h-screen bg-void text-ink">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-8 py-20 lg:py-28 flex flex-col lg:flex-row gap-12 lg:gap-8 items-center">
          <div className="flex flex-col justify-between w-full lg:w-[45%] space-y-10 order-2 lg:order-1">
            <div className="space-y-2 text-xs font-mono text-muted tracking-wide">
              <p>GRAPH-NATIVE</p>
              <p>INCIDENT RESPONSE</p>
            </div>

            <div>
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[0.95] mb-6">
                Know your blast radius<br />before it knows you.
              </h1>
              <p className="text-base text-muted leading-relaxed max-w-[440px]">
                The instant a package is flagged compromised, Radius tells you exactly
                what&apos;s exposed, the smallest fix that clears it, and shows the whole
                thing spreading across your dependency graph in real time.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                href="/incident"
                className="px-6 py-3 bg-alert text-void font-semibold rounded-sm hover:opacity-90 transition-opacity"
              >
                Trace an incident
              </Link>
              <Link
                href="/check-lockfile"
                className="px-6 py-3 border border-hairline text-ink font-semibold rounded-sm hover:border-muted transition-colors"
              >
                Check your lockfile
              </Link>
            </div>
          </div>

          <div className="w-full lg:w-[55%] aspect-square max-w-[480px] order-1 lg:order-2">
            <BlastRadiusGraphic />
          </div>
        </div>
      </section>

      {/* Stats strip -- real data */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-[1200px] px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "PACKAGES INGESTED", value: stats?.packages },
            { label: "VERSIONS TRACKED", value: stats?.versions },
            { label: "SERVICES MONITORED", value: stats?.services },
            { label: "MAINTAINERS MAPPED", value: stats?.maintainers },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="font-mono text-3xl md:text-4xl text-ink">
                {stat.value ?? "—"}
              </div>
              <div className="text-xs text-muted tracking-wide mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-[1200px] px-8 py-20">
        <h2 className="text-xs font-mono text-muted tracking-wide mb-4">CAPABILITIES</h2>
        <div className="grid md:grid-cols-3 gap-px bg-hairline">
          {[
            {
              title: "Minimal remediation",
              body: "The smallest set of upgrades that clears the most exposure — not just a list of what's affected.",
            },
            {
              title: "Real-time propagation",
              body: "Watch a compromise spread hop-by-hop across the real dependency graph, live.",
            },
            {
              title: "Bring your own lockfile",
              body: "Upload a real package-lock.json and check your own exposure against the ingested incident.",
            },
            {
              title: "Typosquat detection",
              body: "Name-distance and download-disparity ranking surfaces risk a single-hop scanner would miss.",
            },
            {
              title: "Shared-infra detection",
              body: "Traces shared maintainers and shared CI/publish identity across the dependency graph.",
            },
            {
              title: "Resolution-window audit",
              body: "Finds exactly which lockfiles resolved to a bad version during the compromise window.",
            },
          ].map((feature) => (
            <div key={feature.title} className="bg-void p-8">
              <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works -- a real sequence, so numbering earns its place */}
      <section className="border-t border-hairline">
        <div className="mx-auto max-w-[1200px] px-8 py-20">
          <h2 className="text-xs font-mono text-muted tracking-wide mb-10">HOW IT WORKS</h2>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { n: "01", title: "Ingest", body: "Real registry data and your services are loaded into HydraDB as a typed graph." },
              { n: "02", title: "Detect", body: "A version is marked compromised, real or simulated." },
              { n: "03", title: "Trace", body: "algo.SSpaths traverses the real dependency graph to find every exposed service." },
              { n: "04", title: "Remediate", body: "A greedy set-cover finds the smallest patch set that clears the most exposure." },
            ].map((step) => (
              <div key={step.n} className="border-l border-hairline pl-6">
                <div className="font-mono text-alert text-sm mb-3">{step.n}</div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why HydraDB */}
      <section className="border-t border-hairline bg-panel">
        <div className="mx-auto max-w-[1200px] px-8 py-16">
          <p className="font-mono text-sm text-muted leading-relaxed max-w-[720px]">
            &ldquo;Which of my systems are exposed, right now, and what&apos;s the fastest way
            to stop the bleeding&rdquo; is a multi-hop, time-sensitive graph traversal —
            not something a vector index or hand-rolled SQL can do at this speed
            or correctness. Radius runs on HydraDB&apos;s native <span className="text-ink">algo.SSpaths</span> and{" "}
            <span className="text-ink">algo.MSpaths</span> for real, snapshot-consistent traversal.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-[1200px] px-8 py-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="text-xs font-mono text-muted">
            RADIUS — HACK HYDRA 2026 — TRACK 2A
          </div>
          <a
            href="https://github.com/phllp-tanstic/radius"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-ink hover:text-alert transition-colors"
          >
            View source on GitHub →
          </a>
        </div>
      </footer>
    </main>
  );
}