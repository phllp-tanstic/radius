// src/app/api/typosquat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/hydradb";
import { readJsonBody, requireString } from "@/lib/api-request";
import { getTyposquatCandidates } from "@/lib/queries/typosquat";

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;

  const packageName = requireString(body.value, "packageName");
  if (!packageName.ok) return packageName.response;

  const session = getSession();

  try {
    const candidates = await getTyposquatCandidates(session, packageName.value);
    return NextResponse.json({ packageName: packageName.value, candidates });
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
