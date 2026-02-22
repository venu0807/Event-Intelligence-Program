/**
 * lib/classifier.ts
 * ─────────────────────────────────────────────────────────────────
 * Deterministic backend risk classifier. Zero AI involvement.
 *
 * Pipeline per article:
 *   1. Keyword matching  → assign risk category
 *   2. Severity scan     → compute severity boost
 *   3. Score formula     → articleScore = categoryWeight × 60 + severityBoost
 *
 * Pipeline for batch:
 *   4. Weighted average  → overallScore
 *   5. Threshold mapping → impactLevel (LOW / MEDIUM / HIGH)
 * ─────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────

export type RiskCategory =
  | "Geopolitical"
  | "Monetary"
  | "Commodity"
  | "SupplyChain"
  | "General";

export type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";

export interface RawArticle {
  title      : string;
  description: string | null;
  source     : { name: string } | string;
  url        : string;
  publishedAt: string;
}

export interface ClassifiedArticle {
  title          : string;
  description    : string;
  source         : string;
  url            : string;
  publishedAt    : string;
  riskCategory   : RiskCategory;
  articleScore   : number;
  keywordMatches : Partial<Record<RiskCategory, string[]>>;
}

export interface CategoryBreakdown {
  Geopolitical: number;
  Monetary    : number;
  Commodity   : number;
  SupplyChain : number;
  General     : number;
}

export interface AssessmentResult {
  overallScore      : number;
  impactLevel       : ImpactLevel;
  dominantCategory  : RiskCategory;
  categoryBreakdown : CategoryBreakdown;
  articles          : ClassifiedArticle[];
}

// ─── Keyword Dictionaries ─────────────────────────────────────────

const KEYWORDS: Record<RiskCategory, string[]> = {
  Geopolitical: [
    "war", "conflict", "sanction", "geopolitic", "military", "coup",
    "invasion", "nuclear", "treaty", "nato", "terrorism", "ceasefire",
    "troops", "missile", "airstrike", "alliance", "diplomatic crisis",
    "political instability", "rebel", "insurgency", "annexation",
  ],
  Monetary: [
    "inflation", "interest rate", "central bank", "federal reserve",
    "fed rate", "ecb", "monetary policy", "rate hike", "rate cut",
    "quantitative easing", "currency", "deflation", "stagflation",
    "bond yield", "treasury", "repo rate", "liquidity",
  ],
  Commodity: [
    "oil", "gold", "commodity", "energy", "crude oil", "brent",
    "opec", "fuel", "copper", "wheat", "food price", "grain",
    "natural gas", "lng", "rare earth", "silver", "coffee",
  ],
  SupplyChain: [
    "supply chain", "logistics", "shortage", "disruption", "trade war",
    "tariff", "import ban", "export ban", "shipping", "port",
    "semiconductor", "chip shortage", "freight", "factory shutdown",
    "manufacturing", "inventory", "bottleneck",
  ],
  General: [],
};

// Base weight per category — Geopolitical has highest macro impact
const CATEGORY_WEIGHT: Record<RiskCategory, number> = {
  Geopolitical: 1.00,
  Monetary    : 0.90,
  Commodity   : 0.80,
  SupplyChain : 0.70,
  General     : 0.30,
};

// ─── Severity Tiers ───────────────────────────────────────────────

const SEVERITY_TIERS: Array<{ words: string[]; boost: number }> = [
  {
    boost: 40,
    words: [
      "war", "crash", "collapse", "invasion", "nuclear", "catastrophic",
      "emergency", "meltdown", "default", "hyperinflation", "famine",
    ],
  },
  {
    boost: 25,
    words: [
      "surge", "spike", "sanction", "recession", "shock", "escalation",
      "plunge", "ban", "freeze", "blockade", "halt",
    ],
  },
  {
    boost: 12,
    words: [
      "rise", "increase", "concern", "tension", "risk", "volatile",
      "warning", "threat", "instability", "downgrade", "slowdown",
    ],
  },
];

const BASELINE_BOOST = 5;

// ─── Private Helpers ──────────────────────────────────────────────

function lc(text: string): string {
  return text.toLowerCase();
}

function matchKeywords(text: string): Partial<Record<RiskCategory, string[]>> {
  const lower = lc(text);
  const result: Partial<Record<RiskCategory, string[]>> = {};

  for (const [cat, words] of Object.entries(KEYWORDS) as [RiskCategory, string[]][]) {
    const matched = words.filter((w) => lower.includes(w));
    if (matched.length > 0) result[cat] = matched;
  }

  return result;
}

function pickCategory(matches: Partial<Record<RiskCategory, string[]>>): RiskCategory {
  let best: RiskCategory = "General";
  let bestScore = -1;

  for (const [cat, words] of Object.entries(matches) as [RiskCategory, string[]][]) {
    // Score = match count × category weight; tie-broken by weight alone
    const score = words.length * CATEGORY_WEIGHT[cat];
    if (score > bestScore) {
      bestScore = score;
      best = cat;
    }
  }

  return best;
}

function severityBoost(text: string): number {
  const lower = lc(text);
  for (const tier of SEVERITY_TIERS) {
    if (tier.words.some((w) => lower.includes(w))) return tier.boost;
  }
  return BASELINE_BOOST;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Scoring ──────────────────────────────────────────────────────

/**
 * Per-article score formula:
 *   articleScore = clamp( categoryWeight × 60 + severityBoost , 0 , 100 )
 *
 * categoryWeight × 60 → base contribution from the risk category (0–60)
 * severityBoost       → language-driven amplifier (5–40)
 * Together: range is 35–100 for any non-General article.
 */
