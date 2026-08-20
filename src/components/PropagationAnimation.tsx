// src/components/PropagationAnimation.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

interface ExposedVersion {
  packageName: string;
  semver: string;
  hopsFromCompromise: number;
}

interface ExposedService {
  serviceName: string;
  repoName: string;
  viaPackageName: string;
  viaSemver: string;
}

interface Props {
  compromisedPackageName: string;
  compromisedSemver: string;
  exposedVersions: ExposedVersion[];
  exposedServices: ExposedService[];
}

interface PositionedNode {
  key: string;
  label: string;
  x: number;
  y: number;
  hop: number;
  kind: "source" | "version" | "service";
}

const RING_SPACING = 90;
const SOURCE_SERVICE_RING = 55; // services resolving directly to the source get their own inner ring
const SERVICE_STANDOFF = 55; // how far past their version node a service sits
const STAGE_INTERVAL_MS = 750;

function buildLayout(
  compromisedPackageName: string,
  compromisedSemver: string,
  exposedVersions: ExposedVersion[],
  exposedServices: ExposedService[]
) {
  const sourceKey = `${compromisedPackageName}@${compromisedSemver}`;
  const positions = new Map<string, PositionedNode>();

  positions.set(sourceKey, {
    key: sourceKey,
    label: compromisedPackageName,
    x: 0,
    y: 0,
    hop: 0,
    kind: "source",
  });

  const maxHop = exposedVersions.reduce((m, v) => Math.max(m, v.hopsFromCompromise), 0);

  for (let hop = 1; hop <= maxHop; hop++) {
    const atHop = exposedVersions.filter((v) => v.hopsFromCompromise === hop);
    const radius = hop * RING_SPACING;
    atHop.forEach((v, i) => {
      const angle = (2 * Math.PI * i) / Math.max(atHop.length, 1) - Math.PI / 2;
      const key = `${v.packageName}@${v.semver}`;
      positions.set(key, {
        key,
        label: v.packageName,
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        hop,
        kind: "version",
      });
    });
  }

  // Group services by which version they resolve to, so multiple services
  // on the same node fan out instead of stacking, and services resolving
  // directly to the source get their own dedicated ring (fixes the
  // degenerate angle-0 collision at the center).
  const byVia = new Map<string, ExposedService[]>();
  for (const s of exposedServices) {
    const viaKey = `${s.viaPackageName}@${s.viaSemver}`;
    if (!byVia.has(viaKey)) byVia.set(viaKey, []);
    byVia.get(viaKey)!.push(s);
  }

  const serviceNodes: Array<PositionedNode & { lineToKey: string }> = [];

  const sourceServices = byVia.get(sourceKey) ?? [];
  sourceServices.forEach((s, i) => {
    const angle = (2 * Math.PI * i) / Math.max(sourceServices.length, 1) - Math.PI / 2;
    serviceNodes.push({
      key: `service:${s.serviceName}`,
      label: s.serviceName,
      x: SOURCE_SERVICE_RING * Math.cos(angle),
      y: SOURCE_SERVICE_RING * Math.sin(angle),
      hop: 0,
      kind: "service",
      lineToKey: sourceKey,
    });
  });

  for (const [viaKey, services] of byVia) {
    if (viaKey === sourceKey) continue;
    const via = positions.get(viaKey);
    if (!via) continue;
    const baseAngle = Math.atan2(via.y, via.x);
    const radius = Math.hypot(via.x, via.y) + SERVICE_STANDOFF;
    services.forEach((s, i) => {
      const spread = services.length > 1 ? (i - (services.length - 1) / 2) * 0.35 : 0;
      const angle = baseAngle + spread;
      serviceNodes.push({
        key: `service:${s.serviceName}`,
        label: s.serviceName,
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
        hop: via.hop,
        kind: "service",
        lineToKey: viaKey,
      });
    });
  }

  return {
    source: positions.get(sourceKey)!,
    versionNodes: [...positions.values()].filter((n) => n.kind === "version"),
    serviceNodes,
    maxHop,
  };
}

