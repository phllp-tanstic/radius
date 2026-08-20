// src/app/api/minimal-remediation/route.ts
//
// Blueprint section 3.1 / 7.2 -- the headline differentiator. Real
// greedy set-cover computation, not a canned response.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";
import { readJsonBody, requireString, requireMaxHops, requireIngestedVersion } from "@/lib/api-request";
import { getMinimalRemediation } from "@/lib/queries/minimal-remediation";

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

    const result = await getMinimalRemediation(session, version.value, maxHops.value);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Minimal remediation query failed:", error);
    return NextResponse.json(
      { error: "Minimal remediation query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
