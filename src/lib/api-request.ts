// src/lib/api-request.ts
//
// Shared request validation for the POST routes. The messages and status
// codes below are part of the API's contract, and they previously lived as
// verbatim copies in six route files -- six places to keep in sync. They
// are single-sourced here; behaviour at each call site is unchanged.

import { NextResponse } from "next/server";
import type { Session } from "neo4j-driver";
import { toBoltId } from "./hydradb";
import { versionId } from "./ids";

export type Parsed<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

function reject(message: string, status: number): { ok: false; response: NextResponse } {
  return { ok: false, response: NextResponse.json({ error: message }, { status }) };
}

export async function readJsonBody(request: Request): Promise<Parsed<Record<string, unknown>>> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return reject("Request body must be valid JSON.", 400);
  }
}

export function requireString(body: Record<string, unknown>, field: string): Parsed<string> {
  const value = body[field];
  if (typeof value !== "string" || value.trim() === "") {
    return reject(`${field} is required and must be a non-empty string.`, 400);
  }
  return { ok: true, value };
}

/**
 * Absent maxHops falls back to the same default the query layer uses. The
 * upper bound is HydraDB's own ceiling: its admission control rejects a
 * native_path_max_len above 16 ("actual 17 exceeds limit 16"), so a larger
 * value here would be accepted only to fail as a 502 downstream.
 */
export function requireMaxHops(body: Record<string, unknown>): Parsed<number> {
  const raw = body.maxHops;
  const value = raw === undefined ? 6 : Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 16) {
    return reject("maxHops must be an integer between 1 and 16.", 400);
  }
  return { ok: true, value };
}

/**
 * Resolves a package@semver to its ingested Version id, 404ing if it isn't
 * in the graph. Without this check a nonexistent id would simply return
 * zero results, which looks identical to "exists but nothing depends on it."
 */
export async function requireIngestedVersion(
  session: Session,
  packageName: string,
  semver: string
): Promise<Parsed<number>> {
  const id = versionId("npm", packageName, semver);
  const result = await session.run(
    `MATCH (v:Version {id: $id}) RETURN v.packageName AS packageName`,
    { id: toBoltId(id) }
  );
  if (result.records.length === 0) {
    return reject(`No ingested Version found for ${packageName}@${semver}.`, 404);
  }
  return { ok: true, value: id };
}
