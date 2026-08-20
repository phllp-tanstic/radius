// src/app/api/resolution-window/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";
import { readJsonBody, requireString } from "@/lib/api-request";
import { getResolutionWindowAudit } from "@/lib/queries/resolution-window";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const packageName = requireString(body.value, "packageName");
  if (!packageName.ok) return packageName.response;
  const semver = requireString(body.value, "semver");
  if (!semver.ok) return semver.response;

  const session = getSession();

  try {
    const hits = await getResolutionWindowAudit(session, packageName.value, semver.value);
    return NextResponse.json({ packageName: packageName.value, semver: semver.value, hits });
  } catch (error) {
    console.error("Resolution-window query failed:", error);
    return NextResponse.json(
      { error: "Resolution-window query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
