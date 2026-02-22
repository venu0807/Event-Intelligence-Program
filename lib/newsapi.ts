/**
 * lib/newsapi.ts
 * Fetches the latest global macro-relevant news from NewsAPI.org.
 * Queries for all required keywords using OR logic.
 * Returns at most 20 clean, usable articles.
 */

import { RawArticle } from "./classifier";

const NEWS_API_BASE = "https://newsapi.org/v2/everything";

// All required keywords from the assignment spec
const QUERY = [
  "war",
  "oil",
  "inflation",
  "\"interest rates\"",
  "\"central bank\"",
  "\"supply chain\"",
  "geopolitical",
].join(" OR ");

export async function fetchLatestNews(): Promise<RawArticle[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) throw new Error("NEWS_API_KEY is not set in environment.");

  const url = new URL(NEWS_API_BASE);
  url.searchParams.set("q",        QUERY);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy",   "publishedAt");
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("apiKey",   apiKey);

  const res = await fetch(url.toString(), {
    cache  : "no-store",
    headers: { "User-Agent": "EventIntelligencePlatform/1.0" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NewsAPI HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();

  if (data.status !== "ok") {
    throw new Error(`NewsAPI error: ${data.message ?? data.status}`);
  }

  const articles = (data.articles as RawArticle[]).filter(
    (a) => a.title && a.title !== "[Removed]" && a.url
  );

  return articles.slice(0, 20);
}
