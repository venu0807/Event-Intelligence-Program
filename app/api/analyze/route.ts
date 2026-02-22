/**
 * POST /api/analyze
 *
 * Full pipeline:
 *   1. Verify auth
 *   2. Fetch news from NewsAPI
 *   3. Classify articles (deterministic — lib/classifier)
 *   4. Generate AI summary (Gemini — lib/gemini)
 *   5. Persist to MySQL inside a single transaction
 *   6. Return full result to dashboard
 */

import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { fetchLatestNews } from "@/lib/newsapi";
import { classifyArticles } from "@/lib/classifier";
import { generateExecutiveSummary } from "@/lib/gemini";
import db from "@/lib/db";

export const maxDuration = 60; // Vercel: allow up to 60s for this route
function buildGeminiFallback(err: unknown): string {
  const msg = err instanceof Error ? err.message.toLowerCase() : "";

  if (msg.includes("api_key_invalid") || msg.includes("api key not valid")) {
    return "AI summary unavailable: GEMINI_API_KEY is invalid. Generate a new key in Google AI Studio and update .env.local.";
  }

  if (msg.includes("not found") && msg.includes("models/")) {
    return "AI summary unavailable: GEMINI_MODEL is unavailable for this API key. Update GEMINI_MODEL in .env.local.";
  }

  if (msg.includes("quota") || msg.includes("rate limit")) {
    return "AI summary unavailable: Gemini quota/rate limit reached. Retry later; risk scoring is unaffected.";
  }

  return "AI summary temporarily unavailable. The risk scoring above is unaffected. Check GEMINI_API_KEY, GEMINI_MODEL, and Gemini API access.";
}

export async function POST() {
  // ── 1. Auth ───────────────────────────────────────────────────────
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    // ── 2. Fetch news ──────────────────────────────────────────────
    const rawArticles = await fetchLatestNews();

    if (rawArticles.length === 0) {
      return NextResponse.json(
        { error: "NewsAPI returned no articles. Verify your NEWS_API_KEY and daily quota." },
        { status: 502 }
      );
    }

    // ── 3. Classify (deterministic, no AI) ────────────────────────
    const assessment = classifyArticles(rawArticles);

    // ── 4. Gemini AI summary ───────────────────────────────────────
    let aiSummary: string;
    try {
      aiSummary = await generateExecutiveSummary(assessment);
    } catch (geminiErr) {
      const geminiMessage = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      console.error("[analyze] Gemini failed:", geminiMessage);
      aiSummary = buildGeminiFallback(geminiErr);
    }

    // ── 5. Persist — single MySQL transaction ─────────────────────
    const conn = await db.getConnection();
    let assessmentId: number;

    try {
      await conn.beginTransaction();

      // Insert assessment row
      const [aResult]: any = await conn.query(
        `INSERT INTO impact_assessments
           (triggered_by, overall_score, impact_level, dominant_category,
            category_breakdown, article_count, ai_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user.userId,
          assessment.overallScore,
          assessment.impactLevel,
          assessment.dominantCategory,
          JSON.stringify(assessment.categoryBreakdown),
          assessment.articles.length,
          aiSummary,
        ]
      );
      assessmentId = aResult.insertId as number;

      // Insert individual events and link to this assessment
      for (const article of assessment.articles) {
        const publishedDate = article.publishedAt
          ? new Date(article.publishedAt).toISOString().slice(0, 19).replace("T", " ")
          : null;

        const [eResult]: any = await conn.query(
          `INSERT INTO events
             (title, description, source_name, url, published_at,
              risk_category, article_score, keyword_matches)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            article.title.slice(0, 999),
            article.description?.slice(0, 2000) ?? null,
            article.source,
            article.url?.slice(0, 2000) ?? null,
            publishedDate,
            article.riskCategory,
            article.articleScore,
            JSON.stringify(article.keywordMatches),
          ]
        );

        await conn.query(
          "INSERT INTO assessment_events (assessment_id, event_id) VALUES (?, ?)",
          [assessmentId, eResult.insertId]
        );
      }

      await conn.commit();
    } catch (dbErr) {
      await conn.rollback();
      throw dbErr;
    } finally {
      conn.release();
    }

    // ── 6. Return result ──────────────────────────────────────────
    return NextResponse.json({
      assessmentId,
      overallScore     : assessment.overallScore,
      impactLevel      : assessment.impactLevel,
      dominantCategory : assessment.dominantCategory,
      categoryBreakdown: assessment.categoryBreakdown,
      articleCount     : assessment.articles.length,
      aiSummary,
      articles: assessment.articles.map((a) => ({
        title        : a.title,
        description  : a.description,
        source       : a.source,
        url          : a.url,
        publishedAt  : a.publishedAt,
        riskCategory : a.riskCategory,
        articleScore : a.articleScore,
      })),
    });
  } catch (err) {
    console.error("[POST /api/analyze]", err);
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
