# Event Intelligence Platform

**Real-Time Global Event Macro Impact Intelligence System**

A full-stack decision intelligence application that ingests live global news, classifies events using deterministic backend scoring logic, generates an AI executive brief via Gemini, persists everything to MySQL, and presents it in a professional Next.js dashboard.

---

## Tech Stack

| Layer      | Technology                    |
|------------|-------------------------------|
| Frontend   | Next.js 14 (App Router), React 18, Tailwind CSS |
| Backend    | Next.js API Routes (Node.js)  |
| Database   | MySQL 8+ via `mysql2`         |
| AI         | Google Gemini 1.5 Flash       |
| News Data  | NewsAPI.org                   |
| Auth       | JWT + bcrypt + httpOnly cookies |

---

## Prerequisites

| Requirement | Version | Link |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| npm | 9+ | bundled with Node.js |
| MySQL | 8+ | https://dev.mysql.com/downloads |
| NewsAPI key | free tier | https://newsapi.org |
| Gemini API key | free tier | https://aistudio.google.com |

---

## Setup Instructions

### 1. Clone the repository

```bash
git clone https://github.com/your-username/event-intelligence-platform.git
cd event-intelligence-platform
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_mysql_root_password
MYSQL_DATABASE=event_intelligence

JWT_SECRET=<64-char random string>
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

NEWS_API_KEY=<from newsapi.org>
GEMINI_API_KEY=<from aistudio.google.com>
```

### 3. Initialise the database

The init script creates the database and all tables automatically:

```bash
npm run db:init
```

Alternatively, open MySQL Workbench or the `mysql` CLI and run:

```sql
source schema.sql;
```

### 4. Start the development server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000). You will be redirected to the login page. Register an account, then click **Run Analysis**.

### 5. Production build

```bash
npm run build
npm start
```

---

## Architecture Overview

```
Browser (Next.js 14 App Router)
│
├── /login  /register         ── client components, form handling
│
└── /dashboard                ── client component
        │
        ├── GET  /api/auth/me          (session check)
        ├── POST /api/analyze          (main pipeline)
        │       │
        │       ├─ 1. fetchLatestNews()       → NewsAPI.org
        │       ├─ 2. classifyArticles()      → lib/classifier.ts (deterministic)
        │       ├─ 3. generateExecutiveSummary() → Gemini 1.5 Flash
        │       └─ 4. MySQL transaction       → persist assessment + events
        │
        └── GET  /api/assessments      (history query)

Middleware (middleware.ts)
  └── Edge JWT verification on every request to /dashboard
```

All API keys live in server-side environment variables and are never serialised into client bundles.

---

## Database Schema

```sql
users
  id            INT UNSIGNED  PK AUTO_INCREMENT
  email         VARCHAR(255)  UNIQUE NOT NULL
  password_hash VARCHAR(255)  NOT NULL
  created_at    DATETIME      DEFAULT CURRENT_TIMESTAMP
  updated_at    DATETIME      ON UPDATE CURRENT_TIMESTAMP

events
  id             INT UNSIGNED  PK AUTO_INCREMENT
  title          VARCHAR(1000) NOT NULL
  description    TEXT
  source_name    VARCHAR(255)
  url            TEXT
  published_at   DATETIME
  risk_category  ENUM('Geopolitical','Monetary','Commodity','SupplyChain','General')
  article_score  DECIMAL(5,2)
  keyword_matches JSON          -- debug: which keywords fired per category
  created_at     DATETIME

impact_assessments
  id                  INT UNSIGNED  PK AUTO_INCREMENT
  triggered_by        INT UNSIGNED  FK → users.id (SET NULL on delete)
  overall_score       DECIMAL(5,2)
  impact_level        ENUM('LOW','MEDIUM','HIGH')
  dominant_category   ENUM('Geopolitical','Monetary','Commodity','SupplyChain','General')
  category_breakdown  JSON          -- { "Geopolitical": 40, "Monetary": 30, ... }
  article_count       SMALLINT UNSIGNED
  ai_summary          LONGTEXT      -- Gemini output
  created_at          DATETIME

assessment_events               -- junction table (many-to-many)
  assessment_id  INT UNSIGNED   FK → impact_assessments.id (CASCADE)
  event_id       INT UNSIGNED   FK → events.id (CASCADE)
  PRIMARY KEY (assessment_id, event_id)
```

**Design decisions:**

- `events` and `impact_assessments` are separate tables so raw articles can be queried independently of analysis runs.
- The junction table `assessment_events` avoids duplicating event rows when the same article appears in multiple runs — each run gets its own event insert, linked via the junction table.
- `category_breakdown` and `keyword_matches` use MySQL's native `JSON` type for schema flexibility. These columns are queryable via `JSON_EXTRACT()` without a schema migration.
- `triggered_by` uses `ON DELETE SET NULL` so assessment history is preserved even if the user account is deleted.
- All `DATETIME` columns store UTC. The MySQL pool is configured with `timezone: "Z"`.

---

## Backend Risk Classification Logic

**File:** `lib/classifier.ts` — fully deterministic, zero AI involvement.

### Step 1 — Keyword matching

Each article's `title + description` is checked against four keyword dictionaries:

