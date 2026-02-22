/**
 * lib/gemini.ts
 * Generates an executive-level macro impact brief using Google Gemini.
 * Called server-side only - API key never reaches the client.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AssessmentResult } from "./classifier";

function cleanEnv(value: string | undefined): string {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
}

function buildModelCandidates(): string[] {
  const modelFromEnv = cleanEnv(process.env.GEMINI_MODEL);
  const listFromEnv = cleanEnv(process.env.GEMINI_MODEL_CANDIDATES)
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const defaults = [
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash",
    "gemini-1.5-pro-latest",
    "gemini-1.5-pro",
  ];

  const ordered = [modelFromEnv, ...listFromEnv, ...defaults].filter(Boolean);
  const unique: string[] = [];

  for (const model of ordered) {
    if (!unique.includes(model)) unique.push(model);
  }

  return unique;
}

function shouldTryNextModel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  // Do not hide credential/permission issues.
  if (msg.includes("api_key_invalid") || msg.includes("api key not valid")) return false;
  if (msg.includes("forbidden") || msg.includes("permission")) return false;

  return (
    msg.includes("not found") ||
    msg.includes("not supported for generatecontent") ||
    msg.includes("supported methods")
  );
}

export async function generateExecutiveSummary(
  assessment: AssessmentResult
): Promise<string> {
  const apiKey = cleanEnv(process.env.GEMINI_API_KEY);
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in environment.");

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelCandidates = buildModelCandidates();

  if (modelCandidates.length === 0) {
    throw new Error("No Gemini model candidates configured.");
  }

  // Top 5 highest-scoring articles provide the richest context.
  const top5 = [...assessment.articles]
    .sort((a, b) => b.articleScore - a.articleScore)
    .slice(0, 5);

  const articleContext = top5
    .map(
      (a, i) =>
        `${i + 1}. [${a.riskCategory} | Score ${a.articleScore}] ${a.title}` +
        (a.description ? `\n   ${a.description.slice(0, 150)}` : "")
    )
    .join("\n\n");

  const breakdown = Object.entries(assessment.categoryBreakdown)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, pct]) => `${cat} ${pct}%`)
    .join(" | ");

  const prompt = `You are a senior macroeconomic intelligence analyst briefing a C-suite audience.

CURRENT RISK SNAPSHOT
---------------------
Impact Score    : ${assessment.overallScore} / 100
Impact Level    : ${assessment.impactLevel}
Dominant Risk   : ${assessment.dominantCategory}
Risk Distribution: ${breakdown}
Articles Scanned: ${assessment.articles.length}

TOP DRIVING EVENTS
------------------
${articleContext}

TASK
----
Write a 150-200 word executive intelligence brief. Structure it as three tight paragraphs:
1. What is happening and what is driving the risk level
2. Which asset classes or markets face the greatest near-term exposure
3. One concrete action implication for senior decision-makers

Rules:
- Direct declarative sentences only. No hedging, no passive voice.
- No bullet points. Pure prose.
- Do not start with "I" or refer to yourself.
- Do not repeat the score or level verbatim in the text.`;

  let lastModelError: unknown;

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      if (!text) {
        throw new Error(`Gemini returned an empty response for model \"${modelName}\".`);
      }

      return text;
    } catch (err) {
      if (shouldTryNextModel(err)) {
        lastModelError = err;
        continue;
      }
      throw err;
    }
  }

  const reason =
    lastModelError instanceof Error ? lastModelError.message : String(lastModelError ?? "Unknown model error.");

  throw new Error(
    `No compatible Gemini model available for this API key. Tried: ${modelCandidates.join(", ")}. Last error: ${reason}`
  );
}