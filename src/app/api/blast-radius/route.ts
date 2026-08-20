// src/app/api/blast-radius/route.ts
//
// Blueprint section 7, query 1. Given a compromised package + version,
// returns real transitive exposure via algo.SSpaths — not mocked data.
//
// POST body: { packageName: string, semver: string, maxHops?: number }

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";
import { readJsonBody, requireString, requireMaxHops, requireIngestedVersion } from "@/lib/api-request";
import { getBlastRadius } from "@/lib/queries/blast-radius";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const packageName = requireString(body.value, "packageName");
  if (!packageName.ok) return packageName.response;
  const semver = requireString(body.value, "semver");
  if (!semver.ok) return semver.response;
  const maxHops = requireMaxHops(body.value);
  if (!maxHops.ok) return maxHops.response;

  const session = getSession();

  try {
    const version = await requireIngestedVersion(session, packageName.value, semver.value);
    if (!version.ok) return version.response;

    const result = await getBlastRadius(session, version.value, maxHops.value);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Blast radius query failed:", error);
    return NextResponse.json(
      { error: "Blast radius query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
