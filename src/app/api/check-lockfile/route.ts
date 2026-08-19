// src/app/api/check-lockfile/route.ts
//
// Blueprint-adjacent new capability (Phase 3.5, see chat): real exposure
// check against a real uploaded package-lock.json. Body: { lockfileContent: string }

import { NextRequest, NextResponse } from "next/server";
import { getHydraDriver } from "@/lib/hydradb";
import { parseLockfile } from "@/lib/lockfile-parser";
import { checkLockfileExposure } from "@/lib/queries/lockfile-exposure";
import { TANSTACK_AFFECTED_PACKAGES } from "@/data/tanstack-incident";

const CURATED_PACKAGE_NAMES = new Set(TANSTACK_AFFECTED_PACKAGES.map((p) => p.name));

export async function POST(request: NextRequest) {
  let body: { lockfileContent?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.lockfileContent !== "string" || body.lockfileContent.trim() === "") {
    return NextResponse.json({ error: "lockfileContent is required and must be a non-empty string." }, { status: 400 });
  }

  let entries;
  try {
    entries = parseLockfile(body.lockfileContent);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to parse lockfile." },
      { status: 400 }
    );
  }

  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const findings = await checkLockfileExposure(session, entries, CURATED_PACKAGE_NAMES);
    const exposed = findings.filter((f) => f.compromised);

    return NextResponse.json({
      totalPackagesInLockfile: entries.length,
      packagesCheckedAgainstIncident: findings.length,
      exposedCount: exposed.length,
      findings,
      scopeNote:
        "This checks exposure specifically to the real 2026 TanStack incident (CVE-2026-45321) that Radius has ingested -- not a general vulnerability scan.",
    });
  } catch (error) {
    console.error("Lockfile exposure check failed:", error);
    return NextResponse.json(
      { error: "Lockfile exposure check failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}