// src/app/api/blast-radius/route.ts
//
// Blueprint section 7, query 1. Given a compromised package + version,
// returns real transitive exposure via algo.SSpaths — not mocked data.
//
// POST body: { packageName: string, semver: string, maxHops?: number }

import { NextRequest, NextResponse } from "next/server";
import neo4j from "neo4j-driver";
import { getHydraDriver } from "@/lib/hydradb";
import { versionId } from "@/lib/ids";
import { getBlastRadius } from "@/lib/queries/blast-radius";

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

    // Confirm the version actually exists before traversing — a
    // nonexistent id would otherwise just silently return zero results,
    // which looks identical to "exists but nothing depends on it."
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

    const result = await getBlastRadius(session, id, resolvedMaxHops);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Blast radius query failed:", error);
    return NextResponse.json(
      { error: "Blast radius query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}