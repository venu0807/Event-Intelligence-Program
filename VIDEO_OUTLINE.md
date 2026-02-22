# Video Outline (5-10 min)

**Structure**
1. Intro and goal (0:00-0:45). State the problem, what the platform does, and the core pipeline.
2. Architecture overview (0:45-2:00). Walk through frontend, API routes, MySQL, and external APIs.
3. Backend risk logic (2:00-3:30). Explain deterministic classifier, categories, weights, scoring, impact levels.
4. Database schema decisions (3:30-4:30). Cover users, events, impact_assessments, assessment_events, JSON columns, foreign keys.
5. Gemini integration (4:30-5:30). Show prompt inputs, where it runs, and fallback behavior.
6. UI walkthrough (5:30-7:30). Login, dashboard, charts, AI summary, history, refresh flow.
7. Trade-offs and assumptions (7:30-9:00). Short list of deliberate choices and limits.
8. Wrap-up (9:00-10:00). Recap and mention how to run locally.

**Script Prompts**
- "This is the Event Intelligence Platform, a real-time macro impact intelligence dashboard."
- "The pipeline is: fetch live news, classify deterministically, generate a Gemini executive brief, persist in MySQL, then render in Next.js."
- "Classification uses keyword matching with category weights and a severity boost to produce a 0-100 score and LOW/MEDIUM/HIGH level."
- "The schema separates raw events from assessments, linked by a junction table to preserve each run."
- "Gemini runs server-side only; keys never reach the client, and failures degrade gracefully."
- "The dashboard shows impact score, category distribution, top headlines, and assessment history."
- "Key trade-offs include deterministic logic for explainability and JSON columns for flexible breakdowns."

**Recording Checklist**
- Show `README.md` for setup, architecture, and schema.
- Show `lib/classifier.ts` and highlight weights, boosts, and impact level thresholds.
- Show `app/api/analyze/route.ts` to demonstrate the end-to-end pipeline.
- Show `schema.sql` with tables and constraints.
- Show `app/dashboard/page.tsx` for UI features and refresh flow.
- Run the app and perform a full analysis if time permits.