| Category | Keywords (sample) | Base weight |
|---|---|---|
| Geopolitical | war, invasion, sanctions, missile, nuclear, coup | 1.00 |
| Monetary | inflation, central bank, interest rate, Fed, ECB | 0.90 |
| Commodity | oil, gold, crude, OPEC, wheat, grain, gas | 0.80 |
| SupplyChain | supply chain, tariff, shortage, freight, port | 0.70 |
| General | (fallback) | 0.30 |

The category with the highest `matchCount × baseWeight` wins (tie-broken by weight).

### Step 2 — Severity boost

The article text is scanned for three severity tiers:

| Tier | Example words | Boost |
|---|---|---|
| Critical | war, crash, collapse, nuclear, meltdown, hyperinflation | +40 |
| High | surge, sanction, recession, plunge, blockade | +25 |
| Medium | rise, tension, risk, warning, downgrade | +12 |
| Baseline | (any macro topic) | +5 |

### Step 3 — Per-article score

```
articleScore = clamp( categoryWeight × 60 + severityBoost , 0 , 100 )
```

Example: Geopolitical article (weight 1.0) with "invasion collapse" in headline:
`1.0 × 60 + 40 = 100`

### Step 4 — Aggregate score

Weighted average across all articles, where each article's contribution is further weighted by its category's base weight. Geopolitical events pull the needle more than General events.

### Step 5 — Impact level

| Score range | Level  |
|---|---|
| 0 – 30 | LOW |
| 31 – 70 | MEDIUM |
| 71 – 100 | HIGH |

---

## Gemini Integration

- **Model:** `gemini-1.5-flash` (free tier, fast)
- **Called from:** `lib/gemini.ts` — server-side only
- **Prompt input:** Top 5 articles by score, overall score, impact level, category distribution
- **Output:** 150–200 words, three-paragraph executive prose (no bullet points)
- **Graceful degradation:** If Gemini fails (quota, network), the analysis still completes. The fallback message is stored in `ai_summary` and shown on the dashboard.
- **Key security:** `GEMINI_API_KEY` is only accessed inside Next.js API route handlers. It never appears in client-side JavaScript bundles.

---

## Security Practices

| Practice | Implementation |
|---|---|
| Password storage | bcrypt with cost factor 12 |
| Session tokens | JWT stored in `httpOnly; SameSite=lax` cookie |
| Auth on every request | Middleware verifies JWT at the edge before any page load |
| User enumeration prevention | Login returns identical error for wrong email or wrong password; always runs bcrypt compare |
| SQL injection | All queries use `mysql2` parameterised placeholders (`?`) |
| API keys | Stored in `.env.local`, excluded from `.gitignore`, never sent to client |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` set on all API routes |

---

## Project Structure

```
event-intelligence-platform/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts       POST login · DELETE logout
│   │   │   ├── register/route.ts    POST register
│   │   │   └── me/route.ts          GET session check
│   │   ├── analyze/route.ts         POST — main pipeline orchestrator
│   │   └── assessments/route.ts     GET — history
│   ├── dashboard/page.tsx           Protected dashboard UI
│   ├── login/page.tsx
│   ├── register/page.tsx
│   ├── layout.tsx
│   ├── page.tsx                     Root redirect
│   └── globals.css                  Design system & tokens
├── lib/
│   ├── db.ts           MySQL connection pool (mysql2)
│   ├── auth.ts         JWT sign/verify + cookie helpers
│   ├── classifier.ts   Deterministic risk scoring engine
│   ├── gemini.ts       Gemini API wrapper
│   └── newsapi.ts      NewsAPI wrapper
├── scripts/
│   └── init-db.js      Schema runner (Node.js)
├── middleware.ts        Edge route protection
├── schema.sql          Full MySQL schema
├── .env.example
├── package.json
└── README.md
```

---

## Key Assumptions & Trade-offs

**Assumptions:**

1. NewsAPI free tier (100 req/day) is sufficient for demo and evaluation purposes. Production would use a paid tier or multiple RSS/API sources.
2. Keyword matching uses substring search, not NLP. This is fast, deterministic, and explainable — exactly what the assignment requires for "mandatory custom logic." It will occasionally misclassify negated statements, which is acceptable at the signal-aggregation scale of 20 articles.
3. Each "Run Analysis" creates fresh `events` rows rather than deduplicating by URL. This is intentional — the assignment specifies persisting each run's state independently.

**Trade-offs:**

- **Next.js API routes vs. separate Express server:** Reduces operational complexity (one process, one deploy) while satisfying the Node.js backend requirement. All database and AI logic runs server-side.
- **JSON columns for breakdown/matches:** More flexible than normalised pivot tables for this read-heavy, analytics-style data. Avoids extra joins on every history query.
- **Severity tiers as constants:** These are hand-tuned. A production system would derive thresholds from historical market-volatility data correlated with headline sentiment signals.
- **Recharts for visualisation:** Lighter than D3 for this scope while producing professional-grade charts. A production BI tool might use ECharts or Highcharts for richer interactivity.

---

## Deliverables

- GitHub repository: <REPLACE_WITH_REPO_URL>
- Unlisted YouTube video (5-10 min): <REPLACE_WITH_YOUTUBE_URL>
- Recording date: <REPLACE_WITH_DATE>

Video outline and recording checklist are in `VIDEO_OUTLINE.md`.
