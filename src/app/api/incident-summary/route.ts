// src/app/api/incident-summary/route.ts
//
// Re-runs the real, already-proven blast-radius and minimal-remediation
// queries server-side -- never trusts a client-supplied summary of the
// data, since that would let the LLM narrate a tampered payload instead
// of the graph's real, verified output.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";
import { readJsonBody, requireString, requireIngestedVersion } from "@/lib/api-request";
import { getBlastRadius } from "@/lib/queries/blast-radius";
import { getMinimalRemediation } from "@/lib/queries/minimal-remediation";
import { generateIncidentSummary } from "@/lib/explainer";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const packageName = requireString(body.value, "packageName");
  if (!packageName.ok) return packageName.response;
  const semver = requireString(body.value, "semver");
  if (!semver.ok) return semver.response;

  const session = getSession();

  try {
    const version = await requireIngestedVersion(session, packageName.value, semver.value);
    if (!version.ok) return version.response;

    const blastRadius = await getBlastRadius(session, version.value, 6);
    const remediation = await getMinimalRemediation(session, version.value, 6);

    const summary = await generateIncidentSummary({
      compromisedPackageName: packageName.value,
      compromisedSemver: semver.value,
      exposedVersions: blastRadius.exposedVersions,
      exposedServices: blastRadius.exposedServices,
      remediationSteps: remediation.steps.map((s) => ({
        packageName: s.packageName,
        currentlyCompromisedVersion: s.semver,
        recommendedUpgradeVersions: s.recommendedUpgradeVersions,
        servicesCleared: s.servicesCleared,
      })),
    });

    return NextResponse.json({ summary });
  } catch (error) {
    console.error("Incident summary failed:", error);
    return NextResponse.json(
      { error: "Incident summary failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
