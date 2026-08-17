// src/lib/hydradb.ts
//
// Server-side only. Never import this from a client component — these
// credentials must not reach the browser.

import neo4j, { type Driver, type Integer } from "neo4j-driver";

let driver: Driver | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Returns a singleton Bolt driver instance connected to HydraDB.
 * Reuses one connection pool across the app instead of opening a
 * new connection per request.
 */
export function getHydraDriver(): Driver {
  if (driver) return driver;

  const uri = getEnv("HYDRADB_BOLT_URI");
  const token = getEnv("HYDRADB_AUTH_TOKEN");

  // HydraDB's HTTP API documents `Authorization: Bearer <token>`.
  // neo4j.auth.bearer mirrors that for Bolt. TODO: confirm this is
  // accepted once the container is actually running (Phase 0 exit
  // condition) — if the handshake rejects it, the fallback is
  // neo4j.auth.basic("token", token), which some Bolt servers use
  // to carry a bearer token through the legacy basic-auth field.
  driver = neo4j.driver(uri, neo4j.auth.bearer(token));

  return driver;
}

export async function closeHydraDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Wraps a node id for use as a Cypher query parameter. HydraDB rejects
 * ids that arrive as a Bolt Float — plain JS numbers are always packed
 * as Float by the driver, so every id must be wrapped before being sent.
 */
export function toBoltId(id: number): Integer {
  return neo4j.int(id);
}