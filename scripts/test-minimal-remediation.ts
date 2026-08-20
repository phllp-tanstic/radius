// scripts/test-minimal-remediation.ts
import { config } from "dotenv";
config({ path: ".env.local" });

import { getSession, closeHydraDriver } from "../src/lib/hydradb";
import { versionId } from "../src/lib/ids";
import { getMinimalRemediation } from "../src/lib/queries/minimal-remediation";

async function main() {
  const session = getSession();

  const compromisedId = versionId("npm", "@tanstack/react-router", "1.169.5");

  try {
    const result = await getMinimalRemediation(session, compromisedId, 6);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await session.close();
    await closeHydraDriver();
  }
}

main().catch((err) => {
  console.error("Minimal remediation test failed:", err);
  process.exit(1);
});