function scoreArticle(category: RiskCategory, text: string): number {
  const base  = CATEGORY_WEIGHT[category] * 60;
  const boost = severityBoost(text);
  return clamp(Math.round(base + boost), 0, 100);
}

export function toImpactLevel(score: number): ImpactLevel {
  if (score <= 30) return "LOW";
  if (score <= 70) return "MEDIUM";
  return "HIGH";
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Classify a batch of raw NewsAPI articles.
 * Returns the full assessment result including per-article and aggregate scores.
 */
export function classifyArticles(rawArticles: RawArticle[]): AssessmentResult {
  // ── Step 1: classify each article ──
  const classified: ClassifiedArticle[] = rawArticles.map((a) => {
    const text        = `${a.title ?? ""} ${a.description ?? ""}`;
    const matches     = matchKeywords(text);
    const category    = pickCategory(matches);
    const score       = scoreArticle(category, text);
    const sourceName  = typeof a.source === "string" ? a.source : (a.source?.name ?? "Unknown");

    return {
      title         : a.title,
      description   : a.description ?? "",
      source        : sourceName,
      url           : a.url,
      publishedAt   : a.publishedAt,
      riskCategory  : category,
      articleScore  : score,
      keywordMatches: matches,
    };
  });

  // ── Step 2: weighted aggregate score ──
  //    Each article's contribution is weighted by its category's base weight.
  //    A cluster of Geopolitical articles moves the needle more than General.
  let weightedSum  = 0;
  let totalWeight  = 0;

  for (const a of classified) {
    const w = CATEGORY_WEIGHT[a.riskCategory];
    weightedSum += a.articleScore * w;
    totalWeight += w;
  }

  const overallScore = totalWeight > 0
    ? clamp(Math.round(weightedSum / totalWeight), 0, 100)
    : 0;

  // ── Step 3: category breakdown (% of articles per category) ──
  const counts: CategoryBreakdown = {
    Geopolitical: 0, Monetary: 0, Commodity: 0, SupplyChain: 0, General: 0,
  };

  for (const a of classified) counts[a.riskCategory]++;

  const total = classified.length || 1;
  const categoryBreakdown: CategoryBreakdown = {
    Geopolitical: Math.round((counts.Geopolitical / total) * 100),
    Monetary    : Math.round((counts.Monetary / total) * 100),
    Commodity   : Math.round((counts.Commodity / total) * 100),
    SupplyChain : Math.round((counts.SupplyChain / total) * 100),
    General     : Math.round((counts.General / total) * 100),
  };

  // ── Step 4: dominant category ──
  let dominant: RiskCategory = "General";
  let domScore = -1;

  for (const [cat, count] of Object.entries(counts) as [RiskCategory, number][]) {
    const s = count * CATEGORY_WEIGHT[cat];
    if (s > domScore) { domScore = s; dominant = cat; }
  }

  return {
    overallScore,
    impactLevel     : toImpactLevel(overallScore),
    dominantCategory: dominant,
    categoryBreakdown,
    articles        : classified,
  };
}
