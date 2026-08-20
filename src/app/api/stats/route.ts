// src/app/api/stats/route.ts
//
// Real counts from the ingested graph, for the homepage. No hardcoded
// numbers -- if ingestion changes, these change automatically.

import { NextResponse } from "next/server";
import type { Session } from "neo4j-driver";
import { getSession, toJsNumber } from "@/lib/hydradb";

async function countLabel(session: Session, label: string): Promise<number> {
  const result = await session.run(`MATCH (n:${label}) RETURN count(*) AS c`);
  return toJsNumber(result.records[0]?.get("c")) ?? 0;
}

export async function GET() {
  const session = getSession();

  try {
    const packages = await countLabel(session, "Package");
    const versions = await countLabel(session, "Version");
    const services = await countLabel(session, "Service");
    const maintainers = await countLabel(session, "Maintainer");

    return NextResponse.json({ packages, versions, services, maintainers });
  } catch (error) {
    console.error("Stats query failed:", error);
    return NextResponse.json(
      { error: "Stats query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}
