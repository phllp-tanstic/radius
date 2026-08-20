// src/lib/explainer.ts
//
// Blueprint section 9: the LLM's role is strictly a report-writer over
// already-computed structured results. It never performs or substitutes
// for graph traversal, and never invents exposure findings, relationships,
// or remediation decisions -- it only narrates the exact JSON it's given.

import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY environment variable.");
  }
  client = new OpenAI({ apiKey });
  return client;
}

export interface ExplainerInput {
  compromisedPackageName: string;
  compromisedSemver: string;
  exposedVersions: Array<{ packageName: string; semver: string; hopsFromCompromise: number }>;
  exposedServices: Array<{ serviceName: string; repoName: string; viaPackageName: string; viaSemver: string }>;
  remediationSteps: Array<{
    packageName: string;
    currentlyCompromisedVersion: string;
    recommendedUpgradeVersions: string[];
    servicesCleared: string[];
  }>;
}

const SYSTEM_PROMPT = `You are an incident-summary writer for Radius, a supply-chain
security tool. You will be given structured JSON that a graph database has
already computed -- exposed versions, exposed services, and a minimal
remediation plan. Your ONLY job is to narrate this exact data in plain,
direct English for a security engineer.


Strict rules:
- Never invent a package, service, version, or relationship that is not in
  the provided JSON.
- Never suggest a remediation step that is not in the provided
  remediationSteps. Each step's "currentlyCompromisedVersion" is the
  vulnerable version to move AWAY from; "recommendedUpgradeVersions" lists
  the real safe version(s) to upgrade TO. Never confuse the two.
- Do not perform your own risk assessment or speculate about severity
  beyond what the data shows.
- Keep it to 3-5 sentences. No headers, no bullet points, plain prose.
- If exposedServices is empty, say so plainly -- do not imply exposure
  that isn't in the data.`;

export async function generateIncidentSummary(input: ExplainerInput): Promise<string> {
  const openai = getClient();
  const model = process.env.OPENAI_EXPLAINER_MODEL || "gpt-4.1-mini";

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(input) },
    ],
    temperature: 0.3,
    max_tokens: 300,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new Error("Explainer returned an empty response.");
  }
  return text.trim();
}