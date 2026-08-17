// src/app/api/health/hydradb/route.ts
//
// Real connectivity check against HydraDB — not a mock. Confirms the
// Bolt driver can open a session and execute a query end-to-end.
//
// Note: HydraDB's OpenCypher subset currently restricts RETURN to either
// <binding>.<property> projections or count(*) — no bare node returns,
// no other aggregate functions. Confirmed directly against the running
// server (see Phase 0 connectivity checks).

import { NextResponse } from "next/server";
import { getHydraDriver } from "@/lib/hydradb";

export async function GET() {
  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const result = await session.run("MATCH (n:Package) RETURN count(*) AS ok");
    const value = result.records[0]?.get("ok");

    return NextResponse.json({
      status: "connected",
      nodeCount: value?.toNumber ? value.toNumber() : value,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}