// src/app/api/typosquat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getHydraDriver } from "@/lib/hydradb";
import { getTyposquatCandidates } from "@/lib/queries/typosquat";

export async function POST(request: NextRequest) {
  let body: { packageName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.packageName !== "string" || body.packageName.trim() === "") {
    return NextResponse.json({ error: "packageName is required and must be a non-empty string." }, { status: 400 });
  }

  const driver = getHydraDriver();
  const session = driver.session({ database: process.env.HYDRADB_GRAPH_ID });

  try {
    const candidates = await getTyposquatCandidates(session, body.packageName);
    return NextResponse.json({ packageName: body.packageName, candidates });
  } catch (error) {
    console.error("Typosquat query failed:", error);
    return NextResponse.json(
      { error: "Typosquat query failed.", detail: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  } finally {
    await session.close();
  }
}