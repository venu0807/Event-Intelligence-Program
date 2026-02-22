import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import db from "@/lib/db";
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from "@/lib/auth";
import { RowDataPacket } from "mysql2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

    const { email, password } = body as Record<string, unknown>;

    if (typeof email !== "string" || !email.includes("@") || email.length > 255) {
      return NextResponse.json({ error: "Provide a valid email address." }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const normalEmail = email.toLowerCase().trim();

    // Check duplicate
    const [existing] = await db.query<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ?",
      [normalEmail]
    );
    if ((existing as RowDataPacket[]).length > 0) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result]: any = await db.query(
      "INSERT INTO users (email, password_hash) VALUES (?, ?)",
      [normalEmail, passwordHash]
    );

    const userId = result.insertId as number;
    const token  = signToken({ userId, email: normalEmail });

    const response = NextResponse.json(
      { user: { id: userId, email: normalEmail } },
      { status: 201 }
    );
    response.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS);
    return response;
  } catch (err) {
    console.error("[POST /api/auth/register]", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
