// src/app/api/minimal-remediation/route.ts
//
// Blueprint section 3.1 / 7.2 -- the headline differentiator. Real
// greedy set-cover computation, not a canned response.

import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { getHydraDriver } from "@/lib/hydradb";
import { versionId } from "@/lib/ids";
import { getMinimalRemediation } from "@/lib/queries/minimal-remediation";

interface RequestBody {
  packageName?: unknown;
  semver?: unknown;
  maxHops?: unknown;
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { packageName, semver, maxHops } = body;

  if (typeof packageName !== "string" || packageName.trim() === "") {
    return NextResponse.json({ error: "packageName is required and must be a non-empty string." }, { status: 400 });
  }
  if (typeof semver !== "string" || semver.trim() === "") {
    return NextResponse.json({ error: "semver is required and must be a non-empty string." }, { status: 400 });
  }
  const resolvedMaxHops = maxHops === undefined ? 6 : Number(maxHops);
  if (!Number.isInteger(resolvedMaxHops) || resolvedMaxHops < 1 || resolvedMaxHops > 20) {
    return NextResponse.json({ error: "maxHops must be an integer between 1 and 20." }, { status: 400 });
  }

  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const id = versionId("npm", packageName, semver);

    const existsCheck = await session.run(
      `MATCH (v:Version {id: $id}) RETURN v.packageName AS packageName`,
      { id: neo4j.int(id) }
    );
    if (existsCheck.records.length === 0) {
      return NextResponse.json(
        { error: `No ingested Version found for ${packageName}@${semver}.` },
        { status: 404 }
      );
    }

    const result = await getMinimalRemediation(session, id, resolvedMaxHops);
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