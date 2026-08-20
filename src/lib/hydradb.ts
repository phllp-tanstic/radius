// src/lib/hydradb.ts
//
// Server-side only. Never import this from a client component — these
// credentials must not reach the browser.

import neo4j, { type Driver, type Integer, type Session } from "neo4j-driver";

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
  // neo4j.auth.bearer mirrors that for Bolt, and the running server
  // accepts it. If a future build rejects the handshake, the fallback is
  // neo4j.auth.basic("token", token), which some Bolt servers use to
  // carry a bearer token through the legacy basic-auth field.
  driver = neo4j.driver(uri, neo4j.auth.bearer(token));

  return driver;
}

/**
 * Opens a session bound to the configured graph. Every caller — API routes
 * and ingestion scripts alike — needs the same `database` binding, so it
 * lives here instead of being repeated at each call site.
 */
export function getSession(): Session {
  return getHydraDriver().session({ database: process.env.HYDRADB_GRAPH_ID });
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

/**
 * Unwraps a numeric that Bolt may deliver either as a driver `Integer`
 * (carrying `.toNumber()`) or as a plain JS number, depending on how the
 * value was written. Returns undefined when the value is absent, so
 * callers can apply their own fallback.
 */
export function toJsNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof (value as { toNumber?: unknown } | null)?.toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return undefined;
}