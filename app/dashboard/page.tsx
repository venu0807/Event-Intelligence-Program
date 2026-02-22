"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Cell,
} from "recharts";

// ─────────────────────────── Types ───────────────────────────────

interface Article {
  title      : string;
  description: string;
  source     : string;
  url        : string;
  publishedAt: string;
  riskCategory: string;
  articleScore: number;
}

interface Assessment {
  assessmentId     : number;
  overallScore     : number;
  impactLevel      : "LOW" | "MEDIUM" | "HIGH";
  dominantCategory : string;
  categoryBreakdown: Record<string, number>;
  articleCount     : number;
  aiSummary        : string;
  articles         : Article[];
}

interface HistoryRow {
  id                : number;
  overall_score     : number;
  impact_level      : string;
  dominant_category : string;
  article_count     : number;
  ai_summary_preview: string;
  created_at        : string;
}

// ────────────────────────── Constants ────────────────────────────

const CAT_COLOR: Record<string, string> = {
  Geopolitical: "#f04d4d",
  Monetary    : "#f5a623",
  Commodity   : "#a78bfa",
  SupplyChain : "#3b7bfa",
  General     : "#4b6080",
};

const LEVEL_COLOR: Record<string, string> = {
  LOW   : "#22d3a5",
  MEDIUM: "#f5a623",
  HIGH  : "#f04d4d",
};

const LEVEL_BG: Record<string, string> = {
  LOW   : "rgba(34,211,165,0.12)",
  MEDIUM: "rgba(245,166,35,0.12)",
  HIGH  : "rgba(240,77,77,0.12)",
};

// ────────────────────────── Helpers ──────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month : "short", day: "numeric",
    hour  : "2-digit", minute: "2-digit",
  });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs  < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─────────────────── Sub-components ──────────────────────────────

function CategoryPill({ category }: { category: string }) {
  const color = CAT_COLOR[category] ?? "#4b6080";
  return (
    <span className="pill" style={{ color, backgroundColor: color + "1a", border: `1px solid ${color}33` }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: color }} />
      {category}
    </span>
  );
}

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLOR[level] ?? "#4b6080";
  return (
    <span className="pill" style={{ color, backgroundColor: LEVEL_BG[level], border: `1px solid ${color}33` }}>
      {level}
    </span>
  );
}

