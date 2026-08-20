// src/app/api/incident-summary/route.ts
//
// Re-runs the real, already-proven blast-radius and minimal-remediation
// queries server-side -- never trusts a client-supplied summary of the
// data, since that would let the LLM narrate a tampered payload instead
// of the graph's real, verified output.

import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { getHydraDriver } from "@/lib/hydradb";
import { versionId } from "@/lib/ids";
import { getBlastRadius } from "@/lib/queries/blast-radius";
import { getMinimalRemediation } from "@/lib/queries/minimal-remediation";
import { generateIncidentSummary } from "@/lib/explainer";

export async function POST(request: NextRequest) {
  let body: { packageName?: unknown; semver?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.packageName !== "string" || body.packageName.trim() === "") {
    return NextResponse.json({ error: "packageName is required and must be a non-empty string." }, { status: 400 });
  }
  if (typeof body.semver !== "string" || body.semver.trim() === "") {
    return NextResponse.json({ error: "semver is required and must be a non-empty string." }, { status: 400 });
  }

  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const id = versionId("npm", body.packageName, body.semver);

    const existsCheck = await session.run(
      `MATCH (v:Version {id: $id}) RETURN v.packageName AS packageName`,
      { id: neo4j.int(id) }
    );
    if (existsCheck.records.length === 0) {
      return NextResponse.json(
        { error: `No ingested Version found for ${body.packageName}@${body.semver}.` },
        { status: 404 }
      );
    }

    const blastRadius = await getBlastRadius(session, id, 6);
    const remediation = await getMinimalRemediation(session, id, 6);

    const summary = await generateIncidentSummary({
      compromisedPackageName: body.packageName,
      compromisedSemver: body.semver,
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