export default function PropagationAnimation({
  compromisedPackageName,
  compromisedSemver,
  exposedVersions,
  exposedServices,
}: Props) {
  const layout = useMemo(
    () => buildLayout(compromisedPackageName, compromisedSemver, exposedVersions, exposedServices),
    [compromisedPackageName, compromisedSemver, exposedVersions, exposedServices]
  );

  const totalStages = layout.maxHop + 2;
  const [stage, setStage] = useState(0);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(0), 0));
    if (totalStages > 0) {
      for (let s = 1; s <= totalStages; s++) {
        timers.push(setTimeout(() => setStage(s), s * STAGE_INTERVAL_MS));
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [compromisedPackageName, compromisedSemver, exposedVersions, exposedServices, replayKey, totalStages]);

  const farthest = Math.max(
    SOURCE_SERVICE_RING,
    layout.maxHop * RING_SPACING,
    ...layout.serviceNodes.map((s) => Math.hypot(s.x, s.y))
  );
  const viewSize = farthest + 70;

  return (
    <div className="bg-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-mono text-muted tracking-wide">
          PROPAGATION — hop-by-hop from real blast-radius data
        </h2>
        <button
          onClick={() => setReplayKey((k) => k + 1)}
          className="text-xs font-mono text-muted hover:text-ink border border-hairline rounded-sm px-3 py-1 transition-colors"
        >
          Replay
        </button>
      </div>

      <svg
        viewBox={`-${viewSize} -${viewSize} ${viewSize * 2} ${viewSize * 2}`}
        className="w-full max-h-[520px] mx-auto"
        role="img"
        aria-label="Animated propagation of the compromise across the real dependency graph"
      >
        {Array.from({ length: layout.maxHop }, (_, i) => i + 1).map((hop) => (
          <circle
            key={hop}
            cx={0}
            cy={0}
            r={hop * RING_SPACING}
            fill="none"
            stroke="var(--color-hairline)"
            strokeWidth="1"
            opacity={stage >= hop ? 0.5 : 0}
            style={{ transition: "opacity 0.4s ease" }}
          />
        ))}

        {layout.versionNodes.map((n) => (
          <line
            key={`spoke-${n.key}`}
            x1={0}
            y1={0}
            x2={n.x}
            y2={n.y}
            stroke="var(--color-alert)"
            strokeWidth="1"
            opacity={stage >= n.hop ? 0.4 : 0}
            style={{ transition: "opacity 0.5s ease" }}
          />
        ))}

        {layout.serviceNodes.map((s) => {
          const via =
            s.lineToKey === layout.source.key
              ? layout.source
              : layout.versionNodes.find((v) => v.key === s.lineToKey) ?? layout.source;
          return (
            <line
              key={`svc-line-${s.key}`}
              x1={via.x}
              y1={via.y}
              x2={s.x}
              y2={s.y}
              stroke="var(--color-clear)"
              strokeWidth="1.5"
              opacity={stage >= totalStages ? 0.7 : 0}
              style={{ transition: "opacity 0.5s ease" }}
            />
          );
        })}

        {layout.versionNodes.map((n) => (
          <g key={n.key} opacity={stage >= n.hop ? 1 : 0} style={{ transition: "opacity 0.4s ease" }}>
            <circle cx={n.x} cy={n.y} r={6} fill="var(--color-alert)" />
            <text
              x={n.x}
              y={n.y - 14}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fill="var(--color-muted)"
            >
              {n.label.replace("@tanstack/", "")}
            </text>
          </g>
        ))}

        {layout.serviceNodes.map((s) => (
          <g key={s.key} opacity={stage >= totalStages ? 1 : 0} style={{ transition: "opacity 0.5s ease" }}>
            <rect x={s.x - 5} y={s.y - 5} width={10} height={10} fill="var(--color-clear)" rx={2} />
            <text
              x={s.x}
              y={s.y - 12}
              textAnchor="middle"
              fontSize="9"
              fontFamily="var(--font-mono)"
              fill="var(--color-clear)"
            >
              {s.label}
            </text>
          </g>
        ))}

        <g>
          <circle cx={0} cy={0} r={9} fill="var(--color-alert)" />
          <circle cx={0} cy={0} r={9} fill="none" stroke="var(--color-alert)" strokeWidth="1" opacity="0.6">
            <animate attributeName="r" values="9;15;9" dur="1.6s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.6;0;0.6" dur="1.6s" repeatCount="indefinite" />
          </circle>
          <text x={0} y={22} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--color-ink)">
            {compromisedPackageName.replace("@tanstack/", "")}
          </text>
        </g>
      </svg>

      <p className="text-xs text-muted mt-4 text-center">
        Compressed for demo — the real compromise (CVE-2026-45321) spread across this graph
        in about 6 minutes.
      </p>
    </div>
  );
}