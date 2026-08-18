// src/app/api/shared-infra/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getHydraDriver } from "@/lib/hydradb";
import { getSharedMaintainers, getSharedInfra } from "@/lib/queries/shared-infra";

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
    const sharedMaintainers = await getSharedMaintainers(session, body.packageName);
    const sharedInfra = await getSharedInfra(session, body.packageName, body.semver);
    return NextResponse.json({
      packageName: body.packageName,
      semver: body.semver,
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