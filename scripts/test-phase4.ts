// scripts/test-phase4.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSession, closeHydraDriver } from "../src/lib/hydradb";
import { getTyposquatCandidates } from "../src/lib/queries/typosquat";
import { getSharedMaintainers, getSharedInfra } from "../src/lib/queries/shared-infra";
import { getResolutionWindowAudit } from "../src/lib/queries/resolution-window";

async function main() {
  const session = getSession();

  try {
    console.log("--- Typosquat candidates for @tanstack/react-start ---");
    console.log(JSON.stringify(await getTyposquatCandidates(session, "@tanstack/react-start"), null, 2));

    console.log("\n--- Shared maintainers for @tanstack/react-router ---");
    console.log(JSON.stringify(await getSharedMaintainers(session, "@tanstack/react-router"), null, 2));

    console.log("\n--- Shared infra (publish identity) for @tanstack/react-router@1.169.5 ---");
    console.log(JSON.stringify(await getSharedInfra(session, "@tanstack/react-router", "1.169.5"), null, 2));

    console.log("\n--- Resolution-window audit for @tanstack/react-router@1.169.5 ---");
    console.log(JSON.stringify(await getResolutionWindowAudit(session, "@tanstack/react-router", "1.169.5"), null, 2));
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Phase 4 test failed:", err);
  process.exit(1);
});