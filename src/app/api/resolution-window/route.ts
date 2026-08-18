// src/app/api/resolution-window/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getHydraDriver } from "@/lib/hydradb";
import { getResolutionWindowAudit } from "@/lib/queries/resolution-window";

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
    const hits = await getResolutionWindowAudit(session, body.packageName, body.semver);
    return NextResponse.json({ packageName: body.packageName, semver: body.semver, hits });
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