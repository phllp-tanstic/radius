// scripts/debug-openai-key.ts
//
// One-off: checks exactly what's being loaded for OPENAI_API_KEY from
// .env.local, without printing the full key -- to rule out whitespace,
// quotes, or a wrong/partial paste as the cause of a 401.

import { config } from "dotenv";
config({ path: ".env.local" });

const key = process.env.OPENAI_API_KEY;

if (!key) {
  console.log("OPENAI_API_KEY is not set at all (undefined).");
} else {
  console.log("Length:", key.length);
  console.log("First 12 chars:", JSON.stringify(key.slice(0, 12)));
  console.log("Last 6 chars:", JSON.stringify(key.slice(-6)));
  console.log("Contains leading/trailing whitespace:", key !== key.trim());
  console.log("Contains quote characters:", key.includes('"') || key.includes("'"));
  console.log("Contains newline:", key.includes("\n") || key.includes("\r"));
}