/** Animated SVG arc gauge */
function ScoreGauge({ score, level }: { score: number; level: string }) {
  const color = LEVEL_COLOR[level] ?? "#3b7bfa";
  const r     = 76;
  const sw    = 10;
  const R     = r - sw / 2;
  const circ  = Math.PI * R; // half circle
  const cx    = 100;
  const cy    = 96;

  // Arc path: left to right across the bottom half
  const arcD = `M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`;
  const offset = circ - (score / 100) * circ;

  return (
    <div className="flex flex-col items-center select-none">
      <svg width={200} height={110} viewBox="0 0 200 110">
        {/* Glow filter */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <path d={arcD} fill="none" stroke="#1c2855" strokeWidth={sw} strokeLinecap="round" />
        {/* Progress */}
        <path d={arcD} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round"
              filter="url(#glow)"
              strokeDasharray={circ} strokeDashoffset={offset}
              className="score-ring" />
        {/* Score number */}
        <text x={cx} y={cy - 14} textAnchor="middle" fill="#e8edfb"
              fontSize="36" fontWeight="700" fontFamily="Sora, sans-serif">
          {score}
        </text>
        <text x={cx} y={cy + 4} textAnchor="middle" fill={color}
              fontSize="10" fontWeight="700" fontFamily="Sora, sans-serif" letterSpacing="2">
          {level} RISK
        </text>
      </svg>
      {/* Tick labels */}
      <div className="flex justify-between w-44 text-xs -mt-1" style={{ color: "var(--color-text-dim)" }}>
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

/** Metric card */
function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </div>
      <div className="text-2xl font-bold" style={{ fontFamily: "Sora, sans-serif", color: color ?? "#e8edfb" }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>{sub}</div>}
    </div>
  );
}

/** Skeleton loader */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

// ──────────────────────── Dashboard ──────────────────────────────

export default function DashboardPage() {
  const router = useRouter();

  const [userEmail,   setUserEmail]   = useState<string | null>(null);
  const [assessment,  setAssessment]  = useState<Assessment | null>(null);
  const [history,     setHistory]     = useState<HistoryRow[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [histLoading, setHistLoading] = useState(true);
  const [error,       setError]       = useState("");
  const [activeTab,   setActiveTab]   = useState<"news" | "history">("news");
  const [lastRun,     setLastRun]     = useState<string | null>(null);
  const analysisRef = useRef<HTMLDivElement>(null);

  // Auth guard
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) router.push("/login");
        else setUserEmail(d.user.email);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await fetch("/api/assessments?limit=10");
      const d   = await res.json();
      if (d.assessments) setHistory(d.assessments);
    } catch { /* non-fatal */ }
    finally { setHistLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleAnalyze() {
    setLoading(true);
    setError("");

    try {
      const res  = await fetch("/api/analyze", { method: "POST" });
      const data = await res.json();

      if (!res.ok) { setError(data.error ?? "Analysis failed."); return; }

      setAssessment(data);
      setLastRun(new Date().toISOString());
      setActiveTab("news");
      await loadHistory();

      // Scroll to results
      setTimeout(() => analysisRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/login", { method: "DELETE" });
    router.push("/login");
  }

  // Radar chart data
  const radarData = assessment
    ? Object.entries(assessment.categoryBreakdown)
        .map(([name, value]) => ({ name: name === "SupplyChain" ? "Supply" : name, value }))
    : [];

  // Bar chart data
  const barData = assessment
    ? Object.entries(assessment.categoryBreakdown)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{ borderBottom: "1px solid var(--color-border)", backgroundColor: "rgba(7,9,26,0.9)", backdropFilter: "blur(12px)" }}
              className="sticky top-0 z-50 px-6 py-4 flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-auto">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
               style={{ background: "linear-gradient(135deg, #2d6cf5, #1a3fa8)", boxShadow: "0 4px 16px rgba(59,123,250,0.4)" }}>
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <div className="font-semibold text-sm leading-none" style={{ fontFamily: "Sora, sans-serif", color: "#e8edfb" }}>
              Event Intelligence
            </div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-text-dim)" }}>Macro Risk Platform</div>
          </div>
        </div>

        {/* Status pill */}
        {lastRun && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
               style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Last run {formatRelative(lastRun)}
          </div>
        )}

        {/* User */}
        {userEmail && (
          <div className="hidden sm:block text-xs font-mono px-3 py-1.5 rounded-lg"
               style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-muted)" }}>
            {userEmail}
          </div>
        )}

        {/* Analyze button */}
        <button onClick={handleAnalyze} disabled={loading} className="btn-primary">
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Run Analysis
            </>
          )}
        </button>

        {/* Logout */}
        <button onClick={handleLogout}
                className="text-sm transition-colors"
                style={{ color: "var(--color-text-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-text)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}>
          Sign out
        </button>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Error ────────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 rounded-xl px-5 py-4 text-sm animate-fade-in"
               style={{ backgroundColor: "rgba(240,77,77,0.08)", border: "1px solid rgba(240,77,77,0.25)", color: "#f87171" }}>
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto opacity-70 hover:opacity-100 transition-opacity">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────── */}
        {!assessment && !loading && (
          <div className="flex flex-col items-center justify-center py-28 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
                 style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <svg className="w-9 h-9" style={{ color: "var(--color-text-dim)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: "#e8edfb" }}>No analysis yet</h2>
            <p className="text-sm max-w-xs mb-8" style={{ color: "var(--color-text-muted)" }}>
              Run an analysis to fetch live news, score macro risk events, and generate an AI executive brief.
            </p>
            <button onClick={handleAnalyze} className="btn-primary">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run First Analysis
            </button>
          </div>
        )}

        {/* ── Loading skeleton ──────────────────────────────────── */}
        {loading && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl text-sm"
                 style={{ backgroundColor: "rgba(59,123,250,0.08)", border: "1px solid rgba(59,123,250,0.2)", color: "var(--color-accent)" }}>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Fetching live news → Classifying events → Generating AI brief → Persisting to database…
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="space-y-6">
                <Skeleton className="h-64" />
                <Skeleton className="h-64" />
              </div>
              <div className="lg:col-span-2 space-y-6">
                <Skeleton className="h-48" />
                <Skeleton className="h-80" />
              </div>
            </div>
          </div>
        )}

        {/* ── Results ───────────────────────────────────────────── */}
        {assessment && !loading && (
          <div ref={analysisRef} className="animate-slide-up space-y-6">

            {/* Metric row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="Impact Score"    value={assessment.overallScore}    sub="out of 100"           color={LEVEL_COLOR[assessment.impactLevel]} />
              <MetricCard label="Impact Level"    value={assessment.impactLevel}     sub="threshold classification" color={LEVEL_COLOR[assessment.impactLevel]} />
              <MetricCard label="Dominant Risk"   value={assessment.dominantCategory} sub="highest exposure"    color={CAT_COLOR[assessment.dominantCategory]} />
              <MetricCard label="Articles Scanned" value={assessment.articleCount}   sub="from NewsAPI"         />
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* ── Left column ──────────────────────────────────── */}
              <div className="space-y-6">

                {/* Score gauge card */}
                <div className="card p-6">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: "var(--color-text-muted)" }}>
                    Macro Risk Score
                  </div>
                  <ScoreGauge score={assessment.overallScore} level={assessment.impactLevel} />

                  {/* Mini breakdown */}
                  <div className="mt-4 space-y-2">
                    {Object.entries(assessment.categoryBreakdown)
                      .filter(([, v]) => v > 0)
                      .sort(([, a], [, b]) => b - a)
                      .map(([cat, pct]) => (
                        <div key={cat} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: CAT_COLOR[cat] }} />
                          <div className="text-xs flex-1" style={{ color: "var(--color-text-muted)" }}>{cat}</div>
                          <div className="flex items-center gap-2 flex-1">
                            <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border)" }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: CAT_COLOR[cat] }} />
                            </div>
                            <span className="text-xs font-mono w-8 text-right" style={{ color: "var(--color-text-muted)" }}>{pct}%</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Radar chart */}
                <div className="card p-6">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)" }}>
                    Risk Radar
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <RadarChart data={radarData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <PolarGrid stroke="#1c2855" />
                      <PolarAngleAxis dataKey="name" tick={{ fill: "#6278a8", fontSize: 10, fontFamily: "DM Mono, monospace" }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="Risk" dataKey="value" stroke="#3b7bfa" fill="#3b7bfa" fillOpacity={0.15} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1230", border: "1px solid #1c2855", borderRadius: 10, fontSize: 12 }}
                        labelStyle={{ color: "#cdd8f6" }}
                        formatter={(v: number) => [`${v}%`, "Share"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Right column ─────────────────────────────────── */}
              <div className="lg:col-span-2 space-y-6">

                {/* AI Executive Summary */}
                <div className="card p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                         style={{ backgroundColor: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)" }}>
                      <svg className="w-3.5 h-3.5" style={{ color: "#a78bfa" }} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </div>
                    <h3 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-muted)" }}>
                      AI Executive Brief
                    </h3>
                    <span className="ml-auto text-xs px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: "rgba(167,139,250,0.12)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.25)", fontFamily: "DM Mono, monospace" }}>
                      Gemini 1.5 Flash
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                    {assessment.aiSummary}
                  </p>
                </div>

                {/* Distribution bar chart */}
                <div className="card p-6">
                  <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--color-text-muted)" }}>
                    Category Distribution
                  </div>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6278a8", fontSize: 10 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#8ba0c8", fontSize: 11, fontFamily: "DM Mono, monospace" }} width={88} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.03)" }}
                        contentStyle={{ backgroundColor: "#0d1230", border: "1px solid #1c2855", borderRadius: 10, fontSize: 12 }}
                        itemStyle={{ color: "#ffffff" }}   // <-- makes "Share" white
                        labelStyle={{ color: "#ffffff" }}  // optional: axis label text
                        formatter={(v: number) => [`${v}%`, "Share"]}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16}>
                        {barData.map((e) => <Cell key={e.name} fill={CAT_COLOR[e.name] ?? "#4b6080"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Tabs */}
                <div className="card overflow-hidden">
                  <div className="flex" style={{ borderBottom: "1px solid var(--color-border)" }}>
                    {(["news", "history"] as const).map((tab) => (
                      <button key={tab} onClick={() => setActiveTab(tab)}
                              className="flex-1 py-3.5 text-sm font-medium transition-colors"
                              style={{
                                fontFamily : "Sora, sans-serif",
                                color      : activeTab === tab ? "#e8edfb" : "var(--color-text-muted)",
                                borderBottom: activeTab === tab ? "2px solid var(--color-accent)" : "2px solid transparent",
                                backgroundColor: activeTab === tab ? "rgba(59,123,250,0.06)" : "transparent",
                              }}>
                        {tab === "news"
                          ? `Live Headlines (${assessment.articles.length})`
                          : "Assessment History"}
                      </button>
                    ))}
                  </div>

                  <div className="overflow-y-auto" style={{ maxHeight: "480px" }}>

                    {/* News tab */}
                    {activeTab === "news" && (
                      <div>
                        {assessment.articles.map((a, i) => (
                          <div key={i} className="px-5 py-4 transition-colors"
                               style={{ borderBottom: "1px solid var(--color-border)" }}
                               onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-alt)")}
                               onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <a href={a.url} target="_blank" rel="noopener noreferrer"
                                   className="text-sm font-medium line-clamp-2 block mb-2 transition-colors"
                                   style={{ color: "#cdd8f6" }}
                                   onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-accent)")}
                                   onMouseLeave={(e) => (e.currentTarget.style.color = "#cdd8f6")}>
                                  {a.title}
                                </a>
                                {a.description && (
                                  <p className="text-xs line-clamp-1 mb-2.5" style={{ color: "var(--color-text-muted)" }}>
                                    {a.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CategoryPill category={a.riskCategory} />
                                  <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>{a.source}</span>
                                  <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                                    {formatDate(a.publishedAt)}
                                  </span>
                                </div>
                              </div>
                              {/* Score */}
                              <div className="flex-shrink-0 text-right">
                                <div className="text-lg font-bold" style={{
                                  fontFamily: "Sora, sans-serif",
                                  color: a.articleScore >= 71 ? "#f04d4d" : a.articleScore >= 31 ? "#f5a623" : "#22d3a5",
                                }}>
                                  {a.articleScore}
                                </div>
                                <div className="text-xs" style={{ color: "var(--color-text-dim)" }}>score</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* History tab */}
                    {activeTab === "history" && (
                      <div>
                        {histLoading ? (
                          <div className="p-6 space-y-3">
                            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                          </div>
                        ) : history.length === 0 ? (
                          <div className="text-center py-12 text-sm" style={{ color: "var(--color-text-muted)" }}>
                            No past assessments found.
                          </div>
                        ) : (
                          history.map((row) => (
                            <div key={row.id} className="px-5 py-4 transition-colors"
                                 style={{ borderBottom: "1px solid var(--color-border)" }}
                                 onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-surface-alt)")}
                                 onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <LevelBadge level={row.impact_level} />
                                  <span className="text-sm font-bold" style={{ fontFamily: "Sora, sans-serif", color: LEVEL_COLOR[row.impact_level] }}>
                                    {Math.round(row.overall_score)}
                                  </span>
                                  <CategoryPill category={row.dominant_category} />
                                  <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                                    {row.article_count} articles
                                  </span>
                                </div>
                                <span className="text-xs font-mono" style={{ color: "var(--color-text-dim)" }}>
                                  {formatDate(row.created_at)}
                                </span>
                              </div>
                              {row.ai_summary_preview && (
                                <p className="text-xs line-clamp-2" style={{ color: "var(--color-text-muted)" }}>
                                  {row.ai_summary_preview}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="mt-16 px-6 py-6 text-center text-xs"
              style={{ borderTop: "1px solid var(--color-border)", color: "var(--color-text-dim)" }}>
        Event Intelligence Platform · MySQL + Next.js · Powered by NewsAPI &amp; Gemini AI
      </footer>
    </div>
  );
}
