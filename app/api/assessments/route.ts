import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import db from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface AssessmentRow extends RowDataPacket {
  id                : number;
  overall_score     : number;
  impact_level      : string;
  dominant_category : string;
  category_breakdown: string;
  article_count     : number;
  ai_summary_preview: string;
  created_at        : string;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10), 50);

  try {
    const [rows] = await db.query<AssessmentRow[]>(
      `SELECT
         id,
         overall_score,
         impact_level,
         dominant_category,
         category_breakdown,
         article_count,
         LEFT(ai_summary, 250)  AS ai_summary_preview,
         DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at
       FROM impact_assessments
       WHERE triggered_by = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [user.userId, limit]
    );

    return NextResponse.json({ assessments: rows });
  } catch (err) {
    console.error("[GET /api/assessments]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
