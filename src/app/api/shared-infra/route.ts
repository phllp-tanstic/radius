// src/app/api/shared-infra/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";
import { readJsonBody, requireString } from "@/lib/api-request";
import { getSharedMaintainers, getSharedInfra } from "@/lib/queries/shared-infra";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const packageName = requireString(body.value, "packageName");
  if (!packageName.ok) return packageName.response;
  const semver = requireString(body.value, "semver");
  if (!semver.ok) return semver.response;

  const session = getSession();

  try {
    const sharedMaintainers = await getSharedMaintainers(session, packageName.value);
    const sharedInfra = await getSharedInfra(session, packageName.value, semver.value);
    return NextResponse.json({
      packageName: packageName.value,
      semver: semver.value,
      sharedMaintainers,
      sharedInfra,
    });
  } catch (error) {
    console.error("Shared-infra query failed:", error);
    return NextResponse.json(
      { error: "Shared-infra query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
