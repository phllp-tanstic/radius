// src/app/api/versions-list/route.ts
//
// Real list of ingested Package/Version pairs, for populating the
// incident-selection UI. No hardcoded options in the frontend.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";

export async function GET() {
  const session = getSession();

  try {
    const result = await session.run(
      `MATCH (v:Version) RETURN v.packageName AS packageName, v.semver AS semver, v.compromisedAt AS compromisedAt
       ORDER BY v.packageName ASC, v.semver ASC`
    );

    const versions = result.records.map((record) => ({
      packageName: record.get("packageName") as string,
      semver: record.get("semver") as string,
      compromised: (record.get("compromisedAt") as string) !== "",
    }));

    return NextResponse.json({ versions });
  } catch (error) {
    console.error("Versions-list query failed:", error);
    return NextResponse.json(
      { error: "Versions-list